# CI fixture portability — 18/11/2026

## Hồ sơ trước sửa

- Mục tiêu: sửa failure đã xác nhận của run `44284550877`, job `134733709775`; chỉ thay fixture local, không rerun workflow release.
- Base: `9f8e9797e62e4559948c97d588190b3a14af69ea`; branch/worktree hiện hữu `rewrite-deploy-account`, sạch trước task.
- Scope: bốn nơi tạo fixture dưới `/home` trong bootstrap-runtime, production-account-script, final-review-boundaries và fixtures/deploy-entrypoint; helper test dùng chung nếu cần. Không thay product source, policy allowed-root, workflow, dependency/lockfile.
- Acceptance: xác định mọi lớp lỗi thật từ log; tái hiện khi UID khác 0 và `/home` không ghi được; focused và full tooling chạy trên user Linux đó; giữ nguyên assertions lock/containment/identity/no-clobber/secret; full checks phù hợp; snapshot bất biến để primary review.
- Rủi ro: `tmpdir()` thường là `/tmp`, bị production policy từ chối; home của root là `/root`, cũng ngoài policy. Fixture phải dùng đường dẫn hợp lệ và writable mà không cấp thêm quyền hoặc nới policy.
- Writer: implementation worker duy nhất, không nested agents. Primary sở hữu independent review trước integration. Không stage/commit/push/merge/production; bảo toàn main và evidence cũ.
- Tài nguyên: Docker Linux disposable container/image có label riêng; không host socket, DB hoặc production. Evidence mới tại `.superpowers/sdd/ci-fixture-portability-20261118/`; không ghi lại evidence cũ.
- Bước tiếp: frozen baseline → tái hiện EACCES dưới user `node` → sửa fixture → focused/full checks → freeze snapshot/report. Independent review Pending.

## Kết quả điều tra

`gh run view 44284550877 --job 134733709775 --log` được lọc tại failure summary, không rerun workflow. Run dùng đúng base SHA trên. Job dừng ở Tooling tests: 959 tests, 880 pass, 75 fail, 4 skip; backup/build/deploy/verify bị skipped.

Toàn bộ 75 failure thực có cùng lớp lỗi `EACCES`, syscall `mkdtemp`, trước khi assertions chạy:

| Nơi tạo fixture | Prefix ghi trực tiếp dưới `/home` | Failure |
| --- | --- | --- |
| `tests/product-tooling/bootstrap-runtime.test.mjs:39` | `mkw-bootstrap-` | 3 |
| `tests/product-tooling/final-review-boundaries.test.mjs:56` | `mkw-final-boundary-` | 8 |
| `tests/product-tooling/fixtures/deploy-entrypoint.mjs:49` | `mkw-task6-` | 27 |
| `tests/product-tooling/production-account-script.test.mjs:42` | `mkw-task8-` | 37 |

Không có lớp lỗi gốc bổ sung trong failure summary. Diagnostic JSON chứa login401/`CONTEXT_CLOSE_TEST` là đầu ra cố ý của test `I5 login assertion and context cleanup both survive the row boundary safely` trong `benchmark-delivery.test.mjs`; assertions yêu cầu giữ lỗi và lọc secret. Không phân loại diagnostic đó thành lỗi auth thật.

Root cause: runner thường không được tạo thư mục ngay dưới `/home` (root sở hữu, mode755). Local parity trước đây chạy root nên che giả định này. Chuyển sang `tmpdir()` trên Linux cũng sai vì entrypoint chỉ nhận `/home/...` với component thuộc allowlist và tiếp tục kiểm tra canonical containment/symlink.

## Thay đổi chính xác

Chỉ năm file test/helper và báo cáo này thay đổi:

