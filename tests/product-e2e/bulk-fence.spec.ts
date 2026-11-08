import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { EmploymentConsistency } from "../../apps/api/dist/modules/employees/index.js";
import { pauseMethod } from "../../apps/api/test/attendance-test-client.mjs";

// Delivery faults and a pre-lock scheduling barrier only. PostgreSQL locks,
// CAS and all accepted writes remain the production implementation.
export async function runBulkFence(s, f, pass) {
  const [a, b] = f.pages;
  const person = await f.create("D Task8 no-op fence giả");
  const inactive = await f.create("E Task8 N skip giả", {
    startDate: "2026-10-15",
  });
  await f.patch(person, "12", { type: "absence" }, true);
  await f.fresh(a);
  await f.fresh(b);
  await f.button(b, person, "10").click();
  await b.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
  await b.getByLabel("Số công tùy chỉnh").fill("2");
  let barrier;
  try {
    barrier = pauseMethod(s.app.get(EmploymentConsistency), "lockEmployees");
    const delayed = b.waitForResponse((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await b.getByRole("button", { name: "Lưu", exact: true }).click();
    await barrier.entered;
    await a.getByRole("button", { name: "Chọn nhiều", exact: true }).click();
    for (const [p, day] of [
      [person, "10"],
      [person, "12"],
      [inactive, "01"],
    ])
      await f.button(a, p, day).click();
    const before = await f.sqlCells(person);
    await a.route("**/api/v1/attendance/changes", (r) => r.abort("failed"), {
      times: 1,
    });
    await a.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await expect(a.getByText(/Chưa xác định kết quả lưu/)).toBeVisible();
    await f.reconcile(a);
    assert.deepEqual(await f.sqlCells(person), before); // reading alone is no fence
    const response = a.waitForResponse((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await a
      .getByRole("button", {
        name: "Giữ dữ liệu hiện tại và xác nhận",
        exact: true,
      })
      .click();
    const accepted = await response;
    assert.equal(accepted.status(), 200);
    const body = await accepted.json();
    assert.deepEqual(body.counts, {
      selected: 3,
      eligible: 1,
      skipped: 1,
      changed: 0,
    });
    const after = await f.sqlCells(person);
    const tombstone = after.find((c) => c.date === "2026-10-10");
    assert.equal(tombstone.valueType, "empty");
    assert.notEqual(tombstone.revision, "0");
    assert.deepEqual(
      after.find((c) => c.date === "2026-10-12"),
      before.find((c) => c.date === "2026-10-12"),
    );
    assert.equal((await f.sqlCells(inactive)).length, 0);
    barrier.release();
    assert.equal((await delayed).status(), 409);
    assert.deepEqual(await f.sqlCells(person), after);
    pass(
      "explicit no-op bulk recovery fences only eligible blank target, delayed real write409; occupied/N revisions unchanged",
    );
  } finally {
    barrier?.restore();
  }

  // A response lost after actual commit must keep the draft. Merely reading and
  // discarding it does not roll back the committed batch.
  await f.fresh(a);
  for (const day of ["20", "22"])
    await f.button(a, person, day).click({ modifiers: ["Control"] });
  await a.getByLabel("Số công áp dụng", { exact: true }).fill("2,5");
  await a.route(
    "**/api/v1/attendance/changes",
    async (route) => {
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await a.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(a.getByText(/Chưa xác định kết quả lưu/)).toBeVisible();
  const committed = await f.sqlCells(person);
  assert.deepEqual(
    committed
      .filter((c) => ["2026-10-20", "2026-10-22"].includes(c.date))
      .map((c) => c.halfUnits),
    [5, 5],
  );
  await f.reconcile(a);
  assert.deepEqual(await f.sqlCells(person), committed);
  await a
    .getByLabel("Nhập vùng")
    .getByRole("button", { name: "Hủy", exact: true })
    .click();
  await a
    .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
    .click();
  assert.deepEqual(await f.sqlCells(person), committed);
  pass(
    "actual commit response loss retains draft; read/discard never roll back and never claim old request canceled",
  );
}
