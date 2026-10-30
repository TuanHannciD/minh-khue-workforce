# Minh Khuê Workforce

Sản phẩm chấm công Minh Khuê đã triển khai local theo đặc tả/G1/UI đã duyệt: React/Vite, Nest/Express và PostgreSQL/Prisma. Task1–9 independent Approved; Task11 có runbook và rehearsal backup/restore dữ liệu giả, đang chờ main review độc lập. **G3 chưa đạt**, sản phẩm chưa Done hoặc sẵn sàng production.

## Bắt đầu

- Agent: đọc [AGENTS.md](AGENTS.md), sau đó hồ sơ task đang làm và tài liệu được định tuyến.
- Người dùng: xem [mục lục tài liệu](docs/INDEX.md) và [trạng thái sẵn sàng](docs/agent/READINESS.md).
- Công việc hiện tại: [MKW-PRODUCT-001 — đặc tả đã duyệt, kế hoạch đã duyệt](docs/tasks/MKW-PRODUCT-001/INDEX.md).
- Nền tảng sản phẩm đã chốt: [ADR-001](docs/architecture/decisions/ADR-001-product-foundation.md), cùng bốn nguồn chuẩn được liên kết trong ADR.
- Nền tảng đã bootstrap: [MKW-AGENT-002 — cài đặt và pilot](docs/tasks/MKW-AGENT-002/INDEX.md).
- Chạy tooling và pilot: [hướng dẫn local](docs/agent/LOCAL_RUN.md).
- Vận hành sản phẩm local: [runbook](docs/operations/product-runbook.md) và [backup/restore](docs/operations/product-backup-restore.md).

## Phạm vi đã thống nhất

Superpowers là phương pháp chính; chuyên môn Minh Khuê bổ sung ràng buộc project. Impeccable và UI UX Pro Max hỗ trợ UI/UX. T3 Browser phục vụ thao tác trực tiếp; Playwright Test lưu các luồng kiểm thử có thể chạy lại.

Một bộ tài liệu tiếng Việt là nguồn chuẩn của project. Skill upstream sau khi cài giữ nguyên nguồn/ngôn ngữ/license; không tạo bản dịch thứ hai của quy tắc project.

## Trạng thái

Pilot ghi chú Node22/SQLite là bằng chứng bootstrap lịch sử, độc lập với sản phẩm. Product dùng portable Node24.22.1/pnpm12.15.0 và PG17.11, có auth/session/reset CLI sandbox, nhân sự, chấm công/CAS/batch/recovery và Excel. Các checks và giới hạn theo [validation](docs/tasks/MKW-PRODUCT-001/validation.md), không lấy test bootstrap thay acceptance sản phẩm.

Task10 R2 chấp nhận fix delta nhưng I3 scroll1000 còn vượt budget; native phones/SR/phone performance Not run, G3 còn mở. Task11 chỉ diễn tập local, không production enrollment/deploy. Hosting/domain/TLS/secrets/operator/retention và cơ chế revoke sessions sau restore cần hoàn thiện trước G4; Task9 license provenance buffers0.1.1/sáu deprecated do main theo dõi trước phân phối. Main fresh Task11 exact-commit review và whole-branch review còn chờ. Android native chưa triển khai. Không push/merge/deploy/scheduler trong phạm vi bàn giao này.
