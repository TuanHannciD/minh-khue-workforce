import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";

test("Task10 accepts only its own fake target before connecting", async () => {
  const directory = await createEvidenceRun(
    resolve(".agent-runs/MKW-PRODUCT-001/task10-enrollment-"),
  );
  const target = {
    owner: "MKW-PRODUCT-001/Task10",
    scope: "fake-sandbox",
    alias: "task10-acceptance",
    host: "127.0.0.1",
    port: 1,
    user: "mkw_task10",
    database: "mkw_acceptance_abc",
    dataDirectory: resolve(
      ".agent-runs/MKW-PRODUCT-001/task10-acceptance/pg-data",
    ),
  };
  const file = resolve(directory, "valid.json");
  await writeFile(file, JSON.stringify(target));
  await assert.rejects(openSandboxTarget(file, target.alias), /ECONNREFUSED/);
  for (const patch of [
    { owner: "MKW-PRODUCT-001/Task9" },
    { scope: "live" },
    { alias: "task9-export" },
    { host: "localhost" },
    { user: "postgres" },
    { database: "mkw_export_abc" },
    { dataDirectory: resolve("other-data") },
  ]) {
    const invalid = resolve(directory, `${Object.keys(patch)[0]}.json`);
    await writeFile(invalid, JSON.stringify({ ...target, ...patch }));
    await assert.rejects(
      openSandboxTarget(invalid, target.alias),
      /outside the authorized allowlist/,
    );
  }
});

test("Task9 export sandbox rejects crossed owner/role/database/path/host and accepts only enrolled fake identity", async () => {
  const directory = await createEvidenceRun(
    resolve(".agent-runs/MKW-PRODUCT-001/task10-acceptance/enrollment-task9-"),
  );
  const target = {
    owner: "MKW-PRODUCT-001/Task9",
    scope: "fake-sandbox",
    alias: "task9-export",
    host: "127.0.0.1",
    port: 1,
    user: "mkw_task9",
    database: "mkw_export_abc",
    dataDirectory: resolve(".agent-runs/MKW-PRODUCT-001/task9-export/pg-data"),
  };
  const file = resolve(directory, "valid-shape.json");
  await writeFile(file, JSON.stringify(target));
  await assert.rejects(openSandboxTarget(file, "task9-export"), /ECONNREFUSED/);
  for (const change of [
    { owner: "MKW-PRODUCT-001/Task8" },
    { user: "mkw_task8" },
    { database: "mkw_selection_abc" },
    {
      dataDirectory: resolve(
        ".agent-runs/MKW-PRODUCT-001/task8-selection/pg-data",
      ),
    },
    { host: "192.0.2.1" },
    { scope: "live" },
    { alias: "task8-selection" },
  ]) {
    const invalid = resolve(
      directory,
      `invalid-${Object.keys(change)[0]}.json`,
    );
    await writeFile(invalid, JSON.stringify({ ...target, ...change }));
    await assert.rejects(
      openSandboxTarget(invalid, "task9-export"),
      /outside the authorized allowlist/,
    );
  }
});

test("Task8 enrollment accepts only its own fake target shape before attempting a connection", async () => {
  const directory = await createEvidenceRun(
    resolve(".agent-runs/MKW-PRODUCT-001/task10-acceptance/enrollment-task8-"),
  );
  const file = resolve(directory, "valid-shape.json");
  const target = {
    owner: "MKW-PRODUCT-001/Task8",
    scope: "fake-sandbox",
    alias: "task8-selection",
    host: "127.0.0.1",
    port: 1,
    user: "mkw_task8",
    database: "mkw_selection_abc",
    dataDirectory: resolve(
      ".agent-runs/MKW-PRODUCT-001/task8-selection/pg-data",
    ),
  };
  await writeFile(file, JSON.stringify(target));
  await assert.rejects(
    openSandboxTarget(file, "task8-selection"),
    /ECONNREFUSED/,
  );
  for (const change of [
    { owner: "MKW-PRODUCT-001/Task7" },
    { user: "mkw_task7" },
    { database: "mkw_persistence_abc" },
    {
      dataDirectory: resolve(
        ".agent-runs/MKW-PRODUCT-001/task7-persistence/pg-data",
      ),
    },
    { scope: "live" },
    { host: "192.0.2.1" },
  ]) {
    const invalid = resolve(
      directory,
      `invalid-${Object.keys(change)[0]}.json`,
    );
    await writeFile(invalid, JSON.stringify({ ...target, ...change }));
    await assert.rejects(
      openSandboxTarget(invalid, "task8-selection"),
      /outside the authorized allowlist/,
    );
  }
});

test("R1 sandbox enrollment rejects mismatched ownership, role, path, database and host before connecting", async () => {
  await mkdir(resolve(".agent-runs/MKW-PRODUCT-001/task7-fix-r1"), {
    recursive: true,
  });
  const directory = await createEvidenceRun(
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
