import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "../../../scripts/product/sandbox-target.mjs";
import { command } from "./auth-sandbox.mjs";

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const evidenceRoot = resolve(
  root,
  ".agent-runs/MKW-PRODUCT-001/task4-employees",
);
const normalized = (p) => resolve(p).replaceAll("\\", "/").toLowerCase();
export async function openEmployeeTarget(recordPath) {
  const target = JSON.parse(await readFile(recordPath, "utf8"));
  if (
    target.owner !== "MKW-PRODUCT-001/Task4" ||
    target.scope !== "fake-sandbox" ||
    target.alias !== "task4-employees" ||
    target.host !== "127.0.0.1" ||
    target.user !== "mkw_task4" ||
    !Number.isInteger(target.port) ||
    !/^(postgres|mkw_employees_[a-f0-9_]+)$/.test(target.database) ||
    normalized(target.dataDirectory) !==
      normalized(resolve(evidenceRoot, "pg-data"))
  )
    throw new Error("Employee sandbox target outside allowlist");
  const connectionString = `postgresql://${target.user}@127.0.0.1:${target.port}/${target.database}`;
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    const {
      rows: [actual],
    } = await pool.query(
      `SELECT current_database() AS database, current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('data_directory') AS directory, current_setting('server_version') AS version`,
    );
    if (
      actual.database !== target.database ||
      actual.username !== target.user ||
      actual.host !== target.host ||
      actual.port !== target.port ||
      normalized(actual.directory) !== normalized(target.dataDirectory) ||
      actual.version !== "17.11"
    )
      throw new Error("Employee sandbox identity mismatch");
    return { target, pool, connectionString };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
export async function employeeSandbox() {
  if (process.env.MKW_ATTENDANCE_CLUSTER_OWNER) {
    const { attendanceSandbox } = await import("./attendance-sandbox.mjs");
    return attendanceSandbox();
  }
  const cluster = await openEmployeeTarget(
    process.env.MKW_EMPLOYEE_CLUSTER_OWNER,
  );
  const database = `mkw_employees_${randomUUID().replaceAll("-", "_")}`;
  const evidence = resolve(evidenceRoot, database);
  const targetFile = resolve(evidence, "target.json");
  try {
    await mkdir(evidence);
    await writeFile(
      targetFile,
      JSON.stringify(
        { ...cluster.target, database, state: "retained", runId: database },
        null,
        2,
      ),
    );
    await cluster.pool.query(`CREATE DATABASE "${database}"`);
  } finally {
    await cluster.pool.end();
  }
  return { ...(await openEmployeeTarget(targetFile)), evidence, targetFile };
}
export async function migrate(db, args = ["migrate", "deploy"]) {
  const result = await command(
    process.platform === "win32" ? "pnpm.exe" : "pnpm",
    ["--filter", "@mkw/api", "exec", "prisma", ...args],
    { cwd: root, env: { ...process.env, DATABASE_URL: db.connectionString } },
  );
  await writeFile(
    resolve(db.evidence, `migration-${args[1]}.log`),
    result.output,
  );
  if (result.code !== 0) throw new Error("Migration failed; see retained log");
}
