# MKW-PRODUCT-001 — Đặc tả phiên bản chấm công đầu tiên

Ngày lập: 25/10/2026. Trạng thái: In review — đã viết/tự review đặc tả và kiểm tra tài liệu. Chưa phê duyệt đặc tả viết hoặc kế hoạch triển khai sản phẩm.

## Mục tiêu và acceptance

Chuyển cách chấm công Excel toàn công ty thành đặc tả web dễ dùng, ưu tiên điện thoại một chút và đầy đủ desktop. Tài liệu phải giữ đúng công/tăng ca độc lập, màu xanh chỉ nhắc kiểm tra, cùng quyền sửa trực tiếp, ngày vào/nghỉ và xuất Excel. Phân biệt quyết định của người dùng với phương án đề xuất/câu hỏi chưa chốt; không tự bổ sung quy trình duyệt.

## Nguồn và phạm vi

- [Yêu cầu đã thống nhất trong hội thoại](approved/requirements.md).
- [Đặc tả để review](design.md).
- [Kiểm chứng và bàn giao](validation.md).
- [Brief và ba phương án UI](ui/BRIEF.md), [khảo sát A/B/C](ui/attendance-concepts.html) và [bản C hiện hành](ui/attendance-c.html) — C mới đã tự review bản mẫu, chờ người dùng review diện mạo/luồng.
- Nguồn quyền/routing: [AGENTS](../../../AGENTS.md), [authority map](../../agent/AUTHORITY_MAP.md), [execution rules](../../agent/EXECUTION_RULES.md), [permissions](../../agent/PERMISSIONS.md), [quality gates](../../agent/QUALITY_GATES.md).
- Quyền hiện tại: đọc/viết/check tài liệu và commit local bản đặc tả theo bước brainstorming. Người dùng đã duyệt bắt đầu thiết kế trực quan: thêm HTML bản mẫu độc lập và kiểm bằng native HTML preview/render; không phải quyền triển khai ứng dụng sản phẩm. Không scaffold/code/cài dependency sản phẩm, tự chọn stack, dispatch child mới, tích hợp main, push/deploy hoặc dùng hệ thống nhân sự thật.
- Phạm vi file: dossier này; thêm định tuyến tại authority map, README và docs/INDEX. Giữ nguyên pilot, PRODUCT.md/DESIGN.md của pilot, skill distribution, hồ sơ002 và evidence cũ.

## Ownership và risk

Writer: Agent chính inline. Review: tự rà soát tài liệu và người dùng review bản viết; không yêu cầu reviewer code độc lập cho task chỉ viết đặc tả này. Risk tài liệu: trung bình do có thể làm sai ý nghĩa tính công; không thay gate cho task triển khai sau.

Workspace sẵn có: `.worktrees/agent-bootstrap`, branch `agent/mkw-agent-002`, base tại lúc bắt đầu `a502c982e07f45e77895833fd86144a474254080`, sạch. Dùng worktree hiện có cho task tài liệu, không tạo thêm; branch vẫn tên bootstrap, commit mới phải thể hiện scope sản phẩm riêng. Primary chỉ đọc; không suy quyền tích hợp002 sang sản phẩm001.

Resource: file Markdown/HTML local, checker hiện có và native T3 HTML preview/render cho bản mẫu; không tạo server/port/DB, không acquire tab browser riêng. Không chép tên nhân sự hoặc ảnh chứa thông tin nhân sự vào Git. HTML chỉ dùng dữ liệu giả trong bộ nhớ trang; không chạy pilot/app tests không liên quan. Risk riêng của bản mẫu: thấp vì không lưu dữ liệu hoặc kết nối hệ thống; tự review + người dùng xem mẫu, không thay gate review độc lập cho sản phẩm.

## Bước tiếp

Đã chốt phương án A và bộ công nghệ mục tiêu tại [ADR-003](../../architecture/decisions/ADR-003-product-stack.md). Nền tảng ADR-001 và state ADR-002 giữ nguyên. Bộ stack chưa pin/cài/kiểm tương thích; auth/hosting/schema và nghiệp vụ chưa chốt vẫn mở.

