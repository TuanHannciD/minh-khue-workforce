import type { CellSnapshot, KindTotals } from "./attendance.types.js";
import type { MonthAggregateHalves } from "./attendance.types.js";
import type { AttendancePageDto } from "./attendance.dto.js";
import { attendanceError } from "./attendance-errors.js";

export function monthTotalsFromHalves(
  dates: string[],
  rows: MonthAggregateHalves[],
): AttendancePageDto["monthTotals"] {
  const safeValue = (halves: bigint) => {
    if (halves < 0n || halves > BigInt(Number.MAX_SAFE_INTEGER))
      attendanceError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Chưa thể đọc tổng dữ liệu.",
      );
    const value = Number(halves) / 2;
    if (!Number.isFinite(value) || !Number.isSafeInteger(value * 2))
      attendanceError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Chưa thể đọc tổng dữ liệu.",
      );
    return value;
  };
  const sum = (kind: "work" | "overtime") => {
    const byDate = new Map(dates.map((date) => [date, 0n]));
    let total = 0n;
    for (const row of rows) {
      if (row.kind !== kind) continue;
      safeValue(row.halfUnits);
      byDate.set(row.date, (byDate.get(row.date) ?? 0n) + row.halfUnits);
      total += row.halfUnits;
    }
    return {
      byDate: dates.map((date) => ({
        date,
        value: safeValue(byDate.get(date)!),
      })),
      grandTotal: safeValue(total),
    };
  };
  return { work: sum("work"), overtime: sum("overtime") };
}

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
