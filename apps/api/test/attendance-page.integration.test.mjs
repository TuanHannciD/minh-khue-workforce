import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startAttendanceReadSandbox } from "./attendance-read-sandbox.mjs";
import { openAttendanceTarget, root } from "./attendance-sandbox.mjs";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";
import { runCheckedDestroy } from "./attendance-page-race-cleanup.mjs";
import { employeeReadDbPolicyFixture as fixed } from "./employee-read-db-policy-fixtures.mjs";
import { EmploymentConsistency } from "../dist/modules/employees/index.js";
import { AttendanceService } from "../dist/modules/attendance/attendance.service.js";
import { AttendanceRepository } from "../dist/modules/attendance/attendance.repository.js";
import { Database } from "../dist/infrastructure/db/database.js";
import * as totals from "../dist/modules/attendance/attendance-totals.js";

/** File map: sandboxTest owns HTTP/Prisma/independent-pool lifecycle and evidence.
 * employee/cell/page/bounded are fake-data and response assertions only.
 * Tests below cover bounds, fixed Unicode boundaries, SQL order ownership,
 * corruption/tombstones, safe totals, Gregorian membership, then HTTP policy.
 * Kept together so each test uses the same fail-safe owner and release proof.
 */

const month = "2026-10";
const id = (n) => `cccccccc-1111-4111-8111-${String(n).padStart(12, "0")}`;
const evidence =
  process.env.MKW_PAGE_EVIDENCE ||
  resolve(
    root,
    ".agent-runs/MKW-PRODUCT-001/server-pagination",
    `page-${randomUUID()}`,
  );

async function sandboxTest(name, body) {
  await mkdir(evidence, { recursive: true });
  const sandbox = await startAttendanceReadSandbox({ mode: "http" });
  let independent;
  const report = {
    name,
    targetFile: sandbox.targetFile,
    evidence: sandbox.evidence,
  };
  try {
    await withCleanup(
      async () => {
        independent = await openAttendanceTarget(sandbox.targetFile);
        const identity = (
          await independent.pool.query(
            `SELECT current_database() AS database,current_user AS username,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version') AS version`,
          )
        ).rows[0];
        assert.equal(identity.database, sandbox.target.database);
        assert.equal(identity.username, "mkw_task10");
        assert.equal(identity.host, "127.0.0.1");
        assert.equal(identity.port, 63771);
        assert.equal(identity.version, "17.11");
        report.identity = identity;
        report.collation = (
          await independent.pool.query(
            `SELECT collprovider AS provider,collisdeterministic AS deterministic,collversion,pg_collation_actual_version(oid) AS actual FROM pg_collation WHERE collname='mkw_read_vi_equivalent'`,
          )
        ).rows[0];
        assert.deepEqual(report.collation, {
          provider: "i",
          deterministic: false,
          collversion: "153.14.37",
          actual: "153.14.37",
        });
        const initialHashes = (
          await independent.pool.query(
            `SELECT username,"passwordHash" FROM "User" ORDER BY username`,
          )
        ).rows;
        for (const db of [
          sandbox.database,
          ...sandbox.apps.map((app) => app.get(Database)),
        ]) {
          const destroy = db.onModuleDestroy;
          db.onModuleDestroy = async function () {
            return runCheckedDestroy({
              check: async () => {
                const hashes = (
                  await independent.pool.query(
                    `SELECT username,"passwordHash" FROM "User" ORDER BY username`,
                  )
                ).rows;
                assert.equal(hashes.length, 2);
                assert(
                  hashes.every(
                    (row, i) =>
                      row.username === initialHashes[i].username &&
                      row.passwordHash !== initialHashes[i].passwordHash,
                  ),
                );
                assert.equal(
                  (
                    await independent.pool.query(
                      `SELECT count(*)::int AS n FROM "Session" WHERE "revokedAt" IS NULL`,
                    )
                  ).rows[0].n,
                  0,
                );
                report.invalidationBeforeDisconnect = true;
              },
              destroy: () => destroy.call(this),
            });
          };
        }
        await body(sandbox, independent.pool);
      },
      () => sandbox.stop(),
      () => independent?.pool.end(),
    );
    assert.equal(sandbox.pool.ended, true);
    assert.equal(independent.pool.ended, true);
    assert(sandbox.apps.every((app) => !app.getHttpServer().listening));
    report.invalidation = JSON.parse(
      await readFile(
        resolve(sandbox.evidence, "fixture-invalidated.json"),
        "utf8",
      ),
    );
    assert.deepEqual(report.invalidation, {
      state: "invalidated",
      passwordsRotated: 2,
      provisionedAccounts: 2,
      unrevokedSessions: 0,
    });
    report.release = JSON.parse(
      await readFile(resolve(sandbox.evidence, "http-released.json"), "utf8"),
    );
    assert.equal(report.release.state, "released");
    const cluster = await openAttendanceTarget(
      process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
    );
    await withCleanup(
      async () => {
        const n = (
          await cluster.pool.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1",
            [sandbox.target.database],
          )
        ).rows[0].n;
        assert.equal(n, 0);
      },
      () => cluster.pool.end(),
    );
    assert.equal(cluster.pool.ended, true);
    report.result = "PASS";
  } catch (error) {
    report.result = "FAIL";
    report.error = { name: error.name, message: error.message };
    throw error;
  } finally {
    report.runPoolEnded = sandbox.pool.ended;
    report.independentPoolEnded = independent?.pool.ended;
    report.listening = sandbox.apps.map((app) => app.getHttpServer().listening);
    for (const [key, file] of [
      ["invalidation", "fixture-invalidated.json"],
      ["release", "http-released.json"],
    ]) {
      try {
        report[key] = JSON.parse(
          await readFile(resolve(sandbox.evidence, file), "utf8"),
        );
      } catch (error) {
        report[`${key}EvidenceError`] = error.message;
      }
    }
    await writeFile(
      resolve(evidence, `${name}-${randomUUID()}.json`),
      JSON.stringify(report, null, 2),
    );
  }
}

