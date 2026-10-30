# Backup và restore sản phẩm — rehearsal local Task11

Ngày30/10/2026. Chỉ fake sandbox PostgreSQL17.11 đã có quyền, không production target, scheduler hoặc release. [Runbook](product-runbook.md) sở hữu target/secret/operator checklist; [data model](../tasks/MKW-PRODUCT-001/technical/data-model.md), [schema](../../apps/api/prisma/schema.prisma) và [migrations](../../apps/api/prisma/migrations) sở hữu cấu trúc. Logical dump một DB không backup OS/roles/tablespaces/secret store/web artifact/proxy/DNS/TLS; không chứng minh PITR, HA, DR hoặc RPO/RTO đã chọn.

## Điều kiện và bảo vệ artifact

1. Ghi owner/quyền, source identity, app/schema version, run UUID, phạm vi/dữ liệu giả, đầu ra ignored riêng. Identity actual trước **mỗi** DBcreate/migration/dump/restore/reset/mutation theo runbook, không chỉ tin owner JSON. Trước start/stop kiểm process exe/`-D`/data/user/port/version; fresh DB dùng UUID không tái sử dụng DB cũ.
2. Dump có passwordHash, session tokenHash và throttle HMAC keys, vẫn sensitive. Raw session cookie/password chỉ memory/private pipe, không nằm trong archive theo schema. Không `pg_restore --file` để xem SQL, không in `--list`/dump contents vào history/log, không đọc hash/token fields vào evidence. Hash SHA256 **toàn file**/size/time/exit code là metadata được phép, không là checksum credential.
3. Không Git/trace/browser snapshot/upload. Local artifact hiện nằm ignored task-owned; quyền OS hiện có không chứng minh encryption/ACL/secret-store production. Trước thật phải chọn storage/ACL/encryption/key custody, retention/số bản/lịch/RPO/RTO/owner và kiểm phục hồi định kỳ. Task11 không tự quyết số ngày hoặc tự xóa evidence.
4. Logical `pg_dump` tạo snapshot nhất quán DB; app in-memory drafts không được lưu và không nằm trong dump. Trong rehearsal source đứng yên lúc dump. Để rollback/cutover thật cần quiesce writes và ghi mốc; thay đổi sau snapshot có thể mất khi restore, phải có quyết định rõ. Không hứa dump nhiều DB/roles là atomic.

## Lệnh có thật đã diễn tập

Portable runtime/PATH và PG binary root theo LOCAL_RUN/runbook. Rehearsal helper ignored `.agent-runs/MKW-PRODUCT-001/task11-operations/rehearsal.mjs` được giữ để reviewer đọc; không là CLI deployment hoặc script sản phẩm hỗ trợ production. Sau reacquire đúng identity, từ root worktree:

```powershell
node .agent-runs/MKW-PRODUCT-001/task11-operations/rehearsal.mjs
```

Mỗi invocation tạo `run-<unique>` và **ba DB UUID mới**: source migrate/provision fake; destination rỗng restore; failure fixture riêng. Helper guard bằng actual openSandboxTarget trước SQL/API/subprocess mutations; private pipe gọi đúng pnpm provision/reset, không secret literal/argv/env/log. Nó không start/stop PG hoặc drop/reset DB; không sửa evidence run trước. Nếu fail vẫn rotate/revoke mọi DB có auth schema và close own HTTP; xem `result.json`/`release.json`, không suy exit đơn lẻ thành release.

Native commands thực tế trong `commands.json` (các placeholder là metadata đã kiểm, không production target):

```text
pg_dump.exe --host 127.0.0.1 --port <own-port> --username mkw_task11 --no-password --format=custom --file <unique-ignored-sensitive.dump> <source-uuid-db>
pg_restore.exe --list <unique-ignored-sensitive.dump>
pg_restore.exe --host 127.0.0.1 --port <own-port> --username mkw_task11 --no-password --dbname <different-empty-uuid-db> --single-transaction --exit-on-error --no-owner --no-privileges <unique-ignored-sensitive.dump>
pnpm --filter @mkw/api db:deploy
```

`--no-password` refuse prompt, dùng trust chỉ trên fake loopback sandbox. Production DB credential transport chưa chọn; không đặt password vào URL argv/`PGPASSWORD` bị log. Dump mặc định gồm schema/data/migration/auth; restore bỏ ownership/grants để local role sở hữu. Production cần thiết kế role/grants riêng; không khẳng định no-owner/no-privileges đủ least privilege.

