# Đặc tả để review — Chấm công Minh Khuê phiên bản đầu

Ngày: 25/10/2026. Trạng thái: **Draft for review**. [Yêu cầu đã thống nhất](approved/requirements.md) là nguồn nghiệp vụ; phương án còn đề xuất và quyết định còn thiếu được đánh dấu rõ bên dưới. Chưa phải API/schema hoặc kế hoạch triển khai đã duyệt.

## 1. Kết quả cần đạt

Người chấm chính nhập/tổng hợp công toàn công ty; sếp xem bảng tháng quen thuộc như Excel và tự chỉnh khi cần. Thao tác đơn giản trên điện thoại, desktop đầy đủ. Cùng một dữ liệu được truy cập từ hai thiết bị; thay đổi được lưu bền vững và tính tổng đúng.

Thành công được đánh giá bằng việc thêm nhân sự, nhập/sửa công và tăng ca, đánh dấu màu để tự nhắc, xem bảng/tổng và xuất Excel đúng dữ liệu. Đặc tả này không tự mở rộng sang tính lương, GPS/nhận diện/vân tay, nhân viên tự check-in, phân bổ công trình hoặc quy trình duyệt.

## 2. Người dùng và quyền thao tác

Người chấm chính và sếp cùng quyền trên bảng toàn công ty: nhập, sửa số liệu/màu và quản lý ngày làm việc của nhân sự. Không có bước gửi duyệt hoặc mở khóa dữ liệu đã chốt. “Chốt” trong trao đổi là quyết định nhập/sửa của người dùng, không tạo trạng thái hệ thống riêng.

Cùng quyền không đồng nghĩa dùng chung một tài khoản. Cách đăng nhập và tài khoản còn phải chốt ở mục10. Audit log chưa là tính năng bắt buộc; không tự đưa màn hình lịch sử/phê duyệt vào scope.

## 3. Bảng tháng và ý nghĩa ô

Chọn tháng/năm, xem nhân sự theo dòng và ngày/thứ theo cột. Có bảng công và bảng tăng ca; tổng theo người và theo ngày ở mỗi phần, đơn vị riêng.

Mỗi ô có hai thông tin độc lập về mặt nghiệp vụ: **nội dung** và **có màu xanh nhắc kiểm tra hay không**. Hai ô công/tăng ca của cùng người/ngày không bắt buộc cùng màu. Màu không thay đổi phép tính và không ngăn chỉnh sửa.

### Công

- Số công có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`; `0,5` tương ứng một buổi. Với số lớn hơn `2,5`, chọn **Tùy chỉnh** để tự nhập. Không dùng `2,5` làm trần; nhiều công trong ngày vẫn theo chỉ đạo của sếp. Độ chính xác và giới hạn của số tùy chỉnh chưa được chốt.
- `F` nghĩa nghỉ cả ngày, không cộng công. Dùng `F` làm cách ghi thống nhất thay cho `0,0` cũ; cách xử lý khi nhập trực tiếp số0 còn cần chốt.
- `N` chỉ ngày trước khi bắt đầu làm, không cộng công; không dùng để chỉ nghỉ trong thời gian làm việc.
- `—` chỉ ngày sau khi kết thúc làm việc, không cộng công.
- Ô trống giữ là trống, không tự chuyển thành `F` hoặc tự điền1. Ô trống không cung cấp số để cộng, không chứng nhận nhân sự nghỉ.

### Tăng ca

Nhập số giờ tăng ca độc lập với số công, theo bước `0,5` giờ (nửa giờ). Chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5` giờ; số lớn hơn `2,5` giờ nhập qua **Tùy chỉnh**, vẫn theo bước `0,5` giờ. Không cần nhập bước15 phút và không dùng `2,5` làm trần giờ tăng ca. Ví dụ giả: cùng ngày có1,5 công và2 giờ tăng ca; tổng công tăng1,5 và tổng giờ tăng ca tăng2. Không có tỷ lệ quy đổi tăng ca thành công được phê duyệt.

