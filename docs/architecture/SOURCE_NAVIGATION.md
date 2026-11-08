# Chia file và điều hướng source cho Agent

Hiệu lực: quy định tài liệu theo yêu cầu người dùng ngày25/10/2026. Chi tiết của [CODE_CONVENTIONS](CODE_CONVENTIONS.md); ranh giới theo [ARCHITECTURE](ARCHITECTURE.md). Căn cứ và trade-off ở [khảo sát repo](../tasks/MKW-PRODUCT-001/technical/source-navigation-research.md). **Đã viết quy định; chưa có checker tự động hoặc kết quả thử trên source sản phẩm.** Không đổi quyền, nghiệp vụ, gate test/review hoặc stack còn Proposed.

## 1. Khi nào tách và tách như thế nào?

Xem xét tách khi file trộn trách nhiệm có thể thay đổi độc lập: transport API với UI; component trình bày với state/draft phức tạp; HTTP controller với nghiệp vụ; xử lý DB với format hiển thị. Một dấu hiệu khác là sửa use case nhỏ phải đi qua nhiều vùng không liên quan hoặc không thể test logic mà dựng toàn bộ màn hình.

Đặt tên theo trách nhiệm/use case, giữ code cùng nghĩa gần nhau trong feature sở hữu. Tách logic thuần dễ kiểm thử, hook điều phối khi thật sự cần, hoặc component có trách nhiệm hiển thị/tương tác rõ. Không bắt mỗi hàm thành một file; không tách JSX thành render-part1/render-part2 chỉ để giảm số dòng; không chuyển code nghiệp vụ sang shared/utils để đạt ngưỡng.

Sau tách phải giữ chiều import, interface tối thiểu, state ownership và invariant. Không tạo cycle, chuỗi wrapper không thêm ý nghĩa, nhiều tham số truyền qua tầng rỗng hoặc barrel export toàn bộ. Public interface có thể là entry module rõ tên; không bắt mọi feature có index.ts.

Ví dụ định hướng cho chấm công, chưa là tên source đã tồn tại: phần bảng hiển thị thuộc UI attendance; draft/chọn ô thuộc model của feature; query/mutation thuộc API của feature; tính đúng và lưu có điều kiện thuộc backend. Các helper nhỏ cùng thao tác vẫn có thể ở cùng file. Đừng chia một transaction hoặc lifecycle chặt chẽ thành nhiều file nếu làm khó hiểu tính nguyên tử/cleanup.

## 2. Ngưỡng nhắc review và ngoại lệ

Đối với source viết tay do project sở hữu, dùng tổng số dòng vật lý bao gồm dòng trống/comment làm tín hiệu dễ đếm; không cắt file chỉ để đạt số:

- **Dưới400 dòng:** không tự coi là tốt; vẫn tách nếu trách nhiệm lẫn hoặc khó hiểu/test. Không cần TOC nếu tên file/symbol và thứ tự đã rõ.
- **Từ400 đến799 dòng:** khi tạo mới/chạm thay đổi đáng kể, writer đánh giá tách và ghi kết luận ngắn trong hồ sơ task/review. Nếu giữ nhiều vùng khó định vị, thêm file map; nếu map không đem thêm thông tin, không thêm comment hình thức.
- **Từ800 dòng trở lên:** nếu giữ nguyên file viết tay lớn trong phạm vi thay đổi đáng kể, phải có file map và ghi lý do giữ chung, ranh giới/invariant, vùng được sửa, test/consumer cần kiểm. Không hard-fail vì độ dài nếu lý do hợp lý và gate tương ứng đạt.

Đây là heuristic riêng của project, không là chuẩn phổ quát hay benchmark. “Thay đổi đáng kể” gồm thêm/sửa hành vi, refactor hoặc đổi bố cục/symbol của file; sửa typo/comment nhỏ không tự kéo theo refactor toàn file. Ghi nợ điều hướng nếu phát hiện vấn đề ngoài scope; không âm thầm mở rộng task.

Generated code, lockfile, dữ liệu fixture lớn và mã upstream/vendor không dùng chung gate TOC viết tay. Chỉ dẫn phải trỏ đến generator/source hoặc tài liệu ownership phù hợp. Không thêm mục lục thủ công vào generated output, sửa vendored skill hoặc chia migration đã phát hành để thỏa số dòng. File UI vendored đã custom do project sở hữu vẫn cần xét trách nhiệm và cách điều hướng; không miễn trừ chỉ vì ban đầu lấy từ shadcn.

