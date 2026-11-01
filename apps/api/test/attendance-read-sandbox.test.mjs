/**
 * Resource boundaries only; the actual scoped owner performs setup and teardown.
 * File map: action/pool and mock.module blocks model independent resource faults;
 * setup/metadata own retained evidence; lifecycle tests below exercise normal,
 * partial-acquisition, invalidation, release retry and concurrent-stop behavior.
 * Kept together so all fault cases share one explicit acquisition identity model.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as files from "node:fs/promises";
import { resolve } from "node:path";
import { mock, test } from "node:test";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";

const calls = [],
  faults = new Set(),
  errors = new Map();
let opened, appNumber, databaseNumber, run, accounts, sessionCount, alias;
async function action(name) {
  calls.push(name);
  if (faults.has(name)) {
    const error = errors.get(name) ?? new Error(`injected ${name}`);
    errors.set(name, error);
    throw error;
  }
}
const pool = (name) => ({
  async query(sql, params) {
    if (sql.startsWith("CREATE DATABASE")) {
      assert.match(sql, /^CREATE DATABASE "mkw_acceptance_[a-f0-9_]+"$/);
      await action("create");
      return { rows: [] };
    }
    if (sql.includes('FROM "User"')) {
      assert.deepEqual(params, [["fixture-one", "fixture-two"]]);
      await action("find-accounts");
      return {
        rows: (faults.has("missing-account")
          ? accounts.slice(0, 1)
          : accounts
        ).map((username) => ({ username })),
      };
    }
    assert.match(sql, /FROM "Session" WHERE "revokedAt" IS NULL/);
    await action("verify-sessions");
    return { rows: [{ count: sessionCount }] };
  },
  async end() {
    await action(name);
  },
});
mock.module("./attendance-sandbox.mjs", {
  exports: {
    root: resolve("../.."),
    origin: "http://127.0.0.1:5173",
    async openAttendanceTarget(path) {
      opened++;
      await action(opened === 1 ? "open-cluster" : "open-run");
      if (opened === 2) {
        const target = JSON.parse(await files.readFile(path, "utf8"));
        assert.equal(target.state, "retained");
        assert.equal(target.alias, "task10-acceptance");
        assert.match(target.database, /^mkw_acceptance_[a-f0-9_]+$/);
      }
      return {
        target: {
          owner: "MKW-PRODUCT-001/Task10",
          alias,
          database: "postgres",
        },
        pool: pool(opened === 1 ? "cluster-end" : "run-end"),
        connectionString: "fixture-only",
      };
    },
    async migrate() {
      await action("migration");
    },
  },
});
mock.module("../dist/infrastructure/db/database.js", {
  exports: {
    Database: class {
      constructor(url) {
        assert.equal(url, "fixture-only");
        this.number = databaseNumber++;
        calls.push("owner-db");
      }
      async onModuleDestroy() {
        await action(`db-${this.number}-end`);
      }
    },
  },
});
mock.module("../dist/modules/auth/auth-operations.js", {
  exports: {
    async provisionAccounts(_db, candidates) {
      assert.deepEqual(
        candidates.map((a) => a.username),
        ["fixture-one", "fixture-two"],
      );
      assert(candidates.every((a) => a.password.length >= 32));
      accounts = faults.has("provision")
        ? ["fixture-one"]
        : candidates.map((a) => a.username);
      await action("provision");
    },
    async resetPassword(db, username, secret) {
      assert.equal(db.number, 0);
      assert(secret.length >= 32);
      await action(`rotate-${username}`);
    },
  },
});
mock.module("../dist/bootstrap.js", {
  exports: {
    async createApp(origin, options) {
      assert.equal(origin, "http://127.0.0.1:5173");
      assert.equal(options.databaseUrl, "fixture-only");
      const i = appNumber++;
      await action(`app-${i}-acquire`);
      const db = {
        async onModuleDestroy() {
          await action(`app-${i}-db-end`);
        },
      };
      const server = { listening: false };
      return {
        get() {
          calls.push(`app-${i}-capture-db`);
          return db;
        },
        getHttpServer() {
          return server;
        },
        async listen(port, host) {
          assert.equal(port, 0);
          assert.equal(host, "127.0.0.1");
          await action(`app-${i}-listen`);
          server.listening = true;
        },
        async getUrl() {
          return `http://127.0.0.1:${42000 + i}`;
        },
        async close() {
          await action(`app-${i}-close`);
          server.listening = false;
        },
      };
    },
  },
});
mock.module("node:net", {
  exports: {
    createConnection({ port, host }) {
      assert.equal(host, "127.0.0.1");
      const socket = new EventEmitter();
      socket.destroy = () => {};
      socket.setTimeout = () => socket;
      queueMicrotask(() => {
        calls.push(`port-${port}-check`);
        if (faults.has(`port-${port}-open`)) {
          socket.emit("connect");
          return;
        }
        socket.emit(
          "error",
          Object.assign(new Error("closed"), { code: "ECONNREFUSED" }),
        );
      });
      return socket;
    },
  },
});
mock.module("node:fs/promises", {
  exports: {
    ...files,
    async writeFile(path, ...args) {
      const kind = String(path).endsWith("fixture-invalidated.json")
        ? "invalidation-metadata"
        : String(path).endsWith("http-released.json")
          ? "release-metadata"
          : "metadata";
      await action(kind);
      return files.writeFile(path, ...args);
    },
  },
});
mock.method(globalThis, "fetch", async (url, options) => {
  const i = Number(new URL(url).port) - 42000;
  if (options.method !== "GET")
    assert.equal(options.headers.origin, "http://127.0.0.1:5173");
  await action(`login-${i}`);
  return new Response(null, {
    status: 200,
    headers: { "set-cookie": `session=fake-${i}; HttpOnly` },
  });
});
const { startAttendanceReadSandbox } =
  await import("./attendance-read-sandbox.mjs");
async function setup(fail = []) {
  calls.length = 0;
  faults.clear();
  errors.clear();
  opened = appNumber = databaseNumber = 0;
  accounts = [];
  sessionCount = 0;
  alias = "task10-acceptance";
  for (const name of fail) faults.add(name);
  const root = resolve(
    "../../.agent-runs/MKW-PRODUCT-001/server-pagination/cleanup-tests",
  );
  await files.mkdir(root, { recursive: true });
  run = await files.mkdtemp(resolve(root, "run-"));
  process.env.MKW_ATTENDANCE_CLUSTER_OWNER = resolve(run, "cluster-owner.json");
  await files.writeFile(
    process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
    JSON.stringify({ alias }),
  );
}
const metadata = async (s, file) =>
  JSON.parse(await files.readFile(resolve(s.evidence, file), "utf8"));
const releases = [
  "app-0-close",
  "app-1-close",
  "app-0-db-end",
  "app-1-db-end",
  "db-0-end",
  "run-end",
  "cluster-end",
];

test("sql_only_never_provisions_and_ends_owned_pools", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "sql" });
  assert.equal(s.database, null);
  assert.deepEqual(s.apps, []);
  assert.deepEqual(s.cookies, []);
  await assert.rejects(s.request("/attendance/month"), /HTTP/);
  await withCleanup(
    async () => assert(s.pool),
    () => s.stop(),
  );
  assert(!calls.includes("owner-db"));
  assert(!calls.includes("provision"));
  assert(!calls.includes("find-accounts"));
  assert(!calls.includes("verify-sessions"));
  assert(calls.includes("run-end"));
  assert(calls.includes("cluster-end"));
  assert.deepEqual(await metadata(s, "fixture-invalidated.json"), {
    state: "not-provisioned",
    passwordsRotated: 0,
    provisionedAccounts: 0,
    unrevokedSessions: null,
  });
});
test("http_rotates_both_and_verifies_before_disconnect", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  calls.length = 0;
  await s.stop();
  for (const step of [
    "find-accounts",
    "rotate-fixture-one",
    "rotate-fixture-two",
    "verify-sessions",
    ...releases,
  ])
    assert(calls.includes(step), step);
  assert(calls.indexOf("verify-sessions") < calls.indexOf("app-0-close"));
  assert(calls.indexOf("app-0-db-end") < calls.indexOf("run-end"));
  assert.equal(
    (await metadata(s, "fixture-invalidated.json")).state,
    "invalidated",
  );
  assert.equal(
    (await metadata(s, "fixture-invalidated.json")).passwordsRotated,
    2,
  );
  assert.equal((await metadata(s, "http-released.json")).state, "released");
  assert.deepEqual(s.cookies, []);
});
test("http_request_preserves_actor_app_origin_session_and_signal_defaults", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  await withCleanup(
    async () => {
      const controller = new AbortController();
      await s.request("/fixture", {
        actor: 1,
        method: "PATCH",
        body: { value: 1 },
        signal: controller.signal,
      });
      const [url, options] = globalThis.fetch.mock.calls.at(-1).arguments;
      assert.equal(url, "http://127.0.0.1:42001/api/v1/fixture");
      assert.equal(options.headers.cookie, "session=fake-1");
      assert.equal(options.headers.origin, "http://127.0.0.1:5173");
      assert.equal(options.headers["content-type"], "application/json");
      assert.equal(options.body, '{"value":1}');
      assert.equal(options.signal, controller.signal);
      await s.request("/fixture", {
        actor: 1,
        app: 0,
        headers: { "x-fixture": "yes" },
      });
      const [getUrl, getOptions] = globalThis.fetch.mock.calls.at(-1).arguments;
      assert.equal(getUrl, "http://127.0.0.1:42000/api/v1/fixture");
      assert.equal(getOptions.method, "GET");
      assert.equal(getOptions.headers.origin, undefined);
      assert.equal(getOptions.headers.cookie, "session=fake-1");
      assert.equal(getOptions.headers["x-fixture"], "yes");
    },
    () => s.stop(),
  );
  await assert.rejects(s.request("/fixture"), /released/);
});
test("successful_close_with_open_port_cannot_claim_released", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  faults.add("port-42000-open");
  await assert.rejects(s.stop());
  assert.equal(
    (await metadata(s, "http-released.json")).state,
    "release-failed",
  );
  for (const step of releases) assert(calls.includes(step), step);
  faults.clear();
  await s.stop();
  assert.equal((await metadata(s, "http-released.json")).state, "released");
});
test("partial_setup_keeps_original_and_every_cleanup_error", async () => {
  await setup([
    "login-1",
    "rotate-fixture-one",
    "app-0-close",
    "app-0-db-end",
    "db-0-end",
    "run-end",
    "cluster-end",
    "release-metadata",
  ]);
  await assert.rejects(startAttendanceReadSandbox({ mode: "http" }), (e) => {
    assert(e instanceof AggregateError);
    assert.equal(e.cause, errors.get("login-1"));
    for (const failure of errors.values())
      assert(e.errors.includes(failure), failure.message);
    return true;
  });
  for (const step of releases) assert(calls.includes(step), step);
  assert(calls.includes("rotate-fixture-two"));
});
test("partial_provision_queries_only_candidates_and_rotates_existing_account", async () => {
  await setup(["provision"]);
  await assert.rejects(
    startAttendanceReadSandbox({ mode: "http" }),
    (e) => e === errors.get("provision"),
  );
  assert(calls.includes("find-accounts"));
  assert(calls.includes("rotate-fixture-one"));
  assert(!calls.includes("rotate-fixture-two"));
  assert(calls.includes("verify-sessions"));
});
test("successful_provision_with_unidentified_account_stays_incomplete", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  faults.add("missing-account");
  await assert.rejects(s.stop());
  const result = await metadata(s, "fixture-invalidated.json");
  assert.equal(result.state, "incomplete");
  assert.equal(result.passwordsRotated, 1);
});
for (const failure of ["app-1-acquire", "app-0-listen", "login-0"]) {
  test(`${failure}_releases_every_partially_acquired_app_database`, async () => {
    await setup([failure]);
    await assert.rejects(
      startAttendanceReadSandbox({ mode: "http" }),
      (e) => e === errors.get(failure),
    );
    assert(calls.includes("app-0-capture-db"));
    assert(calls.includes("app-0-close"));
    assert(calls.includes("app-0-db-end"));
    assert(calls.includes("db-0-end"));
    assert(calls.includes("run-end"));
    assert(calls.includes("cluster-end"));
    assert(calls.includes("rotate-fixture-one"));
    assert(calls.includes("rotate-fixture-two"));
  });
}
test("all_failed_release_handles_are_retried_without_repeating_invalidation", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  for (const name of [
    "app-0-db-end",
    "app-1-db-end",
    "db-0-end",
    "run-end",
    "cluster-end",
  ])
    faults.add(name);
  await assert.rejects(s.stop(), (e) => {
    assert.equal(e.errors.length, 5);
    for (const err of errors.values()) assert(e.errors.includes(err));
    return true;
  });
  faults.clear();
  calls.length = 0;
  await s.stop();
  assert.deepEqual(
    calls.filter((v) => v !== "release-metadata"),
    ["app-0-db-end", "app-1-db-end", "db-0-end", "run-end", "cluster-end"],
  );
});
for (const failure of ["migration", "open-run", "create", "open-cluster"]) {
  test(`${failure}_before_provision_never_queries_auth_tables`, async () => {
    await setup([failure]);
    await assert.rejects(
      startAttendanceReadSandbox({ mode: "http" }),
      (e) => e === errors.get(failure),
    );
    assert(!calls.includes("find-accounts"));
    assert(!calls.includes("verify-sessions"));
    if (failure !== "open-cluster") assert(calls.includes("cluster-end"));
    if (failure === "migration") assert(calls.includes("run-end"));
  });
}
for (const failure of [
  "rotate-fixture-one",
  "verify-sessions",
  "find-accounts",
]) {
  test(`rotation_or_verify_failure_stays_incomplete: ${failure}`, async () => {
    await setup();
    const s = await startAttendanceReadSandbox({ mode: "http" });
    faults.add(failure);
    await assert.rejects(s.stop());
    assert.equal(
      (await metadata(s, "fixture-invalidated.json")).state,
      "incomplete",
    );
    for (const step of releases) assert(calls.includes(step), step);
    faults.clear();
    calls.length = 0;
    await assert.rejects(s.stop());
    assert.deepEqual(calls, []);
  });
}
test("nonzero_sessions_cannot_be_invalidated", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  sessionCount = 1;
  await assert.rejects(s.stop());
  const result = await metadata(s, "fixture-invalidated.json");
  assert.equal(result.state, "incomplete");
  assert.equal(result.unrevokedSessions, 1);
});
test("first_app_close_failure_still_closes_second_database_and_pools", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  faults.add("app-0-close");
  await assert.rejects(s.stop());
  for (const step of releases) assert(calls.includes(step), step);
  assert.equal(
    (await metadata(s, "http-released.json")).state,
    "release-failed",
  );
  faults.clear();
  calls.length = 0;
  await s.stop();
  assert.deepEqual(
    calls.filter((v) => v !== "release-metadata"),
    ["app-0-close", "port-42000-check"],
  );
});
for (const failure of ["invalidation-metadata", "release-metadata"]) {
  test(`metadata_failure_does_not_skip_release: ${failure}`, async () => {
    await setup();
    const s = await startAttendanceReadSandbox({ mode: "http" });
    faults.add(failure);
    await assert.rejects(s.stop());
    for (const step of releases) assert(calls.includes(step), step);
    faults.clear();
    calls.length = 0;
    await s.stop();
    assert(!calls.includes("find-accounts"));
    assert(!calls.includes("run-end"));
  });
}
test("stop_is_idempotent_without_reconnecting_closed_database", async () => {
  await setup();
  const s = await startAttendanceReadSandbox({ mode: "http" });
  const a = s.stop(),
    b = s.stop();
  assert.equal(a, b);
  await a;
  calls.length = 0;
  await s.stop();
  assert.deepEqual(calls, []);
});
test("wrong_alias_is_rejected_before_create_or_metadata_write", async () => {
  await setup();
  alias = "task5-attendance";
  await files.writeFile(
    process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
    JSON.stringify({ alias }),
  );
  await assert.rejects(
    startAttendanceReadSandbox({ mode: "sql" }),
    /task10-acceptance/,
  );
  assert.deepEqual(calls, []);
});
