# Contract API v1 — thiết kế cho G1

Ngày28/10/2026. **Proposed for G1 review**, thuộc Task1 của [plan đã duyệt](implementation-plan.md); chưa endpoint/DTO/OpenAPI/code sản phẩm nào tồn tại. Nghiệp vụ theo [design đã duyệt](../design.md), nguyên tắc theo [API_CONTRACTS](../../../architecture/API_CONTRACTS.md). Các tên/giá trị kỹ thuật dưới đây là đề xuất cụ thể để review, không bổ sung nghiệp vụ.

## 1. Quy ước chung

- Base `/api/v1`; JSON UTF-8, thuộc tính camelCase, reject unknown properties tại mọi object, không implicit convert chuỗi số thành number. Chỉ JSON finite numbers bội0.5 được nhận ở wire; dấu phẩy/chấm là input UI trước serialization.
- ID UUID; revision opaque string, client chỉ lưu/gửi lại, không tăng/giải mã/so thứ tự. Revision `0` dành cho ô chưa từng lưu; một ô đã clear không trở về0. Các ví dụ dùng UUID giả cố định.
- Ngày lịch `YYYY-MM-DD` hợp lệ Gregorian, không timestamp/timezone; tháng `YYYY-MM`, năm0001–9999 do định dạng kỹ thuật. Timestamp kỹ thuật ISO8601 UTC có `Z`; thứ tính từ ngày lịch, không từ timezone trình duyệt. Không có lịch nghỉ tự điền.
- Lỗi `{error:{code,message,details?},requestId}`; message tiếng Việt an toàn, không echo secret/SQL/stack. `requestId` dùng chẩn đoán, không là idempotency key. Thành công trả resource/DTO trực tiếp; nội dung tháng có tổng từ server.
- GET không mutation nghiệp vụ, auth theo [auth-session](auth-session.md). Unsafe methods yêu cầu Origin chính xác được phép và JSON; browser fetch `credentials: include`. Không gửi mật khẩu/session trong URL; mọi response dữ liệu cá nhân `Cache-Control: no-store`.
- Body JSON giới hạn kỹ thuật16MiB sau giải nén; vượt trả413 `PAYLOAD_TOO_LARGE` trước mutation. Đây không là trần số ô chọn hoặc nhân sự; UI giữ draft và không tự chia batch thành nhiều lần lưu. Không tự bổ sung pagination/virtualization; cần đo trước đổi contract.

## 2. Kiểu dữ liệu công khai

Tất cả kiểu dưới là thiết kế DTO API; lúc triển khai Nest DTO/Swagger là nguồn code, `contracts/openapi.json` được sinh từ API, web sinh `shared/api/generated/schema.d.ts`. Không duy trì thêm DTO web viết tay cạnh tranh.

```ts
type AttendanceKind = 'work' | 'overtime';
type CellValueDto = null | { type: 'number'; value: number } | { type: 'absence' };
type CellKeyDto = { employeeId: string; date: string; kind: AttendanceKind };
type CellSnapshotDto = CellKeyDto & {
  value: CellValueDto; reminder: boolean; revision: string;
  state: 'editable' | 'before-start' | 'after-end';
};
type EmployeeDto = {
  id: string; name: string; startDate: string; endDate: string | null; revision: string;
};
type SessionIdentity = { userId: string; username: string };
type SessionDto = { user: SessionIdentity; expiresAt: string; idleExpiresAt: string };
type MonthDto = {
  month: string; fetchedAt: string; employees: EmployeeDto[];
  cells: CellSnapshotDto[];
  totals: { work: KindTotalsDto; overtime: KindTotalsDto };
};
type KindTotalsDto = {
  byEmployee: { employeeId: string; value: number }[];
  byDate: { date: string; value: number }[]; grandTotal: number;
};
```

