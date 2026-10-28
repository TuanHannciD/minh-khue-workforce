# Ma trận kiểm chứng và ngân sách — thiết kế cho G1

Ngày28/10/2026. **Proposed for G1 review**, không báo cáo test sản phẩm đã chạy. Nguồn: [design](../design.md), [API](api-contract.md), [DB](data-model.md), [auth](auth-session.md), [manifest](toolchain-manifest.md). Kế hoạch đã duyệt, các ngân sách kỹ thuật dưới cần review G1. Chỉ check Markdown/đọc metadata đã thực hiện ở Task1.

## 1. Lớp bằng chứng và tài nguyên

Unit/component dùng fixture giả chỉ chứng minh lớp đó; integration dùng PostgreSQL17.11 thật và target sandbox được xác minh; E2E phải web→API đó→DB đó, không API mock thay readback. Browser trực tiếp theo BROWSER_TESTING, trusted touch/Excel reader là gate riêng. Không nâng trạng thái từ HTML prototype221 assertions thành AC sản phẩm Verified.

Mỗi run ghi runId/owner/base..tip, runtime24.22.1, pnpm12.15.0, OS/CPU/RAM/browser/version, web/API origin và PID thuộc run, DB server_version/database/schema identity mới, seed hai account giả và fixture IDs cố định, browser context không dùng login người dùng. Trước mutation xác minh identity thật từ connection và allowlist run, không chỉ env flag. Report `.agent-runs/MKW-PRODUCT-001/<run-id>/`, ledger `.superpowers/sdd/implementation-plan/progress.md`; trace/log che cookie/password/nhân sự, giữ evidence khi handoff. Cleanup chỉ resource đã kiểm ownership, không reset/destroy dữ liệu có sẵn.

Thiết bị/reader hiện chưa được cung cấp hoặc kiểm: iPhone Safari thật, Android Chrome thật, desktop browser, Microsoft Excel desktop reader. Các tên này là nhóm cần kiểm, chưa model/OS/version hoặc tài nguyên đã có. Nếu runtime không có trusted touch/reader thì ghi Not run và để gate cần nó mở; không xin lại approval plan, không ghi user đã thử thiết bị nào từ câu “Đã đạt” trước đây. Excel reader thay thế phải ghi tên/version, không gọi kết quả LibreOffice là đã kiểm Microsoft Excel.

## 2. Script contract cho task2 tạo

Các lệnh dưới **chưa tồn tại hoặc chạy** trừ check docs/whitespace. Task2 tạo scripts cùng tên, ghi exact start/stop/config sau kiểm; không sao chép port/DB path từ pilot. Root `npm run check` và `npm run test:e2e` hiện thuộc pilot, phải chạy Node22.12.0 khi check hồi quy chuyển tooling, không gọi đó là product check.

| Command dự kiến | Gate/task | Kết quả đạt |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | task2/10 | Lock/engines/required peers đúng manifest, tái lập không sửa lock |
| `pnpm run product:check` | task2–10 | lint/strict types/unit/component/boundary/contract/build cả hai app exit0 |
| `pnpm --filter @mkw/api test:integration` | task3/4/5/9 | Supertest/PostgreSQL sandbox đúng target, tất cả quyền/số/CAS/migration assertions đạt |
| `pnpm --filter @mkw/web test --run` | task6–8 | Vitest/Testing Library, parser/draft/gesture clock deterministic đạt |
| `pnpm run product:contract:check` | task2–10 | Generate OpenAPI/types artifact tạm, diff zero; fixture stale chủ ý fail |
| `pnpm run product:test:e2e` | task7–10 | Playwright product config + readback DB/API độc lập, không chỉ screenshot |
| `pnpm run product:benchmark` | task10 | Ghi dataset/máy/metrics và so ngân sách đã review, không chỉ exit0 |
| `npm run check:docs` | Task1 và docs sau | UTF-8/links/anchors/fences, không thay review nghiệp vụ |
| `git diff --check` | mọi task | Không lỗi whitespace, kiểm cả staged khi commit |

RED từng hành vi quan trọng trước code, ghi assertion fail đúng lý do rồi GREEN; lỗi package/DB prerequisite là Failed/Blocked môi trường, không tự coi RED nghiệp vụ. Không viết test cho câu chữ tài liệu. Sau đổi chỉ chạy lại check ảnh hưởng và suite cần cho gate final, không mở rộng vô hạn.

## 3. AC và test owner

