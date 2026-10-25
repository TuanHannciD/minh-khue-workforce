# Rà soát nền tảng tái sử dụng và bảo trì

Ngày 25/10/2026, checkpoint base `bb390add47a862b12d7a9ad4fdd74cc0399b46a4`. Trạng thái: **Khảo sát hiện trạng + đề xuất để review**, không phải coding rule hoặc kiến trúc đã duyệt. Phạm vi/quyền/ownership tại [INDEX](../INDEX.md). Ý định mới của người dùng: chuẩn bị một hệ UI chuyên nghiệp, tái sử dụng và dễ bảo trì khi có thêm nhiều tính năng; shadcn/ui + Radix đang được cân nhắc.

## Kết luận

Nền tảng hiện có quy trình Agent/test/review tương đối rõ, nhưng chưa có chuẩn kiến trúc code sản phẩm, design system hoặc công cụ ép ranh giới module. Chọn shadcn/ui + Radix giải quyết nền component web, không tự giải quyết cấu trúc feature, contract API và bảo trì dài hạn.

Đề xuất: một codebase quản lý tập trung, web/API tách ứng dụng, mỗi ứng dụng chia theo feature/module; xây bộ UI web thống nhất trên shadcn/ui với nền Radix nếu lựa chọn này được duyệt. Khởi đầu bằng ít lớp có trách nhiệm rõ, chỉ tách package dùng chung khi có người sử dụng thực tế. Bản đầu vẫn chỉ triển khai nghiệp vụ được duyệt; không tạo sẵn các module tương lai chưa có yêu cầu.

## 1. Những gì thực sự đã có

| Nội dung | Bằng chứng hiện tại | Giới hạn |
| --- | --- | --- |
| Nguồn chuẩn và cách Agent đọc tài liệu | [AGENTS](../../../../AGENTS.md), [authority map](../../../agent/AUTHORITY_MAP.md), [routing](../../../agent/DOC_ROUTING.md) | Quy định quyền/nguồn, chưa định nghĩa cây source sản phẩm |
| Task, ownership, review/resume | [execution rules](../../../agent/EXECUTION_RULES.md), [quality gates](../../../agent/QUALITY_GATES.md) | Có review theo rủi ro, chưa có checklist kiến trúc feature/UI cụ thể |
| Quy trình UI và browser | [skill policy](../../../agent/SKILL_POLICY.md), [browser testing](../../../agent/BROWSER_TESTING.md) | Có skill và phân biệt loại evidence, chưa có thư viện component/tokens sản phẩm |
| Lint | [package.json](../../../../package.json), [eslint.config.mjs](../../../../eslint.config.mjs) | ESLint recommended, globals Node/browser chung; lệnh chỉ quét scripts/pilot/tests/config. Chưa có rule boundary, import cycle hoặc TypeScript/React |
| Check tài liệu | [checker](../../../../scripts/check-docs.mjs) | UTF-8, link/anchor/fence; không kiểm chứng kiến trúc hoặc áp đúng rule vào code |
| Test và regression | package scripts, tests/pilot/browser specs, quality gates | Kiểm chứng pilot ghi chú; chưa phải test sản phẩm, chưa có type-check/build sản phẩm |
| Ngữ cảnh UI | [brief sản phẩm](../ui/BRIEF.md), root PRODUCT.md/DESIGN.md | Root vẫn thuộc pilot; hướng C được chọn về tổ chức, thiết kế thị giác chưa duyệt |

Khảo sát cả file ẩn cấp root; chưa thấy `.github` hoặc cấu hình CI trong checkout này. Không kết luận về dịch vụ CI ngoài repository. Các thư mục source hiện có là pilot/scripts/tests; chưa có apps/packages của sản phẩm. Không lấy báo cáo lịch sử SellerFlow hoặc cấu trúc pilot làm chuẩn ngầm.

Những phần còn thiếu: quyết định repository/stack; cây source; chiều import/public API module; tiêu chí dùng shared; design tokens/component ownership; contract API và luồng nâng phiên bản; naming/state/error/testing conventions; enforcement bằng lint/type/build/CI. Chúng chưa được coi là Enforced chỉ vì tài liệu workflow đã yêu cầu chất lượng.

