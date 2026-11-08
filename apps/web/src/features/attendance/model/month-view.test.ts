import { expect, it } from "vitest";
import { monthDays, nextEligibleCell } from "./month-view";
import type { CellSnapshotDto } from "./types";

it("builds Gregorian leap dates and weekdays without local-time rollover", () => {
  expect(monthDays("2024-02")).toHaveLength(29);
  expect(monthDays("2024-02").at(-1)).toEqual({
    date: "2024-02-29",
    day: 29,
    weekday: "T5",
  });
  expect(monthDays("1900-02")).toHaveLength(28);
  expect(monthDays("2000-02")).toHaveLength(29);
  expect(monthDays("2026-04")).toHaveLength(30);
  expect(monthDays("2026-01")[0]?.weekday).toBe("T5");
  expect(monthDays("0001-01")[0]?.weekday).toBe("T2");
});
it.each(["2026-00", "2026-13", "2026-2", "0000-01", "no-month"])(
  "rejects invalid month %s",
  (month) => {
    expect(() => monthDays(month)).toThrow();
  },
);
it("moves by IDs in the visible kind, skipping N/— and stopping at the edge", () => {
  const cell = (
    employeeId: string,
    date: string,
    state: CellSnapshotDto["state"] = "editable",
    kind: CellSnapshotDto["kind"] = "work",
  ): CellSnapshotDto => ({
    employeeId,
    date,
    kind,
    state,
    reminder: false,
    revision: "r",
    value: null,
  });
  const cells = [
    cell("a", "2024-02-01"),
    cell("a", "2024-02-02", "after-end"),
    cell("b", "2024-02-01", "before-start"),
    cell("b", "2024-02-02"),
    cell("c", "2024-02-01"),
    cell("a", "2024-02-01", "editable", "overtime"),
  ];
  expect(nextEligibleCell(cells, cells[0]!, "tab")?.employeeId).toBe("b");
  expect(nextEligibleCell(cells, cells[0]!, "enter")?.employeeId).toBe("c");
  expect(nextEligibleCell(cells, cells[4]!, "tab")).toBeNull();
});
