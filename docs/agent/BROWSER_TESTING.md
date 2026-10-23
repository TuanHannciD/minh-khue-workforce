# Thao tác UI thật, debug và Playwright

## Vai trò công cụ

- **T3 Browser:** Agent điều khiển trình duyệt trực tiếp để khám phá, tái hiện và kiểm tra luồng.
- **Playwright Test/CLI:** các spec có assertion, chạy lại local/CI để chống tái phát.
- **Playwright MCP:** một lựa chọn kết nối điều khiển browser khác; chưa được cài/xác minh và không đồng nghĩa Playwright Test.
- **HTML preview/render:** trình bày mockup/báo cáo; không chứng minh ứng dụng web/API/DB hoạt động.

Không cần cài Playwright MCP khi công cụ browser hiện tại đáp ứng task. Khi task/harness yêu cầu một công cụ cụ thể, ghi prerequisite và kiểm chứng đúng công cụ đó.

## Discovery và fallback

1. Với browser trực tiếp trong T3, gọi `preview_status` trước. Nếu chưa có tab có thể tự động hóa, thử `preview_open` trước khi kết luận không có browser.
2. Đọc `snapshot` và chọn locator từ nội dung; ưu tiên locator ổn định, tránh tọa độ nếu có cách đáng tin cậy hơn.
3. Tab người dùng sở hữu ở trạng thái human chỉ được đọc; dùng tab riêng để thao tác. Ghi owner/target, không tự đăng nhập hoặc dùng profile đã lưu của người dùng ngoài quyền task.
4. Lần lỗi đầu xem nguyên nhân và sửa argument nếu có thể. Công cụ T3 vắng mặt, `preview_open` báo rõ unsupported/unavailable, hoặc hai lần thất bại cùng bước trên tab mở là điều kiện fallback theo chỉ dẫn runtime; lưu raw error đã kiểm tra không chứa secret và lý do đổi công cụ.
5. Playwright Test dùng độc lập khi task yêu cầu bài regression lặp lại; không coi nó là cách né discovery T3 khi đang cần browser trực tiếp. Fallback CLI/MCP khác phải có môi trường/dependency và quyền phù hợp.

Chi tiết schema, ownership và quy tắc runtime hiện tại được ưu tiên. Tab đóng hoặc chỉ có screenshot không phải bằng chứng công cụ browser không dùng được.

## Bốn lớp bằng chứng

| Lớp | Có thể chứng minh | Không được suy ra |
| --- | --- | --- |
| Mockup/static/build | Layout, cấu trúc, compile theo check thực tế | Hành vi API/persistence/quyền |
| Browser fixture có mock | Các trạng thái UI/assertion được chạy | Web–API–DB thật hoặc provider |
| Sandbox web–API–DB | Luồng integration thật trong target thử đã xác minh | Production/thiết bị native/provider chưa thử |
| Live/provider/production | Chỉ phạm vi thực sự được phép và đã kiểm tra | Quyền tác động thêm hoặc toàn hệ thống luôn khỏe |

Ghi rõ lớp đang chạy trong task/report. Browser thật vẫn có thể gọi API mock; phải kiểm tra request target để tuyên bố end-to-end.

## Chuẩn bị trước test xuyên suốt

- Task/run ID, owner, acceptance và expected result đã có nguồn duyệt.
- Web/API origins và cổng thuộc task; xác minh cấu hình web đang gọi đúng API đó.
- DB thử riêng được kiểm tra identity từ cấu hình thực, seed có thể tái lập, tài khoản/role thử. Một env flag xác nhận không thay kiểm tra target.
- Browser context/tab/profile riêng phù hợp, viewport và trạng thái auth rõ.
- Quyền mutation, cách giữ report/trace/screenshot an toàn và cách release resource.
- Có lệnh start/stop/reset fixture thật được xác minh khi bootstrap ứng dụng. Pilot002 đã có `npm run pilot`, dừng mềm bằng stdin hoặc file run-local, `npm run test:e2e`; xem [LOCAL_RUN](LOCAL_RUN.md). Mỗi run tạo DB mới, không reset/xóa DB đã có để làm test xanh. Đây chưa là command sản phẩm.

## Cách thực hiện và kiểm kết quả

1. Ghi baseline và expected behavior trước thao tác.
2. Thao tác như người dùng: mở route, nhập form, bấm nút/keyboard/touch phù hợp.
3. Assert trạng thái UI: loading, success/error, enabled/disabled, nội dung và điều hướng.
4. Kiểm request/response: target đúng, method/status/payload phù hợp; không đọc/ghi log secret.
5. Kiểm persistence qua API đọc độc lập hoặc DB thử được phép; không chỉ dựa vào state trong trình duyệt.
6. Reload/đăng nhập lại khi acceptance cần để chứng minh dữ liệu đã lưu; thử retry/gửi trùng/quyền theo rủi ro.
7. Đối chiếu UI và dữ liệu; lưu assertion/report và giới hạn, rồi release đúng resource đã acquire.

Ví dụ minh họa tương lai: một thao tác ghi nhận công phải hiển thị đúng sau reload và xử lý gửi trùng đúng contract. Đây là tiêu chí kỹ thuật ví dụ, không phê duyệt hình thức chấm công hay luật tính công chưa được chốt.

## Vòng debug

Tái hiện → thu console/network/backend log liên quan → lập giả thuyết → thu hẹp lỗi frontend/API/auth/DB → sửa đúng lớp → chạy lại ca lỗi → chạy regression ảnh hưởng. Dùng systematic-debugging khi đã cài. Không đoán từ screenshot hoặc lặp thao tác mù.

Với lỗi có nguy cơ tái phát, bổ sung Playwright spec hoặc test lớp phù hợp. Spec cần assertion có ý nghĩa, locator ổn định, data seed kiểm soát, tránh chờ thời gian cố định tùy tiện và tránh phụ thuộc thứ tự test. Không bật retry để che một failure chưa hiểu.

## Evidence và review UI

Lưu ngày, runtime/browser/version khi lấy được, target/task/run, lớp kiểm chứng, viewport, assertion, kết quả, artifact và release. Chụp trạng thái liên quan; kiểm keyboard/focus/overflow/mobile khi áp dụng. Browser viewport mô phỏng không phải bằng chứng Android native hay thiết bị thật.

Che token/cookie, mật khẩu và dữ liệu nhân sự trước khi lưu/chia sẻ. Nếu trace có thể chứa dữ liệu nhạy cảm, chọn dữ liệu giả/cấu hình thu thập phù hợp; không đính kèm raw report chưa kiểm tra. Kết quả pass và xác nhận resource đã đóng là hai bằng chứng riêng.

UI review độc lập theo QUALITY_GATES và phạm vi task. Không kéo dài polish vô hạn; giải quyết lỗi acceptance, bàn giao quan sát ngoài scope rõ ràng.

## Gate nghiệm thu nền tảng browser

Chỉ Verified khi có pilot theo scope: mở được target, thực hiện thao tác, assertion UI/API/persistence đạt, thu bằng chứng phù hợp và release resource. Chạy thêm ca lỗi có kiểm soát để chứng minh debug/retest. Pilot002 đã kiểm sandbox ghi chú theo validation; chức năng nhân sự chưa có vẫn là Not run, không suy thành sản phẩm đã đạt.
