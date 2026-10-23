# Khảo sát tài liệu SellerFlow và đề xuất workflow Minh Khuê Workforce

Ngày khảo sát: 22/10/2026. Nguồn: `D:/TinHoc/sellerflow-hub-docs-pack-v1`. Đích: `D:/TinHoc/minh-khue-workforce`.

Trạng thái: **Báo cáo khảo sát và đề xuất để thảo luận**, chưa phải đặc tả nghiệp vụ hay quyết định công nghệ đã duyệt. Thư mục Minh Khuê đang trống tại thời điểm khảo sát; báo cáo này là đầu ra đầu tiên. Chưa cài framework, skill, dependency hoặc khởi tạo Git.

## 1. Kết luận đề xuất

Nên kế thừa cách SellerFlow phân định nguồn tài liệu, ranh giới kiến trúc, hồ sơ task và bằng chứng kiểm chứng. Cần viết lại nội dung theo nghiệp vụ Minh Khuê, thu gọn bộ tài liệu và tránh mang theo lịch sử, domain bán hàng hoặc công cụ quản lý agent chưa cần thiết.

Thiết kế frontend và backend độc lập **ngay từ đầu**: web gọi REST API; backend chứa toàn bộ nghiệp vụ và quyền truy cập; PostgreSQL chỉ do backend truy cập. Khi có Android, ứng dụng gọi cùng API. Có thể đặt hai ứng dụng trong một monorepo, tức một kho mã chứa nhiều ứng dụng, mà vẫn build và triển khai riêng.

Quy trình đề xuất: **Làm rõ nhu cầu → chốt phạm vi và điều kiện nghiệm thu → thiết kế UX + dữ liệu/API → lập task nhỏ → triển khai và kiểm thử → review → nghiệm thu nghiệp vụ → phát hành thử → theo dõi**. Lỗi phát hiện ở bước sau quay về bước sở hữu vấn đề; thay đổi nghiệp vụ quay về đặc tả thay vì sửa âm thầm trong code.

Không nên bắt đầu bằng dashboard hoặc bảng dữ liệu trước khi phân biệt “điểm danh có mặt” và “chấm công tính thời gian làm việc”. Hai phạm vi này dẫn đến dữ liệu, màn hình và cách tính khác nhau.

## 2. Phạm vi và giới hạn khảo sát

Đã liệt kê tài liệu, đọc các đầu mối quản trị/quy trình, kiến trúc, stack, task, kiểm thử, CI/CD và mẫu hồ sơ; đối chiếu script trong `package.json` gốc và hai app web/API. Có kiểm tra cấu trúc source, Prisma, tooling và tên tài liệu Anh–Việt.

Đây là khảo sát cấu trúc và workflow, không phải audit toàn bộ code hay xác nhận ứng dụng SellerFlow đang chạy tốt. Chưa chạy test, build, browser app, Docker, DB, provider hoặc deployment. Các kết quả kiểm thử cũ dưới đây được dẫn lại từ hồ sơ nguồn, không phải phép đo mới.

Các quy tắc riêng của SellerFlow được đọc như đối tượng khảo sát; chúng không tự trở thành quy tắc của Minh Khuê. Chưa sao chép hay kích hoạt Superpowers và các specialist skill tại project mới.

## 3. SellerFlow đang tổ chức tài liệu như thế nào?

### 3.1. Các tầng ở cấp repository

| Vị trí | Vai trò quan sát được | Cách sử dụng |
| --- | --- | --- |
| `README.md` | Cửa vào cho người mới; mô tả stack và trạng thái chuyển đổi workflow | Đọc trước để xác định điểm bắt đầu |
| `AGENTS.md`, `CLAUDE.md` | Quyền hạn, quy tắc thực thi và hướng dẫn theo môi trường agent | Không dùng thay đặc tả sản phẩm |
| `SKILL_USAGE_MATRIX.md` | Chọn skill chuyên môn theo loại việc | Bảng định tuyến, không phải một lifecycle thứ hai |
| `docs/ai/` | Tài liệu tiếng Anh được quy định là nguồn chuẩn | Có 38 tệp trực tiếp tại thời điểm khảo sát |
| `docs/vi/` | Bản tiếng Việt được yêu cầu đồng bộ | Có 36 tệp trực tiếp; danh sách tên không đối xứng hoàn toàn |
| `.agents/skills/` | Bộ skill hiện hành, gồm methodology và chuyên môn | Có 28 thư mục skill trực tiếp |
| `.agents/*-source.json` | Nguồn, phiên bản, hash của các gói skill | Giúp tái lập và kiểm soát thay đổi |
| `.claude/skills/` | Bản tương thích được sinh từ nguồn skill | Không duy trì độc lập hai bản |
| `templates/chat-starters/` | 12 mẫu đầu vào giao task | Cung cấp mục tiêu, scope, acceptance, tài nguyên và quyền |
| `scratchpad/task-dossiers/` | Hồ sơ vận hành của từng việc | Theo dõi yêu cầu, kế hoạch, quyết định, bằng chứng |
| `archive/agent-workflow/` | Gói workflow cũ và biến thể cũ | Được đánh dấu chỉ dùng cho lịch sử/audit |
| `scripts/`, `tests/agent-tooling/` | Kiểm tra quy tắc, phân phối skill, quản lý workspace/tài nguyên | Tooling hỗ trợ; không chứng minh chất lượng toàn ứng dụng |
| `apps/`, `prisma/`, `.github/workflows/` | Source, schema/migration và cấu hình tự động hóa | Đối chiếu với tài liệu để xác minh phần đã triển khai |

