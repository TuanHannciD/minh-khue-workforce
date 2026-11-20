// Inner engine only. File map:
// - enter/publicReport/command/scenario: stage, safe terminal and private journal.
// - acquire/build/backup: owned registry/images and restore lifetime.
// - entrypointStep/releaseInvariant: fixed diagnostic hints, no raw output.
// - stage/deploy/verify: artifact -> pack -> extract -> real entrypoint.
// - main: admission, snapshot proof, account adapters and recovery scenarios.
// Kept together because these adapters share one admitted daemon and journal.
// Test faults and fake canonical/provenance inputs live in the test fixture.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  appendFile,
  readdir,
} from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { verifySourceSnapshot } from "../ci/source-snapshot.mjs";
import {
  projectPublicReport,
  publicRuntimeVersion,
  safeReportSummary,
  scenarioIds,
  entrypointSites,
  releaseInvariantSites,
  runIdPattern,
} from "../ci/evidence.mjs";
import {
  writeRehearsalEvidence as save,
  classifyRehearsalFailure,
  waitForRehearsalPostgres,
  executeRehearsalProcess,
} from "./local-rehearsal-engine.mjs";
import {
  assembleDeploymentBundle,
  writeBundleInventory,
} from "./release/release-bundle.mjs";
import {
  runRealAccountScenarios,
  makeRehearsalArtifact,
  runRealReleaseScenarios,
  installRehearsalAudit,
  runRealRestoreReadinessScenario,
} from "../../tests/product-tooling/fixtures/deploy-account.mjs";

const root = "/workspace",
  target = "/home/deploy/mkw",
  evidence = "/local-evidence";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let currentCase = null,
  assertions = 0;
const scenarios = [],
  commands = [],
  acquisitions = [];
let owner, snapshot, pg, currentRelease;
const secondaryErrors = [];
const runtime = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  uid: process.getuid?.(),
};
let phase = "prerequisite",
  stepId = "prerequisite",
  primaryFailure;
const started = Date.now();
function enter(nextPhase, nextStep, scenarioId = null) {
  primaryFailure = undefined;
  phase = nextPhase;
  stepId = nextStep;
  currentCase = scenarioId;
}
function publicReport(result, code = "REPORT_INCOMPLETE") {
  return projectPublicReport({
    runId: owner.taskId,
    sourceSha256: snapshot?.sourceSha256,
    baseSha: snapshot?.base,
    result,
    durationMs: Date.now() - started,
    primary: {
      phase,
      stepId,
      scenarioId: currentCase,
      code,
      exitCode: result === "Passed" ? 0 : null,
      signal: null,
      ...primaryFailure,
    },
    counts: { assertions, commands: commands.length },
    secondaryErrors,
    runtime,
  });
}

// This is a diagnostic hint, never process success or receipt admission. A
// nonce is unique per invocation and removed from descendant environments by
// the entrypoint. Missing/duplicate/forged/unbounded text stays fixed unknown.
function entrypointStep(stderr, nonce, result) {
  const unknown = "entrypoint-unknown";
  if (
    !runIdPattern.test(nonce) ||
    stderr.length > 65536 ||
    result.signal ||
    result.processCode
  )
    return unknown;
  const lines = stderr
    .split("\n")
    .filter((line) => line.includes("MKW_REHEARSAL_SITE_V1:"));
  if (lines.length !== 1 || lines[0].length > 160) return unknown;
  const parts = lines[0].match(
    /^MKW_REHEARSAL_SITE_V1:([a-f0-9-]{36}):([a-z-]{1,32}):([0-9]{1,3})$/,
  );
  if (
    !parts ||
    parts[1] !== nonce ||
    !entrypointSites.includes(parts[2]) ||
    parts[3] !== String(result.status)
  )
    return unknown;
  return `entrypoint-${parts[2]}`;
}
function releaseInvariant(site) {
  assert.ok(releaseInvariantSites.includes(site));
  enter("deploy", site, currentCase);
}

