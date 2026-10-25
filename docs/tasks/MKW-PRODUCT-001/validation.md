# Validation — MKW-PRODUCT-001

Ngày 25/10/2026. Scope hiện tại chỉ tài liệu, không chứng nhận ứng dụng.

## Workspace và quyền

Base `a502c982e07f45e77895833fd86144a474254080`, worktree `agent-bootstrap`, branch `agent/mkw-agent-002`, sạch trước khi viết. Không tạo worktree mới hoặc sửa primary. Không dispatch child; không tạo server/port/DB/browser, cài dependency, chạy app hoặc chép dữ liệu nhân sự thật vào Git.

Dùng brainstorming architectural path, tiếp tục từ hội thoại thiết kế đã được người dùng đồng ý. Bước này ghi spec để review; chưa là quyền scaffold/code/stack/implementation-plan. Hồ sơ task và scope được tạo trước các file đặc tả.

## Tự review

Đối chiếu hội thoại với approved/requirements và design:

- Đã loại cách hiểu cũ “chờ xác nhận thì không tính tổng”; màu xanh chỉ nhắc, vẫn cộng dữ liệu bình thường.
- Công và tăng ca độc lập; không đặt trần1 công/ngày, không quy đổi tăng ca thành công, không chia công theo công trình.
- Cùng quyền và sửa trực tiếp; không tự thêm workflow duyệt hoặc audit bắt buộc.
- Ngày bắt đầu chọn riêng với thời điểm thêm; ngày kết thúc inclusive, sau đó `—`, tháng sau không hiện, giữ lịch sử.
- Điện thoại ưu tiên nhẹ, desktop đầy đủ, zoom/cuộn/định hướng ô; chưa claim thiết bị thật đã chạy.
- Excel có trong scope; layout một sheet/công thức, miền số, tài khoản, xung đột và sửa mốc ngày còn là câu hỏi/đề xuất rõ. Không tự điền câu trả lời cho đủ spec.
- Không có API/schema/stack hay app test Verified. Không thay PRODUCT.md/DESIGN.md đang mô tả pilot. Tài liệu sản phẩm mới được định tuyến tại authority map.

## Check và review

`npm run check:docs`, cwd worktree: exit0, kiểm UTF-8 Markdown và links/anchors/fences của30 tài liệu hiện hành; reports/templates lịch sử chỉ kiểm UTF-8 theo checker. `git diff --check`: exit0 cho diff tài liệu tracked; diff staged bao gồm file mới được kiểm lại trước commit. Rà placeholder: không có TODO/TBD bỏ dở; Q1–Q6 là quyết định cần làm rõ, không coi như đã trả lời. Không sửa checker để cho qua.

Spec review người dùng: chưa thực hiện trên bản viết; task **In review**, chưa Done hoặc integrated. Tự review nội dung không được gọi là review độc lập. Không có quyền dispatch reviewer mới được suy từ task bootstrap đã đóng.

Không chạy lại hash/app/browser tests cho thay đổi Markdown thuần. Gate độc lập cho code/tooling/persistence sản phẩm áp dụng ở task triển khai sau theo QUALITY_GATES.

## Bàn giao

Bản viết là đặc tả để review, không phải implementation-ready cho các phần còn Q1–Q6. Next action: người dùng review bản viết, trả lời lần lượt các quyết định ảnh hưởng; cập nhật nguồn chuẩn trước thiết kế kiến trúc/kế hoạch triển khai. Commit/tip thực tế có trong Git log; không tự ghi SHA của chính commit vào nội dung commit đó.

## Cập nhật lựa chọn số công — 25/10/2026

Theo trả lời mới của người dùng, cập nhật requirements, design và bước tiếp trong INDEX: chọn nhanh0,5/1/1,5/2/2,5; Tùy chỉnh để nhập lớn hơn2,5. Tự review xác nhận không biến2,5 thành trần hoặc suy bước công thành bước giờ tăng ca. Q1 đã giải quyết một phần; độ chính xác/giới hạn tùy chỉnh vẫn chưa chốt. Thêm AC11 ở trạng thái Not run; phạm vi vẫn chỉ tài liệu.

