/**
 * D1 only: raw structural candidates, never source/runtime or GC proof.
 * File map: frozen pins/rules -> registry validation; indexFacts -> one raw
 * adjacency scan; matchShape -> finite DTO conjunctions; matchDistinctWrappers
 * -> direct source allocation relations; collectMembers ->
 * property/element witnesses and unresolved boundaries; recognize -> results.
 * Registry hashes are EXPECTATIONS. This pure module never reads source bytes.
 */
const scope = "offline-structural-candidates-only";
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const sourcePins = {
  "apps/web/src/features/attendance/api/use-attendance-page.ts":
    "69ec0860ddbb791365312845d7afc7e864babbf83d46107b4150ea62178ad6d3",
  "apps/web/src/features/attendance/api/query-keys.ts":
    "f1cfc6614acf1867e6e959708e0c08e3cadbfa66fd39768d956b111794efa30a",
  "apps/web/src/features/attendance/model/page-view.ts":
    "eb1513d4a89589ba0758e5dbb8799ca88eb65fe6c13d00485b05aa36ebfe3e80",
  "apps/web/src/features/attendance/model/use-page-view.ts":
    "ec4162151067a129df27fdea7eb93b274a9894bfaf75465c22c48937ba761b37",
  "apps/web/src/features/attendance/model/attendance-read-view.ts":
    "94fcfd9b4e426eb154232bbe5d65086875d2d8778747c681c4f869e30b41be15",
  "apps/web/src/features/attendance/model/attendance-draft.ts":
    "05158901c7d400cd14cadcbafa32fa0b59bf1c15016fed2d3c7136cd456163f6",
  "apps/web/src/features/attendance/model/use-cell-selection.ts":
    "936267882980fa4c5993ae6b556e224f3e6fd24b4c9b7180714a9f0dba4a264a",
  "apps/web/src/features/attendance/ui/attendance-workspace.tsx":
    "0883119ac9bc533411c3dd35ba697a6c12f650f275737d12bdb82919ce015e4c",
  "apps/web/src/features/attendance/ui/attendance-page.tsx":
    "073b2fb155960012bfd0f027ce157353c2c744359c3af41dcba4b6af76e9847b",
  "apps/web/src/features/attendance/ui/attendance-grid.tsx":
    "732098c40654bb141b518809a001f148537c155d18b93448dc7286e57ed1229d",
  "apps/web/src/features/attendance/ui/attendance-row.tsx":
    "8d994ac400efdb0cd583d4dd3fdc1fe1187e7c57a774f8ab37204b0c25f8cbb1",
  "apps/web/src/features/attendance/ui/attendance-cell.tsx":
    "73c0db0bbbde871aefbf2ad613d8bdfc35c707e6cf248e542af64e676ee331af",
  "apps/web/src/features/attendance/ui/use-grid-gesture.ts":
    "f7a1ef11a4a5b656fef8fc2207b402f801671d9696e9132ea1ae3a440dbab186",
  "apps/web/src/features/attendance/ui/attendance-search.tsx":
    "00e2a2bc664184e9d0ab4c1e889288162f843afee31d9199a0fc2581bdad8de2",
  "apps/web/src/features/session/model/session-runtime.ts":
    "802b50680cf982946a4f5634d3ab43a717ea571ff3f04e1d09ef7e56908b93eb",
  "apps/web/src/features/session/model/session-context.tsx":
    "1bfff4d5e57dc34d94caba15f0898ce10208e7256b97ec98cb39137a90de2e5c",
  "apps/web/src/shared/api/session-boundary.ts":
    "e17f48eafd6af4cb5a0ed9ee5a5cc76863a2bf69623bb2dbed975738548e520c",
  "apps/web/src/shared/api/transport.ts":
    "bf1a330b28c28a93683dfe6012da9814e56669eabfa01a1cd3650041121a10b4",
  "apps/web/src/shared/api/reconcile.ts":
    "9c749f02a60d080cdb6d97fd1b330335efa504f2b92dcfed8e7aad8949101d66",
  "apps/web/src/app/providers.tsx":
    "d6fc522d1f27efb30b6ebf079a722ed03ae94398b403e6d2890b194591a56ffc",
  "apps/web/src/app/app-shell.tsx":
    "1d299d202255ad93f4f4515d9d54948b20982025ab1d7184dae87949c1997ca7",
  "apps/web/src/app/router.tsx":
    "7da818cf6c2dc567f1d42bb0e4ba61275b6135a25a2e67897d5ee2e3980268fc",
};
const supportingPins = {
  "apps/web/node_modules/@tanstack/react-query/src/useBaseQuery.ts":
    "3d7883862f7be86f67e73901652a56ca91982360a4599e6275e87b1a6ea8de52",
  "apps/web/node_modules/radix-ui/package.json":
    "b32841bed38e47fd24c9eff2f9a4f3680bea47d5bcf4181a64dc5bd61cefcd80",
  "apps/web/node_modules/react-dom/cjs/react-dom-client.production.js":
    "a319b413b7a19ee34422d9a12a8e7afd003c07846716d278ba1a0898e8cb6251",
  "apps/web/node_modules/react/package.json":
    "9cc9c3de5441a2eea7f41f52f3f2a15a4fc51f90c0b72741f0d7638643a85e67",
  "apps/web/src/features/attendance/model/month-view.ts":
    "46d7b7b1bfffc570573d7a639eb6bf64564bce20d42ba8a0e3b02d1f5e64f450",
  "apps/web/src/features/attendance/model/selection-gesture.ts":
    "2e3967931d3ee1230b422ff4f802ea3abf8ad9db9697d312e929e1f8f1aad201",
  "apps/web/src/main.tsx":
    "7bd829844c0b675e5158e7a7f7295a9b1c0e54f2d47ca8e47ff3fb65075ad8ef",
  "apps/web/src/shared/api/generated/schema.d.ts":
    "e61276228ba64fa33703cc76b4a1f6bb4acc3275d408408282ede9e36726e4cd",
  "apps/web/src/shared/ui/confirm-discard.tsx":
    "1dee009a521689cb8c40993232d9aa39c3a0b1f2978a729fe85719de3717ee61",
  "apps/web/src/shared/ui/tabs.tsx":
    "4352d19684167672060ed8d21d94a05eaec9c21bc90c038b806bf34529c42102",
  "node_modules/.pnpm/@radix-ui+react-dismissable_aa9a2defeade16af3bdfd2945af978c3/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs":
    "4d5ddbc02c123327c4779c8bcb501ed3a1edeb56141542208eaac21fcef431bd",
  "node_modules/.pnpm/@radix-ui+react-focus-scope_6d7db95e6b4b16578fd42789685673fa/node_modules/@radix-ui/react-focus-scope/dist/index.mjs":
    "52da53d1da1626ab3bde726e5195e1f5062a6f170755131991225517dc980957",
  "node_modules/.pnpm/@radix-ui+react-presence@1._f62c16392ef5c0f7dddc17b4112d7eab/node_modules/@radix-ui/react-presence/dist/index.mjs":
    "1707d09ce8f6c4829d23cd94291f6db131b83c7e7a00ccb5a4088defcd7b1f36",
  "node_modules/.pnpm/@radix-ui+react-tabs@1.2.1__519fe3e24f3d946c91e5ee8267015a1e/node_modules/@radix-ui/react-presence/dist/index.mjs":
    "1707d09ce8f6c4829d23cd94291f6db131b83c7e7a00ccb5a4088defcd7b1f36",
  "node_modules/.pnpm/@radix-ui+react-tabs@1.2.1__519fe3e24f3d946c91e5ee8267015a1e/node_modules/@radix-ui/react-roving-focus/dist/index.mjs":
    "166fc653de0607e1665c09c1bbb1a69ba12993d6990903aad3d7ef9bbf460517",
  "node_modules/.pnpm/@radix-ui+react-tabs@1.2.1__519fe3e24f3d946c91e5ee8267015a1e/node_modules/@radix-ui/react-tabs/dist/index.mjs":
    "add042d623442590b3b54de2a5ed9840a8461314a193737414498860e0c49ac8",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/focusManager.ts":
    "afaa2b0ea852efe4273a93f977b8374b5d8ef67d8f47106136c018d21d305be5",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/notifyManager.ts":
    "008f46723c56f2e82bc9777eb43069c8dd8a5d78b9b688add97721979ad17ceb",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/onlineManager.ts":
    "5d75913a175dc8d65dbbe03c955f6b95f51f89234aca5c1989e25ee19e4b65b8",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/query.ts":
    "924582b6297f4c5984c08d04246bbdba0bae740d4ffe769a406ab77139cfde1d",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/queryObserver.ts":
    "76f895d10ac045f81caa06b86855742364e27c196f236f8f87eb13fa104e554d",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/removable.ts":
    "f0406358208e7d1246e7fe4c1fed081a202f802840a188479313d454d70a8c5c",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/retryer.ts":
    "f7a2b8e1c5816179ae541b427c9f8589505ee5e67990ba6a5f3aa1f2aa3c0453",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/timeoutManager.ts":
    "5610303518090878b815a5ab32db4a15e2c3e560fc7987873865757accc7cbdf",
  "node_modules/.pnpm/@tanstack+query-core@5.105.0/node_modules/@tanstack/query-core/src/utils.ts":
    "7acca224b2be911a9d62e5f6b267c7044e440934fb53eea2b475ec1d667a8f86",
  "node_modules/playwright-core/browsers.json":
    "2cfd419f71ac6475d81e1301fa86c34cf2a2a6bae2a0da4b5a2b18310216b6bf",
  "node_modules/playwright-core/types/protocol.d.ts":
    "ccd722dea5eca655cf111348ec27a38a376d467407c4cc763d31514550d04d5d",
  "scripts/product/benchmark-pagination.mjs":
    "88541ba5680cb5c4fb4f053bccd3e01ff23f2992a17725399767e3be6f086957",
  "scripts/product/benchmark.mjs":
    "040b85b83a9a0b2e52106c59c053a06a1ec2df439b22eb7ff64dfe36c34172ba",
  "scripts/product/heap-snapshot-reader.mjs":
    "79ad5c0889f4393fe728c9a8a991dc23f57aa3f75a46633058db284fa7d6cfef",
  "scripts/product/heap-coverage.json":
    "419fa76e5e5528d92826a51c82c461442d6f7e5a0df75e9a92deedc2136446e3",
  "apps/web/src/features/attendance/model/types.ts":
    "57d6c5879d665e0615a196966eb2a87244cd31018ac05f7392f43aab9874f895",
};
const buildPins = {
  "apps/web/dist/index.html":
    "c3c0f42f2b1e0c7284d91d35d15fbb9c412175980186537852fd609a8f990a9a",
  "apps/web/dist/assets/index-BaJqv5sE.js":
    "14636da8e25fd8df24730d0d0728a32fa27bcd6debe77f32fac922f0aafe374f",
  "apps/web/dist/assets/index-DPJ3jwnc.css":
    "8b7cfad34c248e32e9b3c91e9c35a25ca97b7ccce075fc5e9c383a93cedc2562",
  "apps/web/vite.config.ts":
    "4f8af3124b298fe0a5e5760230956ab7ac940d4f6a325a88481b1633e8155308",
  "pnpm-lock.yaml":
    "5e8ae341f5f991398462c7a549b5ac914b23f9b283fad29d92448d04744773aa",
};

