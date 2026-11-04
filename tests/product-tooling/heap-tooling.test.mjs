import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

// File map: metrics/points cover budget and graph primitives; reviewPoints and
// R1/R2/R3 matrices cover partial lifecycle facts, proof guards and verdicts.
// Shared hand-authored fixtures keep the review controls in one pure test unit.

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

// R1 reproductions use distinct runtime identities with the same product path.
// The new identity at S5 must fail only when the S0/S5 pair is comparable.
const reviewPoints = () =>
  Array.from({ length: 11 }, (_, i) => ({
    label: `S${i}`,
    identityDomain: "D",
    activeDataIds: [],
    graph: {
      nodes: [
        { id: "product-root", category: "owner", selfBytes: 8 },
        { id: "old", category: "data", selfBytes: 8 },
      ],
      roots: [{ id: "product-root", attribution: "product" }],
      edges: [{ from: "product-root", to: "old", strength: "strong" }],
    },
    queries: [{ id: "q", scope: "attendance", status: "active" }],
    observers: [{ queryId: "q", scope: "attendance", status: "active" }],
    registrations: [],
    dom: { detached: [] },
  }));
const replaceRetired = (point, id = "new") => {
  point.graph.nodes[1].id = id;
  point.graph.edges[0].to = id;
};
const retiredRegistration = (owner = "attendance") => ({
  id: "native-1",
  kind: "native-abort-deadline",
  owner,
  lifetime: "unclassified",
  lifetimeStatus: "retired",
  state: "scheduled",
});
const cleanupFailure = () => ({
  action: "logout",
  contextAlive: true,
  endedLifetime: "L",
  owners: ["attendance"],
  readiness: "settled",
  deadlineSource: "source",
  endedProductDataPaths: [["product-root", "retired-cell"]],
});

for (const missingLabel of ["S10", "S3"]) {
  for (const counterexample of ["H2", "registration", "T", "none"])
    test(`R1 I1 missing ${missingLabel} preserves ${counterexample} verdict and labels`, () => {
      const p = reviewPoints();
      if (counterexample === "H2") replaceRetired(p[5]);
      if (counterexample === "registration")
        p[5].registrations = [retiredRegistration()];
      const r = heap.validateLifecycleEvidence({
        checkpoints: p.filter((point) => point.label !== missingLabel),
        ...(counterexample === "T" ? { teardown: cleanupFailure() } : {}),
      });
      assert.equal(r.result, counterexample === "none" ? "NOT_RUN" : "FAIL");
      assert.equal(r.exitCode, counterexample === "none" ? 2 : 1);
      assert(r.missing.some((s) => s.includes(missingLabel)));
      if (counterexample === "H2")
        assert(r.failures.some((s) => /S5 retired identity new/.test(s)));
      if (counterexample === "registration")
        assert(r.failures.some((s) => /S5 retired registration/.test(s)));
      if (counterexample === "T")
        assert(r.failures.some((s) => /T product data/.test(s)));
    });
}

for (const label of ["S0", "S5"])
  test(`R1 I2 missing ${label} domain cannot prove an H2 violation`, () => {
    const p = reviewPoints();
    replaceRetired(p[5]);
    delete p.find((point) => point.label === label).identityDomain;
    const r = heap.analyzeGenerationGraphs(p);
    assert.equal(r.result, "NOT_RUN");
    assert.equal(r.exitCode, 2);
    assert.deepEqual(r.failures, []);
    assert(r.missing.some((s) => s.includes(`${label} identity domain`)));
    p[7].registrations = [retiredRegistration()];
    const independent = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(independent.result, "FAIL");
    assert.equal(independent.exitCode, 1);
    assert(independent.failures.some((s) => /S7 retired registration/.test(s)));
    assert(!independent.failures.some((s) => /retired identity new/.test(s)));
  });

for (const domain of [undefined, "other-session"])
  test(`R1 I2 unrelated ${domain ?? "missing"} domain cannot mask a proven pair`, () => {
    const p = reviewPoints();
    replaceRetired(p[5]);
    p[3].identityDomain = domain;
    const r = heap.analyzeGenerationGraphs(p);
    assert.equal(r.result, "FAIL");
    assert.equal(r.exitCode, 1);
    assert(r.failures.some((s) => /S5 retired identity new/.test(s)));
    assert(r.missing.length > 0);
  });

