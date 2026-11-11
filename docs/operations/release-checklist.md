# Checklist phát hành một SHA

Phạm vi: controls CI/CD tại snapshot `47e1d7fd6486cec7169874fb85110d0418db4eed`, không tự cấp quyền production hoặc xác nhận G3/G4 sản phẩm. [Release runbook](product-release-runbook.md), [backup/restore](product-backup-restore.md), [rollback](product-rollback-runbook.md) và [readiness](../agent/READINESS.md) giữ gate tương ứng. [Evidence local Task4](../reports/2026-11-11-task4-release-checklist.md) phân biệt phần đã chạy với điều operator còn phải kiểm.

## Trước khi dispatch

- [ ] Có quyền release cụ thể, target/SSH fingerprint được xác minh độc lập và người duyệt environment `production`. Kiểm required reviewers, branch restrictions và quyền Actions/GHCR thực tế trên GitHub; YAML `environment` không tự cấu hình approval policy.
- [ ] CI từ `push` lên `main` thành công cho full SHA cần phát hành; Build immutable release đã thành công, có đúng một artifact còn hạn `mkw-release-<SHA>`. Review code/gate sản phẩm và migration compatibility đã có cho chính release đó.
- [ ] Ghi owner backup, người giữ key chính/dự phòng, kênh recovery riêng, storage/ACL/retention/RPO/RTO và maintenance/write-freeze đã duyệt. Kiểm khả năng tải artifact và phục hồi bằng key thực theo [backup/restore](product-backup-restore.md), không ghi key/DB URL/password vào log/report.
- [ ] Chọn `BACKUP` cho DB đã tồn tại. Chỉ chọn `INITIAL_EMPTY_DEPLOYMENT` khi target thật không có backup marker, rendered compose, container project hoặc volume `mkw_pgdata`; đây là evidence rỗng, `restoreVerified:false`, không phải bản sao dữ liệu.

## Cấu hình và scope

| Nguồn                                                        | Tên và nơi dùng                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variables tại environment `production`                       | `MKW_SSH_HOST`, `MKW_SSH_PORT`, `MKW_SSH_HOST_FINGERPRINT`, `MKW_DEPLOY_PATH=/home/deploy/mkw`, `MKW_PROJECT_NAME=mkw`; `MKW_GATEWAY_PORT` (ví dụ cấu hình `3200`) cho deploy/verify/rollback. Backup source hiện chỉ chấp nhận path/project trên.                                                                                     |
| Secrets tại environment `production`                         | `MKW_SSH_PRIVATE_KEY` cho backup/deploy/verify/rollback qua user `deploy`; `MKW_BACKUP_ENCRYPTION_KEY` chỉ cho backup runner mã hóa/giải mã kiểm chứng. Không đưa encryption key lên VPS hoặc artifact.                                                                                                                                |
| Repository variable, hoặc organization variable cấp cho repo | `MKW_ATTESTATION_MODE`: build không có environment nên cần thấy mode tại scope này. Deploy/rollback thấy `production`; environment variable cùng tên có thể override repo/org. Đối chiếu cả hai, tránh override ngoài ý muốn.                                                                                                          |
| Token tự cấp từng workflow                                   | `GITHUB_TOKEN`: coordinator `contents:read, actions:write`; build thêm `packages:write, id-token:write, attestations:write`; deploy/rollback `actions:read, attestations:read`; verifier `actions:read`; backup `contents:read`. Không cần PAT riêng trong contract hiện tại.                                                          |
| File bí mật trên server                                      | Bootstrap tạo/giữ `shared/db.env`, `shared/api.env` mode `600`; DB credential và auth throttle secret không thuộc Actions variables. Origin mặc định entrypoint hiện là `https://minhkhue.servertun.pp.ua`; workflow chưa nối variable `MKW_WEB_ORIGIN`. Đổi origin cần thay control có review, không giả một variable tự có tác dụng. |

`off` hoặc unset/`not-configured`: không signing/xác minh GitHub manifest attestation, receipt `not-configured`. `best-effort`: thử signing/verify; lỗi có thể tiếp tục với `not-verified`. `required`: build signing phải đạt, deploy/rollback phải `gh attestation verify` chính manifest với signer workflow `build-release.yml` trước SSH; thiếu CLI/quyền/signature thì dừng. Build vẫn tạo digest và SBOM/provenance descriptors ở mọi mode; file tồn tại/checksum không chứng minh chữ ký đã verify. Old manifest chưa được attest sẽ bị chặn khi `required`.

## Một SHA, ba mode

Ví dụ feature release: SHA `47e1d7fd6486cec7169874fb85110d0418db4eed` chỉ là ví dụ input, chưa có xác nhận build artifact/GitHub CI cho nó. Sau các approval/gate ở trên, từ checkout đã tin cậy:

```bash
gh workflow run release-pipeline.yml --ref main \
  --field release_sha=47e1d7fd6486cec7169874fb85110d0418db4eed \
  --field mode=release --field backup_kind=BACKUP
```

Đổi `mode` có ý nghĩa sau; cả ba vẫn cần build artifact và dispatch backup thật, environment approval/SSH. Không chạy ví dụ này như local test.

