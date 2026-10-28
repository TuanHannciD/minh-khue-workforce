import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import { crossAppImports } from './scripts/product/lint-boundaries.mjs';

const webPackages = ['@prisma/*', 'prisma', 'prisma/*', '@nestjs/*', '@mkw/api', '@mkw/api/*', 'pg'];
const deepAlias = '@/features/*/*';
const publicAlias = '!@/features/*/index';
const restricted = (groups) => ['error', { patterns: groups.map((group) => ({ group, message: 'Use the owning app and public feature index; shared must remain neutral.' })) }];

export default [
  { ignores: ['**/dist/**', '**/coverage/**', '.agent-runs/**', '.superpowers/**', '.pnpm-store/**', '**/generated/**'] },
  js.configs.recommended,
  { files: ['**/*.mjs', '**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['apps/**/*.ts', 'apps/**/*.tsx'] })),
  {
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: { 'product-boundaries': { rules: { 'cross-app': crossAppImports } } },
    rules: { '@typescript-eslint/consistent-type-imports': 'error', '@typescript-eslint/no-explicit-any': 'error', 'product-boundaries/cross-app': 'error' },
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    plugins: { 'react-hooks': hooks },
    rules: {
      ...hooks.configs.recommended.rules,
      'no-restricted-imports': restricted([webPackages, [deepAlias, publicAlias, '!@/features/*/index.js'], ['**/apps/api/**', '**/api/src/**']]),
    },
  },
  {
    files: ['apps/web/src/shared/**/*.ts', 'apps/web/src/shared/**/*.tsx'],
    rules: { 'no-restricted-imports': restricted([webPackages, ['@/features', '@/features/**', '@/app', '@/app/**'], ['**/apps/api/**', '**/api/src/**']]) },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: { 'no-restricted-imports': restricted([['@mkw/web', '@mkw/web/*', '**/apps/web/**', '**/web/src/**'], ['@/modules/*/*', '!@/modules/*/index', '!@/modules/*/index.js'], ['#app/modules/*/*', '!#app/modules/*/index', '!#app/modules/*/index.js']]) },
  },
];
