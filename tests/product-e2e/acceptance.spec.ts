import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { selectionFixture } from "./selection-fixture.ts";

export async function runAcceptance(s, browser) {
  const f = await selectionFixture(s, browser);
  const [page] = f.pages;
  const results = [];
  const pass = (name) => {
    results.push({ name, result: "PASS" });
    console.log(`PASS ${name}`);
  };
  try {
    const anon = await browser.newContext();
    try {
      for (const [path, method, data] of [
        ["/attendance/month?month=2026-10", "GET", undefined],
        [
          "/attendance/search",
          "POST",
          { month: "2026-10", q: "", page: 1, pageSize: 25 },
        ],
        ["/attendance/export?month=2026-10", "GET", undefined],
        ["/attendance/changes", "POST", {}],
      ])
        assert.equal(
          (
            await anon.request.fetch(`${s.webOrigin}/api/v1${path}`, {
              method,
              headers: { origin: s.webOrigin },
              ...(data ? { data } : {}),
            })
          ).status(),
          401,
        );
    } finally {
      await anon.close();
    }
    assert.equal(
      (await f.sql.pool.query('SELECT count(*)::int n FROM "User"')).rows[0].n,
      2,
    );
    await expect(page.getByText(/Chưa có nhân sự/).first()).toBeVisible();
    pass(
      "AC01 two fake accounts and anonymous month/write/export401; empty UI",
    );
    await page.getByLabel("Họ và tên", { exact: true }).fill("Nhân sự mốc giả");
    await page.getByLabel("Ngày bắt đầu", { exact: true }).fill("2026-10-15");
    await page.getByLabel("Ngày kết thúc", { exact: true }).fill("2026-10-20");
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/employees") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Lưu nhân sự", exact: true })
      .click();
    assert.equal((await created).status(), 201);
    const employee = await (await created).json();
    await f.reload(page);
    for (const [date, text] of [
      ["14", "N"],
      ["21", "—"],
    ]) {
      const cell = page.locator(
        `[aria-label*="ID ${employee.id}"][aria-label*="2026-10-${date}"]`,
      );
      await expect(cell).toHaveText(text);
    }
    await expect(f.button(page, employee, "15")).toHaveText("");
    await expect(f.button(page, employee, "20")).toBeEnabled();
    await page.getByLabel("Tháng chấm công").fill("2026-11");
    await expect(page.getByText(/Chưa có nhân sự/).first()).toBeVisible();
    await page.getByLabel("Tháng chấm công").fill("2026-10");
    await f.reload(page);
    pass(
      "AC05/06 UI create selected start/end inclusive; N/empty/— and next-month absence",
    );
    const longName = "Nguyễn thử Unicode " + "Tên dài ".repeat(20);
    const person = await f.create(longName);
    await f.reload(page);
    const save = async (raw, kind = "work", valid = true) => {
      if (kind === "overtime")
        await page.getByRole("tab", { name: /Tăng ca/ }).click();
      await f
        .button(page, person, "16", kind === "work" ? "Công" : "Tăng ca")
        .click();
      await page
        .getByRole("button", { name: "Tùy chỉnh", exact: true })
        .click();
      const input = page.getByLabel(
        kind === "work" ? "Số công tùy chỉnh" : "Số giờ tùy chỉnh",
      );
      await input.fill(raw);
      const before = f.writes.length;
      await page.getByRole("button", { name: "Lưu", exact: true }).click();
      if (valid) {
        await expect(
          page.getByText("Đã lưu ô.", { exact: false }),
        ).toBeVisible();
        assert.equal(f.writes.length - before, 1);
      } else {
        await expect(input).toHaveValue(raw);
        assert.equal(f.writes.length, before);
        await page
          .getByRole("button", { name: "Hủy", exact: true })
          .last()
          .click();
        await page
          .getByRole("button", {
            name: "Bỏ phần nhập và tiếp tục",
            exact: true,
          })
          .click();
      }
    };
    await save("30.5", "work", false);
    await save("3,25", "work", false);
    await save("30");
    assert.equal((await f.sqlCells(person))[0].halfUnits, 60);
    await save("0,0");
    assert.equal((await f.sqlCells(person))[0].valueType, "absence");
    await save("3.5");
    await save("24.5", "overtime", false);
    await save("24", "overtime");
    await f.fresh(page);
    await expect(f.button(page, person, "16")).toHaveText("3,5");
    const rows = await f.sqlCells(person);
    assert.deepEqual(rows.map((r) => [r.kind, r.halfUnits]).sort(), [
      ["overtime", 48],
      ["work", 7],
    ]);
    pass(
      "AC02/11/14/16/17/18 custom limits/raw retained/no request; zero F; decimal comma; reload and new SQL pool separate units",
    );
    await f.create("Nhân sự lịch giả", { startDate: "1899-01-01" });
    for (const [month, days] of [
      ["1900-02", 28],
      ["2000-02", 29],
      ["2024-02", 29],
      ["2026-02", 28],
      ["2026-04", 30],
      ["2026-10", 31],
    ]) {
      // Explicit coordinator full-contract calendar oracle, not browser traffic.
      const response = await f.request(
        `/attendance/month?month=${month}`,
        undefined,
        1,
        "GET",
      );
      assert.equal(response.status(), 200);
      const snapshot = await response.json();
      assert.equal(snapshot.totals.work.byDate.length, days);
      assert.equal(snapshot.totals.overtime.byDate.length, days);
      await page.getByLabel("Tháng chấm công").fill(month);
      await expect(page.locator(".grid-scroll thead th")).toHaveCount(days + 2);
    }
    pass(
      "AC07 actual API and rendered UI 28/29/30/31 days including Gregorian 1900/2000",
    );
    await writeFile(
      resolve(s.runDir, "acceptance-results.json"),
      JSON.stringify(results, null, 2),
    );
  } finally {
    await f.close();
  }
}
