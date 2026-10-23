# Chạy tooling và pilot local

Pilot ghi chú chỉ dùng dữ liệu giả để kiểm chứng Agent/browser/persistence. Chưa quyết định stack ứng dụng nhân sự. Node 22.12.0/npm 10.9.0 đã kiểm chứng; `node:sqlite` ở Node này còn experimental. Python `py -3` 3.14.3 dùng cho script UI, không phải backend sản phẩm.

## Chuẩn bị và check

Chạy từ checkout Git của project:

```powershell
npm ci
npm run check
$env:PLAYWRIGHT_BROWSERS_PATH='0'
npx playwright install chromium
npm run test:e2e
```

`npm run check` gồm hash/inventory/metadata/license paths, UTF-8/link/anchor/fence tài liệu hiện hành, lint và integration tests. Reports/templates lịch sử chỉ kiểm UTF-8; skill upstream được kiểm bằng manifest, không áp luật link project lên ví dụ upstream. Không claim type-check hoặc build vì chưa có pipeline đó.

Playwright Chromium nằm trong `node_modules/playwright-core/.local-browsers`, không sửa browser/global config. Wrapper tự đặt browser path và cờ SQLite cho test workers. Hai viewport desktop/mobile dùng server/DB riêng, không intercept/mock API, retries=0; trace/report/screenshot và SQLite fake-data được giữ theo run.

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