### 3.2. Danh mục đầy đủ 38 tài liệu trực tiếp trong `docs/ai/`

Nhóm dưới đây dùng để giải thích chức năng; không có nghĩa mỗi nhóm là một thư mục riêng.

1. **Điều hướng và thực thi — 12 tệp:** `CURRENT_AUTHORITY_MAP.md`, `AI_DOC_ROUTING_MATRIX.md`, `AGENT_TASK_EXECUTION.md`, `AGENT_TOOL_CAPABILITIES.md`, `AI_RESPONSE_RULES.md`, `TASK_TEMPLATE.md`, `PROMPT_TEMPLATE_FOR_FUTURE_TASKS.md`, `TASK_EXECUTION_FLOW.md`, `PROJECT_EXECUTION_RULES.md`, `DEFINITION_OF_DONE.md`, `SELF_REVIEW_CHECKLIST.md`, `CODING_GUARDRAILS.md`.
2. **Kiến trúc, domain và hợp đồng — 7 tệp:** `ARCHITECTURE_BOUNDARIES.md`, `MODULE_MAP.md`, `DOMAIN_ENTITIES_OVERVIEW.md`, `DB_AUTHORIZATION_AND_EXPANSION_NOTES.md`, `API_CONTRACT_GUIDE.md`, `EVENT_AND_WEBHOOK_CONTRACTS.md`, `AI_EXTERNAL_DATA_MVP.md`.
3. **Công nghệ và quy ước source/UI — 6 tệp:** `TECH_STACK_DECISIONS.md`, `VERSION_BASELINE_AND_COMPATIBILITY.md`, `SOURCE_STRUCTURE_AND_NAMING_RULES.md`, `REPO_CODING_CONVENTIONS.md`, `WEB_UI_BASELINE_AND_SHADCN_RULES.md`, `WEB_I18N_BASELINE.md`.
4. **Kiểm thử và vận hành — 6 tệp:** `ENVIRONMENT_SETUP.md`, `TESTING_STRATEGY.md`, `ERROR_HANDLING_AND_LOGGING.md`, `CI_CD_RULES.md`, `DEPLOYMENT_AND_RELEASE.md`, `DEPLOY_FIRST_TIME.md`.
5. **Roadmap và tài liệu theo giai đoạn — 7 tệp:** `PROJECT_PHASE_ROADMAP.md`, `PHASE_EXECUTION_RULES.md`, `PHASE_2_DB_MINIMUM_GUIDE.md`, `PHASE_3_CHAT_PERSISTENCE_DECISION.md`, `PHASE_5_REAL_CHATBOT_INTEGRATION_DISCOVERY.md`, `PHASE_6_TELEGRAM_DISCORD_PLAN.md`, `PHASE_9_EXECUTION_PROMPT.md`.

### 3.3. Quy tắc xác định tài liệu nào có thẩm quyền

Điểm vào là `AGENTS.md` → `CURRENT_AUTHORITY_MAP.md` → `AI_DOC_ROUTING_MATRIX.md` → bộ tài liệu nhỏ nhất liên quan task. Không yêu cầu đọc cả bộ cho mọi thay đổi.

SellerFlow phân biệt bốn loại nội dung: trạng thái hiện tại, thiết kế đích đã duyệt, lịch sử và bằng chứng. Hồ sơ task chỉ mô tả công việc và quyết định trong phạm vi đó; không được tự thay thế hợp đồng API hay định nghĩa nghiệp vụ chuẩn.

Khi tài liệu, source, schema hoặc quyết định đã duyệt mâu thuẫn về ý nghĩa, phải chỉ ra đúng vị trí và xử lý mâu thuẫn trước phần triển khai phụ thuộc. Test pass không tự cấp quyền thay đổi nghiệp vụ.

### 3.4. Hồ sơ từng task

Task đủ lớn dùng cấu trúc:

```text
scratchpad/task-dossiers/<task-key>/
  INDEX.md                         # mục tiêu, trạng thái, liên kết, bước tiếp theo
  approved/requirements.md         # ý định đã duyệt, không trộn log
  technical/implementation-plan.md # kế hoạch kỹ thuật
  decisions.md                     # quyết định và lý do
  validation.md                    # lệnh, kết quả, giới hạn kiểm chứng
  history/                         # chỉ khi cần bảo toàn hồ sơ cũ
```

Mẫu task yêu cầu: ID, kết quả mong muốn, điều kiện nghiệm thu, trong/ngoài phạm vi, tài liệu liên quan, vùng file được sửa, kiểm chứng, tài nguyên và quyền đã có. Đây là phần nên kế thừa trực tiếp về nguyên tắc.

## 4. Workflow SellerFlow hiện hành

### 4.1. Methodology và chuyên môn

