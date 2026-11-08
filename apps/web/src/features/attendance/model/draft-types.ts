import type { WriteAttendance } from "../api/attendance";
import type { CellSnapshotDto, EmployeeDto } from "./types";
import type { WriteIntent } from "./fill-intent";

// Shared draft vocabulary, independent of the state owner and recovery builder.
export type EditingCell = {
  month: string;
  cell: CellSnapshotDto;
  employee: EmployeeDto;
  raw: string;
  reminder: boolean;
  custom: boolean;
  error: string;
  ownerUserId: string;
  epoch: number;
  targets: WriteAttendance["targets"];
  mode: "patch-cell" | "fill-empty" | "replace";
  source: WriteIntent["source"] | null;
  bulk?: {
    intent: WriteIntent;
    cells: CellSnapshotDto[];
    employees: EmployeeDto[];
  };
};
export type SaveOutcome = {
  type: "editing" | "pending" | "saved" | "rejected" | "conflict" | "unknown";
  message?: string;
};
