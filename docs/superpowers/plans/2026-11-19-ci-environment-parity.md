# Đồng nhất môi trường CI/local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans; chỉ dùng superpowers:subagent-driven-development khi người dùng chọn và cho phép delegation. Steps use checkbox (`- [ ]`) syntax for tracking. Không tự dispatch từ plan này.

**Goal:** Local tái hiện cùng gate của Actions trên source sạch/dirty đúng bytes, và CI thất bại luôn có thông tin an toàn đủ để tìm nguyên nhân.

**Architecture:** Giữ quality và release validation riêng, cùng gọi một runner và một command catalog. Worker Linux không đặc quyền chạy cùng image/user/source snapshot; real rehearsal giữ daemon UUID cách ly hiện có. Public evidence được tạo từ allowlist và xuất trước cleanup.

**Tech Stack:** Node24.22.1, pnpm12.15.0, Docker/Compose, Node test runner, GitHub Actions, PowerShell thin adapter trên Windows; không thêm framework/dependency để orchestration.

**Spec:** [Thiết kế đề xuất](../specs/2026-11-19-ci-environment-parity-design.md). Đọc cả spec và [task INDEX](../../tasks/MKW-CI-PARITY-001/INDEX.md). **Draft for review; chưa phải quyền implementation hoặc remote.**

## Global Constraints

- Base planning `c5f20e08d5f39e81186b9455ae037bba781e2273`; xác minh lại base/main trước execution. Bảo toàn dirty/untracked/ignored và worktree của task khác.
- Node24.22.1/pnpm12.15.0 trong worker; host Node hiện tại24.12 không đạt floor, không dùng để claim product PASS. Runtime hợp lệ ở execution dùng process PATH/task-local, không global switch/install.
- Execution code/tooling cần worktree riêng; một writer tuần tự, independent review snapshot cuối. Delegation chỉ sau quyền riêng; tối đa Sol/high, cấm Astra/nested children.
- Quality giữ fast tooling; release giữ release tooling và explicit real Docker/PostgreSQL gate. Không bỏ test, thêm skip, continue-on-error, tự retry mutation hoặc nới assertion để xanh.
- Tooling container không privileged/host Docker socket/production secret. Rehearsal privileged chỉ trong daemon UUID có ownership như hiện tại; storage prerequisite12GiB không hạ.
- Source bytes giữ UTF-8/Unicode/LF/CRLF thật; không dùng Git HEAD thay dirty source; không copy host node_modules/dist. Snapshot v1/evidence cũ không rewrite.
- Không đổi schema/nghiệp vụ/backup/deploy/rollback trust policy, settings hoặc production. Build base pin chỉ cùng version, không tự nâng dependency/lockfile.
- Local commit chỉ khi quyền execution bao phủ; push/merge/workflow dispatch/deploy không được cấp bởi yêu cầu lập plan. Remote parity gate có trạng thái riêng, không dùng local PASS thay thế.

## Review Focus

1. Root local che EACCES trên Actions user node → Task5/7 kiểm UID1000 và workspace writable/host read-only.
2. Source hoặc runtime trôi sau PASS → Task2/3/5 bind source+environment hashes, thử mutate live tree sau snapshot và cold cache.
3. Lỗi build bị gán cho scenario cũ hoặc mất vì export/cleanup → Task1/7 kiểm đúng phase/step, primary failure và lỗi thứ cấp.
4. Artifact chứa credential từ argv/log hoặc thiếu khi job fail → Task1/7 kiểm allowlist/canary, malformed report, safe fallback và workflow always.
5. Chuyển command vào wrapper khiến policy test xanh nhưng bỏ coverage/gate → Task4/5 kiểm resolved plan/inventory và needs thật; Task8 chạy real matrix trên commit cuối.

## Cấu trúc file và ownership

Các file **Create** dưới đây là đề xuất, chưa tồn tại. Tìm lại symbol trước mỗi edit, đọc đầy đủ function/dependency/test; line numbers của source không phải contract.

