# Phát hành tự động từ push main

Trạng thái: thiết kế trong hội thoại Approved; bản spec cụ thể này chờ người dùng review trước implementation plan. Ngày 11/11/2026. Base `0ba827a3c7e1a2c38abe8ed5c4e98ea59de2d441`, nhánh local `feat/modern-cicd`. Đây là delta tiếp theo, không thay evidence scoped review của workflow manual hiện có.

## 1. Mục tiêu và phạm vi

Người dùng chọn registry-based Docker Compose deployment và yêu cầu hoàn thiện luôn: sau merge local và `git push origin main`, GitHub tự kiểm tra, build, push GHCR, backup, deploy VPS, verify và rollback ứng dụng khi đủ bằng chứng. Không cần nhập SHA/run/artifact ID hay bấm approval cho release thông thường. Không triển khai một bản chỉ tự động đến bước chờ duyệt rồi coi là hoàn tất.

Agent tiếp tục điều phối subagent implementation và reviewer độc lập; model tối đa `gpt-6.1-sol` reasoning `high`, không Astra hoặc nested delegation. Scope hiện tại là code, tests, tài liệu, local Docker rehearsal khi cần. Spec không tự cấp quyền push, merge main, thay GitHub environment/secret, SSH hoặc phát hành thật. Đầu ra phải sẵn sàng review; kiểm chứng ngoài hệ thống cần ghi điều kiện/target/quyền thực tế, không ghi Not run thành Verified.

## 2. Trải nghiệm vận hành

Sau khi setup một lần:

```text
merge local → push origin main
  → quality gates
  → build API/Web + push GHCR + immutable manifest + attestation
  → backup database đúng target + restore verification
  → deploy exact digests + forward migrations
  → runtime verification
  → success, hoặc rollback app đủ điều kiện / incident
```

Không yêu cầu PR bắt buộc trong contract vận hành này: policy GitHub phải cho phép local merge rồi push main của tài khoản được quyền; nếu repository bắt buộc PR thì phải dùng đường merge GitHub tương ứng. CI vẫn chạy trên PR khi có PR. Local merge không thay kiểm tra CI trên SHA sau merge.

Bootstrap target mới và database restore là thao tác riêng. Auto release thông thường luôn yêu cầu `BACKUP`; không tự phát hiện rồi chuyển sang `INITIAL_EMPTY_DEPLOYMENT` khi mất DB hoặc thiếu volume.

## 3. Một đường tự động duy nhất

Một workflow entry nhận `push` vào canonical main, không filter path khiến source/config release bị bỏ sót; ghi full `github.sha` của event. Tách stage bằng `needs` và reusable workflows `workflow_call`; dữ liệu đi bằng job outputs/artifact chính xác, không API dispatch/poll trong đường tự động chính. Giữ coordinator manual cho route kiểm tra/recovery được phép nhưng khóa chung target.

CI vẫn hỗ trợ PR, reusable quality job cho push release; không chạy trùng hai bộ quality/build/release do giữ cả `workflow_run` cũ và trigger mới. Giữ tên workflow/file build canonical khi khả thi để không phá artifact provenance và signer identity; nếu producer event thay đổi, resolver chỉ thêm đúng trusted event mới, không bỏ workflow ID/path/repo/ref/SHA/success checks. Artifact cũ hợp lệ tiếp tục dùng cho manual rollback theo policy attestation hiện hành.

Không dùng `workflow_run.head_sha` của một execution không liên quan làm source SHA. Trước mọi mutation, manifest, build metadata, source repository, artifact ownership và exact artifact ID phải cùng chỉ một release SHA. Không fallback latest hoặc artifact trùng tên.

## 4. Build và registry

Build tại GitHub hosted runner, không build ứng dụng trên VPS. API/Web push GHCR có tag SHA để tra cứu, deploy bằng `@sha256:<64 hex>`. PostgreSQL tiếp tục dùng pinned digest theo source hiện có, không tự nâng version DB.

Manifest/checksums/SBOM/provenance/attestation và output IDs phải được giữ cho từng run attempt. Artifact name phải không xung đột khi các reusable jobs cùng thuộc một run. Manifest attestation `required` phải fail closed; không coi SBOM descriptor/checksum là xác minh chữ ký.

