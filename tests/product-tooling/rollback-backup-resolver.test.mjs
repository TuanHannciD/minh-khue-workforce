import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = join(
  import.meta.dirname,
  "../../scripts/product/release/resolve-rollback-backup.mjs",
);
const resolver = await import(pathToFileURL(modulePath)).catch(() => ({}));
const now = "2026-11-16T10:00:00Z";
const target = {
  host: "fixture-db",
  database: "mkw",
  targetIdentity: "fixture-db//home/deploy/mkw/mkw",
};
const input = {
  repository: "org/repo",
  dispatchRef: "refs/heads/main",
  runId: "10",
  runAttempt: "2",
  artifactId: "101",
  target,
  now,
  maxAgeSeconds: 86400,
};
const digest = `sha256:${"d".repeat(64)}`;
const readiness = {
  schemaVersion: "1",
  kind: "BACKUP",
  backupId: "mkw-10-2-release",
  releaseSha: "b".repeat(40),
  createdAt: "2026-11-16T09:00:00Z",
  retentionUntil: "2026-12-16T09:00:00Z",
  dumpSha256: "c".repeat(64),
  size: 42,
  restoreVerified: true,
  storageLocation: "github-actions-artifact:fixture",
  databaseIdentity: {
    host: target.host,
    name: target.database,
    engine: "postgresql",
    targetIdentity: target.targetIdentity,
  },
};
function api(patch = {}) {
  let reads = 0;
  return {
    async artifact(id) {
      assert.equal(id, "101");
      return {
        id,
        expired: false,
        name: "mkw-backup-10-2",
        workflow_run: { id: "10" },
        digest:
          ++reads > 1 && patch.changedDigest
            ? `sha256:${"e".repeat(64)}`
            : digest,
        ...patch.artifact,
      };
    },
    async run(id, attempt) {
      assert.equal(id, "10");
      assert.equal(attempt, "2");
      return {
        id,
        run_attempt: 2,
        head_sha: "c".repeat(40),
        path: ".github/workflows/backup.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
        ...patch.run,
      };
    },
    async jsonFromArtifact(id, entry) {
      assert.equal(id, "101");
      assert.equal(entry, "backup-ready.json");
      if (patch.archiveError)
        throw new Error(
          "artifact archive checksum does not match trusted digest",
        );
      return structuredClone({ ...readiness, ...patch.readiness });
    },
  };
}
test("rollback snapshot is independent of old application SHA and producer head SHA", async () => {
  assert.equal(typeof resolver.resolveRollbackBackup, "function");
  const resolved = await resolver.resolveRollbackBackup(input, api());
  assert.equal(resolved.snapshotSha, "b".repeat(40));
  assert.notEqual(resolved.snapshotSha, "a".repeat(40));
  assert.deepEqual(resolved, {
    workflowPath: ".github/workflows/backup.yml",
    artifactId: "101",
    artifactName: "mkw-backup-10-2",
    runId: "10",
    runAttempt: "2",
    artifactDigest: digest,
    backupId: "mkw-10-2-release",
    snapshotSha: readiness.releaseSha,
    target,
    freshness: {
      createdAt: readiness.createdAt,
      retentionUntil: readiness.retentionUntil,
      checkedAt: now,
      maxAgeSeconds: 86400,
    },
    readiness,
  });
  resolver.verifyDownloadedRollbackBackup(
    resolved,
    Object.fromEntries(Object.entries(readiness).reverse()),
    { now, maxAgeSeconds: 86400 },
  );
});
for (const [label, patch, changedInput] of [
  ["workflow", { run: { path: ".github/workflows/spoof.yml" } }],
  ["event", { run: { event: "push" } }],
  ["branch", { run: { head_branch: "feature" } }],
  ["status", { run: { status: "in_progress" } }],
  ["conclusion", { run: { conclusion: "failure" } }],
  ["run", { run: { id: "11" } }],
  ["attempt", { run: { run_attempt: 3 } }],
  ["ownership", { artifact: { workflow_run: { id: "11" } } }],
  ["artifact ID", { artifact: { id: "102" } }],
  ["name", { artifact: { name: "mkw-backup-11-2" } }],
  ["expired", { artifact: { expired: true } }],
  ["digest", { artifact: { digest: "d".repeat(64) } }],
  ["changed digest", { changedDigest: true }],
  ["archive checksum", { archiveError: true }],
  ["backupId", { readiness: { backupId: "mkw-10-1-release" } }],
  ["stale", { readiness: { createdAt: "2026-11-14T09:00:00Z" } }],
  ["future", { readiness: { createdAt: "2026-11-16T11:00:00Z" } }],
  ["retention", { readiness: { retentionUntil: now } }],
  ["empty", { readiness: { kind: "INITIAL_EMPTY_DEPLOYMENT" } }],
  [
    "target",
    {
      readiness: {
        databaseIdentity: { ...readiness.databaseIdentity, host: "other" },
      },
    },
  ],
  ["restore", { readiness: { restoreVerified: false } }],
  ["supplied attempt", {}, { runAttempt: "3" }],
  ["supplied digest", {}, { artifactDigest: `sha256:${"f".repeat(64)}` }],
  ["dispatch", {}, { dispatchRef: "refs/heads/feature" }],
])
  test(`canonical rollback snapshot rejects ${label}`, async () => {
    assert.equal(typeof resolver.resolveRollbackBackup, "function");
    await assert.rejects(() =>
      resolver.resolveRollbackBackup({ ...input, ...changedInput }, api(patch)),
    );
  });
