import { randomUUID } from "node:crypto";
import type { Database } from "../../infrastructure/db/database.js";
import { Prisma } from "../../infrastructure/db/generated/client.js";
import { hashPassword } from "./password.js";

export interface ProvisionAccount {
  username: string;
  password: string;
}

export type AccountErrorCode =
  "INVALID_INPUT" | "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND";

export class AccountOperationError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(
      {
        INVALID_INPUT: "Invalid account command input",
        ACCOUNT_EXISTS: "Account already exists",
        ACCOUNT_NOT_FOUND: "Reset requires an existing account",
      }[code],
    );
    this.name = "AccountOperationError";
  }
}

// Operator subset only: provisioning and legacy sandbox reset keep their policy.
export function validateAccountUsername(
  username: unknown,
): asserts username is string {
  if (
    typeof username !== "string" ||
    Array.from(username).length < 1 ||
    Array.from(username).length > 64 ||
    /\s/u.test(username)
  )
    throw new AccountOperationError("INVALID_INPUT");
}

function isUsernameConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  )
    return false;
  const meta = error.meta;
  if (meta?.modelName && meta.modelName !== "User") return false;
  if (Array.isArray(meta?.target))
    return meta.target.length === 1 && meta.target[0] === "username";
  // Prisma 7's pg adapter reports the constraint in driverAdapterError.cause.
  const adapter = meta?.driverAdapterError as
    | {
        cause?: {
          kind?: string;
          table?: string;
          constraint?: { index?: string; fields?: string[] };
        };
      }
    | undefined;
  const cause = adapter?.cause;
  return (
    cause?.kind === "UniqueConstraintViolation" &&
    cause.table === "User" &&
    (cause.constraint?.index === "User_username_key" ||
      (cause.constraint?.fields?.length === 1 &&
        cause.constraint.fields[0] === "username"))
  );
}

export async function addAccount(
  db: Database,
  account: ProvisionAccount,
): Promise<void> {
  validateAccountUsername(account.username);
  const passwordHash = await hashPassword(account.password);
  await db.transaction(async (tx) => {
    try {
      await tx.user.create({
        data: { id: randomUUID(), username: account.username, passwordHash },
      });
    } catch (error) {
      if (isUsernameConflict(error))
        throw new AccountOperationError("ACCOUNT_EXISTS");
      throw error;
    }
  });
}

export async function listAccounts(db: Database): Promise<string[]> {
  const users = await db.client.user.findMany({
    select: { username: true },
    orderBy: { username: "asc" },
  });
  return users.map((user) => user.username);
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
    if (!user) throw new AccountOperationError("ACCOUNT_NOT_FOUND");
    await tx.$executeRaw`UPDATE "User" SET "passwordHash" = ${hash}, "authVersion" = "authVersion" + 1, "updatedAt" = clock_timestamp() WHERE "id" = ${user.id}::uuid`;
    await tx.$executeRaw`UPDATE "Session" SET "revokedAt" = COALESCE("revokedAt", clock_timestamp()) WHERE "userId" = ${user.id}::uuid`;
  });
}
