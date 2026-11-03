// @vitest-environment jsdom
/**
 * File map: page/setup own the shared real hook + view + session composition.
 * gatedHandoff/nativeControl pin Task2 barrier/adoption demand, native refetch
 * Promise/options/cancellation outcomes, automatic reads and explicit retry.
 * Tests below also cover dispatch A/B/A, reauthentication, polling, cancel/retry,
 * cached return and clamp handoff. public_handoff_* covers pre-commit absence,
 * target identity, consume-once and candidate guards; lifecycle cases below
 * retain observer/GC, delayed-body and held-envelope assertions.
 * Kept together because these interleavings share one real producer/view owner.
 */
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  CancelledError,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import type {
  RefetchOptions,
  QueryObserverResult,
  UseQueryResult,
} from "@tanstack/react-query";
import { ApiError } from "@/shared/api/transport";
import {
  SessionProvider,
  SessionRuntime,
  useSession,
} from "@/features/session/index";
import { sessionBoundary } from "@/shared/api/session-boundary";
import { usePageView } from "./use-page-view";
import { canPollPage } from "./page-view";
import type { PageDelivery } from "./page-view";
import { useAttendancePage } from "../api/use-attendance-page";
import {
  attendanceKeys,
  invalidateAttendancePages,
  invalidateAttendanceScope,
} from "../api/query-keys";
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
  // Absolute expiry is fixed within one server session; idle expiry can slide.
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  vi.stubGlobal("fetch", async (path: string, options: RequestInit) => {
    if (path.includes("/auth/logout"))
      return new Response(null, { status: 204 });
    if (path.includes("/auth/"))
      return Response.json({
        user: { userId: user, username: user },
        expiresAt,
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
  let candidateOverride:
    ((delivery: PageDelivery) => PageDelivery | null) | null = null;
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
    const displayed = view.state.displayed?.delivery ?? null;
    const result = useAttendancePage(
      view.state.desired,
      view.state.lifetime,
      canPollPage(view.state),
      displayed && candidateOverride ? candidateOverride(displayed) : displayed,
    );
    query = result;
    const { accept } = view;
    useEffect(() => {
      if (!result.data) return;
      deliveries.push(result.data);
      const decision = accept(result.data);
      decisions.push(decision);
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
    accept: (delivery: PageDelivery) => {
      const decision = current.accept(delivery);
      return decision;
    },
    overrideCandidate: (
      override: (delivery: PageDelivery) => PageDelivery | null,
    ) => {
      candidateOverride = override;
      act(() => rendered.rerender(wrapper()));
    },
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

it("public_handoff_has_no_inactive_seed_before_canonical_render", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "initial1");
  await h.hold(true);
  await h.flush(15000);
  await h.resolve(1, "held2", 39);
  await h.hold(false);
  const accepted = h.view().state.deferred!;
  const key = attendanceKeys.page(
    { ...initial, page: 39 },
    "owner",
    accepted.requestLifetime.epoch,
  );
  const beforeHandoffHttpCount = h.bodies.length;
  await act(async () => {
    expect(h.accept(accepted)).toBe("accepted");
    // accept has run, but React has not committed the canonical render.
    expect(h.client.getQueryData(key)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.client.getQueryData(key)).toBeUndefined();
  });
  await h.flush();
  expect(accepted.requested.page).toBe(40);
  expect(accepted.data.pagination.requestedPage).toBe(40);
  expect(h.view().state.desired.page).toBe(39);
  expect(h.view().state.lifetime.generation).toBe(
    accepted.requestLifetime.generation,
  );
  expect(h.client.getQueryData(key)).toBe(accepted);
  expect(h.view().state.displayed!.delivery.data).toBe(accepted.data);
  expect(h.bodies).toHaveLength(beforeHandoffHttpCount);
  h.unmount();
  await h.flush();
  expect(h.client.getQueryCache().getAll()).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

async function gatedHandoff(
  preinvalidated = false,
  beforeBarrier?: (delivery: PageDelivery) => PageDelivery | null,
) {
  const h = await setup({ ...initial, page: 40 });
  const staleRefetch = h.query().refetch;
  const key = attendanceKeys.page(
    { ...initial, page: 39 },
    "owner",
    h.view().state.lifetime.epoch,
  );
  if (preinvalidated) {
    h.client.setQueryData(key, {
      requested: { ...initial, page: 40 },
      requestLifetime: h.view().state.lifetime,
      requestId: 0,
      data: page({ ...initial, page: 40 }, "stale", 39),
    });
    await h.client.invalidateQueries({
      queryKey: key,
      exact: true,
      refetchType: "none",
    });
  }
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
  if (beforeBarrier) h.overrideCandidate(beforeBarrier);
  await h.resolve(0, "clamp1", 39);
  const accepted = h.view().state.displayed!.delivery;
  return {
    ...h,
    accepted,
    staleRefetch,
    key,
    release: async () => {
      await act(async () => release());
      await h.flush();
      cancel.mockRestore();
    },
  };
}

it.each(["manual", "month", "scope", "target", "already-invalidated", "many"])(
  "fresh_read_during_handoff_is_one_canonical_http_read: %s",
  async (trigger) => {
    const h = await gatedHandoff(trigger === "already-invalidated");
    const epoch = h.accepted.requestLifetime.epoch;
    const baseline = structuredClone(h.draft.edit);
    const settled = vi.fn();
    if (trigger === "manual" || trigger === "many")
      void h.query().refetch().then(settled);
    if (trigger === "month" || trigger === "many")
      void invalidateAttendancePages(h.client, initial.month, "owner", epoch);
    if (trigger === "scope" || trigger === "many")
      void invalidateAttendanceScope(h.client, "owner", epoch);
    if (trigger === "target") {
      h.client.setQueryData(h.key, { ...h.accepted });
      void h.client.invalidateQueries({ queryKey: h.key, exact: true });
    }
    await h.flush();
    expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
    expect(settled).not.toHaveBeenCalled();
    await h.release();
    expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
    expect(settled).not.toHaveBeenCalled();
    await h.resolve(1, "fresh2");
    const fresh = h.query().data!;
    expect(fresh.requestId).toBe(h.accepted.requestId + 1);
    expect(fresh.requestLifetime).toEqual(h.accepted.requestLifetime);
    expect(fresh.requested).toEqual({ ...initial, page: 39 });
    expect(h.view().state.displayed!.delivery).toBe(fresh);
    expect(fresh).not.toBe(h.accepted);
    expect(h.draft.edit).toEqual(baseline);
    expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
    h.unmount();
  },
);

it("refetch_wrapper_waits_for_canonical_http_and_settles_each_caller", async () => {
  const h = await gatedHandoff();
  const refetch: UseQueryResult<PageDelivery, Error>["refetch"] =
    h.query().refetch;
  const options: RefetchOptions = { cancelRefetch: true, throwOnError: true };
  const settled = vi.fn();
  const pendingA = refetch();
  const pendingB: Promise<QueryObserverResult<PageDelivery, Error>> =
    refetch(options);
  void pendingA.then(settled, settled);
  void pendingB.then(settled, settled);
  await h.flush();
  expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
  expect(settled).not.toHaveBeenCalled();
  await h.release();
  expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
  expect(settled).not.toHaveBeenCalled();
  await h.resolve(1, "fresh2");
  const fresh = h.view().state.displayed!.delivery;
  for (const pending of [pendingA, pendingB]) {
    const result = await pending;
    expect(result).toMatchObject({
      status: "success",
      error: null,
      fetchStatus: "idle",
    });
    expect(result.data).toBe(fresh);
  }
  expect(fresh.requestId).toBe(h.accepted.requestId + 1);
  expect(fresh.requestLifetime).toEqual(h.accepted.requestLifetime);
  expect(fresh.requested.page).toBe(39);
  expect(fresh).not.toBe(h.accepted);
  h.unmount();
});

it("refetch_wrapper_preserves_default_error_and_throwOnError", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "clamp1", 39);
  const accepted = h.query().data;
  h.setCode(400);
  const pending = h.query().refetch();
  await h.flush();
  const result = await pending;
  expect(result).toMatchObject({ status: "error", isError: true });
  expect(result.error).toBeInstanceOf(ApiError);
  expect(result.error).toMatchObject({ status: 400 });
  expect(result.error).toBe(
    h.client.getQueryState(h.client.getQueryCache().getAll()[0]!.queryKey)
      ?.error,
  );
  expect(result.data).toBe(accepted);
  const rejected = vi.fn();
  const throwing = h.query().refetch({ throwOnError: true });
  void throwing.catch(rejected);
  await h.flush();
  expect(rejected).toHaveBeenCalledWith(h.query().error);
  expect(rejected.mock.calls[0]![0]).not.toBe(result.error);
  expect(rejected.mock.calls[0]![0]).toBeInstanceOf(ApiError);
  expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39, 39]);
  h.unmount();
});

it("refetch_wrapper_preserves_default_error_and_throwOnError_for_queued_callers", async () => {
  const h = await gatedHandoff();
  h.setCode(400);
  const fulfilled = vi.fn();
  const rejected = vi.fn();
  const pending = h.query().refetch();
  const throwing = h
    .query()
    .refetch({ throwOnError: true, cancelRefetch: true });
  void pending.then(fulfilled, rejected);
  void throwing.then(fulfilled, rejected);
  await h.flush();
  expect(fulfilled).not.toHaveBeenCalled();
  expect(rejected).not.toHaveBeenCalled();
  await h.release();
  const result = await pending;
  expect(result).toMatchObject({ status: "error", data: undefined });
  expect(result.error).toBeInstanceOf(ApiError);
  expect(result.error).toMatchObject({ status: 400 });
  expect(result.error).toBe(h.query().error);
  expect(rejected).toHaveBeenCalledExactlyOnceWith(result.error);
  expect(fulfilled).toHaveBeenCalledTimes(1);
  expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
  h.setCode(200);
  const retry = h.query().refetch();
  await h.flush();
  expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39, 39]);
  await h.resolve(2, "retry3");
  const fresh = (await retry).data!;
  expect(fresh).toBe(h.view().state.displayed!.delivery);
  expect(fresh.requestId).toBe(h.accepted.requestId + 2);
  expect(fresh.requestLifetime).toEqual(h.accepted.requestLifetime);
  h.unmount();
});

