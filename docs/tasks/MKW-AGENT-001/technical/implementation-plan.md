# Kế hoạch — MKW-AGENT-001

## 1. Điểm vào và phân định nguồn

Tạo README, AGENTS, docs index, authority map và document routing. Quy tắc chỉ có một nơi sở hữu; báo cáo khảo sát là tài liệu tham khảo có mốc thời gian.

## 2. Phương pháp, quyền và công cụ

Viết execution rules, permissions, skill policy, skill usage matrix và tool capabilities. Không hardcode model/provider/port. Skill chưa cài và công cụ mới discovery phải có trạng thái riêng.

## 3. Kiểm chứng và thao tác thật

Viết quality gates và browser testing: T3 Browser, Playwright Test, fallback có điều kiện, môi trường thử riêng, assertion UI/API/persistence, debug và evidence.

## 4. Hồ sơ và readiness

Tạo task brief/handoff template, readiness theo năng lực, đường triển khai tiếp theo và hồ sơ task hiện tại. Ghi đúng giới hạn bootstrap chưa có Git/skill/app.

## 5. Kiểm tra trước bàn giao

- Node script đọc Markdown: link tương đối, anchor, code fence, UTF-8 và thông tin trạng thái cần có.
- Rà soát quy tắc quyền, review, fallback và nguồn tài liệu không mâu thuẫn.
- Kiểm tra đủ 15 skill Superpowers và 2 bộ UI đã chọn, gắn rõ chưa cài; specialist Minh Khuê giữ ở mức vai trò cho đến khi viết package, không sao chép danh sách 11 skill SellerFlow.
- Kiểm tra bốn báo cáo cũ còn nguyên hash.
- Cập nhật validation và INDEX với lệnh/kết quả thực, chưa thực hiện ghi Not run.

Đây là task tài liệu; không tạo test ứng dụng hoặc cài dependency để kiểm tra tài liệu.