- Create `scripts/ci/evidence.mjs`: schema validator/projector cho public report; không acquire resource.
- Create `scripts/ci/collect-evidence.mjs`: CLI thu đúng public report của run hiện tại và xuất fallback an toàn.
- Create `scripts/ci/environment.mjs`, `scripts/ci/environment-lock.json`, `scripts/ci/Dockerfile.rehearsal`: lock reader/admission và đầu vào environment/rehearsal được pin, provenance trong task evidence.
- Create `scripts/ci/source-snapshot.mjs`: tách một implementation snapshot, share cho worker và engine.
- Create `scripts/ci/check-plan.mjs`, `scripts/ci/run-checks.mjs`: command catalog thuần và thực thi có admission/report trong worker.
- Modify `scripts/ci/parity.mjs`: outer CLI chuẩn bị snapshot, worker, report/cleanup và gọi existing engine; không thành owner assertions sản phẩm.
- Modify `scripts/ci/Dockerfile`: worker packages/user/runtime admission; giữ base/CLI digest đang có trừ change có bằng chứng.
- Modify `scripts/product/local-rehearsal-engine.mjs`, `local-rehearsal-driver.mjs`, `local-release-rehearsal.ps1`: diagnostics, snapshot handoff, locked setup, exit preservation; giữ ownership/lock/assertion semantics.
- Modify `tests/product-tooling/fixtures/deploy-account.mjs`: registry pin và regression fixture khi có bằng chứng; không production bypass.
- Modify `deploy/Dockerfile.api`, `deploy/Dockerfile.web`: cùng-version immutable FROM, không đổi build/application behavior.
- Modify `.github/workflows/ci.yml`, `release-validation.yml`: thin adapter gọi runner, upload safe reports; `main-release.yml` chỉ kiểm lại needs, không đổi normal release chain.
- Keep `.githooks/pre-commit`, `.githooks/ci-parity.sh` trừ consumer adaptation thật sự cần; không thêm pre-push hoặc đổi global hooksPath. `package.json` giữ entry `ci:parity` và các product commands hiện có; mở rộng lint/format scope tới `scripts/ci`.
- Tests mới theo từng task: `ci-evidence.test.mjs`, `ci-environment.test.mjs`, `ci-source-snapshot.test.mjs`, `ci-check-plan.test.mjs`, `ci-parity.test.mjs`, `ci-parity-failures.test.mjs`, `rehearsal-environment-regression.test.mjs` khi root case đã xác định.
- Existing test owners: `deploy-account-rehearsal.test.mjs`, `production-account-script.test.mjs`, `product-tooling-runner.test.mjs`, `workflow-policy.test.mjs`, `push-main-workflow-policy.test.mjs`, `simplified-release-policy.test.mjs`. Không đổi assertion chỉ để vừa source shape mới.
- Docs: `scripts/ci/README.md` mới, phần liên quan của `scripts/product/README.md`, `docs/agent/LOCAL_RUN.md`, release runbook/checklist, task INDEX/validation.

## Dependency và checkpoint

Task1 diagnostics trước. Task2 môi trường, Task3 snapshot và Task4 catalog có thể review riêng nhưng dùng một writer, không cần parallel agents. Task5 tích hợp2–4. Task6 sửa root case chỉ sau diagnostic/reproduction. Task7 fault matrix và Task8 final acceptance sau final source.

Mỗi task lưu command/cwd/runtime/exit, RED/GREEN khi đổi hành vi, scoped diff và SHA256 manifest vào `.agent-runs/MKW-CI-PARITY-001/<UUID>/`. Checkpoint Git dùng commit riêng nếu đã được quyền, stage exact owned paths; nếu chưa có quyền commit, freeze immutable snapshot. Không dùng hook bypass để tạo checkpoint.

### Task 1: Làm lỗi rehearsal có thể chẩn đoán và xuất evidence an toàn

**Files:** Create evidence/collector và `ci-evidence.test.mjs`; modify engine/driver, release-validation workflow và affected policy tests.

**Interfaces:**

- `projectPublicReport(privateFacts): CheckReport` chỉ chọn field trong spec; `validatePublicReport(value): CheckReport` reject unknown fields/invalid enums/types.
- `collectPublicReports({runId, evidenceRoot, outputRoot}): Promise<{files, status}>`; không glob-copy private evidence hoặc dump argv.
- `CheckReport.schemaVersion="1"`; result enum `Passed|Failed|Blocked|Not run`; primary `{phase,stepId,scenarioId,code,exitCode,signal}`, secondary errors chỉ fixed codes. Case/step từ catalog đã khai báo; không arbitrary dependency message.
- CLI collector được gọi dưới `if: always()` rồi upload artifact pin SHA, retention7 ngày. Public report chứa source/env hash khi đã có, null + explicit incomplete trước prerequisite.

