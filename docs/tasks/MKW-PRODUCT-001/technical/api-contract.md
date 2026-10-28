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
| POST `/attendance/reconcile` | ReconcileRequestDto, chỉ đọc theo ID/key | 200 ReconcileSnapshotDto | 400 shape/duplicate/empty,401,403 origin,413/415 |
| POST `/attendance/changes` | WriteAttendanceDto dưới đây | 200 WriteResultDto | 400 shape/duplicate,409 conflict,422 value/no targets |
| GET `/attendance/export?month=2026-10` | Tháng | 200 xlsx stream | 400/401,500 export error |

Mọi route nhân sự/chấm công/export cần phiên hợp lệ, hai tài khoản cùng quyền. Không public signup, delete employee, admin/reset HTTP route hoặc employee self check-in. PATCH tên không đổi ID, optional field thiếu nghĩa giữ cũ; endDate=null mới bỏ mốc kết thúc. Không hỗ trợ delete giá trị nhân sự bằng null; name/startDate=null không hợp lệ. PATCH phải có ít nhất một field name/startDate/endDate ngoài expectedRevision, nếu thiếu trả400 `EMPTY_PATCH`. Name trim ngoài, không rỗng, tối đa200 Unicode code points là giới hạn input kỹ thuật để render/export an toàn, không unique. startDate bắt buộc, endDate>=startDate nếu có. Login username tối đa64 ký tự, password input tối đa1024 bytes để chặn abuse, không tự trim password.

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

PATCH `/employees/00000000-0000-4000-8000-000000000101` request và response200:

```json
{"expectedRevision":"4cb38a76-560e-4511-aea2-479d48cb9490","endDate":"2026-10-20"}
```

```json
{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":"2026-10-20","revision":"00000000-0000-4000-8000-000000000201"}
```

Thay mốc kiểm tất cả tháng; nếu ô ngoài mốc mới có số/F/nhắc thì422 `EMPLOYMENT_DATA_OUTSIDE_INTERVAL`, details `{cells: CellKeyDto[]}` chỉ rõ vị trí, không đổi tên/mốc/data của cả request. Các ô F/reminder-only không bị bỏ qua. Stale employee revision trả409 `EMPLOYEE_CONFLICT` với details `{current: EmployeeDto}` trước khi áp patch. Mỗi PATCH hợp lệ được chấp nhận đều cấp Employee revision mới, kể cả các field gửi bằng giá trị hiện tại sau normalize; đây là fence của ý định ghi, không phải số lần thay nội dung. Lỗi không đổi revision.

GET `/auth/session` không có body, response200 dùng đầy đủ SessionDto như ví dụ login. POST `/auth/logout` gửi JSON bên dưới, response204 không có body:

```json
{}
```

### Đọc đối chiếu theo định danh, không theo membership tháng

POST `/attendance/reconcile` là use case **chỉ đọc**, dùng body để gửi tập ID/key rõ ràng, không đưa dữ liệu đối chiếu vào URL. Không tạo intent, không đổi revision, không fence hoặc hủy write đang chạy. Cùng auth/no-store/Origin/JSON/body limit như route dữ liệu; không log body/response nhân sự. Auth trước lookup, anonymous/expired/revoked trả401 không kèm kết quả từng ID. Hai tài khoản hiện cùng quyền toàn công ty; endpoint không mở quyền ngoài phạm vi này.

```ts
type ReconcileRequestDto = { employeeIds: string[]; cells: CellKeyDto[] };
type ReconcileSnapshotDto = {
  fetchedAt: string; employees: EmployeeDto[]; cells: CellSnapshotDto[];
  missingEmployeeIds: string[];
};
```

