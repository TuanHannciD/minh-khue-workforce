# ADR-002 — Quản lý state ứng dụng web

Ngày 25/10/2026. Trạng thái: **Accepted về lựa chọn và phân trách nhiệm; chưa cài/triển khai**. Nguồn: người dùng trả lời “Approve” sau đề xuất TanStack Query + state React, Zustand bổ sung khi có nhu cầu rõ, và bước viết kiến trúc cụ thể để review. Tiếp nối [ADR-001](ADR-001-product-foundation.md).

## Quyết định

1. **TanStack Query** quản lý dữ liệu lấy từ API: truy vấn, cache, trạng thái tải/lỗi và cập nhật sau lưu. Không tạo bản sao bảng công trong một global store khác.
2. **State React** đặt gần consumer quản lý ô đang chọn, hộp nhập và bản nháp. Khi nhiều thành phần trong cùng feature cần dùng, nâng state đến chủ sở hữu chung phù hợp trước khi thêm global store.
3. **Zustand là lựa chọn có điều kiện**, chưa phải dependency bắt buộc. Chỉ bổ sung khi cần chia sẻ state giao diện giữa các thành phần mà state React tại owner chung không đáp ứng gọn; ghi rõ dữ liệu/consumer và không sao chép server cache vào đó.
4. Tháng/loại bảng có thể dùng URL khi cần giữ qua reload/chia sẻ; router và dạng URL chưa chọn trong quyết định này.
5. Backend/cơ sở dữ liệu sở hữu dữ liệu lưu bền vững và kiểm xung đột. Query cache hoặc Zustand không thay cơ chế xác thực, phân quyền hoặc kiểm hai người sửa cùng ô.

## Cách áp dụng

[CODE_CONVENTIONS](../CODE_CONVENTIONS.md) sở hữu nguyên tắc state; [API_CONTRACTS](../API_CONTRACTS.md) sở hữu ranh giới API. Luồng cụ thể và lựa chọn kỹ thuật tiếp theo nằm trong [bản kiến trúc để review](../../tasks/MKW-PRODUCT-001/technical/architecture-proposal.md); phần Proposed ở đó chưa tự được duyệt bởi ADR này.

Không đồng nhất cache với khả năng làm việc offline hoặc lưu bản nháp sau đóng trang. Chưa cài thư viện, pin phiên bản, kiểm compatibility hoặc chạy test state sản phẩm. Framework, backend/DB, cách đồng bộ giữa thiết bị và chi tiết lỗi/xung đột còn cần thiết kế. Quyền hiện tại là tài liệu; chưa có quyền cài/scaffold/code sản phẩm.

Cập nhật tiếp nối: [ADR-003](ADR-003-product-stack.md) đã chốt bộ công nghệ mục tiêu phương án A. Những phần framework/backend/DB/tooling được bổ sung bởi ADR-003 không còn Pending ở hiện tại; vẫn chưa cài/kiểm tương thích, và các chi tiết chưa chốt không tự được duyệt.