test("R1 I2 missing comparison domain retains a separate proven H2 failure", () => {
  const p = reviewPoints();
  replaceRetired(p[5], "unproven");
  delete p[5].identityDomain;
  replaceRetired(p[7], "proven");
  const r = heap.analyzeGenerationGraphs(p);
  assert.equal(r.result, "FAIL");
  assert(r.failures.some((s) => /S7 retired identity proven/.test(s)));
  assert(!r.failures.some((s) => /unproven/.test(s)));
});

for (const owner of ["unknown", "unknown-native-owner"])
  for (const duplicate of [false, true])
    test(`R1 I3 ${owner} retired duplicate=${duplicate} is missing evidence`, () => {
      const p = reviewPoints();
      const record = retiredRegistration(owner);
      p[5].registrations = duplicate ? [record, { ...record }] : [record];
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, "NOT_RUN");
      assert.equal(r.exitCode, 2);
      assert.deepEqual(r.failures, []);
      assert(r.missing.some((s) => /S5 unknown native owner native-1/.test(s)));
      p[7].registrations = [retiredRegistration()];
      const known = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(known.result, "FAIL");
      assert(known.failures.some((s) => /S7 retired registration/.test(s)));
      assert(!known.failures.some((s) => /S5 .*registration/.test(s)));
    });

for (const value of [null, undefined, "hole"])
  test(`R1 M1 ${value ?? String(value)} checkpoint is structured missing and preserves failures`, () => {
    const sparse = new Array(11);
    const empty = heap.analyzeGenerationGraphs(sparse);
    assert.equal(empty.result, "NOT_RUN");
    assert.equal(empty.exitCode, 2);
    assert(empty.missing.length > 0);
    const p = reviewPoints();
    if (value === "hole") delete p[3];
    else p[3] = value;
    const missing = heap.analyzeGenerationGraphs(p);
    assert.equal(missing.result, "NOT_RUN");
    assert(missing.missing.some((s) => /S3/.test(s)));
    replaceRetired(p[5]);
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, "FAIL");
    assert(r.failures.some((s) => /S5 retired identity new/.test(s)));
    assert(r.missing.some((s) => /S3/.test(s)));
  });

for (const key of ["queries", "observers", "registrations", "dom"])
  for (const value of [null, {}, undefined])
    test(`R1 M1 malformed ${key} ${String(value)} inventory is structured missing`, () => {
      const p = reviewPoints();
      p[3][key] = value;
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, "NOT_RUN");
      assert.equal(r.exitCode, 2);
      assert.deepEqual(r.failures, []);
      assert(r.missing.some((s) => /S3 .*inventory/.test(s)));
      const failed = heap.validateLifecycleEvidence({
        checkpoints: p,
        teardown: cleanupFailure(),
      });
      assert.equal(failed.result, "FAIL");
      assert(failed.failures.some((s) => /T product data/.test(s)));
    });

for (const key of ["queries", "observers", "registrations", "detached"])
  for (const value of [null, {}, [null], new Array(1)])
    test(`R1 M1 malformed ${key} entries ${String(value)} retain independent failure`, () => {
      const p = reviewPoints();
      if (key === "detached") p[3].dom.detached = value;
      else p[3][key] = value;
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, "NOT_RUN");
      assert.deepEqual(r.failures, []);
      assert(r.missing.some((s) => /S3 .*inventory/.test(s)));
      p[7].registrations = [retiredRegistration()];
      const failed = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(failed.result, "FAIL");
      assert(failed.failures.some((s) => /S7 retired registration/.test(s)));
    });

for (const key of ["nodes", "roots", "edges"])
  test(`R1 M1 malformed graph ${key} cannot pass or throw`, () => {
    for (const value of [null, {}, [null], new Array(1)]) {
      const p = reviewPoints();
      p[3].graph[key] = value;
      const r = heap.analyzeGenerationGraphs(p);
      assert.equal(r.result, "NOT_RUN");
      assert(r.missing.some((s) => /S3/.test(s)));
      replaceRetired(p[5]);
      assert.equal(heap.analyzeGenerationGraphs(p).result, "FAIL");
    }
  });

