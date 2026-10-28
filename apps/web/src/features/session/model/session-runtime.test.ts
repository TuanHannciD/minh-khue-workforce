import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { SessionRuntime } from "./session-runtime";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { ApiError, apiRequest } from "@/shared/api/transport";

const session = (userId = "one") => ({
  user: { userId, username: `fixture-${userId}` },
  expiresAt: new Date(Date.now() + 43200000).toISOString(),
  idleExpiresAt: new Date(Date.now() + 10000).toISOString(),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("sensitive draft registration cannot attach another user's memory to the current session", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(session("two"))),
  );
  const runtime = new SessionRuntime(new QueryClient(), new SessionBoundary());
  await runtime.login({
    username: "fixture-two",
    password: "ephemeral-fixture",
  });
  expect(() =>
    runtime.registerSensitiveState({
      ownerUserId: "one",
      dirty: () => true,
      clear: () => {},
    }),
  ).toThrow(ApiError);
  runtime.expire();
});

it("expiry blocks protected polling/writes without sending and keeps a same-user memory draft for explicit reauthentication", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => json(session()));
  vi.stubGlobal("fetch", fetcher);
  const cache = new QueryClient(),
    boundary = new SessionBoundary(),
    runtime = new SessionRuntime(cache, boundary);
  await runtime.login({
    username: "fixture-one",
    password: "ephemeral-fixture",
  });
  let draft = "unsubmitted input";
  runtime.registerSensitiveState({
    ownerUserId: "one",
    dirty: () => true,
    clear: () => {
      draft = "";
    },
  });
  cache.setQueryData(["sensitive"], "private fixture snapshot");
  const epoch = boundary.current();
  fetcher.mockImplementation(async () =>
    json(
      { error: { code: "SESSION_REQUIRED", message: "Phiên đã hết hạn." } },
      401,
    ),
  );
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(runtime.snapshot().status).toBe("expired");
  expect(cache.getQueryData(["sensitive"])).toBeUndefined();
  const count = fetcher.mock.calls.length;
  await expect(
    apiRequest("/test-owned/read", { boundary }),
  ).rejects.toBeInstanceOf(ApiError);
  await expect(
    apiRequest("/test-owned/write", {
      method: "POST",
      expectedEpoch: epoch,
      boundary,
    }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(fetcher).toHaveBeenCalledTimes(count);
  expect(draft).toBe("unsubmitted input");
  fetcher.mockImplementation(async () => json(session()));
  await runtime.login({
    username: "fixture-one",
    password: "ephemeral-fixture",
  });
  expect(draft).toBe("unsubmitted input");
  expect(boundary.canWrite(epoch)).toBe(false);
  expect(runtime.snapshot().status).toBe("authenticated");
  runtime.expire();
});

it("idle deadline checks the server so prior valid activity does not falsely expire a live session", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => json(session()));
  vi.stubGlobal("fetch", fetcher);
  const runtime = new SessionRuntime(new QueryClient(), new SessionBoundary());
  await runtime.login({
    username: "fixture-one",
    password: "ephemeral-fixture",
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(runtime.snapshot().status).toBe("authenticated");
  runtime.expire();
});

it("changed user cannot reuse the old draft or lease and requires discard before continuing", async () => {
  const fetcher = vi.fn(async () => json(session()));
  vi.stubGlobal("fetch", fetcher);
  const runtime = new SessionRuntime(new QueryClient(), new SessionBoundary());
  await runtime.login({
    username: "fixture-one",
    password: "ephemeral-fixture",
  });
  const clear = vi.fn();
  runtime.registerSensitiveState({
    ownerUserId: "one",
    dirty: () => true,
    clear,
  });
  const epoch = runtime.boundary.current();
  runtime.expire();
  fetcher.mockImplementation(async () => json(session("two")));
  await runtime.login({
    username: "fixture-two",
    password: "ephemeral-fixture",
  });
  expect(runtime.snapshot().status).toBe("account-change");
  expect(runtime.boundary.canWrite(epoch)).toBe(false);
  expect(clear).not.toHaveBeenCalled();
  runtime.confirmAccountChange();
  expect(clear).toHaveBeenCalledOnce();
  expect(runtime.snapshot().session?.user.userId).toBe("two");
  runtime.expire();
});

it("dirty logout sends nothing until discard; confirmed logout clears query/mutation caches and sensitive memory", async () => {
  const fetcher = vi.fn(async () => json(session()));
  vi.stubGlobal("fetch", fetcher);
  const cache = new QueryClient(),
    runtime = new SessionRuntime(cache, new SessionBoundary());
  await runtime.login({
    username: "fixture-one",
    password: "ephemeral-fixture",
  });
  cache.setQueryData(["snapshot"], "private");
  cache.getMutationCache().build(cache, { mutationKey: ["write"] });
  const clear = vi.fn();
  runtime.registerSensitiveState({
    ownerUserId: "one",
    dirty: () => true,
    clear,
  });
  expect(await runtime.logout()).toBe(false);
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockImplementation(async () => new Response(null, { status: 204 }));
  expect(await runtime.logout(true)).toBe(true);
  expect(cache.getQueryCache().getAll()).toHaveLength(0);
  expect(cache.getMutationCache().getAll()).toHaveLength(0);
  expect(clear).toHaveBeenCalledOnce();
  expect(runtime.snapshot().status).toBe("anonymous");
});

it("late read response from an old epoch never returns private data after logout/expiry", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  let deliver!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve;
        }),
    ),
  );
  const pending = apiRequest("/test-owned/read", { boundary });
  const rejected = expect(pending).rejects.toMatchObject({
    code: "SESSION_CHANGED",
  });
  boundary.invalidate();
  deliver(json({ private: "previous identity" }));
  await rejected;
});

it("a body arriving after the session changes cannot return data even when headers arrived earlier", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  let deliver!: (body: unknown) => void;
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    bodyStarted = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => {
        bodyStarted();
        return new Promise<unknown>((resolve) => {
          deliver = resolve;
        });
      },
    })),
  );
  const pending = apiRequest("/test-owned/read", { boundary });
  const rejected = expect(pending).rejects.toMatchObject({
    code: "SESSION_CHANGED",
  });
  await started;
  boundary.invalidate();
  deliver({ private: "previous identity" });
  await rejected;
});
