# MKW-CI-PARITY-001 — Quyết định hiện hành

## Accepted21/11/2026 — Actions chỉ kiểm release tooling

Người dùng yêu cầu bỏ toàn bộ deploy thử/Docker rehearsal và giữ tooling/release
thật. Bổ sung `--release-tooling` vào shared parity runner, chọn đúng profile cùng
tên và rehearsal **Not run**; release-validation gọi mode đó. Giữ pinned Docker
worker, main dependency gates và local full/no-flag modes. Không bỏ `--release`
của deploy.yml/rollback.yml vì đó là release thật.

Đây là delta coverage thay yêu cầu rehearsal Actions cũ; không root fix,
không hồi tố historical Failed thành PASS. Diagnostic v2 vẫn chưa duyệt và dormant.
Không sửa schema evidence hoặc deploy/backup/verify/rollback policies.

Giữ step ID/env evidence cũ để không đổi consumer contract nội bộ; đổi tên bước
và summary hiển thị thành tooling/check, ghi deploy rehearsal Not run. Lỗi tooling,
collector hoặc cleanup vẫn failure-gating, upload thành công không che lỗi gate.

Sole writer triển khai local; primary giao reviewer độc lập snapshot cuối với
A spec compliance/B code quality và tác động branch. Chi tiết
[yêu cầu](approved/requirements.md), [validation](validation.md), [INDEX](INDEX.md).