async function command(bin, args, options = {}) {
  const start = Date.now();
  const { diagnosticNonce, ...processOptions } = options;
  const context = { phase, stepId, scenarioId: currentCase };
  const entry = {
    ...context,
    bin,
    args,
    cwd: options.cwd ?? root,
    scenario: currentCase,
    exit: null,
    durationMs: null,
  };
  commands.push(entry);
  await save(`${evidence}/commands.json`, commands);
  const outcome = await executeRehearsalProcess(bin, args, {
    cwd: root,
    timeout: 900000,
    ...processOptions,
  });
  const result = {
    ...outcome,
    stdout: outcome.stdout.toString(),
    stderr: outcome.stderr.toString(),
  };
  // Never record input, env, resolved config, SQL output, cookies or driver errors.
  Object.assign(entry, {
    exit: result.status,
    closeObserved: result.closeObserved,
    durationMs: Date.now() - start,
  });
  if (result.cleanupUnverified)
    secondaryErrors.push("PROCESS_CLEANUP_UNVERIFIED");
  if (result.status !== 0 || result.signal || result.processCode) {
    if (diagnosticNonce)
      context.stepId = entrypointStep(result.stderr, diagnosticNonce, result);
    entry.stepId = context.stepId;
    entry.diagnosticCode = classifyRehearsalFailure(result.stderr);
    // May be an expected negative command; only consume this context if the
    // caller actually throws, and reset it when another boundary succeeds.
    primaryFailure = {
      ...context,
      code:
        result.processCode ??
        (entry.diagnosticCode === "UNCLASSIFIED"
          ? "REHEARSAL_ASSERTION"
          : entry.diagnosticCode),
      exitCode: result.status,
      signal: result.signal ?? null,
    };
  } else primaryFailure = undefined;
  await save(`${evidence}/commands.json`, commands);
  // Process/stream/deadline failures are never an expected negative assertion.
  // Stop even when the observed process exit was zero.
  if (result.processCode)
    throw Object.assign(new Error(result.processCode), {
      code: result.processCode,
    });
  return result;
}
async function run(bin, args, options) {
  const result = await command(bin, args, options);
  assert.equal(result.status, 0, `command boundary ${commands.length}`);
  return result.stdout.trim();
}
const docker = (...args) => run("docker", args);
async function scenario(id, body) {
  assert.ok(scenarioIds.includes(id));
  enter(
    id.startsWith("account_") ||
      [
        "list_empty_then_sorted_users",
        "add_duplicate_concurrent",
        "reset_commits_and_revokes",
        "reset_failure_rolls_back",
        "add_deferred_commit_failure",
        "reset_missing",
        "invalid_private_input_preserves_sql",
        "credential_scan_evidence_and_runtime",
      ].includes(id)
      ? "account"
      : "assertions",
    "scenario",
    id,
  );
  primaryFailure = undefined;
  const start = Date.now();
  await body();
  assertions++;
  scenarios.push({ id, result: "passed", durationMs: Date.now() - start });
  await save(`${evidence}/assertions.json`, scenarios);
  currentCase = null;
  primaryFailure = undefined;
}
async function acquire(kind, name, image, args) {
  acquisitions.push({
    owner: owner.owner,
    taskId: owner.taskId,
    kind,
    name,
    image,
    requestedUtc: new Date().toISOString(),
  });
  await save(`${evidence}/resources.json`, acquisitions);
  const id = await docker(
    "run",
    "-d",
    "--name",
    name,
    "--label",
    `com.mkw.owner=${owner.owner}`,
    "--label",
    `com.mkw.task=${owner.taskId}`,
    ...args,
    image,
  );
  acquisitions.at(-1).id = id;
  await save(`${evidence}/resources.json`, acquisitions);
  return id;
}
const baseEnv = () => ({
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
});
const composePath = `${target}/current/compose.rendered.yml`;
const compose = (...args) =>
  run("docker", ["compose", "-p", "mkw", "-f", composePath, ...args], {
    env: envFor(currentRelease),
  });
