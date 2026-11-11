import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures/auto-rollback.mjs";
import { rollbackApi } from "./fixtures/rollback-api.mjs";
import {
  beginOperation,
  promoteOperation,
} from "../../scripts/product/release/operation-state.mjs";
import { decideAutomaticRollback } from "../../scripts/product/release/auto-rollback.mjs";
import { decideOrchestrationOutcome } from "../../scripts/product/release/orchestration-policy.mjs";
import { prepareAutomaticRollback } from "../../scripts/product/release/prepare-auto-rollback.mjs";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

for (const declaration of [
  undefined,
  "unknown",
  "side-effect",
  "migration-only",
])
  test(`R1 journal cannot manufacture safety from ${declaration}`, () => {
    const f = fixture();
    const started = beginOperation({
      ...f.state,
      backup: f.backup,
      dataOperations: declaration,
    });
    const state = {
      ...f.state,
      ...started,
      applicationAttempted: true,
      applicationStartedAt: f.state.applicationStartedAt,
      before: f.state.before,
      after: f.state.after,
      migrationOutcome: "succeeded",
    };
    assert.equal(started.dataOperations, "unknown");
    delete state.dataOperationEvidence;
    assert.equal(
      decideAutomaticRollback({ ...f, state }).action,
      "incident-required",
    );
  });

for (const [label, change] of [
  ["unknown DB", () => ({ database: { known: false } })],
  ["missing ownership", () => ({ ownership: null })],
  [
    "invalid ownership",
    (f) => ({ ownership: { ...f.state.ownership, artifactDigest: "bad" } }),
  ],
  [
    "required attestation unverified",
    () => ({ attestation: { mode: "required", status: "not-verified" } }),
  ],
  ["missing attestation", () => ({ attestation: null })],
])
  test(`R1 promotion and idempotency reject ${label}`, () => {
    const f = fixture();
    const patch = change(f);
    const state = { ...f.state, attestation: f.attestation, ...patch };
    assert.throws(
      () =>
        promoteOperation(state, {
          operationId: f.expectedOperationId,
          releaseSha: f.expectedSha,
          database: patch.database ?? f.state.after,
          verifiedAt: f.now,
        }),
      /incident-required/,
    );
    assert.throws(
      () =>
        decideOrchestrationOutcome({
          requestedSha: f.expectedSha,
          state: {
            ...state,
            status: "verified",
            database: patch.database ?? f.state.after,
            verifiedAt: f.now,
          },
        }),
      /incident-required/,
    );
  });

test("R1 valid runtime promotion still allows a verified SHA rerun", () => {
  const f = fixture();
  const state = promoteOperation(
    { ...f.state, attestation: f.attestation },
    {
      operationId: f.expectedOperationId,
      releaseSha: f.expectedSha,
      database: f.state.after,
      verifiedAt: f.now,
    },
  );
  assert.equal(
    decideOrchestrationOutcome({ requestedSha: f.expectedSha, state }).status,
    "already-deployed",
  );
});

for (const field of [
  "runId",
  "runAttempt",
  "artifactId",
  "artifactDigest",
  "controlSha",
])
  test(`R1 current ${field} mutation stops before backup/transport eligibility`, async () => {
    const f = fixture();
    f.state.ownership[field] =
      field === "artifactDigest"
        ? "sha256:" + "f".repeat(64)
        : field === "controlSha"
          ? "f".repeat(40)
          : "999";
    assert.equal(
      (await prepareAutomaticRollback(f, rollbackApi())).action,
      "incident-required",
    );
    assert.equal(decideAutomaticRollback(f).action, "incident-required");
  });

test("R1 current producer must be canonical and successful at the exact build attempt", async () => {
  const f = fixture();
  assert.equal(
    (await prepareAutomaticRollback(f, rollbackApi())).action,
    "eligible",
  );
  for (const patch of [
    { currentRun: { head_sha: "f".repeat(40) } },
    { currentRun: { head_branch: "feature" } },
    { currentRun: { event: "pull_request" } },
    { currentRun: { path: ".github/workflows/spoof.yml" } },
    { currentRun: { referenced_workflows: [] } },
    { currentRun: { run_attempt: 3 } },
    { currentArtifact: { expired: true } },
    { currentArtifact: { digest: "sha256:" + "f".repeat(64) } },
    { currentMetadata: { sourceSha: "f".repeat(40) } },
    { jobs: [] },
  ])
    assert.equal(
      (await prepareAutomaticRollback(f, rollbackApi(patch))).action,
      "incident-required",
      JSON.stringify(patch),
    );
});

