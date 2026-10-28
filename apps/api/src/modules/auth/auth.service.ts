import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AUTH_CONFIG } from "../../infrastructure/config/auth-config.js";
import type { AuthConfig } from "../../infrastructure/config/auth-config.js";
import { Database } from "../../infrastructure/db/database.js";
import type { LoginDto, SessionDto } from "./auth.dto.js";
import { authError, sessionRequired } from "./auth.errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { AuthThrottle } from "./auth-throttle.js";
import { SessionAuthorizer } from "./session-authorizer.js";
import type { AuthenticatedSession } from "./auth.types.js";

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(
    randomBytes(32).toString("base64url"),
  );
  private readonly throttle: AuthThrottle | undefined;
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SessionAuthorizer) private readonly authorizer: SessionAuthorizer,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {
    if (config.throttleSecret)
      this.throttle = new AuthThrottle(db, config.throttleSecret);
  }

  get cookieName() {
    return this.config.production ? "__Host-mkw_session" : "mkw_session";
  }
  get cookieOptions() {
    return {
      httpOnly: true,
      secure: Boolean(this.config.production),
      sameSite: "lax" as const,
      path: "/",
    };
  }

  private tokenHash(request: Request) {
    const value: unknown = request.cookies?.[this.cookieName];
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
      throw sessionRequired();
    return createHash("sha256").update(value).digest();
  }

  async login(input: LoginDto, ip: string) {
    if (Buffer.byteLength(input.password, "utf8") > 1024)
      throw authError(400, "INVALID_INPUT", "Dữ liệu đăng nhập không hợp lệ.");
    if (!this.throttle)
      throw authError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Chưa thể đăng nhập. Vui lòng thử lại sau.",
      );
    const quota = await this.throttle.login(ip, input.username);
    if (quota.blocked)
      return { limited: true as const, retryAfter: quota.retryAfter };
    const user = await this.db.client.user.findUnique({
      where: { username: input.username },
    });
    const valid = await verifyPassword(
      user?.passwordHash ?? (await this.dummyHash),
      input.password,
    );
    const invalid = () =>
      authError(
        401,
        "INVALID_CREDENTIALS",
        "Tên đăng nhập hoặc mật khẩu chưa đúng.",
      );
    if (!user || !valid) throw invalid();
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest();
    const session = await this.db.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR SHARE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (
        !current ||
        current.passwordHash !== user.passwordHash ||
        current.authVersion !== user.authVersion
      )
        throw invalid();
      await tx.$executeRaw`INSERT INTO "Session" ("id", "tokenHash", "userId", "authVersion", "createdAt", "expiresAt", "lastSeenAt")
        VALUES (${randomUUID()}::uuid, ${tokenHash}, ${user.id}::uuid, ${user.authVersion}, clock_timestamp(), clock_timestamp() + interval '12 hours', clock_timestamp())`;
      return this.authorizer.read(tx, tokenHash);
    });
    return { limited: false as const, rawToken, dto: this.toDto(session) };
  }

  async requireSession(request: Request): Promise<AuthenticatedSession> {
    const tokenHash = this.tokenHash(request);
    return this.db.transaction(async (tx) => {
      await this.authorizer.read(tx, tokenHash);
      await tx.$executeRaw`UPDATE "Session" SET "lastSeenAt" = clock_timestamp()
        WHERE "tokenHash" = ${tokenHash} AND "lastSeenAt" <= clock_timestamp() - interval '1 minute'
          AND "lastSeenAt" > clock_timestamp() - interval '2 hours' AND "expiresAt" > clock_timestamp() AND "revokedAt" IS NULL`;
      return this.authorizer.read(tx, tokenHash);
    });
  }

  async logout(request: Request) {
    let tokenHash: Buffer;
    try {
      tokenHash = this.tokenHash(request);
    } catch {
      return;
    }
    const session = await this.db.client.session.findUnique({
      where: { tokenHash: Uint8Array.from(tokenHash) },
    });
    if (!session) return;
    await this.db.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId}::uuid FOR UPDATE`;
      await tx.$executeRaw`UPDATE "Session" SET "revokedAt" = COALESCE("revokedAt", clock_timestamp()) WHERE "id" = ${session.id}::uuid`;
    });
  }

  toDto(session: AuthenticatedSession): SessionDto {
    return {
      user: session.identity,
      expiresAt: session.expiresAt.toISOString(),
      idleExpiresAt: session.idleExpiresAt.toISOString(),
    };
  }
}
