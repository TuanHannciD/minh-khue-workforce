# Mức sẵn sàng và bước tiếp theo

Cập nhật 23/10/2026. Nguồn: [MKW-AGENT-002 validation](../tasks/MKW-AGENT-002/validation.md). Lịch sử tài liệu tại MKW-AGENT-001 giữ nguyên; không dùng kết quả SellerFlow làm bằng chứng Minh Khuê.

## Ba trạng thái riêng

- **Tài liệu:** rule/authority/routing/permission/quality/browser/handoff đã viết, cập nhật theo bootstrap002.
- **Cài đặt:** Git baseline/worktree, 15 Superpowers và 2 UI project-local, Node/npm lockfile, lint/integration/Playwright và pilot ghi chú độc lập đã có.
- **Vận hành:** đã kiểm API/SQLite và thao tác T3 thật; Agent ngữ cảnh mới đã khôi phục checkpoint. Browser regression, review final-tip và tích hợp local ghi tại validation khi chạy xong.

## Ma trận khả năng

| Năng lực | Cài đặt | Kiểm chứng và giới hạn |
| --- | --- | --- |
| Rule/routing/handoff | Tài liệu local | Agent ngữ cảnh mới đọc đúng file, check7/7; chưa kiểm toàn phiên crash recovery |
| Superpowers | 15 skill v6.4.2 commit ghim, license/hash | Checker/pilot TDD/execution/verification; chưa thử cả15 workflow |
| Skill discovery | `.agents/skills` | Explicit read đã dùng; auto-discovery harness chưa Verified |
| UI skills | Impeccable + UI UX Pro Max snapshot local | Context/UX search/detector đã chạy; provenance local, không pristine upstream |
| Specialist Minh Khuê | Vai trò định tuyến bằng docs | Chưa tạo package riêng; chưa có nghiệp vụ/schema để viết module specialist |
| Git/worktree | Baseline12bb042; worktree base ff91255 | Native handoff vào agent-bootstrap; primary read-only đến tích hợp cuối |
| Check runner | `npm run check` | Hash/docs/lint + 7 tests đạt; chưa có type-check/build sản phẩm |
| Sandbox UI/API/DB | Node22 + SQLite experimental, loopback/random port | Lưu bền qua restart; retry/concurrent/error/validation; chỉ dữ liệu giả |
| Ownership | CLI owner record, evidence ngoài worktree | Dừng mềm giải phóng port/DB, giữ evidence/server khác; hard-kill recovery chưa thử |
| T3 Browser | Runtime sẵn có, không cài thêm MCP | UI lưu → 503 → retry → reload; API/UI đúng2 ghi chú |
| Playwright Test | Dependency/config/spec desktop/mobile | Xem kết quả run tại validation; cài dependency chưa thành pass |
| Delegation/review | T3 live catalog | Resume pilot đã chạy; immutable tip review ghi riêng tại validation |
| Scheduler/remote/release/Android | Chưa cấu hình | Not run, ngoài scope002 |

## Bước tiếp

Hoàn tất gate002 còn Pending tại validation trước bàn giao Done. Sau bootstrap, làm rõ actor, danh tính, ca/giờ, quyền xem/sửa và dữ liệu chấm công; rồi duyệt kiến trúc FE/BE/API có thể phục vụ Android. Chưa dùng pilot áp đặt lựa chọn sản phẩm.

Playwright MCP chưa cài vì T3 Browser + Playwright Test đã có hai vai trò cần thiết. Figma/Context7/GitHub/DB MCP chỉ bổ sung khi task cần và có quyền. Sau nâng skill/dependency/tool/harness, kiểm lại gate bị ảnh hưởng. Hash khớp không chứng minh mọi script an toàn; screenshot không thay assertion; checkpoint resume không thay recovery toàn phiên.
