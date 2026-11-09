# Post-deploy verification

Đối chiếu receipt với manifest đã duyệt: full release SHA, API/Web/PostgreSQL digests, migration/schema version và target identity. Kiểm tra health endpoint, gateway/API response, startup errors và container health.

Kết quả `passed` phải có timestamp, artifact references và log đã lọc secret. Kết quả `failed` phải ghi verification receipt và kích hoạt đường rollback có approval; workflow không tự rollback.
