# Đề xuất amendment tiêu chí heap — Pending user approval

Ngày02/11/2026; BASE=TIP3eff07d2d0a759fa665c89f75c12c6bb3ec3b017. Đây là **đề xuất để main trình người dùng**, chưa là yêu cầu đã duyệt, chưa sửa requirements/design/plan/matrix/source/validator. [Review độc lập](heap-paired-r2-review.md) và evidence liên kết là căn cứ. Historical performance Failed và mọi raw/verdict cũ bất biến.

## Quyết định cụ thể

**Khuyến nghị A — giữ budget20%, đo tích lũy theo thế hệ và lifecycle; total strict-monotonic chỉ báo chẩn đoán.** Giữ nguyên2warmups/10cycles/11post-GC, production workload20/200/1000 logical ×page25/50×work/overtime và các preconditions/budgets khác. Chỉ cho phép gọi “đạt contract heap hữu hạn đã sửa” sau **validation mới**, gồm phép đo budget không snapshot và bằng chứng lifecycle đủ checkpoint; không gọi “đã chứng minh không leak”. A chấp nhận rủi ro phép đo hữu hạn và baseline residual được công khai bên dưới; không chấp nhận thêm retired product generations trong interval đo.

**B — giữ toàn bộ gate hiện hành.** Strict-monotonic total JSHeapUsedSize vẫn FAIL dù tăng dưới20%; bốn FAIL hiện tại tiếp tục unresolved. Không có causal product fix được chứng minh để áp dụng ngay. Dừng vòng profiling chung; chỉ mở lại khi có evidence cụ thể mới hoặc thay đổi capability/contract được quyết định, không rerun đến khi xanh.

Không đề nghị phương án “chỉ bỏ assert monotonic rồi dùng lại raw cũ”: không có causal/lifecycle proof và sẽ làm thiếu gate. Không đề nghị epsilon, số dip cần có, slope, moving window, loại điểm cuối, thêm warmups hoặc clear Resource Timing để lấy PASS; chưa có cơ sở độc lập cho những lựa chọn đó.

**Câu để người dùng duyệt sau khi main inspect:** “Tôi chọn A: giữ trần tăng heap20% và lịch2warmups/10cycles/11post-GC; chuyển xu hướng tổng heap tăng nghiêm ngặt qua mọi bước từ điều kiện FAIL sang chẩn đoán; bổ sung các tiêu chí thế hệ/lifecycle H1–H5 bên dưới. Chấp nhận rằng phép đo này chỉ kiểm workload hữu hạn và không chứng minh không có leak dài hạn; initial DTO giữ từ baseline phải được công khai. Chỉ xét kết quả mới sau sửa/review tooling và validation đúng contract, không đổi FAIL cũ hoặc waive các gate khác.” Nếu không chấp nhận phạm vi/rủi ro này, chọn B. Đây chưa là approval hoặc quyền acquire tài nguyên mới.

## Vì sao cần đổi binding acceptance, không chỉ diễn giải lại

Plan Task9 Step4 hiện ghi nguyên văn:

> heap≤20% and not monotonic leaked timers/listeners.

Matrix hiện hành hàng “Heap10 cycles sau2 warmups” ghi:

> tăng≤20%, không monotonic leak

và:

> Giữ G1; thêm page/search/size cycles và kiểm inactive cache/listeners/timers, không chỉ heap nhỏ

Hàng G1 gốc trong matrix ghi:

> Không tăng đơn điệu do leaked listeners/timers; post-GC tăng<=20% baseline ổn định

Validator hiện thực hóa gate thành **hai** điều kiện độc lập:

```js
growth = (heapBytes[10] / heapBytes[0] - 1) * 100;
growth <= 20;
!heapBytes.slice(1).every((n, i) => n > heapBytes[i]);
```

Cùng với11counts cho timers/listeners/queries, không strict increase ở cả10 bước và query count≤1. Current matrix/checkpoints giữ bốn FAIL vì điều kiện total strict-monotonic. Dù câu gốc có chữ “do leaked”, không được tự diễn giải lại để xóa FAIL đang binding. Chuyển strict total trend từ hard gate sang diagnostic là **amendment acceptance thực sự** cần người dùng duyệt theo PERMISSIONS; việc có overhead không tự cấp phép sửa gate.

