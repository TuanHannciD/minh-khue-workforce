#!/usr/bin/env bash
set -Eeuo pipefail

mode=""
manifest="${MKW_RELEASE_MANIFEST:-}"
compose="${MKW_COMPOSE_FILE:-}"
while (($#)); do
  case "$1" in
    --dry-run|--bootstrap|--release) mode="${1#--}" ;;
    --manifest) shift; manifest="${1:-}" ;;
    --compose) shift; compose="${1:-}" ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
  shift
done

[[ -n "$mode" ]] || { echo "usage: deploy-entrypoint.sh --dry-run|--bootstrap|--release" >&2; exit 64; }

: "${MKW_DEPLOY_PATH:=/home/deploy/mkw}"
: "${MKW_PROJECT_NAME:=mkw}"
: "${MKW_GATEWAY_PORT:=3200}"

case "$MKW_DEPLOY_PATH" in /home/*) ;; *) echo "deploy path must be under /home" >&2; exit 78 ;; esac
[[ "$MKW_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "invalid project name" >&2; exit 78; }
[[ "$MKW_GATEWAY_PORT" =~ ^[0-9]+$ ]] && ((MKW_GATEWAY_PORT >= 1024 && MKW_GATEWAY_PORT <= 65535)) || { echo "invalid gateway port" >&2; exit 78; }

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required" >&2; exit 69
fi
free_kb="$(df -Pk /home | awk 'NR==2 {print $4}')"
(( free_kb >= 1048576 )) || { echo "insufficient /home space (<1 GiB)" >&2; exit 75; }
if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${MKW_GATEWAY_PORT}$"; then
  owned="$(docker ps --filter "label=com.docker.compose.project=${MKW_PROJECT_NAME}" --format '{{.Ports}}' | grep -E "(^|:)${MKW_GATEWAY_PORT}->" || true)"
  [[ -n "$owned" ]] || { echo "gateway port ${MKW_GATEWAY_PORT} is already in use by another project" >&2; exit 73; }
fi

if [[ "$mode" == dry-run ]]; then
  printf 'DRY_RUN_OK project=%s path=%s gateway=127.0.0.1:%s free_kb=%s\n' "$MKW_PROJECT_NAME" "$MKW_DEPLOY_PATH" "$MKW_GATEWAY_PORT" "$free_kb"
  exit 0
fi

if [[ "$mode" == release ]]; then
  [[ -n "$manifest" && -f "$manifest" ]] || { echo "release manifest is required" >&2; exit 78; }
  [[ -n "$compose" && -f "$compose" ]] || { echo "compose file is required" >&2; exit 78; }
  read_manifest_value() {
    awk -F= -v key="$1" '$1 == key { value=substr($0, index($0, "=") + 1); count++; last=value } END { if (count == 1) print last }' "$manifest"
  }
  MKW_API_IMAGE="$(read_manifest_value MKW_API_IMAGE)"
  MKW_WEB_IMAGE="$(read_manifest_value MKW_WEB_IMAGE)"
  MKW_POSTGRES_IMAGE="$(read_manifest_value MKW_POSTGRES_IMAGE)"
  for image_name in MKW_API_IMAGE MKW_WEB_IMAGE MKW_POSTGRES_IMAGE; do
    image_value="${!image_name}"
    [[ "$image_value" =~ ^[A-Za-z0-9./_-]+@sha256:[0-9a-f]{64}$ ]] || {
      echo "manifest must contain one immutable $image_name reference" >&2
      exit 78
    }
    export "$image_name=$image_value"
  done
fi

install -d -m 0750 "$MKW_DEPLOY_PATH" "$MKW_DEPLOY_PATH/releases" "$MKW_DEPLOY_PATH/current" \
  "$MKW_DEPLOY_PATH/shared" "$MKW_DEPLOY_PATH/backups" "$MKW_DEPLOY_PATH/receipts"
lock="$MKW_DEPLOY_PATH/.deploy.lock"
exec 9>"$lock"
flock -n 9 || { echo "another deploy is running" >&2; exit 75; }

if [[ "$mode" == bootstrap ]]; then
  install -d -m 0700 "$MKW_DEPLOY_PATH/shared/secrets"
  db_env="$MKW_DEPLOY_PATH/shared/db.env"
  api_env="$MKW_DEPLOY_PATH/shared/api.env"
  # Generate the paired database/API configuration only when both files are
  # absent. Never overwrite an operator-managed secret or print its value.
  if [[ -e "$db_env" || -e "$api_env" ]]; then
    [[ -f "$db_env" && -f "$api_env" ]] || {
      echo "bootstrap requires both shared/db.env and shared/api.env, or neither" >&2
      exit 78
    }
    chmod 600 "$db_env" "$api_env"
  else
    umask 077
    password="$(umask 077; openssl rand -hex 32)"
    auth_secret="$(umask 077; openssl rand -hex 32)"
    [[ ${#password} -eq 64 && ${#auth_secret} -eq 64 ]] || {
      echo "server CSPRNG unavailable" >&2
      exit 69
    }
    db_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.db.env.XXXXXX")"
    api_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.api.env.XXXXXX")"
    trap 'rm -f "$db_tmp" "$api_tmp"' EXIT
    cat >"$db_tmp" <<EOF
POSTGRES_DB=mkw
POSTGRES_USER=mkw
POSTGRES_PASSWORD=$password
EOF
    cat >"$api_tmp" <<EOF
DATABASE_URL=postgresql://mkw:$password@db:5432/mkw
AUTH_THROTTLE_SECRET=$auth_secret
WEB_ORIGIN=http://127.0.0.1:$MKW_GATEWAY_PORT
TLS_TERMINATED=false
EOF
    chmod 600 "$db_tmp" "$api_tmp"
    mv -n "$db_tmp" "$db_env"
    mv -n "$api_tmp" "$api_env"
    trap - EXIT
  fi
  echo "BOOTSTRAP_OK path=$MKW_DEPLOY_PATH project=$MKW_PROJECT_NAME"
  exit 0
fi

[[ -f "$MKW_DEPLOY_PATH/shared/backup.ready" ]] || { echo "backup evidence gate missing" >&2; exit 78; }
rendered="$MKW_DEPLOY_PATH/current/compose.rendered.yml"
sed "s#\./shared/#$MKW_DEPLOY_PATH/shared/#g" "$compose" > "$rendered"
if grep -Eq 'env_file:[[:space:]]*\./' "$rendered"; then
  echo "relative env_file path remains after render" >&2
  exit 78
fi
docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" config --quiet
echo "RELEASE_CONFIG_OK project=$MKW_PROJECT_NAME"
docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --remove-orphans
for i in {1..30}; do
  unhealthy="$(docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" ps --format json | grep -E '"Health":"(unhealthy|starting)"' || true)"
  [[ -z "$unhealthy" ]] && break
  sleep 2
done
[[ -z "$unhealthy" ]] || { echo "service health did not become ready" >&2; exit 78; }
docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" ps
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${MKW_GATEWAY_PORT}/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${MKW_GATEWAY_PORT}/api/health" >/dev/null
release_sha="${GITHUB_SHA:-unknown}"
receipt_tmp="$(mktemp "$MKW_DEPLOY_PATH/receipts/.receipt.XXXXXX")"
printf '{"project":"%s","release_sha":"%s","manifest":"%s","gateway":"127.0.0.1:%s","status":"ok","utc":"%s"}\n' \
  "$MKW_PROJECT_NAME" "$release_sha" "$manifest" "$MKW_GATEWAY_PORT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$receipt_tmp"
chmod 640 "$receipt_tmp"
mv -n "$receipt_tmp" "$MKW_DEPLOY_PATH/receipts/$(date -u +%Y%m%dT%H%M%SZ).json"
echo "RELEASE_APPLY_OK project=$MKW_PROJECT_NAME"
