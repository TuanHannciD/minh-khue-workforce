# MKW production packaging

This directory is the image/Compose boundary for the independent `mkw` project.
It does not share networks, volumes, ports, or containers with other projects.

Compose consumes only the release manifest's immutable `@sha256:<64 hex>` image
references. The release entrypoint validates the complete manifest and backup
contract before rendering Compose; it never resolves a digest from a registry.

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
or failed post-start attempt writes an atomic secret-free receipt containing
`releaseSha`, `imageDigests`, `status`, and UTC `utc`.

## Server setup

The protected GitHub Environment is `production`. Configure SSH host fingerprint,
`MKW_DEPLOY_PATH=/home/deploy/mkw`, `MKW_PROJECT_NAME=mkw`, and
`MKW_GATEWAY_PORT=3200` there. Store private keys and database/API env files only
in the protected environment or server; never commit or print their values.

Run `deploy-entrypoint.sh --dry-run` before bootstrap, then use `--bootstrap`, and
finally invoke `--release --manifest <path> --compose <path> --backup-ready <path>`
only after the required JSON gate and release artifact are available. No production
deploy is performed by this repository task.
