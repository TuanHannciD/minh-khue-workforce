import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

for (const [fault, site] of [
  ["identity", "release-inode-mtime-bytes"],
  ["inode", "release-inode-mtime-bytes"],
  ["mtime", "release-inode-mtime-bytes"],
  ["bytes", "release-inode-mtime-bytes"],
  ["operation", "release-operation-backup"],
  ["shared", "release-shared-backup"],
]) {
  test(`actual same-SHA ${fault} invariant retains its fixed diagnostic site`, () => {
    const r = spawnSync(
      process.execPath,
      [
        "--experimental-test-module-mocks",
        "tests/product-tooling/fixtures/release-invariant-probe.mjs",
        fault,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(JSON.parse(r.stdout), { site, code: "ERR_ASSERTION" });
  });
}
