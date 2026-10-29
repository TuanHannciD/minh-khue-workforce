import type {
  AttendanceKind,
  CellKeyDto,
  CellSnapshotDto,
  MonthDto,
} from "./types";
export function monthDays(
  month: string,
): { date: string; day: number; weekday: string }[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000"))
    throw new Error("Tháng không hợp lệ");
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5));
  const cursor = new Date(0);
  cursor.setUTCFullYear(year, index, 0);
  const count = cursor.getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    cursor.setUTCFullYear(year, index - 1, i + 1);
    return {
      date: `${month}-${String(i + 1).padStart(2, "0")}`,
      day: i + 1,
      weekday: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][cursor.getUTCDay()]!,
    };
  });
}
export function cellIdentity(cell: CellKeyDto): string {
  return `${cell.employeeId}/${cell.date}/${cell.kind}`;
}
export function orderedMonthCells(
  month: MonthDto,
  kind: AttendanceKind,
): CellSnapshotDto[] {
  const cells = new Map(
    month.cells
      .filter((cell) => cell.kind === kind)
      .map((cell) => [cellIdentity(cell), cell]),
  );
  const days = monthDays(month.month);
  return month.employees.flatMap((employee) =>
    days.flatMap((day) => {
      const cell = cells.get(
        cellIdentity({ employeeId: employee.id, date: day.date, kind }),
      );
      return cell ? [cell] : [];
    }),
  );
}
export function nextEligibleCell(
  cells: CellSnapshotDto[],
  current: CellKeyDto,
  direction: "tab" | "enter",
): CellSnapshotDto | null {
  const sameKind = cells.filter((cell) => cell.kind === current.kind);
  const index = sameKind.findIndex(
    (cell) => cellIdentity(cell) === cellIdentity(current),
  );
  if (index < 0) return null;
  return (
    sameKind
      .slice(index + 1)
      .find(
        (cell) =>
          cell.state === "editable" &&
          (direction === "tab" || cell.date === current.date),
      ) ?? null
  );
}
