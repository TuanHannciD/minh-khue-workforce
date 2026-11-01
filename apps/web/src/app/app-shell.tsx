import { Button } from "@/shared/ui/button";
import { useEffect, useState } from "react";
import { EmployeeDraft, EmployeeForm } from "@/features/employees/index";
import { LoginPage, useSession } from "@/features/session/index";
import {
  AttendanceDraft,
  AttendanceWorkspace,
  invalidateAttendanceScope,
} from "@/features/attendance/index";
import type { Employee } from "@/features/employees/index";
import { ConfirmDiscard } from "@/shared/ui/confirm-discard";

export function AppShell() {
  const { status, session, runtime } = useSession();
  const [employeeDraft] = useState(() => new EmployeeDraft());
  const [attendanceDraft] = useState(
    () => new AttendanceDraft(runtime.boundary),
  );
  const [nextEmployee, setNextEmployee] = useState<{
    employee: Employee;
    userId: string;
    epoch: number;
  } | null>(null);
  useEffect(() => employeeDraft.connect(runtime), [employeeDraft, runtime]);
  useEffect(() => attendanceDraft.connect(runtime), [attendanceDraft, runtime]);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout(discard = false) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const done = await runtime.logout(discard);
      setConfirmLogout(!done);
    } catch {
      setError("Chưa thể đăng xuất. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }
  if (status === "loading")
    return (
      <main className="session-layout">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  if (status === "unavailable")
    return (
      <main className="session-layout">
        <h1>Chưa thể kiểm tra phiên</h1>
        <p role="alert">Vui lòng kiểm tra kết nối rồi thử lại.</p>
        <Button
          onClick={() => {
            void runtime.refresh();
          }}
        >
          Thử lại
        </Button>
      </main>
    );
  if (status === "anonymous" || status === "expired") return <LoginPage />;
  if (status === "account-change")
    return (
      <main className="session-layout">
        <h1>Tài khoản đã thay đổi</h1>
        <p role="alert">
          Bản nháp thuộc tài khoản trước. Bỏ bản nháp trước khi tiếp tục với tài
          khoản mới.
        </p>
        <Button
          className="primary"
          onClick={() => runtime.confirmAccountChange()}
        >
          Bỏ bản nháp và tiếp tục
        </Button>
        <Button
          onClick={() => {
            void logout(true);
          }}
          disabled={pending}
        >
          Đăng xuất
        </Button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <main className="session-layout">
      <header className="session-header">
        <h1>Minh Khuê</h1>
        <Button
          disabled={pending}
          onClick={() => {
            void logout();
          }}
        >
          {pending ? "Đang đăng xuất…" : "Đăng xuất"}
        </Button>
      </header>
      <p role="status">
        Đã đăng nhập với tài khoản <strong>{session?.user.username}</strong>.
      </p>
      {confirmLogout && (
        <section aria-label="Xác nhận đăng xuất">
          <p>Bạn đang có bản nháp chưa lưu.</p>
          <Button onClick={() => setConfirmLogout(false)}>
            Tiếp tục chỉnh sửa
          </Button>
          <Button
            onClick={() => {
              void logout(true);
            }}
          >
            Bỏ bản nháp và đăng xuất
          </Button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <EmployeeForm
        draft={employeeDraft}
        onSaved={() => {
          if (session)
            void invalidateAttendanceScope(
              runtime.queryClient,
              session.user.userId,
              runtime.boundary.current(),
            );
        }}
      />
      {nextEmployee &&
        nextEmployee.userId === session?.user.userId &&
        runtime.boundary.canWrite(nextEmployee.epoch) && (
          <ConfirmDiscard
            title="Đổi nhân sự khi có bản nháp"
            keepLabel="Giữ form nhân sự"
            discardLabel="Bỏ bản nháp và sửa nhân sự này"
            onKeep={() => setNextEmployee(null)}
            onDiscard={() => {
              if (runtime.boundary.canWrite(nextEmployee.epoch))
                employeeDraft.select(nextEmployee.employee);
              setNextEmployee(null);
            }}
          >
            <p>
              Form nhân sự có bản nháp. Giữ phần nhập hoặc bỏ trước khi sửa ID{" "}
              {nextEmployee.employee.id}. Bỏ bản nháp không hủy yêu cầu đã gửi.
            </p>
          </ConfirmDiscard>
        )}
      <AttendanceWorkspace
        draft={attendanceDraft}
        onEmployee={(employee) => {
          if (employeeDraft.dirty())
            setNextEmployee({
              employee,
              userId: session?.user.userId ?? "",
              epoch: runtime.boundary.current(),
            });
          else employeeDraft.select(employee);
        }}
      />
    </main>
  );
}
