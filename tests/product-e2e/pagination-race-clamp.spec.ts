/** Focused Task10 lifecycle. Real reads/writes/SQL; only post-parse scheduling
 * is injected. No app/Query diagnostics. Browser reference identity Not run.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { selectionFixture } from "./selection-fixture.ts";
import { matchesAttendancePageRead } from "./attendance-read-matchers.ts";
import type { PageReadCriteria } from "./attendance-read-matchers.ts";
import type { startSandbox } from "./sandbox.mjs";
import { withCleanup } from "../../scripts/product/cleanup.mjs";
import {
  installBodyGate,
  armBody,
  awaitBody,
  releaseBody,
  gateEvents,
  markAccepted,
} from "./pagination-body-gate.ts";

const initial: PageReadCriteria = {
  month: "2026-10",
  q: "",
  page: 1,
  pageSize: 25,
};
const nav = (p: Page) =>
  p.getByRole("navigation", { name: "Phân trang đầu bảng" });
const footer = (p: Page) => p.locator('tfoot [aria-label="Tổng tháng · công"]');
const people = Array.from({ length: 1000 }, (_, i) => ({
  id: `ccddeeaa-1111-4111-8111-${String(i).padStart(12, "0")}`,
  name: `Race ${String(i).padStart(4, "0")}`,
}));
async function ids(p: Page) {
  return p
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
    );
}
async function read(
  p: Page,
  criteria: PageReadCriteria,
  trigger: () => Promise<unknown>,
) {
  const pending = p.waitForResponse(
    (r) =>
      matchesAttendancePageRead(r.request(), criteria) && r.status() === 200,
  );
  await trigger();
  return (await pending).json();
}
async function displayed(p: Page, body) {
  for (const label of ["Phân trang đầu bảng", "Phân trang cuối bảng"]) {
    const pager = p.getByRole("navigation", { name: label });
    await expect(pager).toContainText(
      `Trang ${body.pagination.page} / ${body.pagination.totalPages}`,
    );
    await expect(pager).toContainText(
      `${body.pagination.from}–${body.pagination.to} / ${body.pagination.totalResults.toLocaleString("vi-VN")}`,
    );
  }
  await expect.poll(() => ids(p)).toEqual(body.employees.map((e) => e.id));
  await expect(footer(p)).toHaveText(
    String(body.monthTotals.work.grandTotal).replace(".", ","),
  );
  await expect(p.locator(".snapshot-freshness")).toContainText(body.fetchedAt);
}

export async function runAttendanceRaceClamp(
  s: Awaited<ReturnType<typeof startSandbox>>,
  browser: Browser,
) {
  const evidence: object[] = [];
  const traffic: {
    criteria: PageReadCriteria[];
    unexpected: string[];
    fullGets: number;
  } = { criteria: [], unexpected: [], fullGets: 0 };
  const f = await selectionFixture(s, browser);
  const [a] = f.pages;
  let failure;
  try {
    const policy = (
      await f.sql.pool
        .query(`SELECT collprovider AS provider, collisdeterministic AS deterministic,
      COALESCE(to_jsonb(c)->>'colllocale',to_jsonb(c)->>'colliculocale') AS locale,
      collversion,pg_collation_actual_version(oid) AS "actualVersion" FROM pg_collation c WHERE collname='mkw_read_vi_equivalent'`)
    ).rows[0];
    assert.deepEqual(policy, {
      provider: "i",
      deterministic: false,
      locale: "vi",
      collversion: "153.14.37",
      actualVersion: "153.14.37",
    });
    evidence.push({
      name: "migrated_policy",
      policy,
      targetFile: s.targetFile,
    });
    assert.equal(
      (await f.sql.pool.query('SELECT count(*)::int n FROM "Employee"')).rows[0]
        .n,
      0,
    );
    await f.sql.pool.query(
      `INSERT INTO "Employee"(id,name,"startDate",revision)
      SELECT id::uuid,name,'2026-10-01'::date,id::uuid FROM jsonb_to_recordset($1::jsonb) e(id text,name text)`,
      [JSON.stringify(people)],
    );
    await f.sql.pool.query(
      `INSERT INTO "AttendanceCell"("employeeId",date,kind,"valueType","halfUnits",revision)
      VALUES ($1::uuid,'2026-10-01','work','number',2,$1::uuid)`,
      [people[0].id],
    );
    await a.clock.install();
    await installBodyGate(a);
    for (const p of f.pages)
      p.on("request", (r) => {
        const path = new URL(r.url()).pathname;
        if (path === "/api/v1/attendance/month") traffic.fullGets++;
        if (path === "/api/v1/attendance/search") {
          const expected = [
            initial,
            { ...initial, page: 40 },
            { ...initial, page: 39 },
            { ...initial, q: people[0].id },
          ];
          if (!expected.some((c) => matchesAttendancePageRead(r, c)))
            traffic.unexpected.push("invalid-search-criteria");
          traffic.criteria.push(r.postDataJSON());
        } else if (r.method() !== "GET")
          traffic.unexpected.push(`${r.method()} ${path}`);
      });
    await f.reload(a);
    await nav(a).getByLabel("Đến trang", { exact: true }).fill("40");
    const page40 = await read(a, { ...initial, page: 40 }, () =>
      nav(a).getByRole("button", { name: "Đi", exact: true }).click(),
    );
    assert.deepEqual(page40.pagination, {
      requestedPage: 40,
      page: 40,
      pageSize: 25,
      totalPages: 40,
      totalResults: 1000,
      from: 976,
      to: 1000,
      monthEmployeeCount: 1000,
    });
    await displayed(a, page40);
    await f.button(a, people[975], "20").click();
    await a.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await a.getByLabel("Số công tùy chỉnh").fill("3,25");
    await a.getByRole("checkbox", { name: /Nhắc kiểm tra/ }).check();
    // Actual API writes remove exactly the last25 from October membership.
    for (const person of people.slice(975)) {
      const r = await f.request(
        `/employees/${person.id}`,
        {
          expectedRevision: person.id,
          name: person.name,
          startDate: "2026-11-01",
          endDate: null,
        },
        1,
        "PATCH",
      );
      assert.equal(r.status(), 200);
    }
    assert.equal(
      (
        await f.sql.pool.query(
          `SELECT count(*)::int n FROM "Employee" WHERE "startDate"<='2026-10-31'`,
        )
      ).rows[0].n,
      975,
    );
    const clamped = await read(a, { ...initial, page: 40 }, () =>
      a.clock.fastForward(15000),
    );
    assert.deepEqual(clamped.pagination, {
      requestedPage: 40,
      page: 39,
      pageSize: 25,
      totalPages: 39,
      totalResults: 975,
      from: 951,
      to: 975,
      monthEmployeeCount: 975,
    });
    assert.deepEqual(
      clamped.employees.map((e) => e.id),
      people.slice(950, 975).map((e) => e.id),
    );
    await expect(
      a.getByText("Trang đã thay đổi; phần nhập và snapshot đang được giữ.", {
        exact: true,
      }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Giữ phần nhập", exact: true }).click();
    await displayed(a, page40);
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("3,25");
    await expect(
      a.getByRole("checkbox", { name: /Nhắc kiểm tra/ }),
    ).toBeChecked();
    await expect(f.button(a, people[976], "20")).toBeDisabled();
    const handoffReads = traffic.criteria.length;
    await a
      .getByRole("tabpanel", { name: "Công", exact: true })
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Bỏ phần nhập và tiếp tục", exact: true })
      .click();
    await displayed(a, clamped);
    await expect(
      a.getByText(/Trang yêu cầu 40 đã được điều chỉnh/),
    ).toBeVisible();
    await gateEvents(a);
    assert.equal(
      traffic.criteria.length,
      handoffReads,
      "canonical handoff must not issue HTTP",
    );
    const canonical = await read(a, { ...initial, page: 39 }, () =>
      a.getByRole("button", { name: "Tải lại bảng", exact: true }).click(),
    );
    await displayed(a, canonical);
    assert.equal(traffic.criteria.length, handoffReads + 1);
    evidence.push({
      name: "membership_clamp40_39_frozen_draft_no_seed_http",
      page40,
      clamped,
      handoffReads,
      canonicalCriteria: traffic.criteria.at(-1),
    });

    // Positive control: same-context release must publish a visibly new total.
    await f.patch(people[0], "01", { type: "number", value: 2 });
    await armBody(a, "control", { ...initial, page: 39 });
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    await awaitBody(a, "control");
    await expect(footer(a)).toHaveText("1");
    await releaseBody(a);
    await expect(footer(a)).toHaveText("2");
    // Old page39 response contains total3; newer ID-search response contains4.
    await f.patch(people[0], "01", { type: "number", value: 3 });
    await armBody(a, "stale", { ...initial, page: 39 });
    await a.getByRole("button", { name: "Tải lại bảng", exact: true }).click();
    await awaitBody(a, "stale");
    await expect(footer(a)).toHaveText("2");
    await f.patch(people[0], "01", { type: "number", value: 4 });
    await a.getByRole("searchbox").fill(people[0].id);
    const newer = await read(a, { ...initial, q: people[0].id }, () =>
      a.getByRole("searchbox").press("Enter"),
    );
    await displayed(a, newer);
    await f.button(a, people[0], "20").click();
    await a.getByRole("button", { name: "Tùy chỉnh", exact: true }).click();
    await a.getByLabel("Số công tùy chỉnh").fill("6,25");
    await a.getByRole("checkbox", { name: /Nhắc kiểm tra/ }).check();
    const newSnapshot = await a.locator(".snapshot-freshness").innerText();
    await markAccepted(a, "stale");
    await releaseBody(a);
    await displayed(a, newer);
    await expect(a.locator(".snapshot-freshness")).toHaveText(newSnapshot, {
      useInnerText: true,
    });
    await expect(a.getByLabel("Số công tùy chỉnh")).toHaveValue("6,25");
    await expect(
      a.getByRole("checkbox", { name: /Nhắc kiểm tra/ }),
    ).toBeChecked();
    const events = await gateEvents(a);
    assert.deepEqual(
      events.filter((e) => e.token === "stale").map((e) => e.event),
      [
        "native-body-complete",
        "native-signal-abort",
        "new-context-accepted",
        "release",
        "old-json-returned",
      ],
    );
    assert.equal(
      events.find(
        (e) => e.token === "stale" && e.event === "native-body-complete",
      )!.total,
      3,
    );
    assert.equal(newer.monthTotals.work.grandTotal, 4);
    assert.notDeepEqual(
      newer.employees.map((e) => e.id),
      clamped.employees.map((e) => e.id),
    );
    assert.notEqual(
      await footer(a).innerText(),
      "3",
      "negative old-body oracle",
    );
    evidence.push({
      name: "controlled_post_body_stale_delivery",
      events,
      newer,
      nativeAbortPreserved: true,
      raw: "6,25",
      reminder: true,
    });
    assert.equal(traffic.fullGets, 0);
    assert.deepEqual(traffic.unexpected, []);
    assert.deepEqual(f.writes, []);
    const persisted = (await f.sql.pool.query('SELECT * FROM "AttendanceCell"'))
      .rows;
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].halfUnits, 8);
    assert.equal(persisted[0].reminder, false);
    assert.equal((await f.sqlCells(people[975])).length, 0);
    assert.equal(
      (await f.sqlCells(people[0])).some((c) => c.date === "2026-10-20"),
      false,
    );
    evidence.push({
      name: "no_hidden_write",
      browserWrites: 0,
      unexpected: [],
      SQLHalfUnits: 8,
      discardedTargetCells: 0,
      newDraftTargetCells: 0,
    });
    console.log(
      "PASS focused attendance membership40→39, frozen draft, control and post-body stale delivery; no hidden writes/seed HTTP",
    );
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await withCleanup(
      async () => {
        if (failure) throw failure;
      },
      async () => {
        const events = await gateEvents(a).catch(() => null);
        await writeFile(
          resolve(s.runDir, "race-clamp-results.json"),
          JSON.stringify(
            {
              result: failure ? "FAILED" : "PASS",
              failure: failure ? String(failure) : undefined,
              evidence,
              traffic,
              events,
              browserReferenceIdentity: "Not run: no legitimate public oracle",
            },
            null,
            2,
          ),
        );
      },
      () => f.close(),
    );
  }
}