- [ ] **1. Viết RED tests**: driver failure ở build API giữ `stepId=build-api-a`, không nhận snapshot scenario đã PASS; inner report thiếu/malformed vẫn nonzero + `REPORT_INCOMPLETE`; export và cleanup fail cùng lúc không thay primary; hostile message/SQL/password/cookie/private-key canaries không có trong JSON/stdout public. Test unknown JSON fields, path traversal, symlink và report từ UUID khác bị reject.
- [ ] **2. Chạy RED**: `node --test tests/product-tooling/ci-evidence.test.mjs`. Fixture subprocess tại boundary, không acquire Docker thật.
- [ ] **3. Implement projector/collector và gắn phase/step vào engine/driver**. Báo spawn failure/timeout/signal rõ; driver vẫn không serialize assertion actual/expected. In safe summary trước throw; không đưa raw driver/build log vào GitHub artifact.
- [ ] **4. Wire workflow collect/upload luôn chạy**, kể cả rehearsal fail; chỉ upload public allowlist. Collector xuất public files tới thư mục không hidden dưới `runner.temp`, không upload nguyên `.agent-runs`. Thiếu report phải tạo safe incomplete report, không thêm continue-on-error vào test. Pin upload action từ nguồn chính thức, ghi SHA provenance; giữ contents read. Hard runner termination có thể không còn collector, phải giữ Failed/Cancelled và ghi artifact unavailable đúng thực tế.
- [ ] **5. GREEN/regression**: chạy test mới, `deploy-account-rehearsal.test.mjs` mặc định và ba workflow policy owners. Chứng minh workflow job vẫn fail khi assertion fail, kể cả upload thành công; khi upload fail vẫn giữ primary trong summary.
- [ ] **6. Lưu baseline investigation**: nếu được quyền remote, chạy validation của **diagnostics-only snapshot** trên branch, không main, để bắt lỗi cũ trước khi pin môi trường. Nếu chưa được quyền, tái hiện local bằng same-source clean engine và giữ remote Not run; không tuyên bố đã tìm root cause.
- [ ] **7. Freeze checkpoint**: `fix(ci): expose safe rehearsal failure evidence`.

**Deliverable:** một failure đủ stage/scenario/code và public artifact transport có test; chưa claim lỗi assertion đã sửa.

### Task 2: Pin và kiểm tra các đầu vào môi trường

**Files:** environment.mjs/environment-lock/Dockerfile.rehearsal, worker Dockerfile, engine setup, registry fixture, hai product Dockerfiles; `ci-environment.test.mjs`.

**Interfaces:**

- Lock v1 có `platform="linux/amd64"`, Node24.22.1, pnpm12.15.0, image digests cho worker/CLI/dind/node-alpine/registry/API-build-base/Web-runtime-base, exact apk package versions và expected executable versions.
- `readEnvironmentLock(path): Promise<EnvironmentLock>`, `assertEnvironment(actual, lock): void` trong `scripts/ci/environment.mjs`; Task4/5 import lại, không duplicate parser.
- Dockerfiles có literal digest được đối chiếu lock; engine build vẫn gắn label/task UUID, không dùng mutable FROM làm fallback.

- [ ] **1. RED tests**: lock rejects tag-only/malformed digest/wrong platform/version; mismatch giữa lock và Dockerfile/setup fail; current mutable dind/node/registry/app FROM bị test phát hiện. Test pin không làm đổi Node/Nginx major/minor hiện hành hoặc PostgreSQL digest.
- [ ] **2. Resolve digest và package version thật** từ official registries/repositories hoặc immutable baseline đã có ownership. Lưu reference/platform/digest/version/provenance; không chép hash từ báo cáo không cùng input. Nếu phiên bản không tồn tại thì Blocked, không nâng tùy ý.
- [ ] **3. Thay setup dynamic bằng Dockerfile.rehearsal**, exact package install; giữ libstdc++/procps/ps behavior đã có. Pin FROM của product cùng version và registry fixture, không đổi release tags.
- [ ] **4. Build/probe worker và owned engine**: actual Node/pnpm/Docker/Compose/UID/package inventory đối chiếu lock. Prerequisite mismatch báo environment code trước test. Không reuse engine task cũ.
- [ ] **5. GREEN + Dockerfile packaging regression**; lưu actual image IDs/digests và environment-lock hash. Package mirror/network fail giữ riêng fetch failure, không đổi thành assertion.
- [ ] **6. Freeze checkpoint**: `build(ci): pin validation and rehearsal inputs`.

