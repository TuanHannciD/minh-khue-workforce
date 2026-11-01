// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCellSelection } from "./use-cell-selection";
import { AttendanceDraft } from "./attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture as month } from "../preview/attendance-fixture";
import { useSyncExternalStore } from "react";
import type { AttendanceReadView } from "./attendance-read-view";
afterEach(cleanup);
const source = month.cells.find(
  (c) =>
    c.employeeId === month.employees[0]!.id &&
    c.date === "2024-02-03" &&
    c.kind === "work",
)!;
const target = { ...source, date: "2024-02-05", value: null };
function setup(contextKey?: string) {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  draft.open(month, source, "owner");
  const guard = vi.fn();
  const initialProps: {
    snapshot: AttendanceReadView;
    contextKey?: string | undefined;
  } = { snapshot: month, contextKey };
  const hook = renderHook(
    ({ snapshot, contextKey }: typeof initialProps) => {
      useSyncExternalStore(draft.subscribe, draft.snapshot);
      return useCellSelection(snapshot, draft, "owner", guard, contextKey);
    },
    { initialProps },
  );
  return { draft, guard, ...hook };
}
it("pending fill freezes source once across polling, endpoint is keyboard-operable even outside multi mode", () => {
  const { result, rerender, draft } = setup();
  act(() => result.current.startFill());
  rerender({
    snapshot: {
      ...month,
      cells: month.cells.map((c) =>
        c === source
          ? { ...c, value: { type: "number", value: 5 }, revision: "polled" }
          : c,
      ),
    },
  });
  expect(result.current.interaction?.endpoint).toBe(true);
  act(() =>
    result.current.interaction?.choose(target, { add: false, extend: false }),
  );
  expect(draft.edit?.source?.expectedRevision).toBe("fixture-cell");
  expect(draft.edit?.raw).toBe("3,5");
});
it.each(["page", "q", "pageSize", "kind"])(
  "page_context_cancels_gesture endpoint on same IDs: %s",
  (change) => {
    const { result, rerender, draft } = setup("displayed-1");
    act(() => result.current.startFill());
    const old = result.current.interaction!;
    const before = structuredClone(draft.edit);
    expect(result.current.waiting).toBe(true);
    rerender({ snapshot: month, contextKey: change });
    expect(result.current.waiting).toBe(false);
    expect(result.current.interaction!.endpoint).toBe(false);
    act(() => old.commit([target], old.capture(), source));
    expect(draft.edit).toEqual(before);
  },
);
it("guard_rejects_stale_generation before discard and locks pending/reconciling", () => {
  const { result, draft, guard } = setup();
  act(() =>
    draft.change({
      raw: "3,25",
      custom: true,
      error: "invalid",
      reminder: true,
    }),
  );
  act(() => expect(result.current.interaction!.canStart()).toBe(false));
  const staleDiscard = guard.mock.calls[0]![0] as () => void;
  act(() => {
    draft.clear();
    draft.open(month, source, "owner");
    draft.change({ raw: "F", error: "new" });
  });
  const before = structuredClone(draft.edit);
  act(staleDiscard);
  expect(draft.edit).toEqual(before);
  for (const state of ["pending", "reconciling"] as const) {
    guard.mockClear();
    draft.outcome = { type: state === "pending" ? "pending" : "editing" };
    draft.reconciling = state === "reconciling";
    act(() => expect(result.current.interaction!.canStart()).toBe(false));
    expect(guard).not.toHaveBeenCalled();
    expect(draft.edit).toEqual(before);
  }
});
it("null held view cannot start or dispatch a guard", () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const guard = vi.fn();
  const { result } = renderHook(() =>
    useCellSelection(null, draft, "owner", guard, "held"),
  );
  expect(result.current.interaction?.canStart() ?? false).toBe(false);
  expect(result.current.interaction).toBeUndefined();
  expect(guard).not.toHaveBeenCalled();
});
it.each(["save", "recovery", "reauth", "cancel"])(
  "pending endpoint cannot survive owner %s or turn the next ordinary click into old fill",
  async (action) => {
    const { result, draft, rerender } = setup();
    act(() => result.current.startFill());
    const accepted = async () => ({
      state: "saved" as const,
      cells: [],
      employees: [],
      counts: { selected: 1, eligible: 1, skipped: 0, changed: 1 },
      savedAt: "now",
    });
    await act(async () => {
      if (action === "save") {
        draft.change({ raw: "2" });
        await draft.submit(accepted);
      } else if (action === "recovery") {
        await draft.reconcile(async () => ({
          cells: [source],
          employees: month.employees,
          missingEmployeeIds: [],
          fetchedAt: "now",
        }));
        await draft.recover("current", accepted);
      } else if (action === "reauth") {
        draft.boundary.invalidate();
        draft.boundary.allowWrites();
      } else draft.discard();
    });
    rerender({ snapshot: month });
    expect(result.current.waiting).toBe(false);
    expect(result.current.interaction?.endpoint).toBe(false);
    let consumed;
    act(() => {
      consumed = result.current.interaction?.choose(target, {
        add: false,
        extend: false,
      });
    });
    expect(consumed).toBe(false);
    expect(draft.edit?.bulk).toBeUndefined();
  },
);
it("changing raw after starting endpoint fill blocks commit and cannot bypass context guard", () => {
  const { result, draft, guard } = setup();
  act(() => result.current.startFill());
  act(() => draft.change({ raw: "3,25" }));
  // Re-render explicitly as the page subscribes to this owner.
  act(() =>
    result.current.interaction?.choose(target, { add: false, extend: false }),
  );
  expect(guard).toHaveBeenCalled();
  expect(draft.edit?.raw).toBe("3,25");
  expect(draft.edit?.mode).toBe("patch-cell");
});
it("session transition during a selection cannot replace the existing owner or captured draft", () => {
  const { result, draft } = setup();
  const before = structuredClone(draft.edit);
  const snapshot = result.current.interaction!.capture();
  const epoch = draft.boundary.current();
  draft.boundary.invalidate();
  draft.boundary.allowWrites();
  act(() =>
    result.current.interaction!.commit([target], snapshot, undefined, epoch),
  );
  expect(draft.edit).toEqual(before);
});
it("holding and releasing a fill handle without destinations retains source editor instead of discarding it", () => {
  const { result, draft } = setup();
  const before = structuredClone(draft.edit);
  act(() => result.current.interaction!.commit([], month, source));
  expect(draft.edit).toEqual(before);
});
it("polling membership loss cannot silently shrink and reapply the old selected employee set", () => {
  const { result, rerender, draft, guard } = setup();
  act(() => result.current.startFill());
  rerender({ snapshot: { ...month, employees: month.employees.slice(1) } });
  expect(result.current.waiting).toBe(false);
  expect(result.current.interaction!.endpoint).toBe(false);
  act(() =>
    result.current.interaction!.choose(
      { ...target, employeeId: month.employees[1]!.id },
      { add: false, extend: false },
    ),
  );
  expect(guard).not.toHaveBeenCalled();
  expect(draft.edit?.employee.id).toBe(source.employeeId);
  expect(draft.edit?.mode).toBe("patch-cell");
});