## Exact current → proposed wording

Chỉ sau approval, cập nhật nguồn sở hữu và quyết định liên kết đồng bộ, không chép đề xuất này vào approved trước đó. Không đổi20%, counts, workload, budgets hoặc business/DB/UI semantics.

1. **Plan Task9 Step4:** thay đúng cụm `heap≤20% and not monotonic leaked timers/listeners.` bằng:

> Heap: sau đúng2warmups, đoH0 vàH1…H10 sau GC bằng renderer Performance.JSHeapUsedSize, đủ11samples; (H10/H0−1)×100≤20%, không làm tròn hoặc trừ code/native/harness overhead. Giữ nguyên workload/preconditioning. Báo raw total-heap trend và strict-monotonic như diagnostic, không dùng total strict-monotonic riêng lẻ để kết luận causal leak hoặc FAIL. Heap acceptance chỉ PASS khi đồng thời budget này đạt và bộ tiêu chí finite product-generation/lifecycle H1–H5 của amendment đã duyệt có đủ bằng chứng mới và đạt. Phát hiện vi phạm→Failed; thiếu/không phân loại được evidence bắt buộc→Not run/Blocked, nonzero, không PASS. Không coi endpoint/count ổn định là proof không leak. Các latency/scroll/native/SR/dependency/G4 gates khác giữ nguyên.

2. **Matrix hàng current “Heap10 cycles sau2 warmups”:** thay cell desktop `tăng≤20%, không monotonic leak` bằng:

> (H10/H0−1)×100≤20%,11renderer post-GC samples sau2warmups; H1–H5 phải đạt bằng validation mới. Strict total-heap trend là diagnostic, không causal leak proof.

Thay cell nguồn/trạng thái của chính hàng đó bằng:

> Giữ budget G1 và workload; tiêu chí leak vận hành đổi theo amendment đã được user duyệt sang không tích lũy thêm retired product generations/lifecycle registrations trong interval đo. Thiếu evidence→Not run/Blocked; vi phạm→Failed; không retrospective PASS. Bounded endpoints không đủ; historical FAIL giữ nguyên.

Cell phone vẫn `Đo nếu browser có API; thiếu NR`; không thêm giả định browser/device có khả năng này. Khi ghi checkpoint G1 hiện hành, liên kết amendment thay diễn giải; **không sửa hàng/kết quả lịch sử thành PASS**. Câu G1 gốc được giữ như lịch sử kèm link decision, tránh hai rule current cạnh tranh. Requirements/design nơi nói “giữ ngân sách G1” chỉ được thêm link quyết định phạm vi này sau approval, không sửa nghiệp vụ.

3. **Validator, sau approval và review tooling:** bỏ riêng total `every(n > previous)` như điều kiện FAIL; tiếp tục tính/lưu boolean đó. Giữ finite/nonnegative11samples/H0>0, kiểm thực chạy heapWarmups===2 và10cycles, growth≤20. Không chỉ làm bước bỏ assert này: bắt buộc validate completeness/result H1–H5 với raw identities/owner facts, dùng status Failed/Not run/Blocked cho đúng nguyên nhân. Các gate listener/timer/query hiện tại được **bổ sung** owner/lifecycle assertions H3–H4, không lấy việc có một plateau/dip làm proof release. Không sửa summary/verdict của evidence cũ.

## H1–H5: tiêu chí tối thiểu đo được, có điều kiện dừng rõ

Đây là **định nghĩa được đề nghị**, không claim hiện đã có instrumentation hoặc kết quả đạt. Không có threshold kiểu “cho phép tăngN DTO” lấy từ2DTO hoặc982/998listeners của R2. Với kết quả chưa xác định, contract không tự suy thành PASS.

### H1 — Checkpoint và coverage bắt buộc

Budget run giữ nguyên source/workload/per-config preconditioning hiện hành,2warmups+10cycles,11H_i sau explicit GC tại readiness hiện hành: đúng month/q/page/pageSize/kind/ordered IDs/fetchedAt/delivery mới, idle/editable, editor đóng, không draft/guard pending. Không snapshot/allocation sampler/clear-buffer trong budget interval. Báo đủ11heap values, queries/observers/timers/listeners/liveDOM và lifecycle checkpoints, context/resource identity/runtime/source start hashes.

