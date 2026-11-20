# Thiết kế: đồng nhất kiểm tra local và GitHub Actions

Ngày 19/11/2026. Task [MKW-CI-PARITY-001](../../tasks/MKW-CI-PARITY-001/INDEX.md). **Đề xuất để review; chưa duyệt implementation.** Người dùng yêu cầu trực tiếp một plan chi tiết, vì vậy lượt này chuẩn bị cả thiết kế và plan để review cùng nhau; không dừng giữa chừng để xin phép viết tài liệu, không coi yêu cầu lập plan là quyền triển khai.

## 1. Kết quả cần đạt và giới hạn

Người vận hành chạy một lệnh trước push để kiểm tra cùng các gate mà Actions sẽ chạy trên đúng source. Khi thất bại, báo rõ lỗi môi trường/prerequisite, lỗi assertion hay lỗi hạ tầng và chỉ ra phase/step/scenario, kèm artifact an toàn. Local PASS không còn dựa vào root, host node_modules/dist hoặc binary tình cờ có sẵn.

Không cam kết kernel Docker Desktop và runner GitHub giống hệt, hoặc mạng/registry không bao giờ lỗi. Cam kết các đầu vào kiểm soát được có cùng contract, khác biệt còn lại được ghi nhận, failure có thể điều tra và không bị biến thành PASS bằng skip/retry.

Trong scope: validation và cách chuẩn bị/chạy test. Không thay contract sản phẩm, migration, backup/restore/deploy trust/lock/receipt policy. Không thêm scheduler, self-hosted runner, service mới hoặc registry publication để giải quyết parity.

## 2. Bằng chứng và điều chưa biết

Base `c5f20e08d5f39e81186b9455ae037bba781e2273`.

- `scripts/ci/parity.mjs`: bind workspace Windows thành `/workspace`, anonymous volumes cho node_modules, root trong image, danh sách lệnh riêng và full tooling. Không chạy explicit real rehearsal.
- `.github/workflows/ci.yml`: host `ubuntu-latest`, Node24.22.1, fast tooling; không cùng execution path với parity.
- `.github/workflows/release-validation.yml`: Ubuntu24.04, copy source bằng tar vào container, chạy tooling bằng user `node`, sau đó rehearsal trên host. Không upload rehearsal evidence.
- `scripts/product/local-rehearsal-engine.mjs`: outer daemon lifecycle dùng UUID và ownership; pull tag mutable `docker:29-dind`/`node:24.22.1-alpine` rồi resolve digest từng run. Dynamic setup cài apk không pin version. `driver-output.log`/`inner/result.json` giữ lỗi nhưng caller chỉ nhận lỗi tổng quát.
- `local-rehearsal-driver.mjs`: có failedScenario, command count và diagnostic vocabulary; build/setup ngoài `scenario()` có thể bị gán tên scenario trước đó. `commands.json` có argv nên không mặc nhiên an toàn để public.
- `deploy/Dockerfile.api`/`web`: Node/Nginx FROM còn dùng tag; registry fixture dùng `registry:2`. Digest cuối được ghi lại nhưng đầu vào giữa hai lần chạy chưa cố định.
- Run44433939245: quality PASS, release tooling528 PASS/0 FAIL, rehearsal FAIL; artifact count0. Chưa biết assertion gốc. Không coi Node deprecation warning hoặc những negative-case log có chữ FAIL là nguyên nhân job fail.

Các mô tả “chưa integrated” trong báo cáo 18/11 là lịch sử; split hiện có trên main. Kế hoạch kế thừa split, không xây lại từ đầu.

## 3. Phương án

1. **Khuyến nghị: runner dùng chung, môi trường Linux được pin, rehearsal giữ daemon riêng hiện có.** Local và Actions chỉ là adapter gọi runner. Kiểm soát được user/filesystem/toolchain mà không mở quyền production hoặc host socket vào test container.
2. Chỉ sửa từng fixture và bổ sung workflow YAML: ít thay đổi ban đầu nhưng hai danh sách lệnh và điều kiện chạy tiếp tục lệch; không đáp ứng mục tiêu triệt để.
3. Self-hosted runner/VM giống máy local: phát sinh vận hành, dữ liệu/cache chia sẻ và vẫn có thể che lỗi checkout sạch; không cần thiết cho phạm vi này.

