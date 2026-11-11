# Push main Task 1 — triển khai contract (11/11/2026)

## Hồ sơ trước sửa và phạm vi

- Base bắt buộc: `96acb71e00852ffae27f8962762c742edc520772`; worktree sạch trên `t3/push-main-release-workflow` đã fast-forward từ `9f89930` trước khi sửa.
- Mục tiêu/acceptance: một push-main entry dùng `github.sha`, reusable quality/build/backup/deploy/verify, needs fail closed, exact artifact/run/digest outputs, giữ PR CI và manual dry-run/bootstrap/rollback/scheduled backup.
- Writer: implementation sub-agent, model runtime gpt-6.1-sol high; không nested agent. Parent sở hữu fresh independent review trên committed tip; report này không thay review.
- Risk: producer provenance khi chuyển workflow_run sang reusable build trong run của caller; output/needs sai có thể dùng artifact khác hoặc chạy mutation sau failure.
- Resources: worktree `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-c7a27d6e`, runtime/dependencies/evidence task-owned trong `.agent-runs/push-main-task1` và node_modules; không production/SSH/DB mutation/push/merge main.
- Nguồn: spec và plan push-main 11/11 tại commit base; authority/routing/permissions/quality/source-navigation và skills project-local. File spec/plan chỉ hiện diện sau fast-forward base; bản orchestration cũ được đọc như lịch sử, không dùng thay scope Task 1.
- Ruling: manual recovery tiếp tục dùng current main; automatic release pin control SHA tại SHA push để không chạy lẫn phiên bản control khi main tiến lên. Không nới guard attestation/SSH/backup/rollback.
- Bước tiếp: TDD RED → implementation → GREEN, kiểm tooling/YAML/Bash/lint/format/diff, commit local; parent review exact tip.

## Kết quả và kiểm chứng

Đã tạo `.github/workflows/main-release.yml` với `push` canonical `main`, giữ một producer tự động; `ci.yml` còn PR + `workflow_call`, `build-release.yml` giữ identity/provenance và dùng `github.sha`. Backup/deploy/verify có `workflow_call`, outputs exact run/attempt/artifact/digest/SHA; deploy kiểm linkage manifest/source/digest trước SSH. Manual dry-run/bootstrap/rollback, coordinator manual và scheduled backup vẫn giữ.

- RED: `node --test tests/product-tooling/push-main-workflow-policy.test.mjs` thất bại vì `main-release.yml` chưa tồn tại (đã lưu trong `.agent-runs/push-main-task1/red-contract.log`).
- GREEN/focused: `node --test tests/product-tooling/push-main-workflow-policy.test.mjs tests/product-tooling/workflow-policy.test.mjs tests/product-tooling/release-coordinator-policy.test.mjs tests/product-tooling/release-coordinator-transport.test.mjs tests/product-tooling/rollback-artifact-resolver.test.mjs`: **63/63 pass**.
- Product tooling: `node --test tests/product-tooling/*.test.mjs`: **554/554 pass**.
- Product lint: `pnpm run product:lint` với runtime Node `24.22.1` + pnpm `12.15.0` locked: **pass**.
- Product typecheck/build/boundaries/contract: **pass** sau `prisma generate`.
- YAML parse 8 workflow + Bash syntax 38 inline blocks và 2 script: **pass**; actionlint `v1.7.9` immutable download: **pass**; Prettier trên file thay đổi: **pass**; `git diff --check`: **pass**.
- Root `npm run lint`: **pass**; `npm test`: **10/10 pass**. `npm run check`: **Failed** tại 19 historical links `.superpowers/sdd/tanstack-cache-ownership`; root lint/test vẫn pass. Product format toàn repo **Failed** chỉ ở ba CSS baseline: `apps/web/src/features/attendance/ui/attendance.css`, `export-button.css`, `tokens.css`.

## Commit và giới hạn

- Commit triển khai: `e28a0f0` (`feat(ci): add automatic push-main release pipeline`). Parent phải dispatch fresh independent review trên exact tip; tôi không tự review.
- Live GitHub Actions/artifact API, protected environment, registry attestation, SSH/VPS, Docker rehearsal, production DB và deploy: **Not run** theo scope. Không push/merge main.
- Giới hạn compatibility: manual preflight vẫn cho phép payload cũ; automatic release truyền các output exact và kiểm exact digest/source/producer provenance. Auto rollback schema guard/registry auth không thuộc Task 1.
