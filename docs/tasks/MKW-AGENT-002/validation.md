# Validation — MKW-AGENT-002

Triển khai/pilot đã kiểm chứng. Gate cuối review/tích hợp theo receipt tại evidence root, không coi plan hoặc candidate là kết quả nghiệm thu cuối.

## Discovery

Node 22.12.0; Git có sẵn user identity. T3 catalog 23/10 có provider cho phép child task/model phù hợp; chưa dispatch tại thời điểm ghi đầu.

Browser: preview_status ban đầu available=false. `preview_open` với URL `about:blank` lỗi parse; bỏ argument URL và mở lại thành công, available=true. Tab incognito thuộc Agent: `tab_2_2c92e99b-a259-46b2-b0c9-8d74af1cf9d1`. Không cần fallback.

Git baseline: `12bb0421fd1f8a0a44e87c52866ae3110f992bd2`, nhánh main, đã commit toàn bộ tài liệu và scope bootstrap. Git user identity có sẵn, không thay global. Python 3.14.3, npm 10.9.0, pnpm 10.30.3 chạy được.

Đã đọc skill-installer (system), using-superpowers/Codex reference, using-git-worktrees, executing-plans và TDD từ nguồn khảo sát để bootstrap trước khi có local distribution. Dùng executing-plans inline; các override rule project vẫn áp dụng. Dùng native T3 worktree handoff thay manual Git checkout; continuation giữ mục tiêu đang làm.

## Resource

Task MKW-AGENT-002. Worktree sau baseline: primary/.worktrees/agent-bootstrap. Run/evidence root dự kiến primary/.agent-runs/MKW-AGENT-002, giữ ngoài checkout disposable. Sandbox fake data, loopback + port tự cấp. Không dùng production/env/tài khoản thật.

## Ledger

Worktree base `ff91255e2a92f21027ba27bd7875b3d69c9c796c`, branch `agent/mkw-agent-002`. Evidence root thực tế: `D:/TinHoc/minh-khue-workforce/.agent-runs/MKW-AGENT-002` (ignored, ngoài disposable checkout). Primary chưa bị thay implementation.

## Skill và tooling — Verified

- System installer `install-skill-from-github.py` bằng `py -3`: obra/superpowers `v6.4.2`, commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`, 15 package local. UI copy nguyên byte từ SellerFlow commit `5477dce80c55c42f4b612479296d22574a177266`, nguồn local Windows-Video-Builder `8b9ff69c5b84cae119cbc325bc5acb6b20d05f0a`. Không claim UI pristine upstream.
- `npm run check:skills`: 15+2, hash/inventory/metadata/license paths đạt. Checker thử tamper/missing/traversal/unmanifested; `skills-red.log` fail assertion0/1 trước implementation, sau đó pass1/1.
- Node22.12/npm10.9, Python3.14.3, Git2.54; không sửa global identity/config. Lockfile pin dependency; npm install audit0 vulnerabilities tại thời điểm chạy. ESLint9 warning hết hỗ trợ, giới hạn ghi LOCAL_RUN.
- `npm run check`, cwd worktree: exit0, docs UTF-8/link/anchor/fence + lint + **7 pass/0 fail/0 skipped**; `check-before-review.log`. Không claim type-check/build. Lifecycle test bổ sung sau CLI để kiểm preservation, không claim mọi dòng tooling viết bằng TDD.

## Pilot API/SQLite — Verified

`node --experimental-sqlite --test --test-concurrency=1 tests/pilot.test.mjs`: `pilot-red.log` **0/5**, contract stub501 khác expected; sau implementation `pilot-green.log` **5/5**, exit0. SQLite file thật, restart vẫn còn dữ liệu, concurrent retry không trùng, conflicting key409, simulated503 không ghi DB, validation/origin/size/static protections. SQLite experimental là giới hạn pilot, không quyết định stack sản phẩm.

Lifecycle test khởi động CLI thật, xác nhận loopback/owner/run riêng; gửi `stop`, exit0, port đóng, record released, bằng chứng còn và server khác còn hoạt động. Run thư mục mới được giữ; không cleanup recursive evidence. Hard crash/PID reuse/parent crash recovery: Not run.

## UI skills và browser thật

Impeccable context và UI UX Pro Max search đã chạy theo PRODUCT/DESIGN nội bộ. Detector lần đầu degraded vì thiếu parser; sau cài parser local chạy đầy đủ có2 warning heuristic: cream-palette (paper có chủ đích trong brief), flat-type-hierarchy (chỉ thấy14/16/20, không tính h1 clamp tới48px). Đã xem screenshot; không coi detector thành chứng nhận accessibility đầy đủ.

T3 Browser tab owned nêu trên; server PID31640 URL `http://127.0.0.1:64433`, DB/evidence `interactive-1zBaM2`. Tool navigate/snapshot/type/click/wait/evaluate: lưu201 → GET200 có1; lỗi thật503, giữ text/DB vẫn1; retry201 → reload → API và DOM cùng đúng2, không overflow1280px. Không mock/intercept. `t3-failure.json`, `t3-final.png` giữ bằng chứng. Console có503 cố ý, không che lỗi. Screenshot đã xem trực tiếp.

