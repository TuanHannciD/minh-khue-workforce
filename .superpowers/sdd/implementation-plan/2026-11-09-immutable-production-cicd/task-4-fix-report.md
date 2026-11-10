# Task 4 fix report — Immutable production release workflow blockers

## Scope

Addressed review findings in `backup.yml`, `deploy.yml`, `post-deploy-verify.yml`, and release workflow policy tests. Backup verification now restores a custom-format dump into a fresh database, validates expected tables, migration ledger, foreign-key relations, and source/restored row counts before setting `restoreVerified`. Initial-empty metadata queries the target database identity and checks every public business table has zero rows. Deploy packages and verifies a checksum for `backup-ready.json` at both runner and remote extraction before installing it. Post-deploy verification downloads and validates the exact release manifest, compares running container `RepoDigests`, runs Prisma migration status, captures Compose startup logs, and emits an actionable rollback signal when configured. Rollback already redeployed through the forward-only entrypoint and now remains covered by receipt/upload policy tests.

## Verification

- `node --test tests/product-tooling/release-workflow-policy.test.mjs` — **PASS** (4/4).
- `git diff --check` — **PASS** (line-ending normalization warnings only).
- YAML execution / remote SSH / PostgreSQL restore — **Not run**: no production or remote mutation was authorized; required services are unavailable in this worktree runtime.

## Limits and next action

The focused tests are policy/regression tests over workflow source. A reviewer should inspect the final diff and run CI workflow syntax validation in the GitHub Actions environment before enabling production execution. No production deployment, rollback, database mutation, or remote push was performed.
