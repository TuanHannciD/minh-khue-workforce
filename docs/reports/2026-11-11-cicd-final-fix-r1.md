# CI/CD final fix R1 — 11/11/2026

## Hồ sơ trước sửa

- Mục tiêu/acceptance: xử lý I-01–I-05, M-01, kiểm tra M-02 và lint theo brief/review final R1 đã duyệt; giữ các guard security/freshness/receipt/PostgreSQL trước đó.
- Base: checkout sạch `9f899308d6fdf1508ab75421e56457cf20e1f9b2`, đã fast-forward tới `93a8953ffe9b2d286fbbeef22981f70e88a00720` trước sửa.
- Writer: implementation sub-agent tại `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-82e1ccb2`, branch `t3/fix-cicd-final-review`. Review route: parent dispatch reviewer độc lập trên exact committed tip; không có nested agents.
- Scope/resources: release workflows, scripts/product release/deploy, regression fixtures, runbook và report này; dependency/runtime/check logs thuộc worktree này. Runtime Node24.22.1 + pnpm12.15 đọc từ runtime task4 đã checksum-verified; dependency cài riêng theo lockfile.
- Risk: provenance rollback, trusted verifier, target backup binding, dispatch compatibility, SSH key pinning, timeout/cancel. Không SSH/production/DB mutation/push/main merge/signing/live GitHub/Docker.
- Nguồn yêu cầu: brief và full final-review-r1 đọc từ `.agent-reviews` của integration checkout, chỉ đọc. Không phụ thuộc chúng được copy sang worktree.
- Target ruling: giữ contract hiện có `MKW_SSH_HOST`, `MKW_DEPLOY_PATH`, `MKW_PROJECT_NAME` từ trusted vars; database `mkw` do bootstrap/Compose/backup-source sở hữu; initial-empty identity đúng chuỗi `${host}/${path}/${project}` của backup producer. Không đặt giá trị target production mới.
- Bước tiếp đã thực hiện: thêm regression RED, sửa từng boundary, chạy full checks, ghi evidence/giới hạn; còn lại là commit local và bàn giao exact tip.

## Kết quả theo finding

- **I-01 Fixed:** rollback yêu cầu `old_release_artifact_id`, chỉ nhận dispatch từ `refs/heads/main`, checkout controls từ `main`, resolver kiểm exact artifact ID, expiry, owning run, successful canonical `build-release.yml`, manifest/source repository/SHA và build metadata trước download/SSH.
- **I-02 Fixed:** post-deploy workflow thực thi `policy/scripts/product/post-deploy-verify.sh`; release-source verifier chỉ được giữ như data. Sentinel bypass fixture vẫn fail khi trusted runtime verifier fail.
- **I-03 Fixed:** trusted target host/path/project và database `mkw` đi từ environment vars; runner, coordinator và remote entrypoint dưới lock kiểm host/database/initial-empty target identity. Wrong host/database/empty evidence và target thay đổi trước mutation đều fail.
- **I-04 Fixed:** artifact/run IDs và backup kind/name optional cho preflight; release mode có gate exact ID/run/name/kind trước download/SSH. Regression matrix covers dry-run/bootstrap/release.
- **I-05 Fixed:** deploy/post-verify/rollback lọc scan line theo exact SHA256 fingerprint, file pinned nonempty, vô hiệu hóa global known_hosts và truyền `UserKnownHostsFile` cho mọi SSH/SCP. Mixed-key fixture chỉ giữ pinned key.
- **M-01 Fixed:** coordinator có tổng budget 150 phút dưới job 180 phút, discovery 5 phút, stage budgets backup 50/deploy 50/verify 30; API/zip/dispatch/cancel timeout 30 giây. Timeout không dispatch stage sau; cancel exact child khi hỗ trợ, nếu không ghi run URL/correlation active.
- **M-02 Fixed:** runbook/checklist/backup/rollback/deploy docs cập nhật one-SHA coordinator, preflight compatibility, target config, timeout/cancel, exact rollback artifact and current policy verifier.
- **Lint fixes:** sửa các escape không cần thiết ở `release-workflow-policy.test.mjs` và `task3-supply-chain-policy.test.mjs`; product lint sạch.

## Kiểm chứng

- Runtime: Node `v24.22.1`, pnpm `12.15.0`, lockfile install trong worktree riêng.
- `node --test tests/product-tooling/*.test.mjs`: **539/539 pass**.
- `pnpm run product:lint`: **pass**.
- `pnpm run product:typecheck`: **pass**; `pnpm run product:build`: **pass**; `pnpm run product:boundaries`: **pass**; `pnpm run product:contract:check`: **pass**.
- Root `npm run lint`: **pass**; root `npm test`: **10/10 pass**.
- Focused RED/GREEN fixtures: rollback resolver **7/7**, coordinator/transport **31/31**, final review boundaries **7/7**, and deploy/rollback gates **12/12**; the full tooling suite above includes these tests. The larger coordinator and deploy gate files remain cohesive boundary matrices, so their size is retained to keep the finding coverage together rather than splitting assertions into opaque fragments.
- YAML parse + Bash `-n`: **7 workflows, 36 inline blocks, 4 standalone scripts pass**.
- Changed-file Prettier check: **pass**; `git diff --check 93a8953..tip`: **pass**. `product:check` still stops at three pre-existing, unchanged CSS files: `apps/web/src/features/attendance/ui/attendance.css`, `apps/web/src/features/attendance/ui/export-button.css`, and `apps/web/src/shared/styles/tokens.css`.
- `pnpm run product:test`: product-tooling 539/539, sandbox 32/32, web 353/353; API test **20 pass, 5 fail**. The failed cases are `complete G1 JSON fixtures validate runtime requests, OpenAPI responses and generated TypeScript consumers`, `generated page consumers keep optional wire, required parsed input and full MonthDto distinct`, `reconcile requires both typed arrays while either array may supply the nonempty request`, `write operation branches reject forbidden fields with otherwise complete valid requests`, and `contextual work and overtime values retain bounds, absence, null and source kind constraints`. Each fails in `apps/api/test/auth-sandbox.mjs` because it spawns `pnpm.exe`, absent from the supported runtime (which provides locked `pnpm.mjs`/`pnpm.cmd`), producing Windows `COMMAND_PROCESS_ERROR` exit `-4058`. No production/SSH/Docker/live GitHub/signing/DB run.
- `npm run check`: **Failed at existing `check:docs`** on 19 historical missing `.superpowers/sdd/tanstack-cache-ownership` links; root lint/test independently pass. These links were explicitly baseline in the brief and were not fabricated or deleted.

## Commit and limits

- Commit: implementation commit and final report commit will be recorded here after the final verification pass; the implementation SHA is filled in before handoff.
- Worktree: `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-82e1ccb2`, branch `t3/fix-cicd-final-review`.
- Remaining limits: live GitHub artifact/API semantics, protected approvals, attestation service, SSH host, Docker, migration and production target remain Not run by scope. Independent parent review of the exact committed tip remains pending; this report does not claim live-runtime proof.
