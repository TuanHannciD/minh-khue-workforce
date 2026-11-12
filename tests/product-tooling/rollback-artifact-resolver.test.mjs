import assert from "node:assert/strict";
import test from "node:test";
import { resolveExactRelease } from "../../scripts/product/release/resolve-release.mjs";

const sha = "a".repeat(40);
const input = {
  sha,
  repository: "org/repo",
  artifactId: "101",
  runId: "10",
  dispatchRef: "refs/heads/main",
};
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
function api(patch = {}) {
  return {
    async artifact(id) {
      assert.equal(id, "101");
      return {
        id: "101",
        digest: `sha256:${"d".repeat(64)}`,
        name: `mkw-release-${sha}`,
        expired: false,
        created_at: "2026-11-12T10:00:30Z",
        workflow_run: { id: "10" },
        ...patch.artifact,
      };
    },
    async run(id) {
      assert.equal(id, "10");
      return {
        id: "10",
        run_attempt: "1",
        run_started_at: "2026-11-12T10:00:00Z",
        updated_at: "2026-11-12T10:59:59Z",
        path: ".github/workflows/build-release.yml",
        event: "workflow_run",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
        ...patch.run,
      };
    },
    async jsonFromArtifact(id, entry) {
      assert.equal(id, "101");
      return entry === "release-manifest.json"
        ? { ...manifest, ...patch.manifest }
        : {
            sourceSha: sha,
            producerRunId: "10",
            producerRunAttempt: "1",
            ...patch.metadata,
          };
    },
  };
}
test("I-01: exact rollback artifact from canonical successful producer resolves", async () => {
  assert.deepEqual(await resolveExactRelease(input, api()), {
    artifactId: "101",
    runId: "10",
    runAttempt: "1",
    artifactDigest: `sha256:${"d".repeat(64)}`,
  });
});
for (const patch of [
  { artifact: { expired: true } },
  { artifact: { workflow_run: { id: "11" } } },
  { artifact: { id: "102" } },
  { run: { path: ".github/workflows/spoof.yml" } },
  { run: { head_branch: "untrusted" } },
  { run: { conclusion: "failure" } },
  { manifest: { releaseSha: "b".repeat(40) } },
  { manifest: { sourceRepository: "other/repo" } },
  { metadata: { sourceSha: "b".repeat(40) } },
])
  test(`I-01: rejects spoof/expired/ownership/source linkage ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(
      () => resolveExactRelease(input, api(patch)),
      /artifact|producer|linkage/,
    );
  });
test("I-01: untrusted dispatch ref fails before any artifact API read", async () => {
  await assert.rejects(
    () =>
      resolveExactRelease(
        { ...input, dispatchRef: "refs/heads/feature" },
        {
          artifact() {
            assert.fail("must fail before API/SSH");
          },
        },
      ),
    /canonical main/,
  );
});
