import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { selectionFixture } from "./selection-fixture.ts";
import { runBulkFence } from "./bulk-fence.spec.ts";
import { matchesAttendancePageRead } from "./attendance-read-matchers.ts";
import { withCleanup } from "../../scripts/product/cleanup.mjs";

export async function runBulkEntry(s, browser) {
  const f = await selectionFixture(s, browser),
    [a] = f.pages;
  const evidence = [];
  let operationError;
  const pass = (name) => {
    evidence.push({ name, result: "PASS" });
    process.stdout.write(`PASS ${name}\n`);
  };
  try {
    const person = await f.create("A Task8 ô rời giả");
    await f.patch(person, "02", null, true);
    await f.reload(a);
    for (const day of ["02", "05", "08"])
      await f.button(a, person, day).click({ modifiers: ["Control"] });
    await f.button(a, person, "05").click({ modifiers: ["Meta"] });
    assert.equal(f.writes.length, 0);
    await a.getByLabel("Số công áp dụng", { exact: true }).fill("1,5");
    await f.apply(a);
    assert.equal(f.writes.length, 1);
    assert.deepEqual(
      f.writes[0].targets.map((c) => c.date),
      ["2026-10-02", "2026-10-08"],
    );
    const saved = await f.sqlCells(person);
    assert.deepEqual(
      saved.map((c) => [c.date, c.halfUnits, c.reminder]),
      [
        ["2026-10-02", 3, true],
        ["2026-10-08", 3, false],
      ],
    );
    assert.equal((await f.month()).totals.work.grandTotal, 3);
    pass(
      "disjoint union/toggle one real atomic batch, reminder and SQL totals exact, no intervening cells",
    );

    await f.fresh(a);
    for (const day of ["10", "12"])
      await f.button(a, person, day).click({ modifiers: ["Control"] });
    await a.getByLabel("Số công áp dụng", { exact: true }).fill("2");
    await f.patch(person, "12", { type: "absence" }, true);
    const before = await f.sqlCells(person),
      count = f.writes.length;
    await f.reload(a); // poll/refetch may not rebase the captured targets
    await f.apply(a, 409);
    assert.deepEqual(await f.sqlCells(person), before);
    const conflict = a.getByRole("list", { name: "Các ô xung đột" });
    await expect(conflict).toContainText(person.id);
    await expect(conflict).toContainText(person.name);
    await expect(conflict).toContainText("2026-10-12");
    await expect(conflict).toContainText("Công");
    await expect(conflict).toContainText("Dữ liệu hiện tại: F · có nhắc");
    await expect(conflict).toContainText("Giá trị bản nháp: 2");
    assert.equal(f.writes.length, count + 1);
    await expect(a.getByLabel("Số công áp dụng", { exact: true })).toHaveValue(
      "2",
    );
    await expect(
      a.getByRole("button", { name: "Áp dụng", exact: true }),
    ).toBeDisabled();
    const read = await f.reconcile(a);
    assert.equal(read.cells.length, 2);
    const comparison = a.getByRole("list", { name: "Các ô đã đối chiếu" });
    await expect(comparison.getByRole("listitem")).toHaveCount(2);
    await expect(comparison).toContainText("2026-10-10");
    await expect(comparison).toContainText("2026-10-12");
    await expect(comparison).toContainText("Dữ liệu hiện tại: F · có nhắc");
    assert.deepEqual(await f.sqlCells(person), before);
    await f.apply(a, 200, "Lưu bản nháp sau đối chiếu");
    const after = await f.sqlCells(person);
    assert.deepEqual(
      after
        .filter((c) => ["2026-10-10", "2026-10-12"].includes(c.date))
        .map((c) => [c.date, c.valueType, c.halfUnits, c.reminder]),
      [
        ["2026-10-10", "number", 4, false],
        ["2026-10-12", "absence", null, true],
      ],
    );
    pass(
      "one stale target rejects every target after refetch; explicit recovery preserves fill-empty and occupied F",
    );

    await f.patch(person, "15", { type: "number", value: 2 }, true);
    await f.patch(person, "16", null, true);
    await f.patch(person, "17", { type: "absence" }, false);
    await f.fresh(a);
    const sourceBefore = (await f.sqlCells(person)).find(
      (c) => c.date === "2026-10-15",
    );
    await f.fill(a, person, "15", person, "18");
    const targetsBefore = f.writes.length;
    await f.apply(a);
    assert.equal(f.writes.length, targetsBefore + 1);
    const fillAfter = await f.sqlCells(person);
    assert.deepEqual(
      fillAfter.find((c) => c.date === "2026-10-15"),
      sourceBefore,
    );
    assert.deepEqual(
      fillAfter
        .filter((c) =>
          ["2026-10-16", "2026-10-17", "2026-10-18"].includes(c.date),
        )
        .map((c) => [c.valueType, c.halfUnits, c.reminder]),
      [
        ["number", 4, true],
        ["absence", null, false],
        ["number", 4, false],
      ],
    );
    pass(
      "forward repeat fill excludes source, keeps destination reminders, skips occupied F and never increments",
    );

    await f.patch(person, "23", { type: "absence" }, true);
    await f.fresh(a);
    await f.fill(a, person, "23", person, "21");
    await a.getByLabel("Chế độ áp dụng").selectOption("replace");
    await f.apply(a);
    const backward = await f.sqlCells(person);
    assert.deepEqual(
      backward
        .filter((c) => ["2026-10-21", "2026-10-22"].includes(c.date))
        .map((c) => [c.valueType, c.halfUnits, c.reminder]),
      [
        ["absence", null, false],
        ["absence", null, false],
      ],
    );
    pass("backward F fill repeats absence and preserves source reminder");

    await f.patch(person, "25", { type: "number", value: 1 }, true);
    await f.fresh(a);
    await f.fill(a, person, "25", person, "27");
    await f.patch(person, "25", { type: "number", value: 3.5 }, false);
    const sourceChanged = await f.sqlCells(person);
    await f.reload(a);
    await f.apply(a, 409);
    assert.deepEqual(await f.sqlCells(person), sourceChanged);
    await expect(a.getByRole("list", { name: "Các ô xung đột" })).toContainText(
      "Nguồn:",
    );
    await expect(a.getByRole("list", { name: "Các ô xung đột" })).toContainText(
      "2026-10-25",
    );
    await expect(a.getByRole("list", { name: "Các ô xung đột" })).toContainText(
      "Dữ liệu hiện tại: 3,5",
    );
    await f.reconcile(a);
    await expect(a.getByText(/Nguồn hiện tại:/)).toContainText("3,5");
    await expect(
      a.getByRole("list", { name: "Các ô đã đối chiếu" }),
    ).toContainText("Giá trị bản nháp: 1");
    await f.apply(a, 200, "Điền giá trị nguồn hiện tại sau đối chiếu");
    const changedAfter = await f.sqlCells(person);
    assert.deepEqual(
      changedAfter.find((c) => c.date === "2026-10-25"),
      sourceChanged.find((c) => c.date === "2026-10-25"),
    );
    assert.deepEqual(
      changedAfter
        .filter((c) => ["2026-10-26", "2026-10-27"].includes(c.date))
        .map((c) => c.halfUnits),
      [7, 7],
    );
    pass(
      "two sessions source change conflicts whole fill; only explicit current-source decision uses new source revision/value",
    );

    await f.fresh(a);
    await f.fill(a, person, "25", person, "27");
    // Both occupied targets are ineligible; no write and no saved/fence claim.
    const zero = f.writes.length;
    await expect(
      a.getByRole("button", { name: "Áp dụng", exact: true }),
    ).toBeDisabled();
    await expect(a.getByText(/Không có ô đủ điều kiện;/)).toBeVisible();
    assert.equal(f.writes.length, zero);
    pass("eligible0 disables Apply without request, saved or false fence");
    await f.patch(
      person,
      "03",
      { type: "number", value: 2.5 },
      true,
      "overtime",
    );
    await f.fresh(a);
    await a.getByRole("tab", { name: "Tăng ca", exact: true }).click();
    await f.button(a, person, "03", "Tăng ca").click();
    await a.getByRole("button", { name: "Điền từ ô này", exact: true }).click();
    await f.button(a, person, "05", "Tăng ca").focus();
    await a.keyboard.press("Enter");
    const overtimeBefore = await f.sqlCells(person),
      writeBefore = f.writes.length;
    await f.apply(a);
    assert.equal(f.writes.length, writeBefore + 1);
    assert.ok(f.writes.at(-1).targets.every((c) => c.kind === "overtime"));
    const overtimeAfter = await f.sqlCells(person);
    assert.deepEqual(
      overtimeAfter.filter((c) => c.kind === "work"),
      overtimeBefore.filter((c) => c.kind === "work"),
    );
    assert.deepEqual(
      overtimeAfter
        .filter((c) => c.kind === "overtime")
        .map((c) => [c.date, c.halfUnits, c.reminder]),
      [
        ["2026-10-03", 5, true],
        ["2026-10-04", 5, false],
        ["2026-10-05", 5, false],
      ],
    );
    assert.equal((await f.month()).totals.overtime.grandTotal, 7.5);
    pass(
      "overtime keyboard fill repeats hours only, work snapshots unchanged, real independent SQL and totals7.5",
    );

    const sourcePerson = await f.create("B Task8 nguồn rời tháng giả");
    const targetPerson = await f.create("C Task8 đích khác người giả");
    await f.patch(sourcePerson, "04", { type: "number", value: 1.5 }, true);
    await f.fresh(a);
    await f.fill(a, sourcePerson, "04", targetPerson, "04");
    await f.patch(sourcePerson, "04", null, false);
    const response = await f.request(
      `/employees/${sourcePerson.id}`,
      { expectedRevision: sourcePerson.revision, startDate: "2026-11-01" },
      1,
      "PATCH",
    );
    assert.equal(response.status(), 200);
    // This response changes membership while the source/targets are frozen.
    // It must be deferred; reload() asserts an adopted envelope and is only
    // appropriate for unchanged membership. Keep the original CAS intent.
    const membershipRead = a.waitForResponse(
      (r) =>
        matchesAttendancePageRead(r.request(), {
          month: "2026-10",
          q: "",
          page: 1,
          pageSize: 25,
        }) && r.status() === 200,
    );
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    const membership = await (await membershipRead).json();
    assert(!membership.employees.some((e) => e.id === sourcePerson.id));
    await a.getByRole("button", { name: "Giữ phần nhập", exact: true }).click();
    await expect(f.button(a, sourcePerson, "04")).toHaveCount(1);
    await f.apply(a, 409);
    const recovered = await f.reconcile(a);
    const source = recovered.cells.find(
      (c) => c.employeeId === sourcePerson.id && c.date === "2026-10-04",
    );
    assert.equal(source.state, "before-start");
    assert.equal(source.value, null);
    assert.notEqual(source.revision, "0");
    await expect(
      a.getByRole("list", { name: "Các ô đã đối chiếu" }),
    ).toContainText("Dữ liệu hiện tại: N");
    await expect(
      a.getByRole("button", {
        name: "Điền giá trị nguồn hiện tại sau đối chiếu",
        exact: true,
      }),
    ).toBeDisabled();
    assert.equal((await f.sqlCells(targetPerson)).length, 0);
    // Only the explicit end of the dirty lifetime adopts the deferred page.
    await a
      .getByLabel("Nhập vùng")
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    await expect(f.button(a, sourcePerson, "04")).toHaveCount(0);
    pass(
      "cleared source employment exits displayed month, reconcile reads original tombstone key, retains draft and never re-adds row or fills N",
    );

    await runBulkFence(s, f, pass);
    await writeFile(
      resolve(s.runDir, "bulk-entry.json"),
      JSON.stringify(evidence, null, 2),
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    await withCleanup(
      () => {
        if (operationError) throw operationError;
      },
      () => f.close(),
    );
  }
}