// Oracle for the wrapper: public core observer with the same data/signal shape.
function nativeControl(data?: PageDelivery) {
  const client = new QueryClient();
  clients.push(client);
  const bodies: {
    signal: AbortSignal;
    resolve: (data: PageDelivery) => void;
  }[] = [];
  const observer = new QueryObserver<
    PageDelivery,
    Error,
    PageDelivery | undefined
  >(client, {
    queryKey: ["native-control"],
    enabled: true,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    _optimisticResults: "optimistic",
    structuralSharing: false,
    ...(data ? { initialData: data } : {}),
    queryFn: ({ signal }) =>
      new Promise<PageDelivery>((resolve) => bodies.push({ signal, resolve })),
  });
  const detach = observer.subscribe(() => {});
  return { client, observer, bodies, detach };
}
const outcome = (
  result: QueryObserverResult<PageDelivery | undefined, Error>,
) => ({
  data: result.data,
  error: result.error,
  status: result.status,
  fetchStatus: result.fetchStatus,
});

it.each(
  [true, false].flatMap((withData) =>
    [undefined, true, false].map((cancelRefetch) => ({
      withData,
      cancelRefetch,
    })),
  ),
)(
  "refetch_wrapper_preserves_cancelRefetch_and_signal_guards: data=$withData cancel=$cancelRefetch",
  async ({ withData, cancelRefetch }) => {
    const h = await setup({ ...initial, page: withData ? 40 : 39 });
    if (withData) await h.resolve(0, "clamp1", 39);
    const accepted = h.query().data;
    const control = nativeControl(accepted);
    const options = cancelRefetch === undefined ? undefined : { cancelRefetch };
    const settled = vi.fn();
    const first = h.query().refetch({ cancelRefetch: false });
    const nativeFirst = control.observer.refetch({ cancelRefetch: false });
    await h.flush();
    const firstIndex = withData ? 1 : 0;
    const second = h.query().refetch(options);
    const nativeSecond = control.observer.refetch(options);
    void first.then(settled, settled);
    void second.then(settled, settled);
    await h.flush();
    const replace = withData && cancelRefetch !== false;
    expect(h.bodies[firstIndex]!.signal.aborted).toBe(replace);
    expect(control.bodies[0]!.signal.aborted).toBe(replace);
    expect(h.bodies.map((b) => b.request.page)).toEqual(
      withData ? (replace ? [40, 39, 39] : [40, 39]) : [39],
    );
    expect(settled).not.toHaveBeenCalled();
    if (replace) {
      await h.resolve(firstIndex, "late-old");
      expect(h.view().state.displayed!.delivery).toBe(accepted);
      expect(h.query().data).toBe(accepted);
      expect(settled).not.toHaveBeenCalled();
    }
    await h.resolve(firstIndex + (replace ? 1 : 0), "fresh3");
    const fresh = h.query().data!;
    control.bodies.at(-1)!.resolve(fresh);
    const actual = await Promise.all([first, second]);
    const native = await Promise.all([nativeFirst, nativeSecond]);
    expect(actual.map(outcome)).toEqual(native.map(outcome));
    expect(actual.every((r) => r.data === fresh)).toBe(true);
    expect(h.view().state.displayed!.delivery).toBe(fresh);
    expect(fresh.requested.page).toBe(39);
    if (accepted)
      expect(fresh.requestLifetime).toEqual(accepted.requestLifetime);
    control.detach();
    h.unmount();
  },
);

