import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
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
class PageHandoffError extends Error {}

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
  const owner = useRef<{
    binding: Binding;
    accepted: PageDelivery | null;
  } | null>(null);
  const consumed = useRef<{ lifetime: PageLifetime; requestId: number } | null>(
    null,
  );
  const [ready, setReady] = useState<Binding | null>(null);
  const { month, q, page, pageSize } = bound.criteria;
  const { userId, epoch, generation } = bound.lifetime;
  // Keep the previous observer binding until target eviction is complete.
  // Subscribing to a stale target first would let its later detach recreate
  // a GC timer on the retired instance, outside the cache's ownership.
  const observed = ready ?? bound;
  const current = () =>
    mounted.current &&
    live.current !== null &&
    sameBinding(live.current, bound) &&
    runtime.boundary.canWrite(epoch) &&
    runtime.snapshot().status === "authenticated" &&
    runtime.snapshot().session?.user.userId === userId;
  useLayoutEffect(() => {
    owner.current = { binding: bound, accepted };
  });
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
      if (!current()) return;
      await Promise.all(
        keys.map((queryKey) => client.cancelQueries({ queryKey, exact: true })),
      );
      if (canceled || !current()) return;
      const candidate = owner.current?.accepted ?? null;
      const handoff = isPageHandoffCandidate(
        candidate,
        next.criteria,
        next.lifetime,
      );
      for (const queryKey of keys) {
        const delivery = client.getQueryData<PageDelivery>(queryKey);
        if (
          (handoff &&
            JSON.stringify(queryKey) === JSON.stringify(key) &&
            delivery !== candidate) ||
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
      owner.current = null;
      consumed.current = null;
    };
  }, [
    client,
    month,
    q,
    page,
    pageSize,
    userId,
    epoch,
    generation,
    status,
    session?.user.userId,
  ]);
  const result = useQuery<PageDelivery, Error, PageDelivery | undefined>({
    queryKey: attendanceKeys.page(
      observed.criteria,
      observed.lifetime.userId,
      observed.lifetime.epoch,
    ),
    // A disabled observer may see a cached target before cancellation settles.
    // Keep delivery behind readiness without subscribing to unrelated fields.
    select: (delivery) =>
      ready && sameBinding(ready, bound) ? delivery : undefined,
    queryFn: async ({ signal }) => {
      if (!current() || !ready || !sameBinding(ready, bound) || signal.aborted)
        throw new StalePageRequest();
      const latest = owner.current;
      const candidate = latest?.accepted ?? null;
      if (
        candidate !== null &&
        candidate.requested.page !== candidate.data.pagination.page &&
        samePageLifetime(candidate.requestLifetime, bound.lifetime) &&
        !isPageHandoffCandidate(candidate, bound.criteria, bound.lifetime)
      ) {
        throw new PageHandoffError();
      }
      if (
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
          await Promise.resolve();
          if (!current() || signal.aborted) throw new StalePageRequest();
          if (owner.current?.accepted !== candidate)
            throw new PageHandoffError();
          return candidate;
        }
        if (
          !client.getQueryData(
            attendanceKeys.page(bound.criteria, userId, epoch),
          )
        )
          throw new PageHandoffError();
      }
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
      !(error instanceof PageHandoffError) &&
      current() &&
      retryRead(count, error),
    retryDelay: readRetryDelay,
    staleTime: Infinity,
    gcTime: 0,
    structuralSharing: false,
  });
  return result as UseQueryResult<PageDelivery, Error>;
}
