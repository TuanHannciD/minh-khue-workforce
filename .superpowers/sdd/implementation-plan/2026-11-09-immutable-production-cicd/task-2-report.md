# Task 2 report — Compose and deployment entrypoint gates

## Scope

Implemented immutable Compose image variables, service health checks, JSON release and backup gates, forward migration ordering, health/smoke checks, and secret-free atomic deployment receipts in the Task 2 worktree.

## Verification

- `node --test tests/product-tooling/deploy-entrypoint-policy.test.mjs` — **PASS** (6/6).
- `git diff --check` — **PASS** (line-ending normalization warnings only).
- `bash -n scripts/product/deploy-entrypoint.sh` — **Not run**: Bash is unavailable in the Windows/WSL runtime (`/bin/bash` not found).
- Compose config execution — **Not run**: Docker availability was not required by the focused policy gate and was not assumed.

## Notes and limits

The entrypoint validates the release manifest and backup-ready JSON through Task 1 validators, verifies rendered Compose image equality, runs `pnpm db:deploy` before starting services, waits with Compose health gates, smokes `/` and `/api/health`, and writes success or post-start failure receipts containing only release SHA, image digests, status, and UTC. No production deployment or remote push was performed.

## Fix R1 — coordinator review findings

Applied after review `task2-review-r1.md` (F1–F6). The coordinator now dispatches and waits for a correlated backup run for both `BACKUP` and `INITIAL_EMPTY_DEPLOYMENT`, resolves only that successful run/attempt artifact, validates exact release and backup IDs, dispatches deploy, waits its exact conclusion, then dispatches and waits post-deploy verification. Any failed stage throws and leaves the coordinator failed.

Policy is checked out from protected `main`; release artifacts are treated as data. Candidate validators run without `GH_TOKEN`, and source linkage is checked from manifest plus build metadata rather than workflow execution `head_sha`. Downstream workflows consume `artifact-ids`, retain `environment: production`, and recheck freshness before SSH mutation.

Verification: focused release/workflow fixtures `43/43` pass; YAML parse pass; 11 YAML shell blocks pass Git Bash `-n`; changed-file ESLint pass; Prettier pass; Node syntax pass; `git diff --check` pass. Full product tooling was not run to green because this checkout lacks `@eslint/js`, `dependency-cruiser`, and TypeScript packages. No production dispatch, push, or deployment was performed.
