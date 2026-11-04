import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

// File map: fixture supplies raw flat records; graphOf checks graph-only scope;
// literal graph/edge tests precede cases (schema/reference/identity negatives)
// and public-boundary tests. Kept together as one offline encoding contract.
// Hand-authored flat records; expected labels/indices below are literal facts,
// independent of reader offsets. Synthetic only: no runtime capability proof.
const moduleUrl = new URL(
  "../../scripts/product/heap-snapshot-reader.mjs",
  import.meta.url,
);
const reader = existsSync(moduleUrl) ? await import(moduleUrl) : {};
function read(raw, options = { identityDomain: "fixture/session" }) {
  assert.equal(
    typeof reader.readHeapSnapshot,
    "function",
    "offline reader feature missing",
  );
  return reader.readHeapSnapshot(raw, options);
}
function fixture() {
  return {
    snapshot: {
      meta: {
        node_fields: [
          "type",
          "name",
          "id",
          "self_size",
          "edge_count",
          "detachedness",
        ],
        node_types: [
          ["synthetic", "object", "native"],
          "string",
          "number",
          "number",
          "number",
          "number",
        ],
        edge_fields: ["type", "name_or_index", "to_node"],
        edge_types: [
          [
            "context",
            "element",
            "property",
            "internal",
            "hidden",
            "shortcut",
            "weak",
          ],
          "string_or_number",
          "node",
        ],
      },
      node_count: 3,
      edge_count: 8,
    },
    nodes: [0, 0, 1, 0, 7, 0, 1, 1, 41, 24, 1, 0, 2, 1, 73, 8, 0, 2],
    edges: [
      2, 2, 6, 1, 900, 12, 6, 3, 6, 4, 901, 12, 3, 4, 6, 5, 5, 12, 0, 6, 6, 2,
      7, 12,
    ],
    strings: [
      "(root)",
      "SameName",
      "42",
      "weak-slot",
      "internal-slot",
      "shortcut-slot",
      "context-slot",
      "child",
    ],
  };
}
function graphOf(value = fixture(), options) {
  const result = read(JSON.stringify(value), options);
  assert.equal(result.status, "ok", JSON.stringify(result.diagnostics));
  assert.equal(result.scope, "offline-raw-graph-only");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(
    "result" in result,
    false,
    "reader must not emit a product verdict",
  );
  return result.graph;
}

test("preserves exact node facts, separate identities and raw provenance", () => {
  const graph = graphOf();
  assert.equal(graph.nodeCount, 3);
  assert.equal(graph.edgeCount, 8);
  assert.deepEqual(graph.nodeAt(1), {
    index: 1,
    offset: 6,
    rawId: 41,
    identity: { domain: "fixture/session", rawId: 41 },
    type: "object",
    name: "SameName",
    selfSize: 24,
    edgeCount: 1,
    rawFields: {
      type: 1,
      name: 1,
      id: 41,
      self_size: 24,
      edge_count: 1,
      detachedness: 0,
    },
  });
  assert.equal(graph.nodeAt(2).rawFields.detachedness, 2);
  assert.deepEqual(
    [...graph.nodes()].map((node) => [
      node.index,
      node.offset,
      node.rawId,
      node.type,
      node.selfSize,
    ]),
    [
      [0, 0, 1, "synthetic", 0],
      [1, 6, 41, "object", 24],
      [2, 12, 73, "native", 8],
    ],
  );
  assert.equal("category" in graph.nodeAt(1), false);
  assert.equal("roots" in graph, false);
  assert.equal("activeDataIds" in graph, false);
});

