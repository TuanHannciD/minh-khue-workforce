import type { AttendancePageDto, MonthDto } from "./types";

export type AttendanceReadView = Pick<
  MonthDto,
  "month" | "employees" | "cells"
>;
export type AttendanceTableData = AttendanceReadView & {
  employeeTotals: AttendancePageDto["employeeTotals"];
  monthTotals: AttendancePageDto["monthTotals"];
  range: Pick<
    AttendancePageDto["pagination"],
    "from" | "to" | "totalResults" | "monthEmployeeCount"
  >;
};

export function toPageTable(page: AttendancePageDto): AttendanceTableData {
  const { from, to, totalResults, monthEmployeeCount } = page.pagination;
  return {
    month: page.month,
    employees: page.employees,
    cells: page.cells,
    employeeTotals: page.employeeTotals,
    monthTotals: page.monthTotals,
    range: { from, to, totalResults, monthEmployeeCount },
  };
}

export function toMonthTable(month: MonthDto): AttendanceTableData {
  const count = month.employees.length;
  const { work, overtime } = month.totals;
  return {
    month: month.month,
    employees: month.employees,
    cells: month.cells,
    employeeTotals: { work: work.byEmployee, overtime: overtime.byEmployee },
    monthTotals: {
      work: { byDate: work.byDate, grandTotal: work.grandTotal },
      overtime: { byDate: overtime.byDate, grandTotal: overtime.grandTotal },
    },
    range: {
      from: count ? 1 : 0,
      to: count,
      totalResults: count,
      monthEmployeeCount: count,
    },
  };
}