it.each(["navigation", "unmount", "expire"] as const)(
  "refetch_wrapper_preserves_cancelRefetch_and_signal_guards: queued %s settles without dispatch",
  async (action) => {
    const h = await gatedHandoff();
    const defaultSettled = vi.fn();
    const throwSettled = vi.fn();
    const pending = h.query().refetch();
    const throwing = h
      .query()
      .refetch({ throwOnError: true, cancelRefetch: true });
    void pending.then(defaultSettled, defaultSettled);
    void throwing.then(throwSettled, throwSettled);
    await h.flush();
    expect(defaultSettled).not.toHaveBeenCalled();
    expect(throwSettled).not.toHaveBeenCalled();
    if (action === "navigation") await h.request({ ...initial, page: 3 });
    else if (action === "unmount") h.unmount();
    else act(() => h.runtime.expire());
    await h.flush();
    expect(defaultSettled).toHaveBeenCalledTimes(1);
    expect(throwSettled).toHaveBeenCalledTimes(1);
    expect(throwSettled.mock.calls[0]![0]).toBeInstanceOf(CancelledError);
    await h.release();
    const expected = action === "navigation" ? [40, 3] : [40];
    expect(h.bodies.map((b) => b.request.page)).toEqual(expected);
    if (action === "navigation") await h.resolve(1, "destination2");
    const displayed = h.view().state.displayed?.delivery;
    await h.staleRefetch();
    h.visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await h.flush(30000);
    expect(h.bodies.map((b) => b.request.page)).toEqual(expected);
    expect(h.view().state.displayed?.delivery).toBe(displayed);
    if (action !== "unmount") h.unmount();
  },
);

