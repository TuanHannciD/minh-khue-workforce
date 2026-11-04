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
import { validateHeapBudget, validateHeapAcceptance } from "./heap-tooling.mjs";
import { measureScrollFrames } from "./benchmark-scroll.mjs";
import { withCleanup } from "./cleanup.mjs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toPageTable } from "../../apps/web/src/features/attendance/model/attendance-read-view.ts";
import { orderedMonthCells } from "../../apps/web/src/features/attendance/model/month-view.ts";
import { matchesAttendancePageRead } from "../../tests/product-e2e/attendance-read-matchers.ts";

// Error messages from drivers can contain credentials or raw SQL. Retain only
// structural causes, harness stages, codes and scalar assertion facts.
export function safeBenchmarkError(error, depth = 0, seen = new Set()) {
  if (!error || depth > 5 || seen.has(error)) return { name: "TruncatedError" };
  seen.add(error);
  const result = {
    name: [
      "Error",
      "AssertionError",
      "AggregateError",
      "TimeoutError",
    ].includes(error.name)
      ? error.name
      : "Error",
  };
  if (/^[A-Z0-9_]{1,64}$/.test(String(error.code ?? "")))
    result.code = error.code;
  for (const key of ["actual", "expected", "status"])
    if (typeof error[key] === "number" || typeof error[key] === "boolean")
      result[key] = error[key];
  if (
    ["login", "context-setup", "context-close"].includes(error.benchmarkStage)
  )
    result.stage = error.benchmarkStage;
  if (error.errors)
    result.errors = [...error.errors]
      .slice(0, 8)
      .map((e) => safeBenchmarkError(e, depth + 1, new Set(seen)));
  if (error.cause)
    result.cause = safeBenchmarkError(error.cause, depth + 1, new Set(seen));
  return result;
}

const canonicalKeys = ["month", "page", "pageSize", "q"];
export function exactPageCriteria(body, expected) {
  return (
    body &&
    expected &&
    JSON.stringify(Object.keys(body).sort()) ===
      JSON.stringify(canonicalKeys) &&
    typeof body.month === "string" &&
    /^\d{4}-\d{2}$/.test(body.month) &&
    typeof body.q === "string" &&
    Number.isInteger(body.page) &&
    body.page > 0 &&
    [25, 50].includes(body.pageSize) &&
    canonicalKeys.every((key) => body[key] === expected[key])
  );
}

// Node-owned facts never enter the measured renderer. Expectations are armed by
// the scenario before its UI action; only the 15s active-page timer is unsolicited.
export function createPageNetworkAudit(
  context,
  network,
  now = () => performance.now(),
) {
  let scope,
    pending,
    active,
    lastReadAt = -Infinity;
  const end = () => {
    if (scope && scope.endAt === undefined) {
      scope.endAt = now();
      scope.pending = Boolean(pending);
    }
  };
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return;
    const at = now(),
      method = request.method();
    const fact = {
      scopeId: scope?.id,
      phase: scope?.phase ?? "unscoped",
      at,
      method,
      path,
    };
    if (path === "/api/v1/attendance/search") {
      let body;
      try {
        body = request.postDataJSON();
      } catch {
        /* malformed body is a failed read */
      }
      fact.keys = Object.keys(body ?? {}).sort();
      fact.criteria = Object.fromEntries(
        canonicalKeys
          .filter(
            (k) =>
              typeof body?.[k] === "string" || typeof body?.[k] === "number",
          )
          .map((k) => [k, body[k]]),
      );
      const expected = pending ?? active;
      fact.expected = expected ? { ...expected.criteria } : null;
      fact.scenario = expected?.scenario;
      fact.elapsedSinceReadMs = Number.isFinite(lastReadAt)
        ? at - lastReadAt
        : null;
      const matches =
        method === "POST" &&
        exactPageCriteria(body, fact.expected) &&
        matchesAttendancePageRead(request, fact.expected);
      fact.classification =
        matches && pending
          ? "scenario"
          : matches && active && at - lastReadAt >= 14900
            ? "active-poll"
            : "unexpected-read";
      if (fact.classification === "scenario") {
        active = pending;
        pending = undefined;
      }
      if (fact.classification === "unexpected-read") network.unexpectedReads++;
      lastReadAt = at;
    } else if (path === "/api/v1/attendance/month")
      network.fullMonthSubscriptions++;
    else if (!["GET", "HEAD"].includes(method)) network.unexpectedWrites++;
    network.facts.push(fact);
  });
  return {
    begin(phase, carryActive = false) {
      end();
      pending = undefined;
      if (!carryActive) {
        active = undefined;
        lastReadAt = -Infinity;
      }
      scope = {
        id: network.coverage.length + 1,
        phase,
        startAt: now(),
        attachedBeforeNavigation: true,
      };
      network.coverage.push(scope);
    },
    expect(criteria, scenario) {
      assert(!pending, "previous network expectation unconsumed");
      pending = { criteria: { ...criteria }, scenario };
    },
    end,
  };
}

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