for (const key of ["queries", "observers", "registrations"])
  test(`R1 M1 malformed T ${key} inventory preserves cleanup failure`, () => {
    for (const value of [null, {}, [null], new Array(1)]) {
      const teardown = { ...cleanupFailure(), [key]: value };
      const r = heap.validateLifecycleEvidence({
        checkpoints: reviewPoints(),
        teardown,
      });
      assert.equal(r.result, "FAIL");
      assert(r.failures.some((s) => /T product data/.test(s)));
      assert(r.missing.some((s) => /T .*inventory/.test(s)));
    }
  });

test("R1 I3 unknown T owner matching an unclassified lifetime cannot prove cleanup failure", () => {
  const teardown = cleanupFailure();
  delete teardown.endedProductDataPaths;
  teardown.endedLifetime = "unclassified";
  teardown.registrations = [retiredRegistration("unknown-native-owner")];
  const r = heap.validateLifecycleEvidence({
    checkpoints: reviewPoints(),
    teardown,
  });
  assert.equal(r.result, "NOT_RUN");
  assert.deepEqual(r.failures, []);
  assert(r.missing.some((s) => /T unknown native owner/.test(s)));
});

// R2: adding unknown slots/metadata must not erase an already proven fact.
for (const key of ["queries", "observers"])
  for (const binding of ["q", "retired-query"])
    test(`R2 I4 ${key} hole preserves known binding ${binding}`, () => {
      const p = reviewPoints();
      p[5].observers[0].queryId = binding;
      p[5][key].length = 2;
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, binding === "q" ? "NOT_RUN" : "FAIL");
      assert.equal(r.exitCode, binding === "q" ? 2 : 1);
      assert(r.missing.some((s) => /S5 .*inventory/.test(s)));
      if (binding === "q") assert.deepEqual(r.failures, []);
      else
        assert(
          r.failures.some((s) =>
            /S5 observer\/query identity mismatch/.test(s),
          ),
        );
    });

for (const key of ["queries", "observers"])
  test(`R2 I4 ${key} hole alone cannot prove an absent active role`, () => {
    const p = reviewPoints();
    p[5][key] = new Array(1);
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, "NOT_RUN");
    assert.equal(r.exitCode, 2);
    assert.deepEqual(r.failures, []);
    assert(r.missing.some((s) => /S5 .*inventory/.test(s)));
  });

for (const nested of [undefined, null])
  for (const attribution of ["product", "unknown"])
    test(`R2 I5 nested detached ${nested} preserves ${attribution} fallback evidence`, () => {
      const p = reviewPoints();
      p[3].dom = { detached: nested };
      p[3].detached = [
        { id: "detached-cell", attribution, payloadIds: ["old"] },
      ];
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, attribution === "product" ? "FAIL" : "NOT_RUN");
      assert.equal(r.exitCode, attribution === "product" ? 1 : 2);
      assert(r.missing.some((s) => /S3 detached DOM inventory/.test(s)));
      if (attribution === "unknown") assert.deepEqual(r.failures, []);
      else
        assert(
          r.failures.some((s) =>
            /S3 detached product payload detached-cell/.test(s),
          ),
        );
    });

test("R2 I5 nonnull nested inventory keeps precedence over top-level fallback", () => {
  const p = reviewPoints();
  p[3].detached = [{ id: "fallback", attribution: "product" }];
  const r = heap.validateLifecycleEvidence({ checkpoints: p });
  assert.equal(r.result, "NOT_RUN");
  assert.equal(r.exitCode, 2);
  assert.deepEqual(r.failures, []);
  assert(!r.missing.some((s) => /S3 detached DOM inventory/.test(s)));
});