SellerFlow quy định **Superpowers là phương pháp phát triển duy nhất**; manifest ghim nguồn `obra/superpowers`, bản `v6.4.2`. Các bước được chọn theo công việc: brainstorming để làm rõ thiết kế, writing-plans để lập kế hoạch, executing-plans hoặc luồng có subagent để triển khai, systematic-debugging cho lỗi, TDD cho thay đổi hành vi, review/verification/finishing để kết thúc.

Các specialist SellerFlow bổ sung ràng buộc nghiệp vụ, DB, module, contract, review, HTTP và tài liệu; không tạo thêm một chuỗi analyst → planner → worker bắt buộc song song với Superpowers. Impeccable là chuyên môn UI chính; ui-ux-pro-max bổ sung tham chiếu có chọn lọc.

`TASK_EXECUTION_FLOW.md`, `PROJECT_EXECUTION_RULES.md` và `DEFINITION_OF_DONE.md` hiện chủ yếu trỏ về nguồn sở hữu quy trình. Không nên nhìn tên tệp rồi suy ra rằng mỗi tệp còn chứa một bộ workflow đầy đủ riêng.

Các skill interviewer/planner/implementation-worker cũ dưới `archive/agent-workflow/` đã được đánh dấu không phải skill hiện hành. Một số tên template còn nhắc vai trò cũ nhưng nội dung template đã hướng về Superpowers.

### 4.2. Luồng thực thi và kiểm soát

1. Khôi phục yêu cầu/quyết định đã duyệt; ghi scope, risk, mốc commit gốc, acceptance và nguồn tài liệu.
2. Chọn skill quy trình cùng chuyên môn phù hợp; không tự đặt thêm luật nghiệp vụ.
3. Xác định branch/worktree, vùng file và tài nguyên thuộc task. Worktree là thư mục làm việc Git riêng cho một nhánh.
4. Triển khai trong phạm vi; kiểm thử theo loại thay đổi; DB migration phải được sinh bằng công cụ Prisma và có bằng chứng.
5. Thay đổi từ mức trung bình yêu cầu review độc lập trên đúng khoảng commit gốc đến commit cuối. Sửa sau review cần review lại phần kết quả mới.
6. Ghi `Verified`, `Failed`, `Not run`, `Blocked` theo bằng chứng thật. Build, test mock, browser fixture, DB thật và production là các lớp bằng chứng khác nhau.
7. Hoàn tất theo quyền đã có; bảo toàn dữ liệu, report và tài nguyên. Tích hợp, lưu nhánh và xóa workspace là ba sự kiện riêng.

SellerFlow còn có adapter Windows để đăng ký workspace, quản lý process/port và kiểm tra điều kiện cleanup. Đây là hạ tầng phát triển đã khá sâu, chưa cần sao chép vào MVP Minh Khuê.

## 5. Điểm mạnh và vấn đề cần lưu ý khi kế thừa

### Nên giữ

- Mỗi quy định có một nơi sở hữu; tài liệu khác liên kết thay vì chép lại.
- Tách yêu cầu đã duyệt, kế hoạch kỹ thuật và log kiểm chứng.
- Tách web, backend và DB; không để UI quyết định nghiệp vụ quan trọng.
- Đọc tài liệu theo task, tránh nạp cả bộ rồi bỏ sót điểm chính.
- Phân biệt “đã cấu hình”, “đã chạy” và “đã kiểm chứng”.
- Review thay đổi quyền, dữ liệu và nghiệp vụ có ảnh hưởng thật.
- Giữ lịch sử bằng Git và quyết định ngắn, không tạo nhiều bản “final-v2-final”.

### Cần điều chỉnh

- **Khối lượng tài liệu:** 38 tệp chuẩn cùng bản dịch và hồ sơ lịch sử là gánh nặng cho project mới. Minh Khuê nên bắt đầu với bộ nhỏ, tách thêm khi một tài liệu có nhiều người sở hữu hoặc thay đổi độc lập.
- **Hai ngôn ngữ:** tên tệp Anh–Việt hiện không đối xứng: phía `vi` có thêm `DEPLOY_LAN_DAU.md`, `PHASE_2_PAYMENT_CLOSEOUT.md`; phía `ai` có thêm bốn tệp phase 2/3/5/9 được liệt kê ở trên. Chênh lệch tên không tự chứng minh nội dung dịch sai, nhưng cho thấy cần audit ánh xạ nếu tiếp tục mô hình song ngữ.
- **Stack khuyến nghị và công cụ thực tế:** `TECH_STACK_DECISIONS.md` nhắc Vitest/Supertest như khuyến nghị; `TESTING_STRATEGY.md` và script API thực tế dùng Node test runner với ts-node. Khi áp dụng cần chốt một cấu hình thực tế, không copy danh sách rồi tuyên bố đã có test tương ứng.
- **Trạng thái chuyển đổi:** README/manifest còn cảnh báo chưa hoàn tất khả năng tự đóng task. Hồ sơ `workflow-modernization/closeout-execution.md` ghi ngày 21/10/2026 vẫn còn validation/review/integration/cleanup pending trong phần execution state. Không thể kết luận migration workflow đã nghiệm thu toàn bộ.
- **Nợ kiểm tra:** hồ sơ closeout-handoff ghi lint tồn đọng 679 lỗi/47 cảnh báo và Docker/DB chưa chạy; hồ sơ execution tiếp tục giữ lint Failed và DB Not run. Đây là tình trạng được tài liệu ghi nhận, chưa chạy lại để xác nhận số hiện tại.
- **Triển khai:** `CI_CD_RULES.md` ghi cấu hình deploy có thể chạy cả khi thay đổi chỉ là docs. Minh Khuê nên thiết kế check và release tách biệt ngay từ đầu, xác minh trigger thực tế trước khi dùng.
- **Khác domain:** không mang theo tenant bán hàng, order, payment, bot, external-data, AI runtime, subscription hay quota vào hệ thống chấm công.

