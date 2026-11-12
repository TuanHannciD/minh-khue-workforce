#!/usr/bin/env bash
set -Eeuo pipefail
mode=""
manifest="${MKW_RELEASE_MANIFEST:-}"
compose="${MKW_COMPOSE_FILE:-}"
backup_ready="${MKW_BACKUP_READY:-}"
backup_max_age_seconds="${MKW_BACKUP_MAX_AGE_SECONDS:-}"
backup_expected_kind="${MKW_BACKUP_EXPECTED_KIND:-BACKUP}"
backup_expected_host="${MKW_BACKUP_EXPECTED_HOST:-}"
backup_expected_database="${MKW_BACKUP_EXPECTED_DATABASE:-mkw}"
backup_expected_target_identity="${MKW_BACKUP_EXPECTED_TARGET_IDENTITY:-}"
while (($#)); do
  case "$1" in
    --dry-run|--bootstrap|--release) mode="${1#--}" ;;
    --manifest) shift; manifest="${1:-}" ;;
    --compose) shift; compose="${1:-}" ;;
    --backup-ready) shift; backup_ready="${1:-}" ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
  shift
done
[[ -n "$mode" ]] || { echo "usage: deploy-entrypoint.sh --dry-run|--bootstrap|--release" >&2; exit 64; }
: "${MKW_DEPLOY_PATH:=/home/deploy/mkw}"
: "${MKW_PROJECT_NAME:=mkw}"
: "${MKW_GATEWAY_PORT:=3200}"
: "${MKW_RELEASE_SHA:=${GITHUB_SHA:-}}"
: "${MKW_WEB_ORIGIN:=https://minhkhue.servertun.pp.ua}"
: "${MKW_ATTESTATION_MODE:=not-configured}"
: "${MKW_ATTESTATION_STATUS:=not-applicable}"
: "${MKW_OPERATION_KIND:=release}"
: "${MKW_OPERATION_ID:=${MKW_RELEASE_SHA:-unknown}}"
: "${MKW_AUTOMATIC_RELEASE:=false}"
: "${MKW_SIMPLE_RELEASE:=false}"
[[ "$MKW_OPERATION_ID" =~ ^[A-Za-z0-9._-]{1,160}$ ]] || { echo "invalid operation id" >&2; exit 78; }
case "$MKW_SIMPLE_RELEASE" in true|false) ;; *) echo "invalid simple release mode" >&2; exit 78 ;; esac
[[ "$MKW_SIMPLE_RELEASE" != true || "$MKW_OPERATION_KIND" == release ]] || { echo "simple release only supports forward release" >&2; exit 78; }
: "${MKW_REGISTRY_HOST:=ghcr.io}"
: "${MKW_REGISTRY_VISIBILITY:=}"
: "${MKW_REGISTRY_PULL_USERNAME:=}"
: "${MKW_REGISTRY_PULL_TOKEN_FILE:=$MKW_DEPLOY_PATH/shared/secrets/ghcr-pull-token}"
export MKW_REGISTRY_HOST MKW_REGISTRY_VISIBILITY MKW_REGISTRY_PULL_USERNAME MKW_REGISTRY_PULL_TOKEN_FILE
[[ "$MKW_REGISTRY_HOST" == ghcr.io ]] || { echo "only GHCR application images are supported" >&2; exit 78; }
case "$MKW_REGISTRY_VISIBILITY" in ''|public|private) ;; *) echo "invalid registry visibility policy" >&2; exit 78 ;; esac
[[ "$MKW_WEB_ORIGIN" =~ ^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:[0-9]+)?$ ]] || { echo "exact HTTPS web origin is required" >&2; exit 78; }
script_source="${BASH_SOURCE[0]:-}"
if [[ -n "$script_source" && "$script_source" != bash && "$script_source" != /dev/stdin ]]; then
  script_root="$(cd "$(dirname "$script_source")/../.." && pwd)"
else
  script_root="${MKW_SCRIPT_ROOT:-$PWD}"
