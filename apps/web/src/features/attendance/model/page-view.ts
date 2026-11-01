import type { AttendancePageDto, PageCriteria } from "./types";

export type PageLifetime = {
  userId: string;
  epoch: number;
  generation: number;
};
export type PageDelivery = {
  requested: PageCriteria;
  requestLifetime: PageLifetime;
  requestId: number;
  data: AttendancePageDto;
};
export type PageViewState = {
  desired: PageCriteria;
  displayed: { criteria: PageCriteria; delivery: PageDelivery } | null;
  deferred: PageDelivery | null;
  lifetime: PageLifetime;
  lastAcceptedRequestId: number | null;
};

export const samePageCriteria = (a: PageCriteria, b: PageCriteria) =>
  a.month === b.month &&
  a.q.trim() === b.q.trim() &&
  a.page === b.page &&
  a.pageSize === b.pageSize;
export const samePageLifetime = (a: PageLifetime, b: PageLifetime) =>
  a.userId === b.userId && a.epoch === b.epoch && a.generation === b.generation;

export function requestPage(
  state: PageViewState,
  next: PageCriteria,
  lifetime: PageLifetime,
): PageViewState {
  const identityChanged =
    state.lifetime.userId !== lifetime.userId ||
    state.lifetime.epoch !== lifetime.epoch;
  return {
    desired: { ...next, q: next.q.trim() },
    lifetime: { ...lifetime },
    displayed: identityChanged ? null : state.displayed,
    deferred: null,
    lastAcceptedRequestId: identityChanged ? null : state.lastAcceptedRequestId,
  };
}
export function samePageMembership(
  a: AttendancePageDto,
  b: AttendancePageDto,
): boolean {
  return (
    a.month === b.month &&
    a.pagination.pageSize === b.pagination.pageSize &&
    a.pagination.page === b.pagination.page &&
    a.employees.length === b.employees.length &&
    a.employees.every((employee, i) => employee.id === b.employees[i]!.id)
  );
}
export function acceptPageResponse(
  state: PageViewState,
  delivery: PageDelivery,
  holdMembership: boolean,
): PageViewState {
  if (
    !samePageLifetime(state.lifetime, delivery.requestLifetime) ||
    !samePageCriteria(state.desired, delivery.requested) ||
    delivery.requestId <= (state.lastAcceptedRequestId ?? -1) ||
    delivery.requestId < (state.deferred?.requestId ?? -1)
  )
    return state;
  if (
    holdMembership &&
    state.displayed &&
    !samePageMembership(state.displayed.delivery.data, delivery.data)
  ) {
    return state.deferred?.requestId === delivery.requestId
      ? state
      : { ...state, deferred: delivery };
  }
  const criteria = {
    ...delivery.requested,
    page: delivery.data.pagination.page,
  };
  return {
    ...state,
    desired: criteria,
    displayed: { criteria, delivery },
    deferred: null,
    lastAcceptedRequestId: delivery.requestId,
  };
}
export function canPollPage(state: PageViewState): boolean {
  return (
    state.displayed !== null &&
    samePageCriteria(state.displayed.criteria, state.desired) &&
    samePageLifetime(state.displayed.delivery.requestLifetime, state.lifetime)
  );
}
