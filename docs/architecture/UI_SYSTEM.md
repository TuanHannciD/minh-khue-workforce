# Hệ UI Minh Khuê

Nguồn quyết định: [ADR-001](decisions/ADR-001-product-foundation.md). Nền component web đã chọn: **shadcn/ui với Radix**, tùy biến nhất quán cho Minh Khuê. Trạng thái: chưa cài package/version; người dùng đã chấp nhận bản mẫu C hiện hành và duyệt toàn bộ design.md28/10/2026. Màn hình sản phẩm chưa dựng vẫn cần cụ thể hóa theo cùng ngôn ngữ UI, không mở lại hướng đã duyệt. Dùng Impeccable chủ đạo, UI UX Pro Max bổ trợ theo [skill policy](../agent/SKILL_POLICY.md).

## Các lớp sở hữu

- **UI nền:** Button/Input/Checkbox/Dialog/Tabs và primitives cần thiết, không HTTP call hoặc luật nghiệp vụ. Dùng một bộ nền; không đổi sang base khác do CLI mặc định.
- **Pattern trung tính:** Field có label/error, empty state hoặc xác nhận chung khi có consumer thật; dựa trên primitives chung.
- **UI feature:** AttendanceGrid, phần nhập công/tăng ca và trạng thái nghiệp vụ thuộc feature chấm công. Không xem một bảng chỉnh sửa chuyên biệt là primitive dùng chung.
- **Khung ứng dụng:** navigation/layout chung do app sở hữu, kết hợp những thành phần trên.

Không bắt buộc cài toàn bộ danh mục shadcn. Ưu tiên component cần dùng; không thêm wrapper khi interface hiện tại đã đáp ứng. Thay primitive/pattern dùng chung phải đánh giá các consumer, theo [CODE_CONVENTIONS](CODE_CONVENTIONS.md).

## Thiết kế cần hoàn thiện

Cần một nguồn tokens cho màu thương hiệu, nền/chữ/viền, typography tiếng Việt và số, spacing, radius, elevation, focus và mật độ bảng. Người dùng đã xác nhận hướng thương hiệu thuộc nhóm xanh lá ngày27/10/2026; bản C hiện hành đã được chấp nhận làm tham chiếu thị giác; khi triển khai trích mã màu/font/spacing thực từ mẫu thành tokens có ownership, chi tiết màn hình chưa dựng phải theo cùng hệ UI. Không dùng style mặc định shadcn làm bằng chứng giao diện đã được người dùng duyệt.

Chuẩn hóa variants/kích thước và các trạng thái thường/focus/disabled/loading/error/empty; label, nội dung dài, feedback và vùng chạm nhất quán. Có nơi xem/kiểm component khi triển khai; công cụ catalog như Storybook chưa được chọn/cài.

Hướng **C** đã chọn: một bảng lớn, chuyển Công/Tăng ca. Giữ yêu cầu bảng/zoom/thiết bị tại [requirements](../tasks/MKW-PRODUCT-001/approved/requirements.md). Bản HTML khảo sát A/B/C giữ lịch sử; bản C hiện hành đã được người dùng chấp nhận. [Đặc tả](../tasks/MKW-PRODUCT-001/design.md) đã duyệt toàn bộ, [kế hoạch](../tasks/MKW-PRODUCT-001/technical/implementation-plan.md) đã duyệt; Task1 chờ review G1, chưa triển khai hoặc kiểm UI sản phẩm trên điện thoại/desktop thật.

Màu thương hiệu xanh lá không thay nghĩa ô nhắc: dùng sắc độ/độ sáng, dấu và nhãn để phân biệt. Màu xanh nhắc kiểm tra là semantic độc lập, không đổi tổng hoặc thành trạng thái duyệt/thành công. Công và tăng ca tách đơn vị. Chi tiết nghiệp vụ tiếp tục thuộc dossier sản phẩm, không do component library quyết định.

## Xác minh và bảo trì

Kiểm keyboard/focus/contrast/overflow/trạng thái phù hợp; không khóa zoom để ép bảng vừa màn hình. Chọn table/grid engine theo hành vi bảng thật, chưa mặc định TanStack Table là giải pháp chỉnh sửa Excel hoàn chỉnh. Pinch zoom và cảm ứng cần kiểm iPhone/Android thật, tách với viewport mô phỏng theo [BROWSER_TESTING](../agent/BROWSER_TESTING.md).

shadcn/Radix có nền hành vi hữu ích, không đảm bảo toàn ứng dụng accessible sau tùy biến. Ghi nguồn component, version/custom delta và review cập nhật. Android native có thể dùng cùng ngôn ngữ thiết kế/API nhưng không mặc định tái sử dụng DOM component.
