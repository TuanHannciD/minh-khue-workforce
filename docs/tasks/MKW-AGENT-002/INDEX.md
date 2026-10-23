# MKW-AGENT-002 — Bootstrap và pilot nền tảng Agent

Ngày: 23/10/2026. Trạng thái: triển khai đã kiểm chứng; review/tích hợp cuối theo receipt nêu trong validation.

- [Yêu cầu đã duyệt](approved/requirements.md)
- [Kế hoạch](technical/implementation-plan.md)
- [Validation](validation.md)

## Ownership và quyền

Người dùng giao “Tôi đồng ý với các đề xuất của bạn hãy triển khai” sau đề xuất cài skill, Git/tooling, task thử/review/resume và browser thật. Quyền gồm dependency local cần thiết, Git baseline/task commit và tích hợp local kết quả bootstrap, Agent/reviewer pilot, server/browser/data giả. Không push/remote/deploy/scheduler/global config/production.

Writer chính thực hiện inline; reviewer độc lập đọc snapshot cuối. Bootstrap Git ban đầu tại primary; sau baseline dùng worktree/branch riêng. Base SHA ghi sau commit đầu tiên. Không tạo app chấm công hoặc chốt stack sản phẩm. Pilot là ứng dụng mẫu độc lập.

Risk: medium/high với thực thi skill, dependency và tài nguyên; cần test ownership/negative paths và review độc lập. Preserve toàn bộ tài liệu/báo cáo hiện có.

## Acceptance

Skill local nguồn/license/hash; 15 Superpowers + hai UI. Tooling kiểm tra nguồn/docs và môi trường. Pilot có UI/API/dữ liệu lưu bền, test gửi trùng/lỗi/reload. Có test RED→GREEN, regression Playwright, browser discovery/thao tác hoặc fallback có bằng chứng. Review độc lập đúng final tip. Handoff được Agent ngữ cảnh mới khôi phục. Báo riêng khả năng chưa đạt.

## Next action

Xem [validation](validation.md) và `completion-receipt.json` tại evidence root để biết full tip đã review/tích hợp và status cuối. Checkpoint [HANDOFF](HANDOFF.md) là bằng chứng resume đã chạy, không phải yêu cầu lặp pilot. Sau receipt Done, bước sản phẩm tiếp theo là làm rõ nghiệp vụ chấm công/kiến trúc FE–BE/API cho Android; chưa được chốt bằng pilot này.
