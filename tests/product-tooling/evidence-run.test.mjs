import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";
test("fresh absent evidence parent is created recursively and subsequent runs preserve previous bytes", async () => {
  const parent = resolve(
    ".agent-runs/MKW-PRODUCT-001/task10-fix-r1",
    randomUUID(),
    "initially-absent",
    "nested",
  );
  assert.equal(existsSync(parent), false);
  const first = await createEvidenceRun(resolve(parent, "fixture-"));
  await writeFile(resolve(first, "sentinel.json"), "original bytes");
  const second = await createEvidenceRun(resolve(parent, "fixture-"));
  assert.notEqual(first, second);
  assert.equal(
    await readFile(resolve(first, "sentinel.json"), "utf8"),
    "original bytes",
  );
});
