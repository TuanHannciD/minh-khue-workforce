import test from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  retainedMetrics,
} from "../../scripts/product/benchmark-metrics.mjs";
import { existsSync } from "node:fs";
import { runInNewContext } from "node:vm";

const pagination = existsSync(
  new URL("../../scripts/product/benchmark-pagination.mjs", import.meta.url),
)
  ? await import("../../scripts/product/benchmark-pagination.mjs")
  : {};
const timings = (n, value = 10) => Array(n).fill(value);
function dragFixture(kind) {
  const employeeIds = ["employee-1", "employee-2", "employee-3"];
  const dates = ["2026-10-01", "2026-10-02", "2026-10-03"];
  const expectedTargets = employeeIds
    .flatMap((id) => dates.map((d) => `${id}/${d}/${kind}`))
    .sort();
  const origin = expectedTargets[0],
    endpoint = expectedTargets.at(-1);
  const pointerDown = {
    isTrusted: true,
    pointerType: "mouse",
    button: 0,
    ctrlKey: true,
    metaKey: false,
  };
  return {
    durationMs: 5000,
    frames: timings(301, 16.7),
    gesture: {
      modifier: "Control",
      pointerDown,
      employeeIds,
      dates,
      origin,
      endpoint,
      expectedTargets,
      geometry: { fromHit: origin, toHit: endpoint },
      delivery: {
        deliveryId: "current",
        kind,
        employeeIds,
        criteria: { month: "2026-10", q: "", page: 1, pageSize: 25 },
      },
      plain: {
        pointerDown: { ...pointerDown, ctrlKey: false },
        active: false,
        targets: [],
      },
      activation: { active: true, targets: [origin], observedAt: 0 },
      preview: {
        active: true,
        targets: [...expectedTargets],
        observedAt: 5000,
      },
      committed: {
        active: false,
        targets: [...expectedTargets],
        selectedCount: 9,
        observedAt: 5010,
      },
    },
  };
}
function paginatedFixture() {
  return [20, 200, 1000].flatMap((logicalEmployees) =>
    [25, 50].flatMap((pageSize) =>
      ["work", "overtime"].map((kind) => ({
        logicalEmployees,
        days: 31,
        kinds: 2,
        pageSize,
        kind,
        result: "PASS",
        checks: {},
        metrics: {
          mode: "server-pagination",
          policy: {
            result: "PASS",
            policyId: "pg17.11-icu67.1-vi-db-authority-v1",
            pg: "17.11",
            icu: "67, 1, 0, 0",
            actualVersion: "153.14.37",
            fixtureHash: "a".repeat(64),
            reviewedTip: "321d488f041e6d5386adea9f86ca8749ef896144",
          },
          workload: {
            logicalEmployees,
            monthEmployeeCount: logicalEmployees,
            totalPages: Math.ceil(logicalEmployees / pageSize),
            pageEmployees: Math.min(logicalEmployees, pageSize),
            snapshots: Math.min(logicalEmployees, pageSize) * 62,
            activeCells: Math.min(logicalEmployees, pageSize) * 31,
            numericTotal: 1.5,
          },
          apiMs: timings(5),
          coldLoadMs: timings(5),
          warmLoadMs: timings(5),
          renderAfterResponseMs: timings(5),
          renderCorrelations: Array.from({ length: 5 }, (_, i) => ({
            deliveryId: `delivery-${i}`,
            kind,
            criteria: { month: "2026-10", q: "", page: 1, pageSize },
            startAt: 1,
            resourceStart: 2,
            responseEnd: 10,
            observedAt: 20,
          })),
          parseMs: timings(5),
          projectionMs: timings(5),
          payloadBytes: timings(5, 500),
          editorMs: timings(30),
          inputMs: timings(30),
          scrollRuns: Array.from({ length: 5 }, () => ({
            durationMs: 5000,
            frames: timings(301, 16.7),
          })),
          dragRuns: Array.from({ length: 5 }, () => dragFixture(kind)),
          heapBytes: timings(11, 10000),
          listenerCounts: timings(11, 10),
          timerCounts: timings(11, 2),
          queryCacheCounts: timings(11, 1),
          pageTransitions: Array.from({ length: 30 }, (_, i) => ({
            scenario: ["initial", "next", "last", "deep"][i % 4],
            dispatchAt: 0,
            busyAt: 5,
            responseAt: 50,
            commitAt: 80,
            guardWaitMs: 0,
            criteriaMatched: true,
            editable: true,
          })),
          searchTransitions: Array.from({ length: 30 }, (_, i) => ({
            scenario: ["hit", "miss", "clear"][i % 3],
            inputAt: 0,
            dispatchAt: 300,
            busyAt: 305,
            responseAt: 350,
            commitAt: 380,
            guardWaitMs: 0,
            debounced: true,
            criteriaMatched: true,
            editable: true,
          })),
          apiSqlSamples: Array.from({ length: 5 }, () => ({
            queries: [
              "invariant",
              "count",
              "offset",
              "pageCells",
              "aggregate",
            ].map((name) => ({ name, ms: 1 })),
            ms: 5,
          })),
          globalCosts: {
            count: timings(5),
            aggregate: timings(5),
            invariant: timings(5),
            offset: timings(5),
          },
          poll: {
            requests: 1,
            exactCriteria: true,
            totalsMatch: true,
            beforeDeliveryId: "old",
            responseFetchedAt: "snapshot2",
            mutationKind: kind,
            offpageAvailable: logicalEmployees > pageSize,
            mutatedEmployeeId: "outside",
            expected: {
              footer: { day: 11, month: 11 },
              employeeIds: ["active"],
            },
            observed: {
              deliveryId: "new",
              fetchedAt: "snapshot2",
              kind,
              footer: { day: 11, month: 11 },
              employeeIds: ["active"],
            },
          },
          network: {
            fullMonthSubscriptions: 0,
            unexpectedWrites: 0,
            unexpectedReads: 0,
            coverage: [
              ...Array.from({ length: 10 }, (_, i) => ({
                id: i + 1,
                phase: i % 2 ? "warm" : "cold",
                startAt: 0,
                endAt: 10,
                attachedBeforeNavigation: true,
                pending: false,
              })),
              {
                id: 11,
                phase: "interactive",
                startAt: 0,
                endAt: 10,
                attachedBeforeNavigation: true,
                pending: false,
              },
            ],
            facts: Array.from({ length: 10 }, (_, i) => ({
              scopeId: i + 1,
              scenario: i % 2 ? "warm-bootstrap" : "cold-bootstrap",
              at: 1,
              method: "POST",
              path: "/api/v1/attendance/search",
              keys: ["month", "page", "pageSize", "q"],
              criteria: { month: "2026-10", q: "", page: 1, pageSize },
              expected: { month: "2026-10", q: "", page: 1, pageSize },
              classification: "scenario",
            })),
          },
          rawInputTableMutations: 0,
        },
      })),
    ),
  );
}

