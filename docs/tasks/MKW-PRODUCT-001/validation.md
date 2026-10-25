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
