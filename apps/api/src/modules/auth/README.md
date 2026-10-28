# Auth — Task3

HTTP `auth.controller.ts` nhận DTO/Swagger, cookie và request IP do Express xác định (trust proxy mặc định tắt). `auth.service.ts` sở hữu login, `requireSession(request)` và logout; không export credential qua response. Controller chỉ serialize `SessionDto`.

`session.guard.ts` chặn sớm và gắn `AuthenticatedSession` nội bộ. Module nghiệp vụ sau này chỉ import public `index.ts`; mutation phải gọi `SessionAuthorizer.authorizeMutation(tx, credential)` trong cùng `Database.transaction` với ghi dữ liệu, trước Employee locks. Guard HTTP không thay fence này. Infrastructure DB chỉ sở hữu Prisma/transaction (READ COMMITTED, lock timeout3s, transaction10s).

`auth-throttle.ts` là PostgreSQL adapter cho interface ThrottlerStorage; login tiêu thụ đồng thời bucket IP20/phút và username5/15phút theo fixed window, khóa bucket theo hash order. HMAC secret riêng; không giữ raw IP/username trong counter. `password.ts` dùng native Argon2id đúng params G1. DB clock sở hữu expiry, cập nhật lastSeen tối đa mỗi phút, không trượt absolute12h.

`auth-operations.ts` chỉ dành CLI vận hành, không nằm trong public HTTP module exports. `scripts/product/auth-cli.mjs` kiểm allowlist/identity target trước đọc secret và gọi provision/reset. Bản CLI hiện chỉ cho sandbox Task3; chưa có enrollment target thật. Password qua TTY ẩn hoặc pipe stdin riêng, không argv/env/log. Provision khóa bảng rỗng và tạo đúng hai User; reset khóa User UPDATE, thay hash/tăng version/revoke cùng transaction. Không role/admin/signup/reset HTTP.

Kiểm chứng: `pnpm --filter @mkw/api test` chạy compiled HTTP/config/native hash; `test:integration` cần `MKW_TEST_CLUSTER_OWNER` và cluster riêng theo LOCAL_RUN. Test-only `protected-probes.mjs` chứng minh guard tháng/write/export qua seam; không tạo API nghiệp vụ sản phẩm. `auth.integration.test.mjs` giữ matrix tuần tự cùng DB mới và hai fixture để quản lý secret/ownership/cleanup; các barrier dựa pg_stat_activity, không sleep. Task4/5/9 còn phải kiểm route nghiệp vụ thật và transaction ghi của chúng.
