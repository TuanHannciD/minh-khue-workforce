# Minh Khuê Workforce — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans để thực hiện từng task inline trong quyền được cấp. superpowers:subagent-driven-development chỉ là lựa chọn sau khi người dùng cho phép dispatch; kế hoạch này không cấp quyền đó. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây bản chấm công web đầu tiên đúng đặc tả đã duyệt, lưu thật qua API/PostgreSQL, dùng được trên điện thoại và desktop, xuất Excel đúng dữ liệu.

**Architecture:** Giữ ADR-001/002/003: apps/web React/Vite, apps/api NestJS/Express, PostgreSQL/Prisma; DTO API sinh OpenAPI và kiểu client. TanStack Query giữ snapshot server, React giữ draft/selection; server kiểm quyền, số, mốc ngày và ghi nguyên tử có kiểm phiên bản. UI kế thừa bản C đã chấp nhận, semantic table và shadcn/Radix, không thiết kế lại hướng đã duyệt.

**Tech Stack:** TypeScript strict, React Router, Tailwind, React Hook Form/Zod, pnpm workspace; class-validator/Swagger/openapi-typescript, ExcelJS; ESLint/dependency-cruiser, Vitest/Testing Library, Supertest, Playwright và browser trực tiếp theo runtime.

**Spec:** [design.md](../design.md) toàn bộ mục1–14 và AC01–AC23, được người dùng duyệt ngày28/10/2026; [requirements](../approved/requirements.md), [architecture proposal](architecture-proposal.md) đọc cùng [ADR-003](../../../architecture/decisions/ADR-003-product-stack.md). Proposal không tự biến mọi thiết kế kỹ thuật thành Accepted.

**Quyền tiếp tục hiện hành28/10/2026:** người dùng yêu cầu chạy tuần tự đến hết phần có thể hoàn tất, không dừng hỏi lại nếu không có vấn đề lớn. G1 independent review PASS tại95ce21a, không blocker; main quyết định tiếp tục theo bộ thiết kế đó trong phạm vi đã duyệt, không chờ approval từng field/version. Các dòng chờ human approval G1/Task1 ở checkpoint bên dưới là lịch sử, được chỉ dẫn này thay. Task1 hoàn tất thiết kế/review, Task2 được giao triển khai; check/review code vẫn bắt buộc. Chỉ hỏi vấn đề lớn hoặc quyền ngoài scope, không primary/push/deploy/hệ thống thật/global.

**Phương pháp thực thi hiện hành28/10/2026:** người dùng yêu cầu main chỉ điều phối và thực hiện tuần tự. Áp dụng subagent-driven-development: một implementer hoặc reviewer tại một thời điểm, fresh scoped context, report/ledger để resume; main không triển khai source. Chỉ dẫn inline ở header và checkpoint dưới được phương pháp mới này thay về execution route, không thay nội dung/gate task. Quyền dispatch phạm vi plan đã có; không có quyền tích hợp/push/deploy hoặc hệ thống thật. Reviewer G1 đang đọc snapshot Task1, chưa tự đánh dấu G1 Accepted.

**Trạng thái:** Accepted — người dùng xác nhận “Tôi xác nhận duyệt kế hoạch” ngày28/10/2026. Tiếp tục inline bằng executing-plans; Task1 thiết kế đang thực hiện, G1 chưa duyệt, chưa cài/code sản phẩm. Plan nằm trong dossier theo EXECUTION_RULES, thay vị trí mặc định docs/superpowers/plans. Base tài liệu `1870695a416c7832bee4f3c8900369dcce4a9f3a`, worktree `.worktrees/agent-bootstrap`, branch `agent/mkw-agent-002` sạch trước sửa. Base thực thi phải là commit chứa plan đã duyệt, ghi SHA thực khi bắt đầu; không lấy base trước plan làm snapshot giao việc.

## Global Constraints

- Giữ nguyên nghiệp vụ: công và giờ độc lập, bước `0,5`; tối đa **30 công mỗi ô**, **24 giờ mỗi ô**; không phải trần tổng tháng.
- Nhận `3,5`/`3.5`, hiển thị dấu phẩy; không làm tròn/cắt giá trị; input sai giữ nguyên để sửa. `0` công thành `F`; tăng ca không chuyển `0` thành `F`, không tăng ca để trống.
- `F`/trống/`N`/`—` khác nhau; màu xanh chỉ nhắc, không đổi tổng/quyền và không là duyệt. Ngày nghỉ là ngày cuối còn làm; ngày bắt đầu do người dùng chọn.
- Hai tài khoản tạo sẵn, tên/mật khẩu, cùng quyền toàn công ty; không public signup. Reset qua vận hành xác minh, không thêm role/admin/email/SMS.
- “Dừng cả vùng, giữ bản nháp”: không partial write, không force-write/retry ghi đè. Khoảng mỗi15 giây đọc lại dữ liệu đã lưu, giữ draft và revision nền của draft.
- Chọn rời trong tháng/dòng đang hiển thị; hợp trùng một lần. Điền trống xét nội dung rỗng, mặc định điền trống, giữ nhắc từng đích; fill lặp số/F, không đổi nguồn/chép nhắc/tăng dãy. Áp dụng mới ghi.
- Giữ450ms để kéo cảm ứng; lệch quá10px trước kích hoạt nhường cuộn, đúng10px còn chờ; tay nắm cảm ứng44px. Giữ cách chạm/hai đầu/bàn phím thay kéo, pinch zoom và guard đổi ngữ cảnh.
- Excel một sheet Công trên/Tăng ca dưới, tổng công thức theo người/ngày/từng phần, đơn vị riêng, giữ số/ký hiệu/trống/màu.
- Không tính lương/import Excel/công trình/check-in/approval/offline/đa giai đoạn nghỉ–quay lại. Không lấy20 người làm trần hoặc hứa quy mô vô hạn.
- Không pin version từ pilot. Không cài `latest` rồi gọi đã review. Không thêm Zustand/grid engine/virtualization hoặc module tương lai mặc định.
- Chuẩn [architecture](../../../architecture/ARCHITECTURE.md), [code](../../../architecture/CODE_CONVENTIONS.md), [UI](../../../architecture/UI_SYSTEM.md), [API](../../../architecture/API_CONTRACTS.md), [source navigation](../../../architecture/SOURCE_NAVIGATION.md), [quality](../../../agent/QUALITY_GATES.md), [browser](../../../agent/BROWSER_TESTING.md) áp dụng xuyên task. Giữ UTF-8 và tiếng Việt.

## Review Focus

1. Phản hồi mất sau DB commit: không báo chắc chưa lưu hoặc gửi lại mù; task4/5/7 kiểm reconcile explicit ID/key ngoài membership tháng và accepted no-op fence trước lần lưu có chủ ý tiếp theo. Read/abort/bỏ draft không hủy request cũ; source/đích bị skip/eligible0 không được fence.
2. Thay ngày vào/nghỉ chạy đua với ghi số/F/reminder-only ở tháng khác: task4/5 kiểm không mất dữ liệu hoặc tạo ô ngoài mốc.
3. Fill dùng nguồn vừa bị đổi/ẩn hoặc tập đích bị refetch thay đổi: task5/8 kiểm giữ draft, đối chiếu lại, không tự đổi tập ghi.
4. Polling, hết phiên, đổi tháng/loại/lọc khi đang gõ: task3/7/8 kiểm giữ draft trong phiên và không lộ cache sau logout, không áp nhầm người/đơn vị.
5. Pan/pinch/cancel sát450ms/10px và sticky khi zoom: task8/10 kiểm synthetic riêng với trusted touch iPhone/Android, không nâng gate từ viewport.

