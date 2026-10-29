// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCellSelection } from "./use-cell-selection";
import { AttendanceDraft } from "./attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture as month } from "../preview/attendance-fixture";
afterEach(cleanup);
const source = month.cells.find(
  (c) =>
    c.employeeId === month.employees[0]!.id &&
    c.date === "2024-02-03" &&
    c.kind === "work",
)!;
const target = { ...source, date: "2024-02-05", value: null };
function setup() {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  draft.open(month, source, "owner");
  const guard = vi.fn();
  const hook = renderHook(
    ({ snapshot }) => useCellSelection(snapshot, draft, "owner", guard),
    { initialProps: { snapshot: month } },
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
  act(() =>
    result.current.interaction!.choose(
      { ...target, employeeId: month.employees[1]!.id },
      { add: false, extend: false },
    ),
  );
  expect(guard).toHaveBeenCalled();
  expect(draft.edit?.employee.id).toBe(source.employeeId);
  expect(draft.edit?.mode).toBe("patch-cell");
});
