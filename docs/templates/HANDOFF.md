# Mẫu bàn giao và tiếp tục

Template cho kết thúc/chuyển phiên; không phải kết quả thực tế. Điền vào INDEX/validation của task, không tạo thêm bản nguồn cạnh tranh.

## Ngữ cảnh cần giữ

- Task ID, trạng thái và đường dẫn yêu cầu/plan hiện hành:
- Quyết định/approval đã có và phần chưa có:
- Workspace/branch/base/tip hoặc snapshot:
- Dirty/untracked/ignored và tài nguyên cần bảo toàn:

## Kết quả

- Đã làm; acceptance đạt/chưa đạt:
- Check: command/tool, cwd/target, ngày, exit/result, scope và artifact:
- Verified / Failed / Not run / Blocked; lý do và điều kiện gỡ:
- Review độc lập: reviewer/task/round ID, range/snapshot, findings, tip sau sửa và kết quả mới:
- Phần tự review phải ghi rõ, không thay review độc lập:
- Findings/ngoại lệ/đề xuất còn mở, ai quyết định và tác động:
- Implemented / reviewed / integrated / released: trạng thái từng phần:

## Tài nguyên và tiếp tục

- Process/port/DB/browser/report owner, đã release hay đang giữ, bằng chứng:
- Evidence cần giữ và phạm vi chia sẻ an toàn:
- Next action chính xác; prerequisite và check phải chạy sau đó:
- Phần người dùng cần quyết định, nếu có:

Agent phiên mới đọc hồ sơ và nguồn hiện hành rồi tiếp tục đúng next action. Không làm lại task hoàn tất chỉ vì thiếu lịch sử chat; không suy approval từ việc không có phản hồi. Theo [EXECUTION_RULES](../agent/EXECUTION_RULES.md).
