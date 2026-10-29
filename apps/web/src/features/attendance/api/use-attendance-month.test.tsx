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
