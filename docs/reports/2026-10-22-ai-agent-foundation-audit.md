# Khảo sát nền tảng AI Agent SellerFlow và phương án chuẩn bị Minh Khuê

Ngày: 22/10/2026. Phạm vi: **hệ thống phục vụ AI Agent phát triển phần mềm**, không phải tính năng AI bên trong ứng dụng.

Nguồn khảo sát: `D:/TinHoc/sellerflow-hub-docs-pack-v1`.
Project nhận báo cáo: `D:/TinHoc/minh-khue-workforce`.

Trạng thái: **Báo cáo khảo sát và đề xuất**, chưa là lệnh cài đặt, chính sách đã duyệt hay kế hoạch triển khai được chấp thuận. Người dùng mới giao khảo sát lại nền tảng Agent. Không tự mở rộng sang thiết kế chấm công, chọn stack ứng dụng hoặc cài bộ skill.

## 1. Kết luận chính

SellerFlow có một nền tảng Agent gồm **quy tắc repository + phương pháp làm việc + skill chuyên môn + hồ sơ task + công cụ thực thi/kiểm tra + cơ chế cách ly và bảo toàn tài nguyên**. Muốn chuẩn bị Minh Khuê đầy đủ theo hướng này phải chuẩn bị cả sáu phần, không chỉ chép thư mục tài liệu hay cài Superpowers.

SellerFlow có thể hướng dẫn Agent tự tiếp tục trong một task đã được duyệt: đọc ngữ cảnh → lập/thực hiện kế hoạch → test → review → sửa → xác minh → bàn giao. Điều đó không đồng nghĩa có một dịch vụ tự chạy 24/7, tự hiểu mọi yêu cầu, tự khởi động lại sau khi ứng dụng đóng, hay được tự đẩy mã và triển khai production.

Khuyến nghị cho Minh Khuê: xây một nền tảng Agent riêng, tham chiếu cấu trúc SellerFlow, ghim một nguồn methodology, viết lại quy tắc/chuyên môn cho project và kiểm chứng bằng pilot. Phần nền tảng có thể bắt đầu trước ứng dụng; các khả năng như kiểm thử app/DB thật được nghiệm thu sau khi có môi trường tương ứng.

## 2. Khảo sát lần này khác lần trước ở đâu?

Lần này tập trung vào:

- Agent bắt đầu công việc bằng cách nào và đọc nguồn nào.
- Bộ skill hiện hành làm gì, bộ nào đã nghỉ sử dụng.
- Cách giao task, lưu tiến độ, chuyển phiên, review và hoàn tất.
- Các script thực sự hỗ trợ tự động hóa được đến đâu.
- Công cụ/model nào được runtime hiện tại công bố, không suy ra từ tài liệu.
- Bằng chứng nào đã chạy lại trong lần khảo sát này, bằng chứng nào chỉ là hồ sơ cũ.
- Bộ đầu ra cần chuẩn bị để Agent ở Minh Khuê có thể làm việc có kiểm soát.

Không khảo sát toàn diện source ứng dụng SellerFlow, không khởi động web/API/DB, không đăng nhập tài khoản, không gọi provider bên ngoài để thử chức năng, không tạo subagent, lịch chạy hoặc worktree mới.

## 3. Mốc nguồn và bằng chứng mới

### 3.1. Trạng thái repository nguồn

- HEAD đọc được: `5477dce80c55c42f4b612479296d22574a177266`, nhánh `main`.
- Git có sẵn hai thay đổi local: `docs/ai/DEPLOYMENT_AND_RELEASE.md` và `docs/vi/DEPLOYMENT_AND_RELEASE.md`; khảo sát không sửa chúng.
- Các script governance, distribution, workspace/resource và bộ test tooling đã được Git theo dõi.
- Commit checkpoint `d5736ff5ad79d219dc0047fc73e41968b0622338` là ancestor của HEAD hiện tại.

Điểm này bổ sung cho báo cáo trước: không nên lấy câu “primary unchanged/integration pending” trong hồ sơ cũ để khẳng định Git hiện tại chưa có công cụ. **Git hiện tại đã có các commit công cụ; hồ sơ closeout vẫn còn lời ghi pending.** Chưa đủ bằng chứng để xác nhận toàn bộ review cuối, cleanup và nghiệm thu đã hoàn tất.

### 3.2. Kiểm tra đã thực hiện trong lần khảo sát này

| Kiểm tra | Kết quả mới | Ý nghĩa thực tế |
| --- | --- | --- |
| `node --version` | `v22.12.0` | Node đang chạy được trong terminal |
| `git --version` | `2.54.0.windows.1` | Git đang chạy được |
| `node scripts/agent-tooling/distribution.mjs` | Exit 0; 15 skill Superpowers + 2 bộ UI khớp manifest | Nội dung gói local và license/reference được checker chấp nhận |
| `node scripts/agent-tooling/governance.mjs` | Exit 0; 28 skill có thể khám phá theo checker | Metadata, mirror và routing cấu trúc nhất quán |
| Bộ test tập trung, lệnh bên dưới | **19/19 đạt**, 0 failed/skipped/cancelled | Kiểm tra gói skill, governance, domain reference, check entrypoint và kiểm soát artifact theo các assertion hiện có |
| T3 `orchestrator_capabilities` | Có catalog/provider và khả năng điều phối | Discovery thành công; chưa chứng minh một child task đã thực hiện thành công |

Lệnh test đã chạy từ SellerFlow:

```text
node --test --test-concurrency=1 tests/agent-tooling/superpowers-distribution.test.mjs tests/agent-tooling/governance.test.mjs tests/agent-tooling/ui-packages.test.mjs tests/agent-tooling/domain-references.test.mjs tests/agent-tooling/check-entrypoint.test.mjs
```