const dbId = () => compose("ps", "-q", "db");
const apiId = () => compose("ps", "-q", "api");
async function sql(text, database = "mkw") {
  return run(
    "docker",
    [
      "exec",
      "-i",
      await dbId(),
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-U",
      "mkw",
      "-d",
      database,
    ],
    { input: text },
  );
}
function envFor(record, extra = {}) {
  return {
    ...baseEnv(),
    MKW_RELEASE_SHA: record.sha,
    RELEASE_SHA: record.sha,
    MKW_OPERATION_ID: record.operationId,
    MKW_API_IMAGE: record.manifest.apiImage,
    MKW_WEB_IMAGE: record.manifest.webImage,
    MKW_POSTGRES_IMAGE: record.manifest.postgresImage,
    MKW_RELEASE_RUN_ID: record.runId,
    MKW_RELEASE_RUN_ATTEMPT: "1",
    MKW_RELEASE_ARTIFACT_ID: record.id,
    MKW_RELEASE_ARTIFACT_DIGEST: record.digest,
    MKW_CONTROL_SHA: snapshot.sourceSha256,
    EXPECTED_API_IMAGE: record.manifest.apiImage,
    EXPECTED_WEB_IMAGE: record.manifest.webImage,
    EXPECTED_POSTGRES_IMAGE: record.manifest.postgresImage,
    MKW_SOURCE_REPOSITORY: "mkw-local/rehearsal",
    ...extra,
  };
}
async function backup(record) {
  const context = { phase, stepId, currentCase };
  let succeeded = false;
  enter("backup", "backup", currentCase);
  try {
    const n = acquisitions.filter((a) => a.kind === "restore").length + 1;
    const id = await dbId();
    // Binary dump stays inside owned daemon; no credential or dump in exported evidence.
    await run("bash", [
      "-ceu",
      'docker exec "$1" sh -ceu \'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc\' | openssl enc -aes-256-cbc -pbkdf2 -pass file:/local-only/backup-key -out "$2"',
      "backup",
      id,
      `/local-only/backup-${n}.enc`,
    ]);
    const restored = await acquire("restore", `task9-restore-${n}`, pg, [
      "--env-file",
      `${target}/shared/db.env`,
    ]);
    let restoreFailure, cleanupFailure;
    try {
      await waitForRehearsalPostgres(command, restored);
      await run("bash", [
        "-ceu",
        'openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/local-only/backup-key -in "$1" | docker exec -i "$2" pg_restore --exit-on-error --no-owner -U mkw -d mkw',
        "restore",
        `/local-only/backup-${n}.enc`,
        restored,
      ]);
      const probe = await run("docker", [
        "exec",
        restored,
        "psql",
        "-X",
        "-At",
        "-U",
        "mkw",
        "-d",
        "mkw",
        "-c",
        "SELECT value FROM local_rehearsal_probe WHERE id=1;",
      ]);
      assert.equal(probe, owner.taskId);
    } catch (error) {
      restoreFailure = {
        error,
        primary: primaryFailure ?? {
          code:
            error.code === "REHEARSAL_POSTGRES_READINESS"
              ? error.code
              : "REHEARSAL_ASSERTION",
          exitCode: null,
          signal: null,
        },
      };
    } finally {
      try {
        const info = JSON.parse(await docker("inspect", restored))[0];
        assert.equal(info.Config.Labels["com.mkw.task"], owner.taskId);
        await docker("rm", "-f", "-v", restored);
      } catch (cleanupError) {
        cleanupFailure = cleanupError;
        if (restoreFailure) secondaryErrors.push("REHEARSAL_CLEANUP");
      } finally {
        if (restoreFailure) primaryFailure = restoreFailure.primary;
      }
    }
    if (restoreFailure) throw restoreFailure.error;
    if (cleanupFailure) throw cleanupFailure;
    const bytes = await readFile(`/local-only/backup-${n}.enc`),
      now = Date.now();
    const metadata = {
      schemaVersion: "1",
      kind: "BACKUP",
      backupId: `mkw-${1000 + n}-1-release`,
      releaseSha: record.sha,
      createdAt: new Date(Math.floor(now / 1000) * 1000).toISOString(),
      restoreVerified: true,
      retentionUntil: new Date(now + 86400000).toISOString(),
      dumpSha256: hash(bytes),
      size: bytes.length,
      storageLocation: `owned-engine:backup-${n}.enc`,
      databaseIdentity: {
        host: "local-only",
        name: "mkw",
        engine: "postgresql",
        targetIdentity: baseEnv().MKW_BACKUP_EXPECTED_TARGET_IDENTITY,
      },
    };
    await save(`${evidence}/backup-${n}.json`, metadata);
    succeeded = true;
    return metadata;
  } finally {
    // Preserve a throwing backup's stage, restore its caller only on success.
    if (succeeded) {
      phase = context.phase;
      stepId = context.stepId;
      currentCase = context.currentCase;
    }
  }
}
async function stage(record, metadata, { composeText, rollback } = {}) {
  enter("deploy", "release-assemble", currentCase);
  const id = record.operationId;
  const operation = `/local-only/inputs/${id}`;
  await mkdir(operation, { recursive: true });
  await save(`${operation}/backup-ready.json`, metadata);
  await writeFile(
    `${operation}/backup-ready.sha256`,
    `${hash(await readFile(`${operation}/backup-ready.json`))}  backup-ready.json\n`,
  );
  if (rollback) {
    await save(`${operation}/rollback-backup-resolved.json`, rollback);
    const canonical = {
      artifactId: record.id,
      runId: record.runId,
      runAttempt: "1",
      artifactDigest: record.digest,
      manifest: record.manifest,
      metadata: JSON.parse(
        await readFile(`${record.directory}/build-metadata.json`, "utf8"),
      ),
    };
    await save(`${operation}/rollback-release-resolved.json`, canonical);
    await save(`${operation}/rollback-operation.json`, {
      releaseSha: record.sha,
      releaseRunId: record.runId,
      releaseRunAttempt: "1",
      releaseArtifactId: record.id,
      releaseArtifactDigest: record.digest,
    });
  }
  let artifact = record.directory,
    releaseSource = root;
  if (composeText) {
    artifact = `/local-only/artifacts/${id}`;
    await cp(record.directory, artifact, { recursive: true });
    await writeFile(`${artifact}/deploy/compose.production.yml`, composeText);
    await writeBundleInventory(artifact);
    // Fixture owner regenerates fixture artifact checksums for config-negative probes.
    await makeRehearsalArtifact(
      { ...record, directory: artifact },
      { refreshOnly: true },
    );
    releaseSource = `/local-only/source-${id}`;
    await mkdir(`${releaseSource}/deploy`, { recursive: true });
    await writeFile(
      `${releaseSource}/deploy/compose.production.yml`,
      composeText,
    );
    await mkdir(`${releaseSource}/scripts/product`, { recursive: true });
    await cp(
      `${root}/scripts/product/manage-production-account.sh`,
      `${releaseSource}/scripts/product/manage-production-account.sh`,
    );
  }
  const bundle = await assembleDeploymentBundle({
    releaseArtifact: artifact,
    releaseSource,
    controlSource: root,
    operationDirectory: operation,
    outputDirectory: `/local-only/bundles/${id}`,
    legacy: false,
    ...(rollback
      ? {
          rollbackResolvedRelease: `${operation}/rollback-release-resolved.json`,
        }
      : {}),
  });
  const staging = `${target}/staging/${id}-${randomUUID()}`;
  await mkdir(staging, { recursive: true, mode: 0o700 });
  enter("deploy", "release-extract", currentCase);
  await run("bash", [
    "scripts/product/release/extract-release-bundle.sh",
    bundle.archivePath,
    staging,
  ]);
  return staging;
}
async function deploy(record, staging, extra = {}, prefix = []) {
  enter("deploy", "entrypoint-unknown", currentCase);
  const diagnosticNonce = randomUUID();
  // Trusted current controls bootstrap executes from the extracted verified tree.
  const controls = `${staging}/controls`;
  return command(
    "bash",
    [
      ...prefix,
      `${controls}/scripts/product/deploy-entrypoint.sh`,
      "--release",
      "--manifest",
      `${staging}/release/release-manifest.json`,
      "--compose",
      `${staging}/release/deploy/compose.production.yml`,
      "--backup-ready",
      `${staging}/operation/backup-ready.json`,
      "--staging",
      staging,
    ],
    {
      cwd: controls,
      diagnosticNonce,
      env: envFor(record, {
        MKW_CONTROL_ROOT: controls,
        ...extra,
        MKW_REHEARSAL_DIAGNOSTIC_NONCE: diagnosticNonce,
      }),
    },
  );
}
async function verify(record) {
  enter("recovery", "release-verify", currentCase);
  const controls = `${target}/controls/${snapshot.sourceSha256}`;
  return command(
    "bash",
    [`${controls}/scripts/product/post-deploy-verify.sh`],
    { env: envFor(record, { MKW_CONTROL_ROOT: controls }) },
  );
}
async function build(label) {
  const sha =
    label === "A"
      ? snapshot.sourceSha256
      : hash(`${snapshot.sourceSha256}:fixture-${label}`);
  const images = {};
  for (const service of ["api", "web"]) {
    enter("build", `build-${service}-${label.toLowerCase()}`);
    const tag = `ghcr.io/mkw-local/mkw-${service}:${sha}`;
    await save(`${evidence}/build-request-${label}-${service}.json`, {
      owner,
      tag,
      sourceSha256: snapshot.sourceSha256,
      sourceTarSha256: snapshot.archiveSha256,
      fixtureVariant: label,
    });
    const built = await command("docker", [
      "build",
      "-f",
      `deploy/Dockerfile.${service}`,
      "--label",
      `org.opencontainers.image.revision=${snapshot.sourceSha256}`,
      "--label",
      `com.mkw.task=${owner.taskId}`,
      "--label",
      `com.mkw.rehearsal.variant=${label}`,
      "-t",
      tag,
      ".",
    ]);
    await writeFile(
      `${evidence}/build-${label}-${service}.log`,
      `${built.stdout}${built.stderr}`,
    );
    assert.equal(built.status, 0, `image build ${service}`);
    await docker("push", tag);
    const image = JSON.parse(await docker("image", "inspect", tag))[0];
    images[service] = image.RepoDigests.find((p) =>
      p.startsWith(`ghcr.io/mkw-local/mkw-${service}@`),
    );
    assert.ok(images[service]);
    await save(`${evidence}/image-${label}-${service}.json`, {
      id: image.Id,
      digest: images[service],
      sourceSha256: snapshot.sourceSha256,
      labels: image.Config.Labels,
    });
  }
  return makeRehearsalArtifact({
    sha,
    images,
    postgresImage: pg,
    source: root,
    evidence,
    sequence: label === "A" ? 100 : 200,
  });
}
async function main() {
  if (
    process.platform !== "linux" ||
    process.cwd() !== root ||
    process.env.DOCKER_HOST ||
    process.env.DOCKER_CONTEXT
  )
    throw new Error("ownership");
  owner = JSON.parse(await readFile("/mkw-local-owned.json", "utf8"));
  assert.equal(owner.owner, "MKW-DEPLOY-ACCOUNT-001");
  assert.match(
    owner.taskId,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(owner.name, `mkw-deploy-account-${owner.taskId}`);
  assert.match(owner.id, /^[a-f0-9]{64}$/);
  assert.equal(hostname(), owner.name);
  // No evidence or resource mutation until the actual daemon has matched marker/hostname.
  const probe = await new Promise((done) => {
    const child = spawn("docker", ["info", "--format", "{{.Name}}"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (b) => {
      output += b;
    });
    child.on("error", () => done(""));
    child.on("close", () => done(output.trim()));
  });
  assert.equal(probe, owner.name);
  await mkdir(evidence, { mode: 0o700 });
  await save(`${evidence}/check-report.json`, publicReport("Not run"));
  enter("snapshot", "source-snapshot");
  snapshot = JSON.parse(await readFile("/source-snapshot.json", "utf8"));
  await save(`${evidence}/scope.json`, {
    owner,
    sourceSha256: snapshot.sourceSha256,
    base: snapshot.base,
    localOnly: true,
    canonicalProvenance: "fixture only; no live GitHub/GHCR/SSH/VPS proof",
  });
  await scenario("exact_snapshot_and_empty_daemon", async () => {
    // Shared v2 admission checks actual archive members and extracted type/mode/bytes.
    snapshot = await verifySourceSnapshot("/", { sourceRoot: root });
    assert.equal(await docker("ps", "-aq"), "");
    assert.equal(await docker("volume", "ls", "-q"), "");
    assert.match(process.version, /^v24\./);
    const dockerVersion = await docker(
      "version",
      "--format",
      "{{.Server.Version}}",
    );
    const composeVersion = await docker("compose", "version", "--short");
    runtime.docker = publicRuntimeVersion(dockerVersion);
    runtime.compose = publicRuntimeVersion(composeVersion);
    await save(`${evidence}/versions.json`, {
      node: process.version,
      docker: dockerVersion,
      compose: composeVersion,
      sourceFiles: snapshot.files.length,
    });
  });
  enter("registry", "registry-setup");
  await save(`${evidence}/check-report.json`, publicReport("Not run"));
  await mkdir("/local-only/registry", { recursive: true, mode: 0o700 });
  await mkdir("/local-only/bundles", { recursive: true });
  await installRehearsalAudit();
  await run("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-newkey",
    "rsa:2048",
    "-days",
    "1",
    "-subj",
    "/CN=ghcr.io",
    "-addext",
    "subjectAltName=DNS:ghcr.io",
    "-keyout",
    "/local-only/registry/key.pem",
    "-out",
    "/local-only/registry/cert.pem",
  ]);
  await mkdir("/etc/docker/certs.d/ghcr.io", { recursive: true });
  await cp(
    "/local-only/registry/cert.pem",
    "/etc/docker/certs.d/ghcr.io/ca.crt",
  );
  await appendFile("/etc/hosts", "\n127.0.0.1 ghcr.io\n");
  const registryImage =
    "registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373";
  await docker("pull", registryImage);
  const registry = JSON.parse(
    await docker("image", "inspect", registryImage),
  )[0];
  await acquire("registry", "task9-registry", registry.RepoDigests[0], [
    "-p",
    "127.0.0.1:443:5000",
    "-v",
    "/local-only/registry:/certs:ro",
    "-e",
    "REGISTRY_HTTP_TLS_CERTIFICATE=/certs/cert.pem",
    "-e",
    "REGISTRY_HTTP_TLS_KEY=/certs/key.pem",
  ]);
  enter("setup", "postgres-setup");
  pg = (await readFile("deploy/postgres-image.env", "utf8"))
    .match(/^MKW_POSTGRES_IMAGE=(.+)$/m)[1]
    .trim();
  await save(`${evidence}/postgres-request.json`, { owner, digest: pg });
  await docker("pull", pg);
  await runRealRestoreReadinessScenario({
    scenario,
    acquire,
    docker,
    command,
    pg,
    waitForPostgres: (id) => waitForRehearsalPostgres(command, id),
  });
  const a = await build("A");
  currentRelease = a;
  await scenario("bootstrap_owned_database", async () => {
    const bootstrap = await command(
      "bash",
      ["scripts/product/deploy-entrypoint.sh", "--bootstrap"],
      { env: { ...baseEnv(), MKW_OPERATION_ID: `bootstrap-${owner.taskId}` } },
    );
    assert.equal(bootstrap.status, 0);
    await writeFile("/local-only/backup-key", randomBytes(32).toString("hex"), {
      mode: 0o600,
    });
    // Only initial DB preparation is outside release lifecycle, before any app exists.
    // App/release/shared backup publication below always uses the real entrypoint.
    const initial = (
      await readFile("deploy/compose.production.yml", "utf8")
    ).replaceAll("./shared/", `${target}/shared/`);
    await writeFile("/local-only/initial.yml", initial);
    await run(
      "docker",
      [
        "compose",
        "-p",
        "mkw",
        "-f",
        "/local-only/initial.yml",
        "up",
        "-d",
        "--wait",
        "--no-deps",
        "db",
      ],
      { env: envFor(a) },
    );
    // dbId needs canonical current config; seed/probe uses initial Compose selection directly.
    await cp("/local-only/initial.yml", composePath);
    await run(
      "docker",
      [
        "compose",
        "-p",
        "mkw",
        "-f",
        composePath,
        "run",
        "--rm",
        "--no-deps",
        "api",
        "node",
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
      ],
      { env: envFor(a) },
    );
    await sql(
      `CREATE TABLE local_rehearsal_probe(id integer PRIMARY KEY,value text NOT NULL); INSERT INTO local_rehearsal_probe VALUES(1,'${owner.taskId}');`,
    );
  });
  await scenario("artifact_archive_staging_deploy_verify", async () => {
    const staged = await stage(a, await backup(a));
    assert.equal((await deploy(a, staged)).status, 0);
    assert.equal((await verify(a)).status, 0);
    await save(`${evidence}/release-A.json`, {
      sha: a.sha,
      operationId: a.operationId,
      manifest: a.manifest,
    });
  });
  await scenario("compiled_esm_native_user_node_readonly", async () => {
    const image = JSON.parse(
      await docker("image", "inspect", a.manifest.apiImage),
    )[0];
    assert.equal(image.Config.User, "node");
    const runtime = await command("docker", [
      "run",
      "--rm",
      "-i",
      "--read-only",
      "--network=none",
      "--cap-drop=ALL",
      "-w",
      "/app",
      a.manifest.apiImage,
      "node",
      "--input-type=module",
      "-e",
      'import {access,writeFile} from "node:fs/promises";import * as argon2 from "argon2";await import("./dist/modules/auth/index.js");await import("./dist/infrastructure/db/database.js");await access("dist/ops/account-cli.js");if(process.getuid()!==1000)process.exit(1);try{await writeFile("/app/task9-write","x");process.exit(1)}catch(e){if(!["EROFS","EACCES"].includes(e.code))throw e}const h=await argon2.hash("fixture-native-only");if(!await argon2.verify(h,"fixture-native-only"))process.exit(1);console.log("native-esm-readonly-ok")',
    ]);
    assert.equal(runtime.status, 0);
    assert.equal(runtime.stdout.trim(), "native-esm-readonly-ok");
  });
  const f = {
    scenario,
    sql,
    target,
    root,
    evidence,
    snapshot,
    owner,
    command,
    run,
    docker,
    compose,
    dbId,
    apiId,
    envFor,
    stage,
    releaseInvariant,
    deploy,
    verify,
    backup,
    build,
    get currentRelease() {
      return currentRelease;
    },
    set currentRelease(value) {
      currentRelease = value;
    },
    cli: async (input) =>
      command(
        "docker",
        [
          "exec",
          "-i",
          "-w",
          "/app",
          await apiId(),
          "node",
          "dist/ops/account-cli.js",
        ],
        { input },
      ),
    shell: async (operation, input, env = {}) =>
      command(
        "bash",
        [
          `${target}/releases/${currentRelease.sha}/scripts/product/manage-production-account.sh`,
          operation,
        ],
        { input, env: { ...baseEnv(), ...env } },
      ),
    nativeVerify: async (passwordHash, yes, no) =>
      JSON.parse(
        await run(
          "docker",
          [
            "exec",
            "-i",
            "-w",
            "/app",
            await apiId(),
            "node",
            "--input-type=module",
            "-e",
            'import {verifyPassword} from "./dist/modules/auth/password.js";let text="";for await(const b of process.stdin)text+=b;const {hash,yes,no}=JSON.parse(text);console.log(JSON.stringify({argon2id:hash.startsWith("$argon2id$"),valid:await verifyPassword(hash,yes),invalid:await verifyPassword(hash,no)}));',
          ],
          { input: JSON.stringify({ hash: passwordHash, yes, no }) },
        ),
      ),
    login: async (username, password) => {
      const response = await fetch("http://127.0.0.1:32784/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://local.invalid",
        },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      return cookie;
    },
    session: async (cookie) =>
      (
        await fetch("http://127.0.0.1:32784/api/v1/auth/session", {
          headers: { cookie },
        })
      ).status,
    scanProcesses: async (secrets, observe = true) => {
      let seen = !observe;
      for (let i = 0; i < (observe ? 30 : 1); i++) {
        const text = await docker("top", await apiId(), "-eo", "pid,args");
        for (const secret of secrets)
          assert.equal(text.includes(secret), false);
        if (text.includes("dist/ops/account-cli.js")) {
          seen = true;
          break;
        }
        await pause(20);
      }
      assert.equal(seen, true);
      const info = JSON.parse(await docker("inspect", await apiId()))[0];
      for (const secret of secrets)
        assert.equal(JSON.stringify(info.Config.Env).includes(secret), false);
    },
    scanEvidence: async (secrets) => {
      async function walk(path) {
        for (const item of await readdir(path, { withFileTypes: true })) {
          const file = `${path}/${item.name}`;
          if (item.isDirectory()) await walk(file);
          else {
            const text = await readFile(file, "utf8");
            for (const secret of secrets)
              assert.equal(text.includes(secret), false);
            assert.doesNotMatch(text, /\$argon2id\$v=|postgresql:\/\/mkw:/);
          }
        }
      }
      await walk(evidence);
    },
  };
  // Test-owned boundary adapters are defined at the fixture owner.
  const { accountFaults } =
    await import("../../tests/product-tooling/fixtures/deploy-account.mjs");
  f.accountFault = (fault, input) => accountFaults(f, fault, input);
  await runRealAccountScenarios(f);
  await runRealReleaseScenarios(f, a);
  enter("complete", "complete");
  primaryFailure = undefined;
  await save(`${evidence}/check-report.json`, publicReport("Passed", "OK"));
  await save(`${evidence}/result.json`, {
    result: "passed",
    assertions,
    assertionCountUnit: "completed scenario groups",
    scenarios: scenarios.map((s) => s.id),
    sourceSha256: snapshot.sourceSha256,
    actualBuilds: true,
    actualPostgres: true,
    liveGitHubGhcrSshVps: "Not run",
  });
  console.log(`LOCAL_REHEARSAL_ASSERTIONS_OK count=${assertions}`);
}

main().catch(async (error) => {
  // Never serialize an assertion's actual/expected or a raw dependency error.
  if (owner) {
    const report = publicReport(
      "Failed",
      error.code === "REHEARSAL_POSTGRES_READINESS"
        ? error.code
        : "REHEARSAL_ASSERTION",
    );
    await save(`${evidence}/check-report.json`, report).catch(() => {});
    console.error(safeReportSummary(report));
    await save(`${evidence}/result.json`, {
      result: "Failed",
      failedScenario: currentCase,
      assertions,
      assertionCountUnit: "completed scenario groups",
      commands: commands.length,
    }).catch(() => {});
  }
  console.error(
    !owner
      ? "owned Linux engine required"
      : `REHEARSAL_FAILED scenario=${currentCase} command=${commands.length}`,
  );
  process.exitCode = 1;
});
