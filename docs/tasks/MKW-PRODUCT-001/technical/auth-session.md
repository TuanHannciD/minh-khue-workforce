# Auth/session/reset — thiết kế cho G1

Ngày28/10/2026. **Proposed for G1 review**; chưa tạo account/hash/session, cài thư viện hoặc thao tác hệ thống thật. Tên/mật khẩu, hai account ngang quyền, không signup, reset qua vận hành đã duyệt; bản này cụ thể hóa kỹ thuật, không tạo role/admin mới. Đọc [API](api-contract.md), [data model](data-model.md), [manifest](toolchain-manifest.md).

## 1. Mật khẩu và hai tài khoản

- Hai User bản đầu do lệnh vận hành tạo sẵn, không màn hình đăng ký. Account vận hành/OS không là User thứ ba trong sản phẩm. Username case-sensitive, không public danh sách; validate1–64 ký tự khi provision. Không tự chọn tên/mật khẩu thật trong fixture/docs.
- Dùng argon2 library Argon2id, salt ngẫu nhiên do thư viện; memoryCost65536KiB, timeCost3, parallelism1, hashLength32. Encoded hash chứa params/salt, không tự viết thuật toán. Chỉ lưu passwordHash, không mã hóa có thể giải ngược. Kiểm native binding Windows/Linux task3 và đo chi phí hash, chưa gọi cấu hình này đã benchmark.
- Password provision/reset tối thiểu12 ký tự Unicode, tối đa1024 bytes UTF-8; không trim/thay chữ, không ép quy tắc ký tự tùy tiện. Login không từ chối password cũ chỉ do min-length sau này đổi; giới hạn max byte vẫn bảo vệ tài nguyên. Hash compute ngoài transaction, sau khi khóa User phải kiểm hash/authVersion chưa đổi trước verify result/create session; nếu đổi giữa chừng trả401 generic.
- Login sai account hoặc password cùng401 `INVALID_CREDENTIALS`, message “Tên đăng nhập hoặc mật khẩu chưa đúng.” Account vắng vẫn chạy verify dummy hash cùng params để giảm chênh thời gian; không log request body/hash/raw session. HTTPS bắt buộc trước vận hành thật, localhost không chứng minh production đã an toàn.

## 2. Phiên opaque lưu server

Token32 bytes crypto.randomBytes, encode base64url, cookie chứa raw token; DB chỉ SHA256(token) và Session metadata. Hash nhanh phù hợp session ngẫu nhiên entropy cao, không dùng SHA256 thay Argon2 cho password. Không JWT/localStorage/Zustand token, không đưa credential vào URL.

| Policy | Giá trị đề xuất |
| --- | --- |
| Absolute expiry | 12 giờ từ login, không trượt qua mốc này |
| Idle expiry | 2 giờ không có request hợp lệ; polling active cũng tính hoạt động |
| lastSeen update | Gộp tối đa1 lần/phút/phiên, không kéo dài absolute expiry |
| Rotation | Login luôn token mới; không giữ token trước đó để session fixation |
| Logout | Revoke phiên hiện tại và clear cookie; lặp lại vẫn204 |
| Reset password | Tăng User.authVersion + revoke tất cả session trong cùng transaction |

DB là nguồn thời gian expiry, kiểm expiresAt/lastSeenAt/revokedAt/authVersion mỗi authenticated request. Không cache phiên vô hạn trong process. HTTP guard đọc/chặn sớm; mọi mutation dữ liệu authorize trong transaction có User fence theo data-model. Logout revoke cũng lock User FOR UPDATE, không chỉ update Session ngoài fence; reset và write không race qua kiểm guard cũ. GET có thể trả snapshot trước logout nhưng sau revoke request mới phải401.

Production cookie `__Host-mkw_session`, HttpOnly, Secure, SameSite=Lax, Path=/, không Domain, Max-Age tối đa43200s. Local HTTP loopback riêng dùng `mkw_session`, HttpOnly, SameSite=Lax, Path=/; không bật Secure=false theo dữ liệu request/forwarded headers. Config production thiếu TLS/cookie/origin chính xác thì fail start, không tự fallback local. Express trust proxy chỉ theo hop/IP proxy được cấu hình khi target đã duyệt; không tin mọi X-Forwarded-For.

Sau401, Query dừng polling/read retry, không tiếp tục gửi write. UI giữ draft tạm trong memory cho cùng user xác thực lại; đăng nhập user khác phải cảnh báo và bỏ dữ liệu phiên trước, xóa Query cache. Logout chủ động khi dirty có guard giữ/hủy rõ, xóa draft/cache sau quyết định logout. Không hứa phục hồi draft khi reload/đóng tab hoặc session browser crash.

### Interface backend cho transaction

`MutationCredential = { userId: string; sessionId: string; tokenHash: Uint8Array }` chỉ do guard tạo từ cookie sau lookup server, không nhận từ body/DTO. `AuthenticatedSession = { identity: SessionIdentity; credential: MutationCredential }`; `requireSession(request): Promise<AuthenticatedSession>` kiểm guard HTTP. `SessionAuthorizer.authorizeMutation(tx: ProductTransaction, credential: MutationCredential): Promise<SessionIdentity>` khóa User và đọc lại Session cùng tokenHash/authVersion/expiry trong transaction, không tin identity cũ đơn lẻ. Hash token/credential không serialize ra response hoặc log. ProductTransaction là Prisma.TransactionClient nội bộ infrastructure DB, không type client web.