## 2. Ba cách tổ chức có thể chọn

| Cách | Điểm mạnh | Chi phí/hạn chế | Đánh giá |
| --- | --- | --- | --- |
| Hai ứng dụng hoặc hai repository độc lập, quy ước phối hợp qua API | Tách phát hành/ownership rõ, có thể phù hợp hai đội riêng | Cần giữ contract và UI/client version đồng bộ ở nhiều nơi; tăng thao tác của Agent | Hợp lệ khi đội/quyền/vòng phát hành cần tách; chưa có nhu cầu bắt buộc này |
| Một repository, web/API là hai ứng dụng; feature/module tách rõ trong từng ứng dụng | Review thay đổi xuyên FE/API/contract cùng nơi, vẫn chạy/phát hành riêng; dễ bắt đầu nhỏ | Cần quy tắc import và build từng phần, không được coi monorepo là tự có kiến trúc | **Đề xuất phù hợp hiện tại** |
| Nền tảng nhiều package/registry, microfrontend hoặc microservices từ đầu | Hữu ích khi có nhiều đội/ứng dụng và nhu cầu tách độc lập thật | Tăng orchestration, release, dependency và vận hành trước khi có lợi ích tương xứng | Chưa có căn cứ chọn lúc này |

Nhiều tính năng và nhiều nhân sự là hai chiều mở rộng khác nhau. Module boundary giúp bảo trì tính năng; khả năng xử lý dữ liệu cần thiết kế query/lưu trữ/render và benchmark riêng. Chưa suy ra trần nhân sự, nhu cầu microservices hoặc một con số hiệu năng từ quy mô hiện tại khoảng20 người.

## 3. Cấu trúc ứng viên

Đây là cây minh họa **nếu chọn web React/TypeScript với shadcn**; chưa tạo thư mục, cài package hoặc chọn framework/backend. Không bắt mọi feature có đủ các thư mục con khi chưa cần.

```text
apps/
  web/
    src/
      app/                      # khởi tạo, routes, providers, layout chung
      features/
        attendance/             # bảng công, tăng ca, màu nhắc
          api/                  # lời gọi API riêng của feature
          model/                # state/logic riêng của feature
          ui/                   # màn hình và thành phần chấm công
          tests/                # kiểm hành vi feature khi cần
          index.ts              # API công khai tối thiểu nếu có consumer
        employees/              # quản lý nhân sự trong scope đã duyệt
      shared/
        ui/                     # primitives/component nền shadcn
        patterns/               # tổ hợp trung tính có reuse thật
        api/                    # transport/client config, không chứa mọi endpoint
        lib/                    # helper nhỏ, thuần, trung tính nghiệp vụ
        styles/                 # tokens, typography, theme
  api/
    src/
      modules/
        attendance/             # use case/rule/data access của chấm công
        employees/              # use case/rule/data access của nhân sự
      infrastructure/           # DB, logging, tích hợp kỹ thuật
      bootstrap/                # khởi tạo/cấu hình dịch vụ
contracts/                      # nguồn contract API độc lập ngôn ngữ
docs/
  architecture/                 # kiến trúc + quyết định sau khi được duyệt
```

Backend cũng chia module trước, sau đó tách HTTP/use case/domain/data access khi độ phức tạp thực sự cần. Không bắt một CRUD nhỏ có nhiều lớp rỗng. Hướng phụ thuộc nên giữ HTTP gọi use case; use case/domain không phụ thuộc trực tiếp framework HTTP hoặc UI. Hạ tầng thực thi cổng truy cập dữ liệu khi sử dụng pattern này; lựa chọn chi tiết theo stack backend sau.

`contracts/` là vị trí đề xuất, có thể là OpenAPI/JSON Schema sau quyết định contract. Chưa có lý do tạo sẵn `packages/ui`, shared backend/frontend runtime hoặc Android app. Khi có ứng dụng web thứ hai dùng cùng UI, có thể tách shared/ui thành package với interface đã ổn định. Android native dùng API/contract và ngôn ngữ thiết kế, không mặc định dùng lại component DOM/Radix.

