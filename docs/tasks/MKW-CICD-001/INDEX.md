# MKW-CICD-001 — Điều phối CI/CD

## Amendment: simplified push-main release (2026-11-12)

Base implementation tip: `f024b5b77b404796304395439a140f35ca3fdf56` (`origin/main`).
The user approved replacing the overengineered automatic path with one coherent
`push main → quality → full API/Web Docker build → encrypted verified BACKUP →
Compose deploy → health/smoke verify` flow. This amendment is local-only: no
push/merge/main mutation, GitHub settings/secrets, VPS mutation, or adoption
feature commits. Existing production variables, pinned actions, SSH fingerprint,
least permissions, backup target binding/freshness/restore verification, remote
flock, forward Prisma migration and Compose entrypoint remain required.

The normal path no longer reads or promotes `current-state.json`/
`last-known-good.json`, selects API reuse/LKG, emits schema or gateway-only
proofs, uses empty-deployment fallback, or dispatches automatic rollback. A
legacy healthy VPS without those files proceeds when the fresh `BACKUP`, exact
manifest/image digests and target/ref checks pass. Failures stop at their stage
and report SHA/digests/backup identity; manual controlled recovery remains an
operator route and explicitly does not auto-restore or down-migrate.

Acceptance for this amendment: stale main, wrong fingerprint/digest/target/ref,
backup, migration, build, health or smoke failures block later mutation; reruns
of the same SHA use forward idempotent migrations; existing DB volume/data is
preserved; remote flock still serializes releases; healthy and unhealthy
disposable Docker fixtures are visible. Tests are updated to assert the new
automatic contract and remove only dead normal-path consumers after consumer
search. Operator activation is documented in one current runbook/checklist.

## Phạm vi đã duyệt

Người dùng yêu cầu agent chính điều phối sub-agent nâng cấp CI/CD; cho phép bật Docker Desktop khi cần kiểm thử local. Thiết kế trong hội thoại được duyệt bằng “Approved”: coordinator nhận một release SHA, chạy backup và deploy/verify qua các boundary hiện có; backup gate đúng release/freshness/target; supply-chain và rollback có bằng chứng rõ; tài liệu và kiểm thử local. Chưa có quyền push/merge/deploy production hoặc ghi secret thật.

## Acceptance và risk

- Một luồng phát hành giảm nhập tay ID và không chọn artifact không liên quan.
- Backup sai release/cũ/hết hạn hoặc không đúng target bị chặn trước mutation.
- Không rò secret, không shell injection từ input, giữ production environment gate.
- Verify sau deploy và rollback phân biệt ứng dụng với phục hồi database.
- Có tests phù hợp, review độc lập và runbook; không gọi local PASS là production Verified.

Rủi ro cao: thay đổi tooling có thể tác động quyền production và persistence khi phát hành. Scope hiện tại local-only. Dữ liệu nhân sự và credential không được dùng làm fixture.

## Workspace và writer/reviewer route

- Base source: `928863e1ecd60ed9ac011fd5ec121dd3c09d4199`.
- Commit kế hoạch: `9f89930`; [plan](../../superpowers/plans/2026-11-11-modern-cicd-orchestration.md).
- Integration: `.worktrees/cicd-orchestration`, branch `feat/modern-cicd`.
- Primary checkout có dirty skill và report có sẵn, không thuộc task và phải bảo toàn.
- Ba implementation worktree riêng; fresh reviewer chỉ đọc exact snapshot, agent chính giữ điều phối/integration.
- Model mọi child: `gpt-6.1-sol`, reasoning `high`; cấm Astra và nested delegation.

## Delegation ledger

Các ID dưới đây dùng prefix `node:delegated-task:command%3Amcp%3A0672a3a3-924b-479d-bf26-6457c771758b%3Adelegate-task%3A`.

| Hạng mục              | ID suffix                  | Trạng thái                                                                           |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Backup gate           | `mkw-cicd-task-1`          | Running                                                                              |
| Coordinator           | `mkw-cicd-task-2`          | Author commit `7f695fd757fd7218942e9e5a8e0386352eb954e1`; independent review Pending |
| Supply-chain/rollback | `mkw-cicd-task-3`          | Running                                                                              |
| Coordinator review R1 | `mkw-cicd-review-task2-r1` | Running; diff/report tại integration `.agent-reviews/`                               |