| AC | Task / test chính | Assertion bắt buộc | Lớp cuối cần cho Verified toàn AC |
| --- | --- | --- | --- |
| 01 | 3 auth.integration,10 acceptance | 2 account ngang quyền, anonymous tháng/ghi/export401, không signup/duyệt | API+DB+hai browser context |
| 02 | 5 attendance.integration,7 attendance-save | Cùng ngày1.5 công/2 giờ đọc lại, tổng riêng, connection mới/reload giữ số | E2E+persistence |
| 03 | 5 totals/changes,7 save,9 export | Nhắc work/overtime độc lập, đổi nhắc không đổi số/tổng, reload/xlsx giữ | E2E+DB+xlsx |
| 04 | 5 values,6 grid,9 export | F/trống/N/— khác nhau, không tổng giả/0 hoặc F overtime | API+DB+UI+xlsx |
| 05 | 4 employees,6 month-view | Thêm20/10 chọn15/10 →1–14 N, ngày15 trống, không dùng createAt | E2E+DB |
| 06 | 4 employees,6 month-view | Kết thúc20/10 →20 editable,21–31 —,11 vắng, lịch sử10 giữ | E2E+DB |
| 07 | 4 dates,5 totals,6 month-view | Tháng28/29/30/31 và thứ đúng, leap1900 false/2000 true, tổng hàng/cột | Unit+API+UI |
| 08 | 6/8/10 selection-input/device | Sticky, pan/pinch/xoay/mở rộng, phone nhập/màu, desktop Enter/Tab | Trusted iPhone+Android+desktop |
| 09 | 9 workbook/export,10 reader | 1 sheet2 bảng, typed cells/formulas/cached totals, reader sửa tính lại đúng bảng | API+download+reader thật |
| 10 | 7 recovery,10 two-sessions | Pending không saved giả, network/5xx/timeout giữ draft, DB reload còn dữ liệu | E2E+DB+fault injection |
| 11 | 5 values,6 parser/editor | 5 quick choices;3 work/3.5 overtime,3.25 lỗi giữ raw không làm tròn | Unit+UI+API+DB |
| 12 | 5 concurrency,7 two sessions | A1.5/B2 trên rev cũ →B conflict thấy1.5, không auto overwrite | Barrier PostgreSQL+2 browser |
| 13 | 5 batch rollback,8 bulk-entry | 1 conflict làm cả batch không ghi; draft/mode/targets giữ, không retry | Barrier DB+2 browser |
| 14 | 5 values,7/8 save | 0/0,0/0.0 work→F, nhắc giữ/tổng0; overtime không F, skip/fill/replace | Parser+API+DB+UI |
| 15 | 4 excluded dates,5 race | Sửa vào/nghỉ loại number/F/overtime/reminder-only tháng khác bị chặn; write đua vẫn invariant | Barrier DB+form+readback |
| 16 | 5 values,6/8 editor | Work29.5/30 nhận,30.5/31 từ chối nguyên batch, raw giữ, total tháng>30 hợp lệ | API+DB+UI |
| 17 | 5 values,6/8 editor | Overtime23.5/24 nhận,24.5/25 từ chối, không ảnh hưởng công | API+DB+UI |
| 18 | 6 parser,5 validation,7/8 save |3,5/3.5 cùng3.5 hiển thị phẩy,3,25/3.25 lỗi giữ đúng raw, wire không nhận string số | Unit+UI+API+DB |
| 19 | 3 reset/auth,11 runbook | Operator reset fixture, revoke session, không route reset/admin/email/SMS; vận hành xác minh thật riêng | Auth integration+runbook diễn tập |
| 20 | 7 query/draft,10 recovery | 15.000ms active read mới, dirty baseline giữ, offline/refocus/hết phiên feedback đúng | Controlled clock+2 browser+API/DB |
| 21 | 8 selection,10 browser |3 ô rời chỉ3, bỏ1 còn2, hợp vùng trùng1 lần, multi-employee/day và keyboard | Unit+trusted mouse/keyboard/touch+DB |
| 22 | 8 fill/bulk,5 source CAS | Fill số/F hai hướng, source read-only, nhắc đích giữ, cancel chưa ghi, source stale conflict | Unit+API/DB+trusted inputs |
| 23 | 8 gesture,10 device |449/450ms,10/11px, pan/pinch/cancel/blur/edge-scroll, thả preview/Áp dụng lưu | Synthetic+trusted iPhone/Android riêng |

Mọi AC toàn sản phẩm ở bảng: **Not run**. Các test có nhiều lớp được báo riêng, không lấy pass unit thay thiết bị hoặc persistence. Case API unknown field/malformed/empty targets/duplicate/mixed month-kind/false revision/body413 thuộc task5, UI giữ draft tương ứng ở task7/8. Bị skip ngoài mốc không được mở quyền nhập N/—.

## 4. Ca failure và cạnh tranh có kết quả cụ thể

