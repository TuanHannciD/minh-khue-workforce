# Runbook sản phẩm — bàn giao local Task11

Ngày 30/10/2026. Phạm vi **local, dữ liệu giả**; chưa deploy, chưa G4 production ready. [Backup/restore](product-backup-restore.md) sở hữu quy trình khôi phục. [LOCAL_RUN](../agent/LOCAL_RUN.md) sở hữu portable runtime và sandbox các task; pilot ghi chú Node22/SQLite là bootstrap lịch sử, không là app chấm công PostgreSQL. [Validation](../tasks/MKW-PRODUCT-001/validation.md) phân biệt bằng chứng và giới hạn.

Checkpoint CI/CD ngày 11/11/2026: [release checklist](release-checklist.md) và [release runbook](product-release-runbook.md) sở hữu đường coordinator một SHA, variables/secrets, backup, attestation và application-only rollback hiện hành. [Report Task4](../reports/2026-11-11-task4-release-checklist.md) ghi scope kiểm local trên controls 47e1d7f. Các bảng/giới hạn Task11 ngày 30/10 dưới đây giữ làm bằng chứng checkpoint; không dùng chúng thay cấu hình/approval thực mới, cũng không suy CI/CD local thành G3/G4 đạt. Những command/auth/runtime của checkpoint cũ phải đối chiếu source hiện tại trước vận hành.

Task1–9 independent Approved. Task10 R2 tại `a0c05624afebe49996a8797b8c2df07263539e3b` chấp nhận fix delta I1/I2/M1/M2, không regression Important mới; **I3 Open**, scroll1000 p95 66,6/max333,3ms >33/200. Final20/200 scoped pass, editor1000 p95 121/input61,3ms đạt. G3 chưa đạt: native iPhone/Android, SR và phone performance Not run. Main giữ concrete design review frozen panes/windowing; Task11 không thay structure/engine/budgets. Local rehearsal không giải quyết gate này.

## Quyết định bắt buộc trước vận hành thật

Chưa có target/người thực; các mục dưới là checklist cần điền/duyệt, không phải cấu hình đã chọn.

| Hạng mục | Hiện có theo source/approval | Thiếu và người chốt |
| --- | --- | --- |
| Hosting/OS/process manager | API bind `127.0.0.1`, web build tĩnh; local Windows đã kiểm | Hosting, OS, tài nguyên, owner restart/monitoring, quyền release: chưa chọn/chưa giao |
| Domain/topology | G1 dự kiến web và `/api/v1` cùng origin qua reverse proxy | Domain/DNS, route `/api`/`/health`/SPA fallback, proxy/IP/hop, owner: chưa chọn |
| TLS | Production yêu cầu HTTPS exact origin và `TLS_TERMINATED=true` | Chứng thư, nơi kết thúc TLS, gia hạn/cảnh báo, người quản lý: chưa chọn; cờ env không tự tạo TLS |
| Cookie/CORS/CSRF | Policy bên dưới có code; không wildcard | Kiểm browser qua TLS/proxy đúng domain trước release; ai nghiệm thu: chưa giao |
| DB/quyền | PG17.11 fake loopback; CLI có allowlist fake | DB host/role/least privilege, network/TLS, production enrollment, chủ sở hữu: chưa chọn; CLI **từ chối production** |
| Secrets | Process env DB URL/throttle secret; password private TTY/pipe | Secret store/ACL, cấp/rotate/thu hồi DB/throttle key, backup encryption/key custody: chưa chọn |
| Hai tài khoản | Hai username case-sensitive, ngang quyền, không signup/admin UI | Username thật, người nhận và kênh bàn giao mật khẩu: chưa cung cấp |
| Reset operator | Người vận hành xác minh rồi reset; không email/SMS | Người chính/dự phòng, cách xác minh ngoài app, audit và kênh bàn giao: chưa giao/chưa duyệt |
| Session sau restore | Data-model G1 yêu cầu revoke mọi session restore trước mở truy cập; native restore giữ auth tables | Cơ chế revoke-only/CLI chưa có; không tự bắt buộc reset password. Owner, công cụ và thời điểm mở traffic cần review; xem tradeoff backup |
| Backup/retention | Rehearsal logical dump/restore mới đã kiểm | RPO/RTO, lịch chạy, bản giữ/số ngày/nơi lưu/ACL/encryption, kiểm restore và người chịu trách nhiệm: chưa chọn |
| Migration/rollback | Hai migration forward, không down migration | Maintenance window/write freeze, tiêu chí rollback, owner/cutover và chấp nhận mất dữ liệu sau dump: chưa duyệt |
| Distribution | ExcelJS4.4.0 pins giữ nguyên | Task9 M1 `buffers0.1.1` thiếu license provenance + M2 sáu deprecated: main route dependency/license review trước phân phối; chưa legal clearance, không gán MIT |

