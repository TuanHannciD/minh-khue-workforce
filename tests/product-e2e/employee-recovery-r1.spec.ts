// Targeted Task7 R1: built React -> real Nest/PostgreSQL, delivery fault only.
// Runs in the coordinator so fixture credentials never leave process memory.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";

export async function runEmployeeRecoveryR1(s, browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const independent = await openSandboxTarget(s.targetFile, s.alias);
  const assertions = [];
  const writes = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith("/api/v1/employees") &&
      ["POST", "PATCH"].includes(request.method())
    )
      writes.push({
        method: request.method(),
        path,
        body: request.postDataJSON(),
      });
  });
  try {
    // Direct scoped session setup avoids ever entering the secret into the DOM.
    const login = await context.request.post(
      `${s.webOrigin}/api/v1/auth/login`,
      {
        headers: { origin: s.webOrigin },
        data: s.accounts[0],
      },
    );
    assert.equal(login.status(), 200);
    await page.goto(s.webOrigin);
    await expect(
      page.getByRole("heading", { name: "Bảng chấm công" }),
    ).toBeVisible();
    await page.getByLabel("Tháng chấm công").fill("2026-10");
    await page.getByLabel("Họ và tên", { exact: true }).fill("Nhân sự R1 giả");
    await page.getByLabel("Ngày bắt đầu", { exact: true }).fill("2026-10-15");
    let createdId;
    await page.route(
      "**/api/v1/employees",
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        createdId = (await response.json()).id;
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Lưu nhân sự", exact: true })
      .click();
    await expect(page.getByText(/Chưa xác định kết quả lưu\./)).toBeVisible();
    const sqlEmployee = async () =>
      (
        await independent.pool.query(
          'SELECT id, name, "startDate"::text, "endDate"::text, revision FROM "Employee" WHERE id=$1::uuid',
          [createdId],
        )
      ).rows[0];
    const original = await sqlEmployee();
    assert.equal(original.startDate, "2026-10-15");
    await page
      .getByLabel("ID nhân sự đã xác định", { exact: true })
      .fill(createdId);
    await page
      .getByRole("button", { name: "Đối chiếu theo ID nhân sự", exact: true })
      .click();
    await expect(page.getByText(/Dữ liệu đối chiếu:/)).toContainText(createdId);
    await page.getByLabel("Ngày kết thúc", { exact: true }).fill("2026-10-01");
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/employees/${createdId}`),
    );
    await page
      .getByRole("button", {
        name: "Xác nhận ID và lưu bản nháp nhân sự",
        exact: true,
      })
      .click();
    assert.equal((await rejected).status(), 422);
    await expect(
      page.getByText(/Đối chiếu lại theo ID trước khi chọn lần lưu mới/),
    ).toBeVisible();
    assert.deepEqual(await sqlEmployee(), original); // rejected PATCH supplied no fence
    await page.getByLabel("Ngày kết thúc", { exact: true }).fill("2026-10-20");
    await expect(
      page.getByRole("button", { name: "Lưu nhân sự", exact: true }),
    ).toBeDisabled();
    // Submit event as well as the disabled button must not dispatch a normal POST.
    await page.getByLabel("Ngày kết thúc", { exact: true }).press("Enter");
    await expect(
      page.getByRole("button", { name: "Lưu nhân sự", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("ID nhân sự đã xác định", { exact: true }),
    ).toHaveValue(createdId);
    await expect(
      page.getByRole("button", { name: "Hủy", exact: true }),
    ).toBeDisabled();
    assert.deepEqual(
      writes.map((w) => w.method),
      ["POST", "PATCH"],
    );
    await page.screenshot({
      path: resolve(s.runDir, "rejected-recovery-locked.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Đối chiếu theo ID nhân sự", exact: true })
      .click();
    await expect(page.getByText(/Dữ liệu đối chiếu:/)).toContainText(createdId);
    const accepted = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/employees/${createdId}`),
    );
    await page
      .getByRole("button", {
        name: "Xác nhận ID và lưu bản nháp nhân sự",
        exact: true,
      })
      .click();
    assert.equal((await accepted).status(), 200);
    await expect(
      page.getByText("Đã lưu nhân sự.", { exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      writes.map((w) => [w.method, w.path]),
      [
        ["POST", "/api/v1/employees"],
        ["PATCH", `/api/v1/employees/${createdId}`],
        ["PATCH", `/api/v1/employees/${createdId}`],
      ],
    );
    assert.equal(writes[2].body.expectedRevision, original.revision);
    const saved = await sqlEmployee();
    assert.equal(saved.endDate, "2026-10-20");
    assert.notEqual(saved.revision, original.revision);
    assert.equal(
      (
        await independent.pool.query(
          'SELECT count(*)::int AS count FROM "Employee"',
        )
      ).rows[0].count,
      1,
    );
    assertions.push(
      "unknown POST -> confirmed ID -> PATCH422 -> correction blocks normal POST; fresh reconcile PATCH200 persists same ID, total POST1; rejected PATCH leaves revision unchanged",
    );

    await page
      .getByRole("button", { name: "Tải lại bảng", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: new RegExp(`ID ${createdId}.*2026-10-16.*Công`),
      })
      .click();
    await page.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await page.getByLabel("Số công tùy chỉnh").fill("3,25");
    const tab = page.getByRole("tab", { name: "Tăng ca", exact: true });
    for (const choice of ["keep", "escape"]) {
      await tab.click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      if (choice === "keep")
        await page
          .getByRole("button", { name: "Giữ phần nhập", exact: true })
          .click();
      else await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(tab).toBeFocused();
      await expect(page.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
      await expect(
        page.getByRole("tab", { name: "Công", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
    const month = page.getByLabel("Tháng chấm công");
    for (const choice of ["keep", "escape"]) {
      await month.fill("2026-11");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      if (choice === "keep")
        await page
          .getByRole("button", { name: "Giữ phần nhập", exact: true })
          .click();
      else await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(month).toBeFocused();
      await expect(month).toHaveValue("2026-10");
      await expect(page.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    }
    assertions.push(
      "real Page/Workspace guards Keep/Escape restore original tab/month control, retain raw3,25 and work unit/identity",
    );
    await page.screenshot({
      path: resolve(s.runDir, "focus-restored.png"),
      fullPage: true,
    });
    process.stdout.write(
      "PASS Task7 R1 targeted recovery422 and focus guards (real HTTP/DB)\n",
    );
  } finally {
    await writeFile(
      resolve(s.runDir, "assertions-r1.json"),
      JSON.stringify(
        {
          owner: "MKW-PRODUCT-001/Task7FixR1",
          browser: browser.version(),
          webOrigin: s.webOrigin,
          apiOrigin: s.apiOrigin,
          assertions,
          writes,
        },
        null,
        2,
      ),
    );
    await context.close();
    await independent.pool.end();
  }
}
