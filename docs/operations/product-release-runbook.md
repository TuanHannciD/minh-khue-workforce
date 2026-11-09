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

## Rollback

Chọn manifest cũ đã biết; kiểm compatibility và backup rồi redeploy exact digest. Không chạy down migration. Nếu schema không tương thích, restore sang DB mới, verify và chỉ cutover sau approval.

## Giới hạn

Hosting, storage, key management, retention, RPO/RTO, domain/TLS và production credentials chưa được chọn trong repository này.
