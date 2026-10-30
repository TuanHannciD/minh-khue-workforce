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
  selection = false,
  exporting = false,
  acceptance = false,
} = {}) {
  const alias = acceptance
    ? "task10-acceptance"
    : exporting
      ? "task9-export"
      : selection
        ? "task8-selection"
        : reviewR1
          ? "task7-fix-r1"
          : "task7-persistence";
  const evidenceRoot = resolve(
    process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
      resolve(root, `.agent-runs/MKW-PRODUCT-001/${alias}`),
  );
  const cluster = await openSandboxTarget(
    process.env.MKW_PRODUCT_CLUSTER_OWNER,
    alias,
  );
  const databaseName = `${acceptance ? "mkw_acceptance" : exporting ? "mkw_export" : selection ? "mkw_selection" : reviewR1 ? "mkw_task7_r1" : "mkw_persistence"}_${randomUUID().replaceAll("-", "_")}`;
  const runDir = resolve(evidenceRoot, databaseName);
  const targetFile = resolve(runDir, "target.json");
  let db, database, app, web;
  let accounts = [];
  let owner = {
    owner: cluster.target.owner,
    runDir,
    pid: process.pid,
    targetFile,
  };
  const released = new Set();
  const rotated = new Set();
  let unrevokedSessions = null;
  let verifiedSessions = false;
  let stopping;
  // One owner for normal stop and partial acquisition failures. A failed step
  // never prevents another resource from being attempted. Retry only incomplete
  // steps; successful releases/rotations must not run twice.
  async function teardown(originalError) {
    const failures = [];
    const attempt = async (name, operation) => {
      try {
        await operation();
      } catch (error) {
        failures.push({ name, error });
      }
    };
    const invalidationClosed = released.has("database") || released.has("pool");
    for (const account of accounts) {
      if (!rotated.has(account.username))
        await attempt(`rotate-${account.username}`, async () => {
          if (invalidationClosed)
            throw new Error(
              "Fixture invalidation incomplete; database already released",
            );
          await resetPassword(
            database,
            account.username,
            randomBytes(32).toString("base64url"),
          );
          rotated.add(account.username);
          verifiedSessions = false;
        });
    }
    if (accounts.length && !verifiedSessions)
      await attempt("verify-sessions", async () => {
        if (invalidationClosed)
          throw new Error(
            "Fixture session verification incomplete; database already released",
          );
        const { rows } = await db.pool.query(
          'SELECT count(*)::int AS count FROM "Session" WHERE "revokedAt" IS NULL',
        );
        unrevokedSessions = rows[0].count;
        if (unrevokedSessions !== 0)
          throw new Error("Fixture sessions remain unrevoked");
        verifiedSessions = true;
      });
    await attempt("invalidation-metadata", () =>
      writeFile(
        resolve(runDir, "fixture-invalidated.json"),
        JSON.stringify(
          {
            state: !accounts.length
              ? "not-provisioned"
              : rotated.size === accounts.length && verifiedSessions
                ? "invalidated"
                : "incomplete",
            passwordsRotated: rotated.size,
            unrevokedSessions,
            failures: failures.map((f) => f.name),
          },
          null,
          2,
        ),
      ),
    );
    const resources = [
      ["web", web, () => web.close()],
      ["app", app, () => app.close()],
      ["database", database, () => database.onModuleDestroy()],
      ["pool", db?.pool, () => db.pool.end()],
      ["clusterPool", cluster.pool, () => cluster.pool.end()],
    ];
    await Promise.all(
      resources.map(async ([name, resource, close]) => {
        if (resource && !released.has(name))
          await attempt(name, async () => {
            await close();
            released.add(name);
          });
      }),
    );
    const allReleased = resources.every(
      ([name, resource]) => !resource || released.has(name),
    );
    await attempt("release-metadata", () =>
      writeFile(
        resolve(runDir, "http-released.json"),
        JSON.stringify(
          {
            ...owner,
            state: allReleased ? "released" : "release-failed",
            setupFailed: originalError !== undefined,
            resources: Object.fromEntries(
              resources.map(([name, resource]) => [
                name,
                !resource
                  ? "not-acquired"
                  : released.has(name)
                    ? "released"
                    : "release-failed",
              ]),
            ),
            failures: failures.map((f) => f.name),
          },
          null,
          2,
        ),
      ),
    );
    if (failures.length)
      throw new AggregateError(
        [
          ...(originalError === undefined ? [] : [originalError]),
          ...failures.map((f) => f.error),
        ],
        `Sandbox cleanup failed: ${failures.map((f) => f.name).join(", ")}`,
        originalError === undefined ? undefined : { cause: originalError },
      );
    if (originalError !== undefined) throw originalError;
  }
  function stop(originalError) {
    if (!stopping)
      stopping = teardown(originalError).finally(() => {
        stopping = undefined;
      });
    return stopping;
  }
  try {
    await mkdir(runDir, { recursive: true });
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
    await cluster.pool.query(`CREATE DATABASE "${databaseName}"`);
    await cluster.pool.end();
    released.add("clusterPool");
    db = await openSandboxTarget(targetFile, alias);
    const migration = await command(
      process.platform === "win32" ? "pnpm.exe" : "pnpm",
      ["--filter", "@mkw/api", "db:deploy"],
      { cwd: root, env: { ...process.env, DATABASE_URL: db.connectionString } },
    );
    await writeFile(resolve(runDir, "migration.log"), migration.output);
    if (migration.code !== 0) {
      throw new Error("Migration failed; inspect retained run log");
    }
    const webPort = await freePort(),
      apiPort = await freePort();
    const webOrigin = `http://127.0.0.1:${webPort}`;
    const apiOrigin = `http://127.0.0.1:${apiPort}`;
    owner = {
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
    database = new Database(db.connectionString);
    accounts = ["fixture-one", "fixture-two"].map((username) => ({
      username,
      password: randomBytes(24).toString("base64url"),
    }));
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
      stop,
    };
  } catch (error) {
    await stop(error);
  }
}
