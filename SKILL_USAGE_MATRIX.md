# Chọn skill theo công việc

15 Superpowers, 2 bộ UI và skill vận hành MKW dưới đây đã cài project-local tại `.agents/skills/`. Nguồn/pin/override ở [SKILL_POLICY](docs/agent/SKILL_POLICY.md); mức kiểm chứng tại [READINESS](docs/agent/READINESS.md). Chỉ load phần cần cho task. Khi runtime chưa tự liệt kê, đọc trực tiếp `.agents/skills/<tên>/SKILL.md`; việc đọc file không chứng minh auto-discovery.

## Superpowers — 15 skill

| Nhu cầu | Skill |
| --- | --- |
| Bắt đầu và chọn skill theo harness | `using-superpowers` |
| Khám phá nhu cầu/phương án/thiết kế | `brainstorming` |
| Lập kế hoạch thực hiện | `writing-plans` |
| Agent chính tự thực hiện kế hoạch | `executing-plans` |
| Triển khai có child agent, khi được phép | `subagent-driven-development` |
| Phân việc độc lập có thể song song, khi được phép | `dispatching-parallel-agents` |
| Điều tra lỗi trước khi sửa | `systematic-debugging` |
| Test hành vi quan trọng trước/sau thay đổi | `test-driven-development` |
| Chuẩn bị và yêu cầu review | `requesting-code-review` |
| Đánh giá/xử lý phản hồi review | `receiving-code-review` |
| Kiểm chứng trước tuyên bố hoàn thành | `verification-before-completion` |
| Kết thúc nhánh, giữ/tích hợp/cleanup theo quyền | `finishing-a-development-branch` |
| Cách ly checkout | `using-git-worktrees` |
| Tạo/sửa skill trong task được giao | `writing-skills` |
| Phân tích quy trình Agent vận hành sai/kém hiệu quả | `diagnosing-superpowers` |

## UI/UX — 2 bộ

- `impeccable`: thiết kế, audit và hoàn thiện UI chính. Đọc brief/design authority, kiểm tra browser theo scope; giữ identity nếu task không duyệt redesign.
- `ui-ux-pro-max`: tra cứu một nhu cầu cụ thể về UX, typography, palette, component/stack. Kết quả là tham khảo, không thay brief hay rule.

Sinh ảnh là khả năng bổ sung theo task tài sản bitmap, không là bước bắt buộc của UI. Skill UI không chứng minh có browser; thao tác thật theo [BROWSER_TESTING](docs/agent/BROWSER_TESTING.md).

## Vận hành server Minh Khuê

| Nhu cầu | Skill | Khi dùng |
| --- | --- | --- |
| Kiểm tra/diagnose VPS, Docker, MKW deploy, GitHub Actions release hoặc Cloudflare origin mà không thay đổi production | `mkw-server-debugger` ([SKILL.md](.agents/skills/mkw-server-debugger/SKILL.md)) | Khi cần health/read-only checks, phân loại lỗi kết nối, kiểm tra `/home/docker`, `/home/mkw`, gateway `3200`, container/volume metadata hoặc release evidence |

Skill này giữ ranh giới read-only, không dùng `sudo`, không đọc secret và không tự deploy/restart/migrate/backup/restore. Khi cần mutation, phải chuyển sang runbook và quyền riêng.

## Specialist Minh Khuê — thiết kế vai trò, chưa tạo SKILL.md

| Vai trò dự kiến | Bổ sung cho | Nguồn cần có |
| --- | --- | --- |
| Phân tích yêu cầu | brainstorming | Ý định người dùng, actor, acceptance |
| Kế hoạch/ownership | writing-plans | Phạm vi, module/kiến trúc hiện hành khi có |
| Tài liệu chuẩn | task tài liệu | Authority map, quyết định và quyền đã có |
| Review project | requesting/receiving-code-review | Yêu cầu, rule, base/tip hoặc snapshot |
| Module/API/contract | thiết kế/triển khai/review | Source và contract đã duyệt khi có |
| Kiến trúc/rủi ro DB | thiết kế/review | Schema, lifecycle dữ liệu và migration khi có |
| HTTP behavior | debugging/verification | Target sandbox, contract, ownership |
| Chẩn đoán server | debugging | Quyền target cụ thể; bổ sung khi có vận hành |

Không cần tạo một skill cho từng vai trò nếu tài liệu và routing đã đủ. Tên package/số lượng specialist sẽ được xác định khi viết skill thật; không đặt nhiều lớp orchestration.