## Cập nhật bước tăng ca — 25/10/2026

Người dùng xác nhận giờ tăng ca có bước nửa giờ như các bước công. Cập nhật nguồn requirements, design/AC11/Q1 và next action: chọn nhanh0,5/1/1,5/2/2,5 giờ, tùy chỉnh lớn hơn2,5 theo bước0,5 giờ. Đây là xác nhận mới, thay phần chưa chốt bước tăng ca ở checkpoint trước. Tự review giữ nguyên đơn vị/tổng riêng và không tự quyết định ô không tăng ca hay làm tròn. Kiểm tra tài liệu bằng `npm run check:docs` và `git diff --check`; không chạy app/browser vì chỉ sửa Markdown.

## Cập nhật ô không tăng ca — 25/10/2026

Người dùng đồng ý đề xuất để trống ngày không tăng ca. Cập nhật requirements, design/AC04/Q1 và INDEX; không tự điền0/F hoặc cộng giờ cho ô trống. Quy tắc mốc ngày N/— và màu nhắc độc lập giữ nguyên. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`, không chứng nhận ứng dụng.

## Cập nhật tài khoản cùng quyền — 25/10/2026

Người dùng đồng ý hai tài khoản riêng cho người chấm chính và sếp, cùng quyền xem/nhập/sửa toàn công ty. Cập nhật requirements, design/AC01/Q2 và INDEX. Chưa quyết định phương thức đăng nhập/khôi phục, chưa thêm vai trò khác hoặc workflow duyệt. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`, chưa có triển khai hoặc kiểm thử quyền trên ứng dụng.

## Cập nhật xung đột cùng ô — 25/10/2026

Người dùng đồng ý báo người lưu sau khi hai người sửa cùng một ô từ dữ liệu cũ, hiển thị giá trị mới trước khi quyết định sửa tiếp. Cập nhật requirements, design/Q3/AC12 và INDEX; không tự tạo quy trình duyệt hoặc quyết định cơ chế API. AC12 là Not run. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`, chưa kiểm chứng xử lý xung đột trên ứng dụng.

## Cập nhật phương pháp UI/UX — 25/10/2026

Theo chỉ dẫn người dùng, bố cục/vị trí phải qua skill thiết kế, không tự kết luận. Đã đọc Impeccable/shape và UI UX Pro Max; chạy context một lần với target design của task. Context tải cả PRODUCT.md của pilot nên không dùng nó làm brief chấm công hoặc sửa root. Tra cứu UX ban đầu có kết quả lẫn chủ đề; thu hẹp một lần sang touch target size, trả về đúng Mobile Touch và Web Target Size (Minimum); chỉ dùng làm tham khảo theo nền tảng, không tự áp một kích thước cho mọi nơi hoặc thêm bulk edit vào scope. Chưa tạo/chọn mockup, chưa chứng nhận chất lượng UI. Bổ sung requirements/design/INDEX để ghi hai nút Công/Tăng ca chưa được duyệt; phạm vi vẫn chỉ tài liệu.

## Cập nhật quy mô nhân sự — 25/10/2026

Người dùng cho biết hiện khoảng20 người, sau này có thể nhiều hơn rất nhiều. Cập nhật requirements/design/Q6/INDEX, không suy ra trần, số lượng tương lai cụ thể hoặc quyết định phân trang/ảo hóa. Chưa có benchmark hay kiểm thử hiệu năng sản phẩm. Thay đổi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`.

## Cập nhật nhóm điện thoại — 25/10/2026

Người dùng xác nhận sử dụng cả iPhone và Android. Cập nhật requirements, design/AC08/Q6 và INDEX. Chưa suy ra mẫu máy/phiên bản/trình duyệt hoặc claim đã thử cảm ứng thật; giữ rõ viewport mô phỏng không thay thiết bị thật. Phạm vi chỉ Markdown; kiểm bằng `npm run check:docs` và `git diff --check`.

