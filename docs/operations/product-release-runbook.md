# Runbook release push-main

Mục tiêu là một luồng ngắn và có thể lặp lại: merge local → push `main` → quality → build API/Web → encrypted verified backup → Docker Compose deploy VPS → health/smoke check.

`main-release.yml` là workflow push-main duy nhất. Concurrency dùng `cancel-in-progress: false`; quality là reusable CI hiện có, build và backup chỉ mở sau quality, deploy cần cả hai, verify cần deploy thành công. Deploy kiểm lại SHA `main` ngay trước SSH mutation để push mới không ghi đè release đang chạy.

Build luôn build cả hai image bằng `docker/setup-buildx-action`, `docker/login-action` và `docker/build-push-action` đã pin SHA. Artifact manifest bind source SHA, API/Web digests và PostgreSQL digest; deploy tải đúng artifact ID và kiểm checksum/attestation theo mode đã cấu hình. Không có API reuse, current-state adoption hoặc LKG selection.

Backup chạy `pg_dump` trên database hiện hữu trong VPS qua SSH fingerprint pinning. Dump được mã hóa bằng secret hiện có, hash, restore vào database kiểm tra và ghi `backup-ready.json` với `BACKUP`, SHA, freshness, database identity và target identity. Backup fail trước mọi migration; normal push-main không dùng `INITIAL_EMPTY_DEPLOYMENT` hoặc empty fallback.

Entrypoint dùng remote `flock`, pull/check RepoDigest các image exact, giữ env và PostgreSQL volume, chạy `prisma migrate deploy`, sau đó `docker compose up --wait` và HTTP smoke. Lỗi migration dừng trước Compose traffic; lỗi health/smoke dừng release. Không reset database, down/remove volume, down-migrate hoặc auto restore.

Verify kiểm image IDs/digests, migration status, health và `/` + `/api/health`, rồi upload receipt. Receipt và summary phải nêu stage, SHA, image digests, backup run/attempt/artifact digest và target. Không có automatic rollback; lỗi cần manual recovery theo runbook riêng.

Các workflow/manual routes còn lại phục vụ bootstrap, backup theo lịch và recovery có approval. Thiết kế immutable CD cũ về current-state v2/LKG, schema fingerprint, gateway-only proofs, API reuse và automatic rollback được đánh dấu **superseded** cho normal path; báo cáo lịch sử không bị xóa.

Nguồn chính thức được dùng cho lựa chọn này: [reusable workflows](https://docs.github.com/en/actions/sharing-automations/reusing-workflows), [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [Docker GHA](https://docs.docker.com/guides/gha/), [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), và [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html). Provenance ghi lại trong task ledger; pin action/version là pin đang có trong repository, không suy correctness từ stars.
