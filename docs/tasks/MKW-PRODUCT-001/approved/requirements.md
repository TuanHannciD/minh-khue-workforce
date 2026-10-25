# Yêu cầu người dùng đã thống nhất

Nguồn: hội thoại trực tiếp tiếp nối MKW-AGENT-002, ghi nhận ngày 25/10/2026. Tài liệu này chỉ tổng hợp ý định đã xác nhận; không phải phê duyệt stack, API/schema hay triển khai code.

## Mục tiêu và người dùng

- Công ty Minh Khuê hiện dùng bảng Excel tháng có phần công và phần tăng ca. Người dùng cung cấp ảnh làm tham khảo cấu trúc; không sao chép thông tin nhân sự trong ảnh vào repository.
- Người dùng là người chấm/tổng hợp chính cho toàn công ty, bao gồm các công trình khác nhau. Sếp cần bảng trực quan quen thuộc như Excel, có thể trực tiếp chỉnh sửa.
- Người dùng và sếp cùng phân quyền nhập, sửa; dữ liệu đã nhập/chốt vẫn sửa trực tiếp được. Không cần quy trình duyệt/mở lại để sửa. Lịch sử sửa chỉ từng được Agent đề xuất, chưa là yêu cầu bắt buộc.
- Người dùng và sếp mỗi người một tài khoản riêng, cùng quyền xem, nhập và sửa dữ liệu chấm công toàn công ty. Phương thức đăng nhập/khôi phục chưa được chốt.
- Khi hai người sửa cùng một ô dựa trên dữ liệu cũ, người lưu sau được báo ô đã thay đổi và xem giá trị mới trước khi quyết định sửa tiếp; không âm thầm ghi đè thay đổi vừa lưu của người kia. Đây không phải quy trình duyệt.
- Không ghi nhận phần công của một người theo từng công trình trong ngày. Lọc/quản lý công trình chưa được chốt vào phạm vi bản đầu.
- Vị trí thành phần và UI/UX phải được phân tích, thiết kế bằng skill chuyên môn (Impeccable chủ đạo, UI UX Pro Max bổ trợ), trình phương án để người dùng review; không tự chốt bố cục từ đề xuất hội thoại. Hai nút Công/Tăng ca chưa được duyệt.
- Thiết kế ban đầu đơn giản. Dùng cả điện thoại và máy tính, ưu tiên điện thoại một chút nhưng desktop phải đầy đủ.

## Công, tăng ca và màu nhắc

- `0,0` và `F` từng cùng nghĩa nghỉ cả ngày; người dùng đang chuyển sang quy chuẩn `F`. Không tự đưa import dữ liệu Excel cũ vào scope chỉ vì có giá trị cũ.
- `0,5` là làm một buổi. Có thể nhận nhiều hơn một công trong một ngày theo chỉ đạo của sếp.
- Số công có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`; nếu lớn hơn `2,5` thì chọn **Tùy chỉnh** để tự nhập. `2,5` không phải trần số công. Độ chính xác/giới hạn của số công tùy chỉnh chưa được chốt.
- Tăng ca tính theo giờ, có bước nửa giờ (`0,5` giờ), không cần bước15 phút. Chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5` giờ; lớn hơn `2,5` giờ thì tự nhập qua **Tùy chỉnh**, vẫn theo bước `0,5` giờ.
- Ngày không tăng ca để ô tăng ca trống, không tự điền `0` hoặc `F`; ô trống không cộng giờ vào tổng.
- Số công và số giờ tăng ca độc lập. Một ngày có thể vừa nhiều công vừa có giờ tăng ca; không quy đổi/gộp hai loại.
- Màu xanh dùng để nhắc cần hỏi/xác nhận lại thông tin; có thể bật/tắt cho từng ô công hoặc tăng ca độc lập.
- Màu không tạo trạng thái chờ duyệt, không loại dữ liệu khỏi tổng. Ô có số vẫn cộng số, `F` vẫn nghỉ, trống vẫn trống.
- Quyết định ban đầu của Agent về “chờ xác nhận/đã chốt” ảnh hưởng tổng đã được người dùng sửa lại; không còn áp dụng. Đồng ý “xác nhận độc lập” được hiểu theo màu nhắc riêng của công và tăng ca, không thành lifecycle approval.

## Nhân sự

- Khi thêm tên có lựa chọn ngày bắt đầu làm việc; dùng ngày được chọn, không tự lấy ngày thêm vào app.
- Các ngày trước ngày bắt đầu hiển thị `N` (new/chưa bắt đầu), phân biệt với nghỉ `F`. Từ ngày bắt đầu nhập công/tăng ca bình thường, không tự điền công.
- Có ngày kết thúc làm việc. Ngày này tính là ngày làm việc cuối cùng; các ngày sau trong tháng hiển thị `—`, không cộng tổng.
- Người đã kết thúc không tiếp tục hiện trong bảng các tháng sau; giữ nguyên dữ liệu cũ. Ví dụ xác nhận trong hội thoại: kết thúc20/10 thì21–31/10 hiển thị `—`.

## Bảng, xuất Excel và thiết bị

- Bảng tháng theo nhân sự × ngày, công và tăng ca riêng; tổng từng người và từng ngày theo cách Excel đang dùng.
- Có xuất file Excel. Bố trí một sheet với công phía trên/tăng ca phía dưới là phương án Agent đề xuất, cần người dùng review trong đặc tả.
- Người dùng đã đồng ý thiết kế UI: điện thoại cuộn ngang/dọc, giữ tên và ngày/thứ khi cuộn, phóng to/thu nhỏ bằng hai ngón, chế độ xem bảng toàn màn hình và hỗ trợ xoay ngang; chạm ô mở phần nhập dễ bấm/chọn `F`/màu.
- Desktop tận dụng màn hình rộng; nhập bằng chuột/bàn phím, Enter/Tab chuyển ô; đầy đủ thao tác cùng dữ liệu với điện thoại.
- Chỉ dẫn UI đã duyệt phải được kiểm bằng browser khi có ứng dụng; viewport giả lập chưa chứng minh cảm ứng thật trên thiết bị.

## Định hướng kỹ thuật đã có

Web app tổ chức FE và BE tách biệt, chuẩn bị API có thể phục vụ Android sau này. Chưa chọn stack/framework/DB, cách đăng nhập, hosting hoặc xây Android trong bản đầu. Pilot002 dùng Node/SQLite không quyết định công nghệ sản phẩm.