Playwright ban đầu Failed vì thiếu executable; `playwright-first.log` và run report giữ nguyên. Chromium tải project-local; không dùng lỗi prerequisite làm RED hành vi. Kết quả sau cài ghi tiếp bên dưới.

Sau installer exit0 (Chromium1248/FFmpeg1013/Winldd1007 tại node_modules local), `npm run test:e2e` **exit0, 2 passed, retries0**, desktop1280×800/mobile390×844. `playwright-installed.log`, run `playwright-WTU1Bs` có DB/owner/trace/screenshot/report. Assertions keyboard focus/outline, text HTML không tạo img, lưu/reload/503/retry/API count2/không overflow/pageerror rỗng. Không intercept. Không dùng test retry để che fail.

Resource thực tế: session tương tác ban đầu chạy không PTY nên stdin bị đóng; gửi stop Failed. Đã xác minh PID31640/commandline/thời điểm tạo khớp owner và GET API còn hoạt động; dừng đúng process sở hữu bằng Stop-Process, không kill theo cổng. Script so sánh DateTimeOffset có lỗi PowerShell conversion không-terminating, không được coi là guard tự động đạt; ownership đã được kiểm riêng trước đó. Record ghi `terminated-owned-stdin-unavailable`, không claim graceful release cho run này. Fetch sau dừng ECONNREFUSED, DB đọc trực tiếp count2; đóng tab Agent-owned bằng T3 lifecycle. Evidence giữ nguyên. Test CLI pipe-owned đã chứng minh graceful stop; dùng PTY cho interactive lần sau.

## Resume ngữ cảnh mới — Verified trong scope checkpoint

Khắc phục control sau khi runtime từ chối PTY Access denied: test file-stop được viết/chạy trước, `file-stop-red.log` fail timeout mong đợi, thêm run-local stop.request → `file-stop-green.log`2/2. Run thật `interactive-mkpOd3` PID28528/port61263 nhận file `stop`, session exit0 và record released. Không dùng PID kill cho vòng sửa; chưa kiểm hard-crash recovery.

T3 live discovery provider `codex_cx_via_9router`, model `gpt-6.1-sol`, reasoning medium. ClientRequestId `mkw-002-resume-checkpoint-20261023-a`, taskId `node:delegated-task:command%3Amcp%3A14c60b1f-f7ec-49a9-99c3-f28509d15780%3Adelegate-task%3Amkw-002-resume-checkpoint-20261023-a`, completed. Brief chỉ cung cấp đường dẫn/handoff, không truyền parent history.

Agent mới đọc authority/routing/approved/technical/validation/HANDOFF, khôi phục quyền/base/next action; explicit-read verification skill, `npm run check` exit0/7pass. Git status trước/sau không đổi; run `interactive-3IOC4v` released, không đụng server parent. Kết quả trong `resume-result.json`. Không chứng minh auto-discovery hoặc phục hồi toàn phiên parent sau crash. Android/production/scheduler: Not run/ngoài scope.

## Review và tích hợp

