// Disposable Docker rehearsal for the simplified push-main release path.
// It runs only inside the task-owned Docker-in-Docker engine created by
// local-release-rehearsal.ps1 and records secret-free evidence.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";

const root = "/workspace";
const target = "/home/deploy/mkw";
const evidence = "/local-evidence";
const task = "8849e8d4";
assert.equal(process.platform, "linux");
assert.equal(process.cwd(), root);
assert.equal(await readFile("/mkw-local-owned", "utf8"), task);
await mkdir(evidence, { recursive: true });
const commandLog = `${evidence}/commands.log`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function command(bin, args, options = {}) {
  return spawnSync(bin, args, { cwd: root, maxBuffer: 64 * 1024 * 1024, ...options });
}
function run(bin, args, options = {}) {
  const result = command(bin, args, options);
  if (result.status !== 0) throw new Error(`${bin} ${args.join(" ")} failed (${result.status}): ${String(result.stderr).slice(-4000)}`);
  return result.stdout;
}
const docker = (...args) => run("docker", args).toString().trim();
assert.equal(docker("info", "--format", "{{.Name}}"), hostname());
run("find", [`${root}/scripts`, "-type", "f", "-name", "*.sh", "-exec", "sed", "-i", "s/\\r$//", "{}", "+"]);
for (const filter of [["label", "com.mkw.owner=push-main-completion"], ["label", "com.docker.compose.project=mkw"], ["name", "^mkw-db-1$"], ["name", "^mkw-cd-registry$"], ["name", "^mkw-cd-restore-"]]) {
  for (const id of docker("ps", "-aq", "--filter", `${filter[0]}=${filter[1]}`).split(/\s+/).filter(Boolean))
    if (command("docker", ["inspect", id]).status === 0) docker("rm", "-f", "-v", id);
}
for (const volume of ["mkw_pgdata", "mkw_cd_local_pg"]) if (command("docker", ["volume", "inspect", volume]).status === 0) docker("volume", "rm", volume);
await rm(target, { recursive: true, force: true });
await rm("/workspace/.git", { recursive: true, force: true });
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const git = (...args) => run("git", args).toString().trim();
const pg = (await readFile("deploy/postgres-image.env", "utf8")).match(/^MKW_POSTGRES_IMAGE=(.+)$/m)[1].trim();
const environment = {
  ...process.env,
  MKW_DEPLOY_PATH: target,
  MKW_PROJECT_NAME: "mkw",
  MKW_GATEWAY_PORT: "32784",
  MKW_WEB_ORIGIN: "https://local.invalid",
  MKW_ATTESTATION_MODE: "required",
  MKW_ATTESTATION_STATUS: "verified",
  MKW_REGISTRY_HOST: "ghcr.io",
  MKW_REGISTRY_VISIBILITY: "public",
  MKW_BACKUP_MAX_AGE_SECONDS: "86400",
  MKW_BACKUP_EXPECTED_KIND: "BACKUP",
  MKW_BACKUP_EXPECTED_HOST: "local-only",
  MKW_BACKUP_EXPECTED_DATABASE: "mkw",
  MKW_BACKUP_EXPECTED_TARGET_IDENTITY: `local-only/${target}/mkw`,
  MKW_AUTOMATIC_RELEASE: "false",
  MKW_SIMPLE_RELEASE: "true",
};
await save(`${evidence}/scope.json`, {
  localOnly: true,
  engine: hostname(),
  externalBoundary: "SIMULATED GitHub artifact ownership/signing; not live GitHub/GHCR/VPS proof",
  backup: "real encrypted pg_dump, decrypt, pg_restore and data-preservation checks",
  path: "quality -> full API/Web build -> BACKUP -> simple deploy -> verify; no state adoption or auto rollback",
  base: "f024b5b77b404796304395439a140f35ca3fdf56",
});
await mkdir("/local-only/registry", { recursive: true });
run("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-subj", "/CN=ghcr.io", "-addext", "subjectAltName=DNS:ghcr.io", "-keyout", "/local-only/registry/key.pem", "-out", "/local-only/registry/cert.pem"]);
await mkdir("/etc/docker/certs.d/ghcr.io", { recursive: true });
await cp("/local-only/registry/cert.pem", "/etc/docker/certs.d/ghcr.io/ca.crt");
await appendFile("/etc/hosts", "\n127.0.0.1 ghcr.io\n");
docker("pull", "registry:2");
docker("run", "-d", "--name", "mkw-cd-registry", "--label", "com.mkw.owner=push-main-completion", "-p", "127.0.0.1:443:5000", "-v", "/local-only/registry:/certs:ro", "-e", "REGISTRY_HTTP_TLS_CERTIFICATE=/certs/cert.pem", "-e", "REGISTRY_HTTP_TLS_KEY=/certs/key.pem", "registry:2");
docker("pull", pg);
const composeArgs = (file, ...args) => ["compose", "-p", "mkw", "-f", file, ...args];
const currentCompose = `${target}/current/compose.rendered.yml`;
const dbId = () => docker(...composeArgs(currentCompose, "ps", "-q", "db"));
const sql = (id, text) => run("docker", ["exec", "-i", id, "sh", "-ceu", 'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: text }).toString().trim();
const records = new Map();
let sequence = 100;
let backupSequence = 0;
async function buildRelease(label) {
  const sha = git("rev-parse", "HEAD");
  const runId = String(++sequence);
  const id = String(++sequence);
  const dir = `${evidence}/artifacts/${sha}`;
  await mkdir(dir, { recursive: true });
  const images = {};
  for (const service of ["api", "web"]) {
    const tag = `ghcr.io/mkw-local/mkw-${service}:${sha}`;
    const result = command("docker", ["build", "-f", `deploy/Dockerfile.${service}`, "--label", `org.opencontainers.image.revision=${sha}`, "--label", "org.opencontainers.image.source=https://github.com/mkw-local/rehearsal", "-t", tag, "."]);
    await writeFile(`${evidence}/build-${label}-${service}.log`, Buffer.concat([result.stdout, result.stderr]));
    assert.equal(result.status, 0, `real ${service} build failed`);
    const pushed = command("docker", ["push", tag]);
    await writeFile(`${evidence}/push-${label}-${service}.log`, Buffer.concat([pushed.stdout, pushed.stderr]));
    assert.equal(pushed.status, 0, `registry push failed: ${pushed.stderr}`);
    const [info] = JSON.parse(docker("image", "inspect", tag));
    images[service] = info.RepoDigests.find((value) => value.startsWith(`ghcr.io/mkw-local/mkw-${service}@`));
    assert.ok(images[service]);
  }
  const descriptor = { sha256: hash("local external metadata boundary"), size: 32 };
  const manifest = { schemaVersion: "1", releaseSha: sha, sourceRepository: "mkw-local/rehearsal", createdAt: new Date().toISOString(), apiImage: images.api, webImage: images.web, postgresImage: pg, artifacts: { sbom: descriptor, provenance: descriptor } };
  await save(`${dir}/release-manifest.json`, manifest);
  await save(`${dir}/build-metadata.json`, { sourceSha: sha, producerRunId: runId, producerRunAttempt: "1", apiDigest: images.api.split("@")[1], webDigest: images.web.split("@")[1] });
  await cp(`${root}/scripts/product`, `${target}/releases/${sha}/scripts/product`, { recursive: true });
  await cp(`${root}/deploy`, `${target}/releases/${sha}/deploy`, { recursive: true });
  await cp(dir, `${target}/releases/${sha}/release-artifact`, { recursive: true });
  run("find", [`${target}/releases/${sha}/scripts/product`, "-type", "f", "-name", "*.sh", "-exec", "sed", "-i", "s/\\r$//", "{}", "+"]);
  const record = { sha, runId, id, dir, manifest, digest: `sha256:${hash(JSON.stringify(manifest))}`, operationId: `${runId}-1-${sha}` };
  records.set(id, record);
  return record;
}
function envFor(record) {
  return { ...environment, MKW_RELEASE_SHA: record.sha, RELEASE_SHA: record.sha, MKW_OPERATION_ID: record.operationId, MKW_API_IMAGE: record.manifest.apiImage, MKW_WEB_IMAGE: record.manifest.webImage, MKW_POSTGRES_IMAGE: pg, MKW_RELEASE_RUN_ID: record.runId, MKW_RELEASE_RUN_ATTEMPT: "1", MKW_RELEASE_ARTIFACT_ID: record.id, MKW_RELEASE_ARTIFACT_DIGEST: record.digest, MKW_CONTROL_SHA: record.sha, EXPECTED_API_IMAGE: record.manifest.apiImage, EXPECTED_WEB_IMAGE: record.manifest.webImage, EXPECTED_POSTGRES_IMAGE: pg, MKW_SOURCE_REPOSITORY: "mkw-local/rehearsal" };
}
async function deploy(record, expected = 0) {
  const releaseRoot = `${target}/releases/${record.sha}`;
  const result = command("bash", [`${releaseRoot}/scripts/product/deploy-entrypoint.sh`, "--release", "--manifest", `${releaseRoot}/release-artifact/release-manifest.json`, "--compose", `${releaseRoot}/deploy/compose.production.yml`, "--backup-ready", `${target}/shared/backup-ready.json`], { env: envFor(record), cwd: releaseRoot });
  await writeFile(`${evidence}/deploy-${record.runId}.log`, Buffer.concat([result.stdout, result.stderr]));
  if (expected === 0) assert.equal(result.status, 0, `deploy failed: ${result.stderr}`); else assert.notEqual(result.status, 0, "unhealthy release unexpectedly passed");
}
async function verify(record) {
  const result = command("bash", [`${root}/scripts/product/post-deploy-verify.sh`], { env: envFor(record) });
  await writeFile(`${evidence}/verify-${record.runId}.log`, Buffer.concat([result.stdout, result.stderr]));
  assert.equal(result.status, 0, `verification failed: ${result.stderr}`);
  return { releaseSha: record.sha, status: "verified", stateFiles: false };
}
async function backup(record) {
  const n = ++backupSequence;
  const container = `mkw-cd-restore-${n}`;
  const source = dbId();
  const dump = run("docker", ["exec", source, "sh", "-ceu", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc']);
  const encrypted = run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-pass", "file:/local-only/backup-key"], { input: dump });
  const decrypted = run("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "file:/local-only/backup-key"], { input: encrypted });
  assert.equal(hash(decrypted), hash(dump));
  docker("run", "-d", "--name", container, "--label", "com.mkw.owner=push-main-completion", "--env-file", `${target}/shared/db.env`, pg);
  try {
    for (let attempt = 0; attempt < 60; attempt++) { if (command("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "mkw", "-d", "mkw"]).status === 0) break; await new Promise((resolve) => setTimeout(resolve, 500)); }
    run("docker", ["exec", "-i", container, "pg_restore", "-h", "127.0.0.1", "--exit-on-error", "--no-owner", "-U", "mkw", "-d", "mkw"], { input: decrypted });
    assert.equal(sql(container, "SELECT value FROM local_rehearsal_probe WHERE id = 1;"), "fixture-8849e8d4");
  } finally { docker("rm", "-f", "-v", container); }
  await writeFile(`${evidence}/backup-${n}.dump.enc`, encrypted);
  const producedAt = Date.now();
  const now = new Date(Math.floor(producedAt / 1000) * 1000).toISOString();
  const metadata = { schemaVersion: "1", kind: "BACKUP", backupId: `mkw-local-${n}-release`, releaseSha: record.sha, createdAt: now, restoreVerified: true, retentionUntil: new Date(producedAt + 86400000).toISOString(), dumpSha256: hash(encrypted), size: encrypted.length, storageLocation: `local-owned-engine:backup-${n}.dump.enc`, databaseIdentity: { host: "local-only", name: "mkw", engine: "postgresql", targetIdentity: environment.MKW_BACKUP_EXPECTED_TARGET_IDENTITY } };
  await save(`${target}/shared/backup-ready.json`, metadata);
  await save(`${evidence}/backup-${n}-verified.json`, metadata);
}
await mkdir(`${target}/shared`, { recursive: true });
await mkdir(`${target}/current`, { recursive: true });
const password = randomBytes(32).toString("hex");
await writeFile(`${target}/shared/db.env`, `POSTGRES_DB=mkw\nPOSTGRES_USER=mkw\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
await writeFile(`${target}/shared/api.env`, `DATABASE_URL=postgresql://mkw:${password}@db:5432/mkw\nAUTH_THROTTLE_SECRET=${randomBytes(32).toString("hex")}\nWEB_ORIGIN=https://local.invalid\nTLS_TERMINATED=true\n`, { mode: 0o600 });
await writeFile("/local-only/backup-key", randomBytes(32).toString("hex"), { mode: 0o600 });
git("init"); git("config", "user.name", "MKW Local Rehearsal"); git("config", "user.email", "local@example.invalid"); git("add", "."); git("commit", "-m", "local rehearsal A");
const a = await buildRelease("A");
const rendered = (await readFile("deploy/compose.production.yml", "utf8")).replaceAll("./shared/", `${target}/shared/`);
await writeFile(currentCompose, rendered);
run("docker", composeArgs(currentCompose, "up", "-d", "--wait", "db"), { env: envFor(a) });
run("docker", composeArgs(currentCompose, "run", "--rm", "--no-deps", "api", "node", "node_modules/prisma/build/index.js", "migrate", "deploy"), { env: envFor(a) });
sql(dbId(), "CREATE TABLE local_rehearsal_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO local_rehearsal_probe VALUES (1, 'fixture-8849e8d4');");
await backup(a); await deploy(a); await verify(a);
await save(`${evidence}/A-verified.json`, { releaseSha: a.sha, stateFiles: false, data: sql(dbId(), "SELECT value FROM local_rehearsal_probe WHERE id = 1;") });
// Legacy baseline fixture: remove any optional state files before the next push.
await rm(`${target}/shared/current-state.json`, { force: true }); await rm(`${target}/shared/last-known-good.json`, { force: true });
await save(`${evidence}/legacy-no-state.json`, { currentState: "absent", lastKnownGood: "absent", expected: "normal deploy" });
await writeFile("apps/web/public/local-release.txt", "B\n"); git("add", "."); git("commit", "-m", "local Web release B");
const b = await buildRelease("B"); await backup(b); await deploy(b); await verify(b);
assert.equal(sql(dbId(), "SELECT value FROM local_rehearsal_probe WHERE id = 1;"), "fixture-8849e8d4");
await save(`${evidence}/B-verified.json`, { releaseSha: b.sha, stateFiles: false, dataPreserved: true });
// Unhealthy release is visible and leaves the database untouched; there is no auto rollback.
const nginx = await readFile("deploy/nginx.conf", "utf8");
await writeFile("deploy/nginx.conf", nginx.replace("try_files $uri $uri/ /index.html;", "return 503;")); git("add", "."); git("commit", "-m", "local unhealthy release C");
const c = await buildRelease("C-unhealthy"); await backup(c); await deploy(c, 1);
assert.equal(sql(dbId(), "SELECT value FROM local_rehearsal_probe WHERE id = 1;"), "fixture-8849e8d4");
await writeFile("deploy/nginx.conf", nginx); git("add", "."); git("commit", "-m", "local healthy release D");
const d = await buildRelease("D-api-change"); await backup(d); await deploy(d); await verify(d);
assert.equal(sql(dbId(), "SELECT value FROM local_rehearsal_probe WHERE id = 1;"), "fixture-8849e8d4");
await save(`${evidence}/result.json`, { result: "passed", actualContainers: true, actualBuilds: true, legacyMissingState: "deployed normally", unhealthyRelease: "failed visibly with no automatic rollback", dataPreserved: true, encryptedBackupRestoreCount: backupSequence, currentStateFilesWritten: false, liveGithubSigningGhcrVps: "not-run" });
await appendFile(commandLog, "Actual simplified entrypoint, encrypted backup/restore, legacy no-state deploy, unhealthy failure and data-preserving rerun executed.\n");
console.log("LOCAL_REHEARSAL_OK");
