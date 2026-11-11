import assert from "node:assert/strict";
import test from "node:test";
import { coordinateRelease } from "../../scripts/product/release/coordinator.mjs";
import { decideOrchestrationOutcome } from "../../scripts/product/release/orchestration-policy.mjs";
import * as coordinator from "../../scripts/product/release/coordinator.mjs";

test("only an active canonical manual coordinator can lend its transaction lock to child workflows", () => {
  const { validateCoordinatorParent } = coordinator;
  assert.equal(typeof validateCoordinatorParent, "function");
  const parent = {
    id: "50",
    run_attempt: 2,
    event: "workflow_dispatch",
    path: ".github/workflows/release-pipeline.yml",
    head_branch: "main",
    status: "in_progress",
  };
  assert.equal(validateCoordinatorParent(parent, "50", "50-2-deploy"), true);
  for (const patch of [
    { status: "completed" },
    { path: ".github/workflows/spoof.yml" },
    { event: "push" },
    { head_branch: "other" },
    { id: "51" },
    { run_attempt: 1 },
  ])
    assert.throws(
      () =>
        validateCoordinatorParent({ ...parent, ...patch }, "50", "50-2-deploy"),
      /coordinator parent/,
    );
});

const SHA = "a".repeat(40);
const NEWER = "b".repeat(40);
const target = { host: "prod", database: "mkw", identity: "prod/mkw" };
const readiness = {
  schemaVersion: "1",
  kind: "BACKUP",
  backupId: "backup-1",
  releaseSha: SHA,
  createdAt: "2026-11-11T10:00:00Z",
  dumpSha256: "c".repeat(64),
  size: 1,
  restoreVerified: true,
  retentionUntil: "2026-12-11T10:00:00Z",
  storageLocation: "github-actions-artifact:mkw-backup",
  databaseIdentity: { host: "prod", name: "mkw", engine: "postgresql" },
};
const manifest = {
  schemaVersion: "1",
  releaseSha: SHA,
  sourceRepository: "org/repo",
  createdAt: "2026-11-11T10:00:00Z",
  apiImage: `x@sha256:${"1".repeat(64)}`,
  webImage: `x@sha256:${"2".repeat(64)}`,
  postgresImage: `postgres@sha256:${"3".repeat(64)}`,
  artifacts: {
    sbom: { sha256: "d".repeat(64), size: 1 },
    provenance: { sha256: "e".repeat(64), size: 1 },
  },
};

function fixture({
  sourceSha = SHA,
  verifiedSha,
  fail,
  activeDeploy = false,
} = {}) {
  const runs = new Map();
  const dispatches = [];
  const base = {
    id: "10",
    path: ".github/workflows/build-release.yml",
    event: "workflow_run",
    head_branch: "main",
    head_sha: SHA,
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
  };
  return {
    dispatches,
    async listArtifacts() {
      return [
        {
          id: "101",
          name: `mkw-release-${SHA}`,
          expired: false,
          workflow_run: { id: "10" },
        },
      ];
    },
    async run(id) {
      if (id === "10") return base;
      const run = runs.get(id);
      return activeDeploy && id === "30"
        ? { ...run, status: "in_progress", conclusion: null }
        : run;
    },
    async jsonFromArtifact(id, entry) {
      if (entry === "release-manifest.json") return manifest;
      if (entry === "build-metadata.json") return { sourceSha: SHA };
      return readiness;
    },
    async runs(workflow) {
      return [...runs.values()].filter((run) => run.workflow === workflow);
    },
    async runArtifacts() {
      return [
        {
          id: "201",
          name: "mkw-backup-20-1",
          expired: false,
          workflow_run: { id: "20" },
        },
      ];
    },
    async dispatch(workflow, ref, fields) {
      dispatches.push({ workflow, ref, fields });
      const id =
        workflow === "backup.yml"
          ? "20"
          : workflow === "deploy.yml"
            ? "30"
            : "40";
      runs.set(id, {
        id,
        workflow,
        path: `.github/workflows/${workflow}`,
        event: "workflow_dispatch",
        head_branch: "main",
        display_title: `mkw-${workflow.replace(".yml", "")}-${fields.coordinator_id}`,
        status:
          activeDeploy && workflow === "deploy.yml"
            ? "in_progress"
            : "completed",
        mutation_started: activeDeploy && workflow === "deploy.yml",
        conclusion: fail === workflow ? "failure" : "success",
        run_attempt: 1,
      });
    },
    async pause() {},
    now: () => Date.parse("2026-11-11T12:00:00Z"),
    async currentSourceSha() {
      return sourceSha === SHA ? SHA : NEWER;
    },
    async currentState() {
      return verifiedSha ? { verifiedSha } : { verifiedSha: null };
    },
  };
}