## Bằng chứng và giới hạn

Task2 author báo 6 focused tests, YAML parsing, Bash syntax, Prettier và whitespace đạt. Full tooling có lỗi thiếu dependencies trong worktree; chưa có integrated verification, không suy ra baseline product Failed. Reviewer sẽ đối chiếu actual code với yêu cầu auto backup/verify. Không có Docker, SSH, production mutation, push hoặc release trong checkpoint này.

Next action: xử lý findings Task2; nhận Task1/3, dispatch review trên exact commit; tích hợp các thay đổi đạt review và giao worker kiểm thử/doc.

## Review Task2 R1 và vòng sửa

Reviewer R1: Spec FAIL, Quality CHANGES REQUIRED, chưa tích hợp. F1 không chạy backup; F2 không đợi deploy/verify và verify thủ công; F3 chưa chặn backup stale/future/expired; F4 bỏ exact artifact IDs trước consumer; F5 validator của candidate nhận write token/downstream ref không cố định; F6 nhầm workflow_run execution SHA với source SHA.

Fix dispatch suffix `mkw-cicd-task2-fix-r1` (cùng delegation prefix phía trên), worktree riêng từ base kế hoạch rồi cherry-pick commit coordinator. Yêu cầu đọc full review, sửa F1–F6, thêm behavioral fixtures và covering checks. Fresh reviewer tiếp theo phải nhận nguyên findings, responses, unresolved objections và exact diff mới. Không có ruling bỏ qua finding nào.

Task1 author hoàn tất `293fdc457ff1a678eb5b647a1b8fb381c00c453d`, báo 34 focused tests và 10 root tests đạt; independent review `mkw-cicd-review-task1-r1` Running. Task3 author hoàn tất `c4496ae53e0bf900ca76a69d56c5b65459909603`, báo 17 focused tests/YAML/Bash/whitespace đạt; independent review `mkw-cicd-review-task3-r1` Running. Full tooling chưa Verified trong integration workspace. Không production/SSH/Docker acquire.

## Review Task1 R1 và vòng sửa

Reviewer Task1 R1: Spec FAIL, Quality PARTIAL. F-01 High: release candidate cũ có thể cung cấp validator không enforce policy; F-02 High: path chưa validate trước các remote shell mutations; F-03 Medium: remote entrypoint không tự enforce expected SHA/max age. Giao sửa cả ba bằng dispatch suffix `mkw-cicd-task1-fix-r1`, isolated worktree, cherry-pick Task1 original, focused behavioral tests và fresh re-review. Không chấp nhận ngoại lệ nào. Reviewer đã kiểm focused35/root10/diff/changed-file Prettier đạt; format rộng có ba CSS ngoài scope lỗi, giữ nguyên evidence và không tự sửa UI.

Task1 và Task2 fix đều có thể chạm deploy workflow nhưng writer tách worktree; khi integration phải xử lý xung đột theo interfaces và review toàn bộ consumer chung. Không được coi từng branch PASS thay final integrated PASS.

## Review Task3 R1 và vòng sửa

Review `mkw-cicd-review-task3-r1`: Spec/Quality Changes Requested, 0 Critical/2 Important/2 Minor. I1 post-deploy always receipt/signal vẫn inline input vào shell; I2 application-only rollback có thể đổi PostgreSQL digest. Giao sửa cả I1/I2 và M1 legacy server receipt/M2 build attestation config bằng `mkw-cicd-task3-fix-r1` trong worktree riêng. Yêu cầu actual-block payload tests, Docker stub mismatch guard, build-mode guard; không DB recovery tự đặt, không production. Reviewer xác minh 17/17 focused tests, syntax và pins upstream nhưng đó không chứng minh signature live hoặc DB rollback production.

Task1 fix commit 7805ee3 (cherry-pick 567019) reported focused40/product tooling473/root10/lint/YAML/Bash/format/diff pass; no production. Fresh review required; reconcile rollback caller overlap with Task3.

## Integrated cross-workflow fix R1