fi
run_node() {
  if [[ "${MKW_VALIDATOR_RUNTIME:-auto}" != container ]] && command -v node >/dev/null 2>&1; then
    node "$@"
  else
    [[ -n "${MKW_API_IMAGE:-}" ]] || { echo "Node runtime or MKW_API_IMAGE is required" >&2; exit 69; }
    if [[ "${validator_image_ready:-false}" != true ]]; then
      bash "$script_root/scripts/product/release/pull-exact-images.sh" "$MKW_API_IMAGE" || { echo "validator image registry gate failed" >&2; exit 77; }
      validator_image_ready=true
    fi
    docker run --rm -i --pull=never --user "$(id -u):$(id -g)" -e MKW_RESOLVED_COMPOSE \
      -v "$script_root:$script_root:ro" \
      -v "$MKW_DEPLOY_PATH/shared:$MKW_DEPLOY_PATH/shared:ro" \
      --workdir "$script_root" --entrypoint node "$MKW_API_IMAGE" "$@"
  fi
}
[[ "$MKW_DEPLOY_PATH" =~ ^/home/[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$ ]] || { echo "invalid deploy path" >&2; exit 78; }
[[ "$MKW_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "invalid project name" >&2; exit 78; }
[[ "$MKW_GATEWAY_PORT" =~ ^[0-9]+$ ]] && ((MKW_GATEWAY_PORT >= 1024 && MKW_GATEWAY_PORT <= 65535)) || { echo "invalid gateway port" >&2; exit 78; }
case "$MKW_ATTESTATION_MODE" in
  not-configured|off|best-effort|required) ;;
  *) echo "invalid attestation verification mode" >&2; exit 78 ;;
esac
case "$MKW_ATTESTATION_STATUS" in
  not-applicable|not-configured|not-verified|verified) ;;
  *) echo "invalid attestation verification status" >&2; exit 78 ;;
esac
case "$MKW_OPERATION_KIND" in
  release|application-rollback) ;;
  *) echo "invalid operation kind" >&2; exit 78 ;;
esac
if [[ "$mode" == release && "$MKW_ATTESTATION_MODE" == required && "$MKW_ATTESTATION_STATUS" != verified ]]; then
  echo "required attestation verification was not completed" >&2
  exit 78
fi
command -v docker >/dev/null && docker compose version >/dev/null 2>&1 || { echo "Docker Compose is required" >&2; exit 69; }
free_kb="$(df -Pk /home | awk 'NR==2 {print $4}')"
(( free_kb >= 1048576 )) || { echo "insufficient /home space (<1 GiB)" >&2; exit 75; }
if [[ "$mode" == dry-run ]]; then
  printf 'DRY_RUN_OK project=%s path=%s gateway=127.0.0.1:%s free_kb=%s\n' "$MKW_PROJECT_NAME" "$MKW_DEPLOY_PATH" "$MKW_GATEWAY_PORT" "$free_kb"
  exit 0
fi

