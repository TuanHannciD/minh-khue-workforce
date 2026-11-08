import { createHash } from "node:crypto";

/**
 * Pure offline reader, not a classifier or an H1–H5 acceptance adapter.
 * File map: readHeapSnapshot owns decoding/structured errors; layout validates
 * metadata; indexGraph validates every graph cell and outgoing partition;
 * graphView exposes immutable lazy facts with original offsets/IDs.
 * Encoding reference/limits: heap-raw-reader-implementation-report.md.
 * All non-weak types stay raw facts: no strong reachability/GC/owner proof.
 * Full synchronous JSON.parse + O(nodes) indexing; no large-run feasibility claim.
 */
const scope = "offline-raw-graph-only";
const edgeKinds = new Set([
  "context",
  "element",
  "property",
  "internal",
  "hidden",
  "shortcut",
  "weak",
]);
const indexLabels = new Set(["element", "hidden"]);
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value) =>
  Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const validIndex = (value, count) => integer(value) && value < count;

class ReaderIssue extends Error {
  constructor(status, code, path) {
    super(code);
    this.status = status;
    this.diagnostic = { code, path };
  }
}
const issue = (status, code, path) => {
  throw new ReaderIssue(status, code, path);
};
const malformed = (code, path) => issue("error", code, path);
function required(object, key, path) {
  if (!Object.hasOwn(object, key))
    issue("missing", "missing-field", `${path}.${key}`);
  return object[key];
}

// JSON.parse can round a fractional/unsafe literal to a safe integer. Compare
// exact decimal digits before accepting numeric identity, counts or references.
// Equivalent exact integer spellings (41.0, 4.1e1) remain the SAME numeric ID.
function exactIntegerToken(source, value) {
  if (!integer(value)) return false;
  const [mantissa, exponent = "0"] = source.toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  let digits = (whole + fraction).replace(/^0+/, "");
  if (digits === "") return true;
  let scale = Number(exponent) - fraction.length;
  const suffix = /0+$/.exec(digits)?.[0].length ?? 0;
  digits = digits.slice(0, digits.length - suffix);
  scale += suffix;
  return (
    integer(scale) &&
    digits.length + scale === String(value).length &&
    digits + "0".repeat(scale) === String(value)
  );
}

function layout(meta, kind, requiredTypes) {
  const path = `snapshot.meta.${kind}`;
  const fields = required(meta, `${kind}_fields`, "snapshot.meta");
  const types = required(meta, `${kind}_types`, "snapshot.meta");
  if (
    !Array.isArray(fields) ||
    fields.length === 0 ||
    !Array.isArray(types) ||
    types.length !== fields.length
  )
    malformed("invalid-metadata", path);
  if (
    fields.some((field) => typeof field !== "string" || field.length === 0) ||
    new Set(fields).size !== fields.length
  )
    malformed("invalid-metadata", path);
  // Validate every descriptor's structure before testing supported encodings.
  for (let index = 0; index < types.length; index++) {
    const type = types[index];
    if (Array.isArray(type)) {
      if (
        type.length === 0 ||
        type.some((label) => typeof label !== "string" || label.length === 0) ||
        new Set(type).size !== type.length
      )
        malformed("invalid-metadata", `${path}_types[${index}]`);
    } else if (typeof type !== "string" || type.length === 0)
      malformed("invalid-metadata", `${path}_types[${index}]`);
  }
  const offsets = new Map(fields.map((field, index) => [field, index]));
  for (const [field, expected] of Object.entries(requiredTypes)) {
    if (!offsets.has(field))
      issue("missing", "missing-field", `${path}_fields.${field}`);
    const type = types[offsets.get(field)];
    if (expected === "enum" ? !Array.isArray(type) : type !== expected)
      issue("unsupported", "unsupported-type", `${path}_types.${field}`);
  }
  for (let index = 0; index < types.length; index++) {
    const type = types[index];
    if (
      !Array.isArray(type) &&
      !["number", "string", "node"].includes(type) &&
      !(
        kind === "edge" &&
        fields[index] === "name_or_index" &&
        type === "string_or_number"
      )
    )
      issue("unsupported", "unsupported-type", `${path}_types[${index}]`);
  }
  if (
    kind === "edge" &&
    types[offsets.get("type")].some((type) => !edgeKinds.has(type))
  )
    issue("unsupported", "unsupported-type", `${path}_types.type`);
  return { fields, types, offsets, width: fields.length };
}