Task1 re-review: F-01–F-03 addressed, F-04 rollback shell injection, F-05 rollback backup SHA/current-state contract, F-06 frozen timestamp remain open. Task2 re-review: F1–F6 PASS, F7 post-deploy verify input interpolation High. Task3 fix `d262b40` implementer reports I1/I2/M1/M2 fixed but independent review not yet run. Integration fix dispatch `mkw-cicd-integration-fix-r1` owns the shared rollback/entrypoint/post-verify surfaces and must close F4–F7 plus preserve all prior passes. Final review only after this exact integrated snapshot.

## Integrated snapshot 47e1d7f

Integration worker completed `47e1d7fd6486cec7169874fb85110d0418db4eed` (full original+fix history from 9f89930). Report `docs/reports/2026-11-11-integration-fix.md` records focused75/root10/syntax/format pass, RED/GREEN rollback injection/SHA/frozen-clock fixtures; full tooling466/496 with missing deps and check stopped at19 historical evidence links. Environment Node24.12 below project range; not final supported-runtime verification. Final independent review dispatch `mkw-cicd-final-review-r1` Running. Separate docs/verification writer `mkw-cicd-docs-verification` owns docs-only on integrated code and attempts proper-runtime/dependency checks; no code edits while review is active. No production or live GitHub dispatch/signing/SSH; Docker Not run. Integrated code not yet accepted.

## Task4 docs và full tooling

Docs writer completed `93a8953ffe9b2d286fbbeef22981f70e88a00720` atop integrated47e1d7f. Node24.22.1 verified official checksum, pnpm12.15 locked install798 packages in own worktree. Focused75/full tooling507/root10 pass; targeted docs41 links/UTF8/format pass. `npm run check` fails19 baseline historical links; lint/product check fails3 no-useless-escape errors in integrated new tests, must fix before local code acceptance. Docker/real attestation/GitHub production settings/SSH Not run. Integration branch fast-forwarded93a8953 locally; main untouched (except earlier plan commit). Final reviewer still reviewing exact code47e1d7f; docs delta separate. Need carry lint failures to final fix worker and re-review exact final snapshot.

## Final review R1 và sửa tích hợp

Đã nhận và đọc kết quả `mkw-cicd-final-review-r1`: Spec FAIL / Quality CHANGES REQUIRED; báo cáo `.agent-reviews/final-review-r1.md`. I-01 rollback artifact/control provenance; I-02 historical verifier; I-03 backup target binding; I-04 preflight dispatch compatibility; I-05 unfiltered SSH host keys. M-01 timeout/active child; M-02 operator docs (kiểm lại delta93a8953 trước khi sửa). Các finding Important chặn acceptance, không có ngoại lệ được chấp nhận.

Ruling: sửa chung cả 5 Important, timeout và 3 lint trong một dispatch cuối theo SDD; docs M-02 đối chiếu bản mới để tránh làm lại. Giữ toàn bộ kết quả và guard trước đây. Chi phí nếu thiếu: workflow chưa được chấp nhận, phải ghi giới hạn thực tế sau scoped re-review.

Dispatch `mkw-cicd-final-fix-r1` (prefix như trên), model `gpt-6.1-sol` high, isolated worktree, base bắt buộc FF93a8953 trước code. Brief `.agent-reviews/final-fix-r1-brief.md`; worker Running. Không production/SSH/push/merge main. Next action: nhận exact commit/report, fresh independent scoped re-review cả findings/response và regression, rồi tích hợp local khi đủ gate.

## Final fix result và scoped re-review

Worker completed: code `0d350d47abe91786ee5ed5454095c59e7253e8af`, report-only tip `ab571f5d6eb6ccf46c426b380d5f73f03639b703`; base ancestry93a8953 đã đối chiếu. Report `docs/reports/2026-11-11-cicd-final-fix-r1.md` tại worktree `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-82e1ccb2`. Author báo I-01–I-05/M-01/M-02 và lint đã sửa; chưa xem là acceptance độc lập.

Author verification: tooling539/539, root10/10, root/product lint, typecheck/build/boundaries/contract, YAML/Bash/changed-format/diff đạt. Full product check dừng ở ba CSS cũ; product tests API20 pass/5 fail do gọi pnpm.exe thiếu trong runtime, sandbox32/web353 đạt; npm check vẫn19 missing historical links. Không live GitHub/SSH/signing/Docker/production.

