# Chính sách skill và plugin

## Bộ đã chọn và trạng thái

Theo đề xuất được người dùng đồng ý: Superpowers là phương pháp chính; specialist Minh Khuê bổ sung project; Impeccable là UI/UX chính và UI UX Pro Max cung cấp tham khảo. Chọn task qua [SKILL_USAGE_MATRIX](../../SKILL_USAGE_MATRIX.md).

Hiện chưa cài gói nào trong workspace này. Bộ Superpowers `v6.4.2` được khảo sát ở SellerFlow là tham chiếu, không phải phiên bản đã ghim cho Minh Khuê. Phiên bản/commit chính xác, dependency và nguồn snapshot UI phải được xác minh trong task cài đặt.

## Một nguồn phân phối

- Dùng gói project-local ở `.agents/skills/` nếu harness hỗ trợ; đây là đường dẫn dự kiến, chưa tồn tại.
- Manifest dự kiến `.agents/superpowers-source.json` và `.agents/ui-skills-source.json` lưu repository/provenance, version/commit, file hash, license và ngày xác minh.
- Giữ byte upstream đã ghim; không sửa âm thầm hay dịch rồi vẫn gọi là upstream nguyên trạng.
- Specialist riêng là gói tách biệt, có nguồn sở hữu và tham chiếu hiện hành.
- Nếu cần Claude, sinh mirror tương thích và entrypoint từ cùng nguồn; không duy trì hai bản skill độc lập.
- Plugin là cách đóng gói/phân phối skill/tool, không là lifecycle thứ hai. Tránh cài thêm global/plugin trùng bộ local.

Những đường dẫn dự kiến trên được ghi bằng code, không được link như file đã tồn tại. Sau cài đặt phải bổ sung manifest/evidence thật vào readiness.

## Điều kiện cài/cập nhật

Task được giao phải bao phủ cài đặt và quyền cần thiết. Xác minh nguồn/version/license, kiểm tra script/hook/network side effect, lưu checksum và khả năng rollback. Không tự cập nhật hoặc sửa global agent config vì skill gợi ý. Thay version phải chạy lại integrity/routing và pilot liên quan; pin khớp không chứng minh skill được Agent sử dụng đúng.

## Quy tắc ưu tiên và override project

1. Skill không vượt chỉ dẫn hệ thống/developer/runtime, yêu cầu người dùng hoặc rule project.
2. Nguồn quyền là PERMISSIONS; skill không tự cấp network, provider, deployment hay cleanup.
3. Ngưỡng review và review tip mới sau sửa theo QUALITY_GATES. Nếu upstream hướng dẫn bỏ re-review thì áp dụng gate project cho phần bắt buộc; ghi override, không sửa upstream.
4. API model/subagent, schema tool và cách wait theo runtime hiện tại; ví dụ trong skill không phải hợp đồng tool của phiên.
5. Bảo toàn evidence/resource theo EXECUTION_RULES trước khi dọn artifact/worktree; không gộp hai loại workspace.
6. UI tuân brief và design authority hiện hành. Giới hạn polish không cho phép bỏ lỗi acceptance còn tồn tại; xử lý trong scope hoặc báo gate còn mở.

## Khi chưa có skill

Ghi Not installed/Blocked cho khả năng phụ thuộc. Công việc tài liệu/bootstrap độc lập đã giao vẫn tiếp tục theo rule hiện hành. Không báo đã invoke một skill chỉ vì đọc mô tả trong khảo sát, không nạp toàn bộ bộ skill vào mọi task.

## Chuyên môn Minh Khuê

Chuẩn bị requirement/planning/review/documentation trước; API/module/DB specialist cần nguồn sản phẩm/schema/contract thật khi có. Nội dung chưa biết giữ Pending thay vì chép module, tenant hoặc rule nghiệp vụ SellerFlow.
