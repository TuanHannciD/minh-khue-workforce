import assert from "node:assert/strict";
import test from "node:test";
import { readHeapSnapshot } from "../../scripts/product/heap-snapshot-reader.mjs";
import {
  attendanceHeapSignatureRegistry as registry,
  recognizeAttendanceHeapStructures as recognize,
} from "../../scripts/product/heap-product-signatures.mjs";

/** File map: raw/graphOf encode tiny independent facts through the real reader;
 * pageRecords is the delivery/DTO oracle; detachedRecords is the grid oracle;
 * named tests cover witnesses, registry drift, identities, partials/boundaries
 * and malformed inputs. They share only raw encoding, never matcher predicates.
 * Fix R1: tableRecords/prototype fixtures cover encoding vs DTO contradiction;
 * allocation fixtures cover direct wrappers vs shared DTO/backing identities.
 * Raw fixture oracle: property names follow PageDelivery, generated DTOs,
 * toPageTable and AttendanceGrid, independently of the recognizer's rules.
 * raw encodes literal nodes/edges only; it never labels product categories.
 */
function raw(records, reordered = false) {
  const strings = [""];
  const string = (value) => {
    if (!strings.includes(value)) strings.push(value);
    return strings.indexOf(value);
  };
  const nodeTypes = [
    "object",
    "array",
    "string",
    "number",
    "hidden",
    "code",
    "closure",
  ];
  const edgeTypes = [
    "property",
    "element",
    "internal",
    "hidden",
    "weak",
    "context",
    "shortcut",
  ];
  const nodeFields = reordered
    ? ["edge_count", "id", "name", "self_size", "type"]
    : ["type", "name", "id", "self_size", "edge_count"];
  const edgeFields = reordered
    ? ["to_node", "type", "name_or_index"]
    : ["type", "name_or_index", "to_node"];
  const nodes = [],
    edges = [];
  for (const [i, [type, name, links = []]] of records.entries()) {
    const node = {
      type: nodeTypes.indexOf(type),
      name: string(name),
      id: 101 + i * 2,
      self_size: 16,
      edge_count: links.length,
    };
    nodes.push(...nodeFields.map((key) => node[key]));
    for (const [kind, label, target] of links) {
      const edge = {
        type: edgeTypes.indexOf(kind),
        name_or_index: ["element", "hidden"].includes(kind)
          ? label
          : string(label),
        to_node: target * 5,
      };
      edges.push(...edgeFields.map((key) => edge[key]));
    }
  }
  return JSON.stringify({
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: nodeFields.map((field) =>
          field === "type" ? nodeTypes : field === "name" ? "string" : "number",
        ),
        edge_fields: edgeFields,
        edge_types: edgeFields.map((field) =>
          field === "type"
            ? edgeTypes
            : field === "to_node"
              ? "node"
              : "string_or_number",
        ),
      },
      node_count: records.length,
      edge_count: edges.length / 3,
    },
    nodes,
    edges,
    strings,
  });
}
const p = (name, target) => ["property", name, target];
const e = (index, target) => ["element", index, target];
// IDs are hand-derived: record 0=101, 4=109, 9=119, 12=125.
function pageRecords() {
  return [
    [
      "object",
      "ordinary",
      [
        p("requested", 1),
        p("requestLifetime", 2),
        p("requestId", 3),
        p("data", 4),
      ],
    ],
    [
      "object",
      "ordinary",
      [p("month", 5), p("q", 6), p("page", 3), p("pageSize", 3)],
    ],
    ["object", "ordinary", [p("userId", 6), p("epoch", 3), p("generation", 3)]],
    ["number", "1"],
    [
      "object",
      "ordinary",
      [
        p("month", 5),
        p("fetchedAt", 6),
        p("employees", 7),
        p("cells", 8),
        p("employeeTotals", 13),
        p("monthTotals", 14),
        p("pagination", 18),
      ],
    ],
    ["string", "2026-10"],
    ["string", "same-metadata"],
    ["array", "", [e(0, 9)]],
    ["array", "", [e(0, 10)]],
    [
      "object",
      "ordinary",
      [
        p("id", 6),
        p("name", 6),
        p("revision", 6),
        p("startDate", 5),
        p("endDate", 5),
      ],
    ],
    [
      "object",
      "ordinary",
      [
        p("employeeId", 6),
        p("date", 5),
        p("kind", 6),
        p("revision", 6),
        p("state", 6),
        p("reminder", 11),
        p("value", 12),
      ],
    ],
    ["hidden", "system / Oddball"],
    ["object", "ordinary", [p("type", 6), p("value", 3)]],
    ["object", "ordinary", [p("work", 15), p("overtime", 15)]],
    ["object", "ordinary", [p("work", 16), p("overtime", 16)]],
    ["array", "", [e(0, 17)]],
    ["object", "ordinary", [p("byDate", 19), p("grandTotal", 3)]],
    ["object", "ordinary", [p("employeeId", 6), p("value", 3)]],
    [
      "object",
      "ordinary",
      [
        p("page", 3),
        p("pageSize", 3),
        p("requestedPage", 3),
        p("from", 3),
        p("to", 3),
        p("totalResults", 3),
        p("monthEmployeeCount", 3),
        p("totalPages", 3),
      ],
    ],
    ["array", "", [e(0, 20)]],
    ["object", "ordinary", [p("date", 5), p("value", 3)]],
  ];
}
function graphOf(records = pageRecords(), reordered = false) {
  const result = readHeapSnapshot(raw(records, reordered), {
    identityDomain: "tiny-session",
  });
  assert.equal(result.status, "ok");
  return result.graph;
}
const find = (result, signature, index) =>
  result.candidates.find(
    (c) => c.signature === signature && c.nodeIndex === index,
  );
