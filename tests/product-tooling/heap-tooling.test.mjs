import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const path = new URL("../../scripts/product/heap-tooling.mjs", import.meta.url);
const heap = existsSync(path) ? await import(path) : {};
const metrics = () => ({
  heapBytes: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  heapWarmups: 2,
  heapCycles: 10,
});

// Hand-authored graph oracle from toPageTable + AttendanceGrid projection:
// displayed/query share one delivery; table, row and Map retain the same cell.
// A live button callback retains a baseline residual cell through a projection.
// IDs stand for runtime object identities, never employee IDs or request tags.
// This is a predicate fixture, NOT a claim that browser attribution is solved.
const points = () =>
  Array.from({ length: 11 }, (_, i) => ({
    label: `S${i}`,
    identityDomain: "one-cdp-heap-session",
    activeDataIds: ["dto", "table", "row", "cell"],
    graph: {
      nodes: [
        { id: "root", category: "owner", selfBytes: 8 },
        { id: "dto", category: "data", selfBytes: 16 },
        { id: "table", category: "projection", selfBytes: 16 },
        { id: "row", category: "projection", selfBytes: 8 },
        { id: "cell", category: "data", selfBytes: 8 },
        { id: "callback", category: "owner", selfBytes: 8 },
        { id: "old-projection", category: "projection", selfBytes: 8 },
        { id: "old-cell", category: "data", selfBytes: 8 },
      ],
      roots: [{ id: "root", attribution: "product" }],
      edges: [
        { from: "root", to: "dto", strength: "strong" },
        { from: "root", to: "table", strength: "strong" },
        { from: "dto", to: "cell", strength: "strong" },
        { from: "table", to: "row", strength: "strong" },
        { from: "row", to: "cell", strength: "strong" },
        { from: "root", to: "callback", strength: "strong" },
        { from: "callback", to: "old-projection", strength: "strong" },
        { from: "old-projection", to: "old-cell", strength: "strong" },
      ],
    },
  }));

test("exact 20 percent boundary passes numeric budget without rounding", () => {
  assert.equal(
    typeof heap.validateHeapBudget,
    "function",
    "budget feature missing",
  );
  const m = metrics();
  m.heapBytes[10] = 120;
  const r = heap.validateHeapBudget(m);
  assert.equal(r.result, "PASS");
  assert.equal(r.diagnostics.growthPercent, (120 / 100 - 1) * 100);
});

test("above 20, invalid raw and wrong warmup/cycle contracts fail", () => {
  assert.equal(
    typeof heap.validateHeapBudget,
    "function",
    "budget feature missing",
  );
  for (const mutate of [
    (m) => (m.heapBytes[10] = 120.00001),
    (m) => m.heapBytes.pop(),
    (m) => (m.heapBytes[3] = NaN),
    (m) => (m.heapBytes[3] = Infinity),
    (m) => (m.heapBytes[3] = -1),
    (m) => (m.heapBytes[0] = 0),
    (m) => (m.heapWarmups = 1),
    (m) => (m.heapCycles = 9),
  ]) {
    const m = metrics();
    mutate(m);
    const r = heap.validateHeapBudget(m);
    assert.equal(r.result, "FAIL");
    assert.equal(r.exitCode, 1);
  }
  assert.equal(heap.validateHeapBudget({}).result, "NOT_RUN");
});

test("strict total trend under 20 is diagnostic and cannot alone pass H5", () => {
  assert.equal(
    typeof heap.validateHeapAcceptance,
    "function",
    "H5 feature missing",
  );
  const r = heap.validateHeapBudget(metrics());
  assert.equal(r.result, "PASS");
  assert.equal(r.diagnostics.strictMonotonic, true);
  const all = heap.validateHeapAcceptance([
    { logicalEmployees: 20, pageSize: 25, kind: "work", metrics: metrics() },
  ]);
  assert.equal(all.result, "NOT_RUN");
  assert.equal(all.exitCode, 2);
  assert(all.missing.some((s) => /companion/.test(s)));
});

