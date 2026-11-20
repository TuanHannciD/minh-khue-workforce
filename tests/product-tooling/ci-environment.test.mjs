import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertEnvironment,
  classifyEnvironmentFailure,
  readEnvironmentLock,
} from "../../scripts/ci/environment.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const lockPath = join(root, "scripts/ci/environment-lock.json");

test("environment lock has immutable platform, runtime, image, package, and executable facts", async () => {
  const lock = await readEnvironmentLock(lockPath);
  assert.equal(lock.version, 1);
  assert.equal(lock.platform, "linux/amd64");
  assert.equal(lock.node, "24.22.1");
  assert.equal(lock.pnpm, "12.15.0");
  for (const key of [
    "worker",
    "cli",
    "dind",
    "nodeAlpine",
    "registry",
    "apiBuildBase",
    "webRuntimeBase",
  ]) {
    assert.match(lock.images[key].reference, /@sha256:[a-f0-9]{64}$/);
    assert.equal(lock.images[key].platform, "linux/amd64");
  }
  assert.equal(lock.packages.procps, "4.0.6-r0");
  assert.equal(lock.packages["util-linux"], "2.42.3-r1");
  assert.equal(lock.executables.node, "v24.22.1");
  assert.equal(lock.executables.pnpm, "12.15.0");
});

test("readEnvironmentLock rejects mutable, malformed, wrong-platform, and wrong-version locks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-environment-lock-"));
  const valid = JSON.parse(await readFile(lockPath, "utf8"));
  for (const mutate of [
    (lock) => (lock.images.worker.reference = "node:24.22.1-bookworm"),
    (lock) =>
      (lock.images.worker.reference =
        "node:24.22.1-bookworm@sha256:not-a-digest"),
    (lock) => (lock.platform = "linux/arm64"),
    (lock) => (lock.node = "24.12.0"),
    (lock) => (lock.pnpm = "10.0.0"),
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    const path = join(dir, "candidate.json");
    await writeFile(path, `${JSON.stringify(candidate)}\n`);
    await assert.rejects(
      readEnvironmentLock(path),
      (error) => error.code === "ENVIRONMENT_LOCK",
    );
  }
});

test("fetch failures stay distinct from prerequisite and assertion failures", () => {
  assert.equal(
    classifyEnvironmentFailure({
      fetch: true,
      output:
        "failed to resolve source metadata: temporary failure in name resolution",
    }),
    "ENVIRONMENT_FETCH",
  );
  assert.equal(
    classifyEnvironmentFailure({
      fetch: true,
      output: "unsatisfiable constraints",
    }),
    null,
  );
  assert.equal(
    classifyEnvironmentFailure({ fetch: false, output: "network timeout" }),
    null,
  );
});

test("assertEnvironment reports prerequisite mismatch before product assertions", async () => {
  const lock = await readEnvironmentLock(lockPath);
  const actual = {
    platform: "linux/amd64",
    node: "v24.22.1",
    pnpm: "12.15.0",
    uid: 1000,
    executables: {
      node: "v24.22.1",
      pnpm: "12.15.0",
      docker: "29.9.3",
      compose: "v5.7.1",
      flock: "2.42.3",
      ps: "4.0.6",
      bash: "5.3.9",
      openssl: "3.5.9",
      jq: "1.8.2",
      git: "2.54.1",
      tar: "1.35",
    },
    images: Object.fromEntries(
      Object.entries(lock.images).map(([key, image]) => [key, image.reference]),
    ),
    packages: lock.packages,
  };
  assert.doesNotThrow(() => assertEnvironment(actual, lock));
  assert.throws(
    () => assertEnvironment({ ...actual, platform: "linux/arm64" }, lock),
    (error) => error.code === "ENVIRONMENT_PLATFORM",
  );
  assert.throws(
    () =>
      assertEnvironment(
        { ...actual, executables: { ...actual.executables, node: "v24.12.0" } },
        lock,
      ),
    (error) => error.code === "ENVIRONMENT_VERSION",
  );
});

test("worker UID admission cannot be disabled by an option", async () => {
  const lock = await readEnvironmentLock(lockPath);
  const actual = {
    platform: lock.platform,
    uid: 0,
    executables: lock.executables,
    images: Object.fromEntries(
      Object.entries(lock.images).map(([key, image]) => [key, image.reference]),
    ),
    packages: lock.packages,
  };
  assert.throws(
    () => assertEnvironment(actual, lock, { requireUid: false }),
    (error) => error.code === "ENVIRONMENT_UID",
  );
});

test("assertEnvironment rejects an unresolved or wrong-platform image admission", async () => {
  const lock = await readEnvironmentLock(lockPath);
  const actual = {
    platform: lock.platform,
    uid: 1000,
    executables: lock.executables,
    packages: lock.packages,
    images: {
      worker: {
        digest: lock.images.worker.digest,
        resolvedDigest: "docker.io/library/node@sha256:" + "a".repeat(64),
        platform: lock.platform,
      },
    },
  };
  assert.throws(
    () => assertEnvironment(actual, lock, { imageKeys: ["worker"] }),
    (error) => error.code === "ENVIRONMENT_IMAGE",
  );
  actual.images.worker.resolvedDigest =
    "docker.io/library/node@" + lock.images.worker.digest;
  actual.images.worker.platform = "linux/arm64";
  assert.throws(
    () => assertEnvironment(actual, lock, { imageKeys: ["worker"] }),
    (error) => error.code === "ENVIRONMENT_PLATFORM",
  );
});

