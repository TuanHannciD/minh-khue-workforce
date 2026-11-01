# Đề xuất phân trang và tìm nhân sự toàn bộ kết quả

Ngày01/11/2026. **Proposed — chờ review độc lập và quyết định thiết kế của người dùng.** Đây là đánh giá tiếp nối kiến trúc, chưa là production spec Accepted, implementation plan hoặc quyền triển khai/thử nghiệm. BASE khảo sát sạch `e8b645c2a05176e6a904e913fb18e9da745e5fcc`; sole design writer Sol gpt-6.1-sol/high, không Agent con. Phạm vi và kiểm chứng tại [INDEX](../INDEX.md), [validation](../validation.md); hồ sơ trước sửa/handoff ignored `.superpowers/sdd/implementation-plan/pagination-search-assessment-r1.md`.

## 1. Kết luận và yêu cầu mới

**Nên chuyển sang phân trang nhân sự và tìm trên toàn bộ kết quả của tháng. Khuyến nghị bước nhỏ nhất: phân trang phía client trên snapshot tháng hiện có, mặc định25 người/trang, có50; chưa đổi API.** Khoảng20 người hiện tại vẫn nằm trong một trang. Kịch bản1000 người thành40 trang25 người; mọi người vẫn truy cập được mà không cùng dựng vào bảng. Đây là đề xuất quy mô render, chưa có phép đo chứng minh nhanh hoặc đạt G3.

Chỉ dẫn người dùng01/11: “Hiện đang cố nhét 1000 người vào 1 page ư. Nếu đúng là như vậy thì đánh giá chuyển qua dùng cách phân trang và search trang chứ ko nên nhét hết vào 1 page như vậy”. Yêu cầu này cho phép đánh giá thay UX toàn bộ dòng; không cần xin quyền đánh giá lại. “Search trang” được hiểu đề xuất là tìm người dù đang ở trang khác, đưa họ vào kết quả có thể tới ngay, cùng khả năng nhập số trang để nhảy trực tiếp. Chưa coi cách hiểu hoặc mọi mặc định bên dưới là đã được người dùng duyệt.

Giữ C xanh lá, một bảng chuyển Công/Tăng ca, tên/ngày/tổng sticky, cuộn ngang/dọc, zoom, nhập chuột/bàn phím/cảm ứng. Giữ nghiệp vụ, auth, CAS, bản nháp, atomic batch, poll15s và Excel. Chỉ đề xuất delta tổ chức dòng, tìm/điều hướng và ranh giới chọn qua trang. [Requirements](../approved/requirements.md) ghi hiện tại khoảng20 người/tháng, chưa có trần tương lai; **1000 là dataset benchmark giả, không phải headcount thực hiện tại**.

## 2. Hiện trạng được nguồn hỗ trợ

