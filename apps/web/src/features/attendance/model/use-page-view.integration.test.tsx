// @vitest-environment jsdom
/**
 * File map: page/setup own the shared real hook + view + session composition.
 * Tests below cover dispatch A/B/A, reauthentication, polling, cancel/retry,
 * cached return and clamp adoption. Kept together to exercise one composition.
 */
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import {
  SessionProvider,
  SessionRuntime,
  useSession,
} from "@/features/session/index";
import { sessionBoundary } from "@/shared/api/session-boundary";
import { usePageView } from "./use-page-view";
import { canPollPage } from "./page-view";
import type { PageDelivery } from "./page-view";
import {
  adoptAttendancePage,
  useAttendancePage,
} from "../api/use-attendance-page";
import { attendanceKeys, invalidateAttendancePages } from "../api/query-keys";
import type { AttendancePageDto, PageCriteria } from "./types";
import { AttendanceDraft } from "./attendance-draft";
import { attendanceFixture } from "../preview/attendance-fixture";

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  sessionBoundary.invalidate();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});
const initial: PageCriteria = {
  month: "2024-02",
  q: "",
  page: 2,
  pageSize: 25,
};
function page(
  request: PageCriteria,
  id: string,
  effective = request.page,
): AttendancePageDto {
  const employee = { ...attendanceFixture.employees[0]!, id, name: id };
  return {
    month: request.month,
    fetchedAt: id,
    employees: [employee],
    cells: [],
    pagination: {
      requestedPage: request.page,
      page: effective,
      pageSize: request.pageSize,
      totalResults: effective === 40 ? 1000 : 975,
      monthEmployeeCount: 1000,
      totalPages: effective === 40 ? 40 : 39,
      from: (effective - 1) * 25 + 1,
      to: effective * 25,
    },
    employeeTotals: { work: [{ employeeId: id, value: 1 }], overtime: [] },
    monthTotals: {
      work: { byDate: [], grandTotal: Number(id.match(/\d+/)?.[0] ?? 1) },
      overtime: { byDate: [], grandTotal: 2 },
    },
  };
}
async function setup(start = initial) {
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const client = new QueryClient();
  clients.push(client);
  const runtime = new SessionRuntime(client);
  const bodies: {
    request: PageCriteria;
    resolve: (value: AttendancePageDto) => void;
    signal: AbortSignal;
  }[] = [];
  let user = "owner";
  let code = 200;
  vi.stubGlobal("fetch", async (path: string, options: RequestInit) => {
    if (path.includes("/auth/logout"))
      return new Response(null, { status: 204 });
    if (path.includes("/auth/"))
      return Response.json({
        user: { userId: user, username: user },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
    if (path !== "/api/v1/attendance/search")
      throw new Error(`Unexpected path ${path}`);
    const request = JSON.parse(options.body as string) as PageCriteria;
    let resolve!: (data: AttendancePageDto) => void;
    const body = new Promise<AttendancePageDto>((done) => {
      resolve = done;
    });
    bodies.push({ request, resolve, signal: options.signal as AbortSignal });
    if (code !== 200)
      return Response.json(
        { error: { code: "FAIL", message: "fixture failure" } },
        { status: code },
      );
    // Deliberately ignore abort while reading the body: production must reject it.
    return { ok: true, status: 200, json: () => body } as Response;
  });
  await runtime.refresh();
  const draft = new AttendanceDraft();
  const disconnect = draft.connect(runtime);
  draft.open(
    attendanceFixture,
    attendanceFixture.cells.find((c) => c.state === "editable")!,
    "owner",
  );
  draft.change({ raw: "3,25", custom: true, reminder: false });
  let current!: ReturnType<typeof usePageView>;
  let query!: ReturnType<typeof useAttendancePage>;
  let held = false;
  const deliveries: PageDelivery[] = [];
  const decisions: string[] = [];
  function View() {
    const { session, runtime } = useSession();
    const view = usePageView(
      start,
      {
        userId: session?.user.userId ?? "",
        epoch: runtime.boundary.current(),
        generation: 1,
      },
      held,
    );
    current = view;
    const result = useAttendancePage(
      view.state.desired,
      view.state.lifetime,
      canPollPage(view.state),
    );
    query = result;
    const { accept } = view;
    useEffect(() => {
      if (!result.data) return;
      deliveries.push(result.data);
      const decision = accept(result.data);
      decisions.push(decision);
      if (decision === "accepted") {
        adoptAttendancePage(client, result.data);
        if (result.data.requested.page !== result.data.data.pagination.page)
          expect(
            client.getQueryData(
              attendanceKeys.page(
                {
                  ...result.data.requested,
                  page: result.data.data.pagination.page,
                },
                result.data.requestLifetime.userId,
                result.data.requestLifetime.epoch,
              ),
            ),
          ).toBe(result.data);
      }
    }, [result.data, accept]);
    const shown = view.state.displayed;
    return (
      <output data-testid="envelope" data-error={result.isError}>
        {shown
          ? `${shown.criteria.page}|${shown.delivery.data.employees[0]?.id}|${shown.delivery.data.monthTotals.work.grandTotal}|${shown.delivery.data.fetchedAt}|${canPollPage(view.state) ? "ready" : "old-readonly"}`
          : "loading"}
      </output>
    );
  }
  const wrapper = () => (
    <QueryClientProvider client={client}>
      <SessionProvider runtime={runtime}>
        <View />
      </SessionProvider>
    </QueryClientProvider>
  );
  let rendered = render(wrapper());
  const flush = async (ms = 0) => {
    await act(() => vi.advanceTimersByTimeAsync(ms));
  };
  await flush();
  return {
    client,
    runtime,
    draft,
    bodies,
    deliveries,
    decisions,
    visibility,
    flush,
    view: () => current,
    query: () => query,
    request: async (next: PageCriteria) => {
      act(() => current.request(next));
      await flush();
    },
    resolve: async (n: number, id: string, effective?: number) => {
      await act(async () => {
        bodies[n]!.resolve(page(bodies[n]!.request, id, effective));
        await vi.advanceTimersByTimeAsync(0);
      });
      await flush();
    },
    hold: async (value: boolean) => {
      held = value;
      rendered.rerender(wrapper());
      await flush();
    },
    changeUser: (value: string) => {
      user = value;
    },
    setCode: (value: number) => {
      code = value;
    },
    remount: async (next: PageCriteria) => {
      start = next;
      rendered = render(wrapper());
      await flush();
    },
    unmount: () => {
      rendered.unmount();
      disconnect();
    },
  };
}
it("dispatch_tags_survive_A_B_A_delayed_body", async () => {
  const h = await setup();
  expect(h.bodies).toHaveLength(1);
  await h.request({ ...initial, page: 3 });
  await h.request(initial);
  expect(h.bodies.map((b) => b.request.page)).toEqual([2, 3, 2]);
  expect(h.bodies[0]!.signal.aborted).toBe(true);
  await h.resolve(2, "A3");
  const accepted = h.view().state.displayed!.delivery;
  expect(accepted.requestLifetime.generation).toBe(3);
  expect(accepted.requested.page).toBe(2);
  expect(accepted.requestId).toBe(3);
  await h.resolve(0, "A1");
  await h.resolve(1, "B2");
  expect(screen.getByTestId("envelope").textContent).toBe("2|A3|3|A3|ready");
  expect(h.view().state.displayed!.delivery).toBe(accepted);
  expect(h.deliveries.every((d) => d.data.fetchedAt !== "A1")).toBe(true);
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .map((q) => q.state.data),
  ).toEqual([accepted]);
  await h.request({ ...initial, page: 3 });
  expect(screen.getByTestId("envelope").textContent).toBe(
    "2|A3|3|A3|old-readonly",
  );
  h.unmount();
  await h.resolve(3, "unmounted4");
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
});
it("same_user_reauth_rejects_old_body_without_losing_raw_owner", async () => {
  const h = await setup();
  const oldEpoch = h.view().state.lifetime.epoch;
  const ownerGeneration = h.draft.ownerGeneration;
  await act(async () => {
    h.runtime.expire();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(h.view().state.displayed).toBeNull();
  await act(async () => {
    await h.runtime.login({ username: "owner", password: "fixture" });
  });
  await h.flush();
  expect(h.bodies).toHaveLength(2);
  expect(h.view().state.lifetime.epoch).toBeGreaterThan(oldEpoch);
  await h.resolve(1, "fresh2");
  await h.resolve(0, "old1");
  expect(screen.getByTestId("envelope").textContent).toContain("fresh2");
  expect(h.draft.edit?.raw).toBe("3,25");
  expect(h.draft.ownerGeneration).toBe(ownerGeneration);
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .every((q) => q.queryKey[3] !== oldEpoch),
  ).toBe(true);
  await h.request({ ...initial, page: 3 });
  h.changeUser("other");
  await act(async () => {
    await h.runtime.login({ username: "other", password: "fixture" });
  });
  await h.flush();
  expect(h.runtime.snapshot().status).toBe("account-change");
  expect(h.view().state.displayed).toBeNull();
  act(() => h.runtime.confirmAccountChange());
  await h.flush();
  expect(h.draft.edit).toBeNull();
  await h.resolve(2, "old-owner3");
  await h.resolve(3, "other4");
  expect(h.view().state.displayed!.delivery.requestLifetime.userId).toBe(
    "other",
  );
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .every((q) => q.queryKey[2] === "other"),
  ).toBe(true);
  await act(async () => {
    await h.runtime.logout(true);
  });
  await h.flush();
  expect(h.draft.edit).toBeNull();
  expect(h.view().state.displayed).toBeNull();
  h.unmount();
});
it("same membership poll refreshes one envelope without rebasing raw draft; refocus, reconnect and manual dispatch keep tags", async () => {
  const h = await setup();
  await h.resolve(0, "same1");
  const baseline = structuredClone(h.draft.edit);
  await h.hold(true);
  await h.flush(15000);
  const update = page(initial, "same1");
  update.fetchedAt = "new-time";
  update.monthTotals.work.grandTotal = 99;
  await act(async () => {
    h.bodies[1]!.resolve(update);
    await vi.advanceTimersByTimeAsync(0);
  });
  await h.flush();
  expect(screen.getByTestId("envelope").textContent).toBe(
    "2|same1|99|new-time|ready",
  );
  expect(h.view().state.displayed!.delivery.data).toBe(update);
  expect(h.view().state.deferred).toBeNull();
  expect(h.draft.edit).toEqual(baseline);
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await h.flush();
  await h.resolve(2, "focus3");
  act(() => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  await h.flush();
  await h.resolve(3, "online4");
  await h.hold(false);
  act(() => {
    void h.query().refetch();
  });
  await h.flush();
  await h.resolve(4, "manual5");
  expect(h.view().state.displayed!.delivery.requestId).toBe(5);
  expect(h.view().state.displayed!.delivery.requestLifetime.generation).toBe(1);
  expect(h.draft.edit).toEqual(baseline);
  h.unmount();
});
it("navigation awaits prior and target cancellation; stale retry closure cannot dispatch under a new generation", async () => {
  const h = await setup();
  await h.resolve(0, "first1");
  const actualCancel = h.client.cancelQueries.bind(h.client);
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const cancel = vi
    .spyOn(h.client, "cancelQueries")
    .mockImplementation(async (...args) => {
      await actualCancel(...args);
      await gate;
    });
  await h.request({ ...initial, page: 3 });
  expect(cancel.mock.calls.map((call) => call[0]?.queryKey?.[6])).toEqual([
    2, 3,
  ]);
  expect(cancel.mock.calls.every((call) => call[0]?.exact)).toBe(true);
  expect(h.bodies).toHaveLength(1);
  await act(async () => {
    release();
  });
  await h.flush();
  expect(h.bodies).toHaveLength(2);
  await h.resolve(1, "second2");
  cancel.mockRestore();
  h.setCode(503);
  act(() => {
    void h.query().refetch();
  });
  await h.flush();
  expect(h.bodies).toHaveLength(3);
  h.setCode(200);
  await h.request(initial);
  await h.resolve(3, "fresh4");
  await h.flush(4000);
  expect(h.bodies.map((body) => body.request.page)).toEqual([2, 3, 3, 2]);
  expect(h.view().state.displayed!.delivery.requestLifetime.generation).toBe(3);
  h.unmount();
});
it("returning to a loaded page dispatches a fresh generation instead of retagging cached data", async () => {
  const h = await setup();
  await h.resolve(0, "loaded1");
  const first = h.view().state.displayed!.delivery;
  await h.request({ ...initial, page: 3 });
  h.client.setQueryData(
    attendanceKeys.page(initial, "owner", first.requestLifetime.epoch),
    first,
  );
  await h.request(initial);
  expect(h.bodies.map((body) => body.request.page)).toEqual([2, 3, 2]);
  expect(h.view().state.displayed!.delivery).toBe(first);
  expect(canPollPage(h.view().state)).toBe(false);
  expect(h.view().state.lifetime.generation).toBe(3);
  await h.resolve(2, "fresh3");
  await h.resolve(1, "late2");
  const fresh = h.view().state.displayed!.delivery;
  expect(fresh.requestLifetime.generation).toBe(3);
  expect(fresh.requestId).toBe(3);
  expect(fresh.data).not.toBe(first.data);
  expect(screen.getByTestId("envelope").textContent).toBe(
    "2|fresh3|3|fresh3|ready",
  );
  h.unmount();
});
it("navigation error keeps old labels and stops polling; manual and invalidation dispatch use the committed context", async () => {
  const h = await setup();
  await h.resolve(0, "old1");
  h.setCode(400);
  await h.request({ ...initial, page: 3 });
  await h.flush(30000);
  expect(h.bodies).toHaveLength(2);
  expect(h.query().isError).toBe(true);
  expect(screen.getByTestId("envelope").textContent).toBe(
    "2|old1|1|old1|old-readonly",
  );
  expect(canPollPage(h.view().state)).toBe(false);
  h.setCode(200);
  act(() => {
    void h.query().refetch();
  });
  await h.flush();
  await h.resolve(2, "manual3");
  expect(h.view().state.displayed!.delivery.requestLifetime.generation).toBe(2);
  expect(h.view().state.displayed!.delivery.requested.page).toBe(3);
  act(() => {
    void invalidateAttendancePages(
      h.client,
      initial.month,
      "owner",
      h.view().state.lifetime.epoch,
    );
  });
  await h.flush();
  await h.resolve(3, "invalidated4");
  expect(h.view().state.displayed!.delivery.requestId).toBe(4);
  expect(h.view().state.displayed!.delivery.requestLifetime.generation).toBe(2);
  expect(screen.getByTestId("envelope").textContent).toBe(
    "3|invalidated4|4|invalidated4|ready",
  );
  h.unmount();
});
it("poll_and_accepted_clamp_share_dispatch_metadata", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "initial1");
  await h.flush(14999);
  expect(h.bodies).toHaveLength(1);
  await h.flush(1);
  expect(h.bodies).toHaveLength(2);
  const actualCancel = h.client.cancelQueries.bind(h.client);
  let release!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const cancel = vi
    .spyOn(h.client, "cancelQueries")
    .mockImplementation(async (...args) => {
      await actualCancel(...args);
      if (args[0]?.queryKey?.[6] === 39) await gate;
    });
  await h.resolve(1, "clamp2", 39);
  const accepted = h.view().state.displayed!.delivery;
  expect(h.view().state.desired.page).toBe(39);
  expect(accepted.requested.page).toBe(40);
  expect(accepted.data.pagination.requestedPage).toBe(40);
  expect(h.view().state.lifetime.generation).toBe(1);
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey[6]),
  ).toEqual([39]);
  expect(h.client.getQueryCache().getAll()[0]!.state.data).toBe(accepted);
  expect(h.bodies).toHaveLength(2);
  // Observer subscription protects the seed while enable awaits cancellation.
  await h.flush(10);
  expect(h.client.getQueryCache().getAll()).toHaveLength(1);
  expect(h.client.getQueryCache().getAll()[0]!.state.data).toBe(accepted);
  expect(h.client.getQueryCache().getAll()[0]!.getObserversCount()).toBe(1);
  expect(h.bodies).toHaveLength(2);
  await act(async () => release());
  await h.flush();
  cancel.mockRestore();
  await h.flush(15000);
  expect(h.bodies.map((b) => b.request.page)).toEqual([40, 40, 39]);
  await h.resolve(2, "next3");
  expect(h.view().state.displayed!.delivery.requestId).toBe(3);
  const beforeUnmount = h.view().state.displayed!.delivery;
  const canonical = h.client.getQueryCache().getAll()[0]!;
  expect(canonical.getObserversCount()).toBe(1);
  const unrelatedKey = ["unrelated"];
  h.client.getQueryCache().build(h.client, {
    queryKey: unrelatedKey,
    gcTime: Infinity,
    initialData: "keep",
  });
  h.visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await h.flush(30000);
  expect(h.bodies).toHaveLength(3);
  h.unmount();
  await h.flush();
  expect(canonical.getObserversCount()).toBe(0);
  expect(
    h.client.getQueryCache().findAll({ queryKey: ["attendance", "page"] }),
  ).toHaveLength(0);
  expect(h.client.getQueryData(unrelatedKey)).toBe("keep");
  expect(vi.getTimerCount()).toBe(0);
  await h.flush(30000);
  expect(h.bodies).toHaveLength(3);
  h.visibility.mockReturnValue("visible");
  await h.remount({ ...initial, page: 39 });
  expect(h.bodies.map((body) => body.request.page)).toEqual([40, 40, 39, 39]);
  expect(h.view().state.displayed).toBeNull();
  expect(h.query().data).toBeUndefined();
  await h.resolve(3, "remount4");
  const fresh = h.view().state.displayed!.delivery;
  expect(fresh).not.toBe(accepted);
  expect(fresh).not.toBe(beforeUnmount);
  expect(fresh.requestId).toBe(1);
  expect(fresh.requested.page).toBe(39);
  expect(screen.getByTestId("envelope").textContent).toBe(
    "39|remount4|4|remount4|ready",
  );
  h.unmount();
  await h.flush();
  expect(
    h.client.getQueryCache().findAll({ queryKey: ["attendance", "page"] }),
  ).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
