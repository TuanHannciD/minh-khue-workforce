# Phương án B — Immutable Production CI/CD Pipeline

Ngày: 2026-11-09  
Trạng thái: Draft sau khi người dùng duyệt thiết kế hội thoại  
Phạm vi: workflow CI/CD, release manifest, backup/restore verification, deploy, post-deploy verification và rollback cho Minh Khuê Workforce.

## Mục tiêu và tiêu chí thành công

Pipeline phải tạo release bất biến từ một commit đầy đủ, kiểm thử trước khi phát hành, đóng gói API/Web bằng image digest, dùng PostgreSQL digest đã pin, kiểm chứng backup có thể restore, deploy đúng manifest artifact, xác minh sau deploy và cho phép rollback bằng manifest cũ. Không push remote và không deploy production trong task này.

Done khi:

- Sáu workflow tồn tại, trigger/quyền/concurrency phù hợp và không resolve mutable tag trong deploy.
- Manifest và backup-ready có JSON Schema, validator và checksum; validator fail closed với SHA, digest, schema hoặc field sai.
- Deploy nhận manifest cụ thể từ artifact, không tự lookup digest từ GHCR.
- First deployment có gate `INITIAL_EMPTY_DEPLOYMENT` với bằng chứng database rỗng; các release sau yêu cầu backup thật và restore verification.
- Compose/entrypoint có migration/schema gate, health/smoke, receipt và rollback path.
- Có runbook cập nhật nêu rõ secret/storage/protected environment còn phải cấu hình; không giả định production đã sẵn sàng.
- Test tooling và các check phù hợp đạt; review độc lập trên snapshot cuối.

## Phạm vi file

Tạo hoặc sửa:

```text
.github/workflows/ci.yml
.github/workflows/build-release.yml
.github/workflows/backup.yml
.github/workflows/deploy.yml
.github/workflows/post-deploy-verify.yml
.github/workflows/rollback.yml
deploy/compose.production.yml
deploy/release-manifest.schema.json
deploy/backup-ready.schema.json
scripts/product/release/validate-manifest.mjs
scripts/product/release/validate-backup-ready.mjs
scripts/product/release/verify-release.mjs
scripts/product/operations/create-backup-ready.mjs
scripts/product/operations/verify-restore.mjs
scripts/product/deploy-entrypoint.sh
docs/operations/product-release-runbook.md
docs/operations/product-backup-restore.md
docs/operations/product-rollback-runbook.md
docs/operations/product-post-deploy-verification.md
deploy/README.md
```

Các file untracked hiện có trong `docs/reports/` thuộc task khác phải được bảo toàn.

## Kiến trúc và luồng dữ liệu

### CI

`ci.yml` chạy trên pull request và push. Nó cài đúng pnpm/node theo lockfile, chạy lint, format, typecheck, unit/integration, contract, build và product checks. CI không có quyền packages write, không push image và không deploy.

### Build release

`build-release.yml` chạy sau CI xanh trên `main` bằng `workflow_run` hoặc cơ chế tương đương có kiểm tra commit SHA. Job checkout full immutable SHA. Buildx build/push API và Web với tag commit SHA; digest đầu ra được lấy một lần từ build output. PostgreSQL image chỉ đọc từ `deploy/postgres-image.env` và phải khớp `postgres@sha256:<64hex>`. Job tạo SBOM/provenance, manifest JSON, checksum artifact và upload artifact có retention. Deploy chỉ dùng artifact này.

### Backup

`backup.yml` hỗ trợ `workflow_dispatch` và schedule. Trước dump phải xác minh target, DB identity và release SHA. Dump dùng PostgreSQL custom format, mã hóa bằng secret/key store của protected environment, upload tới storage ngoài VPS hoặc storage đã cấu hình, tính SHA-256 và size. Restore vào database tạm riêng; `verify-restore.mjs` kiểm schema, Prisma migration ledger/version, counts, relations và dữ liệu tối thiểu. Marker không bao giờ là file rỗng. First deployment dùng JSON gate `INITIAL_EMPTY_DEPLOYMENT`, có evidence target/database identity và xác minh rỗng.

### Deploy

`deploy.yml` manual hoặc protected environment approval. Input là full release SHA và artifact/manifest cụ thể. Job xác minh checksum/schema/commit, backup-ready hoặc initial-empty gate, SSH host fingerprint, Docker/Compose/dung lượng/port/identity. Nó upload Compose và manifest, chạy `docker compose config`, schema/migration gate, start exact digest, đợi DB/API/Web healthy, smoke `/` và `/api/health`, rồi ghi receipt. Không lookup digest ngoài manifest và không in secrets.

