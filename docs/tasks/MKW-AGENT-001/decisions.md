# Quyết định — MKW-AGENT-001

## 2026-10-23 — D01: Viết tài liệu trước cài đặt

Theo chỉ đạo mới nhất, chỉ triển khai bộ tài liệu nền tảng. Trạng thái cài đặt và pilot giữ Not installed/Not run, tránh đưa báo cáo khảo sát SellerFlow thành bằng chứng của Minh Khuê.

## 2026-10-23 — D02: Một nguồn quy tắc

AGENTS là entrypoint; quyền ở PERMISSIONS, vòng thực hiện ở EXECUTION_RULES, quality/review gate ở QUALITY_GATES, browser procedure ở BROWSER_TESTING. Các tài liệu khác liên kết về nguồn sở hữu, không chép thêm lifecycle.

## 2026-10-23 — D03: Bootstrap chưa có Git

Workspace chưa có Git. Task chỉ viết tài liệu trực tiếp tại workspace này, không tạo commit/worktree giả và không báo review theo SHA. Giai đoạn triển khai nền tảng cần tạo baseline trước task code/tooling.

## 2026-10-23 — D04: Catalog không đồng nghĩa đã cài

Ghi đủ bộ skill đã chọn, trạng thái và cách nghiệm thu. Phiên bản/commit upstream, mirror cho harness phụ và quyền công cụ cụ thể sẽ được xác minh ở task cài đặt. Không biến version SellerFlow thành pin của Minh Khuê.

## 2026-10-23 — D05: Hoàn thành tài liệu khác sẵn sàng vận hành

Task này có thể hoàn thành khi acceptance tài liệu đạt. Pilot/review độc lập/runtime/end-to-end là gate tiếp theo, phải giữ trạng thái chưa chạy cho đến khi có bằng chứng thật.
