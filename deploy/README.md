# MKW production packaging

This directory is the image/Compose boundary for the independent `mkw` project.
It does not share networks, volumes, ports, or containers with other projects.

Compose consumes only the release manifest's immutable `@sha256:<64 hex>` image
references. The release entrypoint validates the complete manifest and backup
contract before rendering Compose; it never resolves a digest from a registry.
Before any database migration or Compose mutation it pulls API/Web by those exact
digests and checks the local `RepoDigest`. A public GHCR package uses anonymous
pull. A private package requires a VPS-only mode-600 token file and a dedicated
read-only `packages:read` credential (`MKW_REGISTRY_PULL_USERNAME` and
`MKW_REGISTRY_PULL_TOKEN_FILE`); the build's package-write token is never sent to
the VPS, artifact, receipt, or command line.

## Release gates

A release requires `--manifest <release-manifest.json>` and
`--backup-ready <backup-ready.json>`. The backup-ready JSON must validate against
`deploy/backup-ready.schema.json`: later releases use `kind: BACKUP` with
`restoreVerified: true`; the first deployment may use
`kind: INITIAL_EMPTY_DEPLOYMENT` with explicit target/database empty evidence.
An empty backup marker is never accepted.

The entrypoint renders absolute secret env-file paths, runs `docker compose config`,
then runs the approved forward migration (`pnpm db:deploy`) before `compose up`.
It waits for DB/API/gateway health and smokes `/` and `/api/health`. A successful
or failed attempt writes an atomic secret-free receipt containing `releaseSha`,
`imageDigests`, registry auth/pull status, mutation state, `status`, and UTC
`utc`. A denied pull or local digest mismatch records a failed pre-mutation
receipt and exits before migration.

## Server setup

The protected GitHub Environment is `production`. Configure SSH host fingerprint,
`MKW_DEPLOY_PATH=/home/deploy/mkw`, `MKW_PROJECT_NAME=mkw`, and
`MKW_GATEWAY_PORT=3200` there. Store private keys and database/API env files only
in the protected environment or server; never commit or print their values.

Run `deploy-entrypoint.sh --dry-run` before bootstrap, then use `--bootstrap`, and
finally invoke `--release --manifest <path> --compose <path> --backup-ready <path>`
with explicit `MKW_BACKUP_MAX_AGE_SECONDS`, `MKW_BACKUP_EXPECTED_KIND`,
`MKW_BACKUP_EXPECTED_HOST`, `MKW_BACKUP_EXPECTED_DATABASE=mkw` and
`MKW_BACKUP_EXPECTED_TARGET_IDENTITY` after the
required JSON gate and release artifact are available. The remote host reads its
own UTC clock for preflight, again under the deploy lock before changing env or
Compose state, and before migrations. `MKW_BACKUP_NOW` is not a production clock
override. Tests stub `date` to keep comparisons deterministic.

Forward releases require backup `releaseSha` to match the target application SHA.
Application rollback requires a fresh, restore-verified `BACKUP` snapshot of the
current database installed at `shared/backup-ready.json`; its `releaseSha` records
snapshot provenance and need not equal the old application SHA. Empty-deployment
evidence cannot authorize rollback. Retention and maximum age still apply at the
remote mutation boundary. Rollback preserves the running PostgreSQL container and
rejects a PostgreSQL digest mismatch before changing env or Compose state.
No production deploy is performed by this repository task.

Target policy đến từ trusted production vars: host là `MKW_SSH_HOST`, database
`mkw` theo bootstrap/Compose, initial-empty identity chính xác
`${MKW_SSH_HOST}/${MKW_DEPLOY_PATH}/${MKW_PROJECT_NAME}` như backup producer.
Workflow truyền policy vào remote; thiếu identity hoặc metadata khác target bị
chặn ở runner và dưới deploy lock trước mutation. Không dùng dispatch input làm
nguồn expected production target.
