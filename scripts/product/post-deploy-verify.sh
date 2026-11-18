#!/usr/bin/env bash
set -Eeuo pipefail
: "${MKW_DEPLOY_PATH:?}" "${MKW_PROJECT_NAME:?}" "${MKW_GATEWAY_PORT:?}" "${RELEASE_SHA:?}"
[[ -n "${MKW_OPERATION_ID:-}" && -n "${MKW_CONTROL_ROOT:-}" && -n "${MKW_CONTROL_SHA:-}" ]] || { echo 'operation and validated controls are required' >&2; exit 78; }
[[ "$MKW_CONTROL_SHA" =~ ^[a-f0-9]{40}([a-f0-9]{24})?$ ]] || exit 78
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}([a-f0-9]{24})?$ ]] || { echo 'invalid release SHA' >&2; exit 78; }
[[ "$(realpath -e -- "$MKW_CONTROL_ROOT")" == "$(realpath -ms -- "$MKW_CONTROL_ROOT")" && "$MKW_CONTROL_ROOT" == "$MKW_DEPLOY_PATH/controls/$MKW_CONTROL_SHA" ]] || { echo 'invalid control root' >&2; exit 78; }
: "${EXPECTED_API_IMAGE:?}" "${EXPECTED_WEB_IMAGE:?}" "${EXPECTED_POSTGRES_IMAGE:?}"
for image in "$EXPECTED_API_IMAGE" "$EXPECTED_WEB_IMAGE" "$EXPECTED_POSTGRES_IMAGE"; do
  [[ "$image" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || { echo 'immutable expected images are required' >&2; exit 78; }
done
script_root="$MKW_CONTROL_ROOT"
run_node() {
  docker run --rm -i --pull=never --user "$(id -u):$(id -g)" \
    -v "$script_root:$script_root:ro" -v "$MKW_DEPLOY_PATH:$MKW_DEPLOY_PATH:ro" \
    --entrypoint node "$EXPECTED_API_IMAGE" "$@"
}
run_node "$script_root/scripts/product/release/operation-id.mjs" validate "$MKW_OPERATION_ID" >/dev/null || exit 78
command -v flock >/dev/null || { echo 'flock is required' >&2; exit 69; }
[[ ! -L "$MKW_DEPLOY_PATH/.deploy.lock" && ( ! -e "$MKW_DEPLOY_PATH/.deploy.lock" || -f "$MKW_DEPLOY_PATH/.deploy.lock" ) ]] || exit 78
exec 9>"$MKW_DEPLOY_PATH/.deploy.lock"
flock -n 9 || { echo 'incident-required: another deployment is active' >&2; exit 75; }
run_node "$script_root/scripts/product/release/release-bundle.mjs" verify "$script_root" || exit 78
export MKW_API_IMAGE="$EXPECTED_API_IMAGE" MKW_WEB_IMAGE="$EXPECTED_WEB_IMAGE" MKW_POSTGRES_IMAGE="$EXPECTED_POSTGRES_IMAGE"
compose_file="$MKW_DEPLOY_PATH/current/compose.rendered.yml"
test -s "$compose_file"
compose() { docker compose -p "$MKW_PROJECT_NAME" -f "$compose_file" "$@"; }
for service in api gateway db; do
  case "$service" in
    api) expected="$EXPECTED_API_IMAGE" ;;
    gateway) expected="$EXPECTED_WEB_IMAGE" ;;
    db) expected="$EXPECTED_POSTGRES_IMAGE" ;;
  esac
  id="$(compose ps -q "$service")"
  [[ -n "$id" ]]
  [[ "$(docker inspect "$id" --format '{{.Config.Image}}')" == "$expected" ]]
  [[ "$(docker inspect "$id" --format '{{.Image}}')" == "$(docker image inspect "$expected" --format '{{.Id}}')" ]]
  [[ "$(docker inspect "$id" --format '{{.State.Status}}|{{.State.Health.Status}}')" == 'running|healthy' ]]
  echo "VERIFIED service=$service digest-and-health"