test("observer query fault still releases actual Prisma connections", async () => {
  const observerFault = new Error("OWNED_OBSERVER_QUERY_FAULT");
  const leafErrors = (error) =>
    error.errors ? error.errors.flatMap(leafErrors) : [error];
  let owned;
  const destroyAttempts = [0, 0, 0];
  await assert.rejects(
    sandboxTest("observer-fault", async (sandbox, pool) => {
      owned = sandbox;
      for (const [i, db] of [
        sandbox.database,
        ...sandbox.apps.map((app) => app.get(Database)),
      ].entries()) {
        const disconnect = db.client.$disconnect;
        db.client.$disconnect = async function (...args) {
          destroyAttempts[i]++;
          return disconnect.apply(this, args);
        };
        await db.client.$queryRawUnsafe("SELECT 1");
      }
      const destroy = sandbox.database.onModuleDestroy;
      sandbox.database.onModuleDestroy = async function () {
        const query = pool.query;
        // Fault the actual observer query only for the provision Prisma owner;
        // app observers still verify invalidation and close their HTTP listeners.
        pool.query = async () => {
          throw observerFault;
        };
        try {
          return await destroy.call(this);
        } finally {
          pool.query = query;
        }
      };
    }),
    (error) => {
      assert(leafErrors(error).includes(observerFault));
      return true;
    },
  );
  assert(owned);
  assert(destroyAttempts.every((count) => count >= 1));
  assert.equal(owned.pool.ended, true);
  assert(owned.apps.every((app) => !app.getHttpServer().listening));
  const release = JSON.parse(
    await readFile(resolve(owned.evidence, "http-released.json"), "utf8"),
  );
  assert.equal(
    release.state,
    "release-failed",
    "observer failure stays reported despite actual disconnect",
  );
  const invalidation = JSON.parse(
    await readFile(resolve(owned.evidence, "fixture-invalidated.json"), "utf8"),
  );
  assert.equal(invalidation.passwordsRotated, 2);
  assert.equal(invalidation.unrevokedSessions, 0);
  const observer = await openAttendanceTarget(
    process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
  );
  const proof = {
    targetFile: owned.targetFile,
    destroyAttempts,
    invalidation,
    release,
    result: "RUNNING",
  };
  await withCleanup(
    async () => {
      const identity = (
        await observer.pool.query(
          "SELECT current_database() AS database,current_user AS username,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version') AS version",
        )
      ).rows[0];
      assert.deepEqual(identity, {
        database: "postgres",
        username: "mkw_task10",
        host: "127.0.0.1",
        port: 63771,
        version: "17.11",
      });
      proof.identity = identity;
      proof.connections = (
        await observer.pool.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1",
          [owned.target.database],
        )
      ).rows[0].n;
      assert.equal(
        proof.connections,
        0,
        "independent cluster query must prove all Prisma/run/observer connections ended",
      );
      const httpOwner = JSON.parse(
        await readFile(resolve(owned.evidence, "http-owner.json"), "utf8"),
      );
      proof.ports = [];
      for (const url of httpOwner.origins) {
        await assert.rejects(
          fetch(url, { signal: AbortSignal.timeout(1000) }),
          (e) => e.cause?.code === "ECONNREFUSED",
        );
        proof.ports.push({ url, result: "ECONNREFUSED" });
      }
      proof.result = "PASS";
    },
    () => observer.pool.end(),
  );
  assert.equal(observer.pool.ended, true);
  proof.clusterObserverPoolEnded = observer.pool.ended;
  await writeFile(
    resolve(evidence, `observer-fault-live-proof-${randomUUID()}.json`),
    JSON.stringify(proof, null, 2),
    { flag: "wx" },
  );
});

