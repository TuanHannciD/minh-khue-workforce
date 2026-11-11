# Backup và restore production

Backup là artifact có `backup-ready.schema.json`, checksum, kích thước, release SHA và bằng chứng restore. `INITIAL_EMPTY_DEPLOYMENT` chỉ dùng khi đã kiểm database rỗng và identity thật; release tiếp theo bắt buộc backup restore-verified.

Luồng coordinator, scope variables/secrets, exact artifact IDs và failure recovery: [release checklist](release-checklist.md). Quy trình dưới mô tả controls hiện hành, không tự cấp quyền dump/restore production.

## Quy trình

- Xác minh host, database, user, release SHA trước dump.
- Tạo logical custom dump vào storage đã được phê duyệt; mã hóa bằng secret store.
- Tính SHA-256/size, ghi metadata không chứa secret.
- Restore vào database tạm riêng bằng transaction; kiểm schema, migration ledger, relations và dữ liệu tối thiểu.
- Chỉ phát hành marker khi restore verification đạt; khi lỗi giữ IDs/log an toàn để điều tra, không phục vụ traffic. Runner hiện cleanup plaintext dump và encrypted output lỗi; không hứa giữ bản dump lỗi.

Logical dump không bao gồm OS, roles, tablespace, secret store, proxy hay web artifact. Retention, encryption, storage ACL, RPO/RTO và lịch backup cần owner production phê duyệt.

## Controls hiện hành và custody key

`backup.yml` dùng SSH fingerprint đã pin để đọc source `mkw-db-1`, project/service/volume và PostgreSQL identity. Dump custom và counts dùng cùng exported read-only repeatable-read snapshot. Runner restore vào PostgreSQL digest đã pin, network none/không host ports, kiểm bảng/FK/migration prefix/counts rồi mã hóa AES-256-CBC với PBKDF2/salt bằng `MKW_BACKUP_ENCRYPTION_KEY`; giải mã lại và so byte trước khi phát gate. Đây là verification hữu hạn theo assertions đó, không chứng minh RTO hay mọi nghiệp vụ. Plaintext tạm bị cleanup cả khi lỗi; không hứa giữ dump lỗi để điều tra. Giữ log an toàn/IDs, không dump contents hoặc raw credential-bearing output.

Artifact `mkw-backup-<run_id>-<attempt>` giữ `database.dump.enc`, checksum encrypted file và `backup-ready.json` trong 30 ngày; `INITIAL_EMPTY_DEPLOYMENT` chỉ có metadata. Ghi exact artifact ID, backup ID, run/attempt, size/digest, UTC, database identity và retention để tìm lại đúng bản. Freshness deploy/coordinator mặc định 86400 giây, rollback cũng 86400; retention 30 ngày không làm snapshot cũ hơn 24 giờ đủ điều kiện release. Lịch YAML hiện là `17 2 * * *` UTC; task tài liệu này không bật hoặc xác nhận scheduler đã chạy.

Key chỉ cấp qua protected environment secret cho backup runner, không lên VPS/Git/artifact/log. Trước release, operator phải chỉ định người giữ chính/dự phòng và lưu bản recovery độc lập ngoài GitHub Actions theo secret store/escrow đã duyệt; lưu mapping key version → backup IDs qua metadata vận hành kín, không thêm key vào schema backup. Khi rotate, giữ key cũ tới khi mọi backup cần nó hết retention/recovery window. Không thể lấy lại plaintext key từ GitHub secret để phục hồi; mất mọi bản key có thể làm encrypted backup không dùng được.

Diễn tập recovery được phê duyệt phải tải exact artifact, kiểm checksum/size/identity, cấp đúng key qua kênh kín/stdin, giải mã trong thư mục private và restore DB mới tách traffic; kiểm schema/migration/data, thu hồi restored sessions trước mở truy cập theo G1, rồi mới duyệt cutover. Workflow backup chưa cung cấp công cụ revoke-only/cutover production; owner và route đó vẫn cần kiểm riêng. Không đổi key/metadata hoặc tái tạo evidence để qua gate.

Application rollback cần BACKUP mới của **DB hiện tại**, không bản gắn old app SHA. `releaseSha` trong snapshot là provenance, không bắt buộc bằng ứng dụng cũ; PostgreSQL digest/schema compatibility và approval theo [rollback runbook](product-rollback-runbook.md). Restore dữ liệu là route riêng, không được suy từ receipt `application-only`.