**Deliverable:** cùng input environment có định danh cố định và actual admission; chưa là bằng chứng real matrix PASS.

### Task 3: Một source snapshot cho worker và rehearsal

**Files:** source-snapshot mới; engine re-export/optional handoff; `ci-source-snapshot.test.mjs`, existing rehearsal snapshot tests.

**Interfaces:**

- `createSourceSnapshot(root, evidenceRoot): Promise<SourceSnapshotV2>`; re-export cùng tên từ engine cho caller cũ.
- `verifySourceSnapshot(snapshotRoot): Promise<SourceSnapshotV2>` kiểm sorted inventory/bytes/type/mode/archive/no-clobber/containment, không acquire daemon.
- `runOwnedRehearsal({taskId,evidencePath,sourceSnapshot?}): Promise<void>` nhận một verified retained snapshot; không truyền thì capture như cũ. `sourceSnapshot` là `{root,manifest}` do cùng run sở hữu, không arbitrary external tar.
- V2 files `{path,size,sha256,mode}`; tracked mode100644/100755 theo Git, untracked0644; source hash tính cả mode. Mỗi tar có archive hash riêng; **không bắt tar header hash của hai OS tự tạo phải giống** nếu inventory bytes/mode bằng nhau.

- [ ] **1. RED**: dirty Unicode và tracked deletion đúng; untracked không ignored có mặt; `.env`/deploy shared/dependency/dist/evidence bị loại. Mutate live file sau capture không đổi retained tar. Symlink/path escape/duplicate member và member đổi mode/hash bị reject.
- [ ] **2. Test portability**: Git executable mode giống nhau trên fixture Windows/Linux; file có spaces/Unicode; LF/CRLF khác phải tạo source hash khác. Không normalize `.ps1` hoặc sửa workspace để hash khớp.
- [ ] **3. Tách helper từ engine**, không viết snapshot route thứ hai. Tar tạo từ retained copy; verify assembled archive/extracted worker, không chỉ JSON. Ghi rõ unsupported untracked executable cần interpreter invocation, không tự sửa host mode.
- [ ] **4. Update driver kiểm manifest v2/mode và engine optional snapshot**; v1 evidence giữ nguyên bytes, không migrate historical file. Old caller test vẫn hoạt động khi không truyền snapshot.
- [ ] **5. GREEN**: snapshot suite + rehearsal default tests trên cả Windows và Linux worker. Check source/index/ignored dependency tree không bị sửa bởi test.
- [ ] **6. Freeze checkpoint**: `refactor(ci): share verified source snapshots`.

**Deliverable:** mọi stage trong `--all` có thể dùng một immutable input; secret/generated source không lọt vào tar.

### Task 4: Một catalog check và thực thi trong worker

**Files:** check-plan/run-checks, `package.json` lint/format scopes, `ci-check-plan.test.mjs`, existing tooling runner/inventory tests. Dùng lại environment.mjs của Task2.

**Interfaces:**

- `getCheckPlan(profile: "quality"|"release-tooling"): CheckStep[]`; step `{id,executable,args}` với IDs cố định.
- Quality ordered IDs: `lint,format,typecheck,build,tooling-fast,sandbox,web,api,contract,boundaries`; release-tooling chỉ `tooling-release`.
- Commands đúng spec; worker setup `pnpm install --frozen-lockfile` riêng, vẫn user node; catalog không chứa Docker acquisition, registry login hoặc production transport.
- `runChecks({profile,workspace,reportRoot,runId}): Promise<number>` chỉ trong admitted worker; CLI `--profile ... --list` không execute command; worker failures giữ code/nonzero.