Trước pg_restore, kiểm source khác destination; destination do **run hiện tại** tạo, không có bảng public. Giữ target record trước CREATE, guard actual maintenance identity trước CREATE và DB mới trước restore. `--list` thành công kiểm archive header/TOC, chưa chứng minh restore được. Không `--clean`, `--create`, drop database hoặc restore vào DB đang dùng; exit!=0 đánh dấu Failed, giữ DB lỗi để phân tích, không đưa vào phục vụ. `--single-transaction --exit-on-error` bảo vệ rollback khi lỗi SQL trong rehearsal; không thay quy trình backup/cutover.

## Kiểm nội dung và auth sau restore

Run `run-zrdYYc` ngày30/10/2026 UTC00:27:36.214–00:27:47.770,11,556s, Node24.22.1/pnpm12.15.0/PG17.11. Source/destination/failure DB tên đầy đủ tại target records, không phải DB cũ. Evidence root `.agent-runs/MKW-PRODUCT-001/task11-operations/`; số liệu xem `run-zrdYYc/comparisons.json`, `commands.json`, `result.json`, `backup-metadata.json`, `release.json`.

- Source có2 accounts/2 sessions,4 employees,11 stored cells và2 migrations; fixture fake đang làm, hữu hạn03–20/10 inclusive, tương lai01/11 và đã nghỉ30/09. Có số công1,5/1, tăng ca2,5/0,5, F, blank absent revision0, reminder-only và tombstone stored nonzero revision, tháng09/10/11.
- SQL fresh connections trước/sau: count và **mọi field Employee/AttendanceCell**, date intervals, reminder, halfUnits/valueType/revision/timestamps khớp; user/session metadata không secret, migration checksum/finished time, throttle non-key metadata khớp. Credential fields không query/serialize; cookie/password authentication thật kiểm khả năng phục hồi hash/session. Relations không orphan User–Session/Employee–Cell. DDL do native restore tái tạo; rehearsal kiểm dữ liệu/relations và rollback khi conflict, không claim một schema-drift audit độc lập.
- API mới/pools mới đọc toàn month09/10/11 bằng restored old cookies; loại fetchedAt khỏi equality vì là thời điểm đọc. Membership, N/—, F/blank/reminder/revisions, totals byEmployee/byDate/grandTotal đều khớp source. Tổng tháng10: **2,5 công /3 giờ** độc lập, reminder không loại số khỏi tổng. Hai accounts đều tạo Employee và đọc dữ liệu; không thêm quyền nghiệp vụ mới. `db:deploy` trên restored ledger thành công/no-op và snapshot không đổi.
- Reset CLI source **sau dump** revoke source cookie401; bản restore vẫn nhận cookie/mật khẩu cũ từ trước reset. Reset CLI trên destination tăng authVersion1→2/revoke toàn bộ phiên của account đó, cookie cũ401/password cũ401, password mới login được; account thứ hai vẫn200. Logout account thứ hai204 rồi cookie401. Fixture DB timestamps riêng kiểm idle>2h và absolute>12h đều401, không chờ12h/đổi clock hệ thống. Đây là approved policy source thật, không là chính sách restore mới.

### Tradeoff chưa quyết định: restore có thể hồi sinh quyền truy cập

Khôi phục auth tables quay về hash/authVersion/revokedAt/expiry lúc dump: reset/logout/revoke sau snapshot có thể mất. Throttle secret không ký session nên đổi throttle key **không** revoke restored cookies. Nếu vẫn còn hạn theo actual DB time, token cũ được chấp nhận; rehearsal đã chứng minh trong HTTP loopback kín trước khi vô hiệu hóa fixture. Data-model G1 mục5 yêu cầu **revoke mọi session đã restore trước mở truy cập**; native restore không tự thực hiện yêu cầu đó. Password cũ trong dump cũng còn hiệu lực trước reset trên destination. Cookie Secure/HTTPS không tự giải quyết replay khi DB phục hồi.

