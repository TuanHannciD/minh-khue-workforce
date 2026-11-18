#!/usr/bin/env bash
set -Eeuo pipefail
set +x
# Lifecycle map: run_node validates trusted inputs; validate_backup_gate owns
# snapshot policy; one fd9 admission precedes publish_release and config helpers;
# on_exit preserves failure/cleanup; the final block owns migration/apply/smoke.
# Bundle, config and receipt mechanics live in release/ helpers; keep this file
# as the single lock/trap owner, including the existing non-simple journal path.
mode=""
staging=""
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
    --staging) shift; staging="${1:-}" ;;
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
: "${MKW_OPERATION_ID:=}"
: "${MKW_AUTOMATIC_RELEASE:=false}"
: "${MKW_SIMPLE_RELEASE:=false}"
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
: "${MKW_CONTROL_ROOT:=$script_root}"
[[ "$(realpath -e -- "$MKW_CONTROL_ROOT")" == "$(realpath -ms -- "$MKW_CONTROL_ROOT")" && "$(realpath -e -- "$MKW_CONTROL_ROOT")" == "$(realpath -e -- "$script_root")" ]] || { echo 'invalid control root' >&2; exit 78; }
script_root="$(realpath -e -- "$MKW_CONTROL_ROOT")"
MKW_CONTROL_ROOT="$script_root"
validator_image_ready=false
run_node() {
  if [[ "${MKW_VALIDATOR_RUNTIME:-auto}" != container ]] && command -v node >/dev/null 2>&1; then
    node "$@"
  else
    [[ -n "${MKW_API_IMAGE:-}" ]] || { echo "Node runtime or MKW_API_IMAGE is required" >&2; exit 69; }
    if [[ "${validator_image_ready:-false}" != true ]]; then
      bash "$script_root/scripts/product/release/pull-exact-images.sh" "$MKW_API_IMAGE" || { echo "validator image registry gate failed" >&2; exit 77; }
      validator_image_ready=true
    fi
    local mounts=(-v "$script_root:$script_root:ro")
    if [[ -d "$MKW_DEPLOY_PATH" ]]; then mounts+=(-v "$MKW_DEPLOY_PATH:$MKW_DEPLOY_PATH:${MKW_NODE_ACCESS:-ro}"); fi
    docker run --rm -i --pull=never --user "$(id -u):$(id -g)" \
      "${mounts[@]}" \
      --workdir "$script_root" --entrypoint node "$MKW_API_IMAGE" "$@"
  fi
}
if [[ "$mode" != dry-run ]]; then
  run_node "$script_root/scripts/product/release/operation-id.mjs" validate "$MKW_OPERATION_ID" >/dev/null
fi
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
  if [[ -n "$staging" ]]; then
    [[ "$(realpath -e -- "$staging")" == "$(realpath -ms -- "$staging")" && "$(dirname -- "$(realpath -e -- "$staging")")" == "$MKW_DEPLOY_PATH/staging" && "$(basename -- "$staging")" == "$MKW_OPERATION_ID-"* ]] || { echo 'invalid operation staging path' >&2; exit 78; }
    manifest="$staging/release/release-manifest.json"
    compose="$staging/release/deploy/compose.production.yml"
    backup_ready="$staging/operation/backup-ready.json"
  fi
  [[ -f "$manifest" && -f "$compose" ]] || { echo "release manifest and compose are required" >&2; exit 78; }
  [[ "$MKW_RELEASE_SHA" =~ ^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$ ]] || { echo "full release SHA is required" >&2; exit 78; }
  [[ "${MKW_API_IMAGE:-}" =~ ^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$ ]] || { echo "validated API image digest is required" >&2; exit 78; }
  run_node "$script_root/scripts/product/release/validate-manifest.mjs" "$manifest" >/dev/null || { echo "release manifest validation failed" >&2; exit 78; }
  fields_text=$(run_node --input-type=module - "$manifest" "$MKW_RELEASE_SHA" <<'NODE'
import { readFile } from 'node:fs/promises';
import { parseJsonStrict, validateManifest } from './scripts/product/release/validate-manifest.mjs';
try {
  const [manifestPath, expectedSha] = process.argv.slice(2);
  const manifest = parseJsonStrict(await readFile(manifestPath, 'utf8'));
  if (!validateManifest(manifest).ok || manifest.releaseSha !== expectedSha) throw new Error();
  for (const key of ['releaseSha', 'apiImage', 'webImage', 'postgresImage']) console.log(manifest[key]);
} catch { console.error('release verification failed'); process.exitCode = 78; }
NODE
) || { echo "release verification failed" >&2; exit 78; }
  mapfile -t fields <<< "$fields_text"
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
    local resolved_backup
    resolved_backup="$(dirname -- "$backup_ready")/rollback-backup-resolved.json"
    [[ -f "$resolved_backup" && ! -L "$resolved_backup" && "$(realpath -e -- "$resolved_backup")" == "$(realpath -ms -- "$resolved_backup")" ]] || { echo 'canonical rollback snapshot is required' >&2; exit 78; }
    run_node --input-type=module - "$script_root" "$resolved_backup" "$backup_ready" "$now" "$backup_max_age_seconds" "$backup_expected_host" "$backup_expected_database" "$backup_expected_target_identity" <<'NODE'
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const [root, resolvedPath, downloadedPath, now, age, host, database, targetIdentity] = process.argv.slice(2);
  const { parseJsonStrict } = await import(pathToFileURL(`${root}/scripts/product/release/validate-manifest.mjs`).href);
  const { verifyDownloadedRollbackBackup } = await import(pathToFileURL(`${root}/scripts/product/release/resolve-rollback-backup.mjs`).href);
  const resolved = parseJsonStrict(await readFile(resolvedPath, 'utf8'));
  if (resolved.target?.host !== host || resolved.target?.database !== database || resolved.target?.targetIdentity !== targetIdentity) throw new Error();
  verifyDownloadedRollbackBackup(resolved, parseJsonStrict(await readFile(downloadedPath, 'utf8')), {now, maxAgeSeconds:Number(age)});
} catch { console.error('canonical rollback backup gate failed'); process.exitCode=78; }
NODE
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

