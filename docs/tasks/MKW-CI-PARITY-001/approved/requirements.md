# MKW-CI-PARITY-001 — Delta yêu cầu ngày21/11/2026

Nguồn: người dùng xác nhận “Bỏ toàn bộ deploy thử/Docker rehearsal, giữ kiểm tra
tooling và các bước release thật”. Delta này thay phần yêu cầu bắt buộc rehearsal
trong Actions của thiết kế/kế hoạch19/11; không viết lại các checkpoint đã chạy.

- Mọi Actions path không gọi actual Docker/PostgreSQL deploy rehearsal.
- Release-validation giữ failure-gating, chạy riêng profile release-tooling trong
  shared pinned worker với mode `--release-tooling`; rehearsal **Not run**.
- Giữ main DAG quality → release-validation → build+backup → deploy → verify →
  release-status và các điều kiện, release/backup/rollback policies hiện hành.
- Giữ local `--release`/`--all` full rehearsal và no-flag/hook semantics. Docker
  worker kiểm tooling vẫn cần, không dùng runtime/pnpm host thay pinned worker.
- Report/collector giữ schema hiện hành, selected profile/counts/failure-primary/
  cleanup đúng; tests chứng minh mode mới không gọi rehearsal và lỗi tooling
  tiếp tục làm gate fail. CLI help/list/mutual exclusion đúng coverage.
- Không triển khai diagnostic v2 chưa duyệt, không nới assertions/deadline/retry
  hoặc thay production scripts. Việc bỏ coverage không sửa causal failure cũ.

Implementation local đã được phép; lượt writer này không commit/push/remote
dispatch. Fresh independent reviewer do primary giao sau self-review và handoff.
B1 Blocked, H1 Open, historical Failed/Not run và overall chưa Done giữ nguyên.
Nguồn routing: [INDEX](../INDEX.md), [decisions](../decisions.md),
[validation](../validation.md).