Không chạy `--sync`, không sửa cấu hình global, không cài dependency. Các test chọn lọc tạo fixture tạm theo mã test; không vận hành tài nguyên ứng dụng thật. Không chạy lại toàn bộ 57 test tooling, workspace/process pilot, browser app, unit/build/lint của sản phẩm hoặc DB.

### 3.3. Bằng chứng lịch sử, không phải kết quả mới

`scratchpad/task-dossiers/workflow-modernization/validation.md` ghi:

- Full serial tooling 57/57 đạt trong đợt ngày 19/10/2026.
- API unit 81/81, AI Runtime unit 11/11 và ba app typecheck/build đạt trong đợt ghi nhận đó.
- `pnpm check` vẫn thất bại ở lint; baseline ghi 679 lỗi/47 cảnh báo.
- Browser fixture từng đạt 6/6; không phải web/API/DB/provider thật.
- Docker/DB được người dùng bỏ qua cho scope bàn giao đó.
- Pilot ngắt một process worker hữu hạn không chứng minh Agent AI tự khôi phục sau crash.

Các số này chỉ mô tả checkpoint và scope trong hồ sơ. Không chuyển thành kết luận “SellerFlow hiện tại pass toàn bộ”. Task lint riêng vẫn ghi Open, chưa bắt đầu triển khai.

## 4. Bản đồ nền tảng Agent SellerFlow

| Lớp | Thành phần cụ thể | Agent dùng để làm gì? |
| --- | --- | --- |
| Điểm vào | `README.md`, `AGENTS.md`, `CLAUDE.md` | Nhận diện project, quyền và cách làm việc đúng môi trường |
| Nguồn có thẩm quyền | `CURRENT_AUTHORITY_MAP.md`, `AI_DOC_ROUTING_MATRIX.md` | Chọn tài liệu đúng, tránh dùng lịch sử hoặc test thay quyết định nghiệp vụ |
| Phương pháp | `.agents/skills/` nhóm Superpowers | Làm rõ, lập kế hoạch, thực hiện, debug, test, review, hoàn tất |
| Chuyên môn | 11 skill SellerFlow và 2 bộ UI | Bổ sung kiến thức/ràng buộc project vào quy trình chung |
| Kiểm soát phân phối | Manifest nguồn/hash/license; `.claude/skills/` | Ghim phiên bản, phát hiện drift, sinh mirror tương thích |
| Đầu vào task | `TASK_TEMPLATE.md`, `templates/chat-starters/` | Giao đủ mục tiêu, scope, acceptance và quyền |
| Bộ nhớ công việc | `scratchpad/task-dossiers/` | Khôi phục yêu cầu, quyết định, trạng thái và bằng chứng |
| Trạng thái thực thi tạm | `.superpowers/sdd/<plan>/` do script tạo | Ledger tiến độ, brief, review package và log theo kế hoạch |
| Cách ly Git | Worktree/branch + `scripts/agent-workspace.ps1` | Tách việc ghi, xác minh sở hữu và điều kiện cleanup |
| Tài nguyên test | `agent-test-environment.ps1`, supervisor, `WindowsJob.cs` | Quản lý process thuộc task, cổng và hồ sơ tài nguyên |
| Cổng kiểm tra | `agent-check.mjs`, script app và test tooling | Chạy đúng check, không tính preflight là test pass |
| Bằng chứng UI/HTTP | Browser thực tế, Playwright, HTTP specialist | Xác minh hành vi thay vì chỉ nhìn source/build |
| Điều phối runtime | Công cụ subagent/T3 do phiên làm việc cung cấp | Dispatch, theo dõi và nhận kết quả nếu được phép sử dụng |
| Lưu trữ cũ | `archive/agent-workflow/`, history dossier | Tra cứu provenance; không dùng làm prompt thực thi hiện hành |

Lưu ý: “workspace” trong Superpowers có thể chỉ **thư mục artifact tạm của kế hoạch**; Git worktree là **checkout mã nguồn riêng**. Hai khái niệm này không phải một. Việc xóa artifact tạm cũng không tự cho phép xóa worktree hay bằng chứng cần giữ.

## 5. Bộ quy tắc điều khiển Agent

### 5.1. `AGENTS.md` sở hữu các quyết định gì?

SellerFlow đặt tại đây:

- Nguồn chuẩn là docs tiếng Anh; bản tiếng Việt phải đồng bộ.
- Không tự đặt nghiệp vụ, field, trạng thái hoặc hành vi provider.
- Bảo toàn file dirty/untracked và công việc khác.
- Quy định phase, ranh giới layer và migration DB.
- Chọn methodology/skill, nguồn skill và cách mirror.
- Trước sửa phải biết scope, risk, base commit, acceptance, writer/review/integration route.
- Writer có worktree riêng; thay đổi mức trung bình trở lên cần reviewer độc lập trên đúng `base..tip`.
- Quyền tự làm local và những hành động không tự động được phép.
- Các check phải chạy và cách báo Verified/Failed/Not run/Blocked.
- Giữ UTF-8, đọc source/log có chọn lọc, không tuyên bố kết quả vượt bằng chứng.

`CLAUDE.md` chỉ là cửa vào tương thích cho Claude, dẫn về các nguồn trên. Nó không tạo một bộ luật project riêng.

### 5.2. Điều kiện để Minh Khuê có một bộ rule tốt

Cần ngắn ở điểm vào và dẫn tới nơi sở hữu chi tiết. Không chép checklist vào cả AGENTS, task template, skill và tài liệu workflow. Mỗi loại quy tắc phải có một nơi sở hữu, ví dụ:

