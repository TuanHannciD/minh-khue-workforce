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
# Use the image runtime; the VPS does not require host Node or pnpm.
docker run --rm -i --user "$(id -u):$(id -g)" \
  -v "$MKW_DEPLOY_PATH/receipts:/receipts:ro" -v "$MKW_DEPLOY_PATH/shared:/state:ro" --entrypoint node "$EXPECTED_API_IMAGE" \
  --input-type=module - "$RELEASE_SHA" "$MKW_OPERATION_ID" "${MKW_AUTOMATIC_RELEASE:-false}" <<'NODE'
import {readdir, readFile} from 'node:fs/promises';
const receipts = (await readdir('/receipts')).filter(name => /^\d{8}T\d{6}Z-(ok|failed)\.json$/.test(name)).sort();
if (!receipts.length) throw new Error('release receipt missing');
const latest = JSON.parse(await readFile(`/receipts/${receipts.at(-1)}`, 'utf8'));
if (latest.releaseSha !== process.argv[2] || latest.status !== 'ok') throw new Error('latest release receipt is not successful for expected SHA');
if (process.argv[4] === 'true') {
  const state = JSON.parse(await readFile('/state/current-state.json', 'utf8'));
  if (state.releaseSha !== process.argv[2] || state.operationId !== process.argv[3] || !['deploying', 'verified'].includes(state.status))
    throw new Error('incident-required: current operation identity mismatch');
}
NODE
compose exec -T api node node_modules/prisma/build/index.js migrate status
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$MKW_GATEWAY_PORT/api/health" >/dev/null
state_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.current-state.XXXXXX")"
printf '{"status":"verified","releaseSha":"%s","operationId":"%s","verifiedAt":"%s"}\n' \
  "$RELEASE_SHA" "$MKW_OPERATION_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$state_tmp"
chmod 640 "$state_tmp"
mv -f "$state_tmp" "$MKW_DEPLOY_PATH/shared/current-state.json"
echo 'POST_DEPLOY_VERIFY_OK: receipt, image IDs/digests, schema, startup health and gateway smoke'
