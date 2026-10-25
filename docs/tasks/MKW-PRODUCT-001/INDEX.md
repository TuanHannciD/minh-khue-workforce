# MKW-PRODUCT-001 — Đặc tả phiên bản chấm công đầu tiên

Ngày lập: 25/10/2026. Trạng thái: In review — đã viết/tự review đặc tả và kiểm tra tài liệu. Chưa phê duyệt đặc tả viết hoặc kế hoạch triển khai sản phẩm.

## Mục tiêu và acceptance

Chuyển cách chấm công Excel toàn công ty thành đặc tả web dễ dùng, ưu tiên điện thoại một chút và đầy đủ desktop. Tài liệu phải giữ đúng công/tăng ca độc lập, màu xanh chỉ nhắc kiểm tra, cùng quyền sửa trực tiếp, ngày vào/nghỉ và xuất Excel. Phân biệt quyết định của người dùng với phương án đề xuất/câu hỏi chưa chốt; không tự bổ sung quy trình duyệt.

## Nguồn và phạm vi

- [Yêu cầu đã thống nhất trong hội thoại](approved/requirements.md).
- [Đặc tả để review](design.md).
- [Kiểm chứng và bàn giao](validation.md).
- [Brief và ba phương án UI](ui/BRIEF.md), [bản mẫu tương tác](ui/attendance-concepts.html) — đã chọn tổ chức C, chờ thiết kế thị giác hoàn thiện hơn.
- Nguồn quyền/routing: [AGENTS](../../../AGENTS.md), [authority map](../../agent/AUTHORITY_MAP.md), [execution rules](../../agent/EXECUTION_RULES.md), [permissions](../../agent/PERMISSIONS.md), [quality gates](../../agent/QUALITY_GATES.md).
- Quyền hiện tại: đọc/viết/check tài liệu và commit local bản đặc tả theo bước brainstorming. Người dùng đã duyệt bắt đầu thiết kế trực quan: thêm HTML bản mẫu độc lập và kiểm bằng native HTML preview/render; không phải quyền triển khai ứng dụng sản phẩm. Không scaffold/code/cài dependency sản phẩm, tự chọn stack, dispatch child mới, tích hợp main, push/deploy hoặc dùng hệ thống nhân sự thật.
- Phạm vi file: dossier này; thêm định tuyến tại authority map, README và docs/INDEX. Giữ nguyên pilot, PRODUCT.md/DESIGN.md của pilot, skill distribution, hồ sơ002 và evidence cũ.

## Ownership và risk

Writer: Agent chính inline. Review: tự rà soát tài liệu và người dùng review bản viết; không yêu cầu reviewer code độc lập cho task chỉ viết đặc tả này. Risk tài liệu: trung bình do có thể làm sai ý nghĩa tính công; không thay gate cho task triển khai sau.

Workspace sẵn có: `.worktrees/agent-bootstrap`, branch `agent/mkw-agent-002`, base tại lúc bắt đầu `a502c982e07f45e77895833fd86144a474254080`, sạch. Dùng worktree hiện có cho task tài liệu, không tạo thêm; branch vẫn tên bootstrap, commit mới phải thể hiện scope sản phẩm riêng. Primary chỉ đọc; không suy quyền tích hợp002 sang sản phẩm001.

Resource: file Markdown/HTML local, checker hiện có và native T3 HTML preview/render cho bản mẫu; không tạo server/port/DB, không acquire tab browser riêng. Không chép tên nhân sự hoặc ảnh chứa thông tin nhân sự vào Git. HTML chỉ dùng dữ liệu giả trong bộ nhớ trang; không chạy pilot/app tests không liên quan. Risk riêng của bản mẫu: thấp vì không lưu dữ liệu hoặc kết nối hệ thống; tự review + người dùng xem mẫu, không thay gate review độc lập cho sản phẩm.

## Bước tiếp

Đã ghi [ADR-002 về state](../../architecture/decisions/ADR-002-state-management.md) theo approval tiếp nối. [Bản kiến trúc cụ thể](technical/architecture-proposal.md) đã viết để người dùng review: so sánh hướng stack, đề xuất công cụ/cây source, luồng state/lưu lỗi/xung đột và acceptance tooling. Chưa có cài/code/implementation plan. Các lựa chọn mới vẫn Proposed; tiếp tục làm rõ nghiệp vụ/đăng nhập/Excel và thiết kế thị giác C trước phần triển khai phụ thuộc.