const hasObligation = (result, code, signature) =>
  result.obligations.some(
    (o) => o.code === code && (!signature || o.signature === signature),
  );

test("delivery uses requestLifetime and nested DTO witnesses, including array members and cell.value", () => {
  const graph = graphOf();
  const result = recognize(graph, registry);
  assert.equal(result.status, "ok");
  assert.equal(result.scope, "offline-structural-candidates-only");
  const delivery = find(result, "delivery", 0);
  assert.equal(delivery?.binding, "unproven");
  assert.deepEqual(delivery.node, { domain: "tiny-session", rawId: 101 });
  assert.ok(
    delivery.witnesses.some(
      (w) =>
        w.edgeIndex === 1 &&
        w.fromIndex === 0 &&
        w.toIndex === 2 &&
        w.property === "requestLifetime",
    ),
  );
  for (const id of [
    109, 115, 117, 119, 121, 125, 127, 129, 133, 135, 137, 139, 141,
  ])
    assert.ok(
      delivery.members.some((member) => member.rawId === id),
      `nested member ${id}`,
    );
  assert.ok(
    delivery.witnesses.some(
      (w) => w.fromIndex === 8 && w.toIndex === 10 && w.property === 0,
    ),
  );
  assert.ok(find(result, "attendance-page", 4));
  assert.ok(
    hasObligation(result, "source-runtime-binding-unproven", "delivery"),
  );
  assert.ok(Object.isFrozen(graph));
  assert.deepEqual(graph.nodeAt(0).identity, {
    domain: "tiny-session",
    rawId: 101,
  });
});

test("reader metadata order does not change identities, witnesses or candidates", () => {
  assert.deepEqual(
    find(recognize(graphOf(pageRecords(), true), registry), "delivery", 0).node,
    { domain: "tiny-session", rawId: 101 },
  );
  assert.deepEqual(
    recognize(graphOf(pageRecords(), true), registry),
    recognize(graphOf(), registry),
  );
});

test("expected registry rejects caller-rewritten fingerprints and signature rules", () => {
  for (const field of ["sourcePins", "supportingPins", "buildPins"]) {
    const drifted = structuredClone(registry);
    drifted[field][Object.keys(drifted[field])[0]] = "0".repeat(64);
    const result = recognize(graphOf(), drifted);
    assert.equal(result.status, "unsupported");
    assert.equal(result.candidates.length, 0);
    assert.equal(result.diagnostics[0].code, "registry-drift");
  }
  const drifted = structuredClone(registry);
  drifted.signatures.delivery = { sourceRef: "caller" };
  assert.equal(recognize(graphOf(), drifted).status, "unsupported");
});