Bước hiện tại: bản phối xanh được chấp nhận làm cơ sở; luồng chọn vùng, hai chế độ và bỏ qua N/— đã xác nhận. [Bản C](ui/attendance-c.html) đã có tương tác nhập vùng trong bộ nhớ, được tự review bằng native HTML preview; chờ người dùng thử. [Brief nhập vùng](ui/bulk-entry-design.md) ghi cách dùng và giới hạn. Tiếp theo làm rõ nghiệp vụ còn mở, sau quyết định dừng cả vùng khi xung đột, rồi review đặc tả viết trước implementation plan. Không cài/scaffold/code sản phẩm hoặc tích hợp primary; commit giữ local. Chi tiết check/giới hạn tại [validation](validation.md).

## Checkpoint UI trực quan

Đã chuẩn bị ba phương án A/B/C trong ui/BRIEF.md và HTML độc lập. Người dùng chọn hướng tổ chức C, nhưng đánh giá UI bản mẫu thô, chưa đạt cảm giác đẹp/chuyên nghiệp doanh nghiệp. Tiếp theo thiết kế thị giác C ở mức hoàn thiện cao hơn bằng hai skill UI để review; không suy lựa chọn bố cục thành phê duyệt diện mạo hiện tại. Các câu hỏi nghiệp vụ còn mở ở design vẫn chưa tự được giải quyết bởi bản mẫu.

## Rà soát khả năng mở rộng và bảo trì

**Quyết định tiếp nối:** người dùng đã chốt nền tảng được trình sau báo cáo: shadcn/ui nền Radix, code theo feature/module, FE/BE tách ứng dụng trong cùng repository, UI/shared có ownership rõ và chuẩn cần được kiểm bằng công cụ. Phạm vi tiếp nối là ghi ADR và hoàn thiện bốn nguồn chuẩn tài liệu tại docs/architecture, cập nhật AGENTS/authority/routing/README/docs INDEX và dossier cho nhất quán. Base `5c24c357208a48a165ccb96ba929f8abffa749a1`, sạch trước sửa. Không suy duyệt nền tảng thành duyệt toàn bộ sản phẩm, chi tiết stack/backend/schema, mẫu UI hiện tại, implementation plan hoặc cài/code sản phẩm. Risk/writer/review route như task tài liệu hiện có; kiểm Markdown và rà nhất quán, không dispatch child hay acquire resource mới.

**Lịch sử khảo sát trước quyết định trên:** người dùng yêu cầu ưu tiên một bộ UI nhất quán/tái sử dụng khi có nhiều feature, đồng thời kiểm tra rule cấu trúc file/code/thành phần. Scope bổ sung: khảo sát nguồn hiện hành và viết [báo cáo cùng đề xuất kiến trúc](technical/maintainability-review.md); chưa phê duyệt shadcn/Radix/React hoặc cấu trúc repository, chưa sửa rule thực thi, tooling, dependency hay scaffold sản phẩm.

Base checkpoint `bb390add47a862b12d7a9ad4fdd74cc0399b46a4`, workspace sạch trước sửa. Writer inline; risk tài liệu trung bình do ảnh hưởng kiến trúc tương lai, tự review + người dùng review, không dispatch child. Vùng file: dossier này và liên kết định tuyến authority map/docs INDEX. Acceptance: đối chiếu rule với cấu hình thật, chỉ rõ có/thiếu, đề xuất module/UI/contract và cách kiểm soát bằng công cụ, giữ phân biệt Proposed/Enforced. Chỉ dùng đọc file/search/check Markdown; không resource server/DB/browser mới, không đổi primary. Bước tiếp: người dùng review đề xuất nền tảng trước khi hoàn thiện chuẩn sản phẩm và kiến trúc chi tiết.

## Tiếp nối quản lý state và kiến trúc cụ thể