## 6. Kiến trúc đề xuất cho Minh Khuê

### 6.1. Công nghệ ở mức ứng viên

| Thành phần | Đề xuất | Lý do và ranh giới |
| --- | --- | --- |
| Web | Next.js + TypeScript | Giao diện nhân viên/HR, hỗ trợ điện thoại qua responsive; gọi API |
| UI | Tailwind CSS + shadcn/ui | Dễ làm form, bảng, dialog; dùng một bộ token/component thống nhất |
| Backend | NestJS + TypeScript | API độc lập, chia module theo nghiệp vụ, dùng chung cho web/Android |
| Dữ liệu | PostgreSQL + Prisma | Transaction, ràng buộc dữ liệu, migration có phiên bản |
| Hợp đồng | REST `/api/v1` + OpenAPI | Mô tả request/response/error; sinh client hoặc đối chiếu contract |
| Kho mã | pnpm workspace monorepo | Cùng kho mã, hai ứng dụng có build/config/release riêng |
| Android sau này | React Native hoặc Kotlin, quyết định khi có yêu cầu thiết bị | Dùng cùng API; chia sẻ hợp đồng, không mặc định chia sẻ UI |
| Test | Unit nghiệp vụ + integration API/DB + browser luồng chính | Chọn runner cụ thể lúc dựng nền và ghi lại lệnh thực tế |

Đây chưa phải lựa chọn phiên bản được khóa. Khi bootstrap cần chọn các bản được hỗ trợ, kiểm tra tương thích Node/Nest/Next/Prisma và ghi lockfile. Không sao chép nguyên version baseline của SellerFlow.

Backend nên là **modular monolith**, tức một dịch vụ triển khai chứa các module có ranh giới rõ. Chưa có nhu cầu microservices, queue, Redis, AI runtime hoặc hệ thống đa công ty. Không dựng `apps/android` hay shared package rỗng chỉ vì có định hướng tương lai.

### 6.2. Quyền sở hữu từng lớp

- Web: màn hình, form, phản hồi lỗi, trạng thái đang gửi, truy vấn API. Có thể có proxy/BFF mỏng nếu cần cho cookie nhưng không chứa quy tắc tính công.
- API: danh tính nhân viên, phân quyền, quy tắc nhận chấm công, tính kết quả, sửa công, báo cáo và nhật ký thay đổi.
- DB: lưu dữ liệu, unique constraint, transaction và migration; không thay thế quyết định nghiệp vụ.
- Android: thao tác thiết bị và UX native; backend vẫn xác thực mọi yêu cầu.

Monorepo không buộc triển khai chung. Một tên miền có thể reverse proxy `/api` về backend riêng; về sau đổi topology mà không chuyển nghiệp vụ khỏi Next.js.

### 6.3. Những điểm cần thiết kế từ đầu để Android dùng lại

1. API không yêu cầu client biết cấu trúc bảng DB; không trả Prisma entity nguyên trạng như public contract.
2. Phân quyền tại API cho từng hành động và phạm vi nhân viên/phòng ban; không chỉ ẩn nút trên UI.
3. Web có thể dùng cookie HttpOnly; Android dùng token lưu trong kho an toàn của hệ điều hành. Cần đặc tả refresh, thu hồi phiên khi nghỉ việc, logout và quản lý thiết bị; không kế thừa mặc định refresh stateless của SellerFlow.
4. Nếu dùng cookie cho mutation, phải có biện pháp CSRF phù hợp; khóa CORS theo origin đã cho phép. Chi tiết chốt trong thiết kế auth.
5. API thời gian dùng ISO-8601 có offset/UTC; ngày công và ca được suy ra theo múi giờ nghiệp vụ, đề xuất `Asia/Ho_Chi_Minh`. Không mặc định lấy ngày UTC để nhóm công.
6. Xử lý gửi trùng, retry sau mất mạng và hai thiết bị cùng chấm công bằng idempotency, transaction và ràng buộc DB phù hợp. Không chỉ disable nút.
7. Thay đổi API theo hướng tương thích; Android cũ có thể vẫn chạy sau khi backend được cập nhật.
8. Offline chưa thuộc MVP đề xuất. Nếu cần offline, phải thiết kế riêng độ tin cậy giờ thiết bị, đồng bộ, xung đột và chống gửi lại; không chỉ thêm cache.

## 7. Phạm vi sản phẩm ban đầu

### 7.1. Cần phân biệt trước khi lập schema

- **Điểm danh:** xác nhận nhân viên có mặt trong ngày/buổi. Có thể chỉ cần một sự kiện xác nhận, chưa có tổng giờ hay đi muộn.
- **Chấm công:** ghi nhận vào/ra theo ngày/ca; có ngoại lệ thiếu lượt, ca qua đêm, điều chỉnh và tổng hợp theo quy tắc.

