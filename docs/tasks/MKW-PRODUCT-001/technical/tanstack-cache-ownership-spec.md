# Đặc tả sở hữu cache TanStack Query cho trang chấm công

**Trạng thái: Proposed — đặc tả kỹ thuật ngày 03/11/2026.** Tài liệu này được viết sau khi người dùng chấp thuận hướng kiến trúc giữ TanStack Query5.105.0 cho server state/cache, React state cho UI/bản nháp và giảm ownership cache tùy biến. Hướng đó là **Accepted direction**; phương án handoff/lifetime cụ thể dưới đây chưa được duyệt triển khai. Không coi tài liệu là bằng chứng đã cài, đã migrate hoặc đã chứng minh hết rò rỉ heap.

## 1. Phạm vi và mục tiêu

Đặc tả này chỉ bao phủ web attendance page, full-month read/export, session cache boundary và các consumer invalidation/reconcile liên quan. Mục tiêu là có một chủ sở hữu rõ cho mỗi loại state, dùng public TanStack Query APIs ở ranh giới framework, và giữ nguyên các bảo vệ nghiệp vụ đã có: session epoch, generation, cancellation, CAS/revision, deferred membership, unknown write và original-key reconcile.

Ngoài phạm vi là đổi API/DTO/DB order, đổi giao diện giữ bản nháp, thêm Zustand/RTK/SWR, đổi dependency/version, hạ performance budget, đổi heap acceptance amendment A/H1–H5, hoặc hứa thư viện tự giải phóng callback tùy ý. Không đưa `keepPreviousData` vào để âm thầm thay UX: displayed/deferred envelope vẫn là quyết định của feature. [Design15](../design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026) và [API8](api-contract.md#8-đọc-trang-server--thiết-kế-đã-duyệt01112026) sở hữu hành vi/wire đã duyệt; [ADR-002](../../../architecture/decisions/ADR-002-state-management.md) và [ADR-003](../../../architecture/decisions/ADR-003-product-stack.md) sở hữu lựa chọn state/stack lịch sử.

## 2. Điều đã được duyệt và điều còn Proposed

| Nội dung | Trạng thái và nguồn |
| --- | --- |
| TanStack Query cho dữ liệu API/cache; React state cho selection/editor/draft; Zustand chỉ khi có nhu cầu UI cụ thể | Accepted trong ADR-002/003 và hướng người dùng 03/11/2026 |
| Giữ bản nháp qua poll, CAS/revision, unknown write, reconcile original keys, page clamp và session isolation | Đã có trong design/API/plan và source/tests hiện tại; phạm vi contract hiện hành |
| Dùng public `useQuery`, `QueryClient.cancelQueries/removeQueries/invalidateQueries`, `setQueryData` khi thật sự cần; tránh `QueryCache.build`/`Query.setOptions` | Proposed design của spec này |
| Handoff clamp một lần qua public `useQuery.queryFn`; `gcTime:0` cho mọi page query từ khi tạo; không tạo canonical Query trực tiếp | Proposed, phải có implementation plan và test tương đương trước khi migrate |
| Bỏ `gcTime:Infinity`, direct `cache.build` và `Query.setOptions` hiện tại | Proposed simplification, chưa được chấp thuận và chưa chứng minh an toàn |
| Heap amendment A/H1–H5, performance/native/SR/G4 | Pending/Failed theo hồ sơ hiện hành; spec không sửa hoặc waive |

ADR-002 là quyết định lịch sử về lựa chọn/phân trách nhiệm, không được đọc như capability đã có ở thời điểm ADR. Phiên bản local thực tế được đọc là `@tanstack/react-query` và `@tanstack/query-core`5.105.0 từ package store; không cài hoặc nâng cấp.

## 3. Bằng chứng source hiện tại và điểm custom cache

| Vị trí | Quan sát hiện tại | Lý do tồn tại hiện tại | Hệ quả sở hữu |
| --- | --- | --- | --- |
| `apps/web/src/features/attendance/api/use-attendance-page.ts::useAttendancePage` | Query key page là user/epoch/month/q/page/pageSize; `useQuery` dùng `staleTime:Infinity`, `gcTime:0`, `structuralSharing:false`, `refetchInterval`15s khi page đã displayed/visible, retry read tối đa2 | Query chỉ phát request/page delivery đúng session generation, không giữ bản sao table | Query là server-data owner; feature chỉ giữ envelope/tag để kiểm stale |
| cùng file, layout effect trước enable | `cancelQueries` exact cho prior+target, đọc delivery, remove nếu lifetime không khớp rồi mới `ready` | Không để request/query cũ của generation/session đi vào query mới | Cần giữ cancellation, lifetime filter và signal guard; đây không phải cache tùy ý |
| cùng file `adoptAttendancePage` | `client.getQueryCache().find` → `cache.build(...gcTime:Infinity)` nếu thiếu; `canonical.setOptions(...gcTime:Infinity, structuralSharing:false)`; `client.setQueryData(canonicalKey, delivery)`; remove requested key | Handoff server clamp: requested page40 có effective page39; giữ đúng `PageDelivery` reference qua rerender trước observer canonical subscribe; tránh timer GC5 phút của default QueryClient | Đây là direct Query-core internals cần loại bỏ hoặc cô lập. `setQueryData` và `removeQueries` là public; `cache.build`/`Query.setOptions` không được dùng trong target design |
| cùng file canonical cleanup effect | `canonicalKeys` map giữ key+lifetime; unmount dùng `client.removeQueries` predicate `observers===0` và matching lifetime | Dọn canonical inactive sau observer detach; bảo vệ same-key generation và unmount trong handoff gap | Map hiện tại không giữ Query objects; nó giữ registry phải tự quản vì canonical Infinity |
| `apps/web/src/features/attendance/api/query-keys.ts` | `invalidateAttendancePages`/`Scope` dùng public `client.invalidateQueries`, `refetchType:"active"` và predicate user/epoch/month | Save employee/attendance chỉ refetch query đang mounted; không refetch mọi page inactive | Giữ nguyên public invalidation và key scope; không sao chép query data sang store |
| `apps/web/src/features/session/model/session-runtime.ts` | `clearSessionCache` gọi `boundary.invalidate`, public `cancelQueries()` rồi `queryClient.clear()`; logout/account-change/expiry dùng cùng boundary | Chặn write/read muộn và xoá dữ liệu private khi session đổi | SessionRuntime sở hữu toàn client clear; attendance không được clear client riêng |
| `apps/web/src/features/attendance/api/use-attendance-month.ts` | Full-month query dùng `gcTime:0`, visibility, poll15s, focus/reconnect và signal | Full month là snapshot/export/read oracle riêng, không là page subscription | Không hợp nhất fullmonth vào page cache |

Đối chiếu package local5.105.0 cho thấy `Query.setOptions` được source đánh dấu `@internal`; `QueryCache.build` là đường cấp core cho adapter/plugin; `Removable.scheduleGc/updateGcTime` là protected internal. Query core chọn `gcTime` dài nhất trên các option áp dụng; vì vậy observer `gcTime:0` không hạ default5 phút của một Query đã được tạo bằng `setQueryData` trên QueryClient mặc định trước observer. Constructor, final observer detach và `fetch.finally` có thể schedule GC; remove khỏi cache không đủ chứng minh instance rời cache không còn timer. `Infinity` hiện ngăn việc schedule trên canonical instance đã bị retire. Đây là rationale từ source/test hiện tại, không là chẩn đoán nguyên nhân heap lịch sử.

## 4. Ranh giới ownership

| Chủ sở hữu | Được giữ | Không được giữ/copy |
| --- | --- | --- |
| TanStack Query `useQuery`/QueryClient | `AttendancePageDto` bọc trong `PageDelivery`, full-month `MonthDto` khi có consumer, trạng thái fetch/error, retry, refetch, signal, cache lifetime theo query key | Draft/raw input, selected cells, CAS decision, UI guard, store riêng chứa rows/cache clone |
| `usePageView` + `AttendanceWorkspace` React state | `desired`, `displayed`, `deferred`, requested/effective criteria, request generation, decision accepted/deferred/ignored, scroll/focus intent | Một bản DTO sâu mới; không tự filter/sort/calculate server totals; displayed delivery phải cùng reference từ Query |
| `AttendanceDraft`/selection model | raw value/reminder/custom/error, frozen cell/employee revision và bounded cell/employee copies cho intent, source/target/ordered keys, ownerGeneration, pending outcome và recovery intent | Bản sao toàn server cache để rebase khi poll; page membership làm mất frozen original keys; Query object |
| `SessionBoundary`/`SessionRuntime` | user identity, epoch, abort controllers, account-change/logout clear và dirty draft policy | Attendance-specific page keys hoặc bản sao server data |
| API transport/feature API | POST search criteria, full-month GET, export Blob, signal/expectedEpoch, retry classification | Cache lifecycle, optimistic saved state, tự retry write/unknown |
| Server/DB | canonical order/search/totals, auth, revisions/CAS, atomic write, unknown-write truth và reconcile | Client cache/draft assumptions |

Mỗi delivery giữ cùng reference khi đi từ query result qua `acceptPageResponse` tới displayed envelope. Khi deferred, displayed có thể giữ một delivery cũ và deferred/query giữ delivery mới nhất; không buộc chúng thành một snapshot rồi mất guard. `PageViewState` là điều phối lifecycle, không phải global server-data store. `toPageTable` chỉ tạo wrapper/projection dùng lại employees/cells/totals references, không clone DTO hoặc dựng lịch sử page. Bounded frozen copies trong draft/selection và `current` reconcile snapshot độc lập là cần thiết cho CAS/đối chiếu, không phải cache phụ.

## 5. Thiết kế Proposed: public API handoff và lifetime

### 5.1 Page query bình thường

`useAttendancePage` tiếp tục là producer duy nhất cho `/attendance/search`. Giữ key `["attendance","page",userId,epoch,month,q.trim(),page,pageSize]`, không thêm kind/generation vào key; generation/requestId chỉ metadata để guard, kind dùng cùng payload có cả hai loại. q chỉ trim ở web, giữ case và ký tự literal; không URL/log/persist q và không lower/sort lại trên web. Server vẫn sở hữu DB search/order và clamp theo contract. Option chuẩn:

- `staleTime: Infinity` coi data không stale theo thời gian; không đồng nghĩa `gcTime:Infinity` hoặc `staleTime:"static"`. Nó tránh mount refetch thừa sau handoff; explicit invalidation, focus/reconnect `always` và 15s polling vẫn hoạt động. Mount/remount không data vẫn fetch; navigation về cùng key với generation mới vẫn phải fetch mới sau eviction, không retag cache cũ.
- `gcTime: 0` cho page query và full-month query. Query phải inactive thì GC có thể diễn ra; feature cleanup exact key được phép dùng public `removeQueries` để đóng gap unmount, nhưng không đọc/chỉnh `Query` internals.
- `structuralSharing: false` giữ identity/tag của delivery; không để deep structural sharing biến response mới thành response cũ.
- `refetchIntervalInBackground:false`; visibility false không poll. 4xx dừng retry/auto polling, nút retry là explicit; lỗi 5xx đọc retry theo policy hiện hành.
- `queryFn({signal})` truyền signal xuyên `readAttendancePage` → `apiRequest`; signal bị abort khi Query hủy và SessionBoundary abort khi epoch đổi. Sau body vẫn kiểm mounted, user/epoch/generation, signal và authenticated status trước khi publish.

Identity/epoch trong key không thay auth guard. SessionRuntime invalidate epoch và abort tracked controllers trước clear; transport kiểm expectedEpoch trước fetch và session sau body, page producer kiểm generation/mounted hai phía await để chặn mock/body không chịu abort. Refresh cùng user và absolute expiry hiện hành giữ continuity, không tự tăng epoch/hủy draft; reauthentication tạo epoch mới, giữ raw cùng user nhưng lease draft cũ không được submit trước reconcile. Account-change giữ cảnh báo cho draft cũ và không mount dữ liệu account mới cho đến quyết định clear; logout explicit discard xóa sensitive state. Không localStorage/URL/IndexedDB/offline draft mới.

### 5.2 Canonical handoff một lần qua query function

Server có thể trả `requestedPage != pagination.page`. Giữ `PageDelivery.requested` và `data.pagination.requestedPage` gốc; chỉ `desired` và `displayed.criteria.page` đổi về effective page. Handoff không là request HTTP mới, không tăng requestId/generation và không sửa tag của response. Query function được phép resolve dữ liệu đã có; việc cấp seed cục bộ này khác dispatch HTTP mới.

Phương án được đề nghị để review dùng public `useQuery` và public `QueryClient` filters; không có imperative canonical cache seed trước render:

1. `acceptPageResponse` kiểm lifetime/criteria/request ordering. Khi `accepted`, React view giữ chính delivery reference và chuyển desired/displayed criteria về effective page trong một update. Workspace bỏ lệnh imperative `adoptAttendancePage` ghi cache sau accept; deferred release đi qua cùng accept. Nếu render bị trì hoãn, delivery còn ở displayed/deferred owner hiện hành, chưa có canonical cache seed inactive cần Infinity bảo vệ.
2. Producer nhận một **ứng viên handoff** từ `displayed.delivery`, chỉ hợp lệ nếu nó là accepted clamp, cùng user/epoch/generation và month/q/pageSize, effective page bằng desired page. Không dùng delivery deferred chưa accepted, displayed từ generation trước, hoặc cached return A→B→A. Đây là tham chiếu đến cùng DTO, không một store/cache mới.
3. Giữ readiness barrier hiện tại: vô hiệu hóa dispatch và emission của target cho tới khi public `cancelQueries` exact prior+target hoàn tất; kiểm lại owner/binding sau await. Với handoff, đọc target qua `getQueryData`; nếu có delivery **khác chính reference ứng viên**, evict exact target sau cancel, kể cả bytes/lifetime bằng nhau. `initialData` không được dùng để ghi đè cache vì nó chỉ seed khi thiếu data. Với navigation bình thường, evict target thuộc lifetime cũ như hiện tại. Kết quả query trước barrier không được đưa vào accept; tránh cached canonical cũ thắng accepted clamp trong một render trung gian.
4. Canonical observer được tạo qua `useQuery` với `gcTime:0`/`structuralSharing:false` ngay từ lần tạo Query đầu; **không** `setQueryData` tạo Query bằng defaults5 phút, không `initialData`, không thay defaultOptions toàn app. Khi enabled và target chưa có đúng delivery, lần queryFn đầu kiểm ứng viên còn current/signal trước và sau resolve, trả **đúng delivery reference**, không gọi `readAttendancePage` và không tăng HTTP requestId. Query tự publish data qua pipeline thông thường. Giữ marker đã consume theo lifetime + delivery requestId, chỉ chứa metadata; poll/focus/reconnect/manual/invalidation sau đó phải dispatch HTTP thật với criteria canonical, tăng requestId tại dispatch thật.
5. Khi Query đã nhận đúng seed, xóa tham chiếu handoff riêng nếu có; displayed vẫn là owner view hợp lệ. QueryFn/callback đọc candidate mới nhất qua ref của owner, không đóng trên payload seed cũ trong closure dài hạn. Navigation/session/unmount hủy candidate/marker; nếu task handoff bị cancel thì không publish và không dùng lại candidate ở generation mới. Target giữ đúng reference rồi thì không local-dispatch hoặc fetch thêm chỉ vì canonical rerender.
6. Khi canonical observer đã chuyển, requested Query cũ detach và GC với0; public exact `removeQueries` được giữ cho eviction stale target, không xoá requested Query đang được observer sử dụng giữa accept và React commit. Sau settled handoff chỉ một page Query/observer current; unmount-before-canonical-render không tạo canonical entry, signal cũ bị abort và requested entry GC. Bỏ toàn bộ `canonicalKeys` retention registry/Infinity cleanup chỉ khi tests chứng minh các hậu điều kiện này.

Delivery local handoff đã được view accept trước đó nên khi được canonical Query phát ra lại, `acceptPageResponse` có thể trả `ignored` theo duplicate ID/requested criteria; đó là kết quả đúng, không retag hoặc accept lần hai. Lần poll HTTP kế tiếp capture effective criteria thật, requestId mới, và có thể được accept. `fetchedAt`, pagination status, rows, row totals và monthTotals luôn từ `displayed.delivery.data`; không dùng Query `dataUpdatedAt` của handoff làm thời điểm server đọc mới. Không network request bù chỉ để seed canonical.

Explicit reload/retry/invalidation không được hoàn tất bằng seed cũ. Nếu trigger đọc mới đến **trước** local adoption bắt đầu, producer ghi nhu cầu đọc của binding và dispatch HTTP canonical thay local seed khi readiness đạt. Nếu local adoption đã bắt đầu, hoàn tất/loại adoption theo guard rồi chạy đúng một canonical HTTP read cho nhu cầu đọc đang chờ; không local-adopt lại. Invalidation state phải được ghi nhận trước eviction target và recheck khi ready để không mất invalidation trong lúc disabled; manual refetch cũng qua readiness, không bypass guard. Trigger trùng trong cùng lần chuyển được gộp, không tạo hai HTTP cho cùng trigger. Sau response mới, acceptance theo requestId/criteria hiện hành. Marker/nhu cầu đọc chỉ là metadata lifecycle, xóa khi navigation/session/unmount đổi; không timer hoặc payload queue mới. Focus/reconnect/poll sau canonical readiness cũng là read thật. Cần test trigger chen giữa handoff; đây là điều phối tại producer, không một scheduler/cache mới.

Ứng viên bị loại trong lúc session/navigation đổi là stale work và phải im lặng như hiện tại. Nếu binding vẫn current nhưng ứng viên handoff mất/sai reference ngoài nhánh eviction đã mô tả, fail closed bằng trạng thái error/readOnly với envelope đã accept được giữ và đường Thử lại hiện hành; không treo busy vô hạn. Retry chủ ý dispatch canonical HTTP thật, không loop local seed, không tự báo empty/saved. Cancel sau khi consume seed cũng không cho tái dùng seed vô hạn: binding mới bị guard loại; nếu vẫn cùng binding và chưa có data thì dùng cùng error/retry path. Đây là lỗi lifecycle phải được test, không thể chữa bằng retag response cũ. Invariant hiện có là một Workspace/page producer cho session; không thêm multi-owner cùng key trong scope này. Consumer mới cần concurrency design riêng trước khi chia sẻ owner key.

Nếu public queryFn handoff không đạt test tương đương, migration dừng, báo finding và giữ code cũ; không tự fallback/upgrade, tăng `gcTime` hoặc hạ assertion. Spec này không chọn thêm thư viện hoặc một fallback cache thứ hai.

### 5.3 Các public API alternatives đã đối chiếu

`initialData` là public và thuận tiện nhưng core5.105.0 giữ `#initialState` từ seed để `reset()` quay về nó; seed có thể sống cùng Query sau các poll mới. Vì mục tiêu giảm retention ownership, spec **không chọn** nó cho canonical handoff. Tài liệu v5 cũng nói initialData persisted và không nên là partial data. Không gọi nó là leak đã chứng minh; đây là trade-off lifecycle cụ thể.

`setQueryDefaults` + `setQueryData` có thể loại `build/setOptions` nếu defaults được thiết lập **trước** Query đầu tiên, nhưng `gcTime:0` vẫn có thể GC seed inactive trước React commit bị trì hoãn. Đặt Infinity/finite grace rồi tự cleanup tiếp tục giữ ownership custom và không hạ được longest-gcTime của instance cũ. Không chọn grace timeout hoặc per-key defaults registry mới. `setQueryData` vẫn được phép ở consumer khác có use case đã duyệt; spec chỉ bỏ đường seed canonical này.

`placeholderData:keepPreviousData` chỉ thay dữ liệu hiển thị của observer, không canonicalize accepted delivery hay bảo vệ frozen draft/deferred membership. Không chọn vì cần giữ toàn displayed envelope và status lỗi/context gốc. RTK/SWR không được chọn; Zustand vẫn conditional như direction đã duyệt, không khảo sát lại stack.

### 5.4 Lifetime và inactive policy

- Mounted idle current page sau readiness/GC settled: đúng một attendance page query và một observer cho owner, canonical key đúng criteria/effective page và lifetime hiện hành; không inactive history. Giữa render/GC có thể có prior+target tạm thời, không coi count tức thời là leak hay đạt gate.
- Navigation: hủy prior+target exact trước enable; query cũ không được publish dù response body bỏ qua abort.
- Draft hold: query vẫn có thể poll cùng criteria; membership đổi thành deferred, giữ nguyên displayed rows/totals/fetchedAt/raw/frozen revisions. Không `keepPreviousData` để thay thế guard; old envelope là state feature.
- Release/Discard: deferred mới nhất được accept qua cùng canonical handoff. Discard không hủy write đã gửi; Keep không nhận membership mới.
- Unmount: observer detach/signal abort, page GC0 sau fetch/cancel và GC callbacks settled; không có canonical registry phải giữ lại. Logout/account change/expiry: SessionRuntime invalidate epoch trước `cancelQueries()` + `clear()`; không attendance code gọi global clear. Unrelated key trên cùng QueryClient vẫn giữ khi chỉ unmount attendance.
- Cache có thể giữ trong khoảng synchronous handoff/GC event-loop; acceptance bắt buộc xác nhận sau unmount rằng attendance page namespace không còn entry inactive và không còn timer owner, trong khi unrelated key giữ nguyên. Không diễn giải đó là proof mọi callback/native allocation được giải phóng.

### 5.5 Failure behavior và invariants

| Tình huống | Hành vi bắt buộc |
| --- | --- |
| response late sau abort/navigation | `StalePageRequest`/guard loại khỏi Query result; displayed và draft không đổi; không retry/publish |
| response khác user/epoch/session | transport/boundary trả session error; query cũ bị cancel/remove; không hiển thị hoặc ghi cache sang user mới |
| requested page bị clamp | canonicalize desired/displayed về effective page sau accept; không retag requested key, không duplicate DTO; status nói rõ page adjusted |
| handoff candidate thiếu/sai reference khi binding còn current | giữ accepted displayed envelope, error/readOnly với Thử lại; retry chủ ý dispatch canonical HTTP thật; không publish cached target cũ, treo busy hoặc loop local seed |
| navigation 4xx/5xx | old displayed envelope giữ khi có; target readOnly/error phân biệt; 4xx không auto retry, retry explicit; không làm bảng trống giả |
| unknown write/response mất sau commit | không tự retry; reconcile theo original keys/identity/revision, server là truth; giữ draft/outcome cho lựa chọn rõ |
| CAS 409/stale source | giữ toàn draft/batch atomic, không rebase theo page membership; recovery đọc original union keys và ghi tường minh |
| nhiều Workspace/page producer chia sẻ key | vi phạm invariant scope; dừng migration/review, không thêm cơ chế observer ownership tưởng tượng hoặc xoá cache dùng chung để che lỗi |

## 6. Polling, invalidation, reconcile và export

Page polling chỉ chạy khi displayed envelope cùng desired criteria/lifetime (`canPollPage`), document visible và không có lỗi dừng. Focus/reconnect dùng refetch `always` như hiện hành; poll không steal focus, không rebase draft hoặc selection. Invalidation sau attendance save dùng `invalidateAttendancePages` cho mọi q/page cùng tháng và `refetchType:"active"`; employee save dùng `invalidateAttendanceScope` user/epoch. Không prefetch mọi page, không client filter và không copy page data vào store.

Poll cùng IDs/order/effective page cập nhật toàn envelope mới (gồm global totals/fetchedAt) nhưng không đổi raw/reminder/custom/error/mode/targets/source/employee-cell revisions của draft. Membership/order/effective page đổi khi có edit thì deferred mới nhất thay deferred cũ, displayed header/footer/rows vẫn nguyên; Keep không mở lại modal mỗi poll trong cùng draft lifetime. Guard action kiểm đúng draft instance + ownerGeneration + epoch trước discard/action; PageLifetime generation vẫn riêng. Pending/reconciling khóa transition, new selection/editor bị chặn khi readOnly; intent draft hợp lệ vẫn có thể Save với CAS cũ. Search debounce300ms/Enter/IME, q/month/size reset page1, kind giữ criteria và page-local selection/fill không thay đổi.

`reconcileByIdentity` là POST read có thể retry theo read policy (tối đa2 ở1s/3s, không4xx) nhưng không tạo write fence. Reconcile request gửi original employee IDs và target/source keys, **không gửi expected revisions như write**; response current riêng cung cấp revisions cho lựa chọn recovery rõ. Kể cả employee rời page/tháng vẫn đọc original union keys; lỗi đọc không có nghĩa missing và không suy missing từ membership/cache. Recovery mới gửi expected employee/cell/source revisions, giữ cùng mode/targets và explicit value/reminder cho patch-cell, kể cả no-op hợp lệ. Unknown write không tự retry, không optimistic saved; abort/discard/read/current-value-equality không chứng minh write cũ kết thúc. Chỉ accepted eligible write tạo fence đúng tài nguyên; source/skip/N/—/occupied fill-empty/eligible0 không được biến thành fence. Không chuyển write lifecycle sang auto `useMutation` retry/optimistic cache patch trong task này: `AttendanceDraft` hiện là owner phân loại saved/rejected/conflict/unknown và pending dedupe.

Full-month GET giữ `MonthDto`/query key riêng `["attendance",userId,epoch,month]`, không đồng nhất page DTO thành MonthDto hoặc table full subscription. Tổng hàng là cả tháng của người trên page; footer global gồm cả ngoài page/không khớp q và không cộng draft. Export **không là Query**: React `ExportButton` key `export-${month}`/AbortController + `downloadAttendance` nhận Blob riêng, abort khi unmount/đổi tháng, SessionBoundary chặn body/response muộn khi epoch đổi. Không đưa Blob vào page/fullmonth cache, không đọc draft/cache để build Excel, không auto retry/save. Server full snapshot và workbook giữ order/totals chung theo DB authority, hai bảng Công/Tăng ca/cached SUM; thời điểm export có thể khác page fetchedAt. Invalidation không tự khiến export retry hoặc sửa draft.

## 7. Không dùng các cách sau

- Production feature không import `Query`, `QueryCache` để điều khiển lifecycle hoặc gọi `getQueryCache().find/build`, `Query.setOptions`, protected `scheduleGc/updateGcTime`. Public query-option callbacks và `QueryClient` filters được đọc `queryKey/state.error` như hiện tại; không giữ Query object trong registry hoặc tự mutate nó. Harness có thể inspect cache/observer read-only để kiểm hậu điều kiện.
- Không đặt `gcTime:Infinity` ở canonical page trong target design; nó tắt tự GC, buộc manual cleanup. Giữ nguyên code hiện tại cho đến khi tương đương được chứng minh, không kết luận workaround hiện tại sai chỉ từ tên Infinity.
- Không dùng `keepPreviousData`/placeholder để lén giữ envelope khi draft guard cần deferred semantics; không đổi displayed envelope trước accept.
- Không thêm Zustand/RTK/SWR, Redis, prefetch all-pages, client-side sort/filter, duplicate DTO projection hoặc `useRef` làm cache thứ hai.
- Không claim heap trend, query count hoặc endpoint count là proof no leak. Promise/callback/native browser records ngoài Query cache cần owner cleanup riêng nếu source thực sự sở hữu chúng.

## 8. Acceptance và migration gates (cho implementation plan sau)

Spec chỉ được chuyển sang plan sau written-spec approval. Implementation phải đạt tối thiểu:

1. Ranh giới tĩnh: không còn production feature import/core call `QueryCache.build`/`Query.setOptions`/`gcTime:Infinity`; mọi cache action qua `useQuery` hoặc public `QueryClient` methods.
2. Hành vi hiện hành: toàn bộ test page-view/workspace/query vẫn giữ semantics A→B→A, clamp, deferred membership, stale response, session reauth/account change, error/retry, poll/focus/reconnect và no hidden writes.
3. New negative tests: seed lifetime/user/epoch mismatch, target old generation và target bằng bytes/sai reference, duplicate local handoff, cancel trong handoff, unmount trước canonical render, delayed JSON sau abort và stale retry closure. Tests phải thất bại nếu bỏ cancellation/lifetime guard hoặc dùng lại old target data; không thêm production diagnostic API.
4. Reference/invariant: accepted delivery identity ở displayed và canonical Query; no deep DTO clone ngoài frozen intent cần thiết; current idle page có đúng một query/observer. Handoff không tăng HTTP count/requestId; poll/invalidation kế tiếp phải HTTP đúng effective page và ID mới. Kiểm key/data/lifetime/reference, không chỉ `.length`.
5. Lifecycle API: signal đến fetch, giữ visibility/poll/retry/4xx; `SessionRuntime.clearSessionCache` vẫn là global clear duy nhất; CAS/unknown/reconcile và original-key semantics không đổi. Manual/invalidation chen giữa handoff phải có fresh canonical HTTP read, không bị seed nuốt; unmount/session change không phát request đang chờ.
6. Validation ghi command, package/version/runtime, base→tip, kết quả và giới hạn. Performance/heap/native/SR là gate riêng; không suy thành approval amendment A/H1–H5 hoặc performance waiver.

Các test đã có phải giữ assertion hành vi; được thay assertion **cấu trúc seed** để phản ánh thiết kế không tạo entry trước render, nhưng không giảm hậu điều kiện cleanup/reference/no extra HTTP:

| Rủi ro / owner nguồn | Bằng chứng tương đương cần giữ hoặc bổ sung |
| --- | --- |
| `api/use-attendance-page.test.tsx` | Exact4-field POST body/trim/key omit kind+generation; poll14999/15000ms, hidden/unmount không dispatch;4xx stop;5xx1s/3s; write1 attempt; invalidation mọi q/page+legacy đúng month/user/epoch, chỉ active refetch |
| `model/page-view.test.ts` + `use-page-view.integration.test.tsx` | A→B→A delayed body, request criteria/lifetime/ID mismatch, same-user reauth/other-account, cached return không retag, await prior+target cancel, stale retry không dispatch; desired/displayed/deferred nguyên envelope |
| `poll_and_accepted_clamp_share_dispatch_metadata`, `held clamp preserves the whole old envelope until release adopts latest delivery` | Same delivery/DTO reference, requestPage40/effective39 không retag, cancellation barrier trì hoãn và equal-bytes target cũ không thắng; post-handoff poll gửi39. Thay kiểm cache seed trước rerender bằng kiểm view giữ exact reference, chưa có canonical seed inactive, sau rerender canonical đúng reference; không HTTP seed request mới |
| `same-key generation retires the canonical instance without retaining a GC timer`, `canonical poll body cannot publish after navigation cancels its context`, `unmount during accepted handoff...` | QueryClient vẫn sống, unrelated entry còn, current và retired Query observer0 sau unmount, page namespace0 và fake timer0 sau settled callbacks/body; chờ thêm30s không dispatch; remount fetch fresh/ID1/displayed null. Không dùng `client.clear` trước assertion để giả cleanup; không chỉ namespace0 mà bỏ retired timer assertion |
| `ui/attendance-workspace.test.tsx` | Real QueryClient + view/session composition, actual hook producer; old rows giữ old labels khi loading/error, initial error khác empty, held clamp giữ raw/baseline/footer/fetchedAt, explicit discard accept mới; scroll/focus/IME/guard/pending/no navigation write |
| `model/attendance-session.test.ts`, `attendance-draft.test.ts`, `bulk-draft.test.ts`, selection/context tests và actual pagination recovery suites | Same-user draft giữ raw nhưng phải reconcile epoch mới; account switch/logout clear; frozen revisions/source/targets và nguyên batch409; unknown reconcile original keys ngoài page/tháng, read không fence; không rebase hoặc đổi N/—/reminder behavior |
| `ui/export-button.test.tsx`, `api/use-attendance-month.test.tsx`, fullmonth/Excel integration | Full GET/export semantics và cancellation không đổi; page table không fullmonth subscription; export không draft/cache/write, no retry ngầm; fullmonth/order/totals không thành page-only |

Test read-only inspection dùng API công khai của QueryCache/observer khi cần đối chiếu count/data trong harness; đó không là quyền feature mutate core. Timer seam đã có `vi.getTimerCount()` với QueryClient sống, còn actual body-delay/epoch tests kiểm signal; không cần protected timer fields. Product check/focused/browser/PG/performance commands và thứ tự thực thi sẽ thuộc plan sau approval, chưa chạy trong task spec này.

## 9. Nguồn và provenance

Tài liệu chính thức TanStack Query v5 (đọc mạng read-only, HTTP200 ngày03/11/2026). Trang docs có thể đổi theo v5 hiện hành; hành vi phụ thuộc implementation được đối chiếu bằng package local5.105.0, không lấy docs latest làm bảo đảm runtime:

- [useQuery reference](https://tanstack.com/query/v5/docs/framework/react/reference/useQuery) — `staleTime`, `gcTime`, `initialData`, refetch và query function options.
- [QueryClient reference](https://tanstack.com/query/v5/docs/reference/QueryClient) — public `setQueryData`, `removeQueries`, `cancelQueries`, `invalidateQueries` and query defaults.
- [Initial Query Data](https://tanstack.com/query/v5/docs/framework/react/guides/initial-query-data) — `initialData` persisted vào cache, khác placeholder; được cân nhắc rồi không chọn cho lifecycle này, chi tiết `#initialState` đối chiếu ở package local.
- [Query Cancellation](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation) — query function nhận `AbortSignal`; khi consume signal, cancellation có thể abort fetch và revert query state. Transport và post-body guard của project vẫn cần thiết.
- [Paginated Queries](https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries) — `placeholderData: keepPreviousData` là tùy chọn UX, không thay displayed/deferred guard của feature này.

Provenance package local: `apps/web/package.json` và `pnpm-lock.yaml` pin `@tanstack/react-query`5.105.0; package store có cả React Query/core5.105.0. Đã đọc core read-only tại `node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/build/modern/{query.js,queryCache.js,removable.js,queryClient.js}`: constructor/getDefaultState/reset/`#initialState`, setQueryData/default options, updateGcTime/scheduleGc/detach/fetch-finally. Hash source local ghi trong report writer để reviewer đối chiếu. Product source/consumer/test ở mục3/8; [INDEX](../INDEX.md), [decisions](../decisions.md) và [validation](../validation.md#tanstack-cache-ownership-spec--proposed-03112026) là cửa vào checkpoint. Heap paired R2/review và amendment nằm trong `.superpowers/sdd/server-pagination-implementation-plan/`; chúng là evidence/proposal đúng mốc, không nguồn approval mới.

## 10. Rủi ro migration và điểm dừng

Rủi ro lớn nhất là đổi từ seed imperative trước rerender sang local queryFn adoption: gating emission, same-key rebuild, consume-once/cancel và exact-reference phải cùng nhất quán. Tạm thời isFetching trong local adoption được phép khóa new edits như hiện tại; không được đổi labels/fetchedAt, phát thêm HTTP chỉ để seed, loop accepted delivery hoặc giành focus. Chưa có kết quả runtime chứng minh đường mới; independent review đánh giá spec, rồi equivalent tests mới quyết định code có thể thay safeguards cũ.

`gcTime:0` không xoá mọi object lập tức: cache removal, observer detach, cancellation/fetch-finally và GC callback là các bước khác nhau; callbacks còn root qua React/DOM/projection có thể giữ DTO dù query đã remove. Existing R2 graph quan sát initial DTO qua live button callback là known residual, chưa causal closure/production fix. Spec này không sửa callback đó hoặc hứa thay cache sẽ giải phóng nó. Không nối thành proof H1–H5/no-leak/performance clearance; historical four heap FAIL/old raw và pending amendment giữ nguyên.

App hiện không persist query cache. Migration phải được kiểm trên provider/QueryClient tạo mới từ build mới; thay code trong một QueryClient cũ đã có instance canonical Infinity không thể hạ gcTime bằng observer0. Không dùng hot reload giữa hai implementation làm bằng chứng target policy đạt, hoặc gọi global clear từ feature để che legacy instance. Tests stale/equal-byte target vẫn bắt buộc evict/rebuild đúng key và giữ unrelated entry.

Chỉ cập nhật module README/source map đang mô tả Infinity cùng implementation được review sau plan approval; hiện tại mô tả cũ vẫn đúng với source. Nếu public-path migration không đạt test/cleanup hoặc phát hiện multi-owner/capability mới, ghi Failed/Blocked đúng scope và trả review, giữ safeguard hiện tại. Không dùng upgrade/fallback library/grace timeout/waiver để vượt gate. Main tiếp theo fresh independent spec review → concrete written-spec presentation/user approval → writing-plans; không plan/code/dispatch mới từ spec này.
