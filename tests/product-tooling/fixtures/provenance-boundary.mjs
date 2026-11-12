import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const Zip = createRequire(
  require.resolve("../../../apps/api/node_modules/exceljs/package.json"),
)("jszip");
export const posix = (path) =>
  path
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
export const BASH =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
export async function boundaryFixture(t, root, manifest) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-provenance-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(root, "scripts/product"), join(dir, "policy/scripts/product"), {
    recursive: true,
  });
  const metadata = {
    sourceSha: manifest.releaseSha,
    producerRunId: "10",
    producerRunAttempt: "1",
  };
  const ready = {
    schemaVersion: "1",
    kind: "BACKUP",
    backupId: "mkw-20-1-release",
    releaseSha: manifest.releaseSha,
    createdAt: "2026-11-12T10:00:00Z",
    dumpSha256: "e".repeat(64),
    size: 1,
    restoreVerified: true,
    retentionUntil: "2026-12-12T10:00:00Z",
    storageLocation: "github-actions-artifact:mkw",
    databaseIdentity: {
      host: "prod",
      name: "mkw",
      engine: "postgresql",
      targetIdentity: "vps/mkw",
    },
  };
  const records = { artifacts: {}, runs: {} };
  for (const [id, workflow] of [
    ["10", "build-release"],
    ["20", "backup"],
  ]) {
    const run = {
      id,
      workflow_id: id,
      path: `.github/workflows/${workflow}.yml`,
      event: id === "20" ? "workflow_dispatch" : "workflow_run",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
    };
    records.runs[id] = { ...run, run_attempt: "2" };
    for (const attempt of ["1", "2"])
      records.runs[`${id}/attempts/${attempt}`] = {
        ...run,
        run_attempt: attempt,
        run_started_at: `2026-11-12T${attempt === "1" ? "10" : "11"}:00:00Z`,
        updated_at: `2026-11-12T${attempt === "1" ? "10" : "11"}:59:59Z`,
      };
  }
  async function persist() {
    for (const [id, entries] of [
      [
        "101",
        { "release-manifest.json": manifest, "build-metadata.json": metadata },
      ],
      ["201", { "backup-ready.json": ready }],
    ]) {
      const zip = new Zip();
      for (const [entry, value] of Object.entries(entries))
        zip.file(entry, JSON.stringify(value));
      const bytes = await zip.generateAsync({ type: "nodebuffer" });
      await writeFile(join(dir, `${id}.zip`), bytes);
      records.artifacts[id] = {
        id,
        expired: false,
        name:
          id === "101"
            ? `mkw-release-${manifest.releaseSha}`
            : "mkw-backup-20-1",
        workflow_run: { id: id === "101" ? "10" : "20" },
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        created_at: "2026-11-12T10:00:30Z",
      };
    }
    await writeFile(join(dir, "records.json"), JSON.stringify(records));
  }
  await persist();
  for (const p of ["release-artifact", "backup-ready", "release-source"])
    await mkdir(join(dir, p));
  const text = JSON.stringify(manifest);
  await writeFile(join(dir, "release-artifact/release-manifest.json"), text);
  await writeFile(
    join(dir, "release-artifact/release-manifest.sha256"),
    `${createHash("sha256").update(text).digest("hex")}  release-manifest.json\n`,
  );
  await writeFile(
    join(dir, "release-artifact/build-metadata.json"),
    JSON.stringify(metadata),
  );
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(ready),
  );
  const preload = join(dir, "github-boundary.mjs");
  await writeFile(
    preload,
    `
import child from 'node:child_process';
import {readFileSync,writeSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import {EventEmitter} from 'node:events';
const dir=process.env.MKW_FIXTURE_DIR, originalExec=child.execFile, originalSpawn=child.spawn;
const execute=async(args)=>{
  const data=JSON.parse(readFileSync(dir+'/records.json','utf8')), route=args.at(-1); let value;
  if(route.includes('/actions/artifacts/')) value=data.artifacts[route.split('/').at(-1)];
  else if(route.includes('/actions/runs/')) value=data.runs[route.split('/actions/runs/')[1]];
  else if(route.includes('/actions/workflows/')) { const id=route.split('/').at(-1); value={id,path:data.runs[id].path}; }
  else throw new Error('unexpected GitHub route');
  return {stdout:JSON.stringify([value]),stderr:''};
};
child.execFile=function(command,args,options,cb){if(command!=='gh')return originalExec(command,args,options,cb);execute(args).then(r=>cb(null,r.stdout,r.stderr),cb);};
child.execFile[promisify.custom]=(command,args,options)=>command==='gh'?execute(args):promisify(originalExec)(command,args,options);
child.spawn=function(command,args,options){
  if(command!=='gh')return originalSpawn(command,args,options);
  const child=new EventEmitter();child.stderr={resume(){}};
  queueMicrotask(()=>{try{writeSync(options.stdio[1],readFileSync(dir+'/'+args.at(-1).split('/').at(-2)+'.zip'));child.emit('close',0);}catch(error){child.emit('error',error);}});
  return child;
};
syncBuiltinESMExports();
`,
  );
  return {
    dir,
    records,
    metadata,
    ready,
    persist,
    env: {
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      MKW_FIXTURE_DIR: posix(dir),
      RELEASE_SHA: manifest.releaseSha,
      RELEASE_RUN_ID: "10",
      RELEASE_ARTIFACT_ID: "101",
      BACKUP_RUN_ID: "20",
      BACKUP_ARTIFACT_ID: "201",
      MKW_AUTOMATIC_RELEASE: "false",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "org/repo",
      GH_TOKEN: "fixture-only",
      BACKUP_KIND: "BACKUP",
      MKW_SSH_HOST: "prod",
      TARGET_DATABASE: "mkw",
      TARGET_IDENTITY: "vps/mkw",
      BACKUP_MAX_AGE_SECONDS: "86400",
      GITHUB_OUTPUT: posix(join(dir, "output")),
    },
  };
}