## 3. Origin, CSRF và HTTP

Topology production đề xuất web và `/api/v1` cùng origin qua reverse proxy; hosting/domain chưa chọn. Local Vite gọi API qua proxy cùng origin browser để giảm khác biệt cookie. Origins/cổng chỉ ghi vào resource registry khi acquire task2, không chiếm cổng mặc định chưa kiểm.

Đề xuất CSRF bằng kiểm Origin nghiêm ngặt kết hợp cookie SameSite và chỉ nhận JSON: mọi unsafe method login/logout/changes/employee phải có Origin khớp chính xác configured web origin (scheme/host/port); Origin thiếu/null/khác trả403 `ORIGIN_NOT_ALLOWED`. Không chấp nhận text/plain/form để ghi; Content-Type khác application/json trả415. Không có state-changing GET. Đây là cơ chế cụ thể cần test, không nói SameSite một mình đủ. Non-browser/native client chưa triển khai sẽ cần auth transport/version review riêng; không nới Origin hiện tại để giả hỗ trợ Android native.

CORS production same-origin không cần mở wildcard; nếu môi trường thử thực sự cross-origin thì allowlist đúng một web origin, credentials=true, Vary:Origin, preflight không tạo session/mutation. Không dựa chỉ vào CORS chặn request server, Origin check vẫn bắt buộc. Không dùng domain substring/regex mơ hồ. Test origin giả, null, mất header, content-type simple và cross-site trước claim CSRF đạt.

Helmet và response headers: no-store dữ liệu/auth, nosniff, frame-ancestors none, object-src none, base-uri self, script-src self không unsafe-eval; style-src cho phép inline style cần cho Radix nhưng không script inline. CSP phải kiểm UI thật, không tắt để cho test qua. HSTS chỉ production HTTPS. Cấu hình log loại cookie/authorization/password/body nhân sự; errors dùng requestId, không SQL/stack trong response.

## 4. Rate limit login có owner

Đề xuất mỗi IP tối đa20 lần/phút và mỗi normalized username tối đa5 lần/15 phút; account lookup vẫn case-sensitive, normalized throttle key dùng đúng chuỗi username, không đổi danh tính. Trả429 `LOGIN_RATE_LIMITED` + Retry-After giây còn lại, không khóa vĩnh viễn hoặc tự email/SMS. Cố ý nhập sai không được biến thành quyền reset.

Storage counter dùng PostgreSQL bảng AuthThrottle: bucketKey (HMAC-SHA256 secret riêng của IP/username), windowStart timestamp, attempts integer, PK(bucketKey,windowStart), expiresAt index. Upsert atomic và chặn theo cả hai bucket trước hash; không chỉ memory process, không thêm Redis. Không log raw IP/username vào evidence; secret key từ env riêng. Nhận IP theo trust-proxy đã chốt, không tin header do client tự gắn. Dọn counter cũ theo request bounded100 bản ghi khi login, không thêm persistent scheduler. @nestjs/throttler adapter custom dùng store PostgreSQL, test hai instance cùng storage không lách quota. Chưa enforce hoặc load test.

## 5. Provision/reset qua người phụ trách

Đề xuất lệnh task3 `pnpm --filter @mkw/api auth:provision` (khởi tạo đúng hai tài khoản khi DB mới) và `pnpm --filter @mkw/api auth:reset-password -- --username <tài-khoản>`; đây là script chưa tạo, không được chạy trên target thật từ G1. Password nhập qua prompt ẩn hoặc secret input của môi trường, không CLI argument/env được echo/log, không output password/hash/token. Provision từ chối nếu đã có User, reset yêu cầu account tồn tại, không tự tạo User.

Quy trình vận hành cần người được giao xác minh danh tính ngoài app, xác định target DB/username, nhận secret qua kênh phù hợp, chạy reset rồi bàn giao riêng. CLI hiển thị target alias/DB identity an toàn và account đích, kiểm allowlist/scope thử trước mutation; không tự dùng DATABASE_URL trỏ đâu cũng reset. Hash mới tính trước khóa, transaction lock User FOR UPDATE, thay hash/tăng authVersion/revoke sessions, commit mới báo xong. Lỗi giữ hash/authVersion cũ do rollback, không in credential. Audit vận hành tối thiểu chỉ sự kiện reset/time/actor vận hành an toàn, không tự thêm màn hình lịch sử bắt buộc.

Chưa có tên người phụ trách, cách xác minh/bàn giao thực tế, hosting/TLS/secret store hay tài khoản thật: giữ Not run cho vận hành. Bộ thiết kế có thể review G1 trước khi chốt nhân sự vận hành; release G4 phụ thuộc quyết định đó.

## 6. Acceptance bảo mật cần chạy

Task3 kiểm hai account fixture cùng quyền, anonymous month/write/export401, credentials sai401 generic, payload sai400, Origin403,415 content type, quota429 với storage chung, cookie đúng policy, logout/reset revoke; không endpoint signup/admin/reset trái phép. Test password Unicode/space/max-byte/hash params và không log secret; session absolute/idle bằng clock kiểm soát và DB timestamps. Task5 thêm reset-vs-write barrier, task7 kiểm hết phiên/draft/cache. Hash/library/cookie/headers thực, security integration và trusted browser đều **Not run**; docs/link checks không chứng minh auth đã an toàn.
