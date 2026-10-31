# I3 — Kết quả diagnostic G/F R1

Ngày31/10/2026, continuation theo ruling của main: **G Failed tại extent/gap −4px; F inconclusive từ retained trace, fresh F Not run.** Independent audit cuối **Pending main**. Đây vẫn là diagnostic đã duyệt tại [proposal mục6](scroll-next-step-proposal.md#6-quyết-định-cụ-thể-đề-nghị-main-trình-sau-fresh-review); không đổi question/probe, không renewal hoặc thử variant.

## Ruling, clock và provenance tiếp nối

Initial stop/report tại `215dd8baa912c3952908da86f8ae339841e05832` vẫn là lịch sử thực tế: worker đã dừng sau hai skill reads trong primary, trước G/F. Main sau đó sửa giới hạn ban đầu: exact runtime-listed SKILL.md/reference instruction reads được phép, ưu tiên worktree mirrors; riêng hai reads ấy không phải actual product/resource/identity failure. Phân loại operational Failed ban đầu đã được main điều chỉnh, không phải worker tự bỏ stop. Nội dung snapshot ban đầu được giữ nguyên ở cuối báo cáo; nó **không** là verdict hiện hành hoặc independent-reviewed snapshot.

Start gốc **2026-10-31T05:47:48.0724699Z**, hard deadline **07:47:48.0724699Z** không đổi. Continuation owner/brief tạo trước further exploration tại **05:55:34.6571662Z**, root mới ignored `.agent-runs/MKW-PRODUCT-001/i3-gf-diagnostic-r1/20261031T055534Z-continuation-215dd8b/`.387,095 giây trước đó đã nằm trong tổng thời gian, không cộng thành budget mới. Actual end/elapsed, local TIP và seal hash ghi trong ignored handoff `.superpowers/sdd/implementation-plan/i3-gf-diagnostic-r1.md`.

Original BASE `bc1c2c535a3fe09388b5d632ced36f229830a93b`; continuation BASE sạch `215dd8baa912c3952908da86f8ae339841e05832`, cùng branch/workspace/sole Sol-high/no children. Old root `20261031T054748Z-bc1c2c5` và12-file seal SHA256 `b6db56f2c27df6ddf848d68cbce86db7e2e95b6f06ee87cc8315c3edbd57646f` không sửa. Không sửa progress/reviewer/proposal/history/source/UI/CSS/Grid/Row/Cell/package/lockfile/requirements/architecture/plan.

## G — một adapter, first valid failure và dừng

Câu hỏi: fractional layout border-box L, rect V và actual CSSOM S có giữ đúng gap/tracks/extent/key/clip/anchor theo mục4 không? Throwaway dùng một adapter `prototype/public/gf-harness.js`: RO `borderBoxSize[0]` horizontal-tb; reference L123,375×47,625 đặt ngoài table; sx/sy từ cùng normal row/epoch, không lấy sticky anchor, DPR hoặc rect V ghi lại làm CSS L. Source dự kiến calibration displacement S và manual anchor ở các bước sau, nhưng chưa đến các bước ấy.

Một lần gọi case **Công, root23px Arial, CSS zoom1**, desktop T3 Chrome154/Windows1280×800/DPR2. Fake snapshot1000×31 đủ62.000 logical cells hai kinds; displayed kind31.000 positions. Full natural oracle độc lập; window map mới chỉ nhận RO của17 rows đang mount, không nhận row heights từ full oracle. Neutral spacer/width constraints giữ cùng probe; đây là thin geometry control, không faithful F product baseline/editor hoặc code production.

| Observation thực chạy | Raw/đối chiếu | Kết luận trong scope |
| --- | --- | --- |
| Clipping calibration | fitted width200 không clip; width20 phát hiện clip thật; Range/box cùng V | Comparator phân biệt được controls; không là UI acceptance |
| Full natural → full measured/constrained | 1000 rows/31.000 buttons mỗi record; table L/V56.606; header54 + body56.504 + footer48;33 tracks khớp | Extent/tracks khớp tại case này |
| Window17 top | 17 rows/527 buttons/1 gap; measuredKeyCount17, estimateL56,5; reference đúng L, sx=sy=1 | Numeric clipping0, duplicate positions/IDs0; logical membership assertions qua trước failure |
| Independent gap `[17,1000)` | Oracle55.543,5 L; requested/actual gap55.539,5 L/V; td gap cùng số | **−4 V px**, vượt≤1px |
| Table extent | Full56.606 V, window56.602 V | **−4 V px → Failed**, dừng G; không rescue/rebuild/retry |

Full oracle có999 rows L56,5 và last row L60,5 (tên Unicode dài); window chưa đo last row nên estimate thiếu4px.33 track deltas,17 row-top deltas và header/footer deltas đều0 ở record đã thu. Đây là bằng chứng mismatch của estimate/extent trong control cụ thể, **chưa kiểm được correction tại zoom1,1** và không kết luận mọi fractional mapping/windowing bất khả thi. Computed root font là23px Arial; button font shorthand trả chuỗi rỗng, individual font properties chưa capture nên không claim đã xác minh font từng button.

Raw `G-raw.json` có5 records,742.196 bytes gồm newline cuối, SHA256 `115b3feb4bb2847be695fc2d75b5e432748d24814a39724ecb67f3b6f0cb5123`; export frozen qua38 read-only chunks. `G-invocation-status.json` giữ failure stack/assertions; screenshot `G-window17-after-fail.png` chỉ minh họa. `raw-reconciliation.json` recompute các tổng từ raw và xác minh21 pre-run source/build hashes còn khớp, không rerun browser hoặc independent review.

**Not run sau stop:** native hit keys/sticky intersections; S displacement k/fractional command; pinned disjoint gap; pinned-row height change/anchor/version outcomes; Tăng ca; zoom1,1; font16 control. Epoch/range/measurement counters đã ghi ở records ban đầu không chứng minh các lifecycle/anchor controls chưa chạy. Không pass toàn G, full keyboard/focus/P3/print/editor/windowed benchmark hoặc transform variant.

## F — retained attribution từng phần, inconclusive

Câu hỏi: frame chậm baseline full1000 liên quan app/sampler/native work, node/region/layer/thread nào? Ưu tiên trace retained trước. Copy read-only `task10-fix-r1/mkw_acceptance_587b699e_ec27_486d_b95a_751ad179119b/scroll-trace.json` vào root mới, SHA256 `8da554d89c7bdf4acb86602c2dfa79fbc96215680376e30374befdec201a1511`.83.863 events; origin script xác nhận trace baseline được thu **trước** candidate CSS injection; không chạy origin script hoặc candidate.

`F-retained-attribution.json` và `F-exclusive-segments.json` phân hoạch renderer main PID28760/TID25860 theo mọi biên X-event: chỉ span trong cùng nhất không ambiguous nhận exclusive time, crossing/equal-span và khoảng trống để unknown. Từ first RAF callback start63781633159 tới last callback end63786651098 là **5.017,939ms**; tổng partition khớp trong sai số số thực<0,000001ms. Đây là trace wall intervals, không CPU sample/RAF `now` timestamps.

| Renderer-main exclusive bucket | ms |
| --- | ---: |
| PrePaint | 1.315,773 |
| Paint | 1.265,280 |
| Layerize | 552,674 |
| ScrollLayer | 222,779 |
| FunctionCall self | 22,299 |
| RunTask residual chưa quy owner | 612,760 |
| Không quan sát/wait/idle/unknown | 844,027 |
| Commit / HitTest / UpdateLayer / EventDispatch | 66,381 /49,555 /34,709 /8,778 |

Các buckets GC và residual khác giữ đầy đủ trong raw partition; không bỏ mẫu hoặc cộng các tổng inclusive lồng nhau. Paint self theo historical nodeName: HTML1.187,972ms, TH.name69,541ms, TD.total6,018ms, #document1,749ms. Node/layer/clip fields có lưu nhưng thiếu historical DOMSnapshot/backend-node map và offsets/content tại frame; chưa quy được chính xác logical/offscreen/day-data region. Không map historical nodeID sang DOM hiện tại.

Worst callback-start window index67 dài86,127ms: Paint17,467 + PrePaint5,907 + Layerize2,533 + unknown51,113 + residual RunTask7,644ms và các buckets còn lại. Retained RAF interval cùng index83,4ms chỉ là đối chiếu thứ tự, không raw timestamp alignment đã chứng minh. Tất cả222 windows được giữ; top windows45/56/46/86 cũng có raw costs. Retained p9533,4/max83,4 không thay canonical66,6/333,3.

443 ScrollLayer spans nằm trong FunctionCall `frame`, script34/URL rỗng/line6/col19; self của callsite10,412ms, nested ScrollLayer222,779ms. Phù hợp sampler nhưng thiếu exact script-source hash gắn trace, chưa khẳng định source owner. App callsites `vh/N/yh` script4 trỏ bundle `index-Cs45lR7-.js`; exact bundle/map không có trong current dist/phạm vi retained đã tìm. Source manifest cũ không chứng minh trace-bound build/fixture identity; không tự gán chúng thành React commits.

Raster2.002 spans tổng45,339ms trên5 worker threads, báo riêng main wall; compositor RunTask386,375ms, Viz19,575ms và GPU4,278ms là **inclusive thread totals**, không cộng vào phần trăm main hoặc suy queue latency. Không có Layout/UpdateLayoutTree/invalidation tracking events trong capture này **không chứng minh zero layout**; StyleAndLayout non-X markers không là duration CPU. Native Commit/DOM mutation không chứng minh React commits. Trace overhead, queue/wait và unknown chưa định lượng, không trừ để pass.

**Fresh F Not run:**0 untraced5×5s,0 traced5s, không fresh faithful current Grid/Row/Cell/CSS census/baseline. T3 đã hoạt động cho G; current tool catalog không expose Tracing/CDP transport/attach endpoint cho target này. Đã đọc repo browser/harness workflow: existing Playwright workflow tạo context Chromium156 riêng; không tạo target/đổi engine/cài tool để mở scope của một T3 Chrome154 target. Không đưa thin G fixture/editor cũ hoặc dataset nhỏ vào thay baseline full1000. Thiếu trace/source/region prerequisites nên dừng F với **inconclusive**, không causal claim hoặc credible optimization delta.

## Artifact, failures, release và giới hạn quyết định hiện hành

`pre-run-source-build-hashes.json` ghi21 files trước navigate/case: adapter SHA256 `66b1324af14ca05ee6578f411c9d228823e4efc562d162d4c08a0f926a4d1a82`, fixture `5c7f395767893941c57dc5f47b4ea96afcd1632f1a2df0216e9a0f79369d3b46`, bundle `index-BxThpTsB.js` SHA256 `bf3cfecaa2c21b51df62134736c380490e62c72c286e476fd7d449b84203afc9` và sourcemap/CSS. Origin hashes giữ trong `origin-provenance.json`/`copies-before-adaptation.json`; old Row/Cell/fixture chỉ copy rồi dùng trong root mới. Incumbent product files không đổi; tokens copy bỏ hai Tailwind imports như probe trước. Existing Node24.22.1/React19.3.1/Vite8.3.5; build exit0 với bundle warning, không install/pin change.

Failures giữ riêng: hai initial T3 inspect/evaluate timeout15s (không experimental case); OS identity guard ban đầu sai vì slash normalization, sau kiểm raw exact exe+argv/token thành công mới run; redundant Blob-download copy thất bại sau tab close nhưng chunk raw đã lưu; release TCP probe đầu timeout trước probe mới ConnectionRefused. Không ghi đè failure, không coi những lỗi ấy là successful metric.

Own tab `tab_7_b444d759-9c74-4be2-a47f-38a4dba03eb9`, incognito/agent owner, normal close awaited; status sau close available false/tabId null/no tabs. Own loopback50220/PID25924 có OS exe+argv và actual HTTP identity trước run/stop; stop.request06:10:34.228Z, graceful release06:10:34.272Z, session exit0. Final actual probe06:12:45.5398864Z: process absent, listener list rỗng, TCP **ConnectionRefused**.7 GET/zero non-GET. Raw identity/release/logs giữ nguyên; tab lifecycle proof không phải browser OS shutdown claim. Không acquire backend/PG/account/service ngoài frontend task-owned, không stop unrelated resource.

Chỉ3 tracked docs report/INDEX/validation; commands/exits/docs/UTF-8/whitespace/scope/clean HEAD và final runmanifest/runhash nằm trong handoff. Seal root mới chỉ sau release/report/logs, manifest loại chính nó; readonly recomputation sau seal, không mutate old/new seal. Independent final audit **Pending main**, không selfclaim independent PASS.

I3/G3 **Failed/Open**, G4/Task9 dependencies và Closed gates cũ giữ nguyên; cả modes tương lai cùng budgets33/200 và workload20/200/1000. Canonical full1000 vẫn Failed; không all-row solution Verified, architecture closure hoặc permission cho optimization/design planning/implementation. Native phones/SR/native UI zoom/pinch/phoneperf/print/P3/full keyboard/focus restoration và fresh two-mode performance còn NR. Main next: audit exact final snapshot, cả initial stop+ruling và actual source/raw/maps/hashes/counts/cap/releases; diagnostic kết thúc, không tự xin/chạy scope tiếp.

## Snapshot ban đầu tại215dd8b — giữ nguyên văn, trước ruling

Phần dưới là báo cáo **lịch sử** của initial stop; các kết luận dừng/NR và next action ở đó đã được ruling/continuation phía trên thay thế. Không coi lịch sử này là independent-reviewed hoặc xóa dấu vết instruction reads.

Ngày31/10/2026. **Dừng toàn scope ở bước chuẩn bị; G Not run, F Not run.** Đây là báo cáo lần diagnostic đã duyệt [proposal mục6](scroll-next-step-proposal.md#6-quyết-định-cụ-thể-đề-nghị-main-trình-sau-fresh-review), không kết quả adapter hoặc benchmark. Independent review của snapshot này **Pending main**.

## Phạm vi, thời gian và điểm dừng

BASE sạch `bc1c2c535a3fe09388b5d632ced36f229830a93b`, branch `agent/mkw-agent-002`, workspace duy nhất `D:/TinHoc/minh-khue-workforce/.worktrees/agent-bootstrap`; sole diagnostic worker gpt-6.1-sol/high, không children/helper/Astra/escalation. User31/10 “Duyệt” cho đúng question/probe; không thiếu approval và không hỏi lại. Start UTC thực **2026-10-31T05:47:48.0724699Z**, hard deadline **07:47:48.0724699Z** cùng ngày;120 phút inclusive reads/setup/report/release, không gia hạn.

Owner/brief được tạo trước exploration tại ignored runroot `.agent-runs/MKW-PRODUCT-001/i3-gf-diagnostic-r1/20261031T054748Z-bc1c2c5/`. Lệnh đọc skill sau đó đã dùng hai đường dẫn **primary ngoài workspace được phép**: `D:/TinHoc/minh-khue-workforce/.agents/skills/using-superpowers/SKILL.md` và `D:/TinHoc/minh-khue-workforce/.agents/skills/brainstorming/SKILL.md`; cả hai đọc thành công, combined exit0. Cwd đúng worktree không làm hai paths ấy hợp lệ. Đây là **Failed operational scope gate**, không failure của giả thuyết G/F.

Worker nhận ra sau các initial document reads và T3 discovery/open blank tab, rồi áp dụng điều kiện resource/identity/scope failure **stop-all** trước mọi experiment. Sau đó chỉ release/report/docs verification; không retry/correction variant hoặc tự xin scope mới. Không ghi primary; không product-source read/write, build, frontend server, adapter/fixture, retained raw-trace attribution hoặc benchmark. Required FULL-read/prerequisite gate chưa hoàn tất; output đọc lớn có truncation, không coi là đã đọc đủ.

## Câu hỏi → bằng chứng → kết luận → phần thiếu

| Phần | Câu hỏi đã duyệt | Raw của lượt này | Kết luận và giới hạn |
| --- | --- | --- | --- |
| G | Đường đo fractional L/V/S theo mục4 có bỏ double scaling, giữ gap/tracks/extent/key/clip/anchor trong controls1000×31 cả kinds không? | `owner.json`, `brief.md`, `scope-stop.json`; **0 geometry observations**, không adapter/build | **Not run** vì global scope stop. Thiếu toàn bộ independent full oracle/reference scale/paired full-measured-window17+disjoint pin/font23 zoom1/1.1/font16/fractional scroll/height-change/versions; không pass-scoped hoặc fail geometry mới. |
| F | Exact baseline full1000 chậm ở app/sampler/layout/prepaint/paint/raster/region/thread nào? | **0 retained raw-trace attribution analyses**,0 fresh capture/census,0 untraced và0 traced invocations | **Not run** vì global scope stop. Chưa kiểm provenance/capability/topology; không gán nguyên nhân cho tool thiếu. Thiếu source/build/fixture mapping, exclusive frame costs/callsites/invalidation/node-region/layer/thread/unknown time/raw RAF+actual offsets/trace overhead. |

Không có experiment source/build/fixture/instrumentation để hash; các trường ấy **Not run**, không dùng source cũ hoặc old sealed hashes như hashes của một run mới. Không copy/execute/mutate script hoặc artifact trong sealed root cũ. Không candidate rescue, optimization/engine/CSS/dependency variant, editor thay thế hoặc dataset reduction. Canonical full1000 Failed66,6/333,3>33/200 và old zoom failure chỉ là retained dossier facts, không fresh observation/recomputation.

## Tài nguyên, kiểm chứng và bàn giao

T3 discovery đúng thứ tự: `preview_status` unavailable → own `preview_open` incognito thành công. Tab `tab_6_b444d759-9c74-4be2-a47f-38a4dba03eb9`, owner agent/ownedByCaller true, blank URL,1280×800; chưa navigate. Đã xác minh identity rồi await normal close; postcondition `preview_status` trả available false/tabId null/no tabs. `browser-release.json` giữ raw. Điều này chứng minh tab lifecycle released, không chứng minh renderer OS process đã dừng. Không acquire listener/PID/port/backend/PG hoặc alternate browser; không stop tài nguyên khác.

Runtime dùng cho docs: Node22.12.0/npm10.9.0/PowerShell7.6.9 hiện có, không install/thay pin. Browser engine/version và trace capability cho experiment chưa được kiểm. Exact commands/exits, thời điểm kết thúc thực, hashes/manifest/recomputation, full BASE..TIP và local checks nằm trong ignored handoff `.superpowers/sdd/implementation-plan/i3-gf-diagnostic-r1.md` cùng runroot; không dùng tracked report tự hash chính nó. Chỉ3 docs được phép thay: report này, INDEX và validation; nguồn sản phẩm/approved UI/CSS/Grid/Row/Cell/package/lockfile/requirements/architecture/plan/proposal/history/progress giữ nguyên. Không broad product suite; docs/UTF-8/whitespace/scope/Git checks được ghi theo kết quả thật trong validation/handoff.

I3 Important/G3 **Failed/Open**, G4/Task9 dependency concerns và các Closed gates cũ giữ nguyên. Cả modes giữ cùng budgets33/200 cùng workload future20/200/1000; không all-row solution Verified, architecture/planning/implementation/optimization permission. Native phones/SR/pinch/phoneperf/P3/print/full keyboard/focus restoration và fresh two-mode performance vẫn **Not run**. Main next: độc lập audit final snapshot, scope-stop/release evidence, actual commands/hashes/cap; worker không tự claim independent PASS hoặc mở lại diagnostic.