Cả hai array bắt buộc; ít nhất một phần tử trên toàn request. UUID/date/kind phải hợp lệ, unknown field/null/duplicate ID hoặc key trả400, không tự sửa input. Union employeeIds và employeeId của cells xác định chính xác tập nhân sự cần đọc; một ID được nêu ở cả hai array là hợp lệ. Không cần month, không yêu cầu giao tháng hoặc cùng kind; không mở rộng thành quét lịch sử. Response employees và missingEmployeeIds sắp theo ID, cells theo employee/date/kind, mỗi key yêu cầu của nhân sự tồn tại đúng một snapshot, không trả thêm ô/tổng/thông tin account.

Đọc Employee và cells trong cùng read-only REPEATABLE READ snapshot. Trả mốc/revision hiện tại của mọi nhân sự tồn tại trong union, kể cả không còn ở tháng đang xem; state suy từ mốc hiện tại. Ô vắng record trả value=null/reminder=false/revision="0"; tombstone trả revision đang lưu, kể cả khi state=N/—. Không làm trống revision vì ô đã ra ngoài mốc. Không dùng absence của nhân sự trong GET tháng để suy ra deleted.

ID không tồn tại được liệt kê trong missingEmployeeIds, không bịa EmployeeDto/revision hoặc cell revision0 cho người đó; các key của người đó không có trong cells. Response200 vẫn đầy đủ phần có thể đọc, client phải đánh dấu thiếu và giữ draft của ID thiếu, không chuyển sang người khác. Bản đầu không có delete/hard-delete nhân sự; nếu ID chưa từng có hoặc bị xóa ngoài contract thì cùng biểu diễn missing, không khẳng định lịch sử xóa hoặc tự tái tạo. DB lỗi trả5xx chung, không coi như missing. Lỗi shape/auth/origin từ chối toàn request, không trả dữ liệu một phần. Việc đọc được trạng thái mới không tự đưa người trở lại bảng tháng hoặc cho phép ghi N/—.

Ví dụ sau PATCH dời ngày bắt đầu sang01/11 và response mất: target20/10 vắng, source19/10 đã được phiên khác clear nội dung/nhắc thành tombstone trước khi đổi mốc, đều N. ID102 chưa tồn tại. Request:

```json
{"employeeIds":["00000000-0000-4000-8000-000000000101","00000000-0000-4000-8000-000000000102"],"cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work"},{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-19","kind":"work"}]}
```

```json
{"fetchedAt":"2026-10-28T08:10:00.000Z","employees":[{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-11-01","endDate":null,"revision":"00000000-0000-4000-8000-000000000202"}],"cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-19","kind":"work","value":null,"reminder":false,"revision":"00000000-0000-4000-8000-000000000203","state":"before-start"},{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","value":null,"reminder":false,"revision":"0","state":"before-start"}],"missingEmployeeIds":["00000000-0000-4000-8000-000000000102"]}
```

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
    | { type: 'set-reminder'; reminder: boolean }
    | { type: 'patch-cell'; patch: { value?: CellValueDto; reminder?: boolean } };
  source?: CellExpectationDto;
};
type TargetPreviewDto = { selected: number; eligible: number; skipped: number; changed: number };
type WriteResultDto = { state: 'saved'; cells: CellSnapshotDto[];
  employees: EmployeeDto[]; counts: TargetPreviewDto; savedAt: string };
