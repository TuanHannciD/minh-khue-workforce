# Task 4 — rollback ứng dụng có điều kiện

Ngày 12/11/2026. Base `6711190` trên integration `feat/modern-cicd`; worktree cô lập `t3-49db08e7`, branch `t3/conditional-app-rollback`. Fast-forward trước sửa. Writer `gpt-6.1-sol`, reasoning `high`; không Agent con. Parent chịu fresh-review exact committed tip.

Phạm vi: Task 4 của plan push-main đã duyệt; schema/migration proof, trusted last-known-good, fresh current-DB backup và một lần API/Web recovery. Không production/SSH/DB thật, push hoặc merge main. Risk cao: rollback sai schema hoặc sai operation gây mất compatibility; gate phải fail closed. Resources task-owned `.agent-runs/push-main-task4/`, dependencies local. Acceptance gồm RED→GREEN behavioral tests, giữ Tasks 1–3/manual routes và tất cả quality checks được yêu cầu; live deployment Not run.

Ruling: state `deploying` của Task 3 chỉ chứng minh operation đang chưa verified, không chứng minh schema an toàn. Task 4 bổ sung snapshot DB thật và artifact ownership; state cũ thiếu bằng chứng vẫn có thể tiếp tục đường manual nhưng không đủ điều kiện auto rollback. Cost nếu sai: recovery dừng incident, không tự thay DB.

## Đã triển khai

- `auto-rollback.mjs` fail-closed theo current failed operation, previous verified state, exact artifact/run/attempt/digest, attestation, runtime image IDs, PostgreSQL identity, read-only schema dump và `_prisma_migrations` fingerprint. Unknown/changed/failed/pending/data-operation evidence, interleaving, thiếu artifact/backup hoặc mismatch đều thành `incident-required`.
- `operation-state.mjs`, `database-evidence.sh` và deploy/verify entrypoint ghi journal schema v2, snapshot trước/sau/verified, ownership và attestation. Last-known-good chỉ promote sau runtime verification.
- `automatic-rollback.yml` chạy một fresh `BACKUP` artifact với target identity/freshness/retention; `transport-auto-rollback.sh` giữ SSH pin/lock. Recovery chỉ `docker compose ... up -d --wait --no-deps api gateway`; không `db`, `migrate`, restore/down migration. Evidence là `recovered-by-app-rollback` hoặc `incident-required`, pipeline gốc vẫn failed.
- Tests mới: policy (29 cases), operation/artifact/recovery behavior (15 cases, Bash + Docker boundary fixture, gồm thiếu SSH receipt); suite product tooling sau thay đổi **615/615 PASS**.

## Kiểm chứng

| Check                                                               | Kết quả                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED policy/recovery trước implementation                            | **RED policy:** fixture healthy bị từ chối vì thiếu hỗ trợ metadata target; **RED SSH receipt:** `0 !== "unknown"`; sau sửa **GREEN 29/29 + 15/15** (log tại `.agent-runs/push-main-task4/red-policy.log`, `red-receipt.log`, `green-receipt.log`) |
| `node --test tests/product-tooling/*.test.mjs`                      | **PASS 615/615** (Node v24.22.1, pnpm 12.15.0 resources task-owned)                                                                                                                                                              |
| `pnpm run product:lint`                                             | **PASS**                                                                                                                                                                                                                        |
| `pnpm run product:format:check`                                     | **PASS** trên product tree; ba CSS baseline format-only được formatter kiểm riêng và không commit thay đổi semantic                                                                                                             |
| `pnpm run product:typecheck` / `product:build`                      | **PASS** (build giữ warning chunk >500 kB hiện hữu)                                                                                                                                                                             |
| `pnpm run product:boundaries` / `product:contract:check`            | **PASS**                                                                                                                                                                                                                        |
| YAML parse, `actionlint`, Bash `-n`, `git diff --check`             | **PASS**                                                                                                                                                                                                                        |
| `npm run lint` / `npm test`                                         | **PASS**, root 10/10                                                                                                                                                                                                            |
| `npm run check`                                                     | **FAILED baseline** tại `check:docs`: 19 historical links `.superpowers/sdd/tanstack-cache-ownership`, không thuộc scope và không che                                                                                           |
| `pnpm run product:test`                                             | **FAILED baseline/environment**: tooling 615/615, sandbox 32/32 và web 353/353 đạt; API contract fixtures gọi `pnpm.exe` không tồn tại trên Windows (`COMMAND_PROCESS_ERROR`, -4058), năm fixture lịch sử lỗi; giữ evidence và không đổi lock/dependency |
| Live GitHub/GHCR/attestation/SSH/VPS/Docker/DB/migration/production | **Not run** theo quyền task                                                                                                                                                                                                     |

Independent review: **Pending** parent fresh-review exact tip. Activation/release: **Not run**.
