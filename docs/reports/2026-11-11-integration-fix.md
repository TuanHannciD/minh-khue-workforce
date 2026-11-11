# Integration fix — rollback và post-deploy

- Base: `9f899308d6fdf1508ab75421e56457cf20e1f9b2`; branch `t3/integrate-rollback-postdeploy-fixes`, workspace riêng hiện tại, writer Sol/high, không children/production.
- Mục tiêu/acceptance: tích hợp Task1/coordinator/Task3; đóng F4–F7 và giữ immutable pins, attestation required fail-closed, receipt application-only, legacy handling và coordinator transport. Thêm test hành vi cho injection, backup snapshot hiện tại, elapsed-time freshness và digest mismatch.
- Scope: release workflows, entrypoint/backup policy, regression tests và runbook liên quan. Risk cao: boundary SSH, dữ liệu backup và Compose mutation. Review route: parent phải review độc lập exact tip sau bàn giao; writer không tự claim review gate.
- Commit fix Task1/coordinator phụ thuộc các commit gốc `f567019`/`91972ae`, đã cherry-pick trước bản fix; Task3 dùng `ab84a09` rồi `d262b40e`. Xung đột workflow cần tích hợp lại cả current policy lẫn safety của Task1.
- Đã đọc Task3 implementer report `docs/reports/2026-11-11-task3-r1.md`. Ba review report `task1-fix-review-r1.md`, `task2-fix-review-r1.md`, `task3-review-r1.md` chưa có trong checkout hoặc các worktree hiện có khi tìm theo tên; findings chi tiết trong brief là đầu vào hiện có.
- Contract: release backup phải gắn release đích. Application rollback dùng BACKUP đã restore-verify của database hiện tại, giữ releaseSha là provenance của snapshot, không yêu cầu trùng old app SHA; INITIAL_EMPTY_DEPLOYMENT không đủ cho rollback. Max age phải explicit, clock tại remote validation được refresh ngay trước mutation dưới lock; fixture thay clock qua shell stub, không có production bypass.
- Tài nguyên: Git Bash/Node/Python local, fixture tạm; không acquire port/DB/Docker daemon/SSH. Next action: parent review độc lập exact tip tích hợp; không push/merge/deploy trong task này.

## Kết quả tích hợp

- Task1 gốc `f567019` → `bad3b36`, fix `7805ee3` → `60f8afd`; coordinator gốc `91972ae` → `a18a31c`, fix `655a4a7` → `7311a4b`; Task3 gốc `ab84a09` → `ee4f870`, R1 `d262b40e` → `4d1fc7e`. Đây là các parent cần thiết, không chỉ áp delta fix thiếu nền.
- F4: allowlist deploy path/project/port và SHA trước SSH/key handling; serialize remote commands bằng `%q`, private key qua env. Deploy cũng giữ các safety guards sau giải conflict.
- F5: rollback nhận `backup_run_id`/`backup_artifact_id` của snapshot database hiện tại, kiểm kind `BACKUP`, restore verification, host production và database `mkw`, age/retention; chuyển metadata + checksum. `releaseSha` vẫn là provenance hợp lệ, không phải old app SHA. Không chấp nhận empty-deployment evidence để rollback.
- F6: max age/kind được truyền explicit; remote lấy UTC mới mỗi lần validate trước mutation dưới lock và trước migration. Không dùng clock frozen từ runner hoặc `MKW_BACKUP_NOW` để bypass. Tests thay `date` và kiểm backup vừa hợp lệ rồi hết hạn trước apply.
- F7/Task3: receipt/signal/failure summary giữ quoted Node heredoc + env + `JSON.stringify`, vẫn ghi được khi checkout/validation failure; mode/preflight fields của coordinator được giữ. PostgreSQL digest mismatch/unknown fail trước env/render/compose; matching runtime giữ container DB, chỉ up API/gateway `--no-deps`. Attestation required fail-closed và legacy receipt guidance giữ nguyên. Các Actions trong sáu workflow release đã pin immutable.
- Đã tự đọc toàn bộ diff tích hợp từ base (workflow/control code, policy/transport, tests và docs); đây là self-inspection, không phải independent review. Các test file 400–638 dòng giữ cùng fixture/lifecycle và ma trận boundary; test names và helpers định vị theo trách nhiệm, không tách thêm trong fix này.

## Kiểm chứng cuối

Môi trường: Windows worktree hiện tại, Node `v24.12.0` (thấp hơn engine range của project), Git Bash, Python/PyYAML 6.0.3. Không install dependency hoặc thay lockfile. Raw evidence local ignored tại `.agent-runs/integration-fix/`.

