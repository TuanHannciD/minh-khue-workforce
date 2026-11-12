#!/usr/bin/env bash
set -Eeuo pipefail
: "${MKW_DEPLOY_PATH:?}" "${MKW_PROJECT_NAME:?}" "${MKW_GATEWAY_PORT:?}" "${RELEASE_SHA:?}"
: "${MKW_OPERATION_ID:=$RELEASE_SHA}"
[[ "$MKW_OPERATION_ID" =~ ^[A-Za-z0-9._-]{1,160}$ ]] || { echo 'invalid operation id' >&2; exit 78; }
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'invalid release SHA' >&2; exit 78; }
exec 9>"$MKW_DEPLOY_PATH/.deploy.lock"
flock -n 9 || { echo 'incident-required: another deployment is active' >&2; exit 75; }
: "${EXPECTED_API_IMAGE:?}" "${EXPECTED_WEB_IMAGE:?}" "${EXPECTED_POSTGRES_IMAGE:?}"
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
docker run --rm -i --user "$(id -u):$(id -g)" \
  -v "$MKW_DEPLOY_PATH/receipts:/receipts:ro" --entrypoint node "$EXPECTED_API_IMAGE" \
  --input-type=module - "$RELEASE_SHA" "$MKW_OPERATION_ID" <<'NODE'
import {readdir, readFile} from 'node:fs/promises';
const receipts = (await readdir('/receipts')).filter(name => /^\d{8}T\d{6}Z-(ok|failed)\.json$/.test(name)).sort();
if (!receipts.length) throw new Error('release receipt missing');
const latest = JSON.parse(await readFile(`/receipts/${receipts.at(-1)}`, 'utf8'));
if (latest.releaseSha !== process.argv[2] || latest.operationId !== process.argv[3] || latest.status !== 'ok')
  throw new Error('latest release receipt is not successful for expected SHA and operation');
NODE
# For a gateway-only operation, never execute an API/migration command.
evidence_mode=with-api-status
if [[ "${MKW_SIMPLE_RELEASE:-false}" != true && "${MKW_AUTOMATIC_RELEASE:-false}" == true ]]; then
  script_root="$MKW_DEPLOY_PATH/releases/$RELEASE_SHA"
  run_node() {
    docker run --rm -i --pull=never --user "$(id -u):$(id -g)" \
      -v "$script_root:$script_root:ro" -v "$MKW_DEPLOY_PATH/shared:$MKW_DEPLOY_PATH/shared:ro" \
      --entrypoint node "$EXPECTED_API_IMAGE" "$@"
  }
  evidence_mode="$(run_node "$script_root/scripts/product/release/gateway-policy.mjs" runtime-mode "$MKW_DEPLOY_PATH/shared/current-state.json")"
fi
if [[ "${evidence_mode:-with-api-status}" != read-only-history ]]; then compose exec -T api node node_modules/prisma/build/index.js migrate status; fi
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/api/health" >/dev/null
if [[ "${MKW_SIMPLE_RELEASE:-false}" != true && "${MKW_AUTOMATIC_RELEASE:-false}" == true ]]; then
  # Deploy transferred these control helpers with this exact immutable SHA.
  script_root="$MKW_DEPLOY_PATH/releases/$RELEASE_SHA"
  rendered="$compose_file"
  run_node() {
    docker run --rm -i --pull=never --user "$(id -u):$(id -g)" \
      -v "$script_root:$script_root:ro" -v "$MKW_DEPLOY_PATH/shared:$MKW_DEPLOY_PATH/shared:ro" \
      --entrypoint node "$EXPECTED_API_IMAGE" "$@"
  }
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
