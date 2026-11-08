# Chuẩn code và tái sử dụng

Hiệu lực: nguyên tắc theo [ADR-001](decisions/ADR-001-product-foundation.md) và [kiến trúc](ARCHITECTURE.md). Quy tắc được Agent áp dụng khi thiết kế/thực hiện phần được phép; **chưa có cấu hình tự động enforce trên sản phẩm**. Không thay quyền/spec/plan cần duyệt.

## Ownership và reuse

Trước khi thêm component/helper, tìm phần hiện có theo trách nhiệm. Dùng lại khi cùng ý nghĩa và interface; sửa bản dùng chung tại nguồn sở hữu, đánh giá consumer bị ảnh hưởng. Không copy component giữa feature rồi đổi kiểu cục bộ.

UI nền thuộc hệ UI chung; logic và UI nghiệp vụ thuộc feature sở hữu. Chỉ đưa code vào shared khi trung tính và có nhu cầu thật. Không bắt mọi đoạn giống nhau thành abstraction, không tạo một component đa năng với hàng chục cờ để phục vụ feature chưa tồn tại. Không tạo kho utils/components vô chủ.

Mỗi đơn vị có trách nhiệm rõ: khởi tạo/lắp ghép, hiển thị/tương tác, logic/state của feature, truy cập API hoặc xử lý nghiệp vụ server. Tách khi trách nhiệm lẫn nhau hoặc khó hiểu/kiểm thử; không đặt số dòng tối đa tùy tiện.

[SOURCE_NAVIGATION](SOURCE_NAVIGATION.md) sở hữu tiêu chí chia/giữ file, ngưỡng nhắc review400/800 dòng, module map và TOC theo symbol cho file lớn. Đây không phải hard cap số dòng. Agent đọc map khi có rồi xác minh implementation, dependency/consumer/test; đổi cấu trúc phải cập nhật map cùng thay đổi. Checker tự động chưa cài.

## Import, dữ liệu và state

Tuân chiều phụ thuộc tại ARCHITECTURE. Dùng interface công khai tối thiểu khi có consumer khác module; không import sâu hoặc export mọi nội bộ qua barrel toàn cục. Shared không import feature.

Giữ state chọn ô/bản nháp ở feature phù hợp, dữ liệu server qua lớp truy cập dữ liệu thống nhất, chỉ dùng global state cho nhu cầu toàn ứng dụng thật. Không tự chọn query/store/form library chỉ để đủ danh mục. Quy tắc công/tăng ca và mốc nhân sự không đặt vào generic formatter hoặc primitive UI.

Theo [ADR-002](decisions/ADR-002-state-management.md), dùng TanStack Query cho dữ liệu API và state React cho thao tác/bản nháp. Không nhân bản server cache sang global store. Zustand chỉ bổ sung khi xác định được consumer và nhu cầu chia sẻ state giao diện; chưa là dependency bắt buộc. URL state theo router sẽ thiết kế sau. Chưa cài hoặc kiểm chứng các thư viện state sản phẩm.

Server xác nhận quyền và dữ liệu nghiệp vụ; kiểm tra kiểu hoặc UI validation không thay validation server. FE không nhận server secrets hoặc phụ thuộc kiểu entity DB; contract giao tiếp theo API_CONTRACTS.

## Tên, dependency và cập nhật

Tên phản ánh trách nhiệm, tuân convention framework/ngôn ngữ được chọn. File casing, alias, strict TypeScript, format/lint chi tiết sẽ cụ thể hóa trong thiết kế toolchain; React/Vite và NestJS/TypeScript đã chọn theo [ADR-003](decisions/ADR-003-product-stack.md); quy ước file/alias chi tiết trong proposal vẫn cần review trong toolchain.

Dependency có vai trò rõ; tránh nhiều thư viện cùng trách nhiệm khi chưa có lý do. Chốt version/lockfile khi được phép cài. Component mã nguồn lấy từ shadcn cần lưu nguồn/version và phần tùy biến; nâng cấp qua diff/review, không ghi đè phần custom.

Thay public interface, contract hoặc component dùng chung cần ghi consumer ảnh hưởng, cập nhật đúng tài liệu và kiểm tra tương ứng. Ví dụ UI: đổi Button phải xét form/bảng đang dùng Button; thêm hành vi chỉ dành chấm công thì đặt trong feature thay vì biến Button chung thành component nghiệp vụ.

## Kiểm soát cần xây

Boundary/cycle checks phải hiểu alias thực; type/build phù hợp stack; test hành vi module/component và consumer bị ảnh hưởng. Khi triển khai cấu hình, cần chứng minh import sai bị chặn và import hợp lệ đạt. Chưa có lệnh kiểm sản phẩm; không gọi `npm run check` của pilot là bằng chứng chuẩn này được enforce. Review và test theo [QUALITY_GATES](../agent/QUALITY_GATES.md).