Người dùng trả lời “Approve” sau đề xuất TanStack Query + state React, Zustand chỉ bổ sung khi có nhu cầu chia sẻ state rõ ràng, và bước hoàn thiện bản kiến trúc cụ thể để review. Base `784e697e49d216cee9725a5aef709963925462e0`, workspace sạch trước sửa. Acceptance: ghi ADR state, cụ thể hóa trách nhiệm/cache/bản nháp/lưu lỗi/xung đột; trình phương án stack/cây source/contract/check với lý do và giới hạn. Phần stack mới vẫn Proposed, không suy approval thành quyền cài/code hoặc duyệt backend/DB/auth.

Writer inline; tự review tài liệu và người dùng review thiết kế, không dispatch child. Phạm vi: docs/architecture, dossier sản phẩm, định tuyến README/docs INDEX/authority/routing cần thiết. Resource: Markdown local, check tài liệu và đọc tài liệu công khai chính thức; nếu lưu kết quả khảo sát thì dùng evidence ignored của task, không acquire server/DB/browser. Primary giữ nguyên, không sửa pilot/dependency/tooling/global config. Risk trung bình về diễn giải kiến trúc; không thay yêu cầu nghiệp vụ đang mở bằng giả định kỹ thuật. Bản kiến trúc là design để review, chưa phải implementation plan.

## Tiếp nối chia file và điều hướng source cho Agent

Theo yêu cầu người dùng: khảo sát repo công khai thực tế, suy luận và viết quy định cho file code dài; tách hợp lý, có mục lục/hướng dẫn đọc khi cần để tránh loãng context. Base `3a70f702db5e6e6ad614d9f75c9d946eb2cd14ae`, workspace sạch trước sửa. Acceptance: nguồn khảo sát có commit/path và phạm vi bằng chứng; tiêu chí tách/giữ; mục lục bằng symbol thay số dòng dễ lệch; quy trình Agent mở rộng context theo dependency/consumer/test; cách tránh tài liệu lỗi thời và phân biệt documented/enforced.

Writer inline, tự review tài liệu + người dùng review; không dispatch child. Risk trung bình vì ảnh hưởng cách Agent đọc/sửa code, không giảm gate test/review hoặc quyền. Phạm vi: báo cáo khảo sát mới, chuẩn code/điều hướng source và routing AGENTS/authority/docs INDEX/dossier liên quan. Tài nguyên: đọc Internet public và Markdown local; bằng chứng đọc repo lưu ignored theo task. Không thực thi script từ repo khảo sát, cài dependency, refactor source/pilot/skill, đổi primary hoặc tạo server/DB/browser. Quy định tài liệu được yêu cầu trong scope này; tự động kiểm mục lục/độ dài nếu đề xuất sẽ ghi chưa cài, không tự triển khai tooling.

## Tiếp nối chốt phương án A và hoàn thiện UI C — 25/10/2026

Nguồn xác nhận: người dùng trả lời “Tôi đồng ý phương án A” sau bản trình bộ công nghệ cụ thể. Mục tiêu: ghi quyết định đúng phạm vi đã trình, đồng bộ nguồn hiện hành, rồi hoàn thiện bản mẫu hướng C đã được phép. Base `467e42cdfd9466c70ea763f4ce091baedec2b4d7`, workspace sạch trước sửa; giữ worktree/branch hiện có, primary chỉ đọc.

Acceptance: ADR ghi rõ stack mục tiêu Accepted nhưng chưa cài/kiểm tương thích; nguồn định tuyến không tiếp tục gọi bộ stack đã chọn là Proposed. Bản mẫu C độc lập dùng dữ liệu giả, một bảng Công/Tăng ca, tổng riêng, màu nhắc độc lập, editor dễ nhập và giữ draft khi chuyển ngữ cảnh. Kiểm bằng HTML preview ở điện thoại/desktop và self-review; trình native HTML render để người dùng review diện mạo. Không dùng bản mẫu thay bằng chứng sản phẩm.

