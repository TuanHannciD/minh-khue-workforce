import { HttpException } from "@nestjs/common";

export function attendanceError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never {
  throw new HttpException(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    status,
  );
}
export const invalidInput = (): never =>
  attendanceError(400, "INVALID_INPUT", "Dữ liệu yêu cầu không hợp lệ.");
