import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { PageReadCriteria } from "./attendance-read-matchers.ts";
type Event = { event: string; token: string; page?: number; total?: number };
type Gate = {
  events: Event[];
  arm: (token: string, expected: PageReadCriteria) => void;
  release: () => void;
  flush: () => Promise<void>;
};
declare global {
  interface Window {
    attendanceTestBodyGate: Gate;
  }
}

// Test-only browser transport scheduler. Original fetch arguments/signal and
// native json side effects stay real; only delivery of completed bytes waits.
export async function installBodyGate(p: Page) {
  await p.evaluate(() => {
    const nativeFetch = window.fetch.bind(window),
      nativeJson = Response.prototype.json;
    const metadata = new WeakMap<
      Response,
      { criteria: PageReadCriteria; signal?: AbortSignal | null }
    >();
    let armed: { token: string; expected: PageReadCriteria } | null = null;
    let release: (() => void) | null = null;
    const events: Event[] = [];
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      if (new URL(response.url).pathname === "/api/v1/attendance/search")
        metadata.set(response, {
          criteria: JSON.parse(String(args[1]?.body)),
          signal: args[1]?.signal,
        });
      return response;
    };
    Response.prototype.json = async function () {
      const body = await nativeJson.call(this),
        meta = metadata.get(this);
      if (
        !armed ||
        !meta ||
        !Object.entries(armed.expected).every(
          ([k, v]) => meta.criteria[k] === v,
        )
      )
        return body;
      const token = armed.token;
      armed = null;
      events.push({
        event: "native-body-complete",
        token,
        page: body.pagination.page,
        total: body.monthTotals.work.grandTotal,
      });
      meta.signal?.addEventListener(
        "abort",
        () => events.push({ event: "native-signal-abort", token }),
        { once: true },
      );
      await new Promise<void>((done) => {
        release = done;
      });
      events.push({ event: "old-json-returned", token });
      return body;
    };
    window.attendanceTestBodyGate = {
      events,
      arm(token, expected) {
        if (armed || release) throw new Error("body gate occupied");
        armed = { token, expected };
      },
      release() {
        if (!release) throw new Error("no completed body held");
        const done = release;
        release = null;
        events.push({
          event: "release",
          token: events
            .filter((e) => e.event === "native-body-complete")
            .at(-1)!.token,
        });
        done();
      },
      async flush() {
        // Event loop turns after resolution, no delay/timeout success oracle.
        for (let i = 0; i < 3; i++)
          await new Promise<void>((done) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              channel.port1.close();
              channel.port2.close();
              done();
            };
            channel.port2.postMessage(null);
          });
      },
    };
  });
}
export const armBody = (p: Page, token: string, expected: PageReadCriteria) =>
  p.evaluate(
    ({ token, expected }) => window.attendanceTestBodyGate.arm(token, expected),
    { token, expected },
  );
export const awaitBody = (p: Page, token: string) =>
  expect
    .poll(() =>
      p.evaluate(
        (token) =>
          window.attendanceTestBodyGate.events.some(
            (e) => e.token === token && e.event === "native-body-complete",
          ),
        token,
      ),
    )
    .toBe(true);
export async function releaseBody(p: Page) {
  await p.evaluate(() => window.attendanceTestBodyGate.release());
  await p.evaluate(() => window.attendanceTestBodyGate.flush());
}
export const gateEvents = (p: Page) =>
  p.evaluate(async () => {
    await window.attendanceTestBodyGate.flush();
    return window.attendanceTestBodyGate.events;
  });
export const markAccepted = (p: Page, token: string) =>
  p.evaluate(
    (token) =>
      window.attendanceTestBodyGate.events.push({
        event: "new-context-accepted",
        token,
      }),
    token,
  );