test("page table aliases share identity; equal clones and replacement requests stay distinct", () => {
  const records = pageRecords();
  records.push(
    [
      "object",
      "ordinary",
      [
        p("month", 5),
        p("employees", 7),
        p("cells", 8),
        p("employeeTotals", 13),
        p("monthTotals", 14),
        p("range", 22),
      ],
    ],
    [
      "object",
      "ordinary",
      [
        p("from", 3),
        p("to", 3),
        p("totalResults", 3),
        p("monthEmployeeCount", 3),
      ],
    ],
    ["array", "", [e(0, 9)]],
    [
      "object",
      "ordinary",
      [
        p("requested", 1),
        p("requestLifetime", 2),
        p("requestId", 3),
        p("data", 25),
      ],
    ],
    [
      "object",
      "ordinary",
      [
        p("month", 5),
        p("fetchedAt", 6),
        p("employees", 23),
        p("cells", 8),
        p("employeeTotals", 13),
        p("monthTotals", 14),
        p("pagination", 18),
      ],
    ],
  );
  const result = recognize(graphOf(records), registry);
  assert.ok(find(result, "page-table", 21));
  assert.ok(hasObligation(result, "ambiguous-role", "page-table"));
  assert.deepEqual(
    result.candidates
      .filter((c) => c.signature === "delivery")
      .map((c) => c.node.rawId),
    [101, 149],
  );
  const aliases = result.aliases.find((a) => a.node.rawId === 115);
  assert.equal(aliases.relation, "exact-identity-equality");
  assert.ok(
    aliases.references.some(
      (r) => r.witness.fromIndex === 4 && r.witness.property === "employees",
    ),
  );
  assert.ok(
    aliases.references.some(
      (r) => r.witness.fromIndex === 21 && r.witness.property === "employees",
    ),
  );
  assert.ok(
    !aliases.references.some(
      (r) => r.witness.fromIndex === 25 && r.witness.property === "employees",
    ),
  );
  assert.notDeepEqual(
    find(result, "attendance-page", 4).node,
    find(result, "attendance-page", 25).node,
  );
});

function detachedRecords() {
  // No PageDelivery or AttendancePage wrapper. DTO descendants remain in rows.
  return [
    [
      "object",
      "",
      [
        p("days", 1),
        p("cells", 2),
        p("totals", 3),
        p("ordered", 4),
        p("dayTotals", 5),
        p("rows", 6),
      ],
    ],
    ["array", "", [e(0, 7)]],
    ["object", "Map", [["internal", "table", 14]]],
    ["object", "", [p("byDate", 8), p("grandTotal", 15)]],
    ["array", "", [e(0, 11)]],
    ["object", "Map"],
    ["array", "", [e(0, 9)]],
    ["object", "", [p("date", 16), p("day", 15), p("weekday", 16)]],
    ["array", ""],
    ["object", "", [p("employee", 10), p("total", 15), p("cells", 12)]],
    [
      "object",
      "",
      [
        p("id", 16),
        p("name", 16),
        p("revision", 16),
        p("startDate", 16),
        p("endDate", 16),
      ],
    ],
    [
      "object",
      "",
      [
        p("employeeId", 16),
        p("date", 16),
        p("kind", 16),
        p("revision", 16),
        p("state", 16),
        p("value", 13),
      ],
    ],
    ["array", "", [e(0, 11)]],
    ["object", "", [p("type", 16)]],
    ["array", "", [["weak", "ephemeron-key", 11]]],
    ["number", "1"],
    ["string", "same"],
  ];
}
test("detached projection, grid row and row.cells survive without delivery wrappers", () => {
  const result = recognize(graphOf(detachedRecords()), registry);
  for (const [signature, index] of [
    ["grid-projection", 0],
    ["grid-row", 9],
    ["row-cells", 12],
  ]) {
    const candidate = find(result, signature, index);
    assert.ok(candidate, signature);
    assert.equal(candidate.binding, "unproven");
    assert.ok(candidate.members.some((m) => m.rawId === 127));
    assert.ok(
      hasObligation(result, "source-runtime-binding-unproven", signature),
    );
  }
  assert.ok(!result.candidates.some((c) => c.signature === "delivery"));
});

