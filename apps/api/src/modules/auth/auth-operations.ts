import { randomUUID } from "node:crypto";
import type { Database } from "../../infrastructure/db/database.js";
import { hashPassword } from "./password.js";

export interface ProvisionAccount {
  username: string;
  password: string;
}

export async function provisionAccounts(
  db: Database,
  accounts: ProvisionAccount[],
) {
  if (
    accounts.length !== 2 ||
    new Set(accounts.map((a) => a.username)).size !== 2 ||
    accounts.some(
      (a) =>
        typeof a.username !== "string" ||
        Array.from(a.username).length < 1 ||
        Array.from(a.username).length > 64,
    )
  )
    throw new Error("Provision requires exactly two distinct valid usernames");
  const hashes = await Promise.all(
    accounts.map((a) => hashPassword(a.password)),
  );
  await db.transaction(async (tx) => {
    // Serializes two provision commands even on an empty table.
    await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
    if ((await tx.user.count()) !== 0)
      throw new Error("Provision refuses a nonempty user table");
    await tx.user.createMany({
      data: accounts.map((account, i) => ({
        id: randomUUID(),
        username: account.username,
        passwordHash: hashes[i]!,
      })),
    });
  });
}

export async function resetPassword(
  db: Database,
  username: string,
  password: string,
) {
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "User" WHERE "username" = ${username} FOR UPDATE`;
    const user = rows[0];
    if (!user) throw new Error("Reset requires an existing account");
    await tx.$executeRaw`UPDATE "User" SET "passwordHash" = ${hash}, "authVersion" = "authVersion" + 1, "updatedAt" = clock_timestamp() WHERE "id" = ${user.id}::uuid`;
    await tx.$executeRaw`UPDATE "Session" SET "revokedAt" = COALESCE("revokedAt", clock_timestamp()) WHERE "userId" = ${user.id}::uuid`;
  });
}
