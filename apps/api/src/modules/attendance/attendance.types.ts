export type AttendanceKind = "work" | "overtime";
export interface ParsedAttendancePageQuery {
  month: string;
  q: string;
  page: number;
  pageSize: 25 | 50;
}
export type CellValue =
  null | { type: "number"; value: number } | { type: "absence" };
export interface CellKey {
  employeeId: string;
  date: string;
  kind: AttendanceKind;
}
export interface CellExpectation extends CellKey {
  expectedRevision: string;
}
export interface CellSnapshot extends CellKey {
  value: CellValue;
  reminder: boolean;
  revision: string;
  state: "editable" | "before-start" | "after-end";
}
export interface StoredCell extends CellKey {
  valueType: "empty" | "number" | "absence";
  halfUnits: number | null;
  reminder: boolean;
  revision: string;
}
export interface MonthAggregateHalves {
  kind: AttendanceKind;
  date: string;
  halfUnits: bigint;
}
export interface KindTotals {
  byEmployee: { employeeId: string; value: number }[];
  byDate: { date: string; value: number }[];
  grandTotal: number;
}
export const cellId = (key: CellKey) =>
  `${key.employeeId}/${key.date}/${key.kind}`;
export const compareCells = (a: CellKey, b: CellKey) =>
  cellId(a).localeCompare(cellId(b));