Giữ file dài cần lý do cụ thể như lifecycle/transaction có quan hệ chặt, API tương thích hoặc test matrix cùng đơn vị; “ngại tách” và “đã có TOC” không đủ. Writer ghi lý do, reviewer đánh giá theo gate hiện có; không tạo một quy trình xin phép riêng cho từng ngoại lệ.

## 3. Bản đồ module khi đọc nhiều file mới hiểu được luồng

Khi module có nhiều file và đường đi không rõ từ cây thư mục, dùng README.md ngay tại module/feature. Chỉ tạo khi giúp định hướng thực tế; không bắt mỗi thư mục nhỏ có README hoặc AGENTS.md. Module map gồm:

- Trách nhiệm và phần không thuộc module.
- Điểm vào theo loại công việc, với đường dẫn tương đối và symbol chính: sửa thao tác nhập, sửa lưu/API, sửa rule/tổng hoặc lỗi hiển thị.
- Chiều dữ liệu/dependency, owner của state, invariant và ranh giới giao tiếp.
- Test liên quan và lệnh có thật; nếu chưa có lệnh ghi thiếu, không bịa.

Map ngắn, chỉ liệt kê điểm vào quan trọng; không chép toàn bộ cây source, mọi private method, schema hoặc quy tắc nghiệp vụ vào README. Nghiệp vụ tiếp tục thuộc requirements/contract hiện hành; không tạo nguồn chuẩn cạnh tranh. Không tạo sẵn map cho module sản phẩm chưa có code.

## 4. File map / TOC cho file lớn được giữ lại

Đặt block comment ngắn ở đầu file, sau license/header và chỉ thị bắt buộc nếu có; không làm hỏng shebang/directive/framework convention. Dùng comment hợp lệ theo ngôn ngữ. Mục lục trỏ theo **tên symbol đủ phân biệt**, không lấy số dòng viết tay làm địa chỉ chuẩn.

Mẫu TypeScript minh họa, các symbol bên dưới chưa tồn tại trong project:

```ts
/**
 * File map — cập nhật cùng thay đổi symbol/trách nhiệm.
 * Trách nhiệm: điều phối tương tác bảng; không sở hữu transport hoặc luật tính công.
 * - Điểm vào giao diện: AttendanceGrid
 * - Vòng đời bản nháp: useAttendanceDraft
 * - Điều hướng bàn phím: handleCellKeyDown
 * - Cleanup: clearPendingSelection
 * Đọc kèm: module README và test tương ứng nếu có.
 * Lý do giữ chung: ghi invariant/lifecycle cụ thể của file thật.
 */
```

Mẫu chỉ minh họa cách viết map, không khuyến khích gom bốn trách nhiệm vào cùng file hoặc chấp nhận dòng “lý do” chung chung. File thật chỉ ghi symbol/path hiện có, mỗi mục giải thích đủ để chọn nơi đọc; chi tiết lý do và test có thể ở module map/hồ sơ task thay vì lặp dài trong header.

Với class dùng `ClassName.methodName` khi tên trùng; với callback không tên, tìm owner có tên hoặc section marker duy nhất. `#region`/section heading có thể dùng để nhóm vùng, nhưng không thay bản đồ và không tự giảm context. Không lạm dụng region lồng nhau để che file trộn trách nhiệm.

Số dòng chỉ dùng làm vị trí tạm từ kết quả search hiện tại. TOC/manual map không sao chép chữ ký đầy đủ hoặc mọi hàm nhỏ dễ lệch. Nếu block map bắt đầu dài như tài liệu riêng, quay lại xét chia file/module.

## 5. Agent đọc code theo lớp

