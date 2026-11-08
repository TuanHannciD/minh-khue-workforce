import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const checker = resolve("scripts/product/check-boundaries.mjs");
async function fixture(files, app = "web", links = {}) {
  await mkdir(".agent-runs/MKW-PRODUCT-001/task3-auth/fixtures", {
    recursive: true,
  });
  const root = await mkdtemp(
    resolve(".agent-runs/MKW-PRODUCT-001/task3-auth/fixtures/boundary-"),
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
  for (const [link, target] of Object.entries(links)) {
    await mkdir(join(root, link, ".."), { recursive: true });
    await symlink(join(root, target), join(root, link), "junction");
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

test("accepts generated contract types and browser dependencies without traversing packages", async () => {
  const result = await fixture({
    "apps/web/src/main.ts":
      "import type { components } from '@/shared/api/generated/schema.js'; import { browser } from '../node_modules/browser/index.js'; export type H = components['schemas']['HealthDto']; export { browser };",
    "apps/web/src/shared/api/generated/schema.d.ts": await readFile(
      "apps/web/src/shared/api/generated/schema.d.ts",
      "utf8",
    ),
    "apps/web/node_modules/browser/index.js":
      "export { browser } from './missing-vendor-internal.js';",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("allows Prisma-generated type cycles only inside its exact generator output", async () => {
  const result = await fixture(
    {
      "apps/api/src/main.ts":
        "import type { A } from './infrastructure/db/generated/a.js'; export type Value = A;",
      "apps/api/src/infrastructure/db/generated/a.ts":
        "import type { B } from './b.js'; export interface A { b: B }",
      "apps/api/src/infrastructure/db/generated/b.ts":
        "import type { A } from './a.js'; export interface B { a: A }",
    },
    "api",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("generated folder exemption cannot hide a cycle through handwritten source or cross-app import", async () => {
  const result = await fixture(
    {
      "apps/api/src/main.ts":
        "export { value } from './infrastructure/db/generated/a.js'; export const manual = 1;",
      "apps/api/src/infrastructure/db/generated/a.ts":
        "import { manual } from '../../../main.js'; export const value = manual; export type { Web } from '../../../../../web/dist/api.d.ts';",
      "apps/web/dist/api.d.ts": "export interface Web { value: string }",
    },
    "api",
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /cycle/);
  assert.match(result.stdout + result.stderr, /cross-app/);
});

test("rejects runtime cycles entirely inside Prisma generator output", async () => {
  const result = await fixture(
    {
      "apps/api/src/main.ts":
        "export { a } from './infrastructure/db/generated/a.js';",
      "apps/api/src/infrastructure/db/generated/a.ts":
        "import { b } from './b.js'; export const a: number = b;",
      "apps/api/src/infrastructure/db/generated/b.ts":
        "import { a } from './a.js'; export const b: number = a;",
    },
    "api",
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /cycle-generated-runtime/);
});

// Catch src-only ownership, discarded dependency edges and junction identity loss.
for (const [name, files, rule, app, links] of [
  [
    "cross-app compiled declaration type",
    {
      "apps/web/src/main.tsx":
        "import type { HealthDto } from '../../api/dist/health.controller.js'; export type H = HealthDto;",
      "apps/api/dist/health.controller.d.ts":
        "export declare class HealthDto { status: 'ok' }",
    },
    "cross-app",
    "web",
  ],
  [
    "cross-app dependency type",
    {
      "apps/web/src/main.tsx":
        "import type { Controller } from '../../api/node_modules/@nestjs/common/index.js'; export type C = typeof Controller;",
      "apps/api/node_modules/@nestjs/common/index.d.ts":
        "export declare function Controller(): void;",
    },
    "cross-app",
    "web",
  ],
  [
    "cross-app output through normalized alias",
    {
      "apps/web/tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@output/*": ["../api/dist/*"] },
        },
      }),
      "apps/web/src/main.ts":
        "export type { Api } from '@output/nested/../api.js';",
      "apps/api/dist/api.d.ts": "export interface Api { value: string }",
    },
    "cross-app",
    "web",
  ],
  [
    "API to web output outside src",
    {
      "apps/api/src/main.ts": "export { web } from '../../web/build/main.js';",
      "apps/web/build/main.js": "export const web = 1;",
    },
    "cross-app",
    "api",
  ],
  [
    "cross-app dependency junction to neutral store",
    {
      "apps/web/src/main.ts":
        "export type { Shared } from '../../api/node_modules/shared/index.js';",
      "node_modules/.pnpm/shared@1/node_modules/shared/index.d.ts":
        "export interface Shared { value: string }",
    },
    "cross-app",
    "web",
    {
      "apps/api/node_modules/shared":
        "node_modules/.pnpm/shared@1/node_modules/shared",
    },
  ],
  [
    "server dependency behind neutral junction alias",
    {
      "apps/web/tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@vendor/*": ["./vendor/*"] },
        },
      }),
      "apps/web/src/main.ts":
        "export type { Controller } from '@vendor/index.js';",
      "node_modules/.pnpm/common@1/node_modules/@nestjs/common/index.d.ts":
        "export declare function Controller(): void;",
    },
    "web-server-package",
    "web",
    {
      "apps/web/vendor":
        "node_modules/.pnpm/common@1/node_modules/@nestjs/common",
    },
  ],
  [
    "cross-app dependency junction through tsconfig alias",
    {
      "apps/web/tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@dependency/*": ["../api/node_modules/shared/*"] },
        },
      }),
      "apps/web/src/main.ts":
        "export type { Shared } from '@dependency/index.js';",
      "node_modules/.pnpm/shared@1/node_modules/shared/index.d.ts":
        "export interface Shared { value: string }",
    },
    "cross-app",
    "web",
    {
      "apps/api/node_modules/shared":
        "node_modules/.pnpm/shared@1/node_modules/shared",
    },
  ],
  [
    "cross-app output behind neutral junction",
    {
      "apps/web/src/main.ts": "export type { Api } from '../vendor/api.js';",
      "apps/api/dist/api.d.ts": "export interface Api { value: string }",
    },
    "cross-app",
    "web",
    { "apps/web/vendor": "apps/api/dist" },
  ],
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
    const result = await fixture(files, app, links);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, new RegExp(rule));
  });
}

test(
  "Windows app ownership follows case-insensitive filesystem identity",
  { skip: process.platform !== "win32" },
  async () => {
    const result = await fixture({
      "apps/web/src/main.ts":
        "export type { Api } from '../../API/dist/api.js';",
      "apps/api/dist/api.d.ts": "export interface Api { value: string }",
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /cross-app/);
  },
);
