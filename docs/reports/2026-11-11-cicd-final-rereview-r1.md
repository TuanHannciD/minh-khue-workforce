# Final independent re-review R1

## Snapshot, phạm vi và verdict

- Exact committed tip được review: `ab571f5d6eb6ccf46c426b380d5f73f03639b703`.
- Code commit chứa thay đổi: `0d350d47abe91786ee5ed5454095c59e7253e8af`.
- Fix base: `93a8953ffe9b2d286fbbeef22981f70e88a00720`.
- Checkout đọc-only: `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-82e1ccb2`, branch `t3/fix-cicd-final-review`; trạng thái cuối sạch, HEAD đúng exact tip.
- Đã đọc plan `docs/superpowers/plans/2026-11-11-modern-cicd-orchestration.md`, authority/routing/permissions/quality/source-navigation và `.worktrees/cicd-orchestration/.agent-reviews/final-review-r1.md`, `final-fix-r1-brief.md`, cùng `docs/reports/2026-11-11-cicd-final-fix-r1.md`.

**Spec verdict: PASS (scoped).** I-01–I-05 và M-01/M-02 đều có control hiện hành và regression hành vi tương ứng; không còn Critical/Important/Minor finding được chứng minh trong phạm vi re-review.

**Quality verdict: PASS (scoped, có giới hạn môi trường).** Các test thay đổi chạy logic Bash thực được trích từ workflow, với chỉ transport/API/mutation ngoài hệ thống được thay bằng fixture. Không có bằng chứng live GitHub Actions, artifact API thật, protected approval, Docker, signing/attestation service, SSH, migration hoặc production DB. Vì vậy đây không phải production-readiness PASS.

## Disposition từng finding trước

### I-01 — rollback artifact/control provenance: FIXED

- `.github/workflows/rollback.yml:46-61` bắt buộc `refs/heads/main`, checkout control `ref: main`, rồi chạy resolver trusted trước download/SSH.
- `scripts/product/release/resolve-release.mjs:38-60` yêu cầu exact artifact ID, non-expired, tên SHA chính xác, owning run đúng, run thành công của `.github/workflows/build-release.yml` trên canonical main, và kiểm `release-manifest.json` + `build-metadata.json` source SHA/repository linkage.
- Download dùng exact `old_release_artifact_id` và `old_release_run_id` ở rollback.yml:75-89; không có fallback theo tên/latest.
- Regression hành vi `tests/product-tooling/rollback-artifact-resolver.test.mjs` chạy 11 case, gồm expired, wrong owner/run, spoof workflow, untrusted branch, failed producer, manifest/metadata/repository mismatch; tất cả đạt. `final-review-boundaries.test.mjs` kiểm untrusted dispatch ref fail trước API/SSH.

### I-02 — historical post-deploy verifier: FIXED

- `.github/workflows/post-deploy-verify.yml:37-47` checkout policy từ `main`; bước runtime ở :145 chạy `policy/scripts/product/post-deploy-verify.sh` qua SSH. Release checkout chỉ còn dữ liệu manifest, không được thực thi làm verifier.
- Fixture thay historical release verifier bằng sentinel/bypass và làm runtime trusted fail: test `I-02: historical bypass verifier stays data...` trong `final-review-boundaries.test.mjs` fail-closed, không xuất sentinel và không tạo marker. Đây là execution test của Bash block thật, không chỉ regex.

### I-03 — backup target host/database/empty identity ở runner và remote lock: FIXED

- `deploy.yml:130-157` truyền trusted `MKW_SSH_HOST`, database `mkw`, target identity vào validator trước SSH.
- `scripts/product/deploy-entrypoint.sh:106-127` yêu cầu target policy, và :127 cùng :151-154 re-read metadata/time dưới `.deploy.lock` trước env/render/migration/mutation.
- Validator so host/database cho `BACKUP`, target identity/database cho `INITIAL_EMPTY_DEPLOYMENT` ở `validate-backup-ready.mjs:219-250`; rollback cũng so current target ở `rollback.yml:94-132`.
- Regression cover wrong host, wrong database, wrong empty target/database trước deploy; fixture đổi metadata giữa precheck và apply section thực để chứng minh recheck chặn trước mutation. Fixture apply section không acquire lock thật; thứ tự acquire lock → recheck được xác minh trực tiếp trong source. Coordinator cũng truyền target vào `validateBackupReadyFreshness` và không dispatch deploy khi mismatch. Tất cả case targeted đạt.

### I-04 — preflight compatibility: FIXED

- `deploy.yml:83-103` cho artifact/run/kind/name optional ở dispatch và chỉ bắt buộc exact IDs trong mode release; download/backup validation chỉ chạy release.
- `post-deploy-verify.yml:61-90` giữ release IDs optional ở dry-run/bootstrap, cho phép preflight payload cũ; release bắt buộc run/artifact IDs.
- Regression matrix trong `final-review-boundaries.test.mjs` thực thi gate Bash của cả deploy và verify với dry-run/bootstrap payload cũ, malformed IDs và valid release IDs. Tất cả đạt; coordinator vẫn dispatch exact IDs cho cả ba mode.

### I-05 — SSH host-key filtering: FIXED

- deploy.yml:236-250, post-deploy-verify.yml:132-145 và rollback.yml:182-199 tạo file scan riêng, lọc từng dòng theo exact SHA256 fingerprint, yêu cầu file filtered không rỗng và dùng `GlobalKnownHostsFile=/dev/null` + `UserKnownHostsFile` filtered trên mọi SSH/SCP.
- Regression fixture tạo trusted + hostile key, thay `ssh-keyscan` bằng mixed output, kiểm nội dung file pinned và mọi transport invocation. Ba workflow đều giữ đúng duy nhất key pin; test đạt. Backup workflow cũng vẫn dùng filtered file.