function indexGraph(snapshot, inexact) {
  const header = required(snapshot, "snapshot", "$");
  if (!record(header)) malformed("invalid-metadata", "snapshot");
  const meta = required(header, "meta", "snapshot");
  if (!record(meta)) malformed("invalid-metadata", "snapshot.meta");
  // No stable version identifier was documented locally; never guess support
  // for an explicitly versioned/profile-tagged representation.
  for (const [object, path] of [
    [snapshot, "$"],
    [header, "snapshot"],
    [meta, "snapshot.meta"],
  ])
    for (const key of [
      "version",
      "format",
      "format_version",
      "formatVersion",
      "schemaVersion",
    ])
      if (Object.hasOwn(object, key))
        issue("unsupported", "unsupported-version", `${path}.${key}`);
  const node = layout(meta, "node", {
    type: "enum",
    name: "string",
    id: "number",
    self_size: "number",
    edge_count: "number",
  });
  const edge = layout(meta, "edge", {
    type: "enum",
    name_or_index: "string_or_number",
    to_node: "node",
  });
  const nodes = required(snapshot, "nodes", "$");
  const edges = required(snapshot, "edges", "$");
  const strings = required(snapshot, "strings", "$");
  for (const [table, path] of [
    [nodes, "nodes"],
    [edges, "edges"],
    [strings, "strings"],
  ])
    if (!Array.isArray(table)) malformed("invalid-table", path);
  for (let i = 0; i < strings.length; i++)
    if (typeof strings[i] !== "string")
      malformed("invalid-table", `strings[${i}]`);
  if (nodes.length % node.width) malformed("truncated-table", "nodes");
  if (edges.length % edge.width) malformed("truncated-table", "edges");
  const nodeCount = nodes.length / node.width,
    edgeCount = edges.length / edge.width;
  const exact = (table, index) =>
    integer(table[index]) && !inexact.get(table)?.has(String(index));
  for (const [key, actual] of [
    ["node_count", nodeCount],
    ["edge_count", edgeCount],
  ]) {
    required(header, key, "snapshot");
    if (!exact(header, key)) malformed("invalid-value", `snapshot.${key}`);
    if (header[key] !== actual) malformed("count-mismatch", `snapshot.${key}`);
  }
  function validateCell(table, offset, type, path) {
    const value = table[offset];
    if (Array.isArray(type)) {
      if (!exact(table, offset) || value >= type.length)
        malformed("invalid-reference", path);
    } else if (type === "string") {
      if (!exact(table, offset) || value >= strings.length)
        malformed("invalid-reference", path);
    } else if (type === "node") {
      if (!exact(table, offset) || value >= nodes.length || value % node.width)
        malformed("invalid-reference", path);
    } else if (type === "number" && !exact(table, offset))
      malformed("invalid-value", path);
  }
  const starts = [0],
    ids = new Set();
  for (let index = 0; index < nodeCount; index++) {
    const offset = index * node.width;
    const idOffset = offset + node.offsets.get("id");
    if (!exact(nodes, idOffset))
      malformed("invalid-identity", `nodes[${idOffset}]`);
    if (ids.has(nodes[idOffset]))
      malformed("duplicate-identity", `nodes[${idOffset}]`);
    ids.add(nodes[idOffset]);
    for (let field = 0; field < node.width; field++)
      validateCell(
        nodes,
        offset + field,
        node.types[field],
        `nodes[${offset + field}]`,
      );
    const degree = nodes[offset + node.offsets.get("edge_count")];
    if (degree > edgeCount - starts[index])
      malformed(
        "count-mismatch",
        `nodes[${offset + node.offsets.get("edge_count")}]`,
      );
    starts.push(starts[index] + degree);
  }
  if (starts[nodeCount] !== edgeCount)
    malformed("count-mismatch", "nodes.edge_count");
  for (let index = 0; index < edgeCount; index++) {
    const offset = index * edge.width;
    for (let field = 0; field < edge.width; field++)
      validateCell(
        edges,
        offset + field,
        edge.types[field],
        `edges[${offset + field}]`,
      );
    const type =
      edge.types[edge.offsets.get("type")][
        edges[offset + edge.offsets.get("type")]
      ];
    const labelOffset = offset + edge.offsets.get("name_or_index");
    if (
      !exact(edges, labelOffset) ||
      (!indexLabels.has(type) && edges[labelOffset] >= strings.length)
    )
      malformed("invalid-reference", `edges[${labelOffset}]`);
  }
  return { node, edge, nodes, edges, strings, starts, nodeCount, edgeCount };
}