Khuyến nghị bắt đầu với chấm công vào/ra đơn giản **nếu công ty thực sự cần giờ làm**, nhưng chỉ khóa phạm vi sau trao đổi. Không tự suy ra mức trễ cho phép, cách làm tròn hoặc quy đổi ngày công.

### 7.2. Các nhóm chức năng ứng viên

| Nhóm | Phạm vi MVP đề xuất | Phần cần quyết định |
| --- | --- | --- |
| Tài khoản | Đăng nhập, khóa tài khoản, kết thúc phiên | Ai tạo tài khoản, cách đăng nhập |
| Nhân viên | Danh sách và trạng thái làm việc tối thiểu | Phòng ban/chi nhánh nào thực sự cần |
| Chính sách/ca | Một lịch làm việc đã thống nhất | Giờ cố định hay nhiều ca, qua đêm hay không |
| Chấm công | Vào/ra, trạng thái hôm nay, lịch sử bản thân | Hình thức xác minh và tình huống gửi lỗi |
| Quản lý | Xem công trong phạm vi được phép, lọc theo kỳ | HR, quản lý trực tiếp, admin có quyền gì |
| Ngoại lệ | Quy trình bổ sung/sửa công có lý do và dấu vết | Nhân viên gửi yêu cầu hay HR nhập hộ |
| Tổng hợp | Báo cáo kỳ theo quy tắc đã chốt | Chỉ giờ thực tế hay quy đổi công; có cần xuất CSV |

Chưa đưa vào MVP: tính lương, thuế, tuyển dụng, đánh giá, chatbot, nhận diện khuôn mặt, theo dõi vị trí liên tục, offline và Android. GPS/QR hoặc cách xác minh khác chỉ đưa vào khi được chọn cho phạm vi đầu tiên.

### 7.3. Luồng nghiệp vụ đề xuất

**Nhân viên:** đăng nhập → xem ca/trạng thái hiện tại → gửi vào hoặc ra → API xác thực người dùng, quyền và chính sách → ghi nhận nhất quán → trả kết quả chính thức → UI cập nhật lịch sử. Timeout phải cho phép đối chiếu lại trạng thái; không báo thành công khi chưa xác nhận.

**Quản lý/HR:** xem bảng công → kiểm tra thiếu/sai lượt → xử lý theo quyền và quy trình đã thống nhất → lưu lý do, người thao tác, thời điểm và giá trị thay đổi → tổng hợp kỳ. Khóa kỳ và mở lại kỳ là phạm vi cần quyết định, không mặc định có trong MVP.

Nên phân biệt dữ liệu lượt ghi nhận gốc, kết quả tổng hợp và điều chỉnh. Sửa công phải truy vết được dữ liệu trước/sau, không xóa mất lịch sử để làm báo cáo khớp.

GPS của trình duyệt có thể thiếu chính xác hoặc bị giả; QR tĩnh có thể bị chia sẻ; IP văn phòng chỉ cung cấp tín hiệu về đường mạng. Mỗi lựa chọn cần được đánh giá theo môi trường làm việc và mức kiểm soát công ty cần, trước khi thiết kế UI/API tương ứng.

## 8. Bộ tài liệu Minh Khuê nên có

Khuyến nghị **tiếng Việt là nguồn chuẩn ban đầu**, tên file và định danh kỹ thuật dùng tiếng Anh. Không tạo hai bản đầy đủ `ai` và `vi` khi chưa có nhu cầu vận hành thực. AI đọc cùng một nguồn với người làm sản phẩm.

### 8.1. Cấu trúc đề xuất, chưa scaffold toàn bộ

```text
README.md
AGENTS.md
docs/
  INDEX.md
  product/
    MVP_SCOPE.md
    ATTENDANCE_RULES.md
  architecture/
    SYSTEM_DESIGN.md
  contracts/
    openapi.yaml
  engineering/
    DEVELOPMENT_WORKFLOW.md
    QUALITY_GATES.md
    LOCAL_SETUP.md
  operations/
    RELEASE_RUNBOOK.md
  decisions/
    ADR-0001-<decision>.md
  tasks/
    MKW-001-<task>/
      INDEX.md
      requirements.md
      plan.md
      validation.md
  reports/
    2026-10-22-sellerflow-audit-va-workflow-de-xuat.md
apps/
  web/                             # tạo khi bootstrap
  api/                             # tạo khi bootstrap
prisma/
  schema.prisma
  migrations/
```

### 8.2. Thứ tự tạo và nội dung sở hữu

