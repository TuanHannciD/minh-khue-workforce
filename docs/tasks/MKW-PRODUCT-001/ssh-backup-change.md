# Backup qua SSH trong mạng riêng MKW

Ngày 11/11/2026; user duyệt thiết kế trong hội thoại. Base `db64888`, worktree `fix-password-min-eight` đang cách ly.

- Mục tiêu: BACKUP không còn cần MKW_DATABASE_URL; DB credentials chỉ ở VPS.
- Scope: workflow backup, helper chỉ đọc DB MKW qua SSH, restore/encryption ở runner, tests và runbook. Không deploy/restore vào production.
- Acceptance: xác minh SSH fingerprint và identity MKW trước dump; restore trong container runner riêng không publish port; gate chỉ sau schema/migration/count và decrypt roundtrip đạt. INITIAL_EMPTY giữ cho target chưa triển khai.
- Risk: backup chứa auth/nhân sự; chỉ upload ciphertext + checksum + metadata; không log dữ liệu/hash/password. Không tác động sản phẩm khác, không đọc env DB.
- Writer inline; reviewer độc lập Sol/high qua requesting-code-review. Tài nguyên: Docker Desktop local, fixture tên riêng, dữ liệu giả; SSH production chỉ kiểm tra bounded nếu cần.
- Next: test red/green, rehearsal thật + failure paths, review, commit và handoff GitHub. Backup production và deploy vẫn do user chạy sau tích hợp.
