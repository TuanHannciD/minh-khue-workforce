import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { PageCriteria } from "./types";
import { acceptPageResponse, requestPage } from "./page-view";
import type { PageDelivery, PageLifetime, PageViewState } from "./page-view";

export function usePageView(
  initial: PageCriteria,
  lifetime: PageLifetime,
  holdMembership: boolean,
) {
  const [snapshot, setState] = useState<PageViewState>(() => ({
    desired: { ...initial, q: initial.q.trim() },
    displayed: null,
    deferred: null,
    lifetime: { ...lifetime },
    lastAcceptedRequestId: null,
  }));
  let state = snapshot;
  if (
    state.lifetime.userId !== lifetime.userId ||
    state.lifetime.epoch !== lifetime.epoch
  ) {
    state = requestPage(state, state.desired, {
      userId: lifetime.userId,
      epoch: lifetime.epoch,
      generation: state.lifetime.generation + 1,
    });
    setState(state);
  }
  // This synchronous decision cell contains the same immutable state references
  // as React, never a second server-data store. No updater has side effects.
  const latest = useRef({ state, holdMembership });
  useLayoutEffect(() => {
    latest.current = { state, holdMembership };
  }, [state, holdMembership]);
  const publish = useCallback(
    (next: PageViewState) => {
      latest.current.state = next;
      setState(next);
    },
    [latest],
  );
  const request = useCallback(
    (next: PageCriteria) => {
      const current = latest.current.state;
      publish(
        requestPage(current, next, {
          ...current.lifetime,
          generation: current.lifetime.generation + 1,
        }),
      );
    },
    [latest, publish],
  );
  const accept = useCallback(
    (delivery: PageDelivery): "accepted" | "deferred" | "ignored" => {
      const current = latest.current.state;
      const next = acceptPageResponse(
        current,
        delivery,
        latest.current.holdMembership,
      );
      if (next === current) return "ignored";
      publish(next);
      return next.lastAcceptedRequestId === delivery.requestId
        ? "accepted"
        : "deferred";
    },
    [latest, publish],
  );
  return { state, request, accept };
}