it.each(["navigation", "unmount", "expire"] as const)(
  "refetch_wrapper_preserves_cancelRefetch_and_signal_guards: initial queued %s matches native no-data cancellation",
  async (action) => {
    const actualCancel = QueryClient.prototype.cancelQueries;
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const cancel = vi
      .spyOn(QueryClient.prototype, "cancelQueries")
      .mockImplementation(async function (this: QueryClient, ...args) {
        await actualCancel.apply(this, args);
        if (args[0]?.queryKey?.[6] === 39) await gate;
      });
    const h = await setup({ ...initial, page: 39 });
    const control = nativeControl();
    const settled = vi.fn();
    const throwingSettled = vi.fn();
    const pending = h.query().refetch();
    const throwing = h
      .query()
      .refetch({ cancelRefetch: true, throwOnError: true });
    void pending.then(settled, settled);
    void throwing.then(throwingSettled, throwingSettled);
    const nativePending = control.observer.refetch({ cancelRefetch: false });
    const nativeThrowing = control.observer.refetch({
      cancelRefetch: false,
      throwOnError: true,
    });
    const nativeRejected = vi.fn();
    void nativeThrowing.catch(nativeRejected);
    control.observer.setOptions({
      ...control.observer.options,
      enabled: false,
    });
    await control.client.cancelQueries();
    await h.flush();
    expect(settled).not.toHaveBeenCalled();
    expect(throwingSettled).not.toHaveBeenCalled();
    expect(h.bodies).toHaveLength(0);
    if (action === "navigation") await h.request({ ...initial, page: 3 });
    else if (action === "unmount") h.unmount();
    else act(() => h.runtime.expire());
    await h.flush();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(throwingSettled).toHaveBeenCalledTimes(1);
    expect(outcome(await pending)).toEqual(outcome(await nativePending));
    expect(throwingSettled.mock.calls[0]![0]).toBeInstanceOf(CancelledError);
    expect(throwingSettled.mock.calls[0]![0]).toEqual(
      nativeRejected.mock.calls[0]![0],
    );
    await act(async () => release());
    await h.flush();
    cancel.mockRestore();
    if (action === "navigation") await h.resolve(0, "destination1");
    h.visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await h.flush(30000);
    expect(h.bodies.map((b) => b.request.page)).toEqual(
      action === "navigation" ? [3] : [],
    );
    control.detach();
    if (action !== "unmount") h.unmount();
  },
);

