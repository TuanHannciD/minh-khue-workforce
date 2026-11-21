# MKW-CI-PARITY-001 — Validation

## Delta bỏ rehearsal khỏi Actions —21/11/2026

Scope hiện hành tại [yêu cầu](approved/requirements.md) và [quyết định](decisions.md).
Base `fd4ac959a0626b5fd847aa12ed14b550ff1d7741`, branch/worktree
`fix/ci-environment-parity`; sole writer, fresh independent review pending primary.
Evidence riêng dưới `.agent-runs/MKW-CI-PARITY-001/remove-actions-rehearsal-20261121-implementation/`.
Full local rehearsal không chạy lại trong delta này; tests mode full dùng boundary
fixtures để kiểm nhánh gọi, không tính actual deploy rehearsal PASS.

RED host Node24.12.0/win32:13 focused tests failed đúng mode mới chưa có và workflow
cũ còn `--release`. GREEN boundary100/100 và workflow evidence1/1, exit0; tests
chứng minh chỉ release profile, không gọi rehearsal (adapter throw), counts/primary/
cleanup/collector, CLI/list/help và main dependency gate. Host kết quả này chưa
chứng nhận pinned runtime. Affected fast regressions161pass/1Windows signal skip,
exit0. First GREEN attempt có2 lỗi giả định test (cleanup image chưa được gọi khi
container cleanup fail; printf đặt flag trước path), đã sửa tests theo source và
giữ log; không sửa production để khớp giả định.

Actual shared worker Node24.22.1/pnpm12.15.0/Linuxx64/UID1000:

- `--release-tooling`, UUID `ddcdc35b-34ec-4ec6-96d9-24dd201499e3`: exit0,
  release558pass/2skip/0fail, report1 command/0 rehearsal assertions; duration
  outer414660ms, inner210123ms. Chỉ release-tooling profile, rehearsal Not run.
- `--quality`, UUID `78b1ff0e-47d2-41c9-803e-c99e60d6701f`: exit0, đủ10 commands;
  fast758pass/2skip, sandbox32pass, web38files pass, API42pass; duration
  outer583660ms, inner388581ms. Rehearsal Not run.
- Cùng tested868-file source
  `f1ddfa6fd042cac6a883eb3d93f8191ca2777e771517ec4246a0e7f485dc1d57`, archive
  `9e885a787e5d1af13ced24ba14d6a5f64951d532a9c9fa8f3c512eddcd1ea399`;
  pinned layers có thể cached, mỗi worker install frozen/private tree/store riêng.
- Hai exact-file collectors/schema/runtime/counts đạt, không rehearsal directory;
  cả2 reports Passed/OK, inner available, secondary empty. Fresh8 scoped Docker
  container/image/session/network/volume absence queries exit0/output-empty; không
  còn owned resources. Không tạo rehearsal engine/project/DB/port mới.
- Touched lint/format, Actionlint1.7.7 `-shellcheck=`, Bash5.3.9 `-n`8 workflow
  shell steps và diff-check đạt. Standalone Shellcheck Not run. Global docs checker
  exit1 đúng19 historical missing links; targeted current docs UTF-8/links/fences/
  whitespace/newline kiểm riêng, không nới baseline.

Logs `pinned-release-tooling.log`, `pinned-quality.log`, per-UUID worker logs và
`actual-run-audit.json` ở evidence root trên; exact commands/runtime/exit/log paths,
old/new file hashes, delta và whole-branch patch trong report/handoff ignored ledger
`remove-actions-rehearsal-{report.md,handoff.json}` cùng brief. INDEX/validation
kết quả và hai operations docs coverage paragraphs là docs-only delta sau hai
tested captures; final snapshot/hash ghi riêng, không claim cùng inventory.
Fresh independent A/B reviewer pending primary; source local chưa commit/push.

Các phần Task8 bên dưới là lịch sử19–20/11; không dùng làm acceptance của source mới.
Bỏ coverage rehearsal Actions không root fix/B1 hoặc retrospective PASS của run
44737481094 attempt1 (deploy/entrypoint-app-apply-api-bad,
same_sha_new_backup_preserves_release_inode_bytes/REHEARSAL_ASSERTION).
Local full-prefix probe PASS_NONREPRODUCTION vẫn không có causal fix. B1 Blocked,
H1 Open, detailed parity Blocked, docs baseline Failed19, standalone Shellcheck
Not run, prior strict postcheck Failed và overall chưa Done giữ nguyên.

## Lịch sử local Task8

Ngày19/11/2026. Scope: chuẩn bị operational docs và local acceptance trên interfaces
Tasks1–5/7 đã accepted. Base/HEAD `c5f20e08d5f39e81186b9455ae037bba781e2273`, branch
`fix/ci-environment-parity`; current dirty implementation là input, không riêng HEAD.
Một writer, workspace đã cách ly; parent điều phối, reviewer mới sau handoff.
Không stage/commit/push/PR/merge/workflow dispatch/deploy hoặc config/secrets thật.

