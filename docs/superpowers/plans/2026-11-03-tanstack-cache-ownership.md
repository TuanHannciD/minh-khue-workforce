# TanStack Cache Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển handoff trang chấm công sang public `useQuery.queryFn`, bỏ ownership canonical cache tùy biến và giữ nguyên các safeguard nghiệp vụ/lifecycle.

**Architecture:** TanStack Query giữ `PageDelivery`/server data; `usePageView` giữ envelope desired/displayed/deferred cùng reference, `AttendanceDraft` giữ frozen intent. `useAttendancePage` nhận accepted delivery từ displayed, chờ cancel exact prior/target rồi resolve một lần qua queryFn của effective page; read demand xen handoff phải đi tới HTTP canonical thật. SessionRuntime giữ quyền clear toàn client; full-month GET và export Blob có lifetime riêng.

**Tech Stack:** React19.3.1, TypeScript strict, TanStack React Query/core5.105.0, Vitest5.0.5/Testing Library, generated API aliases và pnpm12.15.0 hiện có; không đổi dependency.

**Spec:** [tanstack-cache-ownership-spec.md](../../tasks/MKW-PRODUCT-001/technical/tanstack-cache-ownership-spec.md), written spec Approved03/11/2026 sau R1 **0C/0I/0M** tại `77980affa4c76e5052b3ea15963c3f4338f32ce9`. Plan này **Draft/Pending independent review + user plan approval**; chưa implementation.

## Global Constraints

- Page key giữ `["attendance","page",userId,epoch,month,q.trim(),page,pageSize]`; generation/requestId là metadata, không thêm kind. POST search đúng4 fields month/q/page/pageSize; web chỉ trim q, không lowercase/sort/filter/URL/log/persist.
- Page queries từ lần tạo đầu: `staleTime: Infinity`, `gcTime: 0`, `structuralSharing: false`, `refetchIntervalInBackground: false`. Full-month giữ `gcTime: 0` và options riêng hiện hành; không áp page options sang month để đổi semantics.
- Read retry tối đa2 ở1s/3s;4xx dừng retry/poll/focus/reconnect tự động, manual retry vẫn là read thật; write một attempt, không retry/optimistic saved. Poll15.000ms khi displayed cùng desired/lifetime, authenticated/mounted/visible; focus/reconnect `"always"` theo guard hiện hành.
- Không production `Query`/`QueryCache` import để điều khiển lifecycle, `getQueryCache().find/build`, `Query.setOptions`, protected GC, `gcTime: Infinity`, initialData/placeholder/keepPreviousData handoff hoặc đổi defaultOptions. Harness được inspect cache/observer read-only và dựng stale targets để kiểm hậu điều kiện.
- Không thêm libs/upgrade/Zustand/RTK/SWR, schema/DTO/wire/status nghiệp vụ, DB/order changes, all-page prefetch, server cache clone, global UI store hoặc unrelated refactor. `staleTime: Infinity` không là `"static"` và không chặn explicit invalidation.
- Giữ deferred/displayed/frozen draft/CAS/unknown/original-key reconcile, user/epoch/generation/mounted/signal/auth guards, account/logout/session clear và fullmonth/export isolation theo spec. Không thay UI C hoặc khảo sát lại kiến trúc/UI đã duyệt.
- Performance/heap vẫn **Failed**; không causal leak closure. Amendment A/H1–H5 **Pending**, validator/threshold không đổi. Native/SR/phoneperf/reader/dependency/G4 là gate riêng **Not run/Open**. Plan/spec approval không là waiver.

## Review Focus

1. Target bằng bytes nhưng khác reference/lifetime có thể thắng clamp accepted: Task1 test `public_handoff_evicts_equal_byte_wrong_reference_target` phải giữ exact identity.
2. Invalidation/reload chen trước hoặc trong local adoption có thể bị seed nuốt: Task2 test `fresh_read_during_handoff_is_one_canonical_http_read` phải giữ demand qua cancel/eviction.
3. Cancel sau consume hoặc candidate mất khi binding còn current có thể treo busy/local-loop: Task2 test `lost_or_canceled_current_handoff_exposes_retry_without_seed_loop` phải error/readOnly, explicit retry đọc HTTP.
4. Delayed body/callback của Query đã retire có thể sống ngoài cache: Task3 test `same-key generation retires the canonical instance without retaining a GC timer` phải observer0/timer0 với client còn sống và unrelated entry còn.
5. Poll đổi membership trong lúc unknown/CAS có thể làm mất original keys hoặc trộn envelope: Task3 test `handoff_does_not_rebase_unknown_original_keys_or_frozen_draft` phải giữ intent và reconcile union keys ngoài page/tháng.

---

## Hồ sơ, nguồn và phương thức thực thi

