# Đặc tả để review — Chấm công Minh Khuê phiên bản đầu

Ngày lập:25/10/2026; cập nhật28/10/2026. Trạng thái: **Đã tổng hợp và tự review; chờ người dùng review bản đặc tả viết**. [Yêu cầu đã thống nhất](approved/requirements.md) là nguồn nghiệp vụ; phương án còn đề xuất và quyết định còn thiếu được đánh dấu rõ bên dưới. Chưa phải API/schema hoặc kế hoạch triển khai đã duyệt.

## 1. Kết quả cần đạt

Người chấm chính nhập/tổng hợp công toàn công ty; sếp xem bảng tháng quen thuộc như Excel và tự chỉnh khi cần. Thao tác đơn giản trên điện thoại, desktop đầy đủ. Cùng một dữ liệu được truy cập từ hai thiết bị; thay đổi được lưu bền vững và tính tổng đúng.

Thành công được đánh giá bằng việc thêm nhân sự, nhập/sửa công và tăng ca, đánh dấu màu để tự nhắc, xem bảng/tổng và xuất Excel đúng dữ liệu. Đặc tả này không tự mở rộng sang tính lương, GPS/nhận diện/vân tay, nhân viên tự check-in, phân bổ công trình hoặc quy trình duyệt.

## 2. Người dùng và quyền thao tác

Người chấm chính và sếp cùng quyền trên bảng toàn công ty: nhập, sửa số liệu/màu và quản lý ngày làm việc của nhân sự. Không có bước gửi duyệt hoặc mở khóa dữ liệu đã chốt. “Chốt” trong trao đổi là quyết định nhập/sửa của người dùng, không tạo trạng thái hệ thống riêng.

Đã thống nhất hai tài khoản riêng cho người chấm chính và sếp, cùng quyền xem, nhập và sửa dữ liệu chấm công toàn công ty. Đã chốt hai tài khoản tạo sẵn, tên đăng nhập + mật khẩu, không có đăng ký công khai. Khi quên mật khẩu, người phụ trách vận hành xác minh và đặt lại; bản đầu chưa cần luồng email/SMS. Audit log chưa là tính năng bắt buộc; không tự đưa màn hình lịch sử/phê duyệt vào scope.

## 3. Bảng tháng và ý nghĩa ô

Quy mô hiện tại khoảng20 người mỗi tháng, có thể tăng nhiều về sau; chưa xác định trần hoặc số lượng mục tiêu tương lai. Thiết kế cần xét danh sách dài hơn, không lấy20 làm giới hạn hoặc tự quyết định phân trang/ảo hóa khi chưa phân tích.

Chọn tháng/năm, xem nhân sự theo dòng và ngày/thứ theo cột. Có bảng công và bảng tăng ca; tổng theo người và theo ngày ở mỗi phần, đơn vị riêng.

Mỗi ô có hai thông tin độc lập về mặt nghiệp vụ: **nội dung** và **có màu xanh nhắc kiểm tra hay không**. Hai ô công/tăng ca của cùng người/ngày không bắt buộc cùng màu. Màu không thay đổi phép tính và không ngăn chỉnh sửa.

### Công

- Số công có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`; `0,5` tương ứng một buổi. Với số lớn hơn `2,5`, chọn **Tùy chỉnh** để tự nhập. Không dùng `2,5` làm trần; nhiều công trong ngày vẫn theo chỉ đạo của sếp. Số công tùy chỉnh chỉ theo bước `0,5`; tối đa **30 công mỗi ô**, không phải tổng tháng.
- `F` nghĩa nghỉ cả ngày, không cộng công. Dùng `F` làm cách ghi thống nhất thay cho `0,0` cũ; nhập trực tiếp số0 công tự chuyển thành `F`, cả một ô và nhập vùng. Giữ màu nhắc riêng, không cộng công.
- `N` chỉ ngày trước khi bắt đầu làm, không cộng công; không dùng để chỉ nghỉ trong thời gian làm việc.
- `—` chỉ ngày sau khi kết thúc làm việc, không cộng công.
- Ô trống giữ là trống, không tự chuyển thành `F` hoặc tự điền1. Ô trống không cung cấp số để cộng, không chứng nhận nhân sự nghỉ.

### Tăng ca

Nhập số giờ tăng ca độc lập với số công, theo bước `0,5` giờ (nửa giờ). Chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5` giờ; số lớn hơn `2,5` giờ nhập qua **Tùy chỉnh**, vẫn theo bước `0,5` giờ. Không cần nhập bước15 phút; trần là **24 giờ mỗi ô**, không dùng `2,5` làm trần giờ tăng ca. Ví dụ giả: cùng ngày có1,5 công và2 giờ tăng ca; tổng công tăng1,5 và tổng giờ tăng ca tăng2. Không có tỷ lệ quy đổi tăng ca thành công được phê duyệt.

