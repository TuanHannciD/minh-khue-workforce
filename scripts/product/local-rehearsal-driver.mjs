// Test driver for the explicit local-only entry. Never run against a host daemon.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  appendFile,
  rm,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { hostname } from "node:os";
import {
  apiSourceFingerprint,
  buildPolicy,
  bindPolicy,
  same,
} from "./release/gateway-policy.mjs";
import { selectApiReuse } from "./release/select-api-reuse.mjs";
import { prepareAutomaticRollback } from "./release/prepare-auto-rollback.mjs";

const root = "/workspace",
  target = "/home/deploy/mkw",
  evidence = "/local-evidence";
assert.equal(process.platform, "linux");
assert.equal(process.cwd(), root);
assert.equal(await readFile("/mkw-local-owned", "utf8"), "8849e8d4");
await mkdir(evidence, { recursive: true });
const commandLog = `${evidence}/commands.log`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  // Commands deliberately contain no real credential or personnel input.
  return result;
}
function run(bin, args, options = {}) {
  const result = command(bin, args, options);
  if (result.status !== 0)
    throw new Error(
      `${bin} ${args[0]} failed (${result.status}): ${String(result.stderr).slice(-4000)}`,
    );
  return result.stdout;
}
const docker = (...args) => run("docker", args).toString().trim();
assert.equal(docker("info", "--format", "{{.Name}}"), hostname());
run("find", [
  `${root}/scripts`,
  "-type",
  "f",
  "-name",
  "*.sh",
  "-exec",
  "sed",
  "-i",
  "s/\\r$//",
  "{}",
  "+",
]);
// Remove only resources owned by this rehearsal. The database container is
// created by Compose and therefore carries Compose labels rather than the
// task label; remove its exact project names before removing its volume.
for (const filter of [
  ["label", "com.mkw.owner=push-main-completion"],
  ["label", "com.docker.compose.project=mkw"],
  ["name", "^mkw-db-1$"],
  ["name", "^mkw-cd-registry$"],
  ["name", "^mkw-cd-restore-"],
]) {
  for (const id of docker("ps", "-aq", "--filter", `${filter[0]}=${filter[1]}`)
    .split(/\s+/)
    .filter(Boolean)) {
    if (command("docker", ["inspect", id]).status === 0)
      docker("rm", "-f", "-v", id);
  }
}
for (const volume of ["mkw_pgdata", "mkw_cd_local_pg"])
  if (command("docker", ["volume", "inspect", volume]).status === 0)
    docker("volume", "rm", volume);