Checkpoint trước: đã ghi nhận nền tảng được người dùng chốt tại [ADR-001](../../architecture/decisions/ADR-001-product-foundation.md), hoàn thiện bốn nguồn chuẩn và định tuyến Agent. Tiếp theo cụ thể hóa framework/toolchain, backend/DB/auth, cây source và cách kiểm ranh giới; đồng thời phát triển bản mẫu thị giác C chuyên nghiệp bằng Impeccable + UI UX Pro Max để review. Tiếp tục làm rõ các điểm mở ở mục10 của đặc tả trước contract/validation tương ứng. Khi bản đặc tả viết đủ quyết định và được duyệt, mới lập kế hoạch triển khai; chưa cài/scaffold sản phẩm hoặc tích hợp primary. Commit tài liệu giữ local trên worktree hiện có.

## Checkpoint UI trực quan

Đã chuẩn bị ba phương án A/B/C trong ui/BRIEF.md và HTML độc lập. Người dùng chọn hướng tổ chức C, nhưng đánh giá UI bản mẫu thô, chưa đạt cảm giác đẹp/chuyên nghiệp doanh nghiệp. Tiếp theo thiết kế thị giác C ở mức hoàn thiện cao hơn bằng hai skill UI để review; không suy lựa chọn bố cục thành phê duyệt diện mạo hiện tại. Các câu hỏi nghiệp vụ còn mở ở design vẫn chưa tự được giải quyết bởi bản mẫu.

## Rà soát khả năng mở rộng và bảo trì

**Quyết định tiếp nối:** người dùng đã chốt nền tảng được trình sau báo cáo: shadcn/ui nền Radix, code theo feature/module, FE/BE tách ứng dụng trong cùng repository, UI/shared có ownership rõ và chuẩn cần được kiểm bằng công cụ. Phạm vi tiếp nối là ghi ADR và hoàn thiện bốn nguồn chuẩn tài liệu tại docs/architecture, cập nhật AGENTS/authority/routing/README/docs INDEX và dossier cho nhất quán. Base `5c24c357208a48a165ccb96ba929f8abffa749a1`, sạch trước sửa. Không suy duyệt nền tảng thành duyệt toàn bộ sản phẩm, chi tiết stack/backend/schema, mẫu UI hiện tại, implementation plan hoặc cài/code sản phẩm. Risk/writer/review route như task tài liệu hiện có; kiểm Markdown và rà nhất quán, không dispatch child hay acquire resource mới.

**Lịch sử khảo sát trước quyết định trên:** người dùng yêu cầu ưu tiên một bộ UI nhất quán/tái sử dụng khi có nhiều feature, đồng thời kiểm tra rule cấu trúc file/code/thành phần. Scope bổ sung: khảo sát nguồn hiện hành và viết [báo cáo cùng đề xuất kiến trúc](technical/maintainability-review.md); chưa phê duyệt shadcn/Radix/React hoặc cấu trúc repository, chưa sửa rule thực thi, tooling, dependency hay scaffold sản phẩm.

Base checkpoint `bb390add47a862b12d7a9ad4fdd74cc0399b46a4`, workspace sạch trước sửa. Writer inline; risk tài liệu trung bình do ảnh hưởng kiến trúc tương lai, tự review + người dùng review, không dispatch child. Vùng file: dossier này và liên kết định tuyến authority map/docs INDEX. Acceptance: đối chiếu rule với cấu hình thật, chỉ rõ có/thiếu, đề xuất module/UI/contract và cách kiểm soát bằng công cụ, giữ phân biệt Proposed/Enforced. Chỉ dùng đọc file/search/check Markdown; không resource server/DB/browser mới, không đổi primary. Bước tiếp: người dùng review đề xuất nền tảng trước khi hoàn thiện chuẩn sản phẩm và kiến trúc chi tiết.

## Tiếp nối quản lý state và kiến trúc cụ thể

Người dùng trả lời “Approve” sau đề xuất TanStack Query + state React, Zustand chỉ bổ sung khi có nhu cầu chia sẻ state rõ ràng, và bước hoàn thiện bản kiến trúc cụ thể để review. Base `784e697e49d216cee9725a5aef709963925462e0`, workspace sạch trước sửa. Acceptance: ghi ADR state, cụ thể hóa trách nhiệm/cache/bản nháp/lưu lỗi/xung đột; trình phương án stack/cây source/contract/check với lý do và giới hạn. Phần stack mới vẫn Proposed, không suy approval thành quyền cài/code hoặc duyệt backend/DB/auth.

Writer inline; tự review tài liệu và người dùng review thiết kế, không dispatch child. Phạm vi: docs/architecture, dossier sản phẩm, định tuyến README/docs INDEX/authority/routing cần thiết. Resource: Markdown local, check tài liệu và đọc tài liệu công khai chính thức; nếu lưu kết quả khảo sát thì dùng evidence ignored của task, không acquire server/DB/browser. Primary giữ nguyên, không sửa pilot/dependency/tooling/global config. Risk trung bình về diễn giải kiến trúc; không thay yêu cầu nghiệp vụ đang mở bằng giả định kỹ thuật. Bản kiến trúc là design để review, chưa phải implementation plan.
