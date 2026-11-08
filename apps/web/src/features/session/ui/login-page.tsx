import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "@/shared/api/transport";
import { useSession } from "../model/session-context";

export function LoginPage() {
  const { runtime, status } = useSession();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await runtime.login({
        username,
        password: password.current?.value ?? "",
      });
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Chưa thể kết nối. Vui lòng thử đăng nhập lại.",
      );
    } finally {
      if (password.current) password.current.value = "";
      setPending(false);
    }
  }
  return (
    <main className="login-layout">
      <div className="brand">Minh Khuê</div>
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title">Đăng nhập</h1>
        <p className="muted">Sử dụng tài khoản đã được cấp để tiếp tục.</p>
        {status === "expired" && (
          <p role="status">
            Phiên đã hết hạn. Đăng nhập lại bằng cùng tài khoản để tiếp tục bản
            nháp.
          </p>
        )}
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          aria-busy={pending}
        >
          <label htmlFor="username">Tên đăng nhập</label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            required
            maxLength={64}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={pending}
          />
          <label htmlFor="password">Mật khẩu</label>
          <Input
            ref={password}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            aria-describedby={error ? "login-error" : undefined}
            disabled={pending}
          />
          {error && (
            <p id="login-error" role="alert" className="error">
              {error}
            </p>
          )}
          <Button className="primary" type="submit" disabled={pending}>
            {pending ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>
        </form>
        <p className="login-help muted">
          Quên mật khẩu? Liên hệ người phụ trách vận hành để được xác minh và
          đặt lại.
        </p>
      </section>
    </main>
  );
}