Ngày trước khi vào làm và sau khi kết thúc tuân mốc nhân sự, không phát sinh tổng tăng ca. Trong thời gian làm việc, ngày không tăng ca để ô trống, không tự điền `0` hoặc `F`; ô trống không cộng giờ vào tổng. `F` là ký hiệu nghỉ của bảng công, không dùng làm lựa chọn không tăng ca.

### Phép cộng và màu

Tổng chỉ cộng giá trị số của đúng loại dữ liệu. Không trừ ô màu xanh khỏi tổng, không tách thêm “tổng đã xác nhận”. Ví dụ giả trên bốn ngày:1 (xanh),0,5,`F` (xanh),trống cho tổng1,5 công; màu giữ nguyên ý nghĩa nhắc người dùng. `N` và `—` không tạo công hoặc giờ tăng ca.

Lựa chọn nhanh của công/tăng ca và bước tăng ca `0,5` giờ đã được chốt; độ chính xác của số công tùy chỉnh, giới hạn và xử lý số không hợp lệ còn phải chốt trước validation API và xuất số; không lấy giới hạn ngẫu nhiên của UI làm nghiệp vụ. Giao diện cần thể hiện dấu phẩy thập phân quen thuộc; cách chấp nhận dấu chấm và độ chính xác là quyết định ở mục10.

## 4. Nhân sự và mốc làm việc

Thêm nhân sự với tên và ngày bắt đầu do người dùng chọn. Ví dụ giả thêm vào app20/10 nhưng chọn bắt đầu15/10: ngày1–14 hiển thị `N`; ngày15 trở đi có thể nhập, không tự sinh công. Không lấy thời điểm tạo bản ghi thay ngày bắt đầu.

Nếu kết thúc20/10, ngày20 vẫn nhập được; ngày21–31 hiển thị `—`, không cộng công/tăng ca. Tháng11 trở đi không tiếp tục hiện người này; bảng tháng10 và số liệu đã nhập vẫn được giữ.

**Đề xuất để review:** danh sách một tháng gồm người có khoảng làm việc giao với tháng đó; tháng bắt đầu vẫn có các ô `N` phía trước, tháng kết thúc vẫn có `—` phía sau. Không tự thêm người mới vào mọi tháng lịch sử trước tháng họ bắt đầu.

Tên hiển thị không được dùng như lý do gộp hai nhân sự trùng tên. Quy trình sửa ngày bắt đầu/kết thúc khi đã có dữ liệu và trường hợp nghỉ rồi quay lại còn chưa được thiết kế; không tự xóa dữ liệu cũ để khớp mốc ngày mới.

## 5. Thao tác trên điện thoại

Thiết kế đã được người dùng đồng ý:

- Giữ dạng bảng; cuộn ngang qua các ngày và cuộn dọc qua nhân sự.
- Giữ cột tên và hàng ngày/thứ trong tầm nhìn khi cuộn, giúp xác định đúng ô.
- Cho phép phóng to/thu nhỏ bằng hai ngón, xem bảng toàn màn hình và xoay ngang.
- Chạm một ô mở phần nhập dễ bấm; bảng công có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`, **Tùy chỉnh** cho số lớn hơn `2,5`, chọn `F` và bật/tắt màu xanh. `N`/`—` liên quan mốc ngày, không tự biến thành lựa chọn nghỉ.
- Bảng tăng ca có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5` giờ và **Tùy chỉnh** cho số lớn hơn `2,5` giờ, theo bước `0,5` giờ. Công và tăng ca đều có đủ thao tác; không giới hạn điện thoại chỉ xem.

**Đề xuất để review:** phần nhập cho biết tên người, ngày và loại công/tăng ca đang sửa, có Lưu/Hủy để hạn chế chạm nhầm. Chỉ báo đã lưu khi backend xác nhận; lỗi lưu giữ nội dung để thử lại, không giả tổng đã lưu. Đây là hành vi an toàn kỹ thuật đề xuất, chưa phải mockup hoặc màn hình đã kiểm chứng.

“Toàn màn hình” là chế độ ưu tiên không gian bảng; cách dùng browser Fullscreen API hay mở rộng trong trang phụ thuộc hỗ trợ thiết bị. Không khóa browser zoom để làm bảng trông vừa màn hình. Giữ tên/ngày khi cuộn và nhận diện ô sau zoom cần kiểm thực tế, không hứa từ CSS chưa có.