Ngày trước khi vào làm và sau khi kết thúc tuân mốc nhân sự, không phát sinh tổng tăng ca. Trong thời gian làm việc, ngày không tăng ca để ô trống, không tự điền `0` hoặc `F`; ô trống không cộng giờ vào tổng. `F` là ký hiệu nghỉ của bảng công, không dùng làm lựa chọn không tăng ca.

### Phép cộng và màu

Tổng chỉ cộng giá trị số của đúng loại dữ liệu. Không trừ ô màu xanh khỏi tổng, không tách thêm “tổng đã xác nhận”. Ví dụ giả trên bốn ngày:1 (xanh),0,5,`F` (xanh),trống cho tổng1,5 công; màu giữ nguyên ý nghĩa nhắc người dùng. `N` và `—` không tạo công hoặc giờ tăng ca.

Lựa chọn nhanh của công/tăng ca và bước tăng ca `0,5` giờ đã được chốt; số công tùy chỉnh cũng theo bước `0,5`; trần công30 và tăng ca24 giờ mỗi ô đã chốt. Nhận dấu phẩy hoặc dấu chấm thập phân, hiển thị dấu phẩy. Sai bước/vượt trần báo lỗi, giữ input/draft, không ghi dữ liệu hoặc tự làm tròn/cắt về trần. Áp cho một ô và nhập vùng; validation API còn phải triển khai/kiểm, không lấy UI làm bằng chứng server enforce.

## 4. Nhân sự và mốc làm việc

Thêm nhân sự với tên và ngày bắt đầu do người dùng chọn. Ví dụ giả thêm vào app20/10 nhưng chọn bắt đầu15/10: ngày1–14 hiển thị `N`; ngày15 trở đi có thể nhập, không tự sinh công. Không lấy thời điểm tạo bản ghi thay ngày bắt đầu.

Nếu kết thúc20/10, ngày20 vẫn nhập được; ngày21–31 hiển thị `—`, không cộng công/tăng ca. Tháng11 trở đi không tiếp tục hiện người này; bảng tháng10 và số liệu đã nhập vẫn được giữ.

**Đề xuất để review:** danh sách một tháng gồm người có khoảng làm việc giao với tháng đó; tháng bắt đầu vẫn có các ô `N` phía trước, tháng kết thúc vẫn có `—` phía sau. Không tự thêm người mới vào mọi tháng lịch sử trước tháng họ bắt đầu.

Tên hiển thị không được dùng như lý do gộp hai nhân sự trùng tên. Đã chốt: chặn đổi ngày bắt đầu/kết thúc nếu mốc mới loại ô đã nhập công/tăng ca; chỉ rõ người/ngày/loại bảng của các ô cần xử lý, giữ nguyên mốc và dữ liệu cũ. Phải xét dữ liệu liên quan ở mọi tháng, không chỉ bảng đang xem. Trường hợp nghỉ rồi quay lại chưa được yêu cầu; ô trống có màu nhắc cũng chặn đổi mốc nếu bị loại, chỉ rõ để xử lý trước và không tự xóa nhắc.

## 5. Thao tác trên điện thoại

**Quy trình thiết kế đã thống nhất:** Impeccable chủ đạo, UI UX Pro Max bổ trợ. Người dùng đã chọn hướng C (một bảng lớn, chuyển Công/Tăng ca), chấp nhận phối xanh làm cơ sở và chốt luồng nhập vùng. [Brief UI](ui/BRIEF.md), [bản C hiện hành](ui/attendance-c.html) và [brief nhập vùng](ui/bulk-entry-design.md) ghi quyết định/cách thể hiện; [khảo sát A/B/C](ui/attendance-concepts.html) chỉ là lịch sử. Bản mẫu đã kiểm DOM/headless, chưa chứng minh thao tác iPhone/Android thật hoặc các màn hình đăng nhập/nhân sự/Excel chưa dựng. Chi tiết trạng thái tại mục12 và validation. PRODUCT.md/DESIGN.md ở root vẫn thuộc pilot.

Thiết kế đã được người dùng đồng ý:

- Hỗ trợ cả iPhone và Android; chưa chốt mẫu máy/phiên bản/trình duyệt cụ thể. Các khác biệt cuộn, zoom, bàn phím và không gian hiển thị phải được xét trong thiết kế và kế hoạch kiểm chứng.
- Giữ dạng bảng; cuộn ngang qua các ngày và cuộn dọc qua nhân sự.
- Giữ cột tên và hàng ngày/thứ trong tầm nhìn khi cuộn, giúp xác định đúng ô.
- Cho phép phóng to/thu nhỏ bằng hai ngón, xem bảng toàn màn hình và xoay ngang.
- Chạm một ô mở phần nhập dễ bấm; bảng công có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`, **Tùy chỉnh** cho số lớn hơn `2,5`, chọn `F` và bật/tắt màu xanh. `N`/`—` liên quan mốc ngày, không tự biến thành lựa chọn nghỉ.
- Bảng tăng ca có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5` giờ và **Tùy chỉnh** cho số lớn hơn `2,5` giờ, theo bước `0,5` giờ. Công và tăng ca đều có đủ thao tác; không giới hạn điện thoại chỉ xem.

**Đề xuất để review:** phần nhập cho biết tên người, ngày và loại công/tăng ca đang sửa, có Lưu/Hủy để hạn chế chạm nhầm. Chỉ báo đã lưu khi backend xác nhận; lỗi lưu giữ nội dung để thử lại, không giả tổng đã lưu. Đây là hành vi an toàn kỹ thuật đề xuất, chưa phải mockup hoặc màn hình đã kiểm chứng.

“Toàn màn hình” là chế độ ưu tiên không gian bảng; cách dùng browser Fullscreen API hay mở rộng trong trang phụ thuộc hỗ trợ thiết bị. Không khóa browser zoom để làm bảng trông vừa màn hình. Giữ tên/ngày khi cuộn và nhận diện ô sau zoom cần kiểm thực tế, không hứa từ CSS chưa có.

## 6. Thao tác trên máy tính

Hiển thị nhiều cột/người theo không gian màn hình; giữ định hướng dòng/cột khi cuộn. Hỗ trợ chuột, bàn phím, Enter/Tab chuyển ô, và thao tác sửa giá trị/màu tương đương điện thoại.

Hai thiết bị dùng cùng nguồn dữ liệu. Đổi tháng/refresh phải đọc lại số đã lưu và màu. Khi hai người cùng mở bảng, tự cập nhật dữ liệu đã lưu khoảng mỗi15 giây, giữ nguyên bản nháp đang nhập; không hứa tức thời hoặc bỏ kiểm xung đột. Đã thống nhất: nếu hai người sửa cùng một ô dựa trên dữ liệu cũ, người lưu sau nhận thông báo ô đã thay đổi và được xem giá trị mới trước khi quyết định sửa tiếp. Không âm thầm ghi đè thay đổi vừa lưu của người kia. Ví dụ giả: người chấm lưu1,5 công trong lúc sếp đang nhập2 công từ dữ liệu cũ; lần lưu của sếp phải báo thay đổi trước khi sếp quyết định sửa tiếp. Cơ chế kỹ thuật phát hiện xung đột sẽ xác định trong thiết kế API; không tạo bước xin duyệt hoặc khóa quyền sửa.

## 7. Xuất Excel

Có xuất file `.xlsx` cho tháng đang chọn, gồm công và tăng ca với tổng riêng. Giữ ký hiệu `F`, `N`, `—`, ô trống và màu xanh; màu không làm khác phép cộng giữa web và file.

**Đã duyệt:** một sheet, bảng Công trên và Tăng ca dưới; các tổng dùng công thức để tiếp tục sửa trong Excel. Chi tiết trình bày đề xuất: có tháng/năm, ngày/thứ, tổng theo người/ngày và từng phần. Giá trị số được xuất thành ô số, ký hiệu thành chữ, ô trống được giữ trống; cần kiểm bằng ứng dụng đọc Excel thật khi triển khai.

Đã chốt tổng bằng công thức, tính riêng trong từng bảng; ký hiệu F/N/— và ô trống không được cộng thành công/giờ, màu nhắc không ảnh hưởng phép cộng. Sửa số trong file phải tính lại tổng theo người/ngày và tổng từng phần. Chưa mặc định hỗ trợ nhập ngược Excel, đồng bộ hai chiều, tính lương hoặc file PDF. Không copy danh sách nhân sự thật từ ảnh vào fixture kiểm thử.

## 8. Kiến trúc ở mức định hướng

