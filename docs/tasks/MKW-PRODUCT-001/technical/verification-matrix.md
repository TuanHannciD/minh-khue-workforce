# Ma trận kiểm chứng và ngân sách — thiết kế cho G1

## DB authority — acceptance/gate hiện hành02/11/2026

[Decision Accepted](../decisions.md#db-authority--accepted02112026) supersede exact-JS parity prerequisite và route runtime-assessment01/11, không sửa evidence cũ. PG17.11/ICU67.1 lower/order là authority chung page/fullmonth/Excel, canonical equivalent nondeterministic+ID; q ECMAScript trim rồi DB lower/literal C; ID raw case-sensitive; web không resort. TJE uppercase query126/lowercase127/order126,127 đã chấp nhận; không normalize/unaccent/fuzzy hoặc hạn chế tên.

| Gate/owner còn lại | Bằng chứng phải có | Trạng thái02/11 |
| --- | --- | --- |
| Plan delta / main reviewer | Exact sync BASE..TIP independent spec+plan review, fix/re-review tip trước code; user choice/plan approval đã có, không hỏi lại | R1 READY0C/0I/0M tại47f26cfb3aea58e24486e48b15aa8ed18a922d2f |
| Task1 DB-policy continuation | Fixed28 lower/15 query lower+IDs/full28 order/canonical+duplicate ties; actual PG17.11/loaded ICU67.1/i/vi/nondeterministic/version153.14.37; provenance/release | PINNED/COMPLETE bounded at `321d488f041e6d5386adea9f86ca8749ef896144`; R1 READY TO PIN/0C/0I/0M, report `.superpowers/sdd/server-pagination-implementation-plan/task-1-db-policy-review-r1.md`; retained6/6/0 mismatch/90 mutations/deterministic rejection; SQL-only resources released, DB/data/evidence retained; wrapper exit−1 Not verified |
| Historical JS diagnostic | Old28/15 oracle/checker và FAIL4/FAIL5/PASS26/13 artifacts immutable; không rewrite expected để PASS hoặc đưa old SQL-vs-JS vào required-green command mới | Failed lịch sử giữ nguyên |
| Task3 SQL/page order owner | Fixed DB oracle, boundary/tie negatives, same-snapshot membership/count/IDs/cells/global totals/corruption and SQL bounded path | Implemented/author verified từ BASE1ab22fb: page7/7, policy6/6, G1 attendance61/61; actual HTTP scoped invalidation/ports/pools, collation migration và preserved baseline. Main fresh independent review pending; [validation](../validation.md#task3--sql-page-snapshot-02112026) |
| Task4 fullmonth/Excel order | Cùng `buildEmployeeMonthRead(...).order` Task3; normal page/full/Excel theo fixed DB oracle, independent negative preservation RED chống local resort, snapshot đóng trước workbook; không q/page export | Task1 satisfied; gated trên3 reviewed PASS |
| Task8 actual API/PG/browser/Excel | Reuse DB oracle, snapshot races/unknown-write/CAS/auth/POST-read matcher/actual HTTP rotation2/session0 before close + apps/ports/pools; policy-specific integration không JS equality | Task1/7 satisfied; gated trên3/4 reviewed PASS |
| Task9 performance/native/final | Reviewed policyId/capability/hash không drift,20/200/1000 logical ×25/50×hai kinds, current budgets/raw metrics/native/SR/reader/final whole-branch review; no count-only PASS | Task1 satisfied; gated trên8; missing capabilities NR/Blocked |

Tasks2/5/6/7 reviewed complete giữ nguyên tại [validation](../validation.md#unicode-parity--checkpoint-bền-vững-sau-task7-r2-01112026). Task1 bounded capability đã reviewed/pinned; Task3 implemented/author verified, chờ independent review; Task4 vẫn chờ3 reviewed PASS, Task8 chờ3/4/7 (7 đã complete), Task9 chờ8 và các gate riêng. Không claim Task3/4/8/9 complete. Old JS FAIL4/FAIL5/PASS26/13 hashes và artifacts giữ nguyên. Startup wrapper exit−1 và launch-script fix vẫn **Not verified**. Task3 scoped page HTTP/SQL/cleanup verified riêng tại validation; fullmonth/Excel order Task4, snapshot races Task8, browser/performance/native/SR/reader/final whole-branch gates chưa từ đó đạt. Existing Task10 identity/ownership/cleanup và invariant/security/write/export/G4/dependency gates giữ nguyên.

## Task1 fix R1 — prerequisite Failed, 01/11/2026

Actual SQL xác nhận counterexample hợp lệ U+1C89/U+1C8A: fixed JS oracle28 tên/15 queries pin trước SQL, giữ26/13 cũ và relative order. Candidate ICU `vi`/`deterministic=false` **FAIL4**: order126/127 đảo với JS, lower capital không thành small, mỗi query SQL chỉ khớp một ID thay vì `[127,126]`; deterministic **FAIL5** gồm canonical-equivalence. PASS26/13 cũ vẫn là lịch sử hữu hạn đúng scope. Full artifact/actual observations/provenance/log tại [validation R1](../validation.md#task1-fix-r1--sql-xác-nhận-fail-01112026); không sửa expected theo SQL hoặc claim Task1 complete.

M1 **Verified**:6 mock boundaries mới dùng `options.exports`, lifecycle24/24 exit0, giữ meaningful assertions và ExperimentalWarning, hết namedExports DeprecationWarning. SQL-only cleanup **Verified** User0/Session0/Employee28, not-provisioned/rotated0/session-count null, own run/cluster pools released, remaining run connections0; exact own PG stopped/status3/no PID/no pidfile/no listener/TCP refused, DB/data/evidence retained. HTTP live **Not run**; broad product checks không rerun vì scope fixture/evidence và mock-option, không product source.

**SQL Tasks3/4/8/9 gated; Tasks2/5/6/7 độc lập tiếp tục qua main.** [API8](api-contract.md#task1--prerequisite-fail-sau-r1-chưa-pin-candidate) sở hữu đề xuất Pending: ưu tiên capability PG/ICU tương thích Node78.3/Unicode17 và kiểm lại lower/order/ties (cần quyền provision/runtime tương lai); hoặc contract đổi sang semantics PG67.1, chấp nhận các kết quả khác đã đo (cần người dùng duyệt observable delta). Stored Node search key đơn lẻ không sửa order. Không phương án nào Accepted/implemented; main owns fresh independent review và quyết định tiếp theo.

## Task1 server pagination — checkpoint01/11/2026

Checkpoint lịch sử trước R1, trạng thái hiện hành ở trên. Scoped prerequisite đã chạy trên Task10 fake sandbox: PG17.11/ICU67.1, Node24.22.1/ICU78.3. Fixed oracle26 names/13 queries được pin trước SQL; candidate ICU `vi`, `deterministic=false`, collversion/actualVersion153.14.37 **PASS0 mismatches**; deterministic candidate **FAIL2** (canonical-equivalent ordering/equality), giữ nguyên evidence. Policy candidate/expressions và gate tại [API8](api-contract.md#task1--prerequisite-fail-sau-r1-chưa-pin-candidate); chưa migration/product read/full/export sort mới. Không nâng historical fullDOM/performance/native/SR thành pass.

New scoped `startAttendanceReadSandbox` có SQL-only và HTTP lifecycle fault tests thực thi owner qua module mocks ở resource boundaries: normal/partial provision/acquisition/migration/login, rotate cả hai, verify trước disconnect, app DI Database vẫn disconnect khi close lỗi, mọi release/metadata attempt độc lập, original+cleanup errors và concurrent/idempotent stop. SQL-only live **Verified**: User0/Session0/Employee26, artifact not-provisioned/rotated0/session-count null, run/cluster pools ended, own PG stopped/data retained. HTTP live rotation/session0/port closure **Not run**, chỉ mocked proof; tests không waive live gate Task3/8. Commands/evidence/giới hạn tại [validation](../validation.md#task1-server-pagination--capabilityparity-và-scoped-owner-01112026). Main fresh independent review oracle/policy trên exact BASE..TIP trước downstream SQL Tasks3/4/8/9.

## Phân trang server — acceptance hiện hành01/11/2026

Người dùng **“Tôi chốt bản thiết kế này”**: [design15](../design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026) Accepted server pagination/global name-ID search/25 default/50 option/jump/page-local rectangle-disjoint-fill/active-page15s/fullmonth totals-Excel và **1000 nhân sự logical qua trang**. [Plan hiện có](server-pagination-implementation-plan.md) Approved01/11, amendment02/11 Pending independent review trước code, không lặp user plan approval. Read SQL/DB-policy/performance/browser mới **Not run**. Checkpoints bên dưới là lịch sử, không competing workload hiện hành và không được xóa: fullDOM1000 canonical Failed p9566,6/max333,3>33/200; I3/G3 còn mở, G4/dependency/Task9 M1/M2 và native phones/SR/phoneperf chưa clearance. Task9 reader evidence cũ giữ scope cũ, không proof export order mới.

| Acceptance/risk | Owner plan/test tương lai | Kết quả bắt buộc |
| --- | --- | --- |
| Prerequisite collation/search (supersede exact JS theo02/11) | Task1 `employee-read-db-policy.integration.test.mjs` | Actual sandbox identity/PG17.11/ICU67.1/provider/locale/determinism/version/actualVersion + fixed DB-policy28/15 oracle trước SQL; all lower/query IDs/order/canonical+duplicate ties0 mismatches và independent review trước dependent SQL. Không so Intl để quyết PASS, không rewrite old JS diagnostic; FAIL/unavailable giữ3/4/8/9 gated. Tasks2/5/6/7 reviewed complete, không replay |
| AC24 bounded read | Tasks2–3 `attendance-page.contract.test.mjs`, `attendance-page.integration.test.mjs` | Defaults/strict400/auth401/Origin403/body413/415/no-store; membership/global literal search/stable order/zero/clamp/counts; max25/50 employees,1550/3100 snapshots ở31 ngày, page row totals và fullmonth totals đúng SQL độc lập |
| AC24/26 snapshot | Tasks3/8 `attendance-page-races.integration.test.mjs` | Count/IDs/cells/totals/fetchedAt cùng READ ONLY REPEATABLE READ dưới insert/rename/mốc/write barrier; offpage/out-of-membership corruption503, không che lỗi; tombstone/revision giữ; read không fence |
| AC20/25 query lifecycle | Task5 `use-attendance-page.test.tsx`, `page-view.test.ts` | Desired/displayed tách, late/abort/epoch/session, active visible15000ms, inactive0 cache,4xx dừng/5xx2 retry1s/3s, clamp canonical key một active timer, namespace invalidation đúng; fetchedAt/footer cùng displayed envelope |
| AC10/12/13/21–23/25 | Task6 model/guard/gesture tests + Task8 `pagination.spec.ts` | Raw3,25/custom/error/mode/reminder/frozen source-target-employee revisions giữ qua context/poll; pending/reconciling khóa; page-local/no hidden writes/no split batch; offpage CAS409 rollback, original-ID unknown reconcile/fence đúng ca6–9 G1 |
| AC08/24/25 UI | Task7 pager/page/grid tests; Tasks8/9 browser/device | Search debounce300/IME/Enter/jump/size reset/zero/error/busy/read-only/focus/Tab boundary/caption/labels/44px;450ms/10px native pan-pinch-cancel, sticky zoom/page edges; SR/native evidence riêng |
| AC03/04/07/09/26 | Tasks4/8 export integration + `export.spec.ts` | Full GET/Excel không nhận q/page, same ordered IDs q rỗng, full totals/typed F/N/—/reminder/SUM/caches; transaction đóng trước build, reader edit/recalc thật riêng |
| AC26 performance | Task9 paginated production benchmark |20/200/1000 logical ×31×2 kinds, page25/50, deep jump/search miss/hit/offpage total; bounded API/render nhưng đo count/aggregate/invariant DB cost riêng; metrics/thresholds dưới |

### Ánh xạ ngân sách và page-search feedback

Budget G1 giữ nguyên,200/1000 là **dataset logical**, không số rows DOM. Chạy cả pageSize25/50, cả work/overtime, production cùng máy1280×800/loopback/no throttle, density như baseline, không profile-reuse samples cũ. API/cold/warm/render tối thiểu5 mỗi cấu hình, editor/input/page/search feedback ít nhất30, scroll/drag5×5s, heap2 warmups +10 post-GC cycles. Raw finite/nonnegative, median chuẩn/nearest-rank p95/max; missing metric/prerequisite không PASS.20 API/load là NO_BUDGET/report-only; không tự lấy200 làm yêu cầu20.

| Metric | Desktop200 /1000 | Phone thật200 /1000 | Nguồn/trạng thái |
| --- | --- | --- | --- |
| API read trang warm DB | p95≤500/1500ms | Cùng server, RTT riêng | Ánh xạ budget API tháng G1 sang endpoint editing page mới, gồm DB global work; GET fullmonth đo riêng giữ budget cũ khi kiểm consumer hỗ trợ |
| Cold route đến bảng dùng được | ≤2000/5000ms | ≤3000/7000ms | Giữ load budget G1, dataset logical25/50 page đều phải đạt |
| Editor và input feedback | p95≤100/150ms | p95≤150/200ms | Giữ G1, đo raw update và editor usable; two-RAF chỉ proxy paint opportunity |
| Scroll/drag5s | p95 frame≤33ms, max≤200ms | Cùng ngưỡng | Giữ G1; từng size/kind/pageSize, cả page edges/tên dài/sticky/zoom geometry |
| Heap10 cycles sau2 warmups | tăng≤20%, không monotonic leak | Đo nếu browser có API; thiếu NR | Giữ G1; thêm page/search/size cycles và kiểm inactive cache/listeners/timers, không chỉ heap nhỏ |
| Page/search busy feedback sau commit criteria | p95≤100/150ms | p95≤150/200ms | **Proposed technical check**, dùng input budget làm trần hiển thị busy; không product threshold mới đã được user duyệt |
| Page/search đến đúng envelope editable, từ dispatch | p95≤2000/5000ms | p95≤3000/7000ms | **Proposed technical check**, mapping load budget cho transition; phải review trước đo, không giấu latency vì giữ rows cũ |
| Search từ ký tự cuối đến kết quả usable | p95≤2300/5300ms | p95≤3300/7300ms | **Proposed technical check** = debounce300 + transition; Enter dùng2000/5000 hoặc3000/7000, IME clock bắt đầu compositionend; pause chờ guard/người dùng đo riêng |

Những Proposed technical checks là đề xuất đo trong plan, không sửa ngân sách đã duyệt hoặc tự claim approval. Task9 chỉ thực thi sau plan review/approval bao phủ mapping này; nếu reviewer cần đổi tiêu chí ghi delta trước run. Footer/tổng/refetch chưa có latency budget riêng thì đo theo page response, không gắn một SLA nghiệp vụ mới. Export fullmonth snapshot/read/serialization/download bytes/peak memory/timing phải đo riêng; không gán budget500/1500ms API page cho toàn workbook, không coi bounded payload giải được aggregate SQL. Query plan EXPLAIN trên fake DB, count/global aggregate/invariant/deep OFFSET cost ghi riêng; không thêm index/dependency không căn cứ.

Plan Tasks8–9 xác minh actual built web–API–PG, SQL độc lập, snapshot races, Excel và reviewed DB-policy consistency pin; native iPhone/Android/browser UI zoom/SR/reader thật là từng gate. Thiếu prerequisite/device/runtime: **Not run/Blocked** đúng lớp, independent phần có thể tiếp tục; không hứa có thiết bị mới hoặc clear I3/G3 từ count nhỏ. Final whole-branch independent review trên SHA cuối + business regression/G4/Task9 concerns vẫn bắt buộc trước product Done.

## Task10 fix R1 — checkpoint hiện hành, 30/10/2026

Budgets G1 không đổi. Fresh full `task10-fix-r1/benchmark-run-a081eb77-9957-483b-8a73-695ff7fb01bb.json` là một invocation20/200/1000 trên CSS cuối, production Chromium156/1280×800 trên cùng máy; clock RAF corrected, mọi raw sample finite/nonnegative, summaries/checks recompute verified tại `full-benchmark-validation.json`. API/cold/warm/render mỗi loại5, editor31/input30, scroll5×5s (1503/1488/538 intervals), heap baseline+10 post-GC sau2 warmups. UI C hiện31.000 cell components ở1000 người, projection62.000 logical cells. Two-RAF feedback chỉ là paint-opportunity proxy.

| Người | API p95 ms | Cold p95 ms | Editor/input p95 ms | Scroll p95/max ms | Heap growth, không monotonic | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 27,52 (NO_BUDGET) | 191,18 (NO_BUDGET) | 28 / 31,1 | 16,7 / 50 | +5,38294% | PASS scoped |
| 200 | 107,21 | 465,53 | 31,1 / 30,4 | 16,8 / 116,8 | +0,94733% | PASS scoped |
| 1000 | 443,12 | 1546,83 | 121 / 61,3 | 66,6 / 333,3 | +0,18622% | Failed scroll>33/max>200 |

Raw editor regression không projection/render toàn bảng; pending/conflict/frozen polling CAS/latest callbacks và actual persistence/recovery/bulk/gesture suites đạt. Full product50 tooling/165 web/16 API, actual E2E33 nhóm + export; chi tiết lệnh/bằng chứng tại [validation](../validation.md). CSS chỉ position reminder/fill anchors; actual T3 desktop/mobile viewport giữ icon/handle trong source và sticky. Latest scroll trace5s có Paint2604,49ms/PrePaint1315,77ms/Layerize560,24ms; runtime compositor candidate vẫn p95=33,4>33, không adopt hoặc làm tròn thành pass. Next supported step cần review kiến trúc frozen panes/paint tree/windowing và zoom/sticky/selection/a11y; không tự triển khai ngoài approved scope. G3 **Failed/Not run**, I3 scroll1000 chưa clearance; main R2 exact fix tip Pending. Phone/native devices/SR vẫn NR, không thay bằng viewport hoặc synthetic touch. Phase1 trước CSS và checkpoint Task10 cũ bên dưới giữ lịch sử, không là current performance.

## Task10 review R1 — giới hạn evidence lịch sử

Review R1 phát hiện scroll200/1000 trong `task10-acceptance/benchmark-final.json` có interval đầu âm và profile reuse không validate. Phạm vi scroll này **Invalid/Failed**, không được dùng làm benchmark hợp lệ; API/load/editor/input và corrected heap độc lập vẫn có giá trị scoped theo provenance. Median N chẵn trước đây dùng upper middle; artifact mới `task10-fix-r1/historical-recomputed.json` tính mean hai phần tử giữa từ raw hợp lệ, giữ nguyên bytes cũ, không bỏ negative samples để hợp thức hóa scroll. Owner label Task7 trong historical two-session manifest sai metadata; không có bằng chứng target DB sai. Bản sửa/rerun mới cập nhật tại validation; G3 và independent main R2 vẫn mở.

## Checkpoint Task10 — bằng chứng từng lớp, G3 chưa đạt, 29/10/2026

Nguồn budget G1 đã duyệt vẫn binding; các chữ Proposed/Not run ở checkpoint thiết kế bên dưới là lịch sử. Evidence root `.agent-runs/MKW-PRODUCT-001/task10-acceptance/`; commands/runtime/metric chi tiết tại [validation](../validation.md). V = Verified đúng lớp, NR = Not run. Không suy V API/unit thành V thiết bị hoặc toàn sản phẩm. Main exact-range independent review Pending; Task10 **DONE_WITH_CONCERNS**.

| AC | Unit/component/contract | API + PostgreSQL thật | Built web + SQL/reload | Device/reader và giới hạn |
| --- | --- | --- | --- | --- |
| 01 | V auth | V hai account/401/quyền/reset | V hai browser contexts/anonymous401 | Desktop Chromium156; T3 Chrome154 |
| 02 | V kind/totals | V số công/giờ độc lập | V lưu/reload/new SQL pool | Desktop |
| 03 | V reminder/editor/export | V atomic value+reminder/totals | V reload/export và source/destination giữ nhắc | Excel engine Task9 V |
| 04 | V F/blank/N/— | V values/totals | V UI/SQL/xlsx typed cells | Excel engine Task9 V |
| 05 | V interval | V selected startDate | V form15/10,14 N,15 trống; không createAt | Desktop |
| 06 | V interval | V end inclusive/history | V form20/10 editable,21 —,11 vắng,10 giữ | Desktop |
| 07 | V Gregorian/weekday/totals | V28/29/30/31,1900/2000 | V API+rendered day counts và SQL totals | Desktop |
| 08 | V keyboard/sticky/input models | Không riêng assertion API | V Enter/Tab, sticky hai chiều/in-page expanded | iPhone/Android native pan/pinch/zoom/rotation NR; AC chưa đủ |
| 09 | V workbook/formulas/caches | V closed snapshot/auth/export | V browser download/draft không ghi | V Microsoft Excel16.0.20527.20088 COM edit/recalc Task9; interactive UI/reader khác NR |
| 10 | V unknown/no-op/reconcile | V barrier/fence/explicit ID | V loss-after-commit/draft/no auto retry/SQL | Desktop, delivery-only fault |
| 11 | V quick/custom/parser | V decimal/limits | V raw3,25 giữ/no request/3,5 lưu | Desktop |
| 12 | V conflict/draft | V two-connection barrier | V hai sessions stale409/current/SQL | Desktop Chromium156 |
| 13 | V bulk/fill | V atomic rollback | V stale target/source từ chối toàn batch, mode/raw giữ | Desktop |
| 14 | V zero/F/parser | V work0→F/overtime/no-op | V0,0→absence SQL; fill/replace/reminder | Desktop |
| 15 | V form validation | V both-order race/all-month excluded data | V form/recovery interval rejection+readback | Desktop |
| 16 | V work bound/raw | V29.5/30,30.5/31 rejection,month total>30 | V30 lưu/30.5 không request/raw giữ | Desktop |
| 17 | V overtime bound/raw | V23.5/24,24.5/25 rejection | V24 lưu/24.5 raw giữ/công độc lập | Desktop |
| 18 | V comma/dot/no rounding | V numeric wire/string rejection | V3.5→3,5,3,25 unchanged/error | Desktop |
| 19 | V auth boundary | V reset/revoke fixture, no public reset route | Fixture release V | Runbook/operator rehearsal Task11 NR; toàn AC chưa đủ |
| 20 | V controlled15000ms/refocus/epoch | V expired/revoked/auth | V polling giữ baseline/raw, response loss/reauth/recovery | Desktop; SR announcements NR |
| 21 | V disjoint/union/keyboard | V exact target batch/SQL | V mouse/keyboard/dedupe/release no-write | Native touch NR; AC chưa đủ |
| 22 | V repeat fill/source/cancel | V source CAS/no-op fence | V forward number/backward F/overtime/reminders/source conflict | Native touch NR; AC chưa đủ |
| 23 | V449/450ms,10/11px/lifecycle | V Apply persistence | V mouse + synthetic TouchEvent/multitouch/cancel/edge-scroll | Trusted iPhone/Android gestures NR; AC chưa đủ |

Accessibility: T3 Chrome154 actual keyboard/Tab/Enter/Escape/focus return, error aria-invalid/describedby/alert, loading503/retry, empty/long Unicode, computed composited contrast min5.42:1. SR runtime/version/actual announcement **NR**; Radix và static detector không thay evidence. Desktop1280×800/mobile viewport375×812 không là thiết bị thật. Windows10.0.26300/Node24.22.1/pnpm12.15.0/PG17.11; headless Playwright1.64.1 Chromium156.0.8078.4 riêng với T3 Chrome154.0.0.0.

Performance G1: cùng máy Ryzen7 6800H/16 logical CPUs/RAM16387981312 bytes; production1280×800/loopback/no throttle,20/200/1.000 người ×31 ngày ×2 kinds =1.240/12.400/62.000 logical cells. Canonical `benchmark-final.json`: API p95=31.81/100.34/448.60ms; cold load p95=214.92/472.86/1676.05ms; editor p95=23.50/74.50/394.80ms; input p95=30.30/61.20/337.70ms; scroll p95=16.70/33.40/116.70ms, max16.80/83.30/416.70ms; heap growth8.2656859643/1.9638383667/0.1292530411%, không monotonic. Budget200/1.000: API≤500/1500ms, load≤2000/5000ms, editor/input≤100/150ms, scroll p95≤33ms/max≤200ms, heap≤20% không monotonic.20 API/load không budget riêng. **Failed200 scroll và1.000 editor/input/scroll/freeze**, còn API/load/heap đạt. Phone performance NR. Giữ exact raw samples/provenance, không lấy bundle warning573.04kB làm phép đo hoặc hạ budget.

Profile1.000:102440 DOM nodes/31336 listeners sau GC; app samples AttendanceGrid/AttendanceCell/orderedMonthCells/React property updates, có cả automation/focus/layout overhead. Đề xuất review scoped subscription/projection/memoization, giữ draft owner/baseline/epoch/gesture invariants; chưa production fix/engine/virtualization. G3 còn Failed/NR, không product Done.

Checkpoint hiện hành Task9 ở cuối tài liệu: workbook/API/auth/PG/browser download/T3 và Microsoft Excel desktop16.0.20527.20088 edit/recalc đã kiểm scoped; main independent review Pending. Các trạng thái trước giữ lịch sử, không thay evidence Task9 hoặc full matrix Task10.

## Checkpoint Task8 sửa R1, 29/10/2026

I1 rendered + actual stale-second-target/source E2E hiện mọi identity/current/reminder/nháp và source N ngoài tháng trước recovery. I2 model/rendered và actual Save/recovery SQL chứng minh pending fill kết thúc, focus về nguồn, click thường mở đúng một ô; cancel/reauth không hồi sinh endpoint. I3 controlled dirty449/450ms,10/11px, scroll/multitouch/release/owner/epoch cancellation và discard/no replay đạt; Chromium TouchEvent là synthetic, không thay native pan/zoom. Final product41 tooling/155 web/13 API; actual bulk10/input8 nhóm đạt với verified Task8 PG reacquire, DB UUID mới, SQL thật. Không đổi rulings ca6–9, keys/mode/raw/source CAS/one-write/fence; full matrix/thiết bị/SR/performance vẫn Not run Task10. [Validation](../validation.md) ghi failed attempts, check/evidence/release; main independent exact-tip R2 Pending, không writer independent PASS.

## Checkpoint Task8 implementation, 29/10/2026

Unit/component controlled449/450ms,10/11px và lifecycle/union/fill/draft đạt; final `product:check`41 tooling/140 web/13 API. Scoped built web–Nest–PostgreSQL E2E15 nhóm kiểm exact batch/SQL totals/reminders/source, stale target/source whole-write rejection, explicit recovery giữ keys/mode, eligible0, month-exit tombstone/N và no-op fence scope với real pre-lock barrier. Sau self-review sửa edge motion trong cùng ô,6 nhóm input E2E chạy lại đạt (stationary hold không cuộn, kéo1px sát mép cuộn, Escape dừng/no write). Task7 R1 confirmed ID/PATCH422/focus regression đạt trên DB Task8 mới. Lớp ca6–9: Task8 bổ sung eligible bulk no-op/delayed write409, source/skipped/occupied không đổi revision, reconcile original source ngoài tháng, one Apply one set-value giữ reminder; không claim chạy lại toàn ca6–9 API matrix hoặc toàn AC.

T3 actual product mouse/keyboard/edge scroll/fill conflict/recovery/raw guard focus có evidence; TouchEvent/coarse media là **synthetic**, chưa trusted iPhone/Android/native zoom/SR/Linux/TLS/reader/operator/performance. Full AC/matrix Task10 vẫn Not run. [Validation](../validation.md) ghi command, RED/GREEN, evidence và resource release; writer self-review, main fresh independent exact-SHA gesture/lifecycle/batch review còn Pending trước Task9. Các checkpoint/bảng Not run thiết kế bên dưới giữ lịch sử, không phủ nhận lớp Task8 đã kiểm.

## Checkpoint Task7 sửa review R1, 29/10/2026

Regression tập trung thêm nhánh unknown Employee POST→confirmed ID→recovery PATCH422/400→sửa raw, không mở POST mới hoặc unsent-create resume; fresh read/session epoch trước recovery tiếp theo. Model và rendered form dùng fixtures; targeted built web–Nest–PG kiểm422 không đổi revision, PATCH200 đúng ID và tổng POST1, SQL độc lập. Primitive Radix/Page/Workspace Keep/Escape giữ focus/raw/ID/đơn vị; discard/modal kế tiếp không bị giành focus. `product:check`40 tooling/114 web/13 API; [validation](../validation.md) và evidence `task7-fix-r1` ghi command/lớp/giới hạn. I1/M1 implemented trong scope, chưa independent PASS; main re-review exact tip. Không replay full10 nhóm hoặc mở claim toàn AC/ca6–9/device/zoom.

## Checkpoint Task7 — lớp web/API/PostgreSQL, 29/10/2026

Task7 đã chạy controlled unit/component và10 nhóm E2E thật cho polling/draft, atomic patch-cell, conflict, unknown/read-only reconcile/explicit no-op fence, Employee PATCH ngoài tháng/create mất ID; SQL độc lập và T3 built UI có bằng chứng tại [validation](../validation.md). Ca6–9 bên dưới là nguồn assertions: Task5 API/PG kiểm source/skip/eligible0/tombstone/both orders; Task7 chỉ consumer editor một ô, chưa source/bulk UI Task8 hoặc full matrix Task10. Các câu Not run ở checkpoint thiết kế bên dưới là lịch sử của lớp đó, không ghi đè kết quả scoped mới và không nâng mọi AC thành Verified. Independent state/transport/concurrency/UI review Task7 chờ main exact SHA; thiết bị/reader/Excel/zoom/Linux/TLS/operator thật Not run.

## Checkpoint Task5 — API/PostgreSQL, 29/10/2026

Đã kiểm lớp API/DB của snapshot/values/totals/patch/batch/fill-source/CAS/no-op/reconcile theo ca6–9, trên cluster PostgreSQL17.11 mới. Suite attendance61 assertions/test cases tính cả parent groups; auth regression12 và employees10 có command/evidence trong [validation](../validation.md). Unit/contract kiểm JSON đầy đủ với runtime/OpenAPI/generated web types; full month56 ô và bốn write fixture chạy HTTP thật. Không thay toàn bộ AC thành Verified: AC12/13/15 cần hai phiên UI ở Task7/10; editor/draft/polling/fill UI/Excel/thiết bị/reader/Linux/TLS/operator thật còn Not run. Independent transaction/schema/contract review Task5 chờ main exact SHA; bảng Not run bên dưới giữ checkpoint thiết kế Task1.

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
| 03 | 5 totals/changes/patch-cell,7 save,9 export | Nhắc work/overtime độc lập; một Save đổi value+nhắc nguyên tử, chỉ đổi nhắc giữ số/tổng, reload/xlsx giữ | E2E+DB+xlsx |
| 04 | 5 values,6 grid,9 export | F/trống/N/— khác nhau, không tổng giả/0 hoặc F overtime | API+DB+UI+xlsx |
| 05 | 4 employees,6 month-view | Thêm20/10 chọn15/10 →1–14 N, ngày15 trống, không dùng createAt | E2E+DB |
| 06 | 4 employees,6 month-view | Kết thúc20/10 →20 editable,21–31 —,11 vắng, lịch sử10 giữ | E2E+DB |
| 07 | 4 dates,5 totals,6 month-view | Tháng28/29/30/31 và thứ đúng, leap1900 false/2000 true, tổng hàng/cột | Unit+API+UI |
| 08 | 6/8/10 selection-input/device | Sticky, pan/pinch/xoay/mở rộng, phone nhập/màu, desktop Enter/Tab | Trusted iPhone+Android+desktop |
| 09 | 9 workbook/export,10 reader | 1 sheet2 bảng, typed cells/formulas/cached totals, reader sửa tính lại đúng bảng | API+download+reader thật |
| 10 | 4/5 no-op fence/reconcile,7 recovery,10 two-sessions | Pending không saved giả, timeout giữ draft; đọc explicit ID ngoài membership, no-op intent mới fence đúng phạm vi, DB reload còn dữ liệu | E2E+DB+fault injection |
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

1. **Timeout sau commit:** fault injector cắt response sau DB commit; read connection mới đọc giá trị mới qua reconcile explicit ID/key kể cả nhân sự đã ra khỏi tháng. UI giữ draft/trạng thái chưa xác định, không tự gửi lần2; người dùng đối chiếu trước intent mới. GET/reconcile trước late commit không chứng minh rollback; chỉ accepted write trên resource tương ứng mới cấp fence, lịch thực thi bắt buộc ở mục6 dưới đây.
2. **Sửa mốc vs ô:** hai PostgreSQL connections barrier trước lock; lần lượt thử cả order cho value number/F/reminder-only ở tháng khác. Kết thúc không có data ngoài interval, không xóa nhắc, mốc hoặc toàn write bị từ chối. Không “pass” chỉ vì hai request tình cờ tuần tự.
3. **Fill nguồn và tập đích stale:** source số không đổi nhưng revision/nhắc đổi vẫn conflict; nguồn lọc ẩn không khởi tạo; target fill-empty từ trống→có dữ liệu không được âm thầm bỏ qua sau refetch rồi ghi các ô khác. Mọi đích không đổi bởi batch bị từ chối.
4. **Polling/context/auth:** draft raw sai3,25 giữ nguyên qua15s/refocus; baseline không đổi. Đổi lọc/tháng/loại có guard, logout clear cache, hết phiên dừng polling/mutation; account khác không nhận draft cũ. Lỗi initial load khác zero employees, background lỗi hiển thị độ mới.
5. **Gesture:** clock449/450, khoảng10/11px và di chuyển về lại không rearm; pointercancel/đa điểm/noncancelable pan/unmount hủy timer/capture/auto-scroll, rollback selection. Cuộn ngay không chọn, hold rồi thả không toggle bỏ; touch đúng media coarse, không chỉ resize375px. Fullscreen in-page không khóa zoom.
6. **Accepted no-op fence — I1, task4/5/7:** barrier giữ A trước Employee lock, A mang baseline R và muốn đổi dữ liệu; reconcile thấy R; B có chủ ý giữ giá trị hiện tại với R →200, changed=0 nếu là cell, revision R2 khác R; thả A →409 và không ghi. Lặp với value số/F, reminder true/false, absent clear hoặc reminder=false từ R="0" (phải tạo tombstone), tombstone đã có, Employee PATCH cùng tên/mốc. Đảo order A commit trước B →B409 dù body B bằng dữ liệu hiện tại; validation/409 rollback cả revision, không chỉ content. Employee expectedRevision-only PATCH400 không tạo fence.
7. **Phạm vi fence — I1, task5/7/8:** batch B có eligible no-op cấp revision, đích fill-empty không rỗng/đích N/—/source giữ nguyên revision và value/reminder; số đếm phản ánh changed=0 khác eligible>0. A cũ chạm eligible target của B →409 toàn batch; request khác chỉ chạm source/đích bị loại vẫn có thể ghi nếu CAS còn đúng, không giả bảo vệ. eligible=0 →422, không tombstone/revision mới và A còn có thể commit. Read/abort/bỏ draft đơn thuần cũng không ngăn A. B attendance không tăng Employee revision; PATCH Employee cũ còn có thể commit nếu hợp lệ. UI không tự đổi fill-empty thành replace, không tự ghi source hoặc gửi no-op recovery: chỉ sau quyết định giữ giá trị của người dùng mới gửi intent mới tường minh, kể cả client thấy cùng giá trị.
8. **Đối chiếu ngoài tháng — I2, task4/5/7/8:** nhân sự không có nội dung/nhắc, PATCH startDate từ15/10→01/11 hợp lệ commit rồi mất response; GET tháng10 không chứa người đó, reconcile ID và ô20/10 trả Employee revision mới, state before-start và revision thật (0 nếu vắng, UUID nếu tombstone). Thử endDate lùi trước tháng →after-end. Source có số/F trong draft: phiên khác phải clear nội dung/nhắc rồi mới đổi mốc; reconcile giữ identity nguồn, trả tombstone/revision mới/N hoặc —, UI giữ draft và không fill từ nguồn không editable. Target/source khác nhân sự hoặc kind đều đọc đúng explicit key, không tự thêm vào bảng hay đổi tháng/draft. Barrier read-vs-date-change chỉ nhận snapshot trước hoặc sau nhất quán. ID chưa có trả missingEmployeeIds, không cell/revision0 giả; DB5xx không thành missing. Anonymous/revoked401 không tiết lộ ID; Origin403/415/400 unknown/duplicate/empty, no-store và không log dữ liệu. Read retry tối đa2, mutation không retry.
9. **Một Save, một transaction — I3, task5/7:** baseline value1/reminder=false, editor đổi1,5 và true, Lưu gửi đúng một patch-cell; DB readback cùng1,5/true với một revision mới, changed=1; Hủy gửi0 request. Value invalid3,25 hoặc một field stale →không đổi cả value/reminder/revision. Patch chỉ reminder giữ value/tổng; chỉ value giữ reminder; value=null giữ reminder trừ khi gửi reminder=false; reminder=null, patch rỗng/null, unknown/mode/source hoặc nhiều target bị từ chối. No-op cả hai field vẫn cấp revision theo ca6. Batch/fill chỉ set-value, từ chối reminder/patch trong operation đó, giữ reminder từng đích. Timeout sau commit cả hai cùng lưu nhưng UI giữ draft chưa xác định cho đến đối chiếu/ý định mới, không chạy request thứ hai để “lưu nốt”.

Ca6–9 là assertions tương lai cụ thể cho fix G1 R1, **Not run**: tài liệu và JSON fixture không chứng minh HTTP validation/DB barrier/E2E đã đạt. M1 được kiểm cú pháp fixture trong lượt tài liệu; Task2/5 sau này phải kiểm chính các shape này với DTO/OpenAPI runtime, không chỉ JSON.parse.

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

Task1 đã có review độc lập G1 R1 với findings I1/I2/I3/M1; fix tài liệu phải được re-review độc lập trên tip mới rồi chờ người dùng phê duyệt G1. Quyền dispatch tuần tự đã có theo INDEX/chỉ dẫn phiên; main điều phối, một implementer hoặc reviewer tại một thời điểm. Không tự đóng Task1/G1 hoặc chuyển Task2 từ kết quả check docs. G2/G3 code/tooling/auth/migration cần reviewer độc lập read-only với full SHA base..tip, requirements/contract, diff/tests/evidence và findings severity. Reviewer xem tip mới sau sửa theo QUALITY_GATES.

Task11 backup/restore vào DB thử mới, so counts/values/mốc/nhắc/tổng và session revoke sau restore; target/secret/vận hành thật chưa có quyền. Done local, integrated và released khác nhau. Bàn giao nêu rõ Verified lớp nào, Failed/Not run/Blocked gì, nguồn gỡ gate và resource giữ lại; không biến ngoại lệ thành pass.

## Task9 checkpoint — 29/10/2026

AC09 đã kiểm ở các lớp: workbook typed data/style/SUM/cached zero/XML/fullCalcOnLoad; authenticated Nest–PG snapshot cạnh tranh và SQL; actual built-web download/error/pending/retry/không auto-save draft; T3 Chrome154 tại1280/375; Microsoft Excel desktop16.0.20527.20088 mở file browser, sửa Công2,5→5,5 và Tăng ca4→6,5, CalculateFullRebuild kiểm tổng hàng/ngày/phần và bảng còn lại giữ nguyên. Reader là engine Excel thật qua COM instance riêng, không ExcelJS hoặc UI người dùng; interactive reader UI và reader khác Not run. Evidence chi tiết tại [validation](../validation.md). Main independent exact-SHA review Pending; không suy toàn bộ AC/full matrix Task10, trusted devices/native zoom/SR/Linux/TLS/operator đã đạt. Các checkpoint Not run cũ bên dưới là lịch sử.
