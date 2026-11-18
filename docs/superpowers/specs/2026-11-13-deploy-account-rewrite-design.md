# Đặc tả: viết lại luồng deploy và quản lý tài khoản production

Trạng thái 15/11/2026: bản hợp nhất sau research và audit, chờ review written spec. Người dùng đã duyệt tiếp tục bước sau phần giải thích workflow. Bản hợp nhất này chưa tồn tại lúc approval đó nên chưa tự coi là written-spec approval hoặc mở gate implementation.

Base: `0e0e97be769f7186f9ac73cca0dd1392ecfe9a0f`. Writer inline trong worktree `rewrite-deploy-account`. Nguồn: [task brief](../../tasks/MKW-DEPLOY-ACCOUNT-001/INDEX.md), [research](../../tasks/MKW-DEPLOY-ACCOUNT-001/research.md), [audit](../../tasks/MKW-DEPLOY-ACCOUNT-001/workflow-audit.md).

## 1. Kết quả và phạm vi

Từ commit đã kiểm tra, hệ thống build/vận chuyển đúng image, backup có evidence restore, deploy chạy đúng service/image và chỉ báo thành công sau kiểm chứng. Operator quản lý account bằng code thuộc API release, dùng cùng domain/password policy; password không xuất hiện trong argv/environment/log.

Scope: normal release, manual deploy/rollback dùng chung publish/receipt, account shell/CLI/domain operation cần thiết, Compose validation, Docker rehearsal và tài liệu vận hành. Khi lập plan phải đọc consumer legacy bị ảnh hưởng; không mở rộng thành viết lại toàn bộ legacy coordinator. Nếu không giữ tương thích được thì ghi finding trước code, không âm thầm đổi contract.

Không thêm role, admin API, account tự tạo mỗi deploy, Kubernetes, blue-green, secret manager mới, restore/down-migration tự động hoặc lời hứa zero downtime. Không push/merge/deploy, SSH/VPS, GitHub settings/secrets/dispatch hay dữ liệu nhân sự thật.

## 2. Luồng và trách nhiệm

`push main → quality → [build || backup] → deploy → verify`; `release-status` dùng `always()` để tổng hợp cả khi job thất bại. Giữ concurrency và stale-main check; chúng không thay lock server.

- CI sở hữu checks hiện hành và regression tests mới.
- Build sở hữu API/web image immutable digest và artifact chứa manifest, metadata, checksum. Image là runtime; artifact mô tả release.
- Backup giữ snapshot/dump, restore thử, mã hóa, checksum, freshness và target identity. Không đổi quản lý secret hiện hành trong task này.
- Deploy xác minh producer tuple, SHA, provenance/attestation theo policy hiện hành, backup và bundle trước mutation; pull image, forward migration rồi apply app.
- Verify kiểm actual container identity, health, migration status và HTTP smoke. Receipt không thay runtime check.
- Account là lệnh operator riêng sau deploy.

## 3. Account thuộc API image

### 3.1 Ownership và thực thi

Thay upload module tạm bằng `apps/api/src/ops/account-cli.ts`, build thành `dist/ops/account-cli.js` và ship cùng API image. Không eval, base64 source, data URL, upload source hoặc ghi module tạm vào container. Không phụ thuộc quyền ghi `/app` của user `node`.

Shell `manage-production-account.sh` giữ giao diện operator và target preflight, chạy bằng container ID đã xác minh:

```sh
docker exec -i -w /app "$container_id" node dist/ops/account-cli.js
```

`docker exec` không có `-T`. Không tự fallback sang host Node/container one-off nếu API không chạy. Chỉ bỏ module host cũ sau khi cập nhật đủ consumer/bundle/test/docs. Sandbox `auth-cli.mjs` giữ allowlist/enrollment guard riêng.

### 3.2 Identity và lock

Resolve đường dẫn thật của script để lấy release directory SHA/manifest; `current` chỉ là đường dẫn tiện dụng, không là nguồn identity. Không hard-code duy nhất `/home/deploy/mkw`. Lấy cùng deploy lock rồi đọc lại release/config/container identity để tránh preflight cũ.

Chỉ chạy khi release có receipt deploy success đúng SHA/digest, manifest hợp lệ, project đúng target và đúng một API container running/healthy. Kiểm label project/service, expected digest và actual image ID theo verifier hiện hành; không chỉ so tag. Giữ lock đến CLI kết thúc; exec bằng ID đã pin, không chọn lại service khi mutation.

Lock không ngăn Docker tự restart: exec lỗi trả non-zero, không thử mutation tự động trên container khác.

### 3.3 Input, domain và transaction