Tích hợp chỉ local fast-forward sau review final tip/check đạt và primary sạch. Giữ branch/worktree/evidence, không push/remote/deploy. Kết quả cuối ghi trong `completion-receipt.json` dưới evidence root đã nêu: status, full candidate/base/tip, reviewer task/result, check và integration actual SHA. Receipt là evidence hậu commit; tránh sửa tip chỉ để tự ghi SHA/review của chính nó. Chưa có receipt Done thì không tự suy task Done.

Candidate round1: `8966959a436813c6bcb26015caa053edb8876c63`; base full SHA đã ghi trên. Delegated independent reviewer `codex_cx_via_9router` / `gpt-6-astra` reasoning high, clientRequestId `mkw-002-review-round1-8966959`, taskId `node:delegated-task:command%3Amcp%3A14c60b1f-f7ec-49a9-99c3-f28509d15780%3Adelegate-task%3Amkw-002-review-round1-8966959`. Reviewer read-only, không parent transcript/child dispatch. Kết quả **With fixes**, 2 Important, không Critical; toàn report `review-round1.json`.

Candidate check `candidate-check.log` exit0/**8pass**, sau bổ sung file-stop test. `git diff --check` toàn distribution có whitespace warnings tại bytes UI đã import; giữ byte/provenance theo yêu cầu, không sửa vendor để làm check xanh. Diff ngoài `.agents/skills` không lỗi whitespace. Đây là exception theo scope bảo toàn byte đã duyệt, không giả full diff check pass.

### Fix pass

1. UI xóa draft mới khi response của thao tác cũ về: `tests/ui.test.mjs` kiểm transport chậm trong unit fixture, `draft-red.log` fail đúng expected B/actual rỗng; chỉ clear khi text hiện tại khớp text đã lưu, `draft-green.log`pass1/1. Unit này dùng DOM/transport kiểm soát, không claim là browser thật; 2 browser regression vẫn API/DB thật không intercept.
2. Thiếu notice thư viện vendored modern-screenshot: truy vết npm tarball4.7.0, gitHead `792d6db7411839c62940a6e930161f8e376e817f`; bundle local khớp nguyên byte `package/dist/index.js`, SHA256 `bb36665889124a0b6e15f16045265737449c3bdcf2712cdb08af3cfa01563e2b`. Thêm `.agents/MODERN-SCREENSHOT-LICENSE` từ LICENSE chính tarball (MIT, copyright2021-present wxm), hash/nguồn trong UI manifest; giữ nguyên toàn bộ byte snapshot và UI-LICENSES cũ. Evidence `modern-screenshot-provenance.json`. License là bổ sung tài liệu attribution, kiểm bằng integrity checker, không tạo test app giả cho nội dung pháp lý.

Final fix check/regression/review tip mới và tích hợp actual ghi receipt cùng log riêng; không lấy round1 làm review tip mới.

## Ruling thực hiện

Plan002 là brief theo task, không theo schema shell helpers upstream executing-plans; dùng ledger/validation project thay parser/task-done Bash upstream. Không sửa distribution. Project buộc re-review tip mới/giữ evidence, ưu tiên phần upstream bỏ re-review/xóa workspace. UI snapshot provenance local giữ rõ. Chi phí nếu chọn sai: đổi adapter/nguồn skill trong task nâng cấp; không có quyết định nghiệp vụ bị áp đặt.

Reviewer declined-to-judge đã được parent xử lý: (1)15 workflow/mọi vendor script chưa audit/vận hành toàn bộ → giữ giới hạn, chỉ thử workflow dùng; (2)UI pristine upstream → không claim, snapshot local có hash đã duyệt; (3)production/auth/nhân sự/Android/deploy → ngoài scope; (4)hard crash/PID reuse/durable browser retry → Not run; (5)typecheck/build → N/A cho JS/static pilot, không coi là script đã pass; (6)whitespace nguồn/2 warning UI → giữ bytes/brief, không là lỗi acceptance. Chi phí các phạm vi hoãn: phải có task/pilot tương ứng trước khi dựa vào chúng; không có quyền sản phẩm phát sinh. Không có deferred minor finding từ round1.
