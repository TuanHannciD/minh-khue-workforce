# Minh Khuê Workforce

Minh Khuê Workforce là sản phẩm chấm công đã được triển khai local theo đặc tả nghiệp vụ, kiến trúc và UI đã duyệt. Ứng dụng gồm web React/Vite, API Nest/Express và PostgreSQL/Prisma; dữ liệu nghiệp vụ, phiên đăng nhập, lưu chấm công, đồng bộ nhiều phiên và xuất Excel nằm trong phạm vi sản phẩm.

## Bắt đầu

- Đọc [AGENTS.md](AGENTS.md), [mục lục tài liệu](docs/INDEX.md) và [trạng thái readiness](docs/agent/READINESS.md).
- Đọc đặc tả và kế hoạch tại [MKW-PRODUCT-001](docs/tasks/MKW-PRODUCT-001/INDEX.md).
- Chạy local theo [hướng dẫn local](docs/agent/LOCAL_RUN.md).
- Vận hành và khôi phục theo [product runbook](docs/operations/product-runbook.md) và [backup/restore](docs/operations/product-backup-restore.md).

## Nền tảng hiện hành

- Web: React, Vite, TanStack Query 5.105.0.
- API: NestJS/Express, Prisma và PostgreSQL.
- Hợp đồng API: [API contracts](docs/architecture/API_CONTRACTS.md) và [OpenAPI](contracts/openapi.json).
- Quyết định nền tảng: [ADR-001](docs/architecture/decisions/ADR-001-product-foundation.md).
- Quy tắc UI, kiến trúc và quy ước code nằm trong [architecture](docs/architecture/ARCHITECTURE.md), [UI system](docs/architecture/UI_SYSTEM.md) và [code conventions](docs/architecture/CODE_CONVENTIONS.md).

## Trạng thái sử dụng

Các luồng chính đã có implementation và bằng chứng local cho đăng nhập, session, nhân sự, chấm công, lưu/đọc lại, xử lý cạnh tranh và xuất Excel. Các kết quả kiểm tra chi tiết, giới hạn và trạng thái từng gate nằm trong [validation](docs/tasks/MKW-PRODUCT-001/validation.md) và [READINESS](docs/agent/READINESS.md).

Sản phẩm chưa được gọi là Done hoặc production-ready. G3 và các gate phát hành liên quan vẫn mở; native phone, screen reader và một số kiểm tra hiệu năng chuyên sâu chưa chạy hoặc chưa đạt. Không dùng kết quả benchmark/heap cũ để thay thế readiness nghiệp vụ.

## Deploy production

PA1 đã chuyển Docker data-root trên server sang `/home/docker`; FormAuto, Cashback và Sellerflow vẫn chạy healthy, còn `/var/lib/docker` được giữ trong rollback window. Artefact deploy MKW nằm trong [deploy](deploy/), gồm Compose độc lập project `mkw`, gateway `127.0.0.1:3200`, Dockerfile và [GitHub Actions workflow](.github/workflows/deploy.yml).

Workflow hỗ trợ `dry-run`, `bootstrap` và `release` qua GitHub Environment `production`. Bootstrap tự tạo secret runtime trên server; release yêu cầu image digest bất biến, backup gate, health và smoke evidence. Domain Cloudflare chưa cần để chạy kiểm tra nội bộ và sẽ gắn sau khi stack đạt readiness.

Release thật hiện còn phụ thuộc image GHCR/digest, manifest phát hành, backup gate và xác minh Bash/build trên runner Ubuntu. Không chạy `release` khi các điều kiện này chưa đạt.

## Phương pháp và nguồn chuẩn

Superpowers là phương pháp chính; tài liệu tiếng Việt là nguồn chuẩn của project. Bằng chứng, báo cáo lịch sử và raw evidence được giữ riêng; trạng thái `Failed`, `Not run` hoặc `Blocked` không được đổi thành `PASS` chỉ để rút gọn tài liệu.
