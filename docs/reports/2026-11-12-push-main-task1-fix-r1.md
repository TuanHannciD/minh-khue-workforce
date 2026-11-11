# Push-main Task 1 — sửa review R1 (12/11/2026)

## Hồ sơ và phạm vi trước sửa

- Mục tiêu: giải quyết P1 của review `D:/TinHoc/minh-khue-workforce/.worktrees/cicd-orchestration/.agent-reviews/push-main-task1-review-r1.md`; giữ nguyên gate `product:format:check` và toàn bộ hành vi/guard Task1.
- Base integration: `96acb71e00852ffae27f8962762c742edc520772`; checkout cách ly hiện tại được fast-forward từ `9f89930` tới implementation `f9efda4d1df2bbfb3fb81fafa915cc63167a75dd` (chứa base) trước khi sửa.
- Worktree: `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-b3b778bd`; branch `t3/fix-task1-format-blockers`; sạch lúc nhận. Writer runtime `gpt-6.1-sol`, reasoning `high`; không nested agent. Parent chịu trách nhiệm fresh scoped re-review trên exact committed tip.
- Acceptance: formatter pin chạy đúng ba CSS finding; không thay ngữ nghĩa; fresh focused/full tooling, format/lint/typecheck/build/boundaries/contract và YAML/Bash/actionlint/diff có kết quả thật. Giữ riêng 19 historical docs links; không sửa baseline ngoài scope.
- Risk: EOL của checkout Windows có thể tái tạo lỗi sau formatter; kiểm blob/EOL và checkout lại bằng Git attributes. Không thêm hành vi UI, test hình thức hoặc thay workflow.
- Resource task-owned: `.agent-runs/push-main-task1-fix-r1/`, `node_modules`, `.pnpm-store` trong worktree; không production/SSH/DB/push/merge main.
- Nguồn: full review R1; Task1 trong plan `docs/superpowers/plans/2026-11-11-push-main-continuous-deployment.md`; spec mục 9 yêu cầu sửa ba CSS format-only; authority/routing/permissions/quality/source-navigation. Áp dụng receiving-code-review, systematic-debugging và verification-before-completion; worktree hiện hữu theo using-git-worktrees.

## Phản hồi P1

Đã tái hiện `product:format:check`: đúng ba CSS finding thất bại. Chạy Prettier pin 3.9.10 `--write` đúng ba file:

- `apps/web/src/features/attendance/ui/attendance.css`
- `apps/web/src/features/attendance/ui/export-button.css`
- `apps/web/src/shared/styles/tokens.css`

Root cause đã kiểm: Git toàn máy có `core.autocrlf=true`, `.gitattributes` trước sửa chỉ có `text=auto` cho CSS. Checkout ban đầu CRLF, formatter trả LF. Sau formatter, `git hash-object --no-filters` của từng file khớp blob HEAD lần lượt `0fa51b307a45063c3ffc6672b8cc46edd0e26e8b`, `09924fe9aa9368784666c7031f6cc4316ba4cc79`, `01d86db3147ed5fa7b28732c4291aafb7a2eda29`. Vì vậy không có diff CSS để commit; không bịa thay đổi source. Sửa `.gitattributes` bằng ba rule `text eol=lf` đúng các đường dẫn trên để checkout giữ kết quả formatter. Không áp rule toàn bộ CSS; không sửa gate/ignore/config Prettier, workflow hoặc guards.

## Kiểm chứng

Cwd của tất cả lệnh là worktree trên; log giữ tại `.agent-runs/push-main-task1-fix-r1/`. Runtime hỗ trợ: Node `v24.22.1`, pnpm `12.15.0`, Prettier `3.9.10`, actionlint `1.7.9`, Windows; dependency cài bằng `pnpm install --frozen-lockfile` (152 ms, lockfile không đổi).

| Check | Kết quả và runtime/log |
| --- | --- |
| `node --test tests/product-tooling/push-main-workflow-policy.test.mjs tests/product-tooling/workflow-policy.test.mjs tests/product-tooling/release-coordinator-policy.test.mjs tests/product-tooling/release-coordinator-transport.test.mjs tests/product-tooling/rollback-artifact-resolver.test.mjs` | **PASS 63/63**, 354 ms; `focused.log` |
| `node --test tests/product-tooling/*.test.mjs` | **PASS 554/554**, 23.424 s; `tooling.log` |
| `pnpm run product:format:check` | **PASS**, Prettier kiểm toàn product tree; log `format-final.log` |
| `pnpm run product:lint` | **PASS**; log `lint.log` |
| `pnpm run product:typecheck` | **PASS**; log `typecheck.log` |
| `pnpm run product:build` | **PASS** web Vite + API TypeScript; log `build.log` |
| `node scripts/product/check-boundaries.mjs` | **PASS**, boundaries/cycles; log `boundaries.log` |
| `pnpm run product:contract:check` | **PASS**, generated contract snapshot; log `contract.log` |
| `pnpm run product:test` | **FAILED baseline**: tooling **554/554**, sandbox **32/32**, web **353/353**, API **20/25**; 5 API contract cases dừng `COMMAND_PROCESS_ERROR` khi fixture gọi `pnpm.exe` trên Windows (`exitCode -4058`). Không do CSS/workflow; log `product-test.log`. |
| `npm run lint` / `npm test` | **PASS**, root lint và **10/10**; log `root-lint-supported.log`, `root-test-supported.log` |
| `npm run check` / `check:docs` | **FAILED baseline**, đúng **19** liên kết lịch sử `.superpowers/sdd/tanstack-cache-ownership`; giữ riêng, không sửa/che; log `root-check-supported.log`, `docs.log` |
| YAML + Bash | **PASS**, parse 8 workflow; `bash -n` **37** inline blocks (expression thay bằng fixture) + **6** script product; log `yaml-bash.log` |
| actionlint | **PASS v1.7.9** trên 8 workflow; log `actionlint.log` |
| `git diff --check 96acb71 f9efda4d1df2bbfb3fb81fafa915cc63167a75dd` và working diff | **PASS**, không whitespace error; `review-diff-check.log`, `working-diff-check.log` |
| EOL/semantic check | **PASS** cả ba file: bytes formatter == blob HEAD == Git filtered checkout với `core.autocrlf=true`, LF-only; `eol.log`. |

`.gitattributes` thêm đúng ba rule `text eol=lf` cho ba CSS để Windows checkout không tái tạo CRLF; không có thay đổi semantic trong CSS và không có workflow/test/source ngoài scope. Prettier gate vẫn được chạy, không bị bỏ qua hay nới lỏng.

## Commit và giới hạn

Commit local: branch tip (`git rev-parse HEAD`), message `fix(ci): clear Task1 format gate baseline`, parent `f9efda4d1df2bbfb3fb81fafa915cc63167a75dd`; worktree `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-b3b778bd` clean after commit. Live GitHub Actions/artifact API, registry attestation, SSH/VPS, Docker rehearsal, production DB/deploy/rollback: **Not run**, ngoài quyền task. Không push/merge main. Review độc lập tip sửa: **Pending**, parent điều phối.