test("paginated_workload_cannot_masquerade_as_25_employee_dataset", () => {
  assert.equal(
    typeof pagination.validatePaginatedMeasurements,
    "function",
    "missing pagination validator",
  );
  const rows = paginatedFixture();
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "PASS");
  const page25 = rows.find(
    (r) => r.logicalEmployees === 1000 && r.pageSize === 25,
  );
  assert.equal(page25.metrics.workload.snapshots, 1550);
  assert.equal(page25.metrics.workload.activeCells, 775);
  assert.equal(page25.metrics.workload.totalPages, 40);
  const page50 = rows.find(
    (r) => r.logicalEmployees === 1000 && r.pageSize === 50,
  );
  assert.equal(page50.metrics.workload.snapshots, 3100);
  assert.equal(page50.metrics.workload.activeCells, 1550);
  assert.equal(page50.metrics.workload.totalPages, 20);
  page25.metrics.workload.monthEmployeeCount = 25;
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
});
test("numeric telemetry excludes F empty and reminder-only from totals", () => {
  assert.equal(typeof pagination.projectPaginatedWorkload, "function");
  const result = pagination.projectPaginatedWorkload(
    {
      employees: [{ id: "a" }],
      pagination: { monthEmployeeCount: 1000, totalPages: 40 },
      cells: [
        { kind: "work", value: { type: "number", value: 1.5 }, reminder: true },
        { kind: "work", value: { type: "absence" } },
        { kind: "work", value: null, reminder: true },
        { kind: "overtime", value: { type: "number", value: 2 } },
      ],
    },
    "work",
  );
  assert.equal(result.numericTotal, 1.5);
  assert.equal(result.monthEmployeeCount, 1000);
});
test("missing_page_or_global_cost_samples_fail", () => {
  assert.equal(typeof pagination.validatePaginatedMeasurements, "function");
  const validate = pagination.validatePaginatedMeasurements;
  assert.equal(validate([]).result, "NOT_RUN");
  const missingOneConfiguration = paginatedFixture().slice(1);
  assert.notEqual(validate(missingOneConfiguration).result, "PASS");
  for (const field of [
    "apiMs",
    "editorMs",
    "payloadBytes",
    "pageTransitions",
    "searchTransitions",
    "globalCosts",
    "poll",
    "policy",
  ]) {
    const rows = paginatedFixture();
    delete rows[0].metrics[field];
    assert.notEqual(validate(rows).result, "PASS", field);
  }
  const rows = paginatedFixture();
  rows[0].metrics.apiMs = { count: 5, p95: 1 };
  assert.equal(validate(rows).result, "FAIL");
});
test("negative_frames_or_mixed_mode_reuse_fail", () => {
  assert.equal(typeof pagination.validatePaginatedMeasurements, "function");
  for (const mutate of [
    (r) => r.metrics.scrollRuns[0].frames.push(-1),
    (r) => r.metrics.apiMs.push(NaN),
    (r) => (r.metrics.mode = "full"),
    (r) => (r.metrics.sourceMetrics = "old.json"),
    (r) => r.metrics.heapBytes.push(Infinity),
  ]) {
    const rows = paginatedFixture();
    mutate(rows[0]);
    assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
  }
});
test("strict scroll thresholds reject 33.1 p95 and 200.1 max without rounding", () => {
  assert.equal(typeof pagination.validatePaginatedMeasurements, "function");
  const scrollP95_33_1 = paginatedFixture();
  scrollP95_33_1[0].metrics.scrollRuns[0].frames.fill(33.1);
  assert.equal(
    pagination.validatePaginatedMeasurements(scrollP95_33_1).result,
    "FAIL",
  );
  const scrollMax_200_1 = paginatedFixture();
  scrollMax_200_1[0].metrics.scrollRuns[0].frames.push(200.1);
  assert.equal(
    pagination.validatePaginatedMeasurements(scrollMax_200_1).result,
    "FAIL",
  );
});
test("transition_clock_includes_network_and_commit", () => {
  assert.equal(typeof pagination.transitionTiming, "function");
  assert.deepEqual(
    pagination.transitionTiming({
      inputAt: 0,
      dispatchAt: 300,
      busyAt: 310,
      responseAt: 900,
      commitAt: 1000,
      guardWaitMs: 500,
      debounced: true,
      criteriaMatched: true,
      editable: true,
    }),
    {
      busyMs: 10,
      editableMs: 700,
      searchMs: 1000,
      responseToCommitMs: 100,
      guardWaitMs: 500,
    },
  );
  assert.throws(
    () =>
      pagination.transitionTiming({
        dispatchAt: 0,
        busyAt: 5,
        responseAt: 60,
        commitAt: 50,
        guardWaitMs: 0,
        criteriaMatched: true,
        editable: true,
      }),
    /clock/,
  );
  const rows = paginatedFixture();
  rows[0].metrics.pageTransitions[0].criteriaMatched = false;
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
  const slow = paginatedFixture();
  slow[0].metrics.searchTransitions.forEach((t) => (t.commitAt = 2300.1));
  assert.equal(pagination.validatePaginatedMeasurements(slow).result, "FAIL");
});