| Ưu tiên | Tài liệu | Nội dung và chủ thể xác nhận |
| --- | --- | --- |
| Ngay sau khảo sát | `MVP_SCOPE.md` | Mục tiêu, người dùng, trong/ngoài phạm vi, chỉ số pilot; người dùng/đầu mối công ty xác nhận |
| Trước schema | `ATTENDANCE_RULES.md` | Quy tắc có ví dụ cụ thể, ngoại lệ và điểm chưa biết; người có quyền nghiệp vụ xác nhận |
| Trước scaffold | `SYSTEM_DESIGN.md` | Stack, ranh giới module, auth, dữ liệu/thời gian, triển khai; người phụ trách kỹ thuật soạn |
| Khi bắt đầu làm việc | `AGENTS.md`, `INDEX.md`, `DEVELOPMENT_WORKFLOW.md` | Quy tắc ngắn, bản đồ tài liệu và chu trình task; tránh lặp nội dung giữa ba tệp |
| Khi dựng nền | `QUALITY_GATES.md`, `LOCAL_SETUP.md` | Lệnh chạy thật, kiểm thử theo rủi ro, DB local và dữ liệu giả |
| Theo lát tính năng | `openapi.yaml` | Hợp đồng API có thể kiểm tra; nếu sinh từ source thì ghi rõ source và kiểm tra drift, không sửa hai nguồn độc lập |
| Trước phát hành thử | `RELEASE_RUNBOOK.md` | Môi trường, secret, migration, backup/restore, rollout, rollback và smoke check |
| Khi có lựa chọn đáng ghi nhớ | `ADR-*` | Bản ghi quyết định kiến trúc: bối cảnh, lựa chọn, lý do và hệ quả |
| Theo task | `docs/tasks/MKW-*` | Mục tiêu, trạng thái, kế hoạch, bằng chứng và bước tiếp theo |

Task nhỏ có thể gộp thành một `INDEX.md`. Chỉ tạo đủ bốn file khi nội dung đủ lớn; không tạo tài liệu trống để đạt checklist.

Mỗi tài liệu nghiệp vụ/kiến trúc cần ghi `Draft`, `Approved` hoặc `Superseded`, người/ngữ cảnh xác nhận và ngày. Thay đổi quy tắc tính công hoặc quyền truy cập phải được đầu mối có thẩm quyền xác nhận; sửa câu chữ, link và cập nhật bằng chứng trong scope đã giao có thể tiếp tục mà không hỏi lại.

## 9. Workflow phát triển đề xuất chi tiết

| Bước | Đầu vào | Đầu ra và điều kiện chuyển bước |
| --- | --- | --- |
| 1. Làm rõ | Ý tưởng hoặc lỗi thực tế | Actor, tình huống, kết quả cần đạt, điểm chưa biết; dừng phần phụ thuộc nếu chưa rõ luật |
| 2. Chốt scope | Nhu cầu đã hiểu | Acceptance quan sát được, ngoài phạm vi, ví dụ biên và người nghiệm thu |
| 3. Thiết kế | Scope đã thống nhất | Luồng màn hình + trạng thái, dữ liệu, quyền, API, phương án lỗi/retry; chốt quyết định có ảnh hưởng sản phẩm |
| 4. Chia task | Thiết kế vừa đủ | Task nhỏ theo luồng sử dụng, dependency, vùng sửa, kế hoạch test và mức rủi ro |
| 5. Thực hiện | Task sẵn sàng | Source, migration nếu có, test và tài liệu cùng thay đổi; giữ scope |
| 6. Kiểm chứng/review | Kết quả task | Lệnh kiểm tra có kết quả, review theo rủi ro, sửa lỗi và kiểm lại phần ảnh hưởng |
| 7. Nghiệm thu | Chức năng chạy được trên môi trường thử | Người dùng/HR thực hiện kịch bản đã chốt; ghi rõ đạt, chưa đạt, chưa chạy |
| 8. Phát hành/pilot | Candidate đã đạt gate | Quyền release phù hợp, backup/migration, smoke check, kết quả theo dõi và cách quay lui |

Không tách thành “làm xong toàn bộ backend rồi mới làm toàn bộ frontend”. Sau nền tảng chung, nên triển khai từng lát tính năng xuyên suốt API → DB → UI → nghiệm thu. Ví dụ đầu tiên là đăng nhập và ghi nhận một lượt công hiển thị được trong lịch sử.

### 9.1. Trạng thái task

`Draft → Ready → In progress → In review → Ready for acceptance → Done`.

`Blocked` ghi lý do cụ thể, phần phụ thuộc và bước gỡ. Không dùng `Done` để chỉ “code xong”; task đạt Done khi acceptance và kiểm tra bắt buộc đạt, giới hạn bàn giao được ghi rõ. Release/pilot có thể là task riêng; chưa deploy không ngăn task code đạt phạm vi nếu acceptance của task không yêu cầu deployment.

### 9.2. Trách nhiệm

- Người dùng/đại diện Minh Khuê: xác nhận ý nghĩa nghiệp vụ, ưu tiên và nghiệm thu. HR hoặc quản lý tham gia khi cần xác nhận cách tính công thực tế.
- Người triển khai/AI: khảo sát, đề xuất, viết tài liệu/source/test và báo cáo bằng chứng trong phạm vi đã giao.
- Reviewer: kiểm tra correctness, quyền, dữ liệu, test và contract; không tự đổi yêu cầu công ty.
- Người phụ trách release: thực hiện phát hành đúng môi trường và quyền đã giao; có thể cùng người triển khai ở giai đoạn nhỏ.

Một người có thể đảm nhiệm nhiều vai trò. Khi cần review độc lập phải ghi đúng ai/công cụ đã review; không tự review rồi gọi là review độc lập. Không mặc định cần nhiều agent cho mọi task.

