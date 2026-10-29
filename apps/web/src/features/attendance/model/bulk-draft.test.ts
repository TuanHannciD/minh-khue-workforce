import { expect, it, vi } from "vitest";
import { AttendanceDraft } from "./attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture as month } from "../preview/attendance-fixture";
import { ApiError } from "@/shared/api/transport";
import type { WriteAttendance, ReconcileRequest } from "../api/attendance";
const cells = month.cells
  .filter((c) => c.employeeId === month.employees[0]!.id && c.kind === "work")
  .slice(0, 5);
function setup(source = false) {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  draft.openBulk(
    month,
    [cells[1]!, cells[3]!, cells[4]!],
    "owner",
    source ? cells[2]! : undefined,
  );
  return { draft, boundary };
}
const result = {
  state: "saved" as const,
  cells: [],
  employees: [],
  counts: { selected: 3, eligible: 3, skipped: 0, changed: 3 },
  savedAt: "now",
};
it("submits one frozen disjoint batch, preserving targets/source through409, polling cannot rebase", async () => {
  const { draft } = setup(true);
  const original = structuredClone(draft.edit);
  const write = vi.fn(async (_intent: WriteAttendance) => {
    void _intent;
    throw new ApiError(409, "CELL_CONFLICT", "Conflict");
  });
  expect(await draft.submit(write)).toBe(false);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0]![0]).toMatchObject({
    operation: {
      type: "set-value",
      mode: "fill-empty",
      value: { type: "number", value: 3.5 },
    },
    source: { date: "2024-02-03", expectedRevision: "fixture-cell" },
    targets: [
      { date: "2024-02-02" },
      { date: "2024-02-04" },
      { date: "2024-02-05" },
    ],
  });
  await draft.submit(write);
  expect(write).toHaveBeenCalledTimes(1);
  expect(draft.edit).toEqual(original);
  expect(draft.openBulk({ ...month, cells: [] }, [], "owner")).toBe(false);
});
it("eligible0 never dispatches, reports saved, or discards identity/raw; accepted no-op eligible does", async () => {
  const { draft } = setup();
  draft.clear();
  draft.openBulk(month, [cells[0]!], "owner");
  draft.change({ raw: "F" });
  const write = vi.fn(async () => result);
  expect(await draft.submit(write)).toBe(false);
  expect(write).not.toHaveBeenCalled();
  expect(draft.edit?.raw).toBe("F");
  expect(draft.outcome.type).not.toBe("saved");
  draft.change({ mode: "replace" });
  write.mockResolvedValue({
    ...result,
    counts: { selected: 1, eligible: 1, skipped: 0, changed: 0 },
  });
  expect(await draft.submit(write)).toBe(true);
});
it("reconciles source outside membership by original key; keeps draft and forbids fill from cleared N source", async () => {
  const { draft } = setup(true);
  draft.outcome = { type: "unknown" };
  const read = vi.fn(
    async (_input: ReconcileRequest) => (
      void _input,
      {
        fetchedAt: "now",
        employees: month.employees.slice(0, 1),
        cells: cells.map((c) =>
          c.date === "2024-02-03"
            ? {
                ...c,
                value: null,
                revision: "tombstone",
                state: "before-start" as const,
              }
            : { ...c, revision: "fresh" },
        ),
        missingEmployeeIds: [],
      }
    ),
  );
  await draft.reconcile(read);
  expect(read.mock.calls[0]?.[0]).toMatchObject({
    employeeIds: [month.employees[0]!.id],
    cells: [
      { date: "2024-02-02" },
      { date: "2024-02-04" },
      { date: "2024-02-05" },
      { date: "2024-02-03" },
    ],
  });
  const write = vi.fn(async () => result);
  expect(await draft.recover("draft", write)).toBe(false);
  expect(write).not.toHaveBeenCalled();
  expect(draft.edit?.raw).toBe("3,5");
});
it("recovery creates new CAS intent only on explicit decision, unchanged fill-empty mode, new source value", async () => {
  const { draft } = setup(true);
  draft.outcome = { type: "conflict" };
  const read = async () => ({
    fetchedAt: "now",
    employees: [{ ...month.employees[0]!, revision: "person-new" }],
    cells: cells.map((c) => ({
      ...c,
      revision: "fresh",
      ...(c.date === "2024-02-03"
        ? { value: { type: "absence" as const } }
        : {}),
    })),
    missingEmployeeIds: [],
  });
  await draft.reconcile(read);
  const write = vi.fn(
    async (_intent: WriteAttendance) => (void _intent, result),
  );
  expect(write).not.toHaveBeenCalled();
  expect(draft.edit?.raw).toBe("3,5");
  expect(await draft.recover("draft", write)).toBe(true);
  expect(write.mock.calls[0]![0]).toMatchObject({
    operation: {
      type: "set-value",
      mode: "fill-empty",
      value: { type: "absence" },
    },
    source: { expectedRevision: "fresh" },
    expectedEmployees: [{ expectedRevision: "person-new" }],
  });
});
