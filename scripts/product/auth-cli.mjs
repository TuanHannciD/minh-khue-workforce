import { parseArgs } from "node:util";
import { emitKeypressEvents, createInterface } from "node:readline";
import { openSandboxTarget } from "./sandbox-target.mjs";
import { Database } from "../../apps/api/dist/infrastructure/db/database.js";
import {
  provisionAccounts,
  resetPassword,
} from "../../apps/api/dist/modules/auth/auth-operations.js";

async function hiddenPassword(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Use a private TTY or explicit --secret-stdin pipe");
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let secret = "";
    const finish = () => {
      process.stdin.off("keypress", keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const keypress = (text, key) => {
      if (key.name === "return") {
        finish();
        resolve(secret);
      } else if (key.ctrl && key.name === "c") {
        finish();
        reject(new Error("Cancelled"));
      } else if (key.name === "backspace")
        secret = Array.from(secret).slice(0, -1).join("");
      else if (text && !key.ctrl && !key.meta) secret += text;
    };
    process.stdin.on("keypress", keypress);
  });
}

async function stdinSecret() {
  if (process.stdin.isTTY)
    throw new Error("--secret-stdin requires a private pipe");
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 16384) throw new Error("Secret input is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  const args = process.argv.slice(2);
  // pnpm preserves the documented option separator after the operation.
  if (args[1] === "--") args.splice(1, 1);
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      target: { type: "string" },
      alias: { type: "string" },
      username: { type: "string" },
      "secret-stdin": { type: "boolean", default: false },
    },
  });
  const operation = positionals[0];
  if (
    positionals.length !== 1 ||
    !["provision", "reset-password"].includes(operation) ||
    !values.target ||
    !values.alias
  )
    throw new Error(
      "Use provision|reset-password --target <record> --alias <approved sandbox alias>",
    );
  if (operation === "reset-password" && !values.username)
    throw new Error("Reset requires --username");
  const checked = await openSandboxTarget(values.target, values.alias);
  await checked.pool.end();
  if (checked.target.database === "postgres")
    throw new Error("Refusing a cluster maintenance database");
  console.log(
    `Verified target ${checked.target.alias}/${checked.target.database}; operation ${operation}${values.username ? `; account ${values.username}` : ""}`,
  );
  let payload;
  if (values["secret-stdin"]) payload = await stdinSecret();
  else if (operation === "reset-password")
    payload = { password: await hiddenPassword("Mật khẩu mới: ") };
  else {
    const reader = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const question = (text) =>
      new Promise((resolve) => reader.question(text, resolve));
    const usernames = [
      await question("Tài khoản thứ nhất: "),
      await question("Tài khoản thứ hai: "),
    ];
    reader.close();
    payload = { accounts: [] };
    for (const username of usernames)
      payload.accounts.push({
        username,
        password: await hiddenPassword(`Mật khẩu cho ${username}: `),
      });
  }
  const db = new Database(checked.connectionString);
  try {
    if (operation === "provision") {
      if (
        !Array.isArray(payload.accounts) ||
        payload.accounts.some(
          (a) =>
            typeof a.username !== "string" || typeof a.password !== "string",
        )
      )
        throw new Error("Invalid provision input");
      await provisionAccounts(db, payload.accounts);
    } else {
      if (typeof payload.password !== "string")
        throw new Error("Invalid reset input");
      await resetPassword(db, values.username, payload.password);
    }
    console.log(
      `Committed ${operation}; ${new Date().toISOString()}; actor authorized-sandbox-operator`,
    );
  } finally {
    await db.onModuleDestroy();
  }
}

try {
  await main();
} catch {
  // Neither exception payloads nor SQL/driver errors may disclose credentials.
  console.error(
    "Operation refused or failed; verify the sandbox target, account and private input. No success was reported.",
  );
  process.exitCode = 1;
}