## 4. Bốn loại thành phần phải phân biệt

| Loại | Ví dụ | Nơi sở hữu đề xuất | Điều không được trộn vào |
| --- | --- | --- | --- |
| UI nền | Button, Input, Checkbox, Dialog, Tabs | shared/ui | HTTP call, số công, quyền nhân sự |
| Tổ hợp trung tính | Field với label/error, trạng thái trống, xác nhận chung | shared/patterns khi có consumer thật | Trạng thái/chính sách chỉ thuộc chấm công |
| Thành phần nghiệp vụ | AttendanceGrid, WorkCreditInput, OvertimeInput | features/attendance | Không đưa vào shared chỉ vì có thể được import ở hai màn hình chấm công |
| Khung ứng dụng | Navigation, layout, providers, lỗi route | app | Không nhét toàn bộ logic feature vào route/layout |

Ví dụ thêm một feature tương lai: feature đó dùng cùng Button/Field/layout, có module và thành phần riêng. Nó không copy Button rồi đổi màu cục bộ, cũng không import sâu vào nội bộ AttendanceGrid để dùng một helper. Ví dụ tương lai chỉ minh họa reuse, không thêm feature vào scope.

## 5. Rule code và reuse đề xuất

Các mục dưới là **Draft**, chưa áp thành rule thực thi.

1. **Một nơi sở hữu mỗi trách nhiệm.** Route lắp ghép màn hình; UI hiển thị/tương tác; feature model quản lý bản nháp/quy tắc giao diện; server chịu trách nhiệm validation, quyền và kết quả nghiệp vụ cuối cùng. Tránh component vừa render bảng, gọi HTTP trực tiếp rải rác, vừa tính mọi tổng và xử lý persistence.
2. **Chiều import rõ.** app có thể gọi feature/shared; feature có thể gọi shared; shared không import feature/app. Không import sâu vào nội bộ feature khác. Khi có phụ thuộc feature thật, dùng interface công khai tối thiểu được khai báo; phối hợp ở app hoặc use case phù hợp. Không tạo vòng phụ thuộc hoặc export mọi thứ qua một barrel toàn cục.
3. **Reuse theo trách nhiệm và consumer thật.** Tìm component/helper hiện có trước khi thêm mới. Thành phần có thể dùng lại trong chính một feature vẫn thuộc feature đó. Chỉ nâng lên shared khi có ý nghĩa trung tính và nhu cầu dùng thật, không chỉ vì hai đoạn code nhìn giống nhau; không tạo MegaTable/MegaForm với hàng chục cờ để đoán tính năng tương lai.
4. **Không dựng kho utils/components chung vô chủ.** File đặt theo trách nhiệm cụ thể; mỗi module có entrypoint/consumer xác định. Helper định dạng số có thể trung tính; quy tắc F/N/—, công/tăng ca và ảnh hưởng ngày làm thuộc chấm công/nhân sự, không là generic formatter.
5. **Một hệ UI.** Đề xuất dùng shadcn/ui nền Radix cho web nếu được duyệt, import primitives qua shared/ui và chỉnh variant/theme tại nguồn này. Không tạo nút riêng cho từng feature hoặc đổi sang bộ primitives khác bằng mặc định CLI. Không cần wrapper thêm nếu component hiện có đã đáp ứng.
6. **State đúng nơi.** Bản nháp/chọn ô gần feature; dữ liệu server qua lớp truy cập dữ liệu thống nhất; state dùng toàn ứng dụng chỉ cho nhu cầu toàn cục thật. Không đưa toàn bộ state vào global store. Chưa tự chọn thư viện query/store/form chỉ để đủ danh mục.
7. **Contract riêng với DB.** Client dùng API DTO/client theo contract, không import entity ORM/schema DB hoặc server secrets vào FE. Kiểu compile-time không thay server validation. Nếu chọn TypeScript, đề xuất strict mode và hạn chế any có lý do; không tự giới hạn BE phải TypeScript để chia sẻ types.
8. **Đặt tên nhất quán.** Đề xuất file web kebab-case, component export PascalCase, function/variable camelCase, hook có tiền tố use; tôn trọng convention framework cho route/config. Không áp quy tắc web lên backend khác ngôn ngữ. Không đặt ngưỡng dòng file tùy tiện; tách khi có nhiều trách nhiệm hoặc khó kiểm thử.
9. **Dependency có mục đích và chủ sở hữu.** Chọn/version pin/lockfile theo package manager đã duyệt, không thêm nhiều thư viện cùng một vai trò nếu chưa có lý do. Thay đổi component vendored cần ghi nguồn/version và custom delta; nâng upstream qua diff/review, không ghi đè nguyên bộ lên phần đã tùy biến.
10. **Tài liệu đi cùng thay đổi.** Thay public interface, contract, tokens/component dùng chung phải cập nhật nguồn sở hữu cùng task, chỉ rõ consumer ảnh hưởng và kiểm tra tương ứng. Chốt quyết định quan trọng trong ADR, không chép cùng một rule sang nhiều file để chúng lệch nhau.