Bằng chứng generation được thu trong **companion lifecycle run riêng**, cùng12configs/preconditioning/2warmups/10cycles và11equivalent checkpoints S0…S10. Ở mỗi S_i phải giữ graph hoặc evidence identity/reachability tương đương có thể kiểm độc lập, không chỉ trước/sau. Thiết kế tối thiểu đề nghị là11raw graphs, một graph sau facts tại mỗi post-GC checkpoint; đây là instrumentation **chưa được chạy/kiểm chứng**. Không lấy metric companion thay budget run hoặc dùng sai khác giữa chúng làm snapshot-effect estimate. Không thêm vòng tìm ngẫu nhiên một trace nonmonotonic.

Mỗi config phải có sau interval một teardown/unmount/logout checkpoint T khi cleanup đã settled, trong khi browser context còn tồn tại đủ để quan sát release. Chỉ đóng cả context rồi heap mất hết không kiểm được cleanup sản phẩm. T không thay H10 và không thêm cycle để làm đẹp budget. Không chờ một khoảng tùy ý cho GC: dùng observable readiness/cleanup completion, explicit GC và lifecycle timer expiry/cancel theo deadline source hiện hành; không tạo sleep/tolerance mới.

Coverage map trước chạy phải định danh DTO PageDelivery `{requested,requestLifetime,requestId,data}`, AttendancePageDto và arrays/cells/employees/projections/React data owners liên quan; phân biệt runtime object với AllocationSite/code literals. Không chỉ grep constructor name hoặc employee ID lặp lại. Không phân loại được live data/retaining root hoặc thiếu signature/projection coverage→Missing evidence, không PASS. Browser native/code được tách theo graph facts, không chỉ tên “app”/“automation”. Không giữ strong JSHandle/array clone/debug store của observer khiến generation sống giả; observer identities/console handles/telemetry aliases được loại khi kiểm product path. Không thêm product global/debug API hoặc dependency như một hệ quả ngầm của approval contract.

### H2 — Không thêm tập dữ liệu retired giữa các checkpoint tương đương

“Thế hệ” là delivery/request lifetime và **object identity của data/projections**, không phải danh sách employee IDs (các fetch có thể cùng IDs). Inventory role được review/pin **trước đo** từ source/model: displayed/current delivery, active query, deferred chỉ khi guard thực sự hold, draft/source frozen chỉ khi flow đó active; trong loop idle/closed-editor thì không có deferred/draft pending. Nếu framework giữ alternate render, phải chỉ rõ role, bound/lifecycle từ implementation và bằng chứng identity; không tạo nhãn “cache hợp lệ” sau khi thấy FAIL. Callback còn reachable không tự biến mọi DTO cũ nó giữ thành dữ liệu current.

Ở S_i, tách `P_i` data có active owner được chỉ rõ và `R_i` data retired còn reachable từ product roots; phân loại transitive payload/projections, không chỉ vỏ DTO. Code/native không chứa product payload không thuộc R_i nhưng vẫn nằm nguyên trong total budget.

**Predicate hữu hạn đề nghị: `R_i ⊆ R_0` theo identity cho mọi i=1…10; các thành phần product-data dưới baseline residual không được bổ sung node thế hệ mới.** Đồng thời P_i không vượt số role/multiplicity đã pin từ lifecycle. Một retired measured-cycle generation/cell/projection còn ở checkpoint kế tiếp không có role cho phép là FAIL, kể cả tổng DTO count không đổi do generation khác vừa biến mất. Bằng chứng phải có root/path không cần automation/telemetry, hoặc callback/registration owner đang giữ nó; so set IDs và paths, không suy từ net bytes0. Khi i10, phải đối chiếu identity các thế hệ đã retired trong interval, không chỉ count2. Không xác định được ownership/retired status→Missing evidence.

