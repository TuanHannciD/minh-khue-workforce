import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import {
  openAttendanceTarget,
  migrate,
  origin,
  root,
} from "./attendance-sandbox.mjs";
import { createApp } from "../dist/bootstrap.js";
import { Database } from "../dist/infrastructure/db/database.js";
import {
  provisionAccounts,
  resetPassword,
} from "../dist/modules/auth/auth-operations.js";

// Refusal, rather than a successful close() alone, confirms each owned listener ended.
async function assertPortClosed(url) {
  const { hostname, port } = new URL(url);
  await new Promise((done, reject) => {
    const socket = createConnection({ host: hostname, port: Number(port) });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("Owned HTTP port remains open"));
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") done();
      else reject(error);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error("Owned HTTP port closure unconfirmed"));
    });
  });
}

export async function startAttendanceReadSandbox({ mode }) {
  if (!["sql", "http"].includes(mode))
    throw new Error("Expected sql or http mode");
  let cluster,
    run,
    database = null,
    evidence,
    targetFile,
    inFlight;
  let provisionAttempted = false,
    provisionSucceeded = false,
    invalidation,
    invalidationWritten = false;
  let releaseWritten = false,
    originalError,
    hasOriginal = false;
  const invalidationErrors = [],
    apps = [],
    cookies = [],
    appOwners = [];
  const released = new Set();
  // Retain candidates before provision can partially succeed or throw.
  const accounts =
    mode === "http"
      ? ["fixture-one", "fixture-two"].map((username) => ({
          username,
          password: randomBytes(24).toString("base64url"),
        }))
      : [];
  const request = async (
    path,
    {
      method = "GET",
      body,
      actor = 0,
      app = actor === 1 ? 1 : 0,
      headers = {},
      signal,
    } = {},
  ) => {
    if (mode !== "http" || !apps[app] || released.has(`app-${app}`))
      throw new Error("HTTP resource not acquired or already released");
    return fetch(`${await apps[app].getUrl()}/api/v1${path}`, {
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
  };
  async function teardown() {
    const errors = [...invalidationErrors];
    const attempt = async (operation) => {
      try {
        await operation();
        return true;
      } catch (error) {
        errors.push(error);
        return false;
      }
    };
    if (!invalidation) {
      invalidation = {
        state: "not-provisioned",
        passwordsRotated: 0,
        provisionedAccounts: 0,
        unrevokedSessions: null,
      };
      if (provisionAttempted) {
        invalidation.state = "incomplete";
        invalidation.provisionedAccounts = null;
        let found;
        await attempt(async () => {
          const result = await run.pool.query(
            'SELECT "username" FROM "User" WHERE "username" = ANY($1::text[])',
            [accounts.map((a) => a.username)],
          );
          const rows = result.rows;
          if (
            rows.some(
              (row) => !accounts.some((a) => a.username === row.username),
            ) ||
            new Set(rows.map((r) => r.username)).size !== rows.length
          )
            throw new Error("Fixture account identification incomplete");
          found = rows;
          invalidation.provisionedAccounts = found.length;
          if (provisionSucceeded && found.length !== accounts.length)
            throw new Error(
              "Provisioned fixture account identification incomplete",
            );
        });
        if (found) {
          for (const { username } of found)
            await attempt(async () => {
              await resetPassword(
                database,
                username,
                randomBytes(32).toString("base64url"),
              );
              invalidation.passwordsRotated++;
            });
        }
        await attempt(async () => {
          const {
            rows: [row],
          } = await run.pool.query(
            'SELECT count(*)::int AS count FROM "Session" WHERE "revokedAt" IS NULL',
          );
          invalidation.unrevokedSessions = Number(row.count);
          if (invalidation.unrevokedSessions !== 0)
            throw new Error("Fixture sessions remain unrevoked");
        });
        if (
          found &&
          errors.length === 0 &&
          invalidation.passwordsRotated === found.length &&
          invalidation.unrevokedSessions === 0
        )
          invalidation.state = "invalidated";
        invalidationErrors.push(...errors);
      }
      cookies.length = 0;
      for (const account of accounts) account.password = "";
    }
    if (evidence && !invalidationWritten)
      invalidationWritten = await attempt(() =>
        writeFile(
          resolve(evidence, "fixture-invalidated.json"),
          JSON.stringify(invalidation, null, 2),
        ),
      );
    const release = async (key, operation) => {
      if (!released.has(key) && (await attempt(operation))) {
        released.add(key);
        releaseWritten = false;
      }
    };
    for (const [i, owner] of appOwners.entries())
      await release(`app-${i}`, async () => {
        await owner.app.close();
        if (owner.app.getHttpServer().listening)
          throw new Error("Owned HTTP listener still listening");
        if (owner.url) await assertPortClosed(owner.url);
      });
    for (const [i, owner] of appOwners.entries())
      if (owner.database)
        await release(`app-db-${i}`, () => owner.database.onModuleDestroy());
    if (database) await release("database", () => database.onModuleDestroy());
    if (run) await release("run-pool", () => run.pool.end());
    if (cluster) await release("cluster-pool", () => cluster.pool.end());
    if (evidence && !releaseWritten)
      releaseWritten = await attempt(async () => {
        const expected = [
          ...appOwners.map((_, i) => `app-${i}`),
          ...appOwners.flatMap((a, i) => (a.database ? [`app-db-${i}`] : [])),
          ...(database ? ["database"] : []),
          ...(run ? ["run-pool"] : []),
          ...(cluster ? ["cluster-pool"] : []),
        ];
        await writeFile(
          resolve(evidence, "http-released.json"),
          JSON.stringify(
            {
              mode,
              state: expected.every((key) => released.has(key))
                ? "released"
                : "release-failed",
              resources: Object.fromEntries(
                expected.map((key) => [
                  key,
                  released.has(key) ? "released" : "incomplete",
                ]),
              ),
            },
            null,
            2,
          ),
        );
      });
    if (errors.length)
      throw new AggregateError(
        [...(hasOriginal ? [originalError] : []), ...errors],
        "Attendance read sandbox cleanup failed",
        hasOriginal ? { cause: originalError } : undefined,
      );
    if (hasOriginal) throw originalError;
  }
  function stop(...args) {
    if (args.length && !hasOriginal) {
      hasOriginal = true;
      [originalError] = args;
    }
    if (!inFlight) {
      inFlight = teardown();
      inFlight.then(
        () => {
          inFlight = undefined;
        },
        () => {
          inFlight = undefined;
        },
      );
    }
    return inFlight;
  }
  try {
    const record = JSON.parse(
      await readFile(process.env.MKW_ATTENDANCE_CLUSTER_OWNER, "utf8"),
    );
    if (record.alias !== "task10-acceptance")
      throw new Error("Attendance read requires task10-acceptance");
    cluster = await openAttendanceTarget(
      process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
    );
    if (cluster.target.alias !== "task10-acceptance")
      throw new Error("Attendance read requires task10-acceptance");
    const name = `mkw_acceptance_${randomUUID().replaceAll("-", "_")}`;
    evidence = resolve(
      root,
      ".agent-runs/MKW-PRODUCT-001/task10-acceptance",
      name,
    );
    targetFile = resolve(evidence, "target.json");
    await mkdir(evidence);
    await writeFile(
      targetFile,
      JSON.stringify(
        { ...cluster.target, database: name, state: "retained", runId: name },
        null,
        2,
      ),
    );
    await cluster.pool.query(`CREATE DATABASE "${name}"`);
    run = await openAttendanceTarget(targetFile);
    await migrate({ ...run, evidence });
    if (mode === "http") {
      await writeFile(
        resolve(evidence, "http-owner.json"),
        JSON.stringify(
          {
            owner: run.target.owner,
            pid: process.pid,
            host: "127.0.0.1",
            portPolicy: "ephemeral",
            state: "acquiring",
          },
          null,
          2,
        ),
      );
      database = new Database(run.connectionString);
      provisionAttempted = true;
      await provisionAccounts(database, accounts);
      provisionSucceeded = true;
      for (let i = 0; i < 2; i++) {
        const app = await createApp(origin, {
          databaseUrl: run.connectionString,
          throttleSecret: randomBytes(32).toString("hex"),
        });
        apps.push(app);
        const owner = { app, database: null, url: null };
        appOwners.push(owner);
        owner.database = app.get(Database);
        await app.listen(0, "127.0.0.1");
        owner.url = await app.getUrl();
        const response = await request("/auth/login", {
          method: "POST",
          body: accounts[i],
          app: i,
        });
        const cookie = response.headers.get("set-cookie");
        if (response.status !== 200 || !cookie)
          throw new Error("Fixture login failed");
        cookies.push(cookie.split(";")[0]);
      }
      await writeFile(
        resolve(evidence, "http-owner.json"),
        JSON.stringify(
          {
            owner: run.target.owner,
            pid: process.pid,
            origins: appOwners.map((a) => a.url),
            state: "running",
          },
          null,
          2,
        ),
      );
    }
    return {
      mode,
      target: run.target,
      targetFile,
      evidence,
      pool: run.pool,
      database,
      apps,
      cookies,
      request,
      stop,
    };
  } catch (error) {
    await stop(error);
  }
}
