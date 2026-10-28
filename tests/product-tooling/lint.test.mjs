import { test } from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";

test("ESLint restricted imports reject server package aliases and deep features", async () => {
  const lint = new ESLint();
  for (const [filePath, code, forbidden] of [
    [
      "apps/web/src/features/a/example.ts",
      "import type { Foo } from '@prisma/client'; export type Result = Foo;",
      true,
    ],
    [
      "apps/web/src/features/a/example.ts",
      "export { b } from '@/features/b/private';",
      true,
    ],
    [
      "apps/web/src/shared/example.ts",
      "export { b } from '@/features/b';",
      true,
    ],
    [
      "apps/web/src/features/a/example.ts",
      "export { b } from '@/features/b/index';",
      false,
    ],
    [
      "apps/web/src/features/a/example.ts",
      "export { a } from './internal';",
      false,
    ],
  ]) {
    const [result] = await lint.lintText(code, { filePath });
    assert.equal(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
      forbidden,
      JSON.stringify(result.messages),
    );
  }
});

for (const [filePath, code, forbidden] of [
  [
    "apps/web/src/main.tsx",
    "import type { HealthDto } from '../../api/dist/health.controller.js'; export type H = HealthDto;",
    true,
  ],
  [
    "apps/web/src/shared/main.ts",
    "export type { C } from '../../../api/node_modules/@nestjs/common/index.js';",
    true,
  ],
  [
    "apps/api/src/main.ts",
    "export { web } from '../../web/build/main.js';",
    true,
  ],
  [
    "apps/web/src/main.ts",
    "export type { components } from '@/shared/api/generated/schema.js';",
    false,
  ],
  [
    "apps/web/src/main.ts",
    "export type { components } from './shared/api/generated/schema.js';",
    false,
  ],
  ["apps/web/src/main.ts", "export { local } from './api/client.js';", false],
  [
    "apps/web/src/main.ts",
    "export * from '../../api/cache/../types/model.js';",
    true,
  ],
]) {
  test(`ESLint app-root ownership: ${code}`, async () => {
    const [result] = await new ESLint().lintText(code, { filePath });
    assert.equal(
      result.messages.some(
        (message) => message.ruleId === "product-boundaries/cross-app",
      ),
      forbidden,
      JSON.stringify(result.messages),
    );
    if (!forbidden)
      assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  });
}

test(
  "ESLint normalizes Windows app-root casing",
  { skip: process.platform !== "win32" },
  async () => {
    const [result] = await new ESLint().lintText(
      "export type { Api } from '../../API/dist/api.js';",
      { filePath: "apps/web/src/main.ts" },
    );
    assert.ok(
      result.messages.some(
        (message) => message.ruleId === "product-boundaries/cross-app",
      ),
      JSON.stringify(result.messages),
    );
  },
);