function graphView(indexed, identityDomain, provenance) {
  const { node, edge, nodes, edges, strings, starts, nodeCount, edgeCount } =
    indexed;
  const fieldsAt = (layout, table, offset) =>
    Object.freeze(
      Object.fromEntries(
        layout.fields.map((field, index) => [field, table[offset + index]]),
      ),
    );
  function nodeAt(index) {
    if (!validIndex(index, nodeCount)) return undefined;
    const offset = index * node.width,
      rawFields = fieldsAt(node, nodes, offset);
    return Object.freeze({
      index,
      offset,
      rawId: rawFields.id,
      identity: Object.freeze({ domain: identityDomain, rawId: rawFields.id }),
      type: node.types[node.offsets.get("type")][rawFields.type],
      name: strings[rawFields.name],
      selfSize: rawFields.self_size,
      edgeCount: rawFields.edge_count,
      rawFields,
    });
  }
  function edgeAt(index) {
    if (!validIndex(index, edgeCount)) return undefined;
    // Upper-bound search handles leading/intermediate zero-degree nodes.
    let low = 0,
      high = nodeCount;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= index) low = middle + 1;
      else high = middle;
    }
    const offset = index * edge.width,
      rawFields = fieldsAt(edge, edges, offset);
    const type = edge.types[edge.offsets.get("type")][rawFields.type];
    return Object.freeze({
      index,
      offset,
      fromIndex: low - 1,
      toIndex: rawFields.to_node / node.width,
      toNodeOffset: rawFields.to_node,
      type,
      nameOrIndex: rawFields.name_or_index,
      label: Object.freeze(
        indexLabels.has(type)
          ? { kind: "index", value: rawFields.name_or_index }
          : { kind: "string", value: strings[rawFields.name_or_index] },
      ),
      weak: type === "weak",
      rawFields,
    });
  }
  const freezeTypes = (types) =>
    Object.freeze(
      types.map((type) =>
        Array.isArray(type) ? Object.freeze([...type]) : type,
      ),
    );
  return Object.freeze({
    nodeCount,
    edgeCount,
    identityDomain,
    provenance: Object.freeze(provenance),
    metadata: Object.freeze({
      node_fields: Object.freeze([...node.fields]),
      node_types: freezeTypes(node.types),
      edge_fields: Object.freeze([...edge.fields]),
      edge_types: freezeTypes(edge.types),
    }),
    nodeAt,
    edgeAt,
    *nodes() {
      for (let i = 0; i < nodeCount; i++) yield nodeAt(i);
    },
    *edges() {
      for (let i = 0; i < edgeCount; i++) yield edgeAt(i);
    },
    *outgoing(index) {
      if (!validIndex(index, nodeCount)) return;
      for (let i = starts[index]; i < starts[index + 1]; i++) yield edgeAt(i);
    },
  });
}

/**
 * Read retained UTF-8 JSON bytes/text only; never open/write a path.
 * Caller domain/source are exact labels, NOT verified session/ownership proof.
 * ok means schema-validated raw facts only. Missing/unsupported/error never
 * expose a partial graph, product verdict, acceptance exit code or raw text.
 */
export function readHeapSnapshot(raw, options = {}) {
  try {
    if (raw === undefined || raw === null)
      issue("missing", "missing-input", "$");
    if (typeof raw !== "string" && !(raw instanceof Uint8Array))
      malformed("invalid-input", "$");
    if (!record(options)) malformed("invalid-options", "options");
    if (!Object.hasOwn(options, "identityDomain"))
      issue("missing", "missing-domain", "options.identityDomain");
    const { identityDomain, source } = options;
    if (typeof identityDomain !== "string" || identityDomain.length === 0)
      malformed("invalid-domain", "options.identityDomain");
    if (source !== undefined && typeof source !== "string")
      malformed("invalid-options", "options.source");
    let text, bytes;
    if (typeof raw === "string") {
      // UTF-8 encoding replaces lone UTF-16 surrogates. Reject before parsing
      // so every accepted text graph can be reproduced from its sealed bytes.
      if (!raw.isWellFormed()) malformed("invalid-utf8", "$");
      text = raw;
      bytes = Buffer.from(raw, "utf8");
    } else {
      bytes = Buffer.from(raw);
      try {
        text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        malformed("invalid-utf8", "$");
      }
    }
    const inexact = new WeakMap();
    let snapshot;
    try {
      snapshot = JSON.parse(text, function (key, value, context) {
        if (
          typeof value === "number" &&
          !exactIntegerToken(context.source, value)
        ) {
          if (!inexact.has(this)) inexact.set(this, new Set());
          inexact.get(this).add(key);
        }
        return value;
      });
    } catch {
      malformed("invalid-json", "$");
    }
    if (!record(snapshot)) malformed("invalid-table", "$");
    const indexed = indexGraph(snapshot, inexact);
    const graph = graphView(indexed, identityDomain, {
      source,
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    return { status: "ok", scope, diagnostics: [], graph };
  } catch (error) {
    return {
      status: error instanceof ReaderIssue ? error.status : "error",
      scope,
      diagnostics: [
        error instanceof ReaderIssue
          ? error.diagnostic
          : { code: "reader-error", path: "$" },
      ],
    };
  }
}
