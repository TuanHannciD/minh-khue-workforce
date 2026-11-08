import { createEvidenceRun } from "../../../scripts/product/evidence-run.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evidenceRoot } from "./attendance-sandbox.mjs";
import { openSandboxTarget } from "../../../scripts/product/sandbox-target.mjs";

test("shared auth CLI accepts only the exact enrolled fake cluster identity and rejects mismatched owner/alias/directory/role/DB/port", async () => {
  const owner = process.env.MKW_ATTENDANCE_CLUSTER_OWNER;
  const target = JSON.parse(await readFile(owner, "utf8"));
  const alias = target.alias;
  const evidence = await createEvidenceRun(
    resolve(dirname(owner), "target-rejection-"),
  );
  const valid = await openSandboxTarget(owner, alias);
  await valid.pool.end();
  const variants = [
    { owner: "MKW-PRODUCT-001/Task3" },
    { alias: "task3-auth" },
    { dataDirectory: resolve(evidenceRoot, "other-data") },
    { user: "postgres" },
    { database: "unknown_database" },
    { port: 1 },
    { host: "localhost" },
  ];
  for (const [i, patch] of variants.entries()) {
    const path = resolve(evidence, `rejected-target-${i}.json`);
    await writeFile(path, JSON.stringify({ ...target, ...patch }));
    await assert.rejects(openSandboxTarget(path, alias));
  }
  await assert.rejects(openSandboxTarget(owner, "task3-auth"));
});
