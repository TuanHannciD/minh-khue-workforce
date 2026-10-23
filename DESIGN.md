# Thiết kế pilot nội bộ

Scope duy nhất: trang ghi chú thử của MKW-AGENT-002, không là design system sản phẩm.

Mode Operate: form trước, trạng thái phản hồi sát thao tác, danh sách dữ liệu đã lưu bên dưới. Một cột trên điện thoại; desktop đủ rộng cho form và danh sách. Nền giấy sáng, chữ đậm dễ đọc, xanh lá cho hành động chính, đỏ cho lỗi; system font tiếng Việt. Không cần ảnh hoặc animation.

Label hiện rõ, nút cao tối thiểu 44px, focus outline, thông báo lỗi role=alert và kết quả role=status. Danh sách trống có hướng dẫn. Loading vô hiệu nút để phản hồi thao tác; API/DB vẫn chịu trách nhiệm xử lý trùng. Dữ liệu nhập render bằng textContent.

Thiết kế vừa đủ theo brief pilot đã duyệt, không mở thêm vòng chọn thương hiệu. Thử desktop/mobile và keyboard; giữ lỗi acceptance làm gate trước bàn giao.