Không bật service/scheduler, truy cập hệ thống thật, push/merge/deploy trong Task11. Người vận hành thật cần quyền cụ thể và target đã xác minh; không sửa record sandbox thành target thật để vượt guard.

## Nguồn lệnh và cấu hình thực tế

Nguồn thực thi: [API package](../../apps/api/package.json), [main](../../apps/api/src/main.ts), [bootstrap](../../apps/api/src/bootstrap.ts), [auth config](../../apps/api/src/infrastructure/config/auth-config.ts), [HTTP policy](../../apps/api/src/infrastructure/config/http-policy.ts), [web package](../../apps/web/package.json), [tooling map](../../scripts/product/README.md). Lệnh dưới chạy từ root worktree `agent-bootstrap`, không primary.

```powershell
$taskRuntime=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task2-toolchain').Path
$env:Path="$taskRuntime/node-v24.22.1-win-x64;$taskRuntime/pnpm-native/package;"+$env:Path
node --version # v24.22.1
pnpm --version # 12.15.0
```

Không `npm install`/`npm ci` lên pnpm links, không đổi PATH global. Nếu thật sự cần cài lại và đã có quyền: `pnpm install --frozen-lockfile`; Task11 không cài dependency. API không tự load `.env`: cấp `DATABASE_URL`, `AUTH_THROTTLE_SECRET` (ít nhất32 bytes) qua secret channel vào process, không paste giá trị vào terminal/history/report. `WEB_ORIGIN` phải exact origin, không slash cuối/path. Không in toàn bộ env.

### Kiểm identity và acquire

Rehearsal dùng owner `MKW-PRODUCT-001/Task11`, alias `task11-operations`, role `mkw_task11`, PG17.11 portable ở `task2-toolchain/postgres/pgsql/bin`, data `.agent-runs/MKW-PRODUCT-001/task11-operations/pg-data`, port thật trong `cluster-owner.json`. Loopback trust chỉ cho fake sandbox trên máy local; không phải hướng dẫn auth DB production. Cluster đã dừng khi handoff, DB/evidence giữ lại.

Trước start/reacquire/stop: đọc owner record; kiểm executable/version, resolved data path, port không bị owner khác giữ; nếu đang chạy, đọc `postmaster.pid`, dùng `Get-CimInstance Win32_Process -Filter "ProcessId=<own-pid>"` kiểm executable và **`-D` exact data path** (normalize slash/case Windows). `pg_ctl status -D <own-data>` chỉ bổ trợ, không là bằng chứng ownership duy nhất. Khởi động chỉ đúng cluster này, không init/reset/drop data cũ. PG17.11 `pg_ctl -D <own-data> -l <new-own-log> -o "-h 127.0.0.1 -p <verified-port>" -w start` có thật; trên terminal automation Windows cần launcher ẩn với stdio riêng để tránh child giữ pipe. Không chạy lại helper `acquire.ps1` trên data đã tồn tại: nó chỉ dành cho acquire fresh và phải refuse.

Initial acquire có server start thành công nhưng terminal launcher chờ descendant đến khi PG dừng; control path đó **Failed**, không dùng làm startup wrapper. Task-owned `lifecycle.ps1` đã kiểm cách sửa: `Start-Process -WindowStyle Hidden -PassThru` với output/error riêng và `WaitForExit(15000)` chỉ đợi pg_ctl, rồi process+SQL identity và stop cùng cluster giữ lại. Nó diễn tập cả start→stop, không để server chạy cho bước tiếp; mỗi lần sinh evidence `lifecycle-<uuid>`. Run `lifecycle-c904704b-ce67-4104-b281-495d2f572ed1` đạt launch0/stop0/status3/no PID/TCP refused. Không có service/process manager production được tạo.

Trước CREATE DB/migrate/provision/reset/dump/restore và mọi mutation rehearsal, [openSandboxTarget](../../scripts/product/sandbox-target.mjs) kiểm record owner/scope/alias/host/user/prefix/path rồi đối chiếu **actual** database/current_user/server_addr/server_port/data_directory/server_version17.11 bằng connection mới. Không coi JSON là identity thật. Có thể kiểm read-only trong shell đã đặt target record không chứa secret:

```powershell
$env:MKW_OPERATIONS_TARGET=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task11-operations/run-zrdYYc/restored-target.json').Path
node --input-type=module -e 'import {openSandboxTarget} from "./scripts/product/sandbox-target.mjs"; const d=await openSandboxTarget(process.env.MKW_OPERATIONS_TARGET,"task11-operations"); console.log({alias:d.target.alias,database:d.target.database,port:d.target.port,verified:true}); await d.pool.end();'
```

Lệnh chỉ chạy khi cluster được reacquire đúng owner. Record ví dụ là DB giữ lại sau rehearsal, không phải target được phép ghi cho lần thử mới. Lần thử mới tạo `mkw_operations_<uuid>` mới, giữ record trước CREATE, xác minh maintenance DB rồi xác minh DB mới. Không reset/drop/rewrite DB/evidence cũ.

### Start và stop local

Chọn cổng trống và ghi ownership trước acquire; `3001/5173` dưới đây là mặc định local theo source, không production target. Sau khi **identity DB** đã kiểm và secret được cấp riêng, tại terminal API:

```powershell
pnpm --filter @mkw/api build
$env:PORT='3001'
$env:WEB_ORIGIN='http://127.0.0.1:5173'
pnpm --filter @mkw/api start
```

Tại terminal web cùng runtime:

```powershell
$env:API_PROXY_TARGET='http://127.0.0.1:3001'
pnpm --filter @mkw/web dev
```

`api dev` chỉ watch compiler, không start API. Web dev bind loopback/strictPort; proxy `/api` từ browser cùng origin tới API, health cần URL API trực tiếp. `GET /health` chỉ xác nhận process, không chứng minh migration/auth/attendance đúng; smoke cần login/read tháng bằng fake account qua client không ghi secret. Web static build bằng `pnpm --filter @mkw/web build`; `pnpm --filter @mkw/web preview --port <own-port>` chỉ phục vụ preview build, không cấu hình production reverse proxy. Không tự đặt native Android auth.

Dừng foreground bằng Ctrl+C tại đúng terminal sở hữu. Với app programmatic của rehearsal, `app.close()` đóng Nest/pools và kiểm URL cũ không kết nối được; không kill theo port. Stop own PG cuối cùng sau đóng HTTP/pools và kiểm lại owner/exe/PID/`-D`/port/actual SQL identity: `pg_ctl -D <verified-own-data> -m fast -w stop`. `fast` rollback transaction đang chạy của cluster đó; không dùng `immediate`. Kiểm exit0, status3, pidfile vắng và TCP refused, giữ data/log/dump.

Task11 cũng đã smoke actual API main entry (`start` trong package map tới `node dist/main.js`) trên port ephemeral: health200/anonymous session401 rồi dừng exact spawned child/port refused, evidence `start-stop-main-smoke.json`. Không replay Ctrl+C qua foreground pnpm wrapper hoặc giả kiểm production process manager.

### Update và migration

Task11 **không update deployment**. Checklist source-correct để người có quyền thực hiện sau này:

1. Ghi base/tip, clean/dirty state, owner và quyền target; giữ work khác, không reset/clean. Xác định app version tương thích schema và maintenance/write-freeze.
2. Chạy checks phù hợp của thay đổi; code release cần `pnpm run product:check` và acceptance/gates liên quan, không lấy docs check Task11 thay full suite. Giải quyết G3 và independent/whole-branch review trước production.
3. Backup xác minh và rehearsal restore theo tài liệu riêng; ghi mốc snapshot, dữ liệu có thể mất nếu rollback, không chỉ kiểm file tồn tại.
4. Cấp DB URL riêng sau actual identity check, `pnpm --filter @mkw/api db:deploy` chạy **Prisma migrate deploy**, forward migrations; không có auto target guard trong script Prisma nên operator phải kiểm trước. `db:generate` chỉ sinh client, không migrate. Không `migrate reset`, `db push` hoặc invent `--rollback`.
5. Build/start đúng version, smoke schema/migration ledger, auth hai tài khoản, read/write/reload/totals/relations; có lỗi giữ traffic đóng và evidence, không báo ready chỉ vì health200. Startup không tự migrate.
6. Rollback: xem checklist backup; chỉ forward fix hoặc restore DB mới + app tương thích sau duyệt cutover. Không down SQL tự đặt/xóa `_prisma_migrations` để ép xanh.

## Auth, secrets và reset vận hành

