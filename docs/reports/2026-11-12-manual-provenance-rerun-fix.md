# Manual provenance — producing attempt độc lập với latest rerun

Base: `cf7cf909caf7f810fbd28d241e08195a3018b150`, branch `t3/complete-push-main-cd`, worktree `t3-8849e8d4`. Scope chỉ Important finding: latest attempt2 failed/in-progress chặn artifact hợp lệ của producing attempt1. Writer tự triển khai; parent fresh scoped review exact committed tip. Không production/SSH/settings/push/merge/nested agents.

## Amendment trong thiết kế đã duyệt

`resolveExactRelease` dùng binding attempt từ dispatch hoặc canonical build metadata, kiểm exact attempt API và không consult latest trong nhánh đã bound. Dispatch và metadata phải khớp; exact producer vẫn phải canonical source/ref/event, completed/success, đúng ID/attempt và artifact creation window. Archive digest/checksum/manifest/image metadata guards giữ nguyên. Chỉ archive legacy chưa có binding mới đọc latest để lấy số attempts, rồi tìm duy nhất một trusted successful producer theo creation window; status latest không phải proof cho artifact cũ.

Coordinator bỏ prefilter latest-run, giao validation cho resolver chung. API reuse/LKG recovery tiếp tục dùng immutable ownership. Automatic in-progress producer path không đổi. Files thay đổi giới hạn resolver/coordinator và regression tests; không đổi workflow/environment hay container/runtime commands.

Kế hoạch: RED trên exact base → GREEN resolver/coordinator/manual deploy/verify/reuse/LKG; adversarial exact producer/attempt/digest/checksum và legacy ambiguity; full tooling serial, lint/format/YAML/Bash/actionlint/diff/docs. Tái sử dụng Docker/product build evidence trước vì không đổi runtime path.

## Kết quả và phản hồi finding

RED snapshot đúng base trong `manual-provenance-rerun/red-exact-cf7cf909.log`: 15 failure dự kiến trong 24 targeted tests khi source chưa có fix; các mismatch guards vẫn fail closed. GREEN focused `focused-final.log`: **75/75 PASS**, exit 0. Full `tooling-final.log`: **752/752 PASS**, exit 0, 0 skipped/cancelled, duration khoảng160s. Coverage thêm success/failed/in-progress latest rerun cho metadata-bound, explicit dispatch-bound, coordinator, API reuse, LKG recovery, manual deploy/verify và legacy discovery; mismatch ID/attempt/source/ref/event/status vẫn bị từ chối.

Lần full đầu `tooling-full.log` là **741/743, 2 failure**, exit1: sau khi bỏ latest gate, fixture chỉ giả `gh execFile` mà chưa giả archive download nên lỗi `spawn gh ENOENT`. Đã giữ early canonical rejection bằng exact supplied attempt; fixture thiếu route `/runs/10/attempts/1` sau đó được bổ sung để kiểm đúng API mới. Focused 75/75 và full 752/752 sau sửa đều PASS. `product:lint` exit0, Prettier changed-files exit0, YAML 9 workflows/55 inline Bash PASS, actionlint PASS, `bash -n scripts/product/deploy-entrypoint.sh` PASS, `git diff --check` PASS. Lint/format lần đầu thiếu process PATH của toolchain đã cài nên lỗi launcher; chạy lại bằng Node24.22.1/pnpm12.15.0 đúng locked dependencies đạt, không cài dependency hay tạo shim.

`node scripts/check-docs.mjs` vẫn báo đúng **19 historical missing links**; không có link mới do report này. Docker không rerun vì thay đổi chỉ ở Actions producer lookup, không đổi container/service/migration/state runtime. Giữ nguyên Docker A→B/recovery/refusal/backup-restore evidence trước đó; đó không phải live GitHub/GHCR/SSH/VPS proof. Giữ giới hạn 5 Windows API `pnpm.exe` child errors và prior web full-suite timeout/targeted25/25 evidence; không claim các gate ngoài scope là mới PASS.

Evidence nằm dưới `.agent-runs/push-main-completion/manual-provenance-rerun/`; snapshot RED được xuất từ exact base bằng `git archive`, không sửa checkout khác. Expanded RED 15/24 là run cuối đã kiểm trên exact base; lượt RED ban đầu có một guard setup sai kiểu number/string đã được sửa trước khi ghi kết quả cuối, không dùng lượt đó làm bằng chứng guard regression. Source patch cuối chỉ sửa attempt selection/identity; archive checksum contract giữ nguyên.

Implementation/tests commit: `165197a92afe06a3e22c80920cf4347b9fc941cc`. Commit tiếp chỉ ghi báo cáo này; exact handoff tip lấy bằng `git rev-parse HEAD` trong bàn giao để tránh hash tự tham chiếu. Parent sẽ fresh scoped review exact committed tip; báo cáo không claim final acceptance. Không có push/merge hay production access.

Lệnh chính: `node --test --test-concurrency=1 tests/product-tooling/*.test.mjs`; focused chạy bốn files `manual-provenance-fix`, `api-reuse`, `integrated-r2`, `deploy-backup-gate`; `pnpm run product:lint`, `pnpm exec prettier --check` các file đổi, `node .agent-runs/push-main-completion/verify-yaml.mjs`, pinned actionlint1.7.9, Bash syntax và diff/docs checks như trên. Type/build/boundaries/contract/root/product suites giữ evidence trước trong [manual provenance](2026-11-12-manual-provenance-fix.md) và [R2](2026-11-12-push-main-integrated-fix-r2.md), không gọi là fresh PASS của lượt này.
