import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "../infrastructure/db/database.js";
import type * as AuthDomain from "../modules/auth/index.js";
import type { AccountResult } from "../modules/auth/index.js";
import { readAccountInput } from "./account-input.js";
import {
  AccountPreflightError,
  assertAccountDatabaseReady,
} from "./account-preflight.js";

type AccountIo = {
  input: NodeJS.ReadableStream;
  out: (line: string) => void;
  err: (line: string) => void;
};

function databaseUrlFrom(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.DATABASE_URL;
  if (!value || value.trim() !== value) return;
  try {
    const url = new URL(value);
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      return;
    return value;
  } catch {
    return;
  }
}

export async function runAccountCli(
  io: AccountIo,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<number> {
  const fail = (exit: number, code: string) => {
    io.err(JSON.stringify({ error: { code } }));
    return exit;
  };
  let value: unknown;
  try {
    value = await readAccountInput(io.input);
  } catch {
    return fail(64, "INVALID_INPUT");
  }

  let auth: typeof AuthDomain;
  try {
    auth = await import("../modules/auth/index.js");
  } catch {
    return fail(69, "DEPENDENCY_UNAVAILABLE");
  }
  let command;
  try {
    command = auth.validateAccountCommand(value);
  } catch (error) {
    return error instanceof auth.AccountOperationError
      ? fail(64, "INVALID_INPUT")
      : fail(1, "OPERATION_FAILED");
  }
  const databaseUrl = databaseUrlFrom(env);
  if (!databaseUrl) return fail(78, "CONFIG_INVALID");

  let DatabaseClass: typeof Database;
  try {
    ({ Database: DatabaseClass } =
      await import("../infrastructure/db/database.js"));
  } catch {
    return fail(69, "DEPENDENCY_UNAVAILABLE");
  }
  let db: Database | undefined;
  let result: AccountResult | undefined;
  let failure: { exit: number; code: string } | undefined;
  try {
    await assertAccountDatabaseReady(databaseUrl, cwd);
    db = new DatabaseClass(databaseUrl);
    result = await auth.executeAccountCommand(db, command);
  } catch (error) {
    if (error instanceof AccountPreflightError)
      failure = {
        exit: error.code === "DEPENDENCY_UNAVAILABLE" ? 69 : 78,
        code: error.code,
      };
    else if (error instanceof auth.AccountOperationError)
      failure = {
        exit: error.code === "INVALID_INPUT" ? 64 : 1,
        code: error.code,
      };
    else failure = { exit: 1, code: "OPERATION_FAILED" };
  } finally {
    if (db) {
      try {
        await db.onModuleDestroy();
      } catch {
        failure ??= { exit: 1, code: "OPERATION_FAILED" };
      }
    }
  }
  if (failure) return fail(failure.exit, failure.code);
  io.out(JSON.stringify(result));
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const io: AccountIo = {
    input: process.stdin,
    out: (line) => process.stdout.write(line + "\n"),
    err: (line) => process.stderr.write(line + "\n"),
  };
  if (process.argv.length !== 2) {
    io.err(JSON.stringify({ error: { code: "INVALID_INPUT" } }));
    process.exitCode = 64;
  } else {
    try {
      process.exitCode = await runAccountCli(io, process.env, process.cwd());
    } catch {
      io.err(JSON.stringify({ error: { code: "OPERATION_FAILED" } }));
      process.exitCode = 1;
    }
  }
}