for (const fallback of [null, {}, new Array(1)])
  test(`R2 I5 malformed fallback ${String(fallback)} stays structured Missing`, () => {
    const p = reviewPoints();
    p[3].dom = {};
    p[3].detached = fallback;
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, "NOT_RUN");
    assert.equal(r.exitCode, 2);
    assert.deepEqual(r.failures, []);
    assert(r.missing.some((s) => /S3 detached DOM inventory/.test(s)));
  });

for (const lifetime of [undefined, null, "", "provider", "L"])
  test(`R2 I6 known ended owner proves cleanup failure with lifetime ${String(lifetime)}`, () => {
    const teardown = {
      ...cleanupFailure(),
      queries: [],
      observers: [],
      registrations: [
        { id: "listener-1", kind: "listener", owner: "attendance", lifetime },
      ],
    };
    delete teardown.endedProductDataPaths;
    const r = heap.validateLifecycleEvidence({
      checkpoints: reviewPoints(),
      teardown,
    });
    assert.equal(r.result, "FAIL");
    assert.equal(r.exitCode, 1);
    assert(
      r.failures.some((s) =>
        /T attendance registration remains active/.test(s),
      ),
    );
    if (!lifetime)
      assert(
        r.missing.some((s) => /T registration owner\/lifetime missing/.test(s)),
      );
  });

for (const [owner, lifetime, endedLifetime, result] of [
  ["SessionProvider", "L", "L", "FAIL"],
  ["SessionProvider", "provider", "L", "NOT_RUN"],
  ["SessionProvider", undefined, "L", "NOT_RUN"],
  ["SessionProvider", undefined, undefined, "NOT_RUN"],
  ["SessionProvider", "L", undefined, "NOT_RUN"],
  ["unknown", "L", "L", "NOT_RUN"],
  ["unknown-native-owner", "L", "L", "NOT_RUN"],
  [undefined, "L", "L", "NOT_RUN"],
])
  test(`R2 I6 lifetime route requires known owner and ended proof: ${owner}/${lifetime}/${endedLifetime}`, () => {
    const teardown = {
      ...cleanupFailure(),
      endedLifetime,
      queries: [],
      observers: [],
      registrations: [{ id: "listener-1", kind: "listener", owner, lifetime }],
    };
    delete teardown.endedProductDataPaths;
    const r = heap.validateLifecycleEvidence({
      checkpoints: reviewPoints(),
      teardown,
    });
    assert.equal(r.result, result);
    assert.equal(r.exitCode, result === "FAIL" ? 1 : 2);
    if (result === "FAIL")
      assert(
        r.failures.some((s) =>
          /T attendance registration remains active/.test(s),
        ),
      );
    else assert.deepEqual(r.failures, []);
    if (!owner || !lifetime)
      assert(
        r.missing.some((s) => /T registration owner\/lifetime missing/.test(s)),
      );
    if (owner?.startsWith("unknown"))
      assert(r.missing.some((s) => /T unknown native owner/.test(s)));
    if (!endedLifetime)
      assert(r.missing.some((s) => /T endedLifetime missing/.test(s)));
  });

// R3 I7: completing an existing endpoint can repair an unknown binding without
// adding an active role. Holes must neither prove nor hide a binding mismatch.
for (const partial of [["queries"], ["observers"], ["queries", "observers"]])
  for (const [key, field] of [
    ["queries", "id"],
    ["observers", "queryId"],
  ])
    for (const [form, value] of [
      ["omitted"],
      ["undefined", undefined],
      ["null", null],
      ["empty", ""],
      ["zero", 0],
      ["number", 1],
      ["false", false],
      ["object", {}],
      ["array", []],
    ])
      test(`R3 I7 ${partial.join("+")} holes with ${key}.${field} ${form} cannot prove mismatch`, () => {
        const p = reviewPoints();
        for (const inventory of partial) p[5][inventory].length = 2;
        if (form === "omitted") delete p[5][key][0][field];
        else p[5][key][0][field] = value;
        const r = heap.validateLifecycleEvidence({ checkpoints: p });
        assert.equal(r.result, "NOT_RUN");
        assert.equal(r.exitCode, 2);
        assert.deepEqual(r.failures, []);
        assert(
          r.missing.includes("S5 observer/query binding identity missing"),
        );
        for (const inventory of partial)
          assert(
            r.missing.includes(
              `S5 ${inventory === "queries" ? "query" : "observer"} inventory missing or malformed`,
            ),
          );
        // Fill the SAME record: no extra active candidate was necessary.
        p[5][key][0][field] = "q";
        const completed = heap.validateLifecycleEvidence({ checkpoints: p });
        assert.equal(completed.result, "NOT_RUN");
        assert.equal(completed.exitCode, 2);
        assert.deepEqual(completed.failures, []);
        assert(
          !completed.missing.includes(
            "S5 observer/query binding identity missing",
          ),
        );
      });