- [ ] **1. RED**: check order/argv exact, web maxWorkers2; duplicate ID/unknown profile/options fail64; injected child failure dừng bước sau và giữ exit; `--list` không spawn. Dùng spawn adapter fixture thực thi process để kiểm propagation, không chỉ so string source.
- [ ] **2. Implement pure catalog và worker executor**, admission Linux/platform/runtime/UID1000/workspace/source hash. Build trước sandbox/API/contract như luồng hiện có. Bổ sung `scripts/ci` vào product lint/format scope để code mới thật sự được kiểm; không npm install hoặc regenerate lock.
- [ ] **3. Inventory regression**: union fast+release bằng full, no overlap/no missing; file mới chưa classify vẫn ở fast. Default rehearsal test discovery vẫn không acquire daemon.
- [ ] **4. GREEN**: `node --test tests/product-tooling/ci-check-plan.test.mjs tests/product-tooling/product-tooling-runner.test.mjs`; chạy worker quality và release-tooling thật trên disposable workspace.
- [ ] **5. Freeze checkpoint**: `refactor(ci): centralize validation check plans`.

**Deliverable:** một execution plan có thể được cả local/Actions gọi, không giảm coverage.

### Task 5: Runner chuẩn và workflow adapter dùng chung

**Files:** parity.mjs, two validation workflows, policy tests, `ci-parity.test.mjs`; update repository hook/help consumer nếu scan chứng minh cần. Giữ main-release needs.

**Interfaces:**

- `runParity({mode,repoRoot,evidenceRoot,runId}): Promise<number>`; mode `quality|release|all|tooling` (no flag→tooling, tương thích full tooling cũ).
- `--quality`: một quality worker. `--release`: release-tooling worker rồi owned engine. `--all`: quality rồi release cùng snapshot. `--list`: resolved ordered plan và environment input references, không Docker/DB.
- Worker nhận snapshot read-only vào input, copy/extract trong Linux volume/private filesystem; root prepare/chown, sau đó UID/GID1000 install/check. Host chỉ nhận public report qua owned output; không writable bind source/store/dist.
- Local và Actions gọi cùng `node scripts/ci/parity.mjs` với mode tương ứng. Outer scripts chỉ dùng Node built-ins, không cần host workspace deps để bootstrap.

- [ ] **1. RED**: parse options mutually exclusive/unknown; no flag giữ quality+release tooling và `rehearsal=Not run`; all dùng cùng source hash; quality không engine; release không bỏ rehearsal sau tooling PASS. Test path Windows có space/dấu và signal/exit propagation.
- [ ] **2. Implement outer lifecycle**, actual Docker/Linux/context preflight, snapshot/worker creation/export/finally cleanup. Không tự switch Docker context. Expected client executable phát hiện PATH trước prepend stub; kiểm `/usr/bin` và `/usr/local/bin`.
- [ ] **3. Wire CI quality bằng shared runner**, runner `ubuntu-24.04` tường minh; output quality_sha/status vẫn đúng GitHub SHA/job status. Node setup24.22.1 chỉ cho bootstrap; product tests không chạy native host.
- [ ] **4. Wire release-validation bằng cùng runner `--release`**, collect/upload Task1 dùng output path đúng run. Reusable/manual triggers, read-only permissions, protected production boundary giữ nguyên. Không thêm push producer.
- [ ] **5. Update policy tests** đọc YAML + follow resolved catalog; assert entrypoint/modes, needs, full inventory, no socket/transport/write permission. Không xóa security check vì command đã chuyển vào wrapper. Fixture subprocess chạy workflow entrypoint với boundary doubles để bắt argument/exit sai.
- [ ] **6. Verify hooks/consumers**: hook không flag tiếp tục full tooling, help nói rõ không real rehearsal; không đổi global config và không thêm skip. Document `--all` là pre-push release preflight. Không thêm receipt cache để bỏ qua chạy test.
- [ ] **7. GREEN**: new runner tests + existing workflow/inventory suites; lint/format/typecheck/build trong worker. Chạy một worker với known canary host node_modules/dist và chứng minh không tiêu thụ/ghi chúng.
- [ ] **8. Freeze checkpoint**: `fix(ci): run local and Actions through the same environment`.

