import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

export class AccountPreflightError extends Error {
  constructor(readonly code: "DEPENDENCY_UNAVAILABLE" | "SCHEMA_NOT_READY") {
    super(code);
  }
}

export async function assertAccountDatabaseReady(
  databaseUrl: string,
  cwd: string,
): Promise<void> {
  const prisma = resolve(cwd, "node_modules/prisma/build/index.js");
  try {
    await access(prisma);
  } catch {
    throw new AccountPreflightError("DEPENDENCY_UNAVAILABLE");
  }
  await new Promise<void>((accept, reject) => {
    const child = spawn(process.execPath, [prisma, "migrate", "status"], {
      cwd,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () =>
      reject(new AccountPreflightError("DEPENDENCY_UNAVAILABLE")),
    );
    child.once("close", (code) => {
      if (code === 0) accept();
      else reject(new AccountPreflightError("SCHEMA_NOT_READY"));
    });
  });
}