Fresh scoped reviewer `mkw-cicd-final-rereview-r1` đã hoàn tất trên exact tip `ab571f5d6eb6ccf46c426b380d5f73f03639b703`. Báo cáo [final re-review](../../reports/2026-11-11-cicd-final-rereview-r1.md): **Spec PASS scoped / Quality PASS scoped**; I-01–I-05/M-01/M-02 fixed, không còn finding Critical/Important/Minor được chứng minh trong scope.

Independent evidence: tooling539/539, targeted59/59, root10/10, lint/YAML/Bash/changed format/diff pass. Reviewer giữ rõ giới hạn: không live GitHub/artifact API/signing/Docker/SSH/DB/production; 19 historical docs links, 3 CSS format failures và 5 API tests thiếu pnpm.exe vẫn Failed/Not run tương ứng, không chuyển thành pass.

Ruling: chấp nhận fast-forward integration local `feat/modern-cicd` tới `ab571f5` để bàn giao theo scoped gates; đã thực hiện. Không suy thành production-readiness PASS. Main vẫn `9f89930`, không push/merge main/deploy/secret change. Giữ toàn bộ worktree và evidence. Next action: owner review diff; đợt tiếp theo cần đối chiếu trusted vars/secrets/protected environment và rehearsal GitHub/Docker/SSH trong môi trường thử trước production.

## Delta: push-main continuous deployment

Người dùng đã Approved thiết kế tự động hoàn chỉnh: merge local → push `main` → quality/build → GHCR immutable image → backup → deploy VPS → verify → conditional application rollback; database restore/rollback vẫn incident route. Spec `docs/superpowers/specs/2026-11-11-push-main-continuous-deployment-design.md`, plan `docs/superpowers/plans/2026-11-11-push-main-continuous-deployment.md`, commit `96acb71` trên cùng integration branch. Plan chọn subagent-driven execution.

Ruling: triển khai theo 5 task tuần tự, mỗi task có focused tests, review độc lập và chỉ tích hợp local; giữ manual recovery routes, không production mutation. Auto rollback chỉ được phép khi migration/schema state được chứng minh không đổi/không uncertain; PostgreSQL digest trùng một mình không đủ.

Task 1 `mkw-push-main-task1` completed commit `f9efda4d1df2bbfb3fb81fafa915cc63167a75dd` in isolated worktree `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-c7a27d6e`; report `docs/reports/2026-11-11-push-main-task1.md`. Review `mkw-push-main-task1-review-r1` verdict Spec/Quality REQUEST CHANGES: P1 release blocker because quality prerequisite still failed on three CSS baseline files, preventing all automatic release stages. Other Task1 topology/output/guard checks passed (focused63/63, full tooling554/554, actionlint/YAML/Bash/diff).

Fix round `mkw-push-main-task1-fix-r1` completed source `a421d57` plus report tip `e6d24eeaf3336061f8ca75398b737ba2da07c772` in `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-b3b778bd`; formatted exactly the 3 CSS blockers and added LF normalization rule. Review R1 found only author-report trailing blank line; report-only fix e6d24ee was independently re-reviewed `mkw-push-main-task1-review-r2-report`: **Spec PASS / Quality PASS**, `git diff --check` pass, no source changes in final delta. Task1 is integrated local at e6d24ee. Worker/reviewer evidence: format, focused63/63, tooling554/554, lint/type/build/boundaries/contract, YAML/Bash/actionlint/root/diff pass; known19 historical links/5 Windows pnpm.exe API limitations remain documented.

Task2 may now start from e6d24ee. Scope: registry pull/auth and immutable digest handoff; preserve Task1 push-main outputs and all existing target/SSH/backup/attestation guards. No auto rollback/schema work in Task2.

