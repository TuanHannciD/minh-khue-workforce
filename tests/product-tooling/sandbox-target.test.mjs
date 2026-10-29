import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";

test("R1 sandbox enrollment rejects mismatched ownership, role, path, database and host before connecting", async () => {
  await mkdir(resolve(".agent-runs/MKW-PRODUCT-001/task7-fix-r1"), {
    recursive: true,
  });
  const directory = await mkdtemp(
    resolve(".agent-runs/MKW-PRODUCT-001/task7-fix-r1/enrollment-"),
  );
  const target = {
    owner: "MKW-PRODUCT-001/Task7FixR1",
    scope: "fake-sandbox",
    alias: "task7-fix-r1",
    host: "127.0.0.1",
    port: 1,
    user: "mkw_task7_r1",
    database: "mkw_task7_r1_abc",
    dataDirectory: resolve(".agent-runs/MKW-PRODUCT-001/task7-fix-r1/pg-data"),
  };
  for (const change of [
    { owner: "MKW-PRODUCT-001/Task7" },
    { user: "mkw_task7" },
    {
      dataDirectory: resolve(
        ".agent-runs/MKW-PRODUCT-001/task7-persistence/pg-data",
      ),
    },
    { database: "mkw_persistence_abc" },
    { host: "192.0.2.1" },
    { scope: "live" },
    { alias: "task7-persistence" },
  ]) {
    const file = resolve(directory, `target-${Object.keys(change)[0]}.json`);
    await writeFile(file, JSON.stringify({ ...target, ...change }));
    await assert.rejects(
      openSandboxTarget(file, "task7-fix-r1"),
      /outside the authorized allowlist/,
    );
  }
});
