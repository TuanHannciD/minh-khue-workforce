import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateBackupReadyFreshness } from "../../scripts/product/release/orchestration-policy.mjs";
import { coordinateRelease } from "../../scripts/product/release/coordinator.mjs";

const workflow = await readFile(
  ".github/workflows/release-pipeline.yml",
  "utf8",
);

test("release coordinator accepts the bounded manual inputs", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /release_sha:[\s\S]*required: true[\s\S]*type: string/,
  );
  assert.match(
    workflow,
    /mode:[\s\S]*options: \[dry-run, bootstrap, release\]/,
  );
  assert.match(
    workflow,
    /backup_kind:[\s\S]*options: \[BACKUP, INITIAL_EMPTY_DEPLOYMENT\]/,
  );
});

test("trusted coordinator policy is checked out from main without persisted credentials", () => {
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs.release_sha/);
  assert.match(workflow, /node scripts\/product\/release\/run-coordinator.mjs/);
  assert.match(workflow, /GH_TOKEN_VALUE: \$\{\{ github.token \}\}/);
});

const SHA = "a".repeat(40);
const freshBackup = {
  schemaVersion: "1",
  kind: "BACKUP",
  backupId: "mkw-20-1-release",
  releaseSha: SHA,
  createdAt: "2026-11-11T10:00:00Z",
  dumpSha256: "b".repeat(64),
  size: 1,
  restoreVerified: true,
  retentionUntil: "2026-12-11T10:00:00Z",
  storageLocation: "github-actions-artifact:mkw-backup",
  databaseIdentity: {
    host: "prod",
    name: "mkw",
    engine: "postgresql",
    targetIdentity: "vps/mkw",
  },
};

test("freshness policy rejects stale, future, and expired readiness for both kinds", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  assert.equal(
    validateBackupReadyFreshness(freshBackup, {
      expectedSha: SHA,
      expectedKind: "BACKUP",
      now,
      maxAgeMs: 24 * 3600e3,
    }).ok,
    true,
  );
  for (const patch of [
    { createdAt: "2026-11-09T10:00:00Z" },
    { createdAt: "2026-11-11T13:00:00Z" },
    { retentionUntil: "2026-11-11T11:00:00Z" },
  ]) {
    assert.equal(
      validateBackupReadyFreshness(
        { ...freshBackup, ...patch },
        {
          expectedSha: SHA,
          expectedKind: "BACKUP",
          now,
          maxAgeMs: 24 * 3600e3,
        },
      ).ok,
      false,
    );
  }
});

