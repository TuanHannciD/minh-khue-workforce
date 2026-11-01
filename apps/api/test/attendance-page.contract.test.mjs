import { test } from "node:test";
import assert from "node:assert/strict";
import * as validation from "../dist/modules/attendance/attendance-validation.js";
import { createDocument } from "../dist/openapi.js";
import { accepts } from "./attendance-contract-schema.mjs";

// Catches omitted defaults, coercion, UTF-16 length checks and relaxed bounds.
test("page_query_defaults_and_strict_bounds", () => {
  assert.equal(typeof validation.parseAttendancePageQuery, "function");
  const parse = validation.parseAttendancePageQuery;
  assert.deepEqual(parse({ month: "2026-10" }), {
    month: "2026-10",
    q: "",
    page: 1,
    pageSize: 25,
  });
  assert.deepEqual(
    parse({
      month: "0001-01",
      q: "\uFEFF \t\n",
      page: 2147483647,
      pageSize: 50,
    }),
    {
      month: "0001-01",
      q: "",
      page: 2147483647,
      pageSize: 50,
    },
  );
  const q = "😀".repeat(200);
  assert.deepEqual(parse({ month: "9999-12", q: `\u00a0${q}\uFEFF` }), {
    month: "9999-12",
    q,
    page: 1,
    pageSize: 25,
  });
  assert.equal(
    parse({ month: "2026-10", q: "  %_\\ Đặng  A  " }).q,
    "%_\\ Đặng  A",
  );
  const rejects = (input) =>
    assert.throws(
      () => parse(input),
      (error) =>
        error.getStatus?.() === 400 &&
        error.getResponse().error.code === "INVALID_INPUT",
    );
  for (const input of [
    null,
    [],
    1,
    "2026-10",
    {},
    { month: null },
    { month: 202610 },
    { month: "0000-01" },
    { month: "2026-13" },
    { month: "2026-1" },
    { month: "2026-10", extra: {} },
  ])
    rejects(input);
  for (const q of [
    null,
    1,
    true,
    {},
    [],
    "😀".repeat(201),
    ` ${"a".repeat(201)} `,
  ])
    rejects({ month: "2026-10", q });
  for (const page of [
    0,
    -1,
    1.5,
    2147483648,
    "1",
    null,
    true,
    {},
    [],
    NaN,
    Infinity,
  ])
    rejects({ month: "2026-10", page });
  for (const pageSize of [
    0,
    20,
    100,
    25.5,
    "25",
    null,
    true,
    {},
    [],
    NaN,
    Infinity,
  ])
    rejects({ month: "2026-10", pageSize });
});

