# Task4 — checklist release và chuẩn bị verification

Ngày 11/11/2026. Writer implementation sub-agent Sol/high; không children/Astra/production.

## Hồ sơ trước sửa

- Mục tiêu: hoàn thành Task4 của [plan đã duyệt](../superpowers/plans/2026-11-11-modern-cicd-orchestration.md), viết đường vận hành đúng controls thực tế và kiểm local integrated snapshot.
- Worktree riêng: `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-414703d9`, branch `t3/release-checklist-docs`. Start sạch `9f899308d6fdf1508ab75421e56457cf20e1f9b2`; `git merge --ff-only 47e1d7fd6486cec7169874fb85110d0418db4eed` thành công, đây là baseline source/test cho verification.
- Scope writer: chỉ `docs/operations/release-checklist.md`, product-release-runbook, product-backup-restore, product-runbook, READINESS và report này. Không sửa product/workflow/tooling/lockfile; final code review được parent chạy đồng thời, không tự dispatch/review thay.
- Acceptance: tiếng Việt UTF-8; semantics/coordinator/vars/secrets/key/freshness/artifacts/approval/attestation/failure/rollback đúng source; so baseline links, `npm run check`, focused CI/CD và full tooling có dependencies nếu cài được; ghi rõ Failed/Not run/Blocked.
- Risk: tài liệu sai có thể dẫn operator vượt gate hoặc mất backup; đối chiếu trực tiếp sáu workflow release, coordinator/policy/transport, deploy entrypoint, backup source/runner, rollback PostgreSQL guard và verifier. Self-review docs tại tip cuối; parent sở hữu independent integrated code review và quyết định tích hợp.
- Tài nguyên: runtime/dependency/log task-owned trong `.agent-runs/task4-runtime`, `.agent-runs/task4-verification`, root/apps node_modules và `.pnpm-store` của worktree này. Không port/server/DB/SSH thật; không thay global config hay dùng dependency links của worker khác.
- Next action ban đầu: đọc controls → tạo checklist/cập nhật route → install locked dependencies bằng pnpm local → verification → commit docs/report → parent handoff.

## Rulings và giới hạn phạm vi

- Thực thi Task4 đã duyệt, không viết plan/brainstorm mới; không tests RED→GREEN cho chỉnh tài liệu thuần. Không sửa code để làm gate xanh. Skill execution ledger được thay bằng report bền vững này theo scope task evidence; không sửa ledger/progress của parent.
- Coordinator luôn dispatch backup kể cả `dry-run`/`bootstrap`; đó không phải phép thử offline. Chỉ deploy dry-run không mutate ứng dụng; backup vẫn đọc DB thật qua SSH. Không chạy coordinator trên production trong task này.
- `release-rehearsal.sh` chỉ chấp nhận GitHub-hosted runner. Không giả `GITHUB_ACTIONS`/`RUNNER_ENVIRONMENT` để chạy trên Docker Desktop; chưa có artifact release thật/identity runtime cần cho một rehearsal đầy đủ ở local. Docker rehearsal Not run, không mở daemon hoặc tạo tài nguyên production.

## Kiểm chứng

Thời điểm ghi: 11/11/2026, Windows worktree nêu trên. Commit docs/report: SHA được bàn giao ở handoff Git. Raw logs local ignored trong `.agent-runs/task4-verification/`; không sao chép/giả tạo historical evidence.