1. **Timeout sau commit:** fault injector cắt response sau DB commit; GET connection mới đọc giá trị mới. UI giữ draft/trạng thái chưa xác định, không tự gửi lần2; người dùng đối chiếu trước intent mới. GET trước late commit không làm UI kết luận rollback; late commit sau baseline mới phải bị CAS phát hiện khi lưu tiếp.
2. **Sửa mốc vs ô:** hai PostgreSQL connections barrier trước lock; lần lượt thử cả order cho value number/F/reminder-only ở tháng khác. Kết thúc không có data ngoài interval, không xóa nhắc, mốc hoặc toàn write bị từ chối. Không “pass” chỉ vì hai request tình cờ tuần tự.
3. **Fill nguồn và tập đích stale:** source số không đổi nhưng revision/nhắc đổi vẫn conflict; nguồn lọc ẩn không khởi tạo; target fill-empty từ trống→có dữ liệu không được âm thầm bỏ qua sau refetch rồi ghi các ô khác. Mọi đích không đổi bởi batch bị từ chối.
4. **Polling/context/auth:** draft raw sai3,25 giữ nguyên qua15s/refocus; baseline không đổi. Đổi lọc/tháng/loại có guard, logout clear cache, hết phiên dừng polling/mutation; account khác không nhận draft cũ. Lỗi initial load khác zero employees, background lỗi hiển thị độ mới.
5. **Gesture:** clock449/450, khoảng10/11px và di chuyển về lại không rearm; pointercancel/đa điểm/noncancelable pan/unmount hủy timer/capture/auto-scroll, rollback selection. Cuộn ngay không chọn, hold rồi thả không toggle bỏ; touch đúng media coarse, không chỉ resize375px. Fullscreen in-page không khóa zoom.

Auth quota/CSRF/cookie/hash/reset-vs-write theo auth-session; test hai storage clients và nhiều app instance để không ngầm dựa memory limiter. Input tên dài/trùng/Unicode hoặc bắt đầu=,+,-,@ xuất thành string, không formula injection. API DTO JSON finite number/unknown/null validate runtime, không chỉ TypeScript.

## 5. Ngân sách hiệu năng đề xuất để review

Dataset giả20/200/1.000 nhân sự, tháng31 ngày, cả hai loại, tỷ lệ dữ liệu/nhắc giống nhau; không render hàng nghìn input luôn mở. Dùng production build, cold/warm tách, tối thiểu5 lần/metric và báo median/p95 (p95 với ít mẫu chỉ tham khảo; interactive samples>=30); máy/thiết bị/network profile ghi cụ thể, không so số giữa hai máy rồi kết luận regression. Không coi1.000 là trần scope hoặc cam kết mọi máy đều đạt.

| Metric | Desktop thử cùng máy | Điện thoại thật trong matrix |
| --- | --- | --- |
| API tháng200 /1.000 (warm DB, sandbox) | p95<=500ms /<=1.500ms | Server cùng phép đo, thêm RTT riêng |
| Load200 đến bảng dùng được (cold route) | <=2s | <=3s cùng mạng local bình thường |
| Load1.000 đến bảng dùng được | <=5s | <=7s; nếu không đạt thì gate performance mở |
| Mở editor/keypress feedback ở200/1.000 | p95<=100ms /<=150ms | p95<=150ms /<=200ms |
| Scroll/drag đoạn5s | p95 frame interval<=33ms, không freeze>200ms | Cùng ngưỡng, ghi thermal/battery/memory |
| Heap sau10 lần đổi tháng/đóng editor | Không tăng đơn điệu do leaked listeners/timers; post-GC tăng<=20% baseline ổn định | Ghi metric nếu browser cho phép, thiếu heap API ghi Not run không tự fake |

Đây là ngân sách kỹ thuật **Proposed**, cần review G1; chưa benchmark. Nếu semantic table vượt ngưỡng, profile owner DOM/query/selection trước; thay engine/virtualization phải trình ảnh hưởng zoom/sticky/selection/accessibility và test lại, không tự cài grid engine để che lỗi. Tên dài/trống/month28/29/31 và dataset tìm/lọc vẫn phải đúng sau tối ưu.

## 6. Review và tiêu chí handoff

Task1 self-review tài liệu + người dùng review G1; chưa review độc lập code vì chưa code. G2/G3 code/tooling/auth/migration cần reviewer độc lập read-only với full SHA base..tip, requirements/contract, diff/tests/evidence và findings severity. Dispatch chưa được cấp; ghi Blocked đúng gate khi đến scope cần reviewer, không giả agent đã chạy. Reviewer xem tip mới sau sửa theo QUALITY_GATES.

Task11 backup/restore vào DB thử mới, so counts/values/mốc/nhắc/tổng và session revoke sau restore; target/secret/vận hành thật chưa có quyền. Done local, integrated và released khác nhau. Bàn giao nêu rõ Verified lớp nào, Failed/Not run/Blocked gì, nguồn gỡ gate và resource giữ lại; không biến ngoại lệ thành pass.
