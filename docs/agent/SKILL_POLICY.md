# Chính sách skill và plugin

## Bộ đã chọn và trạng thái

Theo đề xuất được người dùng đồng ý: Superpowers là phương pháp chính; specialist Minh Khuê bổ sung project; Impeccable là UI/UX chính và UI UX Pro Max cung cấp tham khảo. Chọn task qua [SKILL_USAGE_MATRIX](../../SKILL_USAGE_MATRIX.md).

Đã cài trong MKW-AGENT-002: 15 Superpowers `v6.4.2`, commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`, bằng system skill-installer helper; 2 bộ UI lấy nguyên byte snapshot local SellerFlow. UI là bản import được duy trì local từ Windows-Video-Builder, không claim pristine upstream. Chi tiết và hash ở [Superpowers manifest](../../.agents/superpowers-source.json), [UI manifest](../../.agents/ui-skills-source.json), [license Superpowers](../../.agents/SUPERPOWERS-LICENSE) và [UI licenses](../../.agents/UI-LICENSES).

## Một nguồn phân phối

- Dùng gói project-local ở `.agents/skills/`. Nếu harness chưa liệt kê tự động, đọc SKILL.md trực tiếp theo matrix; chưa coi auto-discovery là Verified.
- Manifest `.agents/superpowers-source.json` và `.agents/ui-skills-source.json` lưu repository/provenance, version/commit, file hash, license và ngày xác minh. `npm run check:skills` kiểm tra hash, inventory, metadata và đường dẫn.
- Giữ byte upstream đã ghim; không sửa âm thầm hay dịch rồi vẫn gọi là upstream nguyên trạng.
- Specialist riêng là gói tách biệt, có nguồn sở hữu và tham chiếu hiện hành.
- Nếu cần Claude, sinh mirror tương thích và entrypoint từ cùng nguồn; không duy trì hai bản skill độc lập.
- Plugin là cách đóng gói/phân phối skill/tool, không là lifecycle thứ hai. Tránh cài thêm global/plugin trùng bộ local.

Không cài mirror Claude/global hoặc hook. Impeccable update check đã tắt local tại `.impeccable/config.json`. Chỉ chạy script cần cho task sau khi đọc; không tự thực thi toàn bộ script trong distribution. Check hash xác nhận integrity với manifest đã review, không là chữ ký tin cậy từ upstream.

Notice riêng [modern-screenshot MIT](../../.agents/MODERN-SCREENSHOT-LICENSE) bổ sung ngoài cây snapshot để giữ byte import. Bundle khớp nguyên byte `modern-screenshot@4.7.0` npm `package/dist/index.js`; manifest UI ghi tarball/integrity/hash và gitHead. License package lấy từ chính tarball đã đối chiếu, không suy từ license Impeccable.

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