release_sha="${MKW_RELEASE_SHA:-unknown}"
if [[ "$mode" == release ]]; then
  cd "$script_root"
  [[ -f "$manifest" && -f "$compose" ]] || { echo "release manifest and compose are required" >&2; exit 78; }
  [[ "$MKW_RELEASE_SHA" =~ ^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$ ]] || { echo "full release SHA is required" >&2; exit 78; }
  [[ "${MKW_API_IMAGE:-}" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || { echo "validated API image digest is required" >&2; exit 78; }
  run_node "$script_root/scripts/product/release/validate-manifest.mjs" "$manifest" >/dev/null || { echo "release manifest validation failed" >&2; exit 78; }
  mapfile -t fields < <(run_node --input-type=module - "$manifest" "$compose" "$MKW_RELEASE_SHA" <<'NODE'
import { readFile } from 'node:fs/promises';
import { parseJsonStrict } from './scripts/product/release/validate-manifest.mjs';
import { verifyRelease } from './scripts/product/release/verify-release.mjs';
const [manifestPath, composePath, expectedSha] = process.argv.slice(2);
const manifest = parseJsonStrict(await readFile(manifestPath, 'utf8'));
const template = await readFile(composePath, 'utf8');
const images = { MKW_API_IMAGE: manifest.apiImage, MKW_WEB_IMAGE: manifest.webImage, MKW_POSTGRES_IMAGE: manifest.postgresImage };
const composeText = template.replace(/\$\{(MKW_API_IMAGE|MKW_WEB_IMAGE|MKW_POSTGRES_IMAGE)(?::\?[^}]*)?\}/g, (_, key) => images[key]);
const result = verifyRelease({ manifest, expectedSha, composeText });
if (!result.ok) { console.error(result.errors.join('; ')); process.exit(78); }
for (const key of ['releaseSha', 'apiImage', 'webImage', 'postgresImage']) console.log(manifest[key]);
NODE
) || { echo "release verification failed" >&2; exit 78; }
  [[ "${#fields[@]}" -eq 4 ]] || { echo "release manifest fields are incomplete" >&2; exit 78; }
  [[ "$MKW_API_IMAGE" == "${fields[1]}" ]] || { echo "validator API image does not match manifest" >&2; exit 78; }
  release_sha="${fields[0]}"; MKW_API_IMAGE="${fields[1]}"; MKW_WEB_IMAGE="${fields[2]}"; MKW_POSTGRES_IMAGE="${fields[3]}"
  for image in "$MKW_API_IMAGE" "$MKW_WEB_IMAGE" "$MKW_POSTGRES_IMAGE"; do
    [[ "$image" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || { echo "manifest contains a non-immutable image" >&2; exit 78; }
  done
  export MKW_API_IMAGE MKW_WEB_IMAGE MKW_POSTGRES_IMAGE
  [[ -n "$backup_ready" ]] || backup_ready="$MKW_DEPLOY_PATH/shared/backup-ready.json"
fi

validate_backup_gate() {
  [[ -f "$backup_ready" ]] || { echo "backup-ready JSON gate is required" >&2; exit 78; }
  [[ "$backup_max_age_seconds" =~ ^[0-9]+$ ]] || { echo "backup freshness policy is required" >&2; exit 78; }
  [[ -n "$backup_expected_host" && "$backup_expected_database" == mkw && -n "$backup_expected_target_identity" ]] || { echo "trusted backup target policy is required" >&2; exit 78; }
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local args=("$backup_ready" --max-age-seconds "$backup_max_age_seconds" --now "$now")
  if [[ "$MKW_OPERATION_KIND" == application-rollback ]]; then
    # Snapshot provenance need not equal the application version being restored.
    # Empty-deployment evidence cannot protect an existing database rollback.
    args+=(--expected-kind BACKUP)
  else
    if [[ "${MKW_SIMPLE_RELEASE:-false}" == true ]]; then
      [[ "$backup_expected_kind" == BACKUP ]] || { echo "simple release requires a BACKUP snapshot" >&2; exit 78; }
    else
      case "$backup_expected_kind" in BACKUP|INITIAL_EMPTY_DEPLOYMENT) ;; *) echo "backup kind policy is required" >&2; exit 78 ;; esac
    fi
    args+=(--expected-release-sha "$MKW_RELEASE_SHA" --expected-kind "$backup_expected_kind")
  fi
  args+=(--expected-target-host "$backup_expected_host" --expected-database "$backup_expected_database" --expected-target-identity "$backup_expected_target_identity")
  run_node "$script_root/scripts/product/release/validate-backup-ready.mjs" "${args[@]}" >/dev/null || { echo "backup-ready JSON gate failed" >&2; exit 78; }
}
if [[ "$mode" == release ]]; then validate_backup_gate; fi

install -d -m 0750 "$MKW_DEPLOY_PATH" "$MKW_DEPLOY_PATH/releases" "$MKW_DEPLOY_PATH/current" "$MKW_DEPLOY_PATH/shared" "$MKW_DEPLOY_PATH/backups" "$MKW_DEPLOY_PATH/receipts"
exec 9>"$MKW_DEPLOY_PATH/.deploy.lock"; flock -n 9 || { echo "another deploy is running" >&2; exit 75; }
registry_auth_status="not-run"; registry_pull_status="not-run"; mutation_started="false"
receipt_written=0
write_receipt() {
  local status="$1" op_id="${MKW_OPERATION_ID:-unknown}" tmp="$(mktemp "$MKW_DEPLOY_PATH/receipts/.receipt.XXXXXX")"
  printf '{"operation":"%s","operationId":"%s","releaseSha":"%s","imageDigests":{"api":"%s","web":"%s","postgres":"%s"},"registry":{"host":"%s","auth":"%s","pull":"%s"},"mutationStarted":%s,"attestationVerification":"%s","rollbackScope":"application-only","databaseRecovery":false,"status":"%s","utc":"%s"}\n' \
    "$MKW_OPERATION_KIND" "$op_id" "$release_sha" "$MKW_API_IMAGE" "$MKW_WEB_IMAGE" "$MKW_POSTGRES_IMAGE" "$MKW_REGISTRY_HOST" "$registry_auth_status" "$registry_pull_status" "$mutation_started" "$MKW_ATTESTATION_STATUS" "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
  chmod 640 "$tmp"; mv -f "$tmp" "$MKW_DEPLOY_PATH/receipts/$(date -u +%Y%m%dT%H%M%SZ)-$status.json"; receipt_written=1
}
if [[ "$mode" == bootstrap ]]; then
  install -d -m 0700 "$MKW_DEPLOY_PATH/shared/secrets"
  db_env="$MKW_DEPLOY_PATH/shared/db.env"; api_env="$MKW_DEPLOY_PATH/shared/api.env"
  if [[ -e "$db_env" || -e "$api_env" ]]; then
    [[ -f "$db_env" && -f "$api_env" ]] || { echo "bootstrap requires both env files" >&2; exit 78; }; chmod 600 "$db_env" "$api_env"
  else
    umask 077; password="$(openssl rand -hex 32)"; auth_secret="$(openssl rand -hex 32)"
    db_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.db.env.XXXXXX")"; api_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.api.env.XXXXXX")"; trap 'rm -f "$db_tmp" "$api_tmp"' EXIT
    printf 'POSTGRES_DB=mkw\nPOSTGRES_USER=mkw\nPOSTGRES_PASSWORD=%s\n' "$password" > "$db_tmp"
    printf 'DATABASE_URL=postgresql://mkw:%s@db:5432/mkw\nAUTH_THROTTLE_SECRET=%s\nWEB_ORIGIN=%s\nTLS_TERMINATED=true\n' "$password" "$auth_secret" "$MKW_WEB_ORIGIN" > "$api_tmp"
    chmod 600 "$db_tmp" "$api_tmp"; mv -n "$db_tmp" "$db_env"; mv -n "$api_tmp" "$api_env"; trap - EXIT
  fi
  echo "BOOTSTRAP_OK path=$MKW_DEPLOY_PATH project=$MKW_PROJECT_NAME"; exit 0
fi

if [[ "$mode" == release ]]; then
  if [[ -z "$MKW_REGISTRY_VISIBILITY" ]]; then
    if [[ -f "$MKW_DEPLOY_PATH/shared/secrets/ghcr-pull-username" ]]; then MKW_REGISTRY_VISIBILITY=private; else MKW_REGISTRY_VISIBILITY=public; fi
  fi
  registry_auth_status="$MKW_REGISTRY_VISIBILITY"
  if ! MKW_REGISTRY_HOST="$MKW_REGISTRY_HOST" MKW_REGISTRY_VISIBILITY="$MKW_REGISTRY_VISIBILITY" MKW_REGISTRY_PULL_USERNAME="$MKW_REGISTRY_PULL_USERNAME" MKW_REGISTRY_PULL_TOKEN_FILE="$MKW_REGISTRY_PULL_TOKEN_FILE" \
    bash "$script_root/scripts/product/release/pull-exact-images.sh"; then
    registry_pull_status="failed"
    write_receipt registry-pull-failed || true
    echo "registry pull/identity gate failed before migration or Compose mutation" >&2
    exit 77
  fi
  registry_pull_status="verified"
fi

# Manual recovery may retain its historical journal/evidence path; the simple
# push-main release intentionally skips current-state/LKG and gateway proofs.
operation_class=normal
if [[ "${MKW_SIMPLE_RELEASE:-false}" != true ]]; then
  # Hold the deployment lock while checking the current DB, before rendering or
  # invoking any mutating compose operation. Old releases use this current guard.
  if [[ "$MKW_OPERATION_KIND" == application-rollback ]]; then
    MKW_PROJECT_NAME="$MKW_PROJECT_NAME" MKW_POSTGRES_IMAGE="$MKW_POSTGRES_IMAGE" \
      bash "$script_root/scripts/product/release/verify-rollback-postgres.sh"
  fi

  # Re-read metadata and remote time under the lock, immediately before mutation.
  validate_backup_gate

  # Update only public origin/TLS settings; retain existing database/auth secrets.
  # Journal before the first config/migration mutation. Signals, timeouts, failed
  # SSH and failed verification leave this state uncertain until operator review.
  source "$script_root/scripts/product/release/operation-state.sh"
  write_state begin "$manifest" "$MKW_DEPLOY_PATH/shared/last-known-good.json" "$backup_ready" "$MKW_OPERATION_ID" \
    "${MKW_RELEASE_RUN_ID:-}" "${MKW_RELEASE_RUN_ATTEMPT:-}" "${MKW_RELEASE_ARTIFACT_ID:-}" "${MKW_RELEASE_ARTIFACT_DIGEST:-}" "${MKW_CONTROL_SHA:-}" "${MKW_ATTESTATION_MODE:-not-configured}" "${MKW_ATTESTATION_STATUS:-not-verified}" "${MKW_BACKUP_PROVENANCE:-}"
  gateway_policy_file="$(dirname "$manifest")/data-operation-evidence.json"
  operation_class=normal
  if [[ "${MKW_AUTOMATIC_RELEASE:-false}" == true && "$MKW_OPERATION_KIND" == release ]]; then
    operation_class="$(run_node "$script_root/scripts/product/release/gateway-policy.mjs" classify "$state_path" "$gateway_policy_file")"
  fi
  if [[ "$operation_class" == gateway-only ]]; then
    # Prove current API/PG identity before any config, migration or service change.
    MKW_DATABASE_EVIDENCE_MODE=read-only-history
    rendered="$MKW_DEPLOY_PATH/current/compose.rendered.yml"
    capture_database "$MKW_DEPLOY_PATH/shared/database-before.json"
    bash "$script_root/scripts/product/release/runtime-evidence.sh" "$rendered" > "$MKW_DEPLOY_PATH/shared/runtime-before.json"
    run_node "$script_root/scripts/product/release/gateway-policy.mjs" precheck "$state_path" "$MKW_DEPLOY_PATH/shared/runtime-before.json" "$MKW_DEPLOY_PATH/shared/database-before.json"
    write_state update "$state_path" before "$MKW_DEPLOY_PATH/shared/database-before.json"
    write_state update "$state_path" gateway-policy "$gateway_policy_file" "$MKW_DEPLOY_PATH/shared/runtime-before.json"
  fi
fi
# Revalidate the encrypted BACKUP under the deployment lock immediately before
# any environment, migration, or Compose mutation.
validate_backup_gate
api_env="$MKW_DEPLOY_PATH/shared/api.env"
[[ -f "$api_env" ]] || { echo "bootstrap API env is required" >&2; exit 78; }
if [[ "$operation_class" != gateway-only ]]; then
api_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.api-origin.XXXXXX")"
trap 'rm -f "$api_tmp"' EXIT
awk '!/^WEB_ORIGIN=/ && !/^TLS_TERMINATED=/' "$api_env" > "$api_tmp"
printf 'WEB_ORIGIN=%s\nTLS_TERMINATED=true\n' "$MKW_WEB_ORIGIN" >> "$api_tmp"
chmod 600 "$api_tmp"; mv -f "$api_tmp" "$api_env"; trap - EXIT
fi

rendered="$MKW_DEPLOY_PATH/current/compose.rendered.yml"
sed "s#\./shared/#$MKW_DEPLOY_PATH/shared/#g" "$compose" > "$rendered"
grep -Eq 'env_file:[[:space:]]*\./' "$rendered" && { echo "relative env_file path remains after render" >&2; exit 78; } || true
resolved_compose="$(docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" config)"
MKW_RESOLVED_COMPOSE="$resolved_compose" run_node --input-type=module - "$manifest" "$MKW_RELEASE_SHA" <<'NODE'
import { readFile } from 'node:fs/promises';
import { parseJsonStrict } from './scripts/product/release/validate-manifest.mjs';
import { verifyRelease } from './scripts/product/release/verify-release.mjs';
const [manifestPath, expectedSha] = process.argv.slice(2);
const manifest = parseJsonStrict(await readFile(manifestPath, 'utf8'));
const result = verifyRelease({ manifest, expectedSha, composeText: process.env.MKW_RESOLVED_COMPOSE ?? '' });
if (!result.ok) { console.error(result.errors.join('; ')); process.exit(78); }
NODE
echo "RELEASE_CONFIG_OK project=$MKW_PROJECT_NAME"