done
# Use the image runtime; the VPS does not require host Node or pnpm. Receipt
# correlation is sufficient for the simplified path; it never needs state
# files, so a legacy VPS without current-state/LKG remains verifiable.
run_node --input-type=module - "$script_root" "$MKW_DEPLOY_PATH" "$RELEASE_SHA" "$MKW_OPERATION_ID" "$EXPECTED_API_IMAGE" "$EXPECTED_WEB_IMAGE" "$EXPECTED_POSTGRES_IMAGE" "$MKW_CONTROL_SHA" <<'NODE'
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const [root, deploy, releaseSha, operationId, api, web, postgres, controlSha] = process.argv.slice(2);
  const { parseJsonStrict } = await import(pathToFileURL(`${root}/scripts/product/release/validate-manifest.mjs`).href);
  const { resolveOperationDirectory } = await import(pathToFileURL(`${root}/scripts/product/release/operation-id.mjs`).href);
  const { readOperationReceipt } = await import(pathToFileURL(`${root}/scripts/product/release/operation-receipts.mjs`).href);
  const pointer = parseJsonStrict(await readFile(`${deploy}/shared/deploy-operation.json`, 'utf8'));
  if(Object.keys(pointer).sort().join(',') !== 'controlSha,operationId,releaseSha' || pointer.operationId !== operationId || pointer.releaseSha !== releaseSha || pointer.controlSha !== controlSha) throw new Error();
  const receipt = await readOperationReceipt(await resolveOperationDirectory(deploy, operationId), { operationId, releaseSha, imageDigests: { api, web, postgres } });
  if(receipt.controlSha !== controlSha) throw new Error();
} catch { console.error('incident-required: exact operation receipt/pointer rejected; runtime inspection required'); process.exitCode=78; }
NODE
# For a gateway-only operation, never execute an API/migration command.
evidence_mode=with-api-status
if [[ "${MKW_SIMPLE_RELEASE:-false}" != true && "${MKW_AUTOMATIC_RELEASE:-false}" == true ]]; then
  evidence_mode="$(run_node "$script_root/scripts/product/release/gateway-policy.mjs" runtime-mode "$MKW_DEPLOY_PATH/shared/current-state.json")"
fi
if [[ "${evidence_mode:-with-api-status}" != read-only-history ]]; then compose exec -T api node node_modules/prisma/build/index.js migrate status; fi
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/api/health" >/dev/null
if [[ "${MKW_SIMPLE_RELEASE:-false}" != true && "${MKW_AUTOMATIC_RELEASE:-false}" == true ]]; then
  # Deploy transferred these control helpers with this exact immutable SHA.
  rendered="$compose_file"
  source "$script_root/scripts/product/release/operation-state.sh"
  MKW_DATABASE_EVIDENCE_MODE="${evidence_mode:-with-api-status}"
  capture_database "$MKW_DEPLOY_PATH/shared/database-verified.json"
  test -s "$MKW_DEPLOY_PATH/shared/database-verified.json" || { echo 'incident-required: database evidence unavailable' >&2; exit 78; }
  bash "$script_root/scripts/product/release/runtime-evidence.sh" "$rendered" > "$MKW_DEPLOY_PATH/shared/runtime-verified.json" || { echo 'incident-required: runtime evidence unavailable' >&2; exit 78; }
  write_state promote "$state_path" "$MKW_OPERATION_ID" "$RELEASE_SHA" "$MKW_DEPLOY_PATH/shared/database-verified.json" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MKW_DEPLOY_PATH/shared/runtime-verified.json"
  # Atomic copy; only a successful runtime verifier can promote last-known-good.
  lkg_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.last-known-good.XXXXXX")"
  cp -p "$state_path" "$lkg_tmp"; mv -f "$lkg_tmp" "$MKW_DEPLOY_PATH/shared/last-known-good.json"
else
  # A manual runtime recheck has no bound producer/operation promotion inputs.
  # Manual legacy verification preserves its journal; simple releases never promote state.
  echo 'POST_DEPLOY_VERIFY_SIMPLE_OK: runtime checked; no current-state/LKG promotion or automatic rollback'
fi
echo 'POST_DEPLOY_VERIFY_OK: receipt, image IDs/digests, migration status, startup health and gateway smoke'
