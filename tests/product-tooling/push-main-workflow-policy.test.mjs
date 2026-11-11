import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolveExactRelease } from "../../scripts/product/release/resolve-release.mjs";

// Use ESLint's locked YAML parser; no new dependency or ad-hoc line parser.
const require = createRequire(import.meta.url);
const { load, JSON_SCHEMA } = createRequire(
  require.resolve("eslint/package.json"),
)("js-yaml");
const read = async (name) =>
  load(await readFile(`.github/workflows/${name}`, "utf8"), {
    schema: JSON_SCHEMA,
  });
const expr = (value) => `\u0024{{ ${value} }}`;
const needs = (job) => [].concat(job.needs ?? []);

test("one push-main release producer, no paths filter or manual IDs, PR quality retained", async () => {
  const entry = await read("main-release.yml");
  assert.deepEqual(entry.on, { push: { branches: ["main"] } });
  const producers = [];
  for (const name of await readdir(".github/workflows")) {
    const w = await read(name);
    if (w.on.push || w.on.workflow_run) producers.push(name);
  }
  assert.deepEqual(producers, ["main-release.yml"]);
  const ci = await read("ci.yml");
  assert.ok(Object.hasOwn(ci.on, "pull_request"));
  assert.ok(Object.hasOwn(ci.on, "workflow_call"));
  const build = await read("build-release.yml");
  assert.equal(build.name, "Build immutable release");
  assert.deepEqual(Object.keys(build.on), ["workflow_call"]);
  assert.equal(
    build.jobs.release.steps.find(
      (s) => s.name === "Checkout immutable CI commit",
    ).with.ref,
    expr("github.sha"),
  );
});

test("backup coordinator parent validation can read Actions run state", async () => {
  const backup = await read("backup.yml");
  assert.equal(backup.permissions.actions, "read");
  const entry = await read("main-release.yml");
  assert.equal(entry.jobs.backup.permissions.actions, "read");
});

test("needs stop deployment after either failed producer and verification after failed deploy", async () => {
  const { jobs } = await read("main-release.yml");
  assert.deepEqual(needs(jobs.build), ["quality"]);
  assert.deepEqual(needs(jobs.backup), ["quality"]);
  assert.deepEqual(needs(jobs.deploy), ["build", "backup"]);
  assert.deepEqual(needs(jobs.verify), ["build", "deploy"]);
  assert.equal(
    jobs.quality.if,
    "needs.preflight.outputs.release_status == 'ready'",
  );
  assert.equal(
    jobs.verify.if,
    "needs.deploy.outputs.release_status == 'success'",
  );
  for (const name of ["build", "backup", "deploy"]) {
    assert.equal(
      jobs[name].if,
      undefined,
      `${name} must retain success-only needs behavior`,
    );
    assert.equal(jobs[name]["continue-on-error"], undefined);
  }
  assert.equal(jobs.backup.with.kind, "BACKUP");
  assert.equal(jobs.backup.with.release_sha, expr("github.sha"));
  assert.equal(jobs.deploy.with.mode, "release");
  assert.equal(jobs.deploy.with.backup_kind, "BACKUP");
  assert.equal(jobs.verify.with.mode, "release");
});

test("every forwarded exact output exists at workflow and producer job levels", async () => {
  const { jobs } = await read("main-release.yml");
  for (const [consumer, producer, keys] of [
    [
      "deploy",
      "build",
      [
        "release_sha",
        "release_run_id",
        "release_run_attempt",
        "release_artifact_id",
        "release_artifact_name",
        "release_artifact_digest",
        "api_digest",
        "web_digest",
        "postgres_image",
      ],
    ],
    [
      "deploy",
      "backup",
      [
        "backup_run_id",
        "backup_run_attempt",
        "backup_artifact_id",
        "backup_artifact_name",
        "backup_artifact_digest",
      ],
    ],
    [
      "verify",
      "build",
      [
        "release_sha",
        "release_run_id",
        "release_artifact_id",
        "api_digest",
        "web_digest",
        "postgres_image",
      ],
    ],
  ]) {
    const workflow = await read(jobs[producer].uses.split("/").at(-1));
    for (const key of keys) {
      assert.equal(
        jobs[consumer].with[key],
        expr(`needs.${producer}.outputs.${key}`),
        `${consumer}.${key}`,
      );
      const output = workflow.on.workflow_call.outputs[key];
      assert.ok(output, `${producer}.${key} exported`);
      const match = output.value.match(
        /^\u0024\{\{ jobs\.([\w-]+)\.outputs\.([\w-]+) \}\}$/,
      );
      assert.ok(match, `job output reference: ${output.value}`);
      assert.ok(
        workflow.jobs[match[1]].outputs[match[2]],
        `${producer}.${key} has a source`,
      );
    }
  }
  assert.equal(jobs.deploy.with.control_sha, expr("github.sha"));
  assert.equal(jobs.verify.with.control_sha, expr("github.sha"));
  assert.equal(jobs.backup.with.control_sha, expr("github.sha"));
  for (const [stage, file] of [
    ["deploy", "deploy.yml"],
    ["verify", "post-deploy-verify.yml"],
  ]) {
    const w = await read(file);
    assert.equal(
      w.on.workflow_call.outputs[`${stage}_run_id`].value,
      expr(`jobs.${stage}.outputs.${stage}_run_id`),
    );
    for (const step of w.jobs[stage].steps.filter((s) =>
      s.uses?.startsWith("actions/download-artifact@"),
    )) {
      assert.ok(step.with["artifact-ids"]);
      assert.ok(step.with["run-id"]);
      assert.equal(step.with.pattern, undefined);
      assert.equal(step.with.name, undefined);
    }
  }
});