## 6. Thao tác trên máy tính

Hiển thị nhiều cột/người theo không gian màn hình; giữ định hướng dòng/cột khi cuộn. Hỗ trợ chuột, bàn phím, Enter/Tab chuyển ô, và thao tác sửa giá trị/màu tương đương điện thoại.

Hai thiết bị dùng cùng nguồn dữ liệu. Đổi tháng/refresh phải đọc lại số đã lưu và màu. Cách xử lý hai người cùng sửa một ô phải được quyết định trước triển khai để tránh âm thầm mất thay đổi; không tự suy quyền cùng sửa thành “ghi đè cuối luôn thắng”.

## 7. Xuất Excel

Có xuất file `.xlsx` cho tháng đang chọn, gồm công và tăng ca với tổng riêng. Giữ ký hiệu `F`, `N`, `—`, ô trống và màu xanh; màu không làm khác phép cộng giữa web và file.

**Đề xuất để review:** một sheet, bảng công trên và tăng ca dưới như ảnh tham khảo; có tháng/năm, ngày/thứ, tổng theo người/ngày và từng phần. Giá trị số được xuất thành ô số, ký hiệu thành chữ, ô trống được giữ trống; cần kiểm bằng ứng dụng đọc Excel thật khi triển khai.

Chưa mặc định hỗ trợ nhập ngược Excel, đồng bộ hai chiều, tính lương, file PDF hoặc công thức Excel chỉnh lại tự tính. Cách xuất tổng thành công thức hay số chụp tại thời điểm xuất cần chốt ở mục10. Không copy danh sách nhân sự thật từ ảnh vào fixture kiểm thử.

## 8. Kiến trúc ở mức định hướng

Yêu cầu đã có: web frontend và backend tách biệt, Android có thể dùng chung API về sau. Tổng và quy tắc dữ liệu cần nhất quán giữa các client; lựa chọn repository, framework, DB, contract và xác thực chưa được quyết định ở bản nghiệp vụ này.

Không tái sử dụng lựa chọn Node22/SQLite experimental của pilot như một quyết định sản phẩm. Chưa cài dependency, scaffold ứng dụng hoặc thiết kế migration theo bản này. Sau chốt nghiệp vụ và tài khoản, so sánh các phương án stack phù hợp, trình kiến trúc cụ thể trước kế hoạch thực hiện.

## 9. Tiêu chí nghiệm thu dự kiến khi có ứng dụng

AC01 — Người chấm chính và sếp đều nhập/sửa trực tiếp được; không bị buộc qua quy trình duyệt/mở lại. Kiểm quyền cả UI và API theo thiết kế tài khoản sẽ duyệt.

AC02 — Cùng ngày lưu1,5 công và2 giờ tăng ca: refresh/thiết bị khác đọc lại đúng hai giá trị và hai tổng riêng.

AC03 — Bật/tắt màu xanh của ô công không đổi giá trị/tổng hoặc màu ô tăng ca, và ngược lại; màu được giữ sau refresh và xuất Excel.

AC04 — `F`, trống, `N`, `—` hiển thị đúng ý nghĩa, không tạo số công/giờ; trống không bị đổi thành nghỉ. Ngày không tăng ca giữ ô tăng ca trống qua lưu/đọc lại và xuất Excel, không tự điền `0` hoặc `F`, không cộng giờ.

AC05 — Ngày bắt đầu do người dùng chọn tạo cách hiển thị `N` đúng trước ngày đó; ngày bắt đầu không bị tự ghi công hoặc thay bằng ngày tạo nhân sự.

AC06 — Kết thúc20/10: vẫn nhập ngày20, sau đó hiện `—`, tháng11 không tiếp tục hiện; dữ liệu tháng10 giữ nguyên.

AC07 — Bảng tháng hỗ trợ tháng28/29/30/31 ngày, hiển thị đúng thứ; tổng hàng/cột khớp dữ liệu. Chưa áp lịch nghỉ/cuối tuần thành công/nghỉ tự động.

