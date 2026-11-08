// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AppRouter } from "./router";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});
it("synthetic attendance route does not acquire an auth session or call an API", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  window.history.replaceState({}, "", "/preview/attendance");
  render(<AppRouter />);
  await screen.findByRole("heading", { name: "Bảng chấm công" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetcher).not.toHaveBeenCalled();
});
it("product route keeps the existing session boundary and shows login for an anonymous response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 401 })),
  );
  window.history.replaceState({}, "", "/login");
  render(<AppRouter />);
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeTruthy(),
  );
});
