/**
 * File map: useAttendancePage owns one binding and its cancellation barrier.
 * flushDemand joins queued callers to the native observer after local adoption;
 * the layout subscription records only transition demand, never server payloads.
 * queryFn owns consume-once handoff and guarded HTTP dispatch. Refetch options
 * and cancellation after dispatch remain native TanStack observer behavior.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CancelledError,
  focusManager,
  onlineManager,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  QueryObserverResult,
  RefetchOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { useSession } from "@/features/session/index";
import { retryRead, readRetryDelay } from "@/shared/api/reconcile";
import { ApiError } from "@/shared/api/transport";
import { readAttendancePage } from "./attendance";
import { attendanceKeys } from "./query-keys";
import { samePageCriteria, samePageLifetime } from "../model/page-view";
import type { PageDelivery, PageLifetime } from "../model/page-view";
import type { PageCriteria } from "../model/types";

const subscribe = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
class StalePageRequest extends Error {}
class PageHandoffError extends Error {}
const stopped = (error: unknown) =>
  error instanceof PageHandoffError ||
  (error instanceof ApiError && error.status >= 400 && error.status < 500);
type Binding = { criteria: PageCriteria; lifetime: PageLifetime };
const sameBinding = (a: Binding, b: Binding) =>
  samePageCriteria(a.criteria, b.criteria) &&
  samePageLifetime(a.lifetime, b.lifetime);
const keyFor = (binding: Binding) =>
  attendanceKeys.page(
    binding.criteria,
    binding.lifetime.userId,
    binding.lifetime.epoch,
  );
const sameKey = (a: readonly unknown[], b: readonly unknown[]) =>
  JSON.stringify(a) === JSON.stringify(b);
type QueryResult = QueryObserverResult<PageDelivery, Error>;
type Refetch = UseQueryResult<PageDelivery, Error>["refetch"];
type Waiter = {
  options: RefetchOptions | undefined;
  resolve: (result: QueryResult) => void;
  reject: (error: unknown) => void;
};
type Demand = {
  binding: Binding;
  pending: boolean;
  http: boolean;
  waiters: Waiter[];
  handoff: boolean;
  adopting: boolean;
  failed: boolean;
};
function isPageHandoffCandidate(
  delivery: PageDelivery | null,
  criteria: PageCriteria,
  lifetime: PageLifetime,
): delivery is PageDelivery {
  return (
    delivery !== null &&
    samePageLifetime(delivery.requestLifetime, lifetime) &&
    delivery.requested.page !== delivery.data.pagination.page &&
    samePageCriteria(
      { ...delivery.requested, page: delivery.data.pagination.page },
      criteria,
    )
  );
}

export function useAttendancePage(
  criteria: PageCriteria,
  lifetime: PageLifetime,
  polling: boolean,
  accepted: PageDelivery | null = null,
): UseQueryResult<PageDelivery, Error> {
  const { runtime, status, session } = useSession();
  const client = useQueryClient();
  const visible = useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
  );
  const { month, page, pageSize } = criteria;
  const q = criteria.q.trim();
  const { userId, epoch, generation } = lifetime;
  const bound = useMemo<Binding>(
    () => ({
      criteria: { month, q, page, pageSize },
      lifetime: { userId, epoch, generation },
    }),
    [month, q, page, pageSize, userId, epoch, generation],
  );
  const live = useRef<Binding | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const owner = useRef<{
    binding: Binding;
    accepted: PageDelivery | null;
  } | null>(null);
  const consumed = useRef<{ lifetime: PageLifetime; requestId: number } | null>(
    null,
  );
  const demand = useRef<Demand | null>(null);
  const native = useRef<{ binding: Binding; refetch: Refetch } | null>(null);
  const resultRef = useRef<UseQueryResult<PageDelivery, Error> | null>(null);
  const visibility = useRef(visible);
  const [ready, setReady] = useState<Binding | null>(null);
  const current = useCallback(
    (binding: Binding) =>
      mounted.current &&
      live.current !== null &&
      sameBinding(live.current, binding) &&
      runtime.boundary.canWrite(binding.lifetime.epoch) &&
      runtime.snapshot().status === "authenticated" &&
      runtime.snapshot().session?.user.userId === binding.lifetime.userId,
    [runtime],
  );
  const cancelQueued = useCallback(() => {
    const active = demand.current;
    const result = resultRef.current;
    if (!active || !result) return;
    // No fetch was dispatched for these waiters. A restored data result resolves
    // even with throwOnError; a no-data cancellation rejects only that option.
    for (const waiter of active.waiters.splice(0)) {
      if (result.data === undefined && waiter.options?.throwOnError)
        waiter.reject(new CancelledError({ revert: true }));
      else waiter.resolve(result);
    }
    active.pending = false;
  }, []);
  const flushDemand = useCallback(
    (binding: Binding) => {
      const active = demand.current;
      const observer = native.current;
      if (
        !active ||
        !sameBinding(active.binding, binding) ||
        !current(binding) ||
        !visibility.current ||
        !observer ||
        !sameBinding(observer.binding, binding)
      )
        return;
      const state = client.getQueryState(keyFor(binding));
      if (
        active.adopting ||
        (active.handoff && !active.http && state?.fetchStatus === "fetching")
      )
        return;
      if (active.pending && !active.http) {
        // queryFn consumes pending synchronously, so later flushes join this read.
        void observer.refetch({ cancelRefetch: false });
      }
      if (active.http) {
        for (const waiter of active.waiters.splice(0)) {
          // Coalesce only pre-dispatch transition callers, preserving each error
          // option through native observer promises and native cancellation.
          void observer
            .refetch({ ...waiter.options, cancelRefetch: false })
            .then(waiter.resolve, waiter.reject);
        }
      }
    },
    [client, current],
  );
  useLayoutEffect(() => {
    owner.current = { binding: bound, accepted };
    visibility.current = visible;
    if (!visible) cancelQueued();
  }, [bound, accepted, visible, cancelQueued]);
  useLayoutEffect(() => {
    const prior = live.current;
    live.current = bound;
    mounted.current = true;
    native.current = null;
    let canceled = false;
    const key = keyFor(bound);
    const priorKey = prior ? keyFor(prior) : key;
    const keys = sameKey(priorKey, key) ? [key] : [priorKey, key];
    cancelQueued();
    const active: Demand = {
      binding: bound,
      pending: false,
      http: false,
      waiters: [],
      handoff: isPageHandoffCandidate(
        owner.current?.accepted ?? null,
        bound.criteria,
        bound.lifetime,
      ),
      adopting: false,
      failed: false,
    };
    demand.current = active;
    const invalidated = () =>
      keys.some(
        (queryKey) => client.getQueryState(queryKey)?.isInvalidated === true,
      );
    active.pending = invalidated();
    const transitioning = () =>
      !native.current ||
      !sameBinding(native.current.binding, bound) ||
      active.adopting ||
      (active.handoff &&
        !active.http &&
        client.getQueryData(key) === undefined);
    const requestFreshPageRead = () => {
      if (!current(bound)) return;
      active.pending = true;
      queueMicrotask(() => flushDemand(bound));
    };
    const stopCache = client.getQueryCache().subscribe((event) => {
      if (
        !keys.some((queryKey) => sameKey(queryKey, event.query.queryKey)) ||
        !current(bound)
      )
        return;
      if (
        event.type === "updated" &&
        event.action.type === "invalidate" &&
        transitioning()
      )
        requestFreshPageRead();
      // A canceled consumed local adoption has no data to revert to. Surface a
      // local lifecycle error through queryFn instead of leaving pending forever.
      queueMicrotask(() => {
        if (!current(bound) || demand.current !== active) return;
        const state = client.getQueryState(key);
        if (
          active.handoff &&
          consumed.current &&
          !active.http &&
          !active.adopting &&
          state?.fetchStatus === "idle" &&
          state.data === undefined &&
          state.error === null &&
          native.current &&
          sameBinding(native.current.binding, bound)
        ) {
          active.failed = true;
          void native.current.refetch({ cancelRefetch: false });
        }
        flushDemand(bound);
      });
    });
    const automaticDemand = (eligible: boolean) => {
      if (
        eligible &&
        visibility.current &&
        current(bound) &&
        !stopped(resultRef.current?.error) &&
        transitioning()
      )
        requestFreshPageRead();
    };
    const stopFocus = focusManager.subscribe(automaticDemand);
    const stopOnline = onlineManager.subscribe(automaticDemand);
    void (async () => {
      if (!current(bound)) return;
      await Promise.all(
        keys.map((queryKey) => client.cancelQueries({ queryKey, exact: true })),
      );
      if (canceled || !current(bound)) return;
      // Recheck before eviction too: repeated invalidate() need not emit an event.
      active.pending ||= invalidated();
      const candidate = owner.current?.accepted ?? null;
      const handoff = isPageHandoffCandidate(
        candidate,
        bound.criteria,
        bound.lifetime,
      );
      for (const queryKey of keys) {
        const delivery = client.getQueryData<PageDelivery>(queryKey);
        if (
          (handoff && sameKey(queryKey, key) && delivery !== candidate) ||
          !delivery ||
          !samePageLifetime(delivery.requestLifetime, bound.lifetime)
        )
          client.removeQueries({ queryKey, exact: true });
      }
      setReady(bound);
    })();
    return () => {
      canceled = true;
      mounted.current = false;
      native.current = null;
      stopCache();
      stopFocus();
      stopOnline();
      cancelQueued();
      demand.current = null;
      owner.current = null;
      consumed.current = null;
    };
  }, [
    bound,
    client,
    current,
    flushDemand,
    cancelQueued,
    status,
    session?.user.userId,
  ]);
  const observed = ready ?? bound;
  const result = useQuery<PageDelivery, Error, PageDelivery | undefined>({
    queryKey: keyFor(observed),
    select: (delivery) =>
      ready && sameBinding(ready, bound) ? delivery : undefined,
    queryFn: async ({ signal }) => {
      if (
        !current(bound) ||
        !ready ||
        !sameBinding(ready, bound) ||
        signal.aborted
      )
        throw new StalePageRequest();
      const active = demand.current;
      if (!active || !sameBinding(active.binding, bound))
        throw new StalePageRequest();
      const latest = owner.current;
      const candidate = latest?.accepted ?? null;
      if (!active.pending) {
        if (
          active.failed ||
          (active.handoff &&
            !active.http &&
            !isPageHandoffCandidate(candidate, bound.criteria, bound.lifetime))
        ) {
          active.failed = true;
          throw new PageHandoffError();
        }
        if (
          candidate &&
          candidate.requested.page !== candidate.data.pagination.page &&
          samePageLifetime(candidate.requestLifetime, bound.lifetime) &&
          !isPageHandoffCandidate(candidate, bound.criteria, bound.lifetime)
        ) {
          active.failed = true;
          throw new PageHandoffError();
        }
        if (
          !active.http &&
          latest &&
          sameBinding(latest.binding, bound) &&
          isPageHandoffCandidate(candidate, bound.criteria, bound.lifetime)
        ) {
          const used = consumed.current;
          if (
            !used ||
            !samePageLifetime(used.lifetime, bound.lifetime) ||
            used.requestId !== candidate.requestId
          ) {
            consumed.current = {
              lifetime: { ...bound.lifetime },
              requestId: candidate.requestId,
            };
            active.adopting = true;
            try {
              await Promise.resolve();
              if (!current(bound) || signal.aborted)
                throw new StalePageRequest();
              if (owner.current?.accepted !== candidate) {
                active.failed = true;
                throw new PageHandoffError();
              }
              return candidate;
            } finally {
              active.adopting = false;
            }
          }
          if (!client.getQueryData(keyFor(bound))) {
            active.failed = true;
            throw new PageHandoffError();
          }
        }
      }
      active.pending = false;
      active.http = true;
      active.failed = false;
      const requested = { ...bound.criteria };
      const requestLifetime = { ...bound.lifetime };
      const id = ++requestId.current;
      let data;
      try {
        data = await readAttendancePage(
          requested,
          requestLifetime.epoch,
          signal,
        );
      } catch (error) {
        if (!current(bound) || signal.aborted) throw new StalePageRequest();
        throw error;
      }
      if (!current(bound) || signal.aborted) throw new StalePageRequest();
      return { requested, requestLifetime, requestId: id, data };
    },
    enabled:
      ready !== null &&
      sameBinding(ready, bound) &&
      status === "authenticated" &&
      session?.user.userId === userId &&
      runtime.boundary.canWrite(epoch) &&
      visible,
    refetchInterval: (query) =>
      polling && visible && !stopped(query.state.error) ? 15000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) =>
      stopped(query.state.error) ? false : "always",
    refetchOnReconnect: (query) =>
      stopped(query.state.error) ? false : "always",
    retry: (count, error) =>
      !(error instanceof StalePageRequest) &&
      !(error instanceof PageHandoffError) &&
      current(bound) &&
      retryRead(count, error),
    retryDelay: readRetryDelay,
    staleTime: Infinity,
    gcTime: 0,
    structuralSharing: false,
  });
  // Readiness select intentionally suppresses data until the barrier opens.
  const exposed = result as UseQueryResult<PageDelivery, Error>;
  // Read the public own method without subscribing the consumer to "refetch"
  // alone. useQuery tracks property gets; renderHook/consumers that have not yet
  // read any fields must retain its native notify-on-all-until-first-read rule.
  const observerRefetch: Refetch = Object.getOwnPropertyDescriptor(
    result,
    "refetch",
  )!.value;
  useLayoutEffect(() => {
    resultRef.current = exposed;
  });
  useEffect(() => {
    // Runs after useQuery's own options effect; its native refetch now targets
    // this binding rather than the retained prior observer key.
    if (ready && sameBinding(ready, bound) && current(bound)) {
      native.current = { binding: bound, refetch: observerRefetch };
      flushDemand(bound);
    }
  });
  const guardedRefetch: Refetch = (options) => {
    if (!current(bound)) {
      const canceled = resultRef.current ?? exposed;
      if (canceled.data === undefined && options?.throwOnError)
        return Promise.reject(new CancelledError({ revert: true }));
      return Promise.resolve(canceled);
    }
    const active = demand.current;
    const observer = native.current;
    if (!active || !sameBinding(active.binding, bound))
      return Promise.resolve(exposed);
    const state = client.getQueryState(keyFor(bound));
    const transition =
      !observer ||
      !sameBinding(observer.binding, bound) ||
      active.adopting ||
      (active.handoff && !active.http && state?.data === undefined);
    if (!transition && !active.failed) return observerRefetch(options);
    const pending = new Promise<QueryResult>((resolve, reject) =>
      active.waiters.push({ options, resolve, reject }),
    );
    active.pending = true;
    flushDemand(bound);
    return pending;
  };
  // Preserve useQuery's per-property observation: eagerly spreading its result
  // subscribes every consumer to every fetch/status field and queues needless
  // notifications even when the consumer only reads delivery data.
  return new Proxy(exposed, {
    get(target, property, receiver) {
      return property === "refetch"
        ? guardedRefetch
        : Reflect.get(target, property, receiver);
    },
  });
}