Task2 initial commit `6027dbf50e0ef56a7f95461c1b4894c21b122dac` review found I-01 (manual rollback omitted private GHCR pull contract). Fix completed `bd075286920f00606eb394a01a439bc4ffa17175`; worker added rollback forwarding and non-default token-path fixture, focused33/33, tooling559/559, lint/format/YAML/actionlint/Bash/diff pass; report `docs/reports/2026-11-12-push-main-task2-fix-r1.md`. Fresh re-review `mkw-push-main-task2-fix-review-r1`: **Spec PASS scoped / Quality PASS scoped**, I-01 fixed. Task2 integrated local at bd07528. Known live GHCR/Docker/SSH/VPS/DB not run; type/build/contract prior environment pnpm shim limitation remains evidence.

Task3 may now start from bd07528. Scope: automatic backup/verify and idempotent orchestration (push queue, rerun, stale source, timeouts, no later stage); preserve registry Task2 and all prior guards. No auto rollback/schema work in Task3.

Task3 `mkw-push-main-task3` completed `302e3666ec8ca599dccf35961b1c1ac318c39225` in `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-13a9ee1f`; report `docs/reports/2026-11-12-push-main-task3.md`. Worker reports focused71/71, tooling571/571, lint/format/type/build/boundaries/contract/YAML/actionlint/diff/root pass; existing dirty CSS preserved. Review `mkw-push-main-task3-review-r1`: **Spec PASS / Quality PASS, 0 findings**, focused39/39 and tooling571/571; live GitHub/GHCR/Docker/SSH/VPS/DB not run. Task3 integrated local at302e366.

Task4 may now start from302e366. Scope: conditional application rollback with schema/migration guard, one-attempt recovery, no DB restore/down migration; preserve Tasks1–3. This is the last implementation task before integrated final review/rehearsal.

Task4 `mkw-push-main-task4` initial code `a34b86c`, report tip `7cc0dfb7d1c63c8194896ec0ac7dcd4a9d69a978` from base6711190 in `C:/Users/Tuan/.t3/worktrees/minh-khue-workforce/t3-49db08e7`. Review Spec FAIL / Quality CHANGES REQUIRED found Critical unsafe `migration-only` default, Important invalid DB evidence promoted verified/`already-deployed`, Important incomplete current artifact ownership, plus Prettier failures in schema/report. Fix follow-up ordinal2 `mkw-push-main-task4-fix-r1` Running; must add producer-backed evidence, hard fail invalid snapshots, canonical current ownership validation, and format files. Task5/final review blocked until fresh re-review passes.

Task4 fix R1 completed exact tip `4f8f8c95afe57a1db233c64a02b91024e2ba0ad8`; report `docs/reports/2026-11-12-push-main-task4-fix-r1.md`. Author reports focused72/72, tooling643/643 and lint/format/type/build/contract/boundaries/YAML/Bash/actionlint/diff pass; 19 historical links and 5 Windows API pnpm.exe failures remain. No live systems were run. Independent fresh review `mkw-push-main-task4-fix-review-r2` completed on exact tip: **Spec PASS / Quality PASS**, no Critical/Important/Minor findings; focused72/72, adversarial59/59, tooling643/643, root10/10 and syntax/format checks pass. Task4 is integrated locally at `4f8f8c9`. Material limitation remains: deployment journals retain unknown data operations because no independent producer exists; automatic rollback refuses those operations. Fixture-only healthy recovery is not live capability evidence. Ruling: accept Task4 for local implementation/review gates because fail-closed incident routing is the approved safety behavior; defer producer activation and live rehearsal to Task5/activation, with no claim of production readiness.

## Task5 và các gap còn lại

Task5 author completed docs-only tip `47db61f6867e14be7256b2a22ea52174fa787849` from `d8dd9fb`; report `docs/reports/2026-11-11-push-main-cd-verification.md`. Author: focused57/root10/tooling643, lint/format/type/build/boundaries/contract/syntax PASS; baseline19 links/5 Windows API fixtures remain. Local integration was fast-forwarded provisionally to this docs snapshot before review; this is not acceptance. Fresh independent `mkw-push-main-task5-review-r1` Running; final whole-branch review remains Pending.

Read-only research `mkw-push-main-data-evidence-research` confirmed missing producer is an implementation gap, not a secret/settings prerequisite. Task5 additionally identified missing manual recovery environment separation and local Docker matrix. Ruling: supersede earlier deferral of producer to activation — these source/rehearsal gaps must be completed under the already approved full-workflow scope before handoff; no weakening evidence or claiming docs equal capability. Local Docker Desktop/rehearsal is authorized by the original user request; no production access is authorized.

