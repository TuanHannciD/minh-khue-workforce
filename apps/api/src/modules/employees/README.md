# Nhân sự

`EmployeesController` là HTTP entry POST/PATCH; DTO/Swagger sở hữu wire contract. `EmployeesService` chuẩn hóa tên, kiểm mốc và CAS, rồi ghi trong transaction User → Employee; no-op được chấp nhận vẫn cấp revision mới. `EmployeesRepository` sở hữu SQL date-only và query bảo vệ ô xuyên mọi tháng.

Module khác chỉ dùng [index.ts](index.ts). `EmploymentConsistency.lockEmployees` khóa UUID sorted; `findExcludedCells` kiểm số/F/reminder-only mà không ghi/xóa ô. `readByIds` đọc đúng ID, không lọc membership và không khóa ghi; caller sở hữu transaction snapshot read-only. `LockedEmployee` là shape công khai, không phải Prisma entity. Không export repository.

`listForMonth` dùng interval intersection; `employment-date.ts` tính Gregorian/date-only/weekday bằng UTC getters tường minh. HTTP tháng/reconcile và attendance write thuộc Task5; schema ô ở migration002 chỉ phục vụ bảo vệ mốc ở Task4. Invariant liên bảng vẫn cần mọi writer attendance đi qua khóa Employee này.

Từ root worktree với Node24/pnpm12 theo [LOCAL_RUN](../../../../../docs/agent/LOCAL_RUN.md): `pnpm --filter @mkw/api build`, `pnpm --filter @mkw/api test`, `pnpm --filter @mkw/api test:employees`. Integration cần `MKW_EMPLOYEE_CLUSTER_OWNER` trỏ đúng cluster fake Task4 đã xác minh; mỗi lượt tạo DB UUID mới, không reset DB cũ. Suite kiểm migration auth upgrade, HTTP quyền/shape, protection, barriers CAS, snapshot và SQL/client readback.
