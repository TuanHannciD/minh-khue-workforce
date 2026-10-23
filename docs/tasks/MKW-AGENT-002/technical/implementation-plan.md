# Plan — MKW-AGENT-002

Thực hiện inline theo phạm vi đã duyệt; review/Agent mới dùng khi kiểm chứng. Rule project về review tip mới, quyền và bảo toàn evidence ưu tiên hướng dẫn upstream khác biệt.

## Task 1: Git và skill

Baseline toàn bộ tài liệu, branch/worktree bootstrap riêng. Cài 15 Superpowers từ commit ghim qua installer; UI lấy snapshot local SellerFlow có manifest/license/hash được kiểm tra, không copy domain/global config. Checker nguồn độc lập trong project. Ghi provenance trung thực; dùng skill sau khi đọc.

## Task 2: Tooling và sandbox

Node local + dependency Playwright và SQLite phù hợp Node 22 hiện có. UI/API mẫu lưu ghi chú giả; bind loopback, giới hạn request, idempotency và atomic writes. Test trước implementation: lưu bền/retry/concurrent/error/validation. Harness cấp port ngẫu nhiên/task-owned, report theo run không đè; process group/resource được giải phóng. Không gắn cứng app SellerFlow.

## Task 3: Browser và regression

Discovery T3 status/open; nếu unavailable theo lỗi runtime thì Playwright CLI fallback. Browser thực thao tác form, reload, request/error/retry, desktop/mobile/keyboard, assert persistence bằng API/DB. Lưu report và screenshot dữ liệu giả. RED lỗi có kiểm soát riêng → GREEN không che retry.

## Task 4: Review và resume

Commit candidate để reviewer đọc immutable base..tip. Agent ngữ cảnh mới đọc hồ sơ/skill và tiếp tục một checkpoint kiểm chứng, không dùng toàn transcript. Reviewer độc lập rà nguồn, ownership, security, thật/giả evidence và phạm vi. Sửa findings và review tip mới khi cần.

## Task 5: Bàn giao

Cập nhật rule entrypoint/readiness/capabilities theo trạng thái thật, hướng dẫn chạy được, giữ evidence. Check cuối và tích hợp local fast-forward candidate đã review; giữ task branch/evidence, không xóa checkout nếu có dữ liệu cần giữ. Không remote/push/deploy.

## Review focus

Skill byte/license và provenance; không claim auto-discovery/recovery nếu mới đọc file. Process/DB/port thuộc task, không kill foreign. Bind loopback, request size/validation/idempotency/concurrency, DB path an toàn. Browser test dùng API thật không intercept/mock; dữ liệu tồn tại sau reload. Không cài global/ẩn lỗi hoặc dùng test xanh thay quyền.

## Ledger

Pre-flight: Task 1 cung cấp skill/checker cho 2; Task 2 cung cấp API/storage/server lifecycle cho 3; immutable commit và evidence của 1–3 là đầu vào 4; Task 5 chỉ bàn giao scope đã kiểm chứng. Chưa có shared interface mâu thuẫn đã biết. Lựa chọn pilot không quyết định stack sản phẩm.
