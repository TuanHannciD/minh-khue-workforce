#!/usr/bin/env bash
# Read the operation journal through the same filtered SSH boundary as deploy.
set -Eeuo pipefail
: "${MKW_SSH_HOST:?}" "${MKW_SSH_PORT:?}" "${MKW_SSH_HOST_FINGERPRINT:?}"
: "${MKW_DEPLOY_PATH:?}" "${MKW_SSH_PRIVATE_KEY:?}" "${RUNNER_TEMP:?}"
[[ "$MKW_SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && "$MKW_SSH_PORT" =~ ^[0-9]+$ ]]
[[ "$MKW_DEPLOY_PATH" =~ ^/home/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$ ]]
key="$RUNNER_TEMP/mkw-state-key"
pins="$RUNNER_TEMP/mkw-state-pins"
trap 'rm -f "$key"' EXIT
umask 077
printf '%s\n' "$MKW_SSH_PRIVATE_KEY" > "$key"
ssh-keyscan -T 10 -p "$MKW_SSH_PORT" "$MKW_SSH_HOST" > "$RUNNER_TEMP/mkw-state-scan"
: > "$pins"
while IFS= read -r line; do
  printf '%s\n' "$line" > "$RUNNER_TEMP/mkw-state-candidate"
  if [[ "$(ssh-keygen -lf "$RUNNER_TEMP/mkw-state-candidate" -E sha256 | awk '{print $2}')" == "$MKW_SSH_HOST_FINGERPRINT" ]]; then
    printf '%s\n' "$line" >> "$pins"
  fi
done < "$RUNNER_TEMP/mkw-state-scan"
test -s "$pins"
printf -v remote_env 'MKW_DEPLOY_PATH=%q' "$MKW_DEPLOY_PATH"
ssh -i "$key" -p "$MKW_SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15 \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=yes \
  -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile="$pins" \
  "deploy@$MKW_SSH_HOST" "$remote_env bash -s" <<'REMOTE' > "$RUNNER_TEMP/current-state.json"
set -Eeuo pipefail
test -d "$MKW_DEPLOY_PATH"
exec 9>"$MKW_DEPLOY_PATH/.deploy.lock"
flock -n 9 || { echo 'incident-required: active deployment' >&2; exit 75; }
state="$MKW_DEPLOY_PATH/shared/current-state.json"
if [[ -e "$state" ]]; then
  test -s "$state"
  cat "$state"
elif compgen -G "$MKW_DEPLOY_PATH/receipts/*.json" >/dev/null; then
  # Activation requires one trusted verification of the existing deployment.
  echo '{"status":"unknown"}'
else
  printf 'null\n'
fi
REMOTE
