# Nguyên tắc contract API

Nguồn nền tảng: [ADR-001](decisions/ADR-001-product-foundation.md). Hiệu lực ở mức nguyên tắc; **chưa có endpoint/schema/DTO/version API được duyệt hoặc triển khai**.

## Ranh giới và nguồn sở hữu

Web và API là hai ứng dụng độc lập trong cùng repository; Android về sau có thể dùng chung API. Client dùng contract công khai, không truy cập DB hoặc import entity ORM/internal server. Backend xác minh quyền, validation và quy tắc nghiệp vụ; schema/type của client không thay kiểm tra server.

Contract có một nguồn sở hữu, kèm ví dụ/request/response và lỗi cần hỗ trợ khi thiết kế chi tiết. Chọn OpenAPI/JSON Schema hoặc cơ chế khác phù hợp stack ở bước kiến trúc; không suy từ tên thư mục minh họa rằng format đã được chốt. Sinh client/types khi phù hợp, không duy trì các bản DTO viết tay cạnh tranh mà không có kiểm đồng bộ.

Thay contract phải xét consumer web/Android cần hỗ trợ, compatibility và cách chuyển phiên bản. Hình thức URL/version/error/pagination chưa chốt; không tự đặt chúng từ UI mockup hoặc pilot.

## Các quyết định còn cần cụ thể hóa

- Cách đăng nhập/khôi phục và kiểm cùng quyền của hai tài khoản; chưa chọn provider/token/cookie.
- Cách biểu diễn công/giờ, trống/F/N/—, mốc ngày và tính tổng dựa trên yêu cầu đã duyệt; số công tùy chỉnh và các điểm mở vẫn cần quyết định đúng nguồn.
- Cơ chế phát hiện hai người sửa cùng ô; hành vi báo người lưu sau đã chốt nhưng chưa chọn revision field/ETag/transaction contract.
- Request/response/error, dữ liệu ngày và timezone, validation số, tương thích schema và quy mô truy vấn.
- Công cụ generation/validation, kiểm drift và test contract sau khi có stack/schema thật.

Không liệt kê các mục trên như field/trạng thái mới đã được yêu cầu. Nghiệp vụ thuộc [requirements](../tasks/MKW-PRODUCT-001/approved/requirements.md) và quyết định tương ứng trong [design](../tasks/MKW-PRODUCT-001/design.md).

## Gate triển khai

Cần test response/request thực, quyền, validation và persistence đúng target; drift schema/client phải được phát hiện nếu có generation. Test HTTP hoặc compile type đơn lẻ không chứng minh UI–API–DB hoạt động. Áp dụng [QUALITY_GATES](../agent/QUALITY_GATES.md) và [BROWSER_TESTING](../agent/BROWSER_TESTING.md); chưa có sản phẩm nên các kiểm tra này chưa chạy.
