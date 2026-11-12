import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures/auto-rollback.mjs";
import { selectApiReuse } from "../../scripts/product/release/select-api-reuse.mjs";
import { apiSourceFingerprint } from "../../scripts/product/release/gateway-policy.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const d = "sha256:" + "1".repeat(64);
function source() {
  const f = fixture();
  const previous = f.state.previousState;
  previous.manifest.buildInputs = {
    apiSourceFingerprint: d,
    apiSourceSha: previous.releaseSha,
  };
  previous.runtimeServices = {
    api: {
      containerId: "a".repeat(64),
      image: previous.manifest.apiImage,
      imageId: d,
      startedAt: previous.verifiedAt,
      restartCount: 0,
    },
    db: {
      containerId: "c".repeat(64),
      image: previous.manifest.postgresImage,
      imageId: previous.database.postgresImageId,
      startedAt: previous.verifiedAt,
      restartCount: 0,
    },
  };
  const api = {
    artifact: async () => ({
      id: "42",
      workflow_run: { id: "41" },
      expired: false,
      name: `mkw-release-${previous.releaseSha}`,
      digest: previous.ownership.artifactDigest,
    }),
    run: async () => ({
      id: "41",
      run_attempt: "1",
      path: ".github/workflows/build-release.yml",
      event: "workflow_run",
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      repository: { full_name: "owner/repo" },
      head_repository: { full_name: "owner/repo" },
    }),
    jsonFromArtifact: async (_, entry) =>
      entry === "release-manifest.json"
        ? structuredClone(previous.manifest)
        : {
            sourceSha: previous.releaseSha,
            apiDigest: previous.manifest.apiImage.split("@")[1],
          },
  };
  const input = {
    previous,
    sha: f.expectedSha,
    repository: f.repository,
    postgresImage: previous.manifest.postgresImage,
    fingerprintAt: () => d,
    verifyAttestation: async () => true,
    inspectApi: async () => ({
      image: previous.manifest.apiImage,
      revision: previous.releaseSha,
      source: "https://github.com/owner/repo",
    }),
  };
  return { input, api };
}
test("real reuse selector binds canonical previous image to identical source and origin label", async () => {
  const { input, api } = source();
  const result = await selectApiReuse(input, api);
  assert.equal(result.mode, "gateway-only");
  assert.equal(result.apiImage, input.previous.manifest.apiImage);
  assert.equal(result.apiSourceSha, "b".repeat(40));
});
test("reuse refuses forged ownership/source/provenance even when image digests match", async () => {
  const changes = [
    (x) => (x.previous.ownership.runAttempt = "2"),
    (x) => (x.previous.ownership.artifactId = "999"),
    (x) => (x.verifyAttestation = async () => false),
    (x) =>
      (x.inspectApi = async () => ({
        image: x.previous.manifest.apiImage,
        revision: "e".repeat(40),
        source: "https://github.com/owner/repo",
      })),
  ];
  for (const [index, change] of changes.entries()) {
    const { input, api } = source();
    change(input);
    await assert.rejects(
      selectApiReuse(input, api),
      undefined,
      `mutation ${index}`,
    );
  }
});
test("API changing inputs and legacy state select normal build without arbitrary digest reuse", async () => {
  const { input, api } = source();
  const result = await selectApiReuse(
    {
      ...input,
      fingerprintAt: (ref) =>
        ref === input.sha ? "sha256:" + "2".repeat(64) : d,
    },
    api,
  );
  assert.equal(result.mode, "build");
  assert.equal(result.apiImage, undefined);
  assert.equal(
    (await selectApiReuse({ ...input, previous: null }, api)).mode,
    "build",
  );
});
test("committed-tree fingerprint changes for API/config/unknown inputs but allows Web-only revisions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mkw-reuse-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  git("init");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  for (const dir of ["apps/api", "apps/web", "deploy"])
    await mkdir(join(root, dir), { recursive: true });
  for (const path of [
    "apps/api/api.ts",
    "apps/web/web.ts",
    "deploy/Dockerfile.api",
    "package.json",
  ])
    await writeFile(join(root, path), "one\n");
  git("add", ".");
  git("commit", "-m", "A");
  const a = git("rev-parse", "HEAD");
  await writeFile(join(root, "apps/web/web.ts"), "two\n");
  git("add", ".");
  git("commit", "-m", "B");
  assert.equal(apiSourceFingerprint(root, a), apiSourceFingerprint(root));
  await writeFile(join(root, "unknown-input"), "future Docker input\n");
  git("add", ".");
  git("commit", "-m", "C");
  assert.notEqual(apiSourceFingerprint(root, a), apiSourceFingerprint(root));
});
