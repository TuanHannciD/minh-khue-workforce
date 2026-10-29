# Chấm công — API Task5

`AttendanceController` bảo vệ cả ba route bằng session guard. `attendance-validation.ts` kiểm JSON gốc đệ quy (unknown fields, discriminator, missing/null, UUID/date/month, key trùng và scope); không convert chuỗi số. `attendance.dto.ts` sở hữu DTO/Swagger và các nhánh OpenAPI theo loại bảng. `openapi.ts` gắn union/minProperties; chỉ sinh snapshot/types bằng `product:contract:generate`.

`AttendanceService.write` là use case chung cho patch một ô, reminder và batch/fill nội dung. Transaction READ COMMITTED đi qua public SessionAuthorizer → EmploymentConsistency, khóa User → Employee UUID sorted; kiểm mọi employee/editable target/source CAS trước khi xét eligible/no-op. Repository ghi eligible theo key sorted, giữ tombstone và cấp revision mới cả no-op. Source, N/—, ô có nội dung bị fill-empty loại và eligible=0 không có write/fence. Attendance không tăng Employee revision. Không có mutex Node hoặc retry mutation.

`readMonth` và `reconcile` dùng READ ONLY REPEATABLE READ, không gọi khóa ghi/authorizeMutation. Projection giữ tombstone ngoài interval và fail an toàn nếu dữ liệu ngoài mốc bất nhất. Reconcile đọc đúng union ID/key, không phụ thuộc membership tháng; missing khác lỗi DB. `attendance-values.ts` chuẩn hóa nửa đơn vị; `attendance-totals.ts` cộng nửa đơn vị nguyên, reminder không ảnh hưởng tổng.

Từ root worktree, Node24/pnpm12 theo [LOCAL_RUN](../../../../../docs/agent/LOCAL_RUN.md): `pnpm --filter @mkw/api build`, `pnpm --filter @mkw/api test`, `pnpm --filter @mkw/api test:attendance`. Integration cần `MKW_ATTENDANCE_CLUSTER_OWNER` trỏ cluster Task5 fake đã kiểm identity; mỗi suite tạo DB UUID mới, không reset/drop DB cũ.

Test map: `attendance.integration.test.mjs` kiểm HTTP shape/patch/batch/reconcile và MonthDto56 ô; `attendance-fixtures.integration.test.mjs` kiểm bốn fixture write đầy đủ/boundaries/calendar/readback/deploy giữ dữ liệu; `attendance-concurrency.integration.test.mjs` kiểm CAS/no-op/skip/source/rollback và gọi `attendance-races.mjs` cho race mốc/session/snapshot/response loss. Barrier nằm trong test helper, không có test hook sản phẩm. Unit/contract kiểm fixtures thực với runtime/OpenAPI và TypeScript generated.

Không có UI attendance, polling/draft/recovery UI hoặc Excel trong Task5. AC12/13/15 toàn luồng vẫn cần hai phiên UI/task sau và review độc lập đúng SHA do main điều phối.
