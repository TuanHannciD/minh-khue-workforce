import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Pool,
  openSandboxTarget,
} from "../../../scripts/product/sandbox-target.mjs";
import { command } from "./auth-sandbox.mjs";
import { createApp } from "../dist/bootstrap.js";
import { Database } from "../dist/infrastructure/db/database.js";
import { provisionAccounts } from "../dist/modules/auth/auth-operations.js";

export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const evidenceRoot = resolve(
  root,
  ".agent-runs/MKW-PRODUCT-001/task5-attendance",
);
export const origin = "http://127.0.0.1:5173";
const normalized = (p) => resolve(p).replaceAll("\\", "/").toLowerCase();
export async function openAttendanceTarget(recordPath) {
  const target = JSON.parse(await readFile(recordPath, "utf8"));
  if (target.alias === "task7-persistence")
    return openSandboxTarget(recordPath, "task7-persistence");
  if (
    target.owner !== "MKW-PRODUCT-001/Task5" ||
    target.scope !== "fake-sandbox" ||
    target.alias !== "task5-attendance" ||
    target.host !== "127.0.0.1" ||
    target.user !== "mkw_task5" ||
    !Number.isInteger(target.port) ||
    !/^(postgres|mkw_attendance_[a-f0-9_]+)$/.test(target.database) ||
    normalized(target.dataDirectory) !==
      normalized(resolve(evidenceRoot, "pg-data"))
  )
    throw new Error("Attendance sandbox target outside allowlist");
  const connectionString = `postgresql://${target.user}@127.0.0.1:${target.port}/${target.database}`;
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    const {
      rows: [actual],
    } = await pool.query(
      "SELECT current_database() AS database, current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('data_directory') AS directory, current_setting('server_version') AS version",
    );
    if (
      actual.database !== target.database ||
      actual.username !== target.user ||
      actual.host !== target.host ||
      actual.port !== target.port ||
      normalized(actual.directory) !== normalized(target.dataDirectory) ||
      actual.version !== "17.11"
    )
      throw new Error("Attendance sandbox identity mismatch");
    return { target, pool, connectionString };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
export async function attendanceSandbox() {
  const cluster = await openAttendanceTarget(
    process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
  );
  const task7 = cluster.target.alias === "task7-persistence";
  const database = `${task7 ? "mkw_persistence" : "mkw_attendance"}_${randomUUID().replaceAll("-", "_")}`;
  const evidence = resolve(
    task7
      ? resolve(root, ".agent-runs/MKW-PRODUCT-001/task7-persistence")
      : evidenceRoot,
    database,
  );
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
  return { ...(await openAttendanceTarget(targetFile)), evidence, targetFile };
}
export async function migrate(db) {
  const result = await command(
    process.platform === "win32" ? "pnpm.exe" : "pnpm",
    ["--filter", "@mkw/api", "db:deploy"],
    { cwd: root, env: { ...process.env, DATABASE_URL: db.connectionString } },
  );
  await writeFile(resolve(db.evidence, "migration.log"), result.output);
  assertResult(result.code === 0, "Migration failed; inspect retained log");
}
const assertResult = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
export async function fixture(db) {
  const database = new Database(db.connectionString);
  const accounts = ["fixture-one", "fixture-two"].map((username) => ({
    username,
    password: randomBytes(24).toString("base64url"),
  }));
  await provisionAccounts(database, accounts);
  const apps = [],
    cookies = [];
  const request = async (
    path,
    {
      method = "GET",
      body,
      actor = 0,
      headers = {},
      app = actor === 1 ? 1 : 0,
      signal,
    } = {},
  ) =>
    fetch(`${await apps[app].getUrl()}/api/v1${path}`, {
      method,
      headers: {
        ...(method === "GET"
          ? {}
          : { origin, "content-type": "application/json" }),
        ...(cookies[actor] ? { cookie: cookies[actor] } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  try {
    await writeFile(
      resolve(db.evidence, "http-owner.json"),
      JSON.stringify({
        owner: db.target.owner,
        pid: process.pid,
        host: "127.0.0.1",
        portPolicy: "ephemeral",
        state: "acquiring",
      }),
    );
    for (let i = 0; i < 2; i++) {
      const app = await createApp(origin, {
        databaseUrl: db.connectionString,
        throttleSecret: randomBytes(32).toString("hex"),
      });
      apps.push(app);
      await app.listen(0, "127.0.0.1");
      const r = await request("/auth/login", {
        method: "POST",
        body: accounts[i],
        app: i,
      });
      assertResult(r.status === 200, "Fixture login failed");
      cookies.push(r.headers.get("set-cookie").split(";")[0]);
    }
    await writeFile(
      resolve(db.evidence, "http-owner.json"),
      JSON.stringify({
        owner: db.target.owner,
        pid: process.pid,
        origins: await Promise.all(apps.map((a) => a.getUrl())),
        state: "running",
      }),
    );
    return {
      apps,
      database,
      request,
      cookies,
      async close() {
        for (const app of apps) await app.close();
        await database.onModuleDestroy();
        await writeFile(
          resolve(db.evidence, "http-released.json"),
          JSON.stringify({ owner: db.target.owner, state: "released" }),
        );
      },
    };
  } catch (error) {
    for (const app of apps) await app.close();
    await database.onModuleDestroy();
    throw error;
  }
}
