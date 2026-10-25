# Minh Khuê — Hướng dẫn Agent

Hiệu lực: nền tảng Agent, theo phạm vi người dùng đã duyệt ngày 23/10/2026. Tiếng Việt là nguồn chuẩn cho tài liệu project. Chỉ dẫn hệ thống/developer/runtime và yêu cầu người dùng trong phiên được ưu tiên; tài liệu project không tự cấp quyền ngoài các giới hạn đó.

## Bắt đầu và tiếp tục

1. Đọc [bản đồ nguồn chuẩn](docs/agent/AUTHORITY_MAP.md), hồ sơ task hiện tại và [document routing](docs/agent/DOC_ROUTING.md).
2. Kiểm tra trạng thái workspace, phạm vi/quyền và next action. Tái sử dụng quyết định đã duyệt; không khởi động lại phân tích khi tiếp tục task.
3. Đọc bộ tài liệu nhỏ nhất liên quan. Báo cáo dưới `docs/reports/` là khảo sát có mốc thời gian, không thay quy tắc hiện hành.

## Phương pháp và nguồn sở hữu

- Superpowers là phương pháp chủ đạo sau khi cài và kiểm chứng. [Skill policy](docs/agent/SKILL_POLICY.md) sở hữu nguồn/pin/override; [skill routing](SKILL_USAGE_MATRIX.md) sở hữu việc chọn skill. Specialist bổ sung domain, không tạo workflow thứ hai.
- Chưa cài skill: báo đúng khả năng thiếu. Task tài liệu/bootstrap đã giao vẫn tiếp tục được theo quy tắc hiện có; task triển khai phụ thuộc skill phải ghi gate thiếu, không giả đã dùng skill hoặc tự cài ngoài phạm vi.
- [Execution rules](docs/agent/EXECUTION_RULES.md): vòng task, ownership, handoff và resume.
- [Permissions](docs/agent/PERMISSIONS.md): quyền thao tác; tiếp tục việc đã được giao, không hỏi lại từng bước.
- [Quality gates](docs/agent/QUALITY_GATES.md): kiểm tra, review độc lập và tiêu chí hoàn tất.
- [Browser testing](docs/agent/BROWSER_TESTING.md): thao tác UI thật, debug và bằng chứng xuyên suốt.

## Ràng buộc chung

- Khi đọc/sửa source: theo [SOURCE_NAVIGATION](docs/architecture/SOURCE_NAVIGATION.md). Tách theo trách nhiệm; đọc module/file map nếu có, định vị lại symbol trong source hiện tại rồi đọc đầy đủ đơn vị, dependency/consumer/test liên quan. TOC không thay việc hiểu implementation hoặc review tác động.

- Với thiết kế/code sản phẩm: đọc [kiến trúc](docs/architecture/ARCHITECTURE.md), [chuẩn code](docs/architecture/CODE_CONVENTIONS.md), [hệ UI](docs/architecture/UI_SYSTEM.md) và [nguyên tắc API](docs/architecture/API_CONTRACTS.md) theo phạm vi task. Nền tảng đã chốt tại [ADR-001](docs/architecture/decisions/ADR-001-product-foundation.md); chi tiết còn Pending không được tự coi là đã duyệt hoặc đã có công cụ enforce.

- Không tự đặt nghiệp vụ chấm công, field, trạng thái hoặc contract. Ghi rõ điều chưa biết; hỏi phần chặn tính đúng, tiếp tục phần độc lập đã được phép.
- Bảo toàn file dirty/untracked/ignored, bằng chứng và công việc khác. Không reset/clean/ghi đè hoặc xóa tài nguyên chưa rõ chủ sở hữu.
- Mỗi task ghi mục tiêu, scope, acceptance, risk, writer/review route, base hoặc giới hạn chưa có Git, tài nguyên và bước tiếp theo trước khi sửa.
- Với task code/tooling sau bootstrap: branch/worktree cách ly và base xác định; nhiều writer phải tách workspace/tài nguyên. Không tự dispatch Agent con nếu chỉ dẫn phiên chưa cho phép.
- Chọn tool/provider/model từ runtime hiện tại, không chép tên từ báo cáo hoặc skill. Tool thiếu không được biến thành gate đạt.
- Phân biệt tài liệu đã viết, phần đã cài và khả năng đã kiểm chứng. Chỉ ghi Verified khi có bằng chứng đúng scope; dùng Failed/Not run/Blocked khi tương ứng.
- Giữ UTF-8 và dấu tiếng Việt; đọc log có chọn lọc, không đưa secret/dữ liệu nhân sự vào tài liệu hoặc report.
- Bàn giao ngắn gọn: kết quả, kiểm chứng, giới hạn và next action. Push/merge/deploy, scheduler và truy cập hệ thống thật theo PERMISSIONS và quyền phiên.

## Bootstrap hiện tại

MKW-AGENT-001 hoàn tất tài liệu. [MKW-AGENT-002](docs/tasks/MKW-AGENT-002/INDEX.md) cài 15 Superpowers + 2 UI project-local và pilot ghi chú UI/API/SQLite độc lập với sản phẩm. Chạy `npm run check`, `npm run test:e2e` theo [hướng dẫn local](docs/agent/LOCAL_RUN.md). Skill chưa được runtime tự liệt kê thì đọc trực tiếp `.agents/skills/<tên>/SKILL.md`, không claim auto-discovery. Trạng thái từng gate và giới hạn ở [READINESS](docs/agent/READINESS.md).