## Gate và cách đọc bằng chứng

Operational docs được chuẩn bị trước freeze. Acceptance gồm actual pinned
`pnpm run ci:parity -- --all` cold và một lượt repeatability riêng, UUID/resources
mới trên source không đổi. Output ở ignored `.agent-runs/MKW-CI-PARITY-001/task-8-<UUID>/`,
ngoài source inventory. Report/handoff/package ở ignored ledger
`.superpowers/sdd/2026-11-19-ci-environment-parity/task-8-*` ghi exact snapshots,
commands/logs/runtime/image IDs/source archive và cleanup. Nếu thêm kết quả vào
tài liệu sau runs, tested/current inventory và docs-only delta phải ghi riêng.

| Gate                                                      | Trạng thái trước capture                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Operational docs/local static/full cold/repeatability     | Đang thực hiện, chưa claim Verified                                                                                                |
| Historical failure run44433939245, Task6 B1               | **Blocked**: thiếu inner failing case/causal RED–GREEN/root fix; local green không đóng gate                                       |
| H1 outer none watchdog4000ms                              | **Open**: giữ deadline/retry/skip; nếu tái diễn lưu error.code/errno/signal/status/elapsed/last boundaries/validated child report  |
| Same-source Ubuntu/Actions và artifact download/transport | **Not run/Blocked**: chưa được phép remote activation                                                                              |
| Fresh independent whole-branch review                     | **Pending parent dispatch** sau writer terminal; self-review không là independent review                                           |
| Standalone Shellcheck                                     | **Not run**; Actionlint với `-shellcheck=` và Bash-n chỉ syntax                                                                    |
| Supplemental strict postcheck                             | **Failed/REHEARSAL_SOURCE**, scoped nonblocking Task5R2 do generated `.agent-runs`; không xóa output/nới verifier/backfill lịch sử |

Docs checker baseline19 missing historical links phải đo mới, giữ Failed nếu còn;
không sửa lịch sử hoặc nới gate. Worker release EXDEV capability/Windows-only skips
được báo đúng; privileged actual EXDEV rehearsal là gate riêng. Pinned worker phải
đo Node24.22.1/pnpm12.15.0/Linuxx64/UID1000, driver dind root; host24.12 chỉ orchestration.

## Acceptance và giới hạn

Kiểm ordered command IDs và fast/release/full filenames, actual scenario IDs,
durations/counts, source/lock/archive hashes, image IDs, collector schema/public
allowlist đúng một file và absence sau exact cleanup. Không claim scenario đạt
chỉ từ tổng count. Cold không kế thừa node_modules/dist/store/result cache, có thể
dùng pinned image layers; không purge global cache. First failure phải giữ nguyên,
điều tra trước sửa hoặc rerun; failure mới không tự là historical B1.

Rủi ro còn lại: network/registry/package availability, Docker Desktop khác kernel
Ubuntu, retained failed resources và historical cause chưa biết. Overall task
**chưa Done**, chưa integrated/released. Next action: freeze docs/source, chạy
hai local acceptance độc lập rồi parent giao fresh reviewer toàn branch; quyền
remote và B1 cần giải quyết riêng. [CI map](../../../scripts/ci/README.md),
[LOCAL_RUN](../../agent/LOCAL_RUN.md), [INDEX](INDEX.md) sở hữu hướng dẫn/routing.

## Kết quả local Task8 — sau hai lượt acceptance

Hai lệnh thực `pnpm run ci:parity -- --all --evidence-root ABS_NEW_ROOT --run-id UUID`
đã exit0 trên hai fixtures lạnh riêng (không node_modules/dist/store trước wrapper).
Wrapper pnpm12 tự install vào mỗi host fixture mới; worker cài lại frozen lock trong
private Linux tree/store, không lấy dependency/build của workspace host.

Tested snapshot861 files: `845fa7590d0900a7b8dd04302e8c3b1f2acf2ca5243a1384acfeb28d38781dcc`; archive
`e2a1e5374b15fcefe8bf3cad93851a2a2e87e0eef6f6c4fe4c2dc0ef685ae138`. pnpm lock
`5e8ae341f5f991398462c7a549b5ac914b23f9b283fad29d92448d04744773aa`; environment lock
`f1838f292bc639cec543e968e349d8b6f45478a2b5e5813c3238e67480e1331b`. Base/HEAD/index không đổi.