- **Verified — runtime/lockfile:** Node portable `v24.22.1` tải từ `https://nodejs.org/dist/v24.22.1/`, SHA-256 `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5` khớp `SHASUMS256.txt`; pnpm wrapper `12.15.0` chạy được. `node <local-pnpm>/pnpm.mjs install --frozen-lockfile` exit 0, 798 packages, lockfile không đổi; không chạy `npm install` và không đụng pnpm links của worktree khác.
- **Verified — focused release suite:** `node --test tests/product-tooling/deploy-backup-gate.test.mjs tests/product-tooling/task3-release-behavior.test.mjs tests/product-tooling/task3-supply-chain-policy.test.mjs tests/product-tooling/release-coordinator-policy.test.mjs tests/product-tooling/release-coordinator-transport.test.mjs tests/product-tooling/release-workflow-policy.test.mjs tests/product-tooling/release-contracts.test.mjs tests/product-tooling/deploy-entrypoint-policy.test.mjs tests/product-tooling/release-attestation-policy.test.mjs` exit 0, **75/75 pass**. Bao gồm exact IDs/SHA, freshness, attestation mode, rollback current DB snapshot, PostgreSQL digest guard và hostile transport payload.
- **Verified — full product-tooling:** `node .agent-runs/task4-runtime/pnpm-extract/package/bin/pnpm.mjs run product:test:tooling` exit 0, **507/507 pass**. Đây là tooling suite, không phải production GitHub run.
- **Verified — repository tests:** `npm test` với Node local exit 0, **10/10 pass**.
- **Failed — `npm run check`:** `check:skills` pass; `check:docs` dừng với đúng **19 missing historical evidence links** dưới `.superpowers/sdd/tanstack-cache-ownership` đã có ở baseline trước Task4. Không xoá, tạo giả hoặc sửa các link lịch sử ngoài scope.
- **Failed — lint/full product check:** `npm run lint` và `npm run product:check` (sau khi shim pnpm local) dừng cùng **3 lỗi `no-useless-escape`** tại `tests/product-tooling/release-workflow-policy.test.mjs:132` (2) và `tests/product-tooling/task3-supply-chain-policy.test.mjs:48` (1), là code/test tích hợp có sẵn ngoài docs scope. `product:check` chưa chạy tới format/typecheck/build/test/boundaries/contract do fail-fast.
- **Verified — docs scope:** checker chọn cả sáu file Task4 xác nhận UTF-8/fences và **41 local links/anchors**, exit 0 (`docs-targeted.log`). Full `node scripts/check-docs.mjs` vẫn Failed nhưng missing sets baseline/final đều **19/19, bằng nhau**, không link mới (`docs-baseline.log`, `docs-final.log`). Prettier 3.9.10 áp format cho sáu file, giữ nội dung lịch sử; không đổi findings thành pass. `git diff --check` đạt trước commit.
- **Not run:** `npm run test:e2e`, browser/production smoke, live GitHub Actions/attestation API, Docker release rehearsal, SSH, production DB/migration/restore/cutover. Rehearsal script có guard GitHub-hosted runner; giả env local sẽ làm mất ý nghĩa guard. Không có production side effect.

## Lệnh tái hiện và các lần lỗi chuẩn bị

Các lệnh đều chạy trong CWD worktree ở trên. Setup dùng `Invoke-WebRequest` tải ZIP Node và `SHASUMS256.txt` từ official Node distribution, `Expand-Archive` vào `.agent-runs/task4-runtime/`, so `Get-FileHash -Algorithm SHA256` trước khi chạy Node. pnpm tarball tải từ `https://registry.npmjs.org/pnpm/-/pnpm-12.15.0.tgz`, giải nén bằng `tar -xzf` vào `pnpm-extract`; `bin/pnpm.mjs --version` tự tải/verify native binary bằng downloader đi kèm. Không sửa pnpm/global PATH. Lệnh setup cụ thể:

```powershell
$toolRoot=Join-Path $PWD '.agent-runs/task4-runtime'
New-Item -ItemType Directory -Force $toolRoot | Out-Null
Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip' -OutFile (Join-Path $toolRoot 'node-v24.22.1-win-x64.zip')
Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.22.1/SHASUMS256.txt' -OutFile (Join-Path $toolRoot 'SHASUMS256.txt')
Get-FileHash (Join-Path $toolRoot 'node-v24.22.1-win-x64.zip') -Algorithm SHA256
Expand-Archive -LiteralPath (Join-Path $toolRoot 'node-v24.22.1-win-x64.zip') -DestinationPath $toolRoot
Invoke-WebRequest -Uri 'https://registry.npmjs.org/pnpm/-/pnpm-12.15.0.tgz' -OutFile (Join-Path $toolRoot 'pnpm-12.15.0.tgz')
$pnpmExtract=Join-Path $toolRoot 'pnpm-extract'
New-Item -ItemType Directory -Force $pnpmExtract | Out-Null
tar -xzf (Join-Path $toolRoot 'pnpm-12.15.0.tgz') -C $pnpmExtract
$env:Path=(Join-Path $toolRoot 'node-v24.22.1-win-x64')+';'+$env:Path
node --version
npm --version
node .agent-runs/task4-runtime/pnpm-extract/package/bin/pnpm.mjs --version
node .agent-runs/task4-runtime/pnpm-extract/package/bin/pnpm.mjs install --frozen-lockfile
node scripts/check-docs.mjs
npm run check
node --test tests/product-tooling/deploy-backup-gate.test.mjs tests/product-tooling/task3-release-behavior.test.mjs tests/product-tooling/task3-supply-chain-policy.test.mjs tests/product-tooling/release-coordinator-policy.test.mjs tests/product-tooling/release-coordinator-transport.test.mjs tests/product-tooling/release-workflow-policy.test.mjs tests/product-tooling/release-contracts.test.mjs tests/product-tooling/deploy-entrypoint-policy.test.mjs tests/product-tooling/release-attestation-policy.test.mjs
node .agent-runs/task4-runtime/pnpm-extract/package/bin/pnpm.mjs run product:test:tooling
npm run lint
npm test
npm exec -- prettier --write docs/operations/release-checklist.md docs/operations/product-release-runbook.md docs/operations/product-backup-restore.md docs/operations/product-runbook.md docs/agent/READINESS.md docs/reports/2026-11-11-task4-release-checklist.md
npm exec -- prettier --check docs/operations/release-checklist.md docs/operations/product-release-runbook.md docs/operations/product-backup-restore.md docs/operations/product-runbook.md docs/agent/READINESS.md docs/reports/2026-11-11-task4-release-checklist.md
node .agent-runs/task4-verification/check-task4-docs.mjs
Compare-Object (Get-Content .agent-runs/task4-verification/docs-baseline.log) (Get-Content .agent-runs/task4-verification/docs-final.log)
git diff --check
```

`npm` portable là 11.19.1. Ban đầu default Node24.12.0 ngoài engine và global pnpm launcher trỏ executable thiếu. Lần gọi nhầm `bin/pnpm.cjs` Failed MODULE_NOT_FOUND (pnpm12 dùng `.mjs`); đã đọc wrapper và sửa path, không đổi source. Focused suite lần đầu truyền một string chứa cả chín path nên Node từ chối input, chưa chạy test; lần sau dùng PowerShell array và đạt 75/75. `product:check` qua wrapper lần đầu gọi nested pnpm global hỏng; tạo shim chỉ trong own runtime như dưới, chạy lại và xác nhận blocker thực là ba lint errors, không phải thiếu dependency:

```powershell
$shim=Join-Path $toolRoot 'shim'
New-Item -ItemType Directory -Force $shim | Out-Null
$pnpmWrapper=Join-Path $toolRoot 'pnpm-extract/package/bin/pnpm.mjs'
[IO.File]::WriteAllText((Join-Path $shim 'pnpm.cmd'),('@echo off'+[Environment]::NewLine+'node "'+$pnpmWrapper+'" %*'+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
$env:Path=(Join-Path $toolRoot 'node-v24.22.1-win-x64')+';'+$shim+';'+$env:Path
pnpm --version
npm run product:check
```

## Gate còn lại và bàn giao

Evidence CI/CD local không thay readiness sản phẩm. Còn 19 historical links, ba lỗi lint của integrated source, G3/G4 và review sản phẩm theo hồ sơ riêng; final code review độc lập do parent sở hữu. GitHub environment approvals/variables/secrets, CI/GHCR/attestation thật, custody/recovery key, migration/DB compatibility/restore/cutover và smoke production còn cần evidence đúng target. Parent lấy commit docs/report, xem exact diff rồi tích hợp theo quyền; không claim release-ready.

Không còn process/server/port/DB thật được task giữ. Portable runtime, pnpm store/links và raw logs task-owned được giữ trong worktree, Git ignored. Thay đổi tracked chỉ sáu file docs/report, product/workflow/lockfile giữ nguyên so với snapshot 47e1d7f.
