# Manual provenance — lọc producer khi discovery

Base: `8e6ff160c285d800268ae2d26dc681621edd8be3`, branch `t3/complete-push-main-cd`, worktree `t3-8849e8d4`. Scope chỉ Important regression R2: một artifact cùng tên từ producer không canonical làm discovery dừng dù có artifact canonical hợp lệ. Writer tự triển khai; parent review exact tip. Không production/settings/push/merge/deploy hay nested delegation.

## Amendment và kiểm chứng dự kiến

Tách predicate canonical source/ref/event khỏi completed/success policy hiện có. Coordinator dùng predicate identity để bỏ candidate không canonical trước exact resolver; status của latest không cấp hay thu hồi proof cho artifact cũ. `resolveExactRelease` vẫn kiểm exact producing attempt, ownership, checksum/digest, source metadata và creation window; không catch rồi bỏ qua lỗi của candidate canonical. Missing/mismatched provenance và nhiều candidate canonical hợp lệ vẫn fail closed.

RED mixed candidates trên exact base, gồm latest success/failed/in-progress; GREEN phải chọn đúng artifact, tới backup/deploy/verify và không đọc archive của producer bị loại. Thêm guard regressions cho canonical candidate sai binding/metadata và ambiguity. Focused + full tooling serial, lint/format/diff và docs; giữ Docker/product evidence trước vì không đổi runtime deploy/state path.

## Finding và thay đổi

`isCanonicalBuild` tách nguyên các điều kiện workflow/event/main/source/ref hiện có khỏi terminal status. `isTrustedBuild` tiếp tục yêu cầu cả canonical identity và completed/success cho exact attempt. Coordinator chỉ dùng identity của candidate run để lọc trước resolver; không ghi đè status/conclusion và không catch lỗi resolver để lặng lẽ bỏ canonical candidate lỗi. Vì vậy attempt1 vẫn hợp lệ khi latest attempt2 failed/in-progress, nhưng archive sai metadata/ownership/digest hoặc nhiều artifact canonical hợp lệ vẫn không được dispatch.

Chỉ đổi hai source modules, test coordinator và báo cáo này. Tests đưa năm producer không canonical lên trước artifact hợp lệ, kiểm đúng release artifact101/attempt1 và không đọc archive bị loại; ba trạng thái latest đều đi qua backup → deploy → verify ở external API boundary giả. Sáu guard cases kiểm run ID, attempt, metadata, metadata thiếu field, digest và ambiguity; cả khi có artifact canonical khác hợp lệ, lỗi canonical không bị bỏ qua.

## Kiểm chứng

Node24.22.1/pnpm12.15.0, locked dependencies hiện có; không cài dependency hay tạo shim. Evidence: `.agent-runs/push-main-completion/manual-provenance-candidate-filter/`.

| Gate           | Kết quả                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED exact base | `red-exact-8e6ff160.log`: **3 failure dự kiến /9 tests**, exit1; cả ba mixed cases bị producer không canonical chặn. Source snapshot từ `git archive`, không sửa checkout khác. |
| Focused        | `focused-final.log`, exit0: **100/100 PASS**; coordinator policy, manual provenance, API reuse và LKG recovery.                                                                 |
| Full tooling   | `tooling-final.log`, exit0: **761/761 PASS**, 0 skipped/cancelled, khoảng169s; `node --test --test-concurrency=1 tests/product-tooling/*.test.mjs`.                             |
| Lint/format    | `pnpm run product:lint` và Prettier changed files **PASS** (`lint.log`, `format.log`).                                                                                          |
| Syntax/policy  | YAML9 workflows/55 inline Bash, pinned actionlint1.7.9, `bash -n scripts/product/deploy-entrypoint.sh`, `git diff --check`: **PASS**.                                           |
| Docs           | `docs.log`: exit1, đúng **19 historical missing links**, không thêm missing link mới.                                                                                           |

Lần focused đầu của tests mới có3 failure do fixture tách method làm mất `this` khi lookup backup; sửa binding fixture rồi kiểm lại. Đây không phải RED của finding; chỉ log RED exact base ở trên chứng minh regression. Không có full run lỗi trong lượt này.

## Giới hạn và bàn giao

Không rerun Docker hay product type/build/boundaries/contract/API/web: không đổi container/runtime/workflow path. Giữ evidence trước trong [rerun fix](2026-11-12-manual-provenance-rerun-fix.md), gồm Docker A→B/recovery/refusal/backup restore; không coi là live GitHub/GHCR/SSH/VPS proof. 5 Windows API `pnpm.exe` child errors và prior web full-suite timeout/targeted25/25 vẫn chưa được giải quyết; không gọi các giới hạn đó là fresh PASS.

Implementation/tests commit: `df4772bfb64c86819a97bb8c757e0e3fd66978df`. Commit tiếp chỉ ghi report; exact handoff tip lấy bằng `git rev-parse HEAD` trong bàn giao để tránh hash tự tham chiếu. Parent fresh scoped review exact committed tip; chưa claim final acceptance. Không push/merge/deploy hay đổi settings.
