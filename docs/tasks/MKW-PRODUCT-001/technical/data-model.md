# Mô hình dữ liệu và transaction — thiết kế cho G1

Ngày28/10/2026. **Proposed for G1 review**; chưa Prisma schema/migration/DB được tạo hoặc kiểm. Đọc cùng [API](api-contract.md), [auth](auth-session.md), [plan](implementation-plan.md). Chọn PostgreSQL/Prisma theo ADR-003, không khảo sát lại stack.

## 1. Bản ghi và invariant

| Model đề xuất | Cột và constraint chính |
| --- | --- |
| User | id UUID PK; username varchar64 unique case-sensitive; passwordHash text; authVersion bigint>=1; createdAt/updatedAt timestamptz UTC. Không role/admin field |
| Session | id UUID PK nội bộ; tokenHash bytea unique (SHA256 token ngẫu nhiên), userId FK RESTRICT; authVersion; createdAt/expiresAt/lastSeenAt timestamptz; revokedAt nullable. expiresAt tuyệt đối, idle tính lastSeenAt. Không lưu raw cookie |
| AuthThrottle | bucketKey HMAC-SHA256, windowStart timestamptz, attempts integer>=0, expiresAt timestamptz; PK(bucketKey,windowStart), index expiresAt; auth sở hữu quota login, không role sản phẩm |
| Employee | id UUID PK; name text (1–200 Unicode code points sau trim); startDate date; endDate date nullable>=startDate; revision UUID not null, createdAt/updatedAt UTC. Tên không unique, không hard delete |
| AttendanceCell | employeeId FK RESTRICT; date date; kind enum work/overtime; valueType enum empty/number/absence; halfUnits smallint nullable; reminder boolean not null default false; revision UUID not null; updatedAt UTC. PK(employeeId,date,kind), index date/employeeId khi cần query theo tháng |

Nửa đơn vị lưu integer:1.5 công=3,2 giờ=4,30 công=60,24 giờ=48. CHECK: empty→halfUnits IS NULL; absence→kind=work và halfUnits IS NULL; number→halfUnits1..60 với work hoặc1..48 với overtime. reminder độc lập valueType; absence không có halfUnits0. Tổng cộng integer bigint/cast SQL rồi chia2 lúc serialize, không cộng float tùy tiện; JSON numeric half values luôn chính xác. Ô chưa có record tương đương empty/reminder=false/revision0. N/— là projection từ Employee, không enum DB được phép ghi.

Clear một ô đã tồn tại thành empty vẫn giữ record/tombstone, cấp revision UUID mới nếu content/nhắc đổi, không delete/recreate về revision0. UUID do crypto.randomUUID sinh trên server; client không được cấp revision. Khi same value/reminder không đổi thì giữ revision. Employee bất kỳ patch làm đổi dữ liệu cũng đổi revision, no-op giữ nguyên; client snapshot mốc/tên cũ bị conflict thay vì áp sai ngữ cảnh. Unique key và giữ tombstone chặn ABA; authVersion bigint chỉ nội bộ server, không JS number mất chính xác.

Database CHECK bảo vệ cấu trúc/số; invariant liên bảng “số/F/nhắc chỉ trong mốc làm việc” bắt buộc service/transaction và review. Không tuyên bố foreign key tự enforce interval. Không cho client ghi DB trực tiếp, không grant DB user công khai; migration DDL role và app runtime role tách khi vận hành được cấp quyền.

## 2. Khoảng nhân sự và tháng

Membership tháng: startDate<=monthEnd và (endDate IS NULL hoặc endDate>=monthStart). Ngày bắt đầu/kết thúc inclusive; trước startDate N, sau endDate —, không tự phát sinh công. GET chỉ người có giao tháng, không lọc nhân sự theo ngày tạo bản ghi; dữ liệu cũ giữ nguyên, không xóa khi nghỉ. Trùng tên là ID khác, không gộp. Không tự thêm nhiều giai đoạn làm việc.