test("assertEnvironment rejects null and malformed resolved image admissions", async () => {
  const lock = await readEnvironmentLock(lockPath);
  const base = {
    platform: lock.platform,
    uid: lock.uid,
    executables: lock.executables,
    packages: lock.packages,
  };
  for (const image of [
    undefined,
    null,
    [],
    {},
    42,
    "",
    { platform: lock.platform },
    { digest: lock.images.worker.digest },
    {
      platform: lock.platform,
      digest: lock.images.worker.digest,
      resolvedDigest: "@" + lock.images.worker.digest,
    },
  ]) {
    assert.throws(
      () =>
        assertEnvironment({ ...base, images: { worker: image } }, lock, {
          imageKeys: ["worker"],
        }),
      (error) => error.code === "ENVIRONMENT_IMAGE",
      `malformed worker image should be rejected: ${JSON.stringify(image)}`,
    );
  }
  const image = {
    platform: lock.platform,
    digest: lock.images.worker.digest,
    resolvedDigest: "docker.io/library/node@" + lock.images.worker.digest,
  };
  assert.doesNotThrow(() =>
    assertEnvironment({ ...base, images: { worker: image } }, lock, {
      imageKeys: ["worker"],
    }),
  );
});

test("all worker, rehearsal, product, and registry inputs use lock digests", async () => {
  const lock = await readEnvironmentLock(lockPath);
  const files = [
    "scripts/ci/Dockerfile",
    "scripts/ci/Dockerfile.rehearsal",
    "deploy/Dockerfile.api",
    "deploy/Dockerfile.web",
    "deploy/postgres-image.env",
    "scripts/product/local-rehearsal-engine.mjs",
    "scripts/product/local-rehearsal-driver.mjs",
    "scripts/product/fixtures/registry-image.env",
  ];
  const contents = await Promise.all(
    files.map((file) => readFile(join(root, file), "utf8")),
  );
  for (const [key, image] of Object.entries(lock.images)) {
    assert.ok(
      contents.some((content) => content.includes(image.reference)),
      `${key} digest is not referenced by an owned input`,
    );
  }
  for (const content of contents.slice(0, 4)) {
    assert.doesNotMatch(
      content,
      /^FROM\s+(?:node|docker|nginx|registry|postgres)(?::|\s)(?![^\n]*@sha256:)/im,
    );
  }
  assert.match(contents[2], /node:24\.22\.1-bookworm-slim@sha256:/);
  assert.match(contents[3], /nginx:1\.29-alpine@sha256:/);
});

test("each owned Dockerfile maps its own image fields to the lock", async () => {
  const lock = await readEnvironmentLock(lockPath);
  const files = Object.fromEntries(
    await Promise.all(
      [
        "scripts/ci/Dockerfile",
        "scripts/ci/Dockerfile.rehearsal",
        "deploy/Dockerfile.api",
        "deploy/Dockerfile.web",
        "deploy/postgres-image.env",
        "scripts/product/fixtures/registry-image.env",
      ].map(async (file) => [file, await readFile(join(root, file), "utf8")]),
    ),
  );
  const owners = {
    "scripts/ci/Dockerfile": ["worker", "cli"],
    "scripts/ci/Dockerfile.rehearsal": ["dind", "nodeAlpine"],
    "deploy/Dockerfile.api": ["apiBuildBase"],
    "deploy/Dockerfile.web": ["apiBuildBase", "webRuntimeBase"],
    "deploy/postgres-image.env": ["postgres"],
    "scripts/product/fixtures/registry-image.env": ["registry"],
  };
  for (const [file, keys] of Object.entries(owners)) {
    for (const key of keys)
      assert.ok(
        files[file].includes(lock.images[key].reference),
        `${file} must own ${key}`,
      );
  }
  assert.equal(
    lock.images.postgres.platformDigest,
    "sha256:4717f90960a225c2d1c5dac50508c401230f693ff626e06e84e6db0a68ded508",
  );
});

test("production build and pull paths pin the approved amd64 platform", async () => {
  const files = await Promise.all(
    [
      ".github/workflows/build-release.yml",
      "scripts/product/release/pull-exact-images.sh",
      "scripts/product/release/select-api-reuse.mjs",
    ].map(async (file) => [file, await readFile(join(root, file), "utf8")]),
  );
  const contents = Object.fromEntries(files);
  assert.match(
    contents[".github/workflows/build-release.yml"],
    /platforms:\s*linux\/amd64/,
  );
  assert.match(
    contents["scripts/product/release/pull-exact-images.sh"],
    /docker pull --platform linux\/amd64/,
  );
  assert.match(
    contents["scripts/product/release/select-api-reuse.mjs"],
    /\["pull", "--platform", "linux\/amd64"/,
  );
});