const model = "apps/web/src/features/attendance/model/";
const ui = "apps/web/src/features/attendance/ui/";
const schema = "apps/web/src/shared/api/generated/schema.d.ts";
// Finite source-specific grammar, not caller-extensible graph predicates.
const shapes = {
  criteria: {
    month: "string",
    q: "string",
    page: "number",
    pageSize: "number",
  },
  lifetime: { userId: "string", epoch: "number", generation: "number" },
  delivery: {
    requested: "criteria",
    requestLifetime: "lifetime",
    requestId: "number",
    data: "page",
  },
  employee: {
    id: "string",
    name: "string",
    revision: "string",
    startDate: "string",
    endDate: "nullable-string",
  },
  cell: {
    date: "string",
    employeeId: "string",
    kind: "string",
    revision: "string",
    state: "string",
    reminder: "boolean",
    value: "nullable-value",
  },
  value: { type: "string", value: "number" },
  employeeTotal: { employeeId: "string", value: "number" },
  dateTotal: { date: "string", value: "number" },
  employeeTotals: { work: "employeeTotal[]", overtime: "employeeTotal[]" },
  kindTotals: { byDate: "dateTotal[]", grandTotal: "number" },
  monthTotals: { work: "kindTotals", overtime: "kindTotals" },
  pagination: {
    from: "number",
    to: "number",
    totalResults: "number",
    monthEmployeeCount: "number",
    page: "number",
    pageSize: "number",
    requestedPage: "number",
    totalPages: "number",
  },
  range: {
    from: "number",
    to: "number",
    totalResults: "number",
    monthEmployeeCount: "number",
  },
  page: {
    month: "string",
    fetchedAt: "string",
    employees: "employee[]",
    cells: "cell[]",
    employeeTotals: "employeeTotals",
    monthTotals: "monthTotals",
    pagination: "pagination",
  },
  table: {
    month: "string",
    employees: "employee[]",
    cells: "cell[]",
    employeeTotals: "employeeTotals",
    monthTotals: "monthTotals",
    range: "range",
  },
  readView: { month: "string", employees: "employee[]", cells: "cell[]" },
  day: { date: "string", day: "number", weekday: "string" },
  row: { employee: "employee", total: "number", cells: "rowCell[]" },
  projection: {
    days: "day[]",
    cells: "opaque",
    totals: "kindTotals",
    ordered: "cell[]",
    dayTotals: "opaque",
    rows: "row[]",
  },
};
// These string-property conjunctions distinguish DTO members that otherwise
// overlap (employee.revision alone must not impersonate a cell). Numeric/bool
// witnesses remain optional because their encoding can be omitted.
const distinguishing = {
  cell: ["date", "employeeId", "kind"],
  employee: ["id", "name", "startDate"],
};
const signatures = {
  delivery: {
    shape: "delivery",
    anchors: ["requested", "requestLifetime", "data"],
    distinct: ["requested", "requestLifetime", "data"],
    sourceRef: `${model}page-view.ts#PageDelivery; apps/web/src/features/attendance/api/use-attendance-page.ts#useAttendancePage.queryFn`,
  },
  "attendance-page": {
    shape: "page",
    anchors: ["employees", "cells", "employeeTotals", "monthTotals"],
    sourceRef: `${schema}#AttendancePageDto`,
  },
  "page-table": {
    shape: "table",
    anchors: ["employees", "cells", "range"],
    // Both toPageTable and toMonthTable allocate a fresh range literal.
    // DTO arrays/totals are aliases, not members of this allocation group.
    distinct: ["range"],
    sourceRef: `${model}attendance-read-view.ts#toPageTable,toMonthTable`,
  },
  "grid-projection": {
    shape: "projection",
    anchors: ["days", "ordered", "rows"],
    // Source allocations only: do not follow Map/array backing storage or
    // impose distinctness on employee/cell DTOs shared by ordered and rows.
    distinct: [
      "days",
      "cells",
      "totals",
      "ordered",
      "dayTotals",
      "rows",
      "rows.*",
      "rows.*.cells",
    ],
    sourceRef: `${ui}attendance-grid.tsx#AttendanceGrid.projection; ${model}month-view.ts#monthDays,orderedMonthCells`,
  },
  "grid-row": {
    shape: "row",
    anchors: ["employee", "cells"],
    distinct: ["employee", "cells"],
    sourceRef: `${ui}attendance-grid.tsx#AttendanceGrid.projection.rows; ${ui}attendance-row.tsx#AttendanceRow`,
  },
  "row-cells": {
    shape: "rowCell[]",
    anchors: [],
    sourceRef: `${ui}attendance-grid.tsx#AttendanceGrid.projection.rows.cells; ${schema}#CellSnapshotDto`,
  },
  "gesture-capture": {
    shape: "readView",
    anchors: ["month", "employees", "cells"],
    sourceRef: `${ui}use-grid-gesture.ts#useGridGesture.begin; ${model}attendance-read-view.ts#AttendanceReadView; ${model}selection-gesture.ts#createSelectionGesture`,
  },
};
export const attendanceHeapSignatureRegistry = freeze({
  schema: "mkw-attendance-heap-signatures-v1",
  sourcePins,
  supportingPins,
  buildPins,
  shapes,
  distinguishing,
  signatures,
});

