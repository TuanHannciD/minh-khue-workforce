# Kiến trúc kỹ thuật cụ thể — bản để review

## Delta hiện hành01/11/2026 — server pagination Accepted design

Người dùng “Tôi chốt bản thiết kế này” cho [server design](pagination-search-proposal.md); [design15](../design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026)/[API8](api-contract.md#8-đọc-trang-server--thiết-kế-đã-duyệt01112026) thay phần fullmonth Query/client filter cho editing UI ở checkpoint dưới. [Plan mới](server-pagination-implementation-plan.md) Draft/Pending fresh independent review + user plan approval; không triển khai/trial trong spec sync. Stack/ràng buộc module không đổi. Những câu chưa có source/tooling ở checkpoint25–28/10 là lịch sử; readiness thực theo INDEX/validation.

Attendance sở hữu POST read page trong READ ONLY REPEATABLE READ; Employees public EmploymentConsistency mở seam membership/filter/order/count/page IDs, repository SQL nội bộ, không import sâu. Aggregate tháng/invariant offpage thuộc attendance repository; không fullsnapshot rồi slice. Collation/provider/version/lowercase/canonical-equivalent/ID tie parity là prerequisite trước code SQL/shared export order; fail thì route proposed contract delta, không tự fallback. Count/aggregate/invariant vẫn toàn DB workload; payload chỉ page details + global totals.

Query page key `["attendance","page",userId,epoch,month,qTrimmed,page,pageSize]`, q giữ case/ngoài URL; kind không trong key. Active-page15s/gcTime0/retry reads2(1s/3s),4xx dừng, write0; invalidate page tháng sau attendance write, namespace user/epoch sau employee edit/create, chỉ active refetch. React giữ desired criteria và immutable displayed envelope reference khi guard chờ, không clone bảng thành store server khác. Late responses/abort phải qua key/epoch/generation. App-owned draft độc lập page DOM/key giữ raw/frozen keys/revisions; page/q/size/month/kind qua guard; poll đổi IDs/order/clamp giữ old envelope/fetchedAt/footer và hủy gesture, không rebase hoặc ép discard để save intent cũ hợp lệ.

Page projection nhận boundary month/employees/cells/employeeTotals; global footer nhận monthTotals riêng. Rectangle/disjoint/fill/navigation chỉ page; không hidden writes/targets hoặc split save, reconcile vẫn explicit IDs ngoài page/tháng. Full GET MonthDto/export giữ đường full snapshot và cùng sort đã qua parity; Excel build sau transaction, chỉ month, không dùng query page/draft. Không thêm grid engine/virtualization/dependency/store. Acceptance1000 logical qua25/50 là route mới; historical fullDOM Failed/I3/G3/G4/native/SR/Task9 concerns giữ.

Ngày 25/10/2026. Trạng thái tiếp nối: **Phương án A và bộ công nghệ mục tiêu đã Accepted tại [ADR-003](../../../architecture/decisions/ADR-003-product-stack.md)**; phiên bản và chi tiết còn mở vẫn để review. Chưa là implementation plan hoặc quyền cài/scaffold/code. Nguồn nền tảng đã duyệt: [ADR-001](../../../architecture/decisions/ADR-001-product-foundation.md), [ADR-002 về state](../../../architecture/decisions/ADR-002-state-management.md). Nghiệp vụ theo [requirements](../approved/requirements.md); các điểm mở theo mục10 của [design](../design.md).

## 1. Mục tiêu và giới hạn

Cập nhật28/10/2026: người dùng đã chấp nhận bản mẫu C và duyệt toàn bộ [design](../design.md), gồm đề xuất và mục13–14; không mở lại kiến trúc/UI đã chốt. [Kế hoạch triển khai](implementation-plan.md) đã duyệt; bộ thiết kế Task1 chờ review G1, đưa contract/schema/auth/version chi tiết qua gate thiết kế trước code phụ thuộc. Các đoạn “trước kế hoạch”/“trình UI” phía dưới giữ checkpoint kiến trúc25/10, đã được bước tiếp nối này thay về trạng thái; chi tiết kỹ thuật Proposed chưa tự được duyệt, sản phẩm chưa cài/code/kiểm.

Web chấm công toàn công ty, người dùng và sếp cùng quyền, thao tác đơn giản trên điện thoại và đầy đủ desktop. Cần nền đủ rõ để Agent thêm feature mà tìm đúng code, dùng lại UI và không phá contract. API phục vụ web hiện tại và Android sau này. Không thêm tính lương, phân bổ công trình, approval hoặc nhân viên tự check-in.

Checkpoint ban đầu đề xuất các hướng bên dưới; người dùng sau đó chốt phương án A và bộ công cụ đã trình, phạm vi chính xác theo ADR-003. Giữ B/C làm rationale; các từ ứng viên/đề xuất trong bản thiết kế phải đọc cùng ADR-003, không coi mọi chi tiết luồng là đã duyệt. Chưa có bằng chứng các công cụ này cài/build/test tương thích trong project. Không dùng kết quả pilot thay kiểm sản phẩm.

## 2. Các hướng kỹ thuật đã cân nhắc

**A — React/Vite + API NestJS + PostgreSQL: đề xuất chọn.** Web tập trung giao diện nội bộ, API có module/controller/service rõ, TypeScript hỗ trợ kiểm kiểu cả hai ứng dụng. PostgreSQL phù hợp dữ liệu quan hệ, transaction và cập nhật đồng thời. Đổi lại phải vận hành API và DB, quản lý migration/backup; NestJS có cấu trúc/decorator cần tuân thủ.

**B — Next.js cho web + API riêng.** Có quy ước routing/rendering tích hợp, phù hợp nếu cần nội dung công khai hoặc server rendering. Bảng nội bộ tương tác mạnh hiện chưa có yêu cầu SEO/SSR; dùng Next cùng API riêng vẫn cần quy định ranh giới tránh nghiệp vụ chạy ở hai backend. Đây là phương án hợp lệ, nhưng chưa có lợi ích rõ để ưu tiên cho scope hiện tại.

**C — React/Vite + Fastify thuần + PostgreSQL.** API có ít lớp mặc định, phù hợp đội muốn thiết kế cấu trúc riêng. Cần tự chuẩn hóa module, dependency injection, validation và OpenAPI xuyên nhiều feature. Với yêu cầu Agent vận hành theo chuẩn nhất quán và mở rộng feature, đề xuất NestJS để có cấu trúc chung rõ hơn. Không kết luận Fastify thuần không thể mở rộng.

Không đề xuất microservices, Redis, message queue hoặc monorepo orchestrator ở bản đầu khi chưa có nhu cầu thật. Một repository với hai ứng dụng không đòi hỏi những công cụ này.

## 3. Bộ công cụ ứng viên và trách nhiệm

### Web

- **React + TypeScript strict + Vite:** giao diện tương tác, kiểm kiểu và build web; Vite không thay router/API server production.
- **React Router:** tuyến màn hình, tháng/loại bảng trong URL khi cần; xử lý URL không hợp lệ bằng quy tắc rõ. Chưa quy định đường dẫn cụ thể.
- **shadcn/ui nền Radix + Tailwind CSS:** nền component và styling đã chọn về hướng UI; phiên bản, tokens và custom delta cần pin/review. UI đẹp phải được thiết kế bằng hai skill UI, không suy ra từ cài thư viện.
- **TanStack Query + state React:** đã duyệt theo ADR-002. Zustand có điều kiện, không cài mặc định.
- **React Hook Form + Zod:** đề xuất cho form nhân sự/đăng nhập và validation nhập liệu. Bản nháp ô đơn giản có thể dùng state React; không tạo một form library instance cho mỗi ô bảng. Zod phía web không thay validation server.
- **Bảng chấm công thuộc feature attendance:** đề xuất bắt đầu từ semantic HTML table, sticky identity/header và bộ điều khiển nhập riêng. Chưa thêm TanStack Table hoặc grid engine chỉ vì có trong shadcn recipe. Nếu cần ảo hóa/engine khác phải thử tương tác, zoom và accessibility; quyết định dựa trên prototype/benchmark.

### Backend và dữ liệu

- **Node.js LTS + NestJS + TypeScript strict:** API riêng, module theo nghiệp vụ. Đề xuất adapter Express mặc định để giảm cấu hình ban đầu; Fastify adapter chỉ chọn khi có lý do và kiểm compatibility.
- **PostgreSQL + Prisma ORM/Migrate:** dữ liệu quan hệ, query/migration có kiểu, transaction. Prisma model chỉ thuộc backend. ORM không tự đảm bảo quy tắc số công, quyền hoặc chống ghi đè; cần code và test riêng.
- **Nest DTO + class-validator và Nest Swagger:** đề xuất DTO HTTP là nguồn mô tả request/response, bật validation server chặt chẽ; generate OpenAPI từ cùng source. Không suy rằng decorator tự biểu đạt đầy đủ mọi ràng buộc nghiệp vụ, phải kiểm contract và test runtime.
- **OpenAPI + openapi-typescript:** API xuất snapshot contract; web sinh kiểu từ snapshot rồi dùng transport fetch thống nhất. Android về sau có thể sinh client theo cùng contract. Không chia sẻ Prisma entity hoặc import source API vào web.
- **ExcelJS:** công cụ mục tiêu xuất `.xlsx` theo ADR-003, chưa pin/cài/kiểm tương thích. Đề xuất xuất phía API từ dữ liệu đã lưu nhất quán tại thời điểm xuất. Nghiệp vụ đã chốt một sheet Công trên/Tăng ca dưới, tổng bằng công thức để sửa tiếp trong Excel. Cần kiểm version/license, giá trị công thức ban đầu và tính lại trên ứng dụng đọc Excel thật; không coi thư viện ghi công thức là engine đã tính đúng.

### Workspace và kiểm chất lượng

- **pnpm workspace:** đề xuất quản lý web/API cùng repository, lockfile thống nhất và script chạy từng app. Không chuyển tooling/pilot đang dùng npm trong task tài liệu này. Kế hoạch sau phải nêu cách chuyển lockfile/scripts, bảo toàn pilot và kiểm hồi quy nếu chọn pnpm.
- **ESLint + typescript-eslint + React Hooks rules, Prettier:** lint/format thống nhất; import sai cần rule rõ, không chỉ recommended mặc định.
- **dependency-cruiser + ESLint restricted imports:** đề xuất kiểm cycle/chiều module và chặn import sâu; phải cấu hình hiểu alias và có fixture hợp lệ/vi phạm để chứng minh rule hoạt động.
- **Vitest + Testing Library, Supertest:** ứng viên unit/component/API tests; DB integration dùng PostgreSQL thử riêng, không SQLite thay thế cho transaction/concurrency cần chứng minh trên PostgreSQL.
- **Playwright Test + T3 Browser:** regression chạy lại và thao tác/debug trực tiếp theo workflow hiện có. Cảm ứng/zoom iPhone và Android thật là gate riêng.

Các phiên bản chính xác chưa pin. Chọn một bộ tương thích tại bước tooling, ghi Node/package manager engine và lockfile; dùng Node LTS phù hợp toàn bộ dependencies. Không mặc định Node22.12 của pilot đáp ứng CLI mới, không chạy lệnh `latest` rồi gọi đó là pin đã review. Hosting/CI provider chưa chọn.

## 4. Cây source đề xuất

Đây là cấu trúc thiết kế, **chưa tạo source/thư mục sản phẩm**. Chỉ tạo file cần cho use case thật; không bắt mọi feature có đủ thư mục trống.

```text
apps/
  web/
    src/
      app/                         # router, providers, shell, bootstrap
      features/
        attendance/
          api/                     # queries/mutations và query keys
          model/                   # lựa chọn ô, draft, logic hiển thị feature
          ui/                      # bảng, phần nhập công/tăng ca
          index.ts                 # exports tối thiểu cho consumer ngoài
        employees/                 # form và thao tác nhân sự
        session/                   # trạng thái phiên và UI đăng nhập
      shared/
        ui/                        # primitives shadcn/Radix
        patterns/                  # Field/empty/error có reuse thật
        api/                       # fetch, credentials, lỗi transport
          generated/               # types sinh từ OpenAPI; không sửa tay
        styles/                    # tokens/theme/typography
        lib/                       # helper trung tính, có owner
  api/
    src/
      main.ts                      # bootstrap HTTP
      app.module.ts                # lắp ghép module
      modules/
        attendance/                # HTTP DTO/controller/service/repository
        employees/                 # use case nhân sự
        auth/                      # session, kiểm danh tính/quyền
      infrastructure/              # DB/config/logging; không chứa mọi nghiệp vụ
    prisma/                        # schema và migrations backend
contracts/
  openapi.json                     # snapshot sinh từ API, review cùng thay đổi
tests/
  product-e2e/                     # giả định vị trí suite riêng với pilot
docs/
  architecture/                    # chuẩn + ADR
```

Test nhỏ đặt cạnh module/file tương ứng khi phù hợp; suite integration dùng tài nguyên chung có vị trí riêng. File web dùng kebab-case, exports component PascalCase, hook bắt đầu bằng use; Nest giữ quy ước `.controller.ts`, `.service.ts`, `.module.ts`. Alias `@/` đề xuất chỉ trỏ src của từng app, không xuyên sang ứng dụng kia. Không alias che một import sai ranh giới.

Quy định tiếp nối về độ dài và đọc source tại [SOURCE_NAVIGATION](../../../architecture/SOURCE_NAVIGATION.md): tách theo trách nhiệm, giữ module/file map khi cần, ngưỡng review không là hard cap. Chưa có checker tự động; cây ứng viên ở đây không yêu cầu tạo mọi file/thư mục hoặc TOC trước khi có source.

Web chỉ gọi API qua transport/client; không import API source/ORM. Feature không import nội bộ feature khác; app lắp ghép thông qua exports tối thiểu. Nếu attendance cần thông tin nhân sự, nhận qua contract hoặc interface module công khai thích hợp, không đọc trực tiếp repository nội bộ employees. Shared không import ngược feature/app. API không import component web. Không tạo package shared-domain cho quy tắc tính công chỉ để client/server chạy cùng code; server là nguồn kiểm tính đúng, client hiển thị/preview theo contract và test đối chiếu.

## 5. State cụ thể và luồng nhập công

### Phân sở hữu

**Server:** dữ liệu nhân sự, mốc ngày, nội dung công/giờ, màu nhắc, phiên đăng nhập và cơ chế concurrency. Backend kiểm quyền và trả dữ liệu/tổng nhất quán. Cách lưu số và schema sẽ chốt sau các câu hỏi nghiệp vụ, không dùng JavaScript floating-point tùy tiện cho tổng cần chính xác.

**TanStack Query:** snapshot bảng tháng, danh sách nhân sự và kết quả API. Query key gồm phạm vi dữ liệu thực tế như tháng và phiên/ngữ cảnh truy cập cần thiết; logout xóa cache nhạy cảm. Công/tăng ca có thể dùng chung snapshot tháng nếu contract phù hợp; không tải lại toàn bộ chỉ vì chuyển tab khi dữ liệu vẫn dùng được. Cấu trúc response và TTL chưa pin.

**React:** tọa độ ô đang chọn, hộp nhập, chuỗi draft và màu nhắc đang sửa, lỗi nhập, trạng thái tương tác của feature. Giữ draft tách khỏi snapshot API: background refetch không reset input đang gõ. Khi đổi ô/tháng hoặc đóng phần nhập mà có draft chưa lưu, cần thiết kế UX giữ/cảnh báo rõ; không âm thầm bỏ bản nháp. Hành vi cụ thể cần review trong UI C.

**URL:** đề xuất tháng và loại bảng để reload/quay lại giữ vị trí màn hình ở mức lựa chọn dữ liệu. Không đưa bản nháp, tên nhân sự thật hoặc thông tin phiên vào URL. Vị trí cuộn/vùng chọn có cần khôi phục hay không chưa chốt.

**Zustand:** chỉ đưa vào khi nhiều consumer cần dùng chung state giao diện và owner React hiện tại không còn gọn; không store bảng công, tổng hoặc token như bản sao của server state. Thêm store phải ghi owner, dữ liệu, thời điểm reset và lý do.

### Khi anh nhập 1,5 công

1. Query đọc snapshot tháng; giao diện hiện nội dung và màu theo cùng dữ liệu đã nhận.
2. Chạm ô tạo draft từ giá trị hiện tại và ghi nhận phiên bản dữ liệu nền để phát hiện xung đột. Nhập chỉ thay draft; bảng không báo đã lưu.
3. Lưu gửi giá trị/màu trong phạm vi thay đổi đã thiết kế, kèm phiên bản nền. Chặn bấm lưu lặp khi request cùng ô đang chạy; không dựa vào mặc định các mutation có thể chạy song song.
4. Backend xác thực, kiểm quyền/validation và ghi có điều kiện nguyên tử theo phiên bản. Cả sửa giá trị lẫn màu phải đi qua kiểm concurrency để tránh ghi đè thay đổi của nhau.
5. Thành công mới cập nhật snapshot/tổng theo response hoặc invalidate và đọc lại phần liên quan. Đề xuất chưa dùng optimistic update ở bản đầu để giảm rollback và tổng tạm dễ gây hiểu nhầm. Sau lưu phải hiện rõ trạng thái đã lưu/đang tải lại nếu có.
6. Lỗi mạng/server giữ draft, hiển thị lỗi và nút thử lại. Không tự retry mutation một cách mù quáng: timeout có thể xảy ra sau khi DB đã commit. Lần thử lại phải đối chiếu dữ liệu/version mới hoặc dùng idempotency contract đã thiết kế; không hứa request thất bại là dữ liệu chưa lưu.
7. Nếu dữ liệu nền đã cũ, backend từ chối cập nhật và trả/cho đọc giá trị mới. UI giữ draft bên cạnh giá trị mới, người dùng quyết định sửa tiếp. Không tự retry ghi đè; không tạo approval hoặc nút force-write bỏ concurrency.

Revision theo ô công/tăng ca là hướng kỹ thuật đề xuất, **chưa chốt field/status HTTP/schema**. Nếu hai loại độc lập thì tránh khóa nhầm cả tháng; đổi mốc nhân sự ảnh hưởng ô cũng phải được kiểm cùng tính nhất quán. Cơ chế compare-and-swap/transaction phải test hai request tranh chấp trên DB thật của stack được chọn.

### Lưu vùng và xung đột — quyết định tiếp nối

Nghiệp vụ đã duyệt: một ô xung đột thì dừng toàn bộ lần lưu vùng, không ghi một phần; giữ draft và chỉ rõ ô xung đột. “Ghi đè cả vùng” không bỏ kiểm tra phiên bản, chỉ cho phép thay nội dung có sẵn theo snapshot người nhập đã xem.

Thiết kế kỹ thuật đề xuất để đáp ứng: API nhận tập ô cần áp dụng và phiên bản nền; với chọn rời, gửi tập đích rõ ràng đã loại trùng, không biến thành chữ nhật bao ngoài. Kéo fill lặp giá trị nguồn không tự tăng dãy; contract phải xác định snapshot/revision của nguồn chỉ đọc và cách báo khi nguồn thay đổi; backend kiểm quyền, tính hợp lệ/mốc làm việc và phiên bản trong cùng transaction, ghi tất cả khi toàn bộ kiểm tra đạt. Không tách thành các request lưu ô độc lập gây thành công một phần. Khi có xung đột, rollback mọi ghi của lần lưu và cung cấp/cho đọc dữ liệu mới để UI đối chiếu, giữ vùng/giá trị/chế độ draft. Với điền trống, không tự mở rộng/thu hẹp tập áp dụng sau refetch rồi âm thầm lưu; cần đối chiếu và thao tác lưu lại có chủ ý. Chi tiết phạm vi revision, request/response/status và idempotency vẫn Proposed, cần review trước code.

Acceptance tương lai: hai request tranh chấp trên PostgreSQL thật phải chứng minh không partial write, không mất draft ở UI, không tự retry ghi đè và không nhầm mất phản hồi mạng với rollback. **Not run**; prototype HTML không có transaction/concurrency.

## 6. Cập nhật giữa hai tài khoản và độ bền

Đã chốt tự cập nhật dữ liệu đã lưu khoảng mỗi15 giây khi hai người cùng mở bảng, giữ draft đang nhập. Thiết kế đề xuất: TanStack Query refetch interval khoảng15 giây khi màn hình bảng đang hoạt động, kèm refetch lúc mở/trở lại tab/kết nối lại và thao tác tải lại rõ ràng. Không khởi tạo timer trùng theo từng ô hoặc tài khoản. Background refetch cập nhật snapshot, không ghi đè draft hoặc đổi phiên bản nền của draft để che xung đột. Khi tab bị browser hạn chế hoặc mất mạng, không cam kết đúng15 giây; hiện trạng thái tải/lỗi/độ mới phù hợp. Không cần tự thêm SSE/WebSocket. Concurrency backend vẫn bắt buộc. Polling sản phẩm chưa triển khai/kiểm chứng.

Query retry đọc cần phân loại lỗi: lỗi auth/validation không retry vô ích; lỗi mạng tạm có giới hạn và feedback. Background refetch lỗi có thể giữ snapshot cũ nhưng cần báo độ mới; lần tải đầu thất bại phải có trạng thái lỗi/thử lại, không trình bảng rỗng như không có dữ liệu.

Lưu thành công nghĩa dữ liệu đã qua API vào DB; reload/thiết bị khác đọc lại phải đúng. Cache in-memory không đảm bảo draft sau reload/đóng tab. Offline editing, service worker và lưu dữ liệu nhân sự vào localStorage/IndexedDB chưa được yêu cầu hoặc duyệt. Nếu cần khôi phục draft qua reload phải thiết kế riêng về dữ liệu và vòng đời.

## 7. API, xác thực và dữ liệu

Đề xuất REST JSON với OpenAPI snapshot sinh từ DTO API là đường đi cụ thể hóa nguyên tắc [API_CONTRACTS](../../../architecture/API_CONTRACTS.md). Request/response/error/date format và pagination phải review trước code; chưa viết endpoint/field giả làm yêu cầu. Date công là ngày lịch, không tùy tiện đổi qua UTC làm lệch ngày; thời điểm kỹ thuật cần quy tắc timezone riêng.

Đã duyệt hai tài khoản tạo sẵn, đăng nhập bằng tên đăng nhập và mật khẩu, không mở đăng ký công khai. Thiết kế kỹ thuật đề xuất: web dùng phiên đăng nhập do API xác minh, cookie HttpOnly/Secure và chính sách SameSite/CSRF phù hợp topology. Session/cookie là phương án để review, chưa chọn thư viện auth. Nghiệp vụ khôi phục đã chốt: người phụ trách vận hành xác minh và đặt lại, bản đầu chưa cần email/SMS. Cơ chế thao tác được kiểm soát, xác minh/bàn giao và thu hồi phiên sau reset cần thiết kế cụ thể trước vận hành; không suy thành quyền tạo admin UI/tài khoản mới hoặc chạy reset trên hệ thống thật. Không tự viết thuật toán mã hóa/hash; chọn implementation được duy trì và kiểm security. Không lưu token web vào Zustand/localStorage chỉ vì thuận tiện.

Web/API là hai app nhưng có thể đặt sau cùng một domain qua reverse proxy để đơn giản cookie/CORS. Vẫn build/chạy riêng. Hosting, domain, TLS, secret management, backup/restore và cơ chế session production phải thiết kế trước phát hành; không tự deploy. Android sau này cần luồng đăng nhập/token phù hợp native, không coi cookie web là đã giải quyết xong Android auth.

Mô hình dữ liệu ở mức khái niệm gồm nhân sự/mốc làm việc, công và giờ tăng ca độc lập, màu nhắc, phiên bản concurrency và thông tin tài khoản/phiên. Chưa phê duyệt schema/table/field. Không tự lưu N/— thành công thực nhận; cần thiết kế cách suy hiển thị theo mốc ngày và giữ lịch sử khi mốc thay đổi. Nghiệp vụ đã chốt bước0,5 cho số công tùy chỉnh,0 công thành F và chặn đổi mốc loại dữ liệu đã nhập. Trần công30/tăng ca24 giờ mỗi ô đã chốt; nhận dấu phẩy/chấm khi nhập, hiển thị dấu phẩy, sai bước/vượt trần giữ draft và báo lỗi, không làm tròn. Đã chốt reminder-only cũng chặn đổi mốc khi bị loại, giữ nguyên nhắc và chỉ rõ ô; constraint/migration chưa thiết kế/triển khai.

## 8. Kiểm tự động phải chứng minh được gì?

Các mục sau là acceptance cho tooling/implementation plan tương lai; **chưa có script và chưa chạy trên sản phẩm**. Kế hoạch cần đặt tên lệnh thật sau khi cấu hình, không dùng lệnh pilot làm bằng chứng.

- Install theo lockfile, format/lint, type-check strict và build riêng từng app. Build web không cần import source backend; build API không phụ thuộc UI.
- Boundary check chặn shared→feature, web→server, deep import xuyên feature và cycle; fixture cố ý vi phạm phải thất bại, fixture hợp lệ phải đạt. Loại trừ generated code có phạm vi/lý do, không loại trừ toàn feature để làm xanh.
- Contract generation tái tạo snapshot/types ổn định; CI/check phát hiện drift khi đổi DTO mà chưa cập nhật output. Request/response thực và validation phải được test, không chỉ compile types.
- Unit logic công/giờ/mốc ngày theo phần Q1/Q4 đã chốt và tiếp tục làm rõ phần mở; test màu không đổi tổng, công/tăng ca không gộp và tổng ngày/người nhất quán.
- Component tests cho draft/lỗi, chuyển bảng, chọn ô, refetch khoảng15 giây không làm mất draft hoặc che xung đột, và hành vi keyboard; không test lại nội bộ Radix chỉ để tăng số lượng.
- API integration có quyền, validation, transaction và hai request cập nhật cùng phiên bản; kiểm một lần đạt và lần còn lại báo xung đột, không ghi đè âm thầm. Test sửa màu/giá trị đồng thời và thay mốc cần xét theo contract.
- Browser web–API–PostgreSQL thật: thêm nhân sự giả, nhập công/giờ/màu, lỗi/thử lại, reload/persistence, hai phiên tranh chấp, xuất Excel/mở kiểm nội dung. Không thay bằng API mock hoặc file tồn tại.
- Kiểm iPhone/Android thật cho zoom/touch/xoay/sticky và desktop cho chuột/Enter/Tab. Thiếu thiết bị ghi Not run. Accessibility không suy ra từ thư viện component.
- Đề xuất dataset giả20/200/1.000 nhân sự cho thiết kế benchmark, không là trần hay cam kết quy mô. Ghi thời gian tải/render/nhập/scroll và thiết bị; chốt ngân sách hiệu năng trước khi chọn virtualization. Tránh dựng hàng nghìn input/form đang hoạt động trong DOM.

Review độc lập cho code/tooling theo [QUALITY_GATES](../../../agent/QUALITY_GATES.md) vẫn áp dụng khi đến task triển khai và có quyền dispatch. Tài liệu hiện tại tự review, không claim reviewer độc lập. CI provider/remote chưa chọn và không nằm trong task ghi tài liệu này.

## 9. Điểm cần review trước kế hoạch triển khai

1. Đã chốt hướng A và bộ công nghệ mục tiêu theo ADR-003; chốt/kiểm phiên bản tương thích ở bước tooling, không kế thừa pin pilot một cách tự động.
2. Đăng nhập tên/mật khẩu và hai tài khoản tạo sẵn đã chốt; khôi phục qua vận hành xác minh/đặt lại đã chốt, còn thiết kế chi tiết; tự cập nhật khoảng15 giây và giữ draft đã chốt; lựa chọn hạ tầng vận hành/backup trước release.
3. Q1 đã chốt bước/trần/định dạng/lỗi nhập; Q4 đã chốt cả reminder-only khi đổi mốc; Q5 đã chốt bố cục/công thức Excel; trình bản UI C hoàn thiện bằng Impeccable + UI UX Pro Max.
4. Review contract/request/response, concurrency, migrations và gate kiểm đúng phạm vi. Chưa đủ quyết định để Agent tự triển khai toàn bộ sản phẩm.
5. Sau khi bản đặc tả viết đủ và được duyệt, mới viết implementation plan, chia task có ownership/check/review/resume. Không chuyển tài liệu này thành danh sách lệnh cài rồi thực hiện ngay.

## 10. Nguồn kỹ thuật và giới hạn khảo sát

Đọc tài liệu công khai ngày25/10/2026, không cài hoặc chạy các stack ứng viên:

- [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations): query cache/refetch/retry và mutation là các cơ chế riêng; cần cấu hình theo hành vi app. Lần đọc lại HTML bị403 nên đọc bản Markdown chính thức tại [defaults source](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/important-defaults.md), [mutations source](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/mutations.md); mặc định mutation có thể song song và không tự retry lỗi.
- [Zustand README](https://github.com/pmndrs/zustand): store chia sẻ theo hook; trang docs introduction được thử trả404, không dùng lỗi đó để kết luận thư viện không khả dụng.
- [Vite guide](https://vite.dev/guide/): React/TypeScript templates và yêu cầu engine cần đối chiếu khi pin phiên bản.
- [Nest first steps source](https://github.com/nestjs/docs.nestjs.com/blob/master/content/first-steps.md): cấu trúc TypeScript/Node và adapter; CLI có thể cần Node cao hơn runtime tối thiểu. Trang HTML chỉ trả shell nên đọc source chính thức.
- [Prisma PostgreSQL](https://www.prisma.io/docs/orm/overview/databases/postgresql), [OpenAPI specification](https://spec.openapis.org/oas/latest.html): nguồn đối chiếu để thiết kế/pin tiếp; HTTP200 không chứng minh app tương thích hoặc mọi version generator hỗ trợ spec latest.

Khảo sát trang web chỉ là tham khảo thiết kế. Version/license/compatibility của từng dependency, generation, engine, build, boundary rules và khả năng vận hành vẫn **Not run** trên sản phẩm.


### Bảo toàn dữ liệu khi đổi mốc — tiếp nối Q4

Yêu cầu Accepted: không cho đổi mốc làm loại ô đã nhập công/tăng ca hoặc ô trống có reminder ở một trong hai bảng, trả danh sách vị trí cần xử lý trước và giữ mốc cũ. Thiết kế đề xuất: kiểm toàn bộ khoảng bị loại trên dữ liệu server, trong cùng ranh giới transaction/concurrency với cập nhật mốc. Phối hợp kiểm lưu giá trị/bật reminder và sửa mốc để không có khoảng trống giữa bước kiểm và ghi; không chỉ dựa vào danh sách ô đã tải trên frontend. Không tự cascade-delete hoặc normalize nội dung thành N/—. Contract lỗi, pagination danh sách liên quan và cơ chế khóa/revision cụ thể vẫn Proposed; cần thử request cạnh tranh trên PostgreSQL khi có quyền triển khai. Not run, chưa có API/schema sản phẩm.
