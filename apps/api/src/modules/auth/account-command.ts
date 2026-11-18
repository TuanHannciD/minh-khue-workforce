import type { Database } from "../../infrastructure/db/database.js";
import {
  AccountOperationError,
  addAccount,
  listAccounts,
  resetPassword,
  validateAccountUsername,
} from "./auth-operations.js";
import { validatePassword } from "./password.js";

export { AccountOperationError } from "./auth-operations.js";
export type { AccountErrorCode } from "./auth-operations.js";

export type AccountCommand =
  | { operation: "list" }
  | { operation: "add" | "reset-password"; username: string; password: string };

export type AccountResult =
  | { operation: "list"; usernames: string[] }
  | { operation: "add" | "reset-password"; username: string };

export function validateAccountCommand(value: unknown): AccountCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new AccountOperationError("INVALID_INPUT");
  const input = value as Record<string, unknown>;
  const operation = input.operation;
  if (!["list", "add", "reset-password"].includes(operation as string))
    throw new AccountOperationError("INVALID_INPUT");
  const fields =
    operation === "list"
      ? ["operation"]
      : ["operation", "username", "password"];
  if (
    Reflect.ownKeys(input).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(input, field))
  )
    throw new AccountOperationError("INVALID_INPUT");
  if (operation === "list") return { operation };
  validateAccountUsername(input.username);
  if (typeof input.password !== "string")
    throw new AccountOperationError("INVALID_INPUT");
  try {
    validatePassword(input.password);
  } catch {
    throw new AccountOperationError("INVALID_INPUT");
  }
  return {
    operation: operation as "add" | "reset-password",
    username: input.username,
    password: input.password,
  };
}

export async function executeAccountCommand(
  db: Database,
  input: AccountCommand,
): Promise<AccountResult> {
  const command = validateAccountCommand(input);
  if (command.operation === "list")
    return { operation: "list", usernames: await listAccounts(db) };
  if (command.operation === "add") await addAccount(db, command);
  else await resetPassword(db, command.username, command.password);
  return { operation: command.operation, username: command.username };
}