const input = (kind = "BACKUP", mode = "release") => ({
  sha: SHA,
  mode,
  kind,
  correlationId: "coord-1",
  repository: "org/repo",
  maxAgeMs: 24 * 3600e3,
  target: { host: "prod", database: "mkw", identity: "vps/mkw" },
});
function fakeApi({
  backupConclusion = "success",
  stale = false,
  kind = "BACKUP",
  failedWorkflow,
  manifestSha = SHA,
  metadataSha = SHA,
  ambiguousRelease = false,
  ambiguousBackup = false,
  changedAttempt = false,
  staleEmpty = false,
} = {}) {
  const sha = SHA;
  const build = {
    head_sha: "b".repeat(40),
    id: "10",
    path: ".github/workflows/build-release.yml",
    event: "workflow_run",
    head_branch: "main",
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
    run_started_at: "2026-11-12T10:00:00Z",
    updated_at: "2026-11-12T10:59:59Z",
  };
  const runs = new Map();
  const dispatches = [];
  const readiness = {
    ...structuredClone(freshBackup),
    backupId: "mkw-20-1-release",
    ...(stale ? { createdAt: "2026-11-01T00:00:00Z" } : {}),
  };
  if (kind === "INITIAL_EMPTY_DEPLOYMENT") {
    readiness.kind = kind;
    readiness.restoreVerified = false;
    readiness.databaseVerifiedEmpty = true;
    readiness.emptyEvidence = {
      targetIdentity: "vps/mkw",
      databaseIdentity: "mkw",
      checkedAt: staleEmpty ? "2026-11-01T00:00:00Z" : readiness.createdAt,
    };
    delete readiness.dumpSha256;
    delete readiness.size;
  }
  return {
    dispatches,
    async artifact(id) {
      const artifacts =
        id === "101" || id === "102"
          ? await this.listArtifacts()
          : await this.runArtifacts("20");
      return artifacts.find((a) => a.id === id);
    },
    readiness,
    async listArtifacts() {
      const artifact = {
        id: "101",
        digest: `sha256:${"d".repeat(64)}`,
        name: `mkw-release-${sha}`,
        expired: false,
        created_at: "2026-11-12T10:00:30Z",
        workflow_run: { id: "10" },
      };
      return [
        artifact,
        ...(ambiguousRelease ? [{ ...artifact, id: "102" }] : []),
        {
          id: "999",
          name: `mkw-release-${"b".repeat(40)}`,
          workflow_run: { id: "11" },
        },
      ];
    },
    async run(id) {
      if (id === "10") return build;
      const run = runs.get(id);
      return changedAttempt && id === "20" ? { ...run, run_attempt: 2 } : run;
    },
    async runArtifacts(id) {
      const artifact = {
        id: "201",
        digest: `sha256:${"e".repeat(64)}`,
        name: "mkw-backup-20-1",
        expired: false,
        created_at: "2026-11-12T10:00:30Z",
        workflow_run: { id },
      };
      return [
        artifact,
        { ...artifact, id: "200", name: "mkw-backup-20-0" },
        ...(ambiguousBackup ? [{ ...artifact, id: "202" }] : []),
      ];
    },
    async jsonFromArtifact(id, entry) {
      if (["101", "102"].includes(id) && entry === "release-manifest.json")
        return {
          schemaVersion: "1",
          releaseSha: manifestSha,
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
      if (["101", "102"].includes(id) && entry === "build-metadata.json")
        return {
          sourceSha: metadataSha,
          producerRunId: "10",
          producerRunAttempt: "1",
        };
      return readiness;
    },
    async runs(workflow) {
      return [
        {
          id: "999",
          workflow,
          path: `.github/workflows/${workflow}`,
          head_branch: "main",
          event: "workflow_dispatch",
          display_title: "unrelated-success",
          status: "completed",
          conclusion: "success",
        },
        ...[...runs.values()].filter((run) => run.workflow === workflow),
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
        status: "completed",
        conclusion:
          workflow === failedWorkflow
            ? "failure"
            : workflow === "backup.yml"
              ? backupConclusion
              : "success",
        mutation_started: false,
        run_attempt: 1,
        run_started_at: "2026-11-12T10:00:00Z",
        updated_at: "2026-11-12T10:59:59Z",
      });
    },
    async pause() {},
    now() {
      return Date.parse("2026-11-11T12:00:00Z");
    },
  };
}

test("behaviorally dispatches backup before deploy and verify with exact IDs and canonical ref", async () => {
  const api = fakeApi();
  const result = await coordinateRelease(
    {
      sha: SHA,
      mode: "release",
      kind: "BACKUP",
      correlationId: "coord-1",
      repository: "org/repo",
      maxAgeMs: 24 * 3600e3,
      target: input().target,
    },
    api,
  );
  assert.deepEqual(
    api.dispatches.map((x) => x.workflow),
    ["backup.yml", "deploy.yml", "post-deploy-verify.yml"],
  );
  assert.equal(api.dispatches[0].ref, "main");
  assert.equal(api.dispatches[1].fields.release_artifact_id, "101");
  assert.equal(api.dispatches[1].fields.backup_artifact_id, "201");
  assert.equal(result.verify.runId, "40");
});

