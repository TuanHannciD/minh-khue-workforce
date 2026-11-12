# Push-main completion — sửa review R1

Ngày 12/11/2026. Base chính xác `5a5127ac04722b293dc3d9997fa05cb58209029d`; branch/worktree hiện hữu `t3/complete-push-main-cd` / `t3-8849e8d4`. Scope chỉ Important finding về gateway promotion/LKG. Writer tự triển khai, không nested agents; parent tổ chức fresh scoped và whole-branch review. Không production/SSH/VPS/GitHub settings/push/merge.

## Kế hoạch và acceptance

RED trên base: mất/giả receipt, migration unknown, API/PG runtime đổi, policy binding sai và class-confusion phải bị từ chối ở promotion, existing verified state, classify/reuse/already-deployed. Test actual promotion CLI và block post-deploy verifier phải giữ nguyên current-state/LKG khi thất bại.

Factor pure gateway validators thành dependency acyclic; suy gateway obligations từ canonical manifest policy và markers, kiểm `validGatewayEvidence`, `dataOperations: gateway-only`, `migrationOutcome: not-executed`, runtime đúng receipt.after và DB invariants. Promotion giữ bounded previous baseline để LKG tự kiểm được receipt mà không tăng nested history. Gateway recovery giữ source operation identity đã bind policy; recovery operation ghi riêng. Healthy normal API-changing, gateway LKG/reuse/recovery phải tiếp tục đạt.

Resource/evidence: `.agent-runs/push-main-completion/fix-r1/`; local Docker rehearsal riêng evidence path, chỉ engine task-owned. Chạy focused/full tooling một lần sau fix, lint/format/type/boundaries/YAML/Bash/actionlint/diff và real Docker vì đổi state path. Report giữ 19 historical links, 5 Windows API errors và web full-suite timeout từ review (targeted25/25 pass), không tự gọi timeout là baseline.

## Kết quả và bằng chứng

Implementation tip được kiểm chứng và commit: `c911766ac9066d465e64154c3d388365531870a2` (report-only follow-up ghi hash này; final report tip được trả trong handoff). Prior review focused29/tooling657/root10 và các finding đã PASS vẫn giữ nguyên lịch sử; R1 không lặp các suite web/API/root ngoài scope.

- RED trên isolated copy của exact base `5a5127a`: 31 adversarial tests fail (promotion accepted missing/forged/confused gateway state).
- GREEN trên fix: focused R1 promotion/LKG/CLI tests **31/31 PASS**; focused release/manual/reuse suites **47/47 PASS**; full product tooling **690/690 PASS**.
- Product lint, changed-file Prettier, typecheck, boundaries, YAML/55 inline Bash, actionlint and edited shell syntax **PASS**. Docs checker reports the existing **19 historical missing links** only.
- Real Docker rerun `.agent-runs/push-main-completion/fix-r1/docker/result.json`: real containers/builds, A→B healthy, unhealthy gateway recovery, changed/unknown refusal, API/PG invariants, five encrypted backup restores, normal API-changing deploy verified. Local GitHub/signing/GHCR/VPS boundary remains simulated/not run.

## Finding response

`gateway-validation.mjs` is now the acyclic source of gateway policy/receipt/promotion validation. `operation-state.mjs` rejects promotion whenever canonical policy or gateway markers require the class unless data operations, migration outcome, policy descriptor, runtime receipt, runtime services and DB snapshots all match. `verified-state.mjs` applies the same obligation when validating an existing state, so invalid LKG cannot seed classify, API reuse or `already-deployed`. Promotion keeps a bounded baseline for gateway receipts and deletes nested history for normal releases. `auto-rollback-io.mjs` validates the restored state before emitting it.

The verifier promotion block writes current-state and last-known-good only after this validation succeeds; the atomic preservation tests retain both prior files on every mutation. Healthy gateway promotion, reuse and recovery remain green. Normal API-changing promotion remains on the existing migration path.

## Limits

No production SSH/VPS/database mutation, GitHub settings/secrets/reviewer configuration, push or main merge. The known five Windows API `pnpm.exe` child-process failures remain documented; web full-suite timeout from the prior review remains an honest review limitation (targeted 25/25 passed), not silently reclassified as baseline. Local Docker evidence does not establish live attestation, registry, target backup custody, business-data compatibility or universal DB rollback.
