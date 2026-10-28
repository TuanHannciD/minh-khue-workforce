# Chạy tooling và pilot local

Pilot ghi chú chỉ dùng dữ liệu giả để kiểm chứng Agent/browser/persistence. Sản phẩm có React/Vite, Nest/Express, auth/session và Task4 POST/PATCH nhân sự; API tháng/ghi công/reconcile chưa triển khai. Pilot dùng Node22.12.0/npm10.9.0; `node:sqlite` còn experimental. Product dùng Node24.22.1/pnpm12.15.0. Python `py -3`3.14.3 dùng cho script UI, không phải backend sản phẩm.

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

Dừng foreground bằng Ctrl+C trong đúng terminal sở hữu. Không kill theo cổng tìm thấy. `api dev` chỉ watch compiler; chạy `start` riêng sau build. `apps/*/.env.example` là mẫu cấu hình; Vite đọc `.env`, API đọc biến process (không tự load file secret). Cổng trên là mặc định tài liệu, phải kiểm còn trống trước acquire. API có `/health`, `/api/v1/auth/{login,logout,session}` và POST `/api/v1/employees`, PATCH `/api/v1/employees/:id`; không mở Swagger UI hoặc attendance endpoints. Vite proxy `/api` về API cùng origin với browser; `API_PROXY_TARGET` đọc từ process Vite, `VITE_API_ORIGIN` chỉ còn dùng health transport bootstrap.

Web alias `@/` thuộc src web. API dùng native package imports `#app/*` với `.js` ESM, được kiểm trên compiled runtime; không có alias xuyên app. Contract được sinh từ Nest DTO thành OpenAPI3.0.3 và web types; không sửa hai output bằng tay. [Tooling map](../../scripts/product/README.md) định vị generator/boundary/fixtures.

`product:check` chạy lint/format/strict types/build từng app, tooling fixtures, web Vitest/DOM/session, API bootstrap/auth HTTP/native, cycle/boundary và regenerated drift check. `product:test:e2e` và `product:benchmark` vẫn **Not run, nonzero** đến Task10. Integration auth chạy riêng trên PostgreSQL17.11 thật như dưới; không phải acceptance toàn sản phẩm. npm lock baseline được giữ trong ignored evidence và lịch sử Git trước khi bỏ lock npm active.

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

## Thao tác thử

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