`state` là trạng thái hiển thị suy từ mốc, không trạng thái duyệt/lưu mới. `before-start` hiển thị N, `after-end` hiển thị —, đều value=null/reminder=false theo invariant DB. Trong thời gian làm việc value=null hiển thị trống, absence hiển thị F chỉ ở work; overtime không nhận absence/zero. Công number0 được normalize thành absence; overtime number phải >0, không tăng ca chọn null. Server trả số dạng JSON chính xác bội0.5, không chuỗi thập phân. N/—/F không serialize thành số0. Tổng value là số, phép tính thực bằng nửa đơn vị nguyên trên server.

Month trả cả Công/Tăng ca cho mỗi người/ngày trong tháng, kể cả ô chưa có record, theo thứ tự employees name dùng collation hiển thị tiếng Việt rồi ID để ổn định; không gộp tên trùng. cells sắp employee/date/kind; UI có thể tìm/lọc client nhưng không mất định danh. Ngày/người không có số cho tổng0; bảng vẫn giữ ô trống là trống. Khoảng nhân sự phải giao tháng; danh sách không có ai thì employees/cells rỗng và totals grandTotal=0, byEmployee rỗng, byDate đủ ngày với0.

## 3. Endpoint và ví dụ

| Method/path | Input | Thành công | Lỗi chính |
| --- | --- | --- | --- |
| POST `/auth/login` | `{username,password}` | 200 SessionDto + cookie | 400 input,401 invalid credentials,403 origin,429 throttled |
| GET `/auth/session` | Cookie | 200 SessionDto | 401 expired/revoked/missing |
| POST `/auth/logout` | `{}` + Cookie | 204, clear cookie, revoke session | 403 origin; cookie cũ/mất vẫn204 |
| POST `/employees` | `{name,startDate,endDate?}` | 201 EmployeeDto, mặc định endDate=null | 400 shape,422 dates/name |
| PATCH `/employees/:id` | `{expectedRevision,name?,startDate?,endDate?}` | 200 EmployeeDto | 404 ID,409 stale,422 excluded cells/date |
| GET `/attendance/month?month=2026-10` | Tháng | 200 MonthDto | 400 malformed,401 |
| POST `/attendance/changes` | WriteAttendanceDto dưới đây | 200 WriteResultDto | 400 shape/duplicate,409 conflict,422 value/no targets |
| GET `/attendance/export?month=2026-10` | Tháng | 200 xlsx stream | 400/401,500 export error |

Mọi route nhân sự/chấm công/export cần phiên hợp lệ, hai tài khoản cùng quyền. Không public signup, delete employee, admin/reset HTTP route hoặc employee self check-in. PATCH tên không đổi ID, optional field thiếu nghĩa giữ cũ; endDate=null mới bỏ mốc kết thúc. Không hỗ trợ delete giá trị nhân sự bằng null. Name trim ngoài, không rỗng, tối đa200 Unicode code points là giới hạn input kỹ thuật để render/export an toàn, không unique. startDate bắt buộc, endDate>=startDate nếu có. Login username tối đa64 ký tự, password input tối đa1024 bytes để chặn abuse, không tự trim password.

Ví dụ POST login fixture (không phải credential thật):

```json
{"username":"fixture-operator","password":"<fixture-only-secret>"}
```

Response200 mẫu:

```json
{"user":{"userId":"00000000-0000-4000-8000-000000000001","username":"fixture-operator"},"expiresAt":"2026-10-28T20:00:00.000Z","idleExpiresAt":"2026-10-28T10:00:00.000Z"}
```

POST employee request/response ví dụ:

```json
{"name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":null}
```

```json
{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":null,"revision":"4cb38a76-560e-4511-aea2-479d48cb9490"}
```

PATCH ví dụ `{expectedRevision:"4cb38a76-560e-4511-aea2-479d48cb9490",endDate:"2026-10-20"}` theo JSON hợp lệ khi gửi. Thay mốc kiểm tất cả tháng; nếu ô ngoài mốc mới có số/F/nhắc thì422 `EMPLOYMENT_DATA_OUTSIDE_INTERVAL`, details `{cells: CellKeyDto[]}` chỉ rõ vị trí, không đổi tên/mốc/data của cả request. Các ô F/reminder-only không bị bỏ qua. Stale employee revision trả409 `EMPLOYEE_CONFLICT` với details `{current: EmployeeDto}` trước khi áp patch.

