# Form nhân sự

`ui/employee-form.tsx` dùng RHF/Zod, labels/lỗi/keyboard và tokens từ UI C; `api/employees.ts` dùng generated DTO qua transport có session boundary, không retry mutation. Field rỗng ngày kết thúc serialize thành null; submit chủ ý gửi field tường minh kể cả no-op.

`EmployeeDraft` do app giữ trong memory, riêng với RHF mounted fields và membership tháng. Baseline giữ ID/revision, không tự rebase từ lỗi409 hoặc snapshot; account expiry giữ draft, account switch/logout qua `SessionRuntime` xóa state theo owner. Không persist URL/localStorage. Form remount giữ draft/ID dù người đã ra khỏi tháng; reload toàn trang không khôi phục draft.

422 hiển thị đúng ID/ngày/loại cần xử lý, giữ toàn draft;409 hiển thị current cạnh draft và khóa submit; mất response/5xx/session-transition giữ trạng thái chưa xác định, khóa Lưu/Hủy. Đọc đối chiếu HTTP và luồng chủ ý tạo intent mới còn staged Task5/7, không bịa endpoint để giả recovery. `EmployeeDraft.clear` chỉ được dùng theo lifecycle/discard đã được chủ ý; clear không hủy write đã gửi.

AppShell lắp form tạo mới; sau POST thành công giữ ID để chỉnh sửa tiếp. Chọn người từ bảng tháng thuộc consumer Task6/7. Public [index.ts](index.ts) xuất form/draft/Employee; không import sâu từ app/module khác.

Kiểm: `pnpm --filter @mkw/web test --run src/features/employees/ui/employee-form.test.tsx` trên runtime product theo LOCAL_RUN. Component tests dùng fake API outcomes; browser sandbox Task4 kiểm riêng built React → Nest → PostgreSQL thật với fake accounts/cells.
