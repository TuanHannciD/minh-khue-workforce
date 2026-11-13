import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import pg from "pg";

const input = await new Promise((resolve, reject) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => resolve(data.split("\n")));
  process.stdin.on("error", reject);
});
const [operation, username, password] = input;
if (!operation || (operation !== "list" && (!username || !password)))
  throw new Error("invalid account operation input");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const hash = () =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
try {
  if (operation === "list") {
    const result = await pool.query(
      'SELECT "username" FROM "User" ORDER BY "username"',
    );
    for (const row of result.rows) console.log(row.username);
  } else {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      if (operation === "add") {
        const existing = await client.query(
          'SELECT 1 FROM "User" WHERE "username" = $1',
          [username],
        );
        if (existing.rowCount) throw new Error("account already exists");
        await client.query(
          'INSERT INTO "User" ("id", "username", "passwordHash") VALUES ($1, $2, $3)',
          [randomUUID(), username, await hash()],
        );
        console.log(`Account created: ${username}`);
      } else if (operation === "reset-password") {
        const result = await client.query(
          'UPDATE "User" SET "passwordHash" = $1, "authVersion" = "authVersion" + 1, "updatedAt" = clock_timestamp() WHERE "username" = $2 RETURNING "id"',
          [await hash(), username],
        );
        if (!result.rowCount) throw new Error("account does not exist");
        await client.query(
          'UPDATE "Session" SET "revokedAt" = COALESCE("revokedAt", clock_timestamp()) WHERE "userId" = $1::uuid',
          [result.rows[0].id],
        );
        console.log(`Password reset: ${username}`);
      } else throw new Error("unsupported account operation");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