## Quyền, ownership và gate

Kế hoạch đã được người dùng duyệt28/10/2026. Tiếp tục Task1 inline; cài/scaffold/code phần phụ thuộc phải qua G1. Dispatch, tích hợp main, push/deploy và hệ thống thật chưa được cấp quyền. Các giới hạn chỉ viết plan của checkpoint trước không chặn phần thiết kế Task1 đã được duyệt.

Writer dự kiến: Agent chính inline, một writer tại một thời điểm. Khuyến nghị Native/executing-plans vì contract, transaction và draft liên quan chặt; chỉ đổi phương pháp khi người dùng chọn và cấp quyền tương ứng. Code/tooling/auth/DB risk trung bình–cao: review độc lập bắt buộc trên snapshot cuối theo QUALITY_GATES. Chưa được phép dispatch reviewer; gate review tương lai giữ Blocked đến khi có reviewer độc lập được phép, không coi tự review là đạt. Không cần child để tự review bản plan này.

- **G0:** Đạt về review kế hoạch ngày28/10/2026; tiếp tục Task1 inline. G1 và quyền/gate các scope sau vẫn áp dụng.
- **G1 (task1):** thiết kế kỹ thuật chi tiết và pin manifest được review trước phần code phụ thuộc. Các tên/signature trong plan là đề xuất triển khai để review, không là contract sản phẩm đã chốt.
- **G2 (task2–9):** mỗi task có RED → GREEN cho hành vi quan trọng, check consumer, commit scoped local nếu được quyền; task rủi ro cần review độc lập đúng snapshot trước khi coi hoàn tất gate. Không bắt test cho câu chữ thuần túy.
- **G3 (task10):** regression toàn nhánh, browser web–API–PostgreSQL và review độc lập final SHA; thiếu thiết bị/Excel reader/reviewer giữ đúng Not run/Blocked.
- **G4 (task11):** release là scope riêng: target, người vận hành, quyền, migration/backup/restore và smoke cụ thể. Plan này chưa chọn hosting/CI hoặc cấp quyền release.

Mỗi task cập nhật INDEX/validation: scope, acceptance, base..tip, writer/reviewer, check và tài nguyên. Khi thực thi dùng using-git-worktrees để xác minh cách ly phù hợp; không tự tạo checkout mới trong task tài liệu này. Trước acquire ghi run ID, web/API origins/cổng chưa bị chiếm, DB thử identity riêng, browser context và evidence `.agent-runs/MKW-PRODUCT-001/<run-id>/`. Không reset DB không rõ chủ; giữ ignored evidence, chỉ release process/tab/DB do task tạo sau khi xác minh.

## File structure và giao diện xuyên task

Các đường dẫn sản phẩm bên dưới **chưa tồn tại**, chỉ tạo khi task cần. Test colocated `.test.ts/.test.tsx`; integration PostgreSQL tại `apps/api/test`, E2E riêng `tests/product-e2e`, không trộn suite pilot. Không dùng số dòng tương lai làm địa chỉ source.

| Vùng | Trách nhiệm và owner |
| --- | --- |
| `apps/web/src/app/{router,providers,app-shell}.tsx` | Lắp ghép route/session/query; không giữ luật công |
| `apps/web/src/shared/api/{transport.ts,generated/schema.d.ts}` | Fetch/lỗi/session; kiểu sinh từ OpenAPI, không sửa tay |
| `apps/web/src/shared/styles/tokens.css`, `shared/ui/` | Tokens kế thừa bản C, primitives shadcn/Radix có provenance/custom delta |
| `apps/web/src/features/session/{api,ui}/` | Login/logout và phiên, không public signup |
| `apps/web/src/features/employees/{api,ui}/` | Form tên/mốc ngày và lỗi ô bị loại |
| `apps/web/src/features/attendance/model/` | Parser, selection, draft và lifecycle gesture thuần feature |
| `apps/web/src/features/attendance/{api,ui}/` | Query/mutation, bảng tháng/editor/trạng thái lưu |
| `apps/api/src/modules/{auth,employees,attendance}/` | DTO/controller/service, luật/quyền và persistence từng module |
| `apps/api/src/infrastructure/{config,db}/`, `apps/api/prisma/` | Config xác minh target; Prisma schema/migration chỉ backend |
| `apps/api/src/modules/attendance/export/` | Excel từ snapshot đã lưu, dùng cùng phép tính server |
| `contracts/openapi.json`, `scripts/product/` | Snapshot sinh, drift/boundary/run thử có owner |

## Bộ thiết kế Task1 trình review G1

Cập nhật28/10/2026: snapshot `95ce21a107d4d98fde267993f2f951a4f870ef0d` đã qua independent re-review R2, I1/I2/I3/M1 Addressed, không blocker mới trong phạm vi fix. Review kỹ thuật thiết kế PASS; người dùng chưa duyệt G1, các chi tiết vẫn Proposed. Không coi review này thay runtime/compatibility hoặc cấp quyền nhảy sang Task2. Report/ID round ở ledger và validation.

- [Contract API](api-contract.md): endpoint/DTO/error, field thiếu/null, revision ô trống, batch/fill/source, timeout và query.
- [Data model](data-model.md): nửa đơn vị nguyên, tombstone revision, schema/migration và transaction/lock order.
- [Auth/session](auth-session.md): phiên server/cookie/Origin, hash/quota và reset vận hành.
- [Toolchain manifest](toolchain-manifest.md): exact pins và metadata, chuyển pnpm/giữ pilot; compatibility chưa chạy.
- [Verification matrix](verification-matrix.md): toàn bộ AC, failure modes, ngân sách, thiết bị/reader còn thiếu.

Các tên DTO chính xác để G1 review: `AttendanceKind`, `CellKeyDto`, `CellValueDto`, `CellSnapshotDto`, `EmployeeDto`, `SessionIdentity`, `SessionDto`, `MonthDto`, `KindTotalsDto`, `ReconcileRequestDto`, `ReconcileSnapshotDto`, `CellExpectationDto`, `WriteAttendanceDto`, `WriteResultDto`, `TargetPreviewDto` tại api-contract. G1 chưa Accepted; không dùng để code phụ thuộc trước review. Frontend `WriteIntent` là alias nội bộ của generated `WriteAttendanceDto`, `TargetPreview` là alias của `TargetPreviewDto`; không duy trì wire DTO viết tay hoặc union conflict200 cạnh tranh: conflict dùng HTTP409 error envelope theo contract. Kiểu HTTP update nhân sự `UpdateEmploymentDto` gồm expectedRevision bắt buộc và ít nhất một field name/startDate/endDate theo PATCH trong contract. WriteAttendanceDto có patch-cell một ô với value/reminder optional nhưng không đồng thời thiếu; một Save dùng một request/transaction. Batch/fill vẫn set-value giữ reminder đích.

