# Checkpoint khôi phục — MKW-AGENT-002

Hồ sơ checkpoint lịch sử đã được Agent mới thực thi thành công; không phải trạng thái tài nguyên hiện tại. Server parent nêu dưới đã dừng, tab đã đóng. Tiếp tục task theo INDEX/validation và completion-receipt thay vì chạy lại checkpoint này.

Ngày 23/10/2026. Writer chính đang bootstrap trong `.worktrees/agent-bootstrap`, nhánh `agent/mkw-agent-002`; không tạo thêm worktree. Base `ff91255e2a92f21027ba27bd7875b3d69c9c796c`, baseline `12bb0421fd1f8a0a44e87c52866ae3110f992bd2`. Primary chỉ đọc đến tích hợp local cuối.

## Mục tiêu và quyền

Đọc AGENTS → authority map → task INDEX/approved/technical/validation. Người dùng đã duyệt cài local, dependency, pilot dữ liệu giả, child/reviewer và tích hợp local. Không push/remote/deploy/scheduler/global config. Không chốt sản phẩm chấm công.

## Đã làm và evidence

- 15 Superpowers ghim + 2 snapshot UI ở `.agents/skills`; kiểm tra bằng `npm run check:skills`.
- Pilot ghi chú ở `pilot/`: UI → API thật → SQLite file; test RED 0/5 → GREEN 5/5 ở primary `.agent-runs/MKW-AGENT-002/pilot-red.log` và `pilot-green.log`.
- Tooling `npm run check`: hash/docs/lint/integration. Browser regression: `npm run test:e2e`; cần Chromium local (`$env:PLAYWRIGHT_BROWSERS_PATH='0'; npx playwright install chromium`).
- Server tương tác do parent giữ: PID 31640, loopback 64433, owner record ở primary `.agent-runs/MKW-AGENT-002/interactive-1zBaM2/owner.json`. Không dừng hoặc ghi DB của parent.
- T3 thật đã lưu 1 ghi chú, thử HTTP 503 không ghi thêm, retry thành 2 và reload/API xác nhận đúng 2. Evidence JSON `t3-failure.json`; screenshot bản đầu ở T3 artifact và sẽ copy vào task evidence.

## Bước tiếp cho Agent ngữ cảnh mới

Checkpoint có phạm vi read-only source: xác định lại quyền/base/skill phù hợp từ file, đọc skill verification-before-completion tại đường dẫn local nếu chưa có discovery. Chạy `npm run check` (được tạo evidence/run của chính test), báo exit/count và next action còn lại. Không tự viết source, commit, cài thêm hay tích hợp. Nếu được hỏi Android/production/crash recovery toàn phiên: chưa kiểm chứng; không suy từ sandbox thành pass.

Parent tiếp tục: chờ Chromium, chạy Playwright desktop/mobile; cập nhật readiness/policy stale; candidate commit, review độc lập exact base..tip, sửa/re-review nếu cần, local fast-forward khi sạch. Giữ evidence và worktree. Đây là pilot khôi phục checkpoint qua Agent mới, không phải phục hồi toàn bộ phiên parent sau crash.
