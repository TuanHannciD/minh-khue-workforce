import { expect, it } from "vitest";
import { toPageTable, toMonthTable } from "./attendance-read-view";
import type { AttendanceReadView } from "./attendance-read-view";
import type { AttendancePageDto } from "./types";
import { attendanceFixture as month } from "../preview/attendance-fixture";
import { rectangleCells, toggleCell, unionCells } from "./cell-selection";
import { captureBulkIntent } from "./fill-intent";
import { isPageTransitionCurrent } from "./page-view";
import type { PageTransitionTicket } from "./page-view";
import { AttendanceDraft } from "./attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";

it("page_projection_has_explicit_totals without a full-month facade", () => {
  const page: AttendancePageDto = {
    month: month.month,
    fetchedAt: month.fetchedAt,
    employees: month.employees.slice(0, 1),
    cells: month.cells.filter((c) => c.employeeId === month.employees[0]!.id),
    employeeTotals: {
      work: [{ employeeId: month.employees[0]!.id, value: 7 }],
      overtime: [],
    },
    monthTotals: {
      work: { byDate: [], grandTotal: 999 },
      overtime: { byDate: [], grandTotal: 80 },
    },
    pagination: {
      requestedPage: 2,
      page: 2,
      pageSize: 25,
      from: 26,
      to: 26,
      totalPages: 2,
      totalResults: 26,
      monthEmployeeCount: 1000,
    },
  };
  const table = toPageTable(page);
  expect(table).toEqual({
    month: page.month,
    employees: page.employees,
    cells: page.cells,
    employeeTotals: page.employeeTotals,
    monthTotals: page.monthTotals,
    range: { from: 26, to: 26, totalResults: 26, monthEmployeeCount: 1000 },
  });
  expect(table.employeeTotals).toBe(page.employeeTotals);
  expect(table.monthTotals).toBe(page.monthTotals);
  expect(table).not.toHaveProperty("totals");
  expect(toMonthTable(month)).toEqual({
    month: month.month,
    employees: month.employees,
    cells: month.cells,
    employeeTotals: {
      work: month.totals.work.byEmployee,
      overtime: month.totals.overtime.byEmployee,
    },
    monthTotals: {
      work: {
        byDate: month.totals.work.byDate,
        grandTotal: month.totals.work.grandTotal,
      },
      overtime: {
        byDate: month.totals.overtime.byDate,
        grandTotal: month.totals.overtime.grandTotal,
      },
    },
    range: { from: 1, to: 20, totalResults: 20, monthEmployeeCount: 20 },
  });
  expect(toMonthTable({ ...month, employees: [], cells: [] }).range).toEqual({
    from: 0,
    to: 0,
    totalResults: 0,
    monthEmployeeCount: 0,
  });
  expect(
    toPageTable({
      ...page,
      employees: [],
      cells: [],
      pagination: { ...page.pagination, from: 0, to: 0, totalResults: 0 },
    }).range,
  ).toEqual({ from: 0, to: 0, totalResults: 0, monthEmployeeCount: 1000 });
});

it("guard_rejects_stale_generation and epoch; pending/reconciling transition count is zero", () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const owner = new AttendanceDraft(boundary);
  owner.open(month, month.cells[0]!, "owner");
  owner.change({ raw: "3,25", custom: true, error: "invalid", reminder: true });
  const before = structuredClone(owner.edit);
  const ticket: PageTransitionTicket = {
    owner,
    generation: owner.ownerGeneration,
    epoch: boundary.current(),
    next: { month: month.month, q: "", page: 2, pageSize: 25 as const },
  };
  expect(isPageTransitionCurrent(ticket)).toBe(true);
  owner.outcome = { type: "pending" };
  expect(isPageTransitionCurrent(ticket)).toBe(false);
  owner.outcome = { type: "editing" };
  owner.reconciling = true;
  expect(isPageTransitionCurrent(ticket)).toBe(false);
  owner.reconciling = false;
  expect(owner.edit).toEqual(before);
  boundary.invalidate();
  boundary.allowWrites();
  expect(isPageTransitionCurrent(ticket)).toBe(false);
  owner.clear();
  owner.open(month, month.cells[0]!, "owner");
  expect(
    isPageTransitionCurrent({ ...ticket, epoch: boundary.current() }),
  ).toBe(false);
});

it("page_local_rectangle_rejects_hidden_endpoint and fill never targets its source", () => {
  const employees = Array.from({ length: 26 }, (_, i) => ({
    ...month.employees[0]!,
    id: `fixture-${i + 1}`,
  }));
  const template = month.cells.find(
    (c) => c.kind === "work" && c.value?.type === "number",
  )!;
  const all = employees.flatMap((e) =>
    [1, 2, 3].map((d) => ({
      ...template,
      employeeId: e.id,
      date: `2024-02-0${d}`,
      value: d === 1 ? template.value : null,
    })),
  );
  const view: AttendanceReadView = {
    month: month.month,
    employees: employees.slice(0, 25),
    cells: all.filter((c) => c.employeeId !== employees[25]!.id),
  };
  const source = view.cells[0]!;
  expect(rectangleCells(view, source, all.at(-1)!)).toEqual([]);
  const three = unionCells([source, view.cells[1]!], [view.cells[2]!, source]);
  expect(toggleCell(three, view.cells[1]!)).toEqual([
    expect.objectContaining({ date: "2024-02-01" }),
    expect.objectContaining({ date: "2024-02-03" }),
  ]);
  const intent = captureBulkIntent(
    view,
    [...three, all.at(-1)!],
    null,
    "fill-empty",
    source,
  )!;
  expect(intent.targets).toHaveLength(2);
  expect(intent.source).toMatchObject({
    employeeId: source.employeeId,
    date: source.date,
  });
  expect(
    captureBulkIntent(view, three, null, "fill-empty", all.at(-1)!),
  ).toBeNull();
  expect(
    captureBulkIntent(view, three, null, "fill-empty", view.cells[1]!),
  ).toBeNull();
});
