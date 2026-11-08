---
name: mkw-server-debugger
description: Use when checking or diagnosing the Minh Khuê Workforce server, Docker runtime, MKW deployment, GitHub Actions release, or Cloudflare origin without changing production state
---

# Minh Khuê Workforce server debugger

Skill này dùng cho kiểm tra bounded đối với VPS chạy Minh Khuê Workforce. Giữ nguyên nguyên tắc của FormAuto server debugger: xác minh bằng chứng hiện tại, tách fact khỏi giả thuyết, ưu tiên thao tác chỉ đọc và dừng khi thiếu quyền hoặc điều kiện an toàn.

## Định danh môi trường

- Host đã được người dùng xác nhận: `113.184.16.191`
- User: `deploy`
- SSH port: `1122`
- Docker data-root sau PA1: `/home/docker`
- MKW deploy path: `/home/mkw`
- Compose project: `mkw`
- Gateway: `127.0.0.1:3200`
- Compose source trong repository: `deploy/compose.production.yml`
- Workflow: `.github/workflows/deploy.yml`, các mode `dry-run`, `bootstrap`, `release`

Không đọc, in hoặc lưu nội dung private key. Key path/credential phải lấy từ cấu hình runtime đã được cấp; không chép secret vào skill, report, command argument hoặc repository. Nếu không có credential hợp lệ, báo `Blocked` và không đoán mật khẩu/passphrase.

## Quy tắc an toàn bắt buộc

1. Mỗi lệnh remote phải được xác nhận là chỉ đọc trước khi chạy. Không biến kiểm tra thành deploy.
2. Không dùng `sudo` trong skill này. Nếu kiểm tra cần root, ghi rõ giới hạn và yêu cầu operator chạy lệnh riêng.
3. Không chạy `docker compose up/down/start/stop/restart/pull/build`, `docker system prune`, `systemctl start/stop/restart/reload`, migration, backup/restore, package install, `rm`, `mv`, `cp`, redirect, `tee`, `kill` hoặc lệnh thay đổi production.
4. Không đọc `/home/mkw/shared/db.env`, `/home/mkw/shared/api.env`, env dump, token, password, connection string hay container environment. Chỉ xem presence, owner, mode và size.
5. Không gọi API mutation: login, logout, reset, save, payment, webhook, submission hoặc route ghi dữ liệu. Smoke test chỉ dùng GET/HEAD đã phê duyệt.
6. Bảo toàn container, volume, backup, evidence và rollback root. Không prune, cleanup hoặc xóa tài nguyên.
7. Mỗi SSH invocation phải có timeout, batch mode và host-key verification; dừng sau hai lần kết nối thất bại và phân loại lỗi chính xác.

Mẫu PowerShell bounded read-only:

```powershell
$mkwHost = '113.184.16.191'
$mkwUser = 'deploy'
$mkwPort = '1122'
$mkwKey = '<runtime-provided-key-path>'
$cmd = 'id; docker info --format ''root={{.DockerRootDir}} driver={{.Driver}}''; ss -ltn'
ssh -i $mkwKey -p $mkwPort `
  -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes `
  "$mkwUser@$mkwHost" $cmd
```

Không ghi `<runtime-provided-key-path>` thành giá trị thật trong tài liệu hoặc report.

## Bộ kiểm tra chỉ đọc

Chạy từng invocation bounded, chỉ khi cần:

```bash
id
systemctl is-active docker
docker info --format 'root={{.DockerRootDir}} driver={{.Driver}}'
docker ps -a --filter label=com.docker.compose.project=mkw \
  --format '{{.Names}}|{{.Status}}|{{.Ports}}'
ss -ltn
df -h / /home
```

Kiểm tra metadata mà không đọc secret:

```bash
for f in /home/mkw/shared/db.env /home/mkw/shared/api.env; do
  test -f "$f" && stat -c '%A %U:%G %s bytes %n' "$f" || echo "MISSING $f"
done
test -f /home/mkw/shared/backup.ready \
  && stat -c '%A %U:%G %s bytes %y %n' /home/mkw/shared/backup.ready \
  || echo BACKUP_GATE_MISSING
```

HTTP smoke chỉ đọc:

```bash
curl --fail --silent --show-error --max-time 10 \
  -o /dev/null -w 'gateway HTTP %{http_code}\n' \
  http://127.0.0.1:3200/
curl --fail --silent --show-error --max-time 10 \
  -o /dev/null -w 'api-health HTTP %{http_code}\n' \
  http://127.0.0.1:3200/api/health
```

`404` ở API root không chứng minh service hỏng; gọi route health đã được phê duyệt. `connection refused`, timeout, unhealthy container hoặc gateway không trả response là lỗi cần phân loại.

## Đánh giá deploy MKW

- `dry-run`: chỉ preflight/read-only; không tạo path, env, volume, network hay container.
- `bootstrap`: chỉ chạy qua GitHub Actions sau approval; server tự sinh secret còn thiếu bằng CSPRNG, không overwrite file hiện hữu, không in secret.
- `release`: chỉ chạy khi có image digest đầy đủ, manifest, env runtime, backup gate `/home/mkw/shared/backup.ready`, compose hợp lệ và quyền SSH đã pin. Release phải có health, smoke và receipt.
- Cloudflare/domain không thuộc health check local; origin dự kiến là `http://127.0.0.1:3200` sau khi stack đạt readiness.

Không gọi `observed` là `verified`. Nếu thiếu image digest, manifest, backup evidence, host fingerprint, secret recovery hoặc Bash/Compose validation, ghi `Blocked`/`Not run` và nêu next action cụ thể.

## Báo cáo

Báo cáo ngắn gồm: thời điểm, host/project, lệnh kiểm tra và kết quả đã lọc secret, giới hạn quyền, lỗi/triệu chứng, và bước tiếp theo. Không đưa private key, password, token, connection string hoặc dữ liệu nhân sự vào output.
