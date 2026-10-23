# MCP, plugin và công cụ thực thi

Đây là bản đồ khả năng và điều kiện xác minh, không phải cấu hình MCP hoặc chứng nhận các công cụ đã hoạt động. Trạng thái tổng hợp ở [READINESS](READINESS.md); quyền ở [PERMISSIONS](PERMISSIONS.md).

## Phân biệt

- Skill hướng dẫn cách làm; rule quy định ràng buộc.
- MCP cung cấp kết nối/tool; plugin có thể đóng gói skill/MCP/cấu hình.
- CLI/test runner là công cụ thực thi; không nhất thiết cần MCP cho mọi thao tác.
- Có tên tool trong catalog là **Available/discovered**, chưa là **Verified**.

## Bộ công cụ chính

| Nhóm | Lựa chọn | Cách xác nhận hoạt động |
| --- | --- | --- |
| File/terminal | Tool filesystem/terminal của runtime; `rg` ưu tiên khi tìm kiếm | Đọc/sửa đúng fixture thuộc task, UTF-8 đúng; không đụng file ngoài scope |
| Git/worktree | Git CLI hoặc chức năng T3 phù hợp | Baseline, branch/worktree/snapshot đúng; bảo toàn dirty files và kiểm tra hậu điều kiện |
| Điều phối/review | Native child tools hoặc T3 delegation theo runtime | Discovery provider/model, dispatch được phép, theo dõi ID, đúng đầu ra, timeout/cancel và review độc lập thật |
| Trình duyệt trực tiếp | T3 Browser | Theo quy trình discovery/open và thao tác fixture/app với assertion thật |
| Kiểm thử browser lặp lại | Playwright Test/CLI | Spec chạy trên target đã xác minh, có assertion, report và quản lý context/resource |
| Check runner | Lệnh lint/type-check/test/build đúng app/tooling | Kiểm tra script tồn tại, chạy thật và đọc kết quả; preflight không tính là test |
| Sandbox | Web/API/DB seed riêng, owner task/run | Dựng target đúng, xác minh identity, chạy luồng và giải phóng tài nguyên |
| Evidence/resume | Dossier bền vững, ledger/report theo task/run | Phiên mới tiếp tục đúng next action; file giữ lại không mất khi cleanup |

Hiện Node/terminal dùng để kiểm tra tài liệu. Workspace chưa có Git baseline, app script, Playwright setup hay sandbox; không có lệnh test sản phẩm hợp lệ để chạy.

## T3 và model

Catalog phiên khảo sát 22/10 từng công bố điều phối và scheduler. Mỗi lần thực hiện phải discovery lại; khả năng và tên model/provider thay đổi theo phiên. Có tool không phải quyền tạo task/lịch.

Khi dùng T3: child task khác top-level conversation; lưu task ID, dùng status/cancel đúng đối tượng; review round mới là delegated task mới theo chỉ dẫn runtime. Chọn công cụ native chỉ khi hỗ trợ đúng model và scope. Không sửa thread/provider chung để chứng minh readiness.

## Công cụ bổ sung theo nhu cầu

| Lựa chọn | Chỉ thêm khi | Trạng thái project |
| --- | --- | --- |
| Playwright MCP | Cần browser workflow khác hoặc môi trường không có T3 Browser; phải theo quy tắc fallback | Chưa cài/xác minh |
| Context7/công cụ tài liệu chính thức | Cần tài liệu thư viện đúng phiên bản | Chưa chọn kết nối/cài |
| Figma MCP | Có thiết kế Figma và quyền đọc tài nguyên cần thiết | Chưa cài/xác minh |
| GitHub CLI/MCP | Có repo/issue/PR và quyền cần thiết | Chưa xác minh; workspace chưa có Git |
| DB CLI/MCP | Có schema/DB thử và target được phép | Chưa chọn/cài; không cần MCP nếu CLI đủ |
| Công cụ sinh ảnh | Task cần tài sản bitmap cụ thể | Theo khả năng phiên và scope; chưa là gate nền tảng |
| Android emulator/device tools | Bắt đầu mobile, có SDK/thiết bị | Chưa kiểm chứng thiết bị thật |
| Scheduler/monitor/release | Có task chạy dài hoặc phát hành với quyền rõ | Chưa cấu hình/pilot |

Không cài trùng khả năng chỉ để tăng số MCP/plugin. Nếu chọn plugin, ghi rõ nó cung cấp gì, nguồn/version, cấu hình local/global, secret/quyền và cách gỡ/rollback. Không đưa token vào repo hoặc báo cáo.

## Cách ghi evidence công cụ

Ghi ngày, runtime/tool/version khi lấy được, owner/target, thao tác, assertion, kết quả, artifact và giới hạn. Các trạng thái: Not installed, Available/discovered, Verified, Failed, Not run hoặc Blocked phải gắn đúng đối tượng. Test một fixture không chứng minh ứng dụng, DB, provider hay production.
