import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";

// Scoped fixture transport; secrets only in coordinator/browser memory. Every
// successful mutation uses the real API, every SQL check uses a new pool.
export async function selectionFixture(s, browser, options = {}) {
  const contexts = [
    await browser.newContext(options),
    await browser.newContext(options),
  ];
  for (const [i, context] of contexts.entries()) {
    const response = await context.request.post(
      `${s.webOrigin}/api/v1/auth/login`,
      { headers: { origin: s.webOrigin }, data: s.accounts[i] },
    );
    assert.equal(response.status(), 200);
  }
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (const page of pages) {
    await page.goto(s.webOrigin);
    await expect(
      page.getByRole("heading", { name: "Bảng chấm công" }),
    ).toBeVisible();
    await page.getByLabel("Tháng chấm công").fill("2026-10");
  }
  const sql = await openSandboxTarget(s.targetFile, "task8-selection");
  const writes = [];
  pages[0].on("request", (r) => {
    if (r.url().endsWith("/attendance/changes")) writes.push(r.postDataJSON());
  });
  async function request(path, data, actor = 1, method = "POST") {
    return contexts[actor].request.fetch(`${s.webOrigin}/api/v1${path}`, {
      method,
      headers: { origin: s.webOrigin },
      ...(data === undefined ? {} : { data }),
    });
  }
  async function create(name, extra = {}) {
    const response = await request("/employees", {
      name,
      startDate: "2026-10-01",
      endDate: null,
      ...extra,
    });
    assert.equal(response.status(), 201);
    return response.json();
  }
  const key = (employee, date, kind = "work") => ({
    employeeId: employee.id,
    date: `2026-10-${date}`,
    kind,
  });
  async function month() {
    const r = await request(
      "/attendance/month?month=2026-10",
      undefined,
      1,
      "GET",
    );
    assert.equal(r.status(), 200);
    return r.json();
  }
  async function patch(employee, date, value, reminder = false, kind = "work") {
    const current = await month();
    const cell = current.cells.find(
      (c) =>
        c.employeeId === employee.id &&
        c.date === `2026-10-${date}` &&
        c.kind === kind,
    );
    const person = current.employees.find((e) => e.id === employee.id);
    const r = await request("/attendance/changes", {
      month: "2026-10",
      expectedEmployees: [
        { employeeId: employee.id, expectedRevision: person.revision },
      ],
      targets: [
        { ...key(employee, date, kind), expectedRevision: cell.revision },
      ],
      operation: { type: "patch-cell", patch: { value, reminder } },
    });
    assert.equal(r.status(), 200);
    return r.json();
  }
  const button = (page, employee, date, kind = "Công") =>
    page.getByRole("button", {
      name: new RegExp(`ID ${employee.id}.*2026-10-${date}.*${kind}`),
    });
  async function reload(page) {
    const response = page.waitForResponse(
      (r) => r.url().includes("/attendance/month?") && r.status() === 200,
    );
    await page
      .getByRole("button", { name: "Tải lại bảng", exact: true })
      .click();
    await response;
  }
  async function fresh(page) {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Bảng chấm công" }),
    ).toBeVisible();
    await page.getByLabel("Tháng chấm công").fill("2026-10");
    await reload(page);
  }
  async function sqlCells(employee) {
    return (
      await sql.pool.query(
        'SELECT date::text,kind,"valueType","halfUnits",reminder,revision FROM "AttendanceCell" WHERE "employeeId"=$1::uuid ORDER BY date,kind',
        [employee.id],
      )
    ).rows;
  }
  async function fill(page, source, date, end, endDate) {
    await button(page, source, date).click();
    await page
      .getByRole("button", { name: "Điền từ ô này", exact: true })
      .click();
    await button(page, end, endDate).click();
    await expect(
      page.getByRole("heading", { name: "Điền lặp từ ô nguồn" }),
    ).toBeVisible();
  }
  async function apply(page, status = 200, label = "Áp dụng") {
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal((await response).status(), status);
  }
  async function reconcile(page) {
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/attendance/reconcile"),
    );
    await page
      .getByRole("button", { name: "Đối chiếu dữ liệu đã lưu", exact: true })
      .click();
    assert.equal((await response).status(), 200);
    return (await response).json();
  }
  return {
    contexts,
    pages,
    sql,
    writes,
    request,
    create,
    key,
    month,
    patch,
    button,
    reload,
    fresh,
    sqlCells,
    fill,
    apply,
    reconcile,
    async close() {
      await Promise.all(contexts.map((c) => c.close()));
      await sql.pool.end();
    },
  };
}
