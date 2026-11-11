# Push Main Continuous Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Khi một SHA mới được push vào `main`, GitHub tự chạy quality/build, push image bất biến vào GHCR, tạo backup đúng target, deploy Docker Compose trên VPS, verify runtime và chỉ auto rollback API/Web khi có bằng chứng schema/migration an toàn.

**Architecture:** Thêm một entry workflow cho push `main` gọi các reusable workflows/job boundaries bằng `needs` và outputs, thay dispatch/poll thủ công trong đường release thường. Giữ manifest/artifact/attestation/SSH/backup controls hiện có; VPS pull exact registry digests và giữ database. Manual dry-run/bootstrap/rollback/scheduled backup vẫn tồn tại nhưng không nằm trên đường happy path.

**Tech Stack:** GitHub Actions YAML, Node ESM release policy/coordinator, Bash deploy entrypoint, Docker Buildx/GHCR, Docker Compose, Node test fixtures.

**Spec:** `docs/superpowers/specs/2026-11-11-push-main-continuous-deployment-design.md`

## Global Constraints

- Source of release SHA is the `push` event's full `github.sha`; no manual SHA/artifact/run ID for normal release.
- Exact API/Web `@sha256:<64 hex>` digests and pinned PostgreSQL digest are the only deploy inputs; never `latest` or registry lookup on VPS.
- Backup is mandatory `BACKUP` for normal release, target-bound to trusted host/database/path/project, fresh/retained/restore-verified before mutation.
- Production mutation uses trusted current controls, filtered SSH fingerprint, strict SSH/SCP, remote lock and UTC recheck.
- Auto app rollback preserves the running PostgreSQL container and is refused unless previous state and migration/schema state prove no unsafe DB change; never auto restore/down-migrate.
- Secrets stay in GitHub protected scope or VPS files; no secret in command, log, artifact, fixture or report.
- No push, main merge, production SSH/DB mutation or secret configuration in local implementation scope.
- Every task has focused behavioral tests, independent review, and honest Not run/Blocked evidence for live GitHub/registry/VPS.

## Review Focus

- Duplicate old `workflow_run` and new `push` producer: one release per SHA and canonical producer identity; test no duplicate artifact/release path.
- Registry permission/private pull failure: fail before migration or Compose mutation; test denied pull and digest mismatch.
- Push queue/rerun/stale source: no old pipeline overwrites newer main; test concurrency and idempotent current-state decision.
- Migration/schema unknown after failed deploy: auto rollback must refuse and emit incident-required, never touch DB; test changed/failed/unknown states.
- Missing previous state/backup/attestation or interleaved deploy: fail closed before rollback; test exact artifact/target/ownership and no later mutation.

---

### Task 1: Automatic push-main pipeline contract

**Files:**

- Create or modify `.github/workflows/main-release.yml` (single push-main entry and job outputs).
- Create/modify reusable workflow files under `.github/workflows/` for quality/build/backup/deploy/verify boundaries, preserving canonical build producer identity where required.
- Modify `.github/workflows/ci.yml` and `.github/workflows/build-release.yml` only as needed to eliminate duplicate release producers while preserving PR checks and provenance.
- Test: `tests/product-tooling/push-main-workflow-policy.test.mjs`.

**Interfaces:**

- Input: push event `github.sha`, `github.repository`, trusted vars/secrets.
- Outputs: `release_sha`, exact release manifest/artifact/run IDs and image digests; backup run/attempt/artifact/name; deploy and verify run IDs; final `release-status`/correlation.

- [ ] Write failing YAML/policy fixtures for push trigger, needs graph, no manual artifact inputs, exact output forwarding, duplicate producer rejection, and failure propagation.
- [ ] Run focused test and capture RED.
- [ ] Implement one push-main orchestrator and reusable boundaries; use `workflow_call` outputs, artifact download by exact run/ID, and preserve action SHA pins/least permissions.
- [ ] Run focused tests and YAML/Bash syntax; prove GREEN and no duplicate canonical build path.
- [ ] Commit `feat(ci): add automatic push-main release pipeline`.

### Task 2: Registry pull and immutable deploy handoff

**Files:**

- Modify `.github/workflows/deploy.yml`, `deploy/compose.production.yml`, `scripts/product/deploy-entrypoint.sh`, and registry/auth documentation.
- Create/modify `tests/product-tooling/registry-deploy-policy.test.mjs` and relevant deploy gate fixtures.

**Interfaces:**

