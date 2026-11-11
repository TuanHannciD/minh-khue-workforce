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
- Regression RED/GREEN tập trung bao gồm rollback resolver, coordinator/transport, final review boundaries và deploy/rollback gates; tất cả nằm trong full tooling **539/539**. Giữ các file test lớn cho coordinator và deploy gate vì mỗi file là một ma trận boundary liên quan, dùng chung fixture và thể hiện đầy đủ tác động của từng finding.
- YAML parse + Bash `-n`: **7 workflows, 36 inline blocks, 4 standalone scripts pass**.
- Prettier trên file thay đổi: **pass**; `git diff --check 93a8953..tip`: **pass**. `product:check` dừng tại lỗi format có sẵn trong ba file CSS không sửa: `apps/web/src/features/attendance/ui/attendance.css`, `apps/web/src/features/attendance/ui/export-button.css`, `apps/web/src/shared/styles/tokens.css`.
- `pnpm run product:test`: product-tooling 539/539, sandbox 32/32, web 353/353; API test **20 pass, 5 fail**. Năm test lỗi là `complete G1 JSON fixtures validate runtime requests, OpenAPI responses and generated TypeScript consumers`, `generated page consumers keep optional wire, required parsed input and full MonthDto distinct`, `reconcile requires both typed arrays while either array may supply the nonempty request`, `write operation branches reject forbidden fields with otherwise complete valid requests`, `contextual work and overtime values retain bounds, absence, null and source kind constraints`. Chúng lỗi trong `apps/api/test/auth-sandbox.mjs` vì gọi `pnpm.exe`, không có trong runtime đang dùng (`pnpm.mjs`/`pnpm.cmd` theo phiên bản khóa), với Windows `COMMAND_PROCESS_ERROR` exit `-4058`. Không chạy production/SSH/Docker/live GitHub/signing/DB.
- `npm run check`: **Failed tại `check:docs` có sẵn** do 19 link lịch sử thiếu dưới `.superpowers/sdd/tanstack-cache-ownership`; root lint/test chạy riêng đạt. Brief xác nhận baseline này; không tạo giả hoặc xóa evidence.
- Evidence local được giữ trong thư mục ignored `.agent-runs/cicd-final-fix-r1/`: `final-tooling.log` là lượt tooling cuối; `.agent-final-product-test.log`, `.agent-product-check.log`, `.agent-root-check.log` ghi các giới hạn; các log `.agent-red-*` giữ kết quả RED trước sửa. Dependency và evidence không đưa vào commit.

## Commit và giới hạn

- Commit triển khai: `0d350d47abe91786ee5ed5454095c59e7253e8af` (`fix(ci): close final review boundary gaps`). Commit báo cáo kế tiếp chỉ cập nhật bằng chứng và SHA này; exact tip được trả trong handoff để parent review độc lập.
- Worktree: `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-82e1ccb2`, branch `t3/fix-cicd-final-review`.
- Giới hạn: live GitHub artifact/API, protected approvals, attestation service, SSH host, Docker, migration và production target vẫn **Not run** theo scope. Parent còn phải review độc lập exact committed tip; report không xác nhận runtime thật đã đạt.