async function employee(
  pool,
  employeeId,
  name,
  start = "2026-10-01",
  end = null,
) {
  await pool.query(
    `INSERT INTO "Employee" (id,name,"startDate","endDate",revision) VALUES ($1::uuid,$2,$3::date,$4::date,$1::uuid)`,
    [employeeId, name, start, end],
  );
}
async function cell(
  pool,
  employeeId,
  date,
  kind,
  valueType,
  halves = null,
  reminder = false,
) {
  const revision = randomUUID();
  await pool.query(
    `INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",reminder,revision) VALUES ($1::uuid,$2::date,$3::"AttendanceKind",$4::"CellValueType",$5,$6,$7::uuid)`,
    [employeeId, date, kind, valueType, halves, reminder, revision],
  );
  return revision;
}
async function page(sandbox, input = {}, status = 200, options = {}) {
  const response = await sandbox.request("/attendance/search", {
    method: "POST",
    body: { month, ...input },
    ...options,
  });
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  if (status !== 200) {
    assert.deepEqual(Object.keys(body).sort(), ["error", "requestId"]);
    assert.equal(typeof body.requestId, "string");
  }
  return body;
}
function bounded(result, count, days = 31) {
  assert.equal(result.employees.length, count);
  assert.equal(result.cells.length, count * days * 2);
  const ids = result.employees.map((e) => e.id);
  assert(result.cells.every((c) => ids.includes(c.employeeId)));
  for (const kind of ["work", "overtime"]) {
    assert.deepEqual(
      result.employeeTotals[kind].map((r) => r.employeeId),
      ids,
    );
    assert.equal(result.monthTotals[kind].byDate.length, days);
  }
  assert.equal("totals" in result, false);
  const employeeSequence = result.cells
    .filter(
      (c, i) => i === 0 || c.employeeId !== result.cells[i - 1].employeeId,
    )
    .map((c) => c.employeeId);
  assert.deepEqual(employeeSequence, result.employees.map((e) => e.id).sort());
  assert.equal(
    new Set(result.cells.map((c) => `${c.employeeId}/${c.date}/${c.kind}`))
      .size,
    count * days * 2,
  );
}