test("missing primitive fields retain partial candidates instead of reporting no data", () => {
  const records = pageRecords();
  records[0][2] = records[0][2].filter((link) => link[1] !== "requestId");
  records[2][2] = [p("userId", 6)];
  records[18][2] = [];
  records[10][2] = records[10][2].filter((link) => link[1] !== "reminder");
  const result = recognize(graphOf(records), registry);
  assert.ok(find(result, "delivery", 0));
  assert.ok(find(result, "attendance-page", 4));
  assert.ok(hasObligation(result, "primitive-encoding-unproven", "delivery"));
  assert.ok(hasObligation(result, "partial-structure", "delivery"));
});

test("wrong target conjunctions, lifetime shorthand and scalar-only names cannot impersonate a delivery", () => {
  for (const mutate of [
    (r) => {
      r[0][2][1][1] = "lifetime";
    },
    (r) => {
      r[0][2][3][2] = 6;
    },
    (r) => {
      r[4][2].find((link) => link[1] === "cells")[2] = 6;
    },
  ]) {
    const records = pageRecords();
    mutate(records);
    const result = recognize(graphOf(records), registry);
    assert.ok(!find(result, "delivery", 0));
    assert.ok(result.diagnostics.length > 0);
  }
  const result = recognize(
    graphOf([
      ["object", "PageDelivery", [p("requestId", 1), p("employeeId", 2)]],
      ["number", "1"],
      ["string", "employee"],
    ]),
    registry,
  );
  assert.equal(result.candidates.length, 0);
});

test("mimic DTOs remain unbound and code or AllocationSite type has no DTO binding", () => {
  for (const type of ["object", "code", "hidden"]) {
    const records = pageRecords();
    records[0][0] = type;
    records[0][1] = "AllocationSite";
    const result = recognize(graphOf(records), registry);
    if (type === "object")
      assert.equal(find(result, "delivery", 0)?.binding, "unproven");
    else assert.ok(!find(result, "delivery", 0));
    assert.ok(result.candidates.every((c) => c.binding === "unproven"));
  }
});

test("boundaries retain raw internal, weak, hidden, shortcut and closure evidence without claiming strength", () => {
  const records = pageRecords();
  records[12][2].push(
    ["internal", "table", 21],
    ["weak", "ephemeron-value", 22],
    ["hidden", 0, 22],
    ["shortcut", "root", 22],
    p("callback", 23),
  );
  records.push(
    ["array", "", [e(0, 22)]],
    ["object", "unresolved"],
    ["closure", "callback", [["context", "captured", 22]]],
  );
  const graph = graphOf(records);
  const result = recognize(graph, registry);
  const delivery = find(result, "delivery", 0);
  assert.ok(!delivery.members.some((m) => m.rawId === 145));
  const boundaries = result.obligations.filter(
    (o) => o.code === "unresolved-boundary" && o.signature === "delivery",
  );
  for (const type of ["internal", "weak", "hidden", "shortcut", "context"]) {
    const edge = boundaries.find((o) => o.requiredEvidence.edge.type === type)
      ?.requiredEvidence.edge;
    assert.ok(edge, type);
    assert.equal(graph.edgeAt(edge.edgeIndex).toIndex, edge.toIndex);
  }
  assert.ok(!JSON.stringify(result).includes('"strength"'));
  for (const key of ["activeDataIds", "provenOwner", "productPASS"])
    assert.ok(!Object.hasOwn(result, key));
});

test("same read-view shape exposes gesture ambiguity; it never proves active capture", () => {
  const result = recognize(graphOf(), registry);
  assert.ok(find(result, "gesture-capture", 4));
  assert.ok(hasObligation(result, "ambiguous-role", "gesture-capture"));
});