### Post-deploy verification

`post-deploy-verify.yml` kiểm receipt, release SHA, image digests đang chạy, health, schema/migration version, gateway/API response và startup errors. Failure ghi verification receipt ở trạng thái failed và phát tín hiệu rollback path; không tự rollback ngoài protected approval.

### Rollback

`rollback.yml` manual/protected. Người vận hành chọn manifest cũ. Workflow kiểm compatibility và backup, redeploy exact old digests, health/smoke và ghi rollback receipt. Không chạy down migration. Nếu DB schema không tương thích, runbook yêu cầu restore sang database mới, verify dữ liệu, rồi approval trước cutover trong khi giữ DB cũ.

## Contract chính

`release-manifest.schema.json` yêu cầu:

- `releaseSha`: full 40 hoặc 64 hex SHA theo repository policy.
- `sourceRepository`, `createdAt`, `schemaVersion`.
- `apiImage`, `webImage`, `postgresImage`: immutable `...@sha256:<64hex>`.
- `artifacts`: checksum cho manifest inputs/SBOM/provenance và kích thước nếu có.
- `additionalProperties: false` ở các object contract.

`backup-ready.schema.json` yêu cầu:

- `backupId`, `releaseSha`, `createdAt`, `dumpSha256`, `size`.
- `restoreVerified` boolean, `retentionUntil`, `storageLocation` không chứa secret.
- `kind`: `BACKUP` hoặc `INITIAL_EMPTY_DEPLOYMENT`.
- Với `BACKUP`, `restoreVerified=true`; với initial empty, `databaseVerifiedEmpty=true` và evidence identity bắt buộc.

Script validators dùng Node built-in hoặc dependency hiện có, parse JSON, kiểm schema/regex/invariants và exit non-zero khi sai. Không đọc secrets từ fixture hoặc in nội dung dump.

## Migration và rollback policy

Deploy chỉ chạy forward migrations được review, không tự sinh down migration. Migration gate kiểm Prisma migration ledger và schema version trước khi traffic mở. Rollback ứng dụng có thể dùng manifest cũ nếu schema tương thích. Nếu không tương thích, dừng traffic, restore DB mới từ backup, verify rồi cutover sau approval; DB cũ được giữ lại.

## Bảo mật và failure behavior

Workflow dùng least-privilege permissions, protected environment cho production, concurrency group không cho hai deploy đồng thời, SSH known-host fingerprint và secret channel. Mọi target/identity/storage thiếu hoặc sai đều fail closed. Log không chứa password, DB URL, SSH key, encryption key, dump content hoặc token. Artifact checksum không thay thế chữ ký/attestation; provenance/SBOM phải được upload và kiểm tra theo khả năng action/runtime thực tế.

## Kiểm thử và review

- Unit tests cho validators, manifest checksum, backup-ready invariants, restore verification decision và release verification.
- YAML/static checks cho trigger, permissions, mutable-tag rejection, artifact handoff và absence of runtime digest lookup.
- Compose config test với fixture digest/env; không kết nối production.
- Chạy `npm run check`, product tooling tests và các checks phù hợp trong `package.json`.
- Reviewer độc lập đọc exact `base..tip`, diff, contracts, workflow permissions và validation output. Nếu research web không khả dụng, ghi `Not run/Blocked` cùng URL tài liệu chính thức cần tra cứu; không claim đã tra cứu.

## Nguồn và giới hạn nghiên cứu

Nguồn cần đối chiếu chính thức: GitHub Actions workflow/artifacts/environments/concurrency/attestations, Docker Buildx build-push-action, GHCR digest, PostgreSQL `pg_dump`/`pg_restore`, Docker Compose healthcheck. Trong phiên hiện tại không có web/search tool khả dụng, nên việc tra cứu trực tiếp là **Not run/Blocked**. Implementation chỉ dùng semantics đã có trong repository và ghi giới hạn này trong research/validation artifact; không xem report cũ là bằng chứng hiện hành.

## Ngoài phạm vi

Không push remote, không deploy production, không tạo scheduler thật, không thay đổi nghiệp vụ/schema ứng dụng ngoài gate kiểm tra, không chọn nhà cung cấp object storage/key management thay người vận hành, không xử lý production credentials hoặc dữ liệu nhân sự thật.
