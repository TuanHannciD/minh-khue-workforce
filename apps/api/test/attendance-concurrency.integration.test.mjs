/** File map — two real Nest instances/PG connections, never scheduling sleeps.
 * Entry: parent test owns the fixture; attendanceClient/pauseMethod/blockedBy
 * live in attendance-test-client; registerRaces in attendance-races continues
 * the same sequential fixture for employment/snapshot/session cases.
 * - absent CAS and accepted no-op (both orders, all stored states)
 * - source/skip/zero eligible/read do not fence
 * - DB rollback and employee conflict/source metadata, sorted employee locks.
 * Kept together: all fence cases depend on exact before/after revisions and a
 * single owned fixture; other race responsibilities are split into registerRaces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceSandbox, migrate, fixture } from "./attendance-sandbox.mjs";
import {
  attendanceClient,
  pauseMethod,
  blockedBy,
} from "./attendance-test-client.mjs";
import { EmploymentConsistency } from "../dist/modules/employees/index.js";
import { SessionAuthorizer } from "../dist/modules/auth/index.js";
import { AttendanceService } from "../dist/modules/attendance/index.js";
import { AttendanceRepository } from "../dist/modules/attendance/attendance.repository.js";

import { registerRaces } from "./attendance-races.mjs";

test("attendance deterministic PostgreSQL concurrency", async (t) => {
  const db = await attendanceSandbox();
  let f;
  try {
    await migrate(db);
    f = await fixture(db);
    const api = attendanceClient(f);
    const employment = EmploymentConsistency.prototype;
    const authorizer = SessionAuthorizer.prototype;
    const service = f.apps[0].get(AttendanceService);
    const repository = f.apps[0].get(AttendanceRepository);
    const rows = async () =>
      (
        await db.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows;
    const number = (value) => ({ type: "number", value });
    await t.test(
      "empty_cell_revision_prevents_lost_create under an observed PostgreSQL row lock",
      async () => {
        const e = await api.create(),
          k = api.key(e);
        const gate = pauseMethod(employment, "lockEmployees", true);
        const a = api.post(
          api.intent(e, [k], {
            type: "set-value",
            value: number(1.5),
            mode: "replace",
          }),
        );
        try {
          const [tx] = await gate.entered;
          const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() pid`;
          const b = api.post(
            api.intent(e, [k], {
              type: "set-value",
              value: number(2),
              mode: "replace",
            }),
            { actor: 1 },
          );
          await blockedBy(db.pool, pid);
          gate.release();
          assert.equal((await a).status, 200);
          assert.equal((await b).status, 409);
          const result = await api.reconcile([k]);
          assert.deepEqual(result.cells[0].value, number(1.5));
        } finally {
          gate.restore();
          await a;
        }
      },
    );
    for (const [label, initial] of [
      ["number", { value: number(1), reminder: false }],
      ["F", { value: { type: "absence" }, reminder: true }],
      ["reminder-only", { value: null, reminder: true }],
      ["absent-clear", undefined],
      ["tombstone", { value: null, reminder: false }],
    ])
      for (const order of ["new-first", "old-first"])
        await t.test(
          `accepted_noop_fences_delayed_cell_write ${label} ${order}`,
          async () => {
            const e = await api.create();
            let k = api.key(e);
            if (initial) {
              const seeded = await api.saved(
                api.intent(e, [k], { type: "patch-cell", patch: initial }),
              );
              k.expectedRevision = seeded.cells[0].revision;
            }
            const keep = initial ?? { value: null, reminder: false };
            const other = api.key(e, "2026-10-21");
            const beforeOther = (await api.reconcile([other])).cells[0];
            const gate = pauseMethod(employment, "lockEmployees");
            const delayedIntent =
              order === "new-first"
                ? api.intent(e, [k, other], {
                    type: "set-value",
                    value: number(2),
                    mode: "replace",
                  })
                : api.intent(e, [k], { type: "patch-cell", patch: keep });
            const delayed = api.post(delayedIntent);
            try {
              await gate.entered;
              const baseline = (await api.reconcile([k], [], { actor: 1 }))
                .cells[0];
              assert.equal(baseline.revision, k.expectedRevision);
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
              assert.equal(
                winner.counts.changed,
                order === "new-first" ? 0 : 1,
              );
              assert.equal(winner.counts.eligible, 1);
              assert.notEqual(winner.cells[0].revision, k.expectedRevision);
              assert.notEqual(winner.cells[0].revision, "0");
              gate.release();
              assert.equal((await delayed).status, 409);
              const current = await api.reconcile([k, other]);
              assert.deepEqual(
                current.cells.find((c) => c.date === k.date),
                winner.cells[0],
              );
              assert.deepEqual(
                current.cells.find((c) => c.date === other.date),
                beforeOther,
              );
            } finally {
              gate.restore();
              await delayed;
            }
          },
        );
    await t.test(
      "read/reconcile and a rejected zero-eligible intent do not cancel a delayed write",
      async () => {
        const e = await api.create({
          startDate: "2026-10-15",
          endDate: "2026-10-20",
        });
        let k = api.key(e);
        const seed = await api.saved(
          api.intent(e, [k], {
            type: "set-value",
            value: number(1),
            mode: "replace",
          }),
        );
        k.expectedRevision = seed.cells[0].revision;
        const skipped = api.key(e, "2026-10-14");
        const gate = pauseMethod(employment, "lockEmployees");
        const delayed = api.post(
          api.intent(e, [k], {
            type: "set-value",
            value: number(2),
            mode: "replace",
          }),
        );
        try {
          await gate.entered;
          const before = await rows();
          await api.reconcile([k, skipped], [], { actor: 1 });
          const month = await f.request("/attendance/month?month=2026-10", {
            actor: 1,
          });
          assert.equal(month.status, 200);
          const zero = await api.post(
            api.intent(e, [k, skipped], {
              type: "set-value",
              value: null,
              mode: "fill-empty",
            }),
            { actor: 1 },
          );
          assert.equal(zero.status, 422);
          assert.deepEqual(await rows(), before);
          gate.release();
          assert.equal((await delayed).status, 200);
          assert.deepEqual(
            (await api.reconcile([k])).cells[0].value,
            number(2),
          );
        } finally {
          gate.restore();
          await delayed;
        }
      },
    );
    await t.test(
      "eligible no-op fences only eligible cells; fill-empty occupied and N/— keep revisions",
      async () => {
        const e = await api.create({
          startDate: "2026-10-15",
          endDate: "2026-10-20",
        });
        const eligible = api.key(e, "2026-10-20"),
          occupied = api.key(e, "2026-10-19"),
          beforeStart = api.key(e, "2026-10-14"),
          afterEnd = api.key(e, "2026-10-21");
        const seed = await api.saved(
          api.intent(e, [occupied], {
            type: "patch-cell",
            patch: { value: { type: "absence" }, reminder: true },
          }),
        );
        occupied.expectedRevision = seed.cells[0].revision;
        const gate = pauseMethod(employment, "lockEmployees");
        const delayed = api.post(
          api.intent(e, [occupied], { type: "set-reminder", reminder: false }),
        );
        try {
          await gate.entered;
          const b = await api.saved(
            api.intent(e, [occupied, afterEnd, eligible, beforeStart], {
              type: "set-value",
              value: null,
              mode: "fill-empty",
            }),
            { actor: 1 },
          );
          assert.deepEqual(b.counts, {
            selected: 4,
            eligible: 1,
            skipped: 2,
            changed: 0,
          });
          assert.equal(
            b.cells.find((c) => c.date === occupied.date).revision,
            occupied.expectedRevision,
          );
          assert.equal(
            b.cells.find((c) => c.date === beforeStart.date).revision,
            "0",
          );
          assert.equal(
            b.cells.find((c) => c.date === afterEnd.date).revision,
            "0",
          );
          assert.notEqual(
            b.cells.find((c) => c.date === eligible.date).revision,
            "0",
          );
          gate.release();
          assert.equal((await delayed).status, 200);
          const patch = await api.patch(e, { name: e.name }, { actor: 1 });
          assert.equal(
            patch.status,
            200,
            "attendance does not fence Employee revision",
          );
        } finally {
          gate.restore();
          await delayed;
        }
      },
    );
    await t.test(
      "fill source read-only and source reminder CAS invalidates the entire fill",
      async () => {
        const e = await api.create();
        const src = api.key(e, "2026-10-19"),
          dest = api.key(e);
        const s = await api.saved(
          api.intent(e, [src], {
            type: "patch-cell",
            patch: { value: number(3.5), reminder: true },
          }),
        );
        src.expectedRevision = s.cells[0].revision;
        let gate = pauseMethod(employment, "lockEmployees");
        let delayed = api.post(
          api.intent(e, [src], { type: "set-reminder", reminder: false }),
        );
        try {
          await gate.entered;
          const b = await api.saved(
            api.intent(
              e,
              [dest],
              { type: "set-value", value: number(3.5), mode: "fill-empty" },
              { source: src },
            ),
            { actor: 1 },
          );
          assert.equal(b.counts.changed, 1);
          assert.deepEqual(
            (await api.reconcile([src], [], { actor: 1 })).cells[0],
            s.cells[0],
          );
          gate.release();
          assert.equal((await delayed).status, 200);
        } finally {
          gate.restore();
          await delayed;
        }
        const currentDest = (await api.reconcile([dest])).cells[0];
        dest.expectedRevision = currentDest.revision;
        const before = await rows();
        const stale = await api.post(
          api.intent(
            e,
            [dest],
            { type: "set-value", value: number(3.5), mode: "replace" },
            { source: src },
          ),
        );
        assert.equal(stale.status, 409);
        assert.equal((await stale.json()).error.details.sourceChanged, true);
        assert.deepEqual(await rows(), before);
        // A fresh source CAS is still permitted to commit after B read it.
      },
    );
    await t.test(
      "DB failure after first eligible no-op rolls back every revision and content",
      async () => {
        const e = await api.create(),
          a = api.key(e),
          b = api.key(e, "2026-10-21");
        const seed = await api.saved(
          api.intent(e, [a], { type: "set-reminder", reminder: false }),
        );
        a.expectedRevision = seed.cells[0].revision;
        const before = await rows(),
          original = repository.save;
        let calls = 0;
        repository.save = async function (...args) {
          await original.apply(this, args);
          if (++calls === 2)
            throw new Error("fixture failure after actual second SQL write");
        };
        try {
          const result = await api.post(
            api.intent(e, [b, a], {
              type: "set-value",
              value: null,
              mode: "replace",
            }),
          );
          assert.equal(result.status, 503);
          assert.equal(calls, 2);
          assert.deepEqual(await rows(), before);
          assert.equal((await api.reconcile([a, b])).cells[1].revision, "0");
        } finally {
          repository.save = original;
        }
      },
    );
    await t.test(
      "employee CAS conflict returns relevant target/source snapshots without revision changes",
      async () => {
        const e = await api.create(),
          src = api.key(e, "2026-10-19"),
          dest = api.key(e);
        const seed = await api.saved(
          api.intent(e, [src], {
            type: "set-value",
            value: number(1),
            mode: "replace",
          }),
        );
        src.expectedRevision = seed.cells[0].revision;
        const changed = await api.patch(e, { name: e.name });
        assert.equal(changed.status, 200);
        const employee = await changed.json();
        const before = await rows();
        const result = await api.post(
          api.intent(
            e,
            [dest],
            { type: "set-value", value: number(1), mode: "replace" },
            { source: src },
          ),
        );
        assert.equal(result.status, 409);
        const error = await result.json();
        assert.deepEqual(error.error.details.employees, [employee]);
        assert.deepEqual(
          error.error.details.cells.map((c) => c.date),
          ["2026-10-19", "2026-10-20"],
        );
        assert.equal(error.error.details.sourceChanged, true);
        assert.deepEqual(await rows(), before);
      },
    );
    await t.test(
      "reverse employee target/source input uses sorted row locks on two connections",
      async () => {
        const one = await api.create(),
          two = await api.create();
        const [low, high] = [one, two].sort((a, b) => a.id.localeCompare(b.id));
        const lower = api.key(low),
          higher = api.key(high);
        const expectedEmployees = [high, low].map((e) => ({
          employeeId: e.id,
          expectedRevision: e.revision,
        }));
        const gate = pauseMethod(employment, "lockEmployees", true);
        const a = api.post(
          api.intent(
            high,
            [higher, lower],
            { type: "set-value", value: number(1), mode: "replace" },
            { expectedEmployees },
          ),
        );
        try {
          const [tx, ids] = await gate.entered;
          assert.deepEqual(ids, [low.id, high.id]);
          const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() pid`;
          const b = api.post(
            api.intent(
              low,
              [lower, higher],
              { type: "set-value", value: number(2), mode: "replace" },
              { expectedEmployees: [...expectedEmployees].reverse() },
            ),
            { actor: 1 },
          );
          await blockedBy(db.pool, pid);
          gate.release();
          assert.equal((await a).status, 200);
          assert.equal((await b).status, 409);
          assert.deepEqual(
            (await api.reconcile([higher, lower])).cells.map((c) => c.value),
            [number(1), number(1)],
          );
        } finally {
          gate.restore();
          await a;
        }
      },
    );
    await registerRaces(t, {
      db,
      f,
      api,
      employment,
      authorizer,
      service,
      repository,
      number,
    });
  } finally {
    if (f) await f.close();
    await db.pool.end();
  }
});
