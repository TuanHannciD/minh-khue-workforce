#!/usr/bin/env bash
# Caller owns the continuous deploy lock, reserved operation, EXIT handling and
# phase events. Compose parses YAML; Node validates only its resolved JSON.
stage_deploy_config() {
  [[ $# == 2 ]] || return 64
  local compose_source=$1 operation=$2
  staged_rendered="$operation/compose.rendered.yml"
  phase=config-staged
  record_operation_event in-progress "$phase"
  [[ -f "$MKW_DEPLOY_PATH/shared/api.env" && ! -L "$MKW_DEPLOY_PATH/shared/api.env" && -f "$MKW_DEPLOY_PATH/shared/db.env" && ! -L "$MKW_DEPLOY_PATH/shared/db.env" ]] || return 78
  # All candidates (including Compose output containing expanded env secrets)
  # are private. The lifecycle removes these task-owned candidates on exit.
  (umask 077; : > "$staged_rendered"; : > "$operation/compose.resolved.json"; : > "$operation/api.env")
  awk '!/^WEB_ORIGIN=/ && !/^TLS_TERMINATED=/' "$MKW_DEPLOY_PATH/shared/api.env" > "$operation/api.env"
  printf 'WEB_ORIGIN=%s\nTLS_TERMINATED=true\n' "$MKW_WEB_ORIGIN" >> "$operation/api.env"
  chmod 600 "$operation/api.env" "$staged_rendered" "$operation/compose.resolved.json"
  # --project-directory resolves ./shared against the target, independent of
  # the release/operation paths. JSON is also valid Compose YAML. Preserve
  # env_file references so subsequent runtime commands read the published env.
  if ! docker compose --project-directory "$MKW_DEPLOY_PATH" -p "$MKW_PROJECT_NAME" -f "$compose_source" config --no-env-resolution --format json > "$staged_rendered" 2>/dev/null; then
    echo 'Compose config validation failed' >&2; return 78
  fi
  if ! docker compose -p "$MKW_PROJECT_NAME" -f "$staged_rendered" config --format json > "$operation/compose.resolved.json" 2>/dev/null; then
    echo 'Compose config validation failed' >&2; return 78
  fi
  if ! MKW_NODE_ACCESS=ro run_node --input-type=module - "${MKW_CONTROL_ROOT:-$script_root}" "$manifest" "$MKW_RELEASE_SHA" "$staged_rendered" "$operation/compose.resolved.json" <<'NODE'
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const [root, manifestPath, expectedSha, ...paths] = process.argv.slice(2);
  const { parseJsonStrict } = await import(pathToFileURL(`${root}/scripts/product/release/validate-manifest.mjs`).href);
  const { parseResolvedCompose, verifyResolvedRelease } = await import(pathToFileURL(`${root}/scripts/product/release/verify-release.mjs`).href);
  const manifest = parseJsonStrict(await readFile(manifestPath, 'utf8'));
  for (const path of paths) {
    const composeConfig = parseResolvedCompose(await readFile(path, 'utf8'));
    if (!verifyResolvedRelease({ manifest, expectedSha, composeConfig }).ok) throw new Error();
  }
} catch { console.error('resolved Compose identity rejected'); process.exitCode = 78; }
NODE
  then return 78; fi
  rm -f -- "$operation/compose.resolved.json"
}

rename_deploy_file() {
  MKW_NODE_ACCESS=rw run_node --input-type=module - "$1" "$2" <<'NODE'
import { rename } from 'node:fs/promises';
try { await rename(process.argv[2], process.argv[3]); }
catch { console.error('config rename failed'); process.exitCode=78; }
NODE
}

publish_deploy_config() {
  [[ $# == 1 ]] || return 64
  local operation=$1
  mutation_started=true
  if [[ "${operation_class:-normal}" != gateway-only ]]; then
    rename_deploy_file "$operation/api.env" "$MKW_DEPLOY_PATH/shared/api.env"
    phase=api-config-published
    record_operation_event in-progress "$phase"
  fi
  rename_deploy_file "$operation/compose.rendered.yml" "$MKW_DEPLOY_PATH/current/compose.rendered.yml"
  phase=compose-config-published
  record_operation_event in-progress "$phase"
}

# Validate every existing component, including junctions. The deploy owner must
# control ancestors; this is a containment check, not an untrusted-writer sandbox.
validate_deploy_directory() {
  MKW_NODE_ACCESS=ro run_node --input-type=module - "$1" "${2:-}" <<'NODE'
import { lstat, realpath } from 'node:fs/promises';
import { resolve, relative, join, parse, sep } from 'node:path';
try {
  const [input, parent] = process.argv.slice(2), path = resolve(input);
  let current = parse(path).root;
  for (const part of relative(current, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    const s = await lstat(current);
    if (!s.isDirectory() || s.isSymbolicLink()) throw new Error();
  }
  if (relative(path, await realpath(path)) !== '') throw new Error();
  if (parent) {
    const p = await realpath(parent), r = relative(p, path);
    if (!r || r.startsWith(`..${sep}`) || r === '..' || resolve(p, r) !== path) throw new Error();
  }
} catch { console.error('deploy directory containment rejected'); process.exitCode = 78; }
NODE
}

write_deploy_pointer() {
  MKW_NODE_ACCESS=rw run_node --input-type=module - "$MKW_DEPLOY_PATH/shared" "$MKW_OPERATION_ID" "$release_sha" "$MKW_CONTROL_SHA" <<'NODE'
import { open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const [shared, operationId, releaseSha, controlSha] = process.argv.slice(2);
const temp = `${shared}/.deploy-operation.${randomUUID()}.tmp`;
let handle, created=false;
try {
  handle=await open(temp,'wx',0o640); created=true;
  await handle.writeFile(JSON.stringify({ operationId, releaseSha, controlSha })+'\n');
  await handle.close(); handle=undefined;
  await rename(temp, `${shared}/deploy-operation.json`);
  created=false;
} catch { console.error('deploy pointer publication failed'); process.exitCode=78; }
finally { if(handle) await handle.close().catch(()=>{}); if(created) await unlink(temp).catch(()=>{}); }
NODE
}

inspect_previous_operation() {
  # A successful exact previous receipt is the only automatic forward admission.
  # Failed/incomplete/malformed state requires runtime inspection and recovery.
  local previous
  previous=$(MKW_NODE_ACCESS=ro run_node --input-type=module - "$MKW_CONTROL_ROOT" "$MKW_DEPLOY_PATH" "$MKW_OPERATION_ID" <<'NODE'
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const [root, deploy, currentOperation] = process.argv.slice(2);
  const { parseJsonStrict } = await import(pathToFileURL(`${root}/scripts/product/release/validate-manifest.mjs`).href);
  const { resolveOperationDirectory, validateOperationId } = await import(pathToFileURL(`${root}/scripts/product/release/operation-id.mjs`).href);
  const { readOperationReceipt } = await import(pathToFileURL(`${root}/scripts/product/release/operation-receipts.mjs`).href);
  let pointer, covered = new Set();
  try { pointer = parseJsonStrict(await readFile(`${deploy}/shared/deploy-operation.json`, 'utf8')); }
  catch (e) { if(e.code!=='ENOENT') throw e; }
  if(pointer) {
    if(Object.keys(pointer).sort().join(',') !== 'controlSha,operationId,releaseSha' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(pointer.releaseSha) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(pointer.controlSha)) throw new Error();
    validateOperationId(pointer.operationId);
    const manifest = parseJsonStrict(await readFile(`${deploy}/releases/${pointer.releaseSha}/release-manifest.json`,'utf8'));
    const directory = await resolveOperationDirectory(deploy,pointer.operationId);
    const receipt = await readOperationReceipt(directory,{
      operationId:pointer.operationId,releaseSha:pointer.releaseSha,
      imageDigests:{api:manifest.apiImage,web:manifest.webImage,postgres:manifest.postgresImage}
    });
    if(receipt.controlSha !== pointer.controlSha) throw new Error();
    // Only successful protected application recovery can close older uncertainty.
    // Preserve every old operation; correlation is evidence, never deletion.
    try {
      const ids=parseJsonStrict(await readFile(`${directory}/previous-operation-ids.json`,'utf8'));
      if(!Array.isArray(ids) || ids.some(id=>validateOperationId(id)!==id) || new Set(ids).size!==ids.length || ids.includes(pointer.operationId)) throw new Error();
      covered=new Set(ids);
    } catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  // A reserved interrupted attempt cannot be adopted or silently ignored. A
  // bootstrap has no release identity, and records its successful completion.
  for(const id of await readdir(`${deploy}/operations`)) {
    if(id === currentOperation || covered.has(id)) continue;
    const directory = await resolveOperationDirectory(deploy,id);
    try { if(await readFile(`${directory}/bootstrap-complete`, 'utf8') === 'ok\n') continue; } catch(e) { if(e.code!=='ENOENT') throw e; }
    try { if(await readFile(`${directory}/pre-mutation-failure`, 'utf8') === 'ok\n') continue; } catch(e) { if(e.code!=='ENOENT') throw e; }
    const names=(await readdir(directory)).filter(n=>n.startsWith(`${id}.`) && n.endsWith('.json'));
    if(!names.length) throw new Error();
    const events=await Promise.all(names.map(async n=>parseJsonStrict(await readFile(`${directory}/${n}`,'utf8'))));
    const last=events.sort((a,b)=>a.sequence-b.sequence).at(-1);
    if(last.status==='in-progress' || last.operationId !== id) throw new Error();
    await readOperationReceipt(directory,{operationId:id,releaseSha:last.releaseSha,imageDigests:last.imageDigests});
  }
  console.log(JSON.stringify([...covered]));
} catch { console.log('uncertain'); }
NODE
) || return 78
  if [[ "$previous" != uncertain ]]; then
    # Carry a successfully completed recovery's correlation through later forward
    # operations. A forward attempt can inherit coverage, never originate it.
    if [[ "$previous" != '[]' ]]; then
      MKW_NODE_ACCESS=rw run_node --input-type=module - "$operation_dir/previous-operation-ids.json" "$previous" <<'NODE'
import { writeFile } from 'node:fs/promises';
try { await writeFile(process.argv[2],process.argv[3]+'\n',{flag:'wx',mode:0o640}); }
catch { console.error('recovery correlation publication failed'); process.exitCode=78; }
NODE
    fi
    return 0
  fi
  # Read-only inspect occurs under the same lock. Never assert DB unchanged.
  docker ps --filter "label=com.docker.compose.project=$MKW_PROJECT_NAME" --format '{{.ID}}' > "$operation_dir/previous-runtime-ids.txt" 2>/dev/null || true
  while IFS= read -r id; do
    [[ -z "$id" ]] || docker inspect --format '{{.Id}} {{.Config.Image}} {{.State.Status}}' "$id" >> "$operation_dir/previous-runtime.txt" 2>/dev/null || true
  done < "$operation_dir/previous-runtime-ids.txt"
  if [[ -f "$MKW_DEPLOY_PATH/shared/deploy-operation.json" ]]; then cp -- "$MKW_DEPLOY_PATH/shared/deploy-operation.json" "$operation_dir/previous-uncertain-operation.json"; fi
  printf 'previous operation uncertain; runtime inspection attempted under deploy lock\n' > "$operation_dir/previous-uncertainty.txt"
  if [[ "$MKW_OPERATION_KIND" != application-rollback ]]; then
    echo 'incident-required: previous operation uncertain; runtime inspected; manual application recovery required' >&2
    return 78
  fi
  MKW_NODE_ACCESS=rw run_node --input-type=module - "$MKW_CONTROL_ROOT" "$MKW_DEPLOY_PATH" "$MKW_OPERATION_ID" <<'NODE'
import { readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
try {
  const [root,deploy,current]=process.argv.slice(2);
  const { validateOperationId }=await import(pathToFileURL(`${root}/scripts/product/release/operation-id.mjs`).href);
  const ids=(await readdir(`${deploy}/operations`)).filter(id=>id!==current);
  ids.forEach(validateOperationId);
  await writeFile(`${deploy}/operations/${current}/previous-operation-ids.json`,JSON.stringify(ids)+'\n',{flag:'wx',mode:0o640});
} catch { console.error('previous operation correlation rejected'); process.exitCode=78; }
NODE
}
