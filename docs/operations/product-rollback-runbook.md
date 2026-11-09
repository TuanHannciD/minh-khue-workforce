# Rollback runbook

Rollback cần protected approval và manifest cũ cụ thể. Kiểm checksum/schema, backup-ready, target identity và image digests trước thao tác.

1. Dừng release mới hoặc đưa traffic vào maintenance theo quyết định vận hành.
2. Chọn manifest cũ tương thích và redeploy exact API/Web/PostgreSQL digests.
3. Chạy health, smoke và post-deploy verification; ghi rollback receipt.
4. Nếu database không tương thích, không down-migrate: restore backup vào database mới, verify rồi cutover sau approval; giữ DB cũ.

Không tự rollback khi verification thất bại và không in secret vào log.
