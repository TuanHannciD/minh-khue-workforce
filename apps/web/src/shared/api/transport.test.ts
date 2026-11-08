import { afterEach, describe, it, expect, vi } from "vitest";
import { readHealth, apiOrigin, apiRequest } from "./transport";
import { SessionBoundary } from "./session-boundary";

afterEach(() => vi.unstubAllGlobals());

it("rejects a delayed successful body after account/session transition", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  let finish!: (body: unknown) => void;
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    bodyStarted = resolve;
  });
  const body = new Promise((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => {
        bodyStarted();
        return body;
      },
    })),
  );
  const response = apiRequest("/attendance/month?month=2026-10", {
    boundary,
    expectedEpoch: boundary.current(),
  });
  await started;
  boundary.invalidate();
  boundary.allowWrites();
  finish({ employees: ["old-account-data"] });
  await expect(response).rejects.toMatchObject({ code: "SESSION_CHANGED" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("times out a protected write once; timeout never proves rollback", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_path: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    ),
  );
  await expect(
    apiRequest("/attendance/changes", {
      method: "POST",
      body: {},
      boundary,
      expectedEpoch: boundary.current(),
      timeoutMs: 5,
    }),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(boundary.isActive()).toBe(true);
});

describe("bootstrap transport", () => {
  it("uses the configured API origin and generated response through real HTTP", async () => {
    const { createServer } = await import("node:http");
    let observedUrl: string | undefined;
    const server = createServer((request, response) => {
      observedUrl = request.url;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: "ok" }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing listener");
      expect(await readHealth(`http://127.0.0.1:${address.port}`)).toEqual({
        status: "ok",
      });
      expect(observedUrl).toBe("/health");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("rejects malformed origins rather than silently sending to another path", () => {
    expect(() => apiOrigin("file:///local")).toThrow(/origin/);
    expect(() => apiOrigin("https://example.test/other")).toThrow(/origin/);
    expect(apiOrigin("https://example.test")).toBe("https://example.test");
  });
});