- [AttendancePage](../../../../apps/web/src/features/attendance/ui/attendance-page.tsx): lọc `month.employees` bằng tên viết thường tiếng Việt chứa chuỗi đã trim, hoặc ID chứa chuỗi đã trim. Lọc trước khi đưa vào Grid; không có page/pageSize. `visibleMonth` chỉ thay employees, giữ cells/totals toàn tháng. Đây đã là tìm toàn snapshot tháng, không tìm riêng vùng đang nhìn.
- [AttendanceGrid](../../../../apps/web/src/features/attendance/ui/attendance-grid.tsx) và [AttendanceRow](../../../../apps/web/src/features/attendance/ui/attendance-row.tsx): mỗi người được truyền vào tạo một dòng, đầy đủ ngày của loại đang xem. Khi bỏ tìm kiếm,1000 người ×31 ngày tạo31.000 cell components; snapshot có62.000 logical cells cho hai loại. Không đồng nghĩa31.000 editor/input mở cùng lúc. [Ma trận hiện hành](verification-matrix.md) ghi đúng quy mô này.
- [Query](../../../../apps/web/src/features/attendance/api/use-attendance-month.ts) dùng [key](../../../../apps/web/src/features/attendance/api/query-keys.ts) attendance/userId/session epoch/month; fetch toàn tháng, poll15.000ms khi mounted/visible/authenticated, refocus/reconnect. Đọc retry có giới hạn; mutation không tự retry.
- [Controller](../../../../apps/api/src/modules/attendance/attendance.controller.ts), [parser](../../../../apps/api/src/modules/attendance/attendance-validation.ts) và [MonthDto](../../../../apps/api/src/modules/attendance/attendance.dto.ts): GET tháng chỉ nhận `month`; thêm page/search hiện bị strict shape từ chối. Không có DTO page, tổng số kết quả hay read endpoint tìm kiếm server.
- [AttendanceService.readMonth](../../../../apps/api/src/modules/attendance/attendance.service.ts) đọc READ ONLY REPEATABLE READ: membership theo giao khoảng làm việc với tháng, sort `Intl.Collator("vi")` theo tên rồi ID; dựng đủ ô cả hai loại và tính tổng cùng snapshot. [Repository nhân sự](../../../../apps/api/src/modules/employees/employees.repository.ts) sở hữu điều kiện giao tháng; repository attendance đọc dữ liệu đã lưu trong tháng. Không được dùng số trang hoặc vị trí dòng làm định danh.
- [AttendanceDraft](../../../../apps/web/src/features/attendance/model/attendance-draft.ts) là owner in-memory ngoài Query và DOM dòng. Open/openBulk đóng băng nhân sự/ô/targets/source/revisions; polling không rebase raw hoặc baseline. Page/Workspace dùng guard giữ/bỏ trước đổi ngữ cảnh.
- [Design13–14](../design.md#13-chọn-ôvùng-rời-và-kéo-điền-lặp--bổ-sung28102026), [selection](../../../../apps/web/src/features/attendance/model/cell-selection.ts), [hook](../../../../apps/web/src/features/attendance/model/use-cell-selection.ts) và [gesture](../../../../apps/web/src/features/attendance/ui/use-grid-gesture.ts): rectangle theo thứ tự người hiển thị, chọn rời theo ID/ngày/kind, fill từ nguồn nhìn thấy; freeze tập cũ khi hợp thêm vùng. Thêm phân trang không thể chỉ cắt JSX rồi để keyboard/gesture tiếp tục dùng toàn danh sách.

Các map attendance web/API/employees chỉ được dùng để định vị; khảo sát đã đọc các đơn vị Grid/Page/Workspace, query/transport calls, ordering/membership, selection/fill/gesture/draft/recovery/export liên quan và các test consumer về context, navigation, polling. Đây là **đối chiếu source**, không fresh runtime verification.

## 3. Hai đường triển khai để quyết định

### A. Client phân trang snapshot đầy đủ — khuyến nghị trước

Luồng đề xuất: snapshot tháng → tìm/lọc trên toàn membership → giữ thứ tự server → lấy lát25/50 người → dựng bảng của trang. Chỉ projection hiển thị và tương tác dùng danh sách trang; snapshot đầy đủ/tổng, draft và export có owner riêng. Không làm một `MonthDto` cắt bớt rồi coi đó là toàn bộ tháng cho mọi consumer.

Lợi ích: không đổi wire DTO, endpoint, membership, thứ tự server, read transaction hoặc write contract; dùng lại search tên/ID có sẵn. Có thể nhảy trang ngay sau khi đã tải snapshot; ít state mạng hơn server paging. Một tháng31 ngày dựng tối đa775 cell components ở25 người hoặc1.550 ở50 người cho loại đang xem, cộng header/tổng/controls; không phải tổng số DOM nodes.

Đánh đổi: vẫn tải/parsing/cache62.000 logical cells nếu snapshot1000×31×2; mỗi poll vẫn đọc/tạo/serialize toàn tháng. Chi phí server, payload, memory dữ liệu và full-data projection không tự giảm. Khi hiện thực cần tách projection trang khỏi phần index toàn snapshot, tránh vô tình vẫn dựng toàn bộ rows/keyboard/gesture maps đắt tiền theo mỗi page change. Search vẫn quét danh sách nhân sự đầy đủ. API budget không được gọi là “đã sửa” nhờ phân trang DOM.

Lý do chọn trước là nguồn hiện có đã cung cấp snapshot nhất quán và search local; historical API/cold load1000 từng đạt budget trên desktop thử, trong khi scroll toàn bảng Failed. Evidence đó hỗ trợ ưu tiên giảm cây render, không chứng minh mạng điện thoại hoặc UX phân trang mới đã đạt. Với khoảng20 người, bước này giữ một trang và tránh thêm contract server không cần thiết ngay.

### B. Server phân trang và tìm kiếm — phù hợp khi chi phí dữ liệu cần giảm

Server phải tìm trên **toàn membership tháng trước khi cắt trang**, trả ô của nhóm người trang đó. Không thể lấy một trang rồi client lọc và gọi đó là global search. Có thể giảm dữ liệu truyền, parse/cache và projection client; tổng toàn tháng/count/search server vẫn có chi phí, không hứa truy vấn tổng trở thành page-sized.

Đổi contract thực sự: thiết kế query/validation page hoặc offset/limit, giới hạn pageSize, search semantics, thứ tự, metadata số kết quả/trang/phạm vi tổng, response DTO riêng và OpenAPI/generated types; query key thêm mọi tham số ảnh hưởng response. Giữ full MonthDto cho export/consumer cũ hoặc có đường tương thích rõ, không đổi nghĩa ngầm thành partial snapshot. Không chốt tên endpoint/field wire mới trong đánh giá này.

Direct page jump và page count hợp với offset/page-number hơn cursor thuần. Nếu sau này chọn đường này, phải giải quyết tên trùng bằng employeeId tie-breaker, collation tương thích sort hiện tại, insert/rename/đổi mốc giữa hai lần đọc và số trang thay đổi. REPEATABLE READ trong từng request không cố định membership xuyên các request. Cần quyết định snapshot/version metadata hoặc refresh/reset protocol, không dùng `fetchedAt` làm CAS token. Revision ô/nhân sự vẫn nguyên; page không có nghĩa đã khóa dữ liệu.

Polling15s khi dùng page query cần thiết kế invalidation/cache/total freshness, cập nhật ngoài trang, stale response/cancel và reconcile targets/source theo ID độc lập page. Batch vẫn một transaction trên tập đích rõ, không chia save theo trang. Đây cần **thiết kế DTO/query/contract/revision/selection riêng được review và quyết định trước phần phụ thuộc**, chưa được proposal này phê duyệt.

Không khuyến nghị hybrid mới ngay: tải toàn bộ danh sách người rồi tải ô từng trang có thể giúp locate người, nhưng phải thêm metadata membership/order/version và nhất quán tổng với ô. Hiện đã có full snapshot, chưa có bằng chứng buộc thêm đường đọc thứ ba. Chuyển sang B khi phép đo phù hợp cho thấy tải/poll/full-data memory là nút thắt, hoặc quyết định sản phẩm đòi dữ liệu không tải toàn bộ; không đặt ngưỡng nhân sự tùy ý từ benchmark.

## 4. UX đề xuất có thể review

Tất cả hành vi mới trong mục4–6 là **Proposed**. Đây là mặc định cụ thể để quyết định, không mở lại phỏng vấn yêu cầu/UI đã chốt.

### Quy mô trang và điều hướng

Mặc định25, tùy chọn50, không thêm “Tất cả”.25 ×28–31 ngày tương ứng700–775 ô theo loại;50 là1.400–1.550 ô.25 có một nửa số dòng/ô mỗi trang so50 nhưng1000 người cần40 thay vì20 trang; số lần lật trang tăng nếu duyệt tuần tự toàn danh sách. Ưu tiên25 cho điện thoại và quét đúng người;50 phục vụ desktop muốn so nhiều dòng. Đây là đánh đổi mật độ, chưa phải con số được benchmark chọn hoặc trần chọn ô nghiệp vụ.

Đặt tìm nhân sự ở toolbar hiện tại. Điều hướng trang ở ngoài vùng cuộn ngang của bảng: “Trước”, “Trang p / P”, “Sau”, ô có label “Đến trang” + nút “Đi”; giữ truy cập từ đầu và cuối bảng, hai vị trí điều khiển chung một state. Không hiển thị40 nút số trên điện thoại. Nhập trang ngoài1…P/không nguyên báo lỗi tại field, không đổi trang khi mới gõ một chữ số. Trước/Sau disabled đúng biên, nút/field theo tokens C và vùng chạm44 CSS px hiện có; không dùng swipe ngang để lật trang.

Trạng thái ví dụ giả: “1.000 kết quả · Hiển thị26–50 · Trang2/40 ·25 người/trang”. Khi tìm: “8 kết quả trong1.000 nhân sự của tháng · Hiển thị1–8 · Trang1/1”. Zero results ghi “0 kết quả · Hiển thị0–0”, không tạo trang1/0; ẩn/khóa pager không dùng được. Tháng không có người khác với tìm không khớp.

### Tìm người xuyên trang

Giữ các field thực có: tên và ID. Với A, áp phép tìm hiện hành trên mọi employee của tháng rồi mới cắt trang. Người trước đó ở trang37 vẫn tìm được khi đang trang1; khi từ khóa thay đổi, kết quả mới bắt đầu trang1, không buộc đoán trang cũ. Nhập số trang là chức năng riêng, không hiểu chuỗi tên thành page number. Không đòi thêm autocomplete hoặc màn hình mới để giải quyết nhu cầu này.

Tiếp tục phép `trim`/lowercase tiếng Việt/substring cho tên và ID substring theo source; chưa tự thêm mã nhân viên, công trình, số điện thoại, fuzzy search, tokenization hay bỏ dấu/đổi đ↔d/Unicode normalization. Accent-insensitive hoặc đổi cách match ID là quyết định semantics riêng nếu cần; không gọi chúng đã được duyệt. Search không mở rộng ra người ngoài membership tháng hoặc toàn lịch sử. Nhãn/hint cần nói rõ “Tìm theo tên hoặc ID trong toàn bộ nhân sự của tháng”; xóa search khôi phục toàn kết quả ở trang1.

### Chuyển ngữ cảnh, thứ tự và poll

- Đổi search/filter đã có hoặc tháng: qua guard trước khi commit thay đổi nếu đang có phần nhập; sau đó về trang1. Đổi loại Công/Tăng ca cũng giữ guard; vì membership/search không đổi, đề xuất giữ số trang và pageSize, không reset về người khác. Không thêm filter nghiệp vụ mới.
- Đổi pageSize: qua cùng guard; giữ người đầu trang hiện tại làm mốc định danh nếu còn trong kết quả, tính lại trang chứa người đó; về1 nếu không còn. Không mất từ khóa vì đổi25↔50. State page/pageSize/search ở React feature; không thêm PII vào URL/localStorage.
- Poll chỉ đổi giá trị/nhắc/tổng, không đổi membership/order: giữ trang, nhận snapshot mới theo luồng15s; raw và frozen revisions không đổi. Không reset trang sau mỗi poll/save/refocus.
- Poll thêm/bớt/rename/đổi mốc làm đổi membership/order: khi không có draft, giữ page number nếu hợp lệ, clamp về trang cuối nếu vượt phạm vi; zero chuyển trạng thái rỗng. Báo danh sách đã cập nhật, không đánh đồng row index cũ với cùng người. Thứ tự mỗi snapshot vẫn tên tiếng Việt rồi employeeId; không re-sort từng trang hoặc dùng tên làm key.
- Khi cập nhật membership/order buộc thay tập người/trang đang chỉnh, đề xuất hoãn áp thay đổi bố cục đó và đưa qua guard ngữ cảnh đang có. Query vẫn nhận dữ liệu mới; giữ phần hiển thị trước với fetchedAt/nhãn “Danh sách đã thay đổi, phần nhập được giữ” đến khi người dùng giải quyết. Không gọi snapshot đang giữ là mới đồng bộ; không biến snapshot mới thành baseline draft. Đây là delta trình bày cần quyết định cùng phân trang. Sau khi hoàn tất/bỏ phần nhập có chủ ý mới recompute/clamp; giữ không tự lật trang.
- Không có delete employee API trong bản đầu. Nếu ID thiếu ngoài contract, hoặc đổi mốc làm người rời tháng, áp quy tắc thu hẹp kết quả trên nhưng giữ draft theo ID, reconcile độc lập membership; không giả ID khác thay thế, không thêm hard-delete feature. Không thể ghi mới vào N/— để cứu draft.

### Bàn phím, cảm ứng, screen reader và trạng thái tải

Grid/rectangle/hit-test/nextEligibleCell dùng tập dòng **của trang**, không tìm đích vô hình trong orderedMonthCells đầy đủ. Mũi tên và Enter chuyển trong trang theo hành vi hiện có, bỏ N/—; ở biên không tự chọn/ghi/lật trang. Tab cuối rời bảng tới điều hướng trang; lưu bằng Enter/Tab ở ô biên không có đích thì trả focus ô vừa lưu, vẫn tới pager được. Chuyển trang bằng controls rõ ràng; hủy gesture/endpoint đang chờ, release timer/capture/edge-scroll, không phát lại gesture sau guard.450ms/10px, multi-touch cancel và cách chạm/hai đầu/bàn phím thay kéo giữ nguyên.

Sau lật trang thành công: reset cuộn dọc lên đầu nhóm người, giữ vị trí ngày cuộn ngang nếu hợp lệ; focus tới tiêu đề bảng/trạng thái trang có thể focus, không tự mở editor. Khi search đang gõ, giữ focus search, đọc số kết quả bằng status polite; không chuyển focus mỗi ký tự hoặc mỗi poll. Keep/Escape của guard trả focus opener khả dụng, giữ raw/đơn vị/identity. Focus không bị sticky header/footer/pager hoặc bàn phím điện thoại che.

Mỗi trang giữ một semantic table, caption nói tháng/loại/phạm vi người và tổng toàn tháng; header hàng/cột, tên/ID/ngày/đơn vị/nhắc vẫn đọc được. Pager là navigation có tên, current page rõ và thông báo chuyển trang/số kết quả đủ ngữ cảnh. Không giả ARIA có1000 dòng được mount. App search hỗ trợ tìm người không có trên DOM trang hiện tại; browser Ctrl+F chỉ có phạm vi DOM và không là đường tìm toàn công ty được cam kết. Không cần render-all fallback chỉ để browser Find hoặc SR đọc; phải kiểm SR thực với tìm/pager/table từng trang.

A: tải đầu dùng loading/error/retry hiện có cho toàn snapshot; lật trang local không tạo network loading giả. Background lỗi giữ snapshot/fetchedAt và cảnh báo cũ, không biến thành0 results. B nếu được chọn: page request có loading/busy, không gắn nhãn trang mới cho rows cũ; lỗi giữ đúng trang cũ và nút thử lại read, không mất draft hay nhận response cũ vào query khác. Lỗi auth/session theo luồng hiện hành. Chưa có browser/mobile/SR check mới trong assessment này.

## 5. Chọn vùng, điền lặp và bản nháp

**Mặc định đề xuất: rectangle, chọn rời và fill chỉ trong một trang.** Chọn qua nhiều người/ngày trong trang vẫn đầy đủ; overlap dedupe; không kéo qua pager hay auto-page khi sát đáy. Source phải đang hiển thị/hợp lệ mới bắt đầu fill. Trang khác không tự trở thành đích vì nằm giữa hai row indexes hoặc vì search trước đó từng nhìn thấy.

Đây là **giới hạn UX mới cần người dùng quyết định**: design13 chấp nhận chọn qua nhiều người/ngày trong tháng, trước phân trang tất cả người khớp lọc cùng được hiển thị. Người ở hai trang khác nhau sẽ không nằm trong cùng một lựa chọn/batch theo mặc định này. Không được tuyên bố thao tác đó vẫn tương đương hoặc tự chia một batch thành nhiều lần Áp dụng; nhiều lần lưu không bảo toàn atomicity của một ý định xuyên trang.

Phương án thay thế nếu cần một batch qua nhiều trang: thiết kế vùng “các ô đã chọn” tích lũy explicit IDs/keys, snapshot/revision đóng băng cho mỗi lần thêm, đếm cả đích ngoài trang và nguồn, cho xem/bỏ từng người/ô trước Áp dụng. Rectangle/fill trực tiếp vẫn page-local; thêm trang khác phải là hành động rõ, không checkbox “tất cả” ngầm. Source/skip/mode/employee CAS và một transaction áp chung toàn tập; hidden targets chỉ có thể ghi sau review/xác nhận rõ tập xuyên trang. Cách này cần quyết định dirty-guard/lifecycle/recovery riêng, lớn hơn thay đổi nhỏ khuyến nghị. Không có khả năng xuyên trang này trong source hiện tại.

Draft owner phải tồn tại độc lập việc mount/unmount trang. Đổi trang, nhảy trang, đổi size/search/filter trong khi có editor/bulk preview đều dùng guard hiện hành: **Giữ phần nhập** giữ nguyên trang/raw/reminder/custom/error/mode/targets/source/revisions; **Bỏ phần nhập và tiếp tục** chỉ discard sau lựa chọn rõ, hủy selection/endpoint cũ rồi chuyển. Lưu/Áp dụng là hành động riêng; pager không tự save/discard, kể cả input đang sai `3,25`. Pending/reconciling chặn chuyển theo cơ chế hiện có; không đổi key Page theo số trang để lén reset owner.

Nếu polling làm tập cũ không còn hiển thị hợp lệ, giữ draft/đối chiếu và chặn việc dùng tập đó như lựa chọn của trang mới. Không lọc targets thành giao với trang mới, không tự thêm người mới để giữ hình chữ nhật. Outcome unknown vẫn chưa biết kết quả dù bỏ draft/chuyển trang; read/abort không hủy write cũ. Recovery đọc original target/source IDs kể cả ngoài tháng; chỉ quyết định rõ sau đối chiếu mới tạo intent mới.

Một Apply tiếp tục gửi đúng một batch frozen targets, dedupe, employee/cell/source revisions; conflict một ô dừng cả batch. Fill-empty giữ số/F, reminder-only vẫn là trống, replace không bỏ CAS; N/— bỏ qua và đếm; source chỉ đọc/không chép reminder, source/skip/occupied bị loại/eligible0 không fence. Trang là ranh giới tương tác đề xuất, không là unit transaction hoặc lý do giảm kiểm xung đột.

## 6. Tổng, Excel, in và lý do tránh hai cấu trúc cũ

Giữ tổng từng người đủ cả tháng; footer theo ngày và grandTotal lấy snapshot **toàn membership tháng**, kể cả người ngoài trang và người không khớp search như source hiện nay. Đổi caption/nhãn footer thành “Tổng toàn tháng · tất cả nhân sự”, luôn nói rõ để không tưởng đang cộng25 dòng. Mặc định không thêm subtotal trang hoặc filtered total. Nếu sau này bổ sung phải ghi “Tổng trang này”/“Tổng kết quả tìm kiếm” tách riêng, không thay ý nghĩa tổng cũ hoặc trộn công/giờ/draft vào tổng đã lưu.

[ExportButton](../../../../apps/web/src/features/attendance/ui/export-button.tsx) và [API export](../../../../apps/api/src/modules/attendance/export/attendance-export.service.ts) hiện gửi tháng, gọi readMonth độc lập browser cache/draft rồi [workbook](../../../../apps/api/src/modules/attendance/export/attendance-workbook.ts) tạo một sheet Công trên/Tăng ca dưới, công thức SUM và cached totals. **Giữ xuất toàn tháng đã lưu, không xuất riêng trang hoặc tự thêm filtered export.** Search/page không được truyền vào export để âm thầm đổi phạm vi/công thức. File có thể mới hơn snapshot UI vì là lần đọc riêng; không hứa hai request cùng snapshot.

Nếu cần in đầy đủ tháng, dùng workbook đầy đủ hiện có để in; một luồng in toàn tháng trong app về sau phải tạo từ server snapshot riêng và được thiết kế/kiểm riêng. Không có evidence full-month app print hiện hành; Ctrl+P trên trang phân trang không được quảng bá là in toàn bộ. Không cần dựng lại1000 dòng vào cây bảng chỉnh sửa để phục vụ in/export; không thêm PDF/import hay đổi Excel formulas trong task này.

Một trang là native table hữu hạn, browser tự layout các dòng thật: không spacer giả tổng chiều cao, không estimate hàng chưa đo, prefix-height/anchor correction hoặc double-scale spacer theo zoom. Đồng thời không giữ cây paint31.000 ô của1000 người trong bảng tương tác chỉ để có full mode. Hai lợi ích cấu trúc này giải thích vì sao pagination hợp ý định mới; không phải bằng chứng mọi paint cost/geometry đã hết. Sticky, độ rộng theo dữ liệu từng trang, số lớn/tên dài, footer, page edges, browser UI zoom/text scaling/pinch và touch hit-test vẫn phải kiểm thực tế. Cố định/giữ track constraints khi lật trang là chi tiết cần review nếu thấy nhảy cột, chưa tự thay CSS/table engine.

## 7. Evidence cũ và acceptance cần quyết định

[Canonical Task10](verification-matrix.md) giữ **full1000 Failed**: scroll p9566,6ms/max333,3ms vượt33/200ms. [Feasibility](scroll-feasibility-results.md) rejected candidate trong scope cũ; [G/F](scroll-gf-diagnostic-results.md) G Failed extent/gap−4px, F inconclusive/fresh F Not run. Những kết quả này không chặn viết assessment phân trang, cũng không tự chứng minh thiết kế mới pass.

Đề xuất thay workload tương tác tương lai thành: **1000 người logical đầy đủ, truy cập/tìm được mọi người qua các trang hữu hạn25/50**, kiểm đầy đủ dữ liệu, tổng, thao tác và lifecycle trên mọi biên liên quan. Đây là **thay đổi acceptance cần quyết định rõ của người dùng**, không waiver cho full1000DOM cũ hoặc đóng I3 bằng tài liệu. Giữ historical Failed, G3/G4 và các lớp Not run đến khi có scope/thiết kế được quyết định và evidence phù hợp. Các ngưỡng33/200 cùng budget API/load/editor/input/memory hiện hành không tự giảm; cần ánh xạ chúng sang workload mới, bổ sung page/search feedback trước kiểm chứng, không đặt số đo thành kết quả.

Các kiểm tra tương lai thích hợp, **chưa chạy/không được task này cấp quyền chạy**:

1. Dataset20/200/1000,28–31 ngày/cả kinds: total logical/membership không mất người, page bounds25/50, last partial/zero/one page, nhảy đầu/cuối/số không hợp lệ; tìm tên/ID ở trang xa, trùng tên/dấu/Unicode đúng semantics đã chọn, clear/reset/size anchor.
2. Loading đầu/lỗi nền/no results/empty, fetchedAt/count/footer labels; poll giá trị ngoài trang cập nhật tổng toàn tháng, rename/thêm/bớt/đổi mốc đổi membership giữ thứ tự + ID tie/clamp/guard; không suy vắng trang thành deleted. B còn cần contract/metadata/late response/cache/snapshot consistency và offpage update tests riêng nếu chọn.
3. Raw sai/dirty/bulk/source/targets/frozen baselines qua page/search/size/Keep/Escape/explicit discard; pending/reconcile/session expiry/reauth/account change; không tự write, không write hidden pages, không save theo page. Một conflict/source change rollback toàn batch; unknown write/recovery đúng ID và eligible/fence scope cũ.
4. Chuột/keyboard Tab/Enter/biên trang/focus return; rectangle/disjoint/fill/N/—/overlap/preview counts; hủy endpoint/gesture/auto-scroll khi chuyển trang hoặc poll đổi context; footer/hit-test sau cuộn/zoom. Kiểm lựa chọn xuyên trang chỉ nếu phương án đó được quyết định.
5. Actual SR đọc status/pager/header/cell/units và tìm người ngoài DOM; trusted iPhone/Android pan/pinch/rotate/450ms/10px/keyboard/44px controls, browser UI zoom/text size/font/tên dài/page edges/sticky/focus không bị che. Viewport/synthetic events không thay thiết bị/SR thật.
6. Đo API payload/latency, parse/projection/render/load, search/page transition/editor/input/scroll/drag và memory qua nhiều page/month changes bằng sản phẩm đúng source/build/workload; không lấy775/31.000 làm tỷ lệ tăng tốc. Excel fullmonth/công thức/tổng độc lập trang/search và reader thật vẫn đúng; app print riêng chỉ kiểm nếu có scope.

## 8. Gói quyết định đề nghị main trình sau review độc lập

Khuyến nghị trình cùng một gói cụ thể: **A trước;25 mặc định/50 tùy chọn; tìm tên hoặc ID xuyên toàn bộ kết quả tháng trước phân trang + nhảy số trang; selection/fill trong trang qua guard hiện có; tổng/Excel toàn tháng; acceptance1000 logical qua bounded pages.** Người dùng đã nghiêng về phân trang, không cần khảo sát lại virtualization/native/CSS hay hướng C.

Hai điểm cần quyết định thật sự: chấp nhận đổi workload toàn bộ DOM sang paginated logical access; và chấp nhận selection page-local hay cần một atomic batch xuyên trang với thiết kế tập chọn explicit lớn hơn.25/50, phép search hiện hành và các rule chuyển trang ở trên là defaults Proposed kèm gói để sửa/duyệt, không bí mật thành yêu cầu Accepted. B là lựa chọn contract lớn hơn nếu muốn giảm cả dữ liệu truyền ngay; proposal giải thích giá phải trả để quyết định có căn cứ.

Bước tiếp của main: fresh independent review exact BASE..TIP, xử lý findings rồi trình bản đề xuất dễ đọc cho người dùng quyết định thiết kế. Không có câu hỏi gửi người dùng trong lượt writer này; không suy duyệt assessment thành implementation approval hoặc tự mở trial mới. Nguồn requirements/design/ADR/contracts/implementation-plan/matrix và seals cũ giữ nguyên ở checkpoint này.