Mọi date dùng PostgreSQL date và chuỗi ngày lịch ở Prisma boundary; không `new Date(raw)` rồi local getter khiến lệch timezone. Prisma biểu diễn Date theo driver phải có adapter chuyển date-only có test timezone UTC/Asia/Ho_Chi_Minh/America/Los_Angeles. Các timestamp kỹ thuật UTC không được dùng thay ngày làm việc.

## 3. Khóa và thứ tự transaction

Đề xuất dùng explicit row lock trên Employee để serialize các write cùng nhân sự, kể cả ô chưa tồn tại. Có thể chậm hơn lock từng ô nhưng đơn giản kiểm đúng ở bản đầu20 người; đo200/1.000, không thay locking để đạt số đo bằng cách bỏ consistency.

**Mọi mutation dữ liệu** chạy trong Prisma interactive transaction, PostgreSQL READ COMMITTED, thứ tự:

1. Lock User của actor FOR SHARE, kiểm Session/token/authVersion/revoked/expiry trong transaction. Reset mật khẩu lock cùng User FOR UPDATE rồi thay hash/authVersion/revoke tất cả session trong cùng transaction; write/session cũ không được lách reset sau khi reset đã commit. Login cũng khóa User khi xác minh cuối và tạo Session, không cấp phiên từ hash cũ sau reset.
2. Thu thập union employeeId trong targets và source, sort UUID tăng dần, lock từng Employee FOR UPDATE theo thứ tự. Không lock target trước/source sau theo trật tự input; tránh deadlock khi fill xuyên người. Update employee lock một Employee cùng quy tắc. Không lấy thêm User sau khi đã lock Employee.
3. Sau khi được lock mới đọc/kiểm expected employee revision, mốc, tất cả ô editable được chọn và source. Các ô vắng record vẫn an toàn vì mọi writer phải qua khóa Employee. Kiểm shape/value trước transaction được phép nhưng phải kiểm revision/mốc/hiện trạng trong transaction.
4. Nếu conflict/lỗi: không write một phần. Với update mốc, truy vấn mọi tháng trong khoảng bị loại có valueType!=empty OR reminder=true; có bất kỳ ô nào thì từ chối cả patch, trả vị trí. Nếu giữ dữ liệu ngoài mốc phát hiện từ migration/DB thủ công, fail và báo vận hành, không tự xóa.
5. Khi mọi check đạt, ghi toàn bộ eligible target, giữ reminder nếu set-value/giữ value nếu set-reminder; UUID mới cho ô có thay đổi. Update mốc chỉ sau kiểm; DB lỗi bất kỳ rollback toàn bộ. Trả result sau commit, không báo saved trước.

Lock timeout3s, transaction timeout10s là giá trị vận hành đề xuất; giữ transaction ngắn không network/export/hash trong lúc khóa lâu. Deadlock/serialization/lock timeout trả503 `TEMPORARILY_UNAVAILABLE`, không server/client auto retry write. UI giữ draft và đối chiếu lại. Không dựa vào mutex Node để khóa xuyên hai process. Không SQL string interpolation từ input; dùng Prisma parameterized query/transaction.

### Ranh giới module

`LockedEmployee = { id: string; name: string; startDate: string; endDate: string | null; revision: string }`, ngày đã map date-only; `ProductTransaction` là alias Prisma.TransactionClient trong infrastructure DB nội bộ API. HTTP layer map CellKeyDto; helper persistence dùng interface key cùng cấu trúc, không import DTO class để chạy query.

EmployeesModule export `EmploymentConsistency` với `lockEmployees(tx: ProductTransaction, ids: string[]): Promise<LockedEmployee[]>` và `findExcludedCells(tx: ProductTransaction, employeeId: string, proposedStart: string, proposedEnd: string | null): Promise<CellKeyDto[]>`; ProductTransaction thuộc infrastructure DB, LockedEmployee là interface công khai employee, không export Prisma entity ra web. AttendanceModule dùng interface public này, không import employees.repository. Employees kiểm cell bị loại qua data-access query trong same transaction, không gọi AttendanceService rồi tạo vòng phụ thuộc; query này chỉ phục vụ invariant mốc, không sở hữu logic công/tổng. Không import HTTP DTO vào DB helpers; controller map public DTO.