Các type frontend props/lifecycle (`AttendanceGridProps`, `ParseResult`, `GestureOptions`, `GestureController`) do task6/8 định nghĩa tại file owner, không source wire. Private `MutationCredential`/`AuthenticatedSession`/`ProductTransaction`/`LockedEmployee` tại auth/data-model là interface backend, không đưa vào OpenAPI/web. G1 đã chỉ rõ ranh giới này để không truyền mỗi SessionIdentity vào transaction rồi bỏ kiểm revoke.

## Trình tự task

Task1 → task2 → task3 → task4 → task5 → task6 → task7 → task8 → task9 → task10 → task11. Các lát cắt cùng một sản phẩm; không tạo workflow song song. Task6 dùng thiết kế C đã duyệt, không lặp khảo sát A/B/C. Task11 chỉ chuẩn bị release, cần quyền riêng cho thao tác thật.

### Task 1: Chốt thiết kế kỹ thuật chi tiết có thể triển khai — G1

**Files:** Create `technical/api-contract.md`, `technical/data-model.md`, `technical/auth-session.md`, `technical/toolchain-manifest.md`, `technical/verification-matrix.md` trong dossier này; Modify plan này và architecture-proposal ở phần tiếp nối. Không tạo source/app/package ở task thiết kế.

**Interfaces:** Consumes design mục1–14, ADR-001/002/003. Produces nguồn DTO/endpoint/error/date/revision/schema/session/version chính xác cho task2–9; không đưa phương án stack khác ra chọn lại.

- [x] Viết contract có method/path, request/response/error và JSON ví dụ cho login/logout/current session, nhân sự/thay mốc, tháng/tổng đầy đủ, một ô/batch/fill, xuất tháng (xlsx không JSON). Bổ sung reconcile explicit ID/key không phụ thuộc membership và patch-cell lưu cả value/reminder trong một transaction. Khóa khả năng ghi reminder riêng không ghi đè giá trị; missing vs null, ô vắng record, tập đích rời đã dedupe, source read-only, chế độ điền trống và xung đột phải rõ. Checkbox là deliverable đã viết, không là G1 Accepted.
- [x] Viết data-model: ID ổn định/trùng tên, ngày lịch inclusive và giao tháng; biểu diễn nửa đơn vị chính xác, unique key ô, revision không tái dùng khi clear/recreate, constraint/migration. Chốt transaction/lock order cho nhân sự và các ô để sửa mốc/ghi ô không tạo write skew; test PostgreSQL cạnh tranh được đặc tả trước code.
- [x] Chốt timeout: bản đầu không tự retry write; reconcile toàn bộ employee ID/đích/nguồn kể cả ngoài membership để đối chiếu, giữ draft và chỉ tạo intent mới sau quyết định rõ trên baseline mới. Accepted eligible no-op/Employee PATCH cũng cấp revision mới; source/đích bị skip/eligible0 và read/abort không tạo fence. Xác định response mất không thể phân biệt tác giả ghi; không tự tuyên bố request cũ rollback. POST tạo nhân sự chưa có ID vẫn chưa xác định, không suy từ tên hoặc retry mù. Nếu chọn idempotency thay hướng reconciliation phải ghi thiết kế key/lifecycle và test riêng trước duyệt.
- [x] Viết auth/session cụ thể: hash mật khẩu, lưu session/revoke/expiry, cookie HttpOnly/Secure/SameSite và CSRF/CORS theo topology local/production dự kiến, rate limit/login error, reset CLI qua vận hành xác minh + revoke session. Không thêm role admin/màn hình quản trị; không đưa credential vào docs. Android sau này dùng API, chưa hứa cookie web là thiết kế auth native cuối.
- [x] Lập manifest exact versions/engines/license/source tương thích cho toàn bộ stack đã chọn; đề xuất cách chuyển root npm sang pnpm, kiểm pilot engine/lockfile và script. Nếu không có giao engine hợp lệ, ghi cách chạy pilot bằng runtime riêng, không sửa pilot im lặng. Chưa cài ở bước này; compatibility vẫn Not run.
- [x] Viết verification-matrix với test fixture, command đề xuất, tiêu chí đạt, target và AC owner. Đề xuất benchmark20/200/1.000 nhân sự, ghi ngân sách tải/render/scroll/nhập cụ thể để review, không coi đó là trần; chốt thiết bị/reader có thể tiếp cận trước gate cần chúng.
- [x] Tự đối chiếu contract↔schema↔auth↔AC; trình review G1, ghi quyết định, cập nhật mọi interface trong plan. Commit scoped tài liệu nếu đã được quyền; chưa code phần G1 chưa duyệt. Acceptance task này là thiết kế đủ rõ và được review, không claim compatibility hoặc security đã kiểm bằng tài liệu.

Trạng thái Task1: năm thiết kế đã soạn và tự đối chiếu; ma trận đã viết, thiết bị/reader chưa có identity thực. Review/duyệt G1 và phần chốt tài nguyên thật vẫn chưa hoàn tất; không đánh dấu Task1 complete hoặc bắt đầu Task2.

Fix R1 từ base `e41b317027fcc6069a0d9faa976437f5057f716d`: I1 cấp revision cho accepted no-op, I2 bổ sung read-only reconcile theo ID, I3 patch một ô nguyên tử, M1 JSON đầy đủ. Rulings/evidence/tip tại report ignored `.superpowers/sdd/implementation-plan/g1-fix-r1.md`; report review gốc `.superpowers/sdd/implementation-plan/g1-review-r1.md`. Main sở hữu progress/dispatch ledger; Task1 tiếp tục chờ re-review độc lập và explicit G1 human approval.

Cập nhật sau chỉ dẫn tiếp tục tự chủ: thiết kế và independent review G1 đạt, Task1 complete trong scope tài liệu; thiết bị/reader identity và runtime checks tiếp tục Not run ở gate task9/10, không trở thành bằng chứng đạt từ việc đánh dấu thiết kế. Bỏ bước chờ approval kỹ thuật thường lệ theo yêu cầu người dùng mới; không bỏ check/review.

### Task 2: Nền chạy độc lập, workspace và enforcement

**Files:** Create `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/{web,api}/package.json`, configs TypeScript/Vite/Nest mỗi app; `apps/api/src/{main.ts,app.module.ts}`, `apps/web/src/app/{providers,app-shell}.tsx`, `scripts/product/{check-boundaries.mjs,check-contract.mjs}`, `tests/product-tooling/boundaries.test.mjs`; Modify root `package.json`, `.gitignore`, ESLint và local-run docs theo G1. Không xóa npm lock/pilot khi chưa đối chiếu đường chuyển.

**Interfaces:** Consumes G1 exact pins/engine/command map. Produces runnable web/API riêng, transport origin cấu hình, scripts được định nghĩa ở bảng lệnh dưới; chưa có dữ liệu nhân sự.

- [x] Viết fixture test boundary `rejects_cross_app_deep_feature_and_cycle`: FE→API/Prisma, shared→feature, feature→nội bộ feature khác, cycle bị chặn; public import hợp lệ/alias đúng đạt. Thêm fixture drift cho OpenAPI/generated type cũ.
- [x] Chạy test tooling, xác nhận RED do enforcement chưa có; ghi nguyên nhân, không coi lỗi cài môi trường là RED hành vi.
- [x] Cài đúng pins đã duyệt trong scope được cấp, tạo tối thiểu hai app và scripts; tách pnpm product từ npm/pilot trong đường chuyển đã chốt. Cấu hình strict/lint/cycle/restricted imports, generator pipeline và origin. Không tạo feature rỗng hàng loạt.
- [x] Chạy tooling tests GREEN; chạy từng app typecheck/build riêng, generator lặp cho cùng output và fixture drift FAIL. Chạy lại `npm run check`, `npm run test:e2e` của pilot theo LOCAL_RUN nếu root/tooling ảnh hưởng, ghi runtime và kết quả thật. pnpm frozen install phải tái lập được.
- [x] Review độc lập tooling snapshot; commit scoped `build: establish isolated product toolchain`, cập nhật command map đã chạy. Nếu thiếu quyền reviewer ghi gate Blocked, không chuyển kết quả build thành hoàn tất review.

