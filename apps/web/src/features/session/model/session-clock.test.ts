import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { SessionRuntime } from "./session-runtime";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { apiRequest } from "@/shared/api/transport";

const dbNow = Date.parse("2026-10-28T09:00:00.000Z");
const snapshot = {
  user: { userId: "one", username: "fixture-one" },
  expiresAt: "2026-10-28T21:00:00.000Z",
  idleExpiresAt: "2026-10-28T11:00:00.000Z",
};
const credentials = { username: "fixture-one", password: "ephemeral-fixture" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(["ahead-three-hours", "forward-jump", "backward-jump"])(
  "server-valid session schedules bounded checks with %s and never rewrites absolute expiry",
  async (scenario) => {
    vi.useFakeTimers();
    vi.setSystemTime(
      scenario === "ahead-three-hours" ? dbNow + 10800000 : dbNow,
    );
    const fetcher = vi.fn(async () => json(snapshot));
    vi.stubGlobal("fetch", fetcher);
    const scheduled = vi.spyOn(globalThis, "setTimeout");
    const runtime = new SessionRuntime(
      new QueryClient(),
      new SessionBoundary(),
    );
    await runtime.login(credentials);
    if (scenario === "forward-jump") vi.setSystemTime(dbNow + 10800000);
    if (scenario === "backward-jump") vi.setSystemTime(dbNow - 30 * 86400000);
    for (let index = 0; index < 3; index += 1) {
      const delay = scheduled.mock.calls.at(-1)?.[1];
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(7200000);
      if (scenario === "ahead-three-hours")
        expect(delay).toBeGreaterThanOrEqual(60000);
      const requests = fetcher.mock.calls.length;
      await vi.advanceTimersByTimeAsync(999);
      expect(fetcher).toHaveBeenCalledTimes(requests);
      await vi.advanceTimersToNextTimerAsync();
      expect(fetcher).toHaveBeenCalledTimes(requests + 1);
      expect(runtime.snapshot().status).toBe("authenticated");
      expect(runtime.snapshot().session?.expiresAt).toBe(
        "2026-10-28T21:00:00.000Z",
      );
      expect(vi.getTimerCount()).toBe(1);
    }
    runtime.expire();
  },
);

it("clock-skew fallback still fails closed on server 401 and stops protected sends and timers", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(dbNow + 10800000);
  let expired = false;
  const fetcher = vi.fn(async () =>
    expired
      ? json(
          { error: { code: "SESSION_REQUIRED", message: "Phiên đã hết hạn." } },
          401,
        )
      : json(snapshot),
  );
  vi.stubGlobal("fetch", fetcher);
  const cache = new QueryClient(),
    boundary = new SessionBoundary();
  const runtime = new SessionRuntime(cache, boundary);
  await runtime.login(credentials);
  const epoch = boundary.current();
  cache.setQueryData(["private"], "snapshot");
  expired = true;
  await vi.advanceTimersToNextTimerAsync();
  expect(runtime.snapshot()).toEqual({ status: "expired", session: null });
  expect(boundary.isActive()).toBe(false);
  expect(cache.getQueryData(["private"])).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  const count = fetcher.mock.calls.length;
  await expect(
    apiRequest("/test-owned/write", {
      method: "POST",
      expectedEpoch: epoch,
      boundary,
    }),
  ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  await vi.advanceTimersByTimeAsync(3600000);
  expect(fetcher).toHaveBeenCalledTimes(count);
});