Điều này dùng chính baseline object set làm mốc, **không** cho phép một “tolerance2DTO” hay ngưỡng byte/slope mới. Nó kiểm việc thêm retention trong interval đã định, không chứng minh mọi generation đã từng tồn tại giữa hai checkpoint đều được quan sát hoặc không có leak chậm sau10cycles. Việc map toàn bộ data roots/role thực tế là prerequisite cần chứng minh, chưa được đáp ứng bởi R2.

**Rủi ro người dùng cần chấp nhận khi chọn A:** initial DTO148965 ở R2 được callback trên live button giữ ở cả hai endpoint. Nếu validation mới xác nhận nó đã có ởR0 và không phát sinh thêm data retired trong interval, sự tồn tại cố định đó không tự FAIL tiêu chí *accumulation* mới. Nó vẫn là known residual, chưa chứng minh vô hại và không phải fix/leak closure; phải ghi source root, payload coverage, bytes/identities và trạng thái concern riêng. Predicate không miễn nó khỏi cleanup T hoặc nghiệp vụ stale-callback correctness. Không có dữ liệu để hứa implementation hiện tại đạt các điều này. B chỉ từ chối amendment và giữ các FAIL hiện hành chưa được giải quyết; B không chứng minh hoặc enforce mọi DTO obsolete được release. Nếu người dùng yêu cầu mọi DTO obsolete biến mất ngay cả baseline, cần quyết định một contract mạnh hơn riêng; không ngầm nhận điều đó đã đạt.

### H3 — Query/cache/timer/listener theo owner, không dựa vào count plateau

- **Query:** ở mọi S_i idle/active, đúng1live attendance query và1observer phục vụ envelope hiện tại; không inactive attendance page cache/retired observer, gcTime0 theo policy hiện hành; canonical/deferred đang active chỉ được tính theo role đã pin ở đúng checkpoint tương ứng. Check key/lifetime/data ID, không chỉ `.length`. Ở T, attendance query/data/observer thuộc mounted lifetime vừa kết thúc phải0; QueryClient cho feature khác không bị đòi bằng0.
- **Timers/jobs:** giữ11raw counts của wrapper timeout/interval; bổ sung inventory theo owner/purpose, handle identity, schedule/cancel/fire/retire và epoch/generation. Tại S_i chỉ có jobs thuộc active lifecycle hoặc deadline in-flight thật được source cho phép; không timer/RAF/debounce/retry/abort-related callback của retired lifetime tự reschedule hoặc giữ thêm generation. Deadline native AbortSignal.timeout15s phải được phân biệt với JS timeout wrapper; count2 hiện tại không bao phủ nó. Không đủ attribution/cancellation/lifetime evidence→Missing evidence. Ở T, registrations thuộc attendance mount hết; timer session chung chỉ được còn nếu owner session vẫn active, logout thì phải xử lý theo lifecycle session đã duyệt. Không thay poll15s/retry1s/3s/debounce300ms để làm test đạt.
- **Listeners:** giữ11DOMCounters counts như diagnostic, ghi product registration identities `{target,type,capture,callback/owner,lifetime}` và expected multiplicity theo owner source; mỗi retired component/gesture/editor listener phải remove khi lifecycle kết thúc, không duplicate registration tăng qua navigation, không callback cũ giữ measured-cycle payload. React delegated/global/harness listeners được kê scope riêng; một target HTMLElement count không chứng minh callback data bounded. Ở T không còn attendance-owned listeners trên document/window/retired nodes hoặc callback giữ attendance data. Total listener dao động982/998 chỉ là facts, không tự biến thành tolerance16. Chưa quan sát được ownership/cleanup→Missing evidence.

Giữ mọi assertion hiện hành độc lập trừ đúng total-trend hardgate đã chỉ rõ; tăng count do duplicate/stale owner là FAIL ngay cả series có plateau nên strict-every-step test cũ lọt. Số handle/timer/listener hợp lệ phải suy được từ owner lifecycle, không pin “max từng thấy” sau chạy.

### H4 — DOM và release

