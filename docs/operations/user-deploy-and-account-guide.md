# Hướng dẫn deploy và quản lý tài khoản

Tài liệu này dành cho người vận hành Minh Khuê Workforce. Có hai việc khác nhau: deploy ứng dụng qua GitHub Actions và quản lý tài khoản bằng script trên VPS.

## Deploy lần đầu

1. Tạo hoặc kiểm tra GitHub Environment `production`. Cấu hình SSH host/port/fingerprint, `MKW_DEPLOY_PATH=/home/deploy/mkw`, project `mkw`, gateway port, registry settings, SSH private key và backup encryption key theo [release checklist](release-checklist.md).
2. VPS phải có user `deploy`, Docker Compose và quyền chạy Docker. Chạy workflow [`deploy.yml`](../../.github/workflows/deploy.yml) thủ công với mode `bootstrap` qua environment được bảo vệ.
3. Bootstrap chỉ chuẩn bị cấu hình. Sau release đầu đã thành công, kiểm tra container đã pin theo Compose:

```bash
docker compose -p mkw -f /home/deploy/mkw/current/compose.rendered.yml ps
```

Kết quả API hợp lệ là `mkw|api|healthy`. `/home/deploy/mkw/current` là thư mục runtime chứa Compose rendered file; script vận hành nằm trong thư mục release có SHA.

4. Chạy release đầu tiên qua route được bảo vệ/manual. Gate sẽ kiểm manifest, image digest, backup và health/smoke. Không dùng `docker compose down -v`, migrate reset hoặc xoá volume PostgreSQL.

## Deploy các lần sau

```text
kiểm tra local → commit/merge local → git push origin main → chờ main-release → kiểm tra verify receipt
```

Workflow tự chạy quality, release validation, build image API/Web bất biến, backup PostgreSQL đã mã hoá và kiểm chứng restore, deploy rồi verify. Pull request chạy CI nhanh; kiểm thử deploy/account và rehearsal chỉ là gate của release hoặc workflow validation thủ công, không chạy trên VPS production. Luồng push-main thông thường không cần nhập SHA, run ID hoặc artifact ID. Trước khi push, chạy [LOCAL_RUN](../agent/LOCAL_RUN.md) và để pre-commit hook hoàn tất. Khi fail, đọc stage/receipt trước khi retry; không retry mù khi remote lock còn giữ. Rollback và restore là thao tác manual riêng.

## Quản lý tài khoản trên VPS

Script được đóng vào từng release thành công. Chạy từ release SHA, không chạy từ `current`:

```bash
release=/home/deploy/mkw/releases/<RELEASE_SHA>
bash "$release/scripts/product/manage-production-account.sh" list
bash "$release/scripts/product/manage-production-account.sh" add
bash "$release/scripts/product/manage-production-account.sh" reset-password
```

`add` và `reset-password` đều hỏi username, password ẩn và nhập lại password. Username dài 1–64 Unicode characters, không chứa whitespace; không trim/normalize. Password tối thiểu 8 Unicode characters và tối đa 1024 UTF-8 bytes, giữ nguyên khoảng trắng, dấu và ký tự đặc biệt. Không đưa password vào lệnh, biến môi trường, log hoặc file evidence. `list` chỉ in username theo thứ tự.

API image phải chứa compiled ESM CLI `dist/ops/account-cli.js` và native dependencies. Shell gửi JSON UTF-8 qua stdin đến đúng một API container ID đã pin tại `/app`, chạy bằng user `node`; không cần host Node/pnpm/jq. Release cũ thiếu CLI bị từ chối; không có fallback upload source/eval hoặc tạo container account khác khi API dừng.

Shell suy target từ real path của script và giữ `.deploy.lock` suốt preflight, prompt và CLI. Default project là `mkw`; nếu đặt `MKW_DEPLOY_PATH`/`MKW_PROJECT_NAME`, chúng phải khớp target. Shell kiểm inventory, manifest, Compose, API digest/image ID/health, `shared/deploy-operation.json` và successful receipt đúng operation/SHA/control SHA trước khi hỏi password. Container name hoặc cwd không là identity. Deploy/account đồng thời trả `75`; chờ và kiểm target trước khi chạy lại.

`add` từ chối duplicate bằng `ACCOUNT_EXISTS`; `reset-password` yêu cầu user đã tồn tại (`ACCOUNT_NOT_FOUND` nếu thiếu), đổi hash, tăng `authVersion` và revoke tất cả sessions trong cùng transaction. Success chỉ sau COMMIT; lỗi không in thông báo success. Hai phiên cũ sẽ nhận `401`; đăng nhập lại bằng password mới.

| Exit | Cách xử lý |
| --- | --- |
| `0` | Thao tác đã hoàn tất |
| `64` | Kiểm usage, input và password policy; không thử nới policy |
| `69` | Thiếu runtime/dependency/compiled CLI; dùng release có capability đã kiểm |
| `75` | Deploy/account đang giữ lock; không xóa lockfile để bypass |
| `78` | Sai target/identity/config/schema/receipt; kiểm release và operation trước retry |
| `1` | DB/internal error đã lọc; giữ mã lỗi/correlation, kiểm DB bằng runbook |

Nếu API restart sau khi pin ID, shell trả lỗi exec và không tự chọn container khác để retry mutation. Kiểm kết quả trước khi chạy lại.

Schema hiện tại chưa có role/permission. Vì vậy username `admin` chưa tự động có quyền cao nhất; muốn có role quản trị cần task riêng về schema và authorization.

Nếu preflight từ chối, đối chiếu Compose, API ID/digest/health và exact operation receipt; không sửa guard hoặc dùng container-name override trên VPS. Thư mục release legacy thiếu inventory hoặc có file thừa cần kế hoạch chuyển tiếp riêng trước live rollout; không tự adopt, ghi đè hoặc xóa thư mục cũ.