Writer inline; risk tài liệu trung bình, bản mẫu thấp; tự review + người dùng review, không dispatch child. Vùng sửa: docs/architecture, dossier này, các nguồn định tuyến liên quan; bản UI mới tại ui/attendance-c.html, giữ nguyên HTML khảo sát A/B/C. Resource: file local và T3 html_preview/html_render, evidence trong `.agent-runs/MKW-PRODUCT-001/`; không server/port/DB/tab riêng. Không cài dependency, scaffold/code sản phẩm, thay pilot/global config, tích hợp primary, push/deploy. Phiên bản, auth/hosting/schema và nghiệp vụ chưa chốt vẫn để mở.

Bước tiếp: ghi ADR phương án A → hoàn thiện và trình UI C → làm rõ nghiệp vụ còn thiếu → review đặc tả viết trước implementation plan. Chưa suy approval stack thành approval UI/spec hoặc quyền triển khai.

## Sửa phối màu C theo phản hồi — 25/10/2026

Người dùng đánh giá “Màu sắc, cách phối phân bổ đang khá tệ”. Base `91e6869`, workspace sạch trước sửa. Mục tiêu/acceptance: điều chỉnh vai trò màu và phân vùng của cùng bản C, kiểm bằng render phone/chat/desktop và contrast computed; giữ nghiệp vụ, thao tác và hướng C đã chọn. Không coi bộ màu mới là đã duyệt. Phạm vi: CSS/visual copy của ui/attendance-c.html, brief/dossier/evidence liên quan; không đổi stack/tooling hoặc source sản phẩm.

Writer inline, tự review + người dùng review; risk thấp của bản mẫu, không dispatch child. Resource native html_preview/html_render, evidence task-owned trong `.agent-runs/MKW-PRODUCT-001/`; không acquire server/DB/tab hay dependency. Skill route: Impeccable colorize, UI UX Pro Max semantic/contrast bổ trợ; nhận phản hồi trước khi sửa, không mở lại vòng chọn cấu trúc C. Bước tiếp: trình bản phối màu sửa để review rồi tiếp tục nghiệp vụ còn mở.

## Hướng thương hiệu xanh lá — 27/10/2026

Người dùng xác nhận muốn màu thương hiệu thuộc nhóm xanh lá. Base `783e44f`, workspace sạch. Mục tiêu: ghi hướng màu đã xác nhận vào requirements/UI_SYSTEM, cụ thể hóa một palette xanh lá trong bản C để review; không coi mã màu/độ phân bổ là đã duyệt. Acceptance: thương hiệu và reminder đều xanh nhưng khác vai trò/độ sáng, có dấu/nhãn bổ sung; contrast và thao tác mẫu đạt tại phone/chat/desktop.

Phạm vi: CSS/copy artifact, brief, requirements/design/INDEX/validation và UI_SYSTEM. Writer inline; tự review + người dùng review, risk thấp bản mẫu; không child/dependency/source sản phẩm/primary. Resource HTML preview/render và evidence ignored theo task, không server/DB/tab. Tiếp tục Impeccable colorize + UI UX Pro Max theo hướng đã xác định; giữ C và nghiệp vụ. Bước tiếp: trình palette để review, sau đó nghiệp vụ/spec/plan theo gate cũ.

## Chọn vùng và nhập hàng loạt — 27/10/2026

Nguồn mới: người dùng nhận xét bản xanh hiện tại “Cũng ok rồi”, tiếp tục yêu cầu kéo chọn nhiều ô như Excel để nhập nhiều ô một lúc; sau câu hỏi về ô có dữ liệu, chọn “Có hai lựa chọn: điền ô trống hoặc ghi đè cả vùng”. Ghi chấp nhận bản phối xanh hiện tại làm cơ sở tiếp tục, không suy duyệt toàn bộ spec/ứng dụng.

Base `baf1eda`, workspace sạch. Mục tiêu/acceptance vòng này: ghi yêu cầu mới và hai chế độ đúng nguồn, viết brief tương tác cụ thể để review; các chi tiết vùng chứa N/—, màu/draft và cảm ứng còn Proposed. Phạm vi: requirements/design/brief/dossier/validation, artifact thiết kế ui/bulk-entry-design.md. Chưa sửa HTML hành vi hoặc code sản phẩm khi luồng mới chưa đủ quyết định. Risk tài liệu trung bình vì thay đổi nhiều ô; writer inline, tự review + người dùng, không child. Resource Markdown/check local; không server/DB/tab/dependency/primary. Skill brainstorming tiếp nối architectural/spec, Impeccable shape + UI UX Pro Max kéo/chọn có thao tác thay thế. Bước tiếp: review brief nhập vùng, cập nhật bản mẫu trong quyền HTML sau chốt; nghiệp vụ/API/concurrency batch cần thiết kế tương ứng trước implementation plan.