### 9.3. Branch, worktree và quyền thực hiện

- Mỗi task triển khai đủ lớn dùng branch riêng. Worktree hữu ích khi có việc song song hoặc cần cách ly; không bắt buộc xây adapter tài nguyên như SellerFlow ngay từ đầu.
- Ghi scope và bảo toàn thay đổi đang có trước khi sửa. Nếu có nhiều người/agent ghi đồng thời, phân workspace, vùng file, DB và cổng riêng.
- Theo dõi rõ `implemented`, `reviewed`, `integrated`, `released`; bốn trạng thái không đồng nghĩa.
- Tiếp tục công việc local có thể đảo ngược đã được giao, không hỏi lại từng thao tác. Push/merge/deploy thực hiện theo quyền của phiên làm việc và chính sách dự án được thống nhất.
- Superpowers có thể được chọn làm methodology sau; nếu chọn, dùng một nguồn được ghim phiên bản, chỉ bổ sung ràng buộc Minh Khuê. Chưa cần tạo bộ custom skill ở thời điểm này.

## 10. Quality gates cho chấm công

### 10.1. Theo loại thay đổi

- Tài liệu: đúng nguồn sở hữu, không mâu thuẫn nghiệp vụ/contract, link đúng và tiếng Việt không lỗi encoding.
- Quy tắc tính công: unit test bằng các ví dụ do công ty xác nhận; không chỉ test lại biểu thức trong implementation.
- API ghi công: integration với DB thử riêng để kiểm tra transaction, unique constraint và retry đồng thời; mock test không đủ chứng minh các điểm này.
- Auth/quyền: test truy cập dữ liệu người khác, vượt quyền quản lý, tài khoản bị khóa và phiên bị thu hồi theo thiết kế đã duyệt.
- UI: kiểm tra browser trên desktop và kích thước điện thoại; trạng thái loading, lỗi, hết phiên, gửi trùng và reload.
- Migration: sinh bằng công cụ, review, thử từ DB sạch và từ schema trước; không dùng DB thật để thử migration chưa kiểm chứng.
- Release: CI đạt, môi trường/secret đúng, backup và phương án phục hồi dữ liệu phù hợp, migration và smoke check có người chịu trách nhiệm.

### 10.2. Kịch bản acceptance mẫu, cần cụ thể hóa sau khi chốt luật

1. Nhân viên A chấm vào hợp lệ; hệ thống trả kết quả chính thức và lịch sử A hiển thị đúng.
2. Gửi lại cùng yêu cầu sau timeout không tạo thêm lượt công ngoài ý muốn; kết quả truy vấn lại nhất quán.
3. Hai yêu cầu đồng thời không phá trạng thái ca; kết quả theo contract đã chốt.
4. Nhân viên A không xem/sửa công B bằng cách thay ID trong request.
5. Hành vi ra khi chưa vào, thiếu lượt và ca qua đêm theo đúng quy tắc đã duyệt; nếu không hỗ trợ thì từ chối rõ ràng.
6. Đồng hồ thiết bị lệch không tự thay đổi giờ công có thẩm quyền. Nếu sau này cho phép offline phải có đặc tả khác.
7. Sửa công lưu người sửa, lý do, thời điểm và giá trị trước/sau; báo cáo khớp dữ liệu hiệu lực.
8. Nhân viên bị khóa/nghỉ việc không tiếp tục dùng phiên trái với chính sách đã chốt.
9. Lỗi mạng hoặc API không khiến UI báo chấm công thành công sai; có cách đối chiếu trạng thái.

### 10.3. Cấu hình tự động hóa đề xuất

Trong task/PR: dependency install theo lockfile → lint → type-check → unit/integration cần thiết → build → browser smoke liên quan. Thiết lập lệnh theo source thực tế; chưa có app nên hiện chưa có lệnh kiểm thử Minh Khuê để chạy.

CI là tự động kiểm tra chất lượng; release là phát hành một phiên bản. Nên tách hai việc: thay docs vẫn được kiểm tra phù hợp nhưng không tự triển khai production. Môi trường local dùng dữ liệu giả; staging phục vụ nghiệm thu; production chứa dữ liệu thật và quyền truy cập riêng.

Không ghi mật khẩu, token, thông tin nhân sự hoặc vị trí chi tiết vào log/test fixture. Chốt ai được xem dữ liệu, thời gian lưu giữ và quy trình xuất/xóa dữ liệu phù hợp trước pilot; chỉ thu thông tin thực sự cần cho phương thức chấm công đã chọn.

## 11. Roadmap triển khai thực tế

| Giai đoạn | Kết quả | Điều kiện kết thúc |
| --- | --- | --- |
| 0. Khám phá nghiệp vụ | Scope, luật công, actor/quyền, phương thức chấm công | Những câu hỏi ảnh hưởng schema/API được trả lời |
| 1. Nền tảng | Monorepo web/API, DB local, auth tối thiểu, contract và CI | Web gọi API, migration chạy trên DB thử, kiểm tra có thể tái lập |
| 2. Lát chấm công đầu tiên | Vào/ra hoặc điểm danh theo scope; trạng thái hôm nay, lịch sử cá nhân | Acceptance gửi trùng, quyền và thời gian đạt |
| 3. Vận hành HR tối thiểu | Quản lý nhân viên/quyền, ngoại lệ/sửa công, tổng hợp cần thiết | Dữ liệu truy vết được và HR nghiệm thu được |
| 4. Pilot | Nhóm nhỏ dùng thực, đối chiếu với cách chấm công hiện tại | Sai lệch được giải thích/xử lý, backup/restore và hỗ trợ vận hành có bằng chứng |
| 5. Android | Chốt React Native/Kotlin và UX thiết bị; dùng API hiện có | Luồng cốt lõi, refresh/revoke, tương thích API đạt trên thiết bị thật |

