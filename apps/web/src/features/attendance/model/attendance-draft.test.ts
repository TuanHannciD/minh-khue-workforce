import { afterEach, expect, it, vi } from "vitest";
import { AttendanceDraft } from "./attendance-draft";
import { attendanceFixture } from "../preview/attendance-fixture";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { ApiError } from "@/shared/api/transport";
import type {
  ReconcileSnapshot,
  WriteAttendance,
  WriteResult,
} from "../api/attendance";

afterEach(() => vi.restoreAllMocks());
const employee = attendanceFixture.employees[0]!;
const cell = attendanceFixture.cells.find(
  (c) =>
    c.employeeId === employee.id &&
    c.date === "2024-02-02" &&
    c.kind === "work",
)!;
function fixture() {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  draft.open(attendanceFixture, cell, "owner");
  return { draft, boundary };
}
const snapshot = (revision = "new"): ReconcileSnapshot => ({
  fetchedAt: "2026-10-29T00:00:00Z",
  employees: [employee],
  cells: [
    {
      ...cell,
      value: { type: "number", value: 1.5 },
      reminder: false,
      revision,
    },
  ],
  missingEmployeeIds: [],
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it("refetch_keeps_raw_input_and_baseline, targets, mode, source and employee identity", () => {
  const { draft } = fixture();
  draft.change({ raw: "3,25", reminder: false, custom: true });
  const before = structuredClone(draft.edit);
  expect(
    draft.open(
      { ...attendanceFixture, ...snapshot(), month: attendanceFixture.month },
      snapshot().cells[0]!,
      "owner",
    ),
  ).toBe(false);
  expect(draft.edit).toEqual(before);
  expect(draft.edit?.cell.revision).toBe(cell.revision);
});
it("editor_save_commits_value_and_reminder_together and pending duplicate is blocked", async () => {
  const { draft } = fixture();
  draft.change({ raw: "1,5", reminder: false });
  const pending = deferred<WriteResult>();
  const write = vi.fn(() => pending.promise);
  const first = draft.submit(write);
  await draft.submit(write);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0]).toEqual([
    {
      month: "2024-02",
      expectedEmployees: [
        { employeeId: employee.id, expectedRevision: employee.revision },
      ],
      targets: [
        {
          employeeId: cell.employeeId,
          date: cell.date,
          kind: cell.kind,
          expectedRevision: cell.revision,
        },
      ],
      operation: {
        type: "patch-cell",
        patch: { value: { type: "number", value: 1.5 }, reminder: false },
      },
    },
    0,
  ]);
  expect(draft.outcome.type).toBe("pending");
  expect(draft.edit?.raw).toBe("1,5");
  pending.resolve({
    state: "saved",
    ...snapshot(),
    counts: { selected: 1, eligible: 1, skipped: 0, changed: 1 },
    savedAt: "now",
  });
  expect(await first).toBe(true);
  expect(draft.outcome.type).toBe("saved");
  expect(draft.edit).toBeNull();
});
it.each(["value", "reminder"] as const)(
  "patch only edited %s; null clears value and missing retains the other field",
  async (field) => {
    const { draft } = fixture();
    draft.change(field === "value" ? { raw: "F" } : { reminder: false });
    let body: WriteAttendance | undefined;
    await draft.submit(async (input) => {
      body = input;
      throw new ApiError(422, "INVALID", "invalid");
    });
    expect(body?.operation.patch).toEqual(
      field === "value" ? { value: { type: "absence" } } : { reminder: false },
    );
    expect(draft.edit).not.toBeNull();
    expect(draft.outcome.type).toBe("rejected");
  },
);
it("commit_response_loss_requires_reconciliation; read is not saved or a fence; keep-current explicitly sends both no-op fields", async () => {
  const { draft } = fixture();
  draft.change({ raw: "2", reminder: true });
  const write = vi.fn(async () => {
    throw new TypeError("response lost");
  });
  await draft.submit(write);
  await draft.submit(write);
  expect(write).toHaveBeenCalledTimes(1);
  expect(draft.outcome.type).toBe("unknown");
  await draft.reconcile(async (input) => {
    expect(input).toEqual({
      employeeIds: [employee.id],
      cells: [
        { employeeId: cell.employeeId, date: cell.date, kind: cell.kind },
      ],
    });
    return snapshot();
  });
  expect(draft.outcome.type).toBe("unknown");
  expect(draft.edit?.raw).toBe("2");
  expect(draft.edit?.cell.revision).toBe(cell.revision);
  const fence = vi.fn(async (input: WriteAttendance) => {
    expect(input.targets[0]?.expectedRevision).toBe("new");
    expect(input.operation.patch).toEqual({
      value: { type: "number", value: 1.5 },
      reminder: false,
    });
    return {
      state: "saved" as const,
      ...snapshot("fence"),
      counts: { selected: 1, eligible: 1, skipped: 0, changed: 0 },
      savedAt: "now",
    };
  });
  expect(await draft.recover("current", fence)).toBe(true);
  expect(fence).toHaveBeenCalledTimes(1);
});
it("conflict_preserves_draft_and_shows_current, no auto retry/merge", async () => {
  const { draft } = fixture();
  draft.change({ raw: "2" });
  const write = vi.fn(async () => {
    throw new ApiError(409, "ATTENDANCE_CONFLICT", "changed", {
      cells: snapshot().cells,
      employees: [employee],
    });
  });
  await draft.submit(write);
  expect(write).toHaveBeenCalledTimes(1);
  expect(draft.outcome.type).toBe("conflict");
  expect(draft.edit?.raw).toBe("2");
  await draft.reconcile(async () => snapshot());
  expect(draft.current?.cells[0]?.value).toEqual({
    type: "number",
    value: 1.5,
  });
});
it("reconcile retains identity after month exit; missing differs from DB failure and cannot write N/—", async () => {
  const { draft } = fixture();
  draft.change({ raw: "2" });
  const outside = snapshot();
  outside.cells[0]!.state = "before-start";
  await draft.reconcile(async () => outside);
  expect(draft.edit?.employee.id).toBe(employee.id);
  const write = vi.fn();
  expect(await draft.recover("current", write)).toBe(false);
  expect(write).not.toHaveBeenCalled();
  await draft.reconcile(async () => ({
    ...outside,
    employees: [],
    cells: [],
    missingEmployeeIds: [employee.id],
  }));
  expect(draft.readError).toContain("Không tìm thấy");
  expect(draft.edit?.raw).toBe("2");
  await draft.reconcile(async () => {
    throw new ApiError(503, "DB", "db failed");
  });
  expect(draft.readError).toContain("Chưa thể đối chiếu");
  expect(draft.current).toBeNull();
});
it("context_change_requires_draft_decision; cancel sends zero and unknown discard does not claim cancellation", async () => {
  const { draft } = fixture();
  draft.change({ raw: "3,25" });
  expect(
    draft.open(attendanceFixture, { ...cell, date: "2024-02-03" }, "owner"),
  ).toBe(false);
  expect(draft.edit?.raw).toBe("3,25");
  draft.discard();
  expect(draft.edit).toBeNull();
  draft.open(attendanceFixture, cell, "owner");
  draft.change({ raw: "2" });
  await draft.submit(async () => {
    throw new DOMException("abort", "AbortError");
  });
  draft.discard();
  expect(draft.outcome.type).toBe("unknown");
});
it("session transition blocks old intent and late result; same-user recovery needs fresh read", async () => {
  const { draft, boundary } = fixture();
  draft.change({ raw: "2" });
  const pending = deferred<WriteResult>();
  const saving = draft.submit(() => pending.promise);
  boundary.invalidate();
  boundary.allowWrites();
  pending.resolve({
    state: "saved",
    ...snapshot(),
    counts: { selected: 1, eligible: 1, skipped: 0, changed: 1 },
    savedAt: "now",
  });
  expect(await saving).toBe(false);
  expect(draft.outcome.type).toBe("unknown");
  const write = vi.fn();
  await draft.submit(write);
  expect(write).not.toHaveBeenCalled();
  await draft.reconcile(async () => snapshot());
  draft.clear();
  expect(draft.edit).toBeNull();
  expect(draft.current).toBeNull();
});
it("old-session reconciliation cannot authorize recovery after reauthentication", async () => {
  const { draft, boundary } = fixture();
  draft.change({ raw: "2" });
  await draft.submit(async () => {
    throw new TypeError("delivery lost");
  });
  await draft.reconcile(async () => snapshot());
  expect(draft.recoveryReady).toBe(true);
  const original = structuredClone(draft.edit);
  boundary.invalidate();
  boundary.allowWrites();
  expect(draft.recoveryReady).toBe(false);
  const write = vi.fn();
  expect(await draft.recover("current", write)).toBe(false);
  expect(write).not.toHaveBeenCalled();
  expect(draft.edit).toEqual(original);
  await draft.reconcile(async () => snapshot("fresh-after-auth"));
  expect(draft.recoveryReady).toBe(true);
});
it("late successful response cannot clear a new account's draft after owner discard", async () => {
  const { draft, boundary } = fixture();
  draft.change({ raw: "2" });
  const pending = deferred<WriteResult>();
  const saving = draft.submit(() => pending.promise);
  draft.clear();
  boundary.invalidate();
  boundary.allowWrites();
  draft.open(attendanceFixture, cell, "new-owner");
  draft.change({ raw: "3,25", custom: true });
  const newDraft = structuredClone(draft.edit);
  pending.resolve({
    state: "saved",
    ...snapshot(),
    counts: { selected: 1, eligible: 1, skipped: 0, changed: 1 },
    savedAt: "now",
  });
  expect(await saving).toBe(false);
  expect(draft.edit).toEqual(newDraft);
  expect(draft.outcome.type).toBe("editing");
});
