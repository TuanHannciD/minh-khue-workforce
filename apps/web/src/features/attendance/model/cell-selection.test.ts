import { expect, it } from "vitest";
import { unionCells, toggleCell, rectangleCells } from "./cell-selection";
import { attendanceFixture as month } from "../preview/attendance-fixture";
const a = {
  employeeId: month.employees[0]!.id,
  date: "2024-02-01",
  kind: "work" as const,
};
const b = { ...a, date: "2024-02-03" };
const c = { ...a, employeeId: month.employees[1]!.id, date: "2024-02-05" };
it("unions disconnected ID/date/kind keys once, toggles only that key and never inserts intervening cells", () => {
  expect(unionCells([a, b], [b, c, a])).toEqual([a, b, c]);
  expect(toggleCell([a, b, c], b)).toEqual([a, c]);
  expect(unionCells([a], [{ ...a, kind: "overtime" }])).toHaveLength(2);
});
it("rectangles run both directions through visible rows only and overlap dedupes", () => {
  const visible = {
    ...month,
    employees: [month.employees[0]!, month.employees[2]!],
  };
  const end = { ...b, employeeId: month.employees[2]!.id };
  const range = rectangleCells(visible, end, a);
  expect(range.map((x) => [x.employeeId.slice(-3), x.date.slice(-2)])).toEqual([
    ["101", "01"],
    ["101", "02"],
    ["101", "03"],
    ["103", "01"],
    ["103", "02"],
    ["103", "03"],
  ]);
  expect(unionCells(range, rectangleCells(visible, a, b))).toHaveLength(6);
  expect(rectangleCells(visible, a, c)).toEqual([]);
  expect(rectangleCells(visible, a, { ...b, date: "2024-03-01" })).toEqual([]);
});