- Quyền thực hiện: một chính sách quyền.
- Nghiệp vụ: tài liệu sản phẩm sau này.
- Thứ tự phương pháp: methodology được chọn.
- Cách chạy công cụ: adapter/runtime guide.
- Kết quả của một lần chạy: validation của task.

Khi gặp mâu thuẫn, Agent phải biết nguồn nào ưu tiên và phần nào cần người dùng quyết định; không yêu cầu Agent tự hòa giải một quyết định nghiệp vụ quan trọng bằng suy đoán.

## 6. Danh mục 28 skill hiện hành

### 6.1. 15 skill Superpowers: phương pháp làm việc chung

| Skill | Vai trò |
| --- | --- |
| `using-superpowers` | Bootstrap và chọn skill theo công việc/môi trường |
| `brainstorming` | Khám phá yêu cầu, lựa chọn và thiết kế trước triển khai |
| `writing-plans` | Chia kế hoạch thành việc cụ thể có cách kiểm tra |
| `executing-plans` | Agent chính thực hiện kế hoạch trong phiên hiện tại |
| `subagent-driven-development` | Giao phần triển khai cho child agent và review theo task |
| `dispatching-parallel-agents` | Phân công việc độc lập khi môi trường và quyền cho phép |
| `systematic-debugging` | Tìm nguyên nhân lỗi bằng bằng chứng trước khi sửa |
| `test-driven-development` | Kiểm tra hành vi thay đổi theo chu trình test thất bại rồi đạt |
| `requesting-code-review` | Chuẩn bị và yêu cầu review có ngữ cảnh riêng |
| `receiving-code-review` | Đánh giá và xử lý phản hồi review |
| `verification-before-completion` | Chạy và đọc bằng chứng trước khi tuyên bố hoàn thành |
| `finishing-a-development-branch` | Lựa chọn đầu ra nhánh, tích hợp/giữ lại và cleanup phù hợp |
| `using-git-worktrees` | Kiểm tra/tạo môi trường mã nguồn cách ly |
| `writing-skills` | Viết và đánh giá skill mới |
| `diagnosing-superpowers` | Phân tích session vận hành quy trình sai hoặc kém hiệu quả |

Manifest ghim `obra/superpowers`, phiên bản `v6.4.2`, commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`. Check hash local mới đã đạt; đây không phải audit bảo mật hay xác minh độc lập toàn bộ upstream qua mạng.

### 6.2. 11 skill SellerFlow: ràng buộc riêng của project

| Skill | Mục đích | Hướng xử lý cho Minh Khuê |
| --- | --- | --- |
| `sellerflow-requirement-analyst` | Actor, acceptance và dữ liệu chưa rõ | Viết lại; có thể dùng ngay cho khám phá nền tảng/project |
| `sellerflow-delivery-planner` | Ranh giới file/module/phase và handoff | Viết lại routing; không giữ module SellerFlow |
| `sellerflow-module-router` | Xác định phần source sở hữu vấn đề | Chuẩn bị cấu trúc, hoàn thiện khi có source Minh Khuê |
| `sellerflow-phase-gate` | Chặn scope vượt roadmap | Viết theo roadmap nền tảng Agent trước, sản phẩm sau |
| `sellerflow-contract-guard` | Bảo vệ contract, tránh tự thêm payload/status | Viết lại sau khi có contract thật; không bịa contract để điền skill |
| `sellerflow-db-architecture-planner` | Phân tích chiến lược DB | Giữ nguyên tắc; thay nội dung domain khi có yêu cầu |
| `sellerflow-db-risk-reviewer` | Review rủi ro DB/migration | Viết lại tham chiếu và điều kiện bằng chứng |
| `sellerflow-controlled-doc-editor` | Proposal, quyền sửa tài liệu chuẩn, đồng bộ | Chốt chính sách Minh Khuê trước khi áp dụng |
| `sellerflow-reviewer` | Review domain/ownership/contract/migration | Viết checklist nền tảng trước, bổ sung domain sau |
| `sellerflow-http-behavior-tester` | HTTP evidence trong môi trường được phép | Viết lại quyền target/tài nguyên; thử khi có route mẫu |
| `sellerflow-server-debugger` | Kế hoạch chẩn đoán server thủ công | Chỉ bổ sung khi có vận hành; không tự cấp quyền SSH/deploy |

Các specialist là **phần bổ sung** cho methodology, không nên dựng thêm một lifecycle analyst → planner → worker cạnh tranh với Superpowers.

### 6.3. Hai bộ UI

- `impeccable`: nguồn chuyên môn chính cho thiết kế và review UI trong SellerFlow.
- `ui-ux-pro-max`: tham chiếu/search có chọn lọc.

Manifest UI riêng lưu provenance/license/hash; bản này là snapshot local có quản lý. Nếu đưa sang Minh Khuê phải giữ nguồn/license, xác minh dependency script và bỏ tham chiếu identity/tokens SellerFlow. Có package không đồng nghĩa đã có browser hoặc đã kiểm tra UI thật.

### 6.4. Bộ cũ không dùng làm nền tảng hiện hành

`sellerflow-ba-pm-planner-lite`, `sellerflow-bug-triage`, `sellerflow-implementation-worker`, `sellerflow-system-requirement-interviewer` nằm trong nhóm đã nghỉ sử dụng. Archive có thể giữ kiến thức lịch sử nhưng không được tự discovery như skill hoạt động.

## 7. Luồng Agent thực sự được thiết kế để chạy

### 7.1. Nhận việc và khôi phục ngữ cảnh

1. Nhận mục tiêu, scope và quyền từ người dùng.
2. Đọc entrypoint → authority/routing → bộ tài liệu liên quan tối thiểu.
3. Tìm dossier/plan đã có; tái sử dụng phê duyệt và quyết định, không phỏng vấn lại từ đầu.
4. Kiểm tra source/schema/tests cần thiết; ghi sự thật đã quan sát và giả định còn mở.
5. Làm rõ phần thực sự chặn tính đúng; tiếp tục phần độc lập đã được giao.

### 7.2. Lập kế hoạch và chọn cách thực hiện

Có hai đường chính:

- **Agent chính thực hiện:** ít chi phí điều phối, có review độc lập cuối theo yêu cầu project.
- **Có child agent:** giao brief gọn và đủ, đúng base/workspace, kiểm tra kết quả từng task và review tổng thể.

Không cần nhiều agent cho mọi việc. Không được tự coi tool có trong catalog là đã được người dùng cho phép chạy một đợt nhiều agent. Khảo sát này chỉ discovery, không dispatch.

### 7.3. Triển khai và kiểm tra

Agent làm trong scope/branch được giao; chạy check thực tế; khi lỗi thì tìm nguyên nhân và sửa trong giới hạn quyền. Mỗi kết quả phải ghi lệnh, trạng thái, môi trường và giới hạn. Không dùng ảnh screenshot thay test quyền/API, hoặc dùng mock test thay DB thật.

### 7.4. Review và sửa

SellerFlow yêu cầu thay đổi mức trung bình trở lên có reviewer độc lập, ngữ cảnh sạch, đọc full SHA `base..tip`. Thay đổi sau review phải được kiểm lại trên tip mới theo quy tắc project. Test và tự review không được ghi thành review độc lập.

### 7.5. Bàn giao và tiếp tục

Hồ sơ cuối cần cho biết: đã làm gì, bằng chứng nào đạt, phần nào chưa chạy/thất bại, commit cuối, trạng thái tích hợp, tài nguyên đang giữ và bước tiếp theo. Nếu giữ worktree thì ghi giữ vì sao; nếu xóa phải xác minh đúng sở hữu và hậu điều kiện. Đóng task không đồng nghĩa tự push/deploy.

## 8. Hồ sơ và bộ nhớ để Agent không làm lại từ đầu

### 8.1. Hồ sơ bền vững

SellerFlow dùng:

```text
scratchpad/task-dossiers/<task>/
  INDEX.md
  approved/requirements.md
  technical/implementation-plan.md
  decisions.md
  validation.md
  history/                       # chỉ nếu cần audit lịch sử
