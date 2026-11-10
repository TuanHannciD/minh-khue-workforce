# Product format check fix report

## Scope

Base: `b28bace` in isolated worktree `.worktrees/lint-diagnosis`.

The product formatter initially reported 12 files:

- CI/release-owned: `scripts/product/operations/create-backup-ready.mjs`, `scripts/product/operations/verify-restore.mjs`, `scripts/product/release/validate-backup-ready.mjs`, `scripts/product/release/validate-manifest.mjs`, `scripts/product/release/verify-release.mjs`, `tests/product-tooling/deploy-entrypoint-policy.test.mjs`, `tests/product-tooling/release-contracts.test.mjs`, `tests/product-tooling/release-workflow-policy.test.mjs`, and `tests/product-tooling/workflow-policy.test.mjs`.
- Out of scope: `apps/web/src/features/attendance/ui/attendance.css`, `apps/web/src/features/attendance/ui/export-button.css`, and `apps/web/src/shared/styles/tokens.css`; these belong to earlier attendance UI work and were left unchanged.

Prettier formatting was applied only to the nine CI/release-owned files. No workflow YAML or documentation file is included by the configured formatter scope, so those files were not changed.

## Verification

- Exact requested shell command `pnpm exec prettier --check apps scripts/product tests/product-tooling tests/product-e2e contracts tsconfig.base.json pnpm-workspace.yaml playwright.product.config.ts`: the repository pnpm shim fails before invoking Prettier because it points at a missing quoted native pnpm path.
- Equivalent package-manager invocation using the installed pnpm runner (`node .../pnpm/12.15.0/node_modules/pnpm/bin/pnpm.mjs exec prettier --check ...`): **exit 1**, with only the three pre-existing attendance CSS files reported.
- Direct Prettier invocation against the same path set: **exit 1**, same three out-of-scope CSS files only; all nine CI/release files pass.
- Focused policy tests: `node --test tests/product-tooling/deploy-entrypoint-policy.test.mjs tests/product-tooling/release-contracts.test.mjs tests/product-tooling/release-workflow-policy.test.mjs tests/product-tooling/workflow-policy.test.mjs` — **27/27 pass**.
- Full product tooling tests: `node --test tests/product-tooling/*.test.mjs` — **453/453 pass**.
- `git diff --check` — **pass**.

## Limits

The repository-wide product format gate remains non-zero solely because of the three pre-existing attendance CSS files outside this CI task. No production, remote GitHub Actions, or deployment operation was run.
