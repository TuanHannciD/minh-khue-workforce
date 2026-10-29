import { expect, it } from "vitest";
import { captureBulkIntent, previewTargets } from "./fill-intent";
import { attendanceFixture as month } from "../preview/attendance-fixture";
const cells = month.cells
  .filter((c) => c.employeeId === month.employees[0]!.id && c.kind === "work")
  .slice(0, 4);
it("captures fill source/targets/employee revisions once; excludes source, preserves reminder-only and occupied counts", () => {
  const intent = captureBulkIntent(
    month,
    [...cells, cells[1]!],
    { type: "number", value: 3.5 },
    "fill-empty",
    cells[2]!,
  );
  expect(intent?.targets.map((c) => c.date)).toEqual([
    "2024-02-01",
    "2024-02-02",
    "2024-02-04",
  ]);
  expect(intent?.source?.expectedRevision).toBe("fixture-cell");
  expect(previewTargets(intent!, month)).toEqual({
    selected: 3,
    eligible: 2,
    skipped: 0,
    changed: 2,
  });
  expect(
    previewTargets(
      { ...intent!, operation: { ...intent!.operation, mode: "replace" } },
      month,
    ),
  ).toEqual({ selected: 3, eligible: 3, skipped: 0, changed: 3 });
  expect(
    captureBulkIntent(
      { ...month, employees: [] },
      cells,
      null,
      "fill-empty",
      cells[2]!,
    ),
  ).toBeNull();
  expect(
    captureBulkIntent(month, cells, null, "fill-empty", cells[1]!),
  ).toBeNull();
});
it("F repeats without increments, N/— are skipped and occupied fill-empty has zero eligible", () => {
  const employee = month.employees[1]!;
  const targets = month.cells.filter(
    (c) =>
      c.employeeId === employee.id &&
      c.kind === "work" &&
      ["01", "02", "29"].includes(c.date.slice(-2)),
  );
  const intent = captureBulkIntent(
    month,
    targets,
    { type: "absence" },
    "fill-empty",
    cells[0]!,
  )!;
  expect(previewTargets(intent, month)).toEqual({
    selected: 3,
    eligible: 1,
    skipped: 2,
    changed: 1,
  });
  expect(intent.operation.value).toEqual({ type: "absence" });
  const occupied = captureBulkIntent(month, [cells[0]!], null, "fill-empty")!;
  expect(previewTargets(occupied, month).eligible).toBe(0);
});
