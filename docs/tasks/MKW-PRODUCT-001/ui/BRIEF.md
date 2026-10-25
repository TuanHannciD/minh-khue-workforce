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

Người dùng đề nghị cân nhắc một nền UI nhất quán/tái sử dụng và kiểm tra rule khi có nhiều feature. Đã chốt shadcn/ui nền Radix và phân trách nhiệm primitives/patterns/feature tại [UI_SYSTEM](../../../architecture/UI_SYSTEM.md), theo [ADR-001](../../../architecture/decisions/ADR-001-product-foundation.md). Toolkit chưa cài, tokens và diện mạo cuối chưa duyệt; [khảo sát kiến trúc](../technical/maintainability-review.md) giữ hiện trạng trước quyết định và các đề xuất chi tiết chưa chốt.

Phát triển thiết kế thị giác C thành bản mẫu hoàn thiện hơn để người dùng review: phân cấp chữ/số, độ rõ của bảng, nhịp khoảng cách, màu thương hiệu và màu nghiệp vụ, trạng thái chọn ô, phần nhập và bố cục điện thoại/desktop. Giữ cấu trúc C và nghiệp vụ đã chốt; không trình bản khảo sát hiện tại như UI đã hoàn tất. Tiếp tục làm rõ luồng chi tiết, trạng thái lưu/lỗi/xung đột và các màn hình còn lại. Hỗ trợ iPhone/Android, cảm ứng/zoom, bàn phím, dữ liệu lớn và Excel vẫn phải có kiểm chứng đúng môi trường ở giai đoạn triển khai, không suy ra từ bản mẫu HTML này.

## Bản C hoàn thiện để review — 25/10/2026

Artifact hiện hành: [attendance-c.html](attendance-c.html); HTML A/B/C phía trên giữ làm lịch sử. Trạng thái: **đã viết và tự review bản mẫu; diện mạo/luồng mới chưa được người dùng duyệt**. Chế độ Operate; tái sử dụng lựa chọn C và seed cũ, không mở lại vòng chọn bố cục. Dựng code-led theo scope HTML/CSS đã duyệt, không ảnh bitmap hoặc dependency/framework sản phẩm.

Tác vụ chính là tìm người/ngày, sửa công hoặc giờ rồi kiểm tổng. Bản mẫu dùng nền bảng sáng để đối chiếu số Excel quen thuộc; điều kiện ánh sáng thực chưa xác định nên đây là đề xuất cần review. Bố cục bỏ controls so sánh A/B; header gọn, chuyển loại và tìm người phía trên một bảng. Phần nhập ở cạnh phải khi vùng app đủ rộng, bên dưới ở điện thoại/chat hẹp. Mở rộng chỉ tăng vùng bảng trong trang, chọn ô đưa phần nhập trở lại.

Visual record tại scope artifact: system-ui/Segoe UI cho tiếng Việt, tabular numerals; heading 28px desktop/24px phone, editor heading20px, điều khiển và số14px, chú giải12px. Nền trắng, neutral #f3f6f8, chữ #192c40, phụ #526274; action #193b59, selected #174e79/#dcecf8; reminder #e1f1cd với chữ/dấu #32551b. Tokens khai báo trong HTML, chưa đưa thành tokens UI_SYSTEM đã duyệt hoặc root DESIGN.md của pilot. Một vocabulary nút/input/focus và icon SVG nét1,7; vùng bảng có ô48px ×44px, tên112/128px, tổng56/64px. Bản mẫu chưa dùng component shadcn/Radix thực tế.

Signature interaction: ô chọn được viền rõ, editor luôn ghi người/ngày/đơn vị; chuyển ô/loại bảng hoặc reset/mở rộng khi có draft phải chọn tiếp tục sửa hay bỏ bản nháp. Đây là UX đề xuất để review, không thành nghiệp vụ mới. Màu nhắc có dấu phụ và aria-label, không ảnh hưởng tổng. Bộ chọn F chỉ có ở Công; Tăng ca để trống, tùy chỉnh theo bước0,5. Số công tùy chỉnh trong mẫu chưa thay quyết định Q1.

Đã chạy Impeccable context một lần trong phiên, đọc new-work/operate/craft-floor; context tải cả pilot nên chỉ áp requirements/design/brief của task. UI UX Pro Max query `data table readability --domain ux`: kết quả Table Handling phù hợp wrapper cuộn ngang; không áp bulk edit từ kết quả lẫn chủ đề hoặc biến gợi ý virtualization thành yêu cầu. Không tạo design-system MASTER cạnh tranh.

Self-review tại các width375/390/728/844/1200: giữ một bảng, hierarchy dữ liệu/nhập rõ, không page overflow ở các width đã assert; desktop có editor bên phải, hẹp có editor bên dưới. Detector trả []; các text palette chính đạt contrast4,5:1 theo kiểm số. Tự review không là review độc lập. Theo route task đã duyệt không dispatch finish reviewer/documenter, không ghi đè pilot; bản ghi thiết kế giữ trong brief này. Chưa claim production-ready hoặc toàn bộ accessibility đạt.

Còn mở: phản hồi người dùng về cảm giác chuyên nghiệp/mật độ/kích thước; editor dưới bảng trên điện thoại có thuận tiện trong sử dụng thực tế; keyboard Enter/Tab kiểu bảng đầy đủ, loading/error network/conflict, actual touch/zoom/xoay iPhone/Android, text scaling và reduced-motion thực tế, hiệu năng lớn. Snapshot viewport844 không chứng minh xoay thiết bị thật. Không có server/process/tab riêng cần release; screenshot và assertion scope tại validation.