test("paged_read_bounds_global_totals_and_clamp", async () =>
  sandboxTest("bounds", async (s, pool) => {
    await pool.query(
      `INSERT INTO "Employee" (id,name,"startDate",revision) SELECT ('cccccccc-1111-4111-8111-' || lpad(i::text,12,'0'))::uuid,'Worker ' || lpad(i::text,4,'0'),'2026-10-01',('cccccccc-1111-4111-8111-' || lpad(i::text,12,'0'))::uuid FROM generate_series(1,1000) i`,
    );
    await cell(pool, id(1), "2026-10-01", "work", "number", 3);
    await cell(pool, id(1), "2026-10-02", "overtime", "number", 4);
    await cell(pool, id(1000), "2026-10-01", "work", "number", 4);
    await cell(pool, id(1000), "2026-10-02", "overtime", "number", 1);
    await cell(pool, id(999), "2026-10-03", "work", "absence");
    await cell(pool, id(998), "2026-10-03", "work", "empty", null, true);
    assert.deepEqual(
      (
        await pool.query(
          `SELECT kind,sum("halfUnits")::int AS halves FROM "AttendanceCell" WHERE "valueType"='number' GROUP BY kind ORDER BY kind::text`,
        )
      ).rows,
      [
        { kind: "overtime", halves: 5 },
        { kind: "work", halves: 7 },
      ],
    );
    const service = s.apps[0].get(AttendanceService),
      employment = s.apps[0].get(EmploymentConsistency),
      repository = s.apps[0].get(AttendanceRepository);
    const originalList = employment.listForMonth;
    const originalMonth = repository.readMonth;
    const originalMutation = service.authorizer.authorizeMutation;
    const transaction = service.db.client.$transaction;
    let snapshots = 0;
    service.db.client.$transaction = function (operation, options) {
      if (options?.isolationLevel === "RepeatableRead") {
        assert.equal(options.timeout, 10000);
        snapshots++;
      }
      return transaction.call(this, operation, options);
    };
    employment.listForMonth =
      repository.readMonth =
      service.authorizer.authorizeMutation =
        () => {
          throw new Error(
            "page path must not use legacy/full-month or mutation read",
          );
        };
    try {
      for (const size of [25, 50]) {
        const result = await page(s, { pageSize: size });
        bounded(result, size);
        assert.deepEqual(result.pagination, {
          requestedPage: 1,
          page: 1,
          pageSize: size,
          totalResults: 1000,
          monthEmployeeCount: 1000,
          totalPages: size === 25 ? 40 : 20,
          from: 1,
          to: size,
        });
        assert.equal(result.employeeTotals.work[0].value, 1.5);
        assert.equal(result.employeeTotals.overtime[0].value, 2);
        assert.equal(result.monthTotals.work.grandTotal, 3.5);
        assert.equal(result.monthTotals.overtime.grandTotal, 2.5);
        assert.equal(result.monthTotals.work.byDate[0].value, 3.5);
        assert.equal(result.monthTotals.overtime.byDate[1].value, 2.5);
        assert(
          result.monthTotals.work.byDate.slice(1).every((d) => d.value === 0),
        );
      }
      const hit = await page(s, { q: "Worker 0001" });
      bounded(hit, 1);
      assert.equal(hit.monthTotals.work.grandTotal, 3.5);
      const deep = await page(s, { q: "Worker 0726" });
      bounded(deep, 1);
      assert.equal(deep.employees[0].id, id(726));
      const miss = await page(s, { q: "no-match", page: 2147483647 });
      bounded(miss, 0);
      assert.equal(miss.pagination.totalPages, 0);
      assert.equal(miss.pagination.page, 1);
      assert.equal(miss.pagination.requestedPage, 2147483647);
      assert.equal(miss.pagination.from, 0);
      assert.equal(miss.pagination.to, 0);
      assert.equal(miss.monthTotals.work.grandTotal, 3.5);
      assert.equal(miss.monthTotals.overtime.grandTotal, 2.5);
      const last = await page(s, { page: 2147483647 });
      bounded(last, 25);
      assert.equal(last.pagination.page, 40);
      assert.equal(last.pagination.from, 976);
      assert.equal(last.pagination.to, 1000);
      for (const [count, effective, from, to, rows] of [
        [976, 40, 976, 976, 1],
        [975, 39, 951, 975, 25],
      ]) {
        await pool.query(
          `DELETE FROM "AttendanceCell" WHERE "employeeId">$1::uuid`,
          [id(count)],
        );
        await pool.query(`DELETE FROM "Employee" WHERE id>$1::uuid`, [
          id(count),
        ]);
        const r = await page(s, { page: 40 });
        bounded(r, rows);
        assert.equal(r.pagination.page, effective);
        assert.equal(r.pagination.from, from);
        assert.equal(r.pagination.to, to);
        assert.equal(r.pagination.totalResults, count);
      }
      const empty = await page(s, { month: "2026-09" });
      bounded(empty, 0, 30);
      assert.equal(empty.pagination.monthEmployeeCount, 0);
      assert.equal(empty.monthTotals.work.grandTotal, 0);
      assert.equal(empty.monthTotals.overtime.grandTotal, 0);
      assert.equal(snapshots, 9);
    } finally {
      employment.listForMonth = originalList;
      repository.readMonth = originalMonth;
      service.authorizer.authorizeMutation = originalMutation;
      service.db.client.$transaction = transaction;
    }
  }));

