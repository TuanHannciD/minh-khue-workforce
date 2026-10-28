# Chạy tooling và pilot local

Pilot ghi chú chỉ dùng dữ liệu giả để kiểm chứng Agent/browser/persistence. Sản phẩm có bootstrap React/Vite và Nest/Express riêng, chưa có nghiệp vụ nhân sự. Pilot dùng Node22.12.0/npm10.9.0; `node:sqlite` còn experimental. Product dùng Node24.22.1/pnpm12.15.0. Python `py -3`3.14.3 dùng cho script UI, không phải backend sản phẩm.

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

## Product Task2 — runtime và lệnh có thật

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
pnpm --filter @mkw/web dev # loopback5173, strictPort; đọc VITE_API_ORIGIN
```

```powershell
pnpm --filter @mkw/api build
$env:PORT='3001'
$env:WEB_ORIGIN='http://127.0.0.1:5173'
pnpm --filter @mkw/api start
```

Dừng foreground bằng Ctrl+C trong đúng terminal sở hữu. Không kill theo cổng tìm thấy. `api dev` chỉ watch compiler; chạy `start` riêng sau build. `apps/*/.env.example` là mẫu cấu hình; Vite đọc `.env`, API đọc biến process (không tự load file secret). Cổng trên là mặc định tài liệu, phải kiểm còn trống trước acquire; sandbox Task2 đã dùng cổng ngẫu nhiên và owner record. Bootstrap API chỉ có GET `/health`; không mở Swagger UI, auth hoặc endpoint nghiệp vụ.

Web alias `@/` thuộc src web. API dùng native package imports `#app/*` với `.js` ESM, được kiểm trên compiled runtime; không có alias xuyên app. Contract được sinh từ Nest health DTO thành OpenAPI3.0.3 và web types; không sửa hai output bằng tay. [Tooling map](../../scripts/product/README.md) định vị generator/boundary/fixtures.

`product:check` chạy lint/format/strict types/build từng app, tooling fixtures, web Vitest, API bootstrap HTTP, cycle/boundary và regenerated drift check. Các lệnh `@mkw/api test:integration`, `product:test:e2e`, `product:benchmark` hiện báo **Not run, nonzero** vì cần Task3–10 (script exit2, pnpm filter có thể trả1); không nằm trong kết luận bootstrap đạt. Web test hiện kiểm transport HTTP/config, chưa là DOM/gesture acceptance. PostgreSQL/Prisma compatibility spike đã đạt trong sandbox ignored độc lập và cluster đã dừng; không tạo schema/migration sản phẩm ở Task2. npm lock baseline được giữ qua checks, sao lưu byte-for-byte trong ignored evidence và lịch sử Git trước khi bỏ lock npm active.

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