```

- Thiếu required field không thành default ghi. value=null nghĩa xóa nội dung, không xóa reminder; type set-reminder chỉ đổi reminder, không mang value/mode/source. UI bản đầu chỉ set-reminder một ô; API từ chối reminder targets nhiều hơn1 để không tự thêm thao tác nhắc hàng loạt chưa thiết kế.
- `patch-cell` chỉ đúng một target, không mode/source; patch có ít nhất một trong value/reminder, unknown field hoặc patch rỗng/null trả400. Field thiếu giữ nguyên field đó; value=null xóa nội dung; reminder=false tắt nhắc, reminder=null trả400. Normalize/validate value theo kind như set-value (work0→F, overtime0/F không hợp lệ). Hai field gửi cùng nhau dùng **một** cell expectedRevision và cùng employee CAS/transaction; một lỗi validation/conflict thì cả value/reminder/revision không đổi. Editor đổi cả giá trị và màu trước một lần Lưu gửi một patch-cell, không tách hai request hoặc tự lưu toggle. Chỉ đổi màu có thể dùng set-reminder hoặc patch chỉ reminder; Hủy không gửi write. Runtime và OpenAPI phải enforce một target/patch minProperties=1/oneOf discriminator, không chỉ dựa optional TypeScript.
- Batch UI mặc định fill-empty; wire bắt mode rõ, server không đoán. Trống là value=null dù reminder=true, F/số không trống. replace thay nội dung nhưng vẫn kiểm revision, không ghi đè người khác bằng force flag.
- Client dedupe target; server trả400 `DUPLICATE_TARGET` nếu trùng để bắt lỗi client, không ghi lặp. Tất cả targets/source phải cùng month và cùng kind, employee tồn tại. Trái phạm vi trả422 `INVALID_TARGET_SCOPE` trước ghi. source chỉ hợp lệ với set-value, không nằm trong targets, hiện editable và có số/F; value gửi phải khớp snapshot source sau normalize. Không copy reminder hoặc tạo dãy. Source thay đổi revision trả409 ngay cả khi nội dung tình cờ bằng cũ.
- Trong transaction: kiểm employee revision của toàn bộ tập, đối chiếu revision mọi ô editable được chọn (kể cả ô có sẵn sẽ không được fill-empty), và source; bất kỳ stale nào trả409, không tự co/giãn tập ghi. Sau đó loại N/— khỏi eligible và báo skipped; fill-empty loại nội dung không rỗng. Không có eligible trả422 `NO_ELIGIBLE_TARGETS`, không ghi.
- selected=targets.length, skipped chỉ ô N/—, eligible sau skip/mode, changed chỉ ô có value/reminder thật sự thay sau normalize, không tính revision. Source không tính target. **Mỗi eligible target của write được chấp nhận đều nhận UUID revision mới**, kể cả no-op changed=0; clear/reminder=false trên ô vắng tạo empty tombstone revision khác0. Một patch đổi cả hai field chỉ cấp một revision. CAS chạy trước xét no-op, không chấp nhận stale vì giá trị tình cờ bằng nhau. Server trả snapshots mọi target và employee revision hiện tại; attendance write không đổi Employee revision vì Employee chỉ được đọc/khóa. Query month invalidate để lấy tổng, chỉ báo saved sau response. Tổng cũ trong lúc refetch phải có trạng thái đang cập nhật, không gọi đã đồng bộ.
- Đích fill-empty đã có số/F, đích N/— và source chỉ đọc: không đổi nội dung, nhắc hoặc revision, không được gọi là đã fence. Đích không rỗng được fill-empty loại không nằm trong eligible và cũng không cộng vào skipped (skipped chỉ N/—); có thể suy số loại do mode bằng selected-skipped-eligible. eligible=0 trả422 `NO_ELIGIBLE_TARGETS`, không cấp bất kỳ revision nào; không dùng request bị từ chối để xác nhận đã giữ giá trị. Lỗi/rollback ở bất kỳ đích nào giữ cả revision của những đích còn lại.

Ví dụ một ô công0 thànhF, giữ reminder:

```json
{"month":"2026-10","expectedEmployees":[{"employeeId":"00000000-0000-4000-8000-000000000101","expectedRevision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"targets":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","expectedRevision":"0"}],"operation":{"type":"set-value","value":{"type":"number","value":0},"mode":"replace"}}
```

Response200 (employee vẫn mốc15/10–không kết thúc của ví dụ POST; các fixture mỗi mục độc lập):

```json
{"state":"saved","cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","value":{"type":"absence"},"reminder":false,"revision":"00000000-0000-4000-8000-000000000301","state":"editable"}],"employees":[{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":null,"revision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"counts":{"selected":1,"eligible":1,"skipped":0,"changed":1},"savedAt":"2026-10-28T08:00:00.000Z"}
```

Ví dụ editor tiếp từ response trên: đổi F→1,5 và bật nhắc trong một lần Lưu, request/response đầy đủ:

```json
{"month":"2026-10","expectedEmployees":[{"employeeId":"00000000-0000-4000-8000-000000000101","expectedRevision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"targets":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","expectedRevision":"00000000-0000-4000-8000-000000000301"}],"operation":{"type":"patch-cell","patch":{"value":{"type":"number","value":1.5},"reminder":true}}}
```

```json
{"state":"saved","cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","value":{"type":"number","value":1.5},"reminder":true,"revision":"00000000-0000-4000-8000-000000000302","state":"editable"}],"employees":[{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":null,"revision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"counts":{"selected":1,"eligible":1,"skipped":0,"changed":1},"savedAt":"2026-10-28T08:01:00.000Z"}
```

Ví dụ recovery giữ ô overtime đang vắng/không nhắc: người dùng đã đối chiếu và chọn giữ reminder=false, request set-reminder vẫn được gửi; response changed=0 nhưng tạo tombstone revision307, không giữ0:

```json
{"month":"2026-10","expectedEmployees":[{"employeeId":"00000000-0000-4000-8000-000000000101","expectedRevision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"targets":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"overtime","expectedRevision":"0"}],"operation":{"type":"set-reminder","reminder":false}}
```

```json
{"state":"saved","cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"overtime","value":null,"reminder":false,"revision":"00000000-0000-4000-8000-000000000307","state":"editable"}],"employees":[{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":null,"revision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"counts":{"selected":1,"eligible":1,"skipped":0,"changed":0},"savedAt":"2026-10-28T08:01:30.000Z"}
```

Batch/fill giữ operation set-value chỉ ghi nội dung. Trước Áp dụng UI hiển thị số ô và mode; replace có dữ liệu hiển thị xác nhận “Ghi đè nội dung của … ô”, không thêm undo sau lưu. Hủy xác nhận giữ draft. Ví dụ fill số3,5: nguồn19/10 ở revision303 có reminder=false; đích20/10 trống có reminder=true/revision304, đích22/10 có F/revision305, đích14/10=N/revision0. Chỉ20/10 eligible, nhắc đích giữ true; nguồn và hai đích bị loại không đổi revision. Request/response:

```json
{"month":"2026-10","expectedEmployees":[{"employeeId":"00000000-0000-4000-8000-000000000101","expectedRevision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"targets":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-14","kind":"work","expectedRevision":"0"},{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","expectedRevision":"00000000-0000-4000-8000-000000000304"},{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-22","kind":"work","expectedRevision":"00000000-0000-4000-8000-000000000305"}],"operation":{"type":"set-value","value":{"type":"number","value":3.5},"mode":"fill-empty"},"source":{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-19","kind":"work","expectedRevision":"00000000-0000-4000-8000-000000000303"}}
```

```json
{"state":"saved","cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-14","kind":"work","value":null,"reminder":false,"revision":"0","state":"before-start"},{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","value":{"type":"number","value":3.5},"reminder":true,"revision":"00000000-0000-4000-8000-000000000306","state":"editable"},{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-22","kind":"work","value":{"type":"absence"},"reminder":false,"revision":"00000000-0000-4000-8000-000000000305","state":"editable"}],"employees":[{"id":"00000000-0000-4000-8000-000000000101","name":"Nhân sự thử 01","startDate":"2026-10-15","endDate":null,"revision":"4cb38a76-560e-4511-aea2-479d48cb9490"}],"counts":{"selected":3,"eligible":1,"skipped":1,"changed":1},"savedAt":"2026-10-28T08:02:00.000Z"}
```

Batch chọn rời không kéo dùng cùng shape, bỏ hẳn source; không gửi source=null. Response không chứa ô nguồn vì source chỉ đọc; reconcile đọc lại source khi cần. WriteResult cells sắp employee/date/kind, employees sắp ID và chứa union nhân sự đích/nguồn.

Conflict response409:

```json
{"error":{"code":"ATTENDANCE_CONFLICT","message":"Dữ liệu đã thay đổi. Hãy kiểm tra trước khi lưu lại.","details":{"cells":[{"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-10-20","kind":"work","value":{"type":"number","value":1.5},"reminder":true,"revision":"aef81b89-a688-4cca-9ceb-2d52dc9bdd85","state":"editable"}],"employees":[],"sourceChanged":false}},"requestId":"fixture-request-01"}
```

Nếu employee revision đổi, details.employees có EmployeeDto mới và cells gồm target/source cần đối chiếu; toàn bộ batch vẫn rollback. UI giữ raw/value/màu/mode/selection/source và baseline cũ, hiển thị dữ liệu mới cạnh draft. Chỉ sau quyết định rõ của người dùng mới tạo intent mới với baseline mới; không force-write/auto retry hoặc tự merge draft. Lỗi validation422 có details `{fields:[{path,code,message}]}`, lỗi network/status5xx không bị chuyển thành saved.

## 5. Snapshot, export và timeout

GET tháng và export đọc snapshot nhất quán của nhân sự/cả hai loại/tổng theo [data-model](data-model.md); dữ liệu đang draft không được gửi vào export. Export200 Content-Type=`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, attachment filename ASCII `minh-khue-2026-10.xlsx` và filename* UTF-8 nếu cần. Lỗi trước stream trả JSON; stream đứt không báo tải thành công. Một sheet Công trên/Tăng ca dưới, text/số/trống đúng kiểu; công thức SUM và cached values, fullCalcOnLoad. Header ngày/năm xuất text để tránh Excel date serial làm lệch các năm không hỗ trợ.

Mutation timeout/connection lost là **chưa biết kết quả**, kể cả abort từ client không hứa DB rollback. Không tự retry mutation POST/PATCH, không dùng requestId làm idempotency. Khóa submit của intent cũ; đọc lại tháng để cập nhật bảng và dùng reconcile với mọi employee ID/target/source của intent để đối chiếu, không phụ thuộc nhân sự còn giao tháng. Nếu request cũ còn chạy, mọi read có thể thấy trước commit: GET/reconcile/abort/đóng editor/bỏ draft không là fence và không chứng minh request cũ đã kết thúc. Giữ trạng thái chưa xác định; cho người dùng xem lại snapshot, không tự đổi baseline draft hoặc báo saved vì giá trị trùng.

Sau đối chiếu, người dùng có thể chủ ý gửi **intent mới** theo revisions vừa xem, kể cả chọn giữ giá trị hiện tại: dùng replace hoặc patch-cell với field muốn giữ được gửi tường minh; employee PATCH gửi field muốn giữ. Không bỏ request này vì client thấy no-op. Trên resource cả A cũ và B mới cùng kiểm CAS/ghi: nếu A commit sau snapshot đối chiếu nhưng trước khi B lấy lock, B conflict; nếu B được chấp nhận trước, revision mới của B khiến A stale và rollback toàn bộ. B thành công chỉ xác nhận ý định mới trên các đích eligible đã nhận revision mới; không xác nhận tác giả/kết quả A, không ngăn write tương lai dùng baseline mới.

Fence trên cell áp cho cả value/reminder; fence Employee chỉ được tạo bởi Employee PATCH, attendance write không ngăn PATCH nhân sự cũ nếu Employee revision chưa đổi. Đích fill-empty đã có nội dung, N/— và source không được fence chỉ vì cùng xuất hiện trong request; eligible=0 cũng không fence. Nếu người dùng muốn giữ giá trị một đích editable bị fill-empty loại, phải đối chiếu rồi chọn replace/patch tường minh, không tự đổi mode hoặc tập đích. Không ghi nguồn để giả hủy fill; stale một eligible target hoặc employee mà A phụ thuộc đã đủ làm A rollback, nhưng không được hứa hủy mọi request khác liên quan source/đích bị skip. Nếu tất cả đích bị loại hoặc người dùng chỉ bỏ draft thì vẫn không có bằng chứng hủy A; tiếp tục cho tải/đối chiếu và hiển thị chưa xác định. Khi mốc đổi, không mở ghi N/— để tạo fence.

POST tạo nhân sự bị mất response trước khi có ID không có CAS để fence/reconcile theo ID; tên trùng được phép nên không suy thành công từ tên hoặc tự gửi lại. Giữ kết quả chưa xác định, tải lại danh sách để người dùng đối chiếu; chỉ đọc theo ID khi đã xác định được ID. Không hứa exactly-once hoặc thêm idempotency/create-recovery protocol trong bản này.

Poll đọc15.000ms khi màn hình active, refocus/reconnect đọc lại, không timer từng ô; không hứa tab bị hạn chế vẫn15s. Query read network/5xx retry tối đa2 lần (1s/3s),4xx không retry; riêng POST reconcile cũng là read nên áp cùng policy, mọi mutation write retry=0. Hiện fetchedAt của snapshot và lỗi cập nhật, không báo đồng bộ giả. Draft baseline độc lập query snapshot; logout xóa cache/draft của phiên với cảnh báo trước logout khi dirty, hết phiên giữ draft tạm trong bộ nhớ cho cùng user đăng nhập lại; nếu user khác thì hủy draft/cảnh báo, không gửi sang account khác. Không persist vào URL/localStorage/IndexedDB.

## 6. Gate kiểm contract

Task2 tạo drift pipeline; task3–9 cập nhật DTO/snapshot/types cùng commit. Test runtime malformed/unknown/null/NaN/scope/permission/revision được ánh xạ tại [verification-matrix](verification-matrix.md). OpenAPI oneOf phải mô tả đúng discriminator và runtime validate cùng quy tắc, Nest decorators không tự đảm bảo; compile type không thay test HTTP/PostgreSQL.

## 7. Fixture MonthDto đầy đủ để kiểm contract

GET `/attendance/month?month=2026-02` không có body. Response200 dưới đây là toàn bộ tháng28 ngày, một nhân sự giao tháng, đủ56 ô và28 tổng ngày cho mỗi loại; không phải projection cắt ngắn. Ngày01=N, ngày02 công F/tăng ca trống, ngày03 có1,5 công (nhắc xanh) và2 giờ; ngày04–28=—. Tổng công1,5 và tăng ca2, trống/F/N/— không cộng số. Fixture độc lập với các ví dụ tháng10. Cells theo employee/date/kind (kind theo tên wire: overtime trước work).

```json
{
  "month": "2026-02",
  "fetchedAt": "2026-10-28T08:03:00.000Z",
  "employees": [
    {
      "id": "00000000-0000-4000-8000-000000000101",
      "name": "Nhân sự thử 01",
      "startDate": "2026-02-02",
      "endDate": "2026-02-03",
      "revision": "00000000-0000-4000-8000-000000000400"
    }
  ],
  "cells": [
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-01","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"before-start"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-01","kind":"work","value":null,"reminder":false,"revision":"0","state":"before-start"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-02","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"editable"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-02","kind":"work","value":{"type":"absence"},"reminder":false,"revision":"00000000-0000-4000-8000-000000000401","state":"editable"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-03","kind":"overtime","value":{"type":"number","value":2},"reminder":false,"revision":"00000000-0000-4000-8000-000000000402","state":"editable"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-03","kind":"work","value":{"type":"number","value":1.5},"reminder":true,"revision":"00000000-0000-4000-8000-000000000403","state":"editable"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-04","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-04","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-05","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-05","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-06","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-06","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-07","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-07","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-08","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-08","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-09","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-09","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-10","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-10","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-11","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-11","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-12","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-12","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-13","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-13","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-14","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-14","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-15","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-15","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-16","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-16","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-17","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-17","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-18","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-18","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-19","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-19","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-20","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-20","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-21","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-21","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-22","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-22","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-23","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-23","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-24","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-24","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-25","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-25","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-26","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-26","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-27","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-27","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-28","kind":"overtime","value":null,"reminder":false,"revision":"0","state":"after-end"},
    {"employeeId":"00000000-0000-4000-8000-000000000101","date":"2026-02-28","kind":"work","value":null,"reminder":false,"revision":"0","state":"after-end"}
  ],
  "totals": {
    "work": {
      "byEmployee": [
        {
          "employeeId": "00000000-0000-4000-8000-000000000101",
          "value": 1.5
        }
      ],
      "byDate": [
        {"date":"2026-02-01","value":0},
        {"date":"2026-02-02","value":0},
        {"date":"2026-02-03","value":1.5},
        {"date":"2026-02-04","value":0},
        {"date":"2026-02-05","value":0},
        {"date":"2026-02-06","value":0},
        {"date":"2026-02-07","value":0},
        {"date":"2026-02-08","value":0},
        {"date":"2026-02-09","value":0},
        {"date":"2026-02-10","value":0},
        {"date":"2026-02-11","value":0},
        {"date":"2026-02-12","value":0},
        {"date":"2026-02-13","value":0},
        {"date":"2026-02-14","value":0},
        {"date":"2026-02-15","value":0},
        {"date":"2026-02-16","value":0},
        {"date":"2026-02-17","value":0},
        {"date":"2026-02-18","value":0},
        {"date":"2026-02-19","value":0},
        {"date":"2026-02-20","value":0},
        {"date":"2026-02-21","value":0},
        {"date":"2026-02-22","value":0},
        {"date":"2026-02-23","value":0},
        {"date":"2026-02-24","value":0},
        {"date":"2026-02-25","value":0},
        {"date":"2026-02-26","value":0},
        {"date":"2026-02-27","value":0},
        {"date":"2026-02-28","value":0}
      ],
      "grandTotal": 1.5
    },
    "overtime": {
      "byEmployee": [
        {
          "employeeId": "00000000-0000-4000-8000-000000000101",
          "value": 2
        }
      ],
      "byDate": [
        {"date":"2026-02-01","value":0},
        {"date":"2026-02-02","value":0},
        {"date":"2026-02-03","value":2},
        {"date":"2026-02-04","value":0},
        {"date":"2026-02-05","value":0},
        {"date":"2026-02-06","value":0},
        {"date":"2026-02-07","value":0},
        {"date":"2026-02-08","value":0},
        {"date":"2026-02-09","value":0},
        {"date":"2026-02-10","value":0},
        {"date":"2026-02-11","value":0},
        {"date":"2026-02-12","value":0},
        {"date":"2026-02-13","value":0},
        {"date":"2026-02-14","value":0},
        {"date":"2026-02-15","value":0},
        {"date":"2026-02-16","value":0},
        {"date":"2026-02-17","value":0},
        {"date":"2026-02-18","value":0},
        {"date":"2026-02-19","value":0},
        {"date":"2026-02-20","value":0},
        {"date":"2026-02-21","value":0},
        {"date":"2026-02-22","value":0},
        {"date":"2026-02-23","value":0},
        {"date":"2026-02-24","value":0},
        {"date":"2026-02-25","value":0},
        {"date":"2026-02-26","value":0},
        {"date":"2026-02-27","value":0},
        {"date":"2026-02-28","value":0}
      ],
      "grandTotal": 2
    }
  }
}
```
