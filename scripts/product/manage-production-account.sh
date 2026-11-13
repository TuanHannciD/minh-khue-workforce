#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: manage-production-account.sh add|reset-password|list

The command prompts for credentials without echoing them. Run it from the
deployed release directory as the deploy user on the production VPS.
EOF
  exit 64
}

operation="${1:-}"
case "$operation" in
  add|reset-password|list) ;;
  *) usage ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
program_b64="$(base64 -w0 "$script_dir/manage-production-account.mjs")"

container="${MKW_API_CONTAINER:-mkw-api-1}"
project="${MKW_PROJECT_NAME:-mkw}"
docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{.State.Health.Status}}' "$container" 2>/dev/null |
  grep -Fx "$project|healthy" >/dev/null || {
    echo "API container is not the healthy $project production container" >&2
    exit 78
  }

if [[ "$operation" == list ]]; then
  printf '%s\n' 'Existing account usernames:'
  printf '%s\n' 'list' |
    docker exec -i "$container" node --input-type=module \
      -e "eval(Buffer.from('$program_b64','base64').toString())"
  exit 0
fi

read -r -p "Username: " username
[[ "$username" =~ ^[^[:space:]]{1,64}$ ]] || {
  echo 'Username must be 1-64 non-space characters' >&2
  exit 64
}
read -r -s -p "Password: " password
printf '\n'
if [[ "$operation" == add ]]; then
  read -r -s -p "Repeat password: " repeated
  printf '\n'
  [[ "$password" == "$repeated" ]] || {
    echo 'Passwords do not match' >&2
    exit 64
  }
fi
[[ "${#password}" -ge 8 ]] || {
  echo 'Password must contain at least 8 characters' >&2
  exit 64
}

# Credentials are sent only through stdin to the already-running API image;
# they are never command arguments, environment variables, or log output.
printf '%s\n%s\n%s\n' "$operation" "$username" "$password" |
  docker exec -i "$container" node --input-type=module -e "eval(Buffer.from('$program_b64','base64').toString())"