it("union append freezes the original single-cell and Employee revisions across a poll", () => {
  const { result, rerender, draft } = setup();
  const original = structuredClone(draft.edit)!;
  rerender({
    snapshot: {
      ...month,
      employees: month.employees.map((e) => ({
        ...e,
        revision: "polled-employee",
      })),
      cells: month.cells.map((c) =>
        c === source
          ? {
              ...c,
              revision: "polled-cell",
              value: { type: "number", value: 8 },
            }
          : c,
      ),
    },
  });
  act(() =>
    result.current.interaction!.choose(target, { add: true, extend: false }),
  );
  expect(
    draft.edit?.targets.find((c) => c.date === source.date)?.expectedRevision,
  ).toBe(original.cell.revision);
  expect(draft.edit?.bulk?.employees[0]?.revision).toBe(
    original.employee.revision,
  );
  expect(
    draft.edit?.bulk?.cells.find((c) => c.date === source.date)?.value,
  ).toEqual(original.cell.value);
});

it("a queued discard cannot survive context round trip, epoch renewal, or unmount", () => {
  const { result, rerender, draft, guard, unmount } = setup("initial");
  act(() => draft.change({ raw: "3,25", error: "invalid", custom: true }));
  act(() => result.current.interaction!.canStart());
  const discard = guard.mock.calls[0]![0] as () => void;
  const original = structuredClone(draft.edit);
  rerender({ snapshot: month, contextKey: "away" });
  rerender({ snapshot: month, contextKey: "initial" });
  act(discard);
  expect(draft.edit).toEqual(original);
  act(() => result.current.interaction!.canStart());
  const epochDiscard = guard.mock.calls.at(-1)![0] as () => void;
  draft.boundary.invalidate();
  draft.boundary.allowWrites();
  act(epochDiscard);
  expect(draft.edit).toEqual(original);
  rerender({ snapshot: month, contextKey: "initial" });
  act(() => result.current.interaction!.canStart());
  const unmountedDiscard = guard.mock.calls.at(-1)![0] as () => void;
  unmount();
  act(unmountedDiscard);
  expect(draft.edit).toEqual(original);
});

it.each([{ custom: false }, { error: "invalid" }])(
  "editor metadata %j is dirty even when raw still matches the baseline",
  (fields) => {
    const { result, draft, guard } = setup();
    act(() => draft.change(fields));
    const before = structuredClone(draft.edit);
    act(() => expect(result.current.interaction!.canStart()).toBe(false));
    expect(guard).toHaveBeenCalledTimes(1);
    expect(draft.edit).toEqual(before);
  },
);
