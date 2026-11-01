import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  QueryClient,
  QueryKey,
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
const stopped = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;
type Binding = { criteria: PageCriteria; lifetime: PageLifetime };
const sameBinding = (a: Binding, b: Binding) =>
  samePageCriteria(a.criteria, b.criteria) &&
  samePageLifetime(a.lifetime, b.lifetime);
class StalePageRequest extends Error {}

export function useAttendancePage(
  criteria: PageCriteria,
  lifetime: PageLifetime,
  polling: boolean,
): UseQueryResult<PageDelivery, Error> {
  const { runtime, status, session } = useSession();
  const client = useQueryClient();
  const visible = useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
  );
  const bound: Binding = {
    criteria: {
      month: criteria.month,
      q: criteria.q.trim(),
      page: criteria.page,
      pageSize: criteria.pageSize,
    },
    lifetime: { ...lifetime },
  };
  const live = useRef<Binding | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const canonicalKeys = useRef(
    new Map<string, { queryKey: QueryKey; lifetime: PageLifetime }>(),
  );
  const [ready, setReady] = useState<Binding | null>(null);
  const { month, q, page, pageSize } = bound.criteria;
  const { userId, epoch, generation } = bound.lifetime;
  useLayoutEffect(() => {
    const next: Binding = {
      criteria: { month, q, page, pageSize },
      lifetime: { userId, epoch, generation },
    };
    const prior = live.current;
    live.current = next;
    mounted.current = true;
    let canceled = false;
    const key = attendanceKeys.page(next.criteria, userId, epoch);
    const priorKey = prior
      ? attendanceKeys.page(
          prior.criteria,
          prior.lifetime.userId,
          prior.lifetime.epoch,
        )
      : key;
    const keys =
      JSON.stringify(priorKey) === JSON.stringify(key)
        ? [key]
        : [priorKey, key];
    void (async () => {
      await Promise.all(
        keys.map((queryKey) => client.cancelQueries({ queryKey, exact: true })),
      );
      if (canceled) return;
      for (const queryKey of keys) {
        const delivery = client.getQueryData<PageDelivery>(queryKey);
        if (
          !delivery ||
          !samePageLifetime(delivery.requestLifetime, next.lifetime)
        )
          client.removeQueries({ queryKey, exact: true });
      }
      setReady(next);
    })();
    return () => {
      canceled = true;
      mounted.current = false;
    };
  }, [client, month, q, page, pageSize, userId, epoch, generation]);
  const current = () =>
    mounted.current &&
    live.current !== null &&
    sameBinding(live.current, bound) &&
    runtime.boundary.canWrite(epoch) &&
    runtime.snapshot().status === "authenticated" &&
    runtime.snapshot().session?.user.userId === userId;
  const result = useQuery<PageDelivery, Error>({
    queryKey: attendanceKeys.page(bound.criteria, userId, epoch),
    queryFn: async ({ signal }) => {
      if (!current() || !ready || !sameBinding(ready, bound) || signal.aborted)
        throw new StalePageRequest();
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
        if (!current() || signal.aborted) throw new StalePageRequest();
        throw error;
      }
      if (!current() || signal.aborted) throw new StalePageRequest();
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
      current() &&
      retryRead(count, error),
    retryDelay: readRetryDelay,
    staleTime: Infinity,
    gcTime: 0,
    structuralSharing: false,
  });
  useLayoutEffect(() => {
    for (const [hash, { queryKey }] of canonicalKeys.current) {
      if (!client.getQueryCache().find({ queryKey, exact: true }))
        canonicalKeys.current.delete(hash);
    }
    // Read the cache without subscribing the caller to result.data alone.
    const delivery = client.getQueryData<PageDelivery>(
      attendanceKeys.page(bound.criteria, userId, epoch),
    );
    if (
      !delivery ||
      !samePageLifetime(delivery.requestLifetime, bound.lifetime) ||
      delivery.requested.page === delivery.data.pagination.page
    )
      return;
    const queryKey = attendanceKeys.page(
      { ...delivery.requested, page: delivery.data.pagination.page },
      userId,
      epoch,
    );
    canonicalKeys.current.set(JSON.stringify(queryKey), {
      queryKey,
      lifetime: delivery.requestLifetime,
    });
  });
  // Canonical seeds use Infinity GC: only this scoped cleanup owns retention.
  // Detaching a retired Query or settling its canceled fetch cannot recreate
  // a timer after it has been removed from the cache.
  // useQuery's subscription cleanup runs before this passive effect cleanup.
  useEffect(() => {
    const keys = canonicalKeys.current;
    return () => {
      for (const { queryKey, lifetime } of keys.values()) {
        client.removeQueries({
          queryKey,
          exact: true,
          predicate: (query) => {
            const delivery = query.state.data as PageDelivery | undefined;
            return (
              query.getObserversCount() === 0 &&
              delivery !== undefined &&
              samePageLifetime(delivery.requestLifetime, lifetime)
            );
          },
        });
      }
      keys.clear();
    };
  }, [client]);
  return result;
}

// The consumer calls this only after accept(), before the canonical rerender.
export function adoptAttendancePage(
  client: QueryClient,
  delivery: PageDelivery,
): void {
  if (delivery.requested.page === delivery.data.pagination.page) return;
  const { userId, epoch } = delivery.requestLifetime;
  const canonicalKey = attendanceKeys.page(
    { ...delivery.requested, page: delivery.data.pagination.page },
    userId,
    epoch,
  );
  const cache = client.getQueryCache();
  const canonical =
    cache.find({ queryKey: canonicalKey, exact: true }) ??
    cache.build<unknown, Error, unknown, QueryKey>(client, {
      queryKey: canonicalKey,
      gcTime: Infinity,
    });
  // Existing equal DTO bytes must not structurally share a prior delivery tag.
  // Infinity prevents both final observer detach and fetch-finally from
  // scheduling a timer on an instance already removed during navigation.
  canonical.setOptions({
    ...canonical.options,
    gcTime: Infinity,
    structuralSharing: false,
  });
  client.setQueryData(canonicalKey, delivery);
  client.removeQueries({
    queryKey: attendanceKeys.page(delivery.requested, userId, epoch),
    exact: true,
  });
}
