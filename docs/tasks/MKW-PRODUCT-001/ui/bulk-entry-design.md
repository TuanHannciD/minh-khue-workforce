# Chọn vùng và nhập hàng loạt — luồng và bản mẫu

Ngày27/10/2026; cập nhật28/10/2026. Trạng thái hiện hành: **bản mẫu được chấp nhận, toàn bộ design.md và các đề xuất đã duyệt**, gồm trống xét nội dung, mặc định điền trống, giữ nhắc và guard ngữ cảnh. Contract/lưu thật vẫn cần thiết kế/review trong kế hoạch; không claim persistence hoặc trusted touch đã kiểm. Các phần chờ review ở checkpoint dưới là lịch sử.

Trạng thái tại checkpoint ban đầu: **luồng chọn/nhập và bỏ qua N/— đã xác nhận; đã dựng bản mẫu HTML, chờ review thao tác**. Nguồn: [requirements](../approved/requirements.md); tiếp nối [bản C](attendance-c.html) và [brief UI](BRIEF.md). Chưa triển khai sản phẩm hoặc lưu thật.

## Tác vụ và phạm vi đã biết

Người chấm/sếp cần nhập nhiều ô nhanh trên bảng tháng. Cả Công/Tăng ca có đơn vị riêng, giữ hướng C và phối xanh hiện tại làm cơ sở. Người dùng xác nhận hai chế độ khi vùng có dữ liệu: chỉ điền ô trống hoặc ghi đè cả vùng. Không đổi ý nghĩa F/trống/N/—, màu nhắc hoặc quyền sửa trực tiếp.

## Luồng đã xác nhận và cách thể hiện trong mẫu

1. Desktop kéo từ ô đầu đến ô cuối để chọn hình chữ nhật qua nhiều ngày/nhân sự trong bảng đang xem; tô vùng bằng sắc nhạt, viền biên rõ. Có cách chọn ô đầu/ô cuối bằng click và bàn phím, tránh chỉ dùng kéo.
2. Điện thoại có chế độ “Chọn nhiều”: chạm ô đầu/ô cuối tạo vùng, giữ cuộn và pinch zoom bình thường; tránh để mọi động tác vuốt bảng thành chọn ô. Kéo cảm ứng/auto-scroll cần kiểm riêng, chưa hứa từ CSS.
3. Editor hiện vùng/ngày, số ô chọn và số ô đủ điều kiện; chọn một giá trị áp chung, đơn vị theo bảng. Có hai chế độ rõ “Chỉ điền ô trống” / “Ghi đè cả vùng”, kèm số ô dự kiến thay đổi. Chọn vùng/chọn giá trị chỉ tạo bản nháp; bấm Áp dụng mới thay đổi.
4. N/— là ngày ngoài mốc làm việc, không nhận dữ liệu. Người dùng đã đồng ý loại khỏi tập áp dụng và hiện số ô bỏ qua; vùng không còn ô đủ điều kiện không bật Áp dụng.
5. Nhập giá trị hàng loạt đề xuất giữ màu nhắc riêng đang có ở mỗi ô. Bật/tắt nhắc hàng loạt là thao tác riêng cần thiết kế nếu người dùng muốn, tránh tự xóa màu khi nhập công/giờ. Hủy bỏ draft; đổi vùng/loại bảng khi draft còn thay đổi cần cơ chế giữ/bỏ rõ như mẫu hiện có.

## Cần chốt trước thiết kế lưu thật

Trong mẫu, “trống” xét nội dung rỗng, không xét màu; mặc định điền trống, giữ F và số đã có. Nhập vùng giữ màu nhắc của từng ô. Đây là cách thể hiện để review, không tự chốt contract backend. Vùng chỉ gồm những dòng đang hiện khi chọn; đổi tìm kiếm phải qua guard nếu có draft rồi bỏ vùng cũ, không áp sang người bị ẩn.

- Chính xác “ô trống”: nội dung trống dù có màu nhắc hay loại khác; đề xuất xét nội dung, giữ màu độc lập theo quy tắc đã có. Không dùng giá trị0/F như trống.
- Đã chốt xung đột batch: dừng cả vùng, không ghi ô nào, giữ draft và chỉ rõ ô xung đột. Cần thiết kế response/đối chiếu/thử lại có chủ ý; không tự chọn field/status hoặc tự retry ghi đè.
- Bước cảnh báo khi ghi đè, default chế độ và thao tác khôi phục. Không tự hứa undo sau lưu nếu chưa có thiết kế lưu.
- Phạm vi giá trị tùy chỉnh vẫn theo Q1; bulk không tạo validation mới hoặc quy đổi công/giờ.

## Kiểm bản mẫu và triển khai sau

Bản mẫu HTML dùng dữ liệu giả: thử vùng nhiều dòng/cột, kéo hai chiều và ra ngoài bảng, cuộn, hủy, hai chế độ, vùng pha N/—, ô có nhắc, tách đơn vị/tổng, draft và phương án không kéo. Cảm ứng/zoom/thiết bị thật vẫn gate riêng. Lưu nhiều ô/quyền/concurrency/persistence/Excel cần test đúng stack API/DB khi có scope triển khai, không suy từ DOM mẫu.

Đã kiểm bằng native HTML preview ở375/728/1200px: mỗi viewport đạt28 check hồi quy,12 check màu,21 check nhập vùng và13 check gesture tổng hợp. Chi tiết bằng chứng/giới hạn tại [validation](../validation.md). Chưa có thao tác chuột/cảm ứng người thật hoặc review độc lập.

## Điều hướng artifact và ngưỡng độ dài