Trước mở traffic sau restore thật phải thực hiện yêu cầu revoke sessions của G1. Cơ chế vận hành revoke-only/enrollment/audit và người thực hiện chưa được chốt; CLI hiện tại chỉ reset password **và** revoke user, không có `revoke-all-sessions` riêng. Không invent flag/SQL recipe cho production, không cho phép giữ restored sessions trái G1, và không tự bắt buộc reset password sau mọi restore. Cần quyết định cách đáp ứng revoke: bổ sung công cụ revoke-only được review, hoặc cho phép quy trình reset cụ thể có kênh bàn giao mới. Đổi password có thể giảm nguy cơ password cũ phục hồi nhưng buộc bàn giao secret mới; revoke-only giữ password lúc dump, nên rủi ro password đã đổi sau snapshot còn cần quyết định. Cả hai làm user phải đăng nhập lại; continuity draft chưa được hứa. Final rehearsal dùng reset chỉ để rotate/revoke **fixture**, không biến nó thành policy reset production. Mechanism/owner/verification channel còn thiếu: **Blocked trước vận hành thật**.

## Failure paths đã chạy

| Tình huống | Hậu điều kiện thực |
| --- | --- |
| Target DB tên `production` ngoài prefix, actual reset CLI private pipe | Exit1, refuse trước mutation; source snapshot giữ nguyên; test enrollment còn kiểm crossed owner/scope/host/user/path/alias |
| Provision lại DB có2 User | Exit1, không thêm account; count giữ2 |
| Archive random100 bytes không phải dump | `pg_restore --list` nonzero; restore nonzero; fresh failure DB vẫn0 tables |
| Dump thật gặp bảng Employee sentinel trên **failure DB mới của run** | Nonzero dưới single transaction; sentinel giữ, chỉ1 bảng, không rò schema/data restore một phần |
| Destination restore thật | DB UUID khác/rỗng trước mutation, restore exit0; native SQL + API fresh readback đạt như trên |

Không dùng DB cũ làm negative test. Raw exception/SQL/TOC không xuất ra log; command ledger chỉ exe/args an toàn/time/duration/exit. Failure DB/sentinel/corrupt fixture và dump được giữ ignored, không có cleanup lịch sử. Lỗi import helper ban đầu (sai relative depth, chưa tạo DB) được sửa theo path resolution; không gọi đó là RED nghiệp vụ.

## Checklist rollback migration và handoff

1. Đóng write/traffic theo owner được duyệt, giữ phiên bản app/base/tip, migration ledger/checksum và backup metadata trước thay đổi; không chạy rollback trên target chưa xác minh.
2. Khi migrate deploy fail: ghi Failed, giữ ledger/error an toàn; kiểm transaction thực tế của migration và trạng thái schema, không assume mọi migration Prisma atomic. Hiện chỉ có auth001/employees002 forward SQL, **không down migrations/rollback CLI**.
3. Chọn forward fix hoặc restore snapshot vào DB UUID mới và app version tương thích; đánh giá dữ liệu sau snapshot, session/password resurrection, roles/grants/secrets. Không tự viết down SQL, không sửa/xóa applied migration ledger, không reset/drop old DB.
4. Kiểm archive checksum/restore SQL/API counts/values/reminders/totals/relations/revisions/auth/expiry trước cutover; app health không thay các kiểm này. Cutover DB URL, DNS/proxy/process/smoke/rollback switch-back và quyền release còn chưa duyệt, **Not run**.
5. Handoff local: main fresh independent review exact Task11 commit rồi whole-branch review; G3 I3/native phones/SR/phoneperf và Task9 license/deprecated còn mở. Không gọi product Done/G4 ready.
6. Release chỉ resource own: rotate2+2 passwords/revoke sessions trên source/restored bằng actual CLI private pipe; fresh SQL unrevoked0; đóng2 HTTP/pools và kiểm2 ports refused; kiểm exact process+SQL rồi stop own PG. Giữ3 DB/dump/evidence. Dump vẫn chứa historical hashes; rotation DB không sửa archive và không hứa hủy secret khỏi backup. Retention/encryption/purge của backup thật chưa chọn, không cleanup task evidence/Incident22.

Thực thi lại helper sinh dữ liệu giả/password mới và evidence mới; không tái dựng artifact Incident22 có original bytes unavailable. Production restore, password handoff/operator verification thật, Linux/native bindings, remote storage encryption/ACL, scheduler/RPO/RTO/PITR và migration rollback/cutover thật đều **Not run/Blocked theo quyết định còn thiếu**, không nâng gate bằng rehearsal local.
