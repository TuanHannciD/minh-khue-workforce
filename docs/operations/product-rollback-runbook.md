# Rollback runbook

Rollback cần protected approval và manifest cũ cụ thể. Kiểm checksum/schema, backup-ready, target identity và image digests trước thao tác.

1. Dừng release mới hoặc đưa traffic vào maintenance theo quyết định vận hành.
2. Dispatch workflow rollback từ revision hiện hành đã được tin cậy trên `main`; nhập SHA/run artifact cũ. Workflow checkout `github.sha` của lần dispatch để dùng compose, entrypoint và validators hiện hành; không checkout control scripts từ `old_release_sha`. Giữ `controlSha` trong runner receipt cùng manifest cũ.
3. Chọn manifest cũ tương thích với schema hiện tại. Guard dưới deploy lock đọc container PostgreSQL đang chạy theo Compose project/service labels và so digest với manifest cũ. Thiếu container, nhiều container, image mutable, container dừng hoặc digest khác đều fail trước render/compose mutation. Không đổi PostgreSQL runtime để làm application rollback.
4. Khi digest PostgreSQL trùng, redeploy exact API/Web digests cũ bằng `--no-deps`; giữ DB container hiện tại. Forward migration gate hiện có vẫn chạy; operator phải xác nhận application cũ tương thích với schema hiện tại trong reason. Đây là điều kiện vận hành, không phải kiểm chứng compatibility tự động.
5. Chạy health, smoke và post-deploy verification; giữ cả runner receipt và server receipt. Scope là `application-only`, `databaseRecovery: false`; không claim restore dữ liệu. Required attestation của old manifest vẫn phải verify trước SSH; release cũ chưa có attestation sẽ bị chặn ở mode này.
6. Nếu database không tương thích hoặc cần đổi PostgreSQL runtime, dừng route application rollback. Restore backup vào database mới, verify và cutover chỉ theo approval/route phục hồi riêng; workflow này không thực hiện restore hoặc down migration.

Release trước Task3 vẫn dùng control tooling hiện hành khi rollback theo workflow mới. Receipt lịch sử do entrypoint cũ tạo có thể thiếu operation/attestation/rollback fields; không suy diễn chúng đã verify. Nếu dispatch chính workflow revision cũ thì chưa có các guard mới: không dùng route đó để claim application-only an toàn.

Không tự rollback khi verification thất bại và không in secret vào log.