1. Đọc task/nguồn chuẩn và giới hạn trước; xác định hành vi cần sửa hoặc giả thuyết cần kiểm. Không bắt đầu bằng nạp toàn bộ repository.
2. Tìm file trong vùng liên quan bằng `rg --files`, tìm symbol/chuỗi bằng `rg -n`; dùng symbol outline/LSP/AST nếu runtime có, không giả đã có hoặc tự cài chỉ để đọc source. Chưa biết tên thì tìm theo hành vi/điểm vào module.
3. Nếu có module README/map thì đọc phần điểm vào và invariant liên quan. Với file lớn, xem header/file map hoặc outline trước; tìm lại symbol trong **source hiện tại** để lấy vị trí. Nếu không có TOC, vẫn dùng search/outline và tiếp tục, không xem thiếu TOC như không thể làm việc.
4. Đọc đầy đủ đơn vị cần sửa: function/method/component, kiểu/constant/closure state và nhánh lỗi/cleanup nó phụ thuộc. Chunk đầu bị cắt hoặc chỉ có chữ ký không đủ. Mở rộng đến hết đơn vị; không giới hạn cứng số dòng/token nếu ảnh hưởng tính đúng.
5. Theo imports/callers/consumer và test liên quan để biết input/output, side effect, invariant, data flow và tác động. Search không thấy tên chưa chứng minh không có consumer: xét re-export, alias, đăng ký sự kiện/DI và lời gọi động khi có. Boundary/state/contract/shared change cần phạm vi đọc và regression rộng hơn thay đổi cục bộ.
6. Trước sửa phải giải thích được đường đi của hành vi, owner dữ liệu, invariant và check cần chạy. Nếu chưa hiểu, tiếp tục mở rộng context có mục đích; không suy nội dung implementation từ TOC. Review phải xem toàn bộ diff trong scope và consumer bị ảnh hưởng, không chỉ section vừa đọc.
7. Khi đổi tên/tách/chuyển symbol hoặc điểm vào, cập nhật map cùng thay đổi. Ghi kết quả/giới hạn/bước tiếp bằng đường dẫn + symbol để Agent sau định vị lại, không chép cả file vào handoff.

Quy tắc giảm context hướng đến loại phần không liên quan, không giảm bằng chứng cần thiết. Một đơn vị phức tạp có thể cần đọc nguyên file; ghi lý do thay vì cắt mất invariant để đạt ngân sách giả tạo. Không tuyên bố đã hiểu hoặc đã review code chỉ từ map.

## 6. Chống mục lục lỗi thời

Source thực tế là bằng chứng về implementation; map là chỉ dẫn tìm kiếm. Nếu map trỏ sai, xác minh source bằng search/outline, mở rộng vùng đọc và sửa map trong phạm vi sở hữu. Nếu source mâu thuẫn yêu cầu, theo authority map để xử lý; không tự coi source là nghiệp vụ chuẩn.

Mỗi thay đổi cấu trúc phải kiểm path/symbol trong map còn tồn tại, điểm vào có đúng trách nhiệm và không còn chỉ dẫn cũ gây đi sai. Không tạo một file TOC riêng chỉ để lặp header map. Module README sở hữu luồng liên file; header map sở hữu vùng trong file; quy định này sở hữu cách viết/đọc, tránh ba bản cùng mô tả một nội dung.

## 7. Gate hiện tại và công cụ tương lai

Hiện tại: writer/reviewer áp checklist chia trách nhiệm, ngưỡng review, map còn đúng và đủ dependency/consumer/test theo [QUALITY_GATES](../agent/QUALITY_GATES.md). Task chỉ sửa tài liệu kiểm Markdown và nhất quán; không tự refactor code cũ chỉ vì rule mới.

Chưa có checker tự động cho số dòng, symbol map hoặc module paths. Nếu triển khai tooling sau này, thiết kế riêng để:

- Đếm source viết tay với include/exclude có provenance, báo file cần review thay vì tự chia file hoặc tự xóa comment.
- Kiểm presence của map/lý do cho file thuộc diện yêu cầu; phân biệt kiểm comment tồn tại với kiểm nội dung đúng.
- Kiểm path/symbol thực bằng parser/outline phù hợp; regex đơn lẻ không được gọi là xác minh đầy đủ. Không chạy script hoặc lệnh được nhúng trong comment TOC.
- Có fixture map đúng/sai, symbol đổi tên, generated ngoại lệ và import sau tách; đo độ hữu ích với task thật trước mở rộng sang repo map sinh tự động.

`check:docs` hiện có không chứng minh file map đã đúng với source hoặc Agent tuân thủ cách đọc. LSP/AST/indexer/repomap tự sinh chưa được cài/kiểm chứng bởi quy định này.
