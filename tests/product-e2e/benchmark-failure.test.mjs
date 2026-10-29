import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("benchmark cannot report PASS when sandbox acquisition fails before measurement", async () => {
  const evidence = resolve(
    process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
      ".agent-runs/MKW-PRODUCT-001/task10-acceptance",
  );
  const run = await createEvidenceRun(
    resolve(evidence, "benchmark-prerequisite-"),
  );
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

test("invalid unrequested retained profile samples fail before sandbox acquisition and retain raw evidence", async () => {
  const run = await createEvidenceRun(
    resolve(".agent-runs/MKW-PRODUCT-001/task10-fix-r1/profile-prerequisite-"),
  );
  const prior = resolve(run, "prior.json");
  const metric = { size: 1000, heapBytes: [100, 101] };
  for (const field of [
    "apiMs",
    "editorMs",
    "inputMs",
    "scrollFramesMs",
    "coldLoadMs",
    "warmLoadMs",
    "renderAfterResponseMs",
  ])
    metric[field] = {
      samples: field === "scrollFramesMs" ? [16.7, -10] : [1, 2],
    };
  const valid20 = structuredClone(metric);
  valid20.size = 20;
  valid20.scrollFramesMs.samples = [16.7, 20];
  const bytes = JSON.stringify({ sizes: [valid20, metric] });
  await writeFile(prior, bytes);
  const child = spawn(
    process.execPath,
    ["scripts/product/benchmark.mjs", "--profile", "--sizes=20"],
    {
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: "0",
        MKW_PRODUCT_EVIDENCE_ROOT: run,
        MKW_BENCHMARK_PRIOR: prior,
        MKW_PRODUCT_CLUSTER_OWNER: resolve(run, "must-not-acquire.json"),
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
  const files = (await readdir(run)).filter((name) =>
    /^benchmark-run-.*\.json$/.test(name),
  );
  assert.equal(files.length, 1);
  const report = JSON.parse(await readFile(resolve(run, files[0]), "utf8"));
  assert.equal(report.result, "FAILED");
  assert.match(report.error, /size1000 scrollFramesMs.*finite nonnegative/);
  assert.deepEqual(report.sizes, []);
  assert.equal(await readFile(prior, "utf8"), bytes);
});