function mixedCandidates(latestConclusion = "success", options = {}) {
  const api = fakeApi(options);
  const list = api.listArtifacts;
  const artifact = api.artifact;
  const readRun = api.run;
  const readJson = api.jsonFromArtifact;
  const archiveReads = [];
  const invalidRuns = [
    { path: ".github/workflows/untrusted.yml" },
    { event: "workflow_dispatch" },
    { head_branch: "untrusted" },
    {
      path: ".github/workflows/main-release.yml",
      event: "push",
      head_sha: "f".repeat(40),
    },
    {
      path: ".github/workflows/main-release.yml",
      event: "push",
      head_sha: SHA,
      referenced_workflows: [
        {
          path: "org/repo/.github/workflows/build-release.yml@refs/heads/main",
          sha: SHA,
          ref: "refs/heads/untrusted",
        },
      ],
    },
  ];
  const invalidArtifacts = (template) =>
    invalidRuns.map((_, index) => ({
      ...template,
      id: String(110 + index),
      workflow_run: { id: String(50 + index) },
    }));
  api.listArtifacts = async () => {
    const artifacts = await list();
    return [...invalidArtifacts(artifacts[0]), ...artifacts];
  };
  api.artifact = async (id) =>
    (await api.listArtifacts()).find((item) => item.id === id) ??
    artifact.call(api, id);
  api.run = async (id, attempt) => {
    if (Number(id) >= 50 && Number(id) < 50 + invalidRuns.length)
      return { ...(await readRun("10")), id, ...invalidRuns[Number(id) - 50] };
    const run = await readRun(id, attempt);
    return id === "10" && attempt === undefined
      ? {
          ...run,
          run_attempt: 2,
          status:
            latestConclusion === "in_progress" ? "in_progress" : "completed",
          conclusion:
            latestConclusion === "in_progress" ? null : latestConclusion,
        }
      : run;
  };
  api.jsonFromArtifact = async (id, entry) => {
    archiveReads.push(id);
    if (Number(id) >= 110 && Number(id) < 110 + invalidRuns.length) {
      const value = await readJson("101", entry);
      return entry === "build-metadata.json"
        ? { ...value, producerRunId: String(Number(id) - 60) }
        : value;
    }
    return readJson(id, entry);
  };
  return { api, archiveReads };
}

for (const latest of ["success", "failure", "in_progress"])
  test(`discovery excludes noncanonical same-name candidates with latest canonical rerun ${latest}`, async () => {
    const { api, archiveReads } = mixedCandidates(latest);
    const result = await coordinateRelease(input(), api);
    assert.equal(result.release.artifactId, "101");
    assert.equal(result.release.runAttempt, "1");
    assert.equal(
      archiveReads.some((id) => Number(id) >= 110 && Number(id) < 115),
      false,
    );
    assert.deepEqual(
      api.dispatches.map((call) => call.workflow),
      ["backup.yml", "deploy.yml", "post-deploy-verify.yml"],
    );
  });

for (const mutation of [
  "run-id",
  "attempt",
  "metadata",
  "malformed",
  "digest",
  "ambiguous",
])
  test(`candidate filtering preserves rejection of canonical ${mutation}`, async () => {
    const { api } = mixedCandidates("failure", {
      ambiguousRelease: true,
    });
    const readRun = api.run;
    const readJson = api.jsonFromArtifact;
    api.run = async (id, attempt) => {
      const run = await readRun(id, attempt);
      if (id !== "10") return run;
      return {
        ...run,
        ...(mutation === "run-id" ? { id: "11" } : {}),
        ...(mutation === "attempt" && attempt !== undefined
          ? { run_attempt: 2 }
          : {}),
      };
    };
    api.jsonFromArtifact = async (id, entry) => {
      const value = await readJson(id, entry);
      return id === "101" && entry === "build-metadata.json"
        ? {
            ...value,
            ...(mutation === "metadata" ? { producerRunId: "11" } : {}),
            ...(mutation === "malformed"
              ? { producerRunAttempt: undefined }
              : {}),
            ...(mutation === "digest"
              ? { artifactDigest: `sha256:${"f".repeat(64)}` }
              : {}),
          }
        : value;
    };
    await assert.rejects(
      () => coordinateRelease(input(), api),
      /producer|provenance|digest|expected one match/,
    );
    assert.equal(api.dispatches.length, 0);
  });