## 6. Nền UI chuyên nghiệp cần chuẩn bị

Đề xuất giữ cấu trúc C, bổ sung nền thiết kế dùng chung trước khi nhân rộng màn hình:

- **Tokens:** màu thương hiệu, nền/chữ/viền, spacing, typography tiếng Việt, độ bo, elevation, focus, mật độ bảng và vùng chạm. Màu xanh nhắc kiểm tra là semantic riêng, không mặc định đồng nghĩa thành công/đã duyệt. Không khóa zoom để làm bảng vừa màn hình.
- **Component API:** variants/kích thước/trạng thái chuẩn; vùng nhấn phù hợp điện thoại, label và feedback nhất quán. Không gán một tiêu chuẩn px native cho mọi nền tảng web.
- **Catalog component:** xem/kiểm trạng thái thường, focus, disabled, loading, error, empty, nội dung dài và tiếng Việt. Chọn công cụ như Storybook hoặc giải pháp nhẹ sau khi chọn stack, chưa cài bắt buộc.
- **Patterns responsive:** hướng C một bảng lớn, phần nhập dễ thao tác ở mobile và cạnh bảng khi desktop đủ rộng. Bảng dày không được làm tất cả chữ/nút quá nhỏ. Độ đẹp phải được review trên bản mẫu hoàn thiện hơn, không suy ra từ logo shadcn hoặc mặc định component.
- **Bảng chuyên biệt:** semantic table làm nền khi phù hợp; TanStack Table hoặc grid engine chỉ cân nhắc theo nhu cầu chọn/nhập ô, giữ cột, keyboard, scroll/zoom và hiệu năng. shadcn Data Table là mẫu xây dựng, không có sẵn trải nghiệm Excel hoàn chỉnh. Không biến AttendanceGrid thành UI nền trung tính.

