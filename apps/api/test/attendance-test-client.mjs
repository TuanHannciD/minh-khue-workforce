import assert from "node:assert/strict";
import { deferred } from "./attendance-sandbox.mjs";

export function attendanceClient(f) {
  const { request } = f;
  return {
    async create(extra = {}) {
      const r = await request("/employees", {
        method: "POST",
        body: {
          name: "Nhân sự cạnh tranh giả",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          ...extra,
        },
      });
      assert.equal(r.status, 201);
      return r.json();
    },
    key(e, date = "2026-10-20", kind = "work", expectedRevision = "0") {
      return { employeeId: e.id, date, kind, expectedRevision };
    },
    intent(e, targets, operation, extra = {}) {
      return {
        month: targets[0].date.slice(0, 7),
        expectedEmployees: [{ employeeId: e.id, expectedRevision: e.revision }],
        targets,
        operation,
        ...extra,
      };
    },
    post(input, extra = {}) {
      return request("/attendance/changes", {
        method: "POST",
        body: input,
        ...extra,
      });
    },
    async saved(input, extra = {}) {
      const r = await this.post(input, extra);
      assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      return r.json();
    },
    patch(e, fields, extra = {}) {
      return request(`/employees/${e.id}`, {
        method: "PATCH",
        body: { expectedRevision: e.revision, ...fields },
        ...extra,
      });
    },
    async reconcile(keys, employeeIds = [], extra = {}) {
      const r = await request("/attendance/reconcile", {
        method: "POST",
        body: {
          employeeIds,
          cells: keys.map(({ employeeId, date, kind }) => ({
            employeeId,
            date,
            kind,
          })),
        },
        ...extra,
      });
      assert.equal(r.status, 200);
      return r.json();
    },
  };
}
// Test-only barrier preserves the actual DB operation/transaction and controls
// one request on one app. Other app/connection continues through production SQL.
export function pauseMethod(object, method, after = false) {
  const entered = deferred(),
    release = deferred();
  const original = object[method];
  let armed = true;
  object[method] = async function (...args) {
    if (!armed) return original.apply(this, args);
    armed = false;
    const result = after ? await original.apply(this, args) : undefined;
    entered.resolve(args);
    await release.promise;
    return after ? result : original.apply(this, args);
  };
  return {
    entered: Promise.race([
      entered.promise,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Barrier ${method} was never reached`)),
          4000,
        );
        timer.unref();
      }),
    ]),
    release: release.resolve,
    restore() {
      release.resolve();
      object[method] = original;
    },
  };
}
export async function blockedBy(pool, pid) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1::int = ANY(pg_blocking_pids(pid))",
      [pid],
    );
    if (rows.length) return rows[0].pid;
    await new Promise(setImmediate);
  }
  assert.fail(
    "Second PostgreSQL connection must reach the actual row-lock barrier",
  );
}