- Thêm `tests/product-tooling/fixtures/deploy-root.mjs`: `makeDeployFixtureRoot(prefix)` tạo thư mục ngẫu nhiên trong home hiện hữu của runner nếu home dưới `/home/`. Home `/root` của harness root cũ dùng `/home` như trước; Windows dùng `tmpdir()` như fixture transport trước đây. Home Linux ngoài vùng policy không được biến thành deploy path hợp lệ.
- Bốn file trong bảng trên gọi helper thay prefix tuyệt đối; imports được cập nhật. `deploy-entrypoint` phục vụ cả `deploy-publish.test.mjs` và `deploy-config.test.mjs`.
- Cleanup `t.after`, điều kiện skip và mọi assertion giữ nguyên. Không sửa source production, policy allowed-root, workflow, parity runner, dependency/lockfile hoặc quy tắc security.

## Kiểm chứng

Môi trường chính: disposable image build từ `scripts/ci/Dockerfile` của base, Node24.22.1, pnpm12.15.0 theo packageManager của workspace, real Docker Compose5.7.1 client, Bash/GNU tar/real flock/Python. Container chạy user `node` UID/GID1000, `HOME=/home/node`, `/home` root:root755 không writable, `/home/node` node:node755 writable, cap-drop ALL, no-new-privileges, không privileged và không có Docker socket. Source được extract từ Git archive rồi overlay đúng năm file sửa vào workspace nội bộ; không bind checkout/main để chạy test. Chỉ bind thư mục evidence mới.

| Check | Kết quả |
| --- | --- |
| Baseline focused: bootstrap, account, final-boundary, deploy-publish | **Failed dự kiến**: 83 tests, 9 pass, 74 fail, 0 skip; mọi failure EACCES |
| Baseline deploy-config | **Failed dự kiến**: 13 tests, 12 pass, 1 fail EACCES, 0 skip |
| Cùng năm suite sau sửa, `node --test --test-reporter=tap --test-concurrency=1 ...` | **Verified**: 96/96 pass, 0 skip, UID1000 |
| `pnpm install --frozen-lockfile` trong container UID1000 | **Verified**, không thay lockfile |
| `pnpm run product:check` trong container UID1000 | **Verified**, exit0: lint/format/typecheck/build; tooling955 pass/0 fail/4 skip; sandbox32/32; web353/353; API42/42; boundaries/cycles và contract snapshot/types |
| Lặp `product:check` sau đồng bộ exact checkout bytes | **Failed** ở web: `selection-completion.test.tsx`, case `successful single-cell save ends pending fill and ordinary click opens only that cell`, timeout5000ms; web352 pass/1 fail. Lint/format/typecheck/build, tooling955/0/4skip và sandbox32/32 vẫn đạt; API/boundaries/contract chưa chạy trong invocation này |
| Web exact snapshot theo CI: `pnpm --filter @mkw/web test --run --maxWorkers=2` | **Verified**: 38 files/353 tests pass, không đổi timeout/assertion/source |
| Các bước tiếp trên exact snapshot: API test, product:boundaries, product:contract:check | **Verified**, exit0: API42/42, boundaries/cycles và contract snapshot/generated types; cùng web2workers hoàn tất các check tương ứng CI ngoài rehearsal |
| Bootstrap success trên harness root, HOME=/root | **Verified**: 1/1 pass; bằng chứng tương thích bổ sung, không thay kiểm chứng UID1000 |
| Windows final-review-boundaries, portable Node24.22.1 | **Verified**: 7 pass/0 fail/1 skip Linux có sẵn |
| Docs checker trên base sạch và source sau sửa | **Failed baseline**: cùng19 missing links, output giống hệt; không có lỗi mới |
| `git diff --check`, manifest main/evidence/index/HEAD | **Verified**; main6 dirty files và23.023 file evidence cũ không đổi |

Bốn skip của full tooling giống CI: ba case chỉ dành Windows và một real EXDEV/bind-mount cần disposable privileged mount namespace. Không thêm skip. Các75 failure ban đầu chuyển thành pass, tổng số tooling tests vẫn959.

