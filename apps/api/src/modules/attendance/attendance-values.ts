import { attendanceError } from "./attendance-errors.js";
import type { AttendanceKind, CellValue } from "./attendance.types.js";

export function normalizeValue(
  kind: AttendanceKind,
  value: CellValue,
): CellValue {
  if (value === null) return null;
  if (value.type === "absence" && kind === "work") return { type: "absence" };
  if (value.type === "number") {
    const halfUnits = value.value * 2;
    if (
      Number.isInteger(halfUnits) &&
      halfUnits >= (kind === "work" ? 0 : 1) &&
      halfUnits <= (kind === "work" ? 60 : 48)
    )
      return halfUnits === 0
        ? { type: "absence" }
        : { type: "number", value: halfUnits / 2 };
  }
  return attendanceError(
    422,
    "INVALID_ATTENDANCE_VALUE",
    "Giá trị phải theo bước 0,5 và trong giới hạn của loại bảng.",
    {
      fields: [
        {
          path: "operation.value",
          code: "INVALID_VALUE",
          message:
            "Công tối đa 30; tăng ca lớn hơn 0 và tối đa 24 giờ, không nhận F.",
        },
      ],
    },
  );
}
export const sameValue = (a: CellValue, b: CellValue) =>
  a === null
    ? b === null
    : b !== null &&
      a.type === b.type &&
      (a.type !== "number" || (b.type === "number" && a.value === b.value));