test("API SQL work requires actual query samples and cannot use page counts", () => {
  const rows = paginatedFixture();
  rows.forEach((row) => {
    row.metrics.apiSqlSamples = Array.from({ length: 5 }, () => ({
      queries: ["invariant", "count", "offset", "pageCells", "aggregate"].map(
        (name) => ({ name, ms: 1 }),
      ),
      ms: 5,
    }));
  });
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "PASS");
  delete rows[0].metrics.apiSqlSamples;
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
});

test("telemetry itself releases retired page DTOs before heap acceptance", async () => {
  assert.equal(typeof pagination.installPaginationTelemetry, "function");
  class FixtureResponse {
    async json() {
      return {
        employees: [{ id: "fake" }],
        cells: Array(1550).fill({ value: null }),
      };
    }
  }
  const window = {
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => new FixtureResponse(),
  };
  const context = {
    window,
    Date,
    Response: FixtureResponse,
    URL,
    location: { href: "http://127.0.0.1:1234" },
    performance,
    TextEncoder,
    document: { addEventListener() {} },
    MutationObserver: class {
      observe() {}
    },
  };
  runInNewContext(
    `(${pagination.installPaginationTelemetry.toString()})()`,
    context,
  );
  for (let page = 1; page <= 40; page++)
    await (
      await window.fetch("/api/v1/attendance/search", {
        body: JSON.stringify({ month: "2026-10", q: "", page, pageSize: 25 }),
      })
    ).json();
  assert.equal(
    window.__paginationBench.reads.filter((r) => r.data).length,
    1,
    "retired response bodies would masquerade as a product heap leak",
  );
  assert(
    window.__paginationBench.reads.length <= 2,
    "diagnostic records must remain bounded during lifecycle samples",
  );
});

