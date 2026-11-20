import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  assert.ok(
    fast.includes("ci-check-plan.test.mjs"),
    "unclassified new tests default to fast",
  );
  assert.ok(fast.includes("ci-parity-failures.test.mjs"));
  assert.deepEqual([...new Set(full)].sort(), full);
});

test("unknown runner options fail instead of silently selecting the wrong coverage", () => {
  const result = spawnSync(process.execPath, [runner, "--typo", "--list"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
});

test("default rehearsal discovery never attempts a Docker command", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mkw-discovery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const marker = join(directory, "docker-called");
  const guard = join(directory, "guard.cjs");
  await writeFile(
    guard,
    `const cp=require('node:child_process');const fs=require('node:fs');for(const name of ['spawn','spawnSync','execFile','execFileSync','exec','execSync']){const original=cp[name];cp[name]=function(bin,...args){if(/(?:^|[\\\\/])docker(?:\\.exe)?$/.test(String(bin))){fs.writeFileSync(${JSON.stringify(marker)},'called');throw Error('unexpected Docker acquisition');}return original.call(this,bin,...args);};}require('node:module').syncBuiltinESMExports();`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      guard,
      "--test",
      resolve("tests/product-tooling/deploy-account-rehearsal.test.mjs"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const { access } = await import("node:fs/promises");
  await assert.rejects(access(marker), { code: "ENOENT" });
});
