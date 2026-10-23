# Mẫu giao task

Đây là template, không là approval hoặc task đang chạy. Xóa mục không áp dụng và ghi lý do khi cần. Quy trình/rule được liên kết, không chép lại.

## Nhận diện và kết quả

- Task ID/tên:
- Dossier/plan có sẵn:
- Kết quả người dùng cần:
- Nguồn xác nhận, ngày và phạm vi đã duyệt:
- Acceptance có thể quan sát/kiểm tra:
- Trong phạm vi / ngoài phạm vi:
- Điều chưa biết/Pending và phần bị ảnh hưởng:

## Nguồn và ownership

- Nguồn chuẩn liên quan:
- Risk và lý do:
- Writer, reviewer route và quyền dispatch nếu có:
- Workspace/branch/base SHA hoặc giới hạn bootstrap/snapshot:
- File zone được sửa; file/resource cần bảo toàn:
- Dependency và snapshot cần có:

## Thực hiện và kiểm chứng

- Plan/status phê duyệt:
- Lệnh/tool/check thực tế; chưa có thì ghi prerequisite:
- Target, dữ liệu thử, process/port/DB/browser owner:
- Nơi giữ evidence và dữ liệu không được log:
- Quyền local/cài đặt/network/Git/remote/release đã có:
- Điều kiện cần hỏi/dừng, không suy quyền:
- Đầu ra bàn giao, trạng thái integration/release mong muốn:
- Next action:

Theo [AGENTS](../../AGENTS.md), [EXECUTION_RULES](../agent/EXECUTION_RULES.md), [PERMISSIONS](../agent/PERMISSIONS.md) và [QUALITY_GATES](../agent/QUALITY_GATES.md). Mở thêm [BROWSER_TESTING](../agent/BROWSER_TESTING.md) cho task UI/flow.
