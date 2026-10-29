# Chạy tooling và pilot local

## Sandbox Excel Task9

Task9 có API export thật `/api/v1/attendance/export?month=YYYY-MM` và nút tải dữ liệu đã lưu, không auto-save draft. Dùng shell product process-only Node24.22.1/pnpm12.15.0 như bên dưới; cluster mới owner `MKW-PRODUCT-001/Task9`, alias `task9-export`, role `mkw_task9`, loopback port ghi trong `.agent-runs/MKW-PRODUCT-001/task9-export/cluster-owner.json`, data `task9-export/pg-data`, PostgreSQL17.11. Đã release khi handoff; chỉ reacquire sau kiểm record/path/port/process và actual identity, không reset/drop hoặc dùng cluster khác.

```powershell
$env:MKW_PRODUCT_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task9-export/cluster-owner.json').Path
$env:PLAYWRIGHT_BROWSERS_PATH='0'
pnpm run product:build
pnpm --filter @mkw/api test:export
node scripts/product/e2e.mjs --export
# Browser T3 riêng: node scripts/product/e2e.mjs --serve --export
```

Mỗi lệnh sandbox tạo DB `mkw_export_<uuid>` mới, migrate/provision hai fake accounts chỉ memory và kiểm identity thật trước CREATE; E2E là documented Playwright regression, tách khỏi T3 direct UI. Test workbook/OpenAPI trong `pnpm --filter @mkw/api test`; ExcelJS readback không là engine recalc. Task9 đã dùng Microsoft Excel desktop16.0.20527.20088 qua hidden COM instance riêng mở file browser/edit/recalc cả hai bảng; `reader-check.ps1` ignored chỉ là evidence run, không product workflow/operator UI. Reader UI tương tác/reader khác vẫn Not run. Dừng serve bằng `stop` vào exact run `stop.request`; kiểm `http-released.json`/`fixture-invalidated.json` (rotate2,0 unrevoked), own tab closed và PG stop sau identity/process validation. Giữ DB/workbooks/logs; evidence `.agent-runs/MKW-PRODUCT-001/task9-export/`.

Pilot ghi chú chỉ dùng dữ liệu giả để kiểm chứng Agent/browser/persistence. Sản phẩm có React/Vite, Nest/Express, auth/session, POST/PATCH nhân sự, GET tháng/POST changes/reconcile, Task7 query/draft/lưu một ô/recovery và Task8 selection/batch/fill thật; Excel thuộc Task9. Pilot dùng Node22.12.0/npm10.9.0; `node:sqlite` còn experimental. Product dùng Node24.22.1/pnpm12.15.0. Python `py -3`3.14.3 dùng cho script UI, không phải backend sản phẩm.

## Chuẩn bị và check

Workspace đã chuyển sang pnpm, root và hai app dùng một `pnpm-lock.yaml`. Không chạy `npm ci` hoặc `npm install` lên links pnpm. `npm run` vẫn chạy các script pilot cùng tên/version dependency như trước. Cài bằng runtime product24 trước, rồi mở shell Node22.12.0 để kiểm pilot:

```powershell
node --version # phải v22.12.0 ở shell pilot
npm run check
$env:PLAYWRIGHT_BROWSERS_PATH='0'
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

`npm run check` gồm hash/inventory/metadata/license paths, UTF-8/link/anchor/fence tài liệu source hiện hành (gồm docs/README sản phẩm), lint và integration tests pilot. Bỏ qua store/dist/coverage generated; reports/templates lịch sử chỉ kiểm UTF-8. Skill upstream kiểm bằng manifest; bytecode Python trong `__pycache__` được giữ và bỏ khỏi inventory, extra source vẫn bị chặn. Đây không phải product typecheck/build.

Playwright Chromium nằm trong `.local-browsers` của package `playwright-core` project-local (pnpm resolve dưới `node_modules/.pnpm`), không sửa browser/global config. Khi chuyển package manager cần cài browser lại tại đường dẫn mới. Wrapper tự đặt browser path và cờ SQLite cho workers. Hai viewport desktop/mobile dùng server/DB riêng, không intercept/mock API, retries=0; trace/report/screenshot và SQLite fake-data được giữ theo run.

## Product Task2–3 — runtime và lệnh có thật

Runtime portable đã provision ở ignored `.agent-runs/MKW-PRODUCT-001/task2-toolchain/`, không thay Node global/PATH máy. [Manifest](../tasks/MKW-PRODUCT-001/technical/toolchain-manifest.md) ghi nguồn/checksum và phân biệt phần cài với phần chỉ được đề xuất. Trong **shell product riêng** từ root worktree:

```powershell
$taskRuntime=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task2-toolchain').Path
$env:Path="$taskRuntime/node-v24.22.1-win-x64;$taskRuntime/pnpm-native/package;"+$env:Path
node --version # v24.22.1
pnpm --version # 12.15.0
pnpm install --frozen-lockfile
pnpm run product:check
pnpm run product:contract:generate
pnpm run product:contract:check
```

PATH trên chỉ có hiệu lực process shell và các child; dùng shell22 riêng cho pilot. `engineStrict`, `strictPeerDependencies`, `autoInstallPeers:false`, `strictDepBuilds` được bật. `@scarf/scarf` là telemetry-only postinstall đã review và bị từ chối riêng; không dùng ignore-scripts để bỏ native build. Lock giữ exact trực tiếp và integrity/transitive resolution. Product runtime chỉ24, root hỗ trợ22 và24 để tiếp tục pilot.

Chạy web và API ở hai terminal product riêng:

```powershell
pnpm --filter @mkw/web dev # loopback5173, strictPort; API_PROXY_TARGET cho auth
```

```powershell
pnpm --filter @mkw/api build
$env:PORT='3001'
$env:WEB_ORIGIN='http://127.0.0.1:5173'
# DATABASE_URL và AUTH_THROTTLE_SECRET phải được cấp riêng trong process.
# Xem apps/api/.env.example; không ghi secret vào lệnh/log hoặc Git.
pnpm --filter @mkw/api start
```

Dừng foreground bằng Ctrl+C trong đúng terminal sở hữu. Không kill theo cổng tìm thấy. `api dev` chỉ watch compiler; chạy `start` riêng sau build. `apps/*/.env.example` là mẫu cấu hình; Vite đọc `.env`, API đọc biến process (không tự load file secret). Cổng trên là mặc định tài liệu, phải kiểm còn trống trước acquire. API có `/health`, `/api/v1/auth/{login,logout,session}`, POST `/api/v1/employees`, PATCH `/api/v1/employees/:id` và `/api/v1/attendance/{month,reconcile,changes}` theo contract; không mở Swagger UI hoặc export. Vite proxy `/api` về API cùng origin với browser; `API_PROXY_TARGET` đọc từ process Vite, `VITE_API_ORIGIN` chỉ còn dùng health transport bootstrap.

Web alias `@/` thuộc src web. API dùng native package imports `#app/*` với `.js` ESM, được kiểm trên compiled runtime; không có alias xuyên app. Contract được sinh từ Nest DTO thành OpenAPI3.0.3 và web types; không sửa hai output bằng tay. [Tooling map](../../scripts/product/README.md) định vị generator/boundary/fixtures.

`product:check` chạy lint/format/strict types/build từng app, tooling fixtures, web Vitest/DOM/session, API bootstrap/auth HTTP/native, cycle/boundary và regenerated drift check. Task7 đã thay `product:test:e2e` bằng runner thật dưới đây; `product:benchmark` vẫn **Not run, nonzero** đến Task10. Integration auth chạy riêng trên PostgreSQL17.11 thật như dưới; không phải acceptance toàn sản phẩm. npm lock baseline được giữ trong ignored evidence và lịch sử Git trước khi bỏ lock npm active.

### Sandbox auth Task3

Chỉ dùng cluster task-owned mới, loopback, role giả `mkw_task3`, data directory `.agent-runs/MKW-PRODUCT-001/task3-auth/pg-data`. Owner record phải có owner `MKW-PRODUCT-001/Task3`, scope `fake-sandbox`, alias `task3-auth`, host/port/user/database/dataDirectory; CLI đối chiếu identity/version thực trước thao tác. Không trỏ sang DB chưa rõ ownership. Cluster evidence đã dừng sau handoff; muốn chạy lại phải xác minh owner/port/data trước khởi động đúng cluster, không tự tạo service hoặc reset dữ liệu.

```powershell
$env:MKW_TEST_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task3-auth/cluster-owner.json').Path
pnpm --filter @mkw/api build
pnpm --filter @mkw/api test:integration
```

Harness tạo DB `mkw_auth_<uuid>` mới mỗi lần, ghi target record trước CREATE, chạy migration deploy rồi readback SQL độc lập; không reset/drop DB cũ. `db:generate` không cần DB; `db:deploy` chỉ được chạy sau xác minh target/URL riêng. Không dùng migrate reset hoặc seed thật.

CLI đã kiểm qua đúng pnpm wrapper:

```powershell
pnpm --filter @mkw/api auth:provision -- --target <target-record> --alias task3-auth
pnpm --filter @mkw/api auth:reset-password -- --target <target-record> --alias task3-auth --username <fake-username>
```

CLI đọc mật khẩu TTY ẩn; automation dùng `--secret-stdin` qua private pipe JSON (`accounts` gồm đúng hai username/password cho provision; `password` cho reset). Không đặt password trong argv/env, shell history hoặc log; không dùng echo với secret literal. Provision chỉ DB chưa có User; reset chỉ User tồn tại và revoke mọi session trong cùng transaction. Không signup/reset HTTP, không role quản trị. CLI hiện từ chối target thật; xác minh danh tính vận hành và enrollment production chưa được cấp quyền/kiểm.

Evidence Task3 tại `.agent-runs/MKW-PRODUCT-001/task3-auth/`: integration, native Windows Argon2, browser login lỗi/đúng/logout/expiry và readback. Guard tháng/write/export chỉ qua route test-owned; Task4/5/9 phải kiểm lại endpoint thật. Sandbox HTTP không chứng minh TLS production; Linux native, thiết bị thật và quy trình reset thật Not run.


### Sandbox employees Task4

Task4 thêm migration002 Employee/AttendanceCell đủ bảo vệ mốc xuyên tháng, chưa có attendance mutation hoặc reconcile HTTP. Form tạo/sửa ở AppShell dùng RHF7.91.0/resolvers6.0.2/Zod4.6.7, tokens UI C; chọn người từ bảng tháng và full recovery thuộc Task6/7. POST thành công giữ ID để sửa tiếp; reload toàn trang không persist draft.

```powershell
$env:MKW_EMPLOYEE_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task4-employees/cluster-owner.json').Path
pnpm --filter @mkw/api build
pnpm --filter @mkw/api test:employees
```

Harness chỉ nhận owner Task4/fake-sandbox/alias task4-employees/role mkw_task4/loopback/PostgreSQL17.11/dataDirectory đúng task4-employees/pg-data, đối chiếu DB identity thực trước CREATE. Cluster đã release sau handoff: chỉ chạy khi được khởi động lại đúng owner/data/port, không đổi target sang cluster cũ hoặc reset DB. Mỗi run tạo DB UUID mới; upgrade từ baseline auth giữ hai fake account/session, API/CAS/protection/snapshot đọc SQL/client mới. `pnpm --filter @mkw/api test` gồm date-only Gregorian/28–31 ngày/weekday ở UTC, Việt Nam và Los Angeles; không cần DB cho suite này.

Evidence `.agent-runs/MKW-PRODUCT-001/task4-employees/` giữ product/integration/pilot22/browser/readback và release audit. Browser fixture chỉ cấp hai account giả ngoài product router; request employees thật gọi Nest/PostgreSQL. Conflict/unknown giữ draft và khóa submit; unknown khóa Hủy, HTTP reconcile/full recovery vẫn staged Task5/7, không coi read hoặc bỏ draft là fence.

## Sandbox attendance Task5

Task5 chỉ thêm API/contract và tests, không UI grid/draft/fill hoặc Excel. Dùng PostgreSQL17.11 binaries portable đã có nhưng cluster mới tại `.agent-runs/MKW-PRODUCT-001/task5-attendance/pg-data`, role giả `mkw_task5`, alias `task5-attendance`, owner `MKW-PRODUCT-001/Task5`. Owner record lưu port loopback; harness đối chiếu database/user/host/port/data_directory/version thật trước CREATE. Không đổi target sang cluster Task3/4 hoặc reset/drop DB cũ.

Trong shell product24, sau khi cluster Task5 được khởi động đúng owner/data/port và kiểm identity:

```powershell
$env:MKW_ATTENDANCE_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task5-attendance/cluster-owner.json').Path
pnpm --filter @mkw/api build
pnpm --filter @mkw/api test:attendance
pnpm --filter @mkw/api test:integration
pnpm --filter @mkw/api test:employees
```

Biến Task5 làm hai harness regression tạo DB UUID mới trên cùng cluster Task5. Auth CLI nhận riêng alias/owner/role/path/database-prefix Task5 bên cạnh Task3, vẫn từ chối target thật và maintenance DB. Không cần seed/tài khoản thật hoặc dependency mới. Schema002 đủ dùng; deploy trên baseline đã có User/Session/Employee/AttendanceCell được kiểm giữ nội dung/revision. READ ONLY REPEATABLE READ tháng/reconcile và READ COMMITTED User→Employee→Cell writes được kiểm bằng hai HTTP instances/PG connections/barriers; không SQLite thay concurrency.

Evidence ở `.agent-runs/MKW-PRODUCT-001/task5-attendance/`, gồm RED/GREEN, contract consumer đủ JSON G1, SQL/client readback và response mất sau commit. Chạy lệnh cần cluster hoạt động; sau handoff cluster được dừng đúng owner và data/evidence giữ lại. Không suy API tests thành hai phiên UI hoặc AC12/13/15 toàn luồng; recovery UI thuộc Task7, export Task9, thiết bị/reader/Linux/TLS/operator thật còn Not run.

## Thao tác thử

### Xem riêng UI Task6 — không API/DB/persistence

Trong shell product24 đã đặt PATH process-only như trên, từ root worktree:

```powershell
pnpm --filter @mkw/web build
pnpm --filter @mkw/web preview --port 5186
```

Trước acquire phải kiểm port5186 chưa có owner và ghi run owner mới; `strictPort` không chiếm process khác. Mở `http://127.0.0.1:5186/preview/attendance` bằng T3 theo BROWSER_TESTING. Đây là fixture20 người giả tháng02/2024 với loading/error/empty, editor và Lưu thử chỉ phát intent; không cần PostgreSQL hoặc đăng nhập và không gọi API. Không coi nó là product E2E hoặc lưu thành công. Không có link rời form có draft sang preview. Dừng Ctrl+C trong terminal mình sở hữu, giữ screenshot/evidence.

Task6 đã kiểm built UI375/728/1200, parser/month/component, auth/employee DOM regressions; evidence `.agent-runs/MKW-PRODUCT-001/task6-ui/`. Browser server/run script cũ đã release và giữ stop.request, không tái dùng nguyên run đó để acquire mới. Nondefault browser zoom/trusted phone/touch/reader vẫn Not run. Query/persist/recovery và điều hướng có draft phải được Task7 lắp vào seam theo README attendance; không dùng callback UI hiện tại làm save lifecycle thật.

### Pilot ghi chú002

```powershell
npm run pilot
```

CLI in URL `http://127.0.0.1:<port ngẫu nhiên>` và owner record. Mở URL bằng T3 Browser, nhập ghi chú giả, lưu, thử checkbox lỗi một lần, bấm lưu lại, tải lại trang và đối chiếu `/api/notes`. Dừng bằng nhập `stop` rồi Enter hoặc Ctrl+C; chỉ CLI đang sở hữu tiến trình mới được dừng. Không kill theo cổng hoặc PID tìm thấy tình cờ.

Session pipe của exec tool có thể không giữ stdin; runtime này còn từ chối mở PTY. CLI hỗ trợ cách dừng mềm qua file thuộc đúng run: ghi chuỗi `stop` vào `<runDir>/stop.request` (UTF-8). RunDir phải lấy từ owner record vừa tạo của task; không chọn directory/PID tình cờ. CLI chỉ đọc file trong run riêng mỗi250ms, đóng server/DB rồi ghi released; không cần kill process. Không expose endpoint HTTP để dừng.

Nếu phải dừng sau crash/mất control, xác minh ownership độc lập và ghi đúng terminated thay vì giả graceful release. Lỗi kiểm ownership phải dừng thao tác phụ thuộc (PowerShell dùng `$ErrorActionPreference='Stop'`), không để lỗi conversion tiếp tục lệnh dừng.

Mỗi CLI/test run tạo thư mục mới dưới **primary** `.agent-runs/MKW-AGENT-002/`, tìm primary bằng Git common dir; evidence nằm ngoài worktree. `owner.json` ghi PID/URL/trạng thái. Dừng bình thường ghi `released`; SQLite/evidence vẫn giữ. Nếu process crash, record có thể còn `running`: xác minh PID/target thật trước recovery, không tự coi PID cũ còn thuộc task. Chưa kiểm chứng tự phục hồi toàn phiên hoặc hard-kill cleanup.

## Giới hạn và bảo trì

- Server loopback, không auth, chỉ dành cho máy local và dữ liệu giả; không expose mạng. Không dùng như API nhân sự.
- Header `x-pilot-simulate-failure` cố ý trả HTTP 503 trước ghi DB; không có trong contract sản phẩm.
- Retry cùng mã/nội dung không tạo bản trùng; reload hiển thị dữ liệu đã lưu. Pending operation trong UI chỉ sống trong trang hiện tại, không claim offline/durable retry sau crash browser.
- UI detector chỉ là heuristic. Bản đầy đủ cần htmlparser2/css-select/css-tree/domutils đã ghim dependency; kiểm tra browser vẫn bắt buộc.
- ESLint 9.39.5 có cảnh báo upstream hết hỗ trợ; pin để tương thích Node 22.12 hiện tại (ESLint 10 yêu cầu Node mới hơn). Nâng Node/lint ở task bảo trì riêng; không suy từ audit sạch thành không có rủi ro.
- Không tự dọn evidence. Retention/cleanup và nâng dependency theo task riêng có scope.

## Sandbox selection Task8 — scoped batch/fill/input

Task8 dùng cluster mới owner `MKW-PRODUCT-001/Task8`, alias `task8-selection`, role `mkw_task8`, data `.agent-runs/MKW-PRODUCT-001/task8-selection/pg-data`, PostgreSQL17.11. Owner record/actual database-user-host-port-data-version phải khớp trước mutation; binaries portable cũ được tái dùng, không reset/drop DB cũ. Cluster đã release khi handoff, data/evidence giữ lại. Chỉ khởi động đúng identity/owner/port đã kiểm.

Sau build trong shell product24 và cluster Task8 đang chạy đúng owner:

```powershell
$env:MKW_PRODUCT_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task8-selection/cluster-owner.json').Path
$env:PLAYWRIGHT_BROWSERS_PATH='0'
node scripts/product/e2e.mjs --selection
node scripts/product/e2e.mjs --selection --review-r1
```

Lệnh đầu hiện có18 nhóm web–Nest–PG/SQL cho bulk/fill/conflict/recovery/fence và mouse/keyboard/synthetic touch, gồm R1 conflict detail/completion/dirty hold; lệnh sau chỉ regression Employee confirmed ID/PATCH422/focus Task7, cùng allowlist Task8 nhưng DB UUID mới. Runner tạo `mkw_selection_<uuid>` và không reuse/reset DB run trước. `node scripts/product/e2e.mjs --serve --selection` mở sandbox T3; fixture account session setup giữ trong memory, không in accounts response/đưa password vào DOM, log hoặc argv. Dừng bằng `stop` trong exact `<runDir>/stop.request`; kiểm `http-released.json`, `fixture-invalidated.json` (rotate2/revoke sessions), port closure; stop đúng own PG bằng portable `pg_ctl -D <owned-data> stop -m fast` sau kiểm identity/process. Không kill theo port tình cờ, giữ DB/evidence. Task8 validation không thay trusted phone/native zoom/SR/Task10 full matrix.

## Sandbox persistence Task7 — product E2E thật

Dùng PG17.11 portable cùng binaries đã có nhưng **cluster mới** owner `MKW-PRODUCT-001/Task7`, alias `task7-persistence`, role `mkw_task7`, data `.agent-runs/MKW-PRODUCT-001/task7-persistence/pg-data`. Owner record ghi loopback port; adapter kiểm database/user/host/port/data_directory/version thật trước CREATE. Cluster đã release khi handoff; chỉ khởi động lại đúng identity/owner/port đã kiểm, không tự chiếm port hoặc reset/drop DB/evidence cũ. Không service/global config.

Trong shell product24 ở worktree, sau khi cluster được khởi động đúng owner và đã kiểm identity:

```powershell
$env:MKW_PRODUCT_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task7-persistence/cluster-owner.json').Path
$env:PLAYWRIGHT_BROWSERS_PATH='0'
pnpm run product:build
pnpm run product:test:e2e
```

Runner tạo DB `mkw_persistence_<uuid>` mới, migrate, provision hai account giả bằng secret random chỉ memory, Nest thật và Vite built preview trên port trống của run. Node24 type stripping import spec `.ts` trong cùng coordinator để không serialize credential ra config/env/report. Playwright Chromium project-local phải có theo bước chuẩn bị trên.10 nhóm assertions kiểm Save atomic/SQL, polling hai context,409, missing/null, commit-response-loss, delayed-lock no-op fence, lỗi nền/đầu/reload, overtime và employee PATCH ngoài tháng/create mất ID. Fault chỉ đổi delivery hoặc barrier trước lock; không mock successful persistence. Full matrix Task10/thiết bị/reader/Excel không được suy đạt.

`node scripts/product/e2e.mjs --serve` tạo sandbox tương tác T3; URL/runDir tại stdout và `interactive.json`. Fixture-only account route ở wrapper test, không product router; tự điền login trong browser memory, không in credential/snapshot lúc mật khẩu còn trên form. Dừng đúng run bằng ghi `stop` vào `<runDir>/stop.request`; runner revoke/reset fixture secrets trong memory, đóng HTTP/pools, ghi `http-released.json`; DB/evidence giữ lại. Stop cluster bằng đúng portable `pg_ctl -D <owned-data> stop -m fast` sau kiểm actual data/owner/process, kiểm stopped riêng. Không kill theo port/PID tình cờ.

Regressions Task3/4/5 có thể tạo DB mới trên cluster Task7 qua `MKW_ATTENDANCE_CLUSTER_OWNER` trỏ owner record này (auth/employee harness tái dùng identity checker Task5/7). Attendance suite có một target-enrollment test chuyên Task5; Task7 chạy ba file integration HTTP/transaction thay vì đổi assertion đó. Chi tiết lệnh/kết quả ở task validation.

### Regression tập trung Task7 review R1

R1 dùng cluster mới riêng `.agent-runs/MKW-PRODUCT-001/task7-fix-r1/pg-data`, owner `MKW-PRODUCT-001/Task7FixR1`, alias `task7-fix-r1`, role `mkw_task7_r1`. Xác minh owner/actual identity và port trước acquire, không reset/restart tài nguyên Task7 cũ. Sau build trong shell product24:

```powershell
$env:MKW_PRODUCT_CLUSTER_OWNER=(Resolve-Path '.agent-runs/MKW-PRODUCT-001/task7-fix-r1/cluster-owner.json').Path
$env:PLAYWRIGHT_BROWSERS_PATH='0'
pnpm run product:test:e2e -- --review-r1
```

Chỉ chạy nhánh unknown create→ID→PATCH422→sửa input→normal Save bị khóa→fresh reconcile/PATCH cùng ID, SQL độc lập kiểm422 không đổi revision và tổng POST1; Page/Workspace Keep/Escape kiểm focus/raw/đơn vị. Đây không là replay full matrix/10 nhóm cũ. `node scripts/product/e2e.mjs --serve --review-r1` mở sandbox T3; setup session riêng chỉ memory, không điền password vào DOM hoặc echo response fixture accounts. Dừng đúng run bằng stop.request như trên; R1 rotate/revoke cả hai fixture và ghi `fixture-invalidated.json`, release HTTP/PG đúng owner, giữ DB/logs/evidence.