**Deliverable:** hai adapter có chung execution path và source/environment identity, giữ release gate.

### Task 6: Tái hiện và sửa đúng root cause của rehearsal đang fail

**Files:** task-local root-cause record và `rehearsal-environment-regression.test.mjs`; sửa owner fixture/harness do evidence xác định. Không có preselected product behavior fix.

**Interfaces:** diagnostics Task1, lock Task2, snapshot Task3, shared runner Task5. `root-cause.md` phải chứa source/environment hashes, failing step/scenario/code, minimal repro command, hypothesis, one-variable experiment, before/after và exact file owner.

- [ ] **1. Discovery**: chạy clean `--release`, đọc first failure safe report; dùng private local evidence đúng owner khi cần. Nếu root chỉ thấy trên GitHub, cần branch validation được phép; giữ gate Blocked nếu thiếu evidence, không suy từ local PASS.
- [ ] **2. Cố định case**: tạo smallest regression fixture từ failure thật trước sửa. Task6 triển khai chỉ mở sau khi lưu test code/assertions/expected nonzero cụ thể trong root-cause record; tên scenario và nguyên nhân không thể được đoán từ `REHEARSAL_ASSERTION`. Đây là gate discovery có đầu ra bắt buộc, không placeholder để implementer tùy sửa.
- [ ] **3. Xác nhận RED** trên failing environment/source tương ứng. Nếu pin/runner đã làm lỗi biến mất, tái dựng old/new input trong disposable owned environment, thay đúng một biến để giải thích; không coi “không còn fail” là root cause record.
- [ ] **4. Sửa tại owner**: PATH/permission tại fixture; missing dependency/build tại environment; readiness race tại harness bằng actual readiness/deadline; snapshot discrepancy tại snapshot helper. Nếu ngoài các owner đã duyệt hoặc cần đổi production runtime/nghiệp vụ, ghi amendment scope và regression trước khi mở phần đó.
- [ ] **5. GREEN** minimal repro + affected existing suites, rồi full real rehearsal. Giữ migration/account/rollback/persistence assertions cũ; không nới expected code/skip hoặc tự retry mutation.
- [ ] **6. Freeze checkpoint** với commit message nêu nguyên nhân thật, không “fix flaky CI” chung chung.

**Deliverable:** lỗi hiện tại có chứng minh nguyên nhân và regression; Task6 không complete chỉ vì runner mới PASS một lần.

### Task 7: Kiểm thử các failure môi trường và lifecycle quan trọng

**Files:** `ci-parity-failures.test.mjs`, fixtures mới nhỏ theo trách nhiệm; affected evidence/snapshot/runner tests. Không đưa fault flag vào production.

- [ ] **1. Fault fixtures RED→GREEN**: non-root EACCES; missing Docker/Compose; wrong platform/runtime; disk dưới12GiB; registry fetch failure; child timeout/signal; corrupt/missing inner report; export fail; cleanup fail; interrupted run. Mỗi case assert primary code/exit, step đúng, nonzero, no later mutation và secondary codes không che primary.
- [ ] **2. Source/resource probes**: invalid tar/symlink/mode, host source đổi sau capture, two concurrent runs UUID khác nhau, sai owner/ID/label/mount không được cleanup, output path đã tồn tại không overwrite.
- [ ] **3. Canary scan public evidence/stdout** trên cả success và failure; thử malicious report field chứa env/argv/secret, collector phải reject thay vì passthrough. Private files/build logs/source tar không nằm trong upload file list.
- [ ] **4. Real Docker boundary probe** trong own daemon: xác minh UID1000, Linux filesystem, read-only host source và zero host dependency inheritance; unit doubles không thay probe thật. Missing resource/runtime ghi Blocked, không thêm skip để hợp thức.
- [ ] **5. GREEN** focused failures + affected full fast/release tooling; Bash syntax cho các shell blocks thay đổi, PowerShell invocation/exit test trên Windows. Không lặp full matrix nếu chưa có thay đổi cần thiết; giữ real final acceptance cho Task8.
- [ ] **6. Freeze checkpoint**: `test(ci): cover environment and failure boundaries`.

