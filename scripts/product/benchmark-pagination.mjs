/**
 * Task9 telemetry: pure workload/clock/acceptance first; browser producer below.
 * One configuration retains raw samples; no legacy profile or rounded budgets.
 * Browser contexts are owned here, sandbox/DB/browser lifetime by benchmark.mjs.
 * File map: projectPaginatedWorkload/combineApiSqlSample/transitionTiming produce
 * raw workload/clock facts; validatePaginatedMeasurements is the pure gate;
 * installPaginationTelemetry observes the built page; ready/markTransition bind
 * exact editable deliveries; measurePaginatedAttendance owns each config's
 * API/load/page/search/poll/input/scroll/drag/GC sequence and context cleanup.
 * Kept together per Task9's planned interface: the producer and validator share
 * one raw metric contract; no product instrumentation or grid engine is added.
 */
import assert from "node:assert/strict";
import { summarize } from "./benchmark-metrics.mjs";
import { measureScrollFrames } from "./benchmark-scroll.mjs";
import { withCleanup } from "./cleanup.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toPageTable } from "../../apps/web/src/features/attendance/model/attendance-read-view.ts";
import { orderedMonthCells } from "../../apps/web/src/features/attendance/model/month-view.ts";
import { matchesAttendancePageRead } from "../../tests/product-e2e/attendance-read-matchers.ts";

export function projectPaginatedWorkload(data, kind) {
  return {
    logicalEmployees: data.pagination.monthEmployeeCount,
    monthEmployeeCount: data.pagination.monthEmployeeCount,
    totalPages: data.pagination.totalPages,
    pageEmployees: data.employees.length,
    snapshots: data.cells.length,
    activeCells: data.cells.filter((c) => c.kind === kind).length,
    numericTotal: data.cells.reduce(
      (sum, c) =>
        sum +
        (c.kind === kind && c.value?.type === "number" ? c.value.value : 0),
      0,
    ),
  };
}

export function combineApiSqlSample(events) {
  assert(events.length > 0, "actual HTTP SQL transaction samples required");
  summarize(events.map((e) => e.ms));
  return {
    transactions: events.length,
    ms: events.reduce((sum, e) => sum + e.ms, 0),
    queries: events.flatMap((e) => e.queries),
  };
}

export function transitionTiming(t) {
  const times = [
    t.dispatchAt,
    t.busyAt,
    t.responseAt,
    t.commitAt,
    t.guardWaitMs,
  ];
  summarize(times);
  assert(t.criteriaMatched && t.editable, "correct editable envelope required");
  assert(
    t.dispatchAt <= t.busyAt &&
      t.busyAt <= t.commitAt &&
      t.dispatchAt <= t.responseAt &&
      t.responseAt <= t.commitAt,
    "transition clock order",
  );
  if (t.debounced)
    assert(
      Number.isFinite(t.inputAt) &&
        t.inputAt >= 0 &&
        t.dispatchAt - t.inputAt >= 299,
      "search debounce clock",
    );
  return {
    busyMs: t.busyAt - t.dispatchAt,
    editableMs: t.commitAt - t.dispatchAt,
    searchMs: t.commitAt - (t.inputAt ?? t.dispatchAt),
    responseToCommitMs: t.commitAt - t.responseAt,
    guardWaitMs: t.guardWaitMs,
  };
}