test("decodes all supported edge labels without dropping weak or shortcut facts", () => {
  const graph = graphOf();
  assert.deepEqual(
    [...graph.edges()].map((edge) => [
      edge.index,
      edge.offset,
      edge.fromIndex,
      edge.toIndex,
      edge.type,
      edge.label,
      edge.weak,
    ]),
    [
      [0, 0, 0, 1, "property", { kind: "string", value: "42" }, false],
      [1, 3, 0, 2, "element", { kind: "index", value: 900 }, false],
      [2, 6, 0, 1, "weak", { kind: "string", value: "weak-slot" }, true],
      [3, 9, 0, 2, "hidden", { kind: "index", value: 901 }, false],
      [
        4,
        12,
        0,
        1,
        "internal",
        { kind: "string", value: "internal-slot" },
        false,
      ],
      [
        5,
        15,
        0,
        2,
        "shortcut",
        { kind: "string", value: "shortcut-slot" },
        false,
      ],
      [
        6,
        18,
        0,
        1,
        "context",
        { kind: "string", value: "context-slot" },
        false,
      ],
      [7, 21, 1, 2, "property", { kind: "string", value: "child" }, false],
    ],
  );
  assert.deepEqual(graph.edgeAt(7), {
    index: 7,
    offset: 21,
    fromIndex: 1,
    toIndex: 2,
    toNodeOffset: 12,
    type: "property",
    nameOrIndex: 7,
    label: { kind: "string", value: "child" },
    weak: false,
    rawFields: { type: 2, name_or_index: 7, to_node: 12 },
  });
  assert.deepEqual(
    [...graph.outgoing(0)].map((edge) => edge.index),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    [...graph.outgoing(1)].map((edge) => edge.index),
    [7],
  );
  assert.deepEqual([...graph.outgoing(2)], []);
  assert.equal(
    "strength" in graph.edgeAt(2),
    false,
    "non-weak is not GC retention proof",
  );
});

test("uses reordered fields and enum codes, including leading and intermediate zero-degree nodes", () => {
  const raw = {
    snapshot: {
      meta: {
        node_fields: ["edge_count", "self_size", "id", "name", "type"],
        node_types: [
          "number",
          "number",
          "number",
          "string",
          ["object", "synthetic"],
        ],
        edge_fields: ["to_node", "type", "name_or_index"],
        edge_types: [
          "node",
          ["weak", "property", "hidden"],
          "string_or_number",
        ],
      },
      node_count: 4,
      edge_count: 2,
    },
    nodes: [0, 0, 0, 0, 1, 1, 16, 101, 1, 0, 0, 8, 103, 1, 0, 1, 4, 107, 1, 0],
    edges: [15, 1, 2, 5, 0, 3],
    strings: ["root", "object", "payload", "weak"],
  };
  const graph = graphOf(raw);
  assert.deepEqual(
    [...graph.nodes()].map((node) => [node.rawId, node.type, node.selfSize]),
    [
      [0, "synthetic", 0],
      [101, "object", 16],
      [103, "object", 8],
      [107, "object", 4],
    ],
  );
  assert.deepEqual(
    [...graph.edges()].map((edge) => [
      edge.fromIndex,
      edge.toIndex,
      edge.type,
      edge.label.value,
    ]),
    [
      [1, 3, "property", "payload"],
      [3, 1, "weak", "weak"],
    ],
  );
  assert.deepEqual([...graph.outgoing(0)], []);
  assert.deepEqual([...graph.outgoing(2)], []);
  assert.equal(graph.nodeAt(3).offset, 15);
});

