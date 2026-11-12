# MKW production packaging

This directory owns the `mkw` Compose/image boundary. Normal operation is
`merge local -> git push origin main`; the push-main workflow runs quality, full
API/Web image builds, encrypted verified `BACKUP`, deploy and verify. Production
concurrency keeps an active mutation; a newer push waits.

Compose receives only immutable `@sha256:<64 hex>` references from the release
manifest. The pinned remote entrypoint checks the manifest, exact GHCR pull and
RepoDigest, target-bound backup, remote `flock`, forward Prisma migration,
Compose health and HTTP smoke. It retains existing env files and PostgreSQL
volume. It never resets, removes volumes, down-migrates or restores a database.

## Release gate

Normal push-main requires `kind: BACKUP`, `restoreVerified: true`, encrypted
`pg_dump` checksum/restore verification, freshness and database target identity.
`INITIAL_EMPTY_DEPLOYMENT` remains available only to explicitly approved manual
bootstrap routes; it is not an automatic fallback. A legacy healthy target with
no current-state/LKG files proceeds with a valid BACKUP and exact artifact
inputs.

A successful or failed attempt writes an atomic secret-free receipt with release
SHA, exact image digests, backup/stage status and UTC. Migration failure stops
before application traffic. Verification checks image IDs/digests, migration
status, health and `/` plus `/api/health`.

## Server setup

Configure the protected `production` environment with SSH fingerprint,
`MKW_DEPLOY_PATH=/home/deploy/mkw`, `MKW_PROJECT_NAME=mkw`,
`MKW_GATEWAY_PORT=3200`, registry vars and the existing SSH/backup secrets.
Bootstrap env/Compose once through the protected manual route, then let
`git push origin main` activate releases. Manual deploy/backup/recovery routes
use `production-recovery` and require `refs/heads/main`.

The old current-state v2/LKG, API reuse, schema-fingerprint, gateway-only proof
and automatic rollback design is **superseded** for normal releases. Manual
recovery remains operator-controlled and does not auto-restore or down-migrate;
see [release checklist](../docs/operations/release-checklist.md) and [rollback
runbook](../docs/operations/product-rollback-runbook.md).

`local-release-rehearsal.ps1` is the disposable Docker rehearsal entrypoint. Its
local evidence does not prove live GitHub, GHCR, SSH, VPS or production settings.
