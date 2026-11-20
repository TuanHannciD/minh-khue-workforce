import { readFile } from "node:fs/promises";

const digest = /^sha256:[a-f0-9]{64}$/;
const imageReference = /^[^\s@]+@sha256:[a-f0-9]{64}$/;
const requiredImages = [
  "worker",
  "cli",
  "dind",
  "nodeAlpine",
  "registry",
  "apiBuildBase",
  "webRuntimeBase",
];
const requiredPackages = [
  "bash",
  "coreutils",
  "util-linux",
  "curl",
  "openssl",
  "git",
  "jq",
  "tar",
  "libstdc++",
  "procps",
];
const requiredExecutables = [
  "node",
  "pnpm",
  "docker",
  "compose",
  "flock",
  "ps",
  "bash",
  "openssl",
  "jq",
  "git",
  "tar",
];
const fetchFailurePattern =
  /network|timeout|timed out|tls|temporary failure|failed to fetch|failed to resolve|manifest|registry|download|connection reset|no such host|pull access|connection refused|apk index/i;

export function classifyEnvironmentFailure({
  fetch = false,
  output = "",
} = {}) {
  return fetch && fetchFailurePattern.test(output) ? "ENVIRONMENT_FETCH" : null;
}

export class EnvironmentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EnvironmentError";
    this.code = code;
    this.details = details;
  }
}

const fail = (code, message, details) => {
  throw new EnvironmentError(code, message, details);
};

function validateLock(lock) {
  if (!lock || typeof lock !== "object" || Array.isArray(lock))
    fail("ENVIRONMENT_LOCK", "environment lock must be an object");
  if (lock.version !== 1) fail("ENVIRONMENT_LOCK", "unsupported lock version");
  if (lock.platform !== "linux/amd64")
    fail("ENVIRONMENT_LOCK", "lock platform must be linux/amd64");
  if (lock.node !== "24.22.1" || lock.pnpm !== "12.15.0")
    fail(
      "ENVIRONMENT_LOCK",
      "lock runtime version is outside the approved floor",
    );
  for (const key of requiredImages) {
    const image = lock.images?.[key];
    if (!image || image.platform !== lock.platform)
      fail("ENVIRONMENT_LOCK", `missing or wrong-platform image ${key}`);
    if (!imageReference.test(image.reference) || !digest.test(image.digest))
      fail("ENVIRONMENT_LOCK", `image ${key} must use an immutable digest`);
    if (image.reference.endsWith(`@${image.digest}`) === false)
      fail("ENVIRONMENT_LOCK", `image ${key} reference/digest mismatch`);
    if (!digest.test(image.platformDigest) || !digest.test(image.configDigest))
      fail("ENVIRONMENT_LOCK", `image ${key} provenance digest is malformed`);
    if (
      typeof image.provenance !== "string" ||
      !image.provenance.startsWith("https://")
    )
      fail("ENVIRONMENT_LOCK", `image ${key} provenance is missing`);
  }
  for (const key of requiredPackages) {
    if (
      typeof lock.packages?.[key] !== "string" ||
      !/^\S+$/.test(lock.packages[key])
    )
      fail("ENVIRONMENT_LOCK", `package ${key} must have an exact version`);
  }
  for (const key of requiredExecutables) {
    if (typeof lock.executables?.[key] !== "string" || !lock.executables[key])
      fail(
        "ENVIRONMENT_LOCK",
        `executable ${key} must have an expected version`,
      );
  }
  if (lock.uid !== 1000) fail("ENVIRONMENT_LOCK", "worker UID must be 1000");
  return lock;
}

export async function readEnvironmentLock(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new EnvironmentError(
      "ENVIRONMENT_LOCK",
      "unable to read environment lock",
      {
        cause: error.code,
      },
    );
  }
  let lock;
  try {
    lock = JSON.parse(text);
  } catch {
    throw new EnvironmentError(
      "ENVIRONMENT_LOCK",
      "environment lock is not valid JSON",
    );
  }
  return validateLock(lock);
}

function actualImageReference(actualImage) {
  if (typeof actualImage === "string") return actualImage;
  return actualImage?.reference ?? actualImage?.digest ?? null;
}

function assertImageAdmission(key, actualImage, expectedImage) {
  if (
    !actualImage ||
    typeof actualImage !== "object" ||
    Array.isArray(actualImage)
  )
    fail(
      "ENVIRONMENT_IMAGE",
      `${key} resolved image admission is missing or malformed`,
      {
        image: key,
        observed: actualImage,
      },
    );
  const resolved = actualImage.resolvedDigest ?? actualImage.resolved;
  if (
    typeof actualImage.platform !== "string" ||
    !/^\w+\/[\w]+$/.test(actualImage.platform) ||
    typeof actualImage.digest !== "string" ||
    !digest.test(actualImage.digest) ||
    typeof resolved !== "string" ||
    !imageReference.test(resolved)
  )
    fail("ENVIRONMENT_IMAGE", `${key} resolved image admission is malformed`, {
      image: key,
    });
  if (actualImage.platform !== expectedImage.platform)
    fail(
      "ENVIRONMENT_PLATFORM",
      `${key} resolved for ${actualImage.platform ?? "unknown"}`,
    );
  if (actualImage.digest !== expectedImage.digest)
    fail("ENVIRONMENT_IMAGE", `${key} digest does not match the lock`, {
      image: key,
      expected: expectedImage.digest,
      observed: actualImage.digest,
    });
  if (
    typeof resolved !== "string" ||
    !resolved.endsWith(`@${expectedImage.digest}`)
  )
    fail("ENVIRONMENT_IMAGE", `${key} resolved digest was not admitted`, {
      image: key,
      expected: expectedImage.digest,
      observed: resolved,
    });
  return true;
}

export function assertEnvironment(actual, lock, options = {}) {
  validateLock(lock);
  if (!actual || typeof actual !== "object")
    fail("ENVIRONMENT_PLATFORM", "runtime admission facts are missing");
  if (actual.platform !== lock.platform)
    fail(
      "ENVIRONMENT_PLATFORM",
      `expected ${lock.platform}, got ${actual.platform ?? "unknown"}`,
    );
  if (actual.uid !== lock.uid)
    fail(
      "ENVIRONMENT_UID",
      `expected UID ${lock.uid}, got ${actual.uid ?? "unknown"}`,
    );
  for (const key of options.executableKeys ?? requiredExecutables) {
    const expected = lock.executables[key];
    const observed = actual.executables?.[key];
    if (observed !== expected)
      fail(
        "ENVIRONMENT_VERSION",
        `${key} expected ${expected}, got ${observed ?? "unknown"}`,
        {
          executable: key,
          expected,
          observed,
        },
      );
  }
  for (const key of options.imageKeys ?? requiredImages) {
    const expected = lock.images[key].reference;
    const image = actual.images?.[key];
    if (typeof image === "object") {
      assertImageAdmission(key, image, lock.images[key]);
      continue;
    }
    const observed = actualImageReference(image);
    if (observed !== expected)
      fail(
        "ENVIRONMENT_IMAGE",
        `${key} expected ${expected}, got ${observed ?? "unknown"}`,
        {
          image: key,
          expected,
          observed,
        },
      );
  }
  for (const key of options.packageKeys ?? requiredPackages) {
    const expected = lock.packages[key];
    const observed = actual.packages?.[key];
    if (observed !== expected)
      fail(
        "ENVIRONMENT_PACKAGE",
        `${key} expected ${expected}, got ${observed ?? "unknown"}`,
        {
          package: key,
          expected,
          observed,
        },
      );
  }
}

export { requiredExecutables, requiredImages, requiredPackages };
