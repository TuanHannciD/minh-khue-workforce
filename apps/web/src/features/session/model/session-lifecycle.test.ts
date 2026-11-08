// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { SessionRuntime } from "./session-runtime";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { apiRequest } from "@/shared/api/transport";

const session = () => ({
  user: { userId: "one", username: "fixture-one" },
  expiresAt: new Date(Date.now() + 43200000).toISOString(),
  idleExpiresAt: new Date(Date.now() + 10000).toISOString(),
});
const credentials = { username: "fixture-one", password: "ephemeral-fixture" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((deliver) => {
    resolve = deliver;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([
  { order: "logout-first", pendingBeforeLogout: true },
  { order: "refresh-first", pendingBeforeLogout: true },
  { order: "logout-first", pendingBeforeLogout: false },
  { order: "refresh-first", pendingBeforeLogout: false },
])(
  "logout fences refresh: $order, prior request=$pendingBeforeLogout",
  async ({ order, pendingBeforeLogout }) => {
    vi.useFakeTimers();
    const snapshot = session();
    const read = deferred<Response>(),
      revoke = deferred<Response>();
    const fetcher = vi.fn((path: string) => {
      if (path.endsWith("/auth/login")) return Promise.resolve(json(snapshot));
      if (path.endsWith("/auth/logout")) return revoke.promise;
      if (path.endsWith("/auth/session"))
        return read.promise.then((response) => response.clone());
      return Promise.resolve(json({ private: "must not send" }));
    });
    vi.stubGlobal("fetch", fetcher);
    const cache = new QueryClient(),
      boundary = new SessionBoundary();
    const runtime = new SessionRuntime(cache, boundary);
    await runtime.login(credentials);
    const epoch = boundary.current();
    cache.setQueryData(["private"], "snapshot");
    cache.getMutationCache().build(cache, { mutationKey: ["write"] });
    const pendingRead = pendingBeforeLogout
      ? runtime.refresh()
      : Promise.resolve();
    const logout = runtime.logout(true);
    const duringLogout = runtime.refresh();
    if (order === "logout-first") {
      revoke.resolve(new Response(null, { status: 204 }));
      await logout;
      read.resolve(json(snapshot));
    } else {
      read.resolve(json(snapshot));
      await Promise.all([pendingRead, duringLogout]);
      expect(boundary.isActive()).toBe(false);
      revoke.resolve(new Response(null, { status: 204 }));
    }
    await Promise.all([pendingRead, duringLogout, logout]);
    expect(runtime.snapshot()).toEqual({ status: "anonymous", session: null });
    expect(boundary.isActive()).toBe(false);
    expect(boundary.canWrite(epoch)).toBe(false);
    expect(cache.getQueryCache().getAll()).toHaveLength(0);
    expect(cache.getMutationCache().getAll()).toHaveLength(0);
    const count = fetcher.mock.calls.length;
    await expect(
      apiRequest("/test-owned/read", { boundary }),
    ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await expect(
      apiRequest("/test-owned/write", {
        method: "POST",
        expectedEpoch: boundary.current(),
        boundary,
      }),
    ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(count);
    expect(
      fetcher.mock.calls.filter(([path]) => path.endsWith("/auth/session")),
    ).toHaveLength(pendingBeforeLogout ? 1 : 0);
  },
);

it("logout blocks focus/timer and activation until completion", async () => {
  vi.useFakeTimers();
  const revoke = deferred<Response>();
  const fetcher = vi.fn((path: string) =>
    path.endsWith("/auth/logout")
      ? revoke.promise
      : Promise.resolve(json(session())),
  );
  vi.stubGlobal("fetch", fetcher);
  const runtime = new SessionRuntime(new QueryClient(), new SessionBoundary());
  await runtime.login(credentials);
  const disconnect = runtime.connect();
  await runtime.refresh();
  const logout = runtime.logout(true);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(10000);
  await expect(runtime.login(credentials)).rejects.toMatchObject({
    code: "SESSION_CHANGED",
  });
  runtime.confirmAccountChange();
  expect(runtime.snapshot().status).not.toBe("authenticated");
  expect(runtime.boundary.isActive()).toBe(false);
  expect(
    fetcher.mock.calls.filter(([path]) => path.endsWith("/auth/logout")),
  ).toHaveLength(1);
  expect(
    fetcher.mock.calls.filter(([path]) => path.endsWith("/auth/session")),
  ).toHaveLength(2);
  revoke.resolve(new Response(null, { status: 204 }));
  await logout;
  disconnect();
});

it("failed logout stays closed with draft retained until an explicit fresh server check", async () => {
  vi.useFakeTimers();
  const stale = deferred<Response>(),
    revoke = deferred<Response>();
  let recovery = false;
  const snapshot = session();
  const fetcher = vi.fn((path: string) => {
    if (path.endsWith("/auth/logout")) return revoke.promise;
    if (path.endsWith("/auth/session") && !recovery) return stale.promise;
    return Promise.resolve(json(snapshot));
  });
  vi.stubGlobal("fetch", fetcher);
  const cache = new QueryClient(),
    boundary = new SessionBoundary();
  const runtime = new SessionRuntime(cache, boundary);
  await runtime.login(credentials);
  const epoch = boundary.current();
  let draft = "unsent";
  runtime.registerSensitiveState({
    ownerUserId: "one",
    dirty: () => true,
    clear: () => {
      draft = "";
    },
  });
  const pendingRead = runtime.refresh();
  const logout = runtime.logout(true);
  const rejected = expect(logout).rejects.toMatchObject({ status: 500 });
  revoke.resolve(
    json({ error: { code: "REQUEST_FAILED", message: "Thử lại." } }, 500),
  );
  await rejected;
  stale.resolve(json(snapshot));
  await pendingRead;
  expect(runtime.snapshot()).toEqual({ status: "unavailable", session: null });
  expect(boundary.isActive()).toBe(false);
  expect(cache.getQueryCache().getAll()).toHaveLength(0);
  expect(draft).toBe("unsent");
  const count = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(count);
  recovery = true;
  await runtime.refresh();
  expect(runtime.snapshot().status).toBe("authenticated");
  expect(boundary.canWrite(epoch)).toBe(false);
  expect(draft).toBe("unsent");
  runtime.expire();
});

it("focus confirming the active session preserves query cache, draft intent and an in-flight protected write", async () => {
  vi.useFakeTimers();
  const snapshot = session();
  const updated = {
    ...snapshot,
    idleExpiresAt: new Date(Date.now() + 20000).toISOString(),
  };
  const write = deferred<Response>();
  let signal: AbortSignal | undefined;
  let focused = false;
  const fetcher = vi.fn((path: string, init: RequestInit) => {
    if (path.endsWith("/test-owned/write")) {
      signal = init.signal ?? undefined;
      return write.promise;
    }
    return Promise.resolve(json(focused ? updated : snapshot));
  });
  vi.stubGlobal("fetch", fetcher);
  const cache = new QueryClient(),
    boundary = new SessionBoundary();
  const runtime = new SessionRuntime(cache, boundary);
  await runtime.login(credentials);
  const disconnect = runtime.connect();
  await runtime.refresh();
  cache.setQueryData(["private"], "saved snapshot");
  const mutation = cache
    .getMutationCache()
    .build(cache, { mutationKey: ["write"] });
  let draft = "dirty input";
  runtime.registerSensitiveState({
    ownerUserId: "one",
    dirty: () => true,
    clear: () => {
      draft = "";
    },
  });
  const epoch = boundary.current();
  const pendingWrite = apiRequest("/test-owned/write", {
    method: "POST",
    expectedEpoch: epoch,
    boundary,
  });
  // Attach the outcome immediately so the broken implementation's rejection
  // remains an assertion failure rather than an unhandled promise rejection.
  const outcome = pendingWrite.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const refreshed = new Promise<void>((resolve) => {
    const unsubscribe = runtime.subscribe(() => {
      if (runtime.snapshot().session?.idleExpiresAt === updated.idleExpiresAt) {
        unsubscribe();
        resolve();
      }
    });
  });
  focused = true;
  window.dispatchEvent(new Event("focus"));
  await refreshed;
  expect(boundary.current()).toBe(epoch);
  expect(boundary.canWrite(epoch)).toBe(true);
  expect(signal?.aborted).toBe(false);
  expect(cache.getQueryData(["private"])).toBe("saved snapshot");
  expect(cache.getMutationCache().getAll()).toContain(mutation);
  expect(draft).toBe("dirty input");
  expect(runtime.snapshot().session?.expiresAt).toBe(snapshot.expiresAt);
  write.resolve(json({ saved: true }));
  expect(await outcome).toEqual({ value: { saved: true } });
  expect(
    await apiRequest("/test-owned/next-intent", {
      method: "POST",
      expectedEpoch: epoch,
      boundary,
    }),
  ).toEqual(updated);
  disconnect();
  runtime.expire();
});

it.each(["reauthentication", "new-absolute-expiry", "different-user"])(
  "a real %s transition invalidates cache and the original draft lease",
  async (transition) => {
    vi.useFakeTimers();
    const snapshot = session();
    let next = snapshot;
    const pendingResponse = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init: RequestInit) => {
        if (path.endsWith("/test-owned/read")) {
          signal = init.signal ?? undefined;
          return pendingResponse.promise;
        }
        return Promise.resolve(json(next));
      }),
    );
    const cache = new QueryClient(),
      boundary = new SessionBoundary();
    const runtime = new SessionRuntime(cache, boundary);
    await runtime.login(credentials);
    cache.setQueryData(["private"], "snapshot");
    let draft = "dirty input";
    runtime.registerSensitiveState({
      ownerUserId: "one",
      dirty: () => true,
      clear: () => {
        draft = "";
      },
    });
    const epoch = boundary.current();
    const pending = apiRequest("/test-owned/read", { boundary });
    const rejected = expect(pending).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    if (transition === "reauthentication") await runtime.login(credentials);
    else {
      next =
        transition === "different-user"
          ? { ...snapshot, user: { userId: "two", username: "fixture-two" } }
          : {
              ...snapshot,
              expiresAt: new Date(Date.now() + 43201000).toISOString(),
            };
      await runtime.refresh();
    }
    expect(boundary.canWrite(epoch)).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(cache.getQueryData(["private"])).toBeUndefined();
    expect(draft).toBe("dirty input");
    const status =
      transition === "different-user" ? "account-change" : "authenticated";
    expect(runtime.snapshot().status).toBe(status);
    if (transition === "different-user") {
      expect(boundary.isActive()).toBe(false);
      runtime.confirmAccountChange();
      expect(draft).toBe("");
    }
    pendingResponse.resolve(json({ private: "old snapshot" }));
    await rejected;
    const count = vi.mocked(fetch).mock.calls.length;
    await expect(
      apiRequest("/test-owned/write", {
        method: "POST",
        expectedEpoch: epoch,
        boundary,
      }),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(fetch).toHaveBeenCalledTimes(count);
    runtime.expire();
  },
);
