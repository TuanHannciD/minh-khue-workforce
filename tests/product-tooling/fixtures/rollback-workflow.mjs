// Owns GitHub/SSH process doubles only. ZIP bytes, checksum, unzip, Node resolver,
// workflow Bash, bundle assembler and inventories remain production implementations.
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const posix = (p) =>
  p
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
function archive(text) {
  const name = Buffer.from("backup-ready.json"),
    data = Buffer.from(text);
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}
export async function canonicalRollbackFixture(t, root, variant = "happy") {
  const dir = await mkdtemp(join(tmpdir(), "mkw-canonical-rollback-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const temp = await mkdtemp(join(tmpdir(), "mkw-canonical-runner-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  for (const p of [
    "scripts/product",
    "old-release-artifact",
    "backup-ready",
    "release-source/deploy",
    "home",
  ])
    await mkdir(join(dir, p), { recursive: true });
  await cp(
    join(root, "scripts/product/release"),
    join(dir, "scripts/product/release"),
    { recursive: true },
  );
  for (const name of ["deploy-entrypoint.sh", "post-deploy-verify.sh"])
    await cp(
      join(root, "scripts/product", name),
      join(dir, "scripts/product", name),
    );
  await cp(
    join(root, "deploy/compose.production.yml"),
    join(dir, "release-source/deploy/compose.production.yml"),
  );
  await writeFile(
    join(dir, "release-source/deploy/compose.production.yml"),
    (await readFile(
      join(dir, "release-source/deploy/compose.production.yml"),
      "utf8",
    )) + "\n# OLD_RELEASE_COMPOSE_DATA\n",
  );
  const sha = "a".repeat(40),
    host = "fixture-db",
    identity = "fixture-db//home/deploy/mkw/mkw";
  const manifest = {
    schemaVersion: "1",
    releaseSha: sha,
    sourceRepository: "org/repo",
    createdAt: new Date().toISOString(),
    apiImage: `ghcr.io/org/api@sha256:${"1".repeat(64)}`,
    webImage: `ghcr.io/org/web@sha256:${"2".repeat(64)}`,
    postgresImage: `postgres@sha256:${"3".repeat(64)}`,
    artifacts: {
      sbom: { sha256: "4".repeat(64), size: 1 },
      provenance: { sha256: "5".repeat(64), size: 1 },
    },
  };
  const artifacts = {
    "release-manifest.json": JSON.stringify(manifest),
    "build-metadata.json": JSON.stringify({
      sourceSha: sha,
      producerRunId: "20",
      producerRunAttempt: "1",
    }),
  };
  artifacts["release-manifest.sha256"] =
    `${hash(artifacts["release-manifest.json"])}  release-manifest.json\n`;
  artifacts["release-checksums.sha256"] = Object.entries(artifacts)
    .map(([name, text]) => `${hash(text)}  ${name}\n`)
    .join("");
  for (const [name, text] of Object.entries(artifacts))
    await writeFile(join(dir, "old-release-artifact", name), text);
  await writeFile(
    join(temp, "rollback-release-resolved.json"),
    JSON.stringify({
      artifactId: "201",
      runId: "20",
      runAttempt: "1",
      artifactDigest: `sha256:${"d".repeat(64)}`,
      manifest,
      metadata: JSON.parse(artifacts["build-metadata.json"]),
    }),
  );
  const readiness = {
    schemaVersion: "1",
    kind: "BACKUP",
    backupId: variant === "backupId" ? "mkw-10-1-release" : "mkw-10-2-release",
    releaseSha: "b".repeat(40),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    retentionUntil: new Date(Date.now() + 86400000 * 7).toISOString(),
    dumpSha256: "6".repeat(64),
    size: 42,
    restoreVerified: true,
    storageLocation: "github-actions-artifact:fixture",
    databaseIdentity: {
      host,
      name: "mkw",
      engine: "postgresql",
      targetIdentity: identity,
    },
  };
  if (variant === "stale")
    readiness.createdAt = new Date(Date.now() - 86400000 * 2).toISOString();
  if (variant === "future")
    readiness.createdAt = new Date(Date.now() + 3600000).toISOString();
  if (variant === "target") readiness.databaseIdentity.host = "other";
  if (variant === "empty") readiness.kind = "INITIAL_EMPTY_DEPLOYMENT";
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify({
      ...readiness,
      ...(variant === "metadata" ? { size: 43 } : {}),
    }),
  );
  const zip = archive(JSON.stringify(readiness));
  await writeFile(join(dir, "artifact.zip"), zip);
  const config = {
    artifact: {
      id: 101,
      name: "mkw-backup-10-2",
      expired: false,
      digest:
        variant === "digest"
          ? "bad"
          : `sha256:${variant === "archive" ? "f".repeat(64) : hash(zip)}`,
      workflow_run: { id: 10 },
    },
    run: {
      id: 10,
      workflow_id: 100,
      run_attempt: variant === "attempt" ? 3 : 2,
      event: variant === "producer" ? "push" : "workflow_dispatch",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
    },
    workflow: {
      id: 100,
      path:
        variant === "workflow"
          ? ".github/workflows/spoof.yml"
          : ".github/workflows/backup.yml",
    },
  };
  await writeFile(join(dir, "github.json"), JSON.stringify(config));
  await writeFile(
    join(dir, "github-boundary.mjs"),
    `
import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {promisify} from 'node:util';import fs from 'node:fs';
const originalExec=child.execFile,originalSpawn=child.spawn;
const call=async(args)=>{const c=JSON.parse(fs.readFileSync(process.env.FIXTURE_GITHUB_JSON));const route=args.at(-1);const v=route.endsWith('/artifacts/101')?c.artifact:route.endsWith('/runs/10/attempts/2')?c.run:route.endsWith('/workflows/100')?c.workflow:null;if(!v)throw new Error('unexpected GitHub request');return {stdout:JSON.stringify([v]),stderr:''};};
child.execFile=function(command,args,options,callback){if(command!=='gh')return originalExec(command,args,options,callback);call(args).then(r=>callback(null,r.stdout,r.stderr),callback);};
child.execFile[promisify.custom]=(command,args,options)=>command==='gh'?call(args):promisify(originalExec)(command,args,options);
child.spawn=function(command,args,options){if(command!=='gh')return originalSpawn(command,args,options);return originalSpawn(process.execPath,['-e',"require('fs').createReadStream(process.env.FIXTURE_GITHUB_ZIP).pipe(process.stdout)"],options);};syncBuiltinESMExports();
`,
  );
  const env = {
    OLD_RELEASE_SHA: sha,
    ROLLBACK_REASON: "approved-fixture-current-schema",
    MKW_OPERATION_ID: "rollback-fixture",
    MKW_CONTROL_SHA: "c".repeat(40),
    MKW_RELEASE_RUN_ID: "20",
    MKW_RELEASE_RUN_ATTEMPT: "1",
    MKW_RELEASE_ARTIFACT_ID: "201",
    MKW_RELEASE_ARTIFACT_DIGEST: `sha256:${"d".repeat(64)}`,
    BACKUP_RUN_ID: "10",
    BACKUP_ARTIFACT_ID: "101",
    BACKUP_RUN_ATTEMPT: "",
    BACKUP_ARTIFACT_DIGEST: "",
    BACKUP_RESOLVED_PATH: posix(join(dir, "rollback-backup-resolved.json")),
    MKW_SSH_HOST: host,
    MKW_SSH_PORT: "22",
    MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
    MKW_DEPLOY_PATH: "/home/deploy/mkw",
    MKW_PROJECT_NAME: "mkw",
    MKW_GATEWAY_PORT: "3200",
    MKW_BACKUP_MAX_AGE_SECONDS: "86400",
    MKW_BACKUP_EXPECTED_KIND: "BACKUP",
    MKW_BACKUP_EXPECTED_HOST: host,
    MKW_BACKUP_EXPECTED_DATABASE: "mkw",
    MKW_BACKUP_EXPECTED_TARGET_IDENTITY: identity,
    TARGET_DATABASE: "mkw",
    TARGET_IDENTITY: identity,
    MKW_ATTESTATION_MODE: "off",
    MKW_ATTESTATION_STATUS: "not-configured",
    ATTESTATION_MODE: variant === "required-attestation" ? "required" : "off",
    MKW_SSH_PRIVATE_KEY: "fixture-only",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "org/repo",
    GH_TOKEN: "fixture-only",
    GITHUB_RUN_ID: "30",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_TEMP: posix(dir),
    GITHUB_WORKSPACE: posix(dir),
    HOME: posix(join(dir, "home")),
    GITHUB_OUTPUT: posix(join(dir, "outputs")),
    GITHUB_STEP_SUMMARY: posix(join(dir, "summary")),
    FIXTURE_GITHUB_JSON: join(dir, "github.json"),
    FIXTURE_GITHUB_ZIP: join(dir, "artifact.zip"),
    NODE_OPTIONS: `--import=${pathToFileURL(join(dir, "github-boundary.mjs")).href}`,
  };
  const prelude = `
install(){ if [[ "$*" == *' -d '* ]];then mkdir -p "\${!#}";else cp "\${@: -2:1}" "\${!#}";fi; }
chmod(){ :; }
ssh-keyscan(){ echo KEYSCAN >> "$RUNNER_TEMP/transport.log";echo fixture; }
ssh-keygen(){ echo '256 fixture-fingerprint fixture'; }
ssh(){ printf 'SSH %s\\n' "$*" >> "$RUNNER_TEMP/transport.log"; }
scp(){ printf 'SCP %s\\n' "$*" >> "$RUNNER_TEMP/transport.log"; }
gh(){ return 1; }
`;
  env.RUNNER_TEMP = posix(temp);
  env.BACKUP_RESOLVED_PATH = posix(join(temp, "rollback-backup-resolved.json"));
  env.RELEASE_RESOLVED_PATH = posix(
    join(temp, "rollback-release-resolved.json"),
  );
  return { dir, temp, env, prelude, readiness };
}