```

`INDEX` trỏ đúng yêu cầu đã duyệt, next action và resource/ownership. Yêu cầu không trộn log. History không tự trở thành yêu cầu hiện hành.

### 8.2. Ledger và artifact tạm của kế hoạch

Các script Superpowers quan sát được:

- `sdd-workspace`: tạo/chọn thư mục artifact cho đúng plan, có marker đường dẫn plan để giảm nhầm ledger.
- `task-brief`: trích brief từng task.
- `task-start`: trả brief và BASE hiện tại.
- `task-done`: chạy lệnh kiểm tra, chỉ ghi complete vào ledger nếu lệnh đạt.
- `review-package`: sinh commit list/stat/diff theo BASE..HEAD, chặn khoảng review rỗng hoặc sai ancestry.

Các script này là Bash, không phải PowerShell. `Get-Command` tìm thấy đường dẫn bash/python/pnpm nhưng **chưa chạy kiểm tra tương thích toàn bộ chuỗi Bash/Python/pnpm**; executable tồn tại hoặc alias hiện ra không chứng minh toolchain hoạt động.

Ledger chỉ có giá trị nếu test command và scope đúng. Script báo pass không tự chứng minh acceptance đầy đủ. Các log/report quan trọng phải được chuyển vào nơi giữ bằng chứng trước cleanup, không để bằng chứng duy nhất trong thư mục tạm có thể bị xóa.

### 8.3. Resume không đồng nghĩa tự hồi sinh

Hồ sơ + ledger giúp một Agent đang được chạy lại tiếp tục đúng chỗ. Muốn tự chạy lại khi app đóng, provider lỗi hoặc máy khởi động lại phải có runtime/scheduler/trigger và chính sách phục hồi thực sự. Trong phạm vi khảo sát chưa có bằng chứng SellerFlow đã hoàn thành một vòng crash/resume của Agent AI thật.

## 9. Công cụ cách ly và tài nguyên: có gì, thiếu gì?

### 9.1. Workspace adapter

`scripts/agent-workspace.ps1` có `Register`, `Status`, `Retain`, `Close`.

- Gắn task với worktree/branch và immutable base.
- Hồ sơ nằm trong Git common directory, ngoài worktree có thể dọn.
- Kiểm tra ownership, dirty/ignored files, Git operation, reparse/junction và tài nguyên chưa giải phóng.
- Nhánh giữ lại, checkout bị xóa và mã đã tích hợp được phân biệt.
- `Close` là trợ giúp cho trường hợp đã review/tích hợp phù hợp; không phải kết quả kết thúc duy nhất.

Adapter không thay reviewer quyết định correctness; tham số ReviewedTip là một attestation cần có bằng chứng thực. Không tự giải quyết mọi tiến trình hoặc tác nhân Git bên ngoài.

### 9.2. Resource adapter

`scripts/agent-test-environment.ps1` có `Start`, `Status`, `Stop`; dùng hidden PowerShell supervisor và Windows Job Object để quản lý process thuộc task.

- Kiểm tra danh tính process, cổng, cấu hình và run identity.
- Giới hạn launch hiện tại yêu cầu đường dẫn tuyệt đối tới `node.exe`, không nhận shell wrapper tùy ý.
- Giữ artifact/log ngoài worktree và chặn dùng lại run ID.
- Có trường nhận dạng DB/browser và kiểm tra trùng reservation.

**Không tự tạo/xác minh/xóa DB, không điều khiển hoặc tự giải phóng browser.** DB/browser dựa trên xác nhận bên ngoài và cần adapter/cách kiểm chứng bổ sung nếu muốn tự động hóa đầy đủ. Không được gọi một bộ registry là hệ thống provisioning hoàn chỉnh.

### 9.3. Check runner

`scripts/agent-check.mjs` kiểm tra runtime và script đích trước khi chạy. `--preflight` chỉ kiểm tra điều kiện, phải ghi “Checks Not run”. Chế độ chạy thật dừng khi app/check thất bại.

Check hiện gắn cứng ba app SellerFlow và Node 22/pnpm 10; nếu chuyển sang Minh Khuê phải viết lại danh sách app/version theo project mới. Không copy rồi tạo `ai-runtime` rỗng chỉ để checker đạt.

### 9.4. Browser/HTTP

SellerFlow phân biệt Playwright fixture và live sandbox; mỗi run có thư mục riêng. Live yêu cầu origin loopback riêng, DB thử và tài khoản seed thuộc task. Reporter cố hạn chế thông tin nhạy cảm trong artifact.

Những khai báo env đó không tự dựng web/API/DB hoặc chứng minh DB identity thật. Browser/T3 availability phải discovery trong từng phiên. Đối với Minh Khuê, cần một test harness có thể dựng sandbox, kiểm tra target và thu hồi đúng tài nguyên, rồi mới khẳng định tự test app đầu-cuối được.

## 10. Runtime hiện tại và những gì không được suy diễn

T3 capability catalog trả về khả năng app-owned subagent, theo dõi bất đồng bộ, cancellation và scheduled task. Có một provider instance trong catalog hiện được báo `canRunChildTask=true` cùng 8 model; các provider khác không mặc định chạy child được chỉ vì có tên/model trong danh sách.

Đây là bằng chứng runtime **công bố** khả năng, chưa phải bằng chứng dispatch, thực thi, hủy, timeout hay resume đã hoạt động. Không tạo lịch chạy hoặc gọi child để minh họa khi task chỉ là khảo sát.

Nếu sau này triển khai bằng T3:

- Chọn provider/model từ catalog live; không hardcode tên từ SellerFlow.
- Phân biệt child task và conversation top-level.
- Với review qua T3, mỗi vòng review là một delegated task mới, lưu task ID; không gửi tiếp vào backing child thread để giả làm round mới.
- Native subagent và T3 delegation có API/lifecycle khác nhau; phải ghi adapter đúng môi trường.
- Tạo checkout cách ly phải biết snapshot nào được truyền sang; uncommitted file không mặc định đi theo worktree của công cụ điều phối.

Repository có tài liệu kỹ năng không có nghĩa runtime tự load tất cả. Checker governance discovery chỉ chứng minh cấu trúc đọc được bằng script; cần pilot xác nhận Agent thực sự đọc entrypoint/chọn skill trong harness mục tiêu.

## 11. Quyền tự động hóa thực tế của SellerFlow

| Hành động | Quy tắc quan sát được |
| --- | --- |
| Đọc source/tài liệu, khảo sát local | Theo scope task và bảo toàn dữ liệu |
| Sửa local, test, xử lý lỗi trong scope | Tiếp tục phần có thể đảo ngược đã được giao; không hỏi lại từng thao tác |
| Tạo local commit cho task | Được quy định là đầu ra được phép trong SellerFlow |
| Đặt thêm nghiệp vụ, contract, ý nghĩa dữ liệu | Cần làm rõ/xác nhận ngoài scope đã duyệt |
| Sửa tài liệu controlled | Cần approval rõ; tái sử dụng approval đã có, không tự duyệt vì rủi ro thấp |
| Review độc lập | Bắt buộc theo ngưỡng rủi ro của project; thiếu tool không được giả là đã review |
| Pull/push/merge/deploy, xóa nhánh | Không tự động được phép; cần quyền phiên tương ứng |
| Docker image push | Quy tắc SellerFlow yêu cầu duyệt từng lần |
| Remote server, production DB/provider, scheduler | Không tự chạy chỉ để chứng minh readiness |
| Cleanup | Đúng task, bảo toàn evidence/dữ liệu và xác minh hậu điều kiện |

Đây là **chính sách SellerFlow**, chưa là quyền đã cấp cho Minh Khuê. Việc user nói muốn “tự động như SellerFlow” chưa tự chọn chính sách push/deploy hay cho phép tác động production.

## 12. Các điểm phải hòa giải trước khi kế thừa

### 12.1. Review lại sau sửa

`AGENTS.md` SellerFlow yêu cầu review tip mới sau sửa cho thay đổi thuộc ngưỡng. Trong khi `executing-plans/SKILL.md` upstream có hướng dẫn không dispatch re-review sau fix pass, dùng test để xác minh sửa.

Tại SellerFlow, rule repository được quy định ưu tiên hơn skill. Minh Khuê cần ghi rõ override này nếu chọn cùng chính sách; không được chỉ cài skill rồi mong Agent tự đoán. Không sửa byte upstream đã ghim chỉ để ẩn mâu thuẫn.

### 12.2. Khác API subagent giữa tài liệu và runtime

Codex reference đi kèm gói có mô tả việc dùng override model với full-history fork; công cụ native trong phiên hiện tại quy định khác, chỉ hỗ trợ override theo điều kiện và clean fork phù hợp. Thời gian chờ và lifecycle cũng phụ thuộc harness.

Vì vậy tài liệu tool là hướng dẫn có phiên bản, không được vượt lên trên schema/chỉ dẫn runtime hiện tại. Nếu chuẩn bị đa harness, phải có adapter mỏng theo môi trường, kiểm tra bằng pilot thay vì chép bảng lệnh chung.

### 12.3. Cleanup và bằng chứng

Upstream có bước dọn artifact plan; SellerFlow có ràng buộc giữ evidence và không xóa dữ liệu chưa rõ. Cần quy định rõ phần nào là artifact tái tạo được, phần nào là report phải giữ, đồng thời tách artifact workspace khỏi Git worktree.

### 12.4. Tài liệu tiến độ không khớp hoàn toàn hiện trạng

README/manifest vẫn ghi migration pending; một số tool đã tồn tại, hash/checker đạt và commit ở main. Closeout document vẫn ghi primary unchanged/pending. Đây là cảnh báo về độ tươi của trạng thái hồ sơ, không phải bằng chứng mọi tool chưa làm hoặc mọi gate đã đạt.

### 12.5. Trạng thái check chưa toàn xanh

Tooling pass không thay lint toàn sản phẩm. Hồ sơ ghi lint backlog riêng và DB thật chưa chạy. Minh Khuê cần quản lý gate theo phạm vi: nền tảng Agent, sản phẩm, browser/DB và release có trạng thái riêng; không gộp thành một chữ “ready”.

## 13. Minh Khuê cần chuẩn bị những đầu ra gì?

Đây là danh mục đầy đủ ở mức thiết kế. Chưa tạo những file dưới đây trong lần khảo sát.

### 13.1. Quy tắc và tài liệu điều hướng

| Đầu ra đề xuất | Nội dung bắt buộc | Lúc cần |
| --- | --- | --- |
| `README.md` | Điểm vào, cách bắt đầu, trạng thái nền tảng thật | Chuẩn bị đầu tiên |
| `AGENTS.md` | Scope, thứ tự ưu tiên, bảo toàn thay đổi, workflow routing, quy tắc bằng chứng | Chuẩn bị đầu tiên |
| `docs/agent/AUTHORITY_MAP.md` | Nguồn sở hữu từng loại sự thật, cách xử lý xung đột | Chuẩn bị đầu tiên |
| `docs/agent/DOC_ROUTING.md` | Task loại nào đọc tài liệu nào | Chuẩn bị đầu tiên |
| `docs/agent/EXECUTION_RULES.md` | Dossier, ownership, branch/worktree, review, handoff và resume | Chuẩn bị đầu tiên |
| `docs/agent/PERMISSIONS.md` | Ranh giới local, dependency, network, Git remote, integration và release | Chốt trước pilot có mutation |
| `docs/agent/TOOL_CAPABILITIES.md` | Tool đang có, phép thử, giới hạn, fallback, ngày kiểm chứng | Viết rồi cập nhật qua pilot |
| `docs/agent/QUALITY_GATES.md` | Check bắt buộc theo loại thay đổi, điều kiện Done và cách báo chưa chạy | Trước task triển khai |
| `docs/agent/READINESS.md` | Ma trận khả năng, bằng chứng mới nhất, gate còn thiếu | Duy trì sau mỗi pilot/thay đổi nền |

Khuyến nghị dùng một nguồn tiếng Việt cho tài liệu riêng Minh Khuê. Skill upstream giữ ngôn ngữ/byte nguồn; không dịch rồi vẫn tuyên bố là bản upstream nguyên trạng. Nếu cần tài liệu Anh–Việt đầy đủ phải có cơ chế đồng bộ riêng được kiểm tra.

### 13.2. Phương pháp, chuyên môn và provenance

- Chọn một methodology chủ đạo; đề xuất Superpowers để tương đồng SellerFlow, nhưng phải chốt phiên bản và override project rõ ràng.
- Lưu upstream repository/version/commit/hash/license; có checker integrity.
- Viết specialist Minh Khuê theo nhu cầu thật. Có thể chuẩn bị requirement/planning/review/doc governance trước; skill module/contract/DB cụ thể hoàn thiện khi có nguồn thực.
- Có `SKILL_USAGE_MATRIX.md` gọn và cơ chế discovery. Tránh một allowlist khiến skill mới có file nhưng không bao giờ được chọn.
- Chỉ tạo mirror cho harness cần sử dụng; nếu dùng Claude thì có entrypoint và cơ chế sinh/kiểm tra mirror. Một nguồn skill, nhiều bản tương thích được sinh, không sửa độc lập.
- Kiểm tra link và nội dung sót `sellerflow`, đường dẫn cũ, model cũ, port mặc định, domain bán hàng và quyền provider.

### 13.3. Task package và handoff

Một template cần có: ID; mục tiêu; scope/ngoài scope; acceptance; nguồn chuẩn; base/workspace; risk; writer/reviewer route; check; resource ownership; quyền có sẵn; đầu ra và điều kiện dừng.

Handoff/resume cần có: việc đã xong; tip hiện tại; bằng chứng; finding/ruling còn mở; tài nguyên giữ lại; quyền đã có; bước tiếp theo chính xác. Không dựa vào việc Agent đọc toàn bộ chat cũ.

Đề xuất thư mục:

```text
docs/tasks/<task>/
  INDEX.md
  approved/requirements.md
  technical/implementation-plan.md
  decisions.md
  validation.md
