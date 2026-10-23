# Kiểm tra, review và điều kiện hoàn tất

## Báo kết quả đúng bằng chứng

- **Verified:** thao tác/check đã chạy, kết quả đạt trong scope ghi rõ.
- **Failed:** đã chạy và thất bại; ghi lỗi và tác động.
- **Not run:** chưa chạy; nêu vì ngoài scope, chưa có app hoặc chưa đến gate.
- **Blocked:** check cần cho scope hiện tại nhưng thiếu điều kiện/quyền; ghi điều kiện gỡ.
- **N/A:** không áp dụng, kèm lý do; không dùng để che check thiếu.

Mỗi validation ghi command/tool, cwd, target/environment, exit/result, assertion/summary và giới hạn. File/script tồn tại, dependency cài được, preflight và screenshot đều không thay kiểm thử hành vi phù hợp.

## Kiểm tra theo loại thay đổi

| Loại việc | Gate phù hợp |
| --- | --- |
| Tài liệu | Link/anchor, UTF-8/dấu, trạng thái/quyền/nguồn sở hữu nhất quán; không cần test ứng dụng |
| Gói skill/mirror | Nguồn/version/hash/license, metadata/link, discovery/routing, override và pilot dùng skill |
| Tooling/adapter | Test có ý nghĩa cho ownership, failure/cleanup/resume và dữ liệu được bảo toàn; chạy trong fixture riêng |
| Hành vi nghiệp vụ/API | Unit cho logic quan trọng; integration cho quyền/transaction/contract theo rủi ro |
| DB/migration | Schema/migration review, DB thử đúng identity, thử từ baseline cần hỗ trợ; không thử trên DB thật chưa được phép |
| UI | Browser assertion trên trạng thái/viewport liên quan; keyboard/touch/error/loading khi có; theo BROWSER_TESTING |
| Luồng web–API–DB | Sandbox integration + browser thật + persistence assertion; không thay bằng mock |
| Release | CI/check cần thiết, target/quyền, migration/backup/khôi phục phù hợp và smoke sau phát hành |

Chọn check theo hành vi/rủi ro, không viết test chỉ lặp lại implementation hoặc kiểm tra một chỉnh sửa câu chữ. Sau check đạt, chỉ mở rộng/chạy lại khi có thay đổi hoặc lo ngại chưa giải quyết. Không đổi lockfile/rule hoặc bỏ check để làm kết quả xanh.

## Review theo rủi ro

- Sửa tài liệu scope rõ: tự rà soát cấu trúc/nội dung và bàn giao người dùng nghiệm thu; review độc lập nếu scope/người dùng yêu cầu.
- Code/tooling mức trung bình trở lên, quyền truy cập, persistence, migration, cleanup, thực thi plugin/Agent: cần review độc lập trên snapshot cuối trước gate hoàn tất tương ứng.
- Nếu không chắc mức rủi ro, ghi lý do phân loại; không hạ mức chỉ để né review. Thay đổi chính sách quyền có ảnh hưởng phải có xác nhận người dùng theo PERMISSIONS.

Reviewer cần yêu cầu đã duyệt, nguồn chuẩn, scope/file zone, full SHA base..tip hoặc immutable snapshot khi môi trường chưa hỗ trợ Git, kết quả check và giới hạn. Reviewer chỉ đọc và có ngữ cảnh riêng; tác giả tự đọc diff không thành review độc lập.

Findings cần severity, bằng chứng, tác động và cách kiểm lại. Lỗi chặn acceptance phải được giải quyết; ghi rõ quyết định xử lý phần ngoài scope/được chấp nhận hoãn, không tự gọi test xanh là đã được phép đổi nghiệp vụ.

Sau sửa, chạy lại check ảnh hưởng. Với gate yêu cầu review độc lập, reviewer phải xem kết quả ở tip mới và tác động tổng thể cần thiết. Upstream có thể hướng dẫn bỏ re-review; rule project này sở hữu gate bắt buộc. Nếu chưa được phép dispatch hoặc thiếu reviewer, ghi Blocked cho gate đó, tiếp tục phần độc lập; không giả đã review.

## Điều kiện Done

1. Acceptance của task đạt; phạm vi và quyết định phát sinh được ghi đúng.
2. Check bắt buộc cho scope đạt, hoặc có quyết định chấp nhận ngoại lệ cụ thể của người dùng; giữ trạng thái Failed/Not run cho check được ngoại lệ, không đổi thành pass.
3. Review bắt buộc của scope có kết quả đúng snapshot cuối.
4. Tài liệu/contract/evidence liên quan được cập nhật; không còn mâu thuẫn chặn triển khai.
5. Handoff có giới hạn, finding còn mở, resource và next action rõ.

Task tài liệu có thể Done khi kiểm tra tài liệu đạt, dù readiness cài đặt/pilot vẫn Pending. Implemented, reviewed, integrated và released là bốn sự kiện khác nhau.

## Luồng kiểm tra tự động sau bootstrap

Khi có app/tooling thật: dependency theo lockfile → lint/type-check → test liên quan → build → browser/integration cần thiết. Task cấu hình phải xác minh lệnh thực tế ở từng package và baseline lỗi; chưa có script thì ghi thiếu, không tạo lệnh giả trong báo cáo.

CI kiểm tra và release là hai scope khác nhau. Thay tài liệu không tự là lý do deploy production; trigger và quyền release phải được kiểm tra riêng.
