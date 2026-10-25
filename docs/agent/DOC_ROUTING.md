# Chọn tài liệu theo task

Mặc định: [AGENTS](../../AGENTS.md) → [AUTHORITY_MAP](AUTHORITY_MAP.md) → hồ sơ task hiện có. Sau đó chỉ thêm phần cần thiết bên dưới. Không đọc toàn bộ docs/skill cho mỗi việc.

| Loại việc | Đọc thêm |
| --- | --- |
| Nhận/tiếp tục/bàn giao task | [EXECUTION_RULES](EXECUTION_RULES.md), [HANDOFF](../templates/HANDOFF.md) khi chuyển phiên |
| Phạm vi, quyền, cài đặt, remote | [PERMISSIONS](PERMISSIONS.md) |
| Chọn/cài/cập nhật skill | [SKILL_POLICY](SKILL_POLICY.md), [SKILL_USAGE_MATRIX](../../SKILL_USAGE_MATRIX.md), [READINESS](READINESS.md) |
| Dùng MCP/plugin/tool/model | [TOOL_CAPABILITIES](TOOL_CAPABILITIES.md), quyền liên quan và schema runtime |
| Viết/sửa source hoặc tooling | Plan đã duyệt, [QUALITY_GATES](QUALITY_GATES.md); với sản phẩm đọc [ARCHITECTURE](../architecture/ARCHITECTURE.md), [CODE_CONVENTIONS](../architecture/CODE_CONVENTIONS.md) và module/contract liên quan |
| UI/UX hoặc thao tác browser | [UI_SYSTEM](../architecture/UI_SYSTEM.md), [BROWSER_TESTING](BROWSER_TESTING.md), nhóm UI trong skill matrix, thiết kế hiện hành khi có |
| Lỗi | Evidence hiện có, skill debugging khi đã cài, quality gate liên quan; mở rộng source/log theo giả thuyết |
| DB/API | Yêu cầu đã duyệt, [API_CONTRACTS](../architecture/API_CONTRACTS.md), [ARCHITECTURE](../architecture/ARCHITECTURE.md) và contract/schema cụ thể khi có; chưa có thì làm rõ, không suy từ báo cáo khảo sát |
| Chỉ sửa tài liệu | Nguồn sở hữu cần sửa, quyền/phạm vi và check tài liệu trong QUALITY_GATES |
| Hỏi mức sẵn sàng hoặc chuẩn bị pilot | [READINESS](READINESS.md), validation đúng checkpoint |

Mở báo cáo SellerFlow chỉ khi cần rationale/provenance. Gặp thiếu tài liệu ảnh hưởng tính đúng phải ghi thiếu và xử lý tại nguồn; không tạo placeholder rồi coi như đã có quyết định.