test("H2 primitive reports stable baseline residual identities, bytes and product paths", () => {
  assert.equal(
    typeof heap.analyzeGenerationGraphs,
    "function",
    "graph feature missing",
  );
  const r = heap.analyzeGenerationGraphs(points());
  assert.equal(r.result, "PASS");
  assert.deepEqual(r.checkpoints[0].retired.map((x) => x.id).sort(), [
    "old-cell",
    "old-projection",
  ]);
  assert.equal(r.checkpoints[0].retiredSelfBytes, 16);
  assert.deepEqual(
    r.checkpoints[10].retired.find((x) => x.id === "old-cell").path,
    ["root", "callback", "old-projection", "old-cell"],
  );
});

test("constant counts cannot hide a newly retired identity or payload below projection", () => {
  assert.equal(
    typeof heap.analyzeGenerationGraphs,
    "function",
    "graph feature missing",
  );
  for (const id of ["old-cell", "old-projection"]) {
    const p = points(),
      graph = p[5].graph;
    graph.nodes.find((n) => n.id === id).id = "new-retired";
    graph.edges = graph.edges.map((e) => ({
      ...e,
      from: e.from === id ? "new-retired" : e.from,
      to: e.to === id ? "new-retired" : e.to,
    }));
    const r = heap.analyzeGenerationGraphs(p);
    assert.equal(r.result, "FAIL");
    assert(r.failures.some((s) => /new-retired/.test(s)));
    assert.equal(r.checkpoints[5].retired.length, 2);
  }
});

test("missing intermediate graph, unknown owner, weak semantics or strong observer handle block", () => {
  assert.equal(
    typeof heap.analyzeGenerationGraphs,
    "function",
    "graph feature missing",
  );
  for (const mutate of [
    (p) => delete p[4].graph,
    (p) => (p[3].graph.roots[0].attribution = "unknown-native"),
    (p) => (p[2].graph.edges[0].strength = "ephemeron-unknown"),
    (p) => (p[1].observerStrongHandles = ["dto"]),
    (p) => (p[6].identityDomain = "another-session"),
    (p) => delete p[7].graph.nodes[1].category,
  ]) {
    const p = points();
    mutate(p);
    const r = heap.analyzeGenerationGraphs(p);
    assert.equal(r.result, "NOT_RUN");
    assert.equal(r.exitCode, 2);
  }
});

test("observer-only path does not manufacture product retention; unknown semantics still block", () => {
  assert.equal(
    typeof heap.analyzeGenerationGraphs,
    "function",
    "graph feature missing",
  );
  const p = points();
  for (const point of p) {
    point.graph.nodes.push(
      { id: "inspector", category: "owner", selfBytes: 8 },
      { id: "inspected", category: "data", selfBytes: 8 },
    );
    point.graph.roots.push({ id: "inspector", attribution: "observer" });
    point.graph.edges.push({
      from: "inspector",
      to: "inspected",
      strength: "strong",
    });
  }
  assert.equal(
    heap.analyzeGenerationGraphs(p).checkpoints[0].retired.length,
    2,
  );
});

test("missing capability never turns handcrafted graph and counts into lifecycle PASS", () => {
  assert.equal(
    typeof heap.validateLifecycleEvidence,
    "function",
    "lifecycle feature missing",
  );
  const r = heap.validateLifecycleEvidence({
    checkpoints: points(),
    teardown: { label: "T", contextAlive: true },
  });
  assert.equal(r.result, "NOT_RUN");
  assert(r.missing.some((s) => /source-to-runtime/.test(s)));
});