Xác minh quyền pull image trên VPS. Public image có thể anonymous pull; private GHCR cần credential chỉ-read-packages được cấp riêng và file/config quyền tối thiểu, không dùng token push của build làm credential lâu dài. Không đưa credential vào SSH command, receipt hoặc artifact. OIDC không mặc nhiên thay authentication SSH/GHCR trên VPS hiện tại. Setup phải test pull exact digest trước release; thiếu quyền pull dừng trước migration. Không giả định package hiện tại public/private khi chưa quan sát.

## 5. Backup và deploy

Backup producer giữ mã hóa, checksum, restore verification, UTC/age/retention và target binding hiện có. Database `mkw`; host/path/project lấy trusted environment config. Backup artifact có exact run/attempt identity và metadata SHA provenance. Backup có trước mutation, không upload plaintext dump. Backup định kỳ hiện hành tiếp tục chạy độc lập và dùng cùng lock snapshot để tránh chồng thao tác.

Remote kiểm lại backup dưới lock và trước migration. Pull/validate toàn bộ application image trước migration; dùng Compose đã render từ exact manifest. Giữ secret env trên VPS, fingerprint filter và mọi SSH/SCP strict pin. Không sửa fingerprint theo keyscan chưa xác minh.

Stage ghi operation ID, source SHA, control SHA, run ID/attempt, artifact IDs/digests và mutation state. Deploy failure có thể đã mutate: absence receipt không chứng minh chưa migration. Receipt failure phải fail pipeline hoặc đánh dấu uncertain; không báo xanh do thiếu evidence.

## 6. Concurrency, push mới, retry và timeout

Production chỉ một transaction phát hành tại một thời điểm, từ chọn previous state/backup đến verify/rollback. Đường manual deploy/rollback và scheduled backup dùng lock phù hợp, không deadlock parent/child dùng cùng GitHub concurrency group. Remote flock là boundary cuối, không thay toàn bộ orchestration serialization.

Không cancel pipeline đang migration/mutation vì có push mới. Nếu GitHub concurrency giữ một running và một pending, pending cũ có thể bị thay thế: chỉ coi đó là skipped/superseded, không hứa phát hành mọi commit trung gian. Mục tiêu cuối là phát hành main mới nhất đã đạt gate mà không để release cũ ghi đè release mới. Recheck stale source trước mutation; ghi skipped có lý do nếu main đã tiến lên và pipeline chưa mutate.

Rerun cùng SHA/attempt mới phải kiểm current state, không phát hành lặp mù quáng; nếu SHA đã verified thì kết luận already-deployed, nếu state uncertain thì dừng incident. Không retry migration hoặc rollback vô hạn. Deadline parent/stages chừa margin cleanup và xuất run URLs trạng thái active/uncertain nếu timeout; không stage sau khi prerequisite fail.

## 7. Rollback tự động và bằng chứng schema

Trước deploy, lưu immutable last-known-good state từ lần runtime verification thành công gần nhất, không lấy latest build. State gồm manifest/artifact ownership/run IDs, runtime image digests, PostgreSQL digest, schema/migration state fingerprint và operation/release ID. First deployment không có previous state thì không auto rollback.

Chỉ thử rollback một lần khi đã thay application và verify thất bại, đồng thời đủ tất cả điều kiện:

- Last-known-good state đầy đủ, canonical artifacts còn hạn và attestation đúng policy.
- Current runtime đúng operation thất bại; không có release khác xen vào.
- PostgreSQL container/digest đúng và không đổi; backup mới của DB hiện tại restore-verified, đúng target/freshness/retention. Không tái dùng snapshot trước release thay cho backup mới trước rollback.
- Trạng thái migration/schema được đo trước/sau trên DB thật chứng minh không thay đổi; không có migration pending/failed/uncertain. Unknown hoặc lỗi đọc state phải từ chối. Chỉ so source migration files hoặc digest PostgreSQL là không đủ.
- Không có thao tác dữ liệu riêng ngoài migration được khai báo cho release đó; nếu có data migration/side effect không xác minh được thì dừng incident. Không tuyên bố schema fingerprint chứng minh mọi compatibility nghiệp vụ.

