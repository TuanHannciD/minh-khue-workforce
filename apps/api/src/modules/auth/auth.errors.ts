import { HttpException } from "@nestjs/common";

export function authError(
  status: number,
  code: string,
  message: string,
): HttpException {
  return new HttpException({ error: { code, message } }, status);
}
export function sessionRequired() {
  return authError(
    401,
    "SESSION_REQUIRED",
    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  );
}
