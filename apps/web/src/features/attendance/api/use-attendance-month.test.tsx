// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { SessionProvider, SessionRuntime } from "@/features/session/index";
import {
  SessionBoundary,
  sessionBoundary,
} from "@/shared/api/session-boundary";
import { useAttendanceMonth } from "./use-attendance-month";
import { attendanceFixture } from "../preview/attendance-fixture";
import { AttendanceDraft } from "../model/attendance-draft";
import { useAttendancePage } from "./use-attendance-page";
import { attendanceKeys } from "./query-keys";
import { toPageTable } from "../model/attendance-read-view";
import type { PageCriteria, AttendancePageDto, MonthDto } from "../model/types";

afterEach(() => {
  cleanup();
  sessionBoundary.invalidate();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});
async function setup(status = 200) {
  vi.useFakeTimers();
  let calls = 0;
  let code = status;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const client = new QueryClient();
  const runtime = new SessionRuntime(client);
  const deadline = new Date(Date.now() + 3600000).toISOString();
  vi.stubGlobal("fetch", async (path: string) => {
    if (path.includes("/auth/session"))
      return Response.json({
        user: { userId: "owner", username: "owner" },
        expiresAt: deadline,
        idleExpiresAt: deadline,
      });
    calls++;
    return code === 200
      ? Response.json({ ...attendanceFixture, fetchedAt: `read-${calls}` })
      : Response.json(
          { error: { code: "FAIL", message: "lỗi tải" } },
          { status: code },
        );
  });
  await runtime.refresh();
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const cell = attendanceFixture.cells.find(
    (c) =>
      c.employeeId === attendanceFixture.employees[0]!.id &&
      c.kind === "work" &&
      c.date.endsWith("02"),
  )!;
  draft.open(attendanceFixture, cell, "owner");
  draft.change({ raw: "3,25", reminder: false, custom: true });
  function View() {
    const result = useAttendanceMonth("2024-02");
    return (
      <>
        <span data-testid="snapshot">{result.data?.fetchedAt}</span>
        <span data-testid="error">
          {result.error instanceof Error ? result.error.message : ""}
        </span>
      </>
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <SessionProvider runtime={runtime}>
        <View />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await act(() => vi.advanceTimersByTimeAsync(50));
  return {
    client,
    runtime,
    draft,
    view,
    calls: () => calls,
    setCode: (n: number) => {
      code = n;
    },
  };
}
it("refetch_keeps_raw_input_and_baseline every15000 active, refocus/reconnect reload; hidden/unmounted stops polling", async () => {
  const { draft, calls, view } = await setup();
  const before = structuredClone(draft.edit);
  expect(calls()).toBe(1);
  await act(() => vi.advanceTimersByTimeAsync(15000));
  expect(calls()).toBe(2);
  expect(screen.getByTestId("snapshot").textContent).toBe("read-2");
  expect(draft.edit).toEqual(before);
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(calls()).toBe(3);
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(calls()).toBe(4);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(calls()).toBe(4);
  view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(calls()).toBe(4);
});
it("validation errors have no read retry or polling loop; initial error is not empty data", async () => {
  const { calls } = await setup(400);
  await act(() => vi.advanceTimersByTimeAsync(50000));
  expect(calls()).toBe(1);
  expect(screen.getByTestId("snapshot").textContent).toBe("");
  expect(screen.getByTestId("error").textContent).toBe("lỗi tải");
});
it("background failure retains snapshot separately; reads retry at1s/3s only twice", async () => {
  const { calls, setCode } = await setup();
  setCode(503);
  await act(() => vi.advanceTimersByTimeAsync(15000));
  expect(calls()).toBe(2);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(calls()).toBe(3);
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(calls()).toBe(4);
  await act(() => vi.advanceTimersByTimeAsync(50));
  expect(screen.getByTestId("snapshot").textContent).toBe("read-1");
  expect(screen.getByTestId("error").textContent).toBe("lỗi tải");
});
it("logout clears cache and stops polling", async () => {
  const { calls, runtime, client } = await setup();
  await act(async () => {
    runtime.expire();
    await vi.advanceTimersByTimeAsync(50000);
  });
  expect(calls()).toBe(1);
  expect(
    [...client.getQueryCache().getAll()].every(
      (q) => q.state.data === undefined,
    ),
  ).toBe(true);
});

it("fullmonth_read_does_not_mutate_page_delivery", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const client = new QueryClient();
  const runtime = new SessionRuntime(client);
  const criteria: PageCriteria = {
    month: "2024-02",
    q: "filtered",
    page: 2,
    pageSize: 25,
  };
  const table = toPageTable({
    month: criteria.month,
    fetchedAt: "page",
    employees: attendanceFixture.employees.slice(0, 1),
    cells: attendanceFixture.cells.filter(
      (c) => c.employeeId === attendanceFixture.employees[0]!.id,
    ),
    employeeTotals: {
      work: [{ employeeId: attendanceFixture.employees[0]!.id, value: 3.5 }],
      overtime: [],
    },
    monthTotals: {
      work: { byDate: [], grandTotal: 999 },
      overtime: { byDate: [], grandTotal: 888 },
    },
    pagination: {
      requestedPage: 2,
      page: 2,
      pageSize: 25,
      from: 26,
      to: 50,
      totalPages: 3,
      totalResults: 60,
      monthEmployeeCount: 100,
    },
  });
  const page: AttendancePageDto = {
    ...table,
    fetchedAt: "page",
    pagination: {
      ...table.range,
      requestedPage: 2,
      page: 2,
      pageSize: 25,
      totalPages: 3,
    },
  };
  let finish!: (data: MonthDto) => void;
  const body = new Promise<MonthDto>((resolve) => {
    finish = resolve;
  });
  const requests: { path: string; method: string }[] = [];
  const deadline = new Date(Date.now() + 3600000).toISOString();
  vi.stubGlobal("fetch", async (path: string, options: RequestInit = {}) => {
    if (path.includes("/auth/"))
      return Response.json({
        user: { userId: "owner", username: "owner" },
        expiresAt: deadline,
        idleExpiresAt: deadline,
      });
    requests.push({ path, method: options.method ?? "GET" });
    if (path === "/api/v1/attendance/search") return Response.json(page);
    if (path === "/api/v1/attendance/month?month=2024-02")
      return { ok: true, status: 200, json: () => body } as Response;
    throw new Error(`Unexpected path ${path}`);
  });
  await runtime.refresh();
  const draft = new AttendanceDraft(sessionBoundary);
  draft.open(
    attendanceFixture,
    attendanceFixture.cells.find((c) => c.state === "editable")!,
    "owner",
  );
  draft.change({ raw: "3,25", custom: true, reminder: true, error: "frozen" });
  const before = structuredClone(draft.edit);
  const epoch = sessionBoundary.current();
  let withMonth = false;
  function Month() {
    const result = useAttendanceMonth(criteria.month);
    return <output>{result.data?.fetchedAt}</output>;
  }
  function View() {
    const query = useAttendancePage(
      criteria,
      { userId: "owner", epoch, generation: 1 },
      false,
    );
    return (
      <>
        <span>{query.data?.data.fetchedAt}</span>
        {withMonth && <Month />}
      </>
    );
  }
  const wrapper = () => (
    <QueryClientProvider client={client}>
      <SessionProvider runtime={runtime}>
        <View />
      </SessionProvider>
    </QueryClientProvider>
  );
  const view = render(wrapper());
  try {
    await act(() => vi.advanceTimersByTimeAsync(0));
    const pageKey = attendanceKeys.page(criteria, "owner", epoch);
    const accepted = client.getQueryData<{ data: AttendancePageDto }>(pageKey)!;
    expect(accepted.data.fetchedAt).toBe("page");
    const projection = toPageTable(accepted.data);
    expect(projection.employees).toBe(accepted.data.employees);
    expect(projection.cells).toBe(accepted.data.cells);
    expect(projection.employeeTotals).toBe(accepted.data.employeeTotals);
    expect(projection.monthTotals).toBe(accepted.data.monthTotals);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    withMonth = true;
    view.rerender(wrapper());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(client.getQueryData(pageKey)).toBe(accepted);
    expect(draft.edit).toEqual(before);
    await act(async () =>
      finish({ ...attendanceFixture, fetchedAt: "fullmonth" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    const monthKey = ["attendance", "owner", epoch, "2024-02"];
    expect(client.getQueryData<MonthDto>(monthKey)?.fetchedAt).toBe(
      "fullmonth",
    );
    expect(client.getQueryData(pageKey)).toBe(accepted);
    expect(accepted.data.monthTotals.work.grandTotal).toBe(999);
    expect(draft.edit).toEqual(before);
    expect(requests).toEqual([
      { path: "/api/v1/attendance/search", method: "POST" },
      { path: "/api/v1/attendance/month?month=2024-02", method: "GET" },
    ]);
    withMonth = false;
    view.rerender(wrapper());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(client.getQueryData(monthKey)).toBeUndefined();
    expect(client.getQueryData(pageKey)).toBe(accepted);
  } finally {
    view.unmount();
    runtime.expire();
    client.clear();
  }
});
