# MKW-AGENT-001 — Bộ tài liệu nền tảng AI Agent

Ngày bắt đầu: 23/10/2026. Trạng thái: Done — đầu ra tài liệu.

## Điểm tiếp tục

Người dùng đã duyệt đề xuất tổng kết và giao bắt đầu viết tài liệu. Đã viết và kiểm tra bộ quy tắc, skill/tool routing, workflow, template và điều kiện nghiệm thu. Chưa cài skill hay dựng ứng dụng; readiness vận hành vẫn chưa đạt.

- [Yêu cầu đã duyệt](approved/requirements.md)
- [Kế hoạch thực hiện](technical/implementation-plan.md)
- [Quyết định](decisions.md)
- [Kiểm chứng và bàn giao](validation.md)

## Ownership và phạm vi

- Writer: Agent chính trong phiên hiện tại; không có writer song song.
- Workspace: `D:/TinHoc/minh-khue-workforce`.
- Base: chưa có Git repository; bootstrap tài liệu trực tiếp được giới hạn trong thư mục này. Không có SHA để review theo commit.
- Chỉ tạo entrypoint, tài liệu nền tảng, template và hồ sơ task. Giữ nguyên bốn báo cáo khảo sát đang có.
- Mức rủi ro: tài liệu quy tắc có ảnh hưởng cách Agent vận hành về sau; cần kiểm tra nhất quán quyền và trạng thái. Không thay hành vi ứng dụng.
- Review route: tự rà soát tài liệu và kiểm tra cấu trúc trong task này. Review độc lập/pilot là gate của giai đoạn triển khai nền tảng, chưa thực hiện và không được ghi thành đã đạt.
- Tài nguyên: file local và kiểm tra Node đọc file; không acquire app server, port, DB, browser app hoặc child agent.
- Quyền hiện có: viết/kiểm tra bộ tài liệu theo phạm vi đã thống nhất. Cài đặt, Git bootstrap và pilot thuộc bước tiếp theo.

## Acceptance

1. Có cửa vào và một nguồn sở hữu cho từng nhóm quy tắc.
2. Mô tả đủ skill, MCP/plugin/công cụ, workflow và quyền.
3. Có quy trình debug UI và nghiệm thu luồng web–API–DB thật, phân biệt với fixture.
4. Có mẫu task/handoff và trạng thái tiếp tục rõ.
5. Link local đúng, UTF-8 hợp lệ, không tham chiếu nguồn chuẩn chưa tồn tại như đã có.
6. Trạng thái tài liệu, cài đặt và kiểm chứng được tách riêng.

## Next action

Không còn phần viết tài liệu bắt buộc của task này. Khi được giao triển khai tiếp: tạo task bootstrap/cài đặt và pilot theo [readiness](../../agent/READINESS.md), bắt đầu xác minh nguồn/version skill, Git baseline và quyền thực hiện. Không tự cài hoặc dispatch từ trạng thái Done này.