Implementation `mkw-push-main-completion-gaps` Running, base47db61f, isolated worktree, gpt-6.1-sol high, no nested delegation. Scope: producer-backed eligible Web-only release/recovery with unchanged API/PG identities, canonical policy/artifact/runtime evidence, manual recovery environment separation, and real disposable local Docker backup/recovery/refusal rehearsal. Unknown/API-changing or unsafe operations remain incident-only. Worker must record design/plan amendment and tests before changes, update docs, and report exact tip. Fresh independent review and whole-branch review required before acceptance. Do not push/merge main/configure GitHub/SSH/deploy production.

Task5 review result: **Spec FAIL / Quality CHANGES REQUIRED**. Three Important findings confirm the same gaps; one Minor documentation mismatch: checklist backup ID example must include `-release` or `-app-rollback` purpose suffix per `.github/workflows/backup.yml:218`. Reviewer evidence: focused57, tooling643, root10, docs/links/format/YAML/Bash/actionlint pass; npm historical19 links and Windows API limitations remain. Finding responses delivered to completion worker; no acceptance until fresh review exact completion tip.

Completion `5a5127a` implemented producer/environment/Docker/docs gaps; independent completion review found one Important: invalid gateway promotion could seed LKG. Fix tip `0b0883b43386521e3500c9f98608be7e1f6a3827` passed fresh scoped review `mkw-push-main-completion-fix-review-r1`: **Spec PASS scoped / Quality PASS scoped**, no findings. Independent focused149/149, mutations78/78 rejected, tooling690/690, changed lint/format/diff and real Docker rehearsal PASS. Full web/API outside scoped re-review; prior web timeout and Windows API errors remain recorded. Local integration fast-forwarded to0b0883b; ledger checkpoint2723826. Main untouched; no production/settings/push.

Final whole-branch reviewer `mkw-push-main-final-integrated-review-r1` Running, exact tip2723826, range9f89930..2723826, gpt-6.1-sol high, isolated worktree. Includes full prior findings/responses, regression boundaries, producer/LKG and activation limits. No acceptance of final integration until review completes; no duplicate reviewers or writers currently dispatched.

## Final integrated review và sửa

Final whole-branch review trên2723826: **Spec FAIL / Quality CHANGES REQUIRED**. I1 direct manual deploy thiếu canonical producer resolver; I2 BACKUP thiếu trusted targetIdentity; I3 manual verify ghi đè v2 state bằng record rút gọn; I4 latest rerun attempt phá immutable producing attempt; I5 signing-off làm Web-only release lỗi thay vì build thường; M1 deploy README stale. Chưa có ruling bỏ qua finding nào.

Fix `mkw-final-integrated-fix-r1` ordinal3 bị cancel khi còn full tooling/commit; resume ordinal4 taskId prefix `node:delegated-task:command%3Amcp%3A66e979a7-f9f1-4f0a-a59c-e53f943b74f7%3Athread-send%3Amkw-final-integrated-fix-r1-resume` completed. Implementation `f4b132559abd785b4dbbed17b6c842ca3b449eaf`, report tip `8adba91113319f766856954c598a8e918e92cf53`; worktree sạch. Report `docs/reports/2026-11-12-push-main-integrated-fix-r2.md`. Author: focused103/full tooling705 serial PASS, real Docker with manual-state/rerun/normal migration PASS; other scoped checks PASS. 19 historical links, 5 Windows API child-process failures and timing history remain recorded, no live GitHub/GHCR/VPS/production proof.

Fresh scoped final-fix review `mkw-final-integrated-fix-r2-review` Running; taskId prefix `node:delegated-task:command%3Amcp%3A66e979a7-f9f1-4f0a-a59c-e53f943b74f7%3Adelegate-task%3Amkw-final-integrated-fix-r2-review`. Exact tip8adba911/base2723826; brief includes original scope, all six findings/responses and earlier LKG guard requirements. Integration still2723826 pending review; no further whole-branch review loop unless new regression justifies it. No push/main merge/production.

