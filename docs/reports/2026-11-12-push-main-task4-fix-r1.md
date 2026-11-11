# Task 4 — sửa review R1

Ngày 12/11/2026. Writer `gpt-6.1-sol`, reasoning `high`; không Agent con. Branch/worktree giữ nguyên `t3/conditional-app-rollback` / `t3-49db08e7`. Base tích hợp `6711190`; snapshot được review `a34b86c`, tip báo cáo trước sửa `7cc0dfb`. Đã đọc đầy đủ review R1 tại `D:/TinHoc/minh-khue-workforce/.worktrees/cicd-orchestration/.agent-reviews/push-main-task4-review-r1.md`.

Phạm vi chỉ ba finding R1 và formatting được yêu cầu. Acceptance: missing/unknown/unverified data operation không mở rollback; snapshot/ownership/required attestation lỗi không được promote LKG hoặc thành already-deployed; exact current producer/run/attempt/artifact/digest/control SHA phải khớp trước fresh backup/transport. Risk cao vì bằng chứng sai có thể mở recovery sai compatibility. Parent fresh-review exact committed tip; review độc lập vẫn Pending. Resources task-owned `.agent-runs/push-main-task4/`; Node `24.22.1`, pnpm `12.15.0`, dependencies theo lock; Git Bash và actionlint `1.7.9`. Không production/SSH/DB thật, push hoặc merge.

## Thay đổi

- `beginOperation` giữ `dataOperations: unknown`, không chuyển declaration thiếu/unknown/side-effect thành migration-only. Gate đòi receipt độc lập đúng release, operation, API/Web và scope release/startup, không unverified side effect; receipt còn phải khớp canonical artifact. Không suy schema hash hay migrate thành công thành bằng chứng không có data side effect.
- `promoteOperation` hard-fail khi DB snapshot, manifest/ownership, required attestation hoặc timestamp không hợp lệ. Không còn fallback legacy/manual thành verified. Runtime verification record được bind với operation/SHA/digests; orchestration chỉ nhận verified state đầy đủ. Atomic writer giữ nguyên current state và LKG nếu promotion thất bại. Recovery thành công cập nhật cùng record cho operation rollback để rerun hợp lệ vẫn idempotent.
- Recovery nhận current ownership từ build outputs của parent, kiểm canonical producer path/repo/source/main/push/reusable ref, exact artifact ID/digest, run/attempt, source metadata/manifest và successful build job của attempt đó. Parent push còn in-progress không bị giả thành success. Proof đã kiểm được chuyển qua job output vào recovery input checksum; remote đọc lại proof với journal trước attempt/apply. Resolver lịch sử/manual không được nới lỏng.
- Giữ một lần API/Web `--no-deps`, original pipeline failed, PG/container invariants, fresh BACKUP, không DB mutation/restore/down migration. Prettier áp dụng schema backup và báo cáo Task 4 theo yêu cầu.

## Giới hạn bằng chứng data operation

Repo hiện chưa có producer độc lập xác minh data side effect của application/startup. Đợt sửa này không tự tạo producer giả hoặc tự ghi verified receipt sau migrate. Vì vậy journal do deploy hiện tại tạo vẫn unknown và auto recovery chuyển incident-required trước backup/transport cho đến khi có producer được kiểm chứng cung cấp bằng chứng đúng scope. Healthy recovery trong fixture dùng record canonical giả lập tại boundary GitHub; không phải bằng chứng capability live hay activation. Runtime deployment thành công vẫn có thể promote bằng schema/ownership/attestation/runtime proof hợp lệ.

## Kiểm chứng

- RED trên source immutable của `7cc0dfb` trong task-owned baseline: **17/18 FAILED đúng assertion** (unsafe declaration, fallback promotion, current ownership/producer/data receipt và copy LKG khi DB read lỗi). Log `r1-red-prior-tip.log`.
- RED bổ sung recovered state/idempotency và current attestation: `r1-red-recovered-state.log`, `r1-red-additional-proof.log`.
- GREEN focused: **72/72 PASS** gồm policy, actual Bash recovery và R1. Full tooling **643/643 PASS**; log cuối `r1-focused-final-tip.log`, `r1-full-tooling-final.log` và tooling trong `r1-product-test.log`. Behavioral matrix giữ các case schema/migration failure, missing previous/backup/artifact, PG mismatch, interleaving, pull/apply/health failure, một attempt và không DB mutation; bổ sung unknown/side-effect/missing data receipt và từng field current ownership.
- `pnpm run product:lint`, `product:format:check`, `product:typecheck`, `product:build`, `product:boundaries`, `product:contract:check`: **PASS**. Build còn warning chunk >500 kB hiện hữu. `npm run lint`, `npm test` và `pnpm test`: **PASS**, root **10/10**.
- YAML parse toàn bộ workflows, actionlint `1.7.9`, Git Bash `-n` cho shell thay đổi và `git diff --check`: **PASS**. Changed-file Prettier gồm `deploy/backup-ready.schema.json` và báo cáo cũ: **PASS**; giữ UTF-8, không thay lock/dependency.
- `npm run check`: **FAILED baseline**, đúng 19 missing links lịch sử dưới `.superpowers/sdd/tanstack-cache-ownership`; log `r1-root-check.log`. Không có link mới lỗi từ report R1.
- `pnpm run product:test`: **FAILED baseline/environment**; tooling **643/643**, sandbox **32/32**, web **353/353**, API **20/25**. Năm fixture bên dưới cùng lỗi Windows thiếu `pnpm.exe`, `COMMAND_PROCESS_ERROR`, exit `-4058`; không đổi dependency hoặc giả môi trường để che failure. Log `r1-product-test.log`.

Các API fixture còn lỗi:

1. `complete G1 JSON fixtures validate runtime requests, OpenAPI responses and generated TypeScript consumers`
2. `generated page consumers keep optional wire, required parsed input and full MonthDto distinct`
3. `reconcile requires both typed arrays while either array may supply the nonempty request`
4. `write operation branches reject forbidden fields with otherwise complete valid requests`
5. `contextual work and overtime values retain bounds, absence, null and source kind constraints`

Live GitHub/GHCR/attestation/SSH/VPS/Docker/PostgreSQL/production: **Not run** theo quyền task. Activation/release: **Not run**. Next action: parent fresh-review exact committed tip; chưa claim acceptance/integrated/released.