Task2 implementation28/10: base `da340cc8bc1f5e574aa177d8d3b9b63dcbd273cb`, một delegated writer, local commit handoff; independent review **Pending/main next**, chưa đánh dấu toàn Task2 gate complete. Product check đạt17 tooling +2 web +2 API bootstrap tests; strict/build độc lập, fresh frozen install và deterministic generation đạt. Pilot22 check10/10/E2E2/2 đạt. PostgreSQL17.11/Prisma7.10.1 compatibility spike đạt trên sandbox riêng/DB trống và readback độc lập, cluster đã release; không business code. Chi tiết/rulings/limits tại [manifest](toolchain-manifest.md), [validation](../validation.md), ignored `.superpowers/sdd/implementation-plan/task-2-implementation.md`. Không chuyển sang Task3 trước handoff/review do main sở hữu.

Task2 gate complete: independent review R2 tại `4dd3b4f428c39eaaaf248be3b1e477292287de8f` xác nhận I1 Closed, spec/code quality Approved, không finding mới. M1 color-env warning deferred nonblocking. Evidence và reports giữ tại `.superpowers/sdd/implementation-plan/task-2-review-r2.md` và `.agent-runs/MKW-PRODUCT-001/task2-fix-r1/`; checks product35+2+2, pilot10/E2E2, docs50. Các đoạn Pending phía trên là lịch sử handoff. Tiếp tục Task3 theo quyền người dùng, không thêm confirmation thường lệ; business/device/production gates chưa đạt từ bootstrap.
### Task 3: Đăng nhập, phiên và reset qua vận hành

**Files:** Create API `modules/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,session.guard.ts,auth.dto.ts}`, `prisma/schema.prisma` và migration auth, `scripts/product/reset-password.ts`; web `features/session/api/session.ts`, `features/session/ui/login-page.tsx`, `shared/api/transport.ts`; test `apps/api/test/auth.integration.test.ts`, `apps/web/src/features/session/ui/login-page.test.tsx`. Modify router/providers và OpenAPI/generated client.

**Interfaces:** Consumes G1 session contract, task2 DB/config/transport. Produces `requireSession(request): Promise<AuthenticatedSession>`, current-session API và `clearSessionCache(): void` tại providers; credential/session chỉ đi theo thiết kế G1, không localStorage token.

- [x] Viết `auth_rejects_anonymous_and_equal_accounts_can_edit` và `reset_revokes_sessions_without_admin_role`: unauthorized tháng/write/export; hai tài khoản giả cùng quyền; login sai không lộ account, CSRF/login flooding theo G1; logout/reset khiến cookie cũ bị từ chối. Không có public signup/reset endpoint vô quyền.
- [x] Chạy integration trên PostgreSQL thử mới, xác nhận RED chưa có module; viết UI test login lỗi giữ username nhưng không log password, lỗi auth không loop retry.
- [x] Triển khai guard/session/login/logout + seed đúng hai account fixture, CLI reset có target check. Seed thật và danh tính người vận hành chỉ làm khi được quyền riêng; không ghi mật khẩu vào Git/log.
- [x] Chạy GREEN API/UI; kiểm logout xóa Query cache và dữ liệu nhạy cảm, hết phiên ngừng polling và hiện đăng nhập lại; draft không được gửi nhầm sau đổi phiên. Kiểm cookie/CSRF theo môi trường thử, không lấy localhost làm bằng chứng TLS production.
- [x] Review độc lập auth/schema snapshot; commit `feat: add two-account authenticated sessions`; AC01/AC19 chỉ đổi Verified ở lớp thực sự đã chạy.

Task3 implementation28/10: base `9d358609d9a6a0c4352fad957dfc8b5b4c354194`, single writer/không child. API integration12/12 trên DB mới và browser build thật đạt auth sandbox; guard tháng/write/export qua test-owned probes, draft qua seam memory chưa có nghiệp vụ Task4/5/9. CLI thực tế `scripts/product/auth-cli.mjs` với hai pnpm commands provision/reset; test API `.mjs` chạy compiled ESM theo Task2 để bắt lỗi runtime metadata/import. Không tạo TS CLI loader mới. Native form controls/tokens C; primitives thuộc Task6. Evidence `.agent-runs/MKW-PRODUCT-001/task3-auth/`, report ignored Task3; [validation](../validation.md) phân biệt scope Verified/Not run. Local commit bàn giao chưa thay independent auth/schema review; main thực hiện fresh review trước Task4.


## Gate hiện hành — Task3 review độc lập đạt

Review R2 tại `08a867f59e8706b61a987e88b51e832d2c1592b0`: I1/I2/I3 Closed, spec và quality Approved, không regression mới. Backend/schema kế thừa review R1; checks final product38 tooling/24 web/5 API, docs52 đạt. Reports ignored `task-3-review-r1.md`, `task-3-fix-r1.md`, `task-3-review-r2.md` dưới `.superpowers/sdd/implementation-plan/`; evidence `task3-auth/` và `task3-fix-r1/` dưới `.agent-runs/MKW-PRODUCT-001/`. Các đoạn Pending bên dưới là lịch sử. Continuity DTO chỉ nhận diện được userId + absolute deadline, không bảo đảm unique opaque session; mọi request vẫn server authorize. Business/device/Linux/production TLS/operator reset thật vẫn Not run. Tiếp tục Task4 theo quyền đã duyệt, không confirmation thường lệ.

### Task 4: Nhân sự và bảo vệ mốc làm việc xuyên tháng

Review R1 Task4 yêu cầu sửa I1 (lifecycle clear chưa xóa input RHF) và M1 (generated create type bắt buộc endDate). Writer đã sửa và kiểm RED→GREEN tại evidence task4-fix-r1; chờ main fresh exact-SHA re-review, chưa independent PASS. Evidence task4-employees và validation giữ giới hạn HTTP reconcile/date-vs-attendance-write còn Task5/7. Test integration dùng Node compiled ESM .mjs theo harness Task3; không đổi nghiệp vụ.

**Files:** Create API `modules/employees/{employees.module.ts,employees.controller.ts,employees.service.ts,employees.repository.ts,employees.dto.ts}`; schema/migration nhân sự+ô cần bảo vệ; web `features/employees/api/employees.ts`, `ui/employee-form.tsx`; tests `apps/api/test/employees.integration.test.mjs`, `apps/web/src/features/employees/ui/employee-form.test.tsx`.

**Interfaces:** Consumes auth guard và G1 EmployeeDto/MonthDto. Produces `EmployeesService.listForMonth(month: string): Promise<EmployeeDto[]>`, `updateEmployment(input: UpdateEmploymentDto): Promise<EmployeeDto>` hoặc lỗi vị trí đã chốt; interface public validation/lock cho task5 và `EmploymentConsistency.readByIds(tx, ids): Promise<LockedEmployee[]>` để đọc cùng snapshot mà không lọc tháng/không lấy write lock. Không import repository nhân sự xuyên module.

