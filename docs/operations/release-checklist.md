# Checklist kích hoạt release hiện hành

Phạm vi: local đã review → merge → `git push origin main`. Đây là đường duy nhất tự động phát hành production. Người vận hành không nhập SHA/run/artifact ID và không cần chọn artifact.

## Chuẩn bị một lần

- [ ] Repository có `main-release.yml` và reusable workflows từ cùng tip đã review; branch protection/required CI và environment approvals đã được kiểm bằng settings thật.
- [ ] `production` có `MKW_SSH_HOST`, `MKW_SSH_PORT`, `MKW_SSH_HOST_FINGERPRINT`, `MKW_DEPLOY_PATH`, `MKW_PROJECT_NAME`, `MKW_GATEWAY_PORT`, `MKW_REGISTRY_*`, `MKW_ATTESTATION_MODE`, `MKW_BACKUP_MAX_AGE_SECONDS`.
- [ ] Secrets hiện có vẫn được dùng: `MKW_SSH_PRIVATE_KEY`, `MKW_BACKUP_ENCRYPTION_KEY`. SSH dùng fingerprint pinning; registry token trên VPS chỉ read-only, mode 600.
- [ ] VPS đã bootstrap env/Compose một lần bằng route thủ công được bảo vệ. Giữ volume PostgreSQL và env secrets hiện có.
- [ ] Backup encryption key được lưu riêng với VPS. Backup là `pg_dump` mã hóa, có checksum, restore verification, freshness và target identity; mã hóa bảo vệ dump khi artifact nằm ngoài máy chủ.

## Mỗi release

1. Review và merge local code, sau đó `git push origin main`.
2. `main-release.yml` chạy CI quality. Chỉ khi quality đạt mới mở full Docker build API/Web và backup `BACKUP`; hai stage có thể chạy song song.
3. Build push image bằng Docker official actions, ghi manifest/checksum/SBOM/provenance và exact GHCR digests. Không reuse API image, không chọn latest.
4. Backup SSH vào đúng VPS, dump database hiện hữu, mã hóa, restore verify và upload artifact. Backup lỗi, cũ, sai SHA, fingerprint hoặc target đều dừng trước deploy.
5. Deploy tải đúng artifact IDs/digests, kiểm lại source `main`, SSH fingerprint, GHCR pull/RepoDigest và remote `flock`. Legacy VPS không có current-state/LKG vẫn đi tiếp khi BACKUP hợp lệ.
6. Entrypoint giữ `db.env`/`api.env`, chạy `prisma migrate deploy`, rồi `docker compose up --wait` với image digest cố định. Không `reset`, `down -v`, xóa volume hoặc tự restore database.
7. Verify kiểm image IDs/digests, migration status, service health và HTTP smoke. Receipt ghi release SHA, digest, backup và stage result. Thành công là sau verify; thất bại dừng và chỉ dẫn manual recovery.

## Khi thất bại hoặc chạy lại

Giữ correlation `<run_id>-<attempt>`, SHA, stage, exact artifact/archive digest và backup identity trong summary. Không retry mù khi remote lock còn giữ; chờ lock giải phóng hoặc kiểm operator. Rerun cùng SHA dùng migration tiến về trước và Compose idempotent; không dựa vào timestamp receipt lịch sử.

Không có automatic application rollback hoặc automatic database restore. Nếu cần quay lui, operator dùng [manual rollback runbook](product-rollback-runbook.md), xác nhận compatibility và backup DB hiện tại; route đó không down-migrate, không đổi PostgreSQL và không restore đè volume đang chạy.

## Giới hạn kiểm chứng local

Docker disposable rehearsal, static checks và focused tests không chứng minh GitHub/GHCR attestation, SSH/VPS hay production settings thật. Operator phải kiểm các biến, approvals và receipts thật trước khi bật release.

Thiết kế cũ về current-state/LKG, API reuse, schema fingerprint, gateway-only proof và automatic rollback đã **superseded** trong normal push-main path; report/ledger lịch sử vẫn được giữ để audit.
