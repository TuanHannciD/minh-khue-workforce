# Vận hành release bất biến

Phạm vi: quy trình tài liệu cho artifact đã kiểm chứng; không tự cấp quyền production.

Đường vận hành hiện hành: [checklist một SHA](release-checklist.md). [Evidence Task4](../reports/2026-11-11-task4-release-checklist.md) ghi verification local trên controls 47e1d7f; không thay readiness sản phẩm. Các giới hạn chưa được quyết định trong hồ sơ bàn giao cũ phải được operator xác minh lại bằng cấu hình/approval thực trước release.

## Daily release — merge local → push main

Sau khi hoàn tất [checklist kích hoạt](release-checklist.md), operator merge local code đã review rồi `git push origin main`. Normal release không nhập SHA, run ID, artifact ID hoặc bấm approval thủ công. Nếu actual repo policy bắt buộc PR, dùng route merge GitHub tương ứng; CI kiểm exact SHA sau merge.

`main-release.yml` nhận full push `github.sha`, preflight current-state rồi quality → immutable GHCR build/manifest → backup → deploy → verify. Build và backup có thể chạy song song sau quality; deploy cần cả hai đạt. Exact outputs gồm run/attempt/artifact IDs/archive digests, API/Web `@sha256:<64 hex>` và pinned PostgreSQL. Không chọn “latest”, không build trên VPS. Backup `BACKUP` phải target-bound, fresh, retained và restore-verified; VPS pull/check RepoDigest toàn bộ image trước forward migration/Compose mutation. Verify đối chiếu runtime image, schema/migration và health/smoke, rồi mới promote last-known-good.

Concurrency giữ một production transaction, push mới không cancel mutation. Pending có thể bị superseded; không hứa phát hành mọi SHA trung gian. Stale source dừng trước mutation; rerun verified SHA là `already-deployed`, uncertain current-state là incident. Summary correlation `<run_id>-<attempt>` và operation `<run_id>-<attempt>-<SHA>` nối stage/receipts; recovery summary riêng, pipeline gốc vẫn Failed khi recovery thành công.

## Route thủ công

`release-pipeline.yml`/coordinator nhận full SHA, mode và backup kind cho dry-run/bootstrap/recovery được phép; không thuộc daily flow. Coordinator vẫn dùng exact canonical artifact IDs và dispatch backup thật qua SSH, kể cả dry-run/bootstrap. Dry-run chỉ preflight; bootstrap tạo env/thư mục, không apply app; `skipped-preflight-only` không phải runtime verification. Target mới dùng `INITIAL_EMPTY_DEPLOYMENT` có empty evidence qua route riêng, không tự fallback khi daily BACKUP thiếu.

Giữ budget coordinator tổng 150 phút (job 180), backup/deploy 50 phút mỗi stage, verify 30, discovery tối đa 5 và API process timeout 30 giây. Timeout/cancel không chứng minh child stopped; giữ URL/correlation và kiểm current-state/mutation trước retry. Auto workflows dùng needs/stage timeouts, không API dispatch/poll. Không blind cancel migration hoặc retry vô hạn.

Trước migration, public GHCR pull anonymous; private dùng VPS-only token mode 600, read-only `read:packages` qua registry vars/files trong checklist; build write token không xuống VPS. Pull denied/digest mismatch dừng trước migration. Environment hiện vẫn dùng chung `production` cho auto và manual; recovery approval environment riêng là gate activation chưa đạt. Không tự bỏ reviewer production để đạt happy path.

## Gate và bằng chứng

Giữ manifest, checksum, SBOM/provenance, backup-ready, deploy/post-deploy receipt và log đã loại secret. Mọi thiếu identity, checksum, artifact hoặc health phải fail closed. Không ghi password, token, key, DB URL hay dump content.

## Cấu hình attestation

`MKW_ATTESTATION_MODE` chấp nhận `not-configured` (cũng là mặc định khi unset), `off`, `best-effort`, `required`. Build kiểm allowlist trước checkout/build/push; typo dừng sớm với exit 78. Digest, SBOM và provenance descriptors vẫn được tạo theo contract manifest hiện có; mode điều khiển thêm GitHub attestation của chính manifest.

Đặt mode dùng chung ở **repository variable**, hoặc **organization variable** đã cấp quyền cho repository. Build không gắn environment nên không thấy variable chỉ đặt tại `production`. Thứ tự ưu tiên của GitHub là environment → repository → organization; deploy/rollback có `environment: production` nên environment variable cùng tên có thể ghi đè mode dùng để build. Tránh override cùng tên tại environment; nếu có chủ ý phải đối chiếu cả hai giá trị trước release. Ví dụ repository `required` + production `off` làm deploy bỏ verify; repository `off` + production `required` làm deploy fail closed vì build không tạo attestation. Environment-only `required` cũng không bật signing ở build.

`best-effort` cho phép signing/verification không khả dụng nhưng receipt không được coi là verified. `required` dừng khi signing hoặc xác minh manifest không thành công; chỉ bật sau khi operator kiểm quyền `id-token`/attestations, khả năng của repository và runner `gh attestation verify`. Local fixture không chứng minh cấu hình variable hoặc dịch vụ signing thật.

## Rollback

Auto rollback chỉ một lần sau application/verify failure và đủ LKG, exact ownership/attestation/artifacts, fresh current DB backup, unchanged PostgreSQL/schema/migration và producer-backed data-operation receipt. `--no-deps api gateway` giữ DB, không old-image migration/restore/down migration; recovery thành công vẫn giữ original pipeline Failed. Unknown/side-effect/missing data receipt là `incident-required`. Repo chưa có producer độc lập của receipt data operation/startup, journal hiện `unknown`; fixture healthy recovery không chứng minh live recovery sẵn sàng.

Theo [rollback runbook](product-rollback-runbook.md): chọn manifest cũ đã biết, duyệt compatibility với schema hiện tại và tạo BACKUP mới của DB hiện tại trước redeploy exact API/Web digests. Snapshot SHA không phải old app SHA. Guard yêu cầu PostgreSQL runtime digest trùng old manifest và giữ DB container; không chạy down migration hoặc restore DB. Nếu schema không tương thích, restore sang DB mới, verify và chỉ cutover sau approval riêng.

## Giới hạn

Controls hiện có GitHub artifact retention 30 ngày, freshness mặc định 24 giờ, path `/home/deploy/mkw`, project `mkw` và origin mặc định trong entrypoint; đó không phải bằng chứng cấu hình production đã được kiểm. Custody key/recovery, storage ACL, RPO/RTO, domain/TLS, credentials và approvals thực cần operator xác minh theo [checklist](release-checklist.md). G3/G4 sản phẩm còn theo [READINESS](../agent/READINESS.md); local CI/CD tests không đóng các gate đó.

[Verification Task 5](../reports/2026-11-11-push-main-cd-verification.md) ghi local checks và limits. GitHub settings/GHCR/SSH/VPS/production/rehearsal external vẫn **Not run/Blocked**; chưa Activated/Released.
