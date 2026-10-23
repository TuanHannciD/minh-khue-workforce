# Quyền thực hiện

Quyền cụ thể do chỉ dẫn phiên và người dùng cấp. Tài liệu này giúp diễn giải scope, không tự cấp quyền hoặc ghi đè giới hạn runtime. Quyền đã cấp cho cùng scope tiếp tục có hiệu lực; không hỏi lại chỉ vì chuyển bước/phiên khi hồ sơ đã đủ.

## Trong phạm vi task đã giao

- Đọc tài liệu/source, khảo sát local và kiểm tra file có liên quan.
- Viết/sửa local, chạy check phù hợp, sửa lỗi trong scope và cập nhật hồ sơ/evidence.
- Tiếp tục vòng thực hiện–test–review–sửa trong quyền đã có; không yêu cầu người dùng chỉ đạo từng lệnh.
- Chuẩn bị kết quả cụ thể, có thể review được trước khi yêu cầu một quyết định cuối như release.

Không suy ra rằng mọi task đều bao gồm cài dependency, tạo worktree, chạy mạng hoặc phát sinh chi phí. Các hành động đó phải cần cho nhiệm vụ đã giao và được quyền phiên bao phủ.

## Điểm cần quyền hoặc quyết định rõ

| Nhóm | Cách xử lý |
| --- | --- |
| Đổi yêu cầu/contract/ý nghĩa dữ liệu, lựa chọn sản phẩm quan trọng | Trình phần khác với scope đã duyệt; chờ quyết định cho phần phụ thuộc |
| Cài/copy/cập nhật skill, dependency, MCP hoặc plugin | Thực hiện khi task cài đặt hoặc scope hiện có đã bao phủ; ghi nguồn, version, cấu hình và tác động |
| Sửa cấu hình global, hook/provider dùng chung | Cần quyền cụ thể về cấu hình/phạm vi; ưu tiên cấu hình local khi phù hợp |
| Agent con, nhiều writer, chi phí provider | Tuân chỉ dẫn phiên và quyền dispatch; chuẩn bị brief trước; không tự thử chỉ vì catalog có tool |
| Git init/commit/integration/remote | Theo task và quyền hiện có; quyền sửa file không tự là quyền push/merge. Khi chưa rõ giữ đầu ra local review được |
| Truy cập server, tài khoản thật, production DB, dịch vụ ngoài | Xác định target, phạm vi đọc/ghi, dữ liệu và quyền trước khi thao tác |
| Scheduler/chạy nền, deploy, xóa nhánh/dữ liệu | Cần scope rõ, điều kiện dừng/khôi phục và quyền tương ứng |
| Cleanup | Chỉ task-owned, bảo toàn dữ liệu/evidence; không force xóa thứ chưa kiểm tra hoặc chưa rõ sở hữu |

Quyền mạng hoặc filesystem ở runtime chỉ nói tool có thể chạy, không thay ý định người dùng. Không đưa secret vào command output, Git, fixture hoặc tài liệu; dùng kênh secret riêng nếu môi trường hỗ trợ và task cần.

## Hỏi đúng lúc

Chỉ hỏi khi thiếu dữ kiện/quyền thực sự chặn tính đúng hoặc có lựa chọn ngoài scope. Nêu vấn đề, bằng chứng, phương án và tác động; tiếp tục phần độc lập đã được phép. Hết thời gian chờ không phải là approval.

Sửa diễn đạt, link, trạng thái thực tế và evidence trong task tài liệu đã giao không cần xin lại. Đổi chính sách quyền, ngưỡng review hoặc yêu cầu sản phẩm phải bám quyết định rõ của người dùng.

## Quyền bootstrap hiện tại

[MKW-AGENT-001](../tasks/MKW-AGENT-001/INDEX.md) chỉ viết tài liệu. Người dùng đã duyệt [MKW-AGENT-002](../tasks/MKW-AGENT-002/approved/requirements.md): cài skill/dependency project-local, Git baseline/commit/worktree đã chọn, pilot server/browser/data giả, child/reviewer độc lập và tích hợp local fast-forward cuối khi sạch. Không tạo thêm worktree trong task này; primary chỉ đọc đến tích hợp cuối. Không push/remote/deploy/scheduler/global config hoặc dữ liệu/hệ thống nhân sự thật. Không hỏi lại các bước đã được quyền này bao phủ.
