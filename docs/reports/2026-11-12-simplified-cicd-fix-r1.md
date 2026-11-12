# Simplified CI/CD fix R1 — 2026-11-12

## Scope

Fix review findings on `f02162b3a7024da8942117d3ab65655ffad20c03` only. The approved simplified release remains `push main → quality → full API/Web build → encrypted verified BACKUP → Compose deploy → health/smoke verify`. No adoption/current-state/LKG or automatic rollback was restored.

## Changes

- `scripts/product/post-deploy-verify.sh` no longer mounts or reads `current-state.json` for the simple path. It verifies exact API/Web/PostgreSQL image IDs and digests, running/healthy containers, the successful receipt, release SHA and operation correlation, Prisma migration status, and HTTP smoke endpoints. A healthy legacy VPS without state files can therefore complete verification.
- `scripts/product/deploy-entrypoint.sh` now makes the ordering explicit: Compose starts only the database with `--no-deps --wait`; `prisma migrate deploy` must complete; only then does the full application Compose apply run. A failed migration exits before API/gateway application startup. Existing volumes are retained; no reset/down/remove/restore behavior was added.
- Removed an unused rehearsal helper and normalized changed JavaScript/YAML/tests with Prettier. `pg` remains declared as `apps/api` dependency `8.23.1` and is locked in `pnpm-lock.yaml`; the reproducible install uses Corepack pnpm with the lockfile.

## Evidence

- `corepack pnpm install --frozen-lockfile --config.engine-strict=false`: pass. Runtime Node 24.12.0 is below the repository's declared `>=24.22.1` engine, so strict engine enforcement was disabled only for this local install.
- Focused affected tests: **23/23 pass**.
- Full `corepack pnpm run product:test:tooling`: **765/765 pass**. Benchmark fixtures still print expected unauthenticated 401 diagnostics while their assertions pass.
- `corepack pnpm run product:lint`: pass.
- `corepack pnpm run product:format:check`: pass.
- Git Bash syntax, YAML parsing, Node syntax and `git diff --check`: pass.
- Docker rehearsal: **Not run**. Docker Desktop/Linux engine was unavailable (`dockerDesktopLinuxEngine` named pipe missing).

## Limits

No live GitHub/GHCR attestation, SSH/VPS, production database or deployment was attempted. Parent must perform fresh independent review on the exact final commit.
