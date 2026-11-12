#!/usr/bin/env bash
# Trusted recovery controls. Hold the target lock from eligibility through
# exactly one API/Web apply and invariant verification. Never migrate/start DB.
set -Eeuo pipefail
set +x
: "${MKW_DEPLOY_PATH:?}" "${MKW_PROJECT_NAME:?}" "${MKW_GATEWAY_PORT:?}"
: "${MKW_OPERATION_ID:?}" "${MKW_RELEASE_SHA:?}" "${MKW_SOURCE_REPOSITORY:?}"
: "${MKW_API_IMAGE:?}" "${MKW_POSTGRES_IMAGE:?}" "${MKW_BACKUP_EXPECTED_HOST:?}" "${MKW_BACKUP_EXPECTED_TARGET_IDENTITY:?}"
: "${MKW_BACKUP_MAX_AGE_SECONDS:?}" "${MKW_ATTESTATION_MODE:?}" "${MKW_ATTESTATION_STATUS:?}"
[[ "$MKW_DEPLOY_PATH" =~ ^/home/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$ && "$MKW_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]
[[ "$MKW_GATEWAY_PORT" =~ ^[0-9]+$ && "$MKW_OPERATION_ID" =~ ^[A-Za-z0-9._-]{1,160}$ && "$MKW_RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]
script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
recovery_dir="$script_root/recovery-input"
evidence="$MKW_DEPLOY_PATH/shared/auto-rollback-evidence.json"
run_node() {
  if command -v node >/dev/null 2>&1; then node "$@";
  else docker run --rm -i --pull=never --user "$(id -u):$(id -g)" \
    -v "$script_root:$script_root:ro" -v "$MKW_DEPLOY_PATH/shared:$MKW_DEPLOY_PATH/shared:ro" \
    --entrypoint node "$MKW_API_IMAGE" "$@"; fi
}
# Helpers operate on shared state without making it container-writable.
source "$script_root/scripts/product/release/operation-state.sh"
exec 9>"$MKW_DEPLOY_PATH/.deploy.lock"
flock -n 9 || { echo 'incident-required: active deployment' >&2; exit 75; }
attempted=false
result=incident-required
emit() {
  local receipt_tmp
  receipt_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.rollback-receipt.XXXXXX")"
  run_node "$script_root/scripts/product/release/auto-rollback-io.mjs" evidence "$result" "$attempted" "$MKW_OPERATION_ID" "$MKW_RELEASE_SHA" > "$receipt_tmp"
  chmod 640 "$receipt_tmp"; mv -f "$receipt_tmp" "$MKW_DEPLOY_PATH/shared/auto-rollback-evidence.json"
  cat "$MKW_DEPLOY_PATH/shared/auto-rollback-evidence.json"
}
failed() { local code=$?; trap - ERR; result=incident-required; emit; exit "$code"; }
trap failed ERR
mapfile -t fields < <(run_node "$script_root/scripts/product/release/auto-rollback-io.mjs" fields "$recovery_dir/release-manifest.json")
[[ ${#fields[@]} == 4 ]]
old_sha="${fields[0]}"; old_api="${fields[1]}"; old_web="${fields[2]}"; old_pg="${fields[3]}"
# The runner has checked canonical ownership/digest and attestation. Runtime
# gate still re-reads the journal and DB under the lock; runner state is no substitute.
rendered="$MKW_DEPLOY_PATH/current/compose.rendered.yml"
export MKW_WEB_IMAGE="${MKW_WEB_IMAGE:?}"
MKW_DATABASE_EVIDENCE_MODE="$(run_node "$script_root/scripts/product/release/gateway-policy.mjs" runtime-mode "$state_path")"
capture_database "$recovery_dir/database-current.json"
compose() { docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" "$@"; }
image_ids_match=true
api_image=""; web_image=""
for service in api gateway; do
  service_id="$(compose ps -q "$service")"
  [[ "$service_id" =~ ^[a-f0-9]{12,64}$ ]]
  current_image="$(docker inspect "$service_id" --format '{{.Config.Image}}')"
  if [[ "$service" == api ]]; then expected="$MKW_API_IMAGE"; api_image="$current_image"; else expected="$MKW_WEB_IMAGE"; web_image="$current_image"; fi
  [[ "$(docker inspect "$service_id" --format '{{.Image}}')" == "$(docker image inspect "$expected" --format '{{.Id}}')" ]] || image_ids_match=false
done
if [[ "$MKW_DATABASE_EVIDENCE_MODE" == read-only-history ]]; then
  bash "$script_root/scripts/product/release/runtime-evidence.sh" "$rendered" > "$recovery_dir/services-current.json" || { echo 'incident-required: runtime evidence unavailable' >&2; emit; exit 78; }
fi
run_node "$script_root/scripts/product/release/auto-rollback-io.mjs" runtime "$recovery_dir/database-current.json" "$api_image" "$web_image" "$image_ids_match" "$recovery_dir/services-current.json" > "$recovery_dir/runtime.json"
decision_json="$(run_node "$script_root/scripts/product/release/auto-rollback-io.mjs" check "$state_path" "$recovery_dir" "$MKW_OPERATION_ID" "$MKW_RELEASE_SHA" "$MKW_SOURCE_REPOSITORY" "$MKW_BACKUP_MAX_AGE_SECONDS" "$MKW_BACKUP_EXPECTED_HOST" "$MKW_BACKUP_EXPECTED_TARGET_IDENTITY" "$MKW_ATTESTATION_MODE" "$MKW_ATTESTATION_STATUS" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
decision="$(printf '%s' "$decision_json" | run_node --input-type=module -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).action))')"
if [[ "$decision" != rollback ]]; then emit; exit 78; fi
# Persist one attempt BEFORE pull/config/apply. SSH/process failure leaves it
# uncertain and a rerun cannot silently try a second time.
write_state update "$state_path" attempt
attempted=true
MKW_API_IMAGE="$old_api" MKW_WEB_IMAGE="$old_web" bash "$script_root/scripts/product/release/pull-exact-images.sh" >/dev/null
export MKW_API_IMAGE="$old_api" MKW_WEB_IMAGE="$old_web" MKW_POSTGRES_IMAGE="$old_pg"
# Current controls render the canonical Compose model; only the exact API/Web
# services can be changed. No env editing, DB up/run/exec mutation or migration.
rendered="$MKW_DEPLOY_PATH/current/compose.rollback.yml"
sed "s#\./shared/#$MKW_DEPLOY_PATH/shared/#g" "$script_root/deploy/compose.production.yml" > "$rendered"
if [[ "$MKW_DATABASE_EVIDENCE_MODE" == read-only-history ]]; then
  compose up -d --wait --no-deps gateway >/dev/null
else
  compose up -d --wait --no-deps api gateway >/dev/null
fi
for service in api gateway; do
  service_id="$(compose ps -q "$service")"
  [[ "$service_id" =~ ^[a-f0-9]{12,64}$ ]]
  if [[ "$service" == api ]]; then expected="$old_api"; else expected="$old_web"; fi
  [[ "$(docker inspect "$service_id" --format '{{.Config.Image}}')" == "$expected" ]]
  [[ "$(docker inspect "$service_id" --format '{{.Image}}')" == "$(docker image inspect "$expected" --format '{{.Id}}')" ]]
  [[ "$(docker inspect "$service_id" --format '{{.State.Status}}|{{.State.Health.Status}}')" == 'running|healthy' ]]
done
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/api/health" >/dev/null
capture_database "$recovery_dir/database-recovered.json"
if [[ "$MKW_DATABASE_EVIDENCE_MODE" == read-only-history ]]; then
  bash "$script_root/scripts/product/release/runtime-evidence.sh" "$rendered" > "$recovery_dir/services-recovered.json"
fi
state_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.recovered-state.XXXXXX")"
run_node "$script_root/scripts/product/release/auto-rollback-io.mjs" complete "$state_path" "$recovery_dir/database-recovered.json" "$MKW_OPERATION_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$recovery_dir/services-recovered.json" > "$state_tmp"
chmod 640 "$state_tmp"
# Update the compose file only after old apps and DB invariants are verified.
mv -f "$rendered" "$MKW_DEPLOY_PATH/current/compose.rendered.yml"
mv -f "$state_tmp" "$state_path"
result=recovered-by-app-rollback
emit
# Original deploy/verify jobs remain failed in the parent workflow.
