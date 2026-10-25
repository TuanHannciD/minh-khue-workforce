# Mục lục tài liệu

## Nguồn hiện hành

- [AGENTS](../AGENTS.md): cửa vào cho Agent.
- [Authority map](agent/AUTHORITY_MAP.md): mỗi loại quyết định thuộc nguồn nào.
- [Document routing](agent/DOC_ROUTING.md): đọc gì cho từng loại task.
- [Execution rules](agent/EXECUTION_RULES.md): cách một task được thực hiện và tiếp tục.
- [Permissions](agent/PERMISSIONS.md): quyền và điểm cần quyết định.
- [Skill policy](agent/SKILL_POLICY.md) và [skill usage](../SKILL_USAGE_MATRIX.md): bộ skill, cách quản lý và chọn dùng.
- [Tool capabilities](agent/TOOL_CAPABILITIES.md): MCP/plugin/công cụ và điều kiện xác nhận hoạt động.
- [Quality gates](agent/QUALITY_GATES.md): kiểm tra/review/Done.
- [Browser testing](agent/BROWSER_TESTING.md): thao tác UI thật, Playwright và debug flow.
- [Readiness](agent/READINESS.md): phần đã viết/cài/kiểm chứng và bước triển khai tiếp.
- [Chạy local](agent/LOCAL_RUN.md): lệnh check, pilot và browser regression.

## Mẫu công việc

- [Task brief](templates/TASK_BRIEF.md)
- [Handoff/resume](templates/HANDOFF.md)
- [Task MKW-AGENT-001](tasks/MKW-AGENT-001/INDEX.md)
- [Task MKW-AGENT-002](tasks/MKW-AGENT-002/INDEX.md)
- [Task MKW-PRODUCT-001](tasks/MKW-PRODUCT-001/INDEX.md): yêu cầu đã thống nhất và đặc tả chấm công để review.
- [Rà soát cấu trúc code và nền UI tái sử dụng](tasks/MKW-PRODUCT-001/technical/maintainability-review.md): hiện trạng, khoảng trống và đề xuất kiến trúc; chưa phải rule/stack đã duyệt.

## Báo cáo tham khảo

- [Khảo sát nền tảng Agent SellerFlow ngày 22/10](reports/2026-10-22-ai-agent-foundation-audit.md)
- [Khảo sát ban đầu có đề xuất sản phẩm/kiến trúc](reports/2026-10-22-sellerflow-audit-va-workflow-de-xuat.md)

Báo cáo giữ nguyên trạng thái của thời điểm khảo sát. Đề xuất công nghệ/sản phẩm trong báo cáo chưa trở thành đặc tả hiện hành. Yêu cầu chấm công đã thống nhất được ghi ở MKW-PRODUCT-001; bản thiết kế viết đang chờ review. Chưa có kiến trúc kỹ thuật, schema hay API contract đã duyệt; nguồn sở hữu được định tuyến tại authority map.
