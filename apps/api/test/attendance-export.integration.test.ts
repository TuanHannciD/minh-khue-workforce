import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { startSandbox } from "../../../tests/product-e2e/sandbox.mjs";
import { EmploymentConsistency } from "../dist/modules/employees/index.js";
import { AttendanceService } from "../dist/modules/attendance/attendance.service.js";
import { pauseMethod } from "./attendance-test-client.mjs";

test("authenticated export uses one read-only snapshot of names, both tables and cached totals during concurrent edit", async () => {
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