Nguồn tham khảo đã đọc trong trao đổi: [shadcn introduction](https://ui.shadcn.com/docs), [Data Table](https://ui.shadcn.com/docs/components/data-table), [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction). Đây là đánh giá phương án, không xác nhận package/version đã cài.

## 7. Từ tài liệu sang kiểm soát thực sự

| Ràng buộc muốn có | Enforcement đề xuất sau khi duyệt stack | Bằng chứng cần khi triển khai |
| --- | --- | --- |
| Không import ngược/shared phụ thuộc feature; không import sâu | Rule import/boundary có resolver khớp alias; kiểm cycle phù hợp | Fixture import sai bị chặn và import hợp lệ đạt |
| Kiểu dữ liệu/public interface nhất quán | Type-check strict nếu stack hỗ trợ, build từng app | Lệnh thật chạy trên sản phẩm, không chỉ pilot |
| Contract/client không lệch | Nguồn schema rõ, generation hoặc kiểm đồng bộ khi phù hợp | Contract change phát hiện client/schema drift và test response thực |
| Component chung không bị hỏng khi sửa | Test hành vi component và consumer ảnh hưởng, catalog trạng thái | Keyboard/focus/error/mobile ở scope tương ứng, không chỉ ảnh snapshot |
| Luật công/tăng ca chính xác | Unit/domain + API integration, browser flow theo rủi ro | Dữ liệu giả, API/DB đúng target; test số/màu/ngày và xung đột đã chốt |
| Thay đổi được review trước tích hợp | Gate lint/type/test/build và review theo QUALITY_GATES | Snapshot/commit thật, findings/fixes và kết quả thực, không chỉ checklist đã tick |

Chưa chọn plugin lint hoặc công cụ CI cụ thể. Lệnh `npm run check` hiện tại không được gọi là đã kiểm các ràng buộc trong bảng. Với thay đổi nền dùng chung sau này, kiểm consumer chịu ảnh hưởng; không chạy vô hạn toàn bộ test khi không có căn cứ, cũng không bỏ regression cần thiết vì chỉ sửa một component.

## 8. Bộ nguồn chuẩn cần hoàn thiện sau review

Tránh tạo nhiều rule trùng nhau. Đề xuất bốn nguồn nội dung sản phẩm dưới docs/architecture (tên/vị trí còn là đề xuất):

| Nguồn dự kiến | Sở hữu nội dung |
| --- | --- |
| ARCHITECTURE.md + ADR ngắn | Cây ứng dụng/module, chiều phụ thuộc, quyết định stack/repository và lý do |
| CODE_CONVENTIONS.md | Naming, import/public API, state, error, tiêu chí shared và ví dụ đúng/sai |
| UI_SYSTEM.md | Tokens, primitives, patterns, component ownership/update và tiêu chí thị giác/interaction |
| API_CONTRACTS.md + schema nguồn | DTO/validation/error, ngày/số, tương thích client web/Android và cách đổi contract |

QUALITY_GATES/BROWSER_TESTING tiếp tục sở hữu quy trình kiểm chứng; các tài liệu trên liên kết về đó và chỉ bổ sung trường hợp chuyên biệt, không tạo lifecycle khác. AGENTS/AUTHORITY_MAP/DOC_ROUTING làm cửa vào và định tuyến, không nhồi toàn bộ chuẩn code vào AGENTS. Sau khi chuẩn được duyệt, bổ sung enforcement và task implementation tương ứng; hiện tại chưa ghi các file dự kiến này như đã tồn tại.

## 9. Bước đi đề xuất

1. Review hướng nền UI thống nhất và kiến trúc module ở báo cáo này. Những điểm cần chốt: shadcn nền Radix/React; một repository web/API tách app; vị trí và chiều phụ thuộc shared/feature. Chưa cần chọn mọi thư viện phụ hoặc nghĩ trước tất cả feature.
2. Hoàn thiện chuẩn kiến trúc/code/UI/contract cùng kiến trúc kỹ thuật; giữ các quyết định nghiệp vụ còn mở tại [design](../design.md). Có thể quyết định nguyên tắc module trước khi chốt hết nghiệp vụ, còn schema/validation/implementation chi tiết phụ thuộc phần liên quan.
3. Thiết kế lại diện mạo C trên hệ UI dự kiến, trình mẫu hoàn thiện hơn. Review bản đặc tả viết và implementation plan theo quy trình trước scaffold/cài/code sản phẩm.
4. Khi được phép triển khai: tạo ứng dụng tối thiểu với một luồng chấm công thật, primitives/tokens cần dùng, enforcement/test cần thiết; không tạo skeleton hàng loạt feature chưa có yêu cầu. Chỉ công bố Enforced/Verified khi đã có code và bằng chứng đúng scope.

Tiêu chí thêm feature sau này: xác định module sở hữu; tra component dùng chung trước; tránh import sâu; thay contract có chủ ý; kiểm consumer ảnh hưởng; cập nhật tài liệu đúng nguồn. Nhờ đó các tính năng mới có thể tăng dần mà không phải sửa đồng loạt những bản copy UI hoặc một file toàn bộ nghiệp vụ.
