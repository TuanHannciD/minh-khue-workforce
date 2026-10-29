import type { AttendanceKind, CellValueDto } from "./types";
export type ParseResult =
  { valid: true; value: CellValueDto } | { valid: false; message: string };
export function parseNumberInput(
  raw: string,
  kind: AttendanceKind,
): ParseResult {
  const text = raw.trim();
  if (!text) return { valid: true, value: null };
  if (text === "F" && kind === "work")
    return { valid: true, value: { type: "absence" } };
  // Validate decimal text before Number: floating-point coercion must not round
  // an invalid fraction (e.g. 0.50000000000000001) into an accepted half unit.
  if (!/^\d+(?:[.,](?:0+|50*))?$/.test(text)) {
    return {
      valid: false,
      message:
        "Nhập số theo bước 0,5, dùng dấu phẩy hoặc dấu chấm. Không làm tròn giá trị.",
    };
  }
  const number = Number(text.replace(",", "."));
  const cap = kind === "work" ? 30 : 24;
  if (!Number.isFinite(number) || number > cap)
    return {
      valid: false,
      message: `Mỗi ô tối đa ${cap} ${kind === "work" ? "công" : "giờ"}. Giữ nguyên số để sửa.`,
    };
  if (number === 0)
    return kind === "work"
      ? { valid: true, value: { type: "absence" } }
      : {
          valid: false,
          message:
            "Không tăng ca: chọn Để trống. Số giờ phải lớn hơn 0, theo bước 0,5.",
        };
  return { valid: true, value: { type: "number", value: number } };
}
export function formatAttendanceValue(value: CellValueDto): string {
  return value === null
    ? ""
    : value.type === "absence"
      ? "F"
      : String(value.value).replace(".", ",");
}