export function assertDragRun(run, kind, { budget = true } = {}) {
  assert(
    run?.durationMs >= 5000 && run.frames?.length > 1,
    "five seconds of drag frames required",
  );
  const stats = summarize(run.frames);
  if (budget)
    assert(
      stats.p95 <= 33 && stats.max <= 200,
      `drag p95=${stats.p95} max=${stats.max}`,
    );
  const g = run.gesture;
  assert(
    g && ["Control", "Meta"].includes(g.modifier),
    "valid additive modifier required",
  );
  const trustedMouse = (p, modifier) => {
    assert(
      p?.isTrusted === true && p.pointerType === "mouse" && p.button === 0,
    );
    assert.equal(p.ctrlKey, modifier === "Control");
    assert.equal(p.metaKey, modifier === "Meta");
  };
  trustedMouse(g.pointerDown, g.modifier);
  trustedMouse(g.plain?.pointerDown, undefined);
  assert.equal(g.plain.active, false, "plain append drag must be rejected");
  assert.deepEqual(
    g.plain.targets,
    [],
    "ignored drag cannot provide selection evidence",
  );
  assert(g.employeeIds?.length === 3 && new Set(g.employeeIds).size === 3);
  assert.deepEqual(g.dates, ["2026-10-01", "2026-10-02", "2026-10-03"]);
  const expected = g.employeeIds
    .flatMap((id) => g.dates.map((date) => `${id}/${date}/${kind}`))
    .sort();
  assert.equal(g.origin, `${g.employeeIds[0]}/${g.dates[0]}/${kind}`);
  assert.equal(g.endpoint, `${g.employeeIds[2]}/${g.dates[2]}/${kind}`);
  assert.equal(g.geometry?.fromHit, g.origin, "origin hit-test missing");
  assert.equal(g.geometry?.toHit, g.endpoint, "endpoint hit-test missing");
  assert.equal(g.delivery?.kind, kind);
  assert(
    g.delivery.deliveryId &&
      g.employeeIds.every((id) => g.delivery.employeeIds.includes(id)),
  );
  assert.equal(g.delivery.criteria.month, "2026-10");
  assert.equal(g.delivery.criteria.q, "");
  assert.equal(g.delivery.criteria.page, 1);
  assert.equal(g.activation?.active, true, "selection activation missing");
  assert.deepEqual(g.activation.targets, [g.origin]);
  assert.equal(g.preview?.active, true, "active selection preview missing");
  assert.deepEqual(
    g.preview.targets,
    expected,
    "preview must match the independent rectangle",
  );
  assert.equal(g.committed?.active, false);
  assert.deepEqual(
    g.committed.targets,
    expected,
    "selected targets mismatch after release",
  );
  assert.equal(
    g.committed.selectedCount,
    expected.length,
    "bulk preview count mismatch",
  );
  assert.deepEqual(g.expectedTargets, expected);
  summarize([
    g.activation.observedAt,
    g.preview.observedAt,
    g.committed.observedAt,
  ]);
  assert(
    g.preview.observedAt >= g.activation.observedAt &&
      g.committed.observedAt >= g.preview.observedAt,
  );
  assert(
    g.committed.observedAt - g.activation.observedAt >= 5000,
    "frames must cover the active gesture",
  );
}

