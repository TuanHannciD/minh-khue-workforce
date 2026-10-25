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

## Nền tảng sản phẩm

- [ADR-001](architecture/decisions/ADR-001-product-foundation.md): quyết định nền tảng đã chốt và giới hạn.
- [ADR-002](architecture/decisions/ADR-002-state-management.md): TanStack Query + state React đã duyệt, Zustand có điều kiện; chưa cài.
- [ADR-003](architecture/decisions/ADR-003-product-stack.md): stack mục tiêu phương án A đã duyệt; chưa pin/cài/kiểm tương thích.
- [Kiến trúc](architecture/ARCHITECTURE.md): ứng dụng, module và ranh giới phụ thuộc.
- [Chuẩn code](architecture/CODE_CONVENTIONS.md): trách nhiệm, reuse và import.
- [Chia file và điều hướng source](architecture/SOURCE_NAVIGATION.md): trách nhiệm, ngưỡng review, module/file map và cách Agent đọc có mục tiêu; checker chưa cài.
- [Hệ UI](architecture/UI_SYSTEM.md): shadcn/Radix, component và thiết kế dùng chung.
- [Nguyên tắc API](architecture/API_CONTRACTS.md): ranh giới FE/BE/Android; chưa có contract chi tiết.

## Mẫu công việc

- [Task brief](templates/TASK_BRIEF.md)
- [Handoff/resume](templates/HANDOFF.md)
- [Task MKW-AGENT-001](tasks/MKW-AGENT-001/INDEX.md)
- [Task MKW-AGENT-002](tasks/MKW-AGENT-002/INDEX.md)
- [Task MKW-PRODUCT-001](tasks/MKW-PRODUCT-001/INDEX.md): yêu cầu đã thống nhất và đặc tả chấm công để review.
- [Rà soát cấu trúc code và nền UI tái sử dụng](tasks/MKW-PRODUCT-001/technical/maintainability-review.md): khảo sát trước quyết định nền tảng; các đề xuất chi tiết chưa chốt vẫn là đề xuất.

- [Bản kiến trúc kỹ thuật cụ thể để review](tasks/MKW-PRODUCT-001/technical/architecture-proposal.md): stack ứng viên, cây source, state/lưu lỗi/xung đột và cách kiểm; chưa là implementation plan.
- [Khảo sát repo về chia file và context](tasks/MKW-PRODUCT-001/technical/source-navigation-research.md): nguồn theo commit, cách áp dụng và giới hạn bằng chứng.

## Báo cáo tham khảo

- [Khảo sát nền tảng Agent SellerFlow ngày 22/10](reports/2026-10-22-ai-agent-foundation-audit.md)
- [Khảo sát ban đầu có đề xuất sản phẩm/kiến trúc](reports/2026-10-22-sellerflow-audit-va-workflow-de-xuat.md)

Báo cáo giữ nguyên trạng thái của thời điểm khảo sát. Đề xuất công nghệ/sản phẩm trong báo cáo chưa trở thành đặc tả hiện hành. Yêu cầu chấm công đã thống nhất được ghi ở MKW-PRODUCT-001; bản thiết kế viết đang chờ review. Nền tảng đã chốt tại ADR-001; stack mục tiêu đã chốt tại ADR-003, phiên bản/auth/schema và contract API cụ thể chưa duyệt; nguồn sở hữu được định tuyến tại authority map.
