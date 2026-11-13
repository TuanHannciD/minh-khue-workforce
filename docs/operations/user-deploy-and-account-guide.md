# Hướng dẫn deploy và quản lý tài khoản

Tài liệu này dành cho người vận hành Minh Khuê Workforce. Có hai việc khác nhau: deploy ứng dụng qua GitHub Actions và quản lý tài khoản bằng script trên VPS.

## Deploy lần đầu

1. Tạo hoặc kiểm tra GitHub Environment `production`. Cấu hình SSH host/port/fingerprint, `MKW_DEPLOY_PATH=/home/deploy/mkw`, project `mkw`, gateway port, registry settings, SSH private key và backup encryption key theo [release checklist](release-checklist.md).
2. VPS phải có user `deploy`, Docker Compose và quyền chạy Docker. Chạy workflow [`deploy.yml`](../../.github/workflows/deploy.yml) thủ công với mode `bootstrap` qua environment được bảo vệ.
3. Sau bootstrap, kiểm tra container:

```bash
docker ps --filter label=com.docker.compose.project=mkw
docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Health.Status}}' mkw-api-1
```

Kết quả API hợp lệ là `mkw|api|healthy`. `/home/deploy/mkw/current` là thư mục runtime chứa Compose rendered file; script vận hành nằm trong thư mục release có SHA.

4. Chạy release đầu tiên qua route được bảo vệ/manual. Gate sẽ kiểm manifest, image digest, backup và health/smoke. Không dùng `docker compose down -v`, migrate reset hoặc xoá volume PostgreSQL.

## Deploy các lần sau

```text
kiểm tra local → commit/merge local → git push origin main → chờ main-release → kiểm tra verify receipt
```

Workflow tự chạy quality, build image API/Web bất biến, backup PostgreSQL đã mã hoá và kiểm chứng restore, deploy rồi verify. Luồng push-main thông thường không cần nhập SHA, run ID hoặc artifact ID. Trước khi push, chạy [LOCAL_RUN](../agent/LOCAL_RUN.md) và để pre-commit hook hoàn tất. Khi fail, đọc stage/receipt trước khi retry; không retry mù khi remote lock còn giữ. Rollback và restore là thao tác manual riêng.

## Quản lý tài khoản trên VPS

Script được đóng vào từng release thành công. Chạy từ release SHA, không chạy từ `current`:

```bash
release=/home/deploy/mkw/releases/<RELEASE_SHA>
bash "$release/scripts/product/manage-production-account.sh" list
bash "$release/scripts/product/manage-production-account.sh" add
bash "$release/scripts/product/manage-production-account.sh" reset-password
```

`add` hỏi username, password và nhập lại password. `reset-password` tăng `authVersion` và thu hồi session hiện có. `list` chỉ in username. Password không hiện trên màn hình và không truyền qua argv/env.

Schema hiện tại chưa có role/permission. Vì vậy username `admin` chưa tự động có quyền cao nhất; muốn có role quản trị cần task riêng về schema và authorization.

Nếu gặp `API container is not the healthy mkw production container`, kiểm tra `mkw-api-1` có label `mkw|api|healthy`; không bỏ qua guard bằng cách sửa script trực tiếp trên VPS.