- **Verified:** focused command `node --test tests/product-tooling/deploy-backup-gate.test.mjs tests/product-tooling/task3-release-behavior.test.mjs tests/product-tooling/task3-supply-chain-policy.test.mjs tests/product-tooling/release-coordinator-policy.test.mjs tests/product-tooling/release-coordinator-transport.test.mjs tests/product-tooling/release-workflow-policy.test.mjs tests/product-tooling/release-contracts.test.mjs tests/product-tooling/deploy-entrypoint-policy.test.mjs tests/product-tooling/release-attestation-policy.test.mjs` — exit 0, **75/75 pass** (`final-focused2.log`). Bao gồm actual inline rollback preflight, safe transport, elapsed-time mutation boundary, command-substitution/quotes/newline payload, PostgreSQL mismatch, coordinator API/ZIP transport.
- **Verified RED:** chạy lại ba regression trên source tại tip tích hợp trước sửa `4d1fc7e`: 0/3 pass, fail đúng unsafe path tới SSH sentinel, backup khác SHA bị từ chối, clock frozen cho stale backup qua gate (`regression-red.log`). Source sửa được khôi phục và GREEN như trên. Không SSH thật.
- **Verified:** `npm test` — 10/10 pass (`npm-test.log`), warning SQLite experimental có sẵn.
- **Verified:** PyYAML parse toàn bộ workflow; Git Bash `bash -n` cho 32 inline `run` blocks và entrypoint/guard/rehearsal, exit 0. Chỉ syntax, không phải live Actions/schema verification.
- **Verified:** Prettier 3.9.10 từ npm cache offline, check toàn bộ JS/YAML/Markdown thuộc integrated diff; `git diff --check` pass. Bash không có Prettier parser nên dùng Bash syntax/whitespace.
- **Failed:** `node --test tests/product-tooling/*.test.mjs` và lần đầu `npm run product:test:tooling`: final **496 tests, 466 pass, 30 fail**, do thiếu `dependency-cruiser`, `eslint`, `pg`, TypeScript trong checkout (`all-tooling-final.log`). Không claim suite xanh.
- **Failed:** `npm run check` pass `check:skills`, dừng tại `check:docs` vì **19 missing historical evidence links** dưới `.superpowers/sdd/tanstack-cache-ownership`, nằm ngoài diff (`check.log`). Không sửa evidence lịch sử ngoài scope.
- **Blocked:** full product lint/typecheck/build/contract checks cần dependency tree chưa có; không chạy cài đặt hoặc mượn workspace của worker khác.
- **Not run:** Docker daemon rehearsal, live GitHub Actions/attestation APIs, production SSH/DB/migration/deploy; actionlint chưa có. Local tests dùng stub Docker/SSH/gh và fixture metadata, không chứng minh runtime production hoặc application/schema compatibility. Snapshot backup vẫn là point-in-time được kiểm age, không chứng minh không có write mới sau snapshot; operator chịu trách nhiệm snapshot/compatibility theo runbook.
- **Review gate:** Pending parent independent reviewer trên exact final SHA; không children theo yêu cầu. Workspace sạch sau commit; evidence giữ lại, không process/port/DB thật cần release.

## Tên 30 test lỗi do dependency thiếu

- accepts public feature imports, same-feature internals and aliases
- accepts generated contract types and browser dependencies without traversing packages
- allows Prisma-generated type cycles only inside its exact generator output
- generated folder exemption cannot hide a cycle through handwritten source or cross-app import
- rejects runtime cycles entirely inside Prisma generator output
- rejects_cross_app_deep_feature_and_cycle: cross-app compiled declaration type
- rejects_cross_app_deep_feature_and_cycle: cross-app dependency type
- rejects_cross_app_deep_feature_and_cycle: cross-app output through normalized alias
- rejects_cross_app_deep_feature_and_cycle: API to web output outside src
- rejects_cross_app_deep_feature_and_cycle: cross-app dependency junction to neutral store
- rejects_cross_app_deep_feature_and_cycle: server dependency behind neutral junction alias
- rejects_cross_app_deep_feature_and_cycle: cross-app dependency junction through tsconfig alias
- rejects_cross_app_deep_feature_and_cycle: cross-app output behind neutral junction
- rejects_cross_app_deep_feature_and_cycle: cross-app custom type alias
- rejects_cross_app_deep_feature_and_cycle: unprefixed Node builtin in browser source
- rejects_cross_app_deep_feature_and_cycle: cross-app relative
- rejects_cross_app_deep_feature_and_cycle: Prisma package subpath
- rejects_cross_app_deep_feature_and_cycle: shared to feature alias
- rejects_cross_app_deep_feature_and_cycle: deep feature alias
- rejects_cross_app_deep_feature_and_cycle: deep feature relative
- rejects_cross_app_deep_feature_and_cycle: cycle through aliases
- rejects_cross_app_deep_feature_and_cycle: unknown alias
- rejects_cross_app_deep_feature_and_cycle: API to web
- rejects_cross_app_deep_feature_and_cycle: deep backend module
- Windows app ownership follows case-insensitive filesystem identity
- generated employee consumer accepts omitted/null endDate and rejects null required fields
- tests\product-tooling\lint.test.mjs
- tests\product-tooling\operations-target.test.mjs
- tests\product-tooling\sandbox-target.test.mjs
- strict compiler accepts generated contract consumer and rejects invalid wire type / implicit any
