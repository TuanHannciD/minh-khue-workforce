# Vận hành release bất biến

Phạm vi: quy trình tài liệu cho artifact đã kiểm chứng; không tự cấp quyền production.

Đường vận hành hiện hành: [checklist một SHA](release-checklist.md). [Evidence Task4](../reports/2026-11-11-task4-release-checklist.md) ghi verification local trên controls 47e1d7f; không thay readiness sản phẩm. Các giới hạn chưa được quyết định trong hồ sơ bàn giao cũ phải được operator xác minh lại bằng cấu hình/approval thực trước release.

## Luồng phát hành

1. CI từ push lên main chạy trên exact commit và tạo bằng chứng kiểm thử.
2. Build release tạo manifest với full SHA và image digests; chỉ artifact này được bàn giao.
3. Dispatch `release-pipeline.yml` từ `main` với full SHA, mode và backup kind. Coordinator chọn đúng một successful build artifact theo source SHA/manifest/repository rồi dispatch backup → deploy → verify theo exact run/attempt/artifact ID. Backup workflow tạo `BACKUP` đã restore-verified, hoặc `INITIAL_EMPTY_DEPLOYMENT` cho lần đầu.
4. Người vận hành duyệt protected environment, kiểm tra target identity, checksum và SSH fingerprint.
5. Chỉ mode `release` chạy migration forward, health/smoke rồi ghi receipt. `dry-run` deploy chỉ SSH preflight; `bootstrap` tạo thư mục/secret env, không apply release. Coordinator ở cả ba mode vẫn dispatch backup thật qua SSH, không phải offline test. Không lookup tag/digest động.
6. Mode `release`: post-deploy verify đối chiếu receipt, SHA, digest, health và Prisma migration status. Hai mode còn lại chỉ kiểm artifact/SHA, receipt ghi `skipped-preflight-only`.

## Gate và bằng chứng

Giữ manifest, checksum, SBOM/provenance, backup-ready, deploy/post-deploy receipt và log đã loại secret. Mọi thiếu identity, checksum, artifact hoặc health phải fail closed. Không ghi password, token, key, DB URL hay dump content.

## Cấu hình attestation

`MKW_ATTESTATION_MODE` chấp nhận `not-configured` (cũng là mặc định khi unset), `off`, `best-effort`, `required`. Build kiểm allowlist trước checkout/build/push; typo dừng sớm với exit 78. Digest, SBOM và provenance descriptors vẫn được tạo theo contract manifest hiện có; mode điều khiển thêm GitHub attestation của chính manifest.

Đặt mode dùng chung ở **repository variable**, hoặc **organization variable** đã cấp quyền cho repository. Build không gắn environment nên không thấy variable chỉ đặt tại `production`. Thứ tự ưu tiên của GitHub là environment → repository → organization; deploy/rollback có `environment: production` nên environment variable cùng tên có thể ghi đè mode dùng để build. Tránh override cùng tên tại environment; nếu có chủ ý phải đối chiếu cả hai giá trị trước release. Ví dụ repository `required` + production `off` làm deploy bỏ verify; repository `off` + production `required` làm deploy fail closed vì build không tạo attestation. Environment-only `required` cũng không bật signing ở build.

`best-effort` cho phép signing/verification không khả dụng nhưng receipt không được coi là verified. `required` dừng khi signing hoặc xác minh manifest không thành công; chỉ bật sau khi operator kiểm quyền `id-token`/attestations, khả năng của repository và runner `gh attestation verify`. Local fixture không chứng minh cấu hình variable hoặc dịch vụ signing thật.

## Rollback

Theo [rollback runbook](product-rollback-runbook.md): chọn manifest cũ đã biết, duyệt compatibility với schema hiện tại và tạo BACKUP mới của DB hiện tại trước redeploy exact API/Web digests. Snapshot SHA không phải old app SHA. Guard yêu cầu PostgreSQL runtime digest trùng old manifest và giữ DB container; không chạy down migration hoặc restore DB. Nếu schema không tương thích, restore sang DB mới, verify và chỉ cutover sau approval riêng.

## Giới hạn

Controls hiện có GitHub artifact retention 30 ngày, freshness mặc định 24 giờ, path `/home/deploy/mkw`, project `mkw` và origin mặc định trong entrypoint; đó không phải bằng chứng cấu hình production đã được kiểm. Custody key/recovery, storage ACL, RPO/RTO, domain/TLS, credentials và approvals thực cần operator xác minh theo [checklist](release-checklist.md). G3/G4 sản phẩm còn theo [READINESS](../agent/READINESS.md); local CI/CD tests không đóng các gate đó.
