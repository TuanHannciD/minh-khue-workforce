# Validation — MKW-AGENT-002

Đang triển khai; không coi plan là kết quả.

## Discovery

Node 22.12.0; Git có sẵn user identity. T3 catalog 23/10 có provider cho phép child task/model phù hợp; chưa dispatch tại thời điểm ghi đầu.

Browser: preview_status ban đầu available=false; phải thử preview_open và ghi kết quả trước fallback.

## Resource

Task MKW-AGENT-002. Worktree sau baseline: primary/.worktrees/agent-bootstrap. Run/evidence root dự kiến primary/.agent-runs/MKW-AGENT-002, giữ ngoài checkout disposable. Sandbox fake data, loopback + port tự cấp. Không dùng production/env/tài khoản thật.

## Ledger

Bootstrap đang thực hiện. Các lệnh/kết quả RED/GREEN, commit range, child ID và trạng thái resource sẽ cập nhật sau từng bước.