export function validatePaginatedMeasurements(rows) {
  const failures = [],
    missing = [];
  const keys = new Set();
  for (const row of rows) {
    const key = `${row.logicalEmployees}/${row.pageSize}/${row.kind}`;
    const checks = {};
    const check = (name, operation) => {
      try {
        operation();
        checks[name] = true;
      } catch (error) {
        checks[name] = false;
        failures.push(`${key} ${name}: ${error.message}`);
      }
    };
    check("configuration", () => {
      assert(
        [20, 200, 1000].includes(row.logicalEmployees) &&
          [25, 50].includes(row.pageSize) &&
          ["work", "overtime"].includes(row.kind) &&
          row.days === 31 &&
          row.kinds === 2,
      );
      assert(!keys.has(key), "duplicate configuration");
    });
    keys.add(key);
    const m = row.metrics ?? {},
      size = row.logicalEmployees;
    const sample = (name, values, minimum, budget) =>
      check(name, () => {
        assert(
          Array.isArray(values) && values.length >= minimum,
          `requires ${minimum} raw samples`,
        );
        const s = summarize(values);
        if (budget !== undefined)
          assert(s.p95 <= budget, `p95 ${s.p95} > ${budget}`);
      });
    check("mode", () =>
      assert(
        m.mode === "server-pagination" && !m.sourceMetrics && !m.profile,
        "fresh server-pagination evidence required",
      ),
    );
    check("policy", () => {
      const p = m.policy;
      assert(
        p?.result === "PASS" &&
          p.policyId === "pg17.11-icu67.1-vi-db-authority-v1" &&
          p.pg === "17.11" &&
          p.icu === "67, 1, 0, 0" &&
          p.actualVersion === "153.14.37" &&
          /^[a-f0-9]{64}$/.test(p.fixtureHash) &&
          p.reviewedTip === "321d488f041e6d5386adea9f86ca8749ef896144",
        "reviewed runtime policy missing/drift",
      );
    });
    check("workload", () => {
      const w = m.workload,
        count = Math.min(size, row.pageSize);
      assert(
        w &&
          w.logicalEmployees === size &&
          w.monthEmployeeCount === size &&
          w.totalPages === Math.ceil(size / row.pageSize) &&
          w.pageEmployees === count &&
          w.snapshots === count * 62 &&
          w.activeCells === count * 31,
        "logical dataset/page projection mismatch",
      );
      assert(Number.isFinite(w.numericTotal) && w.numericTotal >= 0);
    });
    for (const name of [
      "apiMs",
      "coldLoadMs",
      "warmLoadMs",
      "renderAfterResponseMs",
      "parseMs",
      "projectionMs",
      "payloadBytes",
    ])
      sample(
        name,
        m[name],
        5,
        name === "apiMs"
          ? size === 200
            ? 500
            : size === 1000
              ? 1500
              : undefined
          : name === "coldLoadMs"
            ? size === 200
              ? 2000
              : size === 1000
                ? 5000
                : undefined
            : undefined,
      );
    sample("editorMs", m.editorMs, 30, size === 1000 ? 150 : 100);
    sample("inputMs", m.inputMs, 30, size === 1000 ? 150 : 100);
    for (const name of ["scrollRuns", "dragRuns"])
      check(name, () => {
        assert(m[name]?.length >= 5, "five 5s runs required");
        for (const run of m[name]) {
          assert(
            Number.isFinite(run.durationMs) &&
              run.durationMs >= 5000 &&
              run.frames?.length > 1,
          );
          const s = summarize(run.frames);
          assert(
            s.p95 <= 33 && s.max <= 200,
            `scroll p95=${s.p95} max=${s.max}`,
          );
        }
      });
    for (const [name, scenarios] of [
      ["pageTransitions", ["initial", "next", "last", "deep"]],
      ["searchTransitions", ["hit", "miss", "clear"]],
    ])
      check(name, () => {
        const values = m[name];
        assert(values?.length >= 30, "30 transitions required");
        for (const scenario of scenarios)
          assert(
            values.some((t) => t.scenario === scenario),
            `missing ${scenario}`,
          );
        const measured = values.map(transitionTiming),
          limit = size === 1000 ? 5000 : 2000;
        assert(
          summarize(measured.map((t) => t.busyMs)).p95 <=
            (size === 1000 ? 150 : 100),
          "busy feedback budget",
        );
        assert(
          summarize(measured.map((t) => t.editableMs)).p95 <= limit,
          "dispatch to editable budget",
        );
        if (name === "searchTransitions")
          for (const t of values)
            assert(
              transitionTiming(t).searchMs <= limit + (t.debounced ? 300 : 0),
              "search input to editable budget",
            );
      });
    check("heap", () => {
      assert(
        m.heapBytes?.length === 11 && m.heapBytes[0] > 0,
        "2 warmups +10 post-GC cycles required",
      );
      summarize(m.heapBytes);
      const growth = (m.heapBytes.at(-1) / m.heapBytes[0] - 1) * 100;
      assert(growth <= 20, `heap growth ${growth}%`);
      assert(
        !m.heapBytes.slice(1).every((n, i) => n > m.heapBytes[i]),
        "monotonic heap growth",
      );
    });
    for (const name of ["listenerCounts", "timerCounts", "queryCacheCounts"])
      check(name, () => {
        assert(m[name]?.length === 11, "11 lifecycle counts required");
        summarize(m[name]);
        assert(
          !m[name].slice(1).every((n, i) => n > m[name][i]),
          "monotonic retention",
        );
        if (name === "queryCacheCounts")
          assert(
            m[name].every((n) => n <= 1),
            "more than active page cached",
          );
      });
    for (const name of ["count", "aggregate", "invariant", "offset"])
      sample(`globalCosts.${name}`, m.globalCosts?.[name], 5);
    check("apiSqlSamples", () => {
      assert(
        m.apiSqlSamples?.length >= 5,
        "five actual API transaction samples required",
      );
      for (const transaction of m.apiSqlSamples) {
        summarize([transaction.ms, ...transaction.queries.map((q) => q.ms)]);
        for (const name of [
          "invariant",
          "count",
          "offset",
          "pageCells",
          "aggregate",
        ])
          assert(
            transaction.queries.some((q) => q.name === name),
            `API SQL missing ${name}`,
          );
      }
    });
    check("poll", () =>
      assert(
        m.poll?.requests >= 1 &&
          m.poll.exactCriteria === true &&
          m.poll.totalsMatch === true,
        "actual active-page poll/global totals evidence required",
      ),
    );
    check("network", () =>
      assert(
        m.network?.fullMonthSubscriptions === 0 &&
          m.network?.unexpectedWrites === 0,
        "unbounded read or hidden write",
      ),
    );
    check("rawInput", () =>
      assert(m.rawInputTableMutations === 0, "raw keypress invalidated table"),
    );
    check("producer", () =>
      assert(
        row.result !== "FAIL" && row.result !== "NOT_RUN",
        row.error ?? "producer incomplete",
      ),
    );
    // Pure validation: the producer separately stores derived checks in its report.
  }
  for (const n of [20, 200, 1000])
    for (const p of [25, 50])
      for (const k of ["work", "overtime"])
        if (!keys.has(`${n}/${p}/${k}`)) missing.push(`missing ${n}/${p}/${k}`);
  return {
    result: failures.length ? "FAIL" : missing.length ? "NOT_RUN" : "PASS",
    failures: [...failures, ...missing],
  };
}