// A final partial page has one employee, full-month row totals and global totals.
// It must never be accepted by the legacy full-month consumer.
test("partial_page_is_not_month_contract", async () => {
  const document = await createDocument();
  const schemas = document.components.schemas;
  assert.ok(
    schemas.AttendancePageDto,
    "page response schema is registered without a route",
  );
  assert.ok(
    schemas.AttendancePageQueryDto,
    "optional wire request schema is registered",
  );
  const employeeId = "00000000-0000-4000-8000-000000000101";
  const dates = Array.from(
    { length: 31 },
    (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
  );
  const page = {
    month: "2026-10",
    fetchedAt: "2026-11-01T00:00:00.000Z",
    pagination: {
      requestedPage: 40,
      page: 40,
      pageSize: 25,
      totalResults: 976,
      monthEmployeeCount: 1000,
      totalPages: 40,
      from: 976,
      to: 976,
    },
    employees: [
      {
        id: employeeId,
        name: "Fixture page",
        startDate: "2026-10-01",
        endDate: null,
        revision: "employee-r1",
      },
    ],
    cells: dates.flatMap((date) =>
      ["work", "overtime"].map((kind) => ({
        employeeId,
        date,
        kind,
        value:
          date === "2026-10-01"
            ? { type: "number", value: kind === "work" ? 1.5 : 2 }
            : null,
        reminder: false,
        revision: date === "2026-10-01" ? "cell-r1" : "0",
        state: "editable",
      })),
    ),
    employeeTotals: {
      work: [{ employeeId, value: 1.5 }],
      overtime: [{ employeeId, value: 2 }],
    },
    monthTotals: {
      work: {
        byDate: dates.map((date) => ({
          date,
          value: date === "2026-10-01" ? 10 : 0,
        })),
        grandTotal: 10,
      },
      overtime: {
        byDate: dates.map((date) => ({
          date,
          value: date === "2026-10-01" ? 20 : 0,
        })),
        grandTotal: 20,
      },
    },
  };
  assert.equal(accepts(page, schemas.AttendancePageDto, schemas), true);
  assert.equal(accepts(page, schemas.MonthDto, schemas), false);
  const zero = {
    ...page,
    pagination: {
      requestedPage: 40,
      page: 1,
      pageSize: 50,
      totalResults: 0,
      monthEmployeeCount: 1000,
      totalPages: 0,
      from: 0,
      to: 0,
    },
    employees: [],
    cells: [],
    employeeTotals: { work: [], overtime: [] },
  };
  assert.equal(accepts(zero, schemas.AttendancePageDto, schemas), true);
  for (const [schema, fixture] of [
    [schemas.AttendancePageDto, page],
    [schemas.AttendancePaginationDto, page.pagination],
    [schemas.AttendancePageEmployeeTotalsDto, page.employeeTotals],
    [schemas.AttendancePageMonthTotalsDto, page.monthTotals],
    [schemas.AttendancePageKindTotalsDto, page.monthTotals.work],
  ])
    for (const key of Object.keys(fixture)) {
      const missing = { ...fixture };
      delete missing[key];
      assert.equal(
        accepts(missing, schema, schemas),
        false,
        `${key} is required`,
      );
    }
  for (const invalid of [
    { ...page, totals: {} },
    { ...page, employeeTotals: null },
    { ...page, employeeTotals: { work: [], overtime: [], extra: true } },
    {
      ...page,
      employeeTotals: { work: [{ employeeId, value: "1.5" }], overtime: [] },
    },
    {
      ...page,
      monthTotals: {
        ...page.monthTotals,
        work: { ...page.monthTotals.work, byEmployee: [] },
      },
    },
    {
      ...page,
      monthTotals: {
        ...page.monthTotals,
        overtime: {
          byDate: [{ date: "2026-10-01", value: null }],
          grandTotal: 0,
        },
      },
    },
    { ...page, cells: [{ ...page.cells[0], extra: true }] },
    ...[
      "requestedPage",
      "page",
      "totalResults",
      "monthEmployeeCount",
      "totalPages",
      "from",
      "to",
    ].flatMap((key) =>
      [-1, 1.5, "1", null].map((value) => ({
        ...page,
        pagination: { ...page.pagination, [key]: value },
      })),
    ),
    ...[0, 2147483648].flatMap((value) =>
      ["requestedPage", "page"].map((key) => ({
        ...page,
        pagination: { ...page.pagination, [key]: value },
      })),
    ),
    ...[20, 100, "25", null].map((pageSize) => ({
      ...page,
      pagination: { ...page.pagination, pageSize },
    })),
  ])
    assert.equal(accepts(invalid, schemas.AttendancePageDto, schemas), false);
  for (const input of [
    { month: "2026-10" },
    { month: "2026-10", q: "", page: 2147483647, pageSize: 50 },
  ])
    assert.equal(accepts(input, schemas.AttendancePageQueryDto, schemas), true);
  for (const input of [
    { month: "0000-01" },
    { month: "2026-13" },
    { month: "2026-10", q: null },
    { month: "2026-10", page: "1" },
    { month: "2026-10", page: 1.5 },
    { month: "2026-10", page: 0 },
    { month: "2026-10", page: 2147483648 },
    { month: "2026-10", pageSize: 100 },
    { month: "2026-10", extra: {} },
  ])
    assert.equal(
      accepts(input, schemas.AttendancePageQueryDto, schemas),
      false,
    );
  assert.equal(schemas.AttendancePageQueryDto.properties.q.maxLength, 200);
});
