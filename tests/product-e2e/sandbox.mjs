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
  lifecycle = {},
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
  const databaseName = `${acceptance ? "mkw_acceptance" : exporting ? "mkw_export" : selection ? "mkw_selection" : reviewR1 ? "mkw_task7_r1" : "mkw_persistence"}_${randomUUID().replaceAll("-", "_")}`;
  const runDir = resolve(evidenceRoot, databaseName);
  const targetFile = resolve(runDir, "target.json");
  let cluster, db, database, app, web;
  let accounts = [];
  let owner = {
    owner: alias,
    runDir,
    pid: process.pid,
    targetFile,
  };
  const released = new Set();
  const rotated = new Set();
  let unrevokedSessions = null;
  let verifiedSessions = false;
  let stopping, cleanupWork, setupWork, setupTimer;
  let stopRequested = false;
  let stopCause;
  let state = "acquiring";
  let markDrained;
  const drained = new Promise((done) => (markDrained = done));
  const controller = new AbortController();
  const signal = controller.signal;
  const pending = new Set();
  const childOwners = new Set();
  const poolClosers = new WeakMap();
  const stoppedError = (code = "SANDBOX_STOPPED") =>
    Object.assign(
      new Error("Sandbox setup stopped; retained owner must finish cleanup"),
      { code },
    );
  function fence() {
    if (stopRequested || lifecycle.signal?.aborted) throw stoppedError();
    if (
      lifecycle.setupDeadlineMs !== undefined &&
      performance.now() >= lifecycle.setupDeadlineMs
    )
      throw stoppedError("SANDBOX_SETUP_DEADLINE");
  }
  async function step(name, operation, accept) {
    fence();
    pending.add(name); // Track before invoking an operation, including its first await.
    try {
      const value = await operation();
      accept?.(value); // A late handle belongs to this owner even after stop.
      fence();
      return value;
    } finally {
      pending.delete(name);
    }
  }
  const open = (path, name) =>
    step(
      name,
      () =>
        openSandboxTarget(path, alias, {
          signal,
          deadlineMs: lifecycle.setupDeadlineMs,
          onPool(pool, end) {
            poolClosers.set(pool, end);
            if (name === "maintenance") cluster = { pool };
            else db = { pool };
          },
        }),
      (value) => {
        if (name === "maintenance") cluster = value;
        else db = value;
      },
    );
  const endPool = (pool) => (poolClosers.get(pool) ?? (() => pool.end()))();
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
    // With a bounded caller, HTTP resources can close even while DB invalidation
    // is still pending. DB/pool release must wait for provision/reset to drain.
    const earlyCloses =
      lifecycle.drainMs === undefined &&
      lifecycle.cleanupDeadlineMs === undefined
        ? undefined
        : Promise.all(
            [
              ["web", web, () => web.close()],
              ["app", app, () => app.close()],
            ].map(async ([name, resource, close]) => {
              if (resource && !released.has(name))
                await attempt(name, async () => {
                  await close();
                  released.add(name);
                });
            }),
          );
    const invalidationClosed = released.has("database") || released.has("pool");
    const rotate = async (account) => {
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
    };
    if (earlyCloses) await Promise.all(accounts.map(rotate));
    else for (const account of accounts) await rotate(account);
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
    const invalidationMetadata = attempt("invalidation-metadata", () =>
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
      ["pool", db?.pool, () => endPool(db.pool)],
      ["clusterPool", cluster?.pool, () => endPool(cluster.pool)],
    ];
    await Promise.all(
      resources.map(async ([name, resource, close]) => {
        if (
          resource &&
          !released.has(name) &&
          !(earlyCloses && ["web", "app"].includes(name))
        )
          await attempt(name, async () => {
            await close();
            released.add(name);
          });
      }),
    );
    await earlyCloses;
    await invalidationMetadata;
    const allReleased = resources.every(
      ([name, resource]) => !resource || released.has(name),
    );
    state = allReleased ? "released" : "release-failed";
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
  // Synchronous gate closure; teardown waits the whole setup continuation, not
  // merely a snapshot of handles. Deadline observers never discard the work.
  function stop(originalError) {
    if (!stopRequested) stopCause = originalError;
    stopRequested = true;
    controller.abort();
    if (setupTimer) clearTimeout(setupTimer);
    lifecycle.signal?.removeEventListener("abort", externalAbort);
    if (!cleanupWork) {
      state = "pending";
      cleanupWork = Promise.resolve().then(async () => {
        let setupError;
        await setupWork?.catch((error) => {
          setupError = error;
        });
        await Promise.all([...childOwners].map((child) => child.drained));
        state = "stopping";
        const original =
          stopCause &&
          setupError &&
          setupError.code !== "SANDBOX_STOPPED" &&
          setupError !== stopCause
            ? new AggregateError(
                [stopCause, setupError],
                "Sandbox stopped with a setup failure",
                { cause: setupError },
              )
            : (stopCause ?? setupError);
        return teardown(original);
      });
      cleanupWork.then(
        () => {
          markDrained({ state });
        },
        (error) => {
          markDrained({ state, error });
        },
      );
      // Do not retry pending work. Once it settles, failed releases may be retried
      // by an explicit stop; successful rotations/releases remain in their sets.
      cleanupWork.then(
        () => {
          cleanupWork = stopping = undefined;
        },
        () => {
          cleanupWork = stopping = undefined;
        },
      );
      const budget = Math.min(
        lifecycle.drainMs ?? Infinity,
        lifecycle.cleanupDeadlineMs === undefined
          ? Infinity
          : Math.max(0, lifecycle.cleanupDeadlineMs - performance.now()),
      );
      stopping = Number.isFinite(budget)
        ? new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => {
                state = "pending";
                const error = stoppedError("SANDBOX_DRAIN_PENDING");
                error.owner = lifecycleApi;
                reject(error);
              },
              Math.max(0, budget),
            );
            cleanupWork.then(
              (value) => {
                clearTimeout(timer);
                resolve(value);
              },
              (error) => {
                clearTimeout(timer);
                reject(error);
              },
            );
          })
        : cleanupWork;
    }
    return stopping;
  }
  const lifecycleApi = Object.freeze({
    stop,
    runDir,
    targetFile,
    drained,
    snapshot: () => ({
      state,
      pending: [...pending],
      invalidated:
        accounts.length > 0 &&
        rotated.size === accounts.length &&
        verifiedSessions,
    }),
  });
  function externalAbort() {
    stop(stoppedError("SANDBOX_ABORTED")).catch(() => {});
  }
  lifecycle.onOwner?.(lifecycleApi); // Before first await/acquisition, secrets stay private.
  if (!stopRequested)
    lifecycle.signal?.addEventListener("abort", externalAbort, { once: true });
  if (lifecycle.signal?.aborted) externalAbort();
  if (!stopRequested && lifecycle.setupDeadlineMs !== undefined)
    setupTimer = setTimeout(
      () => {
        stop(stoppedError("SANDBOX_SETUP_DEADLINE")).catch(() => {});
      },
      Math.max(0, lifecycle.setupDeadlineMs - performance.now()),
    );
  setupWork = (async () => {
    fence();
    // A pre-aborted invocation neither creates metadata nor opens a pool.
    await step("run-directory", () => mkdir(runDir, { recursive: true }));
    await open(process.env.MKW_PRODUCT_CLUSTER_OWNER, "maintenance");
    await step("target-metadata", () =>
      writeFile(
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
      ),
    );
    await step("CREATE", () =>
      cluster.pool.query(`CREATE DATABASE "${databaseName}"`),
    );
    await step("maintenance-close", () => endPool(cluster.pool));
    released.add("clusterPool");
    await open(targetFile, "sandbox-pool");
    const migration = await step("migration", () =>
      command(
        process.platform === "win32" ? "pnpm.exe" : "pnpm",
        ["--filter", "@mkw/api", "db:deploy"],
        {
          cwd: root,
          env: { ...process.env, DATABASE_URL: db.connectionString },
          signal,
          timeout: lifecycle.commandTimeoutMs,
          maxOutputBytes: lifecycle.maxOutputBytes,
          drainMs: lifecycle.drainMs,
          onOwner: (owner) => childOwners.add(owner),
        },
      ),
    );
    await step("migration-log", () =>
      writeFile(resolve(runDir, "migration.log"), migration.output),
    );
    if (migration.code !== 0) {
      throw new Error("Migration failed; inspect retained run log");
    }
    const webPort = await step("web-port", freePort),
      apiPort = await step("api-port", freePort);
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
    await step("owner-metadata", () =>
      writeFile(
        resolve(runDir, "http-owner.json"),
        JSON.stringify(owner, null, 2),
      ),
    );
    fence();
    database = new Database(db.connectionString);
    accounts = ["fixture-one", "fixture-two"].map((username) => ({
      username,
      password: randomBytes(24).toString("base64url"),
    }));
    await step("provision", () => provisionAccounts(database, accounts));
    await step(
      "app",
      () =>
        createApp(webOrigin, {
          databaseUrl: db.connectionString,
          throttleSecret: randomBytes(32).toString("hex"),
        }),
      (value) => {
        app = value;
      },
    );
    await step("listen", () => app.listen(apiPort, "127.0.0.1"));
    // Faults change delivery only. Successful persistence always uses production Nest/PG.
    const { preview } = await step(
      "preview-import",
      () => import(pathToFileURL(requireWeb.resolve("vite")).href),
    );
    await step(
      "preview",
      () =>
        preview({
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
        }),
      (value) => {
        web = value;
      },
    );
    await step("owner-metadata", () =>
      writeFile(
        resolve(runDir, "http-owner.json"),
        JSON.stringify({ ...owner, state: "running" }, null, 2),
      ),
    );
    state = "running";
    if (setupTimer) clearTimeout(setupTimer);
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
      owner: lifecycleApi,
    };
  })();
  // Wake the caller on cancellation while the original setup promise stays owned.
  const observed = new Promise((resolve, reject) => {
    const abort = () => reject(stoppedError());
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    setupWork
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
  try {
    return await observed;
  } catch (error) {
    await stop(error);
    throw error;
  }
}