## Checkpoint bản mẫu trực quan — 25/10/2026

Người dùng đã duyệt bước thiết kế bản mẫu bằng hai skill UI. Scope mở rộng sang HTML nghiên cứu tương tác, không thành triển khai app. Ba phương án/giới hạn tại ui/BRIEF.md; writer vẫn inline. Risk bản mẫu thấp: dữ liệu giả, không gọi API, không persistence/auth, không thay pilot hoặc primary. Tự review và người dùng review bố cục; gate code sản phẩm không được thay bằng kết quả này.

Đã đọc Impeccable shape/new-work/craft-floor, dùng UI UX Pro Max theo brief. Context script nhận PRODUCT.md pilot nên áp nguồn requirements/design của task. Không sửa artifact root hoặc cài dependency. Trình bằng T3 HTML inline thay việc tạo thêm local decision server; không có port/process cần giữ. Chưa chốt visual world hoặc coi nội dung demo là quyết định nghiệp vụ.

Kiểm T3 `html_preview` với tài liệu HTML tự chứa, width390 (dark) và1200 (light): cả hai báo `CHECKS PASSED: 22`, không có console error ở lần cuối. Các kiểm tra DOM gồm20 người/31 ngày, đổi công/tổng, màu không đổi tổng, công/tăng ca độc lập, tùy chỉnh tăng ca3,5, từ chối3,25 trong mẫu, trống/F/Hủy, A/B/C và chuyển loại, tìm người/empty state, reset, N/— không sửa, mở rộng bảng và bố cục theo chiều rộng. Đây là kích hoạt DOM `.click()` trong headless HTML preview, không claim thao tác người dùng thật hoặc Playwright E2E sản phẩm. Script kiểm và kết quả nằm trong `.agent-runs/MKW-PRODUCT-001/ui-preview-checks.js` và `ui-preview-results.json` (ignored, cùng worktree).

Đã xem ảnh render ở khung điện thoại, vùng chat và desktop; sửa tương phản chữ ngoài bản mẫu theo theme. Một assertion desktop ban đầu Failed vì đọc bố cục giữa animation max-width; bỏ animation kích thước, chạy lại xác nhận desktop có hai cột (896px và270px) và điện thoại một cột (376px), không nới assertion. Ngày/nhân sự mẫu đang chọn được đặt trong vùng cuộn nhìn thấy.

`node .agents/skills/impeccable/scripts/detect.mjs --json docs/tasks/MKW-PRODUCT-001/ui/attendance-concepts.html`: lần cuối exit1, còn một warning `flat-type-hierarchy` về nhiều cỡ chữ nhỏ gần nhau. Đã sửa transition kích thước, skipped heading và shadow màu; không tắt/sửa detector. Warning typography giữ mở để xử lý khi phát triển phương án được chọn; không claim detector đạt hoặc UI đã hoàn thiện. Scope hiện tại là artifact để review, không Done sản phẩm.

Các AC sản phẩm vẫn Not run. Chưa có pinch zoom/cảm ứng/bàn phím trên iPhone/Android thật, keyboard Enter/Tab theo bảng, đăng nhập, xung đột hai người, lưu API/DB, export Excel, hiệu năng danh sách lớn hoặc kiểm accessibility đầy đủ. Bản mẫu chỉ giữ dữ liệu trong bộ nhớ và reset khi tải lại. Next action: người dùng chọn/chỉnh hướng A/B/C trước thiết kế chi tiết và review bản đặc tả viết.

## Quyết định chọn hướng C và phản hồi chất lượng UI — 25/10/2026

Người dùng chọn C về tổ chức/thao tác, đồng thời đánh giá diện mạo bản mẫu còn thô/xấu, chưa chuyên nghiệp. Cập nhật requirements, design/Q5, ui/BRIEF và INDEX; không coi UI hiện tại đã duyệt hoặc gọi bước polish đơn giản là đủ. Giữ HTML so sánh ở checkpoint trước làm lịch sử, chưa sửa giao diện hoặc chạy lại browser cho thay đổi tài liệu. Next action: phát triển thiết kế thị giác C hoàn thiện hơn bằng Impeccable + UI UX Pro Max để người dùng review. Kiểm tài liệu bằng `npm run check:docs` và `git diff --check`.