source "$script_root/scripts/product/release/deploy-config.sh"
# Only the trusted deploy root and lockfile precede admission. All operation,
# release/control/shared/config changes belong to the single holder below.
existing_ancestor="$MKW_DEPLOY_PATH"
while [[ ! -e "$existing_ancestor" && ! -L "$existing_ancestor" ]]; do existing_ancestor=$(dirname -- "$existing_ancestor"); done
validate_deploy_directory "$existing_ancestor"
install -d -m 0750 "$MKW_DEPLOY_PATH"
command -v flock >/dev/null || { echo 'flock is required' >&2; exit 69; }
[[ ! -L "$MKW_DEPLOY_PATH/.deploy.lock" && ( ! -e "$MKW_DEPLOY_PATH/.deploy.lock" || -f "$MKW_DEPLOY_PATH/.deploy.lock" ) ]] || exit 78
exec 9>"$MKW_DEPLOY_PATH/.deploy.lock"; flock -n 9 || { echo "another deploy is running" >&2; exit 75; }
registry_auth_status="not-run"; registry_pull_status="not-run"; mutation_started="false"
operation_dir=$(MKW_NODE_ACCESS=rw run_node "$script_root/scripts/product/release/operation-id.mjs" reserve "$MKW_DEPLOY_PATH" "$MKW_OPERATION_ID") || exit 78
# Normalize the runtime path (Node on Windows emits a native path in fixtures).
operation_dir="$MKW_DEPLOY_PATH/operations/$MKW_OPERATION_ID"
MKW_NODE_ACCESS=rw
phase=validated; terminal_written=false; receipt_ready=false
primary_error=""; db_tmp=""; api_tmp=""; backup_tmp=""; state_tmp=""; state_path=""; operation_event_sequence=0
source "$script_root/scripts/product/release/operation-receipts.sh"
on_exit() {
  local code=${primary_error:-$?}
  trap - EXIT ERR INT TERM
  set +e
  if (( code != 0 )); then
    if [[ "${MKW_SIMPLE_RELEASE:-false}" != true && -n "${state_path:-}" && -s "$state_path" ]]; then write_state update "$state_path" failed; fi
    if [[ "$receipt_ready" == true && "$terminal_written" != true ]]; then
      if record_operation_event failed "$phase" && [[ "$mutation_started" == false ]]; then printf 'ok\n' > "$operation_dir/pre-mutation-failure"; fi
    fi
  fi
  rm -f -- "$operation_dir/api.env" "$operation_dir/compose.rendered.yml" "$operation_dir/compose.resolved.json"
  [[ -z "${db_tmp:-}" ]] || rm -f -- "$db_tmp"
  [[ -z "${api_tmp:-}" ]] || rm -f -- "$api_tmp"
  [[ -z "${backup_tmp:-}" ]] || rm -f -- "$backup_tmp"
  [[ -z "${state_tmp:-}" ]] || rm -f -- "$state_tmp"
  exit "$code"
}
trap on_exit EXIT
trap 'primary_error=$?' ERR
trap 'exit 130' INT
trap 'exit 143' TERM
for directory in releases controls current shared backups; do
  if [[ -e "$MKW_DEPLOY_PATH/$directory" || -L "$MKW_DEPLOY_PATH/$directory" ]]; then validate_deploy_directory "$MKW_DEPLOY_PATH/$directory" "$MKW_DEPLOY_PATH"; fi
  install -d -m 0750 "$MKW_DEPLOY_PATH/$directory"
