/**
 * Heap amendment A tooling.
 *
 * This module is deliberately pure. It consumes raw budget samples and a
 * separately captured, source-derived lifecycle graph. It never acquires a
 * browser/heap inspector, keeps a JSHandle, clones product payloads, or
 * changes the product's runtime instrumentation.
 *
 * File map: validateHeapBudget owns unrounded raw numeric acceptance;
 * analyzeGenerationGraphs checks the supplied normalized strong graph's R sets;
 * validateLifecycleEvidence accumulates known counterexamples and missing
 * capabilities; validateHeapAcceptance requires the full configuration matrix;
 * benchmarkOutcome preserves nonzero incomplete-vs-failed report status.
 * Runtime acquisition/signature matching/owner completeness are NOT provided.
 * See heap-coverage.json for pinned source roles, planned T and capability gaps.
 */

export const HEAP_BUDGET = Object.freeze({
  budgetPercent: 20,
  warmups: 2,
  cycles: 10,
  postGc: 11,
});

export const HEAP_CONFIGURATIONS = Object.freeze(
  [20, 200, 1000].flatMap((logicalEmployees) =>
    [25, 50].flatMap((pageSize) =>
      ["work", "overtime"].map((kind) => [logicalEmployees, pageSize, kind]),
    ),
  ),
);

const statuses = (failures, missing, blocked = []) => ({
  result: failures.length
    ? "FAIL"
    : blocked.length || missing.length
      ? "NOT_RUN"
      : "PASS",
  exitCode: failures.length ? 1 : missing.length || blocked.length ? 2 : 0,
  failures,
  missing,
  blocked,
});

const finiteNonNegative = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

// Preserve executed failures when acceptance is also incomplete. This mapping
// lets the existing runner keep nonzero Missing evidence distinct from FAILED.
export function benchmarkOutcome(acceptance, executionFailed = false) {
  if (executionFailed || acceptance?.result === "FAIL")
    return { result: "FAILED", exitCode: 1 };
  if (acceptance?.result === "PASS") return { result: "PASS", exitCode: 0 };
  return { result: "NOT_RUN", exitCode: 2 };
}

export function validateHeapBudget(metrics = {}) {
  const failures = [],
    missing = [];
  if (metrics.heapBytes === undefined) missing.push("heap samples missing");
  else if (!Array.isArray(metrics.heapBytes))
    failures.push("heap raw samples must be an array");
  if (metrics.heapWarmups === undefined)
    missing.push("heap warmup count missing");
  if (metrics.heapCycles === undefined)
    missing.push("heap cycle count missing");
  const values = Array.isArray(metrics.heapBytes)
    ? Array.from(metrics.heapBytes)
    : [];
  if (
    metrics.heapWarmups !== undefined &&
    metrics.heapWarmups !== HEAP_BUDGET.warmups
  )
    failures.push(
      `heap warmups ${metrics.heapWarmups} != ${HEAP_BUDGET.warmups}`,
    );
  if (
    metrics.heapCycles !== undefined &&
    metrics.heapCycles !== HEAP_BUDGET.cycles
  )
    failures.push(`heap cycles ${metrics.heapCycles} != ${HEAP_BUDGET.cycles}`);
  if (Array.isArray(metrics.heapBytes) && values.length !== HEAP_BUDGET.postGc)
    failures.push(`heap samples ${values.length} != ${HEAP_BUDGET.postGc}`);
  if (values.some((value) => !finiteNonNegative(value)))
    failures.push("heap samples must be finite and nonnegative");
  if (values[0] !== undefined && values[0] <= 0)
    failures.push("H0 must be greater than zero");
  const strictMonotonic =
    values.length > 1 && values.slice(1).every((n, i) => n > values[i]);
  const growthPercent =
    values[0] > 0 ? (values.at(-1) / values[0] - 1) * 100 : NaN;
  if (growthPercent > HEAP_BUDGET.budgetPercent)
    failures.push(
      `heap growth ${growthPercent}% > ${HEAP_BUDGET.budgetPercent}%`,
    );
  return {
    ...statuses(failures, missing),
    growthPercent,
    diagnostics: {
      strictMonotonic,
      growthPercent,
      strictMonotonicDiagnostic: strictMonotonic
        ? "total heap rose at every step"
        : "total heap was not strictly monotonic",
      warmups: metrics.heapWarmups,
      cycles: metrics.heapCycles,
      postGc: values.length,
    },
  };
}