await rm(target, { recursive: true, force: true });
await rm("/workspace/.git", { recursive: true, force: true });
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = async (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const git = (...args) => run("git", args).toString().trim();
const pg = (await readFile("deploy/postgres-image.env", "utf8"))
  .match(/^MKW_POSTGRES_IMAGE=(.+)$/m)[1]
  .trim();
const environment = {
  ...process.env,
  MKW_DEPLOY_PATH: target,
  MKW_PROJECT_NAME: "mkw",
  MKW_GATEWAY_PORT: "32784",
  MKW_ATTESTATION_MODE: "required",
  MKW_ATTESTATION_STATUS: "verified",
  MKW_REGISTRY_VISIBILITY: "public",
  MKW_BACKUP_MAX_AGE_SECONDS: "86400",
  MKW_BACKUP_EXPECTED_KIND: "BACKUP",
  MKW_BACKUP_EXPECTED_HOST: "local-only",
  MKW_BACKUP_EXPECTED_DATABASE: "mkw",
  MKW_BACKUP_EXPECTED_TARGET_IDENTITY: `local-only/${target}/mkw`,
  MKW_AUTOMATIC_RELEASE: "true",
};
await save(`${evidence}/scope.json`, {
  localOnly: true,
  engine: hostname(),
  externalBoundary:
    "SIMULATED GitHub artifact ownership and manifest signing; not live GitHub/GHCR/VPS proof",
  registry:
    "Real TLS local registry: ghcr.io resolves only inside owned engine",
  backup:
    "real encrypted pg_dump, decrypt, pg_restore and independent marker/migration checks",
  base: "47db61f6867e14be7256b2a22ea52174fa787849",
});

// A dedicated registry is reached only through this engine's loopback/TLS trust.
await mkdir("/local-only/registry", { recursive: true });
run("openssl", [
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
await cp("/local-only/registry/cert.pem", "/etc/docker/certs.d/ghcr.io/ca.crt");
await appendFile("/etc/hosts", "\n127.0.0.1 ghcr.io\n");
docker("pull", "registry:2");
docker(
  "run",
  "-d",
  "--name",
  "mkw-cd-registry",
  "--label",
  "com.mkw.owner=push-main-completion",
  "-p",
  "127.0.0.1:443:5000",
  "-v",
  "/local-only/registry:/certs:ro",
  "-e",
  "REGISTRY_HTTP_TLS_CERTIFICATE=/certs/cert.pem",
  "-e",
  "REGISTRY_HTTP_TLS_KEY=/certs/key.pem",
  "registry:2",
);
docker("pull", pg);
git("init");
git("config", "user.name", "MKW Local Rehearsal");
git("config", "user.email", "local@example.invalid");
git("add", ".");
git("commit", "-m", "local rehearsal A");
const records = new Map();
let sequence = 100,
  backupSequence = 0,
  recoverySequence = 0;
const apiBoundary = {
  artifact: async (id) => {
    const r = records.get(String(id));
    assert.ok(r);
    return {
      id: r.id,
      workflow_run: { id: r.runId },
      expired: false,
      created_at: "2026-11-12T10:00:30Z",
      name: `mkw-release-${r.sha}`,
      digest: r.digest,
    };
  },
  run: async (runId, attempt) => {
    const r = [...records.values()].find((v) => v.runId === String(runId));
    assert.ok(r);
    return {
      id: r.runId,
      run_attempt: attempt ?? r.latestAttempt ?? "1",
      run_started_at: "2026-11-12T10:00:00Z",
      updated_at: "2026-11-12T10:59:59Z",
      repository: { full_name: "mkw-local/rehearsal" },
      head_repository: { full_name: "mkw-local/rehearsal" },
      path: ".github/workflows/main-release.yml",
      event: "push",
      head_branch: "main",
      head_sha: r.sha,
      status: r.completed ? "completed" : "in_progress",
      conclusion: r.completed ? "success" : null,
      referenced_workflows: [
        {
          path: "mkw-local/rehearsal/.github/workflows/build-release.yml@refs/heads/main",
          ref: "refs/heads/main",
          sha: r.sha,
        },
      ],
    };
  },
  runJobs: async (runId, attempt) => {
    const r = [...records.values()].find((v) => v.runId === String(runId));
    return [
      {
        name: "build / release",
        run_id: runId,
        run_attempt: attempt,
        head_sha: r.sha,
        status: "completed",
        conclusion: "success",
      },
    ];
  },
  jsonFromArtifact: async (id, entry) =>
    json(`${records.get(String(id)).dir}/${entry}`),
};
function composeArgs(file, ...args) {
  return ["compose", "-p", "mkw", "-f", file, ...args];
}
const currentCompose = `${target}/current/compose.rendered.yml`;
const dbId = () => docker(...composeArgs(currentCompose, "ps", "-q", "db"));
const sql = (id, text) =>
  run(
    "docker",
    [
      "exec",
      "-i",
      id,
      "sh",
      "-ceu",
      'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { input: text },
  )
    .toString()
    .trim();
async function captureServices(record) {
  return JSON.parse(
    run(
      "bash",
      [`${root}/scripts/product/release/runtime-evidence.sh`, currentCompose],
      {
        env: {
          ...environment,
          MKW_API_IMAGE: record.manifest.apiImage,
          MKW_WEB_IMAGE: record.manifest.webImage,
          MKW_POSTGRES_IMAGE: pg,
        },
      },
    ).toString(),
  );
}
async function buildRelease(label, previous = null) {
  const sha = git("rev-parse", "HEAD"),
    runId = String(++sequence),
    id = String(++sequence),
    dir = `${evidence}/artifacts/${sha}`;
  await mkdir(dir, { recursive: true });
  const selection = await selectApiReuse(
    {
      previous,
      sha,
      repository: "mkw-local/rehearsal",
      postgresImage: pg,
      attestationMode: "required",
      fingerprintAt: (ref) => apiSourceFingerprint(root, ref),
      verifyAttestation: async () => true,
      inspectApi: async (image) => {
        docker("pull", image);
        const [info] = JSON.parse(docker("image", "inspect", image));
        return {
          image: info.RepoDigests.includes(image) ? image : "unknown",
          revision: info.Config.Labels["org.opencontainers.image.revision"],
          source: info.Config.Labels["org.opencontainers.image.source"],
        };
      },
    },
    apiBoundary,
  );
  let apiImage = selection.apiImage;
  for (const service of selection.mode === "build" ? ["api", "web"] : ["web"]) {
    const tag = `ghcr.io/mkw-local/mkw-${service}:${sha}`;
    console.log(`Building real ${service} image for ${label}`);
    const result = command("docker", [
      "build",
      "-f",
      `deploy/Dockerfile.${service}`,
      "--label",
      `org.opencontainers.image.revision=${sha}`,
      "--label",
      "org.opencontainers.image.source=https://github.com/mkw-local/rehearsal",
      "-t",
      tag,
      ".",
    ]);
    await writeFile(
      `${evidence}/build-${label}-${service}.log`,
      Buffer.concat([result.stdout, result.stderr]),
    );
    assert.equal(
      result.status,
      0,
      `real ${service} build failed; see retained build log`,
    );
    const pushed = command("docker", ["push", tag]);
    await writeFile(
      `${evidence}/push-${label}-${service}.log`,
      Buffer.concat([pushed.stdout, pushed.stderr]),
    );
    assert.equal(
      pushed.status,
      0,
      `local registry push failed: ${pushed.stderr}`,
    );
    const [info] = JSON.parse(docker("image", "inspect", tag));
    const image = info.RepoDigests.find((v) =>
      v.startsWith(`ghcr.io/mkw-local/mkw-${service}@`),
    );
    assert.ok(image);
    if (service === "api") apiImage = image;
  }
  const [webInfo] = JSON.parse(
    docker("image", "inspect", `ghcr.io/mkw-local/mkw-web:${sha}`),
  );
  const webImage = webInfo.RepoDigests.find((v) =>
    v.startsWith("ghcr.io/mkw-local/mkw-web@"),
  );
  const descriptor = {
    sha256: hash("local external metadata boundary"),
    size: 32,
  };
  let manifest = {
    schemaVersion: "1",
    releaseSha: sha,
    sourceRepository: "mkw-local/rehearsal",
    createdAt: new Date().toISOString(),
    apiImage,
    webImage,
    postgresImage: pg,
    buildInputs: {
      apiSourceFingerprint: selection.apiSourceFingerprint,
      apiSourceSha: selection.apiSourceSha,
    },
    artifacts: { sbom: descriptor, provenance: descriptor },
  };
  const operationId = `${runId}-1-${sha}`;
  const policy =
    selection.mode === "gateway-only"
      ? buildPolicy({
          manifest,
          operationId,
          previous,
          apiSourceFingerprint: selection.apiSourceFingerprint,
          apiSourceSha: selection.apiSourceSha,
        })
      : {
          kind: "unknown",
          releaseSha: sha,
          businessDataWrites: "not-assessed",
        };
  if (selection.mode === "gateway-only")
    manifest = bindPolicy(manifest, policy);
  await save(`${dir}/release-manifest.json`, manifest);
  await save(`${dir}/build-metadata.json`, {
    sourceSha: sha,
    producerRunId: runId,
    producerRunAttempt: "1",
    apiDigest: apiImage.split("@")[1],
    webDigest: webImage.split("@")[1],
  });
  await save(`${dir}/data-operation-evidence.json`, policy);
  const record = {
    sha,
    runId,
    id,
    dir,
    manifest,
    policy,
    operationId,
    digest: `sha256:${hash(JSON.stringify(manifest))}`,
    completed: false,
    mode: selection.mode,
  };
  records.set(id, record);
  const releaseRoot = `${target}/releases/${sha}`;
  await mkdir(releaseRoot, { recursive: true });
  await cp(`${root}/scripts/product`, `${releaseRoot}/scripts/product`, {
    recursive: true,
  });
  await cp(`${root}/deploy`, `${releaseRoot}/deploy`, { recursive: true });
  await cp(dir, `${releaseRoot}/release-artifact`, { recursive: true });
  // The Windows checkout is bundled with CRLF. Normalize the copied release
  // scripts too; the production entrypoint executes these files directly.
  run("find", [
    `${releaseRoot}/scripts/product`,
    "-type",
    "f",
    "-name",
    "*.sh",
    "-exec",
    "sed",
    "-i",
    "s/\\r$//",
    "{}",
    "+",
  ]);
  Object.assign(process.env, envFor(record));
  return record;
}
function envFor(r) {
  return {
    ...environment,
    MKW_RELEASE_SHA: r.sha,
    RELEASE_SHA: r.sha,
    MKW_OPERATION_ID: r.operationId,
    MKW_API_IMAGE: r.manifest.apiImage,
    MKW_WEB_IMAGE: r.manifest.webImage,
    MKW_POSTGRES_IMAGE: pg,
    MKW_RELEASE_RUN_ID: r.runId,
    MKW_RELEASE_RUN_ATTEMPT: "1",
    MKW_RELEASE_ARTIFACT_ID: r.id,
    MKW_RELEASE_ARTIFACT_DIGEST: r.digest,
    MKW_CONTROL_SHA: r.sha,
    EXPECTED_API_IMAGE: r.manifest.apiImage,
    EXPECTED_WEB_IMAGE: r.manifest.webImage,
    EXPECTED_POSTGRES_IMAGE: pg,
    MKW_SOURCE_REPOSITORY: "mkw-local/rehearsal",
  };
}
async function deploy(r, expected = 0) {
  const releaseRoot = `${target}/releases/${r.sha}`;
  const result = command(
    "bash",
    [
      `${releaseRoot}/scripts/product/deploy-entrypoint.sh`,
      "--release",
      "--manifest",
      `${releaseRoot}/release-artifact/release-manifest.json`,
      "--compose",
      `${releaseRoot}/deploy/compose.production.yml`,
      "--backup-ready",
      `${target}/shared/backup-ready.json`,
    ],
    { env: envFor(r), cwd: releaseRoot },
  );
  await writeFile(
    `${evidence}/deploy-${r.runId}.log`,
    Buffer.concat([result.stdout, result.stderr]),
  );
  if (expected === 0)
    assert.equal(result.status, 0, `deploy failed: ${result.stderr}`);
  else
    assert.notEqual(result.status, 0, "unhealthy release unexpectedly passed");
  await cp(
    `${target}/shared/current-state.json`,
    `${evidence}/deploy-state-${r.runId}.json`,
  );
}
async function verify(r) {
  const result = command(
    "bash",
    [`${root}/scripts/product/post-deploy-verify.sh`],
    { env: envFor(r) },
  );
  await writeFile(
    `${evidence}/verify-${r.runId}.log`,
    Buffer.concat([result.stdout, result.stderr]),
  );
  assert.equal(
    result.status,
    0,
    `runtime verification failed: ${result.stderr}`,
  );
  r.completed = true;
  return json(`${target}/shared/current-state.json`);
}
async function backup(r) {
  const n = ++backupSequence,
    container = `mkw-cd-restore-${n}`,
    source = dbId();
  const dump = run("docker", [
    "exec",
    source,
    "sh",
    "-ceu",
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc',
  ]);
  const encrypted = run(
    "openssl",
    ["enc", "-aes-256-cbc", "-pbkdf2", "-pass", "file:/local-only/backup-key"],
    { input: dump },
  );
  const decrypted = run(
    "openssl",
    [
      "enc",
      "-d",
      "-aes-256-cbc",
      "-pbkdf2",
      "-pass",
      "file:/local-only/backup-key",
    ],
    { input: encrypted },
  );
  assert.equal(hash(decrypted), hash(dump));
  docker(
    "run",
    "-d",
    "--name",
    container,
    "--label",
    "com.mkw.owner=push-main-completion",
    "--env-file",
    `${target}/shared/db.env`,
    pg,
  );
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = command("docker", [
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "mkw",
        "-d",
        "mkw",
      ]);
      if (ready.status === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    run(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "-h",
        "127.0.0.1",
        "--exit-on-error",
        "--no-owner",
        "-U",
        "mkw",
        "-d",
        "mkw",
      ],
      { input: decrypted },
    );
    assert.equal(
      sql(container, "SELECT value FROM local_rehearsal_probe WHERE id = 1;"),
      "fixture-8849e8d4",
    );
    assert.equal(
      sql(
        container,
        "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;",
      ),
      sql(
        source,
        "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;",
      ),
    );
  } finally {
    docker("rm", "-f", "-v", container);
  }
  await writeFile(`${evidence}/backup-${n}.dump.enc`, encrypted);
  // Match the remote validator's whole-second UTC clock precision.
  const producedAt = Date.now();
  const now = new Date(Math.floor(producedAt / 1000) * 1000).toISOString();
  const metadata = {
    schemaVersion: "1",
    kind: "BACKUP",
    backupId: `mkw-local-${n}-release`,
    releaseSha: r.sha,
    createdAt: now,
    restoreVerified: true,
    retentionUntil: new Date(producedAt + 86400000).toISOString(),
    dumpSha256: hash(encrypted),
    size: encrypted.length,
    storageLocation: `local-owned-engine:backup-${n}.dump.enc`,
    databaseIdentity: {
      host: "local-only",
      name: "mkw",
      engine: "postgresql",
      targetIdentity: environment.MKW_BACKUP_EXPECTED_TARGET_IDENTITY,
    },
  };
  await save(`${target}/shared/backup-ready.json`, metadata);
  await save(`${evidence}/backup-${n}-verified.json`, metadata);
  return metadata;
}
async function recovery(r, expected) {
  const recoveryNumber = ++recoverySequence;
  const state = await json(`${target}/shared/current-state.json`);
  const decision = await prepareAutomaticRollback(
    {
      state,
      expectedOperationId: r.operationId,
      expectedSha: r.sha,
      expectedControlSha: r.sha,
      expectedOwnership: state.ownership,
      repository: "mkw-local/rehearsal",
    },
    apiBoundary,
  );
  await save(
    `${evidence}/prepare-${r.runId}-${recoveryNumber}-${expected}.json`,
    decision,
  );
  assert.equal(decision.action, "eligible");
  const before = await captureServices(r);
  const old = state.previousState;
  await mkdir(`${root}/recovery-input`, { recursive: true });
  await save(`${root}/recovery-input/release-manifest.json`, old.manifest);
  await cp(
    `${target}/shared/backup-ready.json`,
    `${root}/recovery-input/backup-ready.json`,
  );
  await writeFile(
    `${root}/recovery-input/current-release-proof.json`,
    decision.currentReleaseProof,
  );
  const result = command(
    "bash",
    [`${root}/scripts/product/release/auto-rollback.sh`],
    { env: envFor(r) },
  );
  await writeFile(
    `${evidence}/recovery-${r.runId}-${recoveryNumber}-${expected}.log`,
    Buffer.concat([result.stdout, result.stderr]),
  );
  const receipt = await json(`${target}/shared/auto-rollback-evidence.json`);
  await save(
    `${evidence}/recovery-${r.runId}-${recoveryNumber}-${expected}.json`,
    receipt,
  );
  assert.equal(receipt.result, expected);
  assert.equal(receipt.pipelineStatus, "failed");
  assert.equal(
    same(before, await captureServices(r)),
    true,
    "API/PG restarted or replaced",
  );
  if (expected === "recovered-by-app-rollback")
    assert.equal(result.status, 0, String(result.stderr));
  else assert.notEqual(result.status, 0);
  return receipt;
}

// Initial real API/migrations seed an isolated DB; all later deploys require BACKUP.
await mkdir(`${target}/shared`, { recursive: true });
await mkdir(`${target}/current`, { recursive: true });
const password = randomBytes(32).toString("hex");
await writeFile(
  `${target}/shared/db.env`,
  `POSTGRES_DB=mkw\nPOSTGRES_USER=mkw\nPOSTGRES_PASSWORD=${password}\n`,
  { mode: 0o600 },
);
await writeFile(
  `${target}/shared/api.env`,
  `DATABASE_URL=postgresql://mkw:${password}@db:5432/mkw\nAUTH_THROTTLE_SECRET=${randomBytes(32).toString("hex")}\nWEB_ORIGIN=https://local.invalid\nTLS_TERMINATED=true\n`,
  { mode: 0o600 },
);
await writeFile("/local-only/backup-key", randomBytes(32).toString("hex"), {
  mode: 0o600,
});
const a = await buildRelease("A");
const rendered = (
  await readFile("deploy/compose.production.yml", "utf8")
).replaceAll("./shared/", `${target}/shared/`);
await writeFile(currentCompose, rendered);
run("docker", composeArgs(currentCompose, "up", "-d", "--wait", "db"), {
  env: envFor(a),
});
run(
  "docker",
  composeArgs(
    currentCompose,
    "run",
    "--rm",
    "--no-deps",
    "api",
    "node",
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
  ),
  { env: envFor(a) },
);
sql(
  dbId(),
  "CREATE TABLE local_rehearsal_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO local_rehearsal_probe VALUES (1, 'fixture-8849e8d4');",
);
await backup(a);
await deploy(a);
const verifiedA = await verify(a);
await save(`${evidence}/A-verified.json`, verifiedA);
// Simulate only GitHub's external run metadata advancing after a no-op rerun.
// Artifact/state ownership remains bound to the successful producing attempt1.
a.latestAttempt = "2";
await mkdir("apps/web/public", { recursive: true });
await writeFile("apps/web/public/local-release.txt", "B\n");
git("add", ".");
git("commit", "-m", "local Web-only B");
const b = await buildRelease("B", verifiedA);
assert.equal(b.mode, "gateway-only");
await backup(b);
await deploy(b);
const verifiedB = await verify(b);
assert.equal(same(verifiedA.runtimeServices, verifiedB.runtimeServices), true);
await save(`${evidence}/B-verified.json`, verifiedB);
const stateBeforeManual = await readFile(
  `${target}/shared/current-state.json`,
  "utf8",
);
const lkgBeforeManual = await readFile(
  `${target}/shared/last-known-good.json`,
  "utf8",
);
const manual = command(
  "bash",
  [`${root}/scripts/product/post-deploy-verify.sh`],
  {
    env: {
      ...envFor(b),
      MKW_AUTOMATIC_RELEASE: "false",
      MKW_OPERATION_ID: "manual-runtime-recheck",
    },
  },
);
await writeFile(
  `${evidence}/manual-verify.log`,
  Buffer.concat([manual.stdout, manual.stderr]),
);
assert.equal(manual.status, 0, String(manual.stderr));
assert.equal(
  await readFile(`${target}/shared/current-state.json`, "utf8"),
  stateBeforeManual,
);
assert.equal(
  await readFile(`${target}/shared/last-known-good.json`, "utf8"),
  lkgBeforeManual,
);
assert.equal(
  run("node", [
    `${root}/scripts/product/release/read-current-state.mjs`,
    `${target}/shared/current-state.json`,
    b.sha,
  ])
    .toString()
    .trim(),
  "already-deployed",
);
await save(`${evidence}/manual-verify-preservation.json`, {
  currentStatePreserved: true,
  lastKnownGoodPreserved: true,
  nextPushPreflight: "already-deployed",
});
b.latestAttempt = "2";
const nginx = await readFile("deploy/nginx.conf", "utf8");
await writeFile(
  "deploy/nginx.conf",
  nginx.replace("try_files $uri $uri/ /index.html;", "return 503;"),
);
git("add", ".");
git("commit", "-m", "local unhealthy gateway C");
const c = await buildRelease("C-unhealthy", verifiedB);
assert.equal(c.mode, "gateway-only");
await backup(c);
await deploy(c, 1);
const failed = await json(`${target}/shared/current-state.json`);
assert.equal(failed.dataOperations, "gateway-only");
// Changed migration/history and unknown actual DB reads must refuse before apply.
sql(
  dbId(),
  "CREATE TABLE local_changed_migration (id integer); INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ('local-changed', 'local', 'local_changed', now(), now(), 1);",
);
await recovery(c, "incident-required");
assert.equal(
  sql(
    dbId(),
    "SELECT count(*) FROM _prisma_migrations WHERE id='local-changed';",
  ),
  "1",
);
sql(
  dbId(),
  "DROP TABLE local_changed_migration; DELETE FROM _prisma_migrations WHERE id='local-changed';",
);
sql(
  dbId(),
  "ALTER TABLE _prisma_migrations RENAME TO _local_hidden_migrations;",
);
await recovery(c, "incident-required");
sql(
  dbId(),
  "ALTER TABLE _local_hidden_migrations RENAME TO _prisma_migrations;",
);
await backup(c);
await recovery(c, "recovered-by-app-rollback");
const recovered = await json(`${target}/shared/current-state.json`);
assert.equal(recovered.releaseSha, b.sha);
assert.equal(same(recovered.runtimeServices, verifiedB.runtimeServices), true);
await save(`${evidence}/recovered-state.json`, recovered);
// Exercise a real API-changing build/deploy with a new forward migration.
await writeFile("deploy/nginx.conf", nginx);
await mkdir("apps/api/prisma/migrations/20990101000000_local_rehearsal", {
  recursive: true,
});
await writeFile(
  "apps/api/prisma/migrations/20990101000000_local_rehearsal/migration.sql",
  "CREATE TABLE local_api_release (id integer PRIMARY KEY);\n",
);
git("add", ".");
git("commit", "-m", "local API forward migration D");
const d = await buildRelease("D-api-change", recovered);
assert.equal(d.mode, "build");
await backup(d);
await deploy(d);
const verifiedD = await verify(d);
assert.equal(verifiedD.dataOperations, "unknown");
assert.notEqual(
  verifiedD.runtimeServices.api.containerId,
  verifiedB.runtimeServices.api.containerId,
);
assert.equal(
  verifiedD.runtimeServices.db.containerId,
  verifiedB.runtimeServices.db.containerId,
);
assert.equal(
  sql(
    dbId(),
    "SELECT count(*) FROM _prisma_migrations WHERE migration_name='20990101000000_local_rehearsal';",
  ),
  "1",
);
await save(`${evidence}/D-api-change-verified.json`, verifiedD);
await save(`${evidence}/result.json`, {
  result: "passed",
  actualContainers: true,
  actualBuilds: true,
  aToB: "healthy",
  unhealthyCToB: "recovered-by-app-rollback",
  changedMigration: "incident-required",
  unknownMigration: "incident-required",
  apiAndPgUnchangedDuringGateway: true,
  normalApiChangingDeploy: "verified",
  manualVerifyThenPushMain: "already-deployed; v2 state and LKG preserved",
  reusedProducingAttemptAfterRerun: "1; latest simulated GitHub attempt 2",
  encryptedBackupRestoreCount: backupSequence,
  originalFailureRetained: true,
  liveGithubSigningGhcrVps: "not-run",
});
await appendFile(
  commandLog,
  "Actual production entrypoint, verifier and recovery modules executed. Registry is local TLS; GitHub/signing external boundary simulated.\n",
);
// The host entry retains evidence then removes the entire exact owned engine.
console.log("LOCAL_REHEARSAL_OK");