test("R1 missing/unverified/side-effect data receipt never authorizes recovery", async () => {
  for (const apiChange of [
    { missingDataReceipt: true },
    { dataReceipt: { status: "unknown" } },
    { dataReceipt: { unverifiedSideEffects: true } },
    { dataReceipt: { source: "self-declaration" } },
  ])
    assert.equal(
      (await prepareAutomaticRollback(fixture(), rollbackApi(apiChange)))
        .action,
      "incident-required",
    );
  for (const patch of [
    (state) => delete state.dataOperationEvidence,
    (state) => (state.dataOperationEvidence.status = "unknown"),
    (state) => (state.dataOperationEvidence.unverifiedSideEffects = true),
    (state) => (state.dataOperationEvidence.source = "self-declaration"),
  ]) {
    const f = fixture();
    patch(f.state);
    assert.equal(
      (await prepareAutomaticRollback(f, rollbackApi())).action,
      "incident-required",
    );
  }
  for (const patch of [
    (state) => delete state.dataOperationEvidence,
    (state) => (state.dataOperationEvidence.status = "unknown"),
    (state) => (state.dataOperationEvidence.unverifiedSideEffects = true),
    (state) => (state.dataOperationEvidence.source = "self-declaration"),
    (state) => (state.dataOperationEvidence.diagnosticSecret = "must-not-leak"),
  ]) {
    const mutated = fixture();
    patch(mutated.state);
    assert.equal(
      (await prepareAutomaticRollback(mutated, rollbackApi())).action,
      "incident-required",
    );
  }
});

test("R1 successful migration journal update cannot certify absent data-side-effect evidence", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-r1-data-journal-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const f = fixture();
  f.state.dataOperations = "unknown";
  delete f.state.dataOperationEvidence;
  await writeFile(join(dir, "state.json"), JSON.stringify(f.state));
  await writeFile(join(dir, "snapshot.json"), JSON.stringify(f.state.after));
  const root = resolve(import.meta.dirname, "../..");
  const result = spawnSync(
    process.execPath,
    [
      join(root, "scripts/product/release/operation-state.mjs"),
      "update",
      join(dir, "state.json"),
      "after",
      join(dir, "snapshot.json"),
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(result.stdout);
  assert.equal(state.migrationOutcome, "succeeded");
  assert.equal(state.dataOperations, "unknown");
  assert.equal(state.dataOperationEvidence, undefined);
  assert.equal(
    decideAutomaticRollback({ ...f, state }).action,
    "incident-required",
  );
});

test("R1 current required attestation and previous runtime proof cannot be absent", () => {
  const f = fixture();
  f.state.attestation = { mode: "required", status: "not-verified" };
  assert.equal(decideAutomaticRollback(f).action, "incident-required");
  f.state.attestation = f.attestation;
  delete f.state.previousState.runtimeVerification;
  assert.equal(decideAutomaticRollback(f).action, "incident-required");
});

test("R1 failed database capture never copies last-known-good in the real verifier promotion block", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-r1-promotion-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "shared"));
  const f = fixture();
  const before = JSON.stringify({ ...f.state, attestation: f.attestation });
  await writeFile(join(dir, "shared/current-state.json"), before);
  const oldGood = JSON.stringify(f.state.previousState);
  await writeFile(join(dir, "shared/last-known-good.json"), oldGood);
  const root = resolve(import.meta.dirname, "../..");
  const source = (
    await readFile(join(root, "scripts/product/post-deploy-verify.sh"), "utf8")
  ).replaceAll("\r\n", "\n");
  const start = source.indexOf(
    '  source "$script_root/scripts/product/release/operation-state.sh"',
  );
  assert.ok(start > 0);
  const block = source.slice(start, source.indexOf("\nelse\n", start));
  const posix = (path) =>
    path
      .replaceAll("\\", "/")
      .replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`);
  const result = spawnSync(
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash",
    ["-Eeuo", "pipefail"],
    {
      input:
        'run_node() { "$REAL_NODE" "$@"; }\ndocker() { return 79; }; export -f docker\n' +
        block,
      cwd: dir,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        REAL_NODE: posix(process.execPath),
        script_root: posix(root),
        rendered: "unused",
        MKW_DEPLOY_PATH: posix(dir),
        MKW_PROJECT_NAME: "fixture",
        MKW_POSTGRES_IMAGE: f.state.manifest.postgresImage,
        MKW_OPERATION_ID: f.expectedOperationId,
        RELEASE_SHA: f.expectedSha,
      },
    },
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /incident-required/);
  assert.equal(
    await readFile(join(dir, "shared/current-state.json"), "utf8"),
    before,
  );
  assert.equal(
    await readFile(join(dir, "shared/last-known-good.json"), "utf8"),
    oldGood,
  );
  assert.throws(
    () =>
      decideOrchestrationOutcome({
        requestedSha: f.expectedSha,
        state: JSON.parse(before),
      }),
    /incident-required/,
  );
});