- [x] Viết `month_membership_uses_interval_intersection`: thêm20/10 chọn bắt đầu15/10 →1–14 N, không hiện tháng9; kết thúc20/10 →20 editable,21–31 —, tháng11 vắng; hai người trùng tên vẫn hai ID. Kiểm28/29/30/31 ngày và thứ theo ngày lịch, không lệch timezone.
- [x] Viết `employment_change_preserves_all_months`: đổi cả hai mốc làm loại số/F/giờ/reminder-only →từ chối, trả đúng người/ngày/loại, giữ mốc/nội dung/nhắc/tổng; start>end hoặc ngày không hợp lệ bị từ chối. Chạy RED bằng integration và UI form.
- [x] Viết `employee_accepted_noop_fences_delayed_patch` theo barrier A-read-B-thả A của matrix ca6: B same-field200 đổi revision, A409; đảo order B409. Reject patch chỉ expectedRevision, missing/null theo contract. `read_by_ids_survives_month_exit` đọc ID vẫn thấy mốc/revision sau PATCH sang tháng11, tombstone không bị xóa; form giữ ID/draft khi người biến mất khỏi tháng. Recovery HTTP/E2E dùng reconcile của task5/7.
- [x] Triển khai phạm vi tháng/mốc server và form React Hook Form/Zod kế thừa UI C; form hiện vị trí cần xử lý, không tự xóa/cascade/ẩn dữ liệu. Tên/ngày chỉ validate theo contract G1, không thêm field nghiệp vụ.
- [x] Chạy GREEN qua API/DB reload + UI lỗi/keyboard; migration từ baseline auth giữ tài khoản. Để test cạnh tranh thực với write service tại task5, không claim AC15 toàn bộ đã đạt trước đó.
- [x] Review độc lập migration/nhân sự; commit `feat: manage employment dates without data loss`.


## Gate hiện hành — Task4 review độc lập đạt, 29/10/2026

Review R2 tại `c181b7865a99d594d1acc2eb36e5e1d9ba786671`: I1 và M1 Closed, spec/quality Approved, không regression mới. Final product39 tooling/35 web/7 API, docs54, generated determinism/drift đạt; persistence/migration kế thừa evidence PostgreSQL Task4, không gọi là fresh replay. Reports ignored `task-4-review-r1.md`, `task-4-fix-r1.md`, `task-4-review-r2.md` dưới `.superpowers/sdd/implementation-plan/`. Browser vòng sửa dùng HTTP fixture, giới hạn lưu assertions được giữ trong report; không claim console-clean/Nest/PG mới. Các đoạn Pending bên dưới là lịch sử. Tiếp tục Task5 theo kế hoạch đã duyệt; recovery UI Task7, whole AC15/device/Linux/TLS/operator thật còn Not run. Mọi subagent tối đa Sol/high, cấm Astra mọi trường hợp.

### Task 5: Snapshot tháng, validation và ghi ô/batch nguyên tử

Cập nhật29/10/2026: implementation/API/PostgreSQL đã kiểm; main independent exact-SHA review còn Pending trước Task6. Schema002 giữ nguyên, không migration mới. Commands/evidence/giới hạn tại [validation](../validation.md); self-review không thay independent gate.

**Files:** Create API `modules/attendance/{attendance.module.ts,attendance.controller.ts,attendance.service.ts,attendance.repository.ts,attendance.dto.ts,attendance-values.ts,attendance-totals.ts}`; tests `attendance-values.test.ts`, `attendance-totals.test.ts` colocated, `apps/api/test/attendance.integration.test.ts`, `apps/api/test/attendance-concurrency.integration.test.ts`; Modify Prisma migrations/contract generation.

**Interfaces:** Consumes auth và interface public nhân sự task4/G1; produces `AttendanceService.readMonth(month: string): Promise<MonthDto>`, `reconcile(input: ReconcileRequestDto): Promise<ReconcileSnapshotDto>` sau session guard, `write(input: WriteAttendanceDto, credential: MutationCredential): Promise<WriteResultDto>`. Cùng write use case cho một ô và tập đích; patch-cell giới hạn một ô, kiểm permission trên mọi request. POST reconcile chỉ đọc snapshot theo ID/key, không fence/cancel mutation.

- [x] Viết unit assertion: công29,5/30 và tăng ca23,5/24 nhận; công30,5/31, tăng ca24,5/25, số3,25, âm/NaN/Infinity bị chặn;0 công→F; không nhận F ở overtime, không biến0 overtime thành F. Tổng `[1 xanh,0.5,F xanh,null]` bằng1.5 công; reminder không đổi tổng, công1.5/giờ2 độc lập.
- [x] Viết integration `batch_conflict_rolls_back_all_targets`, `empty_cell_revision_prevents_lost_create`, `clear_recreate_cannot_reuse_revision`, `value_and_reminder_share_conflict_check`, `fill_source_change_rejects_stale_intent`, `date_change_race_preserves_valid_interval`. Dùng hai connection/request với barrier xác định, không sleep đoán lịch: một xung đột →không ghi bất kỳ đích nào; đổi mốc/ghi số,F,reminder-only ở tháng khác →chỉ kết quả hợp lệ, không mất nhắc. Kiểm dedupe/skip N—/đếm/sources read-only và không tự đổi tập điền trống khi snapshot cũ.
- [x] Viết `accepted_noop_fences_delayed_cell_write`, `skipped_targets_and_source_do_not_fence`, `zero_eligible_does_not_fence`, `single_cell_patch_is_atomic`, `reconcile_reads_explicit_ids_outside_month` theo matrix ca6–9: cả absent/tombstone/value/reminder, order đảo, rollback revision, missing-ID/state/snapshot nhất quán/auth/privacy. Patch missing/null/one-target/discriminator đúng runtime/OpenAPI; batch không nhận nhắc. Dùng JSON đầy đủ ở API làm fixture đối chiếu DTO/types, không chỉ kiểm parse.
- [x] Chạy unit/integration xác nhận RED đúng lý do; triển khai số chính xác theo G1, transaction/lock order/CAS toàn bộ. Snapshot tháng/tổng/metadata cùng thời điểm nhất quán, N/— suy từ mốc; không lưu lifecycle duyệt. OpenAPI sinh cùng DTO, validation server từ chối unknown/malformed theo G1.
- [x] Chạy GREEN trên PostgreSQL thật của sandbox, đọc độc lập sau reload/connection mới; giả mất phản hồi sau commit chứng minh dữ liệu đã lưu dù client timeout. Kiểm anonymous/unauthorized, payload lệch contract, ô ngoài khoảng/ngày tháng; không dùng SQLite thay concurrency. Chạy drift/boundary/typecheck/build API.
- [x] Review độc lập transaction/schema/contract final SHA; commit `feat: persist attendance batches atomically`. AC12/13/15 cần UI và hai phiên task7/10 trước claim toàn luồng.


## Gate hiện hành — Task5 review độc lập đạt, 29/10/2026