test("missing trusted drag frames cannot pass scroll-only acceptance", () => {
  const rows = paginatedFixture();
  delete rows[0].metrics.dragRuns;
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
});

test("frames-only or fake trusted drag evidence cannot pass gesture acceptance", () => {
  for (const mutate of [
    (run) => delete run.gesture,
    (run) => (run.gesture.activation.active = false),
    (run) => (run.gesture.preview.active = false),
    (run) => (run.gesture.plain.active = true),
    (run) => (run.gesture.committed.targets = ["fake-target"]),
    (run) => (run.gesture.pointerDown.ctrlKey = false),
    (run) => (run.gesture.pointerDown.isTrusted = false),
    (run) => (run.gesture.preview.targets = []),
    (run) => (run.gesture.committed.selectedCount = 1),
    (run) => (run.gesture.geometry.toHit = run.gesture.origin),
    (run) => (run.gesture.delivery.kind = "fake"),
    (run) => (run.gesture.committed.observedAt = 1),
  ]) {
    const rows = paginatedFixture();
    mutate(rows[0].metrics.dragRuns[0]);
    assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
  }
});

test("drag-only evidence can clear its scoped gate but never overall performance", () => {
  const rows = paginatedFixture().map((row) => {
    row.metrics.scope = "drag-only";
    row.metrics.network.coverage = [
      {
        id: 1,
        attachedBeforeNavigation: true,
        startAt: 0,
        endAt: 10,
        pending: false,
      },
    ];
    row.metrics.network.facts = [
      { ...row.metrics.network.facts[0], scenario: "drag-bootstrap" },
    ];
    return row;
  });
  const result = pagination.validateScopedDragMeasurements(rows);
  assert.equal(result.result, "PASS");
  assert.equal(result.overallPerformance, "NOT_RUN");
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
  assert.notEqual(
    pagination.validateScopedDragMeasurements(rows.slice(1)).result,
    "PASS",
  );
  delete rows[0].metrics.dragRuns[0].gesture;
  assert.equal(pagination.validateScopedDragMeasurements(rows).result, "FAIL");
});

test("one HTTP SQL sample includes auth and page transactions without losing global work", () => {
  assert.equal(typeof pagination.combineApiSqlSample, "function");
  const sample = pagination.combineApiSqlSample([
    { ms: 2, queries: [{ name: "auth", ms: 1 }] },
    {
      ms: 5,
      queries: [
        { name: "invariant", ms: 1 },
        { name: "count", ms: 1 },
        { name: "offset", ms: 1 },
        { name: "pageCells", ms: 1 },
        { name: "aggregate", ms: 1 },
      ],
    },
  ]);
  assert.equal(sample.ms, 7);
  assert.equal(sample.transactions, 2);
  assert.equal(sample.queries.length, 6);
  assert.equal(sample.queries[0].name, "auth");
  assert.throws(() => pagination.combineApiSqlSample([]), /transaction/);
});

test("I1 bootstrap-only fullmonth or write cannot hide behind zero network counters", () => {
  for (const fact of [
    { method: "GET", path: "/api/v1/attendance/month" },
    { method: "PATCH", path: "/api/v1/employees/fake" },
  ]) {
    const rows = paginatedFixture();
    rows[0].metrics.network.facts.push({ scopeId: 1, at: 1, ...fact });
    const result = pagination.validatePaginatedMeasurements(rows);
    assert.equal(
      result.result,
      "FAIL",
      "bootstrap violation must fail actual validator",
    );
  }
});

test("I2 wrong criteria, unknown keys and an extra page read cannot pass accounting", () => {
  const expected = { month: "2026-10", q: "", page: 1, pageSize: 25 };
  for (const body of [
    { ...expected, month: "2026-09" },
    { ...expected, q: "other" },
    { ...expected, page: 2 },
    { ...expected, pageSize: 50 },
    { arbitrary: 1, keys: 2, instead: 3, criteria: 4 },
    { month: "2026-10", q: "", page: 1 },
    { ...expected, unknown: 1 },
  ]) {
    const rows = paginatedFixture();
    rows[0].metrics.network.facts[0] = {
      ...rows[0].metrics.network.facts[0],
      expected,
      criteria: body,
      keys: Object.keys(body).sort(),
    };
    assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
  }
  const rows = paginatedFixture();
  rows[0].metrics.network.unexpectedReads = 1;
  assert.equal(pagination.validatePaginatedMeasurements(rows).result, "FAIL");
});