### M-01 — child timeout/cancel/budget: FIXED

- `scripts/product/release/coordinator.mjs:8-18` đặt total 150 phút dưới job 180 phút; stage backup/deploy/verify lần lượt 50/50/30 phút và discovery 5 phút.
- :78-117 đặt deadline stage trước dispatch/discovery; :141-158 cancel exact child khi API hỗ trợ, nếu không hoặc cancel lỗi ghi run URL/correlation và trạng thái có thể còn active; không dispatch stage sau.
- `github-actions.mjs:16-33,87-104,148` đặt timeout 30 giây cho API/download/unzip/dispatch/cancel.
- Regression timeout suite kiểm supported/unavailable/failed cancel, unknown discovery, total deadline, API latency vượt deadline và exact run URL; tất cả đạt. Polling hiện bị ràng buộc bởi deadline theo clock, thay cho chỉ giới hạn số poll trước đây.

### M-02 — operator documentation: FIXED

- `docs/operations/product-release-runbook.md`, `release-checklist.md`, `product-rollback-runbook.md` mô tả one-SHA coordinator, mode/preflight, target vars/database `mkw`, exact artifact/run/attempt, timeout/cancel, current policy verifier và application-only rollback.
- Checklist phân biệt local evidence với operator phải kiểm; không tuyên bố production/live attestation/SSH đã xác minh.

## Preservation của guard đã review trước

Full tooling suite chạy lại cũng đạt các regression cũ: hostile input trong receipt/signal không được execute; path validation chặn trước SSH; historical permissive backup validator không tham gia policy; rollback chấp nhận snapshot BACKUP mới của DB hiện tại dù provenance SHA khác old app, từ chối stale/empty; PostgreSQL guard chặn missing/mutable/stopped/ambiguous/mismatched runtime trước mutation và matching case chỉ up --no-deps api gateway; required attestation fail-closed; UTC calendar/future/age/retention và refreshed remote clock được kiểm. Không thấy fix delta làm suy giảm các guard này.

## Residuals

Không có residual Critical, Important hoặc Minor được chứng minh trong scope đã duyệt. Các điểm dưới đây là giới hạn kiểm chứng, không phải finding của code:

- Live GitHub artifact ownership/API schema, artifact retention, workflow approval, signer/attestation service và run cancellation chưa chạy.
- SSH host thật, remote lock, Docker Compose, migration, rollback PostgreSQL runtime và production DB chưa chạy.
- `npm run check` — **Failed** tại `check:docs` với 19 link lịch sử thiếu dưới `.superpowers/sdd/tanstack-cache-ownership`; không thuộc diff fix và không bị biến thành pass.
- `pnpm run product:format:check` — **Failed** tại ba CSS đã có sẵn: `apps/web/src/features/attendance/ui/attendance.css`, `export-button.css`, `shared/styles/tokens.css`; không file nào thuộc diff fix.
- Evidence tác giả (không chạy lại API/DB trong re-review): product API test trong `pnpm run product:test` có 20 pass/5 fail vì `apps/api/test/auth-sandbox.mjs` gọi `pnpm.exe`, trong khi runtime chỉ có `pnpm.mjs/pnpm.cmd`. Tôi đọc log giữ lại có COMMAND_PROCESS_ERROR/exit -4058, xác minh Windows path gọi pnpm.exe và executable này vắng trong runtime đã chọn; auth-sandbox/package scripts/lockfile không đổi so với base. Phân loại là giới hạn môi trường baseline, không có bằng chứng hồi quy CI/CD. Không chuyển các test này thành pass.

## Independent checks and evidence

Runtime đọc-only từ `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-414703d9/.agent-runs/task4-runtime`:

- Node `v24.22.1`, pnpm `12.15.0`.
- `node --test tests/product-tooling/*.test.mjs`: **539/539 pass**, exit 0.
- Targeted `node --test tests/product-tooling/final-review-boundaries.test.mjs tests/product-tooling/release-coordinator-policy.test.mjs tests/product-tooling/rollback-artifact-resolver.test.mjs tests/product-tooling/deploy-backup-gate.test.mjs`: **59/59 pass**, exit 0. Đây là suite chạy workflow Bash thực và fixture external boundary, không chỉ static regex.
- `pnpm run product:lint`: pass, exit 0.
- `npm run lint`: pass, exit 0.
- `npm test`: **10/10 pass**, exit 0.
- YAML parse + Bash syntax: **7 workflow files, 36 inline Bash blocks, 4 standalone scripts pass**.
- `git diff --check 93a8953..ab571f5`: pass, exit 0; checkout không dirty.
- `pnpm exec prettier --check <changed files>` ban đầu exit 1 vì không có parser cho hai shell scripts; chạy lại với `--ignore-unknown` pass cho changed-file formats. Product format tổng thể vẫn Failed theo giới hạn CSS nêu trên.
- Direct validator probe với BACKUP có `databaseIdentity.host=other` và expected host `prod` trả `ok:false`; hostile mixed-key fixture giữ đúng pinned key.

## Declined to judge

- Không đánh giá live GitHub/SSH/Docker/DB/signing/production behavior vì user đã loại khỏi scope.
- Không mở rộng sang các link tài liệu lịch sử, CSS baseline hoặc auth-sandbox runtime defect vì không thuộc diff CI/CD này.
- Không yêu cầu hardening ngoài I01-I05/M01/M02 hoặc thay đổi nghiệp vụ/contract đã duyệt.
