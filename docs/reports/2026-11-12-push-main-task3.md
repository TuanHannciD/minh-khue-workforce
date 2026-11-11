# Báo cáo Task 3 — backup/verify tự động và orchestration idempotent

Ngày: 12/11/2026. Base: `c8cfe12` (`feat/modern-cicd`), worktree `t3/automate-deploy-verification`. Writer không dùng Agent lồng, không push/merge main, không SSH/VPS/DB/registry thật.

## Phạm vi và quyết định

Task này hoàn thiện đường push-main với các stage backup → deploy → verify có một correlation, timeout hữu hạn và output run/artifact chính xác. Task 4 auto rollback/schema guard không được triển khai. Các route manual, scheduled backup, SSH fingerprint, backup freshness/target, registry digest/auth và attestation hiện có được giữ.

Ruling: current state chỉ có hai trạng thái orchestration tối thiểu: `deploying` (đã bắt đầu mutation, rerun phải dừng để operator xử lý) và `verified` (post-deploy verify ghi atomically). Không suy ra database rollback hoặc schema compatibility từ journal này.

## Thay đổi

- `coordinator.mjs` kiểm tra cancellation trước dispatch, stale source trước và sau backup, current state cho `already-deployed`/`incident-required`, reuse exact producer cùng correlation khi rerun, reject producer giả/mơ hồ, chừa timeout riêng cho tổng và từng stage, chỉ cancel khi child báo ranh giới mutation đã biết là an toàn và adapter cho phép; không cancel child khi run đã báo mutation bắt đầu hoặc trạng thái mutation chưa biết. Stage lỗi không dispatch stage sau; timeout trả URL/attempt và trạng thái active/uncertain.
- `orchestration-policy.mjs` thêm quyết định pure cho `superseded`, `already-deployed` và state không chắc chắn. `github-actions.mjs` đọc SHA canonical `main`; coordinator manual giữ `enforceCurrentSource: false` để không phá recovery SHA bất biến.
- Push-main thêm preflight read-only current-state/source gate, giữ `cancel-in-progress: false`, truyền `operation_id`/correlation xuống backup/deploy/verify và xuất trạng thái `superseded`/`already-deployed`/`failed` rõ ràng. Deploy recheck source trước remote stage; outcome `already-deployed` từ gate dưới remote lock được truyền tới job summary, không chạy verifier của operation mới.
- VPS deploy journal ghi operation ID trước mutation; verify kiểm operation dưới lock rồi ghi `verified`. Manual route không tự skip theo journal. Coordinator child dùng correlation có tiền tố `parent-` và kiểm parent workflow dispatch đang chạy trên `main`; các workflow reusable/manual vẫn giữ input cũ và giới hạn GitHub Actions.
- Thêm `push-main-orchestration.test.mjs` cho duplicate producer, queued SHA mới, rerun, timeout, cancel, stale source, invalid current state, unknown mutation boundary và no-later-stage. Cập nhật policy tests cho preflight/status, quyền `actions: read` của backup child và giữ fixture deploy/verify cũ.

## Kiểm chứng

| Check | Kết quả |
| --- | --- |
| RED focused orchestration trước implementation | **Failed 6/7** đúng hành vi thiếu: skip outcomes, duplicate reuse, mutation-aware cancel |
| Focused coordinator/workflow/deploy/boundary suite cuối | **PASS 71/71** |
| `pnpm run product:test:tooling` | **PASS 571/571** |
| `pnpm run product:lint` | **PASS** |
| `pnpm run product:format:check` | **PASS** sau format-only CSS baseline của Task 1 |
| `pnpm run product:typecheck` | **PASS** |
| `pnpm run product:build` | **PASS** (có warning chunk >500 kB hiện hữu) |
| `pnpm run product:boundaries` | **PASS** |
| `pnpm run product:contract:check` | **PASS** |
| `actionlint`, Bash `-n`, `git diff --check` | **PASS** |

Runtime kiểm chứng: Node `v24.22.1`, pnpm `12.15.0`, lockfile frozen; dependencies cài trong worktree/task resource. `npm run check` không dùng làm PASS vì check:docs còn 19 historical links đã biết; live GitHub Actions/API, GHCR, attestation, Docker rehearsal, SSH/VPS, migration, DB và production smoke **Not run** theo quyền task. Không claim Activated/Released.

Resource/evidence local: `.agent-runs/push-main-task3/` giữ runtime Node hỗ trợ, wrapper pnpm pin, actionlint và log tooling. Lượt kiểm cuối dùng wrapper này; PATH mặc định là Node `v24.12.0` ngoài supported range. Root lint/test đã chạy **PASS**, 10/10; hai package typecheck/build và boundary/contract chạy trực tiếp cùng runtime hỗ trợ đều **PASS**. Wrapper `product:typecheck` ở lượt resume **FAILED** do nested pnpm trên Windows, nên không lấy lỗi wrapper làm kết quả compiler. `product:check` đã chạy **FAILED baseline**: năm API contract cases gọi `pnpm.exe` không tồn tại (`COMMAND_PROCESS_ERROR`, -4058); tooling/sandbox/web trong lượt đó đạt. Không sửa dependency/lockfile để che giới hạn môi trường.

Hai regression cuối có RED→GREEN riêng: backup thiếu quyền Actions read (undefined thay vì `read`); timeout khi mutation boundary unknown vẫn gọi cancel. Fixture supported-cancel cũ giờ khai báo rõ `mutation_started: false` và `canCancelRun: true`; adapter Actions thật luôn từ chối cancel vì không có bằng chứng ranh giới migration. Regression remote-rerun chạy Bash transport thật trong fixture, chứng minh `already-deployed` được xuất thành output. Ba CSS được formatter chuẩn hóa working copy về blob HEAD, không có diff semantic/CSS được commit.

Tip sau commit cần parent fresh-review exact snapshot; parent tự quyết định integration/merge.