## 4. Một ô, reminder riêng, batch và fill

Chỉ một use case ghi: một ô là targets có một phần tử; batch có tập ô chọn rõ ràng, không hình chữ nhật bao ngoài. `expectedEmployees` chứa đúng các nhân sự khác nhau thuộc targets và source nếu có, mỗi entry employeeId/expectedRevision. Đối chiếu cả ô trống lẫn ngày làm việc; không chỉ kiểm ô có record.

```ts
type CellExpectationDto = CellKeyDto & { expectedRevision: string };
type WriteAttendanceDto = {
  month: string;
  expectedEmployees: { employeeId: string; expectedRevision: string }[];
  targets: CellExpectationDto[];
  operation:
    | { type: 'set-value'; value: CellValueDto; mode: 'fill-empty' | 'replace' }
    | { type: 'set-reminder'; reminder: boolean };
  source?: CellExpectationDto;
};
type TargetPreviewDto = { selected: number; eligible: number; skipped: number; changed: number };
type WriteResultDto = { state: 'saved'; cells: CellSnapshotDto[];
  employees: EmployeeDto[]; counts: TargetPreviewDto; savedAt: string };
```

- Thiếu required field không thành default ghi. value=null nghĩa xóa nội dung, không xóa reminder; type set-reminder chỉ đổi reminder, không mang value/mode/source. UI bản đầu chỉ set-reminder một ô; API từ chối reminder targets nhiều hơn1 để không tự thêm thao tác nhắc hàng loạt chưa thiết kế.
- Batch UI mặc định fill-empty; wire bắt mode rõ, server không đoán. Trống là value=null dù reminder=true, F/số không trống. replace thay nội dung nhưng vẫn kiểm revision, không ghi đè người khác bằng force flag.
- Client dedupe target; server trả400 `DUPLICATE_TARGET` nếu trùng để bắt lỗi client, không ghi lặp. Tất cả targets/source phải cùng month và cùng kind, employee tồn tại. Trái phạm vi trả422 `INVALID_TARGET_SCOPE` trước ghi. source chỉ hợp lệ với set-value, không nằm trong targets, hiện editable và có số/F; value gửi phải khớp snapshot source sau normalize. Không copy reminder hoặc tạo dãy. Source thay đổi revision trả409 ngay cả khi nội dung tình cờ bằng cũ.
- Trong transaction: kiểm employee revision của toàn bộ tập, đối chiếu revision mọi ô editable được chọn (kể cả ô có sẵn sẽ không được fill-empty), và source; bất kỳ stale nào trả409, không tự co/giãn tập ghi. Sau đó loại N/— khỏi eligible và báo skipped; fill-empty loại nội dung không rỗng. Không có eligible trả422 `NO_ELIGIBLE_TARGETS`, không ghi.
- selected=targets.length, skipped chỉ ô N/—, eligible sau skip/mode, changed chỉ ô thật sự thay. Source không tính target. Ghi cùng giá trị giữ revision nếu không thay state, nhưng vẫn kiểm expectedRevision. Thành công có thể changed=0 khi mọi ô eligible đã cùng value/reminder, không là lỗi. Server trả snapshots mọi target và employee revision mới nhất; query month invalidate để lấy tổng, chỉ báo saved sau response. Tổng cũ trong lúc refetch phải có trạng thái đang cập nhật, không gọi đã đồng bộ.

Ví dụ một ô công0 thànhF, giữ reminder:

```json
{"month":"2026-10","expectedEmployees":[{"employeeId":"00000000-0000-4000-8000-000000000101","expectedRevision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"targets":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","expectedRevision":"0"}],"operation":{"type":"set-value","value":{"type":"number","value":0},"mode":"replace"}}
```

Response200 trả cell.value=`{"type":"absence"}`, revision UUID mới, reminder giữ nguyên, counts `{selected:1,eligible:1,skipped:0,changed:1}`. Request set-reminder thay operation bằng `{"type":"set-reminder","reminder":true}`, dùng revision mới của ô, không gửi value.

