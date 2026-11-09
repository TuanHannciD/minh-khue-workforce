# Immutable Production CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mutable-tag production pipeline with six workflows and verified release/backup/deploy/rollback contracts that operate from immutable artifacts.

**Architecture:** Contract-first Node scripts validate release and backup JSON. Build creates a commit-addressed artifact containing image digests, SBOM/provenance and checksums; deploy, verification and rollback consume that artifact without registry lookup. SSH entrypoint and Compose enforce exact digests, migration/health gates and receipts; protected GitHub environments provide production secrets and approval.

**Tech Stack:** GitHub Actions YAML, Docker Buildx/Compose, GHCR, PostgreSQL 17.11, Node.js ESM scripts, JSON Schema, pnpm, Bash, Prisma migration metadata.

**Spec:** `docs/superpowers/specs/2026-11-09-immutable-production-cicd-design.md`

## Global Constraints

- Never push remote, deploy production, create a real scheduler, or mutate real personnel data.
- Preserve existing dirty/untracked `docs/reports/` files.
- Deploy only full immutable commit SHA and image references ending in `@sha256:<64 hex>`.
- `deploy/postgres-image.env` is the only PostgreSQL digest source; deploy never resolves image digests from GHCR.
- First deployment uses `INITIAL_EMPTY_DEPLOYMENT` only after target identity and empty-database evidence; later releases require a real backup with `restoreVerified=true`.
- Do not invent application fields, business states, schema, production roles, storage provider, or secret values.
- No down migration during rollback; incompatible schema requires restore to a new database and approval before cutover.
- Logs, artifacts and receipts must not contain passwords, tokens, private keys, database URLs, encryption keys or dump contents.
- Research requiring web/search is `Not run/Blocked` in evidence; do not claim direct official-source verification.

## Review Focus

1. A workflow triggered by an untrusted `workflow_run` could deploy a different SHA; test the event head SHA and branch/ref binding in the workflow static checks (Task 4).
2. A syntactically valid manifest could reference mutable tags or duplicate/unknown fields; test regex, schema and checksum invariants (Task 1).
3. A backup marker could claim readiness without a verified restore or could leak a secret storage URL; test kind-specific invariants and location sanitization (Task 2).
4. A server could run a different image than the manifest or silently retain a mutable Compose reference; test rendered Compose/receipt digest equality and lookup absence (Task 3).
5. A post-deploy failure could be recorded without creating an actionable rollback signal; test failed verification receipt and rollback input contract (Task 5).

### Task 1: Release and Backup Contract Validators

**Files:**
- Create: `deploy/release-manifest.schema.json`
- Create: `deploy/backup-ready.schema.json`
- Create: `scripts/product/release/validate-manifest.mjs`
- Create: `scripts/product/release/validate-backup-ready.mjs`
- Create: `scripts/product/release/verify-release.mjs`
- Create: `scripts/product/operations/create-backup-ready.mjs`
- Create: `scripts/product/operations/verify-restore.mjs`
- Create: `tests/product-tooling/release-contracts.test.mjs`

**Interfaces:**
- `validate-manifest.mjs`: CLI `node ... <manifest> [--schema <schema>]`, exit 0 only for a valid manifest; exports `validateManifest(value)` returning `{ok, errors}`.
- `validate-backup-ready.mjs`: same CLI shape; exports `validateBackupReady(value)` returning `{ok, errors}`.
- `verify-release.mjs`: exports `verifyRelease({manifest, expectedSha, composeText})` returning `{ok, errors}` and checks exact SHA/image equality and no mutable image reference.
- `create-backup-ready.mjs`: exports `createBackupReady(input)` and writes atomically only after invariants pass; supports `BACKUP` and `INITIAL_EMPTY_DEPLOYMENT`.
- `verify-restore.mjs`: exports `verifyRestore(result)` requiring identity, schema/migration, counts, relations and required-data checks; returns `{verified, checks}` without printing data.

- [ ] **Step 1: Write failing tests** for valid/invalid manifest, duplicate fields, mutable tag, wrong SHA, valid/invalid backup kinds, secret-like storage location, unverified restore, and verified restore.
- [ ] **Step 2: Run** `node --test tests/product-tooling/release-contracts.test.mjs`; confirm failures identify missing validators/contracts.
- [ ] **Step 3: Implement schemas and scripts** with strict object fields, full SHA/digest regex, UTC timestamps, checksum/size invariants, kind-specific requirements, atomic output and secret-safe errors.
- [ ] **Step 4: Run** the focused test again and expect all contract cases to pass.
- [ ] **Step 5: Run** `node scripts/product/release/validate-manifest.mjs` and `node scripts/product/release/validate-backup-ready.mjs` against committed positive fixtures plus negative temporary fixtures; expect exit 0/1 respectively.
- [ ] **Step 6: Commit** `feat: add immutable release and backup contracts`.

