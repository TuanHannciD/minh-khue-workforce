/**
 * Built web -> real Nest -> PostgreSQL. Requests made with context.request are
 * explicit setup/CAS/contract oracles; only page events count as browser traffic.
 * One invocation on a fresh pagination DB; fixed DB-policy order, never Intl.
 * File map: orderedIds/marker = fixed oracle; pageRead/jump/query = exact reads;
 * runPagination = empty seed, global search/export, dirty poll/membership,
 * atomic conflict, original-key unknown reconcile, clamp and fresh readback.
 * Keep this sequential lifecycle together: later CAS/recovery cases consume
 * earlier real commits. Named PASS groups locate each boundary; fixture owns
 * transport/SQL/cleanup separately. Consumers: both acceptance runner routes.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { selectionFixture } from "./selection-fixture.ts";
import type { startSandbox } from "./sandbox.mjs";
import { matchesAttendancePageRead } from "./attendance-read-matchers.ts";
import type { PageReadCriteria } from "./attendance-read-matchers.ts";
import { employeeReadDbPolicyFixture as fixed } from "../../apps/api/test/employee-read-db-policy-fixtures.mjs";
import { withCleanup } from "../../scripts/product/cleanup.mjs";
import { openSandboxTarget } from "../../scripts/product/sandbox-target.mjs";

const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const ExcelJS = requireApi("exceljs");
const invocations = new WeakSet<object>();
const criteria: PageReadCriteria = {
  month: "2026-10",
  q: "",
  page: 1,
  pageSize: 25,
};
const filler = Array.from({ length: 972 }, (_, i) => ({
  id: `aabbccdd-1111-4111-8111-${String(1000 + i).padStart(12, "0")}`,
  name: "An",
}));
const employees = [...fixed.employees, ...filler];
// Pinned An108/109 ties precede all new An IDs. Every remaining position is the
// reviewed literal policy, including canonical101/102 and TJE126 then127.
const orderedIds = [
  ...fixed.expectedOrderedIds.slice(0, 5),
  ...filler.map((e) => e.id),
  ...fixed.expectedOrderedIds.slice(5),
];
const marker = (i: number) => [
  (i % 20) + 1,
  (Math.floor(i / 20) % 20) + 1,
  Math.floor(i / 400) + 1,
];
const pager = (page: Page) =>
  page.getByRole("navigation", { name: "Phân trang đầu bảng" });
const displayedIds = (page: Page) =>
  page
    .locator(".grid-scroll tbody tr")
    .evaluateAll((rows) =>
      rows
        .map(
          (row) =>
            row
              .querySelector<HTMLElement>("button[data-cell]")
              ?.dataset.cell?.split("/")[0],
        )
        .filter(Boolean),
    );
async function pageRead(
  page: Page,
  expected: PageReadCriteria,
  trigger: () => Promise<unknown>,
) {
  const pending = page.waitForResponse(
    (r) =>
      matchesAttendancePageRead(r.request(), expected) && r.status() === 200,
  );
  await trigger();
  const body = await (await pending).json();
  await expect(pager(page)).toContainText(
    `Trang ${body.pagination.totalPages ? body.pagination.page : 0} / ${body.pagination.totalPages}`,
  );
  await expect
    .poll(() => displayedIds(page))
    .toEqual(body.employees.map((e) => e.id));
  return body;
}
async function jump(page: Page, n: number, expected: PageReadCriteria) {
  await pager(page).getByLabel("Đến trang", { exact: true }).fill(String(n));
  return pageRead(page, expected, () =>
    pager(page).getByRole("button", { name: "Đi", exact: true }).click(),
  );
}
async function query(page: Page, q: string, size: 25 | 50 = 25) {
  const search = page.getByRole("searchbox");
  await search.fill(q);
  return pageRead(page, { ...criteria, q, pageSize: size }, () =>
    search.press("Enter"),
  );
}

export async function runPagination(
  s: Awaited<ReturnType<typeof startSandbox>>,
  browser: Browser,
): Promise<void> {
  assert(!invocations.has(s), "pagination invoked once per runner route");
  invocations.add(s);
  assert.equal(
    (await s.pool.query('SELECT count(*)::int n FROM "Employee"')).rows[0].n,
    0,
    "pagination DB must be empty before seed",
  );
  const f = await selectionFixture(s, browser, { acceptDownloads: true });
  const [a, b] = f.pages;
  const evidence = [];
  const pass = (name: string, facts = {}) => {
    evidence.push({ name, result: "PASS", ...facts });
    console.log("PASS " + name);
  };
  const traffic = { searchReads: 0, fullGets: 0, unexpected: [] as string[] };
  const reads: PageReadCriteria[] = [];
  const bootMonth = await a.getByLabel("Tháng chấm công").inputValue();
  const permittedReads: PageReadCriteria[] = [
    { ...criteria, month: bootMonth },
    ...[25, 50].flatMap((pageSize: 25 | 50) =>
      Array.from({ length: 40 }, (_, index) => ({
        ...criteria,
        page: index + 1,
        pageSize,
      })),
    ),
    ...fixed.queries.map((fixture) => ({ ...criteria, q: fixture.q.trim() })),
    { ...criteria, q: orderedIds[725] },
    { ...criteria, q: orderedIds[999] },
    { ...criteria, q: "%", pageSize: 50 },
    { ...criteria, q: "An", page: 3, pageSize: 50 },
    { ...criteria, q: "An", pageSize: 50 },
    { ...criteria, q: "An" },
    { ...criteria, q: "Clamp" },
    { ...criteria, q: "Clamp", page: 2 },
  ];
  // A reload boots the actual local calendar, then fresh() restores explicit
  // criteria. Both contexts are declared independently of observed requests.
  permittedReads.push({
    ...criteria,
    month: await a.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }),
  });
  for (const page of f.pages)
    page.on("request", (r) => {
      const path = new URL(r.url()).pathname;
      if (path === "/api/v1/attendance/month") traffic.fullGets++;
      if (path === "/api/v1/attendance/search") {
        const body = r.postDataJSON();
        assert(
          permittedReads.some((expected) =>
            matchesAttendancePageRead(r, expected),
          ),
          "unexpected browser search context",
        );
        reads.push(body);
        traffic.searchReads++;
      } else if (r.method() !== "GET") traffic.unexpected.push(path);
    });
  let operationError;
  try {
    await f.reload(a);
    await expect(pager(a)).toContainText("0–0 / 0");
    await expect(
      pager(a).getByRole("button", { name: "Trang tiếp" }),
    ).toBeDisabled();
    pass("pagination_starts_with_distinct_empty_database", {
      targetFile: s.targetFile,
      database: s.target.database,
      employeeCount: 0,
      invocations: 1,
    });
    await f.sql.pool.query(
      `INSERT INTO "Employee"(id,name,"startDate",revision)
      SELECT id::uuid,name,'2026-10-01'::date,id::uuid FROM jsonb_to_recordset($1::jsonb) e(id text,name text)`,
      [JSON.stringify(employees)],
    );
    const cells = employees.flatMap((e, i) =>
      ["work", "overtime"].flatMap((kind) =>
        marker(i).map((n, day) => ({
          employeeId: e.id,
          date: `2026-10-0${day + 1}`,
          kind,
          halves: n + (kind === "overtime" ? 1 : 0),
        })),
      ),
    );
    await f.sql.pool.query(
      `INSERT INTO "AttendanceCell"("employeeId",date,kind,"valueType","halfUnits",revision)
      SELECT "employeeId"::uuid,date::date,kind::"AttendanceKind",'number',halves,"employeeId"::uuid
      FROM jsonb_to_recordset($1::jsonb) c("employeeId" text,date text,kind text,halves int)`,
      [JSON.stringify(cells)],
    );
    await f.reload(a);
    await f.reload(b);
    assert.deepEqual(await displayedIds(a), orderedIds.slice(0, 25));
    const beforeNavigation = await f.sql.pool.query(
      'SELECT id,revision FROM "Employee" ORDER BY id',
    );
    const beforeCells = await f.sql.pool.query(
      'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
    );
    // Caller criteria come from the scenario, never from the observed request.
    await jump(a, 30, { ...criteria, page: 30 });
    assert.deepEqual(await displayedIds(a), orderedIds.slice(725, 750));
    const page30Id = orderedIds[725];
    const hit = await query(a, page30Id);
    assert.deepEqual(
      hit.employees.map((e) => e.id),
      [page30Id],
    );
    assert.equal(hit.pagination.page, 1);
    for (const fixture of fixed.queries) {
      const result = await query(a, fixture.q.trim());
      // An filler affects no pinned query other than inputs containing 'an';
      // the reviewed15 queries deliberately avoid that ambiguity.
      assert.deepEqual(
        result.employees.map((e) => e.id),
        fixture.expectedIds,
      );
    }
    await query(a, "");
    await pageRead(a, { ...criteria, pageSize: 50 }, () =>
      pager(a).getByLabel("Số nhân sự mỗi trang").selectOption("50"),
    );
    await jump(a, 20, { ...criteria, page: 20, pageSize: 50 });
    assert.deepEqual(await displayedIds(a), orderedIds.slice(950));
    await query(a, "% ".trim(), 50);
    assert.deepEqual(await displayedIds(a), [fixed.queries[2].expectedIds[0]]);
    await f.fresh(a);
    assert.deepEqual(await displayedIds(a), orderedIds.slice(0, 25));
    assert.deepEqual(
      (await f.sql.pool.query('SELECT id,revision FROM "Employee" ORDER BY id'))
        .rows,
      beforeNavigation.rows,
    );
    assert.deepEqual(
      (
        await f.sql.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows,
      beforeCells.rows,
    );
    assert.equal(traffic.fullGets, 0);
    assert.deepEqual(traffic.unexpected, []);
    pass("reload_and_outage_match_exact_page_read", {
      searchReads: traffic.searchReads,
      browserFullGets: 0,
    });
    pass("global_search_page30_jump_size_query_reset_no_navigation_writes");

    // Explicit coordinator contract checks: full reads/export stay month-only.
    for (const route of ["month", "export"])
      for (const extra of ["q=An", "page=2", "pageSize=25"])
        assert.equal(
          (
            await f.request(
              `/attendance/${route}?month=2026-10&${extra}`,
              undefined,
              1,
              "GET",
            )
          ).status(),
          400,
        );
    // Explicit coordinator full GET oracle: compare all1000 IDs; no browser fallback.
    const full = await (
      await f.request("/attendance/month?month=2026-10", undefined, 1, "GET")
    ).json();
    assert.deepEqual(
      full.employees.map((e) => e.id),
      orderedIds,
    );
    const allPages = [];
    for (let page = 1; page <= 20; page++) {
      const r = await f.request("/attendance/search", {
        ...criteria,
        page,
        pageSize: 50,
      });
      assert.equal(r.status(), 200);
      allPages.push(...(await r.json()).employees.map((e) => e.id));
    }
    assert.deepEqual(allPages, orderedIds);
    // Export from a filtered page and invalid raw draft. Download remains saved
    // fullmonth1000; workbook row markers identify duplicate names by ID.
    await query(a, page30Id);
    const person = employees.find((e) => e.id === page30Id);
    await f.button(a, person, "20").click();
    await a.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await a.getByLabel("Số công tùy chỉnh").fill("3,25");
    const noWrite = f.writes.length;
    const downloadPromise = a.waitForEvent("download");
    await a.getByRole("button", { name: "Xuất Excel", exact: true }).click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    const path = resolve(s.runDir, "pagination-full1000.xlsx");
    await download.saveAs(path);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    assert.equal(workbook.worksheets.length, 1);
    const sheet = workbook.worksheets[0];
    const byId = new Map(employees.map((e, i) => [e.id, { ...e, index: i }]));
    for (const [kind, first] of [
      ["work", 7],
      ["overtime", 1013],
    ] as const) {
      let grand = 0;
      const dates = [0, 0, 0];
      for (const [offset, id] of orderedIds.entries()) {
        const employee = byId.get(id);
        const row = first + offset;
        assert.equal(sheet.getCell(row, 2).value, employee.name);
        const values = marker(employee.index).map(
          (n) => (n + (kind === "overtime" ? 1 : 0)) / 2,
        );
        assert.deepEqual(
          [3, 4, 5].map((c) => sheet.getCell(row, c).value),
          values,
        );
        assert.equal(sheet.getCell(row, 34).formula, `SUM(C${row}:AG${row})`);
        const sum = values.reduce((a, b) => a + b, 0);
        grand += sum;
        assert.equal(sheet.getCell(row, 34).result, sum);
        values.forEach((v, i) => (dates[i] += v));
      }
      const last = first + 999,
        total = last + 1;
      assert.equal(
        sheet.getCell(total, 34).formula,
        `SUM(AH${first}:AH${last})`,
      );
      assert.equal(sheet.getCell(total, 34).result, grand);
      assert.equal(grand, full.totals[kind].grandTotal);
      for (let col = 3; col <= 33; col++) {
        const letter = sheet.getColumn(col).letter;
        assert.equal(
          sheet.getCell(total, col).formula,
          `SUM(${letter}${first}:${letter}${last})`,
        );
        assert.equal(sheet.getCell(total, col).result, dates[col - 3] ?? 0);
      }
    }
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    assert.equal(f.writes.length, noWrite);
    assert.deepEqual(
      (
        await f.sql.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows,
      beforeCells.rows,
    );
    pass("global_search_export_fullmonth", {
      employees: 1000,
      oneSheet: true,
      tables: 2,
      fixedPolicy: fixed.policyId,
      readerRecalc: "Not run",
    });
    await f.fresh(a);

    // Dirty offpage totals poll. Browser clock controls the exact15s threshold;
    // network and PostgreSQL remain real, and the original raw/CAS survive.
    await a.clock.install();
    const visible = orderedIds.slice(0, 25);
    const first = employees.find((e) => e.id === visible[0]);
    const offpage = employees.find((e) => e.id === orderedIds[999]);
    await f.button(a, first, "20").click();
    await a.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await a.getByLabel("Số công tùy chỉnh").fill("3,25");
    await a.getByRole("checkbox", { name: /Nhắc kiểm tra/ }).check();
    await f.patch(offpage, "20", { type: "number", value: 2.5 }, true);
    const readCount = traffic.searchReads;
    const polled = await pageRead(a, criteria, async () => {
      await a.bringToFront();
      await a.clock.fastForward(15000);
    });
    assert(traffic.searchReads > readCount);
    assert.deepEqual(await displayedIds(a), visible);
    assert.equal(
      polled.monthTotals.work.grandTotal,
      full.totals.work.grandTotal + 2.5,
    );
    await expect(
      a.locator('tfoot [aria-label="Tổng tháng · công"]'),
    ).toHaveText(String(full.totals.work.grandTotal + 2.5).replace(".", ","));
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    await expect(
      a.getByRole("checkbox", { name: /Nhắc kiểm tra/ }),
    ).toBeChecked();
    const oldEnvelope = await a.locator(".snapshot-freshness").innerText();
    const current = (await f.month()).employees.find(
      (e) => e.id === offpage.id,
    );
    const rename = await f.request(
      "/employees/" + offpage.id,
      {
        expectedRevision: current.revision,
        name: "! offpage moved",
        startDate: current.startDate,
        endDate: current.endDate,
      },
      1,
      "PATCH",
    );
    assert.equal(rename.status(), 200);
    const held = a.waitForResponse(
      (r) =>
        matchesAttendancePageRead(r.request(), criteria) && r.status() === 200,
    );
    await a.clock.fastForward(15000);
    await held;
    await expect(
      a.getByText("Trang đã thay đổi; phần nhập và snapshot đang được giữ.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.deepEqual(await displayedIds(a), visible);
    assert(
      (await a.locator(".snapshot-freshness").innerText()).startsWith(
        oldEnvelope,
      ),
    );
    await a.getByRole("button", { name: "Giữ phần nhập", exact: true }).click();
    if (process.env.MKW_PAGINATION_NEGATIVE === "lose-lifetime")
      await a.reload();
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    // A held envelope is read-only for new selections; the original editor
    // remains actionable. New grid selections are disabled until the guard ends.
    await expect(
      f.button(
        a,
        employees.find((e) => e.id === visible[1]),
        "20",
      ),
    ).toBeDisabled();
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    // Correct the same frozen old-ID draft, then send its original CAS.
    await a.getByLabel("Số công tùy chỉnh").fill("3,5");
    const saveRequest = a.waitForRequest((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await a.getByRole("button", { name: "Lưu", exact: true }).click();
    const savedIntent = (await saveRequest).postDataJSON();
    assert.deepEqual(savedIntent.targets, [
      {
        employeeId: first.id,
        date: "2026-10-20",
        kind: "work",
        expectedRevision: "0",
      },
    ]);
    assert.equal(savedIntent.expectedEmployees[0].expectedRevision, first.id);
    await expect(a.getByText("Đã lưu ô.", { exact: false })).toBeVisible();
    assert.equal(
      (await f.sqlCells(first)).find((c) => c.date === "2026-10-20").halfUnits,
      7,
    );
    await a.clock.resume();
    pass("offpage_totals_update_after_15000_without_rebase", {
      pollInterval: 15000,
      oldIdCAS: true,
    });
    await f.fresh(a);

    // A fill and disjoint selection cannot turn page or write hidden targets.
    const visibleNow = await displayedIds(a);
    const p = employees.find((e) => e.id === visibleNow[1]);
    const p2 = employees.find((e) => e.id === visibleNow[2]);
    const navigationWrites = f.writes.length;
    await f.button(a, p, "20").click({ modifiers: ["Control"] });
    await f.button(a, p2, "20").click({ modifiers: ["Control"] });
    await pager(a).getByRole("button", { name: "Trang tiếp" }).click();
    await expect(a.getByRole("alertdialog")).toBeVisible();
    await a.getByRole("button", { name: "Giữ phần nhập", exact: true }).click();
    assert.deepEqual(await displayedIds(a), visibleNow);
    assert.equal(f.writes.length, navigationWrites);
    await pager(a).getByRole("button", { name: "Trang tiếp" }).click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    await expect(pager(a)).toContainText("Trang 2 / 40");
    assert.equal(f.writes.length, navigationWrites);
    await f.fresh(a);
    await f.fill(a, p, "01", p2, "02");
    await pager(a).getByRole("button", { name: "Trang tiếp" }).click();
    await a.getByRole("button", { name: "Giữ phần nhập", exact: true }).click();
    assert.equal(f.writes.length, navigationWrites);
    await f.fresh(a);
    // Freeze two targets. B alters exactly one reminder: atomic409, both SQL
    // rows/revisions unchanged after A, original request revisions retained.
    const frozenBaseline = (await f.month()).cells
      .filter(
        (c) =>
          [p.id, p2.id].includes(c.employeeId) &&
          c.date === "2026-10-20" &&
          c.kind === "work",
      )
      .map((c) => ({
        employeeId: c.employeeId,
        date: c.date,
        kind: c.kind,
        expectedRevision: c.revision,
      }));
    await f.button(a, p, "20").click({ modifiers: ["Control"] });
    await f.button(a, p2, "20").click({ modifiers: ["Control"] });
    await a.getByLabel("Số công áp dụng", { exact: true }).fill("2");
    await f.patch(p2, "20", null, true);
    const beforeBatch = await f.sql.pool.query(
      'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
    );
    const frozen = a.waitForRequest((r) =>
      r.url().endsWith("/attendance/changes"),
    );
    await f.apply(a, 409);
    const intent = (await frozen).postDataJSON();
    assert.deepEqual(
      new Set(intent.targets.map((t) => t.employeeId)),
      new Set([p.id, p2.id]),
    );
    assert.deepEqual(
      new Set(intent.targets.map((t) => JSON.stringify(t))),
      new Set(frozenBaseline.map((t) => JSON.stringify(t))),
    );
    assert.deepEqual(
      (
        await f.sql.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows,
      beforeBatch.rows,
    );
    await expect(a.getByLabel("Số công áp dụng", { exact: true })).toHaveValue(
      "2",
    );
    pass("pagination_no_hidden_writes_and_offpage_atomic_conflict");
    await f.fresh(a);

    // Commit two original keys then lose only delivery. Move both rows offpage;
    // reconcile must still send their original union, with no automatic resend.
    await f.button(a, p, "21").click({ modifiers: ["Control"] });
    await f.button(a, p2, "21").click({ modifiers: ["Control"] });
    await a.getByLabel("Số công áp dụng", { exact: true }).fill("2,5");
    await a.route(
      "**/api/v1/attendance/changes",
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    const unknownWrites = f.writes.length;
    await a.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await expect(a.getByText(/Chưa xác định kết quả lưu/)).toBeVisible();
    assert.equal(f.writes.length - unknownWrites, 1);
    const committed = await f.sql.pool.query(
      'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
    );
    for (const person of [p, p2]) {
      const e = (await f.month()).employees.find((e) => e.id === person.id);
      assert.equal(
        (
          await f.request(
            "/employees/" + person.id,
            {
              expectedRevision: e.revision,
              name: "Zzzz " + person.id,
              startDate: e.startDate,
              endDate: e.endDate,
            },
            1,
            "PATCH",
          )
        ).status(),
        200,
      );
    }
    const unknownRead = a.waitForResponse(
      (r) =>
        matchesAttendancePageRead(r.request(), criteria) && r.status() === 200,
    );
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    await unknownRead;
    await expect(
      a.getByText("Trang đã thay đổi; phần nhập và snapshot đang được giữ.", {
        exact: true,
      }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Giữ phần nhập", exact: true }).click();
    const reconcileRequest = a.waitForRequest((r) =>
      r.url().endsWith("/attendance/reconcile"),
    );
    await f.reconcile(a);
    const keys = (await reconcileRequest).postDataJSON();
    assert.deepEqual(new Set(keys.employeeIds), new Set([p.id, p2.id]));
    assert.deepEqual(
      new Set(
        keys.cells.map((c) => c.employeeId + "/" + c.date + "/" + c.kind),
      ),
      new Set([p, p2].map((e) => e.id + "/2026-10-21/work")),
    );
    assert.equal(f.writes.length - unknownWrites, 1);
    assert.deepEqual(
      (
        await f.sql.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows,
      committed.rows,
    );
    pass("offpage_unknown_reconciles_original_keys", {
      autoResends: 0,
      originalUnionKeys: 2,
      readOnly: true,
    });
    // B explicitly clears every saved cell before moving dates out of October.
    // Page absence must never imply deletion or a rolled-back unknown write.
    for (const person of [p, p2]) {
      const snapshot = await f.month(),
        employee = snapshot.employees.find((e) => e.id === person.id);
      const stored = await f.sqlCells(person);
      // Clear independently through the real single-cell CAS API.
      for (const cell of stored)
        await f.patch(person, cell.date.slice(-2), null, false, cell.kind);
      assert.equal(
        (
          await f.request(
            "/employees/" + person.id,
            {
              expectedRevision: employee.revision,
              name: employee.name,
              startDate: "2026-11-01",
              endDate: null,
            },
            1,
            "PATCH",
          )
        ).status(),
        200,
      );
    }
    const beforeOutside = await f.sql.pool.query(
      'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
    );
    const outsideRequest = a.waitForRequest((r) =>
      r.url().endsWith("/attendance/reconcile"),
    );
    const outside = await f.reconcile(a);
    assert.deepEqual((await outsideRequest).postDataJSON(), keys);
    assert.deepEqual(outside.missingEmployeeIds, []);
    assert(
      outside.cells.every(
        (c) => c.state === "before-start" && c.value === null && !c.reminder,
      ),
    );
    assert.equal(f.writes.length - unknownWrites, 1);
    assert.deepEqual(
      (
        await f.sql.pool.query(
          'SELECT * FROM "AttendanceCell" ORDER BY "employeeId",date,kind',
        )
      ).rows,
      beforeOutside.rows,
    );
    pass("out_of_month_unknown_reconciles_original_keys_after_explicit_clear", {
      autoResends: 0,
      missingEmployeeIds: 0,
    });
    // A filtered page2 really clamps to1 when B renames its last matching row.
    // Keep the same1000 logical employee records; never reset a prior database.
    await f.fresh(a);
    for (const [index, person] of filler.slice(0, 26).entries()) {
      const e = (await f.month()).employees.find((e) => e.id === person.id);
      assert.equal(
        (
          await f.request(
            "/employees/" + person.id,
            {
              expectedRevision: e.revision,
              name: `Clamp ${String(index).padStart(2, "0")}`,
              startDate: e.startDate,
              endDate: e.endDate,
            },
            1,
            "PATCH",
          )
        ).status(),
        200,
      );
    }
    await query(a, "Clamp");
    await jump(a, 2, { ...criteria, q: "Clamp", page: 2 });
    const last = filler[25],
      latest = (await f.month()).employees.find((e) => e.id === last.id);
    assert.equal(
      (
        await f.request(
          "/employees/" + last.id,
          {
            expectedRevision: latest.revision,
            name: "Elsewhere",
            startDate: latest.startDate,
            endDate: latest.endDate,
          },
          1,
          "PATCH",
        )
      ).status(),
      200,
    );
    await f.reload(a, { ...criteria, q: "Clamp", page: 2 });
    await expect(pager(a)).toContainText("Trang 1 / 1");
    await expect(
      a.getByText(/Trang yêu cầu 2 đã được điều chỉnh/),
    ).toBeVisible();
    await f.fresh(a, { ...criteria, q: "An", page: 3, pageSize: 50 });
    await expect(pager(a)).toContainText("Trang 3 /");
    await f.fresh(a);
    await query(a, offpage.id);
    await f.reload(a, { ...criteria, q: offpage.id });
    pass("exact_nondefault_reload_criteria");
    // Independent readback after every commit/reload, with a newly acquired SQL
    // pool and authenticated browser context (no existing browser cache/draft).
    const readback = await openSandboxTarget(s.targetFile, s.alias);
    let freshContext;
    let freshBrowserFullGets = 0;
    await withCleanup(
      async () => {
        freshContext = await browser.newContext();
        const login = await freshContext.request.post(
          s.webOrigin + "/api/v1/auth/login",
          {
            headers: { origin: s.webOrigin },
            data: s.accounts[1],
          },
        );
        assert.equal(login.status(), 200);
        const freshPage = await freshContext.newPage();
        freshPage.on("request", (request) => {
          if (new URL(request.url()).pathname === "/api/v1/attendance/month")
            freshBrowserFullGets++;
        });
        await freshPage.goto(s.webOrigin);
        await expect(
          freshPage.getByRole("heading", { name: "Bảng chấm công" }),
        ).toBeVisible();
        await f.fresh(freshPage, { ...criteria, q: offpage.id });
        await expect(f.button(freshPage, offpage, "20")).toHaveText("2,5");
        const sql = (
          await readback.pool.query(
            'SELECT "halfUnits",reminder,revision FROM "AttendanceCell" WHERE "employeeId"=$1::uuid AND date=\'2026-10-20\' AND kind=\'work\'',
            [offpage.id],
          )
        ).rows[0];
        assert.equal(sql.halfUnits, 5);
        assert.equal(sql.reminder, true);
        const result = await freshContext.request.post(
          s.webOrigin + "/api/v1/attendance/search",
          {
            headers: { origin: s.webOrigin },
            data: { ...criteria, q: offpage.id },
          },
        );
        assert.equal(result.status(), 200);
        assert.equal(
          (await result.json()).cells.find(
            (c) =>
              c.employeeId === offpage.id &&
              c.date === "2026-10-20" &&
              c.kind === "work",
          ).revision,
          sql.revision,
        );
        assert.equal(freshBrowserFullGets, 0);
      },
      () => freshContext?.close(),
      () => readback.pool.end(),
    );
    assert.equal(readback.pool.ended, true);
    pass("fresh_context_and_new_sql_pool_persist_offpage_value", {
      freshBrowserFullGets,
      readbackPoolEnded: true,
    });
    assert.equal(traffic.fullGets, 0);
    assert(traffic.searchReads > 0);
    assert(
      traffic.unexpected.every(
        (path) =>
          path === "/api/v1/attendance/changes" ||
          path === "/api/v1/attendance/reconcile",
      ),
    );
    await writeFile(
      resolve(s.runDir, "pagination-results.json"),
      JSON.stringify(
        {
          invocations: 1,
          database: s.target.database,
          targetFile: s.targetFile,
          browser: browser.version(),
          evidence,
          traffic,
          reads,
          nativeDevice: "Not run",
          screenReader: "Not run",
          readerRecalc: "Not run",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    operationError = error;
    await a
      .screenshot({
        path: resolve(s.runDir, "pagination-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
    await writeFile(
      resolve(s.runDir, "pagination-results.json"),
      JSON.stringify(
        { invocations: 1, evidence, traffic, failure: String(error) },
        null,
        2,
      ),
    );
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
