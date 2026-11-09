# Nghiên cứu immutable CI/CD — 2026-11-09

## Phạm vi và phương pháp

Đối chiếu semantics cần thiết cho GitHub Actions, Buildx/GHCR, PostgreSQL dump/restore và Docker Compose healthcheck. Trong phiên này không có công cụ web/search khả dụng; tra cứu trực tiếp là **Not run/Blocked**. Báo cáo này không claim các URL đã được đọc.

## Nguồn chính thức cần tra cứu

- GitHub Actions workflows, permissions, artifacts, environments, concurrency và attestations: https://docs.github.com/actions
- Docker Buildx build/push và digest outputs: https://github.com/docker/build-push-action
- GitHub Container Registry: https://docs.github.com/packages/working-with-a-github-packages-registry
- PostgreSQL `pg_dump`/`pg_restore`: https://www.postgresql.org/docs/current/backup-dump.html
- Docker Compose healthcheck/config: https://docs.docker.com/compose/

## Kết luận có thể dùng từ repository

Manifest phải dùng full commit SHA và image digest; deploy nhận artifact cụ thể, không lookup mutable tag. Backup-ready phải chứng minh restore vào DB tạm và giữ checksum/size. Migration chỉ forward; rollback ứng dụng dùng manifest cũ, schema không tương thích thì restore DB mới và approval cutover. Protected environment, least privilege, concurrency và secret-safe receipts là policy cần giữ.

## Giới hạn

Chưa xác minh phiên bản action/provider, attestation enforcement, storage/key-management SLA hoặc production topology. Các mục đó vẫn Pending/Not run và cần review độc lập trước triển khai thật.