for (const partial of [false, true])
  for (const value of [undefined, null, ""])
    test(`R3 I7 both endpoints ${String(value)} with partial=${partial} remain Missing`, () => {
      const p = reviewPoints();
      p[5].queries[0].id = value;
      p[5].observers[0].queryId = value;
      if (partial) {
        p[5].queries.length = 2;
        p[5].observers.length = 2;
      }
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, "NOT_RUN");
      assert.equal(r.exitCode, 2);
      assert.deepEqual(r.failures, []);
      assert(r.missing.includes("S5 observer/query binding identity missing"));
    });

for (const [key, field] of [
  ["queries", "id"],
  ["observers", "queryId"],
]) {
  test(`R3 I7 complete inventory with missing ${key}.${field} uses the same proof guard`, () => {
    const p = reviewPoints();
    delete p[5][key][0][field];
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, "NOT_RUN");
    assert.equal(r.exitCode, 2);
    assert.deepEqual(r.failures, []);
    assert(r.missing.includes("S5 observer/query binding identity missing"));
  });
  for (const violation of ["queries", "observers", "registration", "binding"])
    test(`R3 I7 missing ${key}.${field} cannot hide independent ${violation} failure`, () => {
      const p = reviewPoints();
      delete p[5][key][0][field];
      p[5].queries.length = 2;
      p[5].observers.length = 2;
      let failure;
      if (violation === "registration") {
        p[5].registrations = [retiredRegistration()];
        failure = "S5 retired registration native-1 remains reachable";
      } else if (violation === "binding") {
        p[7].observers[0].queryId = "retired-query";
        failure = "S7 observer/query identity mismatch";
      } else {
        p[5][violation].push({ ...p[5][violation][0] });
        failure = `S5 active attendance ${violation === "queries" ? "query" : "observer"} multiplicity 2 != 1`;
      }
      const r = heap.validateLifecycleEvidence({ checkpoints: p });
      assert.equal(r.result, "FAIL");
      assert.equal(r.exitCode, 1);
      assert.deepEqual(r.failures, [failure]);
      assert(r.missing.includes("S5 observer/query binding identity missing"));
    });
  test(`R3 I7 complete empty ${key} still proves absence`, () => {
    const p = reviewPoints();
    p[5][key] = [];
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, "FAIL");
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.failures, [
      `S5 active attendance ${key === "queries" ? "query" : "observer"} multiplicity 0 != 1`,
    ]);
  });
}

for (const [queryId, observerQueryId, result] of [
  ["q", "q", "NOT_RUN"],
  ["q", "retired-query", "FAIL"],
  [" ", " ", "NOT_RUN"],
  [" ", "q", "FAIL"],
])
  test(`R3 I7 both partial inventories preserve exact known binding ${JSON.stringify([queryId, observerQueryId])}`, () => {
    const p = reviewPoints();
    p[5].queries[0].id = queryId;
    p[5].observers[0].queryId = observerQueryId;
    p[5].queries.length = 2;
    p[5].observers.length = 2;
    const r = heap.validateLifecycleEvidence({ checkpoints: p });
    assert.equal(r.result, result);
    assert.equal(r.exitCode, result === "FAIL" ? 1 : 2);
    assert.deepEqual(
      r.failures,
      result === "FAIL" ? ["S5 observer/query identity mismatch"] : [],
    );
    assert(r.missing.some((s) => /S5 .*inventory/.test(s)));
    assert(!r.missing.includes("S5 observer/query binding identity missing"));
  });