test("backup failure or stale readiness prevents deploy and verification dispatch", async () => {
  for (const api of [
    fakeApi({ backupConclusion: "failure" }),
    fakeApi({ stale: true }),
  ]) {
    await assert.rejects(() =>
      coordinateRelease(
        {
          sha: SHA,
          mode: "release",
          kind: "BACKUP",
          correlationId: "coord-2",
          repository: "org/repo",
          maxAgeMs: 24 * 3600e3,
          target: input().target,
        },
        api,
      ),
    );
    assert.deepEqual(
      api.dispatches.map((x) => x.workflow),
      ["backup.yml"],
    );
  }
});

for (const kind of ["BACKUP", "INITIAL_EMPTY_DEPLOYMENT"]) {
  test(`F1: dispatches fresh ${kind} without pre-existing backup then waits exact run`, async () => {
    const api = fakeApi({ kind });
    const result = await coordinateRelease(input(kind), api);
    assert.equal(result.backup.runId, "20");
    assert.equal(result.backup.attempt, "1");
    assert.equal(api.dispatches[0].fields.kind, kind);
    for (const call of api.dispatches) {
      assert.equal(call.ref, "main");
      assert.equal(call.fields.release_sha, SHA);
    }
  });
}
for (const [failedWorkflow, expectedCalls] of [
  ["deploy.yml", 2],
  ["post-deploy-verify.yml", 3],
]) {
  test(`F2: ${failedWorkflow} failure rejects coordinator despite unrelated successful run`, async () => {
    const api = fakeApi({ failedWorkflow });
    await assert.rejects(() => coordinateRelease(input(), api), /failed/);
    assert.equal(api.dispatches.length, expectedCalls);
  });
}
test("F3: stale empty evidence rejects before deployment even with fresh createdAt", async () => {
  const api = fakeApi({ kind: "INITIAL_EMPTY_DEPLOYMENT", staleEmpty: true });
  await assert.rejects(
    () => coordinateRelease(input("INITIAL_EMPTY_DEPLOYMENT"), api),
    /empty evidence/,
  );
  assert.equal(api.dispatches.length, 1);
});
test("F4: changed backup attempt and multiple exact artifacts reject before deploy", async () => {
  for (const options of [{ changedAttempt: true }, { ambiguousBackup: true }]) {
    const api = fakeApi(options);
    await assert.rejects(
      () => coordinateRelease(input(), api),
      /identity changed|expected one match/,
    );
    assert.equal(api.dispatches.length, 1);
  }
});
test("F6: manifest/source SHA mismatches and ambiguous release artifacts fail before backup", async () => {
  for (const options of [
    { manifestSha: "c".repeat(40) },
    { metadataSha: "c".repeat(40) },
    { ambiguousRelease: true },
  ]) {
    const api = fakeApi(options);
    await assert.rejects(
      () => coordinateRelease(input(), api),
      /source SHA|source SHA linkage/,
    );
    assert.equal(api.dispatches.length, 0);
  }
});
for (const mode of ["dry-run", "bootstrap"]) {
  test(`verification is still awaited in ${mode}, with preflight mode explicit`, async () => {
    const api = fakeApi();
    await coordinateRelease(input("BACKUP", mode), api);
    assert.equal(api.dispatches[2].fields.mode, mode);
  });
}
test("consumer workflows preserve production approvals and download only exact IDs", async () => {
  for (const workflow of ["deploy", "post-deploy-verify"]) {
    const yaml = await readFile(`.github/workflows/${workflow}.yml`, "utf8");
    assert.match(yaml, /environment:.*production-recovery.*production/);
    assert.match(yaml, /artifact-ids: \$\{\{ inputs.release_artifact_id \}\}/);
    assert.doesNotMatch(yaml, /name: mkw-release-/);
  }
  const deploy = await readFile(".github/workflows/deploy.yml", "utf8");
  assert.match(deploy, /artifact-ids: \$\{\{ inputs.backup_artifact_id \}\}/);
  assert.match(
    deploy,
    /node policy\/scripts\/product\/release\/validate-backup-ready\.mjs/,
  );
});