test("empty, sparse and partial shapes produce diagnostics without a complete-coverage claim", () => {
  assert.equal(recognize(graphOf([]), registry).status, "ok");
  assert.equal(
    recognize(graphOf([["object", "empty"]]), registry).candidates.length,
    0,
  );
  const records = detachedRecords();
  records[12][2] = [e(2, 11)];
  const result = recognize(graphOf(records), registry);
  assert.ok(find(result, "row-cells", 12));
  assert.ok(hasObligation(result, "array-encoding-unproven"));
  assert.ok(hasObligation(result, "coverage-unproven"));
  const partial = pageRecords();
  partial[4][2] = partial[4][2].filter((link) => link[1] !== "pagination");
  const output = recognize(graphOf(partial), registry);
  assert.ok(find(output, "attendance-page", 4));
  assert.ok(hasObligation(output, "partial-structure", "attendance-page"));
});

test("missing, unsupported and malformed inputs fail closed and expose no candidates", () => {
  for (const [graph, pins, expected] of [
    [undefined, registry, "missing"],
    [graphOf(), undefined, "missing"],
    [{ nodes: [], edges: [] }, registry, "error"],
    [graphOf(), { schema: "future" }, "unsupported"],
  ]) {
    const result = recognize(graph, pins);
    assert.equal(result.status, expected);
    assert.deepEqual(result.candidates, []);
  }
});

test("distinct source wrapper allocations cannot be collapsed into one shape-mimicking identity", () => {
  const records = pageRecords();
  // The union of criteria/lifetime fields can mimic both types, but source
  // queryFn allocates two separate wrappers before returning the delivery.
  records[1][2].push(p("userId", 6), p("epoch", 3), p("generation", 3));
  records[0][2][1][2] = 1;
  const result = recognize(graphOf(records), registry);
  assert.ok(!find(result, "delivery", 0));
  assert.ok(
    result.diagnostics.some((d) => d.code === "distinct-wrapper-mismatch"),
  );
});

test("empty row.cells has an incoming row witness; undefined-only slots stay ambiguous", () => {
  for (const links of [[], [e(2, 17)]]) {
    const records = detachedRecords();
    records.push(["hidden", "system / Oddball"]);
    records[12][2] = links;
    const result = recognize(graphOf(records), registry);
    const cells = find(result, "row-cells", 12);
    assert.ok(cells);
    assert.ok(
      cells.witnesses.some(
        (w) => w.fromIndex === 9 && w.toIndex === 12 && w.property === "cells",
      ),
    );
    assert.ok(hasObligation(result, "ambiguous-role", "row-cells"));
  }
});

test("replacement employees with equal scalar metadata remain different member identities", () => {
  const records = pageRecords();
  records.push(["object", "ordinary", [...records[9][2]]]);
  records[7][2].push(e(1, 21));
  const result = recognize(graphOf(records), registry);
  const delivery = find(result, "delivery", 0);
  assert.ok(delivery.members.some((m) => m.rawId === 119));
  assert.ok(delivery.members.some((m) => m.rawId === 143));
  assert.ok(!result.aliases.some((a) => a.node.rawId === 143));
});

test("every owner source pin drift fails independently, even with a matching caller graph", () => {
  assert.equal(Object.keys(registry.sourcePins).length, 22);
  for (const path of Object.keys(registry.sourcePins)) {
    const changed = structuredClone(registry);
    changed.sourcePins[path] = "f".repeat(64);
    assert.equal(recognize(graphOf(), changed).status, "unsupported", path);
  }
});

test("property-indexed arrays and JSArray backing boundaries preserve members or unresolved evidence", () => {
  const indexed = pageRecords();
  indexed[8][0] = "object";
  indexed[8][2] = [p("0", 10)];
  assert.ok(
    find(recognize(graphOf(indexed), registry), "delivery", 0).members.some(
      (m) => m.rawId === 125,
    ),
  );
  const backed = pageRecords();
  backed[8][0] = "object";
  backed[8][2] = [["internal", "elements", 21]];
  backed.push(["array", "", [e(0, 10)]]);
  const result = recognize(graphOf(backed), registry);
  assert.ok(find(result, "attendance-page", 4));
  assert.ok(
    result.obligations.some(
      (o) =>
        o.code === "unresolved-boundary" &&
        o.requiredEvidence.edge.fromIndex === 8 &&
        o.requiredEvidence.edge.property === "elements",
    ),
  );
});