test("duplicate or stale native registrations fail even with count dip; unknown native owner blocks", () => {
  assert.equal(
    typeof heap.validateLifecycleEvidence,
    "function",
    "lifecycle feature missing",
  );
  for (const kind of ["listener", "native-abort-deadline", "timer"]) {
    for (const duplicate of [true, false]) {
      const p = points();
      // Facts are identities/ownership, not a monotonic series. Count may dip.
      p[5].registrations = [
        {
          id: "handle-1",
          kind,
          owner: "attendance",
          lifetime: "L1",
          lifetimeStatus: duplicate ? "active" : "retired",
          state: "scheduled",
          purpose: "poll",
          target: "document",
          type: "visibilitychange",
          capture: false,
          callback: "fn-1",
        },
      ];
      if (duplicate) p[5].registrations.push({ ...p[5].registrations[0] });
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, "FAIL");
      assert(r.failures.some((s) => /registration/.test(s)));
    }
  }
  const p = points();
  p[5].registrations = [
    { id: "native-1", owner: "unknown", kind: "native-abort-deadline" },
  ];
  assert.equal(
    heap.validateLifecycleEvidence({ checkpoints: p }).result,
    "NOT_RUN",
  );
});

test("known product detached payload or cleanup violation stays Failed despite missing coverage", () => {
  assert.equal(
    typeof heap.validateLifecycleEvidence,
    "function",
    "lifecycle feature missing",
  );
  const p = points();
  p[3].detached = [
    { id: "detached-cell", attribution: "product", payloadIds: ["old-cell"] },
  ];
  assert.equal(
    heap.validateLifecycleEvidence({ checkpoints: p }).result,
    "FAIL",
  );
  const r = heap.validateLifecycleEvidence({
    checkpoints: points(),
    teardown: {
      label: "T",
      contextAlive: true,
      endedProductDataPaths: [["root", "old-cell"]],
    },
  });
  assert.equal(r.result, "FAIL");
});

test("12 configurations are mandatory and known failure wins over Missing evidence", () => {
  assert.equal(
    typeof heap.validateHeapAcceptance,
    "function",
    "H5 feature missing",
  );
  const rows = [20, 200, 1000].flatMap((logicalEmployees) =>
    [25, 50].flatMap((pageSize) =>
      ["work", "overtime"].map((kind) => ({
        logicalEmployees,
        pageSize,
        kind,
        metrics: metrics(),
      })),
    ),
  );
  assert.equal(heap.validateHeapAcceptance(rows).result, "NOT_RUN");
  const subset = heap.validateHeapAcceptance(rows.slice(1));
  assert(subset.missing.some((s) => /20\/25\/work/.test(s)));
  rows[0].metrics.heapBytes[10] = 121;
  const r = heap.validateHeapAcceptance(rows);
  assert.equal(r.result, "FAIL");
  assert.equal(r.exitCode, 1);
  assert(r.missing.length > 0);
});

test("missing metadata cannot mask an invalid measured heap value", () => {
  const m = metrics();
  m.heapBytes[5] = NaN;
  delete m.heapWarmups;
  assert.equal(heap.validateHeapBudget(m).result, "FAIL");
});

test("caller coverage attestation cannot enable production PASS without a classifier", () => {
  const r = heap.validateLifecycleEvidence({
    coverage: {
      derivedFrom: "source",
      sourceHashes: {},
      roles: [],
      expectedMultiplicity: {},
      payloadProjections: [],
      ownerRoles: [],
      sourceToRuntime: true,
    },
    checkpoints: points().map((p) => ({
      ...p,
      registrations: [],
      queries: [{ id: "q", scope: "attendance", status: "active" }],
      observers: [{ queryId: "q", scope: "attendance", status: "active" }],
    })),
    teardown: {
      action: "logout",
      endedLifetime: "L1",
      owners: [],
      readiness: "settled",
      deadlineSource: "transport.ts",
      contextAlive: true,
    },
  });
  assert.notEqual(r.result, "PASS");
  assert.equal(r.exitCode, 2);
  assert(r.blocked.some((s) => /source-to-runtime/.test(s)));
});

