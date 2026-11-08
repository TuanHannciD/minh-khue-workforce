import type { components } from "@/shared/api/generated/schema";
export type MonthDto = components["schemas"]["MonthDto"];
export type AttendancePageQueryDto =
  components["schemas"]["AttendancePageQueryDto"];
// Committed client criteria always carry all generated wire fields.
export type PageCriteria = Required<AttendancePageQueryDto>;
export type AttendancePageDto = components["schemas"]["AttendancePageDto"];
export type AttendancePaginationDto =
  components["schemas"]["AttendancePaginationDto"];
export type AttendancePageEmployeeTotalsDto =
  components["schemas"]["AttendancePageEmployeeTotalsDto"];
export type AttendancePageKindTotalsDto =
  components["schemas"]["AttendancePageKindTotalsDto"];
export type AttendancePageMonthTotalsDto =
  components["schemas"]["AttendancePageMonthTotalsDto"];
export type CellSnapshotDto = components["schemas"]["CellSnapshotDto"];
export type CellKeyDto = components["schemas"]["CellKeyDto"];
export type CellValueDto = CellSnapshotDto["value"];
export type AttendanceKind = CellKeyDto["kind"];
export type EmployeeDto = components["schemas"]["EmployeeDto"];
