import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response, Request } from "express";
import { AuthService } from "./auth.service.js";
import { ApiErrorDto, LoginDto, LogoutDto, SessionDto } from "./auth.dto.js";
import { SessionGuard } from "./session.guard.js";
import type { SessionRequest } from "./session.guard.js";
import { authError } from "./auth.errors.js";

@ApiTags("auth")
@ApiResponse({ status: 400, type: ApiErrorDto })
@ApiResponse({ status: 401, type: ApiErrorDto })
@ApiResponse({ status: 403, type: ApiErrorDto })
@ApiResponse({ status: 415, type: ApiErrorDto })
@ApiResponse({ status: 413, type: ApiErrorDto })
@ApiResponse({ status: 503, type: ApiErrorDto })
@Controller("api/v1/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: SessionDto })
  @ApiResponse({
    status: 429,
    type: ApiErrorDto,
    headers: { "Retry-After": { schema: { type: "integer" } } },
  })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      input,
      request.ip ?? request.socket.remoteAddress ?? "unknown",
    );
    if (result.limited) {
      response.setHeader("Retry-After", result.retryAfter);
      throw authError(
        429,
        "LOGIN_RATE_LIMITED",
        "Bạn đã thử đăng nhập nhiều lần. Vui lòng thử lại sau.",
      );
    }
    response.cookie(this.auth.cookieName, result.rawToken, {
      ...this.auth.cookieOptions,
      maxAge: 43200000,
    });
    return result.dto;
  }

  @Get("session")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: SessionDto })
  session(@Req() request: SessionRequest) {
    return this.auth.toDto(request.authenticatedSession);
  }

  @Post("logout")
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiBody({ type: LogoutDto })
  @ApiNoContentResponse()
  async logout(
    @Body() _input: LogoutDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request);
    response.clearCookie(this.auth.cookieName, this.auth.cookieOptions);
  }
}