Planning BASE `77980affa4c76e5052b3ea15963c3f4338f32ce9`, branch `agent/mkw-agent-002`, worktree `D:/TinHoc/minh-khue-workforce/.worktrees/agent-bootstrap`. Brief mục tiêu/scope/acceptance/risk/writer-review/resources/next đã ghi trước sửa trong ignored `.superpowers/sdd/server-pagination-implementation-plan/tanstack-cache-plan-report.md`. Runtime lượt này GPT-6.1-Sol/high, không Astra/children/helpers/subagents. Chỉ Markdown tracked và report ignored; không source/test/dependency/runtime/DB/browser/network/install/new worktree/global/push/merge/deploy, không chạy product tests trong planning.

Nguồn tái sử dụng: [design15](../../tasks/MKW-PRODUCT-001/design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026), [API8](../../tasks/MKW-PRODUCT-001/technical/api-contract.md#8-đọc-trang-server--thiết-kế-đã-duyệt01112026), [ADR-002](../../architecture/decisions/ADR-002-state-management.md), [ADR-003](../../architecture/decisions/ADR-003-product-stack.md), [SOURCE_NAVIGATION](../../architecture/SOURCE_NAVIGATION.md), [quality gates](../../agent/QUALITY_GATES.md), [local commands](../../agent/LOCAL_RUN.md). Existing server-pagination plan/evidence giữ lịch sử; migration này không replay các task đã reviewed complete hoặc sửa main ledger.

Phương thức đã chốt cho lượt implementation tương lai: **main chỉ điều phối → fresh implementer Task1 → fresh reviewer Task1 → Task2 implementer/reviewer → Task3 implementer/reviewer → fresh whole-branch review**. Tất cả chỉ GPT-6.1-Sol reasoning high, cấm Astra; implementer/reviewer không tạo children/helpers. Không dispatch trong lượt planning này. Sau independent plan review và user plan approval mới mở lượt triển khai với quyền/resource cụ thể; approval plan không tự cấp network/install/runtime/DB/browser/new worktree/global/push/merge/deploy. Dùng existing isolated checkout, mỗi lần chỉ một writer; ghi actual execution BASE, không giả planning BASE vẫn là tip lúc bắt đầu.

Mỗi reviewer chỉ đọc exact task BASE..TIP + nguồn đã duyệt + report/checks/limits; review độc lập không thay bằng self-review. Findings C/I phải sửa và fresh re-review exact tip; M xử lý/ghi disposition tường minh, không âm thầm hạ gate. Ghi task commit trước review, không chạy task sau khi gate trước chưa đạt. Nếu public path không đạt equivalence/cleanup: dừng migration, giữ safeguard code cũ trong snapshot đã biết và đưa finding về main; không fallback library/Infinity/grace timeout/waiver. Không reset/clean/ghi đè dirty, untracked, ignored hoặc evidence cũ.

## File structure và interface map

Không thêm cache module/store hoặc production diagnostic API. Giữ các lifecycle gắn nhau trong hook hiện có; test integration giữ cùng real hook/view/session fixture và file map theo symbol/describe vì cancellation/retired-instance assertions cần cùng owner. Khi chạm file ≥400/800 dòng, ghi lý do giữ chung và cập nhật map trong task report; không tách source chỉ để đạt số dòng.

- `apps/web/src/features/attendance/api/use-attendance-page.ts`: thay `canonicalKeys`/`adoptAttendancePage` bằng one-shot queryFn handoff, guarded refetch và public invalidation observation. Private `Binding`/`sameBinding`/`StalePageRequest` vẫn thuộc producer.
- `apps/web/src/features/attendance/ui/attendance-workspace.tsx`: truyền `view.state.displayed?.delivery ?? null` vào producer; effect vẫn `accept(delivery)` cho query/deferred, bỏ imperative adopt, giữ focus/scroll/guard/readOnly.
- `apps/web/src/features/attendance/model/use-page-view.integration.test.tsx`: sửa harness `setup`/`View` gọi actual producer mới, bỏ import/call adopt; không manually retag response cho happy path. `page-view.test.ts` và Workspace/API tests giữ các behavioral assertions cũ.
- `apps/web/src/features/attendance/README.md`: cập nhật map Infinity/adopt cùng Task1; không sửa README trong lượt planning vì nó còn mô tả đúng source cũ.
- `api/query-keys.ts`, `api/attendance.ts`, `model/page-view.ts`, `model/use-page-view.ts`, `model/types.ts`, `model/attendance-read-view.ts`: read-only dependencies dự kiến; giữ signatures, key/filter/DTO/accept/projection. Nếu implementation cần đổi ngoài interfaces đã chốt phải main/reviewer đánh giá scope trước.
- `model/attendance-draft.ts`, `model/bulk-recovery.ts`, `shared/api/reconcile.ts`, session runtime/boundary/transport, fullmonth/export production: safeguards read-only, không di chuyển write lifecycle sang useMutation. Task3 bổ sung composition tests, không giả các owner này cần refactor.

Tất cả path `api/`, `model/`, `ui/` rút gọn trong mô tả là dưới `apps/web/src/features/attendance/`; Files và lệnh bên dưới ghi đường dẫn đầy đủ. Interfaces mới là đề xuất implementation của plan, không wire contract hoặc capability đã có.

### Task 1: Public queryFn handoff và consumer atomic

**Files:**
- Modify: `apps/web/src/features/attendance/api/use-attendance-page.ts` — `useAttendancePage`, bỏ `adoptAttendancePage` export/`canonicalKeys`.
- Modify: `apps/web/src/features/attendance/ui/attendance-workspace.tsx` — hook invocation và accepted/deferred effect.
- Modify: `apps/web/src/features/attendance/model/use-page-view.integration.test.tsx` — `setup`/`View`, accepted/held clamp và delayed-render cases.
- Modify: `apps/web/src/features/attendance/README.md` — producer/Workspace/canonical lifetime map.
- Test: `apps/web/src/features/attendance/api/use-attendance-page.test.tsx` và integration file trên.

**Interfaces:**
- Consumes `PageCriteria = Required<AttendancePageQueryDto>`, `PageLifetime = { userId: string; epoch: number; generation: number }`, `PageDelivery = { requested: PageCriteria; requestLifetime: PageLifetime; requestId: number; data: AttendancePageDto }` từ `model/types.ts`/`page-view.ts`; giữ nguyên wire aliases.
- Produces `useAttendancePage(criteria: PageCriteria, lifetime: PageLifetime, polling: boolean, accepted: PageDelivery | null = null): UseQueryResult<PageDelivery, Error>`. Ba-argument callers trong standalone API tests vẫn dùng HTTP bình thường. Workspace/integration truyền accepted từ **displayed**, không deferred/query cache.
- Private `isPageHandoffCandidate(delivery: PageDelivery | null, criteria: PageCriteria, lifetime: PageLifetime): delivery is PageDelivery`: chỉ accepted clamp cùng user/epoch/generation/month/trimmed q/pageSize và effective page=desired.page. Private `PageHandoffError extends Error` là lỗi lifecycle local, không thêm HTTP code/DTO/status nghiệp vụ.

- [ ] **Step 1: Viết behavioral tests mới và sửa structural-seed assertions.** Trong real `setup` harness thêm `public_handoff_has_no_inactive_seed_before_canonical_render` và `public_handoff_evicts_equal_byte_wrong_reference_target`. Giữ fake cancel gate và React update chưa commit; trước render không seed canonical, displayed giữ chính delivery; sau ready canonical data phải `toBe` reference đó. Thêm `public_handoff_duplicate_delivery_does_not_adopt_twice`: rerender canonical/emit duplicate giữ accepted.requestId, decision `ignored`, không HTTP thêm hoặc reset consume marker. Test parameterized `public_handoff_rejects_wrong_user_epoch_generation_criteria` thay từng user/epoch/generation/month/q/pageSize/effective-page; chỉ mutate candidate input trong negative harness, không tạo happy path bằng tag giả.

```ts
expect(accepted.requested.page).toBe(40);
expect(accepted.data.pagination.requestedPage).toBe(40);
expect(view.state.desired.page).toBe(39);
expect(view.state.lifetime.generation).toBe(accepted.requestLifetime.generation);
// Khi accept đã chạy nhưng canonical render chưa commit:
expect(client.getQueryData(canonicalKey)).toBeUndefined();
// Sau cancellation barrier + canonical queryFn resolve:
expect(client.getQueryData(canonicalKey)).toBe(accepted);
expect(view.state.displayed!.delivery.data).toBe(accepted.data);
expect(httpRequests).toHaveLength(beforeHandoffHttpCount);
```

Equal-byte target fixture phải `expect(stale.data).toEqual(accepted.data)` nhưng `expect(stale).not.toBe(accepted)`; thử cả same-lifetime/requestId bằng nhau và old generation. Khi candidate không hợp lệ, không local-publish; binding stale im lặng, binding vẫn current đi error/retry của Task2. Giữ `poll_and_accepted_clamp_share_dispatch_metadata`, held-clamp, A→B→A, prior+target cancel, cached return, stale retry assertions. Chỉ thay đòi seed trước rerender bằng kiểm view reference/pre-render absence/post-render identity; không giảm cleanup/no-extra-HTTP.

- [ ] **Step 2: Chạy RED trước production edit.** `pnpm --filter @mkw/web test --run src/features/attendance/model/use-page-view.integration.test.tsx -t 'public_handoff'` → exit1 vì old imperative seed xuất hiện trước render; import/type/setup error không được counted RED. Lúc RED, `View` vẫn dùng3-argument hook và old accept/adopt path; test no-inactive-seed quan sát ngay trong `act` trước commit đủ bắt khác biệt. Chỉ nối fourth argument/negative candidate override trong Step4 khi signature đã có, không dùng missing export/signature làm RED. Các case safeguard đang pass được giữ regression, không ép chúng RED giả.
- [ ] **Step 3: Implement hook signature/private candidate validator ở file đã chỉ định.** Giữ exact prior+target public `cancelQueries` await barrier, mounted/binding/session/epoch/signal checks cả hai phía await. Trong handoff target khác reference phải public exact `removeQueries` sau cancel dù bytes/lifetime bằng; navigation thường evict lifetime cũ. Không emit cached target trước readiness. `useQuery` tạo Query với gc0 từ đầu; first eligible queryFn resolve đúng candidate reference, không `setQueryData`/initialData seed, không tăng HTTP requestId/generation. Marker chỉ lifetime+delivery requestId và consume-once; callback đọc latest owner ref, bỏ candidate riêng khi đã publish/cancel/navigation/session/unmount. Requested query giữ observer tới React commit, detach/GC0 sau chuyển; không imperative remove observer đang dùng.
- [ ] **Step 4: Nối Workspace và test View trong cùng deliverable.** Truyền displayed.delivery theo interface; bỏ mọi import/call `adoptAttendancePage`. Accepted/deferred release vẫn `accept` một lần; local canonical delivery phát lại có thể `ignored` duplicate là đúng, không retag. `toPageTable` giữ employees/cells/employeeTotals/monthTotals reference; fetchedAt/labels/footer lấy displayed.delivery.data, không Query dataUpdatedAt. Cập nhật README bỏ mô tả Infinity/canonical registry khi source đã đổi.
- [ ] **Step 5: Chạy GREEN + compile.** `pnpm --filter @mkw/web test --run src/features/attendance/api/use-attendance-page.test.tsx src/features/attendance/model/page-view.test.ts src/features/attendance/model/use-page-view.integration.test.tsx src/features/attendance/ui/attendance-workspace.test.tsx` và `pnpm --filter @mkw/web typecheck` → exit0. Assert settled chỉ một current page query/observer, original requested40/canonical39/reference/tag giữ, không HTTP seed; poll kế tiếp POST39/requestId mới. Nếu không đạt, dừng task, không bỏ incumbent tests.
- [ ] **Step 6: Commit exact file zone.** `git add apps/web/src/features/attendance/api/use-attendance-page.ts apps/web/src/features/attendance/ui/attendance-workspace.tsx apps/web/src/features/attendance/model/use-page-view.integration.test.tsx apps/web/src/features/attendance/README.md` (thêm exact API test path nếu thực sự sửa), rồi `git commit -m "refactor: hand off attendance pages through public query API"`; không `git add .` hoặc stage source khác. Report full SHA/RED/GREEN/limits.
- [ ] **Step 7: Fresh Task1 review.** Reviewer đọc exact Task1 BASE..TIP và consumer, chạy focused checks Step5; reject direct internals/Infinity, no-op guard hoặc giảm identity/lifetime/HTTP assertions. Fix và fresh re-review nếu còn finding chặn; gate phải đạt trước Task2.

### Task 2: Read demand xen handoff, explicit retry và fail-closed cancellation

**Files:**
- Modify: `apps/web/src/features/attendance/api/use-attendance-page.ts` — readiness effect, queryFn/refetch/poll/focus/reconnect và listener cleanup.
- Test: `apps/web/src/features/attendance/model/use-page-view.integration.test.tsx` — actual query/client/view/session interleavings.
- Test: `apps/web/src/features/attendance/api/use-attendance-page.test.tsx` — retry/visibility/invalidation boundary.
- Test: `apps/web/src/features/attendance/ui/attendance-workspace.test.tsx` — ba đường manual reload/Thử lại/initial retry.

**Interfaces:**
- Consumes Task1 hook signature; public `QueryClient.getQueryState(key)?.isInvalidated`, `getQueryCache().subscribe(listener): () => void`, `invalidateQueries` events và `focusManager`/`onlineManager` public subscriptions; đọc event.query.queryKey tạm thời, không giữ/mutate Query.
- Produces cùng `UseQueryResult<PageDelivery, Error>`, nhưng `refetch` là guarded wrapper cùng type `UseQueryResult<PageDelivery, Error>["refetch"]`. Callers `query.refetch()` hiện tại không bypass barrier; options/Promise result contract của TanStack giữ nguyên, pending calls gộp một read và settle khi actual refetch/cancellation kết thúc, không để Promise waiter treo khi unmount.
- Lifecycle metadata trong hook: `Binding = { criteria: PageCriteria; lifetime: PageLifetime }`, consumed lifetime/requestId và fresh-read demand (không payload queue/timer/store mới). Private `requestFreshPageRead(binding: Binding): void` chỉ ghi demand nếu binding current; raw observer refetch chỉ được gọi khi ready/current, không gọi returned wrapper đệ quy.

- [ ] **Step 1: Viết `fresh_read_during_handoff_is_one_canonical_http_read` dạng parameterized.** Giữ cancel gate target39, trigger từng manual refetch, month/scope invalidation trước target eviction, invalidation trên target đúng reference đã invalidated, và trigger sau local queryFn bắt đầu nhưng trước settle. Cũng thử nhiều trigger trong cùng transition và stale manual callback. Assertion trên real harness:

```ts
expect(requests.map(r => r.page)).toEqual([40]); // barrier chưa ready
// Sau release: local adoption nếu đã bắt đầu, rồi đúng một HTTP canonical.
expect(requests.map(r => r.page)).toEqual([40, 39]);
expect(fresh.requestId).toBe(accepted.requestId + 1);
expect(fresh.requestLifetime).toEqual(accepted.requestLifetime);
expect(fresh.requested.page).toBe(39);
expect(view.state.displayed!.delivery).toBe(fresh);
expect(fresh).not.toBe(accepted);
```

Thêm `handoff_poll_focus_reconnect_reads_canonical_without_local_replay`: advance14999/15000ms trong cancel/adoption gap rồi sau readiness, focus false→true, online false→true; mỗi trigger eligible phải actual POST39, không seed lại. Hidden/unmounted/session-stale không phát queued demand. Thêm `lost_or_canceled_current_handoff_exposes_retry_without_seed_loop`: mất/sai candidate khi binding còn current hoặc cancel sau consume không data phải error/readOnly, giữ envelope, explicit retry POST39; binding đổi thì im lặng. Giữ `4xx stops retries and automatic polling`, `5xx retries exactly twice at 1000 and 3000ms; expire stops dispatch`, `mutation transport still makes one attempt`.
- [ ] **Step 2: Chạy RED.** `pnpm --filter @mkw/web test --run src/features/attendance/model/use-page-view.integration.test.tsx -t 'fresh_read_during_handoff|handoff_poll_focus_reconnect|lost_or_canceled_current_handoff'` → exit1 tại missed HTTP demand, duplicate dispatch hoặc stuck fetching/seed replay; chỉ tính semantic failures. Các row đã GREEN từ Task1 vẫn phải retained, không tạo lỗi nhân tạo.
- [ ] **Step 3: Implement public observation và dispatch arbitration.** Layout subscription gắn trước barrier; snapshot prior+target invalidated state **trước remove**, recheck lúc ready. Public cache subscribe chỉ nhận relevant invalidate event của prior/target current binding; không dùng `find` hoặc direct Query methods. Một invalidation gắn cả hai keys vẫn là một demand; không subscribe event data như một cache mới. Focus/online subscription chỉ ghi demand khi chuyển trong barrier/local adoption và visible/authenticated/not4xx; sau readiness để incumbent TanStack automatic path dispatch, tránh dispatch đôi. Existing Query interval15s giữ owner timer; nếu interval queryFn chen vào adoption, phân loại là fresh HTTP khi marker đã consumed và gộp với demand đang pending, không thêm scheduler.
- [ ] **Step 4: Nối guarded refetch và kết thúc adoption.** Manual/retry ghi demand trước await; trước local adoption bắt đầu thì bypass seed để HTTP canonical, nếu đã bắt đầu thì settle/guard adoption rồi đúng một HTTP canonical. Nhu cầu trước readiness không mất bởi disabled observer/eviction; không recurse invalidate→refetch→demand vòng lặp. After consume cancel: stale binding bỏ work; current binding không có data chuyển `PageHandoffError`, không StalePageRequest retry-loop. Local lifecycle error không auto retry/auto poll; explicit guarded retry dùng HTTP với requestId mới. Mọi queued callback recheck binding/session/signal lúc dispatch và sau body; unsubscribe/reset demand/marker/waiter khi navigation/session/unmount, không tăng requestId cho demand chỉ bị cancel. Ba nút Workspace đang gọi refetch và save reload qua invalidate helpers phải đều đi đúng path, không cần sửa query-keys scope.
- [ ] **Step 5: Chạy GREEN và regression.** Chạy command Step2 bỏ `-t` filter để chạy toàn integration; rồi `pnpm --filter @mkw/web test --run src/features/attendance/api/use-attendance-page.test.tsx src/features/attendance/ui/attendance-workspace.test.tsx` và web typecheck → exit0.4xx advance50s + focus/reconnect không thêm calls; explicit retry đúng một HTTP.5xx attempts ở0/1000/4000ms rồi dừng; expire/navigation loại stale retry closure. Poll/focus/reconnect/manual/invalidation sau handoff giữ canonical key, metadata và no hidden writes; helpers invalidation mọi q/page+legacy đúng month/user/epoch, inactive không refetch.
- [ ] **Step 6: Commit.** `git add apps/web/src/features/attendance/api/use-attendance-page.ts apps/web/src/features/attendance/model/use-page-view.integration.test.tsx apps/web/src/features/attendance/api/use-attendance-page.test.tsx apps/web/src/features/attendance/ui/attendance-workspace.test.tsx`, rồi `git commit -m "fix: preserve fresh attendance reads across query handoff"`. Report full SHA và command results.
- [ ] **Step 7: Fresh Task2 review.** Reviewer exact Task2 BASE..TIP xét từng vị trí trigger trước/sau cancel/eviction/consume/settle, chạy lại Step5; yêu cầu semantic RED→GREEN, không chấp nhận chỉ count-length mà thiếu criteria/identity/lifetime. Findings phải fix/re-review trước Task3.

### Task 3: Lifecycle equivalence và domain/session/export composition

**Files:**
- Modify: `apps/web/src/features/attendance/model/use-page-view.integration.test.tsx` — retired/current query refs, cleanup/remount, owner/session negatives và real draft/reconcile composition.
- Modify: `apps/web/src/features/attendance/ui/attendance-workspace.test.tsx` — held-clamp envelope/error/focus/guard và export interaction.
- Test: `apps/web/src/features/attendance/model/attendance-session.test.ts`, `apps/web/src/features/attendance/api/use-attendance-month.test.tsx`, `apps/web/src/features/attendance/ui/export-button.test.tsx` — bổ sung cache-isolation assertions nếu composition cũ chưa phủ; không sửa owner production.
- Regression-only: `apps/web/src/features/attendance/model/attendance-draft.test.ts`, `apps/web/src/features/attendance/model/bulk-draft.test.ts`, `apps/web/src/features/attendance/model/attendance-read-view.test.ts`, `apps/web/src/features/attendance/model/use-cell-selection.test.tsx`, `apps/web/src/features/attendance/ui/attendance-context.test.tsx`, `apps/web/src/features/attendance/ui/selection-input.test.tsx`.
- Bugfix nếu test mới bắt lỗi migration: chỉ `apps/web/src/features/attendance/api/use-attendance-page.ts`/`ui/attendance-workspace.tsx` đã thuộc scope; report và fresh review. Không mở refactor draft/session/transport/export.

**Interfaces:**
- Consumes Task1/2 hook + guarded refetch, `usePageView` accept, `AttendanceDraft.open/openBulk/submit/reconcile/recover/discard`, `ownerGeneration`, `SessionRuntime.expire/login/refresh/confirmAccountChange/logout/clearSessionCache`, `SessionBoundary.invalidate/track/canWrite` hiện hữu.
- Reconcile seams giữ `reconcileByIdentity(input: ReconcileRequest, expectedEpoch: number): Promise<ReconcileSnapshot>` và `AttendanceDraft.reconcile(read?: (input: ReconcileRequest, epoch: number) => Promise<ReconcileSnapshot>): Promise<void>`; request original employeeIds/cells **không expected revisions**. `recover("draft" | "current", write?)` mới gửi write revisions/current choice tường minh; không read/abort/equality fence.
- Fullmonth `useAttendanceMonth(month: string)` nhận MonthDto với key `["attendance",userId,epoch,month]`; `downloadAttendance(month: ExportMonth, boundary: SessionBoundary, signal: AbortSignal): Promise<Blob>` riêng. Không đổi inferred result/DTO signatures; `toPageTable(page: AttendancePageDto): AttendanceTableData` chỉ wrapper giữ inner references.

- [ ] **Step 1: Thêm failing lifecycle/composition negatives.** Mở rộng existing `same-key generation retires the canonical instance without retaining a GC timer`, `canonical poll body cannot publish after navigation cancels its context`, `unmount during accepted handoff removes the seed before a canonical observer subscribes` (đổi tên assertion seed thành no-created-entry, giữ lịch sử tên trong report). Hoãn Response.json bỏ qua abort, hủy giữa seed/cancel, rerender cùng key generation mới; chụp retired và active Query refs trong harness, không giữ Query ở production. Sau settled body/cancel/GC, với QueryClient sống:

```ts
expect(retired.getObserversCount()).toBe(0);
expect(active.getObserversCount()).toBe(0); // sau unmount
expect(client.getQueryCache().findAll({ queryKey: ["attendance", "page"] })).toHaveLength(0);
expect(client.getQueryData(unrelatedKey)).toBe("keep");
expect(vi.getTimerCount()).toBe(0);
// Advance thêm30000ms: không HTTP. Remount cùng canonical key:
expect(view.state.displayed).toBeNull();
expect(query.data).toBeUndefined();
expect(remounted.requestId).toBe(1);
expect(remounted).not.toBe(oldDelivery);
```

Fixture disconnect/expire session owner timer như existing harness trước timer0; không `client.clear()` trước assertions. Khi accept→unmount trước canonical render, canonical chưa được tạo, requested observer detach/GC; unrelated entry vẫn còn. Dựng QueryClient/provider **mới** cho target policy, không dùng HMR để hạ legacy Infinity. Stale/equal-byte targets cố ý injected vẫn phải exact evict/rebuild.
- [ ] **Step 2: Thêm `handoff_does_not_rebase_unknown_original_keys_or_frozen_draft`.** Trong actual hook/view/session harness, mở bulk draft source+targets, clone bounded edit làm baseline test; poll đổi IDs/order/effective page hai lần, giữ displayed envelope cũ và deferred mới nhất. `expect(draft.edit).toEqual(before)` giữ raw/reminder/custom/error/mode/targets/source/employee+cell revisions, Keep chỉ một modal/draft lifetime, ownerGeneration khác PageLifetime generation. Sau unknown response loss: submit tiếp không thêm write, reconcile đúng original union keys/employee IDs kể cả rời page/tháng, không gửi expected revisions; read không thành saved/fence và read error không thành missing. Explicit recovery mới gửi cùng mode/targets và explicit value/reminder/revisions;409 giữ cả batch, N/—/source/skip/fill-empty occupied/eligible0 không được thành fence. Giữ incumbent model/bulk assertions làm oracle, không mô phỏng DB commit bằng mock để claim full API proof.

```ts
expect(draft.edit).toEqual(before);
expect(read.mock.calls[0]![0]).toEqual({ employeeIds: originalIds, cells: originalUnionKeys });
expect(write).toHaveBeenCalledTimes(1); // unknown submit + read không tự write lại
expect(draft.outcome.type).toBe("unknown");
expect(draft.edit!.targets).toEqual(before!.targets);
expect(draft.edit!.source).toEqual(before!.source);
```

- [ ] **Step 3: Pin session + fullmonth/export isolation trong tests hiện có.** Account-change chặn account mới tới explicit confirm clear; logout dirty không gửi request trước discard, logout(true) clear sensitive state/cache và abort. Same-user continuity refresh giữ epoch/lease, reauth tạo epoch mới giữ raw nhưng submit phải fresh reconcile; late body/recovery/write không đụng owner mới. Spy `clearSessionCache` order boundary invalidate/tracked abort → cancelQueries → clear; attendance không clear toàn client. Export trong lúc page handoff/dirty draft chỉ GET month, không q/page/draft/cache/write/retry; Blob không vào Query cache, month/unmount abort và session-after-body reject trước createObjectURL. Fullmonth query độc lập không đổi page reference; table vẫn chỉ page observer, không fullmonth background subscription. Giữ MIME/empty-body/pending dedupe/export explicit retry và global row/month totals safeguards; không sửa export timer1000ms để hợp page-only timer0 fixture.

Tên ca mới: `session_change_during_handoff_cancels_pending_read_and_clears_private_cache` trong page-view integration; `fullmonth_read_does_not_mutate_page_delivery` trong month-hook test; `export_during_page_handoff_keeps_draft_and_cache_untouched` trong Workspace test. Pin `expect(client.getQueryData(pageKey)).toBe(accepted)`, `expect(draft.edit).toEqual(before)` trước/sau export/fullmonth, `expect(createObjectURL).not.toHaveBeenCalled()` cho late epoch/body, `expect(oldSignal.aborted).toBe(true)` và cache private rỗng sau explicit session clear. Thay lỗi network/403/503/empty body và hủy unmount/month không làm phát hidden write hoặc auto export retry.
- [ ] **Step 4: Chạy RED của ca mới trước fix.** `pnpm --filter @mkw/web test --run src/features/attendance/model/use-page-view.integration.test.tsx -t 'handoff_does_not_rebase|same-key generation|canonical poll body|unmount during accepted handoff'`, rồi `pnpm --filter @mkw/web test --run src/features/attendance/model/attendance-session.test.ts src/features/attendance/api/use-attendance-month.test.tsx src/features/attendance/ui/export-button.test.tsx` → ca đã đúng có thể PASS; ca mới bắt regression phải FAIL vì stale publication/timer/intent/isolation assertion. Nếu tất cả PASS, ghi regression-only verification, không claim RED→GREEN đã có hoặc sửa owner production để tạo cycle giả.
- [ ] **Step 5: Sửa tối thiểu defect migration đã có semantic RED.** Chỉ hook/Workspace trong file zone Task1/2; không sửa draft/session/export/transport owner để làm test xanh. Nếu không có defect thì giữ production nguyên trạng và đánh dấu step này không cần thay đổi. Nếu cần đổi contract/owner ngoài plan, main xử lý finding/scope trước; không hạ assertion.
- [ ] **Step 6: Chạy GREEN toàn affected web scope.** `pnpm --filter @mkw/web test --run src/features/attendance src/features/session src/shared/api` và `pnpm --filter @mkw/web typecheck` → exit0, toàn behavioral assertions giữ. Không thêm tests lặp body implementation. `pnpm run product:boundaries`, `npm run check:docs`, `git diff --check` → exit0. Reviewer kiểm static scan production loại tests: không core imports/calls, Infinity GC, seed setQueryData/initialData, global clear/default changes; harness injection không bị xóa để làm scan xanh.
- [ ] **Step 7: Commit.** `git add apps/web/src/features/attendance/model/use-page-view.integration.test.tsx apps/web/src/features/attendance/ui/attendance-workspace.test.tsx apps/web/src/features/attendance/model/attendance-session.test.ts apps/web/src/features/attendance/api/use-attendance-month.test.tsx apps/web/src/features/attendance/ui/export-button.test.tsx` chỉ với file thực sự sửa; stage exact hook/Workspace fix nếu có, không broad-add. `git commit -m "test: preserve attendance cache ownership lifecycle safeguards"`. Report full SHA/results và regression-only/RED→GREEN đúng thực tế.
- [ ] **Step 8: Fresh Task3 review.** Reviewer exact Task3 BASE..TIP kiểm delayed body/retired timers, unknown/CAS/original keys, fullmonth/export/session và các equivalent assertions, chạy lại Step6; không nhận namespace0/query count hoặc test count làm no-leak proof. Fix/fresh re-review trước whole-branch gate.

## Whole-branch gates và bàn giao sau implementation

- [ ] Main đối chiếu task commits/reviews rồi giao **fresh whole-branch reviewer** toàn migration execution BASE..TIP, không chỉ Task3. Report nguyên spec/plan/nguồn, mọi finding/disposition, focused RED/GREEN và giới hạn; không dùng spec R1 làm code review. Reviewer so current files với base để bắt assertion bị giảm và source ngoài zone.
- [ ] Static scan từ root worktree: `rg -n -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' 'gcTime\s*:\s*Infinity|getQueryCache\(\)\.(find|build)|\.(setOptions|scheduleGc|updateGcTime)\(|\b(cache|canonical)\.(build|setOptions)\b' apps/web/src/features/attendance` → expected exit1/không match. Đây là guard tìm vị trí, reviewer vẫn phải đọc imports/aliases và toàn diff để loại `Query`/`QueryCache` control, initialData/setQueryData seed, registry payload hoặc feature clear/default changes; không gọi regex là semantic proof đầy đủ. Test fixture Infinity/unrelated stale target không nằm trong production scan.
- [ ] Trên runtime local đã có theo [LOCAL_RUN](../../agent/LOCAL_RUN.md), kiểm `node --version`/`pnpm --version`: product Node24.22.1 và pnpm12.15.0, package5.105.0 giữ nguyên. Chỉ dùng process-local PATH tới runtime có sẵn khi scope thực thi cho phép; thiếu thì Blocked, không tải/cài/update/global. `pnpm run product:check` phải exit0 cho lint/format/types/build/tooling/sandbox/web/API/boundaries/contract drift trước code completion. Không thay `npm run check` pilot cho product proof; không frozen install trong migration scope.
- [ ] Tại gate cần actual integration/browser, ghi **Not run/Blocked** nếu chưa có quyền acquire runtime/resources. Các lệnh hiện có đã xác minh từ `scripts/product/e2e.mjs`: `node scripts/product/e2e.mjs --acceptance` cho runner acceptance tích hợp (bao gồm pagination/recovery/export theo coordinator) và `node scripts/product/e2e.mjs --export` cho export-scoped run; giữ Task10/Task9 owner/identity/release theo local routing, không khởi động DB/browser từ plan này. Không sửa endpoint/SQL/order fixtures hoặc lấy jsdom thay HTTP/PG/browser. Fullmonth/Excel integration historical evidence không phải rerun mới.
- [ ] Không chạy benchmark/heap để tự đóng Failed hoặc thay validator bằng plan này. H1–H5 amendment phải được xử lý/duyệt riêng trước validator/threshold change; native/SR/phoneperf/reader/dependency/G4 giữ separate Not run/Open. Existing R2 initial DTO/live callback residual chưa causal closure, migration query count/timer0 không giải thích heap graph đó.
- [ ] Bàn giao full BASE/TIP/task commits/files/check outputs, independent task + whole-branch verdict, resource state và các gate chưa chạy. Không product Done/release-ready/push/merge/deploy. Nếu public handoff không đạt equivalence, ghi Failed/finding, giữ safeguard snapshot cũ, main quyết định sau review; không local workaround tự mở scope.

## Self-review theo writing-plans

1. **Spec coverage:** §4–5/static/identity/clamp/lifetime/no-extra-HTTP → Task1; §5.2 read-demand/fail-closed và §6 poll/retry → Task2; §6–8 draft/session/fullmonth/export/negative cleanup → Task3; §8/10 validation/legacy-client/heap limits → whole-branch gates. Không gap yêu cầu đã biết.
2. **Step scan:** Files/symbols/interfaces/test names/assertions và RED/GREEN command/expected được ghi; producer+consumer đổi atomic Task1, Task2 dùng optional fourth argument của Task1, Task3 là composition/regression thay vì refactor owner không cần thiết. Không implementation body dài hoặc placeholder quyết định.
3. **Type consistency:** Hook optional accepted parameter và same UseQueryResult/refetch type nhất quán; PageLifetime generation khác draft ownerGeneration; PageDelivery giữ original requested/data và exact reference. Reconcile/export dùng actual source signatures, không đặt wire field/status mới.
4. **Review Focus:**5 item đều có named test trong owning task; identity, demand, canceled-current fail-closed, retired timers và unknown keys không chỉ nằm trong checklist chung.
5. **Proportion:**3 deliverable có vòng test/commit/fresh review,1 whole-branch gate; implementation bodies để implementer viết. Nội dung dài hơn spec do exact paths/commands/assertions/handoff, không chép thuật toán hoặc mở lại kiến trúc/UI.
