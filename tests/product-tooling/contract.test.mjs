import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

for (const changed of [
  null,
  "contracts/openapi.json",
  "apps/web/src/shared/api/generated/schema.d.ts",
]) {
  test(`contract comparison ${changed ? `rejects stale ${changed}` : "accepts deterministic output"}`, async () => {
    await mkdir(".agent-runs/MKW-PRODUCT-001/task3-auth/fixtures", {
      recursive: true,
    });
    const root = await mkdtemp(
      resolve(".agent-runs/MKW-PRODUCT-001/task3-auth/fixtures/contract-"),
    );
    for (const dir of ["tracked", "candidate"]) {
      for (const [file, content] of Object.entries({
        "contracts/openapi.json":
          '{"openapi":"3.0.3","paths":{"/health":{}}}\n',
        "apps/web/src/shared/api/generated/schema.d.ts":
          'export interface paths { "/health": unknown }\n',
      })) {
        await mkdir(join(root, dir, file, ".."), { recursive: true });
        await writeFile(
          join(root, dir, file),
          dir === "tracked" && file === changed ? "outdated\n" : content,
        );
      }
    }
    const result = spawnSync(
      process.execPath,
      [
        "scripts/product/check-contract.mjs",
        "--root",
        join(root, "tracked"),
        "--candidate-dir",
        join(root, "candidate"),
      ],
      { encoding: "utf8", timeout: 30000, windowsHide: true },
    );
    assert.equal(result.status, changed ? 1 : 0, result.stdout + result.stderr);
    if (changed) assert.match(result.stdout + result.stderr, /Contract drift/);
  });
}
