/** File map — parent test owns a fresh DB/two sessions and sequential subtests.
 * - create/key/body/post/saved: real HTTP fixtures and explicit CAS baselines.
 * - reconcile/allRows: authenticated snapshot and independent SQL assertions.
 * - Subtests: full month56 fixture, atomic patch, batch rollback, fill counts,
 *   strict input/auth, explicit IDs outside month and clear/recreate readback.
 * Keep shared fixtures together to preserve ownership/cleanup and avoid drift
 * between each operation's before/after state. No UI acceptance claim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  attendanceSandbox,
  migrate,
  fixture,
  root,
  origin,
} from "./attendance-sandbox.mjs";
import { Database } from "../dist/infrastructure/db/database.js";

test("attendance HTTP/PostgreSQL integration", async (t) => {
  const db = await attendanceSandbox();
  let f;
  try {
    await migrate(db);
    f = await fixture(db);
    const { request } = f;
    const create = async (extra = {}) => {
      const r = await request("/employees", {
        method: "POST",
        body: {
          name: "Nhân sự giả",
          startDate: "2026-02-02",
          endDate: "2026-02-03",
          ...extra,
        },
      });
      assert.equal(r.status, 201);
      return r.json();
    };
    const key = (
      e,
      date = "2026-02-02",
      kind = "work",
      expectedRevision = "0",
    ) => ({ employeeId: e.id, date, kind, expectedRevision });
    const body = (e, targets, operation, extra = {}) => ({
      month: "2026-02",
      expectedEmployees: [{ employeeId: e.id, expectedRevision: e.revision }],
      targets,
      operation,
      ...extra,
    });
    const post = (input, extra = {}) =>
      request("/attendance/changes", { method: "POST", body: input, ...extra });
    const saved = async (input, extra) => {
      const r = await post(input, extra);
      assert.equal(r.status, 200);
      return r.json();
    };
    const reconcile = async (employeeIds, cells) => {
      const r = await request("/attendance/reconcile", {
        method: "POST",
        body: {
          employeeIds,
          cells: cells.map(({ employeeId, date, kind }) => ({
            employeeId,
            date,
            kind,
          })),
        },
      });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "no-store");
      return r.json();
    };
    const allRows = async () =>
      (
        await db.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId", date, kind',
        )
      ).rows;
    await t.test(
      "real attendance endpoints require authentication before lookup",
      async () => {
        for (const [path, method, input] of [
          ["/attendance/month?month=2026-02", "GET"],
          [
            "/attendance/reconcile",
            "POST",
            { employeeIds: [randomUUID()], cells: [] },
          ],
          ["/attendance/changes", "POST", {}],
        ]) {
          const r = await request(path, { method, body: input, actor: 9 });
          assert.equal(r.status, 401);
          assert.equal(r.headers.get("cache-control"), "no-store");
          assert.equal("employees" in (await r.json()), false);
        }
      },
    );
    await t.test(
      "full G1 month28 fixture matches 56 cells, metadata, states and totals",
      async () => {
        const source = await readFile(
          resolve(root, "docs/tasks/MKW-PRODUCT-001/technical/api-contract.md"),
          "utf8",
        );
        const examples = [
          ...source.matchAll(/```json\s*\n([\s\S]*?)\n```/g),
        ].map((m) => JSON.parse(m[1]));
        const expected = examples.find(
          (x) => x.month === "2026-02" && x.fetchedAt,
        );
        assert.equal(expected.cells.length, 56);
        const e = expected.employees[0];
        await db.pool.query(
          'INSERT INTO "Employee" (id,name,"startDate","endDate",revision) VALUES ($1,$2,$3,$4,$5)',
          [e.id, e.name, e.startDate, e.endDate, e.revision],
        );
        for (const c of expected.cells.filter((c) => c.revision !== "0"))
          await db.pool.query(
            'INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",reminder,revision) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [
              c.employeeId,
              c.date,
              c.kind,
              c.value?.type ?? "empty",
              c.value?.type === "number" ? c.value.value * 2 : null,
              c.reminder,
              c.revision,
            ],
          );
        const r = await request("/attendance/month?month=2026-02");
        assert.equal(r.status, 200);
        const actual = await r.json();
        assert.ok(Number.isFinite(Date.parse(actual.fetchedAt)));
        assert.deepEqual(
          { ...actual, fetchedAt: expected.fetchedAt },
          expected,
        );
        const reconciled = await reconcile([e.id], expected.cells);
        assert.ok(Number.isFinite(Date.parse(reconciled.fetchedAt)));
        assert.deepEqual(
          { ...reconciled, fetchedAt: actual.fetchedAt },
          {
            fetchedAt: actual.fetchedAt,
            employees: expected.employees,
            cells: expected.cells,
            missingEmployeeIds: [],
          },
        );
      },
    );
    await t.test(
      "single_cell_patch_is_atomic and missing/null fields preserve the other field",
      async () => {
        const e = await create();
        let target = key(e);
        let result = await saved(
          body(e, [target], {
            type: "patch-cell",
            patch: { value: { type: "number", value: 1.5 }, reminder: true },
          }),
        );
        assert.deepEqual(result.counts, {
          selected: 1,
          eligible: 1,
          skipped: 0,
          changed: 1,
        });
        assert.deepEqual(result.cells[0].value, { type: "number", value: 1.5 });
        assert.equal(result.cells[0].reminder, true);
        assert.equal(result.employees[0].revision, e.revision);
        target.expectedRevision = result.cells[0].revision;
        const before = await allRows();
        assert.equal(
          (
            await post(
              body(e, [target], {
                type: "patch-cell",
                patch: {
                  value: { type: "number", value: 3.25 },
                  reminder: false,
                },
              }),
            )
          ).status,
          422,
        );
        assert.deepEqual(await allRows(), before);
        const stale = await post(
          body(e, [key(e)], {
            type: "patch-cell",
            patch: { value: null, reminder: false },
          }),
        );
        assert.equal(stale.status, 409);
        assert.deepEqual(await allRows(), before);
        result = await saved(
          body(e, [target], { type: "patch-cell", patch: { value: null } }),
        );
        assert.equal(result.cells[0].reminder, true);
        assert.equal(result.cells[0].value, null);
        target.expectedRevision = result.cells[0].revision;
        result = await saved(
          body(e, [target], { type: "patch-cell", patch: { reminder: false } }),
        );
        assert.equal(result.cells[0].value, null);
        assert.equal(result.cells[0].reminder, false);
        assert.notEqual(result.cells[0].revision, target.expectedRevision);
      },
    );
    await t.test(
      "batch conflicts rollback every target including revisions and fill-empty stale occupied targets",
      async () => {
        const e = await create();
        const first = key(e),
          second = key(e, "2026-02-03");
        const a = await saved(
          body(e, [first], {
            type: "set-value",
            value: { type: "number", value: 1 },
            mode: "replace",
          }),
        );
        const before = await allRows();
        for (const mode of ["replace", "fill-empty"]) {
          const r = await post(
            body(e, [second, first], {
              type: "set-value",
              value: { type: "number", value: 2 },
              mode,
            }),
          );
          assert.equal(r.status, 409);
          const error = await r.json();
          assert.equal(error.error.code, "ATTENDANCE_CONFLICT");
          assert.ok(
            error.error.details.cells.some((c) => c.date === first.date),
          );
          assert.deepEqual(await allRows(), before);
        }
        const noOp = await saved(
          body(e, [{ ...first, expectedRevision: a.cells[0].revision }], {
            type: "set-value",
            value: { type: "number", value: 1 },
            mode: "replace",
          }),
        );
        assert.equal(noOp.counts.changed, 0);
        assert.notEqual(noOp.cells[0].revision, a.cells[0].revision);
      },
    );
    await t.test(
      "fill source is read-only; skip counts and destination reminders remain exact",
      async () => {
        const e = await create();
        const src = key(e),
          dest = key(e, "2026-02-03"),
          skipped = key(e, "2026-02-01");
        const s = await saved(
          body(e, [src], {
            type: "patch-cell",
            patch: { value: { type: "number", value: 0 }, reminder: true },
          }),
        );
        const d = await saved(
          body(e, [dest], { type: "set-reminder", reminder: true }),
        );
        const source = { ...src, expectedRevision: s.cells[0].revision };
        const input = body(
          e,
          [{ ...dest, expectedRevision: d.cells[0].revision }, skipped],
          { type: "set-value", value: { type: "absence" }, mode: "fill-empty" },
          { source },
        );
        const result = await saved(input, { actor: 1 });
        assert.deepEqual(result.counts, {
          selected: 2,
          eligible: 1,
          skipped: 1,
          changed: 1,
        });
        assert.equal(
          result.cells.find((x) => x.date === dest.date).reminder,
          true,
        );
        assert.equal(
          result.cells.find((x) => x.date === skipped.date).revision,
          "0",
        );
        assert.deepEqual((await reconcile([], [src])).cells[0], s.cells[0]);
        const updatedSource = await saved(
          body(e, [source], { type: "set-reminder", reminder: false }),
        );
        assert.notEqual(
          updatedSource.cells[0].revision,
          source.expectedRevision,
        );
        const before = await allRows();
        assert.equal((await post(input)).status, 409);
        assert.deepEqual(await allRows(), before);
        const zero = body(
          e,
          [
            {
              ...dest,
              expectedRevision: result.cells.find((x) => x.date === dest.date)
                .revision,
            },
            skipped,
          ],
          { type: "set-value", value: { type: "absence" }, mode: "fill-empty" },
        );
        const r = await post(zero);
        assert.equal(r.status, 422);
        assert.equal((await r.json()).error.code, "NO_ELIGIBLE_TARGETS");
        assert.deepEqual(await allRows(), before);
      },
    );
    await t.test(
      "strict DTO/discriminator/unknown fields, malformed months/dates, exact expected union",
      async () => {
        const e = await create();
        const valid = body(e, [key(e)], {
          type: "patch-cell",
          patch: { value: null, reminder: false },
        });
        const invalid = [
          null,
          {},
          { ...valid, extra: true },
          { ...valid, month: null },
          { ...valid, targets: [] },
          { ...valid, targets: [key(e), key(e)] },
          { ...valid, targets: [{ ...key(e), extra: 1 }] },
          { ...valid, expectedEmployees: [] },
          {
            ...valid,
            expectedEmployees: [
              ...valid.expectedEmployees,
              ...valid.expectedEmployees,
            ],
          },
          { ...valid, source: null },
        ];
        for (const operation of [
          { type: "unknown" },
          { type: "patch-cell", patch: {} },
          { type: "patch-cell", patch: null },
          { type: "patch-cell", patch: { reminder: null } },
          {
            type: "patch-cell",
            patch: { value: { type: "number", value: "1.5" } },
          },
          { type: "patch-cell", patch: { extra: true } },
          {
            type: "patch-cell",
            patch: { value: { type: "absence", value: 0 } },
          },
          { type: "patch-cell", patch: { value: null }, mode: "replace" },
          { type: "set-value", value: null, mode: "replace", reminder: true },
          { type: "set-value", value: null },
          { type: "set-reminder", reminder: false, value: null },
        ])
          invalid.push({ ...valid, operation });
        invalid.push(
          { ...valid, targets: [key(e), key(e, "2026-02-03")] },
          { ...valid, source: key(e, "2026-02-03") },
        );
        const before = await allRows();
        for (const input of invalid)
          assert.equal((await post(input)).status, 400, JSON.stringify(input));
        for (const month of [
          "2026-2",
          "2026-13",
          "0000-01",
          "2026-02-01",
          "2026-02&extra=1",
          "2026-02&month=2026-03",
        ])
          assert.equal(
            (await request(`/attendance/month?month=${month}`)).status,
            400,
            month,
          );
        for (const date of [
          "2026-02-29",
          "0000-01-01",
          "2026-2-02",
          "2026-02-02T00:00:00Z",
        ])
          assert.equal(
            (await post({ ...valid, targets: [{ ...key(e), date }] })).status,
            400,
            date,
          );
        assert.equal(
          (await post({ ...valid, targets: [key(e, "2026-03-01")] })).status,
          422,
        );
        for (const value of [0, 24.5, 25])
          assert.equal(
            (
              await post(
                body(e, [key(e, "2026-02-02", "overtime")], {
                  type: "set-value",
                  value: { type: "number", value },
                  mode: "replace",
                }),
              )
            ).status,
            422,
          );
        assert.equal(
          (
            await post(valid, {
              headers: { origin: "https://outside.invalid" },
            })
          ).status,
          403,
        );
        assert.equal(
          (await post(valid, { headers: { "content-type": "text/plain" } }))
            .status,
          415,
        );
        assert.deepEqual(await allRows(), before);
        const r = await fetch(
          `${await f.apps[0].getUrl()}/api/v1/attendance/changes`,
          {
            method: "POST",
            headers: {
              origin,
              "content-type": "application/json",
              cookie: f.cookies[0],
            },
            body: "{",
          },
        );
        assert.equal(r.status, 400);
        assert.equal(
          (await post({ ...valid, extra: "x".repeat(16 * 1024 * 1024) }))
            .status,
          413,
        );
      },
    );
    await t.test(
      "reconcile reads explicit IDs outside month, tombstone revisions, missing IDs vs DB failures",
      async () => {
        const e = await create();
        const k = key(e);
        const c = await saved(
          body(e, [k], {
            type: "patch-cell",
            patch: { value: null, reminder: false },
          }),
        );
        const r = await request(`/employees/${e.id}`, {
          method: "PATCH",
          body: {
            expectedRevision: e.revision,
            startDate: "2026-03-01",
            endDate: null,
          },
        });
        assert.equal(r.status, 200);
        const current = await r.json();
        const month = await (
          await request("/attendance/month?month=2026-02")
        ).json();
        assert.equal(
          month.employees.some((x) => x.id === e.id),
          false,
        );
        const missing = randomUUID();
        const result = await reconcile(
          [e.id, missing],
          [k, key(e, "2026-02-03", "overtime"), { ...k, employeeId: missing }],
        );
        assert.deepEqual(result.employees, [current]);
        assert.deepEqual(result.missingEmployeeIds, [missing]);
        assert.equal(result.cells.length, 2);
        assert.equal(result.cells[0].revision, c.cells[0].revision);
        assert.equal(result.cells[0].state, "before-start");
        assert.equal(result.cells[1].revision, "0");
        for (const input of [
          { employeeIds: [], cells: [] },
          { employeeIds: [e.id, e.id], cells: [] },
          { employeeIds: [], cells: [k, k] },
          { employeeIds: null, cells: [] },
          { employeeIds: [], cells: [], extra: true },
        ])
          assert.equal(
            (
              await request("/attendance/reconcile", {
                method: "POST",
                body: input,
              })
            ).status,
            400,
          );
        const before = await allRows();
        await reconcile([e.id], [k]);
        assert.deepEqual(await allRows(), before);
      },
    );
    await t.test(
      "clear/recreate revisions never reuse baseline; new SQL/client after reload keeps atomic values",
      async () => {
        const e = await create();
        let k = key(e);
        const values = [
          { type: "number", value: 1.5 },
          null,
          { type: "number", value: 1.5 },
        ];
        const revisions = [];
        for (const value of values) {
          const result = await saved(
            body(e, [k], {
              type: "patch-cell",
              patch: { value, reminder: true },
            }),
          );
          revisions.push(result.cells[0].revision);
          k = { ...k, expectedRevision: result.cells[0].revision };
        }
        assert.equal(new Set(revisions).size, 3);
        assert.equal(
          (
            await post(
              body(e, [{ ...k, expectedRevision: revisions[0] }], {
                type: "set-reminder",
                reminder: false,
              }),
            )
          ).status,
          409,
        );
        const fresh = new Database(db.connectionString);
        try {
          const [row] = await fresh.client
            .$queryRaw`SELECT "halfUnits",reminder,revision FROM "AttendanceCell" WHERE "employeeId"=${e.id}::uuid`;
          assert.deepEqual(row, {
            halfUnits: 3,
            reminder: true,
            revision: revisions[2],
          });
        } finally {
          await fresh.onModuleDestroy();
        }
        const snapshot = await reconcile([e.id], [k]);
        assert.deepEqual(snapshot.cells[0].value, {
          type: "number",
          value: 1.5,
        });
        assert.equal(snapshot.cells[0].reminder, true);
        await writeFile(
          resolve(db.evidence, "independent-readback.json"),
          JSON.stringify({ ...snapshot, fakeFixture: true }),
        );
      },
    );
  } finally {
    if (f) await f.close();
    await db.pool.end();
  }
});
