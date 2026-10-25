# Kiến trúc nền tảng Minh Khuê

Hiệu lực: nguyên tắc nền tảng theo [ADR-001](decisions/ADR-001-product-foundation.md). Chưa là kiến trúc kỹ thuật đầy đủ hoặc quyền triển khai sản phẩm. Trạng thái: đã chốt nền tảng; source sản phẩm và enforcement chưa có.

## Tổ chức ứng dụng và module

Một repository chứa web và API thành hai ứng dụng tách biệt. Mỗi ứng dụng sở hữu cấu hình, dependencies, khởi tạo và cách chạy/build của mình; chúng liên lạc qua API, không đọc trực tiếp nội bộ source của nhau. Việc triển khai độc lập phải được xác minh khi có toolchain thật.

Chia code theo feature/module nghiệp vụ. Màn hình, logic và lời gọi API của chấm công thuộc feature chấm công; nhân sự thuộc module nhân sự trong scope đã duyệt. Không tạo sẵn module chưa có yêu cầu. Route/layout khởi tạo và lắp ghép, không sở hữu toàn bộ nghiệp vụ.

Shared là code nền/trung tính có consumer thật. Component nghiệp vụ dùng ở hai màn hình cùng feature vẫn có thể thuộc feature đó. Không cần tạo package UI độc lập khi mới có một web app; vị trí source cụ thể sẽ xác định trong thiết kế toolchain.

## Ranh giới phụ thuộc

- App lắp ghép feature và shared.
- Feature dùng shared; shared không phụ thuộc ngược app/feature.
- Feature không import sâu nội bộ feature khác. Phối hợp thông qua interface công khai tối thiểu có chủ sở hữu hoặc lớp lắp ghép thích hợp; không tạo vòng phụ thuộc.
- FE không import ORM/entity DB, module server hoặc secret. API không phụ thuộc component web.
- Backend chia module trước; cách tách HTTP/use case/domain/data access theo độ phức tạp và stack được duyệt, tránh nhiều lớp rỗng.

Thư mục, tên alias, barrel entrypoint và dependency graph cụ thể chưa chốt. Cây minh họa trong [báo cáo khảo sát](../tasks/MKW-PRODUCT-001/technical/maintainability-review.md) giúp thảo luận, không tự trở thành scaffold bắt buộc.

## Nguồn chi tiết

[CODE_CONVENTIONS](CODE_CONVENTIONS.md) sở hữu code/reuse; [UI_SYSTEM](UI_SYSTEM.md) sở hữu UI; [API_CONTRACTS](API_CONTRACTS.md) sở hữu giao tiếp. Những thay đổi ranh giới quan trọng ghi quyết định/ảnh hưởng, không sửa ngầm kiến trúc bằng một import mới.

## Cần thiết kế trước triển khai

Chốt framework web, toolchain và backend; chọn DB/auth theo nhu cầu thực; cụ thể hóa cây source/build và contract. Sau đó lập kế hoạch cấu hình boundary/type/build/test và review theo [QUALITY_GATES](../agent/QUALITY_GATES.md). Chưa có benchmark hoặc cam kết quy mô vô hạn; khả năng mở rộng dữ liệu phải kiểm riêng với dữ liệu giả phù hợp.
