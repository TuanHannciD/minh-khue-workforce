# Quyết định — MKW-PRODUCT-001

## TanStack cache ownership — plan Approved, local implementation/review, 03/11/2026

Người dùng đã **Approved** plan ba task trong phiên; quyết định này cho phép implementation local theo spec đã duyệt, không duyệt heap amendment hay external gates. Execution BASE `1121526ddead23ccb3ac01317dbfe146ed04b79c` → reviewed code TIP `b605af75830db091ffa1d7d380756466aba6b4e1`; task commits, review, resource deviation và checks tại [validation](validation.md#tanstack-cache-ownership--implementation-và-review-local-03112026). Whole review SPEC/local QUALITY PASS 0C/0I/0M; resource compliance Failed và không có waiver hồi tố. Giữ local code/evidence, không rerun product:check hoặc acquire thêm; next là xử lý integration/browser/heap amendment và quyền tài nguyên ở scope riêng. Không product/release Done. Những mục Pending bên dưới là checkpoint lịch sử.

## Checkpoint điều phối/model phiên — 03/11/2026

BASE/TIP thực tế trước lượt docs-only là `9bf68b2fcb3a7c15e81dbc0d366b6968ddc99582`, branch `agent/mkw-agent-002`, worktree `.worktrees/agent-bootstrap`; không sửa source sản phẩm. Written spec vẫn **Approved**; implementation plan 3 task vẫn **Pending/CHƯA Approved**. Quy tắc hiện hành được đồng bộ tại [EXECUTION_RULES](../../agent/EXECUTION_RULES.md) và [SKILL_POLICY](../../agent/SKILL_POLICY.md): cấm Astra mọi cấp; khám phá catalog runtime rồi chọn Luna/Terra/Sol theo độ phức tạp, reasoning tối đa `high`; main chỉ điều phối; subagent không tạo children/helpers; reviewer là fresh độc lập; async giữ taskId và chỉ đọc task_status khi cần.

Next action là trình đúng implementation plan 3 task cho người dùng duyệt. Chưa có quyền hoặc checkpoint cho implementation/test/review trực tiếp trong lượt này.

Independent plan R2 trên `9bf68b2fcb3a7c15e81dbc0d366b6968ddc99582` báo 0C/0I/0M, I1/I2/M1 Closed và ready for user approval; report ignored `.superpowers/sdd/server-pagination-implementation-plan/tanstack-cache-plan-review-r2.md`. Lượt đồng bộ sau review chỉ sửa quy tắc điều phối, không thay kỹ thuật plan; review R2 không bao phủ delta tài liệu sau tip đó.

## TanStack cache ownership — written spec Approved03/11/2026; implementation plan Pending

Ngày03/11/2026, người dùng chấp thuận **written spec** [TanStack cache ownership spec](technical/tanstack-cache-ownership-spec.md) sau independent R1 tại commit `77980affa4c76e5052b3ea15963c3f4338f32ce9`, verdict **0 Critical / 0 Important / 0 Minor** mới. Approval này bao phủ đặc tả kỹ thuật và mở việc lập implementation plan; giữ hướng TanStack Query5.105.0 cho server state/cache, React state cho UI/draft, giảm ownership cache tùy biến/direct Query internals, không chọn RTK/SWR/upgrade. Đây không phải approval implementation, heap amendment A/H1–H5, performance waiver, hay kết luận root leak.

Independent implementation-plan review R1 sau đó ghi I1/I2/M1. Docs-only disposition đã cập nhật plan với static scan gate/positive control, public refetch Promise/options/cancellation assertions và RED coverage cho retired/unmount/session/export cases. R2 đã đóng các finding tại tip nêu ở checkpoint trên; implementation plan vẫn Pending và không thay đổi written-spec approval, contract hay historical evidence.

Đặc tả **Approved written spec** là [TanStack cache ownership spec](technical/tanstack-cache-ownership-spec.md). Spec đề nghị loại `QueryCache.build`, `Query.setOptions`, canonical `gcTime:Infinity` và imperative canonical seed; handoff clamp thử qua public `useQuery` query function, cùng cancellation/lifetime guards và `gcTime:0`, nhưng implementation vẫn chờ plan approval và equivalent tests. `useQuery`/public `QueryClient` APIs vẫn là boundary; page-view/draft/session/CAS/unknown/reconcile vẫn custom vì đó là domain lifecycle, không phải cache copy.

**Trạng thái:** direction và written spec **Accepted/Approved03/11/2026**; implementation plan [2026-11-03-tanstack-cache-ownership.md](../../superpowers/plans/2026-11-03-tanstack-cache-ownership.md) đã viết nhưng **Pending user plan approval**; production implementation **chưa thực hiện**. Giữ nguyên historical heap/performance FAIL, heap amendment proposal và mọi evidence cũ; không sửa ADR-002 thành capability hiện tại. [Validation checkpoint](validation.md#tanstack-cache-ownership--written-spec-approved-implementation-plan-pending-03112026) ghi provenance/checks và giới hạn của lượt docs-only này.

## TanStack cache ownership direction — Accepted03/11/2026; spec/plan Pending

**Checkpoint lịch sử trước written-spec approval; trạng thái hiện hành ở mục phía trên.**

Người dùng chấp thuận hướng giữ **TanStack Query5.105.0** cho server state/cache và **React state** cho UI/draft; giảm ownership cache tùy biến/direct Query internals; chỉ cân nhắc Zustand khi có nhu cầu UI chia sẻ được chứng minh. RTK/SWR và nâng dependency không được chọn. Đây là chấp thuận **direction**, không phải chấp thuận heap amendment A/H1–H5, performance waiver, hay kết luận root leak.

Đặc tả Proposed hiện hành là [TanStack cache ownership spec](technical/tanstack-cache-ownership-spec.md). Spec đề nghị loại `QueryCache.build`, `Query.setOptions`, canonical `gcTime:Infinity` và imperative canonical seed; handoff clamp thử qua public `useQuery` query function, cùng cancellation/lifetime guards và `gcTime:0`, nhưng chỉ được triển khai sau written-spec review/approval, implementation plan và equivalent tests. `useQuery`/public `QueryClient` APIs vẫn là boundary; page-view/draft/session/CAS/unknown/reconcile vẫn custom vì đó là domain lifecycle, không phải cache copy.

**Trạng thái:** direction Accepted03/11/2026; detailed spec **Proposed/Pending independent review + user written-spec approval**; implementation plan **chưa viết/chưa duyệt**; production implementation **chưa thực hiện**. Giữ nguyên historical heap/performance FAIL, heap amendment proposal và mọi evidence cũ; không sửa ADR-002 thành capability hiện tại. [Validation checkpoint](validation.md#tanstack-cache-ownership-spec--proposed-03112026) ghi provenance/checks và giới hạn của lượt docs-only này.

## DB authority — Accepted02/11/2026

Nguồn thẩm quyền: người dùng chọn **“Chốt phương án1”** sau [nghiên cứu01/11](technical/unicode-search-options-research.md#phương-án1--postgresqlicu-là-nguồn-chuẩn-duy-nhất), rồi yêu cầu tiếp tục ngày02/11/2026. Research được independent R1 review tại tip `c7032792413f3eb18222abad79556e92e5dc399e`, 0C/0I/0M, ready for decision; review nghiên cứu không là policy PASS. Quyết định này thay nhánh ưu tiên tìm runtime khớp JS trong proposal lịch sử; không cấp quyền tải/cài hoặc enrollment mới.

Accepted delta: **PostgreSQL17.11/ICU67.1 là authority duy nhất cho lowercase tên/query và thứ tự tên/ID** dùng chung page, fullmonth và hai bảng Excel. Giữ ICU `vi`, equivalent/nondeterministic canonical ties rồi ID ASC; web giữ thứ tự server, không resort. q trim ECMAScript ở boundary (giới hạn200 codepoints sau trim giữ nguyên), rồi DB lower cả tên và q, literal substring bằng `C` sau lower; ID text giữ raw trimmed q, case-sensitive. `%`, `_`, backslash literal. Không normalize/unaccent/fuzzy, thêm ràng buộc alphabet/tên hoặc tự đổi names.

Observable TJE đã chấp nhận: ID126 tênU+1C89 lower vẫnU+1C89, ID127 tênU+1C8A lower vẫnU+1C8A; query hoa chỉ126, query thường chỉ127, order126 trước127. Không yêu cầu kết quả name lower/order DB bằng `Intl`/`toLocaleLowerCase` JS. Canonical101/102 và duplicate108/109 tiếp tục ID ties như cũ; search precomposed/decomposed vẫn literal tách riêng. Không mở rộng approval này thành mọi sai khác Unicode hoặc chứng minh mọi tên từ fixture hữu hạn.

Owner contract hiện hành: [design15](design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026), [API8](technical/api-contract.md#db-authority--accepted02112026), [requirements](approved/requirements.md#chốt-db-authority--02112026). [Plan hiện có](technical/server-pagination-implementation-plan.md) được amend phần còn lại; không tạo plan/design mới. Người dùng đã Approved plan01/11 và Continue02/11: không hỏi lại choice/design/method/plan approval cho necessary in-scope implementation. **Plan delta phải independent review trước code**, mỗi task actual tests và fresh review giữ nguyên.

Gate hiện tại: Policy `pg17.11-icu67.1-vi-db-authority-v1` **PINNED** và Task1 continuation **COMPLETE đúng bounded capability** sau independent R1 READY TO PIN/0C/0I/0M tại reviewed TIP `321d488f041e6d5386adea9f86ca8749ef896144`. Task3 đã đủ prerequisite Task1/2 và là next implementation; Task4 vẫn chờ3 reviewed PASS, Task8 chờ3/4/7 (7 đã complete), Task9 chờ8 và các gate riêng. Không claim Task3/4/8/9 complete. Tasks2/5/6/7 reviewed complete giữ nguyên. Old JS FAIL4/FAIL5/PASS26/13 hashes và artifacts giữ nguyên. Startup wrapper exit−1 và launch-script fix vẫn **Not verified**. Live HTTP/auth/Prisma/session/ports, product SQL/page/fullmonth/Excel, browser/performance/native/SR/reader/final whole-branch gates giữ riêng; không nâng thành PASS từ capability hữu hạn.

Scope thực thi tiếp dùng existing portable fake Task10 owner/alias `task10-acceptance`/role `mkw_task10` và identity gate hiện có; không cần harness enrollment/runtime acquisition mới. Runtime unchanged, không download/install/network/production/global/push/merge/deploy. Main chỉ coordinate; sequential fresh implementer/reviewer tối đa Sol/high, cấm Astra/children/helpers của implementer. Khi mismatch/capability thiếu: giữ gate FAIL/BLOCKED và báo đúng, không repin theo observed SQL.

## DB-policy capability pin — 02/11/2026

Independent review report `.superpowers/sdd/server-pagination-implementation-plan/task-1-db-policy-review-r1.md`, taskId `node:delegated-task:command%3Amcp%3Aecaa155a-8ea8-4525-8f6a-c7e0c3d7a54d%3Adelegate-task%3Amkw-task1-db-policy-review-r1-321d488`; exact range `47f26cfb3aea58e24486e48b15aa8ed18a922d2f..321d488f041e6d5386adea9f86ca8749ef896144`. Main lấy clean status-closure commit làm **next Task3 execution BASE**; full immutable SHA ghi tại `.superpowers/sdd/server-pagination-implementation-plan/task-1-db-policy-pin-report.md` sau commit. Reviewed source/capability BASE vẫn là `321d488f041e6d5386adea9f86ca8749ef896144`; không tạo source mới trong pin closure.
