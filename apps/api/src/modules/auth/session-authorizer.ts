import { Injectable } from "@nestjs/common";
import type { ProductTransaction } from "../../infrastructure/db/database.js";
import type { AuthenticatedSession, MutationCredential } from "./auth.types.js";
import { sessionRequired } from "./auth.errors.js";

interface SessionRow {
  id: string;
  userId: string;
  username: string;
  tokenHash: Uint8Array;
  expiresAt: Date;
  lastSeenAt: Date;
  now: Date;
}

@Injectable()
export class SessionAuthorizer {
  async read(
    tx: ProductTransaction,
    tokenHash: Uint8Array,
  ): Promise<AuthenticatedSession> {
    const rows = await tx.$queryRaw<SessionRow[]>`
      SELECT s."id", s."userId", u."username", s."tokenHash", s."expiresAt", s."lastSeenAt", clock_timestamp() AS "now"
      FROM "Session" s JOIN "User" u ON u."id" = s."userId"
      WHERE s."tokenHash" = ${Buffer.from(tokenHash)} AND s."revokedAt" IS NULL
        AND s."authVersion" = u."authVersion" AND s."expiresAt" > clock_timestamp()
        AND s."lastSeenAt" > clock_timestamp() - interval '2 hours'`;
    const row = rows[0];
    if (!row) throw sessionRequired();
    return {
      identity: { userId: row.userId, username: row.username },
      credential: { userId: row.userId, sessionId: row.id, tokenHash },
      expiresAt: row.expiresAt,
      idleExpiresAt: new Date(
        Math.min(row.expiresAt.getTime(), row.lastSeenAt.getTime() + 7200000),
      ),
    };
  }

  async authorizeMutation(
    tx: ProductTransaction,
    credential: MutationCredential,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${credential.userId}::uuid FOR SHARE`;
    const session = await this.read(tx, credential.tokenHash);
    if (
      session.credential.sessionId !== credential.sessionId ||
      session.identity.userId !== credential.userId
    )
      throw sessionRequired();
    return session.identity;
  }
}
