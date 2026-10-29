import type { CellKeyDto, MonthDto } from "./types";
import { cellIdentity, orderedMonthCells } from "./month-view";
export const cellKey = (cell: CellKeyDto): CellKeyDto => ({
  employeeId: cell.employeeId,
  date: cell.date,
  kind: cell.kind,
});
export function unionCells(a: CellKeyDto[], b: CellKeyDto[]): CellKeyDto[] {
  return [
    ...new Map(
      [...a, ...b].map((cell) => [cellIdentity(cell), cellKey(cell)]),
    ).values(),
  ];
}
export function toggleCell(
  cells: CellKeyDto[],
  cell: CellKeyDto,
): CellKeyDto[] {
  return cells.some((c) => cellIdentity(c) === cellIdentity(cell))
    ? cells.filter((c) => cellIdentity(c) !== cellIdentity(cell))
    : unionCells(cells, [cell]);
}
export function visibleCells(
  month: MonthDto,
  cells: CellKeyDto[],
): CellKeyDto[] {
  const people = new Set(month.employees.map((e) => e.id));
  return unionCells([], cells).filter(
    (c) =>
      people.has(c.employeeId) &&
      c.date.slice(0, 7) === month.month &&
      month.cells.some((s) => cellIdentity(s) === cellIdentity(c)),
  );
}
export function rectangleCells(
  month: MonthDto,
  a: CellKeyDto,
  b: CellKeyDto,
): CellKeyDto[] {
  const ids = month.employees.map((e) => e.id),
    first = ids.indexOf(a.employeeId),
    last = ids.indexOf(b.employeeId);
  if (
    first < 0 ||
    last < 0 ||
    a.kind !== b.kind ||
    a.date.slice(0, 7) !== month.month ||
    b.date.slice(0, 7) !== month.month
  )
    return [];
  const people = new Set(
    ids.slice(Math.min(first, last), Math.max(first, last) + 1),
  );
  const [from, to] = [a.date, b.date].sort();
  return orderedMonthCells(month, a.kind)
    .filter((c) => people.has(c.employeeId) && c.date >= from! && c.date <= to!)
    .map(cellKey);
}
