# Kiểm tra local và Actions dùng chung

Nguồn lệnh là `check-plan.mjs`; runtime/image/package pin ở
`environment-lock.json`. [LOCAL_RUN](../../docs/agent/LOCAL_RUN.md) hướng dẫn shell
native; [validation](../../docs/tasks/MKW-CI-PARITY-001/validation.md) ghi bằng chứng
và các gate còn thiếu. Local PASS không chứng minh remote parity hoặc deploy.

## Chọn lệnh từ root workspace

| Lệnh                                          | Phạm vi theo thứ tự                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm run product:lint` / `product:typecheck` | Feedback native nhanh, cần Node24.22.1/pnpm12.15.0 và dependency đúng lock; không chứng nhận Linux parity      |
| `pnpm run ci:parity -- --quality`             | Worker quality: lint → format → typecheck → build → tooling-fast → sandbox → web → api → contract → boundaries |
| `pnpm run ci:parity`                          | Legacy/hook: quality → release-tooling; **rehearsal Not run**                                                  |
| `pnpm run ci:parity -- --release-tooling`     | Chỉ release-tooling trong pinned worker; **rehearsal Not run**                                                 |
| `pnpm run ci:parity -- --release`             | release-tooling → real Docker/PostgreSQL rehearsal                                                             |
| `pnpm run ci:parity -- --all`                 | quality → release-tooling → real rehearsal; chạy trước push để kiểm đủ release scope local                     |
| `pnpm run ci:parity -- --all --list`          | Liệt kê plan/runtime, không acquire Docker hoặc chạy checks                                                    |

`product:test:tooling:ci` chọn fast; `product:test:tooling:release` chọn release;
`product:test:tooling` giữ full legacy suite. Hai danh sách fast/release rời nhau,
hợp thành full inventory; dùng `node scripts/ci/run-product-tooling.mjs
--list` (thêm `--release` hoặc `--full`) để xem filenames hiện tại. Discovery
`deploy-account-rehearsal.test.mjs` không thay explicit real rehearsal.

Theo phạm vi người dùng xác nhận21/11/2026, mọi GitHub Actions path bỏ deploy thử
Docker/PostgreSQL. `release-validation.yml` gọi `--release-tooling`, vẫn failure-gating
trước build/backup/deploy/verify thật trong `main-release.yml`. Tooling vẫn chạy
trong pinned Docker worker; không chuyển sang pnpm/runtime host. Summary/report
của mode này chỉ chứng nhận tooling, rehearsal **Not run**. `--release`/`--all`
vẫn chạy full rehearsal khi được gọi local; no-flag/hook giữ nguyên coverage.
Các mode chọn bằng flag loại trừ lẫn nhau; `--list` chỉ liệt kê và không acquire.
Đây là thay đổi coverage đã được yêu cầu, không phải sửa nguyên nhân lỗi rehearsal
lịch sử hoặc đổi Failed thành Passed. Diagnostic v2 chưa được duyệt, không triển khai.

## Prerequisites và source

Host cần Git, Node hợp lệ để gọi CLI, pnpm12.15.0 nếu dùng wrapper, Docker client
trong PATH và daemon Linux/amd64 đang hoạt động. Host chỉ orchestration; checks
thật dùng Node24.22.1/pnpm12.15.0/Linux x64/UID:GID1000:1000. Worker có Compose
client thật, không mount host Docker socket. Real rehearsal cần quyền tạo dind
privileged disposable; driver trong daemon riêng chạy root, không phải worker1000.
Không switch Docker context/config global để chạy gate.

Rehearsal yêu cầu ít nhất **12GiB trống trên filesystem chứa evidence** trước
acquisition; dung lượng virtual disk Docker không thay host headroom. Cần mạng
đến registry, pnpm và Alpine repositories; pin không bảo đảm các dịch vụ luôn sẵn.
Cold run dùng UUID/container/store mới, không xóa cache global. Layer cache image
có thể có; không tái dùng node_modules/dist/store hoặc cache kết quả validation.

Snapshot giữ current tracked + untracked không ignored, dirty bytes và executable
mode theo contract Git/native; không dùng riêng HEAD thay dirty source. Exclude
node_modules/dist/.pnpm-store/.agent-runs/.superpowers, `.env*` trừ `.example`,
và deploy/shared. Snapshot từ chối symlink/hardlink/path không an toàn. Worker nhận
tar/manifest qua copy, private filesystem không bind workspace; install frozen
lock với private store mới. Build outputs không quay về cây source host.

CLI nhận `--repo-root ABSOLUTE --evidence-root ABSOLUTE --run-id UUIDv4`; chọn
output mới, không overwrite UUID cũ. Mặc định evidence nằm ở
`.agent-runs/MKW-CI-PARITY-001/<UUID>`, ngoài inventory source. Inner `run-checks`
bắt buộc report-root ngoài workspace, verified snapshot context và đúng runtime;
không dùng trực tiếp trên host để thay admission của outer.

## Đọc lỗi và artifact

`CHECK_REPORT` và `<UUID>/public/check-report.json` cho result, phase, stepId,
scenarioId (có thể null), code, exit/signal, duration, counts, runtime và source/base/
lock hashes. Counts là command/scenario group, không đồng nhất với số node tests.
Xem ordered scenario journal và raw logs **private** khi cần điều tra sâu.
`ENVIRONMENT_*`, `REHEARSAL_PREREQUISITE`/`STORAGE` chỉ ra admission/fetch/capacity;
`REHEARSAL_ASSERTION` chỉ ra assertion; `PROCESS_TIMEOUT`/`SIGNAL` cần giữ boundary
thật. Không tăng deadline, retry hoặc bỏ assertion để xanh. Giữ first failure,
exact source/runtime/error.code/errno/status/signal/elapsed và report đã validate.
Primary giữ lỗi gốc; secondaryErrors ghi export/cleanup/report failure riêng.

Diagnostics release dùng step cố định `release-assemble`, `release-extract`,
`entrypoint-<site>` và `release-verify` (phase recovery). Entry site là lifecycle
hint đã allowlist; `entrypoint-unknown` nghĩa là thiếu marker hợp lệ, không suy
nguyên nhân. Nonce riêng từng command không được lưu/xuất hoặc truyền cho dependency.
Driver chỉ nhận một dòng bounded khớp nonce, site và observed status; signal/timeout
luôn giữ process failure. Marker không chứng minh receipt hoặc deploy thành công.
Trong same-SHA scenario, các site `release-inode-mtime-bytes`,
`release-operation-backup`, `release-shared-backup`, `release-backup-absence`
chỉ định nhóm invariant hiện hành. Assertion sau command0 có exit null, không
mang status expected-negative cũ. Public vẫn đúng một validated JSON, không raw
exception/actual/expected/stdout/stderr. Vocabulary mới là contract delta cần review;
không đổi schemaVersion hoặc nới validation.

Collector `node scripts/ci/collect-evidence.mjs UUID ABS_EVIDENCE_ROOT
ABS_NEW_OUTPUT_DIR` chỉ xuất đúng **check-report.json** đã schema-validate;
incomplete/malformed/missing report tạo Failed/REPORT_INCOMPLETE và exit nonzero.
Actions collect/upload/summary dùng `if: always()`, upload exact file từ runner.temp,
retention7 ngày. Hard kill/mất runner có thể không có artifact. Không upload cả
evidence tree, source tar, argv/env/raw logs, DB dump, TLS keys hoặc credentials.

Worker/container/image được kiểm ID/name/session labels/user/mount trước cleanup.
Rehearsal thành công export private evidence rồi xóa exact engine/anonymous volume
và derived task images; pinned input images được giữ. Rehearsal thất bại có thể
giữ engine để chẩn đoán: đọc ownership/owned-engine/result/acquisition và kiểm lại
actual daemon, marker, labels, ID/name/image/mount trước owner cleanup. Không prune,
kill theo port, xóa unknown resources hoặc xóa evidence để làm verifier xanh.
Supplemental strict postcheck có thể Failed/REHEARSAL_SOURCE do generated
`.agent-runs`; giữ scoped nonblocking disposition Task5R2, không nới verifier.

## Bản đồ owner và consumers

- `parity.mjs`: parser/mode, một capture, ordered profiles và aggregate terminal.
- `worker.mjs`: Docker client/context/image admission, copy/install1000, report export,
  exact cleanup. `Dockerfile`: worker; `Dockerfile.rehearsal`: dind tool image.
- `run-checks.mjs`: runtime/source admission và ordered catalog commands;
  `environment.mjs`: validate lock/facts/classify fetch.
- `source-snapshot.mjs`: capture/tar/verify/handoff; engine dùng cùng helper.
- `evidence.mjs`: schema/projector/terminal admission; `collect-evidence.mjs`: public
  boundary. `scripts/product/local-rehearsal-engine.mjs` sở hữu real rehearsal;
  driver/fixture sở hữu canonical scenario IDs và SQL/HTTP assertions.
- Consumers: `.github/workflows/ci.yml` gọi `--quality`,
  `release-validation.yml` gọi `--release-tooling`; `main-release.yml` chờ cả hai trước
  build/backup/deploy. `.githooks/pre-commit` gọi no-flag; bật hooks là thao tác
  config riêng, không cần bật hoặc bypass để chạy lệnh manual.
- Regression coverage: `tests/product-tooling/ci-{check-plan,environment,source-snapshot,evidence,parity,parity-failures}.test.mjs`,
  runner/workflow policy và deploy-account tests. Worker EXDEV capability skip khác
  privileged actual EXDEV rehearsal; Windows-only skip không thành Linux PASS.
