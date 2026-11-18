import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runner = "scripts/ci/run-product-tooling.mjs";
const list = (extra = []) => {
  const result = spawnSync(process.execPath, [runner, "--list", ...extra], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("fast and release tooling inventories cover the complete suite without overlap", () => {
  const fast = list().files;
  const full = list(["--full"]).files;
  const release = list(["--release"]).files;
  assert.ok(full.length > fast.length);
  assert.deepEqual([...fast, ...release].sort(), full);
  assert.equal(fast.filter((file) => release.includes(file)).length, 0);
  for (const file of [
    "production-account-script.test.mjs",
    "bootstrap-runtime.test.mjs",
    "deploy-config.test.mjs",
    "deploy-publish.test.mjs",
    "compose-service-map.test.mjs",
    "auto-rollback-behavior.test.mjs",
    "push-main-workflow-policy.test.mjs",
  ]) {
    assert.ok(release.includes(file), `${file} belongs to release validation`);
    assert.ok(
      !fast.includes(file),
      `${file} must not block ordinary PR checks`,
    );
  }
  assert.ok(fast.includes("benchmark-delivery.test.mjs"));
  assert.ok(fast.includes("types.test.mjs"));
  assert.deepEqual([...new Set(full)].sort(), full);
});

test("unknown runner options fail instead of silently selecting the wrong coverage", () => {
  const result = spawnSync(process.execPath, [runner, "--typo", "--list"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
});
