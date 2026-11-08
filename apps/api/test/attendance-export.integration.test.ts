import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { startSandbox } from "../../../tests/product-e2e/sandbox.mjs";
import { EmploymentConsistency } from "../dist/modules/employees/index.js";
import { EmployeesRepository } from "../dist/modules/employees/employees.repository.js";
import { AttendanceService } from "../dist/modules/attendance/attendance.service.js";
import { AttendanceExportService } from "../dist/modules/attendance/export/attendance-export.service.js";
import { Database } from "../dist/infrastructure/db/database.js";
import { startAttendanceReadSandbox } from "./attendance-read-sandbox.mjs";
import { employeeReadDbPolicyFixture as fixed } from "./employee-read-db-policy-fixtures.mjs";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";
import { pauseMethod } from "./attendance-test-client.mjs";

/** File map: retained snapshot/closure/auth test first; fullMonthTest owns the
 * scoped HTTP lifecycle, seedMonth/assertWorkbookOrder own fake saved markers.
 * Ownership perturbation and fixed full1000/page/export parity tests follow.
 * Keep the export matrix together; no production test hooks or extra harness.
 */

test("export_snapshot_still_closes_before_build: authenticated read-only snapshot during concurrent edit", async () => {
  const s = await startSandbox({
    exporting: true,
    acceptance: process.env.MKW_PRODUCT_ACCEPTANCE === "1",
  });
  try {
    const url = `${s.apiOrigin}/api/v1`;
    const login = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { origin: s.webOrigin, "content-type": "application/json" },
      body: JSON.stringify(s.accounts[0]),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (
      path,
      body,
      method = body === undefined ? "GET" : "POST",
    ) =>
      fetch(`${url}${path}`, {
        method,
        headers: {
          cookie,
          origin: s.webOrigin,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.equal(
      (await fetch(`${url}/attendance/export?month=2026-02`)).status,
      401,
    );
    assert.equal(
      (await request("/attendance/export?month=2026-02&unknown=1")).status,
      400,
    );
    for (const month of ["0000-01", "2026-13", "2026-2"])
      assert.equal(
        (await request(`/attendance/export?month=${month}`)).status,
        400,
      );
    const e = await (
      await request("/employees", {
        name: "=Nguyễn giả",
        startDate: "2026-02-02",
        endDate: "2026-02-03",
      })
    ).json();
    const key = (date, kind) => ({
      employeeId: e.id,
      date: `2026-02-${date}`,
      kind,
      expectedRevision: "0",
    });
    const write = (targets, value) =>
      request("/attendance/changes", {
        month: "2026-02",
        expectedEmployees: [{ employeeId: e.id, expectedRevision: e.revision }],
        targets,
        operation: {
          type: "patch-cell",
          patch: { value: { type: "number", value }, reminder: true },
        },
      });
    assert.equal((await write([key("03", "work")], 1.5)).status, 200);
    assert.equal((await write([key("03", "overtime")], 2)).status, 200);
    const gate = pauseMethod(
      s.app.get(EmploymentConsistency),
      "listForMonth",
      true,
    );
    const pending = request("/attendance/export?month=2026-02");
    let before;
    try {
      const [tx] = await gate.entered;
      const [isolation] =
        await tx.$queryRaw`SELECT current_setting('transaction_isolation') isolation, current_setting('transaction_read_only') readonly`;
      assert.deepEqual(isolation, {
        isolation: "repeatable read",
        readonly: "on",
      });
      const month = await (
        await request("/attendance/month?month=2026-02")
      ).json();
      for (const kind of ["work", "overtime"]) {
        const cell = month.cells.find(
          (c) => c.kind === kind && c.date === "2026-02-03",
        );
        assert.equal(
          (
            await write(
              [{ ...key("03", kind), expectedRevision: cell.revision }],
              kind === "work" ? 3 : 4,
            )
          ).status,
          200,
        );
      }
      assert.equal(
        (
          await request(
            `/employees/${e.id}`,
            { expectedRevision: e.revision, name: "+Tên mới giả" },
            "PATCH",
          )
        ).status,
        200,
      );
      gate.release();
      before = await pending;
    } finally {
      gate.restore();
      await pending;
    }
    assert.equal(before.status, 200);
    assert.equal(before.headers.get("cache-control"), "no-store");
    assert.equal(
      before.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    assert.match(
      before.headers.get("content-disposition"),
      /attachment; filename="minh-khue-2026-02.xlsx"/,
    );
    const bytes = Buffer.from(await before.arrayBuffer());
    await writeFile(resolve(s.runDir, "snapshot-before.xlsx"), bytes);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    const sheet = book.worksheets[0];
    assert.equal(book.worksheets.length, 1);
    assert.equal(sheet.getCell("B7").value, "=Nguyễn giả");
    assert.equal(sheet.getCell("B14").value, "=Nguyễn giả");
    assert.equal(sheet.getCell("E7").value, 1.5);
    assert.equal(sheet.getCell("E14").value, 2);
    assert.equal(sheet.getCell("AE8").result, 1.5);
    assert.equal(sheet.getCell("AE15").result, 2);
    assert.equal(sheet.getCell("E7").fill.fgColor.argb, "FFEDF4D6");
    const after = await request("/attendance/export?month=2026-02");
    await book.xlsx.load(Buffer.from(await after.arrayBuffer()));
    assert.equal(book.worksheets[0].getCell("B7").value, "+Tên mới giả");
    assert.equal(book.worksheets[0].getCell("E7").value, 3);
    assert.equal(book.worksheets[0].getCell("E14").value, 4);
    const { rows } = await s.pool.query(
      'SELECT "halfUnits", kind::text FROM "AttendanceCell" ORDER BY kind::text',
    );
    assert.deepEqual(rows, [
      { halfUnits: 8, kind: "overtime" },
      { halfUnits: 6, kind: "work" },
    ]);
    const service = s.app.get(AttendanceService);
    const readGate = pauseMethod(service, "readMonth", true);
    const closed = request("/attendance/export?month=2026-02");
    try {
      await readGate.entered;
      const { rows: active } = await s.pool.query(
        "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'",
      );
      assert.equal(
        active[0].count,
        0,
        "Snapshot transaction must close before workbook serialization",
      );
      readGate.release();
      assert.equal((await closed).status, 200);
    } finally {
      readGate.restore();
      await closed;
    }
    const originalRead = service.readMonth.bind(service);
    service.readMonth = async (month) => ({
      ...(await originalRead(month)),
      cells: [],
    });
    try {
      const failed = await request("/attendance/export?month=2026-02");
      assert.equal(failed.status, 500);
      assert.match(failed.headers.get("content-type"), /application\/json/);
      assert.equal(failed.headers.get("content-disposition"), null);
      const payload = await failed.json();
      assert.equal(payload.error.code, "EXPORT_FAILED");
      assert.equal(
        JSON.stringify(payload).includes("Incomplete attendance snapshot"),
        false,
      );
    } finally {
      service.readMonth = originalRead;
    }
    await writeFile(
      resolve(s.runDir, "export-assertions.json"),
      JSON.stringify({
        status: "passed",
        isolation: "read-only repeatable read",
        before: [1.5, 2],
        after: [3, 4],
        sqlHalfUnits: [8, 6],
        readerRecalc: "Not run",
      }),
    );
    await request("/auth/logout", {});
    assert.equal(
      (await request("/attendance/export?month=2026-02")).status,
      401,
    );
  } finally {
    await s.stop();
  }
});

// New tests use the existing scoped owner: rotation/session invalidation before
// disconnect, fail-safe app/pool cleanup and actual port refusal checks.
const month = "2026-10";
async function fullMonthTest(name, body) {
  const s = await startAttendanceReadSandbox({ mode: "http" });
  const report = { name, targetFile: s.targetFile };
  try {
    await withCleanup(
      () => body(s, s.pool),
      () => s.stop(),
    );
    assert.equal(s.pool.ended, true);
    assert(s.apps.every((app) => !app.getHttpServer().listening));
    report.result = "PASS";
  } catch (error) {
    report.result = "FAIL";
    report.error = { name: error.name, message: error.message };
    throw error;
  } finally {
    report.runPoolEnded = s.pool.ended;
    report.listening = s.apps.map((app) => app.getHttpServer().listening);
    await writeFile(
      resolve(s.evidence, `${name}.json`),
      JSON.stringify(report, null, 2),
    );
  }
}

// Unique saved base20 half-unit markers identify all1000 IDs even when names
// duplicate or compare canonically equal. Both tables carry independent values.
const markers = (index) => [
  (index % 20) + 1,
  (Math.floor(index / 20) % 20) + 1,
  Math.floor(index / 400) + 1,
];
async function seedMonth(pool, employees) {
  await pool.query(
    `INSERT INTO "Employee" (id,name,"startDate",revision) SELECT id::uuid,name,'2026-10-01'::date,id::uuid FROM jsonb_to_recordset($1::jsonb) AS e(id text,name text)`,
    [JSON.stringify(employees)],
  );
  const cells = employees.flatMap((employee, index) =>
    ["work", "overtime"].flatMap((kind) =>
      markers(index).map((halves, day) => ({
        employeeId: employee.id,
        date: `2026-10-0${day + 1}`,
        kind,
        halves: halves + (kind === "overtime" ? 1 : 0),
      })),
    ),
  );
  await pool.query(
    `INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",revision) SELECT "employeeId"::uuid,date::date,kind::"AttendanceKind",'number',halves,"employeeId"::uuid FROM jsonb_to_recordset($1::jsonb) AS c("employeeId" text,date text,kind text,halves int)`,
    [JSON.stringify(cells)],
  );
}
async function assertWorkbookOrder(bytes, expectedIds, employees) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  assert.equal(book.worksheets.length, 1);
  const sheet = book.worksheets[0];
  const byId = new Map(
    employees.map((employee, index) => [employee.id, { ...employee, index }]),
  );
  for (const [kind, first] of [
    ["work", 7],
    ["overtime", employees.length + 13],
  ]) {
    let grandTotal = 0;
    const byDate = [0, 0, 0];
    for (const [offset, employeeId] of expectedIds.entries()) {
      const employee = byId.get(employeeId);
      const row = first + offset;
      assert.equal(sheet.getCell(row, 2).value, employee.name);
      const expected = markers(employee.index).map(
        (halves) => (halves + (kind === "overtime" ? 1 : 0)) / 2,
      );
      assert.deepEqual(
        [3, 4, 5].map((col) => sheet.getCell(row, col).value),
        expected,
      );
      assert.equal(sheet.getCell(row, 34).formula, `SUM(C${row}:AG${row})`);
      const total = expected.reduce((sum, value) => sum + value, 0);
      assert.equal(sheet.getCell(row, 34).result, total);
      grandTotal += total;
      expected.forEach((value, day) => {
        byDate[day] += value;
      });
    }
    const last = first + employees.length - 1;
    const totalRow = last + 1;
    assert.equal(
      sheet.getCell(totalRow, 34).formula,
      `SUM(AH${first}:AH${last})`,
    );
    assert.equal(sheet.getCell(totalRow, 34).result, grandTotal);
    for (let col = 3; col <= 33; col++) {
      const letter = sheet.getColumn(col).letter;
      assert.equal(
        sheet.getCell(totalRow, col).formula,
        `SUM(${letter}${first}:${letter}${last})`,
      );
      assert.equal(sheet.getCell(totalRow, col).result, byDate[col - 3] ?? 0);
    }
  }
}

test("full_read_preserves_shared_sql_order_owner", async () => {
  await fullMonthTest(
    "full_read_preserves_shared_sql_order_owner",
    async (s, pool) => {
      await seedMonth(pool, fixed.employees);
      const app = s.apps[0];
      const repository = app.get(EmployeesRepository);
      const original = repository.listForMonth;
      // Deliberate test-only perturbation of a copy after real SQL. Never rely on
      // the pre-Task4 query already being ordered, or change the production oracle.
      const perturbedIds = [...fixed.expectedOrderedIds].reverse();
      let calls = 0;
      repository.listForMonth = async function (...args) {
        calls++;
        const rows = await original.apply(this, args);
        const byId = new Map(rows.map((employee) => [employee.id, employee]));
        assert.equal(rows.length, fixed.employees.length);
        return perturbedIds.map((employeeId) => byId.get(employeeId));
      };
      try {
        const snapshot = await app.get(AttendanceService).readMonth(month);
        assert.deepEqual(
          snapshot.employees.map((employee) => employee.id),
          perturbedIds,
          "full read must preserve the SQL owner seam without local resort",
        );
        assert.equal(calls, 1, "one full membership read per snapshot");
        await assertWorkbookOrder(
          await app.get(AttendanceExportService).download(month),
          perturbedIds,
          fixed.employees,
        );
        assert.equal(calls, 2, "export reads one complete snapshot");
      } finally {
        repository.listForMonth = original;
      }
      const rows = await app
        .get(Database)
        .client.$transaction((tx) =>
          repository.listForMonth(tx, "2026-10-01", "2026-10-31"),
        );
      assert.deepEqual(
        rows.map((employee) => employee.id),
        fixed.expectedOrderedIds,
      );
      const normal = await app.get(AttendanceService).readMonth(month);
      assert.deepEqual(
        normal.employees.map((employee) => employee.id),
        fixed.expectedOrderedIds,
      );
    },
  );
});

test("full_month_export_matches_page_order_without_filter", async () => {
  await fullMonthTest(
    "full_month_export_matches_page_order_without_filter",
    async (s, pool) => {
      // Duplicate An extends the pinned108/109 tie by UUID ASC. All expectations
      // are fixed before SQL, including canonical101/102 and accepted TJE126/127.
      const filler = Array.from({ length: 972 }, (_, index) => ({
        id: `dddddddd-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
        name: "An",
      }));
      const employees = [...fixed.employees, ...filler];
      const expectedIds = [
        ...fixed.expectedOrderedIds.slice(0, 5),
        ...filler.map((employee) => employee.id),
        ...fixed.expectedOrderedIds.slice(5),
      ];
      await seedMonth(pool, employees);
      const pages = [];
      for (let page = 1; page <= 20; page++) {
        const response = await s.request("/attendance/search", {
          method: "POST",
          body: { month, q: "", page, pageSize: 50 },
        });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.pagination.monthEmployeeCount, 1000);
        pages.push(...payload.employees.map((employee) => employee.id));
      }
      assert.deepEqual(pages, expectedIds);
      const response = await s.request(`/attendance/month?month=${month}`);
      assert.equal(response.status, 200);
      const full = await response.json();
      assert.deepEqual(
        full.employees.map((employee) => employee.id),
        expectedIds,
      );
      assert.equal(full.cells.length, 1000 * 31 * 2);
      const expectedKeys = new Set(
        employees.flatMap((employee) =>
          Array.from({ length: 31 }, (_, day) =>
            ["work", "overtime"].map(
              (kind) =>
                `${employee.id}/2026-10-${String(day + 1).padStart(2, "0")}/${kind}`,
            ),
          ).flat(),
        ),
      );
      assert.deepEqual(
        new Set(
          full.cells.map(
            (cell) => `${cell.employeeId}/${cell.date}/${cell.kind}`,
          ),
        ),
        expectedKeys,
      );
      const filtered = await s.request("/attendance/search", {
        method: "POST",
        body: { month, q: "An", page: 2, pageSize: 25 },
      });
      assert.equal(filtered.status, 200);
      const page = await filtered.json();
      assert.equal(page.employees.length, 25);
      assert.equal(page.pagination.page, 2);
      for (const kind of ["work", "overtime"]) {
        assert.equal(full.totals[kind].byEmployee.length, 1000);
        assert.equal(
          page.monthTotals[kind].grandTotal,
          full.totals[kind].grandTotal,
        );
      }
      for (const extra of ["q=An", "page=2", "pageSize=25"]) {
        const invalid = await s.request(
          `/attendance/export?month=${month}&${extra}`,
        );
        assert.equal(invalid.status, 400);
        assert.equal(invalid.headers.get("content-disposition"), null);
      }
      const exported = await s.request(`/attendance/export?month=${month}`);
      assert.equal(exported.status, 200);
      const bytes = Buffer.from(await exported.arrayBuffer());
      await assertWorkbookOrder(bytes, expectedIds, employees);
      await writeFile(resolve(s.evidence, "full1000.xlsx"), bytes);
      const service = s.apps[0].get(AttendanceService);
      const original = service.readMonth;
      service.readMonth = async () => {
        throw new Error("private Task4 DB failure");
      };
      try {
        for (const path of ["month", "export"]) {
          const failed = await s.request(`/attendance/${path}?month=${month}`);
          assert.equal(failed.status, 503);
          assert.match(failed.headers.get("content-type"), /application\/json/);
          assert.equal(failed.headers.get("content-disposition"), null);
          const payload = await failed.json();
          assert.equal(payload.error.code, "TEMPORARILY_UNAVAILABLE");
          assert.equal(
            JSON.stringify(payload).includes("private Task4"),
            false,
          );
        }
      } finally {
        service.readMonth = original;
      }
    },
  );
});