## Rà soát cấu trúc/reuse khi mở rộng feature — 25/10/2026

Theo yêu cầu mới, khảo sát các nguồn hiện hành AGENTS, authority/routing, execution/permissions/skill policy, quality/browser rules, product dossier, package.json, ESLint, docs checker và inventory file kể cả root ẩn. Base `bb390add47a862b12d7a9ad4fdd74cc0399b46a4`, workspace sạch trước sửa. Đối chiếu xác nhận chưa có cây source sản phẩm, rule import/boundary/cycle, type/build pipeline hoặc design system sản phẩm; không suy kết quả pilot thành các năng lực này. Chưa thấy cấu hình CI trong checkout, không kết luận về CI ngoài repo.

Đã viết technical/maintainability-review.md: ba lựa chọn tổ chức và phương án đề xuất, cây module ứng viên, ownership UI/pattern/feature, chiều import, tiêu chí shared, state/contract/naming/update component và enforcement cần có. Ghi rõ các rule là Draft/Proposed và chưa cài shadcn/Radix/React. Tự review giữ hướng C, FE/BE tách ứng dụng, không dùng lại DOM component cho Android native; không thêm nghiệp vụ hoặc module tương lai vào scope. Cập nhật yêu cầu reuse đã xác nhận cùng định tuyến, không áp proposal vào AGENTS/lint/quality policy.

`npm run check:docs` cwd worktree: exit0,32 current documents; `git diff --check`: exit0. Quét TODO/TBD/FIXME trong báo cáo mới không có mục bỏ dở; các lựa chọn chưa duyệt được ghi rõ. Kiểm staged diff trước commit. Không chạy pilot/browser/app tests vì chỉ sửa Markdown, không cài dependency hoặc acquire server/DB/browser. Tự review không được gọi là review độc lập; task và kiến trúc sản phẩm vẫn In review. Next action: người dùng review phương án nền UI/cấu trúc, sau đó hoàn thiện chuẩn và kế hoạch kỹ thuật đúng phần đã duyệt.

## Ghi nhận nền tảng đã chốt — 25/10/2026

Người dùng xác nhận “Tôi chốt” nền tảng đã trình. Base `5c24c357208a48a165ccb96ba929f8abffa749a1`. Thêm ADR-001 và bốn nguồn sở hữu ARCHITECTURE/CODE_CONVENTIONS/UI_SYSTEM/API_CONTRACTS; cập nhật AGENTS, authority/routing, README, docs INDEX và dossier cho nhất quán. Giữ báo cáo khảo sát và checkpoint validation cũ đúng mốc; đánh dấu quyết định mới thay phần nền tảng đã được chốt. Không đổi policy quyền/review, không suy toàn bộ chi tiết đề xuất thành quyết định.

Tự review đối chiếu quyết định: shadcn/ui nền Radix; feature/module; web/API riêng trong cùng repository; ownership shared/feature; chuẩn cần được kiểm bằng công cụ. Phân biệt chuẩn tài liệu hiện hành với công cụ sản phẩm chưa cài/enforce; hướng C giữ nguyên, diện mạo chưa duyệt. Stack chi tiết, contract/schema, đầy đủ spec và implementation plan vẫn cần thiết kế/review. Không dispatch child; đây không phải review độc lập.

Kiểm tại worktree: `npm run check:docs` exit0, kiểm UTF-8 và links/anchors/fences của37 tài liệu hiện hành; `git diff --check` exit0. Git có cảnh báo chuẩn hóa CRLF sang LF, không có lỗi whitespace. Không chạy app/browser tests vì chỉ sửa Markdown; không cài dependency, acquire tài nguyên hoặc thay primary. Bước tiếp: thiết kế kỹ thuật chi tiết và bản mẫu C hoàn thiện để review, không tự triển khai sản phẩm.
