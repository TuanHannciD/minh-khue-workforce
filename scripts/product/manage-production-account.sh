#!/usr/bin/env bash
# Release identity, lock and prompts only; account policy/transactions live in API.
set +x
set +a
set -Eeuo pipefail
unset username password repeated json_value result
usage() { echo 'Usage: manage-production-account.sh add|reset-password|list' >&2; exit 64; }
fail() { echo "$2" >&2; exit "$1"; }
[[ $# == 1 ]] || usage
operation=$1
case "$operation" in add|reset-password|list) ;; *) usage ;; esac
for tool in docker realpath flock; do
  command -v "$tool" >/dev/null || fail 69 'Required account runtime dependency unavailable'
done
# Follow the actual script, including symlink chains; cwd/current never identify it.
script=$(realpath -e -- "${BASH_SOURCE[0]}") || fail 78 'Canonical release script required'
release=${script%/scripts/product/manage-production-account.sh}
[[ "$script" == "$release/scripts/product/manage-production-account.sh" ]] || fail 78 'Canonical release script required'
release_sha=${release##*/}
[[ "$release_sha" =~ ^[a-f0-9]{40}([a-f0-9]{24})?$ ]] || fail 78 'Canonical release SHA required'
deploy=${release%/releases/"$release_sha"}
[[ "$release" == "$deploy/releases/$release_sha" && "$deploy" != "$release" ]] || fail 78 'Canonical release layout required'
[[ ! ${MKW_DEPLOY_PATH+x} || "$MKW_DEPLOY_PATH" == "$deploy" ]] || fail 78 'Deploy root does not match script release'
project=${MKW_PROJECT_NAME:-mkw}
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 78 'Invalid account target project'
[[ ! -L "$deploy/.deploy.lock" && ( ! -e "$deploy/.deploy.lock" || -f "$deploy/.deploy.lock" ) ]] || fail 78 'Invalid deploy lock'
exec 9>"$deploy/.deploy.lock" || fail 78 'Deploy lock unavailable'
flock -n 9 || fail 75 'Another deployment/account operation is active'
# All identity reads occur under this continuous lock, including container selection.
compose_file="$deploy/current/compose.rendered.yml"
[[ -f "$compose_file" && ! -L "$compose_file" ]] || fail 78 'Current Compose configuration required'
compose() { docker compose -p "$project" -f "$compose_file" "$@"; }
container=$(compose ps -q api 2>/dev/null) || fail 78 'API container selection failed'
[[ "$container" =~ ^[a-f0-9]{64}$ ]] || fail 78 'Exactly one API container ID required'
identity=$(docker inspect "$container" --format '{{.Id}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}|{{.State.Health.Status}}|{{.Config.Image}}|{{.Image}}' 2>/dev/null) || fail 78 'API container identity unavailable'
IFS='|' read -r inspected_id label_project service status health api_image actual_image extra <<< "$identity"
[[ -z "$extra" && "$inspected_id" == "$container" && "$label_project" == "$project" && "$service" == api && "$status" == running && "$health" == healthy ]] || fail 78 'API container identity or health rejected'
[[ "$api_image" =~ ^[^[:space:]@]+@sha256:[a-f0-9]{64}$ && "$actual_image" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 78 'Immutable API image identity required'
expected_image=$(docker image inspect "$api_image" --format '{{.Id}}' 2>/dev/null) || fail 78 'Expected local API image unavailable'
[[ "$actual_image" == "$expected_image" ]] || fail 78 'Actual API image ID mismatch'
# Bootstrap from the pinned API digest runtime; never host Node/jq. The runtime
# has no network, writable deployment mount or account execution capability here.
run_node() {
  docker run --rm -i --pull=never --read-only --network=none --cap-drop=ALL \
    --user "$(id -u):$(id -g)" -w /app -v "$deploy:$deploy:ro" \
    --entrypoint node "$api_image" "$@"
}
# Do not let -p/COMPOSE_PROJECT_NAME rewrite a conflicting stored project name.
resolved_compose() { (unset COMPOSE_PROJECT_NAME; docker compose -f "$compose_file" config --format json); }
if resolved_compose 2>/dev/null | run_node --input-type=module -e '
import { readFile, realpath, access } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";
try {
  const [deploy, release, sha, project, api] = process.argv.slice(1);
  const text = await readFile(`${deploy}/shared/deploy-operation.json`, "utf8");
  const bootstrap = JSON.parse(text);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(bootstrap.controlSha)) throw new Error();
  const controls = `${deploy}/controls/${bootstrap.controlSha}`;
  if (await realpath(controls) !== controls) throw new Error();
  const helper = name => import(pathToFileURL(`${controls}/scripts/product/release/${name}.mjs`).href);
  const { parseJsonStrict } = await helper("validate-manifest");
  const { verifyBundleInventory } = await helper("release-bundle");
  if (!(await verifyBundleInventory(controls)).ok || !(await verifyBundleInventory(release)).ok) throw new Error();
  const pointer = parseJsonStrict(text);
  if (Object.keys(pointer).sort().join(",") !== "controlSha,operationId,releaseSha" || pointer.releaseSha !== sha) throw new Error();
  const manifest = parseJsonStrict(await readFile(`${release}/release-manifest.json`, "utf8"));
  let configText = "";
  for await (const chunk of process.stdin) configText += chunk;
  const { parseResolvedCompose, verifyResolvedRelease } = await helper("verify-release");
  const config = parseResolvedCompose(configText);
  if (config.name !== project || manifest.apiImage !== api || !verifyResolvedRelease({manifest,expectedSha:sha,composeConfig:config}).ok) throw new Error();
  const { resolveOperationDirectory } = await helper("operation-id");
  const { readOperationReceipt } = await helper("operation-receipts");
  const receipt = await readOperationReceipt(await resolveOperationDirectory(deploy,pointer.operationId), {
    operationId:pointer.operationId,releaseSha:sha,
    imageDigests:{api:manifest.apiImage,web:manifest.webImage,postgres:manifest.postgresImage}
  });
  if (receipt.controlSha !== pointer.controlSha || !receipt.targetIdentity.endsWith(`/${deploy}/${project}`) || !receipt.targetIdentity.slice(0,-(`/${deploy}/${project}`).length).match(/^[^/]+$/)) throw new Error();
  try { await access("dist/ops/account-cli.js", constants.R_OK); }
  catch { console.error("Compiled account CLI unavailable in API image"); process.exitCode=69; }
} catch { console.error("Release/Compose/exact successful operation identity rejected"); process.exitCode=78; }
' "$deploy" "$release" "$release_sha" "$project" "$api_image"; then :
else
  code=$?
  [[ "$code" == 69 ]] && fail 69 'Compiled account runtime capability unavailable'
  fail 78 'Account target preflight failed'
fi
# Explicit unset removes inherited export attributes; allexport/xtrace stay off.
unset username password repeated json_value result
terminal_state=''
cleanup() {
  unset username password repeated json_value result
  if [[ -n "$terminal_state" ]]; then stty "$terminal_state" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
if [[ -t 0 ]]; then terminal_state=$(stty -g); fi
if [[ "$operation" != list ]]; then
  printf 'Username: ' >&2
  IFS= read -r username || fail 64 'Username input required'
  printf 'Password: ' >&2
  IFS= read -r -s password || fail 64 'Password input required'
  printf '\n' >&2
  printf 'Repeat password: ' >&2
  IFS= read -r -s repeated || fail 64 'Password confirmation required'
  printf '\n' >&2
  [[ "$password" == "$repeated" ]] || fail 64 'Passwords do not match'
  unset repeated
fi
# Bash variables cannot represent NUL. Every other JSON control is escaped using
# builtins only; IFS= read/printf preserve Unicode, spaces, tabs, quotes/backslashes.
json_string() {
  local text=$1 char code
  text=${text//\\/\\\\}
  text=${text//\"/\\\"}
  for ((code=1; code<32; code++)); do
    printf -v char '%b' "\\$(printf '%03o' "$code")"
    printf -v json_value '\\u%04x' "$code"
    text=${text//"$char"/"$json_value"}
  done
  printf '"%s"' "$text"
}
private_json() {
  printf '{"operation":"%s"' "$operation"
  if [[ "$operation" != list ]]; then
    printf ',"username":'; json_string "$username"
    printf ',"password":'; json_string "$password"
  fi
  printf '}\n'
}
# Exactly one compiled CLI exec. Never select/retry another ID after pinning.
if result=$(private_json | docker exec -i -w /app "$container" node dist/ops/account-cli.js); then
  unset username password json_value
else
  code=$?; exit "$code"
fi
# Parse only the successful public result, using the same read-only API runtime.
# Never print partial CLI stdout on failure or arbitrary fields on success.
printf '%s' "$result" | run_node --input-type=module -e '
try {
  let text=""; for await(const chunk of process.stdin) text+=chunk;
  const value=JSON.parse(text), operation=process.argv[1];
  if(value.operation!==operation) throw new Error();
  if(operation==="list") {
    if(Object.keys(value).sort().join(",")!=="operation,usernames" || !Array.isArray(value.usernames) || value.usernames.some(v=>typeof v!=="string")) throw new Error();
    for(const username of value.usernames) console.log(username);
  } else {
    if(Object.keys(value).sort().join(",")!=="operation,username" || typeof value.username!=="string") throw new Error();
    console.log(JSON.stringify(value));
  }
} catch { console.error("Invalid account CLI result"); process.exitCode=1; }
' "$operation"