test("malformed sparse reader views are rejected without partial candidates", () => {
  const graph = graphOf();
  for (const overrides of [
    { nodeCount: 99 },
    { edgeCount: 0 },
    { nodeAt: () => undefined },
    { outgoing: () => [] },
  ]) {
    const result = recognize(
      Object.freeze({ ...graph, ...overrides }),
      registry,
    );
    assert.equal(result.status, "error");
    assert.deepEqual(result.candidates, []);
  }
});

test("recognition preserves every reader fact and the expected registry cannot be rewritten", () => {
  const graph = graphOf();
  const before = JSON.stringify({
    nodes: [...graph.nodes()],
    edges: [...graph.edges()],
    metadata: graph.metadata,
    provenance: graph.provenance,
  });
  recognize(graph, structuredClone(registry));
  assert.equal(
    JSON.stringify({
      nodes: [...graph.nodes()],
      edges: [...graph.edges()],
      metadata: graph.metadata,
      provenance: graph.provenance,
    }),
    before,
  );
  assert.throws(() => {
    registry.shapes.delivery.data = "caller-category";
  }, TypeError);
  assert.throws(() => {
    registry.sourcePins["apps/web/src/features/attendance/model/page-view.ts"] =
      "caller-pin";
  }, TypeError);
});

test("employee arrays cannot become row.cells from a lone shared revision property", () => {
  const records = detachedRecords();
  records[12][2] = [e(0, 10)];
  const result = recognize(graphOf(records), registry);
  assert.ok(!find(result, "grid-row", 9));
  assert.ok(!find(result, "row-cells", 12));
});

function tableRecords() {
  const records = pageRecords();
  records.push(
    [
      "object",
      "",
      [
        p("month", 5),
        p("employees", 7),
        p("cells", 8),
        p("employeeTotals", 13),
        p("monthTotals", 14),
        p("range", 22),
      ],
    ],
    [
      "object",
      "",
      [
        p("from", 3),
        p("to", 3),
        p("totalResults", 3),
        p("monthEmployeeCount", 3),
      ],
    ],
  );
  return records;
}

test("prototype properties preserve indexed array candidates and raw payload witnesses", () => {
  for (const type of ["object", "array"]) {
    for (const prototype of [
      [
        "object",
        "",
        [p("id", 6), p("name", 6), p("startDate", 5), p("extra", 24)],
      ],
      ["string", "not-an-employee"],
    ]) {
      const records = tableRecords();
      records[7] = [type, "Array", [p("0", 9)]];
      assert.ok(find(recognize(graphOf(records), registry), "page-table", 21));
      records[7][2].push(p("__proto__", 23));
      records.push(prototype, ["object", "prototype-descendant"]);
      const graph = graphOf(records);
      const result = recognize(graph, registry);
      for (const [signature, index] of [
        ["delivery", 0],
        ["attendance-page", 4],
        ["page-table", 21],
      ]) {
        const candidate = find(result, signature, index);
        assert.ok(candidate, `${type}/${prototype[0]}/${signature}`);
        assert.equal(candidate.binding, "unproven");
        assert.ok(candidate.members.some((m) => m.rawId === 119));
        assert.ok(!candidate.members.some((m) => [147, 149].includes(m.rawId)));
        const slot = candidate.witnesses.find(
          (w) => w.fromIndex === 7 && w.property === "0",
        );
        assert.equal(slot?.toIndex, 9);
        assert.equal(graph.edgeAt(slot.edgeIndex).toIndex, 9);
        assert.ok(hasObligation(result, "array-encoding-unproven", signature));
        assert.ok(
          hasObligation(result, "source-runtime-binding-unproven", signature),
        );
        const boundary = result.obligations.find(
          (o) =>
            o.signature === signature &&
            o.code === "unresolved-boundary" &&
            o.requiredEvidence.edge.fromIndex === 7 &&
            o.requiredEvidence.edge.property === "__proto__",
        )?.requiredEvidence.edge;
        assert.equal(boundary?.toIndex, 23);
        assert.equal(boundary.type, "property");
        assert.equal(graph.edgeAt(boundary.edgeIndex).toIndex, 23);
      }
    }
  }
});