Source [auth operations](../../apps/api/src/modules/auth/auth-operations.ts), [CLI](../../scripts/product/auth-cli.mjs), [session authorizer](../../apps/api/src/modules/auth/session-authorizer.ts), [auth design G1](../tasks/MKW-PRODUCT-001/technical/auth-session.md). Header Proposed trong thiết kế Task1 là checkpoint lịch sử; actual code/Task1–9 review và validation sở hữu trạng thái hiện tại.

- Argon2id password hash; password provision/reset tối thiểu12 Unicode characters, tối đa1024 bytes UTF-8, không trim. Hai username case-sensitive, không public signup/reset HTTP, không role admin thứ ba. Provision chỉ User rỗng, đúng hai account; reset chỉ account tồn tại.
- Production cookie `__Host-mkw_session`, HttpOnly, Secure, SameSite=Lax, Path=/, không Domain; local HTTP `mkw_session` không Secure. Login Max-Age43200s, token mới ngẫu nhiên32 bytes; DB chỉ token hash. Không ghi cookie/storageState/password vào evidence/browser snapshot/trace.
- Absolute12h, idle2h theo DB time; polling hợp lệ tính hoạt động, lastSeen tối đa một lần/phút; absolute không gia hạn. Logout revoke phiên hiện tại + clear cookie, reset tăng authVersion và revoke **mọi phiên của user đó** cùng transaction/User lock. Account còn lại không bị reset theo.
- Unsafe methods (kể login/logout/reconcile) cần Origin khớp exact `WEB_ORIGIN` và application/json; thiếu/null/sai Origin403, sai Content-Type415. CORS credentials=true chỉ configured origin; CORS không thay Origin check. No-store auth/data, Helmet/CSP; production HSTS. Source hiện chưa cấu hình Express trust proxy: không tự đặt env `TRUST_PROXY` hoặc tin X-Forwarded-For; review theo target thật.
- Production start fail nếu không HTTPS origin/DB URL/throttle secret/TLS termination flag; kiểm flag không chứng minh proxy/TLS ngoài đời. Throttle PG dùng HMAC secret, quota IP20/phút và username5/15phút, không có scheduler. Bảo vệ log/body/env ngoài app và backup cũng cần owner thật.

CLI thật, **chỉ trên fake sandbox đã kiểm** (TTY riêng nhập password ẩn, không placeholder password trong argv/env):

```powershell
pnpm --filter @mkw/api auth:provision -- --target <fresh-target-record> --alias task11-operations
pnpm --filter @mkw/api auth:reset-password -- --target <verified-target-record> --alias task11-operations --username <fake-username>
```

Các `<...>` là chỗ operator phải thay bằng metadata đích đã xác minh, không phải CLI flags mới. Automation dùng `--secret-stdin` và private pipe JSON memory-only (`accounts` cho provision; `password` cho reset), như rehearsal. Không `echo` secret literal. CLI refuse maintenance DB/target chưa enrollment, không tự dùng `DATABASE_URL` làm quyền reset. Success chỉ sau commit; error generic, không in SQL/credential. Script tồn tại không cho quyền reset người thật.

Checklist reset thật trước khi có thể chạy: người được giao xác minh người yêu cầu ngoài app theo cách đã chốt → xác nhận target/username/quyền → cấp mật khẩu qua kênh kín → chạy actual operator command đã enrollment và review → kiểm cookie cũ401, mật khẩu cũ không login, mới login được và account kia vẫn hoạt động → bàn giao riêng và ghi audit tối thiểu thời gian/actor/sự kiện không chứa secret. Hiện chưa có người/kênh/cách xác minh thật, nên **Blocked trước release**, rehearsal không giả thay danh tính thật. Không có flow bắt buộc đổi mật khẩu lần đăng nhập kế tiếp trong code, không hứa điều đó.

## Bàn giao, evidence và giới hạn

Task11 evidence `.agent-runs/MKW-PRODUCT-001/task11-operations/`, full report ignored `.superpowers/sdd/implementation-plan/task-11-implementation.md` ghi full base/tip/file/commands/time/self-review/release. Runbook/source-diff/doc checks và fake rehearsal là Verified đúng scope; independent exact-commit review chờ main, whole-branch review sau đó. Không independent PASS của writer.

Giữ dump/DB/log có owner trong ignored tree, chỉ báo metadata/hash của file; dump chứa historical password/session hashes nhạy cảm dù fixture DB hiện tại đã rotate/revoke. Không commit/upload/đọc dump contents, không hứa production retention. Incident22 historical negative JSON overwrites: originals unavailable; giữ retained manifest/current copies/named artifacts, không recreate hoặc cleanup lịch sử.