it.each(
  [true, false].flatMap((withData) =>
    ["navigation", "unmount", "expire"].flatMap((action) =>
      [undefined, true, false].map((cancelRefetch) => ({
        withData,
        action,
        cancelRefetch,
      })),
    ),
  ),
)(
  "refetch_wrapper_preserves_cancelRefetch_and_signal_guards: HTTP data=$withData $action cancel=$cancelRefetch",
  async ({ withData, action, cancelRefetch }) => {
    const h = await setup({ ...initial, page: withData ? 40 : 39 });
    if (withData) await h.resolve(0, "clamp1", 39);
    const accepted = h.query().data;
    const baseline = structuredClone(h.draft.edit);
    const control = nativeControl(accepted);
    const pending = h.query().refetch({ cancelRefetch: false });
    const options: RefetchOptions = {
      ...(cancelRefetch === undefined ? {} : { cancelRefetch }),
      throwOnError: true,
    };
    const throwing = h.query().refetch(options);
    const nativePending = control.observer.refetch({ cancelRefetch: false });
    const nativeThrowing = control.observer.refetch(options);
    const settled = vi.fn();
    const nativeSettled = vi.fn();
    const record = (
      p: Promise<QueryObserverResult<PageDelivery | undefined, Error>>,
    ) =>
      p.then(
        (r) => ({ result: outcome(r) }),
        (error) => ({ error }),
      );
    const actualOutcomes = Promise.all([
      record(pending),
      record(throwing),
    ]).then((r) => {
      settled(r);
      return r;
    });
    const nativeOutcomes = Promise.all([
      record(nativePending),
      record(nativeThrowing),
    ]).then((r) => {
      nativeSettled(r);
      return r;
    });
    await h.flush();
    expect(settled).not.toHaveBeenCalled();
    if (action === "navigation") {
      // During the barrier React retains the prior key but suppresses delivery.
      control.observer.setOptions({
        ...control.observer.options,
        enabled: false,
        select: () => undefined,
      });
      await control.client.cancelQueries();
      await h.request({ ...initial, page: 3 });
    } else if (action === "unmount") {
      control.detach();
      h.unmount();
    } else {
      // Session clear switches to an empty, disabled epoch before refetch settles.
      const canceled = control.client.cancelQueries();
      control.client.clear();
      const options = { ...control.observer.options };
      delete options.initialData;
      control.observer.setOptions({
        ...options,
        queryKey: ["expired"],
        enabled: false,
      });
      await canceled;
      act(() => h.runtime.expire());
    }
    await h.flush();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(nativeSettled).toHaveBeenCalledTimes(1);
    const actual = await actualOutcomes;
    const native = await nativeOutcomes;
    for (let n = 0; n < 2; n++) {
      if ("error" in native[n]!)
        expect(actual[n]).toMatchObject({ error: expect.any(CancelledError) });
      else expect(actual[n]).toEqual(native[n]);
    }
    const oldIndex = withData ? 1 : 0;
    expect(h.bodies[oldIndex]!.signal.aborted).toBe(true);
    expect(control.bodies[0]!.signal.aborted).toBe(true);
    const replaced = withData && cancelRefetch !== false;
    const activeIndex = oldIndex + (replaced ? 1 : 0);
    expect(h.bodies[activeIndex]!.signal.aborted).toBe(true);
    expect(h.bodies.map((b) => b.request.page)).toEqual(
      action === "navigation"
        ? withData
          ? replaced
            ? [40, 39, 39, 3]
            : [40, 39, 3]
          : [39, 3]
        : withData
          ? replaced
            ? [40, 39, 39]
            : [40, 39]
          : [39],
    );
    if (action === "navigation")
      await h.resolve(activeIndex + 1, "destination");
    const displayed = h.view().state.displayed?.delivery;
    await h.resolve(oldIndex, "ignored-late");
    if (replaced) await h.resolve(activeIndex, "ignored-replacement");
    expect(h.view().state.displayed?.delivery).toBe(displayed);
    expect(h.draft.edit).toEqual(baseline);
    const count = h.bodies.length;
    // Hide the current destination: this check isolates canceled hidden work.
    h.visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await h.flush(30000);
    expect(h.bodies).toHaveLength(count);
    expect(
      h.client
        .getQueryCache()
        .getAll()
        .some(
          (q) =>
            (q.state.data as PageDelivery | undefined)?.data.fetchedAt ===
            "ignored-late",
        ),
    ).toBe(false);
    expect(
      h.client
        .getQueryCache()
        .getAll()
        .some(
          (q) =>
            (q.state.data as PageDelivery | undefined)?.data.fetchedAt ===
            "ignored-replacement",
        ),
    ).toBe(false);
    if (action !== "unmount") {
      control.detach();
      h.unmount();
    }
  },
);