Chưa ước lượng số ngày trước khi biết số nhân viên, số điểm làm việc, ca làm, phương thức xác minh và độ phức tạp của ngoại lệ. Pilot cần chạy đủ tình huống thực tế đã thống nhất, không chỉ demo một lượt thành công.

## 12. Những quyết định cần chốt ở task tiếp theo

1. Mục tiêu đầu tiên là điểm danh có mặt hay chấm vào/ra để tổng hợp giờ/công?
2. Khoảng bao nhiêu nhân viên, bao nhiêu chi nhánh/địa điểm? Có nhân viên lưu động hay làm từ xa không?
3. Lịch làm cố định hay nhiều ca; có ca qua đêm, nghỉ giữa ca, tăng ca hoặc nhiều lượt vào/ra không?
4. Chấm từ điện thoại cá nhân, máy tính văn phòng hay kiosk? Chọn hình thức xác minh nào: tài khoản, QR, GPS, mạng văn phòng hoặc kết hợp?
5. Ai quản lý nhân viên, xem báo cáo, sửa công và duyệt yêu cầu? Có giới hạn theo bộ phận không?
6. Các quy tắc đi muộn/về sớm, làm tròn, thiếu lượt và quy đổi công đang được áp dụng như thế nào? Cần ví dụ thực tế thay vì chỉ tên quy tắc.
7. MVP chỉ lưu/xem công hay cần CSV, quy trình chốt kỳ, liên kết Excel hoặc phần mềm hiện có?
8. Ai tạo tài khoản và xử lý khi nghỉ việc/mất thiết bị? Có yêu cầu đăng nhập sẵn từ hệ thống công ty không?
9. Có sẵn server/domain và người vận hành chưa? Ai được truy cập dữ liệu, cần lưu trong bao lâu và kỳ vọng backup thế nào?

Các câu hỏi này dành cho bước khám phá, không phải chín điều kiện cần trả lời trước khi đọc báo cáo. Nên bắt đầu từ câu 1–4 rồi đào sâu bằng ví dụ một ngày làm việc thật.

## 13. Bước tiếp theo được đề xuất

Task tiếp theo: **MKW-001 — Khảo sát và chốt phạm vi chấm công MVP**. Đầu ra là `MVP_SCOPE.md` và bản đầu `ATTENDANCE_RULES.md`, gồm actor, quy trình hiện tại, các tình huống cần hỗ trợ, acceptance và câu hỏi còn mở. Khi luật tác động dữ liệu đã rõ, chốt `SYSTEM_DESIGN.md` rồi bootstrap hai app độc lập.

Không nên sao chép cả docs pack SellerFlow trước bước này: làm vậy sẽ chuyển cả các giả định nghiệp vụ, luật quyền hạn và nợ bảo trì không thuộc Minh Khuê vào project mới.

## 14. Nguồn đối chiếu chính

Các đường dẫn dưới đây tương đối với thư mục SellerFlow nguồn:

- `README.md`, `AGENTS.md`, `SKILL_USAGE_MATRIX.md`, `manifest.json`.
- `docs/ai/CURRENT_AUTHORITY_MAP.md`, `AI_DOC_ROUTING_MATRIX.md`, `AGENT_TASK_EXECUTION.md`, `TASK_EXECUTION_FLOW.md`, `PROJECT_EXECUTION_RULES.md`, `TASK_TEMPLATE.md`, `DEFINITION_OF_DONE.md`.
- `docs/ai/TECH_STACK_DECISIONS.md`, `ARCHITECTURE_BOUNDARIES.md`, `SOURCE_STRUCTURE_AND_NAMING_RULES.md`, `API_CONTRACT_GUIDE.md`.
- `docs/ai/TESTING_STRATEGY.md`, `CI_CD_RULES.md`; danh sách heading của roadmap, UI baseline và deployment guide.
- `.agents/superpowers-source.json`, `.agents/skills/using-superpowers/SKILL.md` đọc để khảo sát methodology; `archive/agent-workflow/README.md`.
- `templates/chat-starters/00_fast_end_to_end_prompt.txt`, `04_worker_prompt.txt`.
- `scratchpad/task-dossiers/workflow-ui-pilot-20261018/INDEX.md`, `validation.md`.
- `scratchpad/task-dossiers/workflow-modernization/closeout-handoff.md`, `closeout-execution.md`.
- `package.json`, `apps/web/package.json`, `apps/api/package.json`; danh mục source và migration.

Tất cả nhận định về SellerFlow ở đây là ảnh chụp khảo sát ngày 22/10/2026; thay đổi trong repository sau thời điểm này cần được đối chiếu lại.
