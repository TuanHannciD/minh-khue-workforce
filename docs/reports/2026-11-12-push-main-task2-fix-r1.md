# Báo cáo Task 2 R1 — private registry rollback handoff

Ngày: 12/11/2026.

Base: `6027dbf50e0ef56a7f95461c1b4894c21b122dac`, nhánh cách ly `t3/registry-digest-handoff` trong worktree `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-32914626`.

Phạm vi writer: sửa I-01 Important từ review `D:/TinHoc/minh-khue-workforce/.worktrees/cicd-orchestration/.agent-reviews/push-main-task2-review-r1.md`. Acceptance: rollback nhận cùng registry contract với deploy, private pull qua file token riêng, giữ nguyên các gate. Rủi ro: sai handoff có thể chặn recovery private GHCR. Review route: parent fresh re-review exact tip. Không push, SSH, production DB, registry thật hoặc deploy.

## Finding và thay đổi

Review R1 xác định `.github/workflows/rollback.yml` không chuyển bốn biến registry mà `deploy.yml` đã chuyển, nên application rollback vào private GHCR có thể mặc định public và dừng trước pull API/Web.

- Rollback remote handoff giờ chuyển `MKW_REGISTRY_HOST`, `MKW_REGISTRY_VISIBILITY`, `MKW_REGISTRY_PULL_USERNAME` và `MKW_REGISTRY_PULL_TOKEN_FILE` bằng `%q`, cùng default token path VPS như deploy.
- Token vẫn chỉ đọc từ file VPS mode 600 qua helper; không đưa token vào command, artifact hoặc receipt. Các gate SSH pinning, backup/current target, attestation, lock và application-only rollback giữ nguyên.
- Fixture rollback private registry dùng non-default token path, kiểm auth `--password-stdin`, pull exact API/Web và chứng minh không lộ token. Fixture transport cũ cũng kiểm đủ bốn field được truyền.

## Kiểm chứng

| Check                                                                                                                                                                                                                                                                                       | Kết quả                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| RED trước sửa: private rollback fixture + rollback transport fixture                                                                                                                                                                                                                        | **Failed** đúng: thiếu registry fields, pull bị từ chối/unbound env |
| `node --test tests/product-tooling/deploy-backup-gate.test.mjs tests/product-tooling/registry-deploy-policy.test.mjs tests/product-tooling/task3-release-behavior.test.mjs tests/product-tooling/release-workflow-policy.test.mjs tests/product-tooling/task3-supply-chain-policy.test.mjs` | **PASS 33/33**                                                      |
| `pnpm run product:test:tooling`                                                                                                                                                                                                                                                             | **PASS 559/559**                                                    |
| `pnpm run product:lint`                                                                                                                                                                                                                                                                     | **PASS**                                                            |
| Changed-file Prettier, YAML parse, actionlint, Bash `-n`, `git diff --check`                                                                                                                                                                                                                | **PASS**                                                            |

Runtime dùng Node `v24.22.1`, pnpm `12.15.0` và dependencies theo lockfile hiện có. Cwd của checks là worktree trên; log tại `.agent-runs/push-main-task2-fix-r1/` (`red.log`, `tooling-final.log`, `lint-final.log`). Hai fixture xóa biến registry khỏi môi trường remote giả trước khi áp command, tránh kế thừa policy từ runner làm kết quả xanh giả.

Full product build/typecheck/boundaries/contract: **Not run trong R1**, không đổi app/schema/contract; bằng chứng Task2 cũ giữ scope của snapshot đó. Baseline `check:docs`/`npm run check` có 19 link lịch sử lỗi và 5 API cases gọi `pnpm.exe` trên Windows là giới hạn riêng, không được gọi PASS trong R1. Live GitHub Actions, GHCR, Docker, SSH/VPS, migration, DB và production smoke: **Not run**. Không tạo agent con.

Commit fix được tạo sau khi các check trên đạt; parent cần fresh re-review exact tip.