done
if [[ "$mode" == bootstrap ]]; then
  [[ ! -L "$MKW_DEPLOY_PATH/shared/secrets" ]] || exit 78
  install -d -m 0700 "$MKW_DEPLOY_PATH/shared/secrets"
  db_env="$MKW_DEPLOY_PATH/shared/db.env"; api_env="$MKW_DEPLOY_PATH/shared/api.env"
  if [[ -e "$db_env" || -e "$api_env" ]]; then
    [[ -f "$db_env" && ! -L "$db_env" && -f "$api_env" && ! -L "$api_env" ]] || { echo "bootstrap requires both regular env files" >&2; exit 78; }; chmod 600 "$db_env" "$api_env"
  else
    umask 077; password="$(openssl rand -hex 32)"; auth_secret="$(openssl rand -hex 32)"
    db_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.db.env.XXXXXX")"; api_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.api.env.XXXXXX")"
    printf 'POSTGRES_DB=mkw\nPOSTGRES_USER=mkw\nPOSTGRES_PASSWORD=%s\n' "$password" > "$db_tmp"
    printf 'DATABASE_URL=postgresql://mkw:%s@db:5432/mkw\nAUTH_THROTTLE_SECRET=%s\nWEB_ORIGIN=%s\nTLS_TERMINATED=true\n' "$password" "$auth_secret" "$MKW_WEB_ORIGIN" > "$api_tmp"
    chmod 600 "$db_tmp" "$api_tmp"; mv -n "$db_tmp" "$db_env"; mv -n "$api_tmp" "$api_env"
  fi
  printf 'ok\n' > "$operation_dir/bootstrap-complete"
  echo "BOOTSTRAP_OK path=$MKW_DEPLOY_PATH project=$MKW_PROJECT_NAME"; exit 0
fi

[[ "${MKW_CONTROL_SHA:-}" =~ ^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$ ]] || { echo 'full control SHA is required' >&2; exit 78; }
validate_deploy_directory "$MKW_CONTROL_ROOT"
run_node "$script_root/scripts/product/release/release-bundle.mjs" verify "$MKW_CONTROL_ROOT" || exit 78
release_candidate=$(dirname -- "$manifest")
[[ "$(basename -- "$manifest")" == release-manifest.json ]] || exit 78
validate_deploy_directory "$release_candidate" "$MKW_DEPLOY_PATH"
[[ "$release_candidate/" != "$MKW_CONTROL_ROOT/"* && "$MKW_CONTROL_ROOT/" != "$release_candidate/"* ]] || { echo 'release and trusted controls must be separate trees' >&2; exit 78; }
[[ "$(realpath -e -- "$compose")" == "$release_candidate/deploy/compose.production.yml" ]] || { echo 'exact inventoried release Compose is required' >&2; exit 78; }
[[ ! -L "$backup_ready" ]] || exit 78
validate_deploy_directory "$(dirname -- "$backup_ready")" "$MKW_DEPLOY_PATH"
if [[ -n "$staging" ]]; then
  validate_deploy_directory "$staging" "$MKW_DEPLOY_PATH/staging"
  [[ "$(dirname -- "$staging")" == "$MKW_DEPLOY_PATH/staging" && "$(basename -- "$staging")" == "$MKW_OPERATION_ID-"* ]] || exit 78
  run_node "$script_root/scripts/product/release/release-bundle.mjs" verify "$staging/controls" || exit 78
  run_node "$script_root/scripts/product/release/release-bundle.mjs" compare "$MKW_CONTROL_ROOT" "$staging/controls" || exit 78
  run_node "$script_root/scripts/product/release/release-bundle.mjs" verify "$staging/operation" || exit 78