// Runs only in a fresh benchmark context. No product hook or persisted fixture.
export function installPaginationTelemetry() {
  const NativeDate = Date;
  window.Date = class extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : ["2026-10-15T12:00:00+07:00"]));
    }
    static now() {
      return NativeDate.now();
    }
  };
  const telemetry = (window.__paginationBench = {
    reads: [],
    transitions: [],
    feedback: [],
    tableMutations: 0,
    mark: null,
    timers: new Set(),
  });
  const timeout = window.setTimeout.bind(window),
    clear = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => {
    const id = timeout(() => {
      telemetry.timers.delete(id);
      fn(...args);
    }, ms);
    telemetry.timers.add(id);
    return id;
  };
  window.clearTimeout = (id) => {
    telemetry.timers.delete(id);
    return clear(id);
  };
  const interval = window.setInterval.bind(window),
    clearIntervalNative = window.clearInterval.bind(window);
  window.setInterval = (...args) => {
    const id = interval(...args);
    telemetry.timers.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    telemetry.timers.delete(id);
    return clearIntervalNative(id);
  };
  const fetchNative = window.fetch.bind(window),
    jsonNative = Response.prototype.json;
  const requests = new WeakMap();
  window.fetch = async (input, options) => {
    const path = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    ).pathname;
    let record;
    if (path === "/api/v1/attendance/search") {
      record = {
        criteria: JSON.parse(options.body),
        startAt: performance.now(),
      };
      telemetry.reads.push(record);
      if (telemetry.reads.length > 2) telemetry.reads.shift();
      const mark = telemetry.mark;
      if (
        mark &&
        Object.entries(mark.criteria).every(
          ([k, v]) => record.criteria[k] === v,
        )
      ) {
        record.mark = mark;
        // Debounced search dispatch starts when the request is sent; the input
        // clock remains separate. Page/Enter start at the trusted UI event.
        if (mark.debounced || mark.dispatchAt === undefined)
          mark.dispatchAt = record.startAt;
      }
    }
    const response = await fetchNative(input, options);
    if (record) {
      for (const retired of telemetry.reads)
        if (retired !== record) delete retired.data;
      record.responseAt = performance.now();
      requests.set(response, record);
    }
    return response;
  };
  Response.prototype.json = async function () {
    const start = performance.now(),
      data = await jsonNative.call(this),
      record = requests.get(this);
    if (record) {
      record.parseMs = performance.now() - start;
      record.data = data;
      record.bytes = new TextEncoder().encode(JSON.stringify(data)).length;
    }
    return data;
  };
  for (const type of ["click", "change", "input", "keydown"])
    document.addEventListener(
      type,
      (event) => {
        const mark = telemetry.mark;
        if (mark && mark.eventType === type && mark.inputAt === undefined) {
          if (type !== "keydown" || event.key === "Enter") {
            mark.inputAt = performance.now();
            if (!mark.debounced) mark.dispatchAt = mark.inputAt;
          }
        }
        const feedbackType =
          type === "click" && event.target.closest?.("button[data-cell]")
            ? "editor"
            : type === "input" && event.target.matches?.(".editor input")
              ? "input"
              : null;
        if (feedbackType) {
          const start = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              telemetry.feedback.push({
                type: feedbackType,
                ms: performance.now() - start,
              }),
            ),
          );
        }
      },
      true,
    );
  const observer = new MutationObserver((records) => {
    if (telemetry.watchTable)
      telemetry.tableMutations += records.filter((r) =>
        r.target.closest?.(".grid-scroll"),
      ).length;
    const mark = telemetry.mark;
    if (
      mark?.dispatchAt !== undefined &&
      mark.busyAt === undefined &&
      (document.querySelector('.grid-scroll[aria-busy="true"]') ||
        document.body.textContent.includes("Đang tải bảng tháng"))
    )
      mark.busyAt = performance.now();
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
}

async function ready(page, criteria, kind) {
  await page.waitForFunction(
    ({ criteria, kind }) => {
      const t = window.__paginationBench;
      const read = t?.reads.findLast(
        (r) =>
          r.data &&
          Object.entries(criteria).every(([k, v]) => r.criteria[k] === v) &&
          (!t.mark || t.mark.commitAt !== undefined || r.mark === t.mark),
      );
      if (!read) return false;
      const data = read.data,
        region = document.querySelector('.grid-scroll[aria-busy="false"]');
      if (!region || document.querySelector('[role="alert"]')) return false;
      const buttons = [...region.querySelectorAll("button[data-cell]")];
      const ids = [
        ...new Set(buttons.map((b) => b.dataset.cell.split("/")[0])),
      ];
      const expected = data.employees.map((e) => e.id);
      if (
        JSON.stringify(ids) !== JSON.stringify(expected) ||
        buttons.length !==
          expected.length *
            new Date(
              Number(criteria.month.slice(0, 4)),
              Number(criteria.month.slice(5)),
              0,
            ).getDate() ||
        buttons.some((b) => !b.dataset.cell.endsWith("/" + kind) || b.disabled)
      )
        return false;
      // Snapshot status must belong to this exact delivery, including empty search.
      if (!document.body.textContent.includes(data.fetchedAt)) return false;
      read.usableAt ??= performance.now();
      const mark = read.mark;
      if (mark && mark.commitAt === undefined) {
        // A sub-frame busy state may precede observer installation only on cold
        // boot. The initial loading status is observed in ordinary navigation.
        if (mark.busyAt === undefined) return false;
        mark.responseAt = read.responseAt;
        mark.commitAt = performance.now();
        mark.criteriaMatched = true;
        mark.editable = true;
        mark.guardWaitMs = 0;
        t.transitions.push({ ...mark });
      }
      return true;
    },
    { criteria, kind },
    { timeout: 30000 },
  );
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}

async function markTransition(
  page,
  criteria,
  scenario,
  eventType = "click",
  debounced = false,
) {
  await page.evaluate(
    ({ criteria, scenario, eventType, debounced }) => {
      window.__paginationBench.mark = {
        criteria,
        scenario,
        eventType,
        debounced,
      };
    },
    { criteria, scenario, eventType, debounced },
  );
}

export async function measurePaginatedAttendance(sandbox, browser, size) {
  const rows = [];
  let storageState;
  const login = async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ...(storageState ? { storageState } : {}),
    });
    context.setDefaultTimeout(10000);
    try {
      await context.addInitScript(installPaginationTelemetry);
      if (!storageState) {
        const r = await context.request.post(
          `${sandbox.webOrigin}/api/v1/auth/login`,
          { headers: { origin: sandbox.webOrigin }, data: sandbox.accounts[0] },
        );
        assert.equal(r.status(), 200);
        storageState = await context.storageState();
      }
      return context;
    } catch (error) {
      await withCleanup(
        async () => {
          throw error;
        },
        () => context.close(),
      );
    }
  };
  for (const pageSize of [25, 50])
    for (const kind of ["work", "overtime"]) {
      const metrics = {
        mode: "server-pagination",
        policy: sandbox.benchmarkPolicy,
        globalCosts: sandbox.benchmarkGlobalCosts[pageSize],
        apiMs: [],
        parseMs: [],
        projectionMs: [],
        payloadBytes: [],
        coldLoadMs: [],
        warmLoadMs: [],
        renderAfterResponseMs: [],
        pageTransitions: [],
        searchTransitions: [],
        scrollRuns: [],
        network: { fullMonthSubscriptions: 0, unexpectedWrites: 0 },
      };
      const row = {
        logicalEmployees: size,
        days: 31,
        kinds: 2,
        pageSize,
        kind,
        metrics,
        checks: {},
        result: "PASS",
      };
      rows.push(row);
      let context;
      try {
        context = await login();
        metrics.phase = "api";
        const criteria = { month: "2026-10", q: "", page: 1, pageSize };
        const sqlStart = sandbox.benchmarkSqlEvents?.length ?? 0;
        metrics.apiSqlSamples = [];
        for (let i = 0; i < 5; i++) {
          const queryStart = sandbox.benchmarkSqlEvents?.length ?? 0;
          const start = performance.now();
          const response = await context.request.post(
            `${sandbox.webOrigin}/api/v1/attendance/search`,
            { headers: { origin: sandbox.webOrigin }, data: criteria },
          );
          assert.equal(response.status(), 200);
          const text = await response.text(),
            parseAt = performance.now(),
            data = JSON.parse(text);
          metrics.parseMs.push(performance.now() - parseAt);
          metrics.payloadBytes.push(Buffer.byteLength(text));
          const projectionAt = performance.now();
          const table = toPageTable(data);
          const ordered = orderedMonthCells(table, kind);
          metrics.projectionMs.push(performance.now() - projectionAt);
          metrics.projectionScope =
            "Node24 actual toPageTable + orderedMonthCells; remaining React grid projection included in browser render";
          metrics.workload = projectPaginatedWorkload(data, kind);
          assert.equal(ordered.length, metrics.workload.activeCells);
          metrics.hitAbsentFromFirstPage = !data.employees.some(
            (e) => e.id === sandbox.benchmarkHit,
          );
          if (size > pageSize)
            assert(
              metrics.hitAbsentFromFirstPage,
              "search hit must start outside active page",
            );
          metrics.offpageAvailable = size > pageSize;
          metrics.apiMs.push(performance.now() - start);
          assert.deepEqual(data.monthTotals, sandbox.benchmarkTotals);
          metrics.apiSqlSamples.push(
            combineApiSqlSample(
              sandbox.benchmarkSqlEvents?.slice(queryStart) ?? [],
            ),
          );
        }
        await context.close();
        context = undefined;
        const configure = async (page) => {
          await ready(page, { ...criteria, pageSize: 25 }, "work");
          if (pageSize === 50) {
            await page
              .getByLabel("Số nhân sự mỗi trang")
              .first()
              .selectOption("50");
            await ready(page, criteria, "work");
          }
          if (kind === "overtime")
            await page
              .getByRole("tab", { name: "Tăng ca", exact: true })
              .click();
          await ready(page, criteria, kind);
        };
        metrics.phase = "cold-warm";
        for (let i = 0; i < 5; i++) {
          context = await login();
          const page = await context.newPage();
          let start = performance.now();
          await page.goto(sandbox.webOrigin, { waitUntil: "domcontentloaded" });
          await configure(page);
          metrics.coldLoadMs.push(performance.now() - start);
          start = performance.now();
          await page.reload({ waitUntil: "domcontentloaded" });
          await configure(page);
          metrics.warmLoadMs.push(performance.now() - start);
          metrics.renderAfterResponseMs.push(
            await page.evaluate(() => {
              const t = window.__paginationBench,
                r = t.reads.at(-1);
              const resource = performance
                .getEntriesByType("resource")
                .filter(
                  (e) =>
                    new URL(e.name).pathname === "/api/v1/attendance/search" &&
                    e.startTime >= r.startAt - 2,
                )
                .at(-1);
              if (!resource)
                throw new Error("POST Resource Timing correlation missing");
              t.resourceCorrelation = {
                criteria: r.criteria,
                startAt: r.startAt,
                resourceStart: resource.startTime,
                responseEnd: resource.responseEnd,
              };
              return r.usableAt - resource.responseEnd;
            }),
          );
          if (i < 4) {
            await context.close();
            context = undefined;
          }
        }
        const page = context.pages()[0],
          cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        await cdp.send("HeapProfiler.enable");
        const requests = [];
        page.on("request", (request) => {
          const path = new URL(request.url()).pathname;
          if (path === "/api/v1/attendance/search") {
            const body = request.postDataJSON();
            if (!matchesAttendancePageRead(request, body))
              metrics.network.unexpectedWrites++;
            requests.push(body);
          } else if (path === "/api/v1/attendance/month")
            metrics.network.fullMonthSubscriptions++;
          else if (
            path.startsWith("/api/") &&
            !["GET", "HEAD"].includes(request.method())
          )
            metrics.network.unexpectedWrites++;
        });
        const jump = async (target, scenario) => {
          const next = { ...criteria, page: target };
          await page
            .getByLabel("Đến trang", { exact: true })
            .first()
            .fill(String(target));
          await markTransition(page, next, scenario);
          const current = await page.evaluate(
            () => window.__paginationBench.reads.at(-1).data.pagination.page,
          );
          if (current === target)
            await page
              .getByRole("button", { name: "Tải lại bảng", exact: true })
              .click();
          else
            await page
              .getByRole("button", { name: "Đi", exact: true })
              .first()
              .click();
          await ready(page, next, kind);
        };
        const pages = Math.ceil(size / pageSize);
        metrics.phase = "page-transitions";
        // size20 has one physical page: refresh samples label edge/clamped jumps
        // explicitly; it must not borrow page data from another logical dataset.
        for (let i = 0; i < 30; i++) {
          const scenario = ["initial", "next", "last", "deep"][i % 4];
          const current = await page.evaluate(
            () => window.__paginationBench.reads.at(-1).data.pagination.page,
          );
          const target =
            scenario === "last"
              ? pages
              : scenario === "deep"
                ? Math.max(1, Math.ceil(pages / 2))
                : scenario === "next"
                  ? Math.min(pages, current + 1)
                  : 1;
          if (target === current) {
            await markTransition(page, { ...criteria, page: target }, scenario);
            await page
              .getByRole("button", { name: "Tải lại bảng", exact: true })
              .click();
            await ready(page, { ...criteria, page: target }, kind);
          } else await jump(target, scenario);
        }
        await jump(1, "initial");
        const search = page.getByRole("searchbox"),
          hit = sandbox.benchmarkHit;
        metrics.phase = "search-transitions";
        for (let i = 0; i < 30; i++) {
          const scenario = ["hit", "miss", "clear"][i % 3],
            q =
              scenario === "hit"
                ? hit
                : scenario === "miss"
                  ? "not-present-benchmark"
                  : "";
          const next = { ...criteria, q };
          const debounced = i % 2 === 0;
          await markTransition(
            page,
            next,
            scenario,
            debounced ? "input" : "keydown",
            debounced,
          );
          await search.fill(q);
          if (!debounced) await search.press("Enter");
          await ready(page, next, kind);
          const searchData = await page.evaluate(
            () => window.__paginationBench.reads.at(-1).data,
          );
          assert.equal(
            searchData.pagination.totalResults,
            scenario === "hit" ? 1 : scenario === "miss" ? 0 : size,
          );
          assert.equal(searchData.pagination.monthEmployeeCount, size);
          assert.deepEqual(searchData.monthTotals, sandbox.benchmarkTotals);
        }
        // Actual 15s poll of one page while an independent off-page SQL number
        // changes; global footer must update without bringing off-page rows in.
        const before = requests.length;
        metrics.phase = "poll";
        await sandbox.pool.query(
          'UPDATE "AttendanceCell" SET "halfUnits"=5 WHERE "employeeId"=$1::uuid AND date=\'2026-10-01\' AND kind=\'work\'',
          [sandbox.benchmarkOffpage],
        );
        const pollResponse = await page.waitForResponse(
          (r) => matchesAttendancePageRead(r.request(), criteria),
          { timeout: 20000 },
        );
        const pollData = await pollResponse.json();
        await ready(page, criteria, kind);
        metrics.poll = {
          requests: requests.length - before,
          exactCriteria: requests
            .slice(before)
            .every((r) => JSON.stringify(r) === JSON.stringify(criteria)),
          totalsMatch:
            pollData.monthTotals.work.grandTotal ===
            sandbox.benchmarkTotals.work.grandTotal + 1,
        };
        await sandbox.pool.query(
          'UPDATE "AttendanceCell" SET "halfUnits"=3 WHERE "employeeId"=$1::uuid AND date=\'2026-10-01\' AND kind=\'work\'',
          [sandbox.benchmarkOffpage],
        );
        const closeEditor = async () => {
          await page
            .getByRole("button", { name: "Hủy", exact: true })
            .last()
            .click();
          const discard = page.getByRole("button", {
            name: "Bỏ phần nhập và tiếp tục",
            exact: true,
          });
          if (await discard.isVisible()) await discard.click();
        };
        metrics.phase = "editor-input";
        for (let i = 0; i < 30; i++) {
          await page.locator("button[data-cell]").first().click();
          await closeEditor();
        }
        await page.locator("button[data-cell]").first().click();
        await page
          .getByRole("button", { name: "Tùy chỉnh", exact: true })
          .click();
        const input = page.getByLabel(
          kind === "work" ? "Số công tùy chỉnh" : "Số giờ tùy chỉnh",
        );
        // Track exactly the actual labeled input; keypress does not refetch or
        // mutate the table. Paint samples use trusted browser keyboard input.
        await input.evaluate((el) => {
          el.addEventListener("input", () => {
            const at = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                window.__paginationBench.feedback.push({
                  type: "keypress",
                  ms: performance.now() - at,
                }),
              ),
            );
          });
          window.__paginationBench.watchTable = true;
        });
        for (let i = 0; i < 30; i++) {
          await input.focus();
          await page.keyboard.press("ControlOrMeta+a");
          await page.keyboard.press(String((i % 2) + 1));
          await page.evaluate(
            () =>
              new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done)),
              ),
          );
        }
        metrics.rawInputTableMutations = await page.evaluate(() => {
          window.__paginationBench.watchTable = false;
          return window.__paginationBench.tableMutations;
        });
        await closeEditor();
        const feedback = await page.evaluate(
          () => window.__paginationBench.feedback,
        );
        metrics.editorMs = feedback
          .filter((f) => f.type === "editor")
          .map((f) => f.ms);
        metrics.inputMs = feedback
          .filter((f) => f.type === "keypress")
          .map((f) => f.ms);
        for (let i = 0; i < 5; i++) {
          metrics.phase = "scroll";
          const frames = await page.evaluate(measureScrollFrames);
          metrics.scrollRuns.push({
            durationMs: frames.reduce((a, b) => a + b, 0),
            frames,
          });
        }
        metrics.phase = "trusted-mouse-drag";
        metrics.dragRuns = [];
        await page
          .getByRole("button", { name: "Chọn nhiều", exact: true })
          .click();
        for (let i = 0; i < 5; i++) {
          await page.locator(".grid-scroll").evaluate((el) => {
            el.scrollTop = 0;
            el.scrollLeft = 0;
          });
          const cell = page.locator("button[data-cell]").first();
          await cell.scrollIntoViewIfNeeded();
          const box = await cell.boundingBox();
          assert(box, "drag origin visible");
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          const framePromise = page.evaluate(measureScrollFrames, {
            scroll: false,
          });
          try {
            for (let step = 0; step < 25; step++) {
              await page.mouse.move(
                box.x + box.width / 2 + 20 + (step % 5) * 18,
                box.y + box.height / 2 + 20 + (step % 3) * 18,
              );
              await page.waitForTimeout(200);
            }
          } finally {
            await page.mouse.up();
          }
          const frames = await framePromise;
          metrics.dragRuns.push({
            durationMs: frames.reduce((a, b) => a + b, 0),
            frames,
          });
          if (
            await page
              .getByRole("button", { name: "Hủy", exact: true })
              .last()
              .isVisible()
          )
            await closeEditor();
        }
        await page
          .getByRole("button", { name: "Chọn nhiều", exact: true })
          .click();
        const cycle = async () => {
          await jump(pages, "last");
          await jump(1, "initial");
          for (const q of [hit, ""]) {
            await markTransition(
              page,
              { ...criteria, q },
              q ? "hit" : "clear",
              "input",
              true,
            );
            await search.fill(q);
            await ready(page, { ...criteria, q }, kind);
          }
          await page.getByLabel("Tháng chấm công").fill("2026-09");
          await ready(page, { ...criteria, month: "2026-09" }, kind);
          await page.getByLabel("Tháng chấm công").fill("2026-10");
          await ready(page, criteria, kind);
          await page.locator("button[data-cell]").first().click();
          await closeEditor();
          await page.evaluate(() => {
            const t = window.__paginationBench;
            t.transitions = [];
            t.feedback = [];
            t.mark = null;
          });
        };
        const transitions = await page.evaluate(
          () => window.__paginationBench.transitions,
        );
        metrics.pageTransitions = transitions
          .filter((t) => !["hit", "miss", "clear"].includes(t.scenario))
          .slice(0, 30);
        metrics.searchTransitions = transitions
          .filter((t) => ["hit", "miss", "clear"].includes(t.scenario))
          .slice(0, 30);
        await cycle();
        await cycle();
        metrics.phase = "heap-cycles";
        metrics.heapBytes = [];
        metrics.listenerCounts = [];
        metrics.timerCounts = [];
        metrics.queryCacheCounts = [];
        for (let i = 0; i <= 10; i++) {
          if (i) await cycle();
          await cdp.send("HeapProfiler.collectGarbage");
          const perf = await cdp.send("Performance.getMetrics"),
            dom = await cdp.send("Memory.getDOMCounters");
          metrics.heapBytes.push(
            perf.metrics.find((m) => m.name === "JSHeapUsedSize").value,
          );
          metrics.listenerCounts.push(dom.jsEventListeners);
          const retained = await page.evaluate(() => {
            // Read the existing provider instance through React's DOM ownership;
            // no product global/debug API is added for this diagnostic.
            const el = document.querySelector(".grid-scroll"),
              key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
            let fiber = el[key],
              client;
            while (fiber) {
              if (fiber.memoizedProps?.client?.getQueryCache) {
                client = fiber.memoizedProps.client;
                break;
              }
              fiber = fiber.return;
            }
            if (!client) throw new Error("QueryClient diagnostic unavailable");
            return {
              timers: window.__paginationBench.timers.size,
              queries: client
                .getQueryCache()
                .getAll()
                .filter((q) => q.queryKey[0] === "attendance").length,
            };
          });
          metrics.timerCounts.push(retained.timers);
          metrics.queryCacheCounts.push(retained.queries);
        }
        const raw = await page.evaluate(() => ({
          transitions: window.__paginationBench.transitions,
          resourceCorrelation: window.__paginationBench.resourceCorrelation,
        }));
        metrics.resourceCorrelation = raw.resourceCorrelation;
        metrics.requestCount = requests.length;
        metrics.apiSqlAllEvents = sandbox.benchmarkSqlEvents?.slice(sqlStart);
        metrics.heapWarmups = 2;
        metrics.phase = "measured";
        const validation = validatePaginatedMeasurements([row]);
        row.failures = validation.failures.filter(
          (f) => !f.startsWith("missing "),
        );
        row.checks = {
          measured: !validation.failures.some((f) => !f.startsWith("missing ")),
        };
        if (!row.checks.measured) row.result = "FAIL";
      } catch (error) {
        row.result = "FAIL";
        row.error = error.message;
        const page = context?.pages()[0];
        if (page) {
          try {
            metrics.failureState = await page.evaluate(() => ({
              url: location.href,
              reads: window.__paginationBench?.reads.map((r) => ({
                criteria: r.criteria,
                responseAt: r.responseAt,
                parseMs: r.parseMs,
                employees: r.data?.employees?.length,
              })),
              mark: window.__paginationBench?.mark,
              busy: document
                .querySelector(".grid-scroll")
                ?.getAttribute("aria-busy"),
              cells: document.querySelectorAll("button[data-cell]").length,
              alerts: [...document.querySelectorAll('[role="alert"]')].map(
                (e) => e.textContent,
              ),
            }));
          } catch (diagnosticError) {
            metrics.diagnosticError = diagnosticError.message;
          }
        }
      } finally {
        try {
          await withCleanup(
            async () => {},
            () => context?.close(),
          );
        } catch (error) {
          row.result = "FAIL";
          row.cleanupError = error.message;
        }
        await writeFile(
          resolve(
            sandbox.runDir,
            `pagination-${size}-${pageSize}-${kind}.json`,
          ),
          JSON.stringify(row, null, 2),
          { flag: "wx" },
        );
      }
      console.log(
        JSON.stringify({
          size,
          pageSize,
          kind,
          result: row.result,
          error: row.error,
          api: metrics.apiMs.length ? summarize(metrics.apiMs).p95 : null,
          cold: metrics.coldLoadMs.length
            ? summarize(metrics.coldLoadMs).p95
            : null,
        }),
      );
    }
  return rows;
}