Yêu cầu đã có: web frontend và backend tách biệt, Android có thể dùng chung API về sau. Tổng và quy tắc dữ liệu cần nhất quán giữa các client. Đã chốt FE/BE tách ứng dụng trong cùng repository, shadcn/ui nền Radix và code theo feature/module tại [ADR-001](../../architecture/decisions/ADR-001-product-foundation.md). [Kiến trúc](../../architecture/ARCHITECTURE.md), [chuẩn code](../../architecture/CODE_CONVENTIONS.md), [hệ UI](../../architecture/UI_SYSTEM.md) và [nguyên tắc API](../../architecture/API_CONTRACTS.md) là nguồn hiện hành. Theo [ADR-002](../../architecture/decisions/ADR-002-state-management.md), TanStack Query quản lý dữ liệu API, state React giữ thao tác/bản nháp, Zustand có điều kiện; chưa cài. [Bản kiến trúc cụ thể](technical/architecture-proposal.md) trình stack/cây source/luồng chi tiết để review. Framework/backend/DB và bộ công cụ mục tiêu đã chốt tiếp nối tại [ADR-003](../../architecture/decisions/ADR-003-product-stack.md): React/Vite + NestJS/Express + PostgreSQL/Prisma. Phiên bản, contract/schema và cơ chế auth/session chi tiết chưa chốt; tên đăng nhập/mật khẩu và quy trình khôi phục qua vận hành đã chốt; công cụ enforce sản phẩm chưa cài.

Không tái sử dụng lựa chọn Node22/SQLite experimental của pilot như một quyết định sản phẩm. Chưa cài dependency, scaffold ứng dụng hoặc thiết kế migration theo bản này. Tiếp theo review bản đặc tả viết và các đề xuất còn ghi rõ trước kế hoạch thực hiện; tái sử dụng lựa chọn stack đã duyệt.

## 9. Tiêu chí nghiệm thu dự kiến khi có ứng dụng

AC01 — Người chấm chính và sếp dùng hai tài khoản riêng, cùng quyền xem, nhập/sửa trực tiếp dữ liệu chấm công toàn công ty; không bị buộc qua quy trình duyệt/mở lại. Đăng nhập bằng tên đăng nhập + mật khẩu của hai tài khoản tạo sẵn; không có đăng ký công khai. Kiểm quyền cả UI và API, từ chối truy cập dữ liệu khi chưa đăng nhập. Khôi phục qua người phụ trách vận hành xác minh/đặt lại đã chốt; thư viện auth/phiên và cơ chế đặt lại cụ thể chưa chọn; kiểm sản phẩm Not run.

AC02 — Cùng ngày lưu1,5 công và2 giờ tăng ca: refresh/thiết bị khác đọc lại đúng hai giá trị và hai tổng riêng.

AC03 — Bật/tắt màu xanh của ô công không đổi giá trị/tổng hoặc màu ô tăng ca, và ngược lại; màu được giữ sau refresh và xuất Excel.

AC04 — `F`, trống, `N`, `—` hiển thị đúng ý nghĩa, không tạo số công/giờ; trống không bị đổi thành nghỉ. Ngày không tăng ca giữ ô tăng ca trống qua lưu/đọc lại và xuất Excel, không tự điền `0` hoặc `F`, không cộng giờ.

AC05 — Ngày bắt đầu do người dùng chọn tạo cách hiển thị `N` đúng trước ngày đó; ngày bắt đầu không bị tự ghi công hoặc thay bằng ngày tạo nhân sự.

AC06 — Kết thúc20/10: vẫn nhập ngày20, sau đó hiện `—`, tháng11 không tiếp tục hiện; dữ liệu tháng10 giữ nguyên.

AC07 — Bảng tháng hỗ trợ tháng28/29/30/31 ngày, hiển thị đúng thứ; tổng hàng/cột khớp dữ liệu. Chưa áp lịch nghỉ/cuối tuần thành công/nghỉ tự động.

AC08 — Điện thoại: cuộn/zoom/xoay ngang và chế độ toàn màn hình vẫn nhận diện đúng người/ngày; nhập được giá trị/màu. Desktop: đầy đủ thao tác chuột/bàn phím và Enter/Tab. Kiểm cảm ứng trên cả iPhone và Android thật, ghi rõ thiết bị/trình duyệt, riêng với viewport mô phỏng; chưa có thiết bị thì ghi Not run cho phần tương ứng.

AC09 — Excel tháng có một sheet, bảng Công trên/Tăng ca dưới; số, ký hiệu, màu và tổng ban đầu khớp cùng dữ liệu đã lưu trên web. Tổng theo người/ngày/từng phần dùng công thức, độc lập đơn vị. Mở bằng ứng dụng đọc Excel thật, sửa một ô số và kiểm tổng tương ứng tính lại, bảng còn lại không đổi; F/N/—/trống không cộng số, màu nhắc không loại giá trị khỏi tổng. Kiểm công thức và kết quả thực, không chỉ file tồn tại. Not run, chưa có bộ xuất sản phẩm.

