#!/usr/bin/env bash
# Runner-side transfer through the same strict, filtered SSH boundary as deploy.
set -Eeuo pipefail
set +x
: "${MKW_SSH_HOST:?}" "${MKW_SSH_PORT:?}" "${MKW_SSH_HOST_FINGERPRINT:?}" "${MKW_SSH_PRIVATE_KEY:?}"
: "${MKW_DEPLOY_PATH:?}" "${MKW_PROJECT_NAME:?}" "${MKW_OPERATION_ID:?}" "${MKW_RELEASE_SHA:?}" "${RUNNER_TEMP:?}"
[[ "$MKW_SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && "$MKW_SSH_PORT" =~ ^[0-9]+$ ]]
[[ "$MKW_DEPLOY_PATH" =~ ^/home/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$ && "$MKW_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]
[[ "$MKW_OPERATION_ID" =~ ^[A-Za-z0-9._-]{1,150}$ && "$MKW_RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]
key="$RUNNER_TEMP/mkw-recovery-key"; pins="$RUNNER_TEMP/mkw-recovery-pins"
umask 077
trap 'rm -f "$key"' EXIT
printf '%s\n' "$MKW_SSH_PRIVATE_KEY" > "$key"
ssh-keyscan -T 10 -p "$MKW_SSH_PORT" "$MKW_SSH_HOST" > "$RUNNER_TEMP/mkw-recovery-scan"
: > "$pins"
while IFS= read -r line; do
  printf '%s\n' "$line" > "$RUNNER_TEMP/mkw-recovery-candidate"
  if [[ "$(ssh-keygen -lf "$RUNNER_TEMP/mkw-recovery-candidate" -E sha256 | awk '{print $2}')" == "$MKW_SSH_HOST_FINGERPRINT" ]]; then printf '%s\n' "$line" >> "$pins"; fi
done < "$RUNNER_TEMP/mkw-recovery-scan"
test -s "$pins"
ssh_options=(-i "$key" -p "$MKW_SSH_PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o "UserKnownHostsFile=$pins")
remote_dir="$MKW_DEPLOY_PATH/releases/recovery-$MKW_OPERATION_ID"
(cd recovery-input && sha256sum release-manifest.json backup-ready.json > recovery-input.sha256)
tar -czf "$RUNNER_TEMP/mkw-recovery.tgz" recovery-input deploy/compose.production.yml scripts/product/release
printf -v command_text 'mkdir -p -- %q' "$remote_dir"
ssh "${ssh_options[@]}" "deploy@$MKW_SSH_HOST" "$command_text"
scp -q -i "$key" -P "$MKW_SSH_PORT" -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o "UserKnownHostsFile=$pins" "$RUNNER_TEMP/mkw-recovery.tgz" "deploy@$MKW_SSH_HOST:$remote_dir/recovery.tgz"
printf -v command_text 'tar -xzf %q -C %q && (cd %q && sha256sum --check recovery-input.sha256)' "$remote_dir/recovery.tgz" "$remote_dir" "$remote_dir/recovery-input"
ssh "${ssh_options[@]}" "deploy@$MKW_SSH_HOST" "$command_text" >/dev/null
remote_env=""
for name in MKW_DEPLOY_PATH MKW_PROJECT_NAME MKW_GATEWAY_PORT MKW_OPERATION_ID MKW_RELEASE_SHA MKW_SOURCE_REPOSITORY MKW_API_IMAGE MKW_WEB_IMAGE MKW_POSTGRES_IMAGE MKW_BACKUP_EXPECTED_HOST MKW_BACKUP_EXPECTED_TARGET_IDENTITY MKW_BACKUP_MAX_AGE_SECONDS MKW_ATTESTATION_MODE MKW_ATTESTATION_STATUS MKW_REGISTRY_HOST MKW_REGISTRY_VISIBILITY MKW_REGISTRY_PULL_USERNAME MKW_REGISTRY_PULL_TOKEN_FILE; do
  printf -v pair '%s=%q ' "$name" "${!name}"
  remote_env+="$pair"
done
printf -v command_text '%s bash %q' "$remote_env" "$remote_dir/scripts/product/release/auto-rollback.sh"
ssh "${ssh_options[@]}" "deploy@$MKW_SSH_HOST" "$command_text" > "$RUNNER_TEMP/mkw-recovery-output.json"