const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const payload = (node) => node.type === "object" || node.type === "array";
const identity = (node) => ({
  domain: node.identity.domain,
  rawId: node.rawId,
});
const witness = (edge) => ({
  edgeIndex: edge.index,
  fromIndex: edge.fromIndex,
  toIndex: edge.toIndex,
  property: edge.label.value,
});
function equal(actual, expected) {
  if (actual === expected) return true;
  if (
    !actual ||
    !expected ||
    typeof actual !== "object" ||
    typeof expected !== "object" ||
    Array.isArray(actual) !== Array.isArray(expected)
  )
    return false;
  const keys = Object.keys(expected);
  return (
    Object.keys(actual).length === keys.length &&
    keys.every(
      (key) => Object.hasOwn(actual, key) && equal(actual[key], expected[key]),
    )
  );
}
function empty(status, code) {
  return {
    status,
    scope,
    candidates: [],
    aliases: [],
    obligations: [],
    diagnostics: code ? [{ code }] : [],
  };
}

// Accept immutable reader facts only. This validates the consumed view, not the
// provenance of a caller's JS object or the truth of its session-domain label.
function indexFacts(graph) {
  if (
    !record(graph) ||
    !Object.isFrozen(graph) ||
    !natural(graph.nodeCount) ||
    !natural(graph.edgeCount) ||
    typeof graph.identityDomain !== "string" ||
    graph.identityDomain.length === 0 ||
    !record(graph.metadata) ||
    !record(graph.provenance) ||
    !/^[a-f0-9]{64}$/.test(graph.provenance.sha256) ||
    !natural(graph.provenance.byteLength) ||
    ["nodeAt", "edgeAt", "outgoing", "nodes", "edges"].some(
      (key) => typeof graph[key] !== "function",
    )
  )
    throw new Error("invalid-reader-graph");
  const nodes = [],
    outgoing = [],
    properties = [],
    incoming = [],
    ids = new Set();
  let edgeCount = 0;
  for (let index = 0; index < graph.nodeCount; index++) {
    const node = graph.nodeAt(index);
    if (
      !record(node) ||
      !Object.isFrozen(node) ||
      node.index !== index ||
      !natural(node.rawId) ||
      ids.has(node.rawId) ||
      node.identity?.domain !== graph.identityDomain ||
      node.identity?.rawId !== node.rawId ||
      typeof node.type !== "string" ||
      !natural(node.edgeCount)
    )
      throw new Error("invalid-reader-node");
    ids.add(node.rawId);
    nodes.push(node);
    incoming.push([]);
    const links = [...graph.outgoing(index)],
      props = new Map();
    if (links.length !== node.edgeCount)
      throw new Error("invalid-reader-edges");
    for (const edge of links) {
      if (
        !record(edge) ||
        !Object.isFrozen(edge) ||
        edge.index !== edgeCount++ ||
        edge.fromIndex !== index ||
        !natural(edge.toIndex) ||
        edge.toIndex >= graph.nodeCount ||
        !record(edge.label) ||
        ![
          "property",
          "element",
          "internal",
          "hidden",
          "weak",
          "context",
          "shortcut",
        ].includes(edge.type) ||
        !equal(edge, graph.edgeAt(edge.index))
      )
        throw new Error("invalid-reader-edge");
      if (edge.type === "property") {
        if (!props.has(edge.label.value)) props.set(edge.label.value, []);
        props.get(edge.label.value).push(edge);
      }
    }
    outgoing.push(links);
    properties.push(props);
  }
  if (edgeCount !== graph.edgeCount) throw new Error("invalid-reader-edges");
  for (const links of outgoing)
    for (const edge of links) incoming[edge.toIndex].push(edge);
  return { nodes, outgoing, properties, incoming };
}

