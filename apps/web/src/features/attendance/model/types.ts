import type { components } from "@/shared/api/generated/schema";
export type MonthDto = components["schemas"]["MonthDto"];
export type CellSnapshotDto = components["schemas"]["CellSnapshotDto"];
export type CellKeyDto = components["schemas"]["CellKeyDto"];
export type CellValueDto = CellSnapshotDto["value"];
export type AttendanceKind = CellKeyDto["kind"];
export type EmployeeDto = components["schemas"]["EmployeeDto"];
