# Validation — MKW-PRODUCT-001

Ngày 25/10/2026. Scope hiện tại chỉ tài liệu, không chứng nhận ứng dụng.

## Workspace và quyền

Base `a502c982e07f45e77895833fd86144a474254080`, worktree `agent-bootstrap`, branch `agent/mkw-agent-002`, sạch trước khi viết. Không tạo worktree mới hoặc sửa primary. Không dispatch child; không tạo server/port/DB/browser, cài dependency, chạy app hoặc chép dữ liệu nhân sự thật vào Git.

Dùng brainstorming architectural path, tiếp tục từ hội thoại thiết kế đã được người dùng đồng ý. Bước này ghi spec để review; chưa là quyền scaffold/code/stack/implementation-plan. Hồ sơ task và scope được tạo trước các file đặc tả.

## Tự review

Đối chiếu hội thoại với approved/requirements và design:

- Đã loại cách hiểu cũ “chờ xác nhận thì không tính tổng”; màu xanh chỉ nhắc, vẫn cộng dữ liệu bình thường.
- Công và tăng ca độc lập; không đặt trần1 công/ngày, không quy đổi tăng ca thành công, không chia công theo công trình.
- Cùng quyền và sửa trực tiếp; không tự thêm workflow duyệt hoặc audit bắt buộc.
- Ngày bắt đầu chọn riêng với thời điểm thêm; ngày kết thúc inclusive, sau đó `—`, tháng sau không hiện, giữ lịch sử.
- Điện thoại ưu tiên nhẹ, desktop đầy đủ, zoom/cuộn/định hướng ô; chưa claim thiết bị thật đã chạy.
- Excel có trong scope; layout một sheet/công thức, miền số, tài khoản, xung đột và sửa mốc ngày còn là câu hỏi/đề xuất rõ. Không tự điền câu trả lời cho đủ spec.
- Không có API/schema/stack hay app test Verified. Không thay PRODUCT.md/DESIGN.md đang mô tả pilot. Tài liệu sản phẩm mới được định tuyến tại authority map.

## Check và review

`npm run check:docs`, cwd worktree: exit0, kiểm UTF-8 Markdown và links/anchors/fences của30 tài liệu hiện hành; reports/templates lịch sử chỉ kiểm UTF-8 theo checker. `git diff --check`: exit0 cho diff tài liệu tracked; diff staged bao gồm file mới được kiểm lại trước commit. Rà placeholder: không có TODO/TBD bỏ dở; Q1–Q6 là quyết định cần làm rõ, không coi như đã trả lời. Không sửa checker để cho qua.

Spec review người dùng: chưa thực hiện trên bản viết; task **In review**, chưa Done hoặc integrated. Tự review nội dung không được gọi là review độc lập. Không có quyền dispatch reviewer mới được suy từ task bootstrap đã đóng.

Không chạy lại hash/app/browser tests cho thay đổi Markdown thuần. Gate độc lập cho code/tooling/persistence sản phẩm áp dụng ở task triển khai sau theo QUALITY_GATES.

## Bàn giao

Bản viết là đặc tả để review, không phải implementation-ready cho các phần còn Q1–Q6. Next action: người dùng review bản viết, trả lời lần lượt các quyết định ảnh hưởng; cập nhật nguồn chuẩn trước thiết kế kiến trúc/kế hoạch triển khai. Commit/tip thực tế có trong Git log; không tự ghi SHA của chính commit vào nội dung commit đó.

## Cập nhật lựa chọn số công — 25/10/2026

Theo trả lời mới của người dùng, cập nhật requirements, design và bước tiếp trong INDEX: chọn nhanh0,5/1/1,5/2/2,5; Tùy chỉnh để nhập lớn hơn2,5. Tự review xác nhận không biến2,5 thành trần hoặc suy bước công thành bước giờ tăng ca. Q1 đã giải quyết một phần; độ chính xác/giới hạn tùy chỉnh vẫn chưa chốt. Thêm AC11 ở trạng thái Not run; phạm vi vẫn chỉ tài liệu.

## Cập nhật bước tăng ca — 25/10/2026

Người dùng xác nhận giờ tăng ca có bước nửa giờ như các bước công. Cập nhật nguồn requirements, design/AC11/Q1 và next action: chọn nhanh0,5/1/1,5/2/2,5 giờ, tùy chỉnh lớn hơn2,5 theo bước0,5 giờ. Đây là xác nhận mới, thay phần chưa chốt bước tăng ca ở checkpoint trước. Tự review giữ nguyên đơn vị/tổng riêng và không tự quyết định ô không tăng ca hay làm tròn. Kiểm tra tài liệu bằng `npm run check:docs` và `git diff --check`; không chạy app/browser vì chỉ sửa Markdown.

## Cập nhật ô không tăng ca — 25/10/2026

Người dùng đồng ý đề xuất để trống ngày không tăng ca. Cập nhật requirements, design/AC04/Q1 và INDEX; không tự điền0/F hoặc cộng giờ cho ô trống. Quy tắc mốc ngày N/— và màu nhắc độc lập giữ nguyên. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`, không chứng nhận ứng dụng.

## Cập nhật tài khoản cùng quyền — 25/10/2026

Người dùng đồng ý hai tài khoản riêng cho người chấm chính và sếp, cùng quyền xem/nhập/sửa toàn công ty. Cập nhật requirements, design/AC01/Q2 và INDEX. Chưa quyết định phương thức đăng nhập/khôi phục, chưa thêm vai trò khác hoặc workflow duyệt. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`, chưa có triển khai hoặc kiểm thử quyền trên ứng dụng.

## Cập nhật xung đột cùng ô — 25/10/2026

Người dùng đồng ý báo người lưu sau khi hai người sửa cùng một ô từ dữ liệu cũ, hiển thị giá trị mới trước khi quyết định sửa tiếp. Cập nhật requirements, design/Q3/AC12 và INDEX; không tự tạo quy trình duyệt hoặc quyết định cơ chế API. AC12 là Not run. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`, chưa kiểm chứng xử lý xung đột trên ứng dụng.

## Cập nhật phương pháp UI/UX — 25/10/2026

Theo chỉ dẫn người dùng, bố cục/vị trí phải qua skill thiết kế, không tự kết luận. Đã đọc Impeccable/shape và UI UX Pro Max; chạy context một lần với target design của task. Context tải cả PRODUCT.md của pilot nên không dùng nó làm brief chấm công hoặc sửa root. Tra cứu UX ban đầu có kết quả lẫn chủ đề; thu hẹp một lần sang touch target size, trả về đúng Mobile Touch và Web Target Size (Minimum); chỉ dùng làm tham khảo theo nền tảng, không tự áp một kích thước cho mọi nơi hoặc thêm bulk edit vào scope. Chưa tạo/chọn mockup, chưa chứng nhận chất lượng UI. Bổ sung requirements/design/INDEX để ghi hai nút Công/Tăng ca chưa được duyệt; phạm vi vẫn chỉ tài liệu.

## Cập nhật quy mô nhân sự — 25/10/2026

Người dùng cho biết hiện khoảng20 người, sau này có thể nhiều hơn rất nhiều. Cập nhật requirements/design/Q6/INDEX, không suy ra trần, số lượng tương lai cụ thể hoặc quyết định phân trang/ảo hóa. Chưa có benchmark hay kiểm thử hiệu năng sản phẩm. Thay đổi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`.
