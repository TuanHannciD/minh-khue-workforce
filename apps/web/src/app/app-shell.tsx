import { useEffect, useState } from "react";
import { EmployeeDraft, EmployeeForm } from "@/features/employees/index";
import { LoginPage, useSession } from "@/features/session/index";

export function AppShell() {
  const { status, session, runtime } = useSession();
  const [employeeDraft] = useState(() => new EmployeeDraft());
  useEffect(() => employeeDraft.connect(runtime), [employeeDraft, runtime]);
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
        <button
          onClick={() => {
            void runtime.refresh();
          }}
        >
          Thử lại
        </button>
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
        <button
          className="primary"
          onClick={() => runtime.confirmAccountChange()}
        >
          Bỏ bản nháp và tiếp tục
        </button>
        <button
          onClick={() => {
            void logout(true);
          }}
          disabled={pending}
        >
          Đăng xuất
        </button>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <main className="session-layout">
      <header className="session-header">
        <h1>Minh Khuê</h1>
        <button
          disabled={pending}
          onClick={() => {
            void logout();
          }}
        >
          {pending ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </header>
      <p role="status">
        Đã đăng nhập với tài khoản <strong>{session?.user.username}</strong>.
      </p>
      {confirmLogout && (
        <section aria-label="Xác nhận đăng xuất">
          <p>Bạn đang có bản nháp chưa lưu.</p>
          <button onClick={() => setConfirmLogout(false)}>
            Tiếp tục chỉnh sửa
          </button>
          <button
            onClick={() => {
              void logout(true);
            }}
          >
            Bỏ bản nháp và đăng xuất
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <EmployeeForm draft={employeeDraft} />
    </main>
  );
}
