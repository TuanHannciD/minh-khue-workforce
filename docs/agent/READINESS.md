# Mức sẵn sàng và bước tiếp theo

Cập nhật 23/10/2026. Nguồn: [MKW-AGENT-002 validation](../tasks/MKW-AGENT-002/validation.md). Lịch sử tài liệu tại MKW-AGENT-001 giữ nguyên; không dùng kết quả SellerFlow làm bằng chứng Minh Khuê.

## Hạ tầng CI/CD — Task4 ngày 11/11/2026

Đã có controls release/coordinator/backup/attestation/rollback trong integrated source `47e1d7fd6486cec7169874fb85110d0418db4eed`; [release checklist](../operations/release-checklist.md), [release runbook](../operations/product-release-runbook.md) và [backup/restore](../operations/product-backup-restore.md) mô tả operator path. [Report Task4](../reports/2026-11-11-task4-release-checklist.md) sở hữu runtime, commands, kết quả local và baseline links; implemented không có nghĩa verified trên GitHub/production. Independent final code review do parent quản lý, không được thay bằng self-review docs.

Không đóng toàn bộ G3/G4 sản phẩm: native phone/SR/phone performance, product acceptance/review còn mở theo hồ sơ riêng; GitHub CI/GHCR/attestation dịch vụ thật, environment approvals/variables/secrets, key custody/recovery, production migration/compatibility/restore/cutover và smoke sau release cần evidence đúng target. Task này không SSH/deploy production hoặc bật scheduler. Các checkpoint lịch sử bên dưới không bị xóa hay đổi thành pass.

## Sản phẩm — Task11 bàn giao local, 30/10/2026

Các mục bootstrap002 bên dưới là checkpoint lịch sử Node22/SQLite, không thay trạng thái sản phẩm. Product dùng React/Vite + Nest/Express + PostgreSQL17.11/Prisma, Node24.22.1/pnpm12.15.0; Task1–9 independent Approved. Task10 R2 chấp nhận fix delta I1/I2/M1/M2, I3 Open scroll1000 p95 66,6/max333,3ms >33/200; final20/200 scoped pass, editor1000 121/input61,3ms đạt. **G3 chưa đạt**, native phones/SR/phone performance Not run; Task10 chưa complete/product chưa Done. Main giữ concrete design review frozen panes/windowing, không đổi budget.

[Runbook](../operations/product-runbook.md) và [backup/restore](../operations/product-backup-restore.md) đã viết; fake local rehearsal Task11 trên3 UUID DB mới kiểm SQL/API ba tháng, reminder/tổng/mốc/revisions/relations và auth reset/revoke/idle/absolute, gồm corrupt/wrong-target/transaction failure. CLI chỉ thêm enrollment hẹp fake Task11, không production enrollment. Fixture source/restored đã rotate4 passwords/revoke sessions, HTTP/own PG đã release, DB/dump/evidence ignored giữ lại; chi tiết lệnh/evidence ở [validation](../tasks/MKW-PRODUCT-001/validation.md). Tự review của writer không independent PASS; main fresh exact-commit review Task11 rồi whole-branch review còn chờ.

**G4 production Blocked/Not run**: hosting/domain/TLS/proxy/DB role/secret store/operator xác minh và handoff/retention/RPO/RTO/cutover chưa chọn; data-model G1 yêu cầu revoke restored sessions trước mở truy cập, công cụ revoke-only chưa có và không tự bắt buộc reset password sau restore. Task9 M1 license provenance buffers0.1.1/M2 sáu deprecated do main route dependency/license review trước distribution, không legal clearance/đổi pin. Incident22 originals unavailable: giữ manifest/current copies/evidence. Không push/merge/deploy/scheduler/hệ thống thật.

## Ba trạng thái riêng — bootstrap002 lịch sử

- **Tài liệu:** rule/authority/routing/permission/quality/browser/handoff đã viết, cập nhật theo bootstrap002.
- **Cài đặt:** Git baseline/worktree, 15 Superpowers và 2 UI project-local, Node/npm lockfile, lint/integration/Playwright và pilot ghi chú độc lập đã có.
- **Vận hành:** API/SQLite, thao tác T3 thật, regression desktop/mobile và Agent ngữ cảnh mới khôi phục checkpoint đã đạt. Review final-tip và tích hợp local ghi tại validation/receipt.

## Ma trận khả năng

| Năng lực | Cài đặt | Kiểm chứng và giới hạn |
| --- | --- | --- |
| Rule/routing/handoff | Tài liệu local | Agent ngữ cảnh mới đọc đúng file, check7/7; chưa kiểm toàn phiên crash recovery |
| Superpowers | 15 skill v6.4.2 commit ghim, license/hash | Checker/pilot TDD/execution/verification; chưa thử cả15 workflow |
| Skill discovery | `.agents/skills` | Explicit read đã dùng; auto-discovery harness chưa Verified |
| UI skills | Impeccable + UI UX Pro Max snapshot local | Context/UX search/detector đã chạy; provenance local, không pristine upstream |
| Specialist Minh Khuê | Vai trò định tuyến bằng docs | Chưa tạo package riêng; chưa có nghiệp vụ/schema để viết module specialist |
| Git/worktree | Baseline12bb042; worktree base ff91255 | Native handoff vào agent-bootstrap; primary read-only đến tích hợp cuối |
| Check runner | `npm run check` | Hash/docs/lint + 9 tests đạt sau fix review; chưa có type-check/build sản phẩm |
| Sandbox UI/API/DB | Node22 + SQLite experimental, loopback/random port | Lưu bền qua restart; retry/concurrent/error/validation; chỉ dữ liệu giả |
| Ownership | CLI owner record, evidence ngoài worktree | Stdin/file-stop dừng mềm, giữ evidence/server khác; run tương tác đầu phải terminate đúng process sau mất stdin, không claim full crash recovery |
| T3 Browser | Runtime sẵn có, không cài thêm MCP | UI lưu → 503 → retry → reload; API/UI đúng2 ghi chú |
| Playwright Test | Dependency/config/spec desktop/mobile | Verified2/2, real UI/API/SQLite, keyboard/error/retry/reload/XSS/overflow; viewport mô phỏng chưa là Android thật |
| Delegation/review | T3 live catalog | Resume pilot đã chạy; immutable tip review ghi riêng tại validation |
| Scheduler/remote/release/Android | Chưa cấu hình | Not run, ngoài scope002 |

## Bước tiếp

Gate cuối002 (tip đã review, check, tích hợp local) theo `completion-receipt.json` được chỉ dẫn tại validation; chỉ coi Done khi receipt xác nhận đủ. Sau bootstrap, làm rõ actor, danh tính, ca/giờ, quyền xem/sửa và dữ liệu chấm công; rồi duyệt kiến trúc FE/BE/API có thể phục vụ Android. Chưa dùng pilot áp đặt lựa chọn sản phẩm.

Playwright MCP chưa cài vì T3 Browser + Playwright Test đã có hai vai trò cần thiết. Figma/Context7/GitHub/DB MCP chỉ bổ sung khi task cần và có quyền. Sau nâng skill/dependency/tool/harness, kiểm lại gate bị ảnh hưởng. Hash khớp không chứng minh mọi script an toàn; screenshot không thay assertion; checkpoint resume không thay recovery toàn phiên.

### Phone branch disposition — 2026-11-06

Người dùng đã **CANCELLED** nhánh phone ngày 06/11/2026. Không retry; native phone, phoneperf và trusted touch vẫn **NOT RUN**, không waiver.
