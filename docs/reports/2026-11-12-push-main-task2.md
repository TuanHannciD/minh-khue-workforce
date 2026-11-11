# Báo cáo Task 2 — registry pull và handoff digest

Ngày: 12/11/2026\nBase: `a9cdfcc` (`feat/modern-cicd`, Task 1 đã tích hợp)\nPhạm vi writer: Task 2; không push, merge main, SSH, production DB hoặc registry thật.

## Đã triển khai

- `scripts/product/release/pull-exact-images.sh` xác thực GHCR `@sha256:<64 hex>`, từ chối `latest`/tag-only, pull API/Web đúng manifest, kiểm `RepoDigest`, fail closed khi auth/pull/identity lỗi. Public pull anonymous; private dùng credential riêng `packages:read`, token file VPS mode 600, Docker config tạm và không ghi token vào log/receipt/artifact.
- `scripts/product/deploy-entrypoint.sh` chạy registry gate trước migration/Compose mutation; validator container dùng image đã pull với `--pull=never`; receipt atomic ghi host/auth/pull/mutation evidence secret-free, gồm trạng thái pre-mutation failure.
- `deploy/compose.production.yml` giữ digest-only variables và đặt `pull_policy: never` cho API/Web.
- `.github/workflows/deploy.yml` chuyển registry policy/path an toàn qua SSH, không chuyển build write token; giữ SSH pinning, backup/UTC/freshness/attestation/current controls và manual routes.
- Cập nhật `deploy/README.md`, `docs/operations/product-release-runbook.md`; thêm fixture hành vi registry/private auth/denied/mismatch/latest/secret hygiene và cập nhật fixture rollback cũ để giữ contract.

## Kiểm chứng

| Check | Kết quả |
| --- | --- |
| `node --test tests/product-tooling/registry-deploy-policy.test.mjs tests/product-tooling/task3-release-behavior.test.mjs` | PASS 10/10 |
| `pnpm run product:test:tooling` | PASS 558/558 |
| `pnpm run product:lint` | PASS |
| `pnpm run product:format:check` | PASS |
| `pnpm run product:typecheck` | PASS |
| `pnpm run product:build` | PASS |
| `pnpm run product:boundaries` | PASS |
| `pnpm run product:contract:check` | PASS |
| YAML parse, actionlint 1.7.9, `bash -n` changed scripts, `git diff --check` | PASS |
| `npm run lint`, `npm test` | PASS root lint, 10/10 tests |
| `npm run check` / `check:docs` | Failed baseline: 19 links lịch sử `.superpowers/sdd/tanstack-cache-ownership`; không thuộc Task 2 |

Runtime product checks dùng Node `v24.22.1`, pnpm `12.15.0`, lockfile frozen. Docker Compose rehearsal, GitHub Actions/artifact API, GHCR auth/attestation, SSH/VPS, migration và production smoke: **Not run** theo quyền task. Không claim live deployment.

Commit được ghi sau khi toàn bộ check trên đạt; parent cần review độc lập exact `base..tip`.
