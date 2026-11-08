import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";
import { withCleanup } from "../../scripts/product/cleanup.mjs";
import { matchesAttendancePageRead } from "./attendance-read-matchers.ts";
import type { PageReadCriteria } from "./attendance-read-matchers.ts";

const defaultCriteria: PageReadCriteria = {
  month: "2026-10",
  q: "",
  page: 1,
  pageSize: 25,
};

// Scoped fixture transport; secrets only in coordinator/browser memory. Every
// successful mutation uses the real API, every SQL check uses a new pool.
export async function selectionFixture(s, browser, options = {}) {
  const contexts = [];
  let sql;
  try {
    contexts.push(await browser.newContext(options));
    contexts.push(await browser.newContext(options));
    for (const [i, context] of contexts.entries()) {
      const response = await context.request.post(
        `${s.webOrigin}/api/v1/auth/login`,
        { headers: { origin: s.webOrigin }, data: s.accounts[i] },
      );
      assert.equal(response.status(), 200);
    }
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const readTraffic = { browserFullGets: 0, searchReads: 0 };
    for (const page of pages) {
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path === "/api/v1/attendance/month") readTraffic.browserFullGets++;
        if (path === "/api/v1/attendance/search") readTraffic.searchReads++;
      });
      await page.goto(s.webOrigin);
      await expect(
        page.getByRole("heading", { name: "Bảng chấm công" }),
      ).toBeVisible();
      await page.getByLabel("Tháng chấm công").fill("2026-10");
    }
    sql = await openSandboxTarget(s.targetFile, s.alias);
    const writes = [];
    pages[0].on("request", (r) => {
      if (r.url().endsWith("/attendance/changes"))
        writes.push(r.postDataJSON());
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
      // Coordinator-only full-month CAS/setup oracle; never a browser reload.
      const r = await request(
        "/attendance/month?month=2026-10",
        undefined,
        1,
        "GET",
      );
      assert.equal(r.status(), 200);
      return r.json();
    }
    async function patch(
      employee,
      date,
      value,
      reminder = false,
      kind = "work",
    ) {
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
    async function assertDisplayed(page, body) {
      const p = body.pagination;
      const nav = page.getByRole("navigation", { name: "Phân trang đầu bảng" });
      await expect(nav).toContainText(
        `Trang ${p.totalPages ? p.page : 0} / ${p.totalPages}`,
      );
      await expect(nav).toContainText(
        `${p.from}–${p.to} / ${p.totalResults.toLocaleString("vi-VN")}`,
      );
      await expect(page.getByLabel("Tháng chấm công")).toHaveValue(body.month);
      await expect(nav.getByLabel("Số nhân sự mỗi trang")).toHaveValue(
        String(p.pageSize),
      );
      await expect
        .poll(() =>
          page
            .locator(".grid-scroll tbody tr")
            .evaluateAll((rows) =>
              rows
                .map(
                  (row) =>
                    row
                      .querySelector("button[data-cell]")
                      ?.getAttribute("data-cell")
                      ?.split("/")[0],
                )
                .filter(Boolean),
            ),
        )
        .toEqual(body.employees.map((e) => e.id));
    }
    async function awaitRead(page, criteria, trigger) {
      const response = page.waitForResponse(
        (r) =>
          matchesAttendancePageRead(r.request(), criteria) &&
          r.status() === 200,
      );
      await trigger();
      await assertDisplayed(page, await (await response).json());
    }
    async function reload(
      page,
      criteria: PageReadCriteria = defaultCriteria,
    ): Promise<void> {
      await awaitRead(page, criteria, async () => {
        await page
          .getByRole("button", { name: "Tải lại bảng", exact: true })
          .click();
      });
    }
    async function fresh(
      page,
      criteria: PageReadCriteria = defaultCriteria,
    ): Promise<void> {
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Bảng chấm công" }),
      ).toBeVisible();
      const month = page.getByLabel("Tháng chấm công");
      let current = { ...defaultCriteria, month: await month.inputValue() };
      await expect(
        page.getByRole("navigation", { name: "Phân trang đầu bảng" }),
      ).toBeVisible();
      if (current.month !== criteria.month) {
        current = { ...current, month: criteria.month };
        await awaitRead(page, current, () => month.fill(criteria.month));
      }
      if (criteria.q) {
        current = { ...current, q: criteria.q };
        await page.getByRole("searchbox").fill(criteria.q);
        await awaitRead(page, current, () =>
          page.getByRole("searchbox").press("Enter"),
        );
      }
      const nav = page.getByRole("navigation", { name: "Phân trang đầu bảng" });
      if (criteria.pageSize !== 25) {
        current = { ...current, pageSize: criteria.pageSize };
        await awaitRead(page, current, () =>
          nav
            .getByLabel("Số nhân sự mỗi trang")
            .selectOption(String(criteria.pageSize)),
        );
      }
      if (criteria.page !== 1) {
        current = { ...current, page: criteria.page };
        await nav
          .getByLabel("Đến trang", { exact: true })
          .fill(String(criteria.page));
        await awaitRead(page, current, () =>
          nav.getByRole("button", { name: "Đi", exact: true }).click(),
        );
      }
      await reload(page, criteria);
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
      readTraffic,
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
        await withCleanup(
          () => {
            assert.equal(
              readTraffic.browserFullGets,
              0,
              "browser full GET fallback forbidden",
            );
          },
          ...contexts.map((c) => () => c.close()),
          () => sql.pool.end(),
        );
      },
    };
  } catch (error) {
    await withCleanup(
      () => {
        throw error;
      },
      ...contexts.map((c) => () => c.close()),
      () => sql?.pool.end(),
    );
  }
}