test("unicode_page_boundaries_match_pinned_order", async () =>
  sandboxTest("unicode", async (s, pool) => {
    for (const e of fixed.employees) await employee(pool, e.id, e.name);
    for (const n of [0, 18, 21, 23]) {
      await pool.query(
        `DELETE FROM "Employee" WHERE id::text LIKE 'bbbbbbbb-%'`,
      );
      const fillers = Array.from(
        { length: n },
        (_, i) => `bbbbbbbb-1111-4111-8111-${String(i + 1).padStart(12, "0")}`,
      );
      const expected = [
        fixed.expectedOrderedIds[0],
        ...fillers,
        ...fixed.expectedOrderedIds.slice(1),
      ];
      if (n === 18)
        assert.deepEqual(
          expected.slice(24, 26),
          fixed.employees.slice(0, 2).map((e) => e.id),
        );
      if (n === 21)
        assert.deepEqual(
          expected.slice(24, 26),
          fixed.expectedOrderedIds.slice(3, 5),
        );
      if (n === 23)
        assert.deepEqual(
          expected.slice(49, 51),
          fixed.expectedOrderedIds.slice(-2),
        );
      for (const employeeId of fillers)
        await employee(pool, employeeId, "😀 An");
      for (const size of [25, 50]) {
        const observed = [];
        for (let p = 1; p <= Math.ceil(expected.length / size); p++) {
          const r = await page(s, { page: p, pageSize: size });
          bounded(r, Math.min(size, expected.length - (p - 1) * size));
          observed.push(...r.employees.map((e) => e.id));
        }
        assert.deepEqual(observed, expected);
        assert.deepEqual(
          (await page(s, { pageSize: size })).employees.map((e) => e.id),
          expected.slice(0, size),
        );
      }
    }
    await pool.query(`DELETE FROM "Employee" WHERE id::text LIKE 'bbbbbbbb-%'`);
    for (const query of fixed.queries)
      assert.deepEqual(
        (await page(s, { q: query.q })).employees.map((e) => e.id),
        query.expectedIds,
      );
    assert.equal((await page(s, { q: "AABBCCDD" })).pagination.totalResults, 0);
    assert.equal(
      (await page(s, { q: "aabbccdd" })).pagination.totalResults,
      28,
    );
  }));

