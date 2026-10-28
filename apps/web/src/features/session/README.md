# Phiên web — Task3

`api/session.ts` dùng DTO sinh từ Nest; `model/session-runtime.ts` sở hữu identity, cache transition và expiry check qua DB/API. `model/session-context.tsx` lắp React subscription; `ui/login-page.tsx` giữ username, password chỉ trong input chưa controlled, xóa khi kết thúc submit, không log/persist credential. App providers sở hữu QueryClient và public `clearSessionCache(): void`.

Shared `SessionBoundary` là epoch trong memory: chuyển phiên hủy read đang chờ, chặn polling và ghi khi chưa xác thực; response epoch cũ không trả dữ liệu. Mutation tương lai phải giữ `expectedEpoch` của ý định đã được tạo trong phiên, không tự lấy epoch mới để replay. Server vẫn kiểm session và transaction fence độc lập. Query không retry401, mutation không retry; session login không retry tự động.

`registerSensitiveState` là seam cho draft Task7, hiện chỉ test sử dụng. Expiry xóa snapshot Query/mutation cache và dừng transport, giữ draft trong memory cùng owner; login cùng User không tự submit. Nếu User khác và dirty, app yêu cầu bỏ draft trước khi tiếp tục. Logout dirty gửi0 request đến khi xác nhận bỏ; sau logout thành công xóa draft/cache. Không hứa khôi phục sau reload hoặc đóng tab. Chưa có draft nhân sự/chấm công thật trong Task3.

Các test runtime dùng clock kiểm soát và deferred response; component dùng Testing Library cho form lỗi. Browser sandbox dùng build thật cùng CSP, API và PostgreSQL mới; viewport375px không là bằng chứng thiết bị thật. Native form controls kế thừa tokens C; bộ primitives shadcn/Radix đầy đủ thuộc Task6, chưa tạo trước consumer đó.
