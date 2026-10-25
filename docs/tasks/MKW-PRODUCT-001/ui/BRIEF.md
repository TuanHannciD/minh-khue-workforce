# Bản mẫu bảng tháng và nhập ô

Ngày 25/10/2026. Trạng thái: **Đã chọn hướng tổ chức C — thiết kế thị giác chưa duyệt**. Người dùng chọn một bảng lớn và chuyển Công/Tăng ca, đồng thời nhận xét bản mẫu còn thô/xấu, chưa mang cảm giác đẹp/chuyên nghiệp cho doanh nghiệp. Không xem lựa chọn C là phê duyệt màu sắc, font, spacing, hình thức điều khiển hoặc độ hoàn thiện hiện tại. Chưa duyệt đặc tả viết đầy đủ hoặc triển khai sản phẩm.

## Mục đích và phạm vi

Người chấm chính nhập công toàn công ty, sếp xem/sửa trực tiếp; hiện khoảng20 người, có thể tăng nhiều. Chế độ Operate: tìm đúng người/ngày, nhìn dữ liệu rõ, nhập nhanh và tránh nhầm công với giờ tăng ca. Cả iPhone, Android và desktop, ưu tiên điện thoại nhẹ. Chưa biết điều kiện ánh sáng thực tế; nền bảng sáng là đề xuất để đối chiếu số liệu quen thuộc, chưa là quyết định thương hiệu.

Nguồn nghiệp vụ là [requirements](../approved/requirements.md) và [design](../design.md). PRODUCT.md/DESIGN.md ở root chỉ thuộc pilot, không dùng làm nguồn sản phẩm mới. Ảnh Excel là tham khảo cách đọc bảng, không sao chép nhân sự thật. Bản mẫu dùng Nhân sự01–20, tháng10/2026 và dữ liệu giả.

Đầu ra: [bản mẫu HTML độc lập](attendance-concepts.html), không dependency/framework, không backend/DB/auth hoặc lưu bền vững; không quyết định stack. Chỉ nghiên cứu bảng tháng và phần nhập ô, chưa thiết kế toàn bộ màn hình thêm nhân sự/đăng nhập/xuất file. Nút Lưu thử chỉ đổi bộ nhớ trang; refresh đặt lại dữ liệu. Chưa thể chứng nhận toàn bộ AC sản phẩm.

## Phương án để review

| Phương án | Điện thoại | Máy tính | Đánh đổi |
| --- | --- | --- | --- |
| A — Hai bảng đối chiếu | Công và tăng ca xếp dọc, mỗi bảng thấp | Hai bảng cạnh nhau, phần nhập bên phải | Thấy cả hai loại cùng lúc nhưng ít dòng/ngày hơn trong mỗi vùng |
| B — Sổ công liên tiếp | Bảng công trước, tăng ca sau | Hai bảng rộng nối tiếp, phần nhập bên phải | Quen Excel; danh sách dài làm tăng quãng cuộn giữa hai phần |
| C — Tập trung một bảng | Chuyển Công/Tăng ca, một bảng lớn | Một bảng lớn, phần nhập bên phải | Nhiều chỗ đọc/nhập hơn; cần chuyển bảng khi đối chiếu |

Người dùng đã chọn C về cách tổ chức và thao tác. A/B là phương án khảo sát được giữ làm lịch sử; HTML so sánh vẫn là bản mẫu tại checkpoint trước, không tự nâng thành giao diện cuối. Bước tiếp phát triển diện mạo C ở mức hoàn thiện cao hơn để review.

Ba phương án dùng cùng bộ dữ liệu và điều khiển để so sánh công bằng. Màu xanh chỉ nhắc, vẫn cộng số bình thường; ô công và tăng ca đánh dấu độc lập. F chỉ có ở công; tăng ca trống là không phát sinh giờ. N/— không chỉnh trực tiếp. Tổng người/ngày riêng theo đơn vị. Số chọn nhanh và tùy chỉnh theo yêu cầu đã chốt. Xử lý số công tùy chỉnh chưa là validation contract chính thức.

