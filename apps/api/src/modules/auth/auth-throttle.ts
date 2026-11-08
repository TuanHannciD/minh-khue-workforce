import { createHmac } from "node:crypto";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { Database } from "../../infrastructure/db/database.js";

// Persistent adapter: both buckets consumed in one transaction before Argon2.
export class AuthThrottle implements ThrottlerStorage {
  constructor(
    private readonly db: Database,
    private readonly secret: string,
  ) {}
  async increment(
    key: string,
    ttl: number,
    limit: number,
  ): ReturnType<ThrottlerStorage["increment"]> {
    const result = await this.consume([{ key, ttl, limit }]);
    return {
      totalHits: result.hits,
      timeToExpire: result.retryAfter,
      isBlocked: result.blocked,
      timeToBlockExpire: result.retryAfter,
    };
  }
  async login(ip: string, username: string) {
    return this.consume([
      { key: `ip:${ip}`, ttl: 60000, limit: 20 },
      { key: `username:${username}`, ttl: 900000, limit: 5 },
    ]);
  }
  private async consume(
    buckets: { key: string; ttl: number; limit: number }[],
  ) {
    return this.db.transaction(async (tx) => {
      // Fixed lock order across instances; no raw username/IP persisted.
      const sorted = buckets
        .map((bucket) => ({
          ...bucket,
          hash: createHmac("sha256", this.secret).update(bucket.key).digest(),
        }))
        .sort((a, b) => Buffer.compare(a.hash, b.hash));
      let retryAfter = 0;
      let hits = 0;
      let blocked = false;
      for (const bucket of sorted) {
        const rows = await tx.$queryRaw<
          { attempts: number; remaining: number }[]
        >`
          INSERT INTO "AuthThrottle" ("bucketKey", "windowStart", "attempts", "expiresAt")
          SELECT ${bucket.hash}, to_timestamp(floor(extract(epoch from clock_timestamp()) * 1000 / ${bucket.ttl}) * ${bucket.ttl} / 1000), 1,
            to_timestamp((floor(extract(epoch from clock_timestamp()) * 1000 / ${bucket.ttl}) + 1) * ${bucket.ttl} / 1000)
          ON CONFLICT ("bucketKey", "windowStart") DO UPDATE SET "attempts" = LEAST("AuthThrottle"."attempts" + 1, 2147483646)
          RETURNING "attempts", GREATEST(1, ceil(extract(epoch from ("expiresAt" - clock_timestamp()))))::int AS "remaining"`;
        const row = rows[0]!;
        hits = Math.max(hits, row.attempts);
        if (row.attempts > bucket.limit) {
          blocked = true;
          retryAfter = Math.max(retryAfter, row.remaining);
        }
      }
      await tx.$executeRaw`DELETE FROM "AuthThrottle" WHERE ("bucketKey", "windowStart") IN (SELECT "bucketKey", "windowStart" FROM "AuthThrottle" WHERE "expiresAt" < clock_timestamp() ORDER BY "expiresAt" LIMIT 100)`;
      return { blocked, retryAfter, hits };
    });
  }
}
