import { describe, it, expect } from "vitest";
import { readHealth, apiOrigin } from "./transport";

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