Ở S_i kiểm expected live rows/cells/heading/table/editor theo page envelope/31days/active kind, không mặc định mọi config1817nodes/620buttons. Không có hidden all-page/fullmonth tree, editor đóng, page trước không retained như detached product subtree giữ retired data/handlers. Graph phải chỉ ra product-owned detached tree nếu có; không lấy `document.querySelectorAll('*')` làm phép đếm detached DOM. DOMCounter/native records có thể khác live DOM; cần classification/path, không tự coi mọi native UndoStack/Performance entry là product leak.

Ở T sau cleanup và GC, không còn attendance-owned data graph/DOM/registrations của lifetime vừa unmount/logout reachable qua **product** root. Nếu còn vì inspector/observer/browser history thì giữ nguyên graph/path, chứng minh root riêng và report giới hạn; không trừ bytes khỏi budget hoặc gọi đó là product cleanup đã fail nếu chưa có product path. Unknown path/weak-edge semantics không đủ kết luận→Missing evidence, không PASS. Cleanup actual browser/HTTP/session/pool/PG theo existing permissions/ownership là gate riêng không bị thay.

### H5 — Phán quyết, thiếu bằng chứng và chống PASS giả

- **Failed:** budget>20% hoặc raw invalid, hay xác nhận predicate H2/query/registration/DOM/cleanup vi phạm; giữ raw/path/config/identities và trả nonzero. Có một counterexample đã đủ fail finite criterion; không đòi toàn11 bước đều tăng hoặc phải giải thích toàn heap mới được fail.
- **Not run/Blocked:** thiếu metric/prerequisite/graph/checkpoint/owner map/coverage, instrument observer giữ dữ liệu không loại được, hoặc analysis không phân biệt lifecycle; report chính xác lý do và nonzero/no PASS. Không biến unknown thành `no leak=true`; failed check đã chạy vẫn Failed, không hạ thành Not run để né.
- **PASS scoped mới:** chỉ khi budget của đủ12configs hợp lệ **và** H1–H4 thực đo/review đủ và đạt; ghi “không phát hiện thêm retained product generations/registrations trong workload hữu hạn đã kiểm”, kèm residual/coverage/GC/observer giới hạn. Không phải bằng chứng không leak dài hạn/toàn sản phẩm. Các performance metrics khác và final independent review vẫn phải đạt riêng; thiếu chúng không overall PASS.

Total strict-monotonic **không đổi** nghĩa causal proof: nó vẫn là tín hiệu cần công khai cùng Resource Timing/native/JIT data; không có chi phí nào được phép trừ khỏi20%. Nếu native/code khiến vượt20% thì vẫn budget FAIL dù không có leak sản phẩm. Nếu total<20% nhưng có retired DTO/registration trái predicate thì vẫn FAIL.

## Điều đã biết và điều chưa được kiểm chứng

Đã biết từ R2: A+2,965%/B+1,771%, cả hai nonmonotonic; graph B+222464 chủ yếu code/native, latest DTO thay thế, initial DTO còn. R1 blank/date-only là counterexamples cho suy luận strict total trend đủ chứng minh product leak. **Chưa biết:** baseline residual có release ởT hay không; có generation/projection nào tích lũy ởS1…S9; owner-complete timers/listeners; behavior200/1000/overtime với instrumentation mới; mức perturbation của11graphs; tooling coverage/prerequisites có đáp ứng nổi H1–H4. H1–H5 là tiêu chí thiết kế cần kiểm, chưa là năng lực Verified.

Đây là tiêu chí tối thiểu theo **mục tiêu finite accumulation đã nêu**, không theorem “no memory leak”. Không chọn statistical noise budget/slope/window vì không có calibration độc lập. Nếu người dùng muốn cam kết một phiên làm việc dài nhiều giờ thì10cycles không đủ chứng minh; proposal này không nhận cam kết đó và không tự đề xuất thêm trial chung.

## Validation sau approval, hữu hạn và không tìm trace xanh