| Mode                 | Deploy entrypoint và verifier                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dry-run` (mặc định) | SSH preflight Docker Compose, input và dung lượng `/home` ít nhất 1 GiB; không apply ứng dụng. Verifier kiểm artifact/SHA, receipt `skipped-preflight-only`, không runtime PASS.                                                                                                                                                                                      |
| `bootstrap`          | Tạo thư mục/lock và hai secret env files nếu chưa có; giữ secret có sẵn, yêu cầu đủ cả hai files. Không khởi chạy release hoặc migration; verifier chỉ preflight. Đây là mutation server cần approval.                                                                                                                                                                |
| `release`            | Kiểm manifest/checksum/digests/backup/attestation, truyền artifact đã chọn và current policy; remote revalidate backup bằng UTC thật dưới deploy lock trước mutation và trước migration. Chạy Prisma `migrate deploy`, Compose, health/smoke rồi receipt. Verifier kiểm running image IDs/digests, migration status, gateway/startup; cần đọc kết quả job và receipt. |

Coordinator chạy policy từ `main`, chọn artifact theo tên + manifest `releaseSha`, `build-metadata.sourceSha`, source repository và successful `build-release.yml` run; không lấy “latest” hoặc coi workflow-run `head_sha` là source SHA. Không có hoặc có nhiều match đều dừng. Mỗi backup/deploy/verify dispatch được gắn correlation và exact run/attempt; coordinator rerun dùng run attempt mới, không tái sử dụng cùng marker.

## Bằng chứng phải giữ

- [ ] Ghi release SHA, build run ID, release artifact ID/name, manifest/checksum, API/Web/PostgreSQL digests và SBOM/provenance/attestation status. Artifact release giữ 30 ngày theo workflow; expired artifact cần build/route phê duyệt mới, không chọn bản tùy ý.
- [ ] Ghi backup run ID **và attempt**, exact artifact ID/name `mkw-backup-<run_id>-<attempt>`, metadata `backupId=mkw-<run_id>-<attempt>`, snapshot UTC, kind, SHA provenance, database identity, encrypted dump SHA-256/size và `retentionUntil`. Artifact `BACKUP` chứa `database.dump.enc`, checksum và `backup-ready.json`; empty deployment chỉ có metadata.
- [ ] Freshness mặc định **86400 giây (24 giờ)** ở coordinator; deploy input `backup_max_age_seconds` mặc định cùng giá trị, rollback cố định 86400. Coordinator không có input đổi tuổi. Created/empty checkedAt không được ở tương lai, không quá tuổi và retention phải còn hạn; chờ approval lâu có thể làm backup hết hạn. Không nới clock/retention hoặc sửa metadata để qua gate; tạo lại backup thật.
- [ ] Giữ deploy/verify run IDs, server receipt trong `receipts/`, artifact `mkw-post-deploy-receipt-<SHA>` gồm `verification-receipt.json`/`rollback-signal.json`. Deploy chưa tự upload server receipt; operator thu thập qua route được phép và loại secret. Freshness là point-in-time, không bảo đảm chưa có write sau snapshot.

## Khi thất bại và rollback

Artifact không xác định, checksum/SHA/backup/attestation sai: dừng, giữ IDs/log an toàn, xử lý nguyên nhân rồi tạo run mới. Lỗi SSH/fingerprint không được bỏ StrictHostKeyChecking. Coordinator dừng khi child workflow thất bại/timeout hoặc run identity thay đổi; trước retry kiểm các run đang chờ approval/đã mutate để tránh release lặp.

Post-deploy failure phát tín hiệu `rollback-requested`, **không tự dispatch rollback**. Receipt `runtimeVerification:attempted` không có nghĩa thành công; xem `result`, startup/migration evidence. Migration failure có thể xảy ra trước server receipt; thiếu receipt không chứng minh chưa mutate. Operator giữ traffic/maintenance theo incident approval, không tự xóa migration ledger hoặc chạy down migration.

Rollback workflow hiện hành cần `old_release_sha`, `old_release_run_id`, **`backup_run_id`/`backup_artifact_id` của BACKUP mới từ DB hiện tại**, và `reason` chứa incident/approval xác nhận app cũ tương thích schema hiện tại. Snapshot SHA là provenance của DB hiện tại, **không phải yêu cầu bằng SHA app cũ**; không dùng backup lịch sử gắn app cũ hoặc empty marker làm thay thế. Workflow kiểm host/DB `mkw`, restore verification, tuổi/retention rồi truyền metadata tới remote.

Dispatch rollback từ revision `main` đã tin cậy: old manifest/API/Web digests là payload, current controls/compose dùng workflow `github.sha` ghi `controlSha`. Dưới deploy lock, guard đọc đúng một PostgreSQL container đang chạy theo project/service labels và so digest với old manifest; thiếu/không rõ/mutable/mismatch đều dừng trước env/render/Compose mutation. Digest trùng mới giữ DB container, `up --no-deps api gateway`; forward migration gate vẫn chạy. Digest trùng **không chứng minh app/schema/data compatibility**: operator phải xác nhận riêng trước approval.

Giữ rollback runner artifact `mkw-rollback-receipt-<oldSHA>` và server receipt; scope `application-only`, `databaseRecovery:false`. Không có restore dữ liệu/down migration/đổi PostgreSQL tự động. Không tương thích hoặc cần khôi phục dữ liệu: dừng route này, restore vào DB mới, verify/revoke restored sessions và cutover theo approval riêng. Sau rollback kiểm lại health/smoke/runtime đúng manifest cũ theo [rollback runbook](product-rollback-runbook.md).
