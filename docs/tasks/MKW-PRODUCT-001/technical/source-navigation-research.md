# Khảo sát chia file và điều hướng code cho Agent

Ngày25/10/2026. Phạm vi theo [INDEX](../INDEX.md), base `3a70f702db5e6e6ad614d9f75c9d946eb2cd14ae`. Mục tiêu: chọn quy tắc thực dụng cho Minh Khuê khi source lớn dần, giảm context không liên quan mà vẫn hiểu đúng tác động thay đổi. Không nghiên cứu hoặc triển khai công cụ indexing mới trong task này.

## 1. Bằng chứng và giới hạn

Đã đọc nội dung public tại commit cố định, không chỉ tên repo hoặc số sao. Bản tải và metadata/hash nằm trong `.agent-runs/MKW-PRODUCT-001/source-navigation-research/` (ignored, cùng worktree): repos.json, files.json và các file đã tải. Không thực thi code, build/test các repo này hoặc sao chép implementation vào sản phẩm. Việc dự án sử dụng một cách tổ chức là bằng chứng áp dụng thực tế, **không phải thử nghiệm chứng minh mức tiết kiệm token hay chất lượng sửa code** cho Minh Khuê.

### Bulletproof React — chia feature và giới hạn import

Commit `9506629ed003a561c6627735480cce4994244bb4`:

