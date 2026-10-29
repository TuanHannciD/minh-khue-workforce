# Form nhân sự

`ui/employee-form.tsx` dùng RHF/Zod, labels/lỗi/keyboard và tokens từ UI C; `api/employees.ts` dùng generated DTO qua transport có session boundary, không retry mutation. Field rỗng ngày kết thúc serialize thành null; submit chủ ý gửi field tường minh kể cả no-op.

`EmployeeDraft` do app giữ trong memory, riêng với RHF mounted fields và membership tháng. Baseline giữ ID/revision, không tự rebase từ lỗi409 hoặc snapshot; account expiry giữ draft, account switch/logout qua `SessionRuntime` xóa state theo owner. Không persist URL/localStorage. Form remount giữ draft/ID dù người đã ra khỏi tháng; reload toàn trang không khôi phục draft.

422 hiển thị đúng ID/ngày/loại cần xử lý, giữ toàn draft;409 hiển thị current cạnh draft và khóa submit; mất response/5xx/session-transition giữ trạng thái chưa xác định, khóa Lưu/Hủy. Task7 thêm đối chiếu HTTP và intent mới theo phần Recovery dưới. `EmployeeDraft.clear` chỉ được dùng theo lifecycle/discard đã được chủ ý; clear không hủy write đã gửi.

AppShell lắp form tạo mới và chọn người từ bảng tháng; sau POST thành công giữ ID để chỉnh sửa tiếp. Public [index.ts](index.ts) xuất form/draft/Employee; không import sâu từ app/module khác.

Kiểm: `pnpm --filter @mkw/web test --run src/features/employees/ui/employee-form.test.tsx` trên runtime product theo LOCAL_RUN. Component tests dùng fake API outcomes; browser sandbox Task4 kiểm riêng built React → Nest → PostgreSQL thật với fake accounts/cells.

## Recovery Task7

AppShell chọn ID từ bảng tháng để sửa cùng EmployeeDraft. `ui/employee-recovery.tsx` dùng shared generated reconcile adapter: PATCH mất response vẫn đối chiếu ID ngoài membership; missing khác DB error, giữ raw/baseline. Sau lựa chọn tường minh gửi PATCH đủ tên/mốc với revision vừa đọc, kể cả no-op; read không fence. Pending chặn gửi trùng, capture session epoch trước request; generation/epoch loại late response và account switch không gửi old intent.

Create mất response chưa có ID: khóa gửi lại, không dedupe/nhận diện theo tên và không hứa exactly-once. Người dùng tải lại bảng, tự xác định ID rồi nhập/chọn rõ để reconcile trước PATCH mới. Dirty create chưa từng gửi sau same-user reauth có nút tiếp tục riêng; không dùng đường này cho unknown create. `employee-recovery.test.ts` và product E2E kiểm hai trường hợp; không thêm endpoint/idempotency contract.