Batch dùng cùng request nhưng targets chứa đúng các ô rời, operation `{type:"set-value",value:{type:"number",value:3.5},mode:"fill-empty"}`; source chỉ thêm khi kéo điền, với expectation của ô nguồn đã có3.5. Trước Áp dụng UI hiển thị số ô và mode; replace có dữ liệu hiển thị xác nhận “Ghi đè nội dung của … ô”, không thêm undo sau lưu. Hủy xác nhận giữ draft.

Conflict response409:

```json
{"error":{"code":"ATTENDANCE_CONFLICT","message":"Dữ liệu đã thay đổi. Hãy kiểm tra trước khi lưu lại.","details":{"cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","value":{"type":"number","value":1.5},"reminder":true,"revision":"aef81b89-a688-4cca-9ceb-2d52dc9bdd85","state":"editable"}],"employees":[],"sourceChanged":false}},"requestId":"fixture-request-01"}
```

Nếu employee revision đổi, details.employees có EmployeeDto mới và cells gồm target/source cần đối chiếu; toàn bộ batch vẫn rollback. UI giữ raw/value/màu/mode/selection/source và baseline cũ, hiển thị dữ liệu mới cạnh draft. Chỉ sau quyết định rõ của người dùng mới tạo intent mới với baseline mới; không force-write/auto retry hoặc tự merge draft. Lỗi validation422 có details `{fields:[{path,code,message}]}`, lỗi network/status5xx không bị chuyển thành saved.

## 5. Snapshot, export và timeout

GET tháng và export đọc snapshot nhất quán của nhân sự/cả hai loại/tổng theo [data-model](data-model.md); dữ liệu đang draft không được gửi vào export. Export200 Content-Type=`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, attachment filename ASCII `minh-khue-2026-10.xlsx` và filename* UTF-8 nếu cần. Lỗi trước stream trả JSON; stream đứt không báo tải thành công. Một sheet Công trên/Tăng ca dưới, text/số/trống đúng kiểu; công thức SUM và cached values, fullCalcOnLoad. Header ngày/năm xuất text để tránh Excel date serial làm lệch các năm không hỗ trợ.

Mutation timeout/connection lost là **chưa biết kết quả**, kể cả abort từ client không hứa DB rollback. Không tự retry POST/PATCH, không dùng requestId làm idempotency. Khóa submit của intent; đọc lại tháng cùng các nhân sự/ô/source liên quan. Nếu request cũ còn chạy, GET có thể thấy trước commit: không tự báo thất bại hoặc thành công chỉ vì một lần GET; giữ trạng thái chưa xác định, cho người dùng tải/đối chiếu lại. Lần lưu có chủ ý mới luôn dùng expected revisions mới đã được xem, CAS bắt mọi late commit sau read. Không tự kết luận ai đã ghi chỉ từ giá trị bằng draft; không bắt buộc feature audit.

Poll đọc15.000ms khi màn hình active, refocus/reconnect đọc lại, không timer từng ô; không hứa tab bị hạn chế vẫn15s. Query read network/5xx retry tối đa2 lần (1s/3s),4xx không retry; write retry=0. Hiện fetchedAt của snapshot và lỗi cập nhật, không báo đồng bộ giả. Draft baseline độc lập query snapshot; logout xóa cache/draft của phiên với cảnh báo trước logout khi dirty, hết phiên giữ draft tạm trong bộ nhớ cho cùng user đăng nhập lại; nếu user khác thì hủy draft/cảnh báo, không gửi sang account khác. Không persist vào URL/localStorage/IndexedDB.

## 6. Gate kiểm contract

Task2 tạo drift pipeline; task3–9 cập nhật DTO/snapshot/types cùng commit. Test runtime malformed/unknown/null/NaN/scope/permission/revision được ánh xạ tại [verification-matrix](verification-matrix.md). OpenAPI oneOf phải mô tả đúng discriminator và runtime validate cùng quy tắc, Nest decorators không tự đảm bảo; compile type không thay test HTTP/PostgreSQL.
