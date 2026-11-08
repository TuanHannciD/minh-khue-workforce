# Phân trang server và tìm nhân sự toàn bộ kết quả

Cập nhật01/11/2026. **Accepted product design — người dùng “Tôi chốt bản thiết kế này” sau gói server design/ví dụ và khuyến nghị page-local.** Approval tiếp nối “Approval” hướng server, bao phủ25/50/global name-ID search/jump/poll active page/guard/page-local selection/fullmonth totals-Excel/workload1000 logical. Không làm client pagination trung gian. Independent server R1 exact81da48d..6acc3c3 không findings; report ignored `server-pagination-review-r1.md` trong `.superpowers/sdd/implementation-plan/`. Collation/runtime compatibility chưa Verified; [plan mới](server-pagination-implementation-plan.md) Draft/Pending review và user plan approval, chưa implementation/trial.

Provenance revision trước approval: BASE `81da48d245fceb4543b4803b548ab7b19f479bda`, tip `6acc3c37cb2d61b991593fe966c8181e4c3067c5`, report `server-pagination-design-r1.md`. Spec sync/plan từ BASE `c90cbc9dea0a9fce76a97822c60ecbc3bb656f61`, cùng branch/worktree; report ignored `server-pagination-approved-plan-r1.md`. Sole writer Sol/high, không child/helper/reviewer/escalation/Astra. [Requirements](../approved/requirements.md)/[design mục15](../design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026) sở hữu product acceptance; [API mục8](api-contract.md#8-đọc-trang-server--thiết-kế-đã-duyệt01112026) sở hữu wire. Đây là rationale của cùng gói, không contract cạnh tranh. Các từ đề xuất bên dưới mô tả thiết kế đã chốt, riêng collation/parity/query plan vẫn prerequisite chưa Verified.

## 1. Kết quả người dùng cần và quyết định kiến trúc

Người dùng01/11 yêu cầu đánh giá bỏ cách đưa1000 người cùng một page, sau đó nói: “Tôi muốn phân trang chuẩn chỉ như các sản phẩm đang làm luôn chứ ko vá tạn để dùng. So sánh với kiến trúc bạn đề xuất luôn đi”. Sau giải thích chuyển sang server pagination/global search và bước sửa proposal để review, người dùng trả “Approval”. Quyết định mới thay khuyến nghị client-first của bản trước; không khảo sát lại mong muốn phân trang.

**Thiết kế đã duyệt: server tìm và sắp xếp trên toàn bộ nhân sự thuộc tháng rồi trả đúng một trang; mặc định 25 người, có tùy chọn 50, tìm tên/ID và nhảy số trang.** Server trả cả Công/Tăng ca của nhóm người đó, số kết quả và tổng toàn tháng nhất quán trong một lần đọc. Khoảng 20 người hiện tại vẫn nằm trong một trang. 1.000 là dữ liệu benchmark giả, không phải số nhân sự thực; [requirements](../approved/requirements.md) chưa đặt trần tăng trưởng.

Giữ C xanh lá, một bảng chuyển loại, sticky tên/ngày/tổng, cuộn/zoom/cảm ứng và nhập đầy đủ trên desktop/điện thoại. Giữ hai tài khoản cùng quyền, poll15s, draft riêng, employee/cell/source CAS, batch nguyên tử, unknown-write recovery và Excel toàn tháng. Hướng kiến trúc đọc thay đổi; không xây lại nền React/Vite, TanStack Query, NestJS/PostgreSQL hoặc tự thêm Zustand/grid engine.

## 2. So với kiến trúc hiện có và khuyến nghị trước

Hiện tại [AttendancePage](../../../../apps/web/src/features/attendance/ui/attendance-page.tsx) lọc tên/ID trên `month.employees`, rồi [Grid](../../../../apps/web/src/features/attendance/ui/attendance-grid.tsx)/[Row](../../../../apps/web/src/features/attendance/ui/attendance-row.tsx) dựng mọi người khớp. `visibleMonth` chỉ thay employees, vẫn mang cells/totals đầy đủ. [Query](../../../../apps/web/src/features/attendance/api/use-attendance-month.ts)/[key](../../../../apps/web/src/features/attendance/api/query-keys.ts) theo user/session epoch/month, không có page/search server. GET tháng [controller](../../../../apps/api/src/modules/attendance/attendance.controller.ts)/[parser](../../../../apps/api/src/modules/attendance/attendance-validation.ts) chỉ nhận month, thêm page/q hiện bị từ chối. [MonthDto](../../../../apps/api/src/modules/attendance/attendance.dto.ts) là full snapshot, không phải DTO trang.

[AttendanceService.readMonth](../../../../apps/api/src/modules/attendance/attendance.service.ts) đọc READ ONLY REPEATABLE READ: lấy membership giao tháng, sort tên bằng `Intl.Collator("vi")` rồi employeeId, dựng mọi ô cả hai loại và tính tổng. Tháng31 ngày/1000 người là62.000 logical cells trong snapshot,31.000 cell components của loại đang xem; không phải31.000 editor/input mở. Dữ kiện này và full1000 scroll Failed thuộc [ma trận](verification-matrix.md), không phép đo mới.

Ba cách khác nhau:

- **Hiện có:** tải toàn tháng và render toàn bộ kết quả; chi phí dữ liệu và cây giao diện cùng tăng theo số người.
- **Client pagination đã đề xuất trước:** vẫn tải/parsing/cache/poll toàn tháng, chỉ render25/50 người. Ít sửa contract nhưng không đạt yêu cầu giảm lượng dữ liệu client phải nhận ngay từ kiến trúc. Không còn là route thực hiện.
- **Server pagination được chọn:** DB lọc/sort/count, lấy page IDs và các ô của page; browser chỉ nhận nhóm người đó và các tổng cần thiết. Giảm phạm vi dữ liệu chi tiết và cây render; đổi contract/query/lifecycle thật. Đánh đổi: có request khi chuyển trang, cần loading/error/late-response và xử lý danh sách thay đổi. Tổng tháng/count vẫn có chi phí trên toàn kết quả trong DB; không hứa mọi truy vấn rẻ theo pageSize.

Với 25 người × 31 ngày, dự kiến response có 1.550 cell snapshots cho hai loại; bảng đang xem dựng 775 cell components. Với 50 người, tương ứng là 3.100 snapshots và 1.550 components. Đây là phép đếm cấu trúc theo thiết kế đã duyệt, chưa chứng minh tốc độ hoặc budget PASS. Server phải lấy đúng dữ liệu trang từ DB; browser không tải đầy đủ tháng trong nền để tìm/lật trang.

## 3. Contract đọc trang cụ thể — thiết kế được duyệt, chưa triển khai

### Request, quyền và validation

Đề xuất **POST `/api/v1/attendance/search`**, một read endpoint có JSON body; không mutation dữ liệu nghiệp vụ. Dùng POST để giữ tên tìm kiếm ngoài URL/history/access-log path, phù hợp quy tắc [architecture state](architecture-proposal.md#5-state-cụ-thể-và-luồng-nhập-công) và precedent POST reconcile theo explicit IDs. TanStack Query vẫn sở hữu read này. Không đặt q vào route, localStorage hoặc telemetry/log body.

Shape `AttendancePageQueryDto` theo API8:

```json
{"month":"2026-10","q":"","page":1,"pageSize":25}
```

Web luôn gửi đủ4 fields. Server yêu cầu month hợp lệ Gregorian như hiện tại; q/page/pageSize có thể thiếu và lần lượt mặc định "",1,25. q phải là string, trim đầu/cuối theo tập whitespace ECMAScript như ô tìm hiện tại, tối đa200 Unicode code points sau trim; vượt trả400, không cắt chuỗi. page phải JSON number nguyên hữu hạn trong1…2.147.483.647; pageSize chỉ25 hoặc50. Đây là giới hạn kỹ thuật của thiết kế đã duyệt, không thêm field nghiệp vụ hoặc trần nhân sự. Null/sai kiểu/unknown field bị từ chối, không implicit convert chuỗi số.

Cùng SessionGuard, quyền hai tài khoản, Origin/JSON/no-store và body-limit hiện có như reconcile; auth trước lookup/count. Thành công200, malformed400,401/403/413/415 theo policy hiện có, lỗi DB/invariant503 với envelope an toàn. Read không tăng revision/đóng fence hoặc thay idle/session policy ngoài cơ chế auth hiện hành; không gọi authorizeMutation/khóa User→Employee như write. Body không chứa raw draft hoặc mutation intent.

### Response và phạm vi tổng

DTO riêng `AttendancePageDto`, alias wire web sinh từ Nest DTO→OpenAPI; shape dưới là minh họa cùng contract tại API mục8, chưa source/runtime Verified:

```ts
type AttendancePageDto = {
  month: string;
  fetchedAt: string;
  pagination: {
    requestedPage: number;
    page: number;
    pageSize: 25 | 50;
    totalResults: number;
    monthEmployeeCount: number;
    totalPages: number;
    from: number;
    to: number;
  };
  employees: EmployeeDto[];
  cells: CellSnapshotDto[];
  employeeTotals: {
    work: { employeeId: string; value: number }[];
    overtime: { employeeId: string; value: number }[];
  };
  monthTotals: {
    work: { byDate: { date: string; value: number }[]; grandTotal: number };
    overtime: { byDate: { date: string; value: number }[]; grandTotal: number };
  };
};
```

employees chỉ nhóm người của page, theo thứ tự server; cells đủ mỗi người/ngày/cả hai kinds kể cả ô vắng record, giữ value/reminder/state/revision/tombstone như hiện tại, sắp employeeId/date/kind như full snapshot. employeeTotals chỉ có IDs trên page nhưng mỗi số là tổng cả tháng của người đó, không tổng các ngày đang nhìn. monthTotals gồm toàn membership tháng, kể cả người ngoài page và không khớp q, không tổng draft; byDate đủ mọi ngày với0 nếu không số. Hai loại có đơn vị riêng.

monthEmployeeCount đếm toàn membership tháng; totalResults đếm người khớp q trong membership ấy. totalPages = ceil(totalResults/pageSize). Có kết quả: page = min(requestedPage,totalPages), from=(page−1)×pageSize+1, to=min(page×pageSize,totalResults). Không kết quả: page=1, totalPages=0, from=to=0, employees/cells/employeeTotals rỗng; monthTotals vẫn phản ánh tháng nếu chỉ q không khớp. requestedPage giữ yêu cầu gốc để UI báo clamp mà không nhầm trang. Response không echo q hoặc thêm toàn bộ danh sách người chỉ để locate.

Ví dụ metadata giả của request page40 sau danh sách giảm còn976 người, pageSize25: totalPages40/from976/to976/page40. Nếu giảm còn975: totalPages39/page39/from951/to975/requestedPage40. Đây là cùng request hợp lệ trả trang cuối, không cần một lượt fetch trang rỗng rồi đoán count.

Full `MonthDto`, GET month và export hiện có giữ contract tương thích; UI bảng sản phẩm chuyển sang read mới và không tiếp tục subscribe full month. Không nhét DTO partial vào tên MonthDto hoặc cast để chiều consumer cũ. Grid projection, draft open/openBulk và selection capture nhận boundary tối thiểu gồm month + page employees/cells + row totals; global footer nhận monthTotals riêng. Raw/frozen draft không lấy từ bộ tổng hoặc row index.

## 4. Tìm, sort, truy vấn và tính nhất quán — prerequisite parity còn mở

### Search và thứ tự có định danh

Membership vẫn [khoảng làm việc giao tháng](../../../../apps/api/src/modules/employees/employees.repository.ts): startDate≤cuối tháng và endDate null hoặc ≥đầu tháng. q="" trả toàn membership. Tìm literal substring trên tên lowercase tiếng Việt hoặc ID text; giữ ID substring có phân biệt chữ hoa/thường như source hiện tại, chưa âm thầm đổi thành case-insensitive. Không nhận thêm mã nhân viên/công trình/điện thoại/fuzzy, bỏ dấu hoặc Unicode normalization. Dấu %/_ trong q là ký tự thật, không wildcard SQL. Các semantics này phải đối chiếu bằng fixture, không suy PostgreSQL ILIKE tự tương đương JS includes.

Thứ tự cố định tên tiếng Việt tăng dần rồi employeeId tăng dần, không thêm UI sort tùy ý trong revision này. Đề xuất collation PostgreSQL ICU locale vi deterministic, có tên/version trong cấu hình DB/migration review, cùng expression ORDER BY dùng để cắt trang; employeeId unique giải hòa tên trùng/so sánh tên bằng nhau. Lowercase tên cũng phải dùng locale phù hợp; substring sau lowercase là so chuỗi literal, không tận dụng collation để tự bỏ dấu. Không dựa default cluster collation hoặc sort riêng trên browser sau khi cắt trang.

ICU/collation khả dụng và parity với `Intl.Collator("vi")`/toLocaleLowerCase hiện tại **chưa kiểm**. Review kỹ thuật cần xác định collation cụ thể và fixture tiếng Việt, hoa/thường, tên trùng, ký tự tổ hợp; nếu hai engine khác thứ tự/match, ghi delta để xử lý đúng contract, không gọi tương thích đã chứng minh hoặc fallback âm thầm sang C/ASCII. Khi triển khai thiết kế được chốt, readMonth/export và read trang phải dùng cùng quy tắc sort server; không giữ một phép sort Intl riêng làm thứ tự Excel khác bảng khi q rỗng. Đây là chi tiết kỹ thuật để implementer/reviewer kiểm, không yêu cầu người dùng chọn tên ICU. Không cài extension/dependency hoặc tạo migration trong lượt tài liệu này.

### Một read snapshot, dữ liệu chi tiết hữu hạn

Use case đọc mới thuộc attendance; membership/filter/order thuộc interface public employees, SQL access thuộc repositories. Không import sâu repository nhân sự xuyên feature. Trong **một READ ONLY REPEATABLE READ transaction**, theo cùng cơ chế fetchedAt hiện tại:

1. Kiểm invariant dữ liệu đã lưu trong tháng không có nội dung/nhắc ngoài khoảng nhân sự, kể cả người ngoài page/membership hiện tại. `readMonth` hiện fail an toàn với corruption; route mới không được bỏ kiểm này chỉ vì không tải đủ mọi cell lên app. Dùng kiểm tồn tại/aggregate tại DB thay dựng full snapshot.
2. Đếm monthEmployeeCount và totalResults theo cùng membership + predicate tìm; xác định effective page/clamp. Count và lấy page không dùng hai predicates khác nhau.
3. Chọn employee IDs/metadata bằng ORDER BY collation đã chốt + ID, LIMIT pageSize/OFFSET. Bound phép tính offset, parameter hóa q/month/limit/offset; không nối chuỗi SQL từ input. Không gọi listForMonth lấy cả danh sách về app để sort/slice thay DB paging.
4. Đọc stored cells đúng IDs của page và khoảng tháng, dựng các ô thiếu/N/— theo mốc, giữ revisions; tính employeeTotals đúng nửa đơn vị nguyên theo hai kinds cho page.
5. Aggregate tổng theo ngày/loại trên toàn membership tháng bằng halfUnits nguyên như [attendanceTotals](../../../../apps/api/src/modules/attendance/attendance-totals.ts), chỉ số được cộng, F/empty/N/— không tạo số, reminder không đổi tổng. Bổ sung ngày0; không cần full byEmployee cho mọi người hoặc62.000 projected snapshots trong bộ nhớ app. Kiểm numeric conversion an toàn, không mất độ chính xác khi serialize.
6. Trả toàn bộ envelope sau transaction; không giữ transaction qua thời gian người dùng xem trang hoặc render browser.

Count/global aggregates/invariant checks có thể vẫn quét nhiều dữ liệu ở DB; offset sâu cũng có chi phí. Schema hiện có index cell theo employee/date/kind và date/employee; chưa có bằng chứng index search/sort phù hợp. Review query plan/index theo dữ liệu giả khi tới implementation/test, chỉ thêm index có căn cứ; không hứa giảm chi phí DB40 lần từ25/1000.

### Fresh từng request, không giả khóa danh sách xuyên trang

Chọn page-number/offset vì cần tổng số trang và nhảy trang trực tiếp; không thêm cursor protocol vào cùng API. Mỗi response nhất quán tại fetchedAt nhưng trang2 đọc sau có thể thuộc snapshot mới hơn trang1. Insert/rename/đổi mốc có thể làm người chuyển trang; key ô luôn employeeId/date/kind. fetchedAt là thời điểm đọc, không collection revision hoặc CAS token.

Không giữ snapshot server sống qua các trang, không thêm month-wide write revision/lock. Đối với bảng cập nhật15s và chỉnh sửa theo ID, đề xuất nhận danh sách mới, clamp/guard theo mục5 thay vì hứa một lần duyệt sẽ thấy mỗi người đúng một lần giữa mọi thay đổi đồng thời. Nếu cần báo cáo đúng một thời điểm, dùng export full snapshot. Tập chọn đóng băng, CAS hiện hữu và reconcile explicit keys chịu trách nhiệm tính đúng khi lưu, không page offset.

## 5. Query, polling và trạng thái chuyển trang — Accepted design

TanStack Query giữ page response; React giữ input/desired criteria, trang đang hiển thị và draft/selection. Key `["attendance","page",userId,epoch,month,qTrimmed,page,pageSize]`; q giữ case vì nhánh ID hiện phân biệt case. Kind không nằm trong key do response đã có cả Công/Tăng ca. DTO web sinh từ API; không tạo server cache bản sao trong Zustand/localStorage.

Ô search có nhãn “Tìm tên hoặc ID trong toàn bộ nhân sự của tháng”; input local khác q đã áp dụng. Debounce300ms, Enter gửi ngay, không dispatch giữa IME composition. Sau guard nếu có draft, commit q/reset page1 một lần; không gửi request mỗi ký tự trong khi guard đang chờ. Đổi tháng hoặc xóa/đổi q về1. Đổi pageSize **reset1** để quy tắc server rõ và không cần locate-by-ID API; thay mặc định anchor người đầu trang ở proposal client cũ, vốn chưa Accepted. Đổi Công/Tăng ca giữ trang/size/q qua guard và không fetch lại chỉ vì tab.

Polling15.000ms chỉ cho query đang hiển thị khi authenticated/mounted/visible, refocus/reconnect như hiện tại; không timer từng ô/trang và không poll toàn bộ cache. Giữ read retry tối đa2 ở1s/3s,4xx dừng tự refetch; mutation retry=0. Giữ `gcTime:0` cho page inactive như hook hiện hành, không prefetch toàn bộ trang. Điều này giới hạn cache inactive, không promise memory leak-free. Reauthentication cùng user giữ raw draft owner trong memory; logout/account change clear cache/owner theo session epoch hiện có.

Chuyển trang có hai trạng thái phân biệt: criteria được yêu cầu và envelope đã chấp nhận để hiển thị. Trong lúc tải, báo “Đang tải trang…”, giữ bảng cũ đúng nhãn cũ dưới busy/read-only hoặc skeleton, không gắn trang mới lên rows cũ. Chỉ commit metadata+rows+totals cùng response đúng key/lifetime; không mở editor từ bảng placeholder. Lỗi giữ thông tin trang đã tải và lỗi/trang đang yêu cầu, có Thử lại và quay về trang đã tải; không báo0 results hoặc tự save. Abort read cũ khi thay criteria/unmount, check epoch/key trước nhận body; response muộn không đổi query/view khác. Bấm lặp không tạo nhiều transition/save.

Server clamp khi danh sách co: không draft thì nhận effective page + thông báo, chuẩn hóa desired page về response.page, chỉ fetch/poll tiếp key chuẩn; không vòng lặp requestedPage cũ hoặc poll cả hai keys. Zero results có trạng thái0/không page1/0, phân biệt tháng rỗng với q không khớp bằng monthEmployeeCount.

Poll cùng page IDs/thứ tự/effective page: cập nhật dữ liệu/tổng/count/fetchedAt, giữ raw/revisions của draft. Poll đổi page IDs/thứ tự/effective page: không draft thì nhận mới/báo danh sách cập nhật; có draft/selection thì hoãn commit view, đưa qua guard, không tự reassign row indexes hoặc intersect frozen targets. Query vẫn có response mới; UI tạm giữ **tham chiếu immutable của envelope đã hiển thị** cho guard, không clone bảng thành store server thứ hai; fetchedAt/header/footer lấy cùng envelope cũ và nhãn chưa cập nhật. Sau lưu/đối chiếu/bỏ draft có chủ ý mới nhận latest/refetch cần thiết. Keep giữ context/raw, không bắt người dùng discard chỉ để lưu lại một intent hợp lệ; CAS vẫn phải chạy trên baseline cũ. View đang giữ phải hủy gesture/tắt khởi tạo lựa chọn mới từ những dòng stale, không gọi đã đồng bộ.

Sau attendance write thành công, invalidate mọi page query liên quan của tháng/user/epoch vì tổng toàn tháng đổi, nhưng chỉ active query refetch; không optimistic giả saved totals hoặc tải tất cả page. Sửa tên/mốc hoặc tạo nhân sự có thể ảnh hưởng search/order/membership nhiều tháng: invalidate namespace attendance của user/epoch, bao gồm full-month consumer đang có nếu cần, chỉ active reads refetch. Unknown write không tự retry; invalidate/read chỉ cập nhật snapshot, không xác nhận hoặc hủy write. Offpage changes của người khác xuất hiện ở monthTotals qua active-page poll; chi tiết offpage được đọc mới khi tới trang/reconcile, không hứa live cells chưa tải.

## 6. UX trang, selection và draft — Accepted page-local

25 default/50 option, không “Tất cả”;25 có nửa số dòng/ô mỗi trang so50 nhưng1000 người cần40 thay20 trang. Controls theo C ở ngoài cuộn ngang của bảng: Trước/Sau, “Trang p/P”, field label “Đến trang” + “Đi”, có thể truy cập ở đầu/cuối bảng, cùng state; không40 nút số hoặc swipe ngang để lật. Field validate số trang trước submit, không chuyển khi vừa gõ một chữ số; disabled đúng biên, vùng chạm44 CSS px hiện có.

Status ví dụ giả: “8 kết quả trong1.000 nhân sự của tháng · Hiển thị1–8 · Trang1/1”. Không kết quả ghi0/hiển thị0–0 và khóa pager vô dụng. Search toàn membership trước page nên người ở trang30 tìm được khi đang trang1; không dùng Ctrl+F/page-only search thay chức năng app. Không tìm ngoài tháng/lịch sử hoặc tự thêm filter nghiệp vụ.

**Rule đã duyệt: rectangle/disjoint/fill chỉ trong page đang hiển thị.** Nguồn phải hiển thị/editable/có giá trị để bắt đầu fill. Kéo sát đáy chỉ cuộn trong page, không tự page-turn/chọn thêm người ẩn. Đây là delta rõ so với [design13–14](../design.md#13-chọn-ôvùng-rời-và-kéo-điền-lặp--bổ-sung28102026): nhiều người ở hai trang không nằm trong cùng batch. Approval bản viết mới đã chốt page-local; không hỏi lại lựa chọn này.

Nếu cần một Apply xuyên trang, alternative là vùng chọn explicit IDs/keys tích lũy từng trang, frozen employee/cell/source revisions và review toàn tập gồm đích ngoài trang; không rectangle bao từ row index ở hai trang, không “tất cả kết quả” tự mở rộng theo poll. Một request/transaction cho toàn intent, không chia save theo page. Alternative này chưa đủ contract/lifecycle để implement trong route page-local đã duyệt; không đưa hidden targets vào write nếu người dùng chưa chủ động chọn và review.

Draft owner [AttendanceDraft](../../../../apps/web/src/features/attendance/model/attendance-draft.ts) ngoài DOM page. Đổi page/q/size/month/kind, đóng editor hoặc khởi tạo selection khác qua guard hiện có: Giữ giữ nguyên context/raw/reminder/custom/error/mode/targets/source/baselines; Bỏ và tiếp tục chỉ discard có chủ ý, reset selection/endpoint rồi chuyển. Lưu/Áp dụng là riêng; pending/reconciling khóa transition; không dùng page key để reset owner. Guard action phải kiểm owner/generation/epoch hiện tại khi thực thi, không replay thao tác cũ sau đổi phiên. Query response mới không rebase draft.

Giữ selected/eligible/occupied/skipped/changed counts từ baseline đóng băng; hợp vùng dedupe; source không là target, không copy reminder; fill-empty mặc định, số/F giữ nguyên, reminder-only trống; N/— skip và báo. Một conflict dừng cả batch, không tự co/giãn targets/force/retry. Source/skip/occupied bị loại/eligible0 không fence. Outcome unknown vẫn chưa biết kết quả dù bỏ draft/đổi trang; reconcile original IDs/keys kể cả ngoài page/tháng, không dùng absence trong page để suy deleted, không thêm delete API hoặc tái thêm nhân sự vào bảng. Explicit recovery là intent mới sau đối chiếu như contract cũ, không thay bằng đọc thành công.

Navigation/rectangle/hit-test/`orderedMonthCells` chỉ dùng page IDs/cells, không tìm nút ngoài DOM. Arrow/Enter/Tab theo quy tắc hiện có trong trang, bỏ N/—; ở biên không lật trang/ghi thêm. Tab cuối rời bảng tới pager; save ở biên không có đích trả focus ô vừa lưu. Sau page change thành công reset cuộn dọc/giữ ngày ngang hợp lệ và focus heading/status trang, không mở editor. Search giữ focus input/status polite, poll không cướp focus. Keep/Escape trả opener khả dụng, không bị sticky/footer/keyboard che.

Mỗi page một semantic table có caption tháng/loại/phạm vi dòng, header và cell labels tên/ID/ngày/kind/nhắc; pager navigation có tên/current state. Không ARIA giả1000 rows hoặc render-all fallback chỉ cho SR/Find. Giữ450ms/10px/native pan-pinch/cancel và cách chạm/hai đầu/keyboard thay kéo; chuyển context/membership hủy timer/capture/RAF/endpoint/gesture, không phát lại sau guard. SR thực, iPhone/Android/browser UI zoom chưa được kiểm mới.

## 7. Tổng, Excel, in và ranh giới render

Footer lấy monthTotals, nhãn “Tổng toàn tháng · tất cả nhân sự”, không gắn nhãn tổng trang cho số toàn tháng. Tổng hàng là cả tháng của người trên page. Không tự thêm subtotal trang/filtered totals; nếu có sau này phải nhãn riêng và thiết kế riêng. Search/page không đổi nghĩa công/giờ/tổng hoặc đưa raw draft vào số đã lưu. Khi refetch giữ envelope cũ phải báo fetchedAt/độ mới cũ đồng bộ giữa bảng và footer.

[Export service](../../../../apps/api/src/modules/attendance/export/attendance-export.service.ts) tiếp tục gọi readMonth riêng, transaction đóng rồi [workbook](../../../../apps/api/src/modules/attendance/export/attendance-workbook.ts) tạo một sheet Công trên/Tăng ca dưới, SUM + cached totals. Button chỉ gửi month, không q/page; **xuất toàn tháng đã lưu**, không filtered export ngầm, không đổi formulas. Export đọc thời điểm riêng nên có thể mới hơn bảng, không hứa cùng snapshot với read trang.

In đầy đủ hiện có thể qua workbook; app full-month print nếu cần phải thiết kế từ server snapshot riêng, không biến Ctrl+P trang hiện tại thành hứa in toàn bộ. Không cần mount1000 dòng vào editing DOM cho export/print/Find/SR, không tự thêm PDF/import. Mỗi trang hữu hạn có native layout thật, tránh cả spacer/estimate/prefix-height/anchor correction của windowing và cây paint31.000 ô của full1000. Đây là lý do cấu trúc, chưa chứng minh mọi geometry/paint issue hết. Sticky/độ rộng khác giữa trang/footer/page edges/font/text scaling/browser UI zoom/pinch/hit-test vẫn cần kiểm, không tự thay engine/CSS C để ép vừa.

## 8. Acceptance và review tiếp theo

Giữ [full1000 canonical Failed](verification-matrix.md): scroll p9566,6/max333,3ms >33/200. [Feasibility](scroll-feasibility-results.md) rejected candidate trong scope cũ; [G/F](scroll-gf-diagnostic-results.md) G Failed extent−4px, F inconclusive/fresh F Not run. Những kết quả này không cản viết thiết kế server mới và không tự pass cho thiết kế này. Approval direction không phải evidence performance hoặc waiver. I3/G3/G4/dependency/native phones/SR/phoneperf giữ trạng thái hiện hành.

Workload mới đã duyệt tại design15/matrix:1000 người logical đầy đủ, search và truy cập qua page25/50, bounded response/render + toàn bộ month totals/export. Giữ budget33/200 và API/load/editor/input/memory hiện hành; mapping API page/fullmonth export và Proposed technical page/search feedback checks tại matrix. Không coi25 dòng hiển thị là dataset25 hoặc đóng historical fullDOM failure bằng số đếm.

Các kiểm tra tương lai cần khi scope triển khai đã có, **Not run trong revision tài liệu này**:

1. DTO/OpenAPI/runtime auth/Origin/no-store/strict unknown/null/defaults/pageSize/q length/body; search literal %/_/tên/ID/dấu/Unicode/case, collation khả dụng và tên trùng+ID tie; generated types/drift/consumer không cast partial thành MonthDto.
2. Fake20/200/1000 ×28/29/30/31/cả kinds: response đủ ô/revisions mỗi page, count/membership/row totals/global totals đúng SQL độc lập; zero/search-empty/last partial/clamp/direct jump/size reset; không full snapshot load/slice trong service hoặc background browser.
3. Count/page/cells/totals cùng read snapshot dưới race insert/rename/mốc/cell write; invariant corruption ngoài page vẫn fail an toàn; từng request fresh không giả collection lock. Query plan/index/payload/parse/projection/render/page/search/scroll/drag/memory đo trên source/build thật, không hứa tỷ lệ25/1000.
4. Debounce/IME/Enter, desired vs displayed metadata, stale response/abort/generation/epoch/logout/reauth, first load/error/background stale, clamp canonical key không loop/duplicate timer; invalidate sau save/employee edit và offpage totals qua15s, không polling mọi page.
5. Dirty raw sai/bulk/frozen source/targets/guard Keep/Escape/explicit discard qua page/q/size; membership đổi khi pending/unknown; một conflict rollback toàn batch, no hidden targets/no split save; explicit ID reconcile ngoài page/tháng, skip/source/eligible0 fence scope đúng.
6. Keyboard biên trang/Tab exit/focus return, semantic table/SR announcements, trusted iPhone/Android pan/pinch/450ms/10px/cancel/rotation/text zoom/sticky/footer/page edges/tên dài và controls44px; viewport/synthetic không thay thiết bị/SR thật. Fullmonth Excel/formulas/reader không phụ thuộc page/q; app print riêng chỉ kiểm nếu được giao.

Bước tiếp: main fresh independent review **spec sync + plan mới** trên exact BASE..TIP → xử lý findings → người dùng review/duyệt plan trước implementation. Không hỏi lại design/defaults/page-local hoặc execution method. Collation/parity phải có output PASS/FAIL và pin provider/version/lowercase/canonical-equivalent/tie rule trước contract/code phụ thuộc; không parity thì dừng các task phụ thuộc và trình proposed contract delta/decision, phần độc lập tiếp tục. Query plan/performance/native/SR vẫn Not run. Không mở trial hoặc implementation trong lượt tài liệu này.