test("F5: a historical permissive validator cannot participate in trusted resolution", async () => {
  const api = fakeApi({ stale: true });
  const original = api.jsonFromArtifact;
  const reads = [];
  api.jsonFromArtifact = async (id, entry) => {
    reads.push(entry);
    // A release archive may contain arbitrary old source; it must remain data.
    if (entry.endsWith(".mjs"))
      throw new Error("candidate code must not execute");
    return original(id, entry);
  };
  await assert.rejects(() => coordinateRelease(input(), api), /older than/);
  assert.deepEqual(reads, [
    "release-manifest.json",
    "build-metadata.json",
    "backup-ready.json",
    "backup-ready.json",
  ]);
  assert.equal(api.dispatches.length, 1);
});

test("waiting for a pending exact run gates later dispatches", async () => {
  const api = fakeApi();
  const original = api.run;
  let polls = 0;
  api.run = async (id) => {
    const result = await original(id);
    if (id === "30" && polls++ < 2) {
      assert.equal(api.dispatches.length, 2);
      return { ...result, status: "in_progress", conclusion: null };
    }
    return result;
  };
  await coordinateRelease(input(), api);
  assert.equal(polls, 3);
});

test("unreadable or missing exact backup artifact cannot fall back to another run", async () => {
  for (const broken of ["missing", "unreadable"]) {
    const api = fakeApi();
    if (broken === "missing") api.runArtifacts = async () => [];
    else {
      const original = api.jsonFromArtifact;
      api.jsonFromArtifact = async (id, entry) => {
        if (id === "201") throw new Error("unreadable artifact");
        return original(id, entry);
      };
    }
    await assert.rejects(
      () => coordinateRelease(input(), api),
      /expected one match|unreadable/,
    );
    assert.equal(api.dispatches.length, 1);
  }
});

for (const mismatch of [
  "host",
  "database",
  "backup-target",
  "missing-backup-target",
  "empty-target",
  "empty-database",
]) {
  test(`I-03: coordinator rejects wrong ${mismatch} before deploy`, async () => {
    const kind = mismatch.startsWith("empty")
      ? "INITIAL_EMPTY_DEPLOYMENT"
      : "BACKUP";
    const api = fakeApi({ kind });
    if (mismatch === "host")
      api.readiness.databaseIdentity = {
        ...api.readiness.databaseIdentity,
        host: "other-host",
      };
    if (mismatch === "database")
      api.readiness.databaseIdentity = {
        ...api.readiness.databaseIdentity,
        name: "other-database",
      };
    if (mismatch === "empty-target")
      api.readiness.emptyEvidence.targetIdentity = "other-target";
    if (mismatch === "backup-target")
      api.readiness.databaseIdentity.targetIdentity = "other-target";
    if (mismatch === "missing-backup-target")
      delete api.readiness.databaseIdentity.targetIdentity;
    if (mismatch === "empty-database")
      api.readiness.emptyEvidence.databaseIdentity = "other-database";
    await assert.rejects(
      () => coordinateRelease(input(kind), api),
      /target|database/,
    );
    assert.equal(api.dispatches.length, 1);
  });
}

