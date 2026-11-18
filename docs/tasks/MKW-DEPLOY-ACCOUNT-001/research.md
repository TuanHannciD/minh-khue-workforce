# Đối chiếu thiết kế account runner — 14/11/2026

## Kết luận và trạng thái

Bản đặc tả file tạm chưa phải hướng đơn giản nhất. Khuyến nghị thay bằng CLI thuộc API, compile cùng ứng dụng và đóng sẵn trong API image. Đây là đề xuất amendment để người dùng review, chưa đổi thiết kế đã duyệt hoặc implementation. Không thực hiện production/network mutation; chỉ tải tài liệu/source công khai qua HTTPS.

## Bằng chứng local

- `deploy/Dockerfile.api` copy `/out` vào `/app`, dùng `USER node`; không bảo đảm user này được ghi vào `/app`. File tạm ở `/tmp` lại không tự resolve bare imports từ `/app/node_modules`.
- `apps/api/package.json` dùng `type: module`; TypeScript NodeNext build source vào `dist`. CLI trong `apps/api/src/ops/` có thể build/deploy cùng runtime hiện có mà không cần eval hoặc upload source.
- `auth-operations.ts` đã sở hữu provision/reset và transaction; `password.ts` đã sở hữu validation/Argon2. Production account program hiện tại lặp lại SQL/hash, còn `auth-cli.mjs` sandbox đã dùng domain operations. Sandbox CLI có target allowlist riêng: không được bỏ guard hoặc biến sandbox CLI thành production bằng cách đổi target.
- `provisionAccounts` tạo đúng hai tài khoản khi bảng rỗng; nó không thay được operation `add` một tài khoản. Nếu giữ `add`, cần domain operation riêng, không đổi nghĩa provision.
- Post-deploy verifier hiện có image ID/digest, health, migration status và smoke. Không viết lại các gate này chỉ vì account runner lỗi; tập trung phần thiếu và test consumer thực tế.

## Nguồn đã đọc

Các permalink dưới đây được kiểm tra bằng tải source tại SHA ghi trong URL, ngày 14/11/2026:

1. [Twelve-Factor: admin processes](https://12factor.net/admin-processes): admin code phải ship cùng application code và chạy với cùng code/config của release để tránh lệch phiên bản.
2. [Docker exec](https://docs.docker.com/reference/cli/docker/container/exec/): chạy process mới trong container đang chạy, hỗ trợ stdin và workdir; process không tự chạy lại khi container restart.
3. [Compose exec](https://github.com/docker/compose/blob/7eb5a292432197b5f9983bc7e5f29d8051da0310/docs/reference/compose_exec.md): chạy command theo service; cần `-T` cho stdin pipe không TTY. [Compose run](https://github.com/docker/compose/blob/7eb5a292432197b5f9983bc7e5f29d8051da0310/docs/reference/compose_run.md) là lựa chọn one-off container với `--rm --no-deps`; cần pin image/config đúng release.
4. [Django createsuperuser](https://github.com/django/django/blob/f24f38c6b2825f15628c07bf2892f1664eed9361/django/contrib/auth/management/commands/createsuperuser.py): command dùng user model, password validation và migration checks của ứng dụng; prompt password qua getpass. Không sao chép cách dùng password environment của non-interactive mode vì scope MKW yêu cầu stdin.
5. [Strapi reset password](https://github.com/strapi/strapi/blob/6ed1be0fd1a0d37f25a0e0a74ecac2bebb9f14f3/packages/core/strapi/src/cli/commands/admin/reset-user-password.ts): CLI gọi application user service. Chỉ tham khảo ownership/reuse, không sao chép option password trên argv.
6. [Directus bootstrap](https://github.com/directus/directus/blob/ed30e578b2c29b5b64159ef54e0a4739628144fd/api/src/cli/commands/bootstrap/index.ts): command dùng database/migration/application helpers trong package. Không lấy bootstrap tự chạy migration làm hành vi account của MKW.
7. [Node ESM](https://nodejs.org/docs/latest-v24.x/api/esm.html): `.mjs` hoặc package `type: module` xác định ESM; bare imports phụ thuộc vị trí module. Chạy file đã build trong API tránh cơ chế resolution riêng cho file tạm.

Nguồn trên chứng minh pattern tổ chức code và command, không chứng minh triển khai MKW đã chạy. Không chạy các repo ngoài hoặc benchmark so sánh.

## Amendment được khuyến nghị

1. Tạo entrypoint API-owned, ví dụ `apps/api/src/ops/account-cli.ts` → `dist/ops/account-cli.js`. Chạy trực tiếp bằng Node trong API image đang deploy; không eval/base64/import data URL/upload source/file tạm.
2. Shell mỏng xác minh release manifest, lấy đúng container ID theo Compose project/service, giữ deploy lock trong toàn bộ operation và kiểm image ID/digest/health. Sau đó exec bằng container ID đã pin để tránh chọn lại tên container khác giữa chừng.
3. CLI nhận JSON có giới hạn kích thước qua stdin, hoặc prompt TTY ẩn ở chế độ interactive. Password không đi qua argv/env/log. CLI gọi domain operations/password helper; chỉ báo thành công sau COMMIT. Lỗi DB được lọc secret trước khi in.
4. Dùng manifest/image/migration history làm nguồn identity; không hard-code duy nhất `/home/deploy/mkw`, không yêu cầu thư mục host phải writable trong container và không thêm một bộ schema checker cạnh tranh ORM/migration hiện có.
5. Test hồi quy phải thực thi real CLI; Docker/PostgreSQL rehearsal bắt buộc dùng image thật. Mock chỉ phục vụ negative boundary tests, không thay gate end-to-end. Nếu thiếu engine, ghi Blocked.
6. Giữ sandbox enrollment/allowlist hiện hành, backup gate, forward migration, remote flock và manual recovery. Không thêm role, API admin, tự tạo account khi deploy, DB restore hoặc migration trong account command.

Trade-off: CLI mới cần build/deploy image mới một lần. `exec` yêu cầu API container running; recovery khi API không chạy dùng route riêng sau này hoặc command one-off được kiểm chứng, không âm thầm fallback. Chưa có bằng chứng runtime cho amendment này.
