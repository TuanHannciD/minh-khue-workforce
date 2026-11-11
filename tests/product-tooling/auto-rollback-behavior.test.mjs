import test from "node:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  chmod,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fixture } from "./fixtures/auto-rollback.mjs";
import { rollbackApi } from "./fixtures/rollback-api.mjs";
import {
  beginOperation,
  promoteOperation,
} from "../../scripts/product/release/operation-state.mjs";
import { prepareAutomaticRollback } from "../../scripts/product/release/prepare-auto-rollback.mjs";
import { validateRecoveryBackupArtifact } from "../../scripts/product/release/validate-auto-backup.mjs";
import { decideOrchestrationOutcome } from "../../scripts/product/release/orchestration-policy.mjs";

const root = resolve(import.meta.dirname, "../..");
const bash =
  process.env.MKW_TEST_BASH ||
  (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const posix = (p) =>
  p
    .replaceAll("\\", "/")
    .replace(/^([a-z]):/i, (_, d) => "/" + d.toLowerCase());
const hash = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

test("only verified full operation state seeds last-known-good and drops nested history", () => {
  const f = fixture();
  f.state.attestation = f.attestation;
  const pending = beginOperation({
    manifest: f.state.manifest,
    previousState: f.state.previousState,
    operationId: f.expectedOperationId,
    ownership: f.state.ownership,
    attestation: f.attestation,
    backup: f.backup,
  });
  assert.equal(pending.applicationAttempted, false);
  assert.equal(pending.migrationOutcome, "unknown");
  assert.equal(pending.previousState.operationId, "old-op");
  const verified = promoteOperation(f.state, {
    operationId: f.expectedOperationId,
    releaseSha: f.expectedSha,
    database: f.state.after,
    verifiedAt: f.now,
  });
  assert.equal(verified.status, "verified");
  assert.equal(verified.previousState, undefined);
  assert.equal(verified.database.postgresContainerId, "c".repeat(64));
  assert.throws(
    () =>
      promoteOperation(f.state, {
        operationId: "interleaved",
        releaseSha: f.expectedSha,
        database: f.state.after,
      }),
    /mismatch/,
  );
});
function artifactApi(_, change = {}) {
  return rollbackApi(change);
}

test("previous build resolution requires retained exact artifact/run/attempt/archive digest", async () => {
  const f = fixture();
  assert.equal(
    (await prepareAutomaticRollback(f, artifactApi(f))).action,
    "eligible",
  );
  for (const change of [
    { artifact: { expired: true } },
    { artifact: { digest: hash("wrong") } },
    { run: { run_attempt: "2" } },
    { run: { conclusion: "failure" } },
    { manifest: { sourceRepository: "evil/repo" } },
  ])
    assert.equal(
      (await prepareAutomaticRollback(f, artifactApi(f, change))).action,
      "incident-required",
    );
});
test("fresh backup artifact cannot use another run, attempt, name or digest", async () => {
  const input = {
    runId: "81",
    runAttempt: "2",
    artifactId: "82",
    artifactDigest: hash("archive"),
    artifactName: "mkw-backup-81-2-app-rollback",
    sha: "a".repeat(40),
  };
  const api = {
    artifact: async () => ({
      id: "82",
      expired: false,
      name: input.artifactName,
      digest: input.artifactDigest,
      workflow_run: { id: "81" },
    }),
    run: async () => ({
      id: "81",
      run_attempt: "2",
      head_sha: input.sha,
      head_branch: "main",
      event: "push",
      path: ".github/workflows/main-release.yml",
    }),
  };
  await validateRecoveryBackupArtifact(input, api);
  for (const change of [
    { runId: "90" },
    { runAttempt: "3" },
    { artifactDigest: hash("wrong") },
    { artifactName: "mkw-backup-81-2" },
  ])
    await assert.rejects(
      validateRecoveryBackupArtifact({ ...input, ...change }, api),
    );
});

test("missing SSH receipt records unknown attempt count and never claims recovery", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-recovery-receipt-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts/product/release/finish-auto-rollback.mjs")],
    {
      cwd: dir,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        RUNNER_TEMP: dir,
        MKW_OPERATION_ID: fixture().expectedOperationId,
        RELEASE_SHA: "a".repeat(40),
        GITHUB_OUTPUT: join(dir, "outputs"),
        GITHUB_STEP_SUMMARY: join(dir, "summary"),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(
    await readFile(join(dir, "auto-rollback-evidence.json"), "utf8"),
  );
  assert.equal(receipt.result, "incident-required");
  assert.equal(receipt.attemptCount, "unknown");
});

async function remoteFixture(t, mode) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-app-recovery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ["shared", "current", "recovery-input", "bin"])
    await mkdir(join(dir, name));
  await cp(
    join(root, "scripts/product/release"),
    join(dir, "scripts/product/release"),
    { recursive: true },
  );
  await cp(join(root, "deploy"), join(dir, "deploy"), { recursive: true });
  const f = fixture();
  f.state.attestation = f.attestation;
  const snapshot = {
    ...f.state.before,
    schemaFingerprint: hash("CREATE TABLE fixture (id integer);\n"),
    migrationFingerprint: hash("[]\n"),
  };
  f.state.before = { ...snapshot };
  f.state.after = { ...snapshot };
  f.state.previousState.database = { ...snapshot };
  if (mode === "changed") f.state.after.schemaFingerprint = hash("changed");
  if (mode === "unknown") f.state.after = { known: false };
  if (mode === "migration-failed") f.state.migrationOutcome = "started";
  if (mode === "unknown-data") f.state.dataOperations = "unknown";
  if (mode === "side-effect-data")
    f.state.dataOperationEvidence.unverifiedSideEffects = true;
  if (mode === "missing-data-evidence") delete f.state.dataOperationEvidence;
  if (mode.startsWith("ownership-")) {
    const field = mode.slice("ownership-".length);
    f.state.ownership[field] =
      field === "controlSha"
        ? "d".repeat(40)
        : field === "artifactDigest"
          ? hash("forged")
          : "999";
  }
  if (mode === "missing-previous") f.state.previousState = null;
  if (mode === "interleaved") f.state.operationId = "other-op";
  await writeFile(
    join(dir, "shared/current-state.json"),
    JSON.stringify(f.state),
  );
  await writeFile(
    join(dir, "recovery-input/release-manifest.json"),
    JSON.stringify(f.trustedManifest),
  );
  if (mode !== "missing-backup")
    await writeFile(
      join(dir, "recovery-input/backup-ready.json"),
      JSON.stringify(f.backup),
    );
  await writeFile(
    join(dir, "recovery-input/current-release-proof.json"),
    JSON.stringify(f.currentReleaseProof),
  );
  await writeFile(join(dir, "current/compose.rendered.yml"), "services: {}\n");
  const docker = '#!/usr/bin/env bash\nexec "$REAL_NODE" "$FAKE_DOCKER" "$@"\n';
  for (const [name, code] of [
    ["docker", docker],
    ["flock", "#!/usr/bin/env bash\nshift\nexit 0\n"],
    ["date", "#!/usr/bin/env bash\necho 2026-11-12T02:06:00Z\n"],
    ["curl", "#!/usr/bin/env bash\nexit 0\n"],
  ]) {
    await writeFile(join(dir, "bin", name), code);
    await chmod(join(dir, "bin", name), 0o755);
  }
  const script =
    "date() { echo 2026-11-12T02:06:00Z; }\ncurl() { :; }\n" +
    (
      await readFile(
        join(root, "scripts/product/release/auto-rollback.sh"),
        "utf8",
      )
    )
      .replaceAll("\r\n", "\n")
      // Only Linux path/root setup differs. All guard/DB/pull/apply/receipt code is real.
      .replace(
        /^\[\[ "\$MKW_DEPLOY_PATH".*$/m,
        '[[ "$MKW_DEPLOY_PATH" == "$TEST_ROOT" ]]',
      )
      .replace(/^script_root=.*$/m, 'script_root="$TEST_ROOT"');
  const env = {
    ...process.env,
    PATH:
      join(dir, "bin") +
      (process.platform === "win32" ? ";" : ":") +
      process.env.PATH,
    TEST_ROOT: posix(dir),
    TEST_ROOT_NATIVE: dir,
    REAL_NODE: posix(process.execPath),
    FAKE_DOCKER: posix(
      join(root, "tests/product-tooling/fixtures/recovery-docker.mjs"),
    ),
    MODE: mode,
    MKW_DEPLOY_PATH: posix(dir),
    MKW_PROJECT_NAME: "fixture",
    MKW_GATEWAY_PORT: "3200",
    MKW_OPERATION_ID: fixture().expectedOperationId,
    MKW_RELEASE_SHA: f.expectedSha,
    MKW_SOURCE_REPOSITORY: "owner/repo",
    MKW_API_IMAGE: f.state.manifest.apiImage,
    MKW_WEB_IMAGE: f.state.manifest.webImage,
    MKW_POSTGRES_IMAGE: snapshot.postgresImage,
    MKW_BACKUP_EXPECTED_HOST: "fixture",
    MKW_BACKUP_EXPECTED_TARGET_IDENTITY: f.backupPolicy.expectedTargetIdentity,
    MKW_BACKUP_MAX_AGE_SECONDS: "3600",
    MKW_ATTESTATION_MODE: "required",
    MKW_ATTESTATION_STATUS: "verified",
    MKW_REGISTRY_HOST: "ghcr.io",
    MKW_REGISTRY_VISIBILITY: "public",
    MKW_REGISTRY_PULL_USERNAME: "",
    MKW_REGISTRY_PULL_TOKEN_FILE: "/unused",
    NEW_API: f.state.manifest.apiImage,
    NEW_WEB: f.state.manifest.webImage,
    OLD_API: f.trustedManifest.apiImage,
    OLD_WEB: f.trustedManifest.webImage,
    PG_IMAGE: snapshot.postgresImage,
    PG_ID: snapshot.postgresImageId,
  };
  return {
    dir,
    run: () =>
      spawnSync(bash, ["-Eeuo", "pipefail"], {
        input: script,
        cwd: dir,
        env,
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      }),
  };
}
for (const mode of [
  "healthy",
  "changed",
  "unknown",
  "migration-failed",
  "unknown-data",
  "side-effect-data",
  "missing-data-evidence",
  "ownership-runId",
  "ownership-runAttempt",
  "ownership-artifactId",
  "ownership-artifactDigest",
  "ownership-controlSha",
  "missing-previous",
  "interleaved",
  "pg-mismatch",
  "missing-backup",
  "apply-failed",
  "unhealthy",
  "pull-failed",
])
  test("actual remote application rollback " + mode, async (t) => {
    const { dir, run } = await remoteFixture(t, mode);
    const result = run();
    assert.equal(
      result.status,
      mode === "healthy"
        ? 0
        : ["apply-failed", "unhealthy"].includes(mode)
          ? 1
          : mode === "pull-failed"
            ? 77
            : 78,
      result.stdout + result.stderr,
    );
    const receipt = JSON.parse(
      await readFile(join(dir, "shared/auto-rollback-evidence.json"), "utf8"),
    );
    assert.equal(
      receipt.result,
      mode === "healthy" ? "recovered-by-app-rollback" : "incident-required",
    );
    assert.equal(receipt.pipelineStatus, "failed");
    if (mode === "healthy") {
      const state = JSON.parse(
        await readFile(join(dir, "shared/current-state.json"), "utf8"),
      );
      assert.equal(
        decideOrchestrationOutcome({ requestedSha: state.releaseSha, state })
          .status,
        "already-deployed",
      );
    }
    const log = await readFile(join(dir, "docker.log"), "utf8");
    assert.doesNotMatch(
      log,
      /migrate deploy|migrate reset|pg_restore|up .* db$| down(?: |$)|--remove-orphans/m,
    );
    const count = (log.match(/ up -d --wait --no-deps api gateway/g) || [])
      .length;
    assert.equal(
      count,
      ["healthy", "apply-failed", "unhealthy"].includes(mode) ? 1 : 0,
    );
    if (
      ["healthy", "apply-failed", "unhealthy", "pull-failed"].includes(mode)
    ) {
      run();
      const again = await readFile(join(dir, "docker.log"), "utf8");
      assert.equal(
        (again.match(/ up -d --wait --no-deps api gateway/g) || []).length,
        count,
        "rerun applied apps twice",
      );
    }
  });