fi
run_node "$script_root/scripts/product/release/release-bundle.mjs" verify "$release_candidate" || exit 78
# Re-read manifest and backup after acquiring the lock, not only before it.
run_node --input-type=module - "$manifest" "$MKW_RELEASE_SHA" "$MKW_API_IMAGE" "$MKW_WEB_IMAGE" "$MKW_POSTGRES_IMAGE" <<'NODE'
import { readFile } from 'node:fs/promises';
import { parseJsonStrict, validateManifest } from './scripts/product/release/validate-manifest.mjs';
try {
  const [path,...expected]=process.argv.slice(2), value=parseJsonStrict(await readFile(path,'utf8'));
  if(!validateManifest(value).ok || ['releaseSha','apiImage','webImage','postgresImage'].some((k,i)=>value[k]!==expected[i])) throw new Error();
} catch { console.error('release changed before locked admission'); process.exitCode=78; }
NODE
validate_backup_gate
backup_id=$(run_node --input-type=module - "$backup_ready" <<'NODE'
import { readFile } from 'node:fs/promises';
import { parseJsonStrict } from './scripts/product/release/validate-manifest.mjs';
console.log(parseJsonStrict(await readFile(process.argv[2],'utf8')).backupId);
NODE
)
# Freeze this attempt's backup independently of immutable release bytes.
cp -- "$backup_ready" "$operation_dir/backup-ready.json"
if [[ "$MKW_OPERATION_KIND" == application-rollback ]]; then
  cp -- "$(dirname -- "$backup_ready")/rollback-backup-resolved.json" "$operation_dir/rollback-backup-resolved.json"
  if [[ -f "$(dirname -- "$backup_ready")/rollback-operation.json" ]]; then
    cp -- "$(dirname -- "$backup_ready")/rollback-operation.json" "$operation_dir/rollback-operation.json"
  fi
fi
backup_ready="$operation_dir/backup-ready.json"
receipt_ready=true
record_operation_event in-progress "$phase"
inspect_previous_operation
source "$script_root/scripts/product/release/publish-release.sh"
# Compare both immutable destinations before publishing either tree.
for pair in release controls; do
  if [[ "$pair" == release ]]; then candidate="$release_candidate"; destination="$MKW_DEPLOY_PATH/releases/$release_sha";
  else candidate="${staging:+$staging/controls}"; candidate="${candidate:-$MKW_CONTROL_ROOT}"; destination="$MKW_DEPLOY_PATH/controls/$MKW_CONTROL_SHA"; fi
  if [[ -e "$destination" || -L "$destination" ]]; then run_node "$script_root/scripts/product/release/release-bundle.mjs" compare "$destination" "$candidate" || exit 78; fi
done
MKW_NODE_ACCESS=rw publish_release "$release_candidate" "$MKW_DEPLOY_PATH/releases/$release_sha"
control_candidate="${staging:+$staging/controls}"; control_candidate="${control_candidate:-$MKW_CONTROL_ROOT}"
# Current controls may be executed from a stable trusted bootstrap tree. Publish
# only the uploaded copy; never rename the tree executing this lifecycle.
if [[ "$control_candidate" == "$MKW_CONTROL_ROOT" && "$control_candidate" != "$MKW_DEPLOY_PATH/controls/$MKW_CONTROL_SHA" ]]; then
  cp -R -- "$control_candidate" "$operation_dir/controls-candidate"
  control_candidate="$operation_dir/controls-candidate"
fi
MKW_NODE_ACCESS=rw publish_release "$control_candidate" "$MKW_DEPLOY_PATH/controls/$MKW_CONTROL_SHA"
# The executing trusted tree may itself have been the uploaded controls source.
# Rebind functions whose BASH_SOURCE owns relative helper paths after its rename.
script_root="$MKW_DEPLOY_PATH/controls/$MKW_CONTROL_SHA"
MKW_CONTROL_ROOT="$script_root"
cd "$script_root"
source "$script_root/scripts/product/release/operation-receipts.sh"
source "$script_root/scripts/product/release/deploy-config.sh"
manifest="$MKW_DEPLOY_PATH/releases/$release_sha/release-manifest.json"
# Direct callers must also supply the exact inventoried production Compose.
compose="$MKW_DEPLOY_PATH/releases/$release_sha/deploy/compose.production.yml"
phase=published
record_operation_event in-progress "$phase"

