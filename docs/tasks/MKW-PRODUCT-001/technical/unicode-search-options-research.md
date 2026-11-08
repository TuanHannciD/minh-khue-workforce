# Nghiên cứu phương án tìm tên và thứ tự Unicode

**Cập nhật định tuyến02/11/2026:** người dùng đã “Chốt phương án1” DB authority và yêu cầu tiếp tục; [quyết định Accepted](../decisions.md#db-authority--accepted02112026), [API8 hiện hành](api-contract.md#db-authority--accepted02112026), [remaining plan](server-pagination-implementation-plan.md) sở hữu contract/gate mới. Nội dung01/11 bên dưới giữ nguyên như proposal lịch sử tại ngày viết; không còn là lựa chọn Pending phải hỏi lại hoặc quyền acquisition được duyệt. New DB-policy cần actual reviewed PASS; FAIL JS lịch sử không đổi.

Ngày 01/11/2026. **Research proposal / Pending main review và quyết định người dùng; không phải contract đã duyệt.**

Mục tiêu: xem lại lựa chọn kỹ thuật bằng tài liệu chính thức trên Internet, giải thích tác động bằng ví dụ, rồi đề xuất đánh đổi phù hợp sản phẩm. Nguồn hành vi hiện hành vẫn là [design mục15](../design.md#15-phân-trang-server-và-tìm-toàn-tháng--accepted01112026) và [API mục8](api-contract.md#8-đọc-trang-server--thiết-kế-đã-duyệt01112026). [Proposal trước](unicode-parity-unblock-proposal.md) ưu tiên khảo sát runtime tương thích; nghiên cứu này đề nghị cân nhắc lại ưu tiên đó, chưa thay nó bằng quyết định mới.

Writer duy nhất Sol/high; không agent con/helper/reviewer. BASE sạch `67ba5624b1d5bf1e727afe8d0cbcb4ca708647f1`, branch `agent/mkw-agent-002`, worktree `.worktrees/agent-bootstrap`. Scope: file này và ignored report `.superpowers/sdd/server-pagination-implementation-plan/unicode-options-research-report.md`; network chỉ đọc tài liệu công khai, docs checks và scoped local commit. Không tải binary/cài đặt, acquire runtime/DB, sửa sản phẩm/schema/contract, push/merge/deploy. Tài nguyên: một browser tab nghiên cứu riêng; HTTP đọc vào bộ nhớ, không lưu bộ cài hoặc HTML nguồn. Acceptance: so sánh đủ năm hướng, nêu ví dụ/chi phí/giới hạn, có URL và nội dung nguồn hỗ trợ, phân biệt evidence với suy luận. Rủi ro chính: biến đề xuất đổi semantics thành approval hoặc suy tài liệu thành capability đã chạy. Route tiếp: main review độc lập exact commit rồi trình lựa chọn hành vi và quyền cần thiết; writer không tự mở gate Task1/3/4/8/9.

## 1. Khuyến nghị để người dùng lựa chọn

**Ưu tiên đề xuất phương án1: để PostgreSQL/ICU hiện có làm nguồn duy nhất cho lowercase tên, tìm kiếm và thứ tự tên, dùng nhất quán cho trang, fullmonth và Excel.** Lý do là giữ SQL sở hữu tìm/lọc/sắp trước phân trang, giảm hai hệ Unicode phải luôn giống nhau và tránh thêm runtime/schema chỉ để bắt chước kết quả JavaScript. Đây là nhận định engineering, chưa có benchmark chứng minh nhanh hơn.

Đổi lại, phải nói thẳng và xin duyệt **contract delta nhìn thấy được**: một số ký tự Unicode mà ICU cũ chưa biết sẽ không được coi là cùng cặp hoa/thường và có thể đổi vị trí. Không gọi việc đó là parity PASS. Không cấm ký tự lạ, không hạ tiêu chuẩn vì tên hiếm, không âm thầm sửa JS expected. Giữ nguyên các FAIL lịch sử và thêm tiêu chí mới chỉ sau khi được quyết định.

Người dùng cần chọn hành vi, không cần chọn tên ICU:

1. **“Ưu tiên một quy tắc DB thống nhất, chấp nhận khác biệt Unicode đã nêu.”** Chọn phương án1. `NGUYỄN`/`Nguyễn` vẫn tìm chung bằng `nguyễn`; cặp Cyrillic cụ thể dưới đây tách kết quả hoa/thường và đổi thứ tự so với JS. Mọi đường đọc dùng đúng cùng quy tắc DB. Sau này nâng DB/ICU vẫn phải kiểm thay đổi và xử lý index.
2. **“Cần giữ cả các trường hợp Unicode đúng hệt JavaScript hiện tại.”** Phương án1 không đáp ứng; ưu tiên đánh giá có giới hạn phương án2 để giữ SQL ownership. Chưa thể hứa có build phù hợp hoặc parity toàn Unicode. Nếu không tìm được, main trình phương án4 với thay đổi kiến trúc rõ ràng; không tự chuyển nhánh.
3. **“Muốn gõ `nguyen` tìm được `Nguyễn` hoặc cho phép gõ sai.”** Đây là yêu cầu sản phẩm mới. Bỏ dấu và fuzzy phải được chọn riêng, với ví dụ collisions và acceptance riêng; không kèm ngầm vào hai lựa chọn trên.

Không khuyến nghị thêm search service hoặc `pg_trgm` chỉ vì có1.000 người. Nếu giữ nguyên yêu cầu exact JS và không duyệt bất kỳ thay đổi kiến trúc/runtime nào, nhánh phụ thuộc vẫn Blocked; tài liệu không tự giải mâu thuẫn đó.

## 2. Điều đã biết và ví dụ thực tế

**Biết từ hồ sơ local, không chạy lại trong lượt này:** Node24.22.1/ICU78.3/Unicode17 so với PG17.11/ICU67.1; fixed oracle28 tên/15 query: candidate equivalent FAIL4, deterministic diagnostic FAIL5. API8 ghi candidate chưa pin. Tài liệu Unicode16 chính thức xác nhận cặp TJE có mapping hoa/thường [S16]; nguồn đó không chứng minh PG đang chạy hoặc thứ tự tiếng Việt.

- **Tên thường gặp:** `NGUYỄN` và `Nguyễn` đều lowercase thành `nguyễn` trong fixture hiện có, nên q=`nguyễn` tìm được cả hai, kể cả người ở trang khác. Chọn DB làm nguồn chuẩn không đồng nghĩa mất tìm kiếm tiếng Việt thông thường. Chưa benchmark hoặc kiểm toàn bộ tên tiếng Việt trong nghiên cứu này.
- **Có dấu khác bỏ dấu:** lowercase không tự bỏ dấu. q=`nguyen` không tự khớp `Nguyễn`; đây cũng là hành vi đã duyệt. `unaccent` có thể hỗ trợ yêu cầu bỏ dấu mới, nhưng đó là semantics khác [S11].
- **Nhìn giống nhau nhưng byte khác:** `Ánh` (U+00C1) và `Ánh` (A + U+0301) có comparator JS bằng0; ID101 trước102. Search hiện là literal sau lower: q bản precomposed chỉ khớp101, bản decomposed chỉ102. Có thể giữ canonical tie khi sort bằng collation nondeterministic thích hợp và giữ search literal bằng `COLLATE "C"` sau lower; không normalize nội dung search. `deterministic=false` chỉ bỏ bytewise tie, không tự chọn đúng locale/strength hoặc bổ sung Unicode mới [S1, S14].
- **Counterexample thật trong fixture giả:** ID126 có tên `U+1C89` (CYRILLIC CAPITAL LETTER TJE), ID127 là `U+1C8A` (SMALL LETTER TJE). JS hiện lower cả hai thành U+1C8A; gõ một trong hai trả `[127,126]`. PG/ICU67 đo trước đó: query hoa chỉ126, thường chỉ127, thứ tự `[126,127]`. Nếu nằm sát biên trang, người dùng thấy dòng thuộc trang khác. Phương án1 chấp nhận chính khác biệt này sau approval; phương án2 phải khắc phục cả lower/search và order.
- **Một q tìm tên HOẶC ID toàn tháng:** q=`cafe` khớp tên `CAFE thật` và ID kết thúc `cafe`; q=`CAFE` vẫn khớp tên nhưng không ID chữ thường. Không lowercase ID, không tìm riêng page hiện tại, không tự tách nhiều từ thành điều kiện AND. `%`, `_`, `\` là ký tự thật [API8, S3].
- **Tổng và Excel:** tìm còn2 kết quả thì footer vẫn là tổng mọi nhân sự của tháng; tổng hàng là cả tháng của người trên page. Excel nhận month, không q/page, xuất toàn tháng đã lưu và cùng thứ tự tên/ID ở hai bảng Công/Tăng ca. Dùng chung “search policy” không có nghĩa áp q của màn hình cho Excel.

**Đính chính phạm vi hoàn tất:** đây không phải tình trạng “xong hết tính năng, chỉ thiếu giao diện”. Tasks2/5/6/7 được hồ sơ ghi completed cho phần độc lập; UI page/search chạy với fixture. `POST /api/v1/attendance/search` trong API8 chưa có route thật trong controller tại BASE; SQL page/fullmonth/export integration và live performance còn gated. Interface/DTO/UI fixture không chứng minh một luồng web–API–DB dùng được. Nghiên cứu này chỉ đọc controller để xác nhận route, không kiểm thử sản phẩm.

## 3. Năm hướng và chi phí thực tế

### Phương án1 — PostgreSQL/ICU là nguồn chuẩn duy nhất

Giữ PG hiện có, chọn rõ ICU locale `vi` và các thuộc tính collation/order đã đánh giá; tên và q cùng lower ở DB, so substring literal bằng collation `C`, ID gốc case-sensitive. DB lọc toàn membership trước `ORDER BY name COLLATE <đã chọn>, id ASC` rồi `LIMIT/OFFSET`. Fullmonth/Excel gọi cùng owner order; web giữ thứ tự nhận từ server. Không dùng comparator browser để sắp lại page.

Ưu: một nơi sở hữu đọc, phù hợp SQL ownership và payload bounded đã duyệt; không thêm stored key/backfill hoặc tìm một PG build chỉ để đuổi theo Node. Đổi Node trong tương lai không bắt buộc đổi kết quả server. Có thể giữ canonical tie `Ánh` như đã biết bằng cấu hình equivalent; không cần mặc định chuyển sang deterministic và nhận thêm canonical mismatch.

Nhược: **đổi semantics đã duyệt** cho cặp Cyrillic và có thể Unicode khác chưa kiểm. ICU cũ nhận biết ký tự mới kém hơn; không nên trình bày đó là ưu điểm chất lượng Unicode. Thay đổi provider/data về sau vẫn có thể đổi kết quả, index phụ thuộc vẫn cần rebuild thích hợp [S1, S12]. “Nguồn chuẩn” là policy được pin và kiểm, không phải `ORDER BY name` theo default cluster bất kỳ. Giữ runtime hiện có để giảm scope lần này không đồng nghĩa đóng băng nó mãi hoặc đã xác minh suitability triển khai thực tế.

Cần duyệt: observable delta trên, cập nhật đúng design15/API8/plan/tests và gate mới qua main. Không đổi expected của oracle JS cũ để xóa FAIL; thêm acceptance DB-authoritative riêng sau quyết định. Cần kiểm endpoint thật, snapshot, page/full/Excel trước claim feature hoàn tất.

### Phương án2 — Căn PostgreSQL ICU với Node, giữ exact JS semantics

Tìm PG build/case/collation data có khả năng khớp Node/Intl hiện pin, cấu hình locale/strength/canonical tie và exact expressions, rồi kiểm oracle nguyên bản. Có thể cần thay runtime, không nhất thiết cứ đổi PG major là đủ. PG ICU và Node ICU cùng số version cũng chưa bảo đảm cùng locale data/tailoring/options/API behavior [S1, S13–S15].

Ưu: hướng ít thay kiến trúc nhất nếu **phải giữ** hành vi JS hiện tại mà SQL vẫn sở hữu lọc/sắp/phân trang; không thêm derived field vào mọi lần ghi tên. User effect mong muốn: cả hai TJE tìm chung, order127 trước126, canonical tie dùng ID101 trước102, search vẫn literal.

Nhược: phải tìm nguồn binary/platform đáng tin, kiểm identity và migration; coupling Node/ICU/Unicode/CLDR/PG cùng policy. Nâng một bên có thể phải đánh giá lại bên kia; runtime cũ không thể duy trì vô hạn chỉ để giữ parity. Collation đổi cần inventory/rebuild đối tượng phụ thuộc rồi refresh version; `REFRESH VERSION` không tự rebuild hoặc chứng minh đã rebuild [S12]. Chưa xác định candidate khả dụng hoặc chi phí vận hành thực trong lượt này.

**Giới hạn chứng minh:** oracle28/15 có thể loại candidate sai, không chứng minh mọi Unicode, context-sensitive casing, mọi tên nhiều code point hoặc mọi nâng cấp tương lai. ECMA-402 nói kết quả collation có thể đổi giữa các version dù resolved options giống nhau; case mapping có thể tùy tailoring và có ngữ cảnh [S14]. Chấp nhận phương án này là chấp nhận chi phí kiểm soát drift, không mua được bảo đảm toán học từ một fixture hữu hạn.

Cần quyền sau quyết định: source verification/acquisition sandbox, enrollment harness/identity riêng, provision đúng owner, parity/migration/index checks và independent review như proposal trước. Nghiên cứu web hiện tại không cấp các quyền này.

### Phương án3 — Lưu search key do Node tính, DB vẫn sắp tên

Ý tưởng: khi tạo/sửa tên, Node tính key bằng chính `toLocaleLowerCase("vi")`; q đi qua cùng phép tính và version; SQL so substring key literal, ID vẫn nguyên. “Normalized key” ở đây chỉ là **lowercase key**, không NFC/NFD, bỏ dấu hoặc transliteration. Tên gốc vẫn giữ nguyên.

Ưu: DB tiếp tục lọc trước page, đưa lower ra khỏi PG ICU cũ; có thể làm search TJE khớp JS nếu mọi key/query được tạo đúng cùng semantics. Không cần tải toàn metadata về app mỗi read.

Nhược: đây là **giải pháp search-only một phần**. DB order trên tên vẫn126 trước127, khác JS127 trước126; canonical ties vẫn cần collation thích hợp. Chấp nhận DB order cùng Node search là một contract lai mới, không phải đã giải full parity.

Chi phí: schema/migration/backfill; xử lý tên được sửa trong lúc backfill; cập nhật tên và key trong cùng transaction; mọi write path phải giữ invariant; version hóa thuật toán/runtime; tránh old/new Node ghi xen key khác semantics; cơ chế phát hiện/hoàn thành backfill và chuyển read atomically hoặc có policy chuyển tiếp đã duyệt. Lưu thêm dữ liệu, write/WAL/index overhead và kế hoạch rebuild khi thuật toán đổi. Không đề xuất tên field/status hoặc thêm migration trong lượt này.

Một B-tree trên key chỉ hỗ trợ loại truy vấn phù hợp, không tự tăng tốc contains `%q%` hoặc `strpos` [S7, S8]. Muốn thêm stored **sort key** để giải order là một thiết kế khác: ICU cảnh báo keys phụ thuộc version/attributes và phải regenerate khi đổi [S15]; chuẩn `Intl.Collator` đang dùng không cung cấp trực tiếp portable binary sort key. Không tự giả hai key trên đã giải toàn bài toán. Với scope hiện nay, không ưu tiên phương án3 vì thêm state ghi nhưng vẫn còn blocker order.

### Phương án4 — App chỉ lấy metadata, lọc/sắp IDs, rồi lấy rows của page

DB đọc **metadata đủ cho membership/tìm/sắp** (ví dụ ID, tên, mốc làm việc cần thiết), không phải toàn bộ ô chấm công. Node dùng nguyên comparator/lower/search hiện hành, tính ordered matched IDs/count, lấy lát25/50 ID rồi DB fetch cells/tổng hàng của các ID đó; global totals/invariant vẫn do DB toàn tháng. Giữ thứ tự IDs khi trả rows; `WHERE id IN (...)` tự nó không giữ thứ tự. Fullmonth/Excel dùng chung metadata comparator/order.

Ưu: giữ JS semantics trong chính runtime đó, giảm bài toán cross-engine parity; không render1.000 DOM rows, không tải toàn attendance về app. Ở1.000 người metadata có thể là chi phí chấp nhận được — đây là giả thuyết cần đo, không phải benchmark PASS.

Nhược: **vi phạm SQL ownership đã duyệt** (“không full list/snapshot về app rồi sort/slice”), dù payload về browser vẫn bounded. App đọc mọi metadata theo request/poll;1.000 là workload acceptance, chưa chắc là hard cap toàn bộ nhân sự có trong DB. Cần giới hạn/memory/byte budget và hành vi khi vượt, tránh một `LIMIT 1000` âm thầm bỏ người. CPU sort khoảng O(n log n), metadata transfer và giữ snapshot tăng theo n; chưa biết tác động thực.

Để nhất quán khi có rename/create/endDate đồng thời, metadata, bounded row fetch, count/totals và corruption check phải nằm trong cùng `READ ONLY REPEATABLE READ` snapshot/connection; không đọc metadata, trả pool rồi fetch rows bằng transaction khác. Giữ transaction qua đoạn xử lý Node cũng làm tăng thời gian giữ connection/snapshot; cache ngoài transaction cần thiết kế invalidation/version riêng, không tự thêm cache. PostgreSQL giải thích Read Committed cho mỗi statement snapshot mới, còn Repeatable Read giữ snapshot sau statement đầu [S6]. Bounded page không chứng minh bounded metadata snapshot hoặc DB aggregate.

Cần người dùng duyệt lại ownership/architecture và plan trước implementation. Đây là phương án thay thế có cơ sở nếu exact JS quan trọng hơn DB-only ownership và phép đo chứng minh chi phí phù hợp; không mô tả nó thành strawman “kéo tất cả attendance và1.000 dòng ra màn hình”.

### Phương án5 — PostgreSQL18 builtin Unicode/casefold và các extension

Đây là các công cụ khác nhau, không phải một gói fix Unicode:

- **PG18 builtin `PG_UNICODE_FAST` / collation `pg_unicode_fast`:** lower/upper dùng Unicode full case mapping, order theo code point, không theo thứ tự ngôn ngữ tiếng Việt. Release18 cập nhật dữ liệu Unicode16 [S2, S17]. Có thể đáng khảo sát nếu sau này chọn DB Unicode casing riêng với ICU `vi` order, nhưng khi đó đã tách hai policy. Chưa chứng minh khớp Node Unicode17 hoặc mọi JS locale lower; không thay `ORDER BY ... vi` bằng builtin codepoint order và gọi tương đương.
- **`casefold`:** nhằm caseless matching, khác chuyển sang chữ thường. Theo tài liệu, `ß` có thể thành `ss`, chiều dài thay đổi và có thể không giữ normalized form; libc provider thì casefold giống lower [S5]. Ví dụ q=`ss` có thể tìm tên chứa `ß` theo folding mà literal lowercase hiện tại không có. Không tự đổi `lower` thành `casefold`.
- **`unaccent`:** extension/dictionary có rules, bỏ dấu và còn mở rộng ligature như `Æ`→`AE` [S11]. Có thể phục vụ lựa chọn “nguyen tìm Nguyễn” sau thiết kế riêng; không tương đương locale lower, không giải thứ tự tiếng Việt, không tự khẳng định rules hiện có xử lý mọi dạng tổ hợp theo mong muốn. Cần quyền dependency/extension và kiểm dữ liệu đại diện.
- **`pg_trgm`:** GiST/GIN có thể index `LIKE/ILIKE` có wildcard đầu để tăng tốc contains. Dùng index cho literal `LIKE` không bắt buộc bật fuzzy; các operator similarity lại có semantics ngưỡng riêng [S10]. Nó không bổ sung Unicode lower/order còn thiếu, không đảm bảo query `strpos` hiện có được dùng index đó. Query ngắn hoặc `%`/`_` literal có thể không trích được trigram, thành full-index scan. Thêm extension/index có chi phí lưu trữ/ghi/build/maintenance;1.000 người chưa đủ lý do thêm trước benchmark.

**PG17 so với18, cần phân biệt đúng:** PG17 pattern matching không hỗ trợ nondeterministic collation; có thể lower theo ICU rồi áp deterministic `C` ở phép match [S1, S3]. PG18 `LIKE` hỗ trợ nondeterministic, nhưng `ILIKE`, `SIMILAR TO` và POSIX regex vẫn không hỗ trợ [S4]. PG18 còn thêm text position search với nondeterministic [S17]; nếu dùng trực tiếp có thể làm equivalence rộng hơn literal code point. “Được hỗ trợ” không đồng nghĩa giữ contract literal sau lower. Tiếp tục chọn collation match rõ ràng; không dùng case/accent-insensitive collation để vô tình khớp canonical/không dấu ngoài yêu cầu.

Không khuyến nghị nâng PG18 chỉ vì danh sách tính năng này. Nếu có lý do vận hành khác để nâng, cần đánh giá migration/runtime/Unicode/index như một quyết định có scope riêng.

## 4. Điều kiện truy vấn, phân trang và hiệu năng cho mọi hướng

**Literal substring:** bind parameter chống SQL injection không tự vô hiệu `%`/`_` trong `LIKE`. Hướng đơn giản là `strpos(lower_vi(name) COLLATE "C", lower_vi(q) COLLATE "C") > 0 OR strpos(id_text COLLATE "C", q COLLATE "C") > 0`, với lower_vi là policy được chọn, không phải hàm mới đã tồn tại. Query rỗng lấy toàn membership; trim/validation vẫn theo API8, không thay ECMAScript trim bằng SQL trim tùy tiện.

Nếu cần `LIKE` để dùng index thích hợp, escape **sau phép lower được chọn**, dùng explicit escape character. Ví dụ `ESCAPE '!'`: thay `!`→`!!`, `%`→`!%`, `_`→`!_`, rồi bọc `%...%`, bind pattern; backslash khi đó là ký tự thường trong parameter. Nếu chọn backslash làm escape, phải escape backslash trước (`\`→`\\`), rồi `%` và `_`; phân biệt escaping pattern với escaping SQL string literal và code ngôn ngữ host [S3]. Nhánh ID dùng q gốc đã trim và escape riêng, không dùng q đã lower. Đây là hướng thiết kế, chưa viết/chạy implementation.

**Order trước page:** DB-owned directions1/2/3 phải `ORDER BY name COLLATE <policy>, id ASC` trong SQL trước `LIMIT/OFFSET`. Tie ID phải ổn định/unique và cùng cách so ở page/fullmonth/Excel. Không `LIMIT` rồi app sort lại25 người; không dựa vào thứ tự vật lý/index TID. ICU nondeterministic có thể cho hai tên bằng nhau, nên ID tie vẫn bắt buộc [S1, S9]. Phương án4 phải thực hiện cùng thứ tự đầy đủ trên metadata trước slice và giữ nó khi fetch rows; chính thay đổi ownership đó cần approval.

**OFFSET và nhảy trang:** với pageSize25, đến trang40 dùng offset975 sau cùng membership/filter/order. Offset phải tính cả hàng bị bỏ qua, có thể đắt khi rất sâu [S9]. Keyset đi tiếp từ `(name,id)` có thể tiết kiệm phần skip nhưng không tự nhảy trực tiếp đến trang số bất kỳ nếu chưa có cursor/anchor hoặc phép dò phụ; đây là suy luận từ cơ chế truy vấn, không đo tại project. Không thay UX “Đến trang” đã duyệt bằng keyset chỉ vì thường được khuyến nghị. Mỗi request có snapshot riêng; stable order không khóa tập dữ liệu giữa các lần chuyển trang, rename/create vẫn có thể làm thay vị trí.

**Index:** B-tree khớp collation/order có thể giúp `ORDER BY ... LIMIT`, nhưng planner có thể chọn scan+sort khi phải đọc phần lớn dữ liệu [S18]. B-tree `lower(name)` hữu ích cho equality và loại prefix thích hợp, không tự giải arbitrary substring đầu `%` hoặc `strpos`; expression index có chi phí insert/non-HOT update [S7, S8]. Nondeterministic B-tree không dùng deduplication [S1]. Membership predicate, OR tên/ID, count, toàn tháng totals và offpage corruption check vẫn có thể chi phối cost dù page chỉ25 dòng. Chưa đề xuất migration/index cụ thể khi chưa có plan được duyệt và query plan đo thực.

**Quy mô:** acceptance20/200/1000 logical employees không chứng minh tốc độ DB, mạng, poll15s, export hoặc điện thoại. Chưa có benchmark trong nghiên cứu này, không có p95/latency/CPU/memory đo mới. Sau quyết định cần workload giả20/200/1000, query rỗng/có/không khớp/query ngắn/literal, page đầu/cuối/jump, rename concurrent, whole-month totals/export; đo query plan và end-to-end đúng gate. Tối ưu index/extension từ điểm nghẽn đo được. Không chạy benchmark/EXPLAIN/DB trong quyền nghiên cứu web này.

## 5. Nguồn web đã truy cập và phạm vi chứng minh

Tất cả nguồn dưới đây được đọc trực tiếp ngày01/11/2026 và trả HTTP200, không chỉ suy từ tài liệu local hoặc search snippet. Browser T3: `preview_status` báo chưa có tab → `preview_open` mở trang PG17 → snapshot/evaluate đọc trang và HTTP cùng origin. Các nguồn khác đọc bằng terminal HTTP vào bộ nhớ. Không có web-search tool; không cần search engine vì đã truy cập trực tiếp nguồn chính thức. HTTP200 chứng minh truy cập tài liệu, không chứng minh runtime có capability đó.

- **S1 — PostgreSQL17 Collation Support:** https://www.postgresql.org/docs/17/collation.html — locale/provider tham gia order và lower; deterministic thêm bytewise tie; nondeterministic/canonical forms, giới hạn pattern matching, B-tree deduplication và chi phí. Hỗ trợ phân tích policy, không chứng minh ICU67=Intl78.
- **S2 — PostgreSQL18 Collation Support:** https://www.postgresql.org/docs/18/collation.html — builtin `pg_unicode_fast` dùng full case mapping, codepoint order, UTF8; không phải Vietnamese order.
- **S3 — PostgreSQL17 Pattern Matching:** https://www.postgresql.org/docs/17/functions-matching.html — `%`/`_`, escape/default backslash, bind không thay pattern semantics; PG17 không hỗ trợ nondeterministic pattern matching.
- **S4 — PostgreSQL18 Pattern Matching:** https://www.postgresql.org/docs/18/functions-matching.html — `LIKE` hỗ trợ nondeterministic; `ILIKE`, `SIMILAR TO`, POSIX regex còn giới hạn. Không suy thành literal matching tương đương contract.
- **S5 — PostgreSQL18 String Functions:** https://www.postgresql.org/docs/18/functions-string.html — lower/casefold/normalization khác nhau; `ß`→`ss`, chiều dài và normalized form, libc fallback của casefold.
- **S6 — PostgreSQL17 Transaction Isolation:** https://www.postgresql.org/docs/17/transaction-iso.html — Read Committed snapshot theo statement; Repeatable Read snapshot chung từ statement đầu. Hỗ trợ thiết kế consistency phương án4, không chứng minh code đã giữ transaction.
- **S7 — PostgreSQL17 Index Types:** https://www.postgresql.org/docs/17/indexes-types.html — B-tree hỗ trợ pattern bắt đầu cố định, không `%bar`; locale/operator class có ảnh hưởng.
- **S8 — PostgreSQL17 Indexes on Expressions:** https://www.postgresql.org/docs/17/indexes-expressional.html — index `lower(col)` cho equality, chi phí tính biểu thức khi insert/non-HOT update; không hứa tăng tốc contains.
- **S9 — PostgreSQL17 LIMIT/OFFSET:** https://www.postgresql.org/docs/17/queries-limit.html — cần unique order; skipped rows vẫn tính, offset lớn có thể kém hiệu quả. Phần so với arbitrary page keyset là suy luận engineering ở mục4.
- **S10 — PostgreSQL17 pg_trgm:** https://www.postgresql.org/docs/17/pgtrgm.html — GiST/GIN cho similarity và `LIKE/ILIKE`, wildcard đầu, số trigram ảnh hưởng hiệu quả, không có trigram thành full-index scan. Không chứng minh cần extension ở1.000 người.
- **S11 — PostgreSQL17 unaccent:** https://www.postgresql.org/docs/17/unaccent.html — dictionary/rules và function bỏ dấu, mở rộng ligature, là extension; không tương đương lower tiếng Việt.
- **S12 — PostgreSQL17 ALTER COLLATION:** https://www.postgresql.org/docs/17/sql-altercollation.html — đổi collation có nguy cơ index sai; rebuild đối tượng phụ thuộc rồi refresh version; refresh không kiểm rebuild. URL thử đầu `https://www.postgresql.org/docs/17/altercollation.html` trả404; đã sửa URL đúng và đọc lại thành200, không coi lần404 là có nội dung.
- **S13 — Node24 Internationalization:** https://nodejs.org/docs/latest-v24.x/api/intl.html — Node dùng ICU, mặc định full data, có system/small/full ICU build khác nhau; không chứng minh binary Node hoặc PG thực tế đã đồng bộ. URL latest-v24.x là tài liệu nhánh có thể cập nhật, không phải attestation của24.22.1.
- **S14 — ECMA-402 Locale Lowercase và CompareStrings:** https://tc39.es/ecma402/#sup-string.prototype.tolocalelowercase và https://tc39.es/ecma402/#sec-collator-comparestrings — case transform có locale/tailoring/context; comparator phải tôn trọng canonical equivalence; không giả behavior giữ nguyên giữa versions dù cùng resolved options. Fragment `#sec-comparestrings` thử đầu không phải ID section hiện hành; đã tìm đúng fragment và đọc section.
- **S15 — ICU Collation Architecture, Versioning:** https://unicode-org.github.io/icu/userguide/collation/architecture.html#versioning — stored sort keys phụ thuộc algorithm/weights/data/attributes, phải regenerate khi nâng; version number tự nó không đủ bảo đảm. Hỗ trợ cảnh báo stored sort key, không cung cấp JS sort-key API cho project.
- **S16 — Unicode16 UnicodeData:** https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt — hai dòng `1C89;CYRILLIC CAPITAL LETTER TJE;...;1C8A;` và `1C8A;CYRILLIC SMALL LETTER TJE;...;1C89;...` xác nhận cặp hoa/thường. Không dùng để suy thứ tự tiếng Việt hoặc hiện trạng PG/Node.
- **S17 — PostgreSQL18 Release Notes:** https://www.postgresql.org/docs/18/release-18.html — thêm text-position nondeterministic, builtin Unicode full mapping, casefold, dữ liệu Unicode16. Không coi release note là migration/parity đã chạy.
- **S18 — PostgreSQL17 Indexes and ORDER BY:** https://www.postgresql.org/docs/17/indexes-ordering.html — B-tree có thể trả sorted output; lợi ích ORDER BY+LIMIT và tình huống scan+sort phù hợp hơn.

Một lượt trích nội dung qua Python gặp `UnicodeEncodeError` ở stdout Windows cp1252; đã đặt stdout UTF-8 rồi đọc lại đúng section để đối chiếu. Đây là lỗi công cụ hiển thị, không phải bằng chứng nguồn Unicode hoặc HTTP thất bại. Không giữ HTML tải về và không thực thi nội dung web.

## 6. Bàn giao và điều kiện quyết định tiếp

**Verified trong scope nghiên cứu:** đọc nguồn chính thức trực tiếp; đối chiếu đúng API8/design15/proposal hiện hành và fixture local; viết đề xuất docs riêng. **Suy luận/khuyến nghị:** phương án1 có đánh đổi tốt nhất nếu người dùng chấp nhận delta đã nêu; phương án4 có thể đủ nhẹ ở1.000 metadata; keyset không tự đáp ứng arbitrary jump. **Not run:** candidate discovery thực thi, download/install, DB/SQL/parity mới, benchmark, migration/backfill, route/browser sản phẩm/fullmonth/Excel integration. Không đổi trạng thái Failed/Blocked hoặc gọi review độc lập đã xong.

Main cần review nội dung/nguồn/semantics trên exact commit, trình lựa chọn mục1 với các ví dụ mục2, rồi ghi quyết định vào đúng nguồn sở hữu. Chọn1 cần approval đổi contract và plan/gate tương ứng; chọn2 cần quyền assessment runtime/harness cụ thể; chọn3/4/5 cần design/architecture/schema/extension approval tương ứng. Sau quyết định mới xác định quyền triển khai, kiểm acceptance và review độc lập. Trong lúc chưa quyết định, proposal cũ vẫn Pending, contract đã duyệt vẫn có hiệu lực và dependent SQL vẫn gated.
