# Hoàn tất implementation push-main CD — Task 5 finding responses

Ngày 12/11/2026. Exact base `47db61f6867e14be7256b2a22ea52174fa787849`; branch `t3/complete-push-main-cd`. Completion amendment: [plan amendment](../superpowers/plans/2026-11-12-push-main-completion-amendment.md). Parent vẫn cần independent exact-tip review; báo cáo này không cấp quyền production.

## Responses to Task 5 Important findings

1. **Thiếu `dataOperationEvidence` producer:** đã triển khai producer-backed eligible class `gateway-only`. Build chỉ reuse API khi canonical previous artifact/run/attempt/archive digest, source fingerprint, revision/source labels và attestation đều khớp; API rebuild không bị giả định cùng digest. Manifest giữ policy descriptor sở hữu canonical. Remote deploy journal đo API/PG runtime trước/sau dưới lock và ghi receipt sau gateway apply; consumer kiểm ownership, policy, runtime IDs/images, schema/migration fingerprints, command allowlist và timestamps. Policy/receipt ghi `businessDataWrites: not-assessed`; không claim business-data compatibility. API-changing, migration, side-effect, unknown, missing, forged, stale hoặc interleaved evidence dừng `incident-required` trước rollback mutation.
2. **Manual và automatic dùng chung environment:** mọi `workflow_dispatch` callers trong coordinator/deploy/backup/verify/rollback dùng `production-recovery`; push/scheduled/automatic rollback giữ `production`. Mỗi manual route có approved `main` source-ref guard trước side effects. GitHub environment reviewers/branch settings vẫn Not run; YAML không tự cấu hình reviewer.
3. **Thiếu local Docker rehearsal:** harness `scripts/product/local-release-rehearsal.ps1` + `local-rehearsal-driver.mjs` chạy nested task-owned Docker engine, real production API/Web images, PostgreSQL, TLS local registry boundary, encrypted `pg_dump`/decrypt/`pg_restore`, A→B healthy, unhealthy gateway recovery, changed/unknown migration refusal, API/PG identity assertions và normal API-changing migration. Existing hosted-runner `release-rehearsal.sh` guards không bị spoof.

## Local Docker evidence

`result.json` reports `actualContainers: true`, `actualBuilds: true`, five encrypted backup/restore verifications, `aToB: healthy`, `unhealthyCToB: recovered-by-app-rollback`, changed/unknown migration `incident-required`, unchanged API/PG during gateway recovery, and normal API-changing deploy `verified`. Evidence includes build/push logs, deploy/verify states, prepare/recovery receipts, encrypted dumps and `commands.log`; no secrets or plaintext dump. The nested engine and its owned resources were removed after evidence copy. Local registry/GitHub ownership/signing is explicitly simulated only at the external boundary; live GitHub/GHCR/VPS proof is Not run.

## Minor finding response

`docs/operations/release-checklist.md` now documents `backupId = mkw-<run_id>-<attempt>-<purpose>` with `purpose` `release` or `app-rollback`, matching `.github/workflows/backup.yml` artifact naming.

## Verification

- Focused release suites, including gateway policy, API reuse, manual environment and rollback behavior: PASS.
- `node --test tests/product-tooling/*.test.mjs`: **656/656 PASS**.
- Local Docker rehearsal: **PASS**, `LOCAL_REHEARSAL_OK`.
- Root/product checks, YAML/actionlint/Bash/diff/docs checks remain subject to final exact-tip run; prior Task 5 baseline remains honest: 19 historical documentation links and five Windows `pnpm.exe` API fixture failures are not converted into false passes.

## Activation limits

No production SSH/VPS/database mutation, GitHub settings/secrets/reviewer configuration, push or main merge was performed. Automatic rollback remains noninteractive on `production`; manual recovery approval must be configured in GitHub `production-recovery` before activation. Local success does not establish live signatures, registry access, target clock/backup custody, schema compatibility for business writes, or universal automatic database rollback.