AC10 — Khi lỗi lưu không báo thành công giả, không mất bản nháp; dữ liệu qua web–API–DB thật còn sau reload. Validation số, sửa mốc ngày và cập nhật nền có acceptance bổ sung AC14–AC20, đều cần kiểm trên sản phẩm.

AC11 — Bảng công có đủ năm lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`; chọn **Tùy chỉnh** nhập được số lớn hơn `2,5` (ví dụ3 công), lưu/đọc lại và cộng tổng đúng. Giờ tăng ca có cùng các lựa chọn nhanh nhưng đơn vị và tổng riêng; nhập tùy chỉnh3,5 giờ phải lưu/đọc lại đúng và cộng3,5 giờ, không đổi số công. Bước nhập tăng ca là0,5 giờ; sai bước báo lỗi, giữ draft và không tự làm tròn. Số công tùy chỉnh cũng chỉ bước0,5:3/3,5 hợp lệ,3,25 không hợp lệ, không tự làm tròn; áp dụng cho một ô và nhập vùng. Định dạng và xử lý lỗi theo Q1 đã chốt; API validation chưa triển khai.

AC12 — Hai phiên đăng nhập đọc cùng một ô: phiên thứ nhất lưu1,5 công, phiên thứ hai thử lưu2 công từ dữ liệu cũ. Phiên thứ hai phải nhận thông báo ô đã thay đổi và thấy giá trị1,5 mới; lần lưu đó không âm thầm thay thành2. Người dùng vẫn có thể quyết định sửa tiếp sau khi xem giá trị mới, không qua duyệt.

Các AC là tiêu chí thiết kế, **Not run**; không dùng kết quả pilot002 để đổi thành Verified.

## 10. Quyết định đã chốt và chi tiết cần hoàn thiện

Q1 — Đã chốt lựa chọn nhanh công và tăng ca `0,5; 1; 1,5; 2; 2,5`, tự nhập khi lớn hơn `2,5`; tăng ca theo bước `0,5` giờ. Đã chốt số công tùy chỉnh cũng chỉ bước `0,5`. Đã chốt trần30 công mỗi ô, không giới hạn tổng tháng theo số30. Đã chốt trần24 giờ tăng ca mỗi ô. Đã chốt nhận dấu phẩy/chấm, hiển thị dấu phẩy; sai bước/vượt trần báo lỗi, giữ nội dung nhập và không tự làm tròn. Đã chốt nhập số0 công tự chuẩn hóa thành `F`. Không tăng ca đã chốt để trống, không tự điền `0` hoặc `F`.

Q2 — Đã thống nhất hai tài khoản riêng, cùng quyền xem, nhập và sửa. Đã chốt tên đăng nhập + mật khẩu, hai tài khoản tạo sẵn, không đăng ký công khai. Đã chốt khôi phục qua người phụ trách vận hành xác minh và đặt lại; bản đầu chưa cần email/SMS. Danh tính người phụ trách, quy trình xác minh/bàn giao mật khẩu và hạ tầng cần cụ thể hóa trước vận hành, không tự thêm role/màn hình admin hoặc giả định có dịch vụ email/hosting.

Q3 — Đã chốt: khi hai người sửa cùng một ô từ dữ liệu cũ, báo người lưu sau và hiển thị giá trị mới để quyết định sửa tiếp; không âm thầm ghi đè. Đã chốt tự cập nhật khoảng15 giây và giữ draft; cơ chế kỹ thuật thuộc bước thiết kế API/client, chưa triển khai.

Q4 — Đã chốt: chặn đổi mốc nếu loại ô đã nhập công/tăng ca, chỉ rõ ô liên quan để xử lý trước, giữ mốc cũ/dữ liệu. Ô trống chỉ có reminder cũng được bảo vệ: chặn đổi mốc, chỉ rõ ô và giữ nguyên lời nhắc. Trường hợp nghỉ/quay lại chưa được yêu cầu; không tự thêm nhiều hợp đồng/giai đoạn vào bản đầu.

Q5 — Đã chốt một sheet, Công trên/Tăng ca dưới, tổng dùng công thức để tiếp tục sửa trong Excel. Web vẫn hướng C, một bảng lớn và chuyển loại; phối xanh đã được chấp nhận làm cơ sở. Layout Excel chi tiết và tương thích ứng dụng đọc cần review/kiểm khi triển khai, không dùng HTML làm bằng chứng xuất file.

Q6 — Đã biết hiện tại khoảng20 người mỗi tháng, sau này có thể tăng nhiều; chưa có số lượng mục tiêu tương lai. Đã xác nhận dùng cả iPhone và Android; mẫu máy/phiên bản/trình duyệt cụ thể chưa xác định và sẽ ghi rõ trong kế hoạch kiểm chứng. Thiết kế phải xét cả hai nhóm khi xử lý zoom, sticky và nhập cảm ứng. Mốc hiệu năng/quy mô kiểm thử sẽ đề xuất rõ khi có kiến trúc, không tự coi20 là trần hoặc hứa hỗ trợ không giới hạn.

Các quyết định nghiệp vụ trên đã đủ để review phạm vi bản viết; các chi tiết kỹ thuật/vận hành còn mở phải thành task có acceptance và gate tương ứng trong kế hoạch. Bản này chưa cho phép Agent tự triển khai sản phẩm ngay.

## 11. Bổ sung nhập vùng để review — 27/10/2026

Người dùng chấp nhận phối xanh hiện tại làm cơ sở tiếp tục, chốt hai chế độ điền trống/ghi đè và đồng ý luồng chọn vùng → giá trị → chế độ → số ô → Áp dụng, bỏ qua N/— và báo số bỏ qua. Điện thoại Chọn nhiều mặc định chạm thêm/bỏ ô rời; chế độ Vùng chữ nhật dùng chạm hai đầu, Thêm vùng để hợp thêm vùng. [Brief nhập vùng](ui/bulk-entry-design.md) ghi tương tác và ranh giới; HTML đã có bản mẫu trong bộ nhớ, chưa có API/lưu thật. Nhập hàng loạt giữ màu nhắc riêng từng ô, tổng công/giờ độc lập.

Acceptance bổ sung cho sản phẩm (Not run): vùng chỉ tác động dòng/ngày đang chọn; điền trống giữ dữ liệu có sẵn, ghi đè chỉ tác động ô hợp lệ; N/— bị bỏ qua và có số đếm; chọn/chỉnh draft chưa lưu dữ liệu; đổi ngữ cảnh không áp nhầm người/đơn vị. Đã kiểm các hành vi tương ứng bằng DOM/pointer tổng hợp của prototype, không đổi AC sản phẩm thành Verified. Đã chốt: một ô xung đột thì dừng cả vùng, không ghi ô nào, giữ draft và chỉ rõ các ô xung đột; không tự thử lại ghi đè. Phục hồi sau lỗi mạng và cảnh báo ghi đè vẫn cần thiết kế trước contract/implementation plan.


AC13 — Hai phiên cùng đọc một vùng, phiên A sửa một ô rồi phiên B lưu vùng từ dữ liệu cũ. Lần lưu của B phải bị từ chối toàn bộ: không ô nào trong tập áp dụng bị thay bởi lần lưu này, kể cả ô không xung đột; dữ liệu A giữ nguyên. UI giữ vùng/giá trị/chế độ của draft và chỉ rõ ô xung đột cùng dữ liệu mới để kiểm tra. Không tự retry/force-write. Kiểm API/DB và hai phiên thật: **Not run**; HTML bộ nhớ không chứng minh AC này.


AC14 — Nhập0 công cho một ô hoặc vùng phải hiển thị/lưu thành F, không cộng công, giữ reminder và không đổi tăng ca. Điền trống vẫn giữ ô đã có dữ liệu, ghi đè chỉ áp lên ô hợp lệ; N/— vẫn bỏ qua. Không chuyển0 tăng ca thành F. Kiểm API/DB/lưu đọc lại: Not run; prototype chỉ kiểm trong bộ nhớ.


AC15 — Nhân sự có dữ liệu công hoặc tăng ca ngoài khoảng làm việc được đề nghị (kể cả ở tháng khác). Lưu mốc phải bị từ chối, chỉ rõ ô liên quan; mốc cũ, nội dung/màu và tổng theo mốc cũ giữ nguyên. Thử riêng đổi ngày vào và ngày nghỉ, công số/F, tăng ca và ô trống có reminder ở mỗi loại bảng; không bỏ qua F hoặc reminder-only chỉ vì không cộng tổng. Request lưu ô hoặc bật reminder đồng thời với sửa mốc không được tạo dữ liệu ngoài khoảng hợp lệ hoặc làm mất lời nhắc. API/DB/luồng sửa nhân sự: **Not run**, prototype hiện chưa có màn hình sửa mốc.


AC16 — Nhập công29,5 và30 được nhận;30,5/31 bị từ chối, giữ draft và không ghi bất kỳ ô nào. Áp cùng quy tắc cho nhập một ô/nhập vùng, không tự làm tròn/cắt về30. Không áp30 thành giới hạn tổng tháng hoặc trần tăng ca. Kiểm API/DB/lưu đọc lại: Not run.


AC17 — Nhập tăng ca23,5/24 giờ được nhận;24,5/25 bị từ chối, giữ draft và không ghi dữ liệu, không tự làm tròn/cắt về24. Áp một ô/nhập vùng, không đổi công; công vẫn có trần riêng30. API/DB/lưu đọc lại: Not run.


AC18 — Với cùng số công/giờ hợp lệ, nhập3,5 hoặc3.5 phải cho giá trị số bằng nhau và hiển thị3,5. Nhập3,25/3.25 hoặc giá trị vượt trần tương ứng phải báo lỗi, giữ chuỗi người dùng nhập để sửa, không ghi bất kỳ ô nào hay tự làm tròn. Kiểm cho một ô và vùng; API/DB và tải lại dữ liệu sản phẩm: Not run.


AC19 — Quên mật khẩu được xử lý qua người phụ trách vận hành xác minh và đặt lại đúng tài khoản; không yêu cầu email/SMS để hoàn tất luồng bản đầu. Không cung cấp khả năng đặt lại trái phép hoặc tự thêm quyền quản trị cho hai tài khoản chấm công. Quy trình xác minh, bàn giao thông tin và xử lý phiên sau đặt lại cần thiết kế/kiểm trước vận hành; kiểm thực thi auth: Not run.


AC20 — Hai phiên cùng mở bảng tháng: một phiên lưu giá trị hoặc màu, phiên kia nhận dữ liệu mới theo chu kỳ tự cập nhật khoảng15 giây khi đang hoạt động và kết nối bình thường. Draft giá trị/màu hoặc vùng của phiên nhận không bị mất hay thay bằng dữ liệu nền; lưu từ phiên bản cũ vẫn kiểm xung đột. Lỗi mạng hoặc tab bị hạn chế không được báo đã đồng bộ giả; kết nối/trở lại tab cần phục hồi tải theo thiết kế. Kiểm hai phiên web–API–DB: Not run; HTML một trang không chứng minh AC này.

## 12. Phạm vi review bản đặc tả28/10/2026

| Nhóm | Trạng thái và phạm vi |
| --- | --- |
| Nghiệp vụ đã duyệt | Công/giờ độc lập, màu nhắc không đổi tổng; công0 thành F, bước0,5, trần30 công/24 giờ mỗi ô, dấu phẩy/chấm và giữ input lỗi; nhập ô/vùng rời và kéo điền lặp, hai chế độ, đếm ô trước Áp dụng, bỏ N/—; xung đột dừng cả vùng; đổi mốc bảo vệ nội dung và nhắc; Excel một sheet/tổng công thức; hai tài khoản tên/mật khẩu, khôi phục qua vận hành; cập nhật khoảng15 giây giữ draft |
| Kiến trúc đã duyệt | ADR-001/002/003 là nền tảng/state/stack mục tiêu, chưa pin/cài/kiểm tương thích |
| Đề xuất trình review cùng bản viết | Danh sách tháng theo khoảng làm việc giao tháng; editor ghi người/ngày/loại và Lưu/Hủy; điền trống xét nội dung rỗng, mặc định điền trống, nhập vùng giữ reminder; guard khi đổi ngữ cảnh |
| Đã dựng/đã kiểm | HTML C độc lập với dữ liệu giả, tương tác bộ nhớ; các assertions/contrast/headless trong validation. Không coi toàn bộ AC01–AC23 sản phẩm đã đạt |
| Thiết kế tiếp theo trong kế hoạch | Contract/request/response/revision/transaction, schema/migration, phiên bản tương thích, auth/session/reset cụ thể, phục hồi sau timeout và cảnh báo ghi đè; UI các màn hình còn thiếu, layout Excel chi tiết, accessibility/thiết bị/hiệu năng |
| Điều kiện trước vận hành | Target hosting/domain/TLS, backup/restore, người phụ trách và quy trình reset thực tế, danh sách thiết bị kiểm; chưa chọn hoặc được quyền thao tác hệ thống thật |

Bản review này chốt phạm vi/nghiệp vụ và các đề xuất được nêu rõ khi người dùng duyệt toàn bộ bản viết; không tự duyệt chi tiết API/schema chưa có. Kế hoạch triển khai sau đó phải chia các bước thiết kế kỹ thuật cần review, cài đặt có quyền và kiểm chứng theo risk; chưa có quyền scaffold/code sản phẩm, tích hợp primary, dispatch child, push hoặc deploy. Không thêm import Excel, tính lương, quy trình duyệt, offline hoặc nhiều giai đoạn nghỉ/quay lại vào bản đầu.


## 13. Chọn ô/vùng rời và kéo điền lặp — bổ sung28/10/2026

Đã duyệt chọn rời qua nhiều người/ngày trong tháng hiện tại: Ctrl/Cmd + bấm để thêm/bỏ ô, Ctrl/Cmd + kéo để hợp thêm vùng; các phần giao nhau không bị đếm/ghi nhiều lần. Trên điện thoại, Chọn nhiều mặc định Ô rời; có Vùng chữ nhật và Thêm vùng để chọn bằng hai đầu. Các ô nằm giữa các điểm rời không được tự đưa vào tập áp dụng. Mẫu chỉ chọn dòng đang hiển thị; đổi lọc/loại bảng qua guard nếu có draft, rồi bỏ chọn cũ để không áp nhầm người/đơn vị.

Kéo tay nắm của ô đã lưu có số/F tạo draft điền lặp đúng giá trị nguồn; không suy dãy tăng dần. Cách thay thế: chọn nguồn → Điền từ ô này → chạm ô cuối. Cách thể hiện của mẫu: nguồn không bị ghi lại, không sao chép màu nhắc; giữ màu của từng đích, đếm đích theo fill/replace, Áp dụng mới ghi. Nguồn trống/không hợp lệ/bị ẩn không khởi tạo fill. Chi tiết revision của nguồn chỉ đọc và nguồn thay đổi trong lúc thao tác cần review trong contract; không dùng mẫu bộ nhớ để quyết định concurrency thật.

AC21 — Chọn ba ô không liền nhau rồi áp dụng chỉ thay ba ô đó; bỏ chọn một ô còn hai. Hợp vùng trùng không nhân số ô/tổng hoặc ghi lặp. Kiểm cả Ctrl/Cmd + bấm/kéo, điện thoại chạm, bàn phím và nhiều nhân sự/ngày; không đặt giới hạn số ô chọn riêng ngoài phạm vi dữ liệu/khả năng kiểm chứng. AC sản phẩm: Not run.

AC22 — Kéo điền từ ô nguồn số hoặc F, cả hai hướng, phải điền lặp giá trị; nguồn/nội dung màu không bị thay, nhắc của đích không bị sao chép/xóa. Chọn/kéo chưa ghi; Hủy/Esc/pointercancel không đổi dữ liệu; hai chế độ và N/—/giới hạn/bảo vệ draft vẫn áp dụng. Có thao tác không kéo. Kiểm lưu thật và touch thật: Not run; phạm vi prototype tại validation.

Bổ sung này thay phần giới hạn chỉ một chữ nhật của checkpoint trước. Bản đặc tả viết gồm cả mục13 vẫn chờ người dùng review trước implementation plan; xác nhận feature không tự duyệt tất cả chi tiết kỹ thuật hoặc cấp quyền triển khai sản phẩm.


## 14. Kéo cảm ứng bằng nhấn giữ — bổ sung28/10/2026

Đã duyệt giữ450ms trên ô để kéo chọn, trên tay nắm nguồn để kéo điền; di chuyển quá10px trước đó thì hủy chờ kích hoạt và giữ cuộn bình thường. Không cần bật chế độ riêng. Khi kích hoạt có viền bảng/ô và thông báo; thả chỉ xem trước. Trong Chọn nhiều, giữ/kéo hợp thêm vùng với các ô đã chọn; không bỏ chọn ô vừa giữ khi thả. Hai ngón/hủy gesture/mất focus hủy kéo và khôi phục lựa chọn trước; bản nháp có thay đổi phải được bảo vệ trước khi bắt đầu. Tay nắm cảm ứng có vùng chạm44px; cách chạm chọn hai đầu và nút Điền từ ô này tiếp tục dùng được.

AC23 — Trên iPhone và Android: vuốt ngay theo cả hai chiều không chọn ô hoặc điền dữ liệu; giữ450ms rồi kéo chọn đúng tập đích, giữ tay nắm kéo điền lặp số/F và tăng ca độc lập. Kích hoạt có dấu hiệu, thả chưa ghi, Áp dụng mới ghi; hủy/đa điểm/đổi ngữ cảnh không mất draft hoặc ghi nhầm. Kiểm hành vi sát ngưỡng10px, cuộn sát mép và pinch zoom. AC sản phẩm và thiết bị thật: Not run; chỉ các sự kiện tổng hợp trong prototype được kiểm ở validation.

Mục này thay giới hạn không hỗ trợ kéo cảm ứng của bản mẫu trước. Không thay quyền triển khai sản phẩm hoặc gate review toàn bộ bản viết.
