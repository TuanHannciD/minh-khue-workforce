/**
 * Real HTTP/Prisma/PostgreSQL races. Each case owns a fresh UUID sandbox and a
 * separately identity-checked SQL pool. Barriers preserve real SQL; the opt-in
 * negative fixture changes only this test's transaction isolation, never source.
 * File map: owned = identity/invalidation/release; seed/write/readback = setup;
 * snapshot race = four barriers; atomic conflict = frozen keys/revisions;
 * explicit no-op = both scheduling orders and noneligible fence matrix.
 * Keep barrier and independent SQL assertions adjacent to the transaction they
 * prove. Each named test owns its DB/pools; no production pause route is added.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startAttendanceReadSandbox } from "./attendance-read-sandbox.mjs";
import { openAttendanceTarget } from "./attendance-sandbox.mjs";
import { attendanceClient, pauseMethod } from "./attendance-test-client.mjs";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";
import { runCheckedDestroy } from "./attendance-page-race-cleanup.mjs";
import { AttendanceRepository } from "../dist/modules/attendance/attendance.repository.js";
import { EmploymentConsistency } from "../dist/modules/employees/index.js";
import { Database } from "../dist/infrastructure/db/database.js";

const month = "2026-10";
const id = (n) => `dddddddd-1111-4111-8111-${String(n).padStart(12, "0")}`;
async function owned(name, body) {
  const s = await startAttendanceReadSandbox({ mode: "http" });
  let independent;
  const report = { name, targetFile: s.targetFile };
  try {
    await withCleanup(
      async () => {
        independent = await openAttendanceTarget(s.targetFile);
        report.identity = (
          await independent.pool.query(`SELECT current_database() AS database,
        current_user AS username,host(inet_server_addr()) AS host,inet_server_port() AS port,
        current_setting('data_directory') AS directory,current_setting('server_version') AS version`)
        ).rows[0];
        assert.equal(report.identity.database, s.target.database);
        assert.equal(report.identity.username, "mkw_task10");
        assert.equal(report.identity.version, "17.11");
        // Observe invalidation at the actual disconnect boundary, without logging hashes.
        const hashes = (
          await independent.pool.query(
            'SELECT username,"passwordHash" FROM "User" ORDER BY username',
          )
        ).rows;
        for (const database of [
          s.database,
          ...s.apps.map((a) => a.get(Database)),
        ]) {
          const destroy = database.onModuleDestroy;
          database.onModuleDestroy = async function () {
            return runCheckedDestroy({
              check: async () => {
                const after = (
                  await independent.pool.query(
                    'SELECT username,"passwordHash" FROM "User" ORDER BY username',
                  )
                ).rows;
                assert.equal(after.length, 2);
                assert(
                  after.every(
                    (row, i) =>
                      row.username === hashes[i].username &&
                      row.passwordHash !== hashes[i].passwordHash,
                  ),
                );
                assert.equal(
                  (
                    await independent.pool.query(
                      'SELECT count(*)::int n FROM "Session" WHERE "revokedAt" IS NULL',
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
        await body(s, independent.pool, report);
      },
      () => s.stop(),
      () => independent?.pool.end(),
    );
    assert.equal(s.pool.ended, true);
    assert.equal(independent.pool.ended, true);
    assert(s.apps.every((a) => !a.getHttpServer().listening));
    report.result = "PASS";
  } catch (error) {
    report.result = "FAIL";
    report.error = String(error);
    throw error;
  } finally {
    report.poolEnded = s.pool.ended;
    report.independentPoolEnded = independent?.pool.ended;
    report.listening = s.apps.map((a) => a.getHttpServer().listening);
    await writeFile(
      resolve(s.evidence, name + ".json"),
      JSON.stringify(report, null, 2),
    );
  }
}
const read = async (s, extra = {}, status = 200) => {
  const response = await s.request("/attendance/search", {
    method: "POST",
    body: { month, q: "", page: 1, pageSize: 25, ...extra },
  });
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
};
const number = (value) => ({ type: "number", value });

test("observer_failure_releases_live_apps_provision_and_independent_pools", async () => {
  const bodyError = new Error("injected race body failure");
  const checkError = new Error("injected invalidation observer query failure");
  let sandbox, independent;
  let observerFaults = 0;
  const leaves = (error) =>
    error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
  await withCleanup(
    async () => {
      await assert.rejects(
        owned("expected-observer-failure", async (s, pool, report) => {
          sandbox = s;
          independent = pool;
          report.expectedFailure = "body and invalidation observer";
          const query = pool.query.bind(pool);
          pool.query = (sql, ...args) => {
            if (
              sql ===
              'SELECT username,"passwordHash" FROM "User" ORDER BY username'
            ) {
              report.observerFaults = ++observerFaults;
              return Promise.reject(checkError);
            }
            return query(sql, ...args);
          };
          throw bodyError;
        }),
        (error) => {
          assert.equal(error.cause, bodyError);
          assert(leaves(error).includes(bodyError));
          assert(leaves(error).includes(checkError));
          return true;
        },
      );
      assert.equal(sandbox.pool.ended, true);
      assert.equal(independent.ended, true);
      assert(sandbox.apps.every((app) => !app.getHttpServer().listening));
      assert(observerFaults >= 3, "every database observer must be exercised");
      const audit = await openAttendanceTarget(
        process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
      );
      await withCleanup(
        async () => {
          const connections = (
            await audit.pool.query(
              "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1",
              [sandbox.target.database],
            )
          ).rows[0].n;
          assert.equal(
            connections,
            0,
            "no pool may depend on the emergency fallback",
          );
        },
        () => audit.pool.end(),
      );
      assert.equal(audit.pool.ended, true);
    },
    async () => {
      // Emergency release also makes a failing fixture safe. The assertions
      // above run before this fallback and cannot borrow its cleanup success.
      if (sandbox) {
        for (const database of [
          sandbox.database,
          ...sandbox.apps.map((a) => a.get(Database)),
        ])
          database.onModuleDestroy = Database.prototype.onModuleDestroy;
        await sandbox.stop();
      }
    },
  );
});

test("page_snapshot_survives_concurrent_insert_rename_dates_and_write", async (t) => {
  // Break caught: count/IDs/cells/aggregate split across snapshots (including
  // READ COMMITTED), or projection outside the owning read-only transaction.
  for (const stage of ["snapshot", "count-ids", "cells", "aggregate"]) {
    await t.test(stage, () =>
      owned("snapshot-" + stage, async (s, pool, report) => {
        const employees = Array.from({ length: 30 }, (_, i) => ({
          id: id(i + 1),
          name: `An ${String(i + 1).padStart(3, "0")}`,
        }));
        await pool.query(
          `INSERT INTO "Employee" (id,name,"startDate",revision)
        SELECT id::uuid,name,'2026-10-01'::date,id::uuid FROM jsonb_to_recordset($1::jsonb) e(id text,name text)`,
          [JSON.stringify(employees)],
        );
        await pool.query(
          `INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",revision)
        VALUES ($1::uuid,'2026-10-20','work','number',3,$1::uuid),
        ($2::uuid,'2026-10-20','overtime','number',5,$2::uuid)`,
          [id(1), id(30)],
        );
        const beforeSQL = (
          await pool.query(
            'SELECT id,name,"startDate","endDate",revision FROM "Employee" ORDER BY id',
          )
        ).rows;
        const repo = s.apps[0].get(AttendanceRepository);
        const owner =
          stage === "count-ids" ? s.apps[0].get(EmploymentConsistency) : repo;
        const method = {
          snapshot: "assertMonthInvariant",
          "count-ids": "readMonthPage",
          cells: "readPageCells",
          aggregate: "aggregateMonth",
        }[stage];
        const db = s.apps[0].get(Database);
        const transaction = db.client.$transaction;
        if (process.env.MKW_PAGE_RACE_NEGATIVE === "read-committed")
          db.client.$transaction = function (operation, options) {
            return transaction.call(this, operation, {
              ...options,
              isolationLevel: "ReadCommitted",
            });
          };
        const barrier = pauseMethod(owner, method);
        const pending = read(s);
        try {
          const [tx] = await barrier.entered;
          report.isolation = (
            await tx.$queryRaw`SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly`
          )[0];
          // One independent connection/transaction B commits all four changes.
          const connection = await pool.connect();
          await withCleanup(
            async () => {
              await connection.query("BEGIN");
              try {
                await connection.query(
                  `INSERT INTO "Employee"(id,name,"startDate",revision) VALUES ($1::uuid,'A','2026-10-01',$1::uuid)`,
                  [id(31)],
                );
                await connection.query(
                  `UPDATE "Employee" SET name='A',revision=$2::uuid WHERE id=$1::uuid`,
                  [id(30), randomUUID()],
                );
                await connection.query(
                  `UPDATE "Employee" SET "startDate"='2026-10-02',"endDate"='2026-10-21',revision=$2::uuid WHERE id=$1::uuid`,
                  [id(1), randomUUID()],
                );
                await connection.query(
                  `UPDATE "AttendanceCell" SET "halfUnits"=7,revision=$2::uuid WHERE "employeeId"=$1::uuid`,
                  [id(1), randomUUID()],
                );
                await connection.query(
                  `INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",revision) VALUES ($1::uuid,'2026-10-20','work','number',4,$1::uuid)`,
                  [id(31)],
                );
                await connection.query("COMMIT");
              } catch (error) {
                await connection.query("ROLLBACK");
                throw error;
              }
            },
            () => connection.release(),
          );
          report.afterCommitSQL = (
            await pool.query(`SELECT
          (SELECT count(*)::int FROM "Employee") AS employees,
          (SELECT sum("halfUnits")::int FROM "AttendanceCell" WHERE kind='work') AS work,
          (SELECT sum("halfUnits")::int FROM "AttendanceCell" WHERE kind='overtime') AS overtime`)
          ).rows[0];
          assert.deepEqual(report.afterCommitSQL, {
            employees: 31,
            work: 11,
            overtime: 5,
          });
          barrier.release();
          const a = await pending;
          assert.equal(
            a.pagination.totalResults,
            30,
            "A count belongs to the acquired snapshot",
          );
          assert.deepEqual(
            a.employees.map((e) => e.id),
            employees.slice(0, 25).map((e) => e.id),
            "A IDs/order remain wholly pre-commit",
          );
          assert.equal(a.employees[0].startDate, "2026-10-01");
          assert.equal(a.employees[0].endDate, null);
          assert.equal(a.employees[0].revision, beforeSQL[0].revision);
          assert.equal(
            a.cells.find(
              (c) =>
                c.employeeId === id(1) &&
                c.date === "2026-10-22" &&
                c.kind === "work",
            ).state,
            "editable",
          );
          assert.deepEqual(
            a.cells.find(
              (c) =>
                c.employeeId === id(1) &&
                c.date === "2026-10-20" &&
                c.kind === "work",
            ).value,
            number(1.5),
          );
          assert.equal(
            a.employeeTotals.work.find((c) => c.employeeId === id(1)).value,
            1.5,
          );
          assert.equal(a.monthTotals.work.grandTotal, 1.5);
          assert.equal(a.monthTotals.overtime.grandTotal, 2.5);
          assert.equal(a.cells.length, 1550);
          assert.deepEqual(
            a.employeeTotals.work,
            employees.slice(0, 25).map((e) => ({
              employeeId: e.id,
              value: e.id === id(1) ? 1.5 : 0,
            })),
          );
          assert(a.employeeTotals.overtime.every((row) => row.value === 0));
          assert.deepEqual(report.isolation, {
            isolation: "repeatable read",
            readonly: "on",
          });
          const b = await read(s);
          assert.equal(b.pagination.totalResults, 31);
          assert.deepEqual(
            b.employees.map((e) => e.id),
            [id(30), id(31), ...employees.slice(0, 23).map((e) => e.id)],
          );
          const person = b.employees.find((e) => e.id === id(1));
          assert.equal(person.startDate, "2026-10-02");
          assert.equal(person.endDate, "2026-10-21");
          assert.notEqual(person.revision, beforeSQL[0].revision);
          assert.deepEqual(
            b.cells.find(
              (c) =>
                c.employeeId === id(1) &&
                c.date === "2026-10-20" &&
                c.kind === "work",
            ).value,
            number(3.5),
          );
          assert.notEqual(
            b.cells.find(
              (c) =>
                c.employeeId === id(1) &&
                c.date === "2026-10-20" &&
                c.kind === "work",
            ).revision,
            id(1),
          );
          assert.equal(
            b.cells.find(
              (c) =>
                c.employeeId === id(1) &&
                c.date === "2026-10-22" &&
                c.kind === "work",
            ).state,
            "after-end",
          );
          assert.equal(
            b.employeeTotals.work.find((c) => c.employeeId === id(1)).value,
            3.5,
          );
          assert.equal(b.monthTotals.work.grandTotal, 5.5);
          assert.equal(b.monthTotals.overtime.grandTotal, 2.5);
          assert.equal(b.cells.length, 1550);
          assert.equal(
            b.employeeTotals.overtime.find((row) => row.employeeId === id(30))
              .value,
            2.5,
          );
          report.envelopes = { before: a, after: b };
        } finally {
          barrier.restore();
          db.client.$transaction = transaction;
          await pending.catch(() => {});
        }
      }),
    );
  }
});

test("offpage_atomic_conflict_and_original_key_reconcile_preserve_frozen_revisions", () =>
  owned("offpage-conflict", async (s, pool, report) => {
    const api = attendanceClient(s);
    const a = await api.create({ name: "A source" }),
      b = await api.create({ name: "Z target" });
    const ka = api.key(a),
      kb = api.key(b);
    await api.saved(
      api.intent(a, [ka], {
        type: "patch-cell",
        patch: { value: number(1), reminder: true },
      }),
    );
    const source = (await api.reconcile([ka], [a.id])).cells[0];
    ka.expectedRevision = source.revision;
    const original = {
      month,
      expectedEmployees: [a, b].map((e) => ({
        employeeId: e.id,
        expectedRevision: e.revision,
      })),
      targets: [ka, kb],
      operation: { type: "set-value", mode: "replace", value: number(2) },
    };
    // B changes only the offpage target; one conflict rejects the entire frozen batch.
    await api.saved(
      api.intent(b, [kb], { type: "patch-cell", patch: { reminder: true } }),
      { actor: 1 },
    );
    const sql = async () =>
      (
        await pool.query(
          'SELECT "employeeId",date::text,kind,"valueType","halfUnits",reminder,revision,"updatedAt" FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows;
    const before = await sql();
    assert.equal((await api.post(original)).status, 409);
    assert.deepEqual(await sql(), before);
    assert.equal(original.targets[1].expectedRevision, "0");
    // Source reminder-only change is also a source conflict, never silently rebased.
    await api.saved(
      api.intent(a, [ka], { type: "patch-cell", patch: { reminder: false } }),
      { actor: 1 },
    );
    const beforeSource = await sql();
    assert.equal(
      (
        await api.post({
          month,
          expectedEmployees: original.expectedEmployees,
          targets: [
            {
              ...kb,
              expectedRevision: before.find((c) => c.employeeId === b.id)
                .revision,
            },
          ],
          source: ka,
          operation: {
            type: "set-value",
            mode: "fill-empty",
            value: number(1),
          },
        })
      ).status,
      409,
    );
    assert.deepEqual(await sql(), beforeSource);
    // Explicit full GET is a coordinator setup oracle only, never a browser read.
    const page = await read(s, { q: "A source" });
    assert.equal(page.pagination.totalResults, 1);
    assert.deepEqual(
      page.employees.map((e) => e.id),
      [a.id],
    );
    const reconciled = await api.reconcile([ka, kb], [a.id, b.id]);
    assert.deepEqual(
      new Set(reconciled.cells.map((c) => c.employeeId)),
      new Set([a.id, b.id]),
    );
    assert.deepEqual(await sql(), beforeSource);
    report.originalKeys = original;
    report.sqlReadOnlyReconcile = beforeSource;
  }));

test("explicit_noop_fence_both_orders_and_noneligible_source_skip_occupied_zero_never_fence", () =>
  owned("fence-orders", async (s, pool, report) => {
    // Break caught: optimizing away accepted no-op writes, or fencing the source,
    // skipped/occupied targets, rejected intents, or a read-only reconciliation.
    const api = attendanceClient(s);
    const sql = async () =>
      (
        await pool.query(
          'SELECT "employeeId",date::text,kind,"valueType","halfUnits",reminder,revision,"updatedAt" FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows;
    const outcomes = [];
    for (const initial of [
      undefined,
      { value: null, reminder: false },
      { value: null, reminder: true },
      { value: number(1), reminder: false },
      { value: { type: "absence" }, reminder: true },
    ])
      for (const order of ["new-first", "old-first"]) {
        const e = await api.create({ name: "Z offpage fence" });
        const k = api.key(e),
          other = api.key(e, "2026-10-21");
        if (initial)
          k.expectedRevision = (
            await api.saved(
              api.intent(e, [k], { type: "patch-cell", patch: initial }),
            )
          ).cells[0].revision;
        const keep = initial ?? { value: null, reminder: false };
        const gate = pauseMethod(
          s.apps[0].get(EmploymentConsistency),
          "lockEmployees",
        );
        const delayed = api.post(
          order === "new-first"
            ? api.intent(e, [k, other], {
                type: "set-value",
                mode: "replace",
                value: number(2),
              })
            : api.intent(e, [k], { type: "patch-cell", patch: keep }),
        );
        try {
          await gate.entered;
          const before = await sql();
          await read(s, { q: "not-present" });
          await api.reconcile([k, other], [e.id], { actor: 1 });
          assert.deepEqual(
            await sql(),
            before,
            "page/reconcile is never a fence",
          );
          const winner = await api.saved(
            api.intent(e, [k], {
              type: "patch-cell",
              patch:
                order === "new-first"
                  ? keep
                  : { value: number(2), reminder: true },
            }),
            { actor: 1 },
          );
          assert.equal(winner.counts.changed, order === "new-first" ? 0 : 1);
          assert.equal(winner.counts.eligible, 1);
          assert.notEqual(winner.cells[0].revision, k.expectedRevision);
          const committed = await sql();
          gate.release();
          assert.equal((await delayed).status, 409);
          assert.deepEqual(
            await sql(),
            committed,
            "conflict never partially writes other target",
          );
          assert.equal((await api.reconcile([other])).cells[0].revision, "0");
          outcomes.push({
            order,
            initial: initial ?? "absent",
            eligible: 1,
            changed: winner.counts.changed,
            delayed: 409,
          });
        } finally {
          gate.restore();
          await delayed;
        }
      }
    for (const order of ["new-first", "old-first"]) {
      const e = await api.create({
        name: "Z source skip",
        startDate: "2026-10-15",
        endDate: "2026-10-25",
      });
      const source = api.key(e, "2026-10-19"),
        eligible = api.key(e, "2026-10-20"),
        occupied = api.key(e, "2026-10-21");
      const skip = api.key(e, "2026-10-14"),
        after = api.key(e, "2026-10-26");
      source.expectedRevision = (
        await api.saved(
          api.intent(e, [source], {
            type: "patch-cell",
            patch: { value: number(1), reminder: true },
          }),
        )
      ).cells[0].revision;
      occupied.expectedRevision = (
        await api.saved(
          api.intent(e, [occupied], {
            type: "patch-cell",
            patch: { value: { type: "absence" }, reminder: true },
          }),
        )
      ).cells[0].revision;
      const targets = [eligible, occupied, skip, after];
      const fill = api.intent(
        e,
        targets,
        { type: "set-value", mode: "fill-empty", value: number(1) },
        { source },
      );
      const reminder = api.intent(e, [source], {
        type: "set-reminder",
        reminder: false,
      });
      const gate = pauseMethod(
        s.apps[0].get(EmploymentConsistency),
        "lockEmployees",
      );
      const delayed = api.post(order === "new-first" ? reminder : fill);
      try {
        await gate.entered;
        const before = await sql();
        if (order === "new-first") {
          const result = await api.saved(fill, { actor: 1 });
          assert.deepEqual(result.counts, {
            selected: 4,
            eligible: 1,
            skipped: 2,
            changed: 1,
          });
          const current = await sql();
          for (const key of [source, occupied, skip, after])
            assert.deepEqual(
              current.filter(
                (c) => c.employeeId === e.id && c.date === key.date,
              ),
              before.filter(
                (c) => c.employeeId === e.id && c.date === key.date,
              ),
            );
          gate.release();
          assert.equal(
            (await delayed).status,
            200,
            "source read must not fence its delayed reminder write",
          );
        } else {
          await api.saved(reminder, { actor: 1 });
          const current = await sql();
          gate.release();
          assert.equal(
            (await delayed).status,
            409,
            "stale source reminder rejects whole fill",
          );
          assert.deepEqual(await sql(), current);
        }
        const state = await api.reconcile(
          [source, occupied, skip, after],
          [e.id],
        );
        const occupiedNow = {
          ...occupied,
          expectedRevision: state.cells.find((c) => c.date === occupied.date)
            .revision,
        };
        const zero = api.intent(e, [occupiedNow, skip, after], {
          type: "set-value",
          mode: "fill-empty",
          value: null,
        });
        const beforeZero = await sql();
        assert.equal((await api.post(zero, { actor: 1 })).status, 422);
        assert.deepEqual(
          await sql(),
          beforeZero,
          "eligible0 keeps occupied/skipped/source revisions",
        );
        outcomes.push({
          order,
          sourceReadOnly: true,
          skipRevisionsUnchanged: true,
          occupiedUnchanged: true,
          zeroEligible: 422,
        });
      } finally {
        gate.restore();
        await delayed;
      }
    }
    report.outcomes = outcomes;
  }));