- [docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/docs/project-structure.md): feature giữ code riêng, không tạo mọi thư mục khi chưa cần, phối hợp ở app, kiểm import có hướng. Cảnh báo barrel export toàn bộ có thể ảnh hưởng tree shaking/performance.
- [get-discussions.ts](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/api/get-discussions.ts):42 dòng, nhóm request/query options/hook cùng mục đích.
- [discussions-list.tsx](https://github.com/alan2207/bulletproof-react/blob/9506629ed003a561c6627735480cce4994244bb4/apps/react-vite/src/features/discussions/components/discussions-list.tsx):92 dòng, UI gọi phần API của feature, không gộp toàn bộ transport vào màn hình.

Áp dụng: tách theo trách nhiệm/use case, các hàm nhỏ cùng ý nghĩa có thể ở một file. Không tách mỗi hàm thành một file hoặc tạo barrel để có vẻ ngắn. Giữ public interface tối thiểu theo kiến trúc hiện có; không buộc mọi feature có index.ts export toàn bộ.

### rust-analyzer — bản đồ module, điểm vào và invariant

Commit `0c4d74686b21f2b3bd8872b6d3cf36ad2e740d49`:

- [architecture.md](https://github.com/rust-lang/rust-analyzer/blob/0c4d74686b21f2b3bd8872b6d3cf36ad2e740d49/docs/book/src/contributing/architecture.md): có Entry Points, Code Map, API Boundaries và Architecture Invariant, dẫn đến thư mục/type quan trọng. Tài liệu còn giải thích main entry có nhiều phức tạp, không luôn là điểm bắt đầu phù hợp nhất.

Áp dụng: module map cho biết sửa loại hành vi nào thì bắt đầu từ đâu và ràng buộc nào phải giữ. Không chép đồ thị toàn repo hoặc danh sách mọi symbol vào mỗi prompt. Không áp kiến trúc compiler/Rust lên stack web.

### VS Code — tìm kiếm có mục tiêu và vùng chức năng trong file lớn

Commit `4f383697191fef7129052d5396d5709d5799934a`:

- [.github/copilot-instructions.md](https://github.com/microsoft/vscode/blob/4f383697191fef7129052d5396d5709d5799934a/.github/copilot-instructions.md): tìm theo khái niệm/chuỗi cụ thể, theo imports và xem test; chỉ export phần cần chia sẻ. Không nhập nguyên bộ chỉ dẫn VS Code vào project.
- [codeEditorWidget.ts](https://github.com/microsoft/vscode/blob/4f383697191fef7129052d5396d5709d5799934a/src/vs/editor/browser/widget/codeEditor/codeEditorWidget.ts):2.564 dòng tại snapshot; class CodeEditorWidget có vùng `//#region Eventing` và các method có tên. Đây là quan sát một file lớn có cấu trúc, **không chứng minh file dài luôn tốt hoặc region tương đương TOC**.

Áp dụng: có ngoại lệ file lớn khi lý do giữ chung hợp lý; dùng cấu trúc/symbol để định vị. Region chỉ hỗ trợ điều hướng/folding, không giảm token nếu Agent vẫn đọc nguyên file; không chữa việc trộn trách nhiệm.

### Aider — bản đồ symbol chọn lọc theo context

Commit `5dc9490bb35f9729ef2c95d00a19ccd30c26339c`:

- [repository map docs](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/repomap.md): file, symbol/signature quan trọng, graph ranking và token budget; bản đồ dẫn đến source cần đọc thêm, không chứa mọi hàm.
- [aider/repomap.py](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py):867 dòng, có RepoMap/get_repo_map, tree-sitter, ranking và ngân sách map. Đã đối chiếu đoạn implementation với mô tả, chưa chạy hoặc đo thuật toán.

Áp dụng: ưu tiên mục lục theo symbol và chỉ nạp phần liên quan. Chưa cài Aider/tree-sitter hoặc có repo map tự sinh; TOC thủ công của Minh Khuê không tương đương khả năng ranking của Aider.

### Nguồn không dùng làm căn cứ quyết định

Đã tải Google TypeScript styleguide tại commit `c775c0c2f73c110613243520c001577cdbc0034d`, nhưng tìm kiếm có chọn lọc chưa cho căn cứ trực tiếp về ngưỡng dòng/TOC cho Agent; không gán quy tắc400/800 hoặc hiệu quả context cho Google. Đường dẫn rust-analyzer `docs/dev/architecture.md` cũ và Aider `website/docs/repomap.md` trả404; đã tra tree cùng commit để đọc đúng đường dẫn ở trên.

## 2. Ba phương án và quyết định phù hợp

**A — Hard cap, ví dụ mọi file tối đa200 dòng:** dễ tự động đếm nhưng khuyến khích cắt tùy tiện, tăng số import/file và phân tán invariant. Chưa có căn cứ chọn một hard cap chung cho component, service, test và generated code.

**B — Cho file dài và bắt TOC ở tất cả file:** dễ bắt đầu nhưng tăng nội dung phải bảo trì, vẫn có god-file và mục lục lệch. Nạp nguyên code sau khi đọc TOC cũng không tiết kiệm context.

**C — Chia theo trách nhiệm + điều hướng theo nhu cầu + ngưỡng nhắc review:** lựa chọn cho Minh Khuê. File gọn tự mô tả không cần TOC; module phức tạp có bản đồ điểm vào; file lớn cần đánh giá tách, có lý do giữ chung và file map khi thuộc diện yêu cầu. Agent đọc theo symbol rồi mở rộng qua dependency/consumer/test.

Ngưỡng400/800 dòng trong quy định là **heuristic local để nhắc review**, không phải con số được repo trên chứng minh.400 yêu cầu đánh giá,800 yêu cầu file map và lý do giữ nếu còn giữ file dài; không hard-fail chỉ vì vượt số dòng. Việc nhiều trách nhiệm hoặc khó kiểm thử vẫn yêu cầu xem xét tách ngay cả dưới400 dòng. Cần hiệu chỉnh dựa trên source thật sau này.

## 3. Cách áp dụng tại project

Nguồn quy định hiện hành: [SOURCE_NAVIGATION](../../../architecture/SOURCE_NAVIGATION.md), phần chi tiết của [CODE_CONVENTIONS](../../../architecture/CODE_CONVENTIONS.md). Agent đọc rule này trước task sửa/source navigation; module/file map là chỉ dẫn vị trí, không sở hữu nghiệp vụ hoặc tự cấp quyền.

Giữ scope tài liệu: chưa refactor source, chưa gắn checker vào pipeline, chưa có số đo token/context hoặc claim tăng độ chính xác. Cần tooling task riêng để kiểm độ dài, file map và đường dẫn/symbol, với fixture vi phạm/thành công; parser thực cần thiết để tránh regex tạo pass giả.