AuthModule export `SessionAuthorizer.authorizeMutation(tx, credential): Promise<SessionIdentity>` để module ghi dùng cùng User/Session fence; HTTP guard vẫn chặn sớm, không thay kiểm trong transaction. Infrastructure chỉ cấu hình/query transaction, không chứa mọi nghiệp vụ.

## 4. Đọc nhất quán và Excel

`readMonth` dùng read-only REPEATABLE READ transaction: đọc Employee/cells/cả hai loại/tổng trong cùng snapshot rồi commit. Không ghép employee trước commit A với cells sau commit B. Không lock toàn tháng để đọc; số liệu trả đã lưu tại snapshot đó. Export lấy snapshot cùng use case, tạo workbook sau khi transaction đọc đã đóng; không giữ DB transaction trong lúc stream Excel hoặc tương tác browser.

Tổng mỗi loại theo employee/date/grandTotal chỉ cộng halfUnits của number. Reminder/absence/empty/N/— không đổi phép cộng. Excel dùng cùng snapshot và tổng cached, công thức SUM text bỏ qua ký hiệu; không lấy tổng optimistic từ client.

## 5. Migration và khả năng khôi phục

Đề xuất chuỗi migration:001 User/Session/AuthThrottle,002 Employee/AttendanceCell (đủ schema cho bảo vệ mốc task4),003 index/constraint phát sinh nếu thật sự cần ở task5. Không tạo migration rỗng; task4 chưa có public attendance write nhưng fixture test có thể tạo cells thử trong DB riêng. Định nghĩa enum/check/index bằng SQL reviewed khi Prisma chưa biểu đạt CHECK; schema.prisma không được coi là đủ bằng chứng DDL đúng.

Task2 dựng infrastructure kết nối kiểm target, task3/4 chạy migration theo baseline tương ứng, task5 chứng minh transaction bằng PostgreSQL thật. Seed nhân sự/account fixture chỉ DB run-owned; hai account vận hành thật tạo riêng sau quyền và secret channel. Cấm reset database đã có/không rõ owner để test xanh. Migrate empty DB và baseline trước phải giữ ID/hash/nhắc/nửa đơn vị/revision; migration failure không được làm app giả hoạt động với schema lệch.

Backup/restore task11: pg_dump format custom, restore vào DB mới đã xác minh target; so counts + nội dung/tổng/nhắc/mốc và revoke mọi session đã restore trước mở truy cập. Không copy production DB/nhân sự thật vào test. Release/migration thật, retention và target storage chưa duyệt, không chạy trong G1.

## 6. Ca cạnh tranh bắt buộc

- Hai connection cùng expectedRevision0 cho ô vắng: một thành công, request sau conflict, đúng một giá trị lưu.
- Đọc revA, sửa→clear→sửa lại cùng giá trị: không tái dùng revA, request cũ bị từ chối.
- A đổi reminder, B đổi value cùng revision: không mất nhắc; B conflict thay vì ghi từ snapshot cũ.
- Batch có hai đích, một đích bị A đổi: B không ghi cả đích còn lại; fill-empty cũng kiểm ô hiện có đã chọn.
- Source fill đổi (kể cả chỉ reminder) sau snapshot hoặc mốc nhân sự source đổi: batch conflict/sourceChanged, source read-only không bị ghi.
- A đổi mốc, B ghi number/F/reminder-only ở tháng khác: thứ tự lock nào cũng chỉ cho kết quả invariant hợp lệ, không tạo ô ngoài mốc hoặc mất dữ liệu.
- A reset/revoke, B ghi: reset commit trước authorization fence →401, B không mutation; request B hoàn tất trước reset được giữ dữ liệu hợp lệ.
- Hai request đảo thứ tự target employee: khóa UUID sorted không deadlock theo thứ tự input. Ghi timeout sau commit không rollback giả.

Test dùng connection/barrier thật và đọc DB độc lập sau commit, không sleep đoán lịch hoặc SQLite mock. Chi tiết command/expected ở [verification-matrix](verification-matrix.md); mọi ca trên **Not run**.