| Lượt          | UUID                                   | CLI gồm wrapper (s) | Parity (s) | Quality / release tooling / rehearsal (s) |
| ------------- | -------------------------------------- | ------------------- | ---------- | ----------------------------------------- |
| Cold          | `c31eb13d-bc26-496e-a65e-f63c5627744b` | 983.118             | 917.553    | 181.842 / 127.080 / 529.590               |
| Repeatability | `4b7a075a-fd8a-4e23-bbb9-6b53ab576218` | 969.854             | 903.474    | 177.458 / 127.717 / 508.557               |

Mỗi lượt:10 quality commands +1 release-tooling command; fast642pass/0fail/2Windows-only
skips, release528pass/0fail/2skips, sandbox32pass, API42pass, web353pass. Fast23files
và release36files rời nhau, hợp thành full59files. Actual worker Node24.22.1,
pnpm12.15.0, Linuxx64, UID1000; dind driver UID0/Docker29.9.3/Compose5.7.1.
Full34 ordered scenario IDs khớp catalog, gồm credential scan, privileged actual
EXDEV/bind và SIGKILL. Worker EXDEV capability skip + PowerShell Windows-only skip
khác actual privileged rehearsal; Windows caller còn có fresh1/1 native.

Schema/terminal/source/archive/runtime admission và exact-file public collector
đều Verified; hostile unknown argv/canary collector trả exit1/Failed/REPORT_INCOMPLETE,
không lộ canary. Chỉ `check-report.json` được collect; private source/logs/DB
không nằm public output. Mỗi UUID có exact ID/name/labels/marker/mount cleanup và
fresh absence queries, leftovers[]. Actual image IDs, build A/B requests, inventory,
scenario durations/command counts và cleanup raw nằm ở `task-8-cold-audit.json` /
`task-8-repeat-audit.json` cùng report/handoff ignored ledger. Không upload Actions thật.

Static mới: Actionlint1.7.7 `-shellcheck=`, Bash5.3.9 `-n` workflows/shells,
diff-check và docs format đạt; standalone Shellcheck Not run. Docs checker đo mới
**Failed đúng19 missing historical links**, không sửa ngoài scope. Supplemental
strict Task7 vẫn Failed/REHEARSAL_SOURCE/nonblocking Task5R2; `--all` không export
new strict postcheck, không backfill historical extras inventory.

Đoạn kết quả này và INDEX được thêm **sau** hai runs: docs-only delta, không phải
same inventory với tested snapshot trên. Current snapshot/hash và exact delta ở
report/handoff/review packages; docs UTF-8/link/format/diff kiểm lại riêng. Không
rerun full suites cho kết quả tài liệu; parent reviewer quyết định affected checks.
B1 vẫn Blocked, H1 Open (không recurrence không chứng minh root fix), remote
Ubuntu/transport Not run/Blocked, independent whole-branch review pending parent.
Overall **chưa Done**, chưa commit/integrated/released.

## Task8 fix1 I1 — Rebind local ngày20/11/2026

I1 engine candidate đã sửa và local rebind Verified; independent re-review pending
parent. Đây không phải historical root fix/B1, whole-branch approval hoặc deploy.
Build worker/engine không gán tag; iidfile + session/role/lock/Dockerfile labels
bind execution và cleanup. Alias/digest/share/ID/label mismatch hoặc query failure
giữ resources và báo failure/secondary, không force-remove image.

Focused10/10 GREEN sau RED8/9 ban đầu và RED2/2 cho tagless listing/build-nonzero
retention. Bounded actual daemon cùng UUID/two evidence roots có4 distinct image IDs,
one success/one name-collision rejection; prior/foreign tags và retag preservation
được inspect trước explicit owner teardown. First actual probe Failed do default
image ls ẩn tagless images; --all query tái hiện khác biệt, source sửa rồi proof mới
đạt. Evidence lỗi đầu và exact cleanup được giữ; doubles không được tính Docker proof.

| Lượt   | UUID                                   | CLI wrapper (s) | parity (s) | Quality / release tooling / engine (s) | inner / outer commands |
| ------ | -------------------------------------- | --------------- | ---------- | -------------------------------------- | ---------------------- |
| cold   | `96528d36-afb5-4907-b9cd-3e16deed67fc` | 968.389         | 915.517    | 197.175 / 127.169 / 527.248            | 541 / 67               |
| repeat | `9422e586-f6bb-41d7-a9ee-1e0fa12d0ec6` | 983.606         | 931.646    | 192.843 / 127.227 / 535.909            | 551 / 67               |

Cả hai actual `pnpm run ci:parity -- --all` exit0/signal null trên source
`f6234cf6bc0ca6135ca7739312d6f57a48c0280efe7e016636008d438bdeb745`, archive
`0438ae10ea7d60d9ee87d2c8cd0e0ca72df54eec0725e22c5622b9ddc0f5e0d8`; locks/index
giữ nguyên. Fresh fixtures/store/dependencies/build, không xóa global cache. Vì C:
còn sát storage floor, fixtures/evidence mới thuộc namespace riêng D:/Temp; storage
gate12GiB giữ nguyên và actual bytes được ghi từng run. Pinned layers có thể cached.