test("prototype and backing storage boundaries never supply proven array members", () => {
  for (const type of ["object", "array"]) {
    const records = tableRecords();
    records[7] = [
      type,
      "Array",
      [
        p("__proto__", 23),
        ["internal", "elements", 24],
        ["weak", "storage", 25],
      ],
    ];
    records.push(
      ["object", "", [p("0", 9)]],
      ["array", "", [e(0, 9)]],
      ["array", "", [e(0, 9)]],
    );
    const result = recognize(graphOf(records), registry);
    for (const [signature, index] of [
      ["delivery", 0],
      ["attendance-page", 4],
      ["page-table", 21],
    ]) {
      const candidate = find(result, signature, index);
      assert.ok(candidate, `${type}/${signature}`);
      assert.ok(
        !candidate.members.some((m) => [119, 147, 149, 151].includes(m.rawId)),
      );
      assert.ok(
        !candidate.witnesses.some(
          (w) => w.fromIndex === 24 || w.fromIndex === 25,
        ),
      );
      for (const [property, toIndex, edgeType] of [
        ["__proto__", 23, "property"],
        ["elements", 24, "internal"],
        ["storage", 25, "weak"],
      ]) {
        const edge = result.obligations.find(
          (o) =>
            o.signature === signature &&
            o.code === "unresolved-boundary" &&
            o.requiredEvidence.edge.fromIndex === 7 &&
            o.requiredEvidence.edge.property === property,
        )?.requiredEvidence.edge;
        assert.equal(edge?.toIndex, toIndex);
        assert.equal(edge.type, edgeType);
      }
      assert.ok(hasObligation(result, "array-encoding-unproven", signature));
      assert.ok(
        hasObligation(result, "source-runtime-binding-unproven", signature),
      );
    }
  }
});

test("row.cells prototype ambiguity keeps direct cells but rejects contradictory DTO targets", () => {
  const records = detachedRecords();
  records[12] = ["object", "Array", [p("0", 11), p("__proto__", 17)]];
  records.push([
    "object",
    "",
    [p("id", 16), p("name", 16), p("startDate", 16)],
  ]);
  const result = recognize(graphOf(records), registry);
  for (const [signature, index] of [
    ["grid-projection", 0],
    ["grid-row", 9],
    ["row-cells", 12],
  ]) {
    const candidate = find(result, signature, index);
    assert.ok(candidate, signature);
    assert.ok(candidate.members.some((m) => m.rawId === 123));
    assert.ok(!candidate.members.some((m) => m.rawId === 135));
    assert.ok(
      candidate.witnesses.some(
        (w) => w.fromIndex === 12 && w.toIndex === 11 && w.property === "0",
      ),
    );
  }
  records[12][2][0][2] = 10; // EmployeeDto is not a CellSnapshotDto.
  assert.ok(!find(recognize(graphOf(records), registry), "grid-row", 9));
  assert.ok(!find(recognize(graphOf(records), registry), "row-cells", 12));
  const employee = pageRecords();
  employee[7] = [
    "object",
    "Array",
    [p("id", 6), p("name", 6), p("startDate", 5), p("__proto__", 9)],
  ];
  assert.ok(
    !find(recognize(graphOf(employee), registry), "attendance-page", 4),
  );
});

test("table range allocation cannot alias its table even with every numeric range witness", () => {
  const records = tableRecords();
  assert.ok(find(recognize(graphOf(records), registry), "page-table", 21));
  records[21][2].find((link) => link[1] === "range")[2] = 21;
  records[21][2].push(...records[22][2]);
  const result = recognize(graphOf(records), registry);
  assert.equal(result.status, "ok");
  assert.ok(!find(result, "page-table", 21));
  assert.ok(
    result.diagnostics.some(
      (d) =>
        d.signature === "page-table" &&
        d.nodeIndex === 21 &&
        d.code === "distinct-wrapper-mismatch",
    ),
  );
});