for (const [field, value] of Object.entries({
  dumpSha256: "e".repeat(64),
  size: 43,
  storageLocation: "github-actions-artifact:other",
  releaseSha: "a".repeat(40),
  backupId: "mkw-10-3-release",
  createdAt: "2026-11-16T08:00:00Z",
  retentionUntil: "2026-12-17T09:00:00Z",
}))
  test(`downloaded rollback snapshot must equal canonical ${field}`, async () => {
    assert.equal(typeof resolver.resolveRollbackBackup, "function");
    const resolved = await resolver.resolveRollbackBackup(input, api());
    assert.throws(() =>
      resolver.verifyDownloadedRollbackBackup(
        resolved,
        { ...readiness, [field]: value },
        { now, maxAgeSeconds: 86400 },
      ),
    );
  });
test("downloaded equality accepts object key order and rechecks trusted freshness", async () => {
  assert.equal(typeof resolver.resolveRollbackBackup, "function");
  const resolved = await resolver.resolveRollbackBackup(input, api());
  const reordered = Object.fromEntries(Object.entries(readiness).reverse());
  resolver.verifyDownloadedRollbackBackup(resolved, reordered, {
    now,
    maxAgeSeconds: 86400,
  });
  assert.throws(() =>
    resolver.verifyDownloadedRollbackBackup(resolved, readiness, {
      now: "2026-11-18T10:00:00Z",
      maxAgeSeconds: 86400,
    }),
  );
});
test("verify CLI rejects duplicate-key downloaded JSON and changed canonical target with exit78", async (t) => {
  assert.equal(typeof resolver.resolveRollbackBackup, "function");
  const dir = await mkdtemp(join(tmpdir(), "mkw-rollback-snapshot-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const current = {
    ...readiness,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    retentionUntil: new Date(Date.now() + 86400000 * 7).toISOString(),
  };
  const resolved = await resolver.resolveRollbackBackup(
    { ...input, now: new Date().toISOString() },
    api({ readiness: current }),
  );
  await writeFile(join(dir, "resolved.json"), JSON.stringify(resolved));
  for (const [value, status] of [
    [JSON.stringify(current), 0],
    [JSON.stringify(current).replace('"size":42', '"size":42,"size":42'), 78],
    [JSON.stringify({ ...current, size: 43 }), 78],
  ]) {
    await writeFile(join(dir, "downloaded.json"), value);
    const result = spawnSync(
      process.execPath,
      [
        modulePath,
        "verify",
        "--resolved",
        join(dir, "resolved.json"),
        "--downloaded",
        join(dir, "downloaded.json"),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          MKW_SSH_HOST: target.host,
          TARGET_DATABASE: target.database,
          TARGET_IDENTITY: target.targetIdentity,
        },
      },
    );
    assert.equal(result.status, status, result.stderr);
    assert.doesNotMatch(result.stderr, /stack|fixture-db|dumpSha256/);
  }
});
