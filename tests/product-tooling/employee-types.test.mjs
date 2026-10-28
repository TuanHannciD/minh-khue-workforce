import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

test("generated employee consumer accepts omitted/null endDate and rejects null required fields", async () => {
  const runs = resolve(".agent-runs/MKW-PRODUCT-001/task4-fix-r1/fixtures");
  await mkdir(runs, { recursive: true });
  const root = await mkdtemp(join(runs, "employee-types-"));
  const schema = resolve(
    "apps/web/src/shared/api/generated/schema.d.ts",
  ).replaceAll("\\", "/");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      extends: resolve("tsconfig.base.json"),
      compilerOptions: {
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: [],
      },
      files: ["consumer.ts"],
    }),
  );
  await writeFile(
    join(root, "consumer.ts"),
    `
import type { components } from '${schema}';
type Create = components['schemas']['CreateEmployeeDto'];
type Patch = components['schemas']['UpdateEmploymentDto'];
export const creates: Create[] = [
  { name: 'Thử', startDate: '2026-10-15' },
  { name: 'Thử', startDate: '2026-10-15', endDate: null },
  { name: 'Thử', startDate: '2026-10-15', endDate: '2026-10-20' },
];
export const patches: Patch[] = [
  { expectedRevision: 'revision', name: 'Đổi tên' },
  { expectedRevision: 'revision', endDate: null },
];
// @ts-expect-error name cannot be null
export const nullName: Create = { name: null, startDate: '2026-10-15' };
// @ts-expect-error startDate cannot be null
export const nullStart: Create = { name: 'Thử', startDate: null };
// @ts-expect-error PATCH name cannot be null
export const nullPatchName: Patch = { expectedRevision: 'revision', name: null };
// @ts-expect-error PATCH startDate cannot be null
export const nullPatchStart: Patch = { expectedRevision: 'revision', startDate: null };
`,
  );
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "-p",
      join(root, "tsconfig.json"),
      "--pretty",
      "false",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