Auto rollback chỉ pull/apply exact API/Web cũ bằng `--no-deps api gateway`; không chạy migration từ old image, không đổi DB container, không restore/down migration. Giữ route manual hiện có tách biệt, không nới quyền manual để auto sử dụng reason thay bằng chứng. Sau rollback verify app cũ và DB invariants. Pipeline gốc vẫn Failed, summary `recovered-by-app-rollback` nếu thành công; không biến release lỗi thành xanh.

Migration đã thay đổi, migration failure, thiếu previous state, metadata sai, backup lỗi, PG mismatch, permission/SSH lỗi hoặc unknown mutation state: không auto rollback; ghi incident-required và bằng chứng không secret. Không tự gửi Slack/email nếu chưa được người dùng yêu cầu; GitHub job summary/artifacts là đầu ra mặc định.

## 8. Environment và quyền

Release thường dùng production environment/config không required human reviewer để đạt yêu cầu tự động. Recovery thủ công dùng environment riêng có approval, cấu hình branch restriction và secrets tương ứng. YAML không tự tạo reviewers hoặc bỏ reviewers hiện có; activation checklist phải ghi chính xác phần cần thao tác GitHub một lần. Không yêu cầu chuyển repo sang bắt buộc PR nếu người dùng chọn local merge/push.

Quyền token tối thiểu từng job; không `secrets: inherit` rộng nếu chỉ cần vài secret. Không truyền build write credential xuống VPS. Pins immutable cho actions thay đổi. Current controls cần một SHA nhất quán cho transaction, không âm thầm dùng nhiều phiên bản main nếu main thay đổi giữa stages.

## 9. Rehearsal và tiêu chí nghiệm thu

Fixture tests chạy logic thực cho: trigger/needs/failure propagation, exact artifact ownership, forged SHA/ID, private registry denied, backup target/age/retention, missing configuration, hostile input/keys, queued push/stale source, rerun/idempotency, timeout và no later mutation.

Rollback tests: no migration + healthy previous state → rollback API/Web một lần và reverify; changed/failed/unknown migration, missing artifact/backup/previous state, PG mismatch, interleaving deployment → incident, không DB mutation. Failure pipeline vẫn non-success khi app recovered.

Docker rehearsal isolated với database thử: deploy A → deploy B bình thường; B unhealthy không đổi migration → recovery A; B đổi migration → không auto rollback; backup restore verification; private/public registry policy bằng harness phù hợp. Không giả `GITHUB_ACTIONS`/`RUNNER_ENVIRONMENT` để vượt guard của rehearsal cũ. Dùng harness local rõ ràng hoặc runner GitHub disposable.

Required local checks: supported Node/pnpm + locked dependencies; focused/full tooling, product lint/type/build/boundaries/contract, YAML/Bash, changed-file formatting, UTF8/docs links. Sửa ba CSS format baseline nhỏ chặn quality trong cùng scope nếu format-only; không bỏ gate để auto deploy chạy. 19 historical docs links và Windows pnpm.exe issue phải giữ evidence, phân biệt CI Linux thực tế; không tạo artifact giả hoặc thay dependency để che failure.

Chỉ gọi Implemented/Reviewed khi evidence đúng snapshot. Chỉ gọi Activated khi GitHub config+workflow và rehearsal external đúng target đã chạy theo quyền riêng. Chỉ gọi Released khi có deploy/verify receipt production thật. Không ghi local test PASS thành end-to-end production PASS.

## 10. Activation và bàn giao

Tài liệu cuối có một setup checklist (vars/secrets, package pull, environment reviewers, branch permissions, initial bootstrap, signing), một luồng daily duy nhất `merge local → push main`, cách xem summary và xử lý incident/retry/recovery. Giữ workflow dry-run/bootstrap/manual rollback/scheduled backup; operator không phải nhập ID trong release thông thường.

Đợt activation sau khi code đạt review: kiểm actual GitHub settings và quyền pull, chạy disposable rehearsal, rồi push/merge/config/production theo quyền cụ thể. Nếu chưa được làm bước này, bàn giao Ready for activation với phần Not run/Blocked rõ, không coi toàn hệ thống đã hoàn tất.