// Numeric/bool fields can be omitted by a snapshot's primitive encoding.
// Missing other fields remain explicit partial evidence, never invented values.
function matchShape(facts, index, shape, seen = new Set()) {
  const { nodes, outgoing, properties } = facts,
    node = nodes[index];
  const result = { matches: true, gaps: [] };
  const gap = (code, detail, at = index) =>
    result.gaps.push({ code, index: at, detail });
  if (shape === "rowCell" && node.type === "hidden") {
    gap(
      "primitive-encoding-unproven",
      "undefined/null row slot requires engine profile",
    );
    return result;
  }
  if (shape === "rowCell") shape = "cell";
  if (shape.startsWith("nullable-")) {
    if (node.type === "hidden") {
      gap(
        "primitive-encoding-unproven",
        "null/oddball encoding requires engine profile",
      );
      return result;
    }
    shape = shape.slice(9);
  }
  if (["string", "number", "boolean"].includes(shape)) {
    result.matches =
      shape === "string"
        ? ["string", "concatenated string", "sliced string"].includes(node.type)
        : shape === "number"
          ? node.type === "number"
          : node.type === "hidden";
    if (shape === "boolean" && result.matches)
      gap("primitive-encoding-unproven", "oddball is not a decoded boolean");
    return result;
  }
  if (!payload(node)) return { matches: false, gaps: [] };
  if (shape === "opaque") {
    gap(
      "unresolved-container",
      "Map brand/storage/entries need engine and source binding; name is not proof",
    );
    return result;
  }
  if (shape.endsWith("[]")) {
    const elements = outgoing[index].filter(
      (edge) =>
        edge.type === "element" ||
        (edge.type === "property" &&
          /^(0|[1-9][0-9]*)$/.test(edge.label.value)),
    );
    // JSArray vs backing array vs ordinary indexed object is unresolved here.
    // Prototype encoding is a boundary, not a DTO contradiction or brand proof.
    // Other non-index DTO properties still contradict the supported layout;
    // a constructor named Array cannot override that contradiction.
    if (
      node.type !== "array" &&
      properties[index].size &&
      [...properties[index].keys()].some(
        (key) =>
          key !== "length" &&
          key !== "__proto__" &&
          !/^(0|[1-9][0-9]*)$/.test(key),
      )
    )
      return { matches: false, gaps: [] };
    gap(
      "array-encoding-unproven",
      "indexed layout, holes and backing storage need exact engine array profile",
    );
    for (const edge of elements) {
      const child = matchShape(facts, edge.toIndex, shape.slice(0, -2), seen);
      if (!child.matches) return { matches: false, gaps: [] };
      result.gaps.push(...child.gaps);
    }
    return result;
  }
  if (node.type !== "object") return { matches: false, gaps: [] };
  if (distinguishing[shape]?.some((name) => !properties[index].has(name)))
    return { matches: false, gaps: [] };
  const key = `${index}/${shape}`;
  if (seen.has(key)) return { matches: false, gaps: [] };
  const next = new Set(seen).add(key),
    fields = shapes[shape];
  // At least one non-numeric schema witness is necessary. Numeric-only range
  // and pagination may legitimately expose zero fields under Smi omission.
  const concrete = Object.entries(fields).filter(
    ([, type]) => !["number", "boolean"].includes(type),
  );
  if (
    concrete.length &&
    !concrete.some(([name]) => properties[index].has(name))
  )
    return { matches: false, gaps: [] };
  for (const [name, type] of Object.entries(fields)) {
    const edges = properties[index].get(name) ?? [];
    if (!edges.length) {
      gap(
        ["number", "boolean"].includes(type)
          ? "primitive-encoding-unproven"
          : "missing-required-property",
        `${shape}.${name}`,
      );
      gap(
        "partial-structure",
        `${shape}.${name} has no encoded property witness`,
      );
      continue;
    }
    if (edges.length !== 1) return { matches: false, gaps: [] };
    const child = matchShape(facts, edges[0].toIndex, type, next);
    if (!child.matches) return { matches: false, gaps: [] };
    result.gaps.push(...child.gaps);
  }
  return result;
}

