import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { matchesAttendancePageRead } from "./attendance-read-matchers.ts";
import { withCleanup } from "../../scripts/product/cleanup.mjs";
const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const ExcelJS = requireApi("exceljs");

export async function runExport(s, browser) {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const anonymous = await browser.newContext();
  let operationError;
  try {
    assert.equal(
      (
        await anonymous.request.get(
          `${s.webOrigin}/api/v1/attendance/export?month=2026-02`,
        )
      ).status(),
      401,
    );
    assert.equal(
      (
        await context.request.post(`${s.webOrigin}/api/v1/auth/login`, {
          headers: { origin: s.webOrigin },
          data: s.accounts[0],
        })
      ).status(),
      200,
    );
    const request = (
      path,
      data,
      method = data === undefined ? "GET" : "POST",
    ) =>
      context.request.fetch(`${s.webOrigin}/api/v1${path}`, {
        method,
        headers: { origin: s.webOrigin },
        ...(data === undefined ? {} : { data }),
      });
    const employee = await (
      await request("/employees", {
        name: "=Nguyễn thử Excel",
        startDate: "2026-02-02",
        endDate: "2026-02-04",
      })
    ).json();
    const key = (date, kind) => ({
      employeeId: employee.id,
      date: `2026-02-${date}`,
      kind,
    });
    async function save(date, kind, value, reminder = false) {
      // Coordinator-only saved full-month CAS oracle, not a browser read.
      const month = await (
        await request("/attendance/month?month=2026-02")
      ).json();
      const cell = month.cells.find(
        (c) => c.date === `2026-02-${date}` && c.kind === kind,
      );
      const response = await request("/attendance/changes", {
        month: "2026-02",
        expectedEmployees: [
          { employeeId: employee.id, expectedRevision: employee.revision },
        ],
        targets: [{ ...key(date, kind), expectedRevision: cell.revision }],
        operation: { type: "patch-cell", patch: { value, reminder } },
      });
      assert.equal(response.status(), 200);
    }
    await save("02", "work", { type: "absence" });
    await save("03", "work", { type: "number", value: 1.5 }, true);
    await save("04", "work", null, true);
    await save("03", "overtime", { type: "number", value: 2 });
    const page = await context.newPage();
    const writes = [];
    // The boot month is the browser's current local calendar, before October/
    // February changes. Read it from the actual input, without logging secrets.
    let searchReads = 0;
    let browserFullGets = 0;
    // Capture the browser's local boot calendar before attaching the listener,
    // then verify it against the actual input after navigation.
    const bootMonth = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    });
    page.on("request", (r) => {
      const path = new URL(r.url()).pathname;
      if (path === "/api/v1/attendance/month") browserFullGets++;
      if (
        [bootMonth, "2026-02"].some((month) =>
          matchesAttendancePageRead(r, { month, q: "", page: 1, pageSize: 25 }),
        )
      ) {
        searchReads++;
      } else if (r.method() !== "GET") writes.push(path);
    });
    await page.goto(s.webOrigin);
    await expect(
      page.getByRole("heading", { name: "Bảng chấm công" }),
    ).toBeVisible();
    assert.equal(
      await page.getByLabel("Tháng chấm công").inputValue(),
      bootMonth,
    );
    await page.getByLabel("Tháng chấm công").fill("2026-02");
    await page
      .locator(`button[data-cell="${employee.id}/2026-02-03/work"]`)
      .click();
    await page.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await page.getByLabel("Số công tùy chỉnh").fill("3,25");
    // Change saved state after the browser snapshot/draft. Export must read the
    // server again and must never send the invalid raw draft or auto-save it.
    await save("03", "work", { type: "number", value: 2.5 }, true);
    await save("03", "overtime", { type: "number", value: 4 });
    let attempt = 0;
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    await page.route("**/api/v1/attendance/export?*", async (route) => {
      if (++attempt === 1)
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "EXPORT_FAILED", message: "Thử lỗi tải giả." },
          }),
        });
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Xuất Excel", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Chưa tải được tệp Excel" }),
    ).toBeVisible();
    assert.equal(attempt, 1);
    await expect(page.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Thử xuất lại" }).click();
    await expect(
      page.getByRole("button", { name: "Đang nhận tệp…" }),
    ).toBeDisabled();
    await expect(page.getByText(/Đã nhận tệp/)).toHaveCount(0);
    release();
    const download = await downloaded;
    assert.equal(await download.failure(), null);
    assert.equal(download.suggestedFilename(), "minh-khue-2026-02.xlsx");
    const path = resolve(s.runDir, "browser-download.xlsx");
    await download.saveAs(path);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.worksheets[0];
    assert.equal(workbook.worksheets.length, 1);
    assert.equal(sheet.getCell("B7").value, "=Nguyễn thử Excel");
    assert.equal(sheet.getCell("D7").value, "F");
    assert.equal(sheet.getCell("C7").value, "N");
    assert.equal(sheet.getCell("G7").value, "—");
    assert.equal(sheet.getCell("F7").value, null);
    assert.equal(sheet.getCell("F7").fill.fgColor.argb, "FFEDF4D6");
    assert.equal(sheet.getCell("E7").value, 2.5);
    assert.equal(sheet.getCell("E14").value, 4);
    assert.equal(sheet.getCell("D14").value, null);
    assert.equal(sheet.getCell("AE7").formula, "SUM(C7:AD7)");
    assert.equal(sheet.getCell("AE8").result, 2.5);
    assert.equal(sheet.getCell("AE15").result, 4);
    await expect(page.getByText(/Đã nhận tệp/)).toBeVisible();
    await expect(page.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    assert.deepEqual(writes, []);
    assert(searchReads > 0);
    assert.equal(browserFullGets, 0);
    const { rows } = await s.pool.query(
      'SELECT "halfUnits", reminder, kind::text, to_char(date, \'YYYY-MM-DD\') AS date FROM "AttendanceCell" ORDER BY date, kind::text',
    );
    assert.equal(
      rows.find((c) => c.kind === "work" && c.date === "2026-02-03").halfUnits,
      5,
    );
    assert.equal(rows.find((c) => c.kind === "overtime").halfUnits, 8);
    await page.screenshot({ path: resolve(s.runDir, "export-desktop.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("button", { name: "Xuất Excel", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(s.runDir, "export-mobile.png") });
    await writeFile(
      resolve(s.runDir, "export-e2e.json"),
      JSON.stringify(
        {
          browser: browser.version(),
          layers:
            "built web–Nest–PostgreSQL + independent SQL + browser download + ExcelJS parse",
          assertions: [
            "anonymous401",
            "pending/error/manual-retry",
            "body-before-handoff",
            "server-snapshot-not-cache",
            "invalid-draft-preserved-no-write",
            "formula/cache/style/text",
            "375/1280",
          ],
          readerRecalc: "Not run",
          searchReads,
          browserFullGets,
          unexpectedNonGetRequests: writes,
          sql: rows,
        },
        null,
        2,
      ),
    );
    console.log(
      "Export E2E passed: authenticated browser download, server snapshot, no draft write, retry/pending, typed formulas/style, anonymous401 and independent SQL.",
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    await withCleanup(
      () => {
        if (operationError) throw operationError;
      },
      () => context.close(),
      () => anonymous.close(),
    );
  }
}
