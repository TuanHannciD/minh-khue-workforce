import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("benchmark cannot report PASS when sandbox acquisition fails before measurement", async () => {
  const evidence = resolve(".agent-runs/MKW-PRODUCT-001/task10-acceptance");
  const run = await mkdtemp(resolve(evidence, "benchmark-prerequisite-"));
  const before = new Set(await readdir(evidence));
  const child = spawn(
    process.execPath,
    ["scripts/product/benchmark.mjs", "--sizes=20"],
    {
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: "0",
        MKW_PRODUCT_CLUSTER_OWNER: resolve(run, "missing-owner.json"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const code = await new Promise((done, reject) => {
    child.on("error", reject);
    child.on("close", done);
  });
  await writeFile(resolve(run, "process.log"), output);
  assert.notEqual(code, 0);
  const files = (await readdir(evidence)).filter(
    (name) => !before.has(name) && /^benchmark-run-.*\.json$/.test(name),
  );
  assert.equal(files.length, 1);
  const report = JSON.parse(
    await readFile(resolve(evidence, files[0]), "utf8"),
  );
  assert.equal(report.result, "FAILED");
  assert.match(report.error, /ENOENT.*missing-owner\.json/);
  assert.deepEqual(report.sizes, []);
});
