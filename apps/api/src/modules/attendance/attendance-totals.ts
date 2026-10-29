import type { CellSnapshot, KindTotals } from "./attendance.types.js";

export function attendanceTotals(
  employeeIds: string[],
  dates: string[],
  cells: CellSnapshot[],
) {
  const sum = (kind: "work" | "overtime"): KindTotals => {
    const employees = new Map(employeeIds.map((id) => [id, 0]));
    const days = new Map(dates.map((date) => [date, 0]));
    let total = 0;
    for (const cell of cells) {
      if (cell.kind !== kind || cell.value?.type !== "number") continue;
      const halves = cell.value.value * 2;
      employees.set(
        cell.employeeId,
        (employees.get(cell.employeeId) ?? 0) + halves,
      );
      days.set(cell.date, (days.get(cell.date) ?? 0) + halves);
      total += halves;
    }
    return {
      byEmployee: employeeIds.map((employeeId) => ({
        employeeId,
        value: employees.get(employeeId)! / 2,
      })),
      byDate: dates.map((date) => ({ date, value: days.get(date)! / 2 })),
      grandTotal: total / 2,
    };
  };
  return { work: sum("work"), overtime: sum("overtime") };
}