const dataCategories = new Set(["data", "payload", "projection"]);
const allowedRootAttribution = new Set([
  "product",
  "observer",
  "native",
  "browser",
]);
const isProductCategory = (node) => dataCategories.has(node?.category);

function rootPaths(graph, attribution) {
  const roots = new Set(
    (graph.roots ?? [])
      .filter((root) => root.attribution === attribution)
      .map((root) => root.id),
  );
  const previous = new Map([...roots].map((root) => [root, null]));
  const edges = new Map();
  for (const edge of graph.edges ?? []) {
    if (edge.strength !== "strong") continue;
    if (!edges.has(edge.from)) edges.set(edge.from, []);
    edges.get(edge.from).push(edge.to);
  }
  const queue = [...roots];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const child of edges.get(id) ?? []) {
      if (previous.has(child)) continue;
      previous.set(child, id);
      queue.push(child);
    }
  }
  return previous;
}

function materializePath(previous, id) {
  const path = [];
  for (let current = id; current !== null; current = previous.get(current))
    path.push(current);
  return path.reverse();
}

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Array.from/for..of visit sparse holes. Retain valid facts from a partial
// inventory, but never use its absence/count to prove a lifecycle violation.
function recordInventory(value, label, missing) {
  const entries = [];
  let complete = Array.isArray(value);
  for (const entry of Array.isArray(value) ? value : []) {
    if (isRecord(entry)) entries.push(entry);
    else complete = false;
  }
  if (!complete) missing.push(`${label} inventory missing or malformed`);
  return { entries, complete };
}

// Labels belong to captures, not array positions: a missing S3 must not rename
// S4..S10 or prevent an independent S0/S5 counterexample from being inspected.
function labeledCheckpoints(points, missing) {
  const entries = new Map();
  if (!Array.isArray(points) || points.length !== HEAP_BUDGET.postGc)
    missing.push("companion S0-S10 graph checkpoints missing");
  for (const [index, point] of (Array.isArray(points)
    ? points
    : []
  ).entries()) {
    if (!isRecord(point) || !/^S(?:[0-9]|10)$/.test(point.label)) {
      missing.push(`checkpoint entry ${index} shape/label missing`);
      continue;
    }
    if (!entries.has(point.label)) entries.set(point.label, []);
    entries.get(point.label).push(point);
  }
  const labeled = [];
  for (let i = 0; i < HEAP_BUDGET.postGc; i++) {
    const label = `S${i}`,
      matches = entries.get(label) ?? [];
    if (matches.length !== 1) {
      missing.push(`${label} checkpoint missing or duplicate`);
      continue;
    }
    labeled.push(matches[0]);
  }
  return labeled;
}

