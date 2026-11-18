# CI nhanh và release validation — 18/11/2026

## Mục tiêu

Tách kiểm tra mã nguồn chạy trên mọi pull request khỏi nhóm kiểm thử account/
Docker/rehearsal nặng. Nhóm release validation vẫn bắt buộc trước build và
deploy production.

## Phạm vi

- CI reusable giữ lint, format, typecheck, build, tooling không phụ thuộc
  release rehearsal, sandbox, web, API, contract và boundary checks.
- Workflow reusable/manual riêng chạy nhóm release tooling, account rehearsal và
  nested Docker engine trước release.
- Fixture account dùng đường dẫn Docker được phát hiện từ PATH thay vì giả
  định `/usr/local/bin/docker`.
- Không sửa production runtime, backup, SSH, health/smoke, secret hoặc VPS.

## Acceptance

- Pull request không chạy account/rehearsal nặng.
- Push main phải đi qua release validation trước build/backup/deploy.
- Không làm mất coverage: full tooling và rehearsal vẫn có lệnh riêng.
- Fixture chạy được cả Docker ở `/usr/local/bin/docker` và vị trí khác trong
  PATH.

## Rủi ro và kiểm chứng

Rủi ro chính là một test bị loại nhầm khỏi CI nhanh hoặc release gate không
được nối vào `needs`. Kiểm chứng gồm test policy YAML, runner inventory
disjoint/exhaustive, focused account tests, full tooling và kiểm tra cú pháp
workflow. Không chạy production.

## Base, writer và review

- Base: `ca296b028e73e12bb222d6395557ddea022e0bc4`.
- Writer: primary trong worktree `fix/ci-release-validation-split`.
- Reviewer: fresh independent reviewer trên exact final snapshot.
- Next action: implement, verify local, independent review, rồi bàn giao local;
  không push/merge/deploy.

## Kết quả triển khai và kiểm chứng

`scripts/ci/run-product-tooling.mjs` chia 53 file test thành 17 file fast và
36 file release. Test inventory kiểm hai nhóm rời nhau, hợp lại bằng full suite;
file test mới chưa phân loại vẫn chạy trong fast thay vì bị bỏ qua. Lệnh
`product:test:tooling` và `ci:parity` local vẫn chạy full tooling như trước.

`release-validation.yml` chỉ có reusable/manual trigger, không tạo producer
push mới. Job dùng runner Ubuntu24.04, Node24.22.1 và container client từ
Dockerfile đã pin digest. Source mount read-only, dependencies được cài bên
trong container, tests chạy bằng user `node`; không mount Docker socket.
Rehearsal thật vẫn gọi engine UUID hiện hữu trên runner. Build/backup chờ cả
quality và release validation; summary luôn ghi trạng thái gate mới.

Fixture account phát hiện executable Docker từ PATH **trước** khi prepend
Docker double, không đổi guard hoặc source production.

Evidence local: `.agent-runs/ci-release-validation-split/`.

- Tái hiện baseline trong Linux Node24.22.1, UID1000, Docker ở `/usr/bin/docker`
  và không có `/usr/local/bin/docker`: 24 pass/14 fail, đúng lớp lỗi CI.
  Sau sửa: 38/38 pass, không skip (`account-usr-bin-red.log`,
  `account-usr-bin-green.log`).
- Cùng source sau sửa với Docker ở `/usr/local/bin/docker`: 38/38 pass,
  không skip (`account-usr-local-green.log`); chạy container không network và
  không Docker socket. Container/tag bổ sung của probe đã gỡ sau kiểm ownership.
- Fast tooling: 431 pass/0 fail/2 skip có sẵn (`fast.log`).
- Release tooling: 528 pass/0 fail/2 skip có sẵn (`release.log`). Hai nhóm cộng
  963 tests, gồm 4 test mới; không thêm skip.
- Focused workflow/inventory policy: 25/25 pass (`focused-policy.log`).
- Lint sản phẩm, ESLint runner mới, format sản phẩm và file workflow/runner,
  typecheck, build: exit0 (`product-static.log`). Build giữ cảnh báo chunk-size
  hiện hữu, không thay bundling sản phẩm.
- Actionlint1.7.12 cho ba workflow thay đổi: exit0 (`actionlint.log`), binary
  tải từ release chính thức và đối chiếu SHA256 với GitHub release asset.
  Shellcheck/Pyflakes không chạy trong lượt Actionlint này.
- Docs checker: Failed với 19 missing links đến evidence lịch sử trong các
  tài liệu MKW-PRODUCT-001 không sửa trong task này (`docs-check.log`); không
  đổi các lỗi này thành pass. `git diff --check`: pass.
- Container/tag riêng `mkw-ci-split-20261118`/
  `mkw-ci-release-validation:20261118` đã gỡ; không prune cache, không chạm
  container hoặc volume của project khác.

Giới hạn: chưa chạy workflow trên GitHub, chưa chạy lại real nested-engine
rehearsal (engine/driver không sửa), chưa production. Kết quả tooling không
thay bằng chứng deploy/SSH/GHCR hoặc settings thật. Node host Windows24.12
không đạt floor; install/check chính chạy trong container24.22.1. Probe install
host bị từ chối do floor, không nới engine policy.

Independent review: **PASS — không có finding cần sửa**. Reviewer độc lập
`gpt-6.1-sol/high`, task ID suffix
`ci-release-validation-split-review-20261118-1`, đã đối chiếu đủ15 file với
`review-manifest.json`, đọc full diff/consumer và evidence. Fresh scoped checks
13/13, hai shell blocks `bash -n`, whitespace đạt. Expanded policy rerun trên
host không chạy được vì thiếu `eslint/package.json`; host Node24.12 dưới floor.
Linux results được reviewer audit từ evidence, không tự coi là reviewer rerun.
Source code không đổi sau review; cập nhật này chỉ ghi kết quả/giới hạn.

Trạng thái bàn giao: implemented và reviewed local; chưa commit/merge/push,
chưa GitHub run mới, chưa production. Next action: owner tích hợp nhánh local
theo quyền riêng; release validation vẫn phải đạt trên GitHub trước deploy.

Nguồn tham khảo công khai:
[GitHub Node.js CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs),
[Docker test before push](https://docs.docker.com/build/ci/github-actions/test-before-push/),
[FastAPI template workflows](https://github.com/fastapi/full-stack-fastapi-template/tree/master/.github/workflows).