// Resolve only explicit direct property/index witnesses for source allocations.
// Wildcards enumerate encoded row slots; they never traverse backing storage.
// Missing mapping is an obligation, while witnessed identity collapse is a
// contradiction even if numeric primitives or some other fields are omitted.
function matchDistinctWrappers(facts, index, paths = []) {
  const wrappers = [index],
    gaps = [];
  for (const path of paths) {
    let parents = [index];
    for (const part of path.split(".")) {
      const targets = [];
      for (const parent of parents) {
        const links =
          part === "*"
            ? facts.outgoing[parent].filter(
                (edge) =>
                  edge.type === "element" ||
                  (edge.type === "property" &&
                    /^(0|[1-9][0-9]*)$/.test(edge.label.value)),
              )
            : (facts.properties[parent].get(part) ?? []);
        if (part === "*" || links.length !== 1)
          gaps.push({
            code: "wrapper-mapping-unproven",
            index: parent,
            detail: `${path}: require exact direct wrapper mapping and array encoding; missing slots or backing edges do not establish source allocations`,
          });
        targets.push(...links.map((edge) => edge.toIndex));
      }
      parents = targets;
    }
    wrappers.push(...parents);
  }
  return { matches: new Set(wrappers).size === wrappers.length, gaps };
}

function collectMembers(facts, start) {
  const pending = [start],
    visited = new Set(),
    members = [],
    witnesses = [],
    boundaries = [];
  while (pending.length) {
    const index = pending.pop();
    if (visited.has(index)) continue;
    visited.add(index);
    const node = facts.nodes[index];
    if (payload(node)) members.push(identity(node));
    for (const edge of facts.outgoing[index]) {
      const target = facts.nodes[edge.toIndex];
      if (edge.type === "property" || edge.type === "element") {
        witnesses.push(witness(edge));
        // Preserve a raw prototype property witness without treating its target
        // or descendants as payload membership. Its semantics need D2 binding.
        if (edge.type === "property" && edge.label.value === "__proto__")
          boundaries.push({ ...witness(edge), type: edge.type });
        else if (payload(target)) pending.push(edge.toIndex);
        else if (
          ["closure", "code", "native", "hidden", "synthetic"].includes(
            target.type,
          )
        ) {
          boundaries.push({ ...witness(edge), type: edge.type });
          // Inspect closure edges as boundary evidence only; never traverse its
          // context or claim that captured payload belongs to this candidate.
          if (target.type === "closure")
            for (const link of facts.outgoing[edge.toIndex])
              boundaries.push({ ...witness(link), type: link.type });
        }
      } else boundaries.push({ ...witness(edge), type: edge.type });
    }
  }
  return {
    members: members.sort((a, b) => a.rawId - b.rawId),
    witnesses: witnesses.sort((a, b) => a.edgeIndex - b.edgeIndex),
    boundaries,
  };
}