Shell prompt username/password ẩn và xác nhận password. CLI nhận một JSON object UTF-8 tối đa 16 KiB qua stdin; kiểm kích thước trước parse, từ chối malformed JSON, operation/field lạ và input không đầy đủ. Không log payload, password/hash, connection string hoặc stack/error DB thô; dùng thông báo đã lọc và mã ổn định.

Giữ contract username hiện hành sau đối chiếu consumer trong plan, không tự thêm normalization. Password dùng `password.ts`: tối thiểu 8 Unicode characters, tối đa 1024 UTF-8 bytes. CLI kiểm DB config và migration/schema cần thiết theo cơ chế ứng dụng; không tạo schema checker cạnh tranh hoặc tự migrate. DB connection từ cấu hình API container, không từ secret operator truyền thêm.

- `list`: username theo thứ tự, không hash/session; vẫn cần target preflight.
- `add`: domain operation thêm đúng một user, không đổi `provisionAccounts` vốn tạo hai user khi bảng rỗng. Dùng helper/UUID/constraints hiện hành. Concurrent duplicate chỉ tạo một user; thao tác thua trả lỗi rõ.
- `reset-password`: tái sử dụng domain operation khóa user, cập nhật hash, tăng `authVersion`, revoke session trong cùng transaction. Không tìm thấy user thì fail, không tạo ngầm.
- Mutation lỗi rollback; success chỉ sau COMMIT. Đóng client/pool trong đường kết thúc có thể xử lý. Không hứa cleanup khi SIGKILL/host death.

Username là dữ liệu vận hành cần cho list; fixture/report chỉ dùng username giả.

## 4. Structured Compose và bundle validation

Thay `composeText.includes(image)` bằng structured resolved config từ `docker compose config --format json`, kiểm chính xác:

| Service production | Manifest field |
| --- | --- |
| `api` | `apiImage` |
| `gateway` | `webImage` |
| `db` | `postgresImage` |

Tất cả là immutable digest. Thiếu/thừa service ngoài contract, sai mapping hoặc mutable image fail trước migration/app apply. Invalid/duplicate YAML phải bị parser từ chối; không viết YAML parser bằng regex. Consumer legacy service `web` cần adapter contract riêng nếu còn hỗ trợ, không nới production mapping để test cũ xanh.

Bundle có inventory/checksum cho manifest, metadata, compose, shell/helpers cần thiết. Trusted entrypoint/helpers theo policy source hiện hành; release compose/operator theo exact release SHA. Không gộp nhầm trust source và release source. Kiểm archive path an toàn, không absolute/traversal/symlink thoát staging, đủ file bắt buộc và checksum trước publish. CLI thuộc image được kiểm qua image build/rehearsal; checksum host module không thay image identity.

## 5. Publish dưới lock và release bất biến

### 5.1 Staging → publish

Mỗi lần thử deploy có `operationId` duy nhất: CI run ID/attempt và ID riêng cho fixture. Upload/extract vào staging riêng, không trực tiếp vào `releases/<SHA>` hoặc `shared/backup-ready.json`.

1. Kiểm archive/inventory trong staging task-owned.
2. Lấy server deploy lock trước publish release/config/backup metadata và mutation runtime. Chỉ một tầng giữ lock, tránh entrypoint tự deadlock.
3. Dưới lock, kiểm lại SHA/target/backup freshness/identity/manifest. Backup metadata operation-scoped là input có thẩm quyền; bản shared nếu còn consumer chỉ cập nhật nguyên tử dưới lock.
4. Publish directory đã kiểm bằng rename trên cùng filesystem. Release SHA đã tồn tại chỉ reuse nếu toàn bộ inventory/checksum khớp, kể cả không có file thừa; khác thì fail, không merge/overwrite/xóa release đang dùng.
5. Pull/verify image, stage/validate config, migration, apply, health/smoke và receipt.

Retry cùng SHA nhưng backup mới nằm trong operation metadata, không thay release directory. Cleanup chỉ staging đúng ownership; không xóa release/DB/volume/evidence khác. Mất transport không cho phép client xóa remote operation đang chạy.

### 5.2 Config và failure boundary

Cài failure handling trước mutation thuộc operation. Render config vào staging, validate trước publish; thay từng file nguyên tử dưới lock. Nhiều file không phải một filesystem transaction: ghi phase để phát hiện interruption giữa các lần publish. Failed receipt nói phase đạt được, không mặc định config/runtime đã hoàn nguyên.

