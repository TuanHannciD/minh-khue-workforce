import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  attendanceSandbox,
  migrate,
  fixture,
  root,
} from "./attendance-sandbox.mjs";
import { attendanceClient } from "./attendance-test-client.mjs";

test("full G1 write fixtures and boundary/calendar HTTP persistence", async (t) => {
  const db = await attendanceSandbox();
  let f;
  try {
    await migrate(db);
    f = await fixture(db);
    const api = attendanceClient(f);
    await t.test(
      "each complete G1 write request returns the full expected response shape/content",
      async () => {
        const source = await readFile(
          resolve(root, "docs/tasks/MKW-PRODUCT-001/technical/api-contract.md"),
          "utf8",
        );
        const examples = [
          ...source.matchAll(/```json\s*\n([\s\S]*?)\n```/g),
        ].map((m) => JSON.parse(m[1]));
        const employee = {
          id: "00000000-0000-4000-8000-000000000101",
          name: "Nhân sự thử 01",
          startDate: "2026-10-15",
          endDate: null,
          revision: "4cb38a76-560e-4511-aea2-479d48cb9490",
        };
        await db.pool.query(
          'INSERT INTO "Employee" (id,name,"startDate","endDate",revision) VALUES ($1,$2,$3,$4,$5)',
          [
            employee.id,
            employee.name,
            employee.startDate,
            employee.endDate,
            employee.revision,
          ],
        );
        const seed = async (date, type, half, reminder, revision) =>
          db.pool.query(
            'INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",reminder,revision) VALUES ($1,$2,\'work\',$3,$4,$5,$6) ON CONFLICT ("employeeId",date,kind) DO UPDATE SET "valueType"=EXCLUDED."valueType","halfUnits"=EXCLUDED."halfUnits",reminder=EXCLUDED.reminder,revision=EXCLUDED.revision',
            [employee.id, date, type, half, reminder, revision],
          );
        let count = 0;
        for (let i = 0; i < examples.length; i++) {
          const input = examples[i];
          if (!input.operation) continue;
          const expected = examples[i + 1];
          assert.equal(expected.state, "saved");
          if (input.operation.type === "patch-cell")
            await seed(
              "2026-10-20",
              "absence",
              null,
              false,
              "00000000-0000-4000-8000-000000000301",
            );
          if (input.source) {
            await seed(
              "2026-10-19",
              "number",
              7,
              false,
              "00000000-0000-4000-8000-000000000303",
            );
            await seed(
              "2026-10-20",
              "empty",
              null,
              true,
              "00000000-0000-4000-8000-000000000304",
            );
            await seed(
              "2026-10-22",
              "absence",
              null,
              false,
              "00000000-0000-4000-8000-000000000305",
            );
          }
          const r = await api.post(input, { actor: count % 2 });
          assert.equal(r.status, 200);
          const actual = await r.json();
          assert.ok(Number.isFinite(Date.parse(actual.savedAt)));
          const eligibleDates = input.source
            ? new Set(["2026-10-20"])
            : new Set(input.targets.map((c) => c.date));
          const normalized = {
            ...actual,
            savedAt: expected.savedAt,
            cells: actual.cells.map((c, index) => {
              if (eligibleDates.has(c.date)) {
                assert.notEqual(
                  c.revision,
                  input.targets.find((k) => k.date === c.date).expectedRevision,
                );
                assert.match(c.revision, /^[a-f0-9-]{36}$/);
                return { ...c, revision: expected.cells[index].revision };
              }
              return c;
            }),
          };
          assert.deepEqual(normalized, expected);
          const reloaded = await api.reconcile(input.targets);
          assert.deepEqual(reloaded.cells, actual.cells);
          count++;
        }
        assert.equal(count, 4);
        assert.equal(
          (await api.patch(employee, { endDate: "2026-12-31" })).status,
          200,
        );
      },
    );
    await t.test(
      "HTTP numeric limits, F/blank distinction, reminder and independent kinds persist for both equal accounts",
      async () => {
        const e = await api.create();
        for (const [kind, accepted, rejected] of [
          ["work", [29.5, 30, 0], [30.5, 31, 3.25, -0.5]],
          ["overtime", [23.5, 24], [0, 24.5, 25, 3.25, -0.5]],
        ]) {
          let k = api.key(e, "2026-10-20", kind);
          for (const [index, value] of accepted.entries()) {
            const r = await api.saved(
              api.intent(e, [k], {
                type: "patch-cell",
                patch: { value: { type: "number", value }, reminder: true },
              }),
              { actor: index % 2 },
            );
            assert.deepEqual(
              r.cells[0].value,
              value === 0 ? { type: "absence" } : { type: "number", value },
            );
            assert.equal(r.cells[0].reminder, true);
            k.expectedRevision = r.cells[0].revision;
          }
          const before = await api.reconcile([k]);
          for (const value of rejected)
            assert.equal(
              (
                await api.post(
                  api.intent(e, [k], {
                    type: "patch-cell",
                    patch: {
                      value: { type: "number", value },
                      reminder: false,
                    },
                  }),
                )
              ).status,
              422,
            );
          assert.deepEqual((await api.reconcile([k])).cells, before.cells);
        }
        const month = await (
          await f.request("/attendance/month?month=2026-10")
        ).json();
        assert.equal(
          month.totals.work.byEmployee.find((x) => x.employeeId === e.id).value,
          0,
        );
        assert.equal(
          month.totals.overtime.byEmployee.find((x) => x.employeeId === e.id)
            .value,
          24,
        );
      },
    );
    await t.test(
      "empty month keeps all day totals; Gregorian lengths, name collation and duplicate names retain IDs",
      async () => {
        for (const [month, days] of [
          ["1900-02", 28],
          ["2000-02", 29],
          ["2025-04", 30],
          ["2025-01", 31],
          ["0001-01", 31],
          ["9999-12", 31],
        ]) {
          const r = await f.request(`/attendance/month?month=${month}`);
          assert.equal(r.status, 200);
          const snapshot = await r.json();
          assert.deepEqual(snapshot.employees, []);
          assert.deepEqual(snapshot.cells, []);
          for (const kind of ["work", "overtime"]) {
            assert.equal(snapshot.totals[kind].byDate.length, days);
            assert.equal(snapshot.totals[kind].grandTotal, 0);
            assert.deepEqual(snapshot.totals[kind].byEmployee, []);
            assert.ok(snapshot.totals[kind].byDate.every((d) => d.value === 0));
          }
        }
        const employees = [];
        for (const name of [
          "Z giả",
          "Á giả",
          "A giả",
          "Đ giả",
          "D giả",
          "A giả",
        ])
          employees.push(
            await api.create({
              name,
              startDate: "2028-02-01",
              endDate: "2028-02-29",
            }),
          );
        const snapshot = await (
          await f.request("/attendance/month?month=2028-02")
        ).json();
        assert.deepEqual(
          snapshot.employees.map((e) => e.name),
          ["A giả", "A giả", "Á giả", "D giả", "Đ giả", "Z giả"],
        );
        assert.equal(new Set(snapshot.employees.map((e) => e.id)).size, 6);
        assert.equal(snapshot.cells.length, 6 * 29 * 2);
        const ids = snapshot.employees
          .filter((e) => e.name === "A giả")
          .map((e) => e.id);
        assert.deepEqual(ids, [...ids].sort());
      },
    );
    await t.test(
      "reconcile source cleared then exited month and endDate exit retain explicit identity and tombstones",
      async () => {
        const e = await api.create(),
          src = api.key(e, "2026-10-19"),
          other = await api.create();
        const seed = await api.saved(
          api.intent(e, [src], {
            type: "patch-cell",
            patch: { value: { type: "absence" }, reminder: true },
          }),
        );
        const cleared = await api.saved(
          api.intent(
            e,
            [{ ...src, expectedRevision: seed.cells[0].revision }],
            { type: "patch-cell", patch: { value: null, reminder: false } },
          ),
        );
        assert.equal(
          (await api.patch(e, { endDate: "2026-09-30" })).status,
          200,
        );
        const foreign = api.key(other, "2026-11-10", "overtime");
        const missing = randomUUID();
        const result = await api.reconcile([src, foreign], [missing]);
        assert.equal(result.employees.length, 2);
        assert.deepEqual(result.missingEmployeeIds, [missing]);
        const source = result.cells.find((c) => c.employeeId === e.id);
        assert.equal(source.state, "after-end");
        assert.equal(source.revision, cleared.cells[0].revision);
        assert.equal(source.value, null);
        assert.equal(
          (
            await (await f.request("/attendance/month?month=2026-10")).json()
          ).employees.some((x) => x.id === e.id),
          false,
        );
        for (const [headers, status] of [
          [{ origin: "https://outside.invalid" }, 403],
          [{ "content-type": "text/plain" }, 415],
        ])
          assert.equal(
            (
              await f.request("/attendance/reconcile", {
                method: "POST",
                body: { employeeIds: [e.id], cells: [] },
                headers,
              })
            ).status,
            status,
          );
      },
    );
    await t.test(
      "deploy on existing auth/employees/cells baseline preserves all persisted content and revisions",
      async () => {
        const digest = async () => {
          const data = [];
          for (const table of ["User", "Session", "Employee", "AttendanceCell"])
            data.push(
              (
                await db.pool.query(
                  `SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY row_to_json(t)::text`,
                )
              ).rows,
            );
          return createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex");
        };
        const before = await digest();
        await migrate(db);
        assert.equal(await digest(), before);
        await writeFile(
          resolve(db.evidence, "baseline-preserved.json"),
          JSON.stringify({
            fakeFixture: true,
            allContentAndRevisionsPreserved: true,
            sha256: before,
            noNewMigrationRequired: true,
          }),
        );
      },
    );
  } finally {
    if (f) await f.close();
    await db.pool.end();
  }
});