/** Consume an immutable readHeapSnapshot graph and exact expected registry.
 * ok is mechanics only: candidates may be partial, mimics or preview/gesture
 * aliases. No completeness, identity continuity or lifecycle inference.
 */
export function recognizeAttendanceHeapStructures(graph, registry) {
  if (graph == null) return empty("missing", "missing-graph");
  if (registry == null) return empty("missing", "missing-registry");
  try {
    if (!record(registry)) return empty("error", "invalid-registry");
    if (registry.schema !== attendanceHeapSignatureRegistry.schema)
      return empty("unsupported", "unsupported-registry");
    if (!equal(registry, attendanceHeapSignatureRegistry))
      return empty("unsupported", "registry-drift");
    const facts = indexFacts(graph),
      result = empty("ok"),
      references = new Map();
    const addObligation = (
      signature,
      code,
      sourceRef,
      node,
      requiredEvidence,
    ) =>
      result.obligations.push({
        code,
        signature,
        ...(node ? { node: identity(node) } : {}),
        sourceRef,
        requiredEvidence,
      });
    addObligation(
      "registry",
      "coverage-unproven",
      "heap-classifier-collector-design.md#D1",
      undefined,
      "Exact build/location, engine semantics, source owner anchors and complete native/React/closure coverage are required; a structural scan is not exhaustive.",
    );
    for (const node of facts.nodes)
      for (const [signature, rule] of Object.entries(signatures)) {
        const props = facts.properties[node.index];
        let rowWitnesses = [];
        if (signature === "row-cells") {
          rowWitnesses = facts.incoming[node.index].filter(
            (edge) =>
              edge.type === "property" &&
              edge.label.value === "cells" &&
              facts.properties[edge.fromIndex].has("employee") &&
              matchShape(facts, edge.fromIndex, "row").matches,
          );
          if (
            !payload(node) ||
            (!rowWitnesses.length &&
              !facts.outgoing[node.index].some(
                (edge) =>
                  (edge.type === "element" ||
                    (edge.type === "property" &&
                      /^(0|[1-9][0-9]*)$/.test(edge.label.value))) &&
                  facts.nodes[edge.toIndex].type === "object",
              ))
          )
            continue;
        } else if (!rule.anchors.every((name) => props.has(name))) {
          if (rule.anchors.filter((name) => props.has(name)).length >= 2)
            result.diagnostics.push({
              code: "missing-signature-witness",
              signature,
              nodeIndex: node.index,
            });
          continue;
        }
        const allocations = matchDistinctWrappers(
          facts,
          node.index,
          rule.distinct,
        );
        if (!allocations.matches) {
          result.diagnostics.push({
            code: "distinct-wrapper-mismatch",
            signature,
            nodeIndex: node.index,
          });
          continue;
        }
        const match = matchShape(facts, node.index, rule.shape);
        if (!match.matches) {
          result.diagnostics.push({
            code: "target-structure-mismatch",
            signature,
            nodeIndex: node.index,
          });
          continue;
        }
        const closure = collectMembers(facts, node.index);
        closure.witnesses.push(...rowWitnesses.map(witness));
        closure.witnesses.sort((a, b) => a.edgeIndex - b.edgeIndex);
        const candidate = {
          signature,
          node: identity(node),
          nodeIndex: node.index,
          witnesses: closure.witnesses,
          members: closure.members,
          binding: "unproven",
        };
        result.candidates.push(candidate);
        addObligation(
          signature,
          "source-runtime-binding-unproven",
          rule.sourceRef,
          node,
          "Exact source/build/runtime location and owner-anchor witnesses, identity-domain continuity and lifecycle evidence; shape and equal metadata cannot prove binding or active role.",
        );
        if (["page-table", "gesture-capture", "row-cells"].includes(signature))
          addObligation(
            signature,
            "ambiguous-role",
            rule.sourceRef,
            node,
            "Distinguish page table vs month preview, ordinary read-view vs structuredClone gesture capture, and shared DTO/ordered/row arrays with source-location and lifecycle witnesses.",
          );
        const gaps = new Set();
        for (const gap of [...match.gaps, ...allocations.gaps]) {
          const key = JSON.stringify(gap);
          if (!gaps.has(key))
            addObligation(
              signature,
              gap.code,
              rule.sourceRef,
              facts.nodes[gap.index],
              gap.detail,
            );
          gaps.add(key);
        }
        for (const edge of closure.boundaries)
          addObligation(
            signature,
            "unresolved-boundary",
            rule.sourceRef,
            facts.nodes[edge.fromIndex],
            {
              description:
                "Validate raw edge/target encoding, Map/closure/native/weak/ephemeron semantics and source binding before closure or retention attribution.",
              edge,
            },
          );
        for (const rawWitness of closure.witnesses) {
          if (!payload(facts.nodes[rawWitness.toIndex])) continue;
          if (!references.has(rawWitness.toIndex))
            references.set(rawWitness.toIndex, new Map());
          const entries = references.get(rawWitness.toIndex);
          if (!entries.has(rawWitness.edgeIndex))
            entries.set(rawWitness.edgeIndex, {
              signature,
              nodeIndex: node.index,
              witness: rawWitness,
            });
        }
      }
    for (const [index, entries] of references)
      if (entries.size > 1)
        result.aliases.push({
          relation: "exact-identity-equality",
          node: identity(facts.nodes[index]),
          references: [...entries.values()].sort(
            (a, b) => a.witness.edgeIndex - b.witness.edgeIndex,
          ),
        });
    result.aliases.sort((a, b) => a.node.rawId - b.node.rawId);
    return result;
  } catch {
    return empty("error", "invalid-structural-input");
  }
}