for (const cancel of ["supported", "unavailable", "failed"]) {
  test(`M-01: stage timeout (${cancel} cancel) surfaces active run and never dispatches verify`, async () => {
    const api = fakeApi();
    const original = api.run;
    let clock = api.now();
    api.now = () => clock;
    let pauses = 0;
    api.pause = async () => {
      clock += 5000;
      assert.ok(++pauses < 10, "deadline must bound polling");
    };
    api.run = async (id) =>
      id === "30"
        ? { ...(await original(id)), status: "in_progress", conclusion: null }
        : original(id);
    const cancelled = [];
    if (cancel !== "unavailable")
      api.cancelRun = async (id) => {
        cancelled.push(id);
        if (cancel === "failed") throw new Error("denied");
      };
    if (cancel !== "unavailable") api.canCancelRun = async () => true;
    await assert.rejects(
      () =>
        coordinateRelease(
          {
            ...input(),
            timeouts: {
              totalMs: 25000,
              discoveryMs: 5000,
              stages: {
                "backup.yml": 10000,
                "deploy.yml": 10000,
                "post-deploy-verify.yml": 10000,
              },
            },
          },
          api,
        ),
      (error) => {
        assert.match(error.message, /timed out/);
        assert.match(
          error.message,
          /https:\/\/github.com\/org\/repo\/actions\/runs\/30/,
        );
        assert.match(
          error.message,
          cancel === "supported" ? /cancel requested/ : /may still be active/,
        );
        return true;
      },
    );
    assert.equal(pauses, 2);
    assert.deepEqual(cancelled, cancel === "unavailable" ? [] : ["30"]);
    assert.equal(api.dispatches.length, 2);
  });
}

test("M-01: total deadline includes source resolution and prevents first dispatch", async () => {
  const api = fakeApi();
  let clock = api.now();
  api.now = () => clock;
  const original = api.jsonFromArtifact;
  api.jsonFromArtifact = async (...args) => {
    clock += 15000;
    return original(...args);
  };
  await assert.rejects(
    () => coordinateRelease({ ...input(), timeouts: { totalMs: 10000 } }, api),
    /total.*timed out/,
  );
  assert.equal(api.dispatches.length, 0);
});

test("M-01: unknown child discovery timeout surfaces correlation/workflow URL without later dispatch", async () => {
  const api = fakeApi();
  let clock = api.now();
  api.now = () => clock;
  api.runs = async () => [];
  api.pause = async () => {
    clock += 5000;
  };
  await assert.rejects(
    () =>
      coordinateRelease({ ...input(), timeouts: { discoveryMs: 5000 } }, api),
    /child may still be active; correlation=coord-1-backup; inspect https:\/\/github.com\/org\/repo\/actions\/workflows\/backup.yml/,
  );
  assert.equal(api.dispatches.length, 1);
});

test("M-01: API latency cannot accept a child completion beyond its stage deadline", async () => {
  const api = fakeApi();
  let clock = api.now();
  api.now = () => clock;
  const original = api.run;
  api.run = async (id) => {
    if (id === "30") clock += 11000;
    return original(id);
  };
  await assert.rejects(
    () =>
      coordinateRelease(
        {
          ...input(),
          timeouts: {
            stages: {
              "backup.yml": 10000,
              "deploy.yml": 10000,
              "post-deploy-verify.yml": 10000,
            },
          },
        },
        api,
      ),
    /conclusion timed out/,
  );
  assert.equal(api.dispatches.length, 2);
});

test("M-01: timed out polling API cancels known active child and reports its URL", async () => {
  const api = fakeApi();
  const original = api.run;
  api.run = async (id) => {
    if (id === "30")
      throw Object.assign(new Error("command timed out"), {
        killed: true,
        signal: "SIGTERM",
      });
    return original(id);
  };
  const cancelled = [];
  api.cancelRun = async (id) => {
    cancelled.push(id);
  };
  api.canCancelRun = async () => true;
  await assert.rejects(
    () => coordinateRelease(input(), api),
    /https:\/\/github.com\/org\/repo\/actions\/runs\/30; cancel requested/,
  );
  assert.deepEqual(cancelled, ["30"]);
  assert.equal(api.dispatches.length, 2);
});
