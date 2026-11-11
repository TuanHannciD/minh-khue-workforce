#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${MKW_PROJECT_NAME:-}" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "invalid rollback project" >&2; exit 78; }
[[ "${MKW_POSTGRES_IMAGE:-}" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || { echo "old PostgreSQL image digest is invalid" >&2; exit 78; }

# Read the live container, never a release receipt or a mutable registry tag.
containers="$(docker ps --filter "label=com.docker.compose.project=$MKW_PROJECT_NAME" --filter 'label=com.docker.compose.service=db' --format '{{.ID}}')" || exit 78
[[ "$containers" =~ ^[a-zA-Z0-9_-]+$ ]] || {
  echo "application rollback requires exactly one running PostgreSQL container" >&2
  exit 78
}
runtime="$(docker inspect --format '{{.State.Running}} {{.Config.Image}}' "$containers")" || exit 78
[[ "$runtime" =~ ^true\ ([^[:space:]@]+@sha256:[0-9a-fA-F]{64})$ ]] || {
  echo "application rollback could not determine the current PostgreSQL runtime digest" >&2
  exit 78
}
current_image="${BASH_REMATCH[1]}"
if [[ "${current_image##*@}" != "${MKW_POSTGRES_IMAGE##*@}" ]]; then
  echo "PostgreSQL runtime digest mismatch; refusing application rollback before compose mutation" >&2
  exit 78
fi