### Task 2: Compose and Deployment Entrypoint Gates

**Files:**
- Modify: `deploy/compose.production.yml`
- Modify: `scripts/product/deploy-entrypoint.sh`
- Modify: `deploy/README.md`
- Create: `tests/product-tooling/deploy-entrypoint-policy.test.mjs`

**Interfaces:**
- Compose must consume only `${MKW_*_IMAGE}` digest references and expose healthchecks for DB/API/Web path used by workflows.
- Entrypoint accepts `--release --manifest <path> --compose <path>` and validates manifest via Task 1 before rendering; it writes receipt fields `{releaseSha, imageDigests, status, utc}` without secrets.
- Initial-empty/backup gate is JSON validation, not a file-presence marker; migration runs only through the approved forward command and fails before traffic if unsuccessful.

- [ ] **Step 1: Write failing static tests** asserting no digest lookup command, no empty `backup.ready` acceptance, exact digest validation, migration gate before `up`, health/smoke checks and receipt fields.
- [ ] **Step 2: Run** `node --test tests/product-tooling/deploy-entrypoint-policy.test.mjs`; confirm current implementation fails on mutable lookup/marker behavior.
- [ ] **Step 3: Update Compose and entrypoint** to validate the manifest, require backup-ready or initial-empty JSON, render absolute env paths safely, run `docker compose config`, forward migration gate, start exact digests, wait health, smoke `/` and `/api/health`, and write atomic receipt plus failed receipt on post-start verification failure.
- [ ] **Step 4: Run** focused policy tests and a shell syntax check `bash -n scripts/product/deploy-entrypoint.sh`; expect pass.
- [ ] **Step 5: Run** Compose config with non-secret fixture env and digest references; expect `docker compose ... config --quiet` or record `Not run` if Docker is unavailable.
- [ ] **Step 6: Commit** `feat: enforce immutable deploy and backup gates`.

### Task 3: CI and Build Release Workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/build-release.yml`
- Modify: `.github/workflows/build-publish.yml` (remove/retire overlapping mutable release path while preserving any required non-release check)
- Create: `tests/product-tooling/workflow-policy.test.mjs`

**Interfaces:**
- `ci.yml`: PR and push triggers; least-privilege read permissions; runs lint, format, typecheck, unit/integration, contract, build and product checks; never packages write or deploy.
- `build-release.yml`: only successful CI on `main`; full SHA checkout; Buildx API/Web outputs; SBOM/provenance; exact PostgreSQL env digest; `release-manifest.json`, checksums and upload artifact named by SHA.
- Workflow policy tests parse YAML/text and reject mutable tags, shallow checkout, runtime digest lookup and unguarded release triggers.

- [ ] **Step 1: Write failing workflow policy tests** for triggers, permissions, full checkout, artifact handoff, digest source and forbidden runtime lookup.
- [ ] **Step 2: Run** focused workflow tests; confirm current workflows fail the new policy.
- [ ] **Step 3: Implement** the two workflows and retire overlapping behavior, using pinned action versions already accepted by repository policy, explicit concurrency and `if` checks binding `workflow_run.head_sha` to `main`.
- [ ] **Step 4: Run** focused workflow tests plus YAML parse/static validation; expect pass.
- [ ] **Step 5: Run** `npm run product:lint` and `npm run product:format:check` if available; record any unrelated baseline failure separately.
- [ ] **Step 6: Commit** `feat: add immutable ci and release build workflows`.

### Task 4: Backup, Deploy, Post-deploy and Rollback Workflows

**Files:**
- Create: `.github/workflows/backup.yml`
- Replace: `.github/workflows/deploy.yml`
- Create: `.github/workflows/post-deploy-verify.yml`
- Create: `.github/workflows/rollback.yml`
- Create: `tests/product-tooling/release-workflow-policy.test.mjs`