it("canonical poll body cannot publish after navigation cancels its context", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "clamp1", 39);
  const accepted = h.view().state.displayed!.delivery;
  await h.flush(15000);
  expect(h.bodies.map((body) => body.request.page)).toEqual([40, 39]);
  await h.request({ ...initial, page: 3 });
  expect(h.bodies[1]!.signal.aborted).toBe(true);
  expect(h.view().state.displayed!.delivery).toBe(accepted);
  expect(screen.getByTestId("envelope").textContent).toBe(
    "39|clamp1|1|clamp1|old-readonly",
  );
  await h.resolve(2, "fresh3");
  const fresh = h.view().state.displayed!.delivery;
  await h.resolve(1, "late-canonical2");
  expect(h.view().state.displayed!.delivery).toBe(fresh);
  expect(fresh.requestLifetime.generation).toBe(2);
  expect(fresh.requested.page).toBe(3);
  expect(fresh.requestId).toBe(3);
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
  ).toEqual([fresh]);
  h.unmount();
  await h.flush();
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  await h.flush(30000);
  expect(h.bodies).toHaveLength(3);
});
it("unmount during accepted handoff removes the seed before a canonical observer subscribes", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "initial1");
  await h.hold(true);
  await h.flush(15000);
  await h.resolve(1, "held2", 39);
  await h.hold(false);
  const delivery = h.view().state.deferred!;
  const key = attendanceKeys.page(
    { ...initial, page: 39 },
    "owner",
    delivery.requestLifetime.epoch,
  );
  await act(async () => {
    expect(h.view().accept(delivery)).toBe("accepted");
    adoptAttendancePage(h.client, delivery);
    await vi.advanceTimersByTimeAsync(10);
    const canonical = h.client
      .getQueryCache()
      .find({ queryKey: key, exact: true })!;
    expect(canonical.state.data).toBe(delivery);
    expect(canonical.getObserversCount()).toBe(0);
    h.unmount();
  });
  await h.flush();
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
  await h.flush(30000);
  expect(h.bodies.map((body) => body.request.page)).toEqual([40, 40]);
});
it("held clamp preserves the whole old envelope until release adopts latest delivery", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "initial1");
  const old = h.view().state.displayed;
  const baseline = structuredClone(h.draft.edit);
  await h.hold(true);
  await h.flush(15000);
  await h.resolve(1, "held2", 39);
  expect(h.view().state.displayed).toBe(old);
  expect(h.view().state.desired.page).toBe(40);
  expect(h.view().state.deferred?.requestLifetime.generation).toBe(1);
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey[6]),
  ).toEqual([40]);
  await h.flush(15000);
  await h.resolve(2, "held3", 39);
  expect(h.view().state.deferred?.data.fetchedAt).toBe("held3");
  expect(h.draft.edit).toEqual(baseline);
  await h.hold(false);
  const deferred = h.view().state.deferred!;
  // Perturb only the target cache: equal DTO bytes must not replace its identity.
  h.client.setQueryData(
    attendanceKeys.page(
      { ...initial, page: 39 },
      "owner",
      deferred.requestLifetime.epoch,
    ),
    { ...deferred, requestId: 0, data: structuredClone(deferred.data) },
  );
  await act(async () => {
    if (h.view().accept(deferred) === "accepted") {
      adoptAttendancePage(h.client, deferred);
      expect(
        h.client.getQueryData(
          attendanceKeys.page(
            { ...initial, page: 39 },
            "owner",
            deferred.requestLifetime.epoch,
          ),
        ),
      ).toBe(deferred);
      // Hold the accepted React update until after timers: adoption must not
      // lose the exact seed before the canonical observer can subscribe.
      await vi.advanceTimersByTimeAsync(10);
      expect(
        h.client.getQueryData(
          attendanceKeys.page(
            { ...initial, page: 39 },
            "owner",
            deferred.requestLifetime.epoch,
          ),
        ),
      ).toBe(deferred);
    }
  });
  await h.flush();
  expect(h.view().state.displayed!.delivery).toBe(deferred);
  expect(
    h.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey[6]),
  ).toEqual([39]);
  expect(h.bodies).toHaveLength(3);
  h.unmount();
  await h.flush();
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});