## Bản mẫu nhập vùng sau xác nhận — 27/10/2026

Người dùng trả lời “Ảgee” với brief luồng kéo/chọn vùng, hai chế độ và bỏ qua N/—/báo số ô bỏ qua. Base `e8533e0`, workspace sạch. Mục tiêu: cập nhật prototype HTML tương tác để review, không triển khai sản phẩm. Acceptance: chọn chữ nhật desktop/đầu-cuối có bàn phím; điền trống/ghi đè có đếm ô; không ghi N/—; giữ màu và tổng độc lập; bảo vệ draft, hủy, lọc và đổi loại không áp nhầm người/đơn vị. Dùng check hành vi có ý nghĩa trước/sau thay đổi, render phone/chat/desktop, detector và check docs.

Vùng sửa: artifact attendance-c.html và dossier/brief/validation; evidence/scripts riêng task ignored. Writer inline; risk thấp của HTML không persistence, self-review + người dùng; không child, dependency, server/DB/tab hoặc source sản phẩm. Tái dùng worktree hiện có và phối xanh đã chấp nhận. Bước tiếp: trình thử nhập vùng, sau đó chốt nghiệp vụ/batch concurrency còn thiếu trước contract/spec/plan. Không suy duyệt prototype thành quyền cài/code sản phẩm.

## Chốt xử lý xung đột vùng — 27/10/2026

Người dùng chọn “Dừng cả vùng, giữ bản nháp”. Base `0141f6f`, workspace sạch. Mục tiêu/acceptance: ghi quyết định vào requirements, design, brief và kiến trúc lưu; một ô xung đột khiến toàn bộ lần lưu không ghi ô nào, giữ draft và chỉ rõ ô xung đột. Scope chỉ tài liệu dossier; writer inline, tự review + người dùng, risk trung bình về diễn giải tính nguyên tử. Resource Markdown/check local; không child/server/DB/tab/dependency/source sản phẩm/primary. Chưa chọn field/status/schema hoặc triển khai transaction. Bước tiếp: Q1 về số công tùy chỉnh, rồi các quyết định nghiệp vụ còn mở trước spec/plan.

## Bước số công tùy chỉnh — 27/10/2026

Người dùng chọn chỉ bước0,5 cho số công tự nhập trên2,5. Base `184c98d`, workspace sạch. Scope requirements/design/brief/HTML/validation; acceptance nhập một ô và vùng nhận3/3,5, từ chối3,25 không làm tròn, giữ draft và không đổi dữ liệu khi lỗi. Writer inline, tự review + người dùng, risk thấp của prototype không persistence. Resource check local/native HTML preview-render và evidence ignored, không child/server/DB/tab/dependency/primary/source sản phẩm. Tiếp theo chốt giới hạn/định dạng/0 còn mở rồi nghiệp vụ khác; không tự suy bước0,5 thành trần.

## Chuẩn hóa0 công thành F — 27/10/2026

Người dùng chọn tự chuyển0 công thành F. Base `416ed47`, workspace sạch. Scope requirements/design/brief/HTML/validation; acceptance0/0,0/0.0 nhập một ô hoặc vùng thành F, không cộng công, giữ reminder và tổng tăng ca; không nhận0 tăng ca như F. Writer inline, self-review + người dùng, risk thấp của HTML giả không persistence. Resource Markdown/check local/native HTML preview-render và evidence ignored; không child/dependency/server/DB/tab/primary/source sản phẩm. Bước tiếp chốt giới hạn/định dạng còn lại và nghiệp vụ mốc ngày/Excel trước spec/plan.