```

Task nhỏ có thể gộp; task đủ lớn giữ tách trách nhiệm. Báo cáo không tự tạo file `approved` với nội dung chưa được người dùng duyệt.

### 13.4. Môi trường thực thi

- Git repository và mốc commit ban đầu có thể tái lập.
- Toolchain thực chạy được: terminal, Git, Node/package manager khi cần, Bash cho helper Superpowers, Python nếu chọn bộ UI có script Python.
- Route native/T3 đúng runtime, provider/model live, timeout/cancel, ownership/task ID và log.
- Branch/worktree cách ly; quy tắc snapshot/dirty changes rõ ràng.
- Lưu evidence ngoài vùng disposable và có chính sách dữ liệu nhạy cảm.
- Check runner theo project, không hardcode app SellerFlow.
- Khi có ứng dụng: adapter dựng sandbox web/API/DB, seed dữ liệu giả, browser và thu hồi tài nguyên.

### 13.5. Tự động kiểm tra chính nền tảng

Cần check được: skill hash/license; mirror/link/routing; reference cũ; task template; checkpoint/resume; review range; isolation; check bị thiếu; test thất bại không được ghi Done; artifact nhạy cảm; cleanup đúng sở hữu.

Không chỉ kiểm tra “file tồn tại”. Phải có pilot Agent thật để chứng minh việc đọc rule, dùng tool và handoff có hiệu lực.

## 14. Luồng tự động mục tiêu cho Minh Khuê

```text
Người dùng giao task + phạm vi/quyền
  → Agent khôi phục hồ sơ và nguồn chuẩn
  → Làm rõ điểm chặn, thiết kế/kế hoạch vừa đủ
  → Xác nhận nội dung hoặc lựa chọn ngoài quyền hiện có
  → Chuẩn bị workspace/tài nguyên thuộc task
  → Triển khai theo kế hoạch
  → Chạy check, đọc lỗi, sửa trong phạm vi
  → Review theo rủi ro và kiểm lại kết quả sau sửa
  → Ghi evidence + trạng thái + bước tiếp theo
  → Tích hợp/phát hành nếu có quyền; nếu chưa thì bàn giao kết quả review được
