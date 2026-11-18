# Rà luồng workflow và deploy — 14/11/2026

## Phạm vi và trạng thái

Theo yêu cầu mở rộng của người dùng, rà local từ CI → build + backup → deploy → verify, cùng route rollback manual. Base `0e0e97be769f7186f9ac73cca0dd1392ecfe9a0f`. Đây là audit ban đầu có bằng chứng; chưa sửa code, chưa phải kết quả review độc lập hay live GitHub/VPS verification. Amendment CLI build sẵn vẫn chờ duyệt.

Đã đọc main-release, CI, build-release, backup, deploy, post-deploy-verify, rollback, deploy-entrypoint, post-deploy shell, backup source/runner, registry pull, provenance resolver, GitHub artifact adapter và Compose validator. Những route legacy coordinator/automatic rollback chưa được audit đầy đủ ở checkpoint này.

## Findings

### F1 — High: Compose validator không ràng buộc image theo service (đã tái hiện)

`scripts/product/release/verify-release.mjs` dùng `composeText.includes(manifest[field])`. Compose có `api.image = webImage`, `gateway.image = apiImage`, `db.image = postgresImage` vẫn trả `{ok:true,errors:[]}`. Remote entrypoint gọi validator trước migration/app apply, còn post-deploy kiểm image chỉ xảy ra sau apply. Lỗi mapping có thể làm thay đổi runtime trước khi phát hiện.

Probe local: Node ESM import actual verifier, tạo manifest hợp lệ và Compose hoán đổi API/gateway; output `scenario: api and gateway images swapped`, `result.ok: true`. Chưa chạy Compose mutation.

Hướng sửa: kiểm mapping `api→apiImage`, `gateway→webImage`, `db→postgresImage` trên structured Compose config; test thiếu/sai/duplicate/extra service và mutable images. Không thêm YAML parser viết tay bằng regex. Schema/fixtures legacy dùng service web cần được xét theo consumer thực, không âm thầm đổi contract.

### F2 — High: transport publish nằm ngoài remote deployment lock (source-confirmed)

Trong deploy.yml và rollback.yml, upload/extract trực tiếp vào `releases/<SHA>`, rồi install metadata vào `shared/backup-ready.json` trước khi gọi entrypoint. Remote lock chỉ được lấy bên trong entrypoint, sau phần validation ban đầu. Vậy lock chưa bảo vệ toàn bộ publish và shared metadata handoff. Normal workflows có concurrency giảm rủi ro chạy chồng nhưng không thay lock server cho mọi operator/route; cùng SHA retry còn giữ file cũ nếu archive mới không chứa chúng.

Hướng sửa cần rehearsal: staging có operation identity, kiểm đủ file/hash trước publish; lock server bao phủ shared publish và deploy mutation. Không rename hoặc xóa release đang được sử dụng, không coi SHA directory tồn tại là bằng chứng nội dung đúng. Race chưa chạy bằng concurrency fixture; không claim đã gây incident thật.

### F3 — Medium: receipt chọn theo tên thời gian toàn cục, không theo operation

Entrypoint ghi `YYYYMMDDTHHMMSS-status.json`, không có operation trong filename; verifier sort toàn bộ receipts rồi lấy file cuối trước kiểm operationId. Hai lần cùng giây có thể ghi đè; một thao tác khác tạo receipt mới làm verifier từ chối dù receipt operation cần kiểm vẫn tồn tại. Cơ chế hiện tại fail closed, chưa thấy bằng chứng false success.

Hướng sửa: receipt filename có operation identity/uniqueness, atomic write và query đúng operation+SHA+status+expected digests; báo rõ ambiguous/missing. Kiểm cả retry và failed receipt mới hơn trong cùng operation. Chưa có behavioral reproduction ở checkpoint này.

### F4 — Medium: ERR trap đặt sau một số mutation cấu hình

Entrypoint cài ERR handler sau update api.env và render/config validation. Lỗi ở phần trước có thể để lại thay đổi cấu hình mà chưa có failure receipt. Trap hiện không bao phủ mọi signal/transport interruption; không được hứa luôn có receipt khi SIGKILL/mất host.

Hướng sửa: phân biệt staged config với published config, cài failure handling trước boundary mutation, có operation-scoped state/receipt phù hợp. Không phục hồi DB tự động.

### F5 — Verification gap: focused static suites xanh không bắt F1/account ESM

Lệnh: `node --test --test-concurrency=1 tests/product-tooling/simplified-release-policy.test.mjs tests/product-tooling/deploy-entrypoint-policy.test.mjs tests/product-tooling/production-account-script.test.mjs`.

Kết quả: 13/13 PASS trong Node24.12.0, thấp hơn floor Node24.22.1 của API. Đây chỉ là evidence thực thi focused static tests, không phải supported-runtime/full-suite gate. Account ESM hiện vẫn có eval lỗi và verifier probe vẫn chấp nhận service swap.

## Những gate đang có và cần giữ

- Main-release có quality trước build/backup, deploy đợi cả hai, verify sau deploy; normal route không automatic rollback.
- Manifest/image digest, backup freshness/target/restore evidence, host fingerprint pinning và producer tuple đã có checks; automatic route tin output reusable workflow trong cùng run, manual route resolve canonical archive riêng.
- EntryPoint có remote flock, backup recheck và forward migration trước app apply.
- Post-deploy đã kiểm actual image ID/digest, health, migration status và HTTP smoke.
- Rollback kiểm PostgreSQL runtime digest và chỉ apply api/gateway; không restore DB/down-migrate.

Không suy các checks source này thành GitHub settings, attestation hoặc VPS runtime Verified.

## Next action

Đưa F1–F4 và compiled account CLI vào đặc tả amend; chốt contract publish/receipt/service-map rồi mới viết implementation plan cụ thể và behavioral tests đỏ. Gate implementation chưa mở; không push/merge/SSH/deploy/production mutation. Independent reviewer chưa được dispatch.