Giữ attendance-c.html tự chứa (496 dòng sau bổ sung ô/vùng rời; checkpoint nhập vùng đầu450 dòng) vì native preview/render nhận một tài liệu inline, không cần bundler/server/dependency; CSS, DOM và vòng đời pointer/draft cùng phục vụ một mẫu dùng dữ liệu giả. Đã xét tách theo SOURCE_NAVIGATION; source sản phẩm sau này vẫn phải tách theo feature, không dùng artifact này làm cấu trúc app.

File map theo symbol hiện có: CSS `.selection-tools`/`.in-range` và DOM `#bulk-panel` thể hiện vùng; `uniqueCells`/`rangeCells`/`targets` xác định tập ô; `markDraft`/`loadDraft`/`requestChange` bảo vệ draft; `renderTable`/`renderEditor`/`paintSelection` hiển thị; `chooseCell`/`toggleCell`/`setRange` điều phối chọn rời/chữ nhật, `startFill` tạo draft từ nguồn; `trackPointer`/`autoScroll`/`endGesture` quản lý kéo và cleanup; handler `save` chỉ cập nhật bộ nhớ. Consumer là native HTML preview/render; scripts kiểm ignored được định tuyến tại validation.

Impeccable shape sở hữu brief tương tác; UI UX Pro Max query `dragging alternative selection --domain ux` khớp Dragging Movements: có lựa chọn không kéo và keyboard. Đây là tham khảo accessibility, không tự quyết nghiệp vụ batch. Writer inline, self-review + người dùng; không child hoặc nguồn chuẩn cạnh tranh.

## Số công tùy chỉnh tiếp nối

Đã chốt chỉ bước0,5 cho số công trên2,5, giống bước tăng ca nhưng độc lập đơn vị/tổng. Mẫu áp cùng validation cho một ô và vùng;3/3,5 được nhận,3,25 bị báo lỗi và giữ draft, không tự làm tròn. Nhập0 công tự chuyển thành F đã chốt tiếp nối, áp cùng hai chế độ và giữ reminder; không áp cho tăng ca. Trần công đã chốt30 mỗi ô, áp chung một ô/vùng; trần tăng ca đã chốt24 giờ mỗi ô, bước0,5; chưa triển khai validation API.

## Mở rộng đã xác nhận: ô/vùng rời và điền lặp

- Desktop Ctrl/Cmd + bấm thêm/bỏ ô; Ctrl/Cmd + kéo hợp thêm vùng. Các ô giao nhau chỉ tính một lần. Không ép chọn hình chữ nhật bao ngoài các ô rời.
- Điện thoại Chọn nhiều mặc định Ô rời, chạm thêm/bỏ; có chế độ Vùng và Thêm vùng để chọn nhiều chữ nhật bằng đầu/cuối. Vuốt ngay để cuộn; nhấn giữ để kéo được bổ sung bên dưới.
- Từ ô nguồn đã lưu có số hoặc F: kéo tay nắm điền lặp cùng giá trị sang vùng đích; có nút Điền từ ô này rồi chạm ô cuối thay cho kéo. Ô nguồn không bị ghi lại; không suy ra dãy tăng dần hoặc sao chép màu. Giá trị nguồn được đưa vào draft, đếm đích và chọn fill/replace trước Áp dụng.
- Áp chung guard/draft/filter/đổi đơn vị/cancel/skip N/—/giới hạn số hiện có. Phạm vi tháng và các dòng hiển thị, không đặt giới hạn số ô riêng trong mẫu; không hứa quy mô vô hạn hoặc chọn xuyên tháng/bảng ẩn.


Trạng thái hiện hành: đã đưa chọn rời/fill vào HTML trong bộ nhớ, tự review bằng headless preview; chờ người dùng thử, không là persistence/concurrency sản phẩm. `range.points` sở hữu ô rời, `range.base` hợp các vùng trước với chữ nhật hiện tại; `uniqueCells` bỏ trùng. `range.fill` giữ nguồn snapshot, `targets` loại nguồn khỏi ghi. Nguồn ẩn/trống không khởi tạo fill; native mouse click trong chế độ Vùng phải đi qua chọn hai đầu thay vì bị gesture nuốt. Bộ kiểm mới/fixture hồi quy ở validation.


## Nhấn giữ để kéo trên cảm ứng — hiện hành28/10/2026

Giữ ô450ms rồi kéo chọn; giữ tay nắm ô đã lưu450ms rồi kéo điền lặp. Di chuyển quá10px trước timer thì hủy chờ kéo, giữ pan native; đúng10px còn cho phép kích hoạt. Có thể chạm chọn rời/hai đầu như cũ. Trong Chọn nhiều, vùng kéo hợp với tập trước, không toggle bỏ ô khi chỉ giữ rồi thả.

`touchHold` chỉ sở hữu timer/ngữ cảnh ứng viên, chưa thay dữ liệu hoặc selection; `clearTouchHold` hủy khi vuốt sớm/lift/cancel/scroll/context/blur. `beginGesture` dùng chung snapshot/targets với chuột, thêm touchId và viền khi giữ thành công. Touch listener không passive chỉ preventDefault cho kéo một ngón đã kích hoạt; không đổi touch-action giữa contact. Nếu native pan đã chiếm sự kiện không cancelable thì rollback thay vì cố cướp cuộn. Đa điểm hủy thao tác để nhường pinch; endGesture khôi phục snapshot khi hủy và không ghi dữ liệu. Bản nháp dirty chặn bắt đầu và không phát lại kéo cũ sau guard.

Tay nắm hiển thị44px với any-pointer:coarse; desktop24px. Không khóa touch-action toàn bảng; nút thay thế cao44px. Mẫu540 dòng giữ chung lifecycle lựa chọn/draft/hủy; map bổ sung beginGesture/clearTouchHold và nhóm touchstart/move/end/cancel/scroll. Consumer và evidence ở validation; không là code sản phẩm.