Scoped review completed: **Spec PASS scoped / Quality PASS scoped**, no findings. Reviewer verified all six fixes, 134/134 and 130/130 focused serial runs, 23/23 mutation probes rejected, retained 705/705 tooling and Docker evidence; live GitHub/GHCR/SSH/VPS/production remain Not run. Fast-forward integration to `8adba91113319f766856954c598a8e918e92cf53` completed locally. Ledger commit remains pending. Fresh final whole-branch re-review required on exact integrated tip before acceptance.

Ledger checkpoint `42c143d`. Authoritative final acceptance `mkw-push-main-final-acceptance-review-r3` completed **Spec FAIL / Quality CHANGES REQUIRED**, one Important: manual coordinator/direct deploy/verify drops exact producing attempts and artifact archive digests; remote journal gets empty values. Parent verified actual coordinator/resolver/workflow code before dispatch. Reviewer fresh root10/syntax/lint/YAML/diff PASS; fresh tooling698/702 with missing dependency/login setup errors and checkout CSS EOL issues are not product regression evidence. Retained705 tooling/Docker remains separate evidence. Prior six findings remain addressed.

Bounded fix `mkw-manual-provenance-final-fix`, prefix `node:delegated-task:command%3Amcp%3A66e979a7-f9f1-4f0a-a59c-e53f943b74f7%3Athread-send%3Amkw-manual-provenance-final-fix`, ordinal5 in existing writer worktree, Running from42c143d. Scope only canonical exact attempt/digest resolution and propagation across manual coordinator/direct deploy/verify/backup/remote, preserving immutable rerun producing attempt and normal automatic path. Fresh scoped review required; no new whole-branch loop without evidence of new regression. Local acceptance pending; production Not run.

Manual provenance fix completed: implementation `e20d0bf0ec3709248448806d1a66b983cbd247c5`, report tip `cf7cf909caf7f810fbd28d241e08195a3018b150`, clean writer worktree. Report `docs/reports/2026-11-12-manual-provenance-fix.md`; RED20/21 expected, GREEN24/24, tooling726/726, root10/10, lint/format/YAML/Bash/actionlint/diff PASS. Actual archive bytes checksum and producing attempt resolution/propagation covered; Docker/build evidence retained, not rerun. Known19 links/5 Windows API errors and external live limits unchanged. Fresh independent `mkw-manual-provenance-final-fix-review` Running, exact base42c143d/tipcf7cf909, full finding/responses in brief. Integration remains42c143d pending review.

## Candidate filter fix và acceptance local

Bản sửa cuối là `27f911697b081f1c5ddc3c26b9511b7f8ecf5ee9`, đã fast-forward từ `42c143d` qua manual provenance/rerun fixes. Coordinator lọc candidate không canonical theo identity trước exact resolver; candidate canonical vẫn kiểm producing attempt, owner, metadata, digest và ambiguity. Artifact attempt1 hợp lệ vẫn dùng được khi latest failed/in-progress; artifact cùng tên từ producer sai không làm dừng discovery.

Fresh independent review `mkw-candidate-filter-fix-review-r1`: **PASS — no blocking findings**. Reviewer tái hiện RED3 trên base; exact tip focused100/100 và tooling761/761 PASS; lint/Prettier/syntax/diff PASS. Mixed candidates chọn artifact101 attempt1; attempt2 và tuple runId/runAttempt/artifactId/artifactDigest vẫn truyền qua các consumer. Mismatch/malformed/ambiguity vẫn bị từ chối. Node24.12 chạy full tooling đạt nhưng dưới project range; focused100 đạt trên Node22.12 được hỗ trợ. Author tooling761 đạt Node24.22.1. Không đánh đồng các môi trường.

Coordinator kiểm tra sau tích hợp tại worktree này: `node --test --test-concurrency=1 tests/product-tooling/release-coordinator-policy.test.mjs` **40/40 PASS**, `git diff --check` PASS. Combined run với manual-provenance trước đó Failed vì thiếu apps/api/node_modules/exceljs; `pnpm install --frozen-lockfile` Failed do launcher local thiếu executable. Không coi lỗi setup này là test PASS; full evidence độc lập tại exact tip giữ nguyên.

