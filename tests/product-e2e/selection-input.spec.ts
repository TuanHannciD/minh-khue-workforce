import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { selectionFixture } from "./selection-fixture.ts";

export async function runSelectionInput(s, browser) {
  const f = await selectionFixture(s, browser, {
      viewport: { width: 1200, height: 850 },
      hasTouch: true,
    }),
    [a] = f.pages;
  const evidence = [];
  const pass = (name) => {
    evidence.push({ name, result: "PASS" });
    process.stdout.write(`PASS ${name}\n`);
  };
  try {
    const person = await f.create("A Task8 gesture giả");
    await f.reload(a);
    // Real browser mouse drag produces preview only, then a disjoint append.
    const drag = async (from, to, modifiers = []) => {
      await from.scrollIntoViewIfNeeded();
      const first = await from.boundingBox(),
        last = await to.boundingBox();
      for (const key of modifiers) await a.keyboard.down(key);
      await a.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
      await a.mouse.down();
      await a.mouse.move(last.x + last.width / 2, last.y + last.height / 2, {
        steps: 6,
      });
      await a.mouse.up();
      for (const key of modifiers) await a.keyboard.up(key);
    };
    await drag(f.button(a, person, "02"), f.button(a, person, "04"));
    await expect(a.getByLabel("Nhập vùng")).toContainText("3 ô chọn");
    await drag(f.button(a, person, "06"), f.button(a, person, "08"), [
      "Control",
    ]);
    await expect(a.getByLabel("Nhập vùng")).toContainText("6 ô chọn");
    assert.equal(f.writes.length, 0);
    const grid = a.locator(".grid-scroll");
    await grid.evaluate((el) => el.scrollTo(0, 0));
    const first = await f.button(a, person, "02").boundingBox(),
      edge = await grid.boundingBox();
    await a.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await a.mouse.down();
    await a.mouse.move(edge.x + edge.width - 8, first.y + first.height / 2, {
      steps: 8,
    });
    await expect
      .poll(() => grid.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
    await a.keyboard.press("Escape");
    await a.mouse.up();
    await expect(a.getByLabel("Nhập vùng")).toContainText("6 ô chọn");
    assert.equal(f.writes.length, 0);
    await a.keyboard.press("Escape");
    pass(
      "real mouse rectangle and Ctrl append retain exact union; pointer release emits no write",
    );

    await f.fresh(a);
    await a.getByRole("button", { name: "Chọn nhiều", exact: true }).click();
    await a.getByLabel("Cách chọn ô").selectOption("range");
    await f.button(a, person, "10").focus();
    await a.keyboard.press("Enter");
    await f.button(a, person, "12").focus();
    await a.keyboard.press("Enter");
    await expect(a.getByLabel("Nhập vùng")).toContainText("3 ô chọn");
    await a.getByLabel("Số công áp dụng", { exact: true }).fill("3,25");
    await a.getByRole("tab", { name: "Tăng ca", exact: true }).click();
    await expect(a.getByRole("alertdialog")).toBeVisible();
    await a.keyboard.press("Escape");
    await expect(a.getByLabel("Số công áp dụng", { exact: true })).toHaveValue(
      "3,25",
    );
    await expect(
      a.getByRole("tab", { name: "Công", exact: true }),
    ).toHaveAttribute("data-state", "active");
    await expect(
      a.getByRole("tab", { name: "Tăng ca", exact: true }),
    ).toBeFocused();
    assert.equal(f.writes.length, 0);
    pass(
      "keyboard two endpoints and Keep/Escape guard preserve raw, unit, focus and batch identities",
    );
    // Synthetic touch precise boundaries are tested with an installed browser
    // clock. This is explicitly not trusted iPhone/Android native-pan evidence.
    await f.fresh(a);
    const clockStart = new Date();
    await a.clock.install({ time: clockStart });
    await a.clock.pauseAt(new Date(clockStart.getTime() + 1000));
    const fire = async (
      type,
      day,
      x = 10,
      y = 10,
      two = false,
      cancelable = true,
    ) => {
      await f.button(a, person, day).evaluate(
        (element, args) => {
          const touch = new Touch({
            identifier: 1,
            target: element,
            clientX: args.x,
            clientY: args.y,
          });
          const touches =
            args.type === "touchend" || args.type === "touchcancel"
              ? []
              : [
                  touch,
                  ...(args.two
                    ? [
                        new Touch({
                          identifier: 2,
                          target: element,
                          clientX: args.x + 10,
                          clientY: args.y,
                        }),
                      ]
                    : []),
                ];
          element.dispatchEvent(
            new TouchEvent(args.type, {
              bubbles: true,
              cancelable: args.cancelable,
              touches,
              changedTouches: [touch],
            }),
          );
        },
        { type, x, y, two, cancelable },
      );
    };
    await fire("touchstart", "02");
    await a.clock.runFor(449);
    await expect(a.getByLabel("Nhập vùng")).toHaveCount(0);
    await a.clock.runFor(1);
    await expect(a.locator(".selection-dragging")).toHaveCount(1);
    await fire("touchend", "02");
    await expect(a.getByLabel("Nhập vùng")).toContainText("1 ô chọn");
    await fire("touchstart", "05");
    await fire("touchmove", "05", 21, 10);
    await fire("touchmove", "05", 10, 10);
    await a.clock.runFor(500);
    await fire("touchend", "05");
    await expect(a.getByLabel("Nhập vùng")).toContainText("1 ô chọn");
    assert.equal(f.writes.length, 0);
    await fire("touchstart", "07");
    await fire("touchmove", "07", 20, 10);
    await a.clock.runFor(450);
    await expect(a.locator(".selection-dragging")).toHaveCount(1);
    await fire("touchcancel", "07");
    await expect(a.getByLabel("Nhập vùng")).toContainText("1 ô chọn");
    await fire("touchstart", "09");
    await a.clock.runFor(450);
    await fire("touchstart", "09", 10, 10, true);
    await expect(a.locator(".selection-dragging")).toHaveCount(0);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.sqlCells(person)).length, 0);
    pass(
      "synthetic TouchEvent449/450ms and10/11px, cancel/multitouch restore selection and no writes (not trusted device)",
    );
    await grid.evaluate((el) => {
      el.scrollTo(0, 0);
      el.scrollIntoView({ block: "center" });
    });
    const edgeTouch = await grid.evaluate((el) => {
      const total = el.querySelector("tbody td.total").getBoundingClientRect();
      const x = total.left - 8,
        y = total.top + total.height / 2;
      const cell = document.elementFromPoint(x, y).closest("[data-position]");
      if (
        cell !== document.elementFromPoint(x + 1, y).closest("[data-position]")
      )
        throw new Error("Edge fixture must move inside one displayed cell");
      return { day: cell.dataset.position.split("/")[1].slice(-2), x, y };
    });
    await fire("touchstart", edgeTouch.day, edgeTouch.x, edgeTouch.y);
    await a.clock.runFor(466);
    assert.equal(await grid.evaluate((el) => el.scrollLeft), 0);
    await fire("touchmove", edgeTouch.day, edgeTouch.x + 1, edgeTouch.y);
    await a.clock.runFor(32);
    assert.ok((await grid.evaluate((el) => el.scrollLeft)) > 0);
    await a.keyboard.press("Escape");
    const stoppedAt = await grid.evaluate((el) => el.scrollLeft);
    await a.clock.runFor(60);
    assert.equal(await grid.evaluate((el) => el.scrollLeft), stoppedAt);
    await expect(a.getByLabel("Nhập vùng")).toContainText("1 ô chọn");
    assert.equal(f.writes.length, 0);
    pass(
      "synthetic held touch moves1px within same edge cell and auto-scrolls; stationary hold and Escape leave no writes",
    );
    await a.getByLabel("Số công áp dụng", { exact: true }).fill("3,25");
    await fire("touchstart", "05");
    await a.clock.runFor(449);
    await expect(a.getByRole("alertdialog")).toHaveCount(0);
    await fire("touchmove", "05", 21, 10);
    await fire("touchmove", "05", 10, 10);
    await a.clock.runFor(500);
    await fire("touchend", "05");
    await expect(a.getByRole("alertdialog")).toHaveCount(0);
    await expect(a.getByLabel("Số công áp dụng", { exact: true })).toHaveValue(
      "3,25",
    );
    await fire("touchstart", "05");
    await fire("touchmove", "05", 20, 10);
    await a.clock.runFor(449);
    await expect(a.getByRole("alertdialog")).toHaveCount(0);
    await a.clock.runFor(1);
    await expect(a.getByRole("alertdialog")).toBeVisible();
    await expect(a.getByLabel("Số công áp dụng", { exact: true })).toHaveValue(
      "3,25",
    );
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    await fire("touchmove", "05", 40, 10);
    await fire("touchend", "05");
    await f.button(a, person, "05").dispatchEvent("click");
    await a.clock.runFor(500);
    await expect(a.getByLabel("Nhập vùng")).toHaveCount(0);
    await expect(
      a.getByRole("button", { name: "Lưu", exact: true }),
    ).toHaveCount(0);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.sqlCells(person)).length, 0);
    pass(
      "synthetic dirty touch449 no guard,11px pan cancels,10px guards only450; discard never replays or writes",
    );
    await a.clock.resume();
    await f.fresh(a);
    await f.patch(person, "03", { type: "number", value: 1.5 }, true);
    await f.reload(a);
    await f.button(a, person, "03").click();
    const handle = a.getByRole("button", {
      name: "Kéo điền từ ô này",
      exact: true,
    });
    const size = await handle.boundingBox();
    assert.equal(size.width, 44);
    assert.equal(size.height, 44);
    await handle.evaluate((el) => {
      const touch = new Touch({
        identifier: 4,
        target: el,
        clientX: el.getBoundingClientRect().x + 5,
        clientY: el.getBoundingClientRect().y + 5,
      });
      el.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [touch],
          changedTouches: [touch],
        }),
      );
    });
    await a.clock.runFor(450);
    await handle.evaluate((el) => {
      const touch = new Touch({ identifier: 4, target: el });
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          changedTouches: [touch],
        }),
      );
    });
    await expect(
      a.getByRole("button", { name: "Điền từ ô này", exact: true }),
    ).toBeVisible();
    assert.equal(f.writes.length, 0);
    pass(
      "coarse-pointer touch handle44px, hold/release without destinations retains source; edge auto-scroll Escape restores union",
    );
    const sourceBefore = (await f.sqlCells(person)).find(
      (c) => c.date === "2026-10-03",
    );
    await handle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = new Touch({
        identifier: 5,
        target: el,
        clientX: r.x + 5,
        clientY: r.y + 5,
      });
      el.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [t],
          changedTouches: [t],
        }),
      );
    });
    await a.clock.runFor(450);
    await f.button(a, person, "05").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = new Touch({
        identifier: 5,
        target: el,
        clientX: r.x + r.width / 2,
        clientY: r.y + r.height / 2,
      });
      el.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [t],
          changedTouches: [t],
        }),
      );
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          changedTouches: [t],
        }),
      );
    });
    await expect(a.getByLabel("Nhập vùng")).toContainText("2 ô chọn");
    assert.equal(f.writes.length, 0);
    await f.apply(a);
    assert.deepEqual(
      f.writes[0].targets.map((c) => c.date),
      ["2026-10-04", "2026-10-05"],
    );
    const filled = await f.sqlCells(person);
    assert.deepEqual(
      filled.find((c) => c.date === "2026-10-03"),
      sourceBefore,
    );
    assert.deepEqual(
      filled
        .filter((c) => ["2026-10-04", "2026-10-05"].includes(c.date))
        .map((c) => [c.halfUnits, c.reminder]),
      [
        [3, false],
        [3, false],
      ],
    );
    pass(
      "synthetic touch handle repeat fill previews exact two targets; only Apply persists real PG and keeps source/reminders",
    );
    await f.fresh(a);
    await f.button(a, person, "03").click();
    await a.getByRole("button", { name: "Điền từ ô này", exact: true }).click();
    await a.getByRole("button", { name: "2", exact: true }).click();
    await f.apply(a, 200, "Lưu");
    await expect(a.getByText(/Chọn ô cuối bằng/)).toHaveCount(0);
    await expect(f.button(a, person, "03")).toBeFocused();
    await f.button(a, person, "06").click();
    await expect(a.getByLabel("Nhập vùng")).toHaveCount(0);
    await expect(a.locator(".editor")).toContainText("06/10/2026");
    assert.equal(
      (await f.sqlCells(person)).find((c) => c.date === "2026-10-03").halfUnits,
      4,
    );
    await f.fresh(a);
    await f.button(a, person, "03").click();
    await a.getByRole("button", { name: "Điền từ ô này", exact: true }).click();
    await a.getByRole("button", { name: "1", exact: true }).click();
    await f.patch(person, "03", { type: "number", value: 2.5 }, true);
    await f.apply(a, 409, "Lưu");
    await f.reconcile(a);
    await f.apply(a, 200, "Lưu bản nháp sau đối chiếu");
    await expect(a.getByText(/Chọn ô cuối bằng/)).toHaveCount(0);
    await expect(f.button(a, person, "03")).toBeFocused();
    await f.button(a, person, "07").click();
    await expect(a.getByLabel("Nhập vùng")).toHaveCount(0);
    await expect(a.locator(".editor")).toContainText("07/10/2026");
    const completed = await f.sqlCells(person);
    assert.equal(completed.find((c) => c.date === "2026-10-03").halfUnits, 2);
    assert.equal(
      completed.filter((c) => ["2026-10-06", "2026-10-07"].includes(c.date))
        .length,
      0,
    );
    pass(
      "real single Save and explicit conflict recovery end pending fill, restore source focus, next ordinary click opens one cell; SQL no stale fill",
    );
    await writeFile(
      resolve(s.runDir, "selection-input.json"),
      JSON.stringify(evidence, null, 2),
    );
  } finally {
    await f.close();
  }
}