if [[ "$mode" == release ]]; then
  if [[ -z "$MKW_REGISTRY_VISIBILITY" ]]; then
    if [[ -f "$MKW_DEPLOY_PATH/shared/secrets/ghcr-pull-username" ]]; then MKW_REGISTRY_VISIBILITY=private; else MKW_REGISTRY_VISIBILITY=public; fi
  fi
  registry_auth_status="$MKW_REGISTRY_VISIBILITY"
  if ! MKW_REGISTRY_HOST="$MKW_REGISTRY_HOST" MKW_REGISTRY_VISIBILITY="$MKW_REGISTRY_VISIBILITY" MKW_REGISTRY_PULL_USERNAME="$MKW_REGISTRY_PULL_USERNAME" MKW_REGISTRY_PULL_TOKEN_FILE="$MKW_REGISTRY_PULL_TOKEN_FILE" \
    bash "$script_root/scripts/product/release/pull-exact-images.sh"; then
    registry_pull_status="failed"
    if record_operation_event registry-pull-failed "$phase"; then
      terminal_written=true
      printf 'ok\n' > "$operation_dir/pre-mutation-failure" || true
    fi
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
# Render privately and validate the Task3 exact service map before publishing
# pointer, backup alias or config. No resolved config is passed through env/logs.
stage_deploy_config "$compose" "$operation_dir"
validate_backup_gate
write_deploy_pointer
backup_tmp=$(mktemp "$MKW_DEPLOY_PATH/shared/.backup-ready.XXXXXX")
cp -- "$backup_ready" "$backup_tmp"; chmod 640 "$backup_tmp"
rename_deploy_file "$backup_tmp" "$MKW_DEPLOY_PATH/shared/backup-ready.json"
publish_deploy_config "$operation_dir"
rendered="$MKW_DEPLOY_PATH/current/compose.rendered.yml"
echo "RELEASE_CONFIG_OK project=$MKW_PROJECT_NAME"

validate_backup_gate
# Approved forward migration (migrate deploy) and the JSON backup gate are
# required before traffic; INITIAL_EMPTY_DEPLOYMENT is validated by JSON.
# Immutable images use sha256:[0-9a-f]{64}.
mutation_started=true
migration_complete=false
if [[ "$MKW_OPERATION_KIND" != application-rollback && "$operation_class" != gateway-only ]]; then
  if [[ "${MKW_SIMPLE_RELEASE:-false}" != true ]]; then
    capture_database "$MKW_DEPLOY_PATH/shared/database-before.json"
    write_state update "$state_path" before "$MKW_DEPLOY_PATH/shared/database-before.json"
  fi
  # Prepare only PostgreSQL. This Compose operation has no API or gateway
  # dependency and cannot expose application traffic before migration.
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --wait --no-deps db
  phase=db-prepared
  record_operation_event in-progress "$phase"
  # The forward migration is the gate for the later application Compose apply.
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
  migration_complete=true
  phase=migration-complete
  record_operation_event in-progress "$phase"
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
  record_gateway_evidence() {
    capture_database "$MKW_DEPLOY_PATH/shared/database-after.json" || return "$?"
    bash "$script_root/scripts/product/release/runtime-evidence.sh" "$rendered" > "$MKW_DEPLOY_PATH/shared/runtime-after.json" || return "$?"
    write_state update "$state_path" gateway-db "$MKW_DEPLOY_PATH/shared/database-after.json" || return "$?"
    state_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.gateway-evidence.XXXXXX")" || return "$?"
    run_node "$script_root/scripts/product/release/gateway-policy.mjs" receipt "$state_path" "$gateway_policy_file" "$MKW_DEPLOY_PATH/shared/runtime-before.json" "$MKW_DEPLOY_PATH/shared/runtime-after.json" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$state_tmp" || return "$?"
    chmod 640 "$state_tmp" || return "$?"
    mv -f "$state_tmp" "$state_path" || return "$?"
  }
  if (( gateway_status != 0 )); then
    record_gateway_evidence || true
    write_state update "$state_path" failed || true
    if record_operation_event failed "$phase"; then terminal_written=true; fi
    exit "$gateway_status"
  fi
  record_gateway_evidence
else
  [[ "$MKW_OPERATION_KIND" == application-rollback || "$migration_complete" == true ]] || { echo "migration gate did not complete" >&2; exit 78; }
  docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" up -d --wait --remove-orphans
fi
phase=app-applied
record_operation_event in-progress "$phase"
docker compose -p "$MKW_PROJECT_NAME" -f "$rendered" ps
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${MKW_GATEWAY_PORT}/" >/dev/null
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${MKW_GATEWAY_PORT}/api/health" >/dev/null
phase=smoke-complete
record_operation_event ok "$phase"
terminal_written=true
echo "RELEASE_APPLY_OK project=$MKW_PROJECT_NAME"