Ruling: chấp nhận code/review gates local trong phạm vi evidence trên, không còn finding chặn đã biết. Giới hạn: 19 historical docs links, 5 Windows API child-process errors và lịch sử web timeout vẫn được giữ; Docker evidence từ rehearsal trước, không chạy lại cho metadata/filter delta. Live GitHub/GHCR signing/SSH/VPS/DB/production Not run. Main vẫn9f89930; không push/merge main/settings/secrets. Primary dirty/untracked không thuộc task được bảo toàn. Next action: bàn giao branch feat/modern-cicd, checklist activation tại docs/operations/release-checklist.md; activation ngoài phạm vi local chưa thực hiện.

## Simplification implementation checkpoint (2026-11-12)

Writer changes are local on `t3/simplify-main-release-cicd`, base `f024b5b`. The automatic path now has jobs `quality → (build + BACKUP) → deploy → verify → release-status`; `preflight`, current-state/LKG adoption, API reuse, gateway/schema proof production and automatic rollback are absent from `main-release.yml`. Build always pushes API and Web images and emits exact digest outputs. Deploy/verify receive `MKW_SIMPLE_RELEASE`; the trusted entrypoint keeps remote flock, exact pull/RepoDigest, BACKUP freshness/target checks, forward migration, Compose wait and smoke while skipping journal/LKG promotion. Manual workflow routes retain their existing protected controls.

Current tests: `node --test --test-concurrency=1 tests/product-tooling/simplified-release-policy.test.mjs` 4/4; scoped deploy/receipt behavior 6/6; workflow YAML parsed with Python PyYAML; `git diff --check` pending final snapshot. Bash syntax could not run from this Windows shell because `/bin/bash` is unavailable; the Git Bash-backed behavior test suite did execute its own fixture runner. Live GitHub/GHCR attestation, SSH/VPS/DB and Docker Desktop rehearsal are not run in this worker. Parent must run fresh independent review on the exact commit and perform any authorized disposable Docker rehearsal.

Docs current route: `docs/operations/release-checklist.md`, `product-release-runbook.md`, `product-rollback-runbook.md`, and `deploy/README.md`; old design/report evidence remains untouched and is explicitly superseded for normal push-main.

## Simplification final worker snapshot (2026-11-12)

Added explicit `MKW_SIMPLE_RELEASE` propagation to the SSH post-deploy verifier and a policy assertion for it. Focused affected suite: **31/31 pass** (`simplified-release-policy`, deploy-entrypoint, task3 receipt behavior, release workflow, final review boundaries). `npm run check:skills` passed; all 9 workflow YAML files parsed; `node --check scripts/product/local-rehearsal-driver.mjs` passed; Git Bash `bash -n` passed for changed shell scripts; `git diff --check` passed. Full `npm run product:test:tooling` was attempted; unrelated historical tests remain blocked/failing where workspace dependencies are absent (`eslint`, `dependency-cruiser`, `typescript`, `exceljs`, app API setup) and existing benchmark login fixtures return 401. No production/live GitHub/GHCR/SSH/VPS/Docker rehearsal was run in this worker. Exact commit is recorded after the final local commit; parent must perform fresh independent review on that exact tip.

## Simplified CI/CD fix R1 (2026-11-12)

Review of the previous tip found three concrete issues. R1 removes the simple verifier's state-file mount/read and verifies receipt operation correlation, exact runtime images/health, migration status and smoke; it keeps legacy non-simple recovery branches separate. The deploy entrypoint now starts only the healthy DB with `--no-deps`, runs forward `prisma migrate deploy`, and gates the later full Compose apply on successful migration. Unused rehearsal code and regex/format issues were corrected. `apps/api` already declares `pg` 8.23.1 and the lockfile contains it; dependencies were installed with Corepack pnpm from the locked graph.

Evidence is recorded in [simplified CI/CD fix R1](../../reports/2026-11-12-simplified-cicd-fix-r1.md). Focused tests are 23/23 and full product tooling is 765/765; product lint and format checks pass. Docker rehearsal is Not run because Docker Desktop's Linux engine was unavailable. No live GitHub/GHCR/SSH/VPS/production mutation occurred. Parent must fresh-review the exact final commit.
