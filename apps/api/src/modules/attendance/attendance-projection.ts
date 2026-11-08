import { employmentState } from "../employees/index.js";
import type { LockedEmployee } from "../employees/index.js";
import { attendanceError } from "./attendance-errors.js";
import type { CellKey, CellSnapshot, StoredCell } from "./attendance.types.js";

export function projectAttendanceCell(
  key: CellKey,
  employee: LockedEmployee,
  stored?: StoredCell,
): CellSnapshot {
  const state = employmentState(employee, key.date);
  if (
    state !== "editable" &&
    stored &&
    (stored.valueType !== "empty" || stored.reminder)
  )
    attendanceError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Dữ liệu cần được kiểm tra trước khi tiếp tục.",
    );
  const value =
    !stored || stored.valueType === "empty"
      ? null
      : stored.valueType === "absence"
        ? { type: "absence" as const }
        : { type: "number" as const, value: stored.halfUnits! / 2 };
  return {
    employeeId: key.employeeId,
    date: key.date,
    kind: key.kind,
    value,
    reminder: stored?.reminder ?? false,
    revision: stored?.revision ?? "0",
    state,
  };
}