Phần tên, ngày/thứ và tổng giữ trong vùng nhìn khi cuộn. Điện thoại nhập dưới bảng; desktop đưa phần nhập ra cạnh khi đủ rộng. Màu nhắc có chú giải và nhãn truy cập ở ô; không đổi thành trạng thái chờ duyệt. Nút Mở rộng bảng chỉ ẩn phần nhập trong trang, chưa là xác minh browser fullscreen hay pinch zoom trên điện thoại.

## Cách dùng skill và giới hạn

- Impeccable: đã chạy context một lần và đọc shape/new-work/craft-floor; nguồn sản phẩm riêng của task được ưu tiên so với pilot. Skill giữ vai trò phân tích, chưa gọi UI hoàn thiện hoặc production-ready.
- Đã chạy concept-seed direction/operate, key `eef56e12`, assigned index7. Các hướng được xét từ quy trình quen thuộc: sổ công tháng, lịch bàn, sổ đăng bộ, phiếu nhập theo người, bảng theo dõi ca, bảng điều phối và bảng đối chiếu hai mặt. Index7 tương ứng A; hướng sổ công tháng tương ứng B. Người dùng sau đó chọn C về tổ chức bảng; không dùng seed để suy ra phê duyệt một catalog world hoặc thiết kế thị giác. Chưa gửi telemetry kết quả lựa chọn.
- Các gợi ý catalog được cân nhắc theo nhận diện người dùng và độ rõ của công việc: bố cục dày kiểu Japanese high-density đóng góp tính tiết kiệm không gian cho C; không nhập tiny type/hover-only/red badge vào giao diện điện thoại. Bản đồ giao thông, bản đồ sao, vé máy bay và manual acetate không được đưa thành phương án thương hiệu vì làm xa cấu trúc người × ngày hoặc thêm ẩn dụ/trạng thái không có trong nghiệp vụ. Giữ kỷ luật định hướng, tọa độ dòng/cột, đơn vị rõ và thứ bậc điều khiển. Đây là tham khảo đã điều chỉnh theo brief Excel, không claim tái tạo đầy đủ catalog world.
- UI UX Pro Max: hai lượt design-system trả cả pattern landing page/Enterprise Gateway không phù hợp, nên loại các pattern Hero/CTA/contact sales và không persist chúng thành design system. Chỉ giữ tham khảo mật độ dữ liệu, độ tương phản, tính nhất quán. Query UX touch target size khớp Mobile Touch/Web Target Size; không dùng một đơn vị native làm chuẩn web. Không thêm chart, KPI, bulk edit hoặc filter công trình từ kết quả tra cứu.
- Dùng HTML/CSS để thể hiện chính xác bảng và số tiếng Việt, không sinh ảnh bitmap giao diện. Trình phương án qua HTML tương tác native của T3 (`html_preview`/`html_render`) trong hội thoại, không dựng thêm decision server hoặc ghi đè root DESIGN.md. Chưa chốt font/palette hoặc lập design-system MASTER cạnh tranh với nguồn task.

## Review tiếp theo

Người dùng đề nghị cân nhắc một nền UI nhất quán/tái sử dụng và kiểm tra rule khi có nhiều feature. Xem [khảo sát và đề xuất kiến trúc](../technical/maintainability-review.md) cho phương án shadcn nền Radix, ownership primitives/patterns/feature và khoảng trống enforcement. Chưa cài toolkit hoặc coi đó là stack đã duyệt.

Phát triển thiết kế thị giác C thành bản mẫu hoàn thiện hơn để người dùng review: phân cấp chữ/số, độ rõ của bảng, nhịp khoảng cách, màu thương hiệu và màu nghiệp vụ, trạng thái chọn ô, phần nhập và bố cục điện thoại/desktop. Giữ cấu trúc C và nghiệp vụ đã chốt; không trình bản khảo sát hiện tại như UI đã hoàn tất. Tiếp tục làm rõ luồng chi tiết, trạng thái lưu/lỗi/xung đột và các màn hình còn lại. Hỗ trợ iPhone/Android, cảm ứng/zoom, bàn phím, dữ liệu lớn và Excel vẫn phải có kiểm chứng đúng môi trường ở giai đoạn triển khai, không suy ra từ bản mẫu HTML này.
