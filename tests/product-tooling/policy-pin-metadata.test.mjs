import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CI has the reviewed Task1 policy pin metadata", async () => {
  const raw = await readFile(
    "scripts/product/fixtures/task-1-db-policy-pin.json",
    "utf8",
  );
  const metadata = JSON.parse(raw);
  assert.equal(metadata.reviewedTip, "321d488f041e6d5386adea9f86ca8749ef896144");
  assert.equal(metadata.status, "COMPLETE");
  assert.equal(metadata.decision, "READY TO PIN");
});
