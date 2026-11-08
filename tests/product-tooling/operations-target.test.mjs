import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";

test("Task11 enrolls its own loopback sandbox and refuses crossed identities before connection", async () => {
  const directory = await createEvidenceRun(
    resolve(".agent-runs/MKW-PRODUCT-001/task11-operations/enrollment-"),
  );
  const target = {
    owner: "MKW-PRODUCT-001/Task11",
    scope: "fake-sandbox",
    alias: "task11-operations",
    host: "127.0.0.1",
    port: 1,
    user: "mkw_task11",
    database: "mkw_operations_abc",
    dataDirectory: resolve(
      ".agent-runs/MKW-PRODUCT-001/task11-operations/pg-data",
    ),
  };
  const valid = resolve(directory, "valid.json");
  await writeFile(valid, JSON.stringify(target));
  await assert.rejects(openSandboxTarget(valid, target.alias), /ECONNREFUSED/);
  let index = 0;
  for (const patch of [
    { owner: "MKW-PRODUCT-001/Task10" },
    { scope: "live" },
    { alias: "task10-acceptance" },
    { host: "localhost" },
    { port: "5432" },
    { user: "postgres" },
    { database: "mkw_acceptance_abc" },
    { database: "production" },
    { dataDirectory: resolve("other-data") },
  ]) {
    const file = resolve(directory, `wrong-${index++}.json`);
    await writeFile(file, JSON.stringify({ ...target, ...patch }));
    await assert.rejects(
      openSandboxTarget(file, target.alias),
      /outside the authorized allowlist/,
    );
  }
});
