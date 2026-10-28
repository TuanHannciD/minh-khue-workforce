# ADR-003 — Bộ công nghệ sản phẩm phương án A

Ngày 25/10/2026. Trạng thái: **Accepted về kiến trúc mục tiêu; chưa cài/triển khai/kiểm tương thích**. Nguồn: người dùng trả lời “Tôi đồng ý phương án A” sau bản trình bộ công nghệ cụ thể. Tiếp nối [ADR-001](ADR-001-product-foundation.md) và [ADR-002](ADR-002-state-management.md).

## Quyết định

- Web: React + TypeScript strict + Vite, React Router; shadcn/ui nền Radix + Tailwind CSS. TanStack Query giữ server state, state React giữ thao tác/draft theo ADR-002; Zustand có điều kiện. React Hook Form + Zod dùng cho form, không tạo form instance cho từng ô.
- API: Node.js LTS + NestJS/TypeScript strict, adapter Express; chia module nghiệp vụ. PostgreSQL + Prisma ORM/Migrate; ORM và model DB chỉ thuộc backend.
- Contract: Nest DTO/class-validator kiểm đầu vào, Nest Swagger sinh OpenAPI; openapi-typescript sinh kiểu web. Backend vẫn kiểm nghiệp vụ, quyền, tổng và ghi có điều kiện theo phiên bản; decorator/kiểu TypeScript không thay kiểm runtime. Chưa chốt field/version/error/schema cụ thể.
- Excel: chọn hướng ExcelJS xuất phía API. Version/license và tính tương thích ứng dụng đọc file cần kiểm tại bước tooling; bố cục/công thức vẫn phải chốt nghiệp vụ.
- Tooling mục tiêu: pnpm workspace; ESLint/typescript-eslint/React Hooks rules + Prettier; dependency-cruiser và restricted imports kiểm cycle/ranh giới. Vitest + Testing Library, Supertest và Playwright cho test phù hợp; T3 browser cho thao tác/debug trực tiếp. Rule cần có bằng chứng chặn fixture vi phạm.
- Tổ chức source mục tiêu: `apps/web`, `apps/api`, `contracts`, module/feature có ownership; chi tiết trách nhiệm tại [bản kiến trúc](../../tasks/MKW-PRODUCT-001/technical/architecture-proposal.md). Khởi đầu bảng bằng semantic HTML table và sticky tên/ngày; thêm grid engine/ảo hóa dựa trên thử nghiệm và benchmark, không mặc định cài.

## Lý do và hệ quả

Web nội bộ thiên về nhập bảng, chưa cần SSR/SEO. NestJS cung cấp cấu trúc chung cho nhiều module; PostgreSQL hỗ trợ dữ liệu quan hệ và transaction/concurrency. Đổi lại cần vận hành API/DB, migration, backup và chuẩn hóa cách viết Nest. Không thêm microservices, Redis, queue hoặc monorepo orchestrator khi chưa có nhu cầu.

pnpm là lựa chọn cho sản phẩm tương lai, chưa chuyển workspace npm/pilot hiện tại. Kế hoạch tooling phải nêu đường chuyển lockfile/scripts và bảo toàn pilot. Web/API build riêng và dùng contract; web không import source API/Prisma, API không import UI.

## Chưa được quyết định hoặc kiểm chứng

Phiên bản cụ thể/engine/lockfile cần đối chiếu bộ tương thích tại bước tooling; không kế thừa pin Node/SQLite pilot. Đăng nhập/khôi phục, thư viện auth, hosting/domain/CI, backup/restore và cập nhật giữa thiết bị còn cần thiết kế. Cơ chế revision/transaction chi tiết, schema, API fields và các điểm nghiệp vụ Q1/Q4/Q5 theo [design](../../tasks/MKW-PRODUCT-001/design.md) chưa được tự suy ra.

Approval không bao phủ mọi chi tiết state/save/error trong proposal. Không coi draft giữ qua đóng trang, offline, realtime hay optimistic update là đã duyệt. Phiên bản/license/compatibility, install/build/boundary/contract/DB/browser tests sản phẩm đều **Not run**. Bộ tooling mới chưa cài hoặc enforce; kết quả pilot không thay bằng chứng này.

## Phạm vi quyền và bước tiếp

Cập nhật tiếp nối28/10/2026: hai tài khoản tên/mật khẩu, reset qua vận hành, cập nhật khoảng15 giây và toàn bộ design.md (gồm đề xuất, mục13–14) đã duyệt; bản mẫu C hiện hành đã được chấp nhận. [Kế hoạch triển khai](../../tasks/MKW-PRODUCT-001/technical/implementation-plan.md) đang review. Các đoạn chưa chốt/chưa duyệt ở checkpoint25/10 dưới đây giữ lịch sử; chi tiết auth/session/schema/version chưa viết vẫn cần thiết kế/review. Chưa có quyền cài/scaffold/code/dispatch/tích hợp/push/deploy từ approval này.

Quyền hiện tại tiếp tục là tài liệu và bản mẫu HTML độc lập. Chưa duyệt UI thị giác/spec đầy đủ/implementation plan hoặc quyền cài/scaffold/code sản phẩm, dispatch child, tích hợp primary/push/deploy. Tiếp theo trình UI C, làm rõ nghiệp vụ còn thiếu, hoàn thiện/review đặc tả trước kế hoạch triển khai. Không sửa ADR cũ thành quyết định có từ trước; áp ADR này cho phần được bổ sung.