- Consumes Task 1 exact manifest/digest and backup output.
- Produces a remote deploy invocation that authenticates/pulls exact GHCR digest, validates local image identity before migration, and records registry/mutation evidence without exposing credentials.

- [ ] Write RED fixtures for public/private registry policy, denied pull, digest mismatch, `latest` rejection, and no migration on pull failure.
- [ ] Implement minimal registry credential contract (read-only package pull where private; no build token on VPS), exact digest pull/config, and receipt fields.
- [ ] Run focused deploy/registry fixtures plus existing backup/SSH injection tests; prove GREEN.
- [ ] Commit `feat(deploy): pull immutable registry digests on VPS`.

### Task 3: Automatic backup/verify and idempotent orchestration

**Files:**

- Modify `scripts/product/release/coordinator.mjs`, `github-actions.mjs`, `orchestration-policy.mjs`, and reusable backup/verify workflow boundaries.
- Create/modify `tests/product-tooling/push-main-orchestration.test.mjs`.

**Interfaces:**

- Consumes Task 1 job identifiers and target policy.
- Produces bounded stages with one correlation, exact backup/deploy/verify outputs, cancellation/timeout state, and idempotent `already-deployed`/`superseded` outcomes.

- [ ] Write RED fixtures for duplicate push producer, queued newer SHA, rerun, timeout, cancellation, stale source and no later stage after failure.
- [ ] Implement orchestration budget/concurrency/current-state checks without cancelling active mutation blindly.
- [ ] Run coordinator 539+ suite and new focused tests; prove GREEN and preserve old 75+ boundary behavior.
- [ ] Commit `feat(ci): make backup and verification automatic and idempotent`.

### Task 4: Conditional application rollback with schema guard

**Files:**

- Modify `.github/workflows/main-release.yml` and/or create trusted `scripts/product/release/auto-rollback.mjs` plus deploy entrypoint integration.
- Modify receipt/state persistence and `tests/product-tooling/auto-rollback-policy.test.mjs`.

**Interfaces:**

- Consumes last-known-good manifest/artifact ownership, current failed operation ID, current/previous runtime digests, fresh current DB backup and migration/schema state evidence.
- Produces one of `recovered-by-app-rollback` (API/Web `--no-deps`, DB unchanged) or `incident-required`; pipeline remains non-success on release failure.

- [ ] Write RED fixtures for healthy no-migration rollback, changed/failed/unknown migration, missing previous state, PG mismatch, interleaving release and missing backup.
- [ ] Implement fail-closed schema/migration guard, one-attempt rollback and secret-free evidence; never restore/down-migrate DB.
- [ ] Run focused rollback and prior PostgreSQL/injection suites; prove GREEN and verify original failed release remains non-success.
- [ ] Commit `feat(release): guard conditional application auto-rollback`.

### Task 5: Activation docs, rehearsal and final integrated evidence

**Files:**

- Modify `docs/operations/release-checklist.md`, `product-release-runbook.md`, `product-rollback-runbook.md`, `deploy/README.md`, `docs/agent/READINESS.md`.
- Create `docs/reports/2026-11-11-push-main-cd-verification.md` and any isolated rehearsal fixture under `tests/product-tooling/`.

**Interfaces:**

- Documents one-time GitHub/GHCR/VPS configuration, daily merge→push flow, manual recovery routes, expected receipts, and activation boundaries.

- [ ] Write docs/checklist assertions for no manual IDs, registry auth, concurrency, backup, verify, auto rollback/incident and not-run live checks.
- [ ] Implement isolated Docker/rehearsal harness where supported; never spoof hosted-runner guards or mutate production.
- [ ] Run supported locked-runtime product tooling, root tests, lint, type/build/contract/boundary checks, YAML/Bash, docs links/UTF8/format and changed diff checks; record baseline failures without hiding them.
- [ ] Commit `docs: document push-main continuous deployment activation`.

## Final integration and review

- Fast-forward task commits into `feat/modern-cicd` only; keep primary main untouched and preserve dirty unrelated files.
- Generate review package from base `0ba827a3c7e1a2c38abe8ed5c4e98ea59de2d441` to final tip.
- Dispatch a fresh independent final reviewer with this spec, plan, full diff and all verification logs; resolve Critical/Important findings before local handoff.
- Mark status `Implemented` only for committed local code, `Reviewed` only after exact-tip review, `Activated` only after actual GitHub settings/registry/VPS rehearsal, and `Released` only after production receipt.