test("missing active roles or baseline coverage blocks identity retirement classification", () => {
  for (const mutate of [
    (p) => delete p[5].activeDataIds,
    (p) =>
      (p[0].graph.nodes.find((n) => n.id === "old-cell").category = "unknown"),
  ]) {
    const p = points();
    mutate(p);
    const r = heap.analyzeGenerationGraphs(p);
    assert.equal(r.result, "NOT_RUN");
    assert.equal(
      r.failures.length,
      0,
      "incomplete role attribution cannot prove a new retired identity",
    );
  }
});

test("unknown native owner and ended attendance owner are distinct at T", () => {
  const base = {
    checkpoints: points(),
    teardown: {
      action: "logout",
      contextAlive: true,
      endedLifetime: "L1",
      owners: ["attendance"],
      readiness: "settled",
      deadlineSource: "source",
      registrations: [
        {
          id: "focus",
          kind: "listener",
          owner: "SessionProvider",
          lifetime: "provider",
          lifetimeStatus: "active",
          state: "registered",
        },
      ],
    },
  };
  const r = heap.validateLifecycleEvidence(base);
  assert.equal(r.result, "NOT_RUN");
  assert.equal(
    r.failures.length,
    0,
    "remaining provider subscription is not an attendance cleanup violation",
  );
  base.teardown.registrations[0].owner = "attendance";
  base.teardown.registrations[0].lifetime = "L1";
  assert.equal(heap.validateLifecycleEvidence(base).result, "FAIL");
});

test("query owner evidence catches inactive extra query and mismatched current observer", () => {
  for (const mutate of [
    (p) =>
      p[5].queries.push({
        id: "inactive",
        scope: "attendance",
        status: "inactive",
        lifetime: "old",
      }),
    (p) => (p[5].observers[0].queryId = "retired-query"),
  ]) {
    const p = points().map((p) => ({
      ...p,
      queries: [{ id: "q", scope: "attendance", status: "active" }],
      observers: [{ queryId: "q", scope: "attendance", status: "active" }],
    }));
    mutate(p);
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, "FAIL");
    assert(r.failures.some((s) => /query|observer/.test(s)));
  }
});

test("benchmark report keeps Missing evidence nonzero Not run and executed failures Failed", () => {
  assert.equal(
    typeof heap.benchmarkOutcome,
    "function",
    "report status feature missing",
  );
  for (const [acceptance, executionFailed, result, exitCode] of [
    [{ result: "PASS" }, false, "PASS", 0],
    [{ result: "NOT_RUN" }, false, "NOT_RUN", 2],
    [{ result: "FAIL" }, false, "FAILED", 1],
    [{ result: "NOT_RUN" }, true, "FAILED", 1],
  ])
    assert.deepEqual(heap.benchmarkOutcome(acceptance, executionFailed), {
      result,
      exitCode,
    });
});

test("incomplete baseline attribution cannot prove retirement, but another missing checkpoint cannot erase a proved violation", () => {
  const incomplete = points();
  incomplete[0].graph.roots[0].attribution = "unknown";
  incomplete[5].graph.nodes.find((n) => n.id === "old-cell").id = "new";
  incomplete[5].graph.edges.find((e) => e.to === "old-cell").to = "new";
  assert.equal(heap.analyzeGenerationGraphs(incomplete).result, "NOT_RUN");
  const independent = points();
  delete independent[3].graph;
  independent[5].graph.nodes.find((n) => n.id === "old-cell").id = "new";
  independent[5].graph.edges.find((e) => e.to === "old-cell").to = "new";
  const r = heap.analyzeGenerationGraphs(independent);
  assert.equal(r.result, "FAIL");
  assert(r.missing.some((s) => /S3/.test(s)));
});

test("observer contamination cannot masquerade as a product counterexample", () => {
  const p = points();
  p[5].observerStrongHandles = ["new"];
  p[5].graph.nodes.find((n) => n.id === "old-cell").id = "new";
  p[5].graph.edges.find((e) => e.to === "old-cell").to = "new";
  const r = heap.analyzeGenerationGraphs(p);
  assert.equal(r.result, "NOT_RUN");
  assert.equal(r.failures.length, 0);
});