AC08 — Điện thoại: cuộn/zoom/xoay ngang và chế độ toàn màn hình vẫn nhận diện đúng người/ngày; nhập được giá trị/màu. Desktop: đầy đủ thao tác chuột/bàn phím và Enter/Tab. Kiểm cảm ứng trên thiết bị thật riêng với viewport mô phỏng.

AC09 — Excel tháng xuất ra khớp số, ký hiệu, màu và tổng của cùng dữ liệu trên web; mở bằng ứng dụng đọc Excel để kiểm, không chỉ assert file tồn tại.

AC10 — Khi lỗi lưu không báo thành công giả, không mất bản nháp; dữ liệu qua web–API–DB thật còn sau reload. Các quyết định về xung đột, validation số và sửa mốc ngày phải có acceptance bổ sung sau khi được chốt.

AC11 — Bảng công có đủ năm lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`; chọn **Tùy chỉnh** nhập được số lớn hơn `2,5` (ví dụ3 công), lưu/đọc lại và cộng tổng đúng. Giờ tăng ca có cùng các lựa chọn nhanh nhưng đơn vị và tổng riêng; nhập tùy chỉnh3,5 giờ phải lưu/đọc lại đúng và cộng3,5 giờ, không đổi số công. Bước nhập tăng ca là0,5 giờ; không tự làm tròn số không hợp lệ khi chưa chốt cách xử lý. Validation chi tiết cho số tùy chỉnh sẽ bổ sung sau khi chốt Q1.

Các AC là tiêu chí thiết kế, **Not run**; không dùng kết quả pilot002 để đổi thành Verified.

## 10. Các quyết định còn cần chốt

Q1 — Đã chốt lựa chọn nhanh công và tăng ca `0,5; 1; 1,5; 2; 2,5`, tự nhập khi lớn hơn `2,5`; tăng ca theo bước `0,5` giờ. Còn cần chốt độ chính xác của số công tùy chỉnh, giới hạn, cách xử lý dấu phẩy/chấm và số không hợp lệ; không tự làm tròn. Có cho nhập số0 ở bảng công, và hiển thị0 hay tự chuẩn hóa `F`? Không tăng ca đã chốt để trống, không tự điền `0` hoặc `F`.

Q2 — Đồng ý dùng hai tài khoản riêng nhưng cùng quyền? Phương thức đăng nhập/khôi phục và nơi vận hành phải phù hợp nhu cầu thực tế; chưa thiết kế từ giả định có dịch vụ email/hosting.

Q3 — Nếu hai người sửa cùng một ô trước khi thấy thay đổi của nhau, lựa chọn xử lý xung đột đơn giản nào phù hợp? Đề xuất để review: báo có thay đổi mới và tải lại ô trước khi lưu tiếp; chưa tự áp dụng.

Q4 — Khi sửa mốc ngày làm việc đụng ô đã có công/tăng ca, người dùng muốn giải quyết thế nào? Cần làm rõ trước khi cho phép thay mốc gây loại dữ liệu. Trường hợp nghỉ/quay lại chưa được yêu cầu; không tự thêm nhiều hợp đồng/giai đoạn vào bản đầu.

Q5 — Xác nhận đề xuất một sheet với hai bảng, và tổng xuất là số tại thời điểm xuất hay công thức để tiếp tục sửa Excel? Có cần bản đầu hiển thị hai bảng liên tiếp trên web như Excel, hay chuyển qua lại giữa công/tăng ca để tiết kiệm màn hình? Chưa chốt UI bằng file mockup.

Q6 — Quy mô dự kiến (số nhân sự) và nhóm điện thoại/trình duyệt chính để đặt yêu cầu hiệu năng/bộ nhớ và xác minh zoom, sticky, nhập cảm ứng.

Các câu hỏi này không chặn việc ghi nhận yêu cầu/UX đã thống nhất. Chúng chặn phần kiến trúc/validation/contract hoặc thiết kế chi tiết tương ứng; không gọi bản này là spec đủ để Agent tự triển khai sản phẩm ngay.