export function analyzeGenerationGraphs(points = []) {
  const failures = [],
    missing = [],
    blocked = [],
    checkpoints = [],
    domains = new Map();
  labeledCheckpoints(points, missing).forEach((point) => {
    const label = point.label,
      missingBefore = missing.length,
      failuresBefore = failures.length;
    if (
      typeof point.identityDomain !== "string" ||
      point.identityDomain.trim().length === 0
    )
      missing.push(`${label} identity domain missing`);
    else domains.set(label, point.identityDomain);
    if (!isRecord(point.graph)) {
      missing.push(`${label} graph missing`);
      return;
    }
    const graph = point.graph,
      nodeInventory = recordInventory(
        graph.nodes,
        `${label} graph nodes`,
        missing,
      ),
      edgeInventory = recordInventory(
        graph.edges,
        `${label} graph edges`,
        missing,
      ),
      rootInventory = recordInventory(
        graph.roots,
        `${label} graph roots`,
        missing,
      ),
      nodes = nodeInventory.entries,
      ids = new Set();
    if (
      !nodeInventory.complete ||
      !edgeInventory.complete ||
      !rootInventory.complete
    )
      return;
    if (!graph.roots.length)
      missing.push(`${label} graph root inventory missing`);
    if (
      !Array.isArray(point.activeDataIds) ||
      Array.from(point.activeDataIds).some(
        (id) => typeof id !== "string" || !id,
      )
    )
      missing.push(`${label} active payload identity inventory missing`);
    for (const root of graph.roots ?? []) {
      if (!allowedRootAttribution.has(root.attribution))
        missing.push(
          `${label} unknown root owner ${root.attribution ?? "missing"}`,
        );
    }
    for (const node of nodes) {
      if (typeof node.id !== "string" || !node.id) {
        missing.push(`${label} graph identity missing`);
        return;
      }
      if (ids.has(node.id))
        failures.push(
          `${label} duplicate graph identity ${node.id ?? "missing"}`,
        );
      ids.add(node.id);
      if (!dataCategories.has(node.category) && node.category !== "owner")
        missing.push(
          `${label} unknown node category ${node.category ?? "missing"}`,
        );
      if (!finiteNonNegative(node.selfBytes))
        missing.push(`${label} node bytes missing for ${node.id ?? "unknown"}`);
    }
    for (const edge of graph.edges ?? []) {
      if (edge.strength !== "strong")
        missing.push(
          `${label} weak/unknown graph edge ${edge.from ?? "?"}->${edge.to ?? "?"}`,
        );
      if (!ids.has(edge.from) || !ids.has(edge.to))
        failures.push(`${label} graph edge identity missing`);
    }
    for (const root of graph.roots ?? [])
      if (!ids.has(root.id)) missing.push(`${label} root identity missing`);
    if (point.observerStrongHandles?.length)
      missing.push(`${label} observer strong handle retains product graph`);
    const paths = rootPaths(graph, "product"),
      observerPaths = rootPaths(graph, "observer"),
      browserPaths = rootPaths(graph, "browser");
    for (const node of nodes) {
      if (!isProductCategory(node)) continue;
      if (
        !paths.has(node.id) &&
        !observerPaths.has(node.id) &&
        !browserPaths.has(node.id)
      )
        missing.push(`${label} product owner path missing for ${node.id}`);
    }
    const activeIds = new Set(
      Array.isArray(point.activeDataIds) ? point.activeDataIds : [],
    );
    const retired = nodes
      .filter(
        (node) =>
          isProductCategory(node) &&
          paths.has(node.id) &&
          !activeIds.has(node.id),
      )
      .map((node) => ({
        id: node.id,
        category: node.category,
        selfBytes: node.selfBytes,
        path: materializePath(paths, node.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    checkpoints.push({
      label,
      classificationComplete:
        missing.length === missingBefore && failures.length === failuresBefore,
      active: [...activeIds].sort(),
      retired,
      retiredSelfBytes: retired.reduce((sum, node) => sum + node.selfBytes, 0),
    });
  });
  const baselinePoint = checkpoints.find((point) => point.label === "S0");
  const baseline = new Set(
    (baselinePoint?.retired ?? []).map((node) => node.id),
  );
  checkpoints
    .filter((point) => point.label !== "S0")
    .forEach((checkpoint) => {
      if (
        !baselinePoint?.classificationComplete ||
        !checkpoint.classificationComplete ||
        !domains.has("S0") ||
        !domains.has(checkpoint.label)
      )
        return;
      if (domains.get(checkpoint.label) !== domains.get("S0")) {
        missing.push(`${checkpoint.label} identity domain differs from S0`);
        return;
      }
      for (const node of checkpoint.retired)
        if (!baseline.has(node.id))
          failures.push(
            `${checkpoint.label} retired identity ${node.id} was not in baseline R0`,
          );
    });
  return {
    ...statuses(failures, missing, blocked),
    scope: "normalized-graph-predicate-only",
    checkpoints,
  };
}

function validateRegistrations(checkpoint, label, failures, missing) {
  const { entries: registrations } = recordInventory(
    checkpoint.registrations,
    `${label} registration`,
    missing,
  );
  const identities = new Set();
  for (const registration of registrations) {
    if (
      !registration.id ||
      !registration.kind ||
      !registration.owner ||
      !registration.lifetime
    ) {
      missing.push(`${label} registration owner/identity/lifetime missing`);
      continue;
    }
    if (
      registration.owner === "unknown" ||
      registration.owner === "unknown-native-owner"
    ) {
      missing.push(`${label} unknown native owner ${registration.id}`);
      continue;
    }
    const identity = JSON.stringify([
      registration.kind,
      registration.owner,
      registration.lifetime,
      registration.target,
      registration.type,
      registration.capture,
      registration.callback,
      registration.id,
    ]);
    if (identities.has(identity))
      failures.push(`${label} duplicate/stale registration ${registration.id}`);
    identities.add(identity);
    if (
      registration.state === "retired" ||
      registration.lifetimeStatus === "retired"
    )
      failures.push(
        `${label} retired registration ${registration.id} remains reachable`,
      );
  }
}

export function validateLifecycleEvidence(companion = {}) {
  const failures = [],
    missing = [],
    blocked = [
      "source-to-runtime classifier, complete owner/multiplicity and observer/native semantics are not implemented; H1-H5 cannot PASS",
    ];
  const coverage = companion.coverage;
  if (!coverage) missing.push("source-to-runtime coverage map missing");
  else {
    for (const key of [
      "derivedFrom",
      "sourceHashes",
      "roles",
      "expectedMultiplicity",
      "payloadProjections",
      "ownerRoles",
    ])
      if (coverage[key] === undefined) missing.push(`coverage ${key} missing`);
    if (coverage.derivedFrom !== "source")
      missing.push("source-to-runtime coverage is not source-derived");
    if (!coverage.sourceToRuntime)
      missing.push("source-to-runtime coverage review missing");
  }
  const points = companion.checkpoints;
  const graph = analyzeGenerationGraphs(points);
  failures.push(...graph.failures);
  missing.push(...graph.missing);
  if (graph.blocked?.length) blocked.push(...graph.blocked);
  labeledCheckpoints(points, []).forEach((point) => {
    const label = point.label;
    const queries = recordInventory(point.queries, `${label} query`, missing),
      observers = recordInventory(
        point.observers,
        `${label} observer`,
        missing,
      );
    {
      const activeQueries = queries.entries.filter(
        (query) => query.scope === "attendance" && query.status === "active",
      );
      const activeObservers = observers.entries.filter(
        (observer) =>
          observer.scope === "attendance" && observer.status === "active",
      );
      if (
        queries.entries.some(
          (query) =>
            query.scope === "attendance" && query.status === "inactive",
        )
      )
        failures.push(`${label} inactive attendance query remains reachable`);
      if (
        activeQueries.length > 1 ||
        (queries.complete && activeQueries.length !== 1)
      )
        failures.push(
          `${label} active attendance query multiplicity ${activeQueries.length} != 1`,
        );
      if (
        activeObservers.length > 1 ||
        (observers.complete && activeObservers.length !== 1)
      )
        failures.push(
          `${label} active attendance observer multiplicity ${activeObservers.length} != 1`,
        );
      if (activeQueries[0] && activeObservers[0]) {
        const queryId = activeQueries[0].id,
          observerQueryId = activeObservers[0].queryId;
        if (
          typeof queryId !== "string" ||
          !queryId ||
          typeof observerQueryId !== "string" ||
          !observerQueryId
        )
          missing.push(`${label} observer/query binding identity missing`);
        // With both identities known, a hole cannot repair this binding:
        // another active candidate would exceed the fixed bound of one.
        else if (observerQueryId !== queryId)
          failures.push(`${label} observer/query identity mismatch`);
      }
    }
    validateRegistrations(point, label, failures, missing);
    let { entries: detached } = recordInventory(
      isRecord(point.dom) ? point.dom.detached : point.detached,
      `${label} detached DOM`,
      missing,
    );
    // Keep the malformed nested inventory diagnostic while retaining known
    // facts from the supported nullish fallback at the same checkpoint.
    if (
      isRecord(point.dom) &&
      point.dom.detached == null &&
      point.detached != null
    )
      ({ entries: detached } = recordInventory(
        point.detached,
        `${label} detached DOM`,
        missing,
      ));
    for (const node of detached)
      if (node.attribution === "product" || node.owner === "product")
        failures.push(
          `${label} detached product payload ${node.id ?? "unknown"}`,
        );
  });
  const teardown = companion.teardown;
  if (!teardown) missing.push("T teardown checkpoint missing");
  else {
    for (const key of [
      "action",
      "endedLifetime",
      "owners",
      "readiness",
      "deadlineSource",
    ])
      if (teardown[key] === undefined) missing.push(`T ${key} missing`);
    if (teardown.contextAlive !== true)
      missing.push("T browser context must remain alive");
    if (
      teardown.action !== undefined &&
      !["unmount", "logout"].includes(teardown.action)
    )
      failures.push(`T exact action ${teardown.action} is unsupported`);
    const queries = recordInventory(teardown.queries, "T query", missing),
      observers = recordInventory(teardown.observers, "T observer", missing),
      registrations = recordInventory(
        teardown.registrations,
        "T registration",
        missing,
      );
    if (
      queries.entries.some(
        (query) => query.scope === "attendance" && query.status === "active",
      )
    )
      failures.push("T attendance query remains active");
    if (
      observers.entries.some(
        (observer) =>
          observer.scope === "attendance" && observer.status === "active",
      )
    )
      failures.push("T attendance observer remains active");
    for (const registration of registrations.entries) {
      if (!registration.owner || !registration.lifetime)
        missing.push("T registration owner/lifetime missing");
      if (!registration.owner) continue;
      if (
        registration.owner === "unknown" ||
        registration.owner === "unknown-native-owner"
      ) {
        missing.push(`T unknown native owner ${registration.id ?? "missing"}`);
        continue;
      }
      // Ended-owner membership and an identified ended lifetime are separate
      // proofs. Missing metadata must not hide the former or invent the latter.
      if (
        (registration.lifetime &&
          teardown.endedLifetime &&
          registration.lifetime === teardown.endedLifetime) ||
        (Array.isArray(teardown.owners) &&
          teardown.owners.includes(registration.owner))
      )
        failures.push("T attendance registration remains active");
    }
    if (teardown.endedProductDataPaths?.length)
      failures.push("T product data remains reachable after cleanup");
  }
  return {
    ...statuses(failures, missing, blocked),
    graph,
    limitations: [
      ...(companion.limitations ?? []),
      ...(teardown?.action === "unmount"
        ? ["logout/session not exercised"]
        : []),
    ],
  };
}

export function validateHeapAcceptance(rows = []) {
  const failures = [],
    missing = [],
    blocked = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.logicalEmployees}/${row.pageSize}/${row.kind}`;
    if (seen.has(key)) failures.push(`${key} duplicate configuration`);
    seen.add(key);
    const budget = validateHeapBudget(row.metrics ?? {});
    failures.push(
      ...budget.failures.map((failure) => `${key} heap: ${failure}`),
    );
    missing.push(...budget.missing.map((item) => `${key} heap: ${item}`));
    blocked.push(...budget.blocked.map((item) => `${key} heap: ${item}`));
    const lifecycle = row.metrics?.companion ?? row.metrics?.lifecycle;
    if (!lifecycle) missing.push(`${key} companion S0-S10+T evidence missing`);
    else {
      const result = validateLifecycleEvidence(lifecycle);
      failures.push(
        ...result.failures.map((failure) => `${key} lifecycle: ${failure}`),
      );
      missing.push(
        ...result.missing.map((item) => `${key} lifecycle: ${item}`),
      );
      blocked.push(
        ...result.blocked.map((item) => `${key} lifecycle: ${item}`),
      );
    }
  }
  for (const [logicalEmployees, pageSize, kind] of HEAP_CONFIGURATIONS) {
    const key = `${logicalEmployees}/${pageSize}/${kind}`;
    if (!seen.has(key)) missing.push(`missing ${key}`);
  }
  return { ...statuses(failures, missing, blocked), configurations: [...seen] };
}
