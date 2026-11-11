# Vận hành release bất biến

Phạm vi: quy trình tài liệu cho artifact đã kiểm chứng; không tự cấp quyền production.

## Luồng phát hành

1. CI chạy trên commit và tạo bằng chứng kiểm thử.
2. Build release tạo manifest với full SHA và image digests; chỉ artifact này được bàn giao.
3. Backup workflow tạo `BACKUP` đã restore-verified, hoặc `INITIAL_EMPTY_DEPLOYMENT` cho lần đầu.
4. Người vận hành duyệt protected environment, kiểm tra target identity, checksum và SSH fingerprint.
5. Deploy chạy migration forward, health/smoke rồi ghi receipt. Không lookup tag/digest động.
6. Post-deploy verify đối chiếu receipt, SHA, digest, health và migration version.

## Gate và bằng chứng

Giữ manifest, checksum, SBOM/provenance, backup-ready, deploy/post-deploy receipt và log đã loại secret. Mọi thiếu identity, checksum, artifact hoặc health phải fail closed. Không ghi password, token, key, DB URL hay dump content.

## Cấu hình attestation

`MKW_ATTESTATION_MODE` chấp nhận `not-configured` (cũng là mặc định khi unset), `off`, `best-effort`, `required`. Build kiểm allowlist trước checkout/build/push; typo dừng sớm với exit 78. Digest, SBOM và provenance descriptors vẫn được tạo theo contract manifest hiện có; mode điều khiển thêm GitHub attestation của chính manifest.

Đặt mode dùng chung ở **repository variable**, hoặc **organization variable** đã cấp quyền cho repository. Build không gắn environment nên không thấy variable chỉ đặt tại `production`. Thứ tự ưu tiên của GitHub là environment → repository → organization; deploy/rollback có `environment: production` nên environment variable cùng tên có thể ghi đè mode dùng để build. Tránh override cùng tên tại environment; nếu có chủ ý phải đối chiếu cả hai giá trị trước release. Ví dụ repository `required` + production `off` làm deploy bỏ verify; repository `off` + production `required` làm deploy fail closed vì build không tạo attestation. Environment-only `required` cũng không bật signing ở build.

`best-effort` cho phép signing/verification không khả dụng nhưng receipt không được coi là verified. `required` dừng khi signing hoặc xác minh manifest không thành công; chỉ bật sau khi operator kiểm quyền `id-token`/attestations, khả năng của repository và runner `gh attestation verify`. Local fixture không chứng minh cấu hình variable hoặc dịch vụ signing thật.

## Rollback

Chọn manifest cũ đã biết; kiểm compatibility và backup rồi redeploy exact digest. Không chạy down migration. Nếu schema không tương thích, restore sang DB mới, verify và chỉ cutover sau approval.

## Giới hạn

Hosting, storage, key management, retention, RPO/RTO, domain/TLS và production credentials chưa được chọn trong repository này.