on_error() { local code=$?; if [[ "${MKW_SIMPLE_RELEASE:-false}" != true && -n "${state_path:-}" && -s "$state_path" ]]; then write_state update "$state_path" failed || true; fi; if (( receipt_written == 0 )); then write_receipt failed || true; fi; exit "$code"; }
trap on_error ERR
validate_backup_gate
# Approved forward migration (migrate deploy) and the JSON backup gate are
# required before traffic; INITIAL_EMPTY_DEPLOYMENT is validated by JSON.
# Immutable images use sha256:[0-9a-f]{64}.
mutation_started=true
if [[ "$MKW_OPERATION_KIND" != application-rollback && "$operation_class" != gateway-only ]]; then
  if [[ "${MKW_SIMPLE_RELEASE:-false}" != true ]]; then
    capture_database "$MKW_DEPLOY_PATH/shared/database-before.json"
    write_state update "$state_path" before "$MKW_DEPLOY_PATH/shared/database-before.json"
  fi
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --wait db
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
  if [[ "${MKW_SIMPLE_RELEASE:-false}" != true ]]; then
    capture_database "$MKW_DEPLOY_PATH/shared/database-after.json"
    write_state update "$state_path" after "$MKW_DEPLOY_PATH/shared/database-after.json"
  fi
fi
if [[ "${MKW_SIMPLE_RELEASE:-false}" != true ]]; then
  write_state update "$state_path" app unused "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
