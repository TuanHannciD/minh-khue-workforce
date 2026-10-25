# MKW-PRODUCT-001 — Đặc tả phiên bản chấm công đầu tiên

Ngày lập: 25/10/2026. Trạng thái: In review — đã viết/tự review đặc tả và kiểm tra tài liệu. Chưa phê duyệt đặc tả viết hoặc kế hoạch triển khai sản phẩm.

## Mục tiêu và acceptance

Chuyển cách chấm công Excel toàn công ty thành đặc tả web dễ dùng, ưu tiên điện thoại một chút và đầy đủ desktop. Tài liệu phải giữ đúng công/tăng ca độc lập, màu xanh chỉ nhắc kiểm tra, cùng quyền sửa trực tiếp, ngày vào/nghỉ và xuất Excel. Phân biệt quyết định của người dùng với phương án đề xuất/câu hỏi chưa chốt; không tự bổ sung quy trình duyệt.

## Nguồn và phạm vi

- [Yêu cầu đã thống nhất trong hội thoại](approved/requirements.md).
- [Đặc tả để review](design.md).
- [Kiểm chứng và bàn giao](validation.md).
- Nguồn quyền/routing: [AGENTS](../../../AGENTS.md), [authority map](../../agent/AUTHORITY_MAP.md), [execution rules](../../agent/EXECUTION_RULES.md), [permissions](../../agent/PERMISSIONS.md), [quality gates](../../agent/QUALITY_GATES.md).
- Quyền hiện tại: đọc/viết/check tài liệu và commit local bản đặc tả theo bước brainstorming. Không scaffold/code/cài dependency sản phẩm, tự chọn stack, dispatch child mới, tích hợp main, push/deploy hoặc dùng hệ thống nhân sự thật.
- Phạm vi file: dossier này; thêm định tuyến tại authority map, README và docs/INDEX. Giữ nguyên pilot, PRODUCT.md/DESIGN.md của pilot, skill distribution, hồ sơ002 và evidence cũ.

## Ownership và risk

Writer: Agent chính inline. Review: tự rà soát tài liệu và người dùng review bản viết; không yêu cầu reviewer code độc lập cho task chỉ viết đặc tả này. Risk tài liệu: trung bình do có thể làm sai ý nghĩa tính công; không thay gate cho task triển khai sau.

Workspace sẵn có: `.worktrees/agent-bootstrap`, branch `agent/mkw-agent-002`, base tại lúc bắt đầu `a502c982e07f45e77895833fd86144a474254080`, sạch. Dùng worktree hiện có cho task tài liệu, không tạo thêm; branch vẫn tên bootstrap, commit mới phải thể hiện scope sản phẩm riêng. Primary chỉ đọc; không suy quyền tích hợp002 sang sản phẩm001.

Resource: file Markdown local, checker hiện có; không acquire server/port/DB/browser. Không chép tên nhân sự hoặc ảnh chứa thông tin nhân sự vào Git. Không có thay đổi code nên không chạy lại browser/app tests.

## Bước tiếp

Bàn giao người dùng review bản viết và tiếp tục làm rõ các điểm ở mục10 của đặc tả, đã chốt lựa chọn nhanh số công và tự nhập khi lớn hơn2,5; tiếp theo làm rõ cách nhập giờ tăng ca. Khi bản viết đủ quyết định và được duyệt, mới chuyển sang kế hoạch triển khai. Không biến đề xuất thành yêu cầu đã duyệt. Commit local của task tài liệu được giữ trên worktree hiện có, chưa tích hợp main.
