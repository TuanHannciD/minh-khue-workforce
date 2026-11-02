import type { ProductTransaction } from "../../infrastructure/db/database.js";
import { calendarMonth } from "../employees/index.js";
import type { EmploymentConsistency } from "../employees/index.js";
import type { AttendanceRepository } from "./attendance.repository.js";
import type { AttendancePageDto } from "./attendance.dto.js";
import type {
  CellSnapshot,
  ParsedAttendancePageQuery,
} from "./attendance.types.js";
import { cellId } from "./attendance.types.js";
import { projectAttendanceCell } from "./attendance-projection.js";
import {
  attendanceTotals,
  monthTotalsFromHalves,
} from "./attendance-totals.js";

export async function readAttendancePage(
  tx: ProductTransaction,
  fetchedAt: string,
  input: ParsedAttendancePageQuery,
  employment: EmploymentConsistency,
  repository: AttendanceRepository,
): Promise<AttendancePageDto> {
  const { start, end, days } = calendarMonth(input.month);
  await repository.assertMonthInvariant(tx, start, end);
  const { employees, ...pagination } = await employment.readMonthPage(tx, {
    ...input,
    start,
    end,
  });
  const ids = employees.map((e) => e.id);
  const dates = days.map((d) => d.date);
  const stored = new Map(
    (await repository.readPageCells(tx, start, end, ids)).map((c) => [
      cellId(c),
      c,
    ]),
  );
  const cells: CellSnapshot[] = [];
  // Cell keys retain their G1 ID/date/kind order; employees retain SQL order.
  for (const employee of [...employees].sort((a, b) =>
    a.id.localeCompare(b.id),
  ))
    for (const date of dates)
      for (const kind of ["overtime", "work"] as const) {
        const key = { employeeId: employee.id, date, kind };
        cells.push(
          projectAttendanceCell(key, employee, stored.get(cellId(key))),
        );
      }
  const rowTotals = attendanceTotals(ids, dates, cells);
  return {
    month: input.month,
    fetchedAt,
    employees,
    cells,
    pagination: {
      ...pagination,
      requestedPage: input.page,
      pageSize: input.pageSize,
    },
    employeeTotals: {
      work: rowTotals.work.byEmployee,
      overtime: rowTotals.overtime.byEmployee,
    },
    monthTotals: monthTotalsFromHalves(
      dates,
      await repository.aggregateMonth(tx, start, end),
    ),
  };
}