Không gom quality và real rehearsal vào một container có host Docker socket. Tooling container không đặc quyền; daemon rehearsal mới là nơi được phép privileged theo ownership hiện có.

## 4. Contract các lệnh đề xuất

Các lệnh mới/flag dưới đây **chưa tồn tại**, sẽ được thêm trong execution:

```bash
pnpm run ci:parity -- --quality
pnpm run ci:parity -- --release
pnpm run ci:parity -- --all
```

- `--quality`: lint → format → typecheck → build → fast tooling → sandbox → web (`--maxWorkers=2`) → API → contract → boundaries.
- `--release`: release tooling trong worker không đặc quyền → explicit real Docker/PostgreSQL rehearsal từ cùng snapshot.
- `--all`: quality → release; lỗi bước nào dừng bước sau nhưng luôn thử xuất public report và cleanup đúng owner.
- Không flag: tương thích coverage parity cũ, chạy quality + release tooling, **không** tự thêm real rehearsal vào pre-commit. Summary phải ghi `rehearsal=Not run`, không gọi đây là full release preflight.
- Flag lạ hoặc nhiều mode cùng lúc: exit64 trước Docker acquisition. `--list` chỉ in execution plan, không acquire Docker/DB.

`product:check` tiếp tục là kiểm tra native phục vụ phát triển; không được ghi là bằng chứng parity. `product:test:tooling` giữ full suite, `product:test:deploy-account` giữ explicit real gate cho người chẩn đoán. Không tự thay đổi hook policy hoặc thêm pre-push hook: hook hiện có gọi parity không flag và giữ coverage cũ; trước push production dùng `--all`. Nếu sau này muốn bắt buộc ở hook cần quyết định riêng vì tác động thời gian mọi lần push.

## 5. Một nguồn lệnh và inventory

`scripts/ci/check-plan.mjs` sở hữu `getCheckPlan(profile)` với profile `quality | release-tooling`, trả danh sách `{id, executable, args}`. `scripts/ci/environment.mjs` sở hữu đọc lock và admission runtime. `scripts/ci/run-checks.mjs` chỉ thực thi plan trong worker sau admission. Workflow không chép danh sách pnpm commands nữa; wrapper gọi cùng `scripts/ci/parity.mjs`.

Giữ `run-product-tooling.mjs` là owner phân nhóm fast/release/full; kiểm union đầy đủ, không overlap, test mới chưa phân loại vẫn ở fast. Plan mới không tự chọn skip hoặc dùng grep source làm bằng chứng hành vi. Policy tests đọc YAML và resolved command plan để kiểm wire/dependency, không bắt từng command phải xuất hiện inline trong YAML.

Mở rộng `product:lint` và `product:format:check` để bao phủ `scripts/ci`; hiện các lệnh này chưa bao phủ runner CI. Workflow thay đổi còn có Actionlint/Bash/format check riêng; không gọi product lint hiện tại là đã kiểm code CI mới.

## 6. Source snapshot và filesystem

Tách implementation snapshot hiện có thành `scripts/ci/source-snapshot.mjs`; engine re-export `createSourceSnapshot` để bảo toàn import/test consumer. Không tạo hai cách snapshot.

- Capture tracked + untracked không ignored, dirty bytes và tracked deletions hiện tại; giữ các exclusions secret/generated/evidence đã có. Copy retained source rồi hash/tar retained copy; không hash xong lại tar live tree.
- Manifest internal v2: sorted files `{path,size,sha256,mode}`, base SHA, source hash và archive hash. Mode tracked lấy `100644/100755` từ Git index; untracked regular files dùng0644 và interpreter invocation tường minh. Không sửa mode hoặc line endings của workspace gốc.
- Không normalize nội dung LF/CRLF hoặc Unicode; `.gitattributes` là nguồn chính sách checkout. Cùng source hash mới là cùng input. Hai checkout khác byte phải được báo khác, không âm thầm sửa rồi gọi tương đương.
- Reject symlink, path escape, duplicate/unsafe archive entry; verify hash/type/mode ở retained copy, tar và worker extraction. Manifest v1 cũ là historical evidence, không rewrite; snapshot mới dùng v2 và cập nhật các consumer cùng lúc.
- Mọi check chạy trên bản copy trong filesystem Linux, `/workspace` user `node` UID/GID1000; source host không writable mount. Dependency/dist/store được tạo riêng trong worker, không copy hoặc mount từ Windows.
- `--all` capture một lần; worker quality/release và engine dùng cùng snapshot. `runOwnedRehearsal({taskId,evidencePath,sourceSnapshot})` nhận snapshot optional đã verify; caller cũ không truyền vẫn tự capture. Không tin manifest/path do caller đưa mà chưa xác minh bytes/containment.
- Snapshot không thay compiler input bằng Git HEAD khi đang kiểm dirty workspace. Remote checkout SHA là giá trị GitHub cung cấp; PR merge SHA khác head SHA phải được ghi thật, không so sánh nhầm.

