import { randomUUID } from "node:crypto";
import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

export function requestPolicy(origin: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    response.locals.requestId = randomUUID();
    response.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers.origin !== origin)
        return sendError(
          response,
          403,
          "ORIGIN_NOT_ALLOWED",
          "Yêu cầu không đến từ ứng dụng được phép.",
        );
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers["content-type"] ?? "",
        )
      )
        return sendError(
          response,
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Yêu cầu cần dữ liệu JSON.",
        );
    }
    next();
  };
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({
    error: { code, message },
    requestId: response.locals.requestId as string,
  });
}

export function parserError(
  error: { type?: string },
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  void _next; // Express recognizes error middleware by its four-argument signature.
  if (error.type === "entity.too.large")
    return sendError(
      response,
      413,
      "PAYLOAD_TOO_LARGE",
      "Dữ liệu vượt kích thước cho phép.",
    );
  return sendError(
    response,
    400,
    "INVALID_INPUT",
    "Dữ liệu yêu cầu không hợp lệ.",
  );
}

@Catch()
export class SafeHttpErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      if (typeof body === "object" && "error" in body) {
        return response
          .status(error.getStatus())
          .json({ ...body, requestId: response.locals.requestId as string });
      }
      const status = error.getStatus();
      return sendError(
        response,
        status,
        status === 404 ? "NOT_FOUND" : "INVALID_INPUT",
        status === 404
          ? "Không tìm thấy nội dung."
          : "Dữ liệu yêu cầu không hợp lệ.",
      );
    }
    return sendError(
      response,
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Chưa thể xử lý. Vui lòng thử lại sau.",
    );
  }
}