test("summary stays failed for every failed prerequisite and manual routes remain", async () => {
  const { jobs } = await read("main-release.yml");
  const summary = jobs["release-status"];
  assert.deepEqual(needs(summary), [
    "preflight",
    "quality",
    "build",
    "backup",
    "deploy",
    "verify",
  ]);
  assert.equal(
    summary.steps[0].env.RELEASE_STATUS,
    expr(
      "needs.deploy.outputs.release_status == 'superseded' && 'superseded' || needs.preflight.outputs.release_status == 'superseded' && 'superseded' || needs.deploy.outputs.release_status == 'already-deployed' && 'already-deployed' || needs.preflight.outputs.release_status == 'already-deployed' && 'already-deployed' || needs.verify.result == 'success' && 'success' || 'failed'",
    ),
  );
  assert.ok(summary.outputs.correlation_id);
  for (const file of [
    "deploy.yml",
    "backup.yml",
    "post-deploy-verify.yml",
    "release-pipeline.yml",
    "rollback.yml",
  ])
    assert.ok(Object.hasOwn((await read(file)).on, "workflow_dispatch"));
  assert.ok((await read("backup.yml")).on.schedule.length);
});

const sha = "a".repeat(40);
const manifest = {
  schemaVersion: "1",
  releaseSha: sha,
  sourceRepository: "org/repo",
  createdAt: "2026-11-11T10:00:00Z",
  apiImage: `x@sha256:${"1".repeat(64)}`,
  webImage: `x@sha256:${"2".repeat(64)}`,
  postgresImage: `postgres@sha256:${"3".repeat(64)}`,
  artifacts: {
    sbom: { sha256: "a".repeat(64), size: 1 },
    provenance: { sha256: "b".repeat(64), size: 1 },
  },
};
const input = {
  sha,
  repository: "org/repo",
  artifactId: "101",
  runId: "10",
  dispatchRef: "refs/heads/main",
};
const producer = {
  id: "10",
  path: ".github/workflows/main-release.yml",
  event: "push",
  head_branch: "main",
  head_sha: sha,
  status: "completed",
  conclusion: "success",
  referenced_workflows: [
    {
      path: "org/repo/.github/workflows/build-release.yml@refs/heads/main",
      sha,
      ref: "refs/heads/main",
    },
  ],
};
const api = (patch = {}) => ({
  async artifact() {
    return {
      id: "101",
      name: `mkw-release-${sha}`,
      expired: false,
      workflow_run: { id: "10" },
    };
  },
  async run() {
    return { ...producer, ...patch };
  },
  async jsonFromArtifact(id, name) {
    assert.equal(id, "101");
    return name === "release-manifest.json" ? manifest : { sourceSha: sha };
  },
});
test("manual recovery resolves the successful push producer with canonical reusable build provenance", async () => {
  assert.deepEqual(await resolveExactRelease(input, api()), {
    artifactId: "101",
    runId: "10",
  });
});
for (const patch of [
  { event: "pull_request" },
  { head_sha: "b".repeat(40) },
  { path: ".github/workflows/spoof.yml" },
  { status: "in_progress" },
  { conclusion: "failure" },
  { referenced_workflows: [] },
  {
    referenced_workflows: [
      {
        path: "evil/repo/.github/workflows/build-release.yml@refs/heads/main",
        sha,
        ref: "refs/heads/main",
      },
    ],
  },
])
  test(`push producer rejects forged ownership or unfinished run ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(
      () => resolveExactRelease(input, api(patch)),
      /producer|linkage/,
    );
  });

test("automatic handoff accepts the upload action raw archive digest and rejects malformed digests", async () => {
  const { spawnSync } = await import("node:child_process");
  const w = await read("deploy.yml");
  const gate = w.jobs.deploy.steps.find(
    (s) => s.name === "Validate mode-specific artifact inputs",
  ).run;
  const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const env = {
    ...process.env,
    MODE: "release",
    RELEASE_SHA: sha,
    RELEASE_ARTIFACT_ID: "101",
    RELEASE_ARTIFACT_NAME: `mkw-release-${sha}`,
    RELEASE_RUN_ID: "10",
    RELEASE_RUN_ATTEMPT: "1",
    BACKUP_RUN_ID: "10",
    BACKUP_RUN_ATTEMPT: "1",
    BACKUP_ARTIFACT_ID: "102",
    BACKUP_ARTIFACT_NAME: "mkw-backup-10-1",
    BACKUP_KIND: "BACKUP",
    RELEASE_ARTIFACT_DIGEST: "1".repeat(64),
    BACKUP_ARTIFACT_DIGEST: "2".repeat(64),
  };
  const run = (patch) =>
    spawnSync(bash, ["-c", gate], {
      encoding: "utf8",
      env: { ...env, ...patch },
    });
  const valid = run({});
  assert.equal(valid.status, 0, valid.stderr);
  assert.notEqual(run({ RELEASE_ARTIFACT_DIGEST: "invalid" }).status, 0);
  assert.notEqual(run({ BACKUP_ARTIFACT_DIGEST: "invalid" }).status, 0);
});

test("canonical build cannot be invoked on PR or non-main refs", async () => {
  const w = await read("build-release.yml");
  assert.equal(
    w.jobs.release.if,
    "github.event_name == 'push' && github.ref == 'refs/heads/main'",
  );
});
