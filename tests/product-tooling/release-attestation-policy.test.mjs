import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const workflow = await readFile(
  join(ROOT, ".github/workflows/build-release.yml"),
  "utf8",
);

test("release attestation export retries registry reads and validates descriptors", () => {
  assert.match(workflow, /inspect_with_retry\(\)/);
  assert.match(workflow, /attempt <= 8/);
  assert.match(workflow, /docker buildx imagetools inspect/);
  assert.match(workflow, /jq -e/);
  assert.match(workflow, /attestation-manifest/);
  assert.doesNotMatch(workflow, /grep -Eiq.*(?:in-toto|cyclonedx|spdx)/);
});
