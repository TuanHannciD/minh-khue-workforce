#!/usr/bin/env bash
# Pull only manifest-selected references. No Compose or database operation lives
# here. Docker output is untrusted and may contain credentials: suppress it.
set -Eeuo pipefail
set +x

: "${MKW_REGISTRY_HOST:=ghcr.io}"
: "${MKW_DEPLOY_PATH:=/home/deploy/mkw}"
: "${MKW_REGISTRY_PULL_TOKEN_FILE:=$MKW_DEPLOY_PATH/shared/secrets/ghcr-pull-token}"
if [[ -z "${MKW_REGISTRY_VISIBILITY:-}" ]]; then
  if [[ -f "$MKW_DEPLOY_PATH/shared/secrets/ghcr-pull-username" ]]; then
    MKW_REGISTRY_VISIBILITY=private
  else
    MKW_REGISTRY_VISIBILITY=public
  fi
fi
[[ "$MKW_REGISTRY_HOST" == ghcr.io ]] || { echo "only GHCR application images are supported" >&2; exit 78; }
case "$MKW_REGISTRY_VISIBILITY" in public|private) ;; *) echo "registry visibility must be public or private" >&2; exit 78 ;; esac

# An explicit argument is used only for the API validator bootstrap. Otherwise
# both application references come from the validated manifest.
images=("$@")
if (( ${#images[@]} == 0 )); then images=("${MKW_API_IMAGE:-}" "${MKW_WEB_IMAGE:-}"); fi
for image in "${images[@]}"; do
  [[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] || {
    echo "immutable GHCR image digest is required; tags are rejected" >&2; exit 78
  }
done

# Isolate anonymous pulls from pre-existing Docker logins and keep private
# login material out of persistent Docker config, receipts and artifacts.
auth_dir="$(mktemp -d)"
trap 'rm -rf -- "$auth_dir"' EXIT
chmod 700 "$auth_dir"
export DOCKER_CONFIG="$auth_dir"
if [[ "$MKW_REGISTRY_VISIBILITY" == private ]]; then
  if [[ -z "${MKW_REGISTRY_PULL_USERNAME:-}" ]]; then
    IFS= read -r MKW_REGISTRY_PULL_USERNAME < "$MKW_DEPLOY_PATH/shared/secrets/ghcr-pull-username" 2>/dev/null || {
      echo "private registry pull username is required" >&2; exit 78
    }
  fi
  [[ "$MKW_REGISTRY_PULL_USERNAME" =~ ^[a-zA-Z0-9._-]{1,128}$ ]] || { echo "private registry pull username is invalid" >&2; exit 78; }
  [[ -f "$MKW_REGISTRY_PULL_TOKEN_FILE" && ! -L "$MKW_REGISTRY_PULL_TOKEN_FILE" && -s "$MKW_REGISTRY_PULL_TOKEN_FILE" ]] || {
    echo "private registry read-only token file is required" >&2; exit 78
  }
  token_mode_owner="$(stat -c '%a:%u' "$MKW_REGISTRY_PULL_TOKEN_FILE")"
  if [[ "$token_mode_owner" != "600:$(id -u)" ]]; then
    echo "private registry token file must be owned by deploy user with mode 600" >&2; exit 78
  fi
  docker login ghcr.io --username "$MKW_REGISTRY_PULL_USERNAME" --password-stdin < "$MKW_REGISTRY_PULL_TOKEN_FILE" >/dev/null 2>&1 || {
    echo "registry authentication failed" >&2; exit 77
  }
fi
for image in "${images[@]}"; do
  docker pull --quiet "$image" >/dev/null 2>&1 || { echo "registry pull failed for immutable image" >&2; exit 77; }
  repo_digests="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image" 2>/dev/null)" || {
    echo "registry local image inspection failed" >&2; exit 78
  }
  found=false
  while IFS= read -r candidate; do
    if [[ "$candidate" == "$image" ]]; then found=true; fi
  done <<< "$repo_digests"
  [[ "$found" == true ]] || { echo "registry image digest mismatch" >&2; exit 78; }
done
printf 'REGISTRY_PULL_OK images=%s auth=%s\n' "${#images[@]}" "$MKW_REGISTRY_VISIBILITY"
