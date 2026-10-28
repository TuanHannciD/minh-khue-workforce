/** Task4: one owned PostgreSQL DB, auth baseline upgrade, real HTTP and SQL.
 * Shared fixtures stay sequential; barriers control order without scheduling sleeps.
 * Tests below: auth/shape, membership, protection, no-op CAS, snapshot read, DB constraints.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../dist/bootstrap.js";
import { Database } from "../dist/infrastructure/db/database.js";
import { provisionAccounts } from "../dist/modules/auth/auth-operations.js";
import { SessionAuthorizer } from "../dist/modules/auth/index.js";
import { employeeSandbox, migrate, root } from "./employees-sandbox.mjs";

const origin = "http://127.0.0.1:5173";
const digest = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("employees PostgreSQL integration", async (t) => {
  const db = await employeeSandbox();
  const database = new Database(db.connectionString);
  const apps = [];
  const accounts = ["fixture-one", "fixture-two"].map((username) => ({
    username,
    password: randomBytes(24).toString("base64url"),
  }));
  const cookies = [];
  let service, consistency;
  const request = async (
    path,
    { method = "GET", body, actor = 0, headers = {}, app = 0 } = {},
  ) =>
    fetch(`${await apps[app].getUrl()}/api/v1${path}`, {
      method,
      headers: {
        ...(method === "GET"
          ? {}
          : { origin, "content-type": "application/json" }),
        ...(cookies[actor] ? { cookie: cookies[actor] } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (body, actor = 0) => {
    const r = await request("/employees", { method: "POST", body, actor });
    assert.equal(r.status, 201);
    return r.json();
  };
  const patch = (employee, body, extra = {}) =>
    request(`/employees/${employee.id}`, {
      method: "PATCH",
      body: { expectedRevision: employee.revision, ...body },
      ...extra,
    });
  const rows = async () =>
    (
      await db.pool.query(
        'SELECT * FROM "AttendanceCell" ORDER BY "employeeId", date, kind',
      )
    ).rows;
  try {
    await db.pool.query(
      await readFile(
        resolve(
          root,
          "apps/api/prisma/migrations/202610280001_auth/migration.sql",
        ),
        "utf8",
      ),
    );
    await migrate(db, ["migrate", "resolve", "--applied", "202610280001_auth"]);
    await provisionAccounts(database, accounts);
    for (let i = 0; i < 2; i++) {
      const app = await createApp(origin, {
        databaseUrl: db.connectionString,
        throttleSecret: randomBytes(32).toString("hex"),
      });
      apps.push(app);
      await app.listen(0, "127.0.0.1");
      const r = await request("/auth/login", {
        method: "POST",
        body: accounts[i],
        app: i,
      });
      assert.equal(r.status, 200);
      cookies.push(r.headers.get("set-cookie").split(";")[0]);
    }
    await t.test(
      "auth_to_employees_migration_preserves_two_accounts_and_sessions",
      async () => {
        const before = digest(
          (await db.pool.query('SELECT * FROM "User" ORDER BY id')).rows,
        );
        const sessions = digest(
          (await db.pool.query('SELECT * FROM "Session" ORDER BY id')).rows,
        );
        await migrate(db);
        assert.equal(
          digest(
            (await db.pool.query('SELECT * FROM "User" ORDER BY id')).rows,
          ),
          before,
        );
        assert.equal(
          digest(
            (await db.pool.query('SELECT * FROM "Session" ORDER BY id')).rows,
          ),
          sessions,
        );
        assert.equal(
          (await db.pool.query('SELECT count(*)::int n FROM "User"')).rows[0].n,
          2,
        );
        await writeFile(
          resolve(db.evidence, "upgrade-readback.json"),
          JSON.stringify({ users: 2, sessions: 2, contentPreserved: true }),
        );
      },
    );
    await t.test(
      "anonymous employee routes are protected before lookup",
      async () => {
        for (const [path, method, body] of [
          ["/employees", "POST", { name: "Thử", startDate: "2026-10-15" }],
          [
            `/employees/${randomUUID()}`,
            "PATCH",
            { expectedRevision: randomUUID(), name: "Thử" },
          ],
        ]) {
          const r = await request(path, { method, body, actor: 9 });
          assert.equal(r.status, 401);
          assert.equal(r.headers.get("cache-control"), "no-store");
        }
      },
    );
    // Load new Task4 public consumers only after the baseline HTTP RED assertion.
    const employees = await import("../dist/modules/employees/index.js");
    service = apps[0].get(employees.EmployeesService);
    consistency = apps[0].get(employees.EmploymentConsistency);
    await t.test("month_membership_uses_interval_intersection", async () => {
      const first = await create({
        name: " Trùng tên ",
        startDate: "2026-10-15",
        endDate: "2026-10-20",
      });
      const second = await create(
        { name: "Trùng tên", startDate: "2026-10-15" },
        1,
      );
      assert.notEqual(first.id, second.id);
      assert.equal(first.name, "Trùng tên");
      assert.equal(second.endDate, null);
      const october = await service.listForMonth("2026-10");
      assert.equal(october.filter((e) => e.name === "Trùng tên").length, 2);
      assert.equal(
        (await service.listForMonth("2026-09")).some((e) => e.id === first.id),
        false,
      );
      const changed = await patch(
        second,
        { endDate: "2026-10-20" },
        { actor: 1, app: 1 },
      );
      assert.equal(changed.status, 200);
      assert.equal(
        (await service.listForMonth("2026-11")).some((e) =>
          [first.id, second.id].includes(e.id),
        ),
        false,
      );
      const { employmentState } =
        await import("../dist/modules/employees/index.js");
      for (const [date, state] of [
        ["2026-10-14", "before-start"],
        ["2026-10-15", "editable"],
        ["2026-10-20", "editable"],
        ["2026-10-21", "after-end"],
      ])
        assert.equal(employmentState(first, date), state);
    });
    await t.test(
      "shape_missing_null_dates_unicode_and_empty_patch_follow_contract",
      async () => {
        for (const body of [
          { name: null, startDate: "2026-10-15" },
          { name: "Thử", startDate: null },
          { name: "Thử" },
          { name: "Thử", startDate: "2026-10-15", extra: true },
        ])
          assert.equal(
            (await request("/employees", { method: "POST", body })).status,
            400,
          );
        for (const body of [
          { name: "  ", startDate: "2026-10-15" },
          { name: "😀".repeat(201), startDate: "2026-10-15" },
          { name: "Thử", startDate: "2026-02-29" },
          { name: "Thử", startDate: "2026-10-21", endDate: "2026-10-20" },
          { name: "Thử", startDate: "0000-01-01" },
        ])
          assert.equal(
            (await request("/employees", { method: "POST", body })).status,
            422,
          );
        const e = await create({
          name: "😀".repeat(200),
          startDate: "2024-02-29",
          endDate: "2026-10-20",
        });
        const empty = await patch(e, {});
        assert.equal(empty.status, 400);
        assert.equal((await empty.json()).error.code, "EMPTY_PATCH");
        for (const field of ["name", "startDate"])
          assert.equal((await patch(e, { [field]: null })).status, 400);
        const changed = await patch(e, { name: "Đổi tên" });
        assert.equal(changed.status, 200);
        const current = await changed.json();
        assert.equal(current.endDate, e.endDate);
        assert.equal(current.startDate, e.startDate);
        const cleared = await patch(current, { endDate: null });
        assert.equal(cleared.status, 200);
        assert.equal((await cleared.json()).endDate, null);
        assert.equal(
          (
            await request(`/employees/${randomUUID()}`, {
              method: "PATCH",
              body: { expectedRevision: randomUUID(), name: "Vắng" },
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await patch(
              e,
              { name: "CSRF" },
              { headers: { origin: "http://invalid.test" } },
            )
          ).status,
          403,
        );
      },
    );
    await t.test("employment_change_preserves_all_months", async () => {
      const e = await create({
        name: "Bảo vệ xuyên tháng",
        startDate: "2024-01-01",
      });
      const fixtures = [
        ["2024-02-29", "work", "number", 3, false],
        ["2025-03-01", "work", "absence", null, false],
        ["2026-11-30", "overtime", "number", 48, true],
        ["2027-01-01", "work", "empty", null, true],
        ["2027-02-01", "overtime", "empty", null, true],
      ];
      for (const [date, kind, valueType, halfUnits, reminder] of fixtures)
        await db.pool.query(
          'INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",reminder,revision) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [e.id, date, kind, valueType, halfUnits, reminder, randomUUID()],
        );
      const before = digest(await rows());
      const total = (
        await db.pool.query(
          'SELECT sum("halfUnits")::int total FROM "AttendanceCell" WHERE "employeeId"=$1',
          [e.id],
        )
      ).rows[0].total;
      const r = await patch(e, {
        name: "Không được đổi một phần",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      });
      assert.equal(r.status, 422);
      const error = (await r.json()).error;
      assert.equal(error.code, "EMPLOYMENT_DATA_OUTSIDE_INTERVAL");
      assert.deepEqual(
        error.details.cells,
        fixtures.map(([date, kind]) => ({ employeeId: e.id, date, kind })),
      );
      assert.equal(digest(await rows()), before);
      assert.equal(
        (
          await db.pool.query(
            'SELECT sum("halfUnits")::int total FROM "AttendanceCell" WHERE "employeeId"=$1',
            [e.id],
          )
        ).rows[0].total,
        total,
      );
      assert.deepEqual(
        await database.client.$transaction((tx) =>
          consistency.readByIds(tx, [e.id]),
        ),
        [e],
      );
      const inclusive = await patch(e, {
        startDate: fixtures[0][0],
        endDate: fixtures.at(-1)[0],
      });
      assert.equal(inclusive.status, 200);
    });
    await t.test(
      "employee_accepted_noop_fences_delayed_patch_both_orders_all_fields",
      async () => {
        const { credential } = await apps[0]
          .get((await import("../dist/modules/auth/index.js")).AuthService)
          .requireSession({
            cookies: { mkw_session: cookies[0].slice("mkw_session=".length) },
          });
        for (const field of ["name", "startDate", "endDate"])
          for (const first of ["B", "A"]) {
            const e = await create({
              name: `Fence ${field} ${first}`,
              startDate: "2026-10-15",
              endDate: "2026-10-20",
            });
            const reached = deferred(),
              release = deferred();
            const original = consistency.lockEmployees.bind(consistency);
            let intercept = true;
            consistency.lockEmployees = async (...args) => {
              if (intercept) {
                intercept = false;
                reached.resolve();
                await release.promise;
              }
              return original(...args);
            };
            const change = {
              name: "A đổi",
              startDate: "2026-10-16",
              endDate: "2026-10-19",
            };
            const a = service
              .updateEmployment(
                e.id,
                { expectedRevision: e.revision, [field]: change[field] },
                credential,
              )
              .then(
                (value) => ({ status: 200, value }),
                (error) => ({ status: error.getStatus() }),
              );
            await reached.promise;
            const snapshot = await database.client.$transaction((tx) =>
              consistency.readByIds(tx, [e.id]),
            );
            assert.equal(snapshot[0].revision, e.revision);
            if (first === "B") {
              const b = await patch(
                e,
                { [field]: e[field] },
                { actor: 1, app: 1 },
              );
              assert.equal(b.status, 200);
              const accepted = await b.json();
              assert.notEqual(accepted.revision, e.revision);
              release.resolve();
              assert.equal((await a).status, 409);
              assert.deepEqual(
                await database.client.$transaction((tx) =>
                  consistency.readByIds(tx, [e.id]),
                ),
                [accepted],
              );
            } else {
              release.resolve();
              assert.equal((await a).status, 200);
              const b = await patch(
                e,
                { [field]: change[field] },
                { actor: 1, app: 1 },
              );
              assert.equal(b.status, 409);
              assert.equal((await b.json()).error.code, "EMPLOYEE_CONFLICT");
            }
            consistency.lockEmployees = original;
          }
      },
    );
    await t.test(
      "read_by_ids_survives_month_exit_retains_tombstone_and_repeatable_snapshot_without_write_lock",
      async () => {
        const e = await create({
          name: "Ra khỏi tháng",
          startDate: "2026-10-15",
        });
        const revision = randomUUID();
        await db.pool.query(
          'INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType",revision) VALUES ($1,$2,$3,$4,$5)',
          [e.id, "2026-10-19", "work", "empty", revision],
        );
        const connection = await db.pool.connect();
        try {
          await connection.query("BEGIN");
          await connection.query(
            'SELECT id FROM "Employee" WHERE id=$1 FOR UPDATE',
            [e.id],
          );
          // readByIds must complete while another connection owns the write lock.
          const before = await database.client.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL statement_timeout='1000ms'`;
            return consistency.readByIds(tx, [e.id, randomUUID()]);
          });
          assert.deepEqual(before, [e]);
          await connection.query("ROLLBACK");
        } finally {
          connection.release();
        }
        await database.client.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            assert.deepEqual(await consistency.readByIds(tx, [e.id]), [e]);
            const r = await patch(e, { startDate: "2026-11-01" });
            assert.equal(r.status, 200);
            const changed = await r.json();
            assert.notEqual(changed.revision, e.revision);
            assert.deepEqual(await consistency.readByIds(tx, [e.id]), [e]);
          },
          { isolationLevel: "RepeatableRead" },
        );
        assert.equal(
          (await service.listForMonth("2026-10")).some((x) => x.id === e.id),
          false,
        );
        const after = await database.client.$transaction((tx) =>
          consistency.readByIds(tx, [e.id]),
        );
        assert.equal(after[0].startDate, "2026-11-01");
        assert.notEqual(after[0].revision, e.revision);
        assert.equal(
          (
            await db.pool.query(
              'SELECT revision FROM "AttendanceCell" WHERE "employeeId"=$1',
              [e.id],
            )
          ).rows[0].revision,
          revision,
        );
      },
    );
    await t.test(
      "real_mutation_authorizer_rechecks_revocation_and_User_lock_precedes_Employee",
      async () => {
        const e = await create({
          name: "Kiểm phiên trong transaction",
          startDate: "2026-10-01",
        });
        const authorizer = apps[0].get(SessionAuthorizer);
        const original = authorizer.authorizeMutation.bind(authorizer);
        const reached = deferred(),
          release = deferred();
        authorizer.authorizeMutation = async (...args) => {
          reached.resolve();
          await release.promise;
          return original(...args);
        };
        const pending = patch(e, { name: "Không được lưu" });
        await reached.promise;
        await db.pool.query(
          'UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE "tokenHash"=$1',
          [
            createHash("sha256")
              .update(cookies[0].slice("mkw_session=".length))
              .digest(),
          ],
        );
        release.resolve();
        assert.equal((await pending).status, 401);
        authorizer.authorizeMutation = original;
        assert.deepEqual(
          await database.client.$transaction((tx) =>
            consistency.readByIds(tx, [e.id]),
          ),
          [e],
        );
        const login = await request("/auth/login", {
          method: "POST",
          body: accounts[0],
        });
        cookies[0] = login.headers.get("set-cookie").split(";")[0];
        const barrier = await db.pool.connect();
        try {
          await barrier.query("BEGIN");
          await barrier.query(
            'SELECT id FROM "User" WHERE username=$1 FOR UPDATE',
            [accounts[0].username],
          );
          const write = patch(e, { name: "Sau User lock" });
          const deadline = performance.now() + 10000;
          let waiting = false;
          while (performance.now() < deadline) {
            const q = await db.pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%FROM \"User\"%FOR SHARE%'",
              [db.target.database],
            );
            if (q.rowCount) {
              waiting = true;
              break;
            }
          }
          assert.equal(waiting, true);
          await barrier.query(
            'SELECT id FROM "Employee" WHERE id=$1 FOR UPDATE NOWAIT',
            [e.id],
          );
          await barrier.query("COMMIT");
          assert.equal((await write).status, 200);
        } finally {
          await barrier.query("ROLLBACK");
          barrier.release();
        }
      },
    );
    await t.test(
      "minimal_cell_schema_constraints_and_no_attendance_mutation_route",
      async () => {
        const e = await create({ name: "Constraint", startDate: "2026-10-01" });
        for (const [kind, type, half] of [
          ["overtime", "absence", null],
          ["work", "number", 0],
          ["work", "number", 61],
          ["overtime", "number", 49],
          ["work", "empty", 1],
        ]) {
          await assert.rejects(
            db.pool.query(
              'INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",revision) VALUES ($1,$2,$3,$4,$5,$6)',
              [e.id, "2026-10-01", kind, type, half, randomUUID()],
            ),
          );
        }
        assert.equal(
          (await request("/attendance/changes", { method: "POST", body: {} }))
            .status,
          404,
        );
        const reload = new Database(db.connectionString);
        try {
          const { EmployeesService } =
            await import("../dist/modules/employees/index.js");
          assert.ok(EmployeesService);
          assert.equal(
            (await reload.client.employee.findUnique({ where: { id: e.id } }))
              .name,
            e.name,
          );
        } finally {
          await reload.onModuleDestroy();
        }
        await writeFile(
          resolve(db.evidence, "independent-readback.json"),
          JSON.stringify({
            employees: (
              await db.pool.query('SELECT count(*)::int n FROM "Employee"')
            ).rows[0].n,
            cells: (await rows()).length,
            verified: [
              "separate SQL pool",
              "new Prisma client",
              "all-month content and half-unit totals preserved",
            ],
          }),
        );
      },
    );
  } finally {
    for (const app of apps) await app.close();
    await database.onModuleDestroy();
    await db.pool.end();
  }
});
