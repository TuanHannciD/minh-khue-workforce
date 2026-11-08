import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";
async function run(script, args) {
  const runDir = await createEvidenceRun(
    resolve(
      process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
        ".agent-runs/MKW-PRODUCT-001/whole-branch-fix-r1",
      "caller-fault-",
    ),
  );
  const child = spawn(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "./tests/product-e2e/caller-fault-preload.mjs",
      script,
      ...args,
    ],
    {
      env: { ...process.env, MKW_PRODUCT_EVIDENCE_ROOT: runDir },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const code = await new Promise((done, reject) => {
    child.on("error", reject);
    child.on("close", done);
  });
  await writeFile(resolve(runDir, "process.log"), output);
  assert.notEqual(code, 0);
  assert.deepEqual(
    (await readFile(resolve(runDir, "calls.log"), "utf8"))
      .trim()
      .split("\n")
      .sort(),
    ["browser-close", "sandbox-stop"],
  );
  return { runDir, output };
}
test("E2E preserves assertion failure alongside both cleanup failures and exits nonzero", async () => {
  const { output } = await run("scripts/product/e2e.mjs", ["--review-r1"]);
  assert.match(output, /injected assertion failure/);
  assert.match(output, /injected browser close failure/);
  assert.match(output, /injected sandbox cleanup failure/);
});
test("benchmark persists FAILED metric and overall report even when sandbox and browser cleanup throw", async () => {
  const { runDir } = await run("scripts/product/benchmark.mjs", ["--sizes=20"]);
  const files = (await readdir(runDir)).filter((name) =>
    /^benchmark-run-.*\.json$/.test(name),
  );
  assert.equal(files.length, 1);
  const report = JSON.parse(await readFile(resolve(runDir, files[0]), "utf8"));
  assert.equal(report.result, "FAILED");
  assert.equal(report.sizes[0].result, "FAILED");
  assert.equal(report.sizes[0].error, "injected measurement failure");
  assert.match(
    report.sizes[0].cleanupError,
    /injected sandbox cleanup failure/,
  );
  assert.match(report.cleanupError, /injected browser close failure/);
});
