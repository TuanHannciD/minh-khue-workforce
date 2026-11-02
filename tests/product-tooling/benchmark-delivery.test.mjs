import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import * as pagination from "../../scripts/product/benchmark-pagination.mjs";
import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";
import { resolve } from "node:path";

// Exercise the actual ready implementation without a browser/DB. Its
// page boundary runs the real browser predicate against one shared delivery.
async function fixture() {
  const read = {
    id: "delivery-1",
    criteria: { month: "2026-10", q: "", page: 1, pageSize: 25 },
    responseAt: 80,
    data: { fetchedAt: "snapshot-1", employees: [{ id: "fake-id" }] },
  };
  let kind = "work",
    now = 100,
    displayed = "snapshot-1",
    total = "10";
  const region = {
    querySelectorAll: () =>
      Array.from({ length: 31 }, () => ({
        dataset: { cell: `fake-id/2026-10-01/${kind}` },
        disabled: false,
      })),
    querySelector: () => ({ textContent: total }),
  };
  const context = {
    window: { __paginationBench: { reads: [read], transitions: [] } },
    document: {
      querySelector: (selector) => (selector.includes("alert") ? null : region),
      body: {
        get textContent() {
          return displayed;
        },
      },
    },
    Date,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => fn(),
  };
  const page = {
    async waitForFunction(fn, args) {
      const value = runInNewContext(`(${fn.toString()})(args)`, {
        ...context,
        args,
      });
      if (!value) throw new Error("not editable delivery");
      return { jsonValue: async () => value };
    },
    async evaluate(fn, args) {
      return runInNewContext(`(${fn.toString()})(args)`, { ...context, args });
    },
  };
  return {
    read,
    page,
    ready: (...args) => pagination.ready(page, read.criteria, kind, ...args),
    set: (values) => {
      kind = values.kind ?? kind;
      now = values.now ?? now;
      displayed = values.displayed ?? displayed;
      total = values.total ?? total;
    },
  };
}

test("drag refresh must wait for a new delivery even when criteria match", async () => {
  const source = await readFile(
    new URL("../../scripts/product/benchmark-pagination.mjs", import.meta.url),
    "utf8",
  );
  const marker =
    "await measureTrustedDragRuns(page, metrics.dragRuns, async (i) => {";
  let offset = 0,
    callbacks = 0;
  while ((offset = source.indexOf(marker, offset)) !== -1) {
    const start = offset + marker.length;
    const ends = [
      source.indexOf("\n          audit.end();", start),
      source.indexOf("\n        const cycle", start),
    ];
    const boundary = Math.min(...ends.filter((n) => n >= start));
    const stop = source.lastIndexOf("});", boundary);
    const f = await fixture();
    f.page.getByRole = () => ({ click: async () => {} });
    const callback = runInNewContext(
      `(async (i) => {${source.slice(start, stop)}\n})`,
      {
        page: f.page,
        criteria: f.read.criteria,
        kind: "work",
        audit: { expect() {} },
        ready: pagination.ready,
      },
    );
    await assert.rejects(
      callback(0),
      /not editable/,
      "old editable delivery cannot satisfy a newly requested drag refresh",
    );
    callbacks++;
    offset = start;
  }
  assert.equal(
    callbacks,
    2,
    "both full and scoped producers must use the guarded refresh",
  );
});

test("I3 shared response readiness attributes delayed overtime commit to overtime", async () => {
  const f = await fixture();
  const work = await f.ready();
  assert.equal(work.observedAt, 100);
  assert.equal(work.kind, "work");
  f.set({ kind: "overtime", now: 300 });
  const observed = await f.ready();
  assert.equal(observed?.kind, "overtime");
  assert.equal(observed?.observedAt, 300, "must not reuse work usableAt=100");
  assert.equal(observed?.deliveryId, "delivery-1");
});

test("I4 a correct poll response cannot admit the old displayed delivery", async () => {
  const f = await fixture();
  await assert.rejects(
    f.ready({ fetchedAt: "snapshot-2", afterDeliveryId: "delivery-0" }),
    /not editable/,
  );
});

test("I4 new snapshot with stale footer cannot pass active-kind poll readiness", async () => {
  const f = await fixture();
  await assert.rejects(
    f.ready({
      fetchedAt: "snapshot-1",
      afterDeliveryId: "delivery-0",
      footer: { date: "2026-10-01", day: 11, month: 11 },
    }),
    /not editable/,
  );
});

test("I5 login assertion and context cleanup both survive the row boundary safely", async () => {
  const runDir = await createEvidenceRun(
    resolve(
      process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
        ".agent-runs/MKW-PRODUCT-001/task9-fix-r1",
      "login-fault-",
    ),
  );
  let closes = 0;
  const browser = {
    newContext: async () => ({
      on() {},
      setDefaultTimeout() {},
      addInitScript: async () => {},
      request: { post: async () => ({ status: () => 401 }) },
      close: async () => {
        closes++;
        throw Object.assign(
          new Error(
            "password=private-context-secret postgres://secret@host/db",
          ),
          { code: "CONTEXT_CLOSE_TEST" },
        );
      },
    }),
  };
  const rows = await pagination.measurePaginatedAttendance(
    {
      runDir,
      webOrigin: "http://fixture.invalid",
      accounts: [{ password: "private-login-secret" }],
      benchmarkGlobalCosts: {},
    },
    browser,
    20,
  );
  assert.equal(closes, 4);
  for (const row of rows) {
    assert.equal(row.result, "FAIL");
    assert.equal(row.errorDetails.errors[0].actual, 401);
    assert.equal(row.errorDetails.errors[1].code, "CONTEXT_CLOSE_TEST");
    const retained = JSON.parse(
      await readFile(
        resolve(runDir, `pagination-20-${row.pageSize}-${row.kind}.json`),
        "utf8",
      ),
    );
    assert.deepEqual(retained.errorDetails, row.errorDetails);
    assert.doesNotMatch(
      JSON.stringify(retained),
      /private-context-secret|private-login-secret|postgres:\/\//,
    );
  }
});
