# Minh Khuê Workforce

Project đang chuẩn bị nền tảng để AI Agent phát triển phần mềm theo quy trình có kiểm chứng. Sản phẩm ban đầu là chấm công; nền tảng UI và tổ chức code đã chốt, stack mục tiêu phương án A đã chốt; đặc tả đầy đủ đã được duyệt, kế hoạch triển khai đã duyệt, Task1 thiết kế đang thực hiện.

## Bắt đầu

- Agent: đọc [AGENTS.md](AGENTS.md), sau đó hồ sơ task đang làm và tài liệu được định tuyến.
- Người dùng: xem [mục lục tài liệu](docs/INDEX.md) và [trạng thái sẵn sàng](docs/agent/READINESS.md).
- Công việc hiện tại: [MKW-PRODUCT-001 — đặc tả đã duyệt, kế hoạch đã duyệt](docs/tasks/MKW-PRODUCT-001/INDEX.md).
- Nền tảng sản phẩm đã chốt: [ADR-001](docs/architecture/decisions/ADR-001-product-foundation.md), cùng bốn nguồn chuẩn được liên kết trong ADR.
- Nền tảng đã bootstrap: [MKW-AGENT-002 — cài đặt và pilot](docs/tasks/MKW-AGENT-002/INDEX.md).
- Chạy tooling và pilot: [hướng dẫn local](docs/agent/LOCAL_RUN.md).

## Phạm vi đã thống nhất

Superpowers là phương pháp chính; chuyên môn Minh Khuê bổ sung ràng buộc project. Impeccable và UI UX Pro Max hỗ trợ UI/UX. T3 Browser phục vụ thao tác trực tiếp; Playwright Test lưu các luồng kiểm thử có thể chạy lại.

Một bộ tài liệu tiếng Việt là nguồn chuẩn của project. Skill upstream sau khi cài giữ nguyên nguồn/ngôn ngữ/license; không tạo bản dịch thứ hai của quy tắc project.

## Trạng thái

Bộ tài liệu và skill project-local đã có Git baseline; pilot ghi chú dùng UI/API/SQLite thật để kiểm tra workflow. Đây là ứng dụng thử dữ liệu giả. Trạng thái từng năng lực, review/resume và bằng chứng tại READINESS. Toàn bộ đặc tả chấm công đã được người dùng duyệt28/10/2026; [kế hoạch triển khai](docs/tasks/MKW-PRODUCT-001/technical/implementation-plan.md) đang review, chưa triển khai sản phẩm; đã chọn shadcn/ui nền Radix, module theo feature và FE/BE tách ứng dụng cùng repository. Chuẩn code/UI/API đã ghi tại docs/architecture; công cụ enforce sản phẩm chưa cài. Quản lý state đã chọn TanStack Query + state React, Zustand có điều kiện theo [ADR-002](docs/architecture/decisions/ADR-002-state-management.md), chưa cài. [Bản kiến trúc cụ thể](docs/tasks/MKW-PRODUCT-001/technical/architecture-proposal.md) ghi thiết kế và luồng; [ADR-003](docs/architecture/decisions/ADR-003-product-stack.md) chốt React/Vite + NestJS + PostgreSQL/Prisma cùng tooling mục tiêu. Chưa pin/cài/kiểm tương thích; auth/contract chi tiết và ứng dụng Android còn cần thiết kế.
