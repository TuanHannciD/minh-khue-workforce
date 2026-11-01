import { expect, it } from "vitest";
import {
  acceptPageResponse,
  canPollPage,
  requestPage,
  samePageMembership,
} from "./page-view";
import type { PageDelivery, PageViewState } from "./page-view";
import { attendanceFixture } from "../preview/attendance-fixture";
import type { AttendancePageDto } from "./types";

const criteria = { month: "2024-02", q: "", page: 2, pageSize: 25 as const };
const lifetime = { userId: "owner", epoch: 1, generation: 1 };
function data(page = 2): AttendancePageDto {
  return {
    month: criteria.month,
    fetchedAt: "first",
    employees: attendanceFixture.employees.slice(0, 2),
    cells: [],
    pagination: {
      requestedPage: 2,
      page,
      pageSize: 25,
      totalResults: 52,
      monthEmployeeCount: 52,
      totalPages: 3,
      from: 26,
      to: 50,
    },
    employeeTotals: { work: [], overtime: [] },
    monthTotals: {
      work: { byDate: [], grandTotal: 10 },
      overtime: { byDate: [], grandTotal: 20 },
    },
  };
}
const initial = (): PageViewState => ({
  desired: criteria,
  displayed: null,
  deferred: null,
  lifetime,
  lastAcceptedRequestId: null,
});
const delivery = (requestId = 1): PageDelivery => ({
  requested: criteria,
  requestLifetime: lifetime,
  requestId,
  data: data(),
});

it("navigation keeps the old immutable envelope and rejects late or duplicate dispatches", () => {
  expect(canPollPage(initial())).toBe(false);
  const first = delivery();
  const ready = acceptPageResponse(initial(), first, false);
  expect(ready.displayed?.delivery).toBe(first);
  expect(canPollPage(ready)).toBe(true);
  expect(acceptPageResponse(ready, first, false)).toBe(ready);
  const pending = requestPage(
    ready,
    { ...criteria, page: 3 },
    { ...lifetime, generation: 2 },
  );
  expect(pending.displayed).toBe(ready.displayed);
  expect(canPollPage(pending)).toBe(false);
  expect(acceptPageResponse(pending, delivery(9), false)).toBe(pending);
  const reauth = requestPage(ready, criteria, {
    ...lifetime,
    epoch: 2,
    generation: 2,
  });
  expect(reauth.displayed).toBeNull();
  expect(reauth.lastAcceptedRequestId).toBeNull();
});
it("membership_hold_keeps_one_envelope including order, footer and fetchedAt", () => {
  const ready = acceptPageResponse(initial(), delivery(), false);
  const same = delivery(2);
  same.data = {
    ...same.data,
    fetchedAt: "updated",
    monthTotals: {
      ...same.data.monthTotals,
      work: { byDate: [], grandTotal: 99 },
    },
  };
  const updated = acceptPageResponse(ready, same, true);
  expect(updated.displayed?.delivery).toBe(same);
  const changed = delivery(3);
  changed.data = {
    ...changed.data,
    employees: [...changed.data.employees].reverse(),
    fetchedAt: "held",
  };
  const held = acceptPageResponse(updated, changed, true);
  expect(held.displayed).toBe(updated.displayed);
  expect(held.deferred).toBe(changed);
  expect(held.lastAcceptedRequestId).toBe(2);
  expect(canPollPage(held)).toBe(true);
  expect(acceptPageResponse(held, { ...changed }, true)).toBe(held);
  expect(acceptPageResponse(held, same, false)).toBe(held);
  expect(acceptPageResponse(held, { ...changed, requestId: 2.5 }, false)).toBe(
    held,
  );
  const released = acceptPageResponse(held, changed, false);
  expect(released.displayed?.delivery).toBe(changed);
  expect(released.lastAcceptedRequestId).toBe(3);
  expect(released.deferred).toBeNull();
  expect(samePageMembership(data(), data(1))).toBe(false);
});
it("rejects mismatched criteria and lifetime; new context clears tagged deferred", () => {
  const ready = acceptPageResponse(initial(), delivery(), false);
  const changed = delivery(2);
  changed.data.employees = [];
  const held = acceptPageResponse(ready, changed, true);
  for (const requested of [
    { ...criteria, q: "other" },
    { ...criteria, page: 1 },
    { ...criteria, month: "2024-03" },
    { ...criteria, pageSize: 50 as const },
  ]) {
    expect(acceptPageResponse(held, { ...changed, requested }, false)).toBe(
      held,
    );
  }
  for (const requestLifetime of [
    { ...lifetime, userId: "other" },
    { ...lifetime, epoch: 2 },
    { ...lifetime, generation: 2 },
  ]) {
    expect(
      acceptPageResponse(held, { ...changed, requestLifetime }, false),
    ).toBe(held);
  }
  const pending = requestPage(held, criteria, { ...lifetime, generation: 2 });
  expect(pending.deferred).toBeNull();
  expect(acceptPageResponse(pending, changed, false)).toBe(pending);
});
it("accepted clamp canonicalizes desired and displayed atomically without retagging", () => {
  const clamped = delivery();
  clamped.data = data(1);
  const state = acceptPageResponse(initial(), clamped, false);
  expect(state.desired.page).toBe(1);
  expect(state.displayed?.criteria.page).toBe(1);
  expect(state.displayed?.delivery).toBe(clamped);
  expect(clamped.requested.page).toBe(2);
  expect(canPollPage(state)).toBe(true);
});
