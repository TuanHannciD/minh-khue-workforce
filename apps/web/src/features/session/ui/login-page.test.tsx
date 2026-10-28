// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { LoginPage } from "./login-page";
import { SessionProvider } from "../model/session-context";
import { SessionRuntime } from "../model/session-runtime";
import { SessionBoundary } from "@/shared/api/session-boundary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("login error retains username, clears password, and never retries authentication or logs credentials", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Tên đăng nhập hoặc mật khẩu chưa đúng.",
          },
          requestId: "fixture",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const log = vi.spyOn(console, "log"),
    error = vi.spyOn(console, "error");
  const runtime = new SessionRuntime(new QueryClient(), new SessionBoundary());
  render(
    <SessionProvider runtime={runtime}>
      <LoginPage />
    </SessionProvider>,
  );
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Tên đăng nhập"), "fixture-one");
  await user.type(screen.getByLabelText("Mật khẩu"), "fixture-secret-only");
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Tên đăng nhập hoặc mật khẩu chưa đúng.",
  );
  expect(screen.getByLabelText("Tên đăng nhập")).toHaveProperty(
    "value",
    "fixture-one",
  );
  expect(screen.getByLabelText("Mật khẩu")).toHaveProperty("value", "");
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(
    JSON.stringify([...log.mock.calls, ...error.mock.calls]),
  ).not.toContain("fixture-secret-only");
  expect(localStorage.length).toBe(0);
});
