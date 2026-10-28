import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const checker = resolve("scripts/product/check-boundaries.mjs");
async function fixture(files, app = "web") {
  await mkdir(".agent-runs/MKW-PRODUCT-001/task2-toolchain/fixtures", {
    recursive: true,
  });
  const root = await mkdtemp(
    resolve(".agent-runs/MKW-PRODUCT-001/task2-toolchain/fixtures/boundary-"),
  );
  const config = {
    compilerOptions: {
      baseUrl: ".",
      paths: { "@/*": ["./src/*"] },
      module: "NodeNext",
      moduleResolution: "NodeNext",
    },
  };
  for (const [file, body] of Object.entries({
    [`apps/${app}/tsconfig.json`]: JSON.stringify(config),
    ...files,
  })) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), body);
  }
  return spawnSync(process.execPath, [checker, "--root", root, "--app", app], {
    encoding: "utf8",
    env: process.env,
    cwd: process.cwd(),
    timeout: 30000,
    windowsHide: true,
  });
}

test("accepts public feature imports, same-feature internals and aliases", async () => {
  const result = await fixture({
    "apps/web/src/app/main.ts":
      "import { a } from '@/features/a/index.js'; console.log(a);",
    "apps/web/src/features/a/index.ts": "export { a } from './internal.js';",
    "apps/web/src/features/a/internal.ts":
      "import { b } from '@/features/b/index.js'; import { neutral } from '@/shared/neutral.js'; export const a = b + neutral;",
    "apps/web/src/features/b/index.ts": "export const b = 1;",
    "apps/web/src/shared/neutral.ts": "export const neutral = 2;",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const [name, files, rule, app] of [
  [
    "cross-app custom type alias",
    {
      "apps/web/tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@other/*": ["../api/src/*"] },
        },
      }),
      "apps/web/src/main.ts":
        "import type { Api } from '@other/api.js'; export type Consumer = Api;",
      "apps/api/src/api.ts": "export interface Api { value: string }",
    },
    "cross-app",
    "web",
  ],
  [
    "unprefixed Node builtin in browser source",
    {
      "apps/web/src/main.ts":
        "import { readFile } from 'fs/promises'; export { readFile };",
    },
    "web-server-package",
    "web",
  ],
  [
    "cross-app relative",
    {
      "apps/web/src/main.ts": "import '../../api/src/main.js';",
      "apps/api/src/main.ts": "export {};",
    },
    "cross-app",
    "web",
  ],
  [
    "Prisma package subpath",
    {
      "apps/web/src/main.ts":
        "import type { Prisma } from '@prisma/client/runtime/client'; export type P = Prisma;",
    },
    "web-server-package",
    "web",
  ],
  [
    "shared to feature alias",
    {
      "apps/web/src/shared/a.ts": "export { b } from '@/features/b/index.js';",
      "apps/web/src/features/b/index.ts": "export const b = 1;",
    },
    "shared-upward",
    "web",
  ],
  [
    "deep feature alias",
    {
      "apps/web/src/features/a/index.ts":
        "export { b } from '@/features/b/private.js';",
      "apps/web/src/features/b/private.ts": "export const b = 1;",
    },
    "deep-feature",
    "web",
  ],
  [
    "deep feature relative",
    {
      "apps/web/src/features/a/index.ts":
        "export { b } from '../b/private.js';",
      "apps/web/src/features/b/private.ts": "export const b = 1;",
    },
    "deep-feature",
    "web",
  ],
  [
    "cycle through aliases",
    {
      "apps/web/src/features/a/index.ts":
        "export { b } from '@/features/b/index.js'; export const a = 1;",
      "apps/web/src/features/b/index.ts":
        "export { a } from '@/features/a/index.js'; export const b = 2;",
    },
    "cycle",
    "web",
  ],
  [
    "unknown alias",
    { "apps/web/src/main.ts": "import '@/missing.js';" },
    "unresolved",
    "web",
  ],
  [
    "API to web",
    {
      "apps/api/src/main.ts": "import '../../web/src/main.js';",
      "apps/web/src/main.ts": "export {};",
    },
    "cross-app",
    "api",
  ],
  [
    "deep backend module",
    {
      "apps/api/src/modules/a/index.ts":
        "export { b } from '@/modules/b/private.js';",
      "apps/api/src/modules/b/private.ts": "export const b = 1;",
    },
    "deep-feature",
    "api",
  ],
]) {
  test(`rejects_cross_app_deep_feature_and_cycle: ${name}`, async () => {
    const result = await fixture(files, app);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, new RegExp(rule));
  });
}
