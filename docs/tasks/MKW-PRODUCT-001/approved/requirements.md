# Yêu cầu người dùng đã thống nhất

## Chốt DB authority — 02/11/2026

Người dùng **“Chốt phương án1”** rồi yêu cầu tiếp tục02/11/2026: chấp nhận [delta DB authority](../decisions.md#db-authority--accepted02112026). PG17.11/ICU67.1 là nguồn duy nhất cho name/query lower và name ordering cho page/fullmonth/Excel; ICU vi equivalent/nondeterministic canonical ties + ID ASC, web không sắp lại. q vẫn ECMAScript trim rồi DB lower; ID case-sensitive/literal, substring `C` sau lower, không normalization/unaccent/fuzzy hoặc hạn chế alphabet/tên mới. TJE query hoa chỉID126, query thường chỉID127, order126,127 được chấp nhận, không đòi JS equality.

Kế hoạch9 task đã được “Approved”01/11; tiếp tục necessary in-scope work không cần hỏi lại choice/plan approval. Independent review **plan delta trước code** và actual reviewed DB-policy PASS trước SQL3/4/8/9 vẫn bắt buộc. Old oracle JS/FAIL4/FAIL5/PASS26/13 giữ lịch sử bất biến; Task1 chưa complete/policy NOT PINNED/new gate Not run; completed2/5/6/7 không đổi. Quyền không gồm download/install/new runtime/enrollment; existing fake Task10 sandbox giữ nguyên. Các đoạn approval/next action phía dưới là diễn tiến lịch sử, được cập nhật này supersede đúng scope lower/order và quyền tiếp tục đã có.

## Duyệt thiết kế phân trang server — 01/11/2026

Nguồn: sau gói thiết kế server và các ví dụ thực tế/khuyến nghị chọn trong trang, người dùng xác nhận **“Tôi chốt bản thiết kế này”**. Đây là approval bản viết [pagination/search](../technical/pagination-search-proposal.md), tiếp nối approval hướng server trước đó; không hỏi lại hướng, mặc định hoặc selection.

Đã Accepted: server phân trang và tìm tên/ID trên toàn nhân sự thuộc tháng; mặc định25, tùy chọn50, nhảy số trang; poll15 giây chỉ trang active. Rectangle/chọn rời/fill **chỉ trong trang đang hiển thị**; không lật trang tự động hoặc tích lũy đích ẩn. Đổi trang/tìm kiếm/kích thước qua guard, giữ raw và tập ID/revision nguồn–đích đóng băng; Lưu/Áp dụng riêng, CAS và một batch nguyên tử, không ghi ngầm khi điều hướng. Tổng hàng cả tháng của người đó, tổng ngày/tháng của toàn nhân sự kể cả ngoài trang/không khớp tìm; Excel toàn tháng đã lưu. Acceptance dùng1000 nhân sự logical truy cập qua25/50 mỗi trang với cùng ngân sách hiện hành; không còn yêu cầu mount1000 dòng đồng thời và không xóa Failed của bài full DOM cũ.

Tại thời điểm duyệt thiết kế01/11 (trước plan approval và delta02/11): approval cho đồng bộ spec và viết [kế hoạch mới](../technical/server-pagination-implementation-plan.md), **chưa duyệt kế hoạch hoặc cho triển khai/thử nghiệm mới**. Runtime SQL/collation/provider/version/lowercase/Unicode canonical-equivalent và ID tie chưa Verified; phải kiểm parity với JS hiện tại trước contract/code ordering/search phụ thuộc. Không suy approval thiết kế thành ICU khả dụng hay ngầm đổi semantics. Nghiệp vụ còn lại/AC01–AC23 giữ nguyên, AC21–AC22 được giới hạn page-local theo cập nhật này; phương pháp main coordinate và subagent/review tuần tự tối đa Sol/high giữ, cấm Astra mọi cấp.

Nguồn: hội thoại trực tiếp tiếp nối MKW-AGENT-002, ghi nhận ngày 25/10/2026. Tài liệu này chỉ tổng hợp ý định đã xác nhận; bao gồm nền tảng, state và stack mục tiêu đã chốt ở cuối tài liệu; chưa phê duyệt version/API/schema chi tiết hay triển khai code.

## Duyệt toàn bộ đặc tả viết — 28/10/2026

Người dùng xác nhận đã chốt toàn bộ [design.md](../design.md), gồm các đề xuất vừa trình và mục13–14, yêu cầu ghi nhận quyết định và dùng writing-plans lập kế hoạch cho review; không khảo sát/hỏi lại kiến trúc hoặc UI đã duyệt, chưa triển khai sản phẩm. Quyết định này thay trạng thái chờ duyệt bản viết tại các checkpoint trước.

Các đề xuất trong bản viết nay đã Accepted: danh sách tháng theo khoảng làm việc giao tháng; editor hiển thị người/ngày/loại, Lưu/Hủy, chỉ báo đã lưu khi server xác nhận và giữ draft khi lỗi; điền trống xét nội dung rỗng kể cả có reminder, mặc định điền trống, nhập vùng giữ reminder từng ô; guard đổi ngữ cảnh; cách trình bày Excel nêu trong design. Giữ toàn bộ quy tắc chọn rời/fill/nhấn giữ và giới hạn đã ghi. Bản mẫu C hiện hành đã được người dùng chấp nhận ở checkpoint trước, không mở lại lựa chọn diện mạo/hướng tổ chức.

Không suy approval này thành duyệt API/request/response/revision/schema/auth-session/phiên bản chi tiết chưa viết, kế hoạch triển khai, quyền cài/scaffold/code, dispatch, tích hợp/push/deploy hoặc gate thiết bị thật đã đạt. Các đoạn dưới giữ tiến trình xác nhận trước đây; trạng thái hiện tại đọc cùng cập nhật này và design mục12.

## Mục tiêu và người dùng

- Công ty Minh Khuê hiện dùng bảng Excel tháng có phần công và phần tăng ca. Người dùng cung cấp ảnh làm tham khảo cấu trúc; không sao chép thông tin nhân sự trong ảnh vào repository.
- Người dùng là người chấm/tổng hợp chính cho toàn công ty, bao gồm các công trình khác nhau. Sếp cần bảng trực quan quen thuộc như Excel, có thể trực tiếp chỉnh sửa.
- Người dùng và sếp cùng phân quyền nhập, sửa; dữ liệu đã nhập/chốt vẫn sửa trực tiếp được. Không cần quy trình duyệt/mở lại để sửa. Lịch sử sửa chỉ từng được Agent đề xuất, chưa là yêu cầu bắt buộc.
- Người dùng và sếp mỗi người một tài khoản riêng, cùng quyền xem, nhập và sửa dữ liệu chấm công toàn công ty. Đã chốt đăng nhập bằng tên đăng nhập và mật khẩu; hai tài khoản tạo sẵn, không mở đăng ký công khai. Đã chốt khi quên mật khẩu: người phụ trách vận hành xác minh và đặt lại; bản đầu chưa cần luồng email/SMS. Quy trình này không tự thêm tài khoản/role quản trị sản phẩm. Không suy quyết định này thành quyền tạo tài khoản/mật khẩu trên hệ thống thật.
- Khi hai người cùng mở bảng, tự cập nhật dữ liệu đã lưu khoảng mỗi15 giây; giữ nguyên nội dung/bản nháp đang nhập dở. Không coi đây là đồng bộ tức thời hoặc thay kiểm xung đột khi lưu.
- Khi hai người sửa cùng một ô dựa trên dữ liệu cũ, người lưu sau được báo ô đã thay đổi và xem giá trị mới trước khi quyết định sửa tiếp; không âm thầm ghi đè thay đổi vừa lưu của người kia. Đây không phải quy trình duyệt.
- Không ghi nhận phần công của một người theo từng công trình trong ngày. Lọc/quản lý công trình chưa được chốt vào phạm vi bản đầu.
- Vị trí thành phần và UI/UX phải được phân tích, thiết kế bằng skill chuyên môn (Impeccable chủ đạo, UI UX Pro Max bổ trợ), trình phương án để người dùng review; không tự chốt bố cục từ đề xuất hội thoại. Sau khi xem bản mẫu, người dùng chọn hướng C: mỗi lúc hiển thị một bảng lớn, chuyển Công/Tăng ca. Lựa chọn này chốt hướng tổ chức/thao tác; màu sắc, font, khoảng cách, hình thức điều khiển và mức hoàn thiện thị giác của bản mẫu chưa được duyệt. Người dùng đánh giá UI hiện tại thô, chưa đẹp/chuyên nghiệp và yêu cầu phát triển thiết kế phù hợp doanh nghiệp.
- Quy mô hiện tại khoảng20 người được chấm công mỗi tháng; sau này có thể tăng nhiều, chưa xác định số lượng tối đa hoặc mốc tăng trưởng. Không lấy20 làm trần nhân sự.
- Thiết kế ban đầu đơn giản. Dùng cả điện thoại và máy tính, ưu tiên điện thoại một chút nhưng desktop phải đầy đủ.

## Công, tăng ca và màu nhắc

- `0,0` và `F` từng cùng nghĩa nghỉ cả ngày; người dùng chuyển sang quy chuẩn `F` và chốt nhập số0 công tự chuẩn hóa thành `F`, áp dụng cả một ô và nhập vùng. Không áp quy tắc này cho tăng ca. Không tự đưa import dữ liệu Excel cũ vào scope chỉ vì có giá trị cũ.
- `0,5` là làm một buổi. Có thể nhận nhiều hơn một công trong một ngày theo chỉ đạo của sếp.
- Số công có lựa chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5`; nếu lớn hơn `2,5` thì chọn **Tùy chỉnh** để tự nhập. `2,5` không phải trần số công. Số công tùy chỉnh cũng chỉ theo bước `0,5` (người dùng xác nhận27/10/2026); tối đa **30 công mỗi ô** (xác nhận28/10/2026), không tự làm tròn giá trị ngoài bước hoặc vượt giới hạn. Đây không phải trần tổng tháng và không áp thành trần giờ tăng ca.
- Tăng ca tính theo giờ, có bước nửa giờ (`0,5` giờ), không cần bước15 phút. Chọn nhanh `0,5`, `1`, `1,5`, `2`, `2,5` giờ; lớn hơn `2,5` giờ thì tự nhập qua **Tùy chỉnh**, vẫn theo bước `0,5` giờ. Mỗi ô tăng ca tối đa **24 giờ** (xác nhận28/10/2026); không tự làm tròn hoặc cắt giá trị vượt trần.
- Nhập số nhận cả dấu phẩy và dấu chấm thập phân (`3,5`/`3.5`), hiển thị dấu phẩy. Số sai bước hoặc vượt trần phải báo lỗi và giữ nội dung đang nhập để sửa; không tự làm tròn/cắt về mức hợp lệ. Áp cho một ô và nhập vùng, không ghi dữ liệu khi giá trị không hợp lệ.
- Ngày không tăng ca để ô tăng ca trống, không tự điền `0` hoặc `F`; ô trống không cộng giờ vào tổng.
- Số công và số giờ tăng ca độc lập. Một ngày có thể vừa nhiều công vừa có giờ tăng ca; không quy đổi/gộp hai loại.
- Màu xanh dùng để nhắc cần hỏi/xác nhận lại thông tin; có thể bật/tắt cho từng ô công hoặc tăng ca độc lập.
- Màu không tạo trạng thái chờ duyệt, không loại dữ liệu khỏi tổng. Ô có số vẫn cộng số, `F` vẫn nghỉ, trống vẫn trống.
- Quyết định ban đầu của Agent về “chờ xác nhận/đã chốt” ảnh hưởng tổng đã được người dùng sửa lại; không còn áp dụng. Đồng ý “xác nhận độc lập” được hiểu theo màu nhắc riêng của công và tăng ca, không thành lifecycle approval.

## Nhân sự

- Khi thêm tên có lựa chọn ngày bắt đầu làm việc; dùng ngày được chọn, không tự lấy ngày thêm vào app.
- Các ngày trước ngày bắt đầu hiển thị `N` (new/chưa bắt đầu), phân biệt với nghỉ `F`. Từ ngày bắt đầu nhập công/tăng ca bình thường, không tự điền công.
- Có ngày kết thúc làm việc. Ngày này tính là ngày làm việc cuối cùng; các ngày sau trong tháng hiển thị `—`, không cộng tổng.
- Người đã kết thúc không tiếp tục hiện trong bảng các tháng sau; giữ nguyên dữ liệu cũ. Ví dụ xác nhận trong hội thoại: kết thúc20/10 thì21–31/10 hiển thị `—`.

## Bảng, xuất Excel và thiết bị

- Bảng tháng theo nhân sự × ngày, công và tăng ca riêng; tổng từng người và từng ngày theo cách Excel đang dùng.
- Có xuất file Excel. Người dùng đã duyệt một sheet gồm bảng Công phía trên và Tăng ca phía dưới; các tổng dùng công thức để tiếp tục sửa số trong Excel. Tổng công và giờ riêng, không quy đổi hoặc gộp hai đơn vị.
- Người dùng đã đồng ý thiết kế UI: điện thoại cuộn ngang/dọc, giữ tên và ngày/thứ khi cuộn, phóng to/thu nhỏ bằng hai ngón, chế độ xem bảng toàn màn hình và hỗ trợ xoay ngang; chạm ô mở phần nhập dễ bấm/chọn `F`/màu.
- Điện thoại sử dụng gồm cả iPhone và Android; thiết kế và kế hoạch kiểm chứng phải xét cả hai nhóm. Chưa xác định mẫu máy/phiên bản hệ điều hành hoặc trình duyệt cụ thể.
- Desktop tận dụng màn hình rộng; nhập bằng chuột/bàn phím, Enter/Tab chuyển ô; đầy đủ thao tác cùng dữ liệu với điện thoại.
- Chỉ dẫn UI đã duyệt phải được kiểm bằng browser khi có ứng dụng; viewport giả lập chưa chứng minh cảm ứng thật trên thiết bị.

## Định hướng kỹ thuật đã có

Người dùng đã chốt [nền tảng tại ADR-001](../../../architecture/decisions/ADR-001-product-foundation.md): shadcn/ui nền Radix; code theo feature/module; FE và BE tách ứng dụng trong cùng repository; shared UI và feature có ownership rõ; chuẩn code/UI/API phải được kiểm bằng công cụ khi triển khai. API chuẩn bị phục vụ Android sau này; không mặc định dùng lại component web cho Android native.

Bốn nguồn hiện hành là [kiến trúc](../../../architecture/ARCHITECTURE.md), [chuẩn code](../../../architecture/CODE_CONVENTIONS.md), [hệ UI](../../../architecture/UI_SYSTEM.md) và [nguyên tắc API](../../../architecture/API_CONTRACTS.md). Đây là quyết định và chuẩn tài liệu; chưa cài toolkit hoặc công cụ enforce sản phẩm. Framework/backend/DB và tooling mục tiêu được chốt tiếp nối tại ADR-003 bên dưới; phiên bản, đăng nhập, hosting và schema/contract chi tiết còn cần thiết kế. Không suy duyệt nền tảng thành duyệt mọi chi tiết trong báo cáo khảo sát, implementation plan hoặc quyền cài/code sản phẩm. Pilot002 dùng Node/SQLite không quyết định công nghệ sản phẩm.

Người dùng đã duyệt cách quản lý state tại [ADR-002](../../../architecture/decisions/ADR-002-state-management.md): TanStack Query giữ dữ liệu từ API, state React giữ thao tác/bản nháp; Zustand chỉ bổ sung khi có nhu cầu rõ, chưa cài mặc định. Dữ liệu lưu bền vững và kiểm xung đột thuộc backend/DB. Không suy từ lựa chọn này ra offline editing, lưu draft sau đóng trang, realtime hoặc backend/DB đã chọn. [Bản kiến trúc kỹ thuật cụ thể](../technical/architecture-proposal.md) ghi thiết kế chi tiết; quyết định stack tiếp nối theo ADR-003 bên dưới.

Người dùng tiếp tục xác nhận “Tôi đồng ý phương án A”: bộ công nghệ mục tiêu được ghi tại [ADR-003](../../../architecture/decisions/ADR-003-product-stack.md), gồm React/Vite/TypeScript, NestJS/Express, PostgreSQL/Prisma, công cụ form/contract/Excel/tooling đã trình. Phần framework/backend/DB/package manager chưa chọn ở checkpoint trên được thay bằng quyết định này. Chưa pin/cài/kiểm tương thích; auth/hosting, schema/contract chi tiết, nghiệp vụ còn mở, UI thị giác/spec/plan và quyền triển khai chưa tự được duyệt.

Ngày27/10/2026, người dùng xác nhận mong muốn màu thương hiệu thuộc nhóm **xanh lá**. Đây là hướng màu đã xác nhận, chưa chốt sắc độ/mã màu hoặc phân bổ cuối. Màu xanh nhắc kiểm tra vẫn giữ ý nghĩa nghiệp vụ; thiết kế phải phân biệt thương hiệu và reminder bằng độ sáng, dấu/nhãn và vị trí.

## Chọn vùng và nhập hàng loạt — 27/10/2026

Người dùng chấp nhận bản phối xanh hiện tại làm cơ sở tiếp tục (“Cũng ok rồi”), rồi yêu cầu kéo để chọn nhiều ô như Excel và nhập nhiều ô một lúc. Đây là yêu cầu mở rộng đã xác nhận, không còn loại bulk entry chỉ vì các gợi ý skill trước đây chưa thuộc scope.

Khi vùng chọn chứa ô đã có dữ liệu, người dùng chốt có **hai lựa chọn: điền ô trống hoặc ghi đè cả vùng**. Tại checkpoint ghi hai chế độ, các chi tiết tương tác còn để review; luồng chọn và bỏ qua N/— được xác nhận tiếp nối bên dưới. Tính nguyên tử/xung đột nhiều ô vẫn cần thiết kế; không suy từ hai chế độ ra API/contract hoặc quyền triển khai sản phẩm. Brief để review tại [nhập vùng](../ui/bulk-entry-design.md).

Người dùng xác nhận luồng được trình: kéo chọn vùng → chọn giá trị → chọn chế độ → xem số ô sẽ thay đổi → Áp dụng; điện thoại dùng Chọn nhiều/chạm hai đầu. Vùng chứa N/— phải bỏ qua các ô ngoài thời gian làm việc và báo rõ số ô bỏ qua. Quyền tiếp tục bản mẫu HTML đã có; lưu thật/batch conflict vẫn cần thiết kế riêng.


Người dùng chốt xử lý xung đột khi lưu vùng: **dừng cả vùng, giữ bản nháp**. Nếu có ô vừa bị người khác sửa, lần lưu đó không ghi bất kỳ ô nào trong vùng; chỉ rõ các ô xung đột để kiểm tra lại, giữ giá trị mới trên hệ thống và bản nháp của người nhập. Không tự lưu một phần hoặc tự thử lại để ghi đè. Cách thể hiện dữ liệu đối chiếu và contract kỹ thuật cần thiết kế tương ứng; chưa triển khai/kiểm chứng API/DB.


## Sửa ngày vào/nghỉ khi đã có dữ liệu — 27/10/2026

Người dùng duyệt: nếu mốc mới khiến ô đã nhập công hoặc tăng ca nằm ngoài thời gian làm việc, **chặn thay đổi mốc và chỉ rõ các ô liên quan để người dùng xử lý trước**. Giữ nguyên mốc cũ và dữ liệu; không tự xóa, ẩn hoặc chuyển dữ liệu để ép khớp mốc mới. Quy tắc áp cho cả ngày vào và ngày kết thúc, không chỉ tháng đang xem. Người dùng chốt tiếp nối: ô trống chỉ có màu nhắc cũng chặn đổi mốc nếu nằm ngoài khoảng mới, áp cho cả Công và Tăng ca. Chỉ rõ ô để xử lý trước, giữ mốc cũ và lời nhắc; không tự xóa/ẩn nhắc.


## Chọn rời và kéo điền nhanh — 28/10/2026

Người dùng duyệt chọn nhiều ô/vùng không liền nhau qua nhiều người/ngày trong tháng đang xem: desktop Ctrl/Cmd + bấm thêm/bỏ ô, Ctrl/Cmd + kéo thêm vùng; điện thoại Chọn nhiều rồi chạm thêm/bỏ ô. Không bắt các ô nằm trong một chữ nhật chung; phần giao nhau chỉ tính một lần. Không đặt số ô chọn tối đa riêng theo yêu cầu này, cũng không suy thành chọn xuyên tháng hoặc cam kết hiệu năng không giới hạn.

Có tay nắm kéo từ ô đã có giá trị để điền lặp cùng giá trị sang các ô khác, không tự tăng dãy; có cách không kéo cho điện thoại/bàn phím. Giữ hai chế độ điền trống/ghi đè, bỏ N/—, giữ màu nhắc từng ô, đếm số ô dự kiến và bấm Áp dụng trước khi thay đổi. Quy tắc số/giới hạn và xung đột dừng cả lần lưu áp chung cho tập ô đích. Phạm vi vẫn bản mẫu/đặc tả, chưa cho phép triển khai sản phẩm.


## Kéo cảm ứng bằng nhấn giữ — 28/10/2026

Người dùng chốt cả kéo chọn vùng và kéo điền trên điện thoại: giữ ô khoảng450ms để kích hoạt kéo chọn; giữ tay nắm ô nguồn khoảng450ms để kéo điền. Nếu di chuyển quá10px trước lúc kích hoạt, bỏ chờ kéo và giữ vuốt cuộn bình thường. Có viền báo khi kích hoạt; thả chỉ xem trước, Áp dụng mới ghi. Giữ cách chạm chọn rời/hai đầu và mọi quy tắc fill/replace, giới hạn số, reminder và xung đột đã duyệt.

## Duyệt kế hoạch triển khai — 28/10/2026

Người dùng xác nhận “Tôi xác nhận duyệt kế hoạch” đối với implementation-plan.md đã trình. Kế hoạch Accepted; tiếp tục inline theo khuyến nghị, bắt đầu Task1 hoàn thiện thiết kế kỹ thuật cho review G1 trước cài/code phụ thuộc. Không hỏi lại đặc tả/kiến trúc/UI hoặc approval kế hoạch. Giữ gate review G1 và quyền dispatch/tích hợp/push/deploy/hệ thống thật như đã nêu trong plan.

## Tiếp tục tự chủ tuần tự — 28/10/2026

Người dùng yêu cầu không dừng hỏi lại nếu không có vấn đề lớn, chạy lần lượt task đến khi có thể xong toàn bộ. Main điều phối, agent con thực hiện/review tuần tự. Cho phép tiếp tục triển khai plan sau G1 review kỹ thuật PASS, xử lý kỹ thuật thường lệ trong phạm vi đã chốt mà không chờ phê duyệt từng chi tiết. Không suy ra quyền hệ thống thật/primary/push/deploy/global; giữ check/review/evidence và ghi rõ hạn chế thiết bị/reader. Hỏi lại chỉ vấn đề lớn ảnh hưởng nghiệp vụ/kiến trúc hoặc thao tác ngoài scope.
