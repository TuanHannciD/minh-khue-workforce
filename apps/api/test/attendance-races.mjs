/** registerRaces: employment-vs-cell, consistent reads, unknown result and session fences.
 * Sequentially shares the suite-owned PostgreSQL fixture; barrier helpers preserve SQL.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { resetPassword } from "../dist/modules/auth/auth-operations.js";
import { attendanceSandbox, migrate, fixture } from "./attendance-sandbox.mjs";
import {
  attendanceClient,
  pauseMethod,
  blockedBy,
} from "./attendance-test-client.mjs";
export async function registerRaces(
  t,
  { db, f, api, employment, authorizer, service, repository, number },
) {
  for (const [kind, operation] of [
    ["work", { type: "set-value", value: number(1.5), mode: "replace" }],
    [
      "work",
      { type: "set-value", value: { type: "absence" }, mode: "replace" },
    ],
    ["overtime", { type: "set-value", value: number(2), mode: "replace" }],
    ["work", { type: "set-reminder", reminder: true }],
    ["overtime", { type: "set-reminder", reminder: true }],
  ])
    for (const field of ["startDate", "endDate"])
      for (const first of ["date", "cell"])
        await t.test(
          `date_change_race_preserves_valid_interval ${kind}/${operation.type}/${operation.value?.type ?? "reminder"}/${field}/${first}`,
          async () => {
            const e = await api.create(),
              k = api.key(e, "2026-11-20", kind);
            const gate = pauseMethod(employment, "lockEmployees", true);
            const dateFields =
              field === "startDate"
                ? { startDate: "2026-12-01" }
                : { endDate: "2026-10-31" };
            const a =
              first === "date"
                ? api.patch(e, dateFields)
                : api.post(api.intent(e, [k], operation));
            try {
              const [tx] = await gate.entered;
              const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() pid`;
              const b =
                first === "date"
                  ? api.post(api.intent(e, [k], operation), { actor: 1 })
                  : api.patch(e, dateFields, { actor: 1 });
              await blockedBy(db.pool, pid);
              gate.release();
              assert.equal((await a).status, 200);
              assert.equal((await b).status, first === "date" ? 409 : 422);
              const current = await api.reconcile([k]);
              if (first === "date") {
                assert.equal(current.cells[0].value, null);
                assert.equal(current.cells[0].reminder, false);
                assert.equal(current.cells[0].revision, "0");
                assert.equal(current.employees[0][field], dateFields[field]);
              } else {
                assert.equal(current.cells[0].state, "editable");
                assert.notEqual(current.cells[0].revision, "0");
                assert.equal(current.employees[0].revision, e.revision);
                if (operation.type === "set-reminder")
                  assert.equal(current.cells[0].reminder, true);
                else assert.deepEqual(current.cells[0].value, operation.value);
              }
            } finally {
              gate.restore();
              await a;
            }
          },
        );
  for (const read of ["month", "reconcile"])
    await t.test(
      `${read} is one read-only REPEATABLE READ snapshot during employment/cell change`,
      async () => {
        const e = await api.create({ name: `Snapshot giả ${read}` }),
          k = api.key(e);
        const seed = await api.saved(
          api.intent(e, [k], {
            type: "patch-cell",
            patch: { value: null, reminder: false },
          }),
        );
        const method = read === "month" ? "listForMonth" : "readByIds";
        const gate = pauseMethod(employment, method, true);
        const pending =
          read === "month"
            ? f.request("/attendance/month?month=2026-10")
            : f.request("/attendance/reconcile", {
                method: "POST",
                body: {
                  employeeIds: [e.id],
                  cells: [{ employeeId: e.id, date: k.date, kind: k.kind }],
                },
              });
        try {
          const [tx] = await gate.entered;
          const [isolation] =
            await tx.$queryRaw`SELECT current_setting('transaction_isolation') isolation, current_setting('transaction_read_only') readonly`;
          assert.deepEqual(isolation, {
            isolation: "repeatable read",
            readonly: "on",
          });
          const r = await api.patch(
            e,
            { startDate: "2026-11-01" },
            { actor: 1 },
          );
          assert.equal(r.status, 200);
          gate.release();
          const result = await (await pending).json();
          const before = result.employees.find((x) => x.id === e.id);
          assert.deepEqual(before, e);
          const cell = result.cells.find(
            (c) =>
              c.employeeId === e.id && c.date === k.date && c.kind === k.kind,
          );
          assert.equal(cell.state, "editable");
          assert.equal(cell.revision, seed.cells[0].revision);
          const after = await api.reconcile([k]);
          assert.equal(after.cells[0].state, "before-start");
          assert.equal(after.cells[0].revision, seed.cells[0].revision);
        } finally {
          gate.restore();
          await pending;
        }
      },
    );
  await t.test(
    "reconcile DB failures are 503 rather than missing; corrupt outside-interval cells fail safely",
    async () => {
      const e = await api.create(),
        k = api.key(e);
      const original = repository.readKeys;
      repository.readKeys = (tx) =>
        tx.$queryRaw`SELECT 1 FROM "task5_missing_relation_fixture"`;
      try {
        const r = await f.request("/attendance/reconcile", {
          method: "POST",
          body: {
            employeeIds: [e.id],
            cells: [{ employeeId: e.id, date: k.date, kind: k.kind }],
          },
        });
        assert.equal(r.status, 503);
        assert.equal("missingEmployeeIds" in (await r.json()), false);
      } finally {
        repository.readKeys = original;
      }
      const bounded = await api.create({ startDate: "2026-11-01" });
      const bad = api.key(bounded);
      await db.pool.query(
        'INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType",reminder,revision) VALUES ($1,$2,$3,\'empty\',true,gen_random_uuid())',
        [bad.employeeId, bad.date, bad.kind],
      );
      try {
        for (const [path, method, body] of [
          ["/attendance/month?month=2026-10", "GET"],
          [
            "/attendance/reconcile",
            "POST",
            {
              employeeIds: [bounded.id],
              cells: [
                {
                  employeeId: bad.employeeId,
                  date: bad.date,
                  kind: bad.kind,
                },
              ],
            },
          ],
        ])
          assert.equal((await f.request(path, { method, body })).status, 503);
      } finally {
        // Restore only the test-owned deliberately corrupt row, retaining its revision.
        await db.pool.query(
          'UPDATE "AttendanceCell" SET reminder=false WHERE "employeeId"=$1',
          [bounded.id],
        );
      }
    },
  );
  await t.test(
    "response_lost_after_commit persists both patch fields without a second write",
    async () => {
      const e = await api.create(),
        k = api.key(e);
      const gate = pauseMethod(service, "write", true);
      const controller = new AbortController();
      const pending = api.post(
        api.intent(e, [k], {
          type: "patch-cell",
          patch: { value: number(1.5), reminder: true },
        }),
        { signal: controller.signal },
      );
      try {
        await gate.entered;
        controller.abort();
        await assert.rejects(pending, (error) => error.name === "AbortError");
        const actual = await api.reconcile([k], [], { actor: 1 });
        assert.deepEqual(actual.cells[0].value, number(1.5));
        assert.equal(actual.cells[0].reminder, true);
        const {
          rows: [sql],
        } = await db.pool.query(
          'SELECT "halfUnits",reminder,revision FROM "AttendanceCell" WHERE "employeeId"=$1',
          [e.id],
        );
        assert.deepEqual(sql, {
          halfUnits: 3,
          reminder: true,
          revision: actual.cells[0].revision,
        });
        await writeFile(
          resolve(db.evidence, "response-loss-readback.json"),
          JSON.stringify({
            fakeFixture: true,
            responseAbortedAfterCommit: true,
            snapshot: actual,
          }),
        );
      } finally {
        gate.restore();
      }
    },
  );
  await t.test(
    "abort before lock plus reconcile does not cancel a late server commit",
    async () => {
      const e = await api.create(),
        k = api.key(e);
      const lockGate = pauseMethod(employment, "lockEmployees");
      const commitGate = pauseMethod(service, "write", true);
      const controller = new AbortController();
      const pending = api.post(
        api.intent(e, [k], {
          type: "patch-cell",
          patch: { value: number(2), reminder: true },
        }),
        { signal: controller.signal },
      );
      try {
        await lockGate.entered;
        controller.abort();
        await assert.rejects(pending, (error) => error.name === "AbortError");
        assert.equal(
          (await api.reconcile([k], [], { actor: 1 })).cells[0].revision,
          "0",
        );
        lockGate.release();
        await commitGate.entered;
        const current = await api.reconcile([k], [], { actor: 1 });
        assert.deepEqual(current.cells[0].value, number(2));
        assert.equal(current.cells[0].reminder, true);
        assert.notEqual(current.cells[0].revision, "0");
      } finally {
        lockGate.restore();
        commitGate.restore();
      }
    },
  );
  await t.test(
    "password reset commits before delayed mutation authorization and prevents stale session write",
    async () => {
      // Isolated pair keeps the primary fixture accounts available for logout race.
      const resetDb = await attendanceSandbox();
      let resetFixture;
      try {
        await migrate(resetDb);
        resetFixture = await fixture(resetDb);
        const resetApi = attendanceClient(resetFixture);
        const e = await resetApi.create(),
          k = resetApi.key(e);
        const gate = pauseMethod(authorizer, "authorizeMutation");
        const pending = resetApi.post(
          resetApi.intent(e, [k], {
            type: "patch-cell",
            patch: { value: number(1.5), reminder: true },
          }),
        );
        try {
          await gate.entered;
          await resetPassword(
            resetFixture.database,
            "fixture-one",
            randomBytes(24).toString("base64url"),
          );
          gate.release();
          assert.equal((await pending).status, 401);
          assert.equal(
            (await resetApi.reconcile([k], [], { actor: 1 })).cells[0].revision,
            "0",
          );
        } finally {
          gate.restore();
          await pending;
        }
      } finally {
        if (resetFixture) await resetFixture.close();
        await resetDb.pool.end();
      }
    },
  );
  await t.test(
    "session revocation fences attendance mutation in both lock orders",
    async () => {
      const e = await api.create(),
        k = api.key(e);
      let gate = pauseMethod(authorizer, "authorizeMutation");
      let pending = api.post(
        api.intent(e, [k], { type: "set-reminder", reminder: true }),
      );
      try {
        await gate.entered;
        const revoked = await f.request("/auth/logout", {
          method: "POST",
          body: {},
          app: 1,
        });
        assert.equal(revoked.status, 204);
        gate.release();
        assert.equal((await pending).status, 401);
        assert.equal(
          (await api.reconcile([k], [], { actor: 1 })).cells[0].revision,
          "0",
        );
      } finally {
        gate.restore();
        await pending;
      }
      // Other account, guarded request on app0; logout app1 must wait on User.
      gate = pauseMethod(authorizer, "authorizeMutation", true);
      pending = api.post(
        api.intent(e, [k], { type: "set-reminder", reminder: true }),
        { actor: 1, app: 0 },
      );
      try {
        const [tx] = await gate.entered;
        const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() pid`;
        const revoke = f.request("/auth/logout", {
          method: "POST",
          body: {},
          actor: 1,
          app: 1,
        });
        await blockedBy(db.pool, pid);
        gate.release();
        assert.equal((await pending).status, 200);
        assert.equal((await revoke).status, 204);
        const {
          rows: [sql],
        } = await db.pool.query(
          'SELECT reminder FROM "AttendanceCell" WHERE "employeeId"=$1',
          [e.id],
        );
        assert.equal(sql.reminder, true);
        assert.equal(
          (
            await api.post(
              api.intent(e, [k], { type: "set-reminder", reminder: false }),
              { actor: 1 },
            )
          ).status,
          401,
        );
        const denied = await f.request("/attendance/reconcile", {
          method: "POST",
          body: { employeeIds: [e.id], cells: [] },
          actor: 1,
        });
        assert.equal(denied.status, 401);
        assert.equal("employees" in (await denied.json()), false);
      } finally {
        gate.restore();
        await pending;
      }
    },
  );
}