## 7. Runtime và tài nguyên

- Worker giữ Node24.22.1/pnpm12.15.0, linux/amd64, base Node bookworm và Docker CLI/Compose từ digest hiện có. Root chỉ làm prepare/chown; install và mọi check chạy bằng user `node`.
- Chốt input tại `scripts/ci/environment-lock.json`: image reference với digest thật, expected runtime versions/platform, exact apk packages của setup engine. Không điền digest giả trong plan; task pin phải resolve/verify từ registry chính thức và ghi provenance trước khi chốt file.
- Thay dynamic engine setup bằng `scripts/ci/Dockerfile.rehearsal`, pin dind/Node Alpine base cùng version hiện có; khóa package install. Ghi package inventory hash và actual binary versions; build phải fail rõ nếu package pin không còn khả dụng. Không fallback tag latest hoặc tự upgrade.
- Pin cùng-version FROM của API/Web và registry fixture; giữ PostgreSQL digest đã có. Build ứng dụng không đổi logic, tag release hay trust policy. Nếu phiên bản hiện hành không còn resolve được, dừng quyết định thay version, không tự nâng.
- Không claim hoàn toàn hermetic: registry/network/package mirror vẫn là dependency bên ngoài; phân loại rõ lỗi fetch với lỗi assertion. Cache chỉ là tối ưu; không có cache kết quả xanh. Acceptance bắt buộc có cold run.
- Runner outer dùng Docker context hiện tại sau khi ghi nhận Linux daemon identity; không switch context hoặc xóa tài nguyên global. Docker Desktop kernel/storage khác host Ubuntu vẫn được ghi lại trong private/public environment facts phù hợp.
- UUID labels cho từng worker/tag/volume. Cleanup chỉ resources đã inspect đúng ID/name/label/mount/owner. Rehearsal giữ inner daemon không mount host socket hoặc host secrets. Storage gate12GiB và ownership/no-clobber hiện có được giữ.
- Chưa tự đổi chính sách retained failed engine: export trước, ghi retained/private state đúng thực tế. Trên ephemeral CI không hứa engine còn sau job; public report phải tồn tại độc lập.

## 8. Diagnostics và public evidence

Tách private evidence khỏi `public/`. Public là JSON tạo mới từ allowlist schema, không copy raw file hoặc “redact theo regex rồi upload tất cả”.

`CheckReport` public v1 có: run UUID, source/base hashes, environment-lock hash, profile, step ID, scenario ID đã khai báo hoặc null, result (`Passed | Failed | Blocked | Not run`), code trong vocabulary cố định, exit code/signal, duration, counts, actual runtime versions/platform/UID. Không arbitrary message/actual/expected/stack/path/argv/env.

