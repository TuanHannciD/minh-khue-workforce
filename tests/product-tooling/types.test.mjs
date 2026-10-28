import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

test("strict compiler accepts generated contract consumer and rejects invalid wire type / implicit any", async () => {
  const runs = resolve(".agent-runs/MKW-PRODUCT-001/task3-auth/fixtures");
  await mkdir(runs, { recursive: true });
  const root = await mkdtemp(join(runs, "strict-"));
  const schema = resolve(
    "apps/web/src/shared/api/generated/schema.d.ts",
  ).replaceAll("\\", "/");
  const source = `import type { components } from '${schema}';\ntype Health = components['schemas']['HealthDto'];\n`;
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
  const compile = () =>
    spawnSync(
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
  await writeFile(
    join(root, "consumer.ts"),
    source + "const health: Health = { status: 'ok' }; export { health };\n",
  );
  const valid = compile();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  await writeFile(
    join(root, "consumer.ts"),
    source +
      "const health: Health = { status: 'broken' }; export function leak(value) { return value ?? health; }\n",
  );
  const invalid = compile();
  assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
  assert.match(invalid.stdout, /TS2322/);
  assert.match(invalid.stdout, /TS7006/);
});