**Deliverable:** known parity/failure classes có behavioral regression, không chỉ YAML regex.

### Task 8: Kiểm chứng sạch, review và bàn giao

**Files:** scripts/ci README, LOCAL_RUN, product tooling README, runbook/checklist và task validation/INDEX; không sửa báo cáo lịch sử để giả đã integrated.

- [ ] **1. Chạy static/focused gates trên source cuối** trong pinned worker: lint/format/typecheck/build/contract/boundaries, full fast+release tooling, workflow syntax Actionlint/Bash, diff-check. Giữ docs Failed baseline nếu còn19 links; ghi nếu số lỗi thực tế khác.
- [ ] **2. Cold local full preflight**: checkout/worktree task-owned sạch, không node_modules/dist/store và không validation-result cache; chạy `pnpm run ci:parity -- --all` bằng runtime hợp lệ. Không xóa cache hoặc tài nguyên global để tạo cold condition; dùng fresh disposable namespace. Record source inventory+lock hash, actual tool/image IDs, completed scenario IDs, duration và cleanup.
- [ ] **3. Same-commit Ubuntu validation** khi được phép remote: branch/PR quality + reusable/manual release validation, không main push/deploy. Đối chiếu source inventory (GitHub PR merge SHA có thể khác), lock hash, command IDs/versions/UID và acceptance scenario set; không chỉ so tổng test. Kiểm artifact tải được, validate JSON và không private canary.
- [ ] **4. Một lượt lặp kiểm repeatability** với UUID/resource mới trên source không đổi; không retry loop đến khi xanh. Nếu fail phải quay lại root-cause investigation; freeze mới khi code đổi, không tái dùng evidence cũ thành current.
- [ ] **5. Fresh independent review** whole diff/snapshot cuối và evidence: command routing, secret export, cleanup, snapshot/lock, CI permission/needs, unknown root regression. Nếu chưa có reviewer/dispatch permission, ghi gate Blocked; không tự gọi self-review là độc lập. Reviewer runtime catalog live, tối đa Sol/high, cấm Astra.
- [ ] **6. Viết docs chính xác**: quick native checks; quality parity; legacy no-flag tooling coverage; `--all` trước push; cách đọc phase/step/scenario/public artifact; prerequisite/disk/fetch vs assertion; retained resources và owner cleanup; remote/local verified khác nhau.
- [ ] **7. Handoff**: implementation/review/integration/release status riêng, outstanding findings, exact base/tip/source hashes, commands, timing và artifact links. Không push/merge/main-release trong task local. Chuẩn bị diff review được trước khi xin quyền activation riêng.

**Deliverable:** local acceptance có bằng chứng và remote parity được Verified hoặc ghi đúng Not run/Blocked; không claim fix triệt để đã deployed khi chưa có remote gate.

## Tiêu chí hoàn tất

- [ ] Current rehearsal failure có root cause/RED/GREEN và full final-source real acceptance.
- [ ] Local/Actions cùng check plan, source semantics, runtime/user/filesystem contract; không dựa host artifact.
- [ ] Fast+release coverage đầy đủ; real release gate vẫn bắt buộc trước build/backup/deploy.
- [ ] Failure summary và safe artifact hoạt động trên assertion/timeout/setup/export/cleanup faults; secret scan đạt.
- [ ] Cold local + same-commit Ubuntu + one repeatability run đạt; remote chưa chạy thì phần parity chưa complete.
- [ ] Independent review snapshot cuối đạt; docs/limits/resource handoff đúng trạng thái.

## Phương pháp thực hiện đề xuất

Khuyến nghị native execution một writer, task-by-task, independent whole-branch review cuối: interfaces giữa snapshot/runner/evidence dùng chung nên nhiều writer tăng conflict và context cost. Có thể review thêm checkpoint Task1 diagnostics trước tích hợp. Đây chỉ là đề xuất; người dùng chưa chọn execution method hoặc cấp quyền child/remote cho task này.

Ước lượng độ lớn:8 work packages, trong đó Task6 phụ thuộc failure evidence thực tế và Task8 có gate remote riêng; không ấn định thời gian hoàn tất trước khi biết nguyên nhân rehearsal. Không cần viết lại release coordinator hoặc hạ tiêu chuẩn test.
