// Executed in the coordinator process: fixture secrets stay in memory. Uses
// Playwright's real browser/locator assertions, real Nest HTTP and independent SQL.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";
import { EmploymentConsistency } from "../../apps/api/dist/modules/employees/index.js";
import { pauseMethod } from "../../apps/api/test/attendance-test-client.mjs";

export async function runAttendanceE2E(s, browser) {
  const evidence = [];
  const pass = (name, details = {}) => {
    evidence.push({ name, result: "PASS", ...details });
    process.stdout.write(`PASS ${name}\n`);
  };
  const contexts = [await browser.newContext(), await browser.newContext()];
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [a, b] = pages;
  await b.clock.install();
  const counts = [0, 0];
  for (const [index, page] of pages.entries())
    page.on("request", (request) => {
      if (request.url().endsWith("/attendance/changes")) counts[index]++;
    });
  let independent;
  let barrier;
  try {
    for (const [i, page] of pages.entries()) {
      await page.goto(s.webOrigin);
      await page.getByLabel("Tên đăng nhập").fill(s.accounts[i].username);
      try {
        await page
          .getByLabel("Mật khẩu", { exact: true })
          .fill(s.accounts[i].password);
      } catch {
        throw new Error(
          "Fixture password control unavailable (secret omitted)",
        );
      }
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Bảng chấm công" }),
      ).toBeVisible();
      await page.getByLabel("Tháng chấm công").fill("2026-10");
    }
    independent = await openSandboxTarget(s.targetFile, s.alias);
    const employeeResponse = await contexts[0].request.post(
      `${s.webOrigin}/api/v1/employees`,
      {
        headers: { origin: s.webOrigin },
        data: {
          name: "Nhân sự persistence giả",
          startDate: "2026-10-01",
          endDate: null,
        },
      },
    );
    assert.equal(employeeResponse.status(), 201);
    const employee = await employeeResponse.json();
    const cellButton = (page, date = "2026-10-20", kind = "Công") =>
      page.getByRole("button", {
        name: new RegExp(`ID ${employee.id}.*${date}.*${kind}`),
      });
    const reload = async (page) => {
      await page
        .getByRole("button", { name: "Tải lại bảng", exact: true })
        .click();
      await expect(cellButton(page)).toBeVisible();
    };
    await reload(a);
    await reload(b);
    const open = async (page, raw, reminder, date = "2026-10-20") => {
      await cellButton(page, date).click();
      await page
        .getByRole("button", { name: "Tùy chỉnh", exact: true })
        .click();
      await page.getByLabel("Số công tùy chỉnh").fill(raw);
      await page
        .getByRole("checkbox", { name: /Nhắc kiểm tra/ })
        .setChecked(reminder);
    };
    const sqlCell = async (date = "2026-10-20", kind = "work") =>
      (
        await independent.pool.query(
          'SELECT "valueType", "halfUnits", reminder, revision FROM "AttendanceCell" WHERE "employeeId"=$1::uuid AND date=$2::date AND kind=$3::"AttendanceKind"',
          [employee.id, date, kind],
        )
      ).rows[0];
    await open(b, "2", true);
    await open(a, "1,5", true);
    const beforeSave = counts[0];
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(a.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    assert.equal(counts[0] - beforeSave, 1);
    assert.deepEqual(
      { ...(await sqlCell()), revision: undefined },
      {
        valueType: "number",
        halfUnits: 3,
        reminder: true,
        revision: undefined,
      },
    );
    pass("single Save atomic1.5+reminder one request and independent SQL");
    // Advance only the browser's clock. Network and server persistence remain real.
    await b.bringToFront();
    await b.clock.fastForward(15050);
    await expect(cellButton(b)).toContainText("1,5");
    await expect(b.getByLabel("Số công tùy chỉnh")).toHaveValue("2");
    await expect(b.getByRole("checkbox")).toBeChecked();
    pass("two sessions poll1.5 keeps2 raw and reminder original baseline");
    const conflictResponse = b.waitForResponse((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await b.getByRole("button", { name: "Lưu", exact: true }).click();
    assert.equal((await conflictResponse).status(), 409);
    await expect(b.getByText(/Dữ liệu hiện tại: 1,5/)).toBeVisible();
    await expect(b.getByLabel("Số công tùy chỉnh")).toHaveValue("2");
    assert.equal((await sqlCell()).halfUnits, 3);
    await b
      .getByRole("button", { name: "Đối chiếu dữ liệu đã lưu", exact: true })
      .click();
    await b
      .getByRole("button", {
        name: "Giữ dữ liệu hiện tại và xác nhận",
        exact: true,
      })
      .click();
    await expect(b.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    pass(
      "conflict whole write rejected, raw retained, explicit keep-current accepted",
    );
    await b.clock.resume();
    // Cancel writes nothing; reminder-only patch preserves value; null clears only value.
    await reload(a);
    await open(a, "3,25", false);
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    const cancelCount = counts[0];
    await a.getByRole("button", { name: "Hủy", exact: true }).last().click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    assert.equal(counts[0], cancelCount);
    await cellButton(a).click();
    await a.getByRole("checkbox").uncheck();
    const reminderRequest = a.waitForRequest((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    assert.deepEqual((await reminderRequest).postDataJSON().operation.patch, {
      reminder: false,
    });
    await expect(a.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    assert.equal((await sqlCell()).halfUnits, 3);
    assert.equal((await sqlCell()).reminder, false);
    pass(
      "invalid raw retained, Cancel0, reminder-only missing-value retains number",
    );
    // Commit via the real upstream, then drop its response in the test network layer.
    await open(a, "2.5", true);
    await a.route(
      "**/api/v1/attendance/changes",
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    const lossCount = counts[0];
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(a.getByText(/Chưa xác định kết quả lưu/)).toBeVisible();
    assert.equal(counts[0] - lossCount, 1);
    assert.equal((await sqlCell()).halfUnits, 5);
    assert.equal((await sqlCell()).reminder, true);
    await a
      .getByRole("button", { name: "Đối chiếu dữ liệu đã lưu", exact: true })
      .click();
    await expect(a.getByText(/Dữ liệu hiện tại: 2,5/)).toBeVisible();
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("2.5");
    assert.equal(counts[0] - lossCount, 1);
    const revisionBeforeFence = (await sqlCell()).revision;
    await a
      .getByRole("button", {
        name: "Giữ dữ liệu hiện tại và xác nhận",
        exact: true,
      })
      .click();
    await expect(a.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    assert.notEqual((await sqlCell()).revision, revisionBeforeFence);
    pass(
      "commit response loss read-only reconcile then explicit no-op fence SQL verified",
    );
    // Hold a stale real write before Employee locking. B reads before A commits,
    // then confirms current data. Only that accepted write fences delayed A.
    await reload(a);
    await reload(b);
    await open(a, "3", false);
    await open(b, "4", false);
    barrier = pauseMethod(s.app.get(EmploymentConsistency), "lockEmployees");
    const delayedResponse = a.waitForResponse((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    await barrier.entered;
    const bLoss = b.route(
      "**/api/v1/attendance/changes",
      async (route) => {
        await route.abort("failed");
      },
      { times: 1 },
    );
    await bLoss;
    await b.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(b.getByText(/Chưa xác định kết quả lưu/)).toBeVisible();
    await b
      .getByRole("button", { name: "Đối chiếu dữ liệu đã lưu", exact: true })
      .click();
    await expect(b.getByText(/Dữ liệu hiện tại: 2,5/)).toBeVisible();
    await b
      .getByRole("button", {
        name: "Giữ dữ liệu hiện tại và xác nhận",
        exact: true,
      })
      .click();
    await expect(b.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    barrier.release();
    assert.equal((await delayedResponse).status(), 409);
    barrier.restore();
    barrier = null;
    assert.equal((await sqlCell()).halfUnits, 5);
    assert.equal((await sqlCell()).reminder, true);
    pass(
      "deferred real write rejected409 after explicit no-op fence, read was not fence",
    );
    await a.getByRole("button", { name: "Hủy", exact: true }).last().click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    // Background API outage preserves the snapshot, initial outage is not empty.
    await a.route("**/api/v1/attendance/month?*", (route) =>
      route.abort("failed"),
    );
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    await expect(a.getByText(/Chưa cập nhật được dữ liệu nền/)).toBeVisible({
      timeout: 10000,
    });
    await expect(cellButton(a)).toContainText("2,5");
    await a.reload();
    await expect(a.getByText(/Chưa tải được bảng tháng/)).toBeVisible({
      timeout: 10000,
    });
    await expect(a.getByText(/Chưa có nhân sự trong tháng/)).toBeHidden();
    await a.unroute("**/api/v1/attendance/month?*");
    await a.getByRole("button", { name: "Thử lại", exact: true }).click();
    await a.getByLabel("Tháng chấm công").fill("2026-10");
    await expect(cellButton(a)).toContainText("2,5");
    pass(
      "background staleness distinct from initial error; reload reads persisted value+reminder",
    );
    // Choose the employee from the real cell UI. A dates PATCH commits, then its
    // response disappears, removing that ID from the current month membership.
    await open(a, "", false, "2026-10-21");
    await a
      .getByRole("button", { name: "Sửa thông tin nhân sự", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    await a.getByLabel("Ngày kết thúc", { exact: true }).fill("2026-10-20");
    // This first interval stays in month and preserves existing cells.
    await a.getByRole("button", { name: "Lưu nhân sự", exact: true }).click();
    await expect(a.getByText("Đã lưu nhân sự.", { exact: true })).toBeVisible();
    // A separate empty person can exit October entirely without violating data protection.
    const emptyResponse = await contexts[0].request.post(
      `${s.webOrigin}/api/v1/employees`,
      {
        headers: { origin: s.webOrigin },
        data: {
          name: "Nhân sự ngoài tháng giả",
          startDate: "2026-10-01",
          endDate: null,
        },
      },
    );
    const empty = await emptyResponse.json();
    await reload(a);
    await a
      .getByRole("button", {
        name: new RegExp(`ID ${empty.id}.*2026-10-20.*Công`),
      })
      .click();
    await a
      .getByRole("button", { name: "Sửa thông tin nhân sự", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    await a.getByLabel("Ngày bắt đầu", { exact: true }).fill("2026-11-01");
    await a.route(
      `**/api/v1/employees/${empty.id}`,
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await a.getByRole("button", { name: "Lưu nhân sự", exact: true }).click();
    await expect(a.getByText(/Chưa xác định kết quả lưu\./)).toBeVisible();
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    await expect(
      a.getByRole("button", {
        name: new RegExp(`ID ${empty.id}.*2026-10-20.*Công`),
      }),
    ).toHaveCount(0);
    await a
      .getByRole("button", { name: "Đối chiếu theo ID nhân sự", exact: true })
      .click();
    await expect(
      a.getByText(/Dữ liệu đối chiếu: Nhân sự ngoài tháng giả/),
    ).toContainText("2026-11-01");
    const oldRevision = (
      await independent.pool.query(
        'SELECT revision FROM "Employee" WHERE id=$1::uuid',
        [empty.id],
      )
    ).rows[0].revision;
    await a
      .getByRole("button", {
        name: "Giữ thông tin nhân sự hiện tại và xác nhận",
        exact: true,
      })
      .click();
    await expect(a.getByText("Đã lưu nhân sự.", { exact: true })).toBeVisible();
    const after = (
      await independent.pool.query(
        'SELECT revision, to_char("startDate", \'YYYY-MM-DD\') AS start FROM "Employee" WHERE id=$1::uuid',
        [empty.id],
      )
    ).rows[0];
    assert.equal(after.start, "2026-11-01");
    assert.notEqual(after.revision, oldRevision);
    pass(
      "employee PATCH response loss outside month reconciles ID, explicit no-op PATCH fence SQL verified",
    );
    await a.getByRole("tab", { name: "Tăng ca", exact: true }).click();
    await cellButton(a, "2026-10-20", "Tăng ca").click();
    await a.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await a.getByLabel("Số giờ tùy chỉnh").fill("3.5");
    await a.getByRole("checkbox").check();
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(a.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    assert.equal((await sqlCell("2026-10-20", "overtime")).halfUnits, 7);
    assert.equal((await sqlCell()).halfUnits, 5);
    await a.getByRole("tab", { name: "Công", exact: true }).click();
    await cellButton(a).click();
    await a.getByRole("button", { name: "Để trống", exact: true }).click();
    const clearRequest = a.waitForRequest((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    assert.deepEqual((await clearRequest).postDataJSON().operation.patch, {
      value: null,
    });
    await expect(a.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    assert.equal((await sqlCell()).halfUnits, null);
    assert.equal((await sqlCell()).reminder, true);
    assert.equal((await sqlCell("2026-10-20", "overtime")).halfUnits, 7);
    pass(
      "overtime3.5 independent persistence; value=null clears work only and retains reminder",
    );
    await a.getByRole("button", { name: "Hủy", exact: true }).click();
    await a.getByLabel("Họ và tên", { exact: true }).fill(employee.name);
    await a.getByLabel("Ngày bắt đầu", { exact: true }).fill("2026-10-01");
    let createdId;
    let createCalls = 0;
    const countCreate = (request) => {
      if (request.method() === "POST" && request.url().endsWith("/employees"))
        createCalls++;
    };
    a.on("request", countCreate);
    await a.route(
      "**/api/v1/employees",
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        createdId = (await response.json()).id;
        await route.abort("failed");
      },
      { times: 1 },
    );
    await a.getByRole("button", { name: "Lưu nhân sự", exact: true }).click();
    await expect(a.getByText(/Chưa xác định kết quả lưu\./)).toBeVisible();
    await expect(
      a.getByRole("button", { name: "Lưu nhân sự", exact: true }),
    ).toBeDisabled();
    await expect(
      a.getByText(/Không tự gửi lại hoặc nhận diện theo tên/),
    ).toBeVisible();
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    await expect(
      a.getByRole("button", {
        name: new RegExp(`ID ${createdId}.*2026-10-20.*Công`),
      }),
    ).toBeVisible();
    assert.equal(createCalls, 1);
    assert.equal(
      (
        await independent.pool.query(
          'SELECT count(*)::int AS count FROM "Employee" WHERE name=$1',
          [employee.name],
        )
      ).rows[0].count,
      2,
    );
    await a
      .getByLabel("ID nhân sự đã xác định", { exact: true })
      .fill(createdId);
    await a
      .getByRole("button", { name: "Đối chiếu theo ID nhân sự", exact: true })
      .click();
    await expect(a.getByText(/Dữ liệu đối chiếu:/)).toContainText(createdId);
    await a
      .getByRole("button", {
        name: "Giữ thông tin nhân sự hiện tại và xác nhận",
        exact: true,
      })
      .click();
    await expect(a.getByText("Đã lưu nhân sự.", { exact: true })).toBeVisible();
    assert.equal(createCalls, 1);
    a.off("request", countCreate);
    pass(
      "create response loss no ID locks retry, duplicate names not deduped; explicit identified ID recovery uses PATCH",
    );
    await a.screenshot({
      path: resolve(s.runDir, "persistence-recovery.png"),
      fullPage: true,
    });
    assert.equal(independent.target.owner, s.target.owner);
    assert.equal(independent.target.database, s.target.database);
    assert.equal(independent.target.alias, s.alias);
    await writeFile(
      resolve(s.runDir, "assertions.json"),
      JSON.stringify(
        {
          owner: independent.target.owner,
          alias: independent.target.alias,
          database: independent.target.database,
          webOrigin: s.webOrigin,
          apiOrigin: s.apiOrigin,
          targetFile: s.targetFile,
          browser: browser.version(),
          evidence,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await a
      .screenshot({ path: resolve(s.runDir, "failure.png"), fullPage: true })
      .catch(() => {});
    await writeFile(
      resolve(s.runDir, "assertions.json"),
      JSON.stringify({ evidence, failure: String(error) }, null, 2),
    );
    throw error;
  } finally {
    barrier?.restore();
    for (const context of contexts) await context.close();
    await independent?.pool.end();
  }
}