**Interfaces:**
- `backup.yml`: schedule/manual; target/DB identity; encrypted custom dump; external storage adapter inputs; restore verification; metadata artifact; explicit initial-empty branch.
- `deploy.yml`: manual/protected environment; full SHA and artifact input; manifest/checksum/backup gate; SSH preflight; upload exact manifest/Compose; invoke entrypoint; preserve receipt.
- `post-deploy-verify.yml`: consumes deploy receipt and SHA; checks running digests, health, schema/migration, gateway/API and startup logs; emits passed/failed verification receipt and rollback signal.
- `rollback.yml`: manual/protected; selects old manifest; verifies compatibility and backup; invokes exact digest redeploy; emits rollback receipt; never down-migrates.

- [ ] **Step 1: Write failing workflow policy tests** for manual/protected triggers, artifact download/use, no digest lookup, backup/initial gate, post-deploy failure signal and rollback no-down-migration.
- [ ] **Step 2: Run** focused tests; confirm current deploy workflow fails policy.
- [ ] **Step 3: Implement** four workflows with least-privilege permissions, production environment, concurrency, secret-safe shell and explicit fail-closed inputs. Storage/provider-specific commands remain variable/secret-configured and do not invent a provider.
- [ ] **Step 4: Run** focused tests and YAML/static checks; expect pass.
- [ ] **Step 5: Commit** `feat: add verified backup deploy and rollback workflows`.

### Task 5: Runbooks, Research/Validation Evidence and Integration

**Files:**
- Create: `docs/operations/product-release-runbook.md`
- Replace/update: `docs/operations/product-backup-restore.md`
- Create: `docs/operations/product-rollback-runbook.md`
- Create: `docs/operations/product-post-deploy-verification.md`
- Modify: `deploy/README.md` if needed after workflows
- Create: `docs/reports/2026-11-09-immutable-cicd-research.md`

**Interfaces:**
- Runbooks document actor, target identity, exact artifact flow, first deployment, backup retention, migration/rollback, receipts, failure evidence and production gates.
- Research report records official documentation URLs, date, conclusion and `Not run/Blocked` status for direct web lookup.

- [ ] **Step 1: Write runbook acceptance checklist** covering every workflow, contract, secret-safe evidence and no-production-deploy boundary.
- [ ] **Step 2: Implement concise Vietnamese source-of-truth runbooks and research artifact** without inventing provider, schema or credentials.
- [ ] **Step 3: Run** link/anchor/UTF-8/document checks and `npm run check:docs`; expect pass.
- [ ] **Step 4: Commit** `docs: document immutable release operations`.

### Task 6: Independent Review and Final Verification

**Files:**
- No writer files; reviewer reads exact final snapshot.

**Interfaces:**
- Reviewer receives base SHA, tip SHA, spec, plan, changed-file list, test commands/results and known limitations. Reviewer returns findings with severity, evidence, impact and retest command.

- [ ] **Step 1: Record final base/tip and dirty/untracked inventory.**
- [ ] **Step 2: Run** `npm run check`, focused product tooling tests, YAML/static checks, shell syntax checks and Compose config where available.
- [ ] **Step 3: Dispatch an independent reviewer on exact `base..tip`; reviewer must not modify files or use the implementer context.
- [ ] **Step 4: Resolve blocking findings, rerun affected checks and obtain re-review on the new exact tip.
- [ ] **Step 5: Inspect full diff and artifact contents manually; confirm no secret, mutable tag, remote push or production mutation.
- [ ] **Step 6: Fast-forward/merge local task commits into `main` only after review and checks pass; retain reports and untracked files.

## Execution Order and Ownership

- Task 1 writer owns contract schemas/scripts/tests only.
- Task 2 writer owns Compose/entrypoint/tests only.
- Task 3 writer owns CI/build workflows/tests only.
- Task 4 writer owns backup/deploy/verify/rollback workflows/tests only.
- Task 5 writer owns operational docs/research only.
- Task 6 is an independent reviewer and final verifier; it owns no implementation files.
- Writers use separate worktrees and must not create child agents. Each task starts from the agreed base; integration happens only after all task reviews.

## Plan Self-review

Coverage checked against the spec: all six workflows, both schemas, five scripts, Compose/entrypoint, runbooks, research limitation, tests, receipts, migration/rollback policy and final independent review have an owning task. Interfaces use consistent names (`validateManifest`, `validateBackupReady`, `verifyRelease`, `createBackupReady`, `verifyRestore`). The five review-focus risks each have a named policy/contract test. No unresolved placeholder or invented provider/credential remains.