Review R2 tại `09ebdda4241b71a16ea82909900574877d81c87f`: I1/I2/M1 Closed, spec/quality Approved, không regression mới. Generated request shape đã sửa; initial HTTP RED404 chưa được evidence xác nhận, không dùng claim đó. Final product39 tooling/35 web/13 API, docs55, generation determinism/drift đạt; PostgreSQL transaction/concurrency/persistence kế thừa Task5 R1, không gọi là fresh replay. Reports ignored `task-5-review-r1.md`, `task-5-fix-r1.md`, `task-5-review-r2.md` dưới `.superpowers/sdd/implementation-plan/`. Các đoạn Pending bên dưới là lịch sử. Tiếp tục Task6 UI C đã duyệt; full AC12/13/15, UI recovery/device/Linux/TLS/operator thật còn Not run. Mọi subagent tối đa Sol/high, cấm Astra mọi trường hợp.

### Task 6: UI nền và bảng tháng theo thiết kế C

Checkpoint29/10/2026: implementation và local checks đã có, chưa independent PASS. Base `8a4e4f5e1d473caae2259c8b59508bd80980eb10`, full tip trong report ignored Task6. Final product39 tooling/66 web/13 API, pilot22 check10/E2E2, frozen install và built fixture375/728/1200 đạt scope đã ghi tại [validation](../validation.md#task6--ui-c-và-editor-intent-29102026). Không tick review/commit gate như đã hoàn tất review; main fresh exact-SHA UI/code review trước Task7. Browser zoom khác mặc định/trusted touch/persistence còn Not run, không dùng fixture thay gate toàn sản phẩm.

**Files:** Create web `shared/styles/tokens.css`, `shared/ui/{button,input,dialog,tabs}.tsx` theo nhu cầu thật; `features/attendance/ui/{attendance-page,attendance-grid,attendance-cell,cell-editor}.tsx`, `model/{number-input.ts,month-view.ts}`; tests `number-input.test.ts`, `month-view.test.ts`, `ui/attendance-grid.test.tsx`. Modify app shell/router; ghi nguồn/custom delta trong `shared/ui/README.md`.

**Interfaces:** Consumes MonthDto/CellSnapshotDto generated; produces `AttendanceGrid({month, selection, onCellIntent}: AttendanceGridProps)` và `parseNumberInput(raw: string, kind: AttendanceKind): ParseResult`, `formatAttendanceValue(value: CellValueDto): string`. ParseResult định nghĩa tại number-input.ts gồm valid/value hoặc invalid/message, không mất raw input của editor.

- [ ] Viết parser assertions `3,5`/`3.5` cùng3.5, hiển thị3,5;3,25/3.25 lỗi nguyên raw; công0/0,0/0.0→F, trần hai loại riêng. Grid test F/trống/N/—, tổng/ngày/thứ tháng nhuận; empty/error/loading khác nhau, nhãn cell có người/ngày/loại và nhắc không chỉ bằng màu.
- [ ] Chạy unit/component RED; triển khai tokens lấy từ HTML C hiện hành, shadcn Radix đã pin; không copy toàn script HTML hoặc thay hướng thẩm mỹ. Bảng semantic, sticky tên/ngày, một bảng Công/Tăng ca, editor nhận diện đúng ô và Lưu/Hủy, chế độ mở rộng trong trang giữ browser zoom.
- [ ] Chạy GREEN + browser component states 375/728/1200 và desktop keyboard/focus/contrast/overflow, tên dài/trùng tên/tháng ít ngày; Enter/Tab chuyển đúng ô hợp lệ, không trap focus. UI form/login cùng token; áp dụng Impeccable và UI UX Pro Max cho màn hình chưa dựng theo ngôn ngữ C, không khảo sát lại thiết kế đã duyệt.
- [x] Review UI/code snapshot và commit `feat: render approved monthly attendance interface`. Mock component tests chỉ chứng minh lớp UI; chưa claim lưu thật hoặc trusted touch.


## Gate hiện hành — Task6 review độc lập đạt, 29/10/2026

Review R2 tại `4257a7bb2ef6cc1a89ffa6885705127fcbd50982`: I1/M1 Closed, spec/quality/UI Approved, không regression mới. Final product39 tooling/77 web/13 API, docs58; editor giữ raw/reminder/identity qua loading/error, YAML audit607 keys cũ +106 thêm =713 và không mất key. Reports ignored `task-6-review-r1.md`, `task-6-fix-r1.md`, `task-6-review-r2.md` dưới `.superpowers/sdd/implementation-plan/`. Browser fixture UI không chứng minh lưu thật; nondefault native zoom/device/SR còn Not run. Các đoạn Pending bên dưới là lịch sử. Tiếp tục Task7 query/draft/persistence/recovery theo kế hoạch; full AC12/13/15 và Linux/TLS/operator thật chưa được suy đạt. Mọi subagent tối đa Sol/high, cấm Astra mọi trường hợp.

### Task 7: Query, draft và lưu thật không mất dữ liệu

**Files:** Create web `features/attendance/api/{attendance.ts,query-keys.ts,use-attendance-month.ts}`, `model/{attendance-draft.ts,use-attendance-draft.ts}`, `ui/save-feedback.tsx`; tests `model/attendance-draft.test.ts`, `api/use-attendance-month.test.tsx`, `tests/product-e2e/attendance-save.spec.ts`; Modify page/editor/transport.

**Interfaces:** Consumes task5 generated DTO/transport (gồm POST reconcile), task6 UI; produces `useAttendanceMonth(month: string)` và `useAttendanceDraft(snapshot: MonthDto)` trả draft owner tách query snapshot, submit/guard/conflict/reconcile. Base revision của draft không thay theo polling; draft có raw, value, reminder, targets, mode và source từ G1. Editor gửi patch-cell cho các field đã sửa trong một Save; recovery giữ giá trị phải gửi field tường minh sau quyết định người dùng, không bị client loại như no-op.

- [ ] Viết `refetch_keeps_raw_input_and_baseline`:15.000ms active refetch chỉ đổi snapshot, không đổi raw/màu/tập đích/revision draft; refocus/reconnect tải lại, auth/validation không retry vòng; first-load lỗi khác bảng trống, background lỗi có trạng thái độ mới.
- [ ] Viết `commit_response_loss_requires_reconciliation`, `conflict_preserves_draft_and_shows_current`, `context_change_requires_draft_decision`: request trùng bị chặn, không hiển thị đã lưu trước response; timeout không auto write retry, đọc lại rồi người dùng quyết định lưu với baseline mới; lỗi giữ raw input. Đổi ô/tháng/loại/lọc/đóng editor qua guard giữ/bỏ rõ, không áp sang đơn vị khác. Chạy RED.
- [ ] Viết `recovery_keep_current_sends_fencing_intent`, `reconcile_retains_employee_and_source_identity_after_month_exit`, `editor_save_commits_value_and_reminder_together` theo matrix ca6–9: read/abort/bỏ draft không hiện canceled/saved giả; eligible0/skip/source không fence; một Save đúng một request, Hủy0 request, validation/conflict không lưu nửa draft. PATCH mốc mất response đọc được ID ngoài tháng, missing giữ draft, không tự merge hoặc áp sang người khác. Employee form task4 dùng cùng reconcile recovery, create mất ID không retry theo tên.
- [ ] Triển khai Query interval15.000ms chỉ khi màn hình hoạt động theo G1, query key theo tháng/phiên, draft state riêng, feedback pending/saved/error/conflict/reconciling; chưa optimistic update. Logout xóa cache, dừng polling; hết phiên giữ draft trong owner phiên hiện tại để xử lý an toàn, không persist nhạy cảm vào localStorage và không tự gửi lại sau đổi account.
- [ ] Chạy GREEN unit và E2E web–API–DB: hai phiên1.5/2 công →phiên sau thấy1.5 và giữ2 draft; test giá trị/màu độc lập, API fail/timeout sau commit/reload. Readback độc lập chứng minh số/nhắc tồn tại; không dùng API mock thay E2E. Chạy browser trực tiếp theo BROWSER_TESTING.
- [ ] Review state/transport/concurrency UI snapshot; commit `feat: save attendance while preserving local drafts`.

### Task 8: Chọn rời, nhập vùng, fill và cảm ứng nhấn giữ

**Files:** Create web `model/{cell-selection.ts,fill-intent.ts,selection-gesture.ts}`, `ui/{selection-tools,bulk-editor,fill-handle}.tsx`, tests colocated mỗi model, `tests/product-e2e/{bulk-entry,selection-input}.spec.ts`; Modify grid/cell/editor/draft. Giữ lifecycle gesture/cancel đủ gần để đọc, đánh giá400/800 dòng theo SOURCE_NAVIGATION.

**Interfaces:** Consumes task7 draft submit/G1 WriteAttendanceDto. Produces `unionCells(a: CellKeyDto[], b: CellKeyDto[]): CellKeyDto[]`, `previewTargets(intent: WriteIntent, month: MonthDto): TargetPreview` (selected/eligible/skipped/changed, định nghĩa tại fill-intent.ts), `createSelectionGesture(options: GestureOptions): GestureController` có cancel/dispose và không tự submit.

- [ ] Viết selection/fill assertions: ba ô rời chỉ ba đích, bỏ một còn hai; vùng chồng dedupe, không thêm ô giữa; Ctrl/Cmd bấm/kéo, hai đầu và chạm; fill số/F lặp hai hướng, nguồn không ghi/nhắc không chép, đích giữ reminder. Default fill-empty giữ F/số, reminder-only vẫn trống; replace không bỏ CAS; skip N/— và báo đếm, không đích thì disable Áp dụng.
- [ ] Viết gesture assertions449ms chưa kích hoạt/450ms có,10px còn giữ/11px nhường pan; cancel/multitouch/blur/Esc/unmount thu hồi timer/capture/auto-scroll và phục hồi selection, giữ rồi thả không toggle bỏ ô. Raw draft dirty chặn gesture và không phát lại sau guard. Chạy RED trước implementation.
- [ ] Triển khai gesture/selection UI kế thừa hành vi mẫu: touch handle44px, thả chỉ preview, Áp dụng mới submit một batch; có cách không kéo, không khóa browser zoom hoặc cướp pan trước hold. Source ẩn/trống không khởi tạo fill; source revision đổi báo đối chiếu giữ draft, filter/tháng/loại đổi không áp tập cũ.
- [ ] Chạy GREEN unit/component, E2E batch một ô conflict→toàn bộ không ghi; hai phiên fill source change/target change→giữ draft và không tự force/retry. Kiểm browser chuột/bàn phím, cuộn sát mép, touch synthetic ghi đúng lớp; phần iPhone/Android thật chuyển task10, thiếu không gọi Verified.
- [ ] Kiểm recovery fill theo matrix ca7/8: nguồn bị clear rồi đổi mốc ra khỏi tháng vẫn được reconcile bằng key cũ, không bị tái thêm vào bảng; giữ draft và yêu cầu quyết định mới. Đích fill-empty bị loại và nguồn read-only không tăng revision, eligible0 không thành saved/fence; không tự đổi mode hoặc tạo thao tác reminder hàng loạt.
- [ ] Review độc lập gesture/lifecycle/batch final snapshot; commit `feat: support disjoint selection and repeat fill`.

### Task 9: Excel từ snapshot nhất quán với tổng công thức

**Files:** Create API `modules/attendance/export/{attendance-workbook.ts,attendance-export.service.ts}`, `attendance-workbook.test.ts`, `apps/api/test/attendance-export.integration.test.ts`; web `features/attendance/ui/export-button.tsx`; `tests/product-e2e/export.spec.ts`; Modify controller/DTO/OpenAPI.

**Interfaces:** Consumes `readMonth` snapshot server cùng luật tổng task5/G1; produces `buildAttendanceWorkbook(month: MonthDto): Promise<Buffer>` và API download xác thực; export chỉ dữ liệu đã lưu, không tự gửi draft trước tải.

- [ ] Viết assertions một worksheet, Công trên/Tăng ca dưới, tháng/ngày/thứ, numeric cells là số, F/N/— là text, trống/reminder-only giữ trống và màu. Mỗi tổng hàng/cột/từng phần là công thức SUM đúng phạm vi, cached result khớp tổng server và workbook yêu cầu recalc; đơn vị không gộp. Tên giả chứa `=`, `+`, tiếng Việt hoặc rất dài vẫn là text an toàn, không công thức do tên.
- [ ] Chạy RED; triển khai ExcelJS theo layout G1, snapshot nhất quán cả hai bảng trong khi có người sửa; không lấy browser cache/draft làm nguồn export. Button có pending/error/retry download, không báo thành công chỉ vì bắt đầu request.
- [ ] Chạy GREEN unit/integration và browser download, parse lại file để kiểm dữ liệu/formula/style + anonymous export bị từ chối. Mở trên reader Excel thật được ghi tên/version, sửa số để tổng tính lại đúng bảng và bảng còn lại giữ nguyên; không dùng ExcelJS đọc lại thay engine tính Excel. Chưa có reader ghi Not run gate AC09.
- [ ] Review export/auth/snapshot; commit `feat: export editable monthly attendance workbook`.

### Task 10: Kiểm xuyên suốt, accessibility, thiết bị và hiệu năng — G3

**Files:** Create `tests/product-e2e/{acceptance,two-sessions,recovery}.spec.ts`, `scripts/product/benchmark.mjs`, `playwright.product.config.ts`; Modify `technical/verification-matrix.md`, dossier validation và LOCAL_RUN. Evidence run-owned ignored, fixture chỉ nhân sự giả.

**Interfaces:** Consumes task2–9 app commands, G1 ngân sách/target, API readback; produces báo cáo AC từng lớp/snapshot, browser trace/request target đã che secret và device/reader matrix. Không tạo CI provider/remote tự chọn.

- [ ] Viết regression còn thiếu theo bảng coverage dưới; chạy RED khi có khoảng trống acceptance thực, sửa đúng module sở hữu với debugging/TDD. Không viết lại test để lặp implementation hoặc chạy lại mọi thứ vô hạn.
- [ ] Xác minh resource/target thật, migrate DB thử từ trống và baseline trước, seed hai account giả; chạy frozen install/lint/typecheck/unit/integration/contract/boundary/build và product E2E. Chạy pilot hồi quy khi tooling/shared config ảnh hưởng. Assert web gọi API sandbox, DB readback sau reload/kết nối mới.
- [ ] Dùng browser trực tiếp `preview_status`→`preview_open` khi cần→navigate/snapshot/locators, không chỉ headless fixture. Thử keyboard/Enter/Tab, focus/error/loading/empty, screen reader và contrast với tên dài/dữ liệu rỗng; ghi kết quả cụ thể, thư viện Radix không tự chứng minh accessibility.
- [ ] Thử iPhone và Android thật, ghi model/OS/browser: pan hai chiều, pinch/xoay/toàn màn hình/sticky, bàn phím, hold450ms/ngưỡng10px/fill/đa điểm/hủy/edge-scroll; thả chưa ghi, Áp dụng đọc lại đúng. Không có thiết bị hoặc trusted automation thì Not run; user chấp nhận HTML không thay evidence này.
- [ ] Benchmark dữ liệu giả20/200/1.000 theo ngân sách đã review task1: tải/render/scroll/nhập và memory cùng máy/browser. Đạt ngân sách mới kết luận; vượt thì profile và đề xuất sửa/engine qua review, không tự thêm virtualization làm hỏng zoom/selection. Ghi quy mô đã đo, không tuyên bố vô hạn.
- [ ] Đóng findings, check lại phạm vi ảnh hưởng và mời review độc lập full base..final SHA cùng spec/contract/evidence. Sau sửa cần reviewer xem tip mới theo QUALITY_GATES. Ghi thiếu quyền reviewer là Blocked; commit `test: verify product acceptance across real data flows` chỉ sau các check được báo đúng, không gọi sản phẩm Done khi còn gate bắt buộc.

### Task 11: Hồ sơ vận hành và bàn giao local — G4 chưa phải deploy

**Files:** Create `docs/operations/product-runbook.md`, `docs/operations/product-backup-restore.md`; Modify task INDEX/validation và READINESS đúng scope, không sửa lịch sử pilot thành evidence sản phẩm.

**Interfaces:** Consumes G3 evidence, schema/migrations/auth reset; produces hướng dẫn start/stop/update/reset/backup/restore theo target được duyệt và danh sách gate chưa đạt.

- [ ] Viết checklist target hosting/domain/TLS, cookie/CORS/CSRF, secrets, người phụ trách reset/xác minh/bàn giao mật khẩu, expiry/revoke, backup retention/restore và rollback migration; nêu lựa chọn cần quyết định trước vận hành, không tự invent target/người thật.
- [ ] Khi sandbox và quyền đã có: diễn tập backup/restore vào DB thử mới, kiểm identity trước mọi mutation, so count/giá trị/nhắc/tổng và auth policy sau restore. Ghi command/thời gian/result, failure path, không chỉ file backup tồn tại.
- [ ] Bàn giao local: commit/base..tip, AC Verified/Failed/Not run/Blocked, review/finding, cách chạy thực, resource đang giữ và next action. Chưa merge/push/deploy/cleanup evidence; tích hợp hoặc release chỉ sau quyền cụ thể và check target/smoke tương ứng.

## Lệnh kiểm dự kiến và ý nghĩa

Checkpoint viết plan chỉ có docs/whitespace. Task2 nay tạo/kiểm các lệnh dưới đây; trạng thái đúng scope ở cột cuối, không thay acceptance task sau. Runtime/engine/commands cụ thể theo [LOCAL_RUN](../../../agent/LOCAL_RUN.md).

| Lệnh | Nội dung/điều kiện đạt | Trạng thái Task2 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Cài tái lập pins G1 trong engine đã chọn, không đổi lockfile | Verified cả fresh node_modules offline |
| `pnpm run product:check` | lint + strict typecheck + unit/component + boundary/contract drift + build từng app, exit0 | Verified bootstrap/tooling17 +web2 +API2; component nghiệp vụ chưa có |
| `pnpm --filter @mkw/api test:integration` | HTTP/PostgreSQL run-owned, schema/permission/concurrency assertions đều đạt | Task3 auth12/12; cần owner record, Task4–5 nghiệp vụ chưa chạy |
| `pnpm --filter @mkw/web test --run` | Vitest/Testing Library/gesture clock, assertions GREEN | Verified2 transport HTTP/config; DOM/gesture Not run đến Task6–8 |
| `pnpm run product:contract:check` | Sinh snapshot/types vào artifact tạm, diff với tracked output không drift | Verified3.0.3 +generated web types, stale fixture bị chặn |
| `pnpm run product:test:e2e` | Playwright product config start/stop đúng resource, web→API→PostgreSQL readback, exit0 | Not run; staged exit2, cần Task10 |
| `pnpm run product:benchmark` | Script benchmark in cấu hình/dataset/kết quả so ngân sách G1; đạt theo số đo, không theo exit đơn lẻ | Not run; staged exit2, cần dữ liệu/UI Task10 |

Scripts start/stop/reset-fixture và env chính xác phải ghi từ task2 sau khi chạy thật; không sao chép port/lệnh pilot sang sản phẩm. npm pilot giữ hướng dẫn LOCAL_RUN và chứng minh hồi quy nếu root bị thay đổi. Mỗi RED ghi assertion fail mong đợi; lỗi prerequisite giữ Failed/Blocked môi trường, không gọi là RED nghiệp vụ.

## Coverage và tự review kế hoạch

| Đặc tả/AC | Task sở hữu kiểm chính |
| --- | --- |
| Mục1–2; AC01/19 | 1/3/10: scope, hai tài khoản ngang quyền, auth/reset không signup |
| Mục3,9; AC02/03/04/07/11/14/16/17/18 | 5/6/7/10: số/tổng/ký hiệu/màu, calendar/parser/persistence |
| Mục4; AC05/06/15 | 4/5/10: giao tháng, inclusive, bảo vệ dữ liệu xuyên tháng và request đua |
| Mục5–6; AC08/10/12/20 | 6/7/10: editor/bảng, draft/polling/lỗi/concurrency/touch/keyboard |
| Mục7; AC09 | 9/10: Excel numeric/style/formula/snapshot + reader thật |
| Mục8 | 1/2/3/5/10: ADR, pins/enforcement/contract/API/DB/build độc lập |
| Mục10/12 | 1/11: chi tiết kỹ thuật/vận hành/gate và giới hạn scope |
| Mục11/13; AC13/21/22 | 5/7/8/10: atomic batch, chọn rời/fill/guard/tập đích/source revision |
| Mục14; AC23 | 8/10: hold/timer/cancel/pan/pinch/thiết bị thật |

Tự review28/10/2026: đã đối chiếu14 mục/23 AC; giữ đề xuất trong bản viết thành quyết định sau approval nhưng API/schema/auth/version chưa có vẫn đi qua task1. Các interface minh họa thống nhất theo G1 trước downstream, không giả wire fields đã chốt. Năm Review Focus đều có test owner ở task3–10. Không đặt lại kiến trúc hoặc UI đã duyệt; kế hoạch chia deliverable kiểm riêng trong cùng một sản phẩm, không viết thân implementation. Cập nhật thực thi: checkbox Task1 phản ánh phần thiết kế đã soạn, G1 chưa duyệt; task2–11 chưa chạy. Product tests/compatibility/thiết bị/reader/review độc lập vẫn **Not run**.

## Bàn giao review

Kế hoạch đã duyệt, phương pháp inline; đã soạn bộ thiết kế Task1 ở các link trên. Bước tiếp: người dùng review G1 theo gate đã duyệt trước phần code phụ thuộc, không review lại plan/kiến trúc/UI. Reviewer độc lập cho code/tooling/auth/DB và quyền dispatch vẫn cần đúng scope khi đến gate; chưa cài/code Task2 hoặc tích hợp/release.