1. Ghi quyết định A chính xác và sync nguồn plan/matrix/G1 references sau approval; bảo toàn nguyên raw/seals/verdict lịch sử. Main chốt scope thực thi, writer/reviewer và tài nguyên theo quyền hiện có; proposal không tự mở quyền install/device/real data.
2. Làm tooling/lifecycle evidence theo H1–H5; independent review trước dùng làm nghiệm thu. Trong tooling/coverage map được review trước campaign, pin hành động chính xác tại checkpoint T (teardown/unmount/logout), mount/session lifetime nào kết thúc, owner nào còn hợp lệ, nguồn readiness/deadline và dữ liệu cần thu. Nếu chỉ unmount attendance, ghi rõ logout/session chưa được exercise. Negative fixtures phải bắt được: heap20% boundary/above/missing/NaN/warmups sai; total strict-monotonic dưới20 được report diagnostic nhưng không tự PASS; retired DTO count giữ nguyên mà identities cũ tích lũy/thay nhau; detached payload dưới projection; duplicate/stale listener/timer kể cả count có dip; missing intermediate graph/unknown native owner/observer-held handles→no PASS. Giữ positive source-derived lifecycle cases có expected owner roles độc lập với output cần test. Không copy actual numbers thành oracle.
3. Chạy focused meaningful tooling tests + existing product:check/build cần cho thay đổi; pin reviewed script/source/runtime tại command start. Nếu coverage hoặc cleanup không đo được, báo Blocked với đúng phần thiếu; không thay bằng endpoint counts. Hạn chế phiên bản phụ trợ: giữ file versioned, không overwrite bytes rồi chỉ giữ hash như Minor R2.
4. **Một acceptance campaign mới đã định trước**, đủ12configs, correct trusted-drag instrumentation và toàn preconditioning hiện hành. Budget interval không snapshot, companion chỉ để lifecycle11checkpoints+T, không sampler hoặc sửa buffer/warmup. Raw/capture của hai phần tách riêng. Đây là validation sau contract change, không diagnostic chung để tìm PASS. Không tái sử dụng R2 để clear gate; không retry chỉ vì total monotonic/trace fail. Lỗi hạ tầng hoặc predicate phải giữ failure và chỉ sửa/rerun phần có nguyên nhân cụ thể, review lại phần ảnh hưởng.
5. Independent final review tính lại raw budget, coverage/sets/paths/cleanup và exact snapshot/source hashes. Ghi kết quả mới theo đúng H5; old4heap FAIL/fullDOM failures giữ immutable. Native/SR/phoneperf/reader/dependency/G4 vẫn Not run/Open theo từng gate; không sản phẩm Done/release/all-gates-cleared từ amendment hoặc scoped desktop PASS.

Chi phí thêm của A phải công khai trước thực thi:12budget configurations và companion132generation checkpoints cộng12teardown checkpoints; nếu dùng graph ở tất cả các mốc thì144graph captures. Thời gian/dung lượng và khả năng phân loại đủ graph **chưa được đo**, không hứa đây là phép kiểm rẻ hoặc implementation chắc chắn PASS. Đây là một campaign có hợp đồng đầu ra rõ, không chuỗi thử profiler không có điểm dừng. Nếu không muốn nhận chi phí/phạm vi finite criterion này, B là lựa chọn giữ nguyên; không rút H1–H5 xuống hai endpoint để làm nhẹ rồi gọi đạt.

## Ví dụ dễ hiểu

Chị kế toán chuyển qua lại tháng9/tháng10 để nhập công cho cùng20người. Trình duyệt có thể biên dịch thêm một đoạn mã xử lý bàn phím, giữ lịch sử thao tác Undo, và ghi mỗi lần gọi API vào sổ thời gian tải. Giống như chị dùng vẫn20hồ sơ nhân viên nhưng sổ ghi lượt mở hồ sơ dày thêm: bộ nhớ tổng tăng mà không nhất thiết cất thêm các bộ hồ sơ cũ.

Nếu ứng dụng vẫn giữ bản chấm công của lượt1, lượt2, lượt3 sau khi đã thay bằng lượt mới thì đó là dữ liệu sản phẩm tích lũy cần chặn. Vì vậy vẫn giữ trần tăng tổng20%, đồng thời kiểm **bản dữ liệu nào còn sống và ai giữ nó**. Mã/sổ trình duyệt cũng tốn bộ nhớ thật, vẫn tính vào20%; ví dụ này không chứng minh bốn FAIL cũ do sổ trình duyệt và không bảo đảm chạy lâu sẽ không leak.
