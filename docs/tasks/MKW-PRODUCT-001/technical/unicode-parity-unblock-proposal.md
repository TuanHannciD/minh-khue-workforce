# Đề xuất gỡ chặn Unicode search/order

**Cập nhật định tuyến02/11/2026:** người dùng đã “Chốt phương án1” DB authority và yêu cầu tiếp tục; [quyết định Accepted](../decisions.md#db-authority--accepted02112026), [API8 hiện hành](api-contract.md#db-authority--accepted02112026), [remaining plan](server-pagination-implementation-plan.md) sở hữu contract/gate mới. Nội dung01/11 bên dưới giữ nguyên như proposal lịch sử tại ngày viết; không còn là lựa chọn Pending phải hỏi lại hoặc quyền acquisition được duyệt. New DB-policy cần actual reviewed PASS; FAIL JS lịch sử không đổi.

**Pending — chờ main review độc lập, rồi người dùng quyết định phạm vi đánh giá runtime.** Ngày 01/11/2026; checkpoint từ BASE `8c3db2e0fdbe26ce344a6ce4721f90b8eccf8b34`. Đây là đề xuất quyền khảo sát/kiểm chứng kỹ thuật, chưa là approval, runtime đã chọn, contract mới hoặc kế hoạch triển khai sản phẩm.

Khuyến nghị giữ nghĩa tìm kiếm và thứ tự đã duyệt, bằng một lượt đánh giá PG/ICU portable trong sandbox cách ly. Không yêu cầu người dùng chọn tên ICU. Hiện chưa biết binary hoặc nguồn phân phối nào chắc chắn tương thích; tìm được nguồn và chứng minh thực tế là công việc của lượt được đề xuất, không phải kết luận của tài liệu này.

## 1. Điều đang chặn và ảnh hưởng người dùng

[API mục8](api-contract.md#8-đọc-trang-server--thiết-kế-đã-duyệt01112026) giữ tìm tên theo lowercase tiếng Việt hiện hành, substring literal, ID phân biệt hoa/thường; sắp tên tiếng Việt rồi ID, chung cho trang/full read/Excel. [Plan đã duyệt](server-pagination-implementation-plan.md) đòi Task1 reviewed PASS trước SQL3/4 và live integration/performance8/9. Tasks2/5/6/7 đã hoàn tất phần độc lập với fixture; không còn nhánh độc lập này để dùng thay prerequisite.

Actual Task1 trên Node24.22.1/ICU78.3/Unicode17 và PG17.11/ICU67.1: fixed oracle **28 tên/15 truy vấn**, candidate equivalent **FAIL4** (order, lower, hai search); deterministic diagnostic **FAIL5** (thêm canonical-equivalence). Candidate **NOT PINNED**, Task1 chưa complete. R2 chấp nhận evidence và fail-stop với0C/0I/0M mới; review không biến FAIL thành PASS. PASS26/13 trước đó chỉ là lịch sử.

Các ví dụ sau đều là dữ liệu giả đã có trong oracle:

- Gõ `nguyễn` phải tìm được cả `NGUYỄN` và `Nguyễn` trong cả tháng, kể cả người ở trang khác. Gõ `%` hoặc `_` tìm ký tự thật trong tên, không mở rộng thành wildcard. Tìm ID bằng chữ hoa không được tự coi bằng ID chữ thường.
- `Ánh` viết bằng U+00C1 và `Ánh` viết bằng A + U+0301 có thể nhìn giống nhau. Comparator đã duyệt coi hai tên bằng nhau khi sort, nên ID101 đứng trước102. Search vẫn literal: gõ bản precomposed chỉ khớp bản đó, không tự normalize để khớp cả hai. Sort và search có quy tắc riêng cần giữ cùng lúc.
- Counterexample hiện hành là cặp Cyrillic `U+1C89`/`U+1C8A` (ID126/127), hợp lệ theo contract tên. Theo JS đã duyệt, gõ một trong hai dạng hoa/thường phải trả cả hai người theo thứ tự **127,126**. PG/ICU67 hiện trả query hoa chỉ126, query thường chỉ127 và sort **126,127**. Đây là khác biệt nhìn thấy được ở kết quả và vị trí dòng; nếu nằm sát biên trang, người dùng có thể thấy người ở trang khác so với thứ tự đã duyệt. Không cần tên Cyrillic phổ biến trong nghiệp vụ mới coi đây là contract mismatch.

Artifact FAIL bất biến: `.agent-runs/MKW-PRODUCT-001/server-pagination/parity-8063a9d5-8fcd-4608-b770-d5c1859151fb/collation-parity.json`, SHA256 `a1de4139120a2e612e11f6141d7b4f2ce81b8c402a4816c3b346da9e1b987175`. [Validation R1](../validation.md#task1-fix-r1--sql-xác-nhận-fail-01112026) giữ commands/provenance/release; lượt viết này không chạy lại SQL hoặc phân tích lại mismatch.

## 2. Phương án khuyến nghị và lựa chọn thay thế

**Ưu tiên đánh giá capability tương thích:** tìm một PG build cùng ICU/case/collation data có khả năng giữ semantics hiện hành, chạy oracle cố định trước khi chọn. Đổi runtime tăng chi phí provenance, coupling với Node, migration và vận hành; có thể không tìm được portable build phù hợp trong phạm vi cho phép. ICU cùng số version với Node, hỗ trợ riêng U+1C89, locale `vi` hoặc `deterministic=false` **đều không tự chứng minh parity**. Cần actual lower/search/toàn ordered IDs/canonical ties/ID ties, exact expressions và versions; fixture hữu hạn cũng không chứng minh mọi Unicode hoặc tương lai không drift.

**Alternative PG67 — chưa được duyệt:** giữ PG17.11/ICU67.1 và đổi contract sang kết quả hoa→126, thường→127, order126 trước127. Lựa chọn này giữ runtime hiện có nhưng thay observable search/order đã duyệt. Chỉ được xét sau quyết định riêng của người dùng về hành vi, rồi đồng bộ nguồn contract, web/full read/Excel và tests theo thiết kế/plan được review. Không sửa expected JS hoặc pin candidate hiện tại để gọi Task1 PASS. Tài liệu này không khuyến nghị tự chọn alternative khi đánh giá runtime thất bại.

Stored lowercase key từ Node chỉ có thể giải một phần search, chưa giải order đã đo; cần schema/backfill/write/version/concurrency design riêng. Không đưa bespoke mapping, đổi tập ký tự hợp lệ, normalization/bỏ dấu/ASCII fallback hoặc lấy toàn danh sách về app sort/slice vào approval nhỏ này.

## 3. Phạm vi approval tiếp theo nhỏ nhất — Proposed

Nội dung đề nghị main review để trình người dùng: **chỉ cho phép tìm nguồn, xác minh nguồn và đánh giá một candidate PG/ICU portable trong sandbox giả cách ly để giữ search/order đã duyệt; chưa triển khai Tasks3/4/8/9 hoặc đổi contract.** Không xin lại design/defaults/page-local selection/phương pháp đã duyệt.

Phạm vi tương lai đề xuất gồm:

1. Đọc catalog/tài liệu phát hành chính thức hoặc nguồn phát hành có provenance kiểm chứng để xác định candidate khả dụng. Ghi URL, nhà phát hành, license, build/version/platform, ICU/Unicode/CLDR được công bố, checksum/chữ ký và cách kiểm. Chưa có nguồn nào được xác nhận trong hồ sơ này; không hứa tải được build tương thích.
2. Chỉ sau xác minh nguồn, tải tối đa **một** candidate portable cùng thành phần runtime bắt buộc được khai báo, giải nén trong thư mục mới task-owned dưới ignored evidence root; không ghi đè portable runtime/Task10 data cũ. Không package manager install, installer/admin/system service, global PATH/config/registry, dependency/extension mới, thay Node/pnpm pin hoặc build PG/ICU từ source. Nếu chỉ có source hoặc phải cài toolchain/driver/dependency khác thì dừng và bàn giao nhu cầu mới; quyền này không bao phủ các bước đó.
3. Trước acquire, main review target/owner và cách dùng identity gate cho runtime candidate. Chỉ **một cluster mới cách ly**, loopback/cổng trống được cấp riêng, role và DB UUID giả, data/binary/owner record riêng; không nâng in-place hoặc trỏ cluster cũ sang binary mới. **Review R1 đã xác nhận blocker hiện hữu:** helper/allowlist của oracle hiện chỉ nhận Task10 alias/owner/root/role và actual PG17.11; đổi env owner/evidence root không cho phép target mới, kể cả candidate vẫn PG17.11 nhưng owner/data root khác. Sau discovery xác định candidate, main cần chuẩn bị scoped harness enrollment riêng cho exact owner/root/role/DB/actual version và binary provenance, giữ nguyên identity gate Task10 cùng lifecycle/failure cleanup; cần quyền scope đó và independent review trước provisioning/parity. Proposal Pending này không cấp quyền sửa harness/enrollment. Khi prerequisite đó chưa đạt, provision/oracle **Blocked**; không giả identity Task10, bỏ version check hoặc dùng DB thật. Không cần worktree mới; dùng checkout hiện có chỉ khi main xác nhận writer/base sạch.
4. Chạy kiểm capability/parity bằng oracle đã pin, migration hiện có trên DB giả và đánh giá consistency cần thiết bên dưới. Chỉ phục vụ runtime assessment; không sửa source sản phẩm/schema/generated contract hoặc triển khai SQL page/full export. Nếu cách kiểm đòi sửa implementation hay bổ sung dependencies, dừng ở báo cáo đề xuất bước đó.

**Quyền hiện tại của writer không gồm các bước trên:** chỉ đọc local liên quan, viết3 tài liệu, kiểm docs/UTF-8/whitespace và local scoped commit. Không network/download/install/acquire runtime/DB/browser/server, không new worktree/new dependency hoặc SQL-dependent implementation đã được thực hiện. Approval proposal và approval acquisition là hai sự kiện còn Pending; không tự cấp quyền từ tài liệu hay quyền filesystem/network của runtime.

## 4. Bằng chứng bắt buộc trước khi mở gate

Đánh giá runtime phải bàn giao evidence có thể review, kể cả kết quả Fail/Blocked:

- Nguồn phân phối và hash/signature thực; identity binary đang chạy, PG build/encoding, ICU được load thực, Node/ICU/Unicode/CLDR và Intl resolved options. Ghi provider/locale/determinism/collversion/actual version, exact SQL lower/literal/order expressions, fixture hash và target/owner trước mutation; không chỉ dựa tên file hoặc release notes.
- Chạy **nguyên fixed28/15** với JS expected đã tồn tại trước SQL: toàn ordered IDs, từng lowercase/code point, expected/actual IDs của cả15 queries, literal `%`/`_`/backslash/IDcase/trim, canonical-equivalent và duplicate-name ID ties. Giữ cả oracle cũ và FAIL artifact; không sửa expected để hợp candidate. Chỉ PASS0 mismatch/exit0 và review độc lập mới đủ cho prerequisite kỹ thuật; version bằng nhau không thay check này.
- Migration hiện có phải chạy được trên DB giả mới của candidate. Đánh giá tác động collation/index trên baseline sandbox cần hỗ trợ: so recorded/actual collation version, xác định khi nào cần rebuild/reindex và thứ tự xử lý version metadata theo tài liệu PG. Nếu chưa có index phụ thuộc thì ghi inventory N/A có bằng chứng, không claim đã reindex. Không coi refresh version metadata là đã rebuild index; không nâng cluster cũ hoặc tạo/chạy migration sản phẩm mới để thử. Khả năng nâng dữ liệu thật/production vẫn ngoài scope.
- Chứng minh cùng fixed predicate/order có thể dùng nhất quán cho page boundaries và fullmonth/export; phân biệt test SQL capability với product integration chưa viết. Sau reviewed Task1 PASS, Task3 phải kiểm concatenated page IDs đúng oracle; Task4 phải kiểm full read và hai bảng Excel cùng thứ tự/marker theo ID, q/page không lọc Excel, totals toàn tháng và snapshot closure giữ nguyên. Assessment chưa thể claim các đường sản phẩm này PASS trước implementation. Tasks8/9 vẫn phải làm integration/races/browser/performance riêng theo dependency, không mở đồng loạt chỉ vì runtime xanh.

Main nhận báo cáo nguồn/capability/migration/consistency, fresh independent review exact artifacts và patch nếu có trong quyền riêng. Chỉ sau reviewed PASS mới pin runtime/policy tại API8 và cập nhật scope tài nguyên của plan/LOCAL_RUN theo quyền đã duyệt rồi mở Task3; Task4 sau owner SQL tương ứng, Task8 sau3/4/7, Task9 sau8. Không tự đổi trạng thái Done/live PASS hoặc xóa historical Failed/Not run/I3/G3/G4/dependency/native/SR gates.

## 5. Điều kiện dừng và cleanup

Không xác minh được nguồn/hash/identity, không có portable candidate phù hợp, thiếu quyền provision/gate, migration fail, parity có dù một mismatch hoặc cleanup không đạt: **dừng nhánh phụ thuộc**, ghi Fail/Blocked và nguyên nhân. Không lặp tải/thử candidate thứ hai, sửa oracle, đổi contract hoặc tự mở thêm scope. Bàn giao kết quả cụ thể cho main quyết định lượt tiếp; không hứa chắc sẽ có runtime tương thích.

Owner tương lai phải ghi binary/data/process/cổng/DB/evidence trước acquire và kiểm identity thực trước start/write/stop. Chỉ giải phóng tài nguyên tự tạo: close mọi own pool/app nếu có, xác nhận connections/listeners/process đã đóng và giữ lỗi gốc cùng mọi cleanup error. SQL-only không tạo tài khoản; ghi not-provisioned, không giả rotate/session proof. Nếu HTTP được cấp quyền riêng sau này thì rotate/revoke/verify trước DB disconnect theo scoped owner; HTTP live hiện vẫn Not run. Stop PG chỉ sau kiểm executable/command/data/owner đúng, không kill theo port/PID tình cờ. Không release được thì state incomplete, báo main với identity/evidence; không gọi released để mở gate.

Giữ run DB/data/source hashes/logs và cả failed attempts để review; không drop/reset/clean hoặc xóa runtime/evidence cũ. Temporary task-owned download/extraction chỉ được dọn sau khi kiểm resolved absolute path nằm trong đúng root, không còn process dùng, đã giữ đủ provenance và main xác nhận retention/cleanup scope; không xóa tài nguyên chưa rõ chủ sở hữu.

## 6. Checkpoint và bước tiếp

[INDEX](../INDEX.md) và [validation](../validation.md) ghi completed commits/reviews/checks hiện hành, giới hạn retained evidence và trạng thái chặn. Lượt này chỉ làm tài liệu; không có runtime mới hoặc kiểm SQL mới. **Next: main review độc lập proposal và checkpoint trên exact commit → xử lý findings → trình approval nhỏ tại mục3.** Chưa hỏi người dùng trước review; chưa có lựa chọn nào trong proposal được tự Accepted.
