# MKW production packaging

This directory is the image/Compose boundary for the independent `mkw` project.
It does not share networks, volumes, ports, or containers with other projects.

After one-time activation, normal operation is `merge local -> git push origin main`.
The push-main workflow runs quality -> immutable GHCR -> backup -> deploy -> verify
using the full push SHA and exact outputs; no manual SHA/run/artifact IDs are needed.
Build and backup may run in parallel after quality; deploy requires both to succeed.
Production concurrency does not cancel active mutation for a newer push.
See the [activation checklist](../docs/operations/release-checklist.md).

Compose consumes only the release manifest's immutable `@sha256:<64 hex>` image
references. The release entrypoint validates the complete manifest and backup
contract before rendering Compose; it never resolves a digest from a registry.
Before any database migration or Compose mutation it pulls API/Web by those exact
digests and checks the local `RepoDigest`. A public GHCR package uses anonymous
pull. A private package requires a VPS-only mode-600 token file and a dedicated
read-only `read:packages` credential (`MKW_REGISTRY_PULL_USERNAME` and
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
`mkw` theo bootstrap/Compose, cả BACKUP và initial-empty có identity chính xác
`${MKW_SSH_HOST}/${MKW_DEPLOY_PATH}/${MKW_PROJECT_NAME}` như backup producer.
Workflow truyền policy vào remote; thiếu identity hoặc metadata khác target bị
chặn ở runner và dưới deploy lock trước mutation. Không dùng dispatch input làm
nguồn expected production target.

## Auto rollback và giới hạn activation

Producer hiện tạo policy được bind vào canonical manifest và remote runtime
receipt cho gateway-only: source/provenance API đã kiểm, exact API/PG image và
container giữ nguyên, không migrate/restart API/data/startup command. Recovery
class này chỉ `up --no-deps gateway`; missing/unknown/forged/interleaved evidence
phải incident. Policy không chứng minh business writes không xảy ra. API-changing
release vẫn deploy/migrate bình thường và incident-only khi thiếu compatibility
proof. Mọi auto recovery giữ ownership/attestation/backup/schema/PG guards, chỉ một
lần, không restore/down-migrate/đổi PostgreSQL. Signing off/not-configured hoặc
không verify được manifest thì chọn API build thường, không cấp gateway reuse.

Automatic dùng `production`; mọi manual dispatch dùng `production-recovery` và
source guard `main`. Owner phải cấu hình reviewer/approved branch/secrets/vars
theo [release checklist](../docs/operations/release-checklist.md); GitHub settings
vẫn Not run. Direct manual deploy cũng phải resolve exact canonical artifact/run
trước SSH, độc lập signing mode. Manual verifier giữ nguyên current-state/LKG,
không tạo record verified thiếu binding; journal uncertain vẫn cần incident.

`release-rehearsal.sh` chỉ dành cho fresh hosted runner, không spoof guards.
Local entry `scripts/product/local-release-rehearsal.ps1` chạy Docker/DB thật
trong engine task-owned, giữ evidence trước cleanup. Local GitHub ownership và
signing boundary là giả lập; không chứng minh live GitHub/GHCR/SSH/VPS activation.
Xem [completion evidence](../docs/reports/2026-11-12-push-main-completion.md) và
[sửa integrated review](../docs/reports/2026-11-12-push-main-integrated-fix-r2.md).
