import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { selectionFixture } from "./selection-fixture.ts";
import { withCleanup } from "../../scripts/product/cleanup.mjs";

export async function runBulkPreviewR1(s, browser) {
  const f = await selectionFixture(s, browser);
  const [page] = f.pages;
  const assertions = [];
  await withCleanup(
    async () => {
      const person = await f.create("Preview R1 giả", {
        startDate: "2026-10-02",
        endDate: "2026-10-30",
      });
      await f.patch(person, "02", { type: "number", value: 1 }, true);
      await f.patch(person, "03", { type: "absence" });
      await f.patch(person, "04", null, true);
      await f.fresh(page);
      // Fill range includes source, one occupied F, reminder-only and blank.
      const before = await f.sqlCells(person);
      await f.fill(page, person, "02", person, "05");
      await expect(page.getByText(/Giữ nguyên 1 ô đã có số\/F/)).toBeVisible();
      await page.getByLabel("Chế độ áp dụng").selectOption("replace");
      await expect(
        page.getByText(/Ghi đè nội dung của 1 ô đã có số\/F/),
      ).toBeVisible();
      assert.equal(f.writes.length, 0);
      assert.deepEqual(await f.sqlCells(person), before);
      await page.screenshot({
        path: resolve(s.runDir, "bulk-preview-replace-r1.png"),
        fullPage: true,
      });
      await f.apply(page);
      assert.equal(f.writes.length, 1);
      const after = await f.sqlCells(person);
      assert.deepEqual(
        after.find((c) => c.date === "2026-10-02"),
        before.find((c) => c.date === "2026-10-02"),
      );
      assert.deepEqual(
        after
          .filter((c) =>
            ["2026-10-03", "2026-10-04", "2026-10-05"].includes(c.date),
          )
          .map((c) => [c.date, c.halfUnits, c.reminder]),
        [
          ["2026-10-03", 2, false],
          ["2026-10-04", 2, true],
          ["2026-10-05", 2, false],
        ],
      );
      assert.equal(f.writes[0].targets.length, 3);
      assertions.push(
        "source excluded/readonly; replace preview occupied1; release previews only; Apply one batch and independent SQL preserves destination reminder",
      );
      await f.fresh(page);
      for (const day of ["02", "03", "04", "05", "06"])
        await f.button(page, person, day).click({ modifiers: ["Control"] });
      const n = page.getByLabel(
        new RegExp(`ID ${person.id}.*2026-10-01.*Công`),
      );
      const dash = page.getByLabel(
        new RegExp(`ID ${person.id}.*2026-10-31.*Công`),
      );
      await n.click({ modifiers: ["Control"] });
      await dash.click({ modifiers: ["Control"] });
      await expect(page.getByText(/Giữ nguyên 4 ô đã có số\/F/)).toBeVisible();
      await expect(
        page.getByRole("status").filter({ hasText: "ô chọn" }),
      ).toContainText("7 ô chọn · 1 ô đủ điều kiện · 2 ô N/— bỏ qua");
      await page.getByLabel("Chế độ áp dụng").selectOption("replace");
      await expect(
        page.getByText(/Ghi đè nội dung của 4 ô đã có số\/F/),
      ).toBeVisible();
      assert.equal(f.writes.length, 1);
      assertions.push(
        "fill-empty/replace count occupied from editable baseline; N/— skipped, mode/selection no write",
      );
      await writeFile(
        resolve(s.runDir, "bulk-preview-r1.json"),
        JSON.stringify(
          { assertions, writes: f.writes.length, browser: browser.version() },
          null,
          2,
        ),
      );
      process.stdout.write(
        "PASS whole-branch R1 bulk occupied preview, source and one atomic batch (real HTTP/DB)\n",
      );
    },
    () => f.close(),
  );
}