test("projection direct allocations reject pairwise collapse and self aliases", () => {
  // Source allocates all six fields independently of the returned wrapper.
  // Empty indexed arrays avoid unrelated DTO-conjunction mismatches.
  const fields = ["days", "cells", "totals", "ordered", "dayTotals", "rows"];
  for (const [left, right] of [
    ...fields.flatMap((name, i) =>
      fields.slice(i + 1).map((other) => [name, other]),
    ),
    ...fields.map((name) => [name, null]),
  ]) {
    const records = detachedRecords();
    for (const index of [1, 4, 6]) records[index][2] = [];
    assert.ok(
      find(recognize(graphOf(records), registry), "grid-projection", 0),
    );
    const target =
      right === null ? 0 : records[0][2].find((link) => link[1] === right)[2];
    records[0][2].find((link) => link[1] === left)[2] = target;
    const result = recognize(graphOf(records), registry);
    assert.equal(result.status, "ok", `${left}/${right}`);
    assert.ok(!find(result, "grid-projection", 0), `${left}/${right}`);
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.signature === "grid-projection" &&
          d.nodeIndex === 0 &&
          d.code === "distinct-wrapper-mismatch",
      ),
      `${left}/${right}`,
    );
  }
});

test("nested row allocation rejects a row.cells self alias inside a projection", () => {
  const records = detachedRecords();
  records[9][2].find((link) => link[1] === "cells")[2] = 9;
  const result = recognize(graphOf(records), registry);
  assert.ok(!find(result, "grid-row", 9));
  assert.ok(!find(result, "grid-projection", 0));
  for (const signature of ["grid-row", "grid-projection"])
    assert.ok(
      result.diagnostics.some(
        (d) =>
          d.signature === signature && d.code === "distinct-wrapper-mismatch",
      ),
      signature,
    );
});

test("distinct direct wrappers allow shared DTOs and backing storage with explicit encoding gaps", () => {
  const records = detachedRecords();
  for (const index of [1, 4, 6, 12]) {
    records[index] = ["object", "Array", [["internal", "elements", 17]]];
  }
  records.push(["array", "", [e(0, 11)]]);
  const result = recognize(graphOf(records), registry);
  assert.equal(result.status, "ok");
  for (const [signature, index] of [
    ["grid-projection", 0],
    ["grid-row", 9],
    ["row-cells", 12],
  ]) {
    assert.ok(find(result, signature, index), signature);
    assert.ok(hasObligation(result, "array-encoding-unproven", signature));
    assert.ok(hasObligation(result, "unresolved-boundary", signature));
    assert.ok(
      hasObligation(result, "source-runtime-binding-unproven", signature),
    );
  }
  // In the direct layout ordered and row.cells contain the SAME DTO, not
  // separately allocated DTO copies. Their array wrappers remain different.
  const direct = recognize(graphOf(detachedRecords()), registry);
  assert.ok(find(direct, "grid-projection", 0));
  assert.ok(
    direct.aliases.some(
      (a) =>
        a.node.rawId === 123 &&
        a.references.some((r) => r.witness.fromIndex === 4) &&
        a.references.some((r) => r.witness.fromIndex === 12),
    ),
  );
  const partial = tableRecords();
  partial[22][2] = [];
  const partialResult = recognize(graphOf(partial), registry);
  assert.ok(find(partialResult, "page-table", 21));
  assert.ok(
    hasObligation(partialResult, "primitive-encoding-unproven", "page-table"),
  );
});

test("partial projection wrapper mapping stays explicit instead of assuming missing allocations", () => {
  const records = detachedRecords();
  records[0][2] = records[0][2].filter((link) => link[1] !== "cells");
  const result = recognize(graphOf(records), registry);
  assert.equal(result.status, "ok");
  assert.ok(find(result, "grid-projection", 0));
  assert.ok(
    hasObligation(result, "wrapper-mapping-unproven", "grid-projection"),
  );
  assert.ok(
    hasObligation(result, "missing-required-property", "grid-projection"),
  );
  assert.ok(
    hasObligation(result, "source-runtime-binding-unproven", "grid-projection"),
  );
});
