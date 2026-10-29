import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";
import { command } from "../../apps/api/test/auth-sandbox.mjs";
import { createApp } from "../../apps/api/dist/bootstrap.js";
import { Database } from "../../apps/api/dist/infrastructure/db/database.js";
import {
  provisionAccounts,
  resetPassword,
} from "../../apps/api/dist/modules/auth/auth-operations.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requireWeb = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

export async function startSandbox({
  interactive = false,
  reviewR1 = false,
} = {}) {
  const alias = reviewR1 ? "task7-fix-r1" : "task7-persistence";
  const evidenceRoot = resolve(root, `.agent-runs/MKW-PRODUCT-001/${alias}`);
  const cluster = await openSandboxTarget(
    process.env.MKW_PRODUCT_CLUSTER_OWNER,
    alias,
  );
  const databaseName = `${reviewR1 ? "mkw_task7_r1" : "mkw_persistence"}_${randomUUID().replaceAll("-", "_")}`;
  const runDir = resolve(evidenceRoot, databaseName);
  await mkdir(runDir);
  const targetFile = resolve(runDir, "target.json");
  await writeFile(
    targetFile,
    JSON.stringify(
      {
        ...cluster.target,
        database: databaseName,
        state: "retained",
        runId: databaseName,
      },
      null,
      2,
    ),
  );
  try {
    await cluster.pool.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await cluster.pool.end();
  }
  const db = await openSandboxTarget(targetFile, alias);
  const migration = await command(
    process.platform === "win32" ? "pnpm.exe" : "pnpm",
    ["--filter", "@mkw/api", "db:deploy"],
    { cwd: root, env: { ...process.env, DATABASE_URL: db.connectionString } },
  );
  await writeFile(resolve(runDir, "migration.log"), migration.output);
  if (migration.code !== 0) {
    await db.pool.end();
    throw new Error("Migration failed; inspect retained run log");
  }
  const webPort = await freePort(),
    apiPort = await freePort();
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const owner = {
    owner: cluster.target.owner,
    runDir,
    pid: process.pid,
    webOrigin,
    apiOrigin,
    targetFile,
    state: "acquiring",
  };
  await writeFile(
    resolve(runDir, "http-owner.json"),
    JSON.stringify(owner, null, 2),
  );
  const database = new Database(db.connectionString);
  const accounts = ["fixture-one", "fixture-two"].map((username) => ({
    username,
    password: randomBytes(24).toString("base64url"),
  }));
  let app, web;
  try {
    await provisionAccounts(database, accounts);
    app = await createApp(webOrigin, {
      databaseUrl: db.connectionString,
      throttleSecret: randomBytes(32).toString("hex"),
    });
    await app.listen(apiPort, "127.0.0.1");
    // Faults change delivery only. Successful persistence always uses production Nest/PG.
    const { preview } = await import(
      pathToFileURL(requireWeb.resolve("vite")).href
    );
    web = await preview({
      root: resolve(root, "apps/web"),
      configFile: resolve(root, "apps/web/vite.config.ts"),
      plugins: interactive
        ? [
            {
              name: "task7-private-fixture",
              configurePreviewServer(server) {
                server.middlewares.use(
                  "/__fixture/accounts",
                  (_request, response) => {
                    response.setHeader("cache-control", "no-store");
                    response.setHeader("content-type", "application/json");
                    response.end(JSON.stringify(accounts));
                  },
                );
              },
            },
          ]
        : [],
      preview: {
        host: "127.0.0.1",
        port: webPort,
        strictPort: true,
        proxy: { "/api": { target: apiOrigin, changeOrigin: false } },
      },
    });
    await writeFile(
      resolve(runDir, "http-owner.json"),
      JSON.stringify({ ...owner, state: "running" }, null, 2),
    );
    return {
      ...db,
      database,
      app,
      web,
      accounts,
      webOrigin,
      apiOrigin,
      runDir,
      targetFile,
      alias,
      async stop() {
        if (interactive || reviewR1)
          for (const account of accounts)
            await resetPassword(
              database,
              account.username,
              randomBytes(32).toString("base64url"),
            );
        if (reviewR1) {
          const { rows } = await db.pool.query(
            'SELECT count(*)::int AS count FROM "Session" WHERE "revokedAt" IS NULL',
          );
          await writeFile(
            resolve(runDir, "fixture-invalidated.json"),
            JSON.stringify({
              passwordsRotated: 2,
              unrevokedSessions: rows[0].count,
            }),
          );
        }
        await web.close();
        await app.close();
        await database.onModuleDestroy();
        await db.pool.end();
        await writeFile(
          resolve(runDir, "http-released.json"),
          JSON.stringify({ ...owner, state: "released" }, null, 2),
        );
      },
    };
  } catch (error) {
    if (web) await web.close();
    if (app) await app.close();
    await database.onModuleDestroy();
    await db.pool.end();
    await writeFile(
      resolve(runDir, "http-released.json"),
      JSON.stringify({ ...owner, state: "released-after-failure" }, null, 2),
    );
    throw error;
  }
}