// The same workload is used by full acceptance and the bounded drag-only rerun.
// DOM state and trusted pointer facts prove that frames cover a real gesture.
export async function measureTrustedDragRuns(page, frames, prepareRun) {
  const state = () =>
    page.evaluate(() => ({
      observedAt: performance.now(),
      active: document
        .querySelector(".grid-scroll")
        .classList.contains("selection-dragging"),
      targets: [
        ...document.querySelectorAll('button[data-cell][aria-pressed="true"]'),
      ]
        .map((el) => el.dataset.cell)
        .sort(),
      pointerDown: window.__dragPointer,
      selectedCount: Number(
        document
          .querySelector('.bulk-editor [role="status"]')
          ?.textContent.match(/^(\d+) ô chọn/)?.[1],
      ),
    }));
  const tool = page.getByRole("button", { name: "Chọn nhiều", exact: true });
  let stage = "toggle";
  await tool.click();
  try {
    await page.evaluate(() => {
      document.addEventListener(
        "pointerdown",
        (e) => {
          window.__dragPointer = {
            isTrusted: e.isTrusted,
            pointerType: e.pointerType,
            button: e.button,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
          };
        },
        { capture: true },
      );
    });
    for (let i = 0; i < 5; i++) {
      const delivery = await prepareRun(i);
      stage = `run-${i}-plain`;
      await page.locator(".grid-scroll").evaluate((el) => {
        el.scrollIntoView({ block: "center" });
        el.scrollTop = 0;
        el.scrollLeft = 0;
      });
      const cells = page
        .locator("tbody tr")
        .first()
        .locator("button[data-cell]");
      await cells.first().scrollIntoViewIfNeeded();
      const grid = await page.evaluate(() => {
        const rows = [
          ...document.querySelectorAll(".grid-scroll tbody tr"),
        ].slice(0, 3);
        const keys = rows.map((row) =>
          [...row.querySelectorAll("button[data-cell]")]
            .slice(0, 3)
            .map((el) => el.dataset.cell),
        );
        return {
          keys,
          employeeIds: keys.map((r) => r[0].split("/")[0]),
          dates: keys[0].map((key) => key.split("/")[1]),
        };
      });
      const origin = grid.keys[0][0],
        endpoint = grid.keys[2][2];
      const point = async (key) => {
        const box = await page
          .locator(`button[data-cell="${key}"]`)
          .boundingBox();
        assert(box, "drag target visible");
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      const from = await point(origin),
        to = await point(endpoint);
      const geometry = await page.evaluate(
        ({ from, to }) => {
          const grid = document.querySelector(".grid-scroll"),
            box = grid.getBoundingClientRect();
          const rect = (selector) => {
            const r = grid.querySelector(selector)?.getBoundingClientRect();
            return r
              ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
              : null;
          };
          return {
            from,
            to,
            box: {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
            },
            name: rect("tbody th.name"),
            total: rect("tbody td.total"),
            head: rect("thead"),
            fromHit: document
              .elementFromPoint(from.x, from.y)
              ?.closest("[data-position]")
              ?.getAttribute("data-position"),
            toHit: document
              .elementFromPoint(to.x, to.y)
              ?.closest("[data-position]")
              ?.getAttribute("data-position"),
          };
        },
        { from, to },
      );
      assert.equal(
        geometry.fromHit,
        origin,
        "origin must pass actual hit testing",
      );
      assert.equal(
        geometry.toHit,
        endpoint,
        "endpoint must pass actual hit testing",
      );
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      let plain;
      await withCleanup(
        async () => {
          await page.mouse.move(to.x, to.y);
          plain = await state();
          assert.equal(plain.active, false);
          assert.deepEqual(plain.targets, []);
        },
        () => page.mouse.up(),
      );
      assert.deepEqual(
        (await state()).targets,
        [],
        "plain rejected drag must not commit targets",
      );
      await page.mouse.move(from.x, from.y);
      await page.keyboard.down("Control");
      stage = `run-${i}-active`;
      let activation, preview, samples;
      await withCleanup(
        async () => {
          await page.mouse.down();
          await page.mouse.move(from.x + 2, from.y + 2);
          await page.waitForFunction(() =>
            document.querySelector(".selection-dragging"),
          );
          activation = await state();
          const framePromise = page.evaluate(measureScrollFrames, {
            scroll: false,
          });
          // Own the frame promise even when an interaction/assertion fails.
          await withCleanup(
            async () => {
              for (let step = 0; step < 25; step++) {
                const target = step % 2 ? from : to;
                await page.mouse.move(target.x, target.y);
                if (step === 24) preview = await state();
                await page.waitForTimeout(200);
              }
            },
            async () => {
              samples = await framePromise;
            },
          );
        },
        () => page.mouse.up(),
        () => page.keyboard.up("Control"),
      );
      const committed = await state();
      stage = `run-${i}-commit`;
      const run = {
        durationMs: samples.reduce((a, b) => a + b, 0),
        frames: samples,
        gesture: {
          modifier: "Control",
          pointerDown: activation.pointerDown,
          plain,
          employeeIds: grid.employeeIds,
          dates: grid.dates,
          origin,
          endpoint,
          geometry,
          delivery,
          expectedTargets: grid.keys.flat().sort(),
          activation,
          preview,
          committed,
        },
      };
      frames.push(run);
      // Gesture correctness is required even if frame timing exceeds the budget.
      assert.deepEqual(preview.targets, run.gesture.expectedTargets);
      assert.deepEqual(committed.targets, run.gesture.expectedTargets);
      assert.equal(committed.selectedCount, 9);
      assertDragRun(run, origin.split("/")[2], { budget: false });
      await page
        .getByRole("button", { name: "Hủy", exact: true })
        .last()
        .click();
      const discard = page.getByRole("button", {
        name: "Bỏ phần nhập và tiếp tục",
        exact: true,
      });
      if (await discard.isVisible()) await discard.click();
      assert.deepEqual((await state()).targets, []);
    }
    return frames;
  } catch (error) {
    if (!error.code || error.code === "ERR_ASSERTION")
      error.code = `DRAG_${stage.toUpperCase().replaceAll("-", "_")}`;
    throw error;
  } finally {
    await tool.click();
  }
}

export function validateScopedDragMeasurements(rows) {
  const failures = [],
    keys = new Set();
  for (const row of rows) {
    const key = `${row.logicalEmployees}/${row.pageSize}/${row.kind}`;
    try {
      assert(
        [20, 200, 1000].includes(row.logicalEmployees) &&
          [25, 50].includes(row.pageSize) &&
          ["work", "overtime"].includes(row.kind),
      );
      assert(!keys.has(key), "duplicate configuration");
      assert.equal(row.metrics?.mode, "server-pagination");
      assert.equal(row.metrics?.scope, "drag-only");
      assert.equal(row.result, "PASS");
      assert.equal(row.metrics.dragRuns?.length, 5);
      for (const run of row.metrics.dragRuns) assertDragRun(run, row.kind);
      const n = row.metrics.network;
      assert(
        n &&
          n.unexpectedWrites === 0 &&
          n.fullMonthSubscriptions === 0 &&
          n.unexpectedReads === 0,
      );
      assert(
        n.coverage.every(
          (c) =>
            c.attachedBeforeNavigation && c.endAt >= c.startAt && !c.pending,
        ),
      );
      assert(n.facts.some((f) => f.scenario === "drag-bootstrap"));
      for (const f of n.facts) {
        assert(
          n.coverage.some(
            (c) => c.id === f.scopeId && f.at >= c.startAt && f.at <= c.endAt,
          ),
        );
        if (f.path === "/api/v1/attendance/search") {
          assert.equal(f.method, "POST");
          assert(exactPageCriteria(f.criteria, f.expected));
          assert(["scenario", "active-poll"].includes(f.classification));
        } else assert(["GET", "HEAD"].includes(f.method));
      }
    } catch (error) {
      failures.push(`${key} drag-only: ${error.message}`);
    }
    keys.add(key);
  }
  const missing = [];
  for (const n of [20, 200, 1000])
    for (const p of [25, 50])
      for (const k of ["work", "overtime"])
        if (!keys.has(`${n}/${p}/${k}`)) missing.push(`missing ${n}/${p}/${k}`);
  return {
    scope: "drag-only",
    overallPerformance: "NOT_RUN",
    result: failures.length ? "FAIL" : missing.length ? "NOT_RUN" : "PASS",
    failures: [...failures, ...missing],
  };
}

export function validatePaginatedMeasurements(rows) {
  const failures = [],
    missing = [],
    heapDiagnostics = {};
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
        m.mode === "server-pagination" &&
          !m.sourceMetrics &&
          !m.profile &&
          !m.scope,
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
          if (name === "dragRuns") assertDragRun(run, row.kind);
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
      const budget = validateHeapBudget(m);
      heapDiagnostics[key] = budget.diagnostics;
      assert.equal(budget.failures.length, 0, budget.failures.join("; "));
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
    check("renderCorrelations", () => {
      assert.equal(
        m.renderCorrelations?.length,
        5,
        "five delivery/kind correlations required",
      );
      m.renderCorrelations.forEach((r, i) => {
        assert(
          r.deliveryId &&
            r.kind === row.kind &&
            exactPageCriteria(r.criteria, {
              month: "2026-10",
              q: "",
              page: 1,
              pageSize: row.pageSize,
            }),
        );
        summarize([r.startAt, r.resourceStart, r.responseEnd, r.observedAt]);
        assert(
          r.resourceStart >= r.startAt - 2 && r.observedAt >= r.responseEnd,
        );
        assert.equal(m.renderAfterResponseMs[i], r.observedAt - r.responseEnd);
      });
    });
    check("poll", () => {
      assert(
        m.poll?.requests >= 1 &&
          m.poll.exactCriteria === true &&
          m.poll.totalsMatch === true,
        "actual active-page poll/global totals evidence required",
      );
      const p = m.poll;
      assert(
        p.observed?.deliveryId &&
          p.observed.deliveryId !== p.beforeDeliveryId &&
          p.observed.fetchedAt === p.responseFetchedAt &&
          p.observed.kind === row.kind,
      );
      assert.equal(p.observed.footer.day, p.expected.footer.day);
      assert.equal(p.observed.footer.month, p.expected.footer.month);
      assert.deepEqual(p.observed.employeeIds, p.expected.employeeIds);
      assert.equal(p.mutationKind, row.kind);
      assert.equal(p.offpageAvailable, size > row.pageSize);
      if (p.offpageAvailable)
        assert(!p.observed.employeeIds.includes(p.mutatedEmployeeId));
    });
    check("network", () => {
      assert(
        m.network?.fullMonthSubscriptions === 0 &&
          m.network?.unexpectedWrites === 0 &&
          m.network?.unexpectedReads === 0,
        "unbounded read or hidden write",
      );
      const n = m.network;
      for (const phase of ["cold", "warm"])
        assert.equal(
          n.coverage?.filter((c) => c.phase === phase).length,
          5,
          "bootstrap coverage missing",
        );
      assert(n.coverage.some((c) => c.phase === "interactive"));
      for (const c of n.coverage)
        assert(
          c.attachedBeforeNavigation &&
            Number.isFinite(c.startAt) &&
            c.endAt >= c.startAt &&
            !c.pending,
        );
      for (const c of n.coverage.filter((c) =>
        ["cold", "warm"].includes(c.phase),
      )) {
        assert(
          n.facts.some(
            (f) =>
              f.scopeId === c.id &&
              f.scenario === `${c.phase}-bootstrap` &&
              f.classification === "scenario",
          ),
          "bootstrap search facts missing",
        );
      }
      assert(n.facts?.length > 0, "raw requests missing");
      for (const f of n.facts) {
        const c = n.coverage.find((c) => c.id === f.scopeId);
        assert(c && f.at >= c.startAt && f.at <= c.endAt, "uncovered request");
        assert.notEqual(
          f.path,
          "/api/v1/attendance/month",
          "fullmonth subscription",
        );
        if (f.path === "/api/v1/attendance/search") {
          assert.equal(f.method, "POST");
          assert.deepEqual(f.keys, canonicalKeys);
          assert(
            exactPageCriteria(f.criteria, f.expected),
            "independent criteria mismatch",
          );
          assert(
            ["scenario", "active-poll"].includes(f.classification),
            "extra read",
          );
          if (f.classification === "active-poll")
            assert(f.elapsedSinceReadMs >= 14900);
        } else assert(["GET", "HEAD"].includes(f.method), "unexpected write");
      }
    });
    check("rawInput", () =>
      assert(m.rawInputTableMutations === 0, "raw keypress invalidated table"),
    );
    if (row.result === "NOT_RUN") missing.push(`${key} producer incomplete`);
    check("producer", () =>
      assert(row.result !== "FAIL", row.error ?? "producer incomplete"),
    );
    // Pure validation: the producer separately stores derived checks in its report.
  }
  for (const n of [20, 200, 1000])
    for (const p of [25, 50])
      for (const k of ["work", "overtime"])
        if (!keys.has(`${n}/${p}/${k}`)) missing.push(`missing ${n}/${p}/${k}`);
  const heap = validateHeapAcceptance(rows);
  // Keep Missing evidence separate from executed violations. The compatibility
  // failures list still includes missing prerequisites for existing consumers.
  for (const failure of heap.failures)
    if (!failures.includes(failure)) failures.push(failure);
  for (const item of [...heap.missing, ...heap.blocked])
    if (!missing.includes(item)) missing.push(item);
  const result = failures.length ? "FAIL" : missing.length ? "NOT_RUN" : "PASS";
  return {
    result,
    exitCode: result === "FAIL" ? 1 : result === "NOT_RUN" ? 2 : 0,
    violations: failures,
    missing,
    blocked: heap.blocked,
    heapDiagnostics,
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
    sequence: 0,
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
        id: `delivery-${++telemetry.sequence}`,
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

export function observeEditableDelivery({ criteria, kind, requirement = {} }) {
  const t = window.__paginationBench;
  const read = t?.reads.findLast(
    (r) =>
      r.data &&
      Object.entries(criteria).every(([k, v]) => r.criteria[k] === v) &&
      (!t.mark || t.mark.commitAt !== undefined || r.mark === t.mark),
  );
  if (
    !read ||
    read.id === requirement.afterDeliveryId ||
    (requirement.fetchedAt && read.data.fetchedAt !== requirement.fetchedAt)
  )
    return false;
  const data = read.data,
    region = document.querySelector('.grid-scroll[aria-busy="false"]');
  if (!region || document.querySelector('[role="alert"]')) return false;
  const buttons = [...region.querySelectorAll("button[data-cell]")];
  const ids = [...new Set(buttons.map((b) => b.dataset.cell.split("/")[0]))];
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
  const footer = {};
  if (requirement.footer) {
    const unit = kind === "work" ? "công" : "giờ";
    const number = (selector) => {
      const text = region.querySelector(selector)?.textContent?.trim();
      return text ? Number(text.replace(/\./g, "").replace(",", ".")) : NaN;
    };
    footer.day = number(
      `tfoot [aria-label="Tổng ${requirement.footer.date} · ${unit}"]`,
    );
    footer.month = number(`tfoot [aria-label="Tổng tháng · ${unit}"]`);
    if (
      footer.day !== requirement.footer.day ||
      footer.month !== requirement.footer.month
    )
      return false;
  }
  if (
    requirement.employeeIds &&
    JSON.stringify(ids) !== JSON.stringify(requirement.employeeIds)
  )
    return false;
  const observedAt = performance.now();
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
  return {
    deliveryId: read.id,
    criteria: read.criteria,
    kind,
    observedAt,
    fetchedAt: data.fetchedAt,
    employeeIds: ids,
    footer,
    startAt: read.startAt,
  };
}

export async function ready(page, criteria, kind, requirement = {}) {
  const handle = await page.waitForFunction(
    observeEditableDelivery,
    { criteria, kind, requirement },
    { timeout: 30000 },
  );
  const observed = await handle.jsonValue();
  await handle.dispose?.();
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  return observed;
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

export async function measurePaginatedAttendance(
  sandbox,
  browser,
  size,
  { scope = "full" } = {},
) {
  const rows = [];
  let storageState;
  const audits = new WeakMap();
  const login = async (network) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ...(storageState ? { storageState } : {}),
    });
    let stage = "context-setup";
    try {
      context.setDefaultTimeout(10000);
      const audit = createPageNetworkAudit(context, network);
      audits.set(context, audit);
      audit.begin("setup");
      await context.addInitScript(installPaginationTelemetry);
      if (!storageState) {
        stage = "login";
        const r = await context.request.post(
          `${sandbox.webOrigin}/api/v1/auth/login`,
          { headers: { origin: sandbox.webOrigin }, data: sandbox.accounts[0] },
        );
        network.auth.push({ phase: "fixture-login", status: r.status() });
        assert.equal(r.status(), 200);
        storageState = await context.storageState();
      }
      return context;
    } catch (error) {
      error.benchmarkStage = stage;
      audits.get(context)?.end();
      await withCleanup(
        async () => {
          throw error;
        },
        async () => {
          try {
            await context.close();
          } catch (error) {
            error.benchmarkStage = "context-close";
            throw error;
          }
        },
      );
    }
  };
  for (const pageSize of [25, 50])
    for (const kind of ["work", "overtime"]) {
      const metrics = {
        mode: "server-pagination",
        policy: sandbox.benchmarkPolicy,
        globalCosts: sandbox.benchmarkGlobalCosts?.[pageSize],
        ...(scope === "drag-only" ? { scope } : {}),
        apiMs: [],
        parseMs: [],
        projectionMs: [],
        payloadBytes: [],
        coldLoadMs: [],
        warmLoadMs: [],
        renderAfterResponseMs: [],
        renderCorrelations: [],
        pageTransitions: [],
        searchTransitions: [],
        scrollRuns: [],
        network: {
          fullMonthSubscriptions: 0,
          unexpectedWrites: 0,
          unexpectedReads: 0,
          coverage: [],
          facts: [],
          auth: [],
          apiPhase:
            "isolated APIRequestContext; fullmonth oracle owned by runner, never page",
        },
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
        context = await login(metrics.network);
        if (scope === "drag-only") {
          const audit = audits.get(context);
          const criteria = { month: "2026-10", q: "", page: 1, pageSize };
          audit.begin("drag-bootstrap");
          audit.expect({ ...criteria, pageSize: 25 }, "drag-bootstrap");
          const page = await context.newPage();
          await page.goto(sandbox.webOrigin, { waitUntil: "domcontentloaded" });
          await ready(page, { ...criteria, pageSize: 25 }, "work");
          if (pageSize === 50) {
            audit.expect(criteria, "drag-configure-size50");
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
          const delivery = await ready(page, criteria, kind);
          metrics.delivery = delivery;
          metrics.workload = await page.evaluate((kind) => {
            const data = window.__paginationBench.reads.at(-1).data;
            return {
              logicalEmployees: data.pagination.monthEmployeeCount,
              pageEmployees: data.employees.length,
              activeCells: data.cells.filter((c) => c.kind === kind).length,
            };
          }, kind);
          assert.equal(metrics.workload.logicalEmployees, size);
          assert.equal(
            metrics.workload.pageEmployees,
            Math.min(size, pageSize),
          );
          metrics.phase = "trusted-mouse-drag";
          metrics.dragRuns = [];
          await measureTrustedDragRuns(page, metrics.dragRuns, async (i) => {
            const previous = await ready(page, criteria, kind);
            audit.expect(criteria, `drag-prepare-${i}`);
            await page
              .getByRole("button", { name: "Tải lại bảng", exact: true })
              .click();
            return ready(page, criteria, kind, {
              afterDeliveryId: previous.deliveryId,
            });
          });
          audit.end();
          const validation = validateScopedDragMeasurements([row]);
          row.failures = validation.failures.filter(
            (f) => !f.startsWith("missing "),
          );
          row.checks = { dragOnly: row.failures.length === 0 };
          if (!row.checks.dragOnly) row.result = "FAIL";
          metrics.phase = "drag-only-measured";
          continue;
        }
        audits.get(context).begin("api");
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
        audits.get(context).end();
        await context.close();
        context = undefined;
        const configure = async (page) => {
          await ready(page, { ...criteria, pageSize: 25 }, "work");
          if (pageSize === 50) {
            audits.get(context).expect(criteria, "configure-size50");
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
          return ready(page, criteria, kind);
        };
        metrics.phase = "cold-warm";
        for (let i = 0; i < 5; i++) {
          context = await login(metrics.network);
          const audit = audits.get(context);
          audit.begin("cold");
          audit.expect({ ...criteria, pageSize: 25 }, "cold-bootstrap");
          const page = await context.newPage();
          let start = performance.now();
          await page.goto(sandbox.webOrigin, { waitUntil: "domcontentloaded" });
          await configure(page);
          metrics.coldLoadMs.push(performance.now() - start);
          audit.begin("warm");
          audit.expect({ ...criteria, pageSize: 25 }, "warm-bootstrap");
          start = performance.now();
          await page.reload({ waitUntil: "domcontentloaded" });
          const observed = await configure(page);
          metrics.warmLoadMs.push(performance.now() - start);
          const correlation = await page.evaluate((observed) => {
            const t = window.__paginationBench,
              r = t.reads.find((r) => r.id === observed.deliveryId);
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
            return {
              ...observed,
              criteria: r.criteria,
              startAt: r.startAt,
              resourceStart: resource.startTime,
              responseEnd: resource.responseEnd,
            };
          }, observed);
          metrics.renderCorrelations.push(correlation);
          metrics.renderAfterResponseMs.push(
            correlation.observedAt - correlation.responseEnd,
          );
          audit.end();
          if (i < 4) {
            await context.close();
            context = undefined;
          }
        }
        const page = context.pages()[0],
          cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        await cdp.send("HeapProfiler.enable");
        const audit = audits.get(context);
        audit.begin("interactive", true);
        const requests = () =>
          metrics.network.facts.filter(
            (f) => f.path === "/api/v1/attendance/search",
          );
        const jump = async (target, scenario) => {
          const next = { ...criteria, page: target };
          audit.expect(next, scenario);
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
            audit.expect({ ...criteria, page: target }, scenario);
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
          audit.expect(next, scenario);
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
        const before = requests().length;
        metrics.phase = "poll";
        const previous = await ready(page, criteria, kind);
        if (size > pageSize)
          assert(
            !previous.employeeIds.includes(sandbox.benchmarkOffpage),
            "poll mutation must be outside active page",
          );
        const original = await sandbox.pool.query(
          'SELECT "halfUnits" FROM "AttendanceCell" WHERE "employeeId"=$1::uuid AND date=\'2026-10-01\' AND kind=$2',
          [sandbox.benchmarkOffpage, kind],
        );
        const halfUnits = original.rows[0]?.halfUnits;
        assert.equal(
          typeof halfUnits,
          "number",
          "numeric active-kind poll fixture required",
        );
        const expectedFooter = {
          date: "2026-10-01",
          day:
            sandbox.benchmarkTotals[kind].byDate.find(
              (d) => d.date === "2026-10-01",
            ).value + 1,
          month: sandbox.benchmarkTotals[kind].grandTotal + 1,
        };
        await withCleanup(
          async () => {
            await sandbox.pool.query(
              'UPDATE "AttendanceCell" SET "halfUnits"=$3 WHERE "employeeId"=$1::uuid AND date=\'2026-10-01\' AND kind=$2',
              [sandbox.benchmarkOffpage, kind, halfUnits + 2],
            );
            const pollResponse = await page.waitForResponse(
              (r) => matchesAttendancePageRead(r.request(), criteria),
              { timeout: 20000 },
            );
            const pollData = await pollResponse.json();
            const observed = await ready(page, criteria, kind, {
              fetchedAt: pollData.fetchedAt,
              afterDeliveryId: previous.deliveryId,
              footer: expectedFooter,
              employeeIds: previous.employeeIds,
            });
            metrics.poll = {
              requests: requests().length - before,
              exactCriteria: requests()
                .slice(before)
                .every((r) => exactPageCriteria(r.criteria, criteria)),
              totalsMatch:
                pollData.monthTotals[kind].grandTotal === expectedFooter.month,
              expected: {
                footer: expectedFooter,
                employeeIds: previous.employeeIds,
              },
              observed,
              beforeDeliveryId: previous.deliveryId,
              responseFetchedAt: pollData.fetchedAt,
              mutationKind: kind,
              mutatedEmployeeId: sandbox.benchmarkOffpage,
              offpageAvailable: size > pageSize,
              halfUnitsBefore: halfUnits,
              halfUnitsMutated: halfUnits + 2,
            };
          },
          async () => {
            const restored = await sandbox.pool.query(
              'UPDATE "AttendanceCell" SET "halfUnits"=$3 WHERE "employeeId"=$1::uuid AND date=\'2026-10-01\' AND kind=$2 RETURNING "halfUnits"',
              [sandbox.benchmarkOffpage, kind, halfUnits],
            );
            assert.equal(restored.rows[0]?.halfUnits, halfUnits);
            if (metrics.poll)
              metrics.poll.halfUnitsRestored = restored.rows[0].halfUnits;
          },
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
        await measureTrustedDragRuns(page, metrics.dragRuns, async (i) => {
          const previous = await ready(page, criteria, kind);
          audit.expect(criteria, `drag-prepare-${i}`);
          await page
            .getByRole("button", { name: "Tải lại bảng", exact: true })
            .click();
          return ready(page, criteria, kind, {
            afterDeliveryId: previous.deliveryId,
          });
        });
        const cycle = async () => {
          await jump(pages, "last");
          await jump(1, "initial");
          for (const q of [hit, ""]) {
            audit.expect({ ...criteria, q }, q ? "hit" : "clear");
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
          audit.expect({ ...criteria, month: "2026-09" }, "cycle-month09");
          await page.getByLabel("Tháng chấm công").fill("2026-09");
          await ready(page, { ...criteria, month: "2026-09" }, kind);
          audit.expect(criteria, "cycle-month10");
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
        metrics.requestCount = requests().length;
        metrics.apiSqlAllEvents = sandbox.benchmarkSqlEvents?.slice(sqlStart);
        metrics.heapWarmups = 2;
        metrics.heapCycles = 10;
        metrics.phase = "measured";
        audit.end();
        const validation = validatePaginatedMeasurements([row]);
        row.failures = validation.violations;
        row.missing = validation.missing.filter(
          (f) => !f.startsWith("missing "),
        );
        metrics.heapDiagnostics =
          validation.heapDiagnostics[`${size}/${pageSize}/${kind}`];
        row.checks = {
          measured: row.failures.length === 0 && row.missing.length === 0,
        };
        if (row.failures.length) row.result = "FAIL";
        else if (row.missing.length) row.result = "NOT_RUN";
      } catch (error) {
        row.result = "FAIL";
        row.errorDetails = safeBenchmarkError(error);
        row.error = JSON.stringify(row.errorDetails);
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
            metrics.diagnosticError = safeBenchmarkError(diagnosticError);
          }
        }
      } finally {
        if (context) audits.get(context)?.end();
        try {
          await withCleanup(
            async () => {},
            () => context?.close(),
          );
        } catch (error) {
          row.result = "FAIL";
          row.cleanupError = safeBenchmarkError(error);
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
