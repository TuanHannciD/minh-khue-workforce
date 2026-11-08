// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { SessionProvider, SessionRuntime } from "@/features/session/index";
import { sessionBoundary } from "@/shared/api/session-boundary";
import { useAttendancePage } from "./use-attendance-page";
import {
  attendanceKeys,
  invalidateAttendancePages,
  invalidateAttendanceScope,
} from "./query-keys";
import { attendanceFixture } from "../preview/attendance-fixture";
import { writeAttendance } from "./attendance";
const criteria = {
  month: "2024-02",
  q: "  Nguyễn %_  ",
  page: 2,
  pageSize: 25 as const,
  kind: "work",
};
afterEach(() => {
  cleanup();
  sessionBoundary.invalidate();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});
async function setup(code = 200) {
  vi.useFakeTimers();
  let calls = 0;
  const visible = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const bodies: unknown[] = [];
  const client = new QueryClient();
  const runtime = new SessionRuntime(client);
  vi.stubGlobal("fetch", async (path: string, options: RequestInit) => {
    if (path.includes("/auth/"))
      return Response.json({
        user: { userId: "owner", username: "owner" },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    calls++;
    bodies.push(JSON.parse(options.body as string));
    expect(path).toBe("/api/v1/attendance/search");
    expect(options.method).toBe("POST");
    return Response.json(
      code === 200
        ? {
            month: "2024-02",
            fetchedAt: `read${calls}`,
            employees: attendanceFixture.employees,
            cells: attendanceFixture.cells,
            pagination: {
              requestedPage: 2,
              page: 2,
              pageSize: 25,
              totalResults: 40,
              monthEmployeeCount: 40,
              totalPages: 2,
              from: 26,
              to: 40,
            },
            employeeTotals: {
              work: attendanceFixture.totals.work.byEmployee,
              overtime: attendanceFixture.totals.overtime.byEmployee,
            },
            monthTotals: {
              work: {
                byDate: attendanceFixture.totals.work.byDate,
                grandTotal: attendanceFixture.totals.work.grandTotal,
              },
              overtime: {
                byDate: attendanceFixture.totals.overtime.byDate,
                grandTotal: attendanceFixture.totals.overtime.grandTotal,
              },
            },
          }
        : { error: { code: "FAIL", message: "lỗi" } },
      { status: code },
    );
  });
  await runtime.refresh();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <SessionProvider runtime={runtime}>{children}</SessionProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useAttendancePage(
        criteria,
        { userId: "owner", epoch: sessionBoundary.current(), generation: 1 },
        true,
      ),
    { wrapper },
  );
  const flush = async (ms = 0) => {
    await act(() => vi.advanceTimersByTimeAsync(ms));
  };
  await flush();
  return {
    hook,
    calls: () => calls,
    bodies,
    client,
    runtime,
    visible,
    flush,
    setCode: (next: number) => {
      code = next;
    },
  };
}
it("active_page_only_polls_15000; body trim preserves case and keys omit kind/generation", async () => {
  const h = await setup();
  expect(h.calls()).toBe(1);
  expect(h.bodies).toEqual([
    { month: "2024-02", q: "Nguyễn %_", page: 2, pageSize: 25 },
  ]);
  expect(h.client.getQueryCache().getAll()[0]!.queryKey).toEqual([
    "attendance",
    "page",
    "owner",
    sessionBoundary.current(),
    "2024-02",
    "Nguyễn %_",
    2,
    25,
  ]);
  await h.flush(14999);
  expect(h.calls()).toBe(1);
  await h.flush(1);
  expect(h.calls()).toBe(2);
  h.visible.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await h.flush(30000);
  expect(h.calls()).toBe(2);
  h.hook.unmount();
  await h.flush(0);
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  await h.flush(30000);
  expect(h.calls()).toBe(2);
});
it("4xx stops retries and automatic polling", async () => {
  const h = await setup(400);
  await h.flush(50000);
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await h.flush();
  expect(h.calls()).toBe(1);
  expect(h.hook.result.current.isError).toBe(true);
  h.setCode(200);
  const pending = h.hook.result.current.refetch();
  await h.flush();
  expect(h.calls()).toBe(2);
  expect((await pending).isSuccess).toBe(true);
  h.hook.unmount();
  h.client.clear();
});
it("5xx retries exactly twice at 1000 and 3000ms; expire stops dispatch", async () => {
  const h = await setup(503);
  await h.flush(999);
  expect(h.calls()).toBe(1);
  await h.flush(1);
  expect(h.calls()).toBe(2);
  await h.flush(2999);
  expect(h.calls()).toBe(2);
  await h.flush(1);
  expect(h.calls()).toBe(3);
  act(() => h.runtime.expire());
  await h.flush(50000);
  expect(h.calls()).toBe(3);
});
it("mutation transport still makes one attempt", async () => {
  const h = await setup();
  h.hook.unmount();
  const request = vi.fn(async () =>
    Response.json(
      { error: { code: "UNAVAILABLE", message: "unknown" } },
      { status: 503 },
    ),
  );
  vi.stubGlobal("fetch", request);
  await expect(
    writeAttendance(
      {
        month: "2024-02",
        operation: { type: "patch-cell", patch: { reminder: true } },
        targets: [
          {
            employeeId: attendanceFixture.employees[0]!.id,
            date: "2024-02-01",
            kind: "work",
            expectedRevision: "1",
          },
        ],
        expectedEmployees: [
          {
            employeeId: attendanceFixture.employees[0]!.id,
            expectedRevision: "1",
          },
        ],
      },
      sessionBoundary.current(),
    ),
  ).rejects.toMatchObject({ status: 503 });
  await h.flush(5000);
  expect(request).toHaveBeenCalledTimes(1);
});
it("invalidates all month filters plus legacy, only active refetch, isolated user/epoch", async () => {
  const client = new QueryClient();
  let calls = 0;
  const keys = [
    attendanceKeys.page(criteria, "owner", 1),
    attendanceKeys.page({ ...criteria, q: "else", page: 3 }, "owner", 1),
    attendanceKeys.month("2024-02", "owner", 1),
    attendanceKeys.month("2024-03", "owner", 1),
    attendanceKeys.page(criteria, "other", 1),
    attendanceKeys.page(criteria, "owner", 2),
  ];
  keys.forEach((k) => client.setQueryData(k, "saved"));
  const observer = new QueryObserver(client, {
    queryKey: keys[0]!,
    queryFn: async () => {
      calls++;
      return "fresh";
    },
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  await invalidateAttendancePages(client, "2024-02", "owner", 1);
  expect(calls).toBe(1);
  expect(keys.map((k) => client.getQueryState(k)?.isInvalidated)).toEqual([
    false,
    true,
    true,
    false,
    false,
    false,
  ]);
  await invalidateAttendanceScope(client, "owner", 1);
  expect(calls).toBe(2);
  expect(keys.map((k) => client.getQueryState(k)?.isInvalidated)).toEqual([
    false,
    true,
    true,
    true,
    false,
    false,
  ]);
  unsubscribe();
  client.clear();
});
