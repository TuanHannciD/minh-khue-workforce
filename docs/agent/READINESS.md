# Mức sẵn sàng và bước tiếp theo

Cập nhật: 23/10/2026. Nguồn evidence hiện tại: [MKW-AGENT-001](../tasks/MKW-AGENT-001/INDEX.md). Không dùng check SellerFlow làm kết quả của Minh Khuê.

## Ba trạng thái riêng

- **Tài liệu:** đã viết và kiểm tra cấu trúc trong MKW-AGENT-001; đây là đầu ra tài liệu, chưa là kết quả pilot vận hành.
- **Cài đặt:** chưa cài skill/MCP/plugin, chưa có Git baseline, ứng dụng hoặc sandbox.
- **Vận hành:** chưa chạy pilot Agent, review độc lập hoặc luồng browser web–API–DB của Minh Khuê.

## Ma trận khả năng

| Năng lực | Tài liệu | Cài đặt/khả năng hiện tại | Kiểm chứng vận hành |
| --- | --- | --- | --- |
| Rule/authority/routing | Đã viết; check tài liệu đạt | Markdown local | Chưa pilot Agent mới |
| Task/handoff/resume | Đã viết; check tài liệu đạt | Hồ sơ/template local | Chưa chuyển phiên pilot |
| Superpowers | Catalog/policy đã soạn | Not installed; version/commit Pending | Not run |
| Specialist Minh Khuê | Vai trò/nguồn dự kiến | Chưa tạo package | Not run |
| UI skills | Đã chọn Impeccable + UI UX Pro Max | Not installed | Not run |
| Terminal/đọc tài liệu | Có phạm vi check | Node `v22.12.0` đọc được trong task này | Chỉ kiểm tra tài liệu, không là app pilot |
| Git/worktree/ownership tooling | Quy trình đã soạn | Chưa có Git baseline/adapter | Not run |
| MCP/Agent con/reviewer | Quy trình và quyền đã soạn | Discovery phải làm lại khi dùng | Not run tại Minh Khuê |
| T3 Browser | Quy trình đã soạn | Phải status/open trong phiên pilot | Not run với app Minh Khuê |
| Playwright Test | Vai trò/gate đã soạn | Chưa có dependency/config/spec | Not run |
| Sandbox web–API–DB | Prerequisite/gate đã soạn | Chưa có app/DB seed | Not run |
| Scheduler/restart/release | Scope tùy nhu cầu | Chưa cấu hình | Not run |

Sau kiểm tra tài liệu, chỉ cập nhật cột/tình trạng tương ứng. Chưa có môi trường của giai đoạn sau là Not run/Not installed; chỉ ghi Blocked khi nó chặn scope đang triển khai.

## Thứ tự triển khai tiếp

1. **Bootstrap nguồn và skill:** khi được giao cài đặt, xác minh phiên bản/nguồn/license; tạo Git baseline theo quyền; cài local và kiểm tra hash/link/discovery, adapter harness cần dùng.
2. **Tooling và ownership:** lệnh check thật, worktree/resource/evidence, snapshot và cơ chế handoff/resume. Ưu tiên capability cần cho task tiếp, không tạo app rỗng để checker đạt.
3. **Pilot Agent local:** task fixture có acceptance, lỗi có kiểm soát, review và resume; độc lập với nghiệp vụ sản phẩm.
4. **Pilot sandbox app:** khi bắt đầu có app, dựng web/API/DB seed/browser riêng và nghiệm thu thao tác thật theo BROWSER_TESTING.
5. **Năng lực tùy chọn:** nhiều writer song song, chạy nền/scheduler, Android và remote/release theo yêu cầu/quyền riêng.

Phiên bản skill, lựa chọn nguồn UI, retention evidence, budget và timeout cụ thể sẽ được ghi trong task cài/pilot khi có dữ kiện/quyền; chưa tự chọn các con số hoặc tạo lịch.

## Checklist nghiệm thu pilot

- Agent mới đọc đúng entrypoint, chọn nguồn/skill phù hợp, không lấy report làm yêu cầu hiện hành.
- Hoàn thành một task local trong scope và giữ nguyên file ngoài scope.
- Check fail thật không được ghi Done; Agent chẩn đoán/sửa và kiểm lại.
- Reviewer độc lập nhận đúng snapshot; xử lý findings và review tip mới khi gate yêu cầu.
- Chuyển phiên Agent thật tiếp tục đúng checkpoint; không chỉ restart một process fixture.
- Thử thiếu tool/quyền: báo đúng gate thiếu, không giả pass hoặc dùng fallback không khai báo.
- Ownership/cleanup bảo toàn dirty/ignored/evidence và tài nguyên khác.
- Khi có app: UI action, API target và persistence/reload/retry/quyền đạt; phân biệt fixture với live sandbox.
- Nếu cần nhiều writer/chạy nền/release: pilot riêng có quyền, timeout/cancel/recovery và hậu điều kiện.

Mỗi lần đạt một capability ghi evidence, ngày, runtime/version, base/tip và giới hạn. Sau cập nhật package/tool/harness hoặc sửa phần ảnh hưởng, chạy lại gate cần thiết, không tái sử dụng kết quả cũ như bằng chứng mới.