test("page_read_preserves_shared_sql_order_owner", async () =>
  sandboxTest("ownership", async (s, pool) => {
    for (const e of fixed.employees) await employee(pool, e.id, e.name);
    const employment = s.apps[0].get(EmploymentConsistency),
      original = employment.readMonthPage;
    assert.equal(typeof original, "function");
    let calls = 0;
    let clock;
    employment.readMonthPage = async function (tx, query) {
      calls++;
      const [settings] =
        await tx.$queryRaw`SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly,transaction_timestamp() AS clock`;
      assert.equal(settings.isolation, "repeatable read");
      assert.equal(settings.readonly, "on");
      clock = settings.clock.toISOString();
      const result = await original.call(this, tx, query);
      assert.deepEqual(
        result.employees.map((e) => e.id),
        fixed.expectedOrderedIds.slice(0, 25),
      );
      return { ...result, employees: [...result.employees].reverse() };
    };
    try {
      const r = await page(s);
      assert.equal(calls, 1);
      assert.equal(r.fetchedAt, clock);
      assert.deepEqual(
        r.employees.map((e) => e.id),
        [...fixed.expectedOrderedIds.slice(0, 25)].reverse(),
      );
      bounded(r, 25);
    } finally {
      employment.readMonthPage = original;
    }
  }));

test("offpage_corruption_fails_closed_and_tombstone_projects", async () =>
  sandboxTest("corruption", async (s, pool) => {
    for (let n = 1; n <= 26; n++) await employee(pool, id(n), `Worker ${n}`);
    const tombstone = await cell(pool, id(1), "2026-10-01", "work", "empty");
    await pool.query(
      `UPDATE "Employee" SET "startDate"='2026-10-02' WHERE id=$1::uuid`,
      [id(1)],
    );
    const r = await page(s);
    assert.equal(
      r.cells.find(
        (c) =>
          c.employeeId === id(1) &&
          c.date === "2026-10-01" &&
          c.kind === "work",
      ).revision,
      tombstone,
    );
    assert.equal(
      r.cells.find((c) => c.employeeId === id(1) && c.date === "2026-10-01")
        .state,
      "before-start",
    );
    const tombstoneAfter = await cell(
      pool,
      id(1),
      "2026-10-31",
      "overtime",
      "empty",
    );
    await pool.query(
      `UPDATE "Employee" SET "endDate"='2026-10-30' WHERE id=$1::uuid`,
      [id(1)],
    );
    const after = await page(s);
    const afterCell = after.cells.find(
      (c) =>
        c.employeeId === id(1) &&
        c.date === "2026-10-31" &&
        c.kind === "overtime",
    );
    assert.equal(afterCell.state, "after-end");
    assert.equal(afterCell.revision, tombstoneAfter);
    for (const [type, halves, reminder] of [
      ["number", 3, false],
      ["absence", null, false],
      ["empty", null, true],
    ]) {
      await cell(pool, id(26), "2026-10-01", "work", type, halves, reminder);
      for (const start of ["2026-10-02", "2026-11-01"]) {
        await pool.query(
          `UPDATE "Employee" SET "startDate"=$2::date WHERE id=$1::uuid`,
          [id(26), start],
        );
        const failure = await page(s, { q: id(1) }, 503);
        assert.equal(failure.error.code, "TEMPORARILY_UNAVAILABLE");
        assert(!JSON.stringify(failure).includes(id(26)));
      }
      await pool.query(
        `DELETE FROM "AttendanceCell" WHERE "employeeId"=$1::uuid`,
        [id(26)],
      );
      await pool.query(
        `UPDATE "Employee" SET "startDate"='2026-10-01' WHERE id=$1::uuid`,
        [id(26)],
      );
    }
    // Deliberately corrupt only this fresh fake DB; restore its FK even if the
    // fail-closed assertion fails. Ownerless empty tombstones must also fail.
    await pool.query(
      `ALTER TABLE "AttendanceCell" DROP CONSTRAINT "AttendanceCell_employeeId_fkey"`,
    );
    await withCleanup(
      async () => {
        await cell(pool, id(999), "2026-10-01", "work", "empty");
        const failure = await page(s, {}, 503);
        assert.equal(failure.error.code, "TEMPORARILY_UNAVAILABLE");
      },
      async () => {
        await pool.query(
          `DELETE FROM "AttendanceCell" WHERE "employeeId"=$1::uuid`,
          [id(999)],
        );
        await pool.query(
          `ALTER TABLE "AttendanceCell" ADD CONSTRAINT "AttendanceCell_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id) ON DELETE RESTRICT ON UPDATE CASCADE`,
        );
      },
    );
  }));

