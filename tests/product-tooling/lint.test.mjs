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