- Outer và driver đặt phase/step trước setup, build A/B API/Web, registry, backup, account, deploy/recovery. Không gán lỗi image build cho scenario snapshot đã PASS.
- Trước khi throw lỗi tổng quát, outer đọc report inner đã validate hoặc emit fallback report có `innerReportUnavailable=true`; in một dòng safe summary + relative public evidence path.
- Lỗi process spawn/timeout/signal được phân biệt; timeout có thể do readiness/external capacity, không nâng timeout hoặc retry mutation chỉ để xanh. Readiness dùng polling có deadline theo trạng thái thực.
- Primary failure luôn thắng cleanup/export failure; các lỗi thứ cấp là mảng code riêng, không ghi đè result. Không có terminal hợp lệ thì fail/incomplete, không manufacture PASS từ count.
- Writer tạo report trước các acquisition có thể thất bại. Hard kill trước report vẫn làm workflow fail; collector xuất fallback `REPORT_INCOMPLETE`, không suy thành assertion thành công.
- Workflow `if: always()` collect → upload **chỉ public files đã schema-validate** với tên chứa run ID/attempt/job; retention7 ngày, action pin SHA được xác minh. Collector xuất bản copy công khai vào thư mục không hidden dưới `runner.temp`, tránh default hidden-file exclusion của upload action; không bật include-hidden-files cho cả `.agent-runs`. Hard termination/mất runner có thể không chạy được collector/upload; job đó vẫn Failed/Cancelled và artifact availability phải ghi đúng, không hứa mọi hard kill đều có artifact.
- Không upload source tar/copy, build raw logs, commands.json, Docker inspect toàn bộ, database dump/volume, TLS private key, env, password/hash/cookie/session. Secret canary tests chứng minh mọi failure path cũng giữ điều này.
- Upload thiếu/lỗi không làm check xanh; summary phân biệt lỗi gate và lỗi artifact. Local giữ private evidence để điều tra theo owner.

## 9. Tìm và sửa failure hiện tại

Diagnostics và artifact transport phải xong trước khi chọn bản sửa `REHEARSAL_ASSERTION`.

Sau khi có cùng-source run: ghi step/scenario/diagnostic đầu tiên, prerequisite/runtime facts và nguyên nhân; chứng minh bằng một thay đổi duy nhất trong disposable fixture. Nếu lỗi fixture/path/permission sửa tại owner fixture. Nếu lỗi setup/readiness/resource sửa tại harness với readiness/deadline thích hợp. Nếu là regression runtime sản phẩm thì ghi amendment scope/acceptance trước khi sửa file production ngoài FROM pin đã nêu.

Không đặt trước kết luận đây là root/non-root, thiếu package, Node warning hoặc mạng. Task này chưa có bytes fix đúng cho assertion chưa biết; discovery có deliverable riêng, implementation fix chỉ mở khi regression test đã xác định.

## 10. Acceptance và rollout

1. Cùng profile từ local và Actions resolve cùng ordered check plan, image/version/user/platform và source inventory cho cùng checkout.
2. Windows Docker Desktop và Ubuntu runner chạy sạch, không host node_modules/dist; case Docker ở `/usr/bin` và `/usr/local/bin`, đường dẫn workspace có khoảng trắng/Unicode được kiểm.
3. Full tooling coverage giữ nguyên; PR quality không chạy real rehearsal; release vẫn bắt buộc cả quality và release validation trước build/backup.
4. Mọi lỗi thử nghiệm từ admission đến assertion/export/cleanup có nonzero và safe summary/public report; lỗi gốc không mất và canary không xuất hiện.
5. Failure hiện tại có root cause record, RED/GREEN regression và full real matrix trên source cuối. So sánh scenario IDs, không chỉ hard-code con số34 hoặc tổng test.
6. Một cold full run local và một full run Ubuntu trên cùng commit đạt; thêm một lượt lặp lại với UUID mới để kiểm idempotence/cleanup, không phải retry che flake. Không sửa source giữa các lượt và gọi chung là cùng acceptance.
7. Independent review snapshot cuối, workflow syntax, affected tests/static checks và docs đúng scope. Lỗi docs baseline19 giữ Failed nếu còn tồn tại.

Local implementation có thể bàn giao khi gate local đạt, nhưng remote parity vẫn Not run cho đến khi được phép đưa branch lên GitHub và chạy validation không deploy. Không push main để thử; main push có thể mở backup/deploy. Thử trên branch/PR + reusable/manual validation có quyền contents read, không production environment/SSH/registry write. Không tự dispatch workflow trong lượt lập plan.

## 11. Handoff

Một writer tuần tự dùng [implementation plan](../plans/2026-11-19-ci-environment-parity.md); review độc lập theo quality gates, quyền dispatch không kế thừa từ task cũ. Khi execute cần isolated worktree, base xác định, process-local runtime hợp lệ và resource owner mới. Tài liệu kế hoạch có thể tự review; chưa có claim code PASS hoặc remote Verified.