it.each([
  "manual",
  "month",
  "scope",
  "target",
  "focus",
  "reconnect",
  "many",
] as const)(
  "fresh_read_during_handoff_after_local_queryFn_start_waits_for_adoption: %s",
  async (trigger) => {
    const h = await setup({ ...initial, page: 40 });
    let pendingA: Promise<QueryObserverResult<PageDelivery, Error>> | undefined;
    let pendingB: Promise<QueryObserverResult<PageDelivery, Error>> | undefined;
    const settled = vi.fn();
    const stop = h.client.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "fetch" &&
        event.query.queryKey[6] === 39
      ) {
        stop();
        queueMicrotask(() => {
          const epoch = h.view().state.lifetime.epoch;
          if (trigger === "manual" || trigger === "many") {
            pendingA = h.query().refetch();
            pendingB = h
              .query()
              .refetch({ throwOnError: true, cancelRefetch: true });
            void pendingA.then(settled, settled);
            void pendingB.then(settled, settled);
          }
          if (trigger === "month" || trigger === "many")
            void invalidateAttendancePages(
              h.client,
              initial.month,
              "owner",
              epoch,
            );
          if (trigger === "scope" || trigger === "many")
            void invalidateAttendanceScope(h.client, "owner", epoch);
          if (trigger === "target" || trigger === "many")
            void h.client.invalidateQueries({
              queryKey: attendanceKeys.page(
                { ...initial, page: 39 },
                "owner",
                epoch,
              ),
              exact: true,
            });
          if (trigger === "focus" || trigger === "many") {
            focusManager.setFocused(false);
            focusManager.setFocused(true);
          }
          if (trigger === "reconnect" || trigger === "many") {
            onlineManager.setOnline(false);
            onlineManager.setOnline(true);
          }
          expect(settled).not.toHaveBeenCalled();
        });
      }
    });
    await h.resolve(0, "clamp1", 39);
    const accepted = h.view().state.displayed!.delivery;
    if (trigger === "manual" || trigger === "many")
      expect(pendingA).toBeDefined();
    expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
    expect(settled).not.toHaveBeenCalled();
    await h.resolve(1, "fresh2");
    const fresh = h.query().data;
    if (pendingA && pendingB) {
      expect((await pendingA).data).toBe(fresh);
      expect((await pendingB).data).toBe(fresh);
    }
    expect(fresh!.requestId).toBe(accepted.requestId + 1);
    expect(fresh!.requestLifetime).toEqual(accepted.requestLifetime);
    expect(h.view().state.displayed!.delivery).toBe(fresh);
    h.unmount();
  },
);

it("handoff_poll_focus_reconnect_hidden_drops_queued_work_and_stale_callback", async () => {
  const h = await gatedHandoff();
  const settled = vi.fn();
  const pending = h.query().refetch();
  void pending.then(settled, settled);
  await h.flush();
  expect(settled).not.toHaveBeenCalled();
  h.visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await h.flush();
  expect(settled).toHaveBeenCalledTimes(1);
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await h.release();
  await h.flush(30000);
  expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
  h.visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await h.flush();
  expect(h.query().data).toBe(h.accepted);
  await h.staleRefetch();
  await h.flush();
  expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
  h.unmount();
});

it.each(["poll", "focus", "reconnect"] as const)(
  "handoff_poll_focus_reconnect_reads_canonical_without_local_replay: %s",
  async (trigger) => {
    const h = await gatedHandoff();
    await h.flush(14999);
    expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
    await h.flush(1);
    if (trigger === "focus") {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    }
    if (trigger === "reconnect") {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    }
    await h.flush();
    expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
    await h.release();
    if (trigger === "poll") {
      expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
      await h.flush(14999);
      expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
      await h.flush(1);
    }
    expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
    await h.resolve(1, "fresh2");
    expect(h.query().data!.requested.page).toBe(39);
    expect(h.query().data!.requestId).toBe(h.accepted.requestId + 1);
    if (trigger !== "poll") {
      if (trigger === "focus") {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      } else {
        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
      }
      await h.flush();
      expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39, 39]);
      await h.resolve(2, "fresh3");
    }
    h.unmount();
  },
);

it.each([
  "lost",
  "cancel-after-consume",
  "replaced-during-consume",
  "lost-during-consume",
  "wrong-before-barrier",
] as const)(
  "lost_or_canceled_current_handoff_exposes_retry_without_seed_loop: %s",
  async (variant) => {
    const h = await gatedHandoff(
      false,
      variant === "wrong-before-barrier"
        ? (delivery) => ({
            ...delivery,
            requested: { ...delivery.requested, q: "wrong" },
          })
        : undefined,
    );
    if (variant === "lost") h.overrideCandidate(() => null);
    else if (variant !== "wrong-before-barrier") {
      const stop = h.client.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.action.type === "fetch" &&
          event.query.queryKey[6] === 39
        ) {
          stop();
          queueMicrotask(() => {
            if (variant === "cancel-after-consume")
              void h.client.cancelQueries({ queryKey: h.key, exact: true });
            else
              h.overrideCandidate((delivery) =>
                variant === "lost-during-consume" ? null : { ...delivery },
              );
          });
        }
      });
    }
    await h.release();
    expect(h.query().isError).toBe(true);
    expect(h.query().fetchStatus).toBe("idle");
    expect(h.view().state.displayed!.delivery).toBe(h.accepted);
    expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
    await h.flush(30000);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await h.flush();
    expect(h.bodies.map((b) => b.request.page)).toEqual([40]);
    const pending = h.query().refetch();
    await h.flush();
    expect(h.bodies.map((b) => b.request.page)).toEqual([40, 39]);
    await h.resolve(1, "retry2");
    expect((await pending).data).toBe(h.view().state.displayed!.delivery);
    expect(h.query().data!.requestId).toBe(h.accepted.requestId + 1);
    h.unmount();
  },
);