```

Không hỏi xác nhận ở từng bước có thể đảo ngược đã được giao. Vẫn dừng phần phụ thuộc khi thiếu ý định nghiệp vụ, quyền hành động hoặc bằng chứng bắt buộc. Dừng đúng chỗ cũng là một kết quả vận hành cần pilot, không phải mọi lần dừng đều là Agent thiếu tự động.

Nên có ngưỡng tránh vòng lặp: phát hiện cùng một blocker/lỗi lặp lại, ghi điều đã thử, chuyển sang chẩn đoán hoặc xin quyết định cần thiết. Giới hạn chi phí, thời gian và số vòng review cần thống nhất khi thiết kế triển khai; không tự đặt một con số rồi gọi là yêu cầu của người dùng.

## 15. Mức độ sẵn sàng phải nghiệm thu riêng

Các mức dưới đây là cách phân chia đề xuất cho Minh Khuê, không phải thang chuẩn có sẵn của SellerFlow.

| Mức | Năng lực cần chứng minh | Điều kiện đạt |
| --- | --- | --- |
| A. Hiểu đúng và có thể tiếp tục | Đọc rule, routing, hồ sơ và quyền | Phiên mới bắt đầu đúng next action, không dùng archive như yêu cầu hiện tại |
| B. Tự hoàn thành task local | Triển khai/test/sửa/bàn giao trong scope | Pilot task giả lập đạt acceptance và không đụng file ngoài scope |
| C. Review độc lập | Reviewer thật, đúng snapshot và finding loop | Có base/tip/round ID và xử lý kết quả; không gọi self-review là độc lập |
| D. Tự kiểm thử sandbox | Web/API/DB/browser thuộc task | Dựng đúng môi trường, kiểm tra hành vi và thu hồi đúng tài nguyên |
| E. Chạy kéo dài hoặc định kỳ | Trigger/scheduler, resume/cancel và quan sát | Kiểm chứng restart/timeout/cancel trên runtime thật, không chỉ process fixture |
| F. Tích hợp/phát hành | Git remote/CI/release/rollback | Có quyền rõ, kiểm tra kết quả và phục hồi trong môi trường đã chốt |

Không cần chờ D/E/F để dùng Agent làm việc A/B, nhưng phải báo đúng phần đã đạt. Mong muốn tự động hoàn chỉnh cần kế hoạch cho tất cả mức được chọn, thay vì tuyên bố ready sau khi có docs.

## 16. Thứ tự chuẩn bị đề xuất

| Giai đoạn | Phần việc | Đầu ra review được |
| --- | --- | --- |
| 1. Chốt thiết kế nền tảng | Harness chính, methodology, quyền, nguồn tài liệu, mức tự động mục tiêu | Bản thiết kế nền tảng và danh sách file/tool cần tạo |
| 2. Bootstrap quy tắc và skill | Entry point, routing, task template, nguồn skill/hash/license, adapter theo harness | Bộ nền tảng có thể kiểm tra cấu trúc, không sót SellerFlow |
| 3. Tooling và ownership | Check runner, branch/worktree, resource/evidence, trạng thái và resume | Lệnh hoạt động trên môi trường mục tiêu; gate thiếu được báo đúng |
| 4. Pilot local và review | Một task fixture có scope, lỗi có kiểm soát, review và resume | Bằng chứng A/B/C; không dùng dữ liệu sản phẩm thật |
| 5. Nối môi trường ứng dụng | Khi bắt đầu dựng app: sandbox, DB seed, HTTP và browser | Bằng chứng D; thiếu app thì ghi Deferred, không giả lập thành live pass |
| 6. Tự động dài hạn/release | Nếu cần: trigger/scheduler, quan sát, cancel, remote và phát hành | Bằng chứng E/F theo quyền riêng đã chốt |

Khảo sát hiện tại chỉ chuẩn bị đầu vào cho giai đoạn 1. Không suy ra người dùng đã giao triển khai sáu giai đoạn.

## 17. Bộ pilot nên yêu cầu trước khi nói “Agent đã sẵn sàng”

1. **Bootstrap/routing:** Agent mới đọc đúng entrypoint, tìm đúng tài liệu và bỏ qua archive.
2. **Thực hiện local:** task fixture tạo thay đổi hữu ích, test đúng và báo kết quả trong scope.
3. **Test thất bại:** lỗi chủ động đưa vào fixture khiến check fail; Agent không ghi Done và xử lý nguyên nhân.
4. **Review:** reviewer độc lập nhận đúng range; mọi findings thật được xử lý theo chính sách; không chế tạo findings rồi gọi là review thực.
5. **Tip thay đổi sau review:** kết quả cũ không được dùng thay cho kết quả mới theo gate đã chốt.
6. **Resume Agent:** dừng/chuyển phiên thực, dùng hồ sơ để tiếp tục đúng checkpoint; phân biệt với việc restart một Node process.
7. **Hai writer, nếu cần hỗ trợ song song:** không sửa chung checkout, không dùng trùng tài nguyên; chỉ chạy khi có ủy quyền pilot nhiều agent.
8. **Bảo toàn:** file dirty/ignored/evidence giả lập vẫn còn sau thao tác kết thúc; không dọn tài nguyên người khác.
9. **Tool thiếu:** không có reviewer/browser/DB thì báo đúng thiếu ở gate nào, không “pass” bằng fallback yếu hơn mà không khai báo.
10. **Quyền:** task chạm hành động chưa có quyền phải dừng đúng phần đó, đồng thời bàn giao phần đã hoàn tất.

Mỗi pilot lưu môi trường, task/run ID, lệnh/tool, kết quả, artifact, giới hạn và tình trạng tài nguyên. Không dùng screenshot hoặc một test hello-world làm bằng chứng cho mọi năng lực.

## 18. Những lựa chọn cần chốt khi giao task triển khai nền tảng

- Harness mục tiêu: ưu tiên T3 Code/Codex hiện có hay cần hỗ trợ Claude ngay từ đầu?
- Chọn Superpowers và phiên bản nào; có giữ chính sách review lại tip mới như SellerFlow không?
- Mức tự động cần đạt trước: local task + review hay bao gồm chạy nền/scheduler và release?
- Quyền local commit, dependency, network, merge/push/deploy được cấp ở mức nào?
- Dùng một nguồn tiếng Việt hay cần bản dịch đầy đủ?
- Cần nhiều agent chạy song song ngay hay chỉ chuẩn bị khả năng, pilot sau?
- Evidence giữ ở đâu, trong bao lâu, ai truy cập và giới hạn chi phí/chạy dài thế nào?

Đây là đầu vào cho thiết kế triển khai, không phải yêu cầu phải trả lời toàn bộ trước khi đọc báo cáo. Có thể gom thành một task chốt nền tảng trước khi cài đặt.

## 19. Những việc đã làm và chưa làm tại Minh Khuê

Đã làm trong lần này: khảo sát lại source/tài liệu/tooling SellerFlow; chạy các check tập trung nêu trên; discovery catalog điều phối; lưu báo cáo chuyên biệt về nền tảng Agent và bản tóm tắt trực quan.

Chưa làm: khởi tạo Git; tạo AGENTS/CLAUDE; cài/copy skill; sửa config global; tạo worker/reviewer; dựng worktree/process/DB/browser app; tạo scheduler; viết source ứng dụng; push/merge/deploy. Các đề xuất file và workflow trong báo cáo vẫn chưa là quy tắc hiện hành của Minh Khuê.

## 20. Nguồn đối chiếu

Tất cả đường dẫn dưới đây tương đối với SellerFlow nguồn, trừ công cụ T3 của phiên hiện tại:

- `AGENTS.md`, `CLAUDE.md`, `README.md`, `SKILL_USAGE_MATRIX.md`, `manifest.json`.
- `docs/ai/CURRENT_AUTHORITY_MAP.md`, `AI_DOC_ROUTING_MATRIX.md`, `AGENT_TASK_EXECUTION.md`, `AGENT_TOOL_CAPABILITIES.md`, `TASK_TEMPLATE.md`, `TESTING_STRATEGY.md`.
- `.agents/superpowers-source.json`, `.agents/ui-skills-source.json`, `.agents/skills/*/SKILL.md`.
- `.agents/skills/using-superpowers/references/codex-tools.md`.
- `.agents/skills/executing-plans/scripts/task-start`, `task-done`; `.agents/skills/subagent-driven-development/scripts/sdd-workspace`, `review-package`.
- `scripts/agent-tooling/distribution.mjs`, `governance.mjs`, `browser-context.cjs`, `live-browser-reporter.cjs`; `scripts/agent-check.mjs`.
- `scripts/agent-workspace.ps1`, `agent-test-environment.ps1`; supervisor/WindowsJob được định tuyến trong source.
- `tests/agent-tooling/*.test.mjs`; năm tệp test tập trung đã chạy mới được liệt kê ở mục 3.
- `scratchpad/task-dossiers/workflow-modernization/validation.md`, `closeout-execution.md`, `closeout-handoff.md`; `scratchpad/task-dossiers/lint-remediation/INDEX.md`.
- `archive/agent-workflow/README.md`.
- Git HEAD/status/log/ancestry và T3 `orchestrator_capabilities` của lần khảo sát.
