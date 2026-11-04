import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("focused attendance route acquires one Task10 sandbox and runs only race/clamp with cleanup", async () => {
  const runDir = await mkdtemp(
    resolve(process.env.MKW_PRODUCT_EVIDENCE_ROOT, "route-"),
  );
  const child = spawn(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "./tests/product-e2e/focused-route-preload.mjs",
      "scripts/product/e2e.mjs",
      "--attendance-race-clamp",
    ],
    {
      windowsHide: true,
      env: { ...process.env, MKW_PRODUCT_EVIDENCE_ROOT: runDir },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const code = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  await writeFile(resolve(runDir, "process.log"), output);
  assert.equal(code, 0, output);
  assert.deepEqual(
    (await readFile(resolve(runDir, "route.log"), "utf8")).trim().split("\n"),
    [
      "sandbox-start",
      "browser-start",
      "focused-test",
      "browser-close",
      "sandbox-stop",
    ],
  );
});