function input(overrides = {}) {
  return {
    sha: SHA,
    mode: "release",
    kind: "BACKUP",
    correlationId: "coord-1",
    repository: "org/repo",
    maxAgeMs: 24 * 3600e3,
    target,
    ...overrides,
  };
}

test("queued newer source is superseded before any stage mutates", async () => {
  const api = fixture({ sourceSha: NEWER });
  const result = await coordinateRelease(input(), api);
  assert.equal(result.status, "superseded");
  assert.equal(api.dispatches.length, 0);
});

test("rerun of a verified SHA returns already-deployed without dispatch", async () => {
  const api = fixture({ verifiedSha: SHA });
  const result = await coordinateRelease(input(), api);
  assert.equal(result.status, "already-deployed");
  assert.equal(api.dispatches.length, 0);
});

test("duplicate producer correlation reuses successful stages", async () => {
  const api = fixture();
  const originalRun = api.run;
  const originalRuns = api.runs;
  api.runs = async (workflow) =>
    workflow === "backup.yml"
      ? [
          {
            id: "20",
            workflow,
            path: `.github/workflows/${workflow}`,
            event: "workflow_dispatch",
            head_branch: "main",
            display_title: "mkw-backup-coord-1-backup",
            status: "completed",
            conclusion: "success",
            run_attempt: 1,
          },
        ]
      : originalRuns(workflow);
  api.run = async (id) =>
    id === "20"
      ? {
          id: "20",
          workflow: "backup.yml",
          path: ".github/workflows/backup.yml",
          event: "workflow_dispatch",
          head_branch: "main",
          display_title: "mkw-backup-coord-1-backup",
          status: "completed",
          conclusion: "success",
          run_attempt: 1,
        }
      : originalRun(id);
  const result = await coordinateRelease(input(), api);
  assert.equal(result.status, "success");
  assert.equal(api.dispatches[0].workflow, "deploy.yml");
});

test("source advancing after backup returns superseded and does not deploy", async () => {
  const api = fixture();
  let checks = 0;
  api.currentSourceSha = async () => (++checks > 1 ? NEWER : SHA);
  const result = await coordinateRelease(input(), api);
  assert.equal(result.status, "superseded");
  assert.deepEqual(
    api.dispatches.map((x) => x.workflow),
    ["backup.yml"],
  );
});

test("timeout of mutation stage does not blindly cancel the deploy", async () => {
  const api = fixture({ activeDeploy: true });
  const cancelled = [];
  api.cancelRun = async (id) => cancelled.push(id);
  await assert.rejects(
    () =>
      coordinateRelease(
        input({ timeouts: { stages: { "deploy.yml": 1 } } }),
        api,
      ),
    /timed out/,
  );
  assert.deepEqual(cancelled, []);
  assert.deepEqual(
    api.dispatches.map((x) => x.workflow),
    ["backup.yml", "deploy.yml"],
  );
});

test("timeout with unknown mutation boundary never cancels without explicit safe evidence", async () => {
  const api = fixture({ activeDeploy: true });
  const original = api.run;
  api.run = async (id) => ({
    ...(await original(id)),
    mutation_started: undefined,
  });
  const cancelled = [];
  api.cancelRun = async (id) => cancelled.push(id);
  // Discovery metadata is also unknown, as on the real Actions API.
  const originalRuns = api.runs;
  api.runs = async (workflow) =>
    (await originalRuns(workflow)).map((run) => ({
      ...run,
      mutation_started: undefined,
    }));
  await assert.rejects(() => coordinateRelease(input(), api), /timed out/);
  assert.deepEqual(cancelled, []);
  assert.deepEqual(
    api.dispatches.map((x) => x.workflow),
    ["backup.yml", "deploy.yml"],
  );
});

test("failed backup prevents deploy and verification stages", async () => {
  const api = fixture({ fail: "backup.yml" });
  await assert.rejects(
    () => coordinateRelease(input(), api),
    /backup\.yml failed/,
  );
  assert.deepEqual(
    api.dispatches.map((x) => x.workflow),
    ["backup.yml"],
  );
});

test("cancellation before mutation is bounded and reports cancelled", async () => {
  const api = fixture();
  api.isCancelled = async () => true;
  const result = await coordinateRelease(input(), api);
  assert.equal(result.status, "cancelled");
  assert.equal(api.dispatches.length, 0);
});

test("unverified or corrupt current state blocks a rerun instead of claiming a verified deployment", () => {
  for (const state of [
    { status: "deploying", releaseSha: SHA, operationId: "old-1" },
    { status: "failed", releaseSha: SHA, operationId: "old-1" },
    { status: "verified", releaseSha: "forged", operationId: "old-1" },
  ]) {
    assert.throws(
      () =>
        decideOrchestrationOutcome({
          requestedSha: SHA,
          currentSha: SHA,
          state,
        }),
      /incident-required/,
    );
  }
});
