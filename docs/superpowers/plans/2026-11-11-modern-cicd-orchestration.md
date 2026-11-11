# Modern CI/CD Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the existing MKW GitHub Actions release path easier to operate while tightening backup freshness, artifact linkage, supply-chain verification, and rollback evidence without claiming automatic database recovery.

**Architecture:** Keep CI, immutable build, backup, deploy, post-deploy verification, and rollback as separate reusable workflow boundaries. Add a thin manual release coordinator that accepts one release SHA and derives/validates the linked build and backup artifacts through GitHub Actions outputs/API. Strengthen pure Node validators and shell guards; preserve SSH backup and VPS deployment model.

**Tech Stack:** GitHub Actions YAML, Bash, Node.js built-in modules, existing release validators and artifact APIs.

**Spec:** Approved in conversation 2026-11-11; design covers coordinator, backup gate, supply-chain/rollback, and local verification.

## Global Constraints

- Never print or persist secret contents; encryption and SSH credentials remain secret-channel inputs.
- Production mutations remain behind `environment: production` and existing SSH host fingerprint checks.
- Do not invent a database rollback operation; application rollback must state database compatibility limits.
- Preserve current `BACKUP` and `INITIAL_EMPTY_DEPLOYMENT` contracts and existing artifact schema unless a validator-compatible additive field is required.
- Do not use Docker Desktop or production SSH for validation unless a test explicitly requires it and ownership is verified.
- Runtime subagents use gpt-6.1-sol with reasoning high or lower; Astra is prohibited.

## Review Focus

- A stale, wrong-release, or malformed backup gate must fail before deployment.
- Coordinator must not silently select an unrelated build or backup artifact.
- Workflow inputs and failure messages must not expose secrets or create shell injection.
- Rollback receipts must distinguish application rollback from database recovery.
- Existing dry-run/bootstrap/release behavior must remain compatible.

### Task 1: Backup readiness and freshness contract

**Files:**
- Modify: `scripts/product/release/validate-backup-ready.mjs`
- Modify: `.github/workflows/deploy.yml`
- Test: existing validator tests or a new focused Node test under `tests/product-tooling/`

**Interfaces:**
- Validator accepts existing JSON plus an explicit expected release SHA and maximum age supplied by deploy.
- Deploy fails before SSH mutation when backup release linkage, timestamp, or retention is invalid.

- [ ] Add failing tests for wrong release SHA, future timestamp, expired retention, and valid initial-empty metadata.
- [ ] Implement pure validation with deterministic UTC comparisons and secret-safe errors.
- [ ] Wire deploy to validate the expected SHA and configurable freshness policy before transfer.
- [ ] Run focused validator tests and existing product tooling tests.

### Task 2: Single-input release coordinator

**Files:**
- Create: `.github/workflows/release-pipeline.yml`
- Create: `scripts/product/release/resolve-artifacts.mjs` if GitHub API resolution needs a tested helper
- Test: validator/helper tests and YAML/static checks

**Interfaces:**
- Manual input: `release_sha`, `mode` (`dry-run|bootstrap|release`), and optional `backup_kind`.
- Coordinator emits exact build run, backup run, and artifact names as job outputs and passes them to existing workflows or shared scripts.

- [ ] Define safe resolution rules: exact SHA, successful build workflow, exact release artifact, and backup artifact linked to the same SHA.
- [ ] Add explicit failure for zero or multiple matching runs; never choose “latest” without SHA equality.
- [ ] Reuse existing deploy/verify logic where GitHub Actions permits; otherwise keep the coordinator as a checked orchestration wrapper.
- [ ] Add static tests for input validation, output names, and no secret interpolation.

### Task 3: Supply-chain and rollback hardening

**Files:**
- Modify: `.github/workflows/build-release.yml`, `.github/workflows/deploy.yml`, `.github/workflows/rollback.yml`, `.github/workflows/post-deploy-verify.yml`
- Modify: `scripts/product/deploy-entrypoint.sh` only where receipt/compatibility messaging requires it
- Test: focused YAML/static checks and existing release validator tests

**Interfaces:**
- Build continues emitting digest, SBOM, and provenance metadata.
- Deploy records whether attestation verification was performed and fails closed when the configured verification mode requires it.
- Rollback receipt explicitly states `application-only` unless a separate approved database restore is executed.

- [ ] Pin newly touched third-party actions safely or document immutable pin requirements when repository policy cannot be changed in this task.
- [ ] Add attestation verification using an available runner-native command, with a clear Not configured path that does not claim verification.
- [ ] Harden rollback reason handling and receipt semantics.
- [ ] Run focused checks and inspect the complete diff.

### Task 4: Documentation and operator path

**Files:**
- Modify: `docs/operations/product-runbook.md`, `docs/operations/product-backup-restore.md`, `docs/agent/READINESS.md`
- Create: `docs/operations/release-checklist.md`

- [ ] Document the one-input coordinator flow, required secrets/variables, backup key ownership, and failure recovery.
- [ ] Separate “implemented”, “verified locally”, and “production operator must verify”.
- [ ] Include a concrete feature-release example and database rollback limitation.
- [ ] Run docs checks and link validation.

### Task 5: Independent review and integration verification

- [ ] Review each task on its exact final snapshot.
- [ ] Run `npm run check` or the repository’s applicable product checks, plus focused workflow/validator checks.
- [ ] Run Docker rehearsal only if required by a failed or uncovered release check; do not start production services.
- [ ] Record remaining production gates and handoff; no push/deploy claim without external evidence.