Migration lỗi thì không apply app mới tiếp. Migration có thể đã thay một phần tùy transaction; không hứa DB không đổi. Lỗi sau apply báo thất bại và manual recovery, không tự restore DB. SIGKILL/host death có thể thiếu terminal receipt: lần tiếp phải nhận ra trạng thái chưa có kết luận và kiểm runtime, không suy success.

## 6. Receipt theo operation và rollback

Receipt chứa operation ID, SHA, status/phase, expected digests, thời gian. Filename có operation ID và event ID duy nhất; ghi temp + atomic rename. Timestamp giây không là khóa duy nhất.

Verifier nhận đúng operation ID/SHA, không sort toàn bộ receipt rồi chọn file cuối. Thiếu/ambiguous/malformed receipt hoặc terminal state failed của chính operation phải fail. Retry deploy có ID mới, không đè evidence. Operation khác mới hơn không làm chọn nhầm. Terminal success vẫn phải qua runtime checks.

Manual rollback dùng cùng publish/lock/receipt contract, giữ PostgreSQL digest guard và chỉ apply API/gateway. Rollback ứng dụng không restore schema/data. Normal release không thêm auto rollback.

## 7. Error contract

Account shell/CLI:

- `64`: usage/input/password policy invalid.
- `78`: release/container/DB schema/config không đáp ứng policy.
- `69`: runtime/dependency bắt buộc không có.
- `1`: DB operation hoặc lỗi nội bộ đã lọc thông tin.

Shell giữ exit code CLI. Duplicate/not-found có mã thông báo phân biệt; không expose driver error thô. Deploy giữ exit contract hiện hành trừ nơi plan ghi migration consumer cụ thể. Failure luôn non-zero; lỗi báo cáo không che lỗi chính.

## 8. Kiểm thử và acceptance

### 8.1 Regression thực thi

RED chứng minh hành vi, không chỉ grep thiếu eval:

- CLI compiled thật chạy ESM/import.
- PostgreSQL: list rỗng/có user, add, duplicate/concurrent add; reset hash verify được, authVersion tăng, session revoke và session behavior đúng domain.
- Failure injection trong transaction chứng minh mutation/session revoke rollback cùng nhau.
- Malformed/oversized/invalid input; wrong target, schema/dependency thiếu, unhealthy/wrong project/service/image từ chối trước mutation; assert DB không đổi tại boundary đó.
- Secret không xuất hiện trong argv/env/output/evidence, chỉ fixture giả.
- Compose swap API/gateway, thiếu/thừa service, mutable image, invalid/duplicate YAML fail trước apply.
- Publish song song và retry cùng SHA không overwrite release/shared ngoài lock; stale extra file bị phát hiện.
- Receipt cùng giây không đè nhau; verifier chọn đúng operation, nhận ra failed/missing/ambiguous state.
- Config failure trước apply có phase đúng; interruption không terminal không được success. Không gây sự cố trên hệ thống thật.

### 8.2 Disposable Docker rehearsal bắt buộc

Build API/web image và artifact fixture từ exact workspace snapshot. Chạy production entrypoint với fixture provenance/backup inputs, Compose project/path/port/volume riêng; không mở bypass fixture trong production route. Đi đủ artifact → validation/publish → migration → app health → verify → account CLI → PostgreSQL persistence assertion. Manual rollback shared boundary cũng có test phù hợp.

Mock chỉ cho negative/unit boundary, không thay image/DB thật. Rehearsal không xác minh live GHCR, GitHub environment/settings/attestation service, SSH/VPS hoặc public domain/TLS. Không chạy production backup; chỉ restore fixture và metadata cần cho deploy.

Thiếu Linux Docker engine/Node supported version phải ghi Blocked/Not run; không hạ floor hoặc đổi test thành xanh.

### 8.3 Local acceptance

Chạy lint/format/typecheck/build/focused behavior và full checks phù hợp theo scripts thực tế. Evidence có command/cwd/runtime/result/limitation. Independent reviewer đọc exact final snapshot/evidence; self-review không thay independent review. Chưa có quyền dispatch reviewer, gate đó Blocked đến khi có reviewer được phép. Local acceptance không là production Verified.

## 9. Self-review và next action

Self-review 15/11: đã bỏ module tạm/schema checker cạnh tranh; phân biệt trust/release source; tách backup retry khỏi release bất biến; chốt service mapping/receipt selection/failure boundary; giữ sandbox guard và forward-only DB recovery. Không hứa DB rollback khi migration lỗi.

Next action: người dùng review written spec hợp nhất này. Gate architectural của brainstorming yêu cầu written-spec approval trước writing-plans; review written plan và chọn execution method trước implementation. Không hỏi lại ý tưởng đã duyệt, chỉ review artifact mới.