if [[ "$MKW_OPERATION_KIND" == application-rollback ]]; then
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --wait --no-deps api gateway
elif [[ "$operation_class" == gateway-only ]]; then
  gateway_status=0
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --wait --no-deps gateway || gateway_status=$?
  # Receipt is produced even when gateway health failed; API/PG checks must pass.
  capture_database "$MKW_DEPLOY_PATH/shared/database-after.json"
  bash "$script_root/scripts/product/release/runtime-evidence.sh" "$rendered" > "$MKW_DEPLOY_PATH/shared/runtime-after.json"
  write_state update "$state_path" gateway-db "$MKW_DEPLOY_PATH/shared/database-after.json"
  state_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.gateway-evidence.XXXXXX")"
  run_node "$script_root/scripts/product/release/gateway-policy.mjs" receipt "$state_path" "$gateway_policy_file" "$MKW_DEPLOY_PATH/shared/runtime-before.json" "$MKW_DEPLOY_PATH/shared/runtime-after.json" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$state_tmp"
  chmod 640 "$state_tmp"; mv -f "$state_tmp" "$state_path"
  if (( gateway_status != 0 )); then
    write_state update "$state_path" failed
    write_receipt failed
    exit "$gateway_status"
  fi
else
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --wait --remove-orphans
fi
docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" ps
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${MKW_GATEWAY_PORT}/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${MKW_GATEWAY_PORT}/api/health" >/dev/null
write_receipt ok
echo "RELEASE_APPLY_OK project=$MKW_PROJECT_NAME"
