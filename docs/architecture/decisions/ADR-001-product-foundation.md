# ADR-001 — Nền tảng sản phẩm tái sử dụng

Ngày 25/10/2026. Trạng thái: **Accepted về nền tảng; chưa triển khai**. Nguồn: người dùng trả lời “Tôi chốt” sau báo cáo rà soát và đề xuất nền UI/cấu trúc. Không dùng acceptance này để mở rộng sang mọi chi tiết kỹ thuật trong báo cáo khảo sát.

## Bối cảnh

Sản phẩm bắt đầu bằng chấm công, có thể thêm nhiều feature. Người dùng cần UI chuyên nghiệp, code dễ tìm/sửa và tái sử dụng từ đầu. Web FE/BE tách biệt, Android có thể dùng chung API về sau. Quy mô hiện tại khoảng20 nhân sự không quyết định số lượng tính năng hoặc trần dữ liệu.

## Quyết định được chốt

1. Nền UI web thống nhất: **shadcn/ui với nền Radix**, tùy biến thành hệ giao diện Minh Khuê. Web component theo hệ React tương ứng; chưa chọn framework chạy ứng dụng hoặc phiên bản package.
2. **Một repository, web và API là hai ứng dụng riêng**, có thể chạy/build/phát hành riêng. Trong mỗi ứng dụng, code chia theo feature/module.
3. **Có ownership cho phần dùng chung.** UI nền/pattern trung tính dùng chung; UI và luật nghiệp vụ riêng nằm trong feature sở hữu. Tái sử dụng theo trách nhiệm và nhu cầu thật, tránh copy component hoặc gom toàn bộ code vào shared.
4. **Chuẩn code/UI/API phải có kiểm soát tự động phù hợp.** Boundary/import, type-check theo stack, contract và regression cho consumer phải được chuẩn bị trong kế hoạch triển khai; tài liệu không thay bằng chứng công cụ.
5. Hoàn thiện bốn nguồn chuẩn kiến trúc, code conventions, hệ UI và API contracts; Agent đọc đúng nguồn trước sửa. Tiếp tục dùng quality/browser workflow hiện có, không tạo lifecycle khác.
6. Giữ hướng tổ chức UI **C** đã chọn. Diện mạo bản mẫu hiện tại chưa được duyệt và cần thiết kế hoàn thiện hơn.

## Hệ quả

Thay component nền phải xét các consumer; feature mới dùng lại hệ UI và có module riêng. Thay contract phải xét web/Android cần hỗ trợ. Android native không mặc định dùng lại React DOM/Radix component. Tách package UI riêng khi có nhu cầu dùng giữa ứng dụng thật; chưa tạo microservices/microfrontend hoặc module tương lai.

## Những phần chưa được quyết định

Cập nhật tiếp nối: lựa chọn query/state đã được chốt riêng tại [ADR-002](ADR-002-state-management.md). Danh sách bên dưới giữ phạm vi quyết định tại thời điểm ADR-001; áp dụng ADR-002 cho phần được bổ sung.

Framework web, TypeScript/toolchain chi tiết, backend/DB/ORM/auth/hosting, package manager và version pin; cây thư mục/alias cụ thể; format/version/API fields; thư viện query/store/form/grid; palette/font/tokens cuối; CI provider. Số công tùy chỉnh và các điểm nghiệp vụ chưa chốt vẫn theo dossier sản phẩm. Chưa duyệt implementation plan, cài dependency hoặc scaffold/code sản phẩm.

## Nguồn hiện hành và kiểm chứng

- [Kiến trúc](../ARCHITECTURE.md) sở hữu ứng dụng/module và ranh giới.
- [Code conventions](../CODE_CONVENTIONS.md) sở hữu cách viết/reuse/import.
- [UI system](../UI_SYSTEM.md) sở hữu hệ component và thiết kế dùng chung.
- [API contracts](../API_CONTRACTS.md) sở hữu nguyên tắc FE/BE/Android và việc chốt contract.

Trạng thái công cụ: **chưa cài/chưa enforce cho sản phẩm**. Check pilot không chứng minh các chuẩn trên đã được thực thi. ADR có thể được thay bởi quyết định được người dùng duyệt về sau, cần ghi rõ lý do và phạm vi.