test("month_totals_reject_unsafe_halves_without_precision_loss", () => {
  assert.equal(typeof totals.monthTotalsFromHalves, "function");
  const dates = ["2026-10-01", "2026-10-02"];
  assert.deepEqual(
    totals.monthTotalsFromHalves(dates, [
      { kind: "work", date: dates[0], halfUnits: 3n },
      { kind: "overtime", date: dates[1], halfUnits: 4n },
    ]),
    {
      work: {
        byDate: [
          { date: dates[0], value: 1.5 },
          { date: dates[1], value: 0 },
        ],
        grandTotal: 1.5,
      },
      overtime: {
        byDate: [
          { date: dates[0], value: 0 },
          { date: dates[1], value: 2 },
        ],
        grandTotal: 2,
      },
    },
  );
  assert.throws(
    () =>
      totals.monthTotalsFromHalves(dates, [
        { kind: "work", date: dates[0], halfUnits: 9007199254740992n },
      ]),
    (e) => e.getStatus?.() === 503,
  );
  assert.throws(
    () =>
      totals.monthTotalsFromHalves(dates, [
        { kind: "work", date: dates[0], halfUnits: 9007199254740990n },
        { kind: "work", date: dates[1], halfUnits: 2n },
      ]),
    (e) => e.getStatus?.() === 503,
  );
});

test("inclusive_membership_and_complete_gregorian_dates", async () =>
  sandboxTest("calendar", async (s, pool) => {
    for (const [m, days] of [
      ["1900-02", 28],
      ["2000-02", 29],
      ["2026-04", 30],
      ["2026-10", 31],
      ["0001-01", 31],
      ["9999-12", 31],
    ]) {
      await pool.query(`DELETE FROM "Employee"`);
      const start = `${m}-01`,
        end = `${m}-${days}`;
      await employee(pool, id(1), "Boundary start", start, start);
      await employee(pool, id(2), "Boundary end", end, end);
      const r = await page(s, { month: m });
      bounded(r, 2, days);
      assert.equal(r.pagination.monthEmployeeCount, 2);
      assert(
        r.cells.some(
          (c) =>
            c.employeeId === id(1) &&
            c.date === start &&
            c.state === "editable",
        ),
      );
      assert(
        r.cells.some(
          (c) =>
            c.employeeId === id(2) && c.date === end && c.state === "editable",
        ),
      );
      for (const kind of ["work", "overtime"])
        assert(r.monthTotals[kind].byDate.every((d) => d.value === 0));
    }
  }));

test("page_auth_privacy_and_read_only_revisions", async () =>
  sandboxTest("policy", async (s, pool) => {
    const employment = s.apps[0].get(EmploymentConsistency),
      original = employment.readMonthPage;
    let calls = 0;
    employment.readMonthPage = async function (...args) {
      calls++;
      return original.apply(this, args);
    };
    try {
      await page(s, {}, 401, { actor: 9 });
      assert.equal(calls, 0);
      await page(s, {}, 403, {
        headers: { origin: "https://invalid.example" },
      });
      assert.equal(calls, 0);
      await page(s, {}, 415, { headers: { "content-type": "text/plain" } });
      assert.equal(calls, 0);
      await page(s, { q: "x".repeat(17 * 1024 * 1024) }, 413);
      assert.equal(calls, 0);
      await page(s, { unknown: true }, 400);
      assert.equal(calls, 0);
      await employee(pool, id(1), "Private fixture");
      await cell(pool, id(1), "2026-10-01", "work", "number", 3);
      const query = `SELECT id::text AS key,revision::text FROM "Employee" UNION ALL SELECT "employeeId"::text || date::text || kind::text AS key,revision::text FROM "AttendanceCell" ORDER BY key`;
      const before = (await pool.query(query)).rows;
      await page(s);
      assert.equal(calls, 1);
      assert.deepEqual((await pool.query(query)).rows, before);
    } finally {
      employment.readMonthPage = original;
    }
  }));