Một probe Windows ban đầu dùng Node24.12.0 ngoài floor cũng đạt7/1skip; đã chạy lại bằng portable24.22.1 ở trên. Probe pnpm từ ngoài workspace báo12.21.0 do Corepack chọn mặc định; install/full checks đều chạy trong workspace với pin12.15.0. Environment evidence chuẩn là `linux-environment-workspace.txt`.

Timeout UI chỉ quan sát ở full run lặp với workers mặc định (log báo38 workers spawned); lần full đầu đạt và toàn bộ web suite với giới hạn2 workers đúng `.github/workflows/ci.yml` đạt. Không suy timeout thành auth/EACCES hoặc lớp lỗi mới của run GitHub ban đầu; chưa điều tra tận gốc tính không ổn định của UI test ngoài scope. Giữ nguyên raw failed log và ghi giới hạn này cho primary. Không thay source sản phẩm để xử lý timeout.

## Evidence, bàn giao và giới hạn

Evidence mới nằm tại `.superpowers/sdd/ci-fixture-portability-20261118/`: `ci-failures-filtered.txt`, `ci-counts.txt`, hai `red-*.tap`, `green-focused-unprivileged.tap`, `product-check-unprivileged.log`, `install-unprivileged.log`, `linux-environment-workspace.txt`, `windows-final-boundary-supported.tap`, `root-bootstrap-compatibility.tap`, `docs-baseline.log`, `docs-current.log`, `preservation-before.json` và `preservation-after.json`. Log chỉ chứa fixture/local diagnostic; không thu secret/dữ liệu nhân sự/production env.

Kiểm tra snapshot ban đầu phát hiện năm file gốc khác CRLF/LF giữa Git archive và checkout: ba tài liệu deploy/account, `scripts/ci/Dockerfile` và `scripts/product/local-release-rehearsal.ps1`. Đã chứng minh nội dung giống sau chuẩn hóa newline, đưa đúng bytes checkout vào container và xác minh đủ838 file khớp manifest trước full check cuối. Giữ log probe mismatch ban đầu; lỗi tar file-list có CRLF trong probe tiếp theo đã được sửa sang LF trước xác minh cuối. Không sửa năm file gốc đó tại worktree. Đây là lỗi chuẩn bị evidence đã xử lý, không phải lớp lỗi mới trong CI.

`snapshot-index.json` ghi SHA256 của full source archive/manifest, patch và evidence; `review-source.tar`, `review-source-manifest.json`, `review-final.patch` là artifact bàn giao cuối. Source snapshot bao gồm file tracked của base, năm test/helper mới nhất và báo cáo này; không chứa `.git`, dependency/generated output hoặc evidence cũ. Primary đối chiếu manifest/archive và đọc exact bytes trước review; báo cáo này không tự chứng nhận independent review. `product-check-exact-snapshot-unprivileged.log` là full run sau đồng bộ bytes. Sau run chỉ có cập nhật báo cáo/evidence; test/helper và source production không đổi.

Resource ownership: container `mkw-ci-fixture-portability-20261118`, label `mkw.owner=ci-fixture-portability`, `mkw.run=20261118`; image tag cùng task. Cleanup xác minh exact ID/labels trước khi chỉ xóa container/tag đó; giữ base images/cache và mọi tài nguyên khác. Kết quả ở `resource-cleanup.json`.

Trạng thái: **Implemented, verified locally; independent review Pending**. Không stage/commit/push/merge/deploy, không sửa main/evidence cũ, không nested agents. Full root `ci:parity`, rehearsal PostgreSQL/Docker34 nhóm và production không chạy lại vì source production không đổi; non-root full product check là bằng chứng cho lỗi permission lần này. GitHub run cũ vẫn Failed, chưa có remote CI proof trên bản sửa.

Next action: primary review độc lập exact immutable snapshot; chỉ tích hợp/phát hành theo quyền riêng sau review. Không rerun workflow release như cách retest fixture.