test("I1 I2 context audit attaches before bootstrap and accounts duplicate/out-of-context reads", () => {
  let listener,
    now = 0;
  const network = {
    facts: [],
    coverage: [],
    unexpectedReads: 0,
    unexpectedWrites: 0,
    fullMonthSubscriptions: 0,
  };
  const audit = pagination.createPageNetworkAudit(
    {
      on(event, fn) {
        assert.equal(event, "request");
        listener = fn;
      },
    },
    network,
    () => now,
  );
  const expected = { month: "2026-10", q: "", page: 1, pageSize: 25 };
  const request = (
    body,
    path = "/api/v1/attendance/search",
    method = "POST",
  ) => ({
    url: () => `http://fixture.invalid${path}`,
    method: () => method,
    postDataJSON: () => body,
  });
  assert.equal(
    typeof listener,
    "function",
    "must attach before any page exists",
  );
  audit.begin("cold");
  audit.expect(expected, "bootstrap");
  listener(request(expected));
  listener(request(expected));
  listener(request({ ...expected, q: "unexpected" }));
  listener(request(null, "/api/v1/attendance/month", "GET"));
  listener(request(null, "/api/v1/employees/fake", "PATCH"));
  now = 16000;
  listener(request(expected));
  audit.end();
  assert.deepEqual(network.facts.map((f) => f.classification).filter(Boolean), [
    "scenario",
    "unexpected-read",
    "unexpected-read",
    "active-poll",
  ]);
  assert.equal(network.unexpectedReads, 2);
  assert.equal(network.fullMonthSubscriptions, 1);
  assert.equal(network.unexpectedWrites, 1);
  assert.equal(network.facts[2].expected.q, "");
  assert.equal(network.coverage[0].pending, false);
});

test("benchmark nearest-rank p95 preserves a freeze hidden by the median", () => {
  const data = Array(29).fill(16.7).concat([220]);
  const result = summarize(data);
  assert.equal(result.median, 16.7);
  assert.equal(result.p95, 16.7);
  assert.equal(result.max, 220);
  assert.deepEqual(result.samples, data);
});
test("benchmark refuses missing, negative or non-finite samples instead of false green/null JSON", () => {
  for (const samples of [[], [NaN], [Infinity], [-1]])
    assert.throws(() => summarize(samples), /finite nonnegative/);
  assert.deepEqual(summarize([1, 2, 3, 4, 5]), {
    samples: [1, 2, 3, 4, 5],
    median: 3,
    p95: 5,
    max: 5,
  });
});

test("conventional median averages both middle values for even N without changing raw order", () => {
  const values = [9, 1, 5, 3];
  assert.equal(summarize(values).median, 4);
  assert.deepEqual(values, [9, 1, 5, 3]);
});
test("profile reuse validates every retained raw metric and recomputes stale summaries", () => {
  const metric = {
    apiMs: { samples: [1, 3], median: 999, p95: 999, max: 999 },
    heapBytes: [100, 101],
  };
  assert.equal(retainedMetrics(metric).apiMs.median, 2);
  assert.equal(metric.apiMs.median, 999);
  for (const field of [
    "apiMs",
    "editorMs",
    "inputMs",
    "scrollFramesMs",
    "coldLoadMs",
    "warmLoadMs",
    "renderAfterResponseMs",
  ])
    assert.throws(
      () => retainedMetrics({ ...metric, [field]: { samples: [16.7, -1] } }),
      /finite nonnegative/,
    );
  assert.throws(
    () => retainedMetrics({ ...metric, heapBytes: [100, -1] }),
    /finite nonnegative/,
  );
});

test("profile reuse preserves resource metadata while validating raw samples with size/field context", () => {
  const jsResources = [{ path: "/assets/app.js", duration: 1 }];
  const metric = {
    size: 1000,
    jsResources,
    apiMs: { samples: [1, 3], median: 999 },
    heapBytes: [100, 101],
  };
  const reused = retainedMetrics(metric);
  assert.deepEqual(reused.jsResources, jsResources);
  assert.equal(reused.apiMs.median, 2);
  assert.throws(
    () => retainedMetrics({ ...metric, scrollFramesMs: { samples: [-1, 2] } }),
    /size1000.*scrollFramesMs.*finite nonnegative/,
  );
});