Mỗi run đủ quality10+release1; fast654=652pass/2Windows-only skips và release530=
528pass/2skips. Tooling inventory23fast+36release=59full disjoint union. Sandbox32,
API42, web353; privileged EXDEV và SIGKILL1/1 mỗi suite, không skip. Real PostgreSQL
34 ordered IDs exact catalog, credential scan và A/B app image/source requests.
Worker Node24.22.1/pnpm12.15.0/Linuxx64/UID1000; driver root Node24.22.1/Docker29.9.3/
Compose5.7.1. Aggregate runtime projection không thay worker UID proof.

Năm reports mỗi run Passed/OK, secondary empty, inner available. Collector chỉ xuất
check-report.json khớp aggregate; unknown-argv/canary negative Failed/REPORT_INCOMPLETE,
không lộ canary. Exact IDs/session/name/marker/mount được kiểm trước teardown; fresh
--all image/container/volume absence queries đạt, live owned resources/sessions none.
Filesystem evidence giữ private tại `D:/Temp/mkw-ci-parity-task8-fix1-2bdcb69c-869a-4de4-9d71-e4dec7445d56`.

Static28 records:27 exit0, docs checker Failed đúng19 historical links. Standalone
Shellcheck Not run; Actionlint -shellcheck= và Bash-n chỉ syntax. Strict supplemental
prior Failed/REHEARSAL_SOURCE/nonblocking Task5R2 giữ nguyên; không claim fresh strict
postcheck vì --all không export nó. H1 vẫn OPEN4000ms, không tăng deadline/retry/skip.
B1 BLOCKED và remote same-source Ubuntu/transport Not run/Blocked chưa được phép.

Kết quả mục này cùng INDEX là docs-only delta sau tested freeze, không gọi current
và tested cùng inventory. Fix1 report/handoff và new delta/whole-branch packages
ghi exact current hash, source/archive/runtime/images/logs/resources/provenance.
Parent giao fresh scoped independent re-review; overall chưa Done, chưa commit/
integration/release/deploy.

## Independent R2 và local acceptance — 20/11/2026

Coordinator đã đọc full task-8-review-r2.md và nhận local fix1 checkpoint: I1 Important/P2 ADDRESSED, Spec PASS / Quality PASS trong scope local,0 finding mới. Fresh Node24.22.1 affected regression75/75 và17 independent controls đạt; controls là Docker/source/storage boundary models, không phải actual daemon faults. Reviewer audit actual133-process Docker collision/retag proof và hai final-source cold/repeat --all,3911raw members/package, provenance completeness và before/after integrity.18 scoped Docker read-only queries status0/output-empty; không acquire/cleanup tài nguyên mới.

Reviewed861 source `549c09ffa63edd3547d4665c5909048e88bd251754ae855843892a2b57b5780b` / archive `c84e4a6c95825647a96ae0a891cba30ed5273a693ee56e892fbef43e2f3cb51f`; tested861 source `f6234cf6bc0ca6135ca7739312d6f57a48c0280efe7e016636008d438bdeb745` / archive `0438ae10ea7d60d9ee87d2c8cd0e0ca72df54eec0725e22c5622b9ddc0f5e0d8`. Reviewer xác nhận tested→reviewed là2 result-only docs và scoped docs checks đủ; coverage43 file không đổi kế thừa R1. Đoạn bookkeeping này/INDEX thêm sau review không đổi implementation, không thuộc các inventory trên và không được trình bày là fresh application acceptance.

Local code-review blocker I1 được gỡ; overall BLOCKED/INCOMPLETE. B1 historical causal evidence thiếu, H1 OPEN, remote Ubuntu/Actions/transport Not run/Blocked, docs Failed19, standalone Shellcheck Not run và prior strict postcheck Failed/nonblocking giữ đúng trạng thái. Không có exception hoặc merge/deploy approval. Docker không có atomic compare-delete bảo vệ mọi actor tùy ý retag chính image của current session sau final inspect; review chỉ nhận protocol owned-resource đã giao, không claim adversarial-daemon guarantee. In-use/share denial được kiểm bằng model/source semantics; actual daemon proof bao gồm normal/collision/legacy retag, không giả đã thử mọi fault trên daemon thật.

Report/evidence R2 nằm trong ignored plan workspace cùng prefix task-8-review-r2; packages fix1-delta/whole-branch và raw C:/D:/Temp giữ nguyên. Không còn owned live resources/session theo reviewed scope. Next action và quyền activation tại INDEX; chưa commit/integrated/released.