test("preserves raw UTF-8 bytes and exact domain/source labels across reads", () => {
  const value = fixture();
  value.strings[1] = "Khuê\u0000😀";
  const raw = Buffer.from(` \n${JSON.stringify(value, null, 2)}\r\n`, "utf8");
  const before = Buffer.from(raw);
  const result = read(raw, {
    identityDomain: " domain ",
    source: " fixture.heapsnapshot ",
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(raw, before);
  assert.equal(result.graph.nodeAt(1).name, "Khuê\u0000😀");
  assert.deepEqual(result.graph.nodeAt(1).identity, {
    domain: " domain ",
    rawId: 41,
  });
  assert.equal(result.graph.provenance.source, " fixture.heapsnapshot ");
  assert.equal(result.graph.provenance.byteLength, before.length);
  assert.equal(
    result.graph.provenance.sha256,
    createHash("sha256").update(before).digest("hex"),
  );
  assert.deepEqual(result.graph.metadata.node_fields, [
    "type",
    "name",
    "id",
    "self_size",
    "edge_count",
    "detachedness",
  ]);
  assert.deepEqual(
    graphOf(value, { identityDomain: "other" }).nodeAt(1).identity,
    { domain: "other", rawId: 41 },
  );
  raw.fill(0);
  assert.equal(
    result.graph.nodeAt(1).rawId,
    41,
    "graph owns its parsed backing storage",
  );
});

test("supports Uint8Array subviews without reading bytes outside the view", () => {
  const bytes = Buffer.from(`x${JSON.stringify(fixture())}y`);
  const view = new Uint8Array(
    bytes.buffer,
    bytes.byteOffset + 1,
    bytes.length - 2,
  );
  assert.equal(read(view).graph.edgeAt(7).toIndex, 2);
  assert.equal(bytes[0], 120);
  assert.equal(bytes.at(-1), 121);
});

test("accessors cannot corrupt later facts and invalid indices never escape as exceptions", () => {
  const graph = graphOf();
  const node = graph.nodeAt(1);
  const edge = graph.edgeAt(0);
  assert.throws(() => {
    node.identity.rawId = 999;
  }, TypeError);
  assert.throws(() => {
    node.rawFields.id = 999;
  }, TypeError);
  assert.throws(() => {
    edge.label.value = "bad";
  }, TypeError);
  assert.throws(() => {
    graph.metadata.node_fields[0] = "bad";
  }, TypeError);
  assert.equal(graph.nodeAt(1).rawId, 41);
  assert.equal(graph.edgeAt(0).label.value, "42");
  for (const index of [
    -1,
    -0,
    0.5,
    NaN,
    Infinity,
    "0",
    null,
    undefined,
    3,
    Number.MAX_SAFE_INTEGER,
  ]) {
    assert.equal(graph.nodeAt(index), undefined);
    assert.deepEqual([...graph.outgoing(index)], []);
  }
  for (const index of [-1, -0, 0.5, NaN, Infinity, "0", null, undefined, 8])
    assert.equal(graph.edgeAt(index), undefined);
});

test("preserves additional metadata-declared raw fields without inventing their meaning", () => {
  const value = fixture();
  value.snapshot.meta.edge_fields.push("extra");
  value.snapshot.meta.edge_types.push("number");
  value.edges = [
    2, 2, 6, 111, 1, 900, 12, 112, 6, 3, 6, 113, 4, 901, 12, 114, 3, 4, 6, 115,
    5, 5, 12, 116, 0, 6, 6, 117, 2, 7, 12, 118,
  ];
  assert.equal(graphOf(value).edgeAt(7).rawFields.extra, 118);
});

test("accepts an empty graph only with consistent declared zero counts", () => {
  const value = fixture();
  value.nodes = [];
  value.edges = [];
  value.strings = [];
  value.snapshot.node_count = 0;
  value.snapshot.edge_count = 0;
  const graph = graphOf(value);
  assert.deepEqual([...graph.nodes()], []);
  assert.deepEqual([...graph.edges()], []);
  assert.equal(graph.nodeAt(0), undefined);
});

// Each mutation names the corrupt fact it must reject. Expected statuses/codes
// are hand assigned; no validation or expected offsets come from the reader.
const cases = [
  [
    "absent snapshot",
    (v) => {
      delete v.snapshot;
    },
    "missing",
    "missing-field",
  ],
  [
    "absent meta",
    (v) => {
      delete v.snapshot.meta;
    },
    "missing",
    "missing-field",
  ],
  [
    "null meta",
    (v) => {
      v.snapshot.meta = null;
    },
    "error",
    "invalid-metadata",
  ],
  [
    "missing node fields",
    (v) => {
      delete v.snapshot.meta.node_fields;
    },
    "missing",
    "missing-field",
  ],
  [
    "missing edge types",
    (v) => {
      delete v.snapshot.meta.edge_types;
    },
    "missing",
    "missing-field",
  ],
  [
    "missing required node id column",
    (v) => {
      v.snapshot.meta.node_fields[2] = "other";
    },
    "missing",
    "missing-field",
  ],
  [
    "missing required target column",
    (v) => {
      v.snapshot.meta.edge_fields[2] = "other";
    },
    "missing",
    "missing-field",
  ],
  [
    "absent nodes",
    (v) => {
      delete v.nodes;
    },
    "missing",
    "missing-field",
  ],
  [
    "absent strings",
    (v) => {
      delete v.strings;
    },
    "missing",
    "missing-field",
  ],
  [
    "missing declared count",
    (v) => {
      delete v.snapshot.edge_count;
    },
    "missing",
    "missing-field",
  ],
  [
    "duplicate column",
    (v) => {
      v.snapshot.meta.node_fields[5] = "id";
    },
    "error",
    "invalid-metadata",
  ],
  [
    "empty fields",
    (v) => {
      v.snapshot.meta.edge_fields = [];
    },
    "error",
    "invalid-metadata",
  ],
  [
    "nonstring column",
    (v) => {
      v.snapshot.meta.node_fields[0] = 0;
    },
    "error",
    "invalid-metadata",
  ],
  [
    "descriptor arity mismatch",
    (v) => {
      v.snapshot.meta.node_types.pop();
    },
    "error",
    "invalid-metadata",
  ],
  [
    "duplicate enum",
    (v) => {
      v.snapshot.meta.node_types[0][1] = "synthetic";
    },
    "error",
    "invalid-metadata",
  ],
  [
    "invalid enum label",
    (v) => {
      v.snapshot.meta.edge_types[0][0] = 2;
    },
    "error",
    "invalid-metadata",
  ],
  [
    "null descriptor",
    (v) => {
      v.snapshot.meta.node_types[5] = null;
    },
    "error",
    "invalid-metadata",
  ],
  [
    "object descriptor",
    (v) => {
      v.snapshot.meta.edge_types[1] = {};
    },
    "error",
    "invalid-metadata",
  ],
  [
    "unknown descriptor",
    (v) => {
      v.snapshot.meta.node_types[5] = "bigint";
    },
    "unsupported",
    "unsupported-type",
  ],
  [
    "unknown id encoding",
    (v) => {
      v.snapshot.meta.node_types[2] = "string";
    },
    "unsupported",
    "unsupported-type",
  ],
  [
    "unknown target encoding",
    (v) => {
      v.snapshot.meta.edge_types[2] = "number";
    },
    "unsupported",
    "unsupported-type",
  ],
  [
    "unknown edge semantics",
    (v) => {
      v.snapshot.meta.edge_types[0][0] = "ephemeron";
    },
    "unsupported",
    "unsupported-type",
  ],
  [
    "explicit format version",
    (v) => {
      v.snapshot.version = 123;
    },
    "unsupported",
    "unsupported-version",
  ],
  [
    "invalid nodes table",
    (v) => {
      v.nodes = {};
    },
    "error",
    "invalid-table",
  ],
  [
    "invalid edges table",
    (v) => {
      v.edges = null;
    },
    "error",
    "invalid-table",
  ],
  [
    "nonstring string entry",
    (v) => {
      v.strings[2] = 42;
    },
    "error",
    "invalid-table",
  ],
  [
    "truncated node record",
    (v) => {
      v.nodes.pop();
    },
    "error",
    "truncated-table",
  ],
  [
    "truncated edge record",
    (v) => {
      v.edges.pop();
    },
    "error",
    "truncated-table",
  ],
  [
    "wrong node count",
    (v) => {
      v.snapshot.node_count = 4;
    },
    "error",
    "count-mismatch",
  ],
  [
    "negative edge count",
    (v) => {
      v.snapshot.edge_count = -1;
    },
    "error",
    "invalid-value",
  ],
  [
    "string count",
    (v) => {
      v.snapshot.node_count = "3";
    },
    "error",
    "invalid-value",
  ],
  [
    "wrong edge count",
    (v) => {
      v.snapshot.edge_count = 7;
    },
    "error",
    "count-mismatch",
  ],
  [
    "outgoing count overflow",
    (v) => {
      v.nodes[4] = 9;
    },
    "error",
    "count-mismatch",
  ],
  [
    "unassigned trailing edge",
    (v) => {
      v.nodes[4] = 6;
    },
    "error",
    "count-mismatch",
  ],
  [
    "negative outgoing count",
    (v) => {
      v.nodes[4] = -1;
    },
    "error",
    "invalid-value",
  ],
  [
    "node type out of range",
    (v) => {
      v.nodes[0] = 3;
    },
    "error",
    "invalid-reference",
  ],
  [
    "node type string",
    (v) => {
      v.nodes[0] = "0";
    },
    "error",
    "invalid-reference",
  ],
  [
    "node name out of range",
    (v) => {
      v.nodes[1] = 8;
    },
    "error",
    "invalid-reference",
  ],
  [
    "edge type out of range",
    (v) => {
      v.edges[0] = 7;
    },
    "error",
    "invalid-reference",
  ],
  [
    "unaligned target offset",
    (v) => {
      v.edges[2] = 7;
    },
    "error",
    "invalid-reference",
  ],
  [
    "target at end of table",
    (v) => {
      v.edges[2] = 18;
    },
    "error",
    "invalid-reference",
  ],
  [
    "negative target",
    (v) => {
      v.edges[2] = -6;
    },
    "error",
    "invalid-reference",
  ],
  [
    "string target",
    (v) => {
      v.edges[2] = "6";
    },
    "error",
    "invalid-reference",
  ],
  [
    "unsafe target",
    (v) => {
      v.edges[2] = 9007199254740992;
    },
    "error",
    "invalid-reference",
  ],
  [
    "property name out of range",
    (v) => {
      v.edges[1] = 8;
    },
    "error",
    "invalid-reference",
  ],
  [
    "negative element index",
    (v) => {
      v.edges[4] = -1;
    },
    "error",
    "invalid-reference",
  ],
  [
    "fractional hidden index",
    (v) => {
      v.edges[10] = 0.5;
    },
    "error",
    "invalid-reference",
  ],
  [
    "string weak name",
    (v) => {
      v.edges[7] = "3";
    },
    "error",
    "invalid-reference",
  ],
  [
    "negative size",
    (v) => {
      v.nodes[9] = -1;
    },
    "error",
    "invalid-value",
  ],
  [
    "fractional byte size",
    (v) => {
      v.nodes[9] = 0.5;
    },
    "error",
    "invalid-value",
  ],
  [
    "unsafe byte size",
    (v) => {
      v.nodes[9] = 9007199254740992;
    },
    "error",
    "invalid-value",
  ],
  [
    "null size",
    (v) => {
      v.nodes[9] = null;
    },
    "error",
    "invalid-value",
  ],
  [
    "string id",
    (v) => {
      v.nodes[8] = "41";
    },
    "error",
    "invalid-identity",
  ],
  [
    "whitespace id",
    (v) => {
      v.nodes[8] = " 41 ";
    },
    "error",
    "invalid-identity",
  ],
  [
    "negative id",
    (v) => {
      v.nodes[8] = -41;
    },
    "error",
    "invalid-identity",
  ],
  [
    "fractional id",
    (v) => {
      v.nodes[8] = 41.5;
    },
    "error",
    "invalid-identity",
  ],
  [
    "unsafe id",
    (v) => {
      v.nodes[8] = 9007199254740992;
    },
    "error",
    "invalid-identity",
  ],
  [
    "duplicate id",
    (v) => {
      v.nodes[14] = 41;
    },
    "error",
    "duplicate-identity",
  ],
];
for (const [name, mutate, status, code] of cases) {
  test(`rejects ${name} without partial graph or fabricated product verdict`, () => {
    const value = fixture();
    mutate(value);
    const raw = Buffer.from(JSON.stringify(value));
    const before = Buffer.from(raw);
    const result = read(raw);
    assert.equal(result.status, status);
    assert.equal(result.diagnostics[0].code, code);
    assert.equal(typeof result.diagnostics[0].path, "string");
    assert.equal("graph" in result, false);
    assert.equal("result" in result, false);
    assert.deepEqual(raw, before);
  });
}

test("rejects nonfinite numbers, signed-zero identities and alternate numeric duplicate forms", () => {
  const raw = JSON.stringify(fixture());
  for (const [from, to, code] of [
    [",41,24,", ",41,1e999,", "invalid-value"],
    [",41,24,", ",1e999,24,", "invalid-identity"],
    [",41,24,", ",-0,24,", "invalid-identity"],
    [",41,24,", ",41.000000000000001,24,", "invalid-identity"],
    [",41,24,", ",9007199254740991.1,24,", "invalid-identity"],
    [",73,8,", ",4.1e1,8,", "duplicate-identity"],
    [",73,8,", ",41.0,8,", "duplicate-identity"],
    [",73,8,", ",41,8,", "duplicate-identity"],
  ]) {
    const result = read(raw.replace(from, to));
    assert.equal(result.status, "error");
    assert.equal(result.diagnostics[0].code, code);
  }
});

test("accepts max safe IDs exactly and keeps whitespace-only domains unmodified", () => {
  const value = fixture();
  value.nodes[8] = Number.MAX_SAFE_INTEGER;
  const graph = graphOf(value, { identityDomain: " " });
  assert.deepEqual(graph.nodeAt(1).identity, {
    domain: " ",
    rawId: 9007199254740991,
  });
});

test("reports literal invalid-reference and missing-field paths without raw payload labels", () => {
  const value = fixture();
  value.edges[2] = 7;
  assert.deepEqual(read(JSON.stringify(value)).diagnostics, [
    { code: "invalid-reference", path: "edges[2]" },
  ]);
  delete value.snapshot.meta.node_types;
  assert.deepEqual(read(JSON.stringify(value)).diagnostics, [
    { code: "missing-field", path: "snapshot.meta.node_types" },
  ]);
});

test("accepts exact decimal/exponent IDs and rejects rounded count/index/reference slots", () => {
  const raw = JSON.stringify(fixture());
  for (const form of ["41.0", "4.1e1", "410e-1", "0.041e3", "4.1000e+1"]) {
    const result = read(raw.replace(",41,24,", `,${form},24,`));
    assert.equal(result.status, "ok");
    assert.equal(result.graph.nodeAt(1).rawId, 41);
  }
  for (const [from, to, path] of [
    [
      '"node_count":3',
      '"node_count":3.00000000000000001',
      "snapshot.node_count",
    ],
    [",24,1,0,", ",24,1.00000000000000001,0,", "nodes[10]"],
    ['"edges":[2,2,6,', '"edges":[2,2,6.00000000000000001,', "edges[2]"],
    ['"edges":[2,2,6,', '"edges":[2,2.00000000000000001,6,', "edges[1]"],
  ]) {
    assert.notEqual(
      raw.replace(from, to),
      raw,
      "mutation must actually alter raw input",
    );
    const result = read(raw.replace(from, to));
    assert.equal(result.status, "error");
    assert.equal(result.diagnostics[0].path, path);
  }
});

test("classifies public input/domain/UTF-8/JSON errors without leaking raw text", () => {
  for (const [raw, options, status, code] of [
    [undefined, {}, "missing", "missing-input"],
    [null, {}, "missing", "missing-input"],
    [{}, {}, "error", "invalid-input"],
    [JSON.stringify(fixture()), {}, "missing", "missing-domain"],
    [
      JSON.stringify(fixture()),
      { identityDomain: "" },
      "error",
      "invalid-domain",
    ],
    [
      JSON.stringify(fixture()),
      { identityDomain: 41 },
      "error",
      "invalid-domain",
    ],
    [JSON.stringify(fixture()), null, "error", "invalid-options"],
    [
      JSON.stringify(fixture()),
      { identityDomain: "d", source: {} },
      "error",
      "invalid-options",
    ],
    [Buffer.from([0xff]), { identityDomain: "d" }, "error", "invalid-utf8"],
    ["{secret", { identityDomain: "d" }, "error", "invalid-json"],
    ["", { identityDomain: "d" }, "error", "invalid-json"],
    ["[]", { identityDomain: "d" }, "error", "invalid-table"],
  ]) {
    const result = read(raw, options);
    assert.equal(result.status, status);
    assert.equal(result.diagnostics[0].code, code);
    assert.equal("graph" in result, false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});
