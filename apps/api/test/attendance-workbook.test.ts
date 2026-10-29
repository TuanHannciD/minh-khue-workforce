import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";
import { createDocument } from "../dist/openapi.js";

test("generated export contract distinguishes binary success from JSON errors", async () => {
  const doc = await createDocument();
  const operation = doc.paths["/api/v1/attendance/export"].get;
  assert.deepEqual(
    operation.responses[200].content[
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ].schema,
    { type: "string", format: "binary" },
  );
  for (const status of [400, 401, 500, 503])
    assert.deepEqual(Object.keys(operation.responses[status].content), [
      "application/json",
    ]);
});

const requireExcel = createRequire(import.meta.resolve("exceljs"));
const JSZip = requireExcel("jszip");
const module =
  await import("../dist/modules/attendance/export/attendance-workbook.js").catch(
    () => null,
  );
const names = [
  "=SUM(1,2) Nguyễn giả",
  "+Trần giả",
  "Tên tiếng Việt giả ".repeat(10),
];
function formula(cell, expression, result) {
  assert.equal(cell.formula, expression);
  // ExcelJS4.4's value getter drops falsy result=0; the result getter and raw
  // XML preserve it. Never accept absent cache as equivalent to cached zero.
  assert.equal(cell.result, result);
}
function fixture(month = "2026-02", empty = false) {
  const dates = Array.from(
    {
      length:
        month === "2024-02"
          ? 29
          : month.endsWith("-04")
            ? 30
            : month.endsWith("-01")
              ? 31
              : 28,
    },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
  const employees = empty
    ? []
    : names.map((name, i) => ({
        id: `person-${i}`,
        name,
        startDate: `${month}-02`,
        endDate: `${month}-06`,
        revision: "revision",
      }));
  const cells = employees.flatMap((e) =>
    dates.flatMap((date) =>
      ["work", "overtime"].map((kind) => ({
        employeeId: e.id,
        date,
        kind,
        value:
          e.id === "person-0" && date.endsWith("-03")
            ? { type: "number", value: kind === "work" ? 1.5 : 2 }
            : date.endsWith("-02") && kind === "work"
              ? { type: "absence" }
              : null,
        reminder:
          e.id === "person-0" &&
          ["03", "04"].includes(date.slice(-2)) &&
          kind === "work",
        revision: "0",
        state: date.endsWith("-01")
          ? "before-start"
          : date > `${month}-06`
            ? "after-end"
            : "editable",
      })),
    ),
  );
  const totals = Object.fromEntries(
    ["work", "overtime"].map((kind) => [
      kind,
      {
        byEmployee: employees.map((e) => ({
          employeeId: e.id,
          value: e.id === "person-0" ? (kind === "work" ? 1.5 : 2) : 0,
        })),
        byDate: dates.map((date) => ({
          date,
          value:
            !empty && date.endsWith("-03") ? (kind === "work" ? 1.5 : 2) : 0,
        })),
        grandTotal: empty ? 0 : kind === "work" ? 1.5 : 2,
      },
    ]),
  );
  return {
    month,
    fetchedAt: "2026-10-29T00:00:00.000Z",
    employees,
    cells,
    totals,
  };
}
test("one editable sheet preserves typed saved cells, safe names, reminders and independent SUM ranges/caches", async () => {
  assert.equal(
    typeof module?.buildAttendanceWorkbook,
    "function",
    "Task9 workbook builder must exist",
  );
  const bytes = await module.buildAttendanceWorkbook(fixture());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  assert.match(sheet.getCell("A1").text, /2026-02/);
  assert.equal(sheet.getCell("C5").value, "01");
  assert.equal(sheet.getCell("C6").value, "CN");
  for (const [index, name] of names.entries()) {
    assert.equal(sheet.getCell(7 + index, 2).value, name);
    assert.equal(sheet.getCell(7 + index, 2).type, ExcelJS.ValueType.String);
  }
  assert.equal(sheet.getCell("C7").value, "N");
  assert.equal(sheet.getCell("D7").value, "F");
  assert.equal(sheet.getCell("E7").value, 1.5);
  assert.equal(sheet.getCell("E7").type, ExcelJS.ValueType.Number);
  assert.equal(sheet.getCell("F7").value, null);
  assert.equal(sheet.getCell("G7").value, null);
  assert.equal(sheet.getCell("I7").value, "—");
  assert.equal(sheet.getCell("F7").fill.fgColor.argb, "FFEDF4D6");
  assert.equal(sheet.getCell("E7").fill.fgColor.argb, "FFEDF4D6");
  assert.notDeepEqual(sheet.getCell("E16").fill, sheet.getCell("E7").fill);
  assert.equal(sheet.getCell("D16").value, null);
  assert.equal(sheet.getCell("E16").value, 2);
  assert.match(sheet.getCell("A4").text, /Công.*công/);
  assert.match(sheet.getCell("A13").text, /Tăng ca.*giờ/);
  for (const [first, last, total, value] of [
    [7, 9, 10, 1.5],
    [16, 18, 19, 2],
  ]) {
    for (let row = first; row <= last; row++)
      formula(
        sheet.getCell(row, 31),
        `SUM(C${row}:AD${row})`,
        row === first ? value : 0,
      );
    for (let col = 3; col <= 30; col++) {
      const letter = sheet.getColumn(col).letter;
      formula(
        sheet.getCell(total, col),
        `SUM(${letter}${first}:${letter}${last})`,
        col === 5 ? value : 0,
      );
    }
    formula(sheet.getCell(total, 31), `SUM(AE${first}:AE${last})`, value);
  }
  const zip = await JSZip.loadAsync(bytes);
  assert.match(
    await zip.file("xl/workbook.xml").async("string"),
    /fullCalcOnLoad="1"/,
  );
  assert.match(
    await zip.file("xl/worksheets/sheet1.xml").async("string"),
    /<f>SUM\(C8:AD8\)<\/f><v>0<\/v>/,
  );
  assert.equal(sheet.sheetProtection, undefined);
});
test("empty months and Gregorian 28–31-day headers including year0001 stay text with zero SUM caches", async () => {
  assert.equal(
    typeof module?.buildAttendanceWorkbook,
    "function",
    "Task9 workbook builder must exist",
  );
  for (const [month, days] of [
    ["0001-02", 28],
    ["2024-02", 29],
    ["2026-04", 30],
    ["9999-01", 31],
  ]) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      await module.buildAttendanceWorkbook(fixture(month, true)),
    );
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.getCell(5, days + 2).value, String(days));
    formula(sheet.getCell(7, days + 3), "SUM(0)", 0);
    assert.match(sheet.getCell("A1").text, new RegExp(month));
  }
});