it.each(["same lifetime and requestId", "old generation"])(
  "public_handoff_evicts_equal_byte_wrong_reference_target: %s",
  async (variant) => {
    const h = await setup({ ...initial, page: 40 });
    await h.resolve(0, "initial1");
    await h.hold(true);
    await h.flush(15000);
    await h.resolve(1, "held2", 39);
    await h.hold(false);
    const accepted = h.view().state.deferred!;
    const key = attendanceKeys.page(
      { ...initial, page: 39 },
      "owner",
      accepted.requestLifetime.epoch,
    );
    const stale = {
      ...accepted,
      requestLifetime: {
        ...accepted.requestLifetime,
        generation:
          variant === "old generation"
            ? 0
            : accepted.requestLifetime.generation,
      },
      data: structuredClone(accepted.data),
    };
    expect(stale.data).toEqual(accepted.data);
    expect(stale).not.toBe(accepted);
    h.client.setQueryData(key, stale);
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
    act(() => {
      expect(h.accept(accepted)).toBe("accepted");
    });
    expect(h.query().data).toBeUndefined();
    expect(h.view().state.displayed!.delivery).toBe(accepted);
    await act(async () => release());
    await h.flush();
    cancel.mockRestore();
    expect(h.client.getQueryData(key)).toBe(accepted);
    expect(h.view().state.displayed!.delivery).toBe(accepted);
    expect(h.bodies).toHaveLength(2);
    expect(h.client.getQueryCache().getAll()).toHaveLength(1);
    expect(h.client.getQueryCache().getAll()[0]!.getObserversCount()).toBe(1);
    h.unmount();
    await h.flush();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("public_handoff_duplicate_delivery_does_not_adopt_twice", async () => {
  const h = await setup({ ...initial, page: 40 });
  await h.resolve(0, "clamp1", 39);
  const accepted = h.view().state.displayed!.delivery;
  act(() => {
    expect(h.accept(accepted)).toBe("ignored");
  });
  await h.hold(false);
  act(() => {
    expect(h.accept(accepted)).toBe("ignored");
  });
  await h.flush();
  expect(h.query().data).toBe(accepted);
  expect(h.view().state.lastAcceptedRequestId).toBe(accepted.requestId);
  expect(
    h.decisions.filter((decision) => decision === "accepted"),
  ).toHaveLength(1);
  expect(h.bodies).toHaveLength(1);
  await h.flush(15000);
  expect(h.bodies.map((body) => body.request.page)).toEqual([40, 39]);
  await h.resolve(1, "poll2");
  expect(h.view().state.displayed!.delivery.requestId).toBe(2);
  h.unmount();
});

it.each([
  "userId",
  "epoch",
  "generation",
  "month",
  "q",
  "pageSize",
  "effective-page",
])(
  "public_handoff_rejects_wrong_user_epoch_generation_criteria: %s",
  async (field) => {
    const h = await setup({ ...initial, page: 40 });
    await h.resolve(0, "initial1");
    await h.hold(true);
    await h.flush(15000);
    await h.resolve(1, "held2", 39);
    await h.hold(false);
    const accepted = h.view().state.deferred!;
    h.overrideCandidate((delivery) => ({
      ...delivery,
      requestLifetime: {
        ...delivery.requestLifetime,
        ...(field === "userId" ? { userId: "other" } : {}),
        ...(field === "epoch"
          ? { epoch: delivery.requestLifetime.epoch + 1 }
          : {}),
        ...(field === "generation"
          ? { generation: delivery.requestLifetime.generation + 1 }
          : {}),
      },
      requested: {
        ...delivery.requested,
        ...(field === "month" ? { month: "2024-03" } : {}),
        ...(field === "q" ? { q: "other" } : {}),
        ...(field === "pageSize" ? { pageSize: 50 as const } : {}),
      },
      data:
        field === "effective-page"
          ? {
              ...delivery.data,
              pagination: { ...delivery.data.pagination, page: 38 },
            }
          : delivery.data,
    }));
    act(() => {
      expect(h.accept(accepted)).toBe("accepted");
    });
    await h.flush();
    expect(h.query().data).toBeUndefined();
    expect(h.view().state.displayed!.delivery).toBe(accepted);
    h.unmount();
    await h.flush();
    expect(vi.getTimerCount()).toBe(0);
  },
);
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
  ).toEqual([40]);
  expect(h.query().data).toBeUndefined();
  expect(h.bodies).toHaveLength(2);
  expect(h.view().state.displayed!.delivery).toBe(accepted);
  // The requested observer stays attached until target eviction completes.
  await h.flush(10);
  expect(h.client.getQueryCache().getAll()).toHaveLength(1);
  expect(h.query().data).toBeUndefined();
  expect(
    h.client.getQueryData(
      attendanceKeys.page(
        { ...initial, page: 39 },
        "owner",
        accepted.requestLifetime.epoch,
      ),
    ),
  ).toBeUndefined();
  expect(h.client.getQueryCache().getAll()[0]!.getObserversCount()).toBe(1);
  expect(h.bodies).toHaveLength(2);
  await act(async () => release());
  await h.flush();
  cancel.mockRestore();
  expect(h.client.getQueryCache().getAll()[0]!.state.data).toBe(accepted);
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
it("same-key generation retires the canonical instance without retaining a GC timer", async () => {
  const h = await setup({ ...initial, page: 40 });
  const canonicalCriteria = { ...initial, page: 39 };
  expect(h.view().state.displayed).toBeNull();
  await h.flush(10); // Response.json remains pending, independently of fetch.
  expect(h.bodies).toHaveLength(1);
  await h.resolve(0, "clamp1", 39);
  const accepted = h.view().state.displayed!.delivery;
  const retired = h.client.getQueryCache().getAll()[0]!;
  expect(retired.state.data).toBe(accepted);
  expect(retired.getObserversCount()).toBe(1);
  expect(h.view().state.lifetime.generation).toBe(1);
  await h.request(canonicalCriteria);
  expect(h.view().state.lifetime.generation).toBe(2);
  expect(h.view().state.displayed!.delivery).toBe(accepted);
  expect(canPollPage(h.view().state)).toBe(false);
  expect(h.bodies.map((body) => body.request.page)).toEqual([40, 39]);
  await h.resolve(1, "generation2");
  const fresh = h.view().state.displayed!.delivery;
  const active = h.client.getQueryCache().getAll()[0]!;
  expect(active).not.toBe(retired);
  expect(active.queryKey).toEqual(retired.queryKey);
  expect(retired.getObserversCount()).toBe(0);
  expect(active.getObserversCount()).toBe(1);
  expect(fresh.requestLifetime.generation).toBe(2);
  expect(fresh.requestId).toBe(2);
  expect(fresh).not.toBe(accepted);
  expect(screen.getByTestId("envelope").textContent).toBe(
    "39|generation2|2|generation2|ready",
  );
  const unrelatedKey = ["unrelated"];
  h.client.getQueryCache().build(h.client, {
    queryKey: unrelatedKey,
    gcTime: Infinity,
    initialData: "keep",
  });
  h.unmount();
  await h.flush();
  expect(retired.getObserversCount()).toBe(0);
  expect(active.getObserversCount()).toBe(0);
  expect(
    h.client.getQueryCache().findAll({ queryKey: ["attendance", "page"] }),
  ).toHaveLength(0);
  expect(h.client.getQueryData(unrelatedKey)).toBe("keep");
  // The retired Query is absent from the cache: namespace0 alone misses I1.
  expect(vi.getTimerCount()).toBe(0);
  await h.flush(30000);
  expect(h.bodies).toHaveLength(2);
  await h.remount(canonicalCriteria);
  const remountLifetime = h.view().state.lifetime;
  expect(h.bodies.map((body) => body.request.page)).toEqual([40, 39, 39]);
  expect(h.view().state.displayed).toBeNull();
  expect(h.query().data).toBeUndefined();
  await h.resolve(2, "remount3");
  const remounted = h.view().state.displayed!.delivery;
  expect(remounted).not.toBe(fresh);
  expect(remounted.requestId).toBe(1);
  expect(remounted.requestLifetime).toEqual(remountLifetime);
  expect(remounted.data.fetchedAt).toBe("remount3");
  h.unmount();
  await h.flush();
  expect(
    h.client.getQueryCache().findAll({ queryKey: ["attendance", "page"] }),
  ).toHaveLength(0);
  expect(h.client.getQueryData(unrelatedKey)).toBe("keep");
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
it("unmount during accepted handoff creates no seed before a canonical observer subscribes", async () => {
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
    await vi.advanceTimersByTimeAsync(10);
    expect(h.client.getQueryData(key)).toBeUndefined();
    expect(
      h.client.getQueryCache().find({ queryKey: key, exact: true }),
    ).toBeUndefined();
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
  const canonicalKey = attendanceKeys.page(
    { ...initial, page: 39 },
    "owner",
    deferred.requestLifetime.epoch,
  );
  const stale = {
    ...deferred,
    requestId: 0,
    data: structuredClone(deferred.data),
  };
  h.client.setQueryData(canonicalKey, stale);
  await act(async () => {
    if (h.view().accept(deferred) === "accepted") {
      expect(h.client.getQueryData(canonicalKey)).toBe(stale);
      // Delayed React commit keeps the delivery in the view, without publishing
      // over the stale cache target before the cancellation barrier.
      await vi.advanceTimersByTimeAsync(10);
      expect(h.client.getQueryData(canonicalKey)).toBe(stale);
    }
  });
  await h.flush();
  expect(h.view().state.displayed!.delivery).toBe(deferred);
  expect(h.client.getQueryData(canonicalKey)).toBe(deferred);
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
