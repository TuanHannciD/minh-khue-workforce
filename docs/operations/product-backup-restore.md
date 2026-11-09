# Backup và restore production

Backup là artifact có `backup-ready.schema.json`, checksum, kích thước, release SHA và bằng chứng restore. `INITIAL_EMPTY_DEPLOYMENT` chỉ dùng khi đã kiểm database rỗng và identity thật; release tiếp theo bắt buộc backup restore-verified.

## Quy trình

- Xác minh host, database, user, release SHA trước dump.
- Tạo logical custom dump vào storage đã được phê duyệt; mã hóa bằng secret store.
- Tính SHA-256/size, ghi metadata không chứa secret.
- Restore vào database tạm riêng bằng transaction; kiểm schema, migration ledger, relations và dữ liệu tối thiểu.
- Chỉ phát hành marker khi restore verification đạt; giữ bản lỗi để điều tra, không phục vụ traffic.

Logical dump không bao gồm OS, roles, tablespace, secret store, proxy hay web artifact. Retention, encryption, storage ACL, RPO/RTO và lịch backup cần owner production phê duyệt.
