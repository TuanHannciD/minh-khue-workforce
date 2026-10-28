import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedSession } from "./auth.types.js";

export type SessionRequest = Request & {
  authenticatedSession: AuthenticatedSession;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    request.authenticatedSession = await this.auth.requireSession(request);
    return true;
  }
}
