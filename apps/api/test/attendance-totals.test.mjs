import { test } from "node:test";
import assert from "node:assert/strict";

test("totals count integer half units independently of reminder, F, blanks and other kind", async () => {
  const module =
    await import("../dist/modules/attendance/attendance-totals.js").catch(
      () => ({}),
    );
  assert.equal(
    typeof module.attendanceTotals,
    "function",
    "attendance totals must exist",
  );
  const cells = [
    ["work", "2026-02-01", { type: "number", value: 1 }, true],
    ["work", "2026-02-02", { type: "number", value: 0.5 }, false],
    ["work", "2026-02-03", { type: "absence" }, true],
    ["work", "2026-02-04", null, false],
    ["overtime", "2026-02-01", { type: "number", value: 2 }, true],
  ].map(([kind, date, value, reminder]) => ({
    employeeId: "one",
    kind,
    date,
    value,
    reminder,
    state: "editable",
    revision: "0",
  }));
  const result = module.attendanceTotals(
    ["one", "two"],
    ["2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04"],
    cells,
  );
  assert.deepEqual(result.work, {
    byEmployee: [
      { employeeId: "one", value: 1.5 },
      { employeeId: "two", value: 0 },
    ],
    byDate: [
      { date: "2026-02-01", value: 1 },
      { date: "2026-02-02", value: 0.5 },
      { date: "2026-02-03", value: 0 },
      { date: "2026-02-04", value: 0 },
    ],
    grandTotal: 1.5,
  });
  assert.equal(result.overtime.grandTotal, 2);
  cells[0].value.value = 30;
  cells[1].value.value = 30;
  assert.equal(
    module.attendanceTotals(["one"], ["2026-02-01", "2026-02-02"], cells).work
      .grandTotal,
    60,
  );
});
