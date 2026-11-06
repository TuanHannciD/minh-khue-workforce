import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mock, test } from "node:test";
import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";

if (!process.execArgv.includes("--experimental-test-module-mocks")) {
  test("offline lifecycle boundaries in isolated Node module-mock process", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      process.execPath,
      ["--experimental-test-module-mocks", "--test", import.meta.filename],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
} else {
  const requireApi = createRequire(
    new URL("../../apps/api/package.json", import.meta.url),
  );
  let made = 0,
    ended = 0,
    config,
    query,
    actual,
    closeError;
  mock.module("node:module", {
    namedExports: {
      createRequire() {
        return (name) => {
          if (name !== "pg") return requireApi(name);
          return {
            Pool: class {
              constructor(options) {
                made++;
                config = options;
              }
              async query() {
                return query ? query() : { rows: [actual] };
              }
              async end() {
                ended++;
                if (closeError) throw closeError;
              }
            },
          };
        };
      },
    },
  });
  const { openSandboxTarget } =
    await import("../../scripts/product/sandbox-target.mjs");
  const run = await createEvidenceRun(
    resolve(
      process.env.MKW_PRODUCT_EVIDENCE_ROOT ?? ".agent-runs/MKW-PRODUCT-001",
      "target-lifecycle-",
    ),
  );
  const target = {
    owner: "MKW-PRODUCT-001/Task10",
    scope: "fake-sandbox",
    alias: "task10-acceptance",
    host: "127.0.0.1",
    port: 63771,
    user: "mkw_task10",
    database: "postgres",
    dataDirectory: resolve(
      ".agent-runs/MKW-PRODUCT-001/task10-acceptance/pg-data",
    ),
  };
  const file = resolve(run, "owner.json");
  await writeFile(file, JSON.stringify(target));
  function reset() {
    made = ended = 0;
    query = closeError = undefined;
    actual = {
      database: target.database,
      username: target.user,
      host: target.host,
      port: target.port,
      directory: target.dataDirectory,
      version: "17.11",
    };
  }
  test("preabort and allowlist mismatch acquire no pool", async () => {
    reset();
    const c = new AbortController();
    c.abort();
    await assert.rejects(
      openSandboxTarget(file, target.alias, { signal: c.signal }),
    );
    assert.equal(made, 0);
    await assert.rejects(openSandboxTarget(file, "foreign"));
    assert.equal(made, 0);
  });
  test("pool published before query; abort drains late identity and closes exactly once", async () => {
    reset();
    let release, published, close;
    query = () => {
      assert(published);
      return new Promise((done) => (release = () => done({ rows: [actual] })));
    };
    const c = new AbortController();
    const p = openSandboxTarget(file, target.alias, {
      signal: c.signal,
      deadlineMs: performance.now() + 100,
      onPool(pool, end) {
        published = pool;
        close = end;
      },
    }).catch((e) => e);
    for (let i = 0; i < 100 && !release; i++)
      await new Promise((done) => setImmediate(done));
    assert.equal(typeof release, "function");
    assert.equal(config.connectionTimeoutMillis, 3000);
    assert(config.statement_timeout > 0 && config.statement_timeout <= 100);
    c.abort();
    release();
    const error = await p;
    assert.equal(error.code, "SANDBOX_TARGET_ABORTED");
    await close();
    assert.equal(ended, 1);
  });
  test("server identity timeout preserves original and cleanup errors", async () => {
    reset();
    const original = Object.assign(
      new Error("fixture server statement timeout"),
      { code: "57014" },
    );
    closeError = new Error("fixture close failure");
    query = async () => {
      throw original;
    };
    const error = await openSandboxTarget(file, target.alias, {
      deadlineMs: performance.now() + 50,
    }).catch((e) => e);
    assert.equal(error.cause, original);
    assert(error.errors.includes(closeError));
    assert.equal(ended, 1);
  });
  test("abort retains the first close failure even if later close recovers", async () => {
    reset();
    let release;
    query = () =>
      new Promise((done) => (release = () => done({ rows: [actual] })));
    const c = new AbortController();
    const p = openSandboxTarget(file, target.alias, { signal: c.signal }).catch(
      (e) => e,
    );
    while (!release) await new Promise((done) => setImmediate(done));
    const first = new Error("first owned close failed");
    closeError = first;
    c.abort();
    await new Promise((done) => setImmediate(done));
    closeError = undefined;
    release();
    const error = await p;
    assert(error.errors?.includes(first));
    assert.equal(error.cause.code, "SANDBOX_TARGET_ABORTED");
  });
  for (const key of [
    "database",
    "username",
    "host",
    "port",
    "directory",
    "version",
  ])
    test(`actual identity ${key} mismatch still rejects and closes`, async () => {
      reset();
      actual[key] = key === "port" ? 63772 : "wrong";
      await assert.rejects(
        openSandboxTarget(file, target.alias),
        /identity mismatch/,
      );
      assert.equal(ended, 1);
    });
}
