# Chọn vùng và nhập hàng loạt — brief để review

Ngày27/10/2026. Trạng thái: **yêu cầu kéo chọn + hai chế độ đã xác nhận; luồng chi tiết Proposed**. Nguồn: [requirements](../approved/requirements.md); tiếp nối [bản C](attendance-c.html) và [brief UI](BRIEF.md). Chưa triển khai vào HTML hoặc sản phẩm.

## Tác vụ và phạm vi đã biết

Người chấm/sếp cần nhập nhiều ô nhanh trên bảng tháng. Cả Công/Tăng ca có đơn vị riêng, giữ hướng C và phối xanh hiện tại làm cơ sở. Người dùng xác nhận hai chế độ khi vùng có dữ liệu: chỉ điền ô trống hoặc ghi đè cả vùng. Không đổi ý nghĩa F/trống/N/—, màu nhắc hoặc quyền sửa trực tiếp.

## Luồng đề xuất để xác nhận

1. Desktop kéo từ ô đầu đến ô cuối để chọn hình chữ nhật qua nhiều ngày/nhân sự trong bảng đang xem; tô vùng bằng sắc nhạt, viền biên rõ. Có cách chọn ô đầu/ô cuối bằng click và bàn phím, tránh chỉ dùng kéo.
2. Điện thoại có chế độ “Chọn nhiều”: chạm ô đầu/ô cuối tạo vùng, giữ cuộn và pinch zoom bình thường; tránh để mọi động tác vuốt bảng thành chọn ô. Kéo cảm ứng/auto-scroll cần kiểm riêng, chưa hứa từ CSS.
3. Editor hiện vùng/ngày, số ô chọn và số ô đủ điều kiện; chọn một giá trị áp chung, đơn vị theo bảng. Có hai chế độ rõ “Chỉ điền ô trống” / “Ghi đè cả vùng”, kèm số ô dự kiến thay đổi. Chọn vùng/chọn giá trị chỉ tạo bản nháp; bấm Áp dụng mới thay đổi.
4. N/— là ngày ngoài mốc làm việc, không nhận dữ liệu. Đề xuất loại khỏi tập áp dụng, hiện số ô bỏ qua; vùng không còn ô đủ điều kiện thì không bật Áp dụng. Cần người dùng xác nhận cách xử lý vùng pha trộn trước khi gọi luồng đầy đủ đã chốt.
5. Nhập giá trị hàng loạt đề xuất giữ màu nhắc riêng đang có ở mỗi ô. Bật/tắt nhắc hàng loạt là thao tác riêng cần thiết kế nếu người dùng muốn, tránh tự xóa màu khi nhập công/giờ. Hủy bỏ draft; đổi vùng/loại bảng khi draft còn thay đổi cần cơ chế giữ/bỏ rõ như mẫu hiện có.

## Cần chốt trước thiết kế lưu thật

- Chính xác “ô trống”: nội dung trống dù có màu nhắc hay loại khác; đề xuất xét nội dung, giữ màu độc lập theo quy tắc đã có. Không dùng giá trị0/F như trống.
- Hai người sửa cạnh tranh trong batch: giữ yêu cầu không âm thầm ghi đè. Cần chốt dừng cả lần áp dụng hay báo/lưu một phần, response và cách phục hồi; chưa tự chọn transaction contract.
- Bước cảnh báo khi ghi đè, default chế độ và thao tác khôi phục. Không tự hứa undo sau lưu nếu chưa có thiết kế lưu.
- Phạm vi giá trị tùy chỉnh vẫn theo Q1; bulk không tạo validation mới hoặc quy đổi công/giờ.

## Kiểm bản mẫu và triển khai sau

Bản mẫu HTML dùng dữ liệu giả: thử vùng nhiều dòng/cột, kéo hai chiều và ra ngoài bảng, cuộn, hủy, hai chế độ, vùng pha N/—, ô có nhắc, tách đơn vị/tổng, draft và phương án không kéo. Cảm ứng/zoom/thiết bị thật vẫn gate riêng. Lưu nhiều ô/quyền/concurrency/persistence/Excel cần test đúng stack API/DB khi có scope triển khai, không suy từ DOM mẫu.

Impeccable shape sở hữu brief tương tác; UI UX Pro Max query `dragging alternative selection --domain ux` khớp Dragging Movements: có lựa chọn không kéo và keyboard. Đây là tham khảo accessibility, không tự quyết nghiệp vụ batch. Writer inline, self-review + người dùng; không child hoặc nguồn chuẩn cạnh tranh.
