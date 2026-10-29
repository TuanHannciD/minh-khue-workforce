import { createEvidenceRun } from "../../../scripts/product/evidence-run.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument } from "../dist/openapi.js";
import {
  parseWrite,
  parseReconcile,
} from "../dist/modules/attendance/attendance-validation.js";
import { accepts } from "./attendance-contract-schema.mjs";
import { normalizeValue } from "../dist/modules/attendance/attendance-values.js";
import { command } from "./auth-sandbox.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("complete G1 JSON fixtures validate runtime requests, OpenAPI responses and generated TypeScript consumers", async () => {
  const markdown = await readFile(
    resolve(root, "docs/tasks/MKW-PRODUCT-001/technical/api-contract.md"),
    "utf8",
  );
  const fixtures = [...markdown.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const document = await createDocument(),
    schemas = document.components.schemas;
  const typed = [];
  for (const fixture of fixtures) {
    let type;
    if (fixture.operation) {
      type = "WriteAttendanceDto";
      assert.deepEqual(parseWrite(fixture), fixture);
    } else if (fixture.employeeIds) {
      type = "ReconcileRequestDto";
      assert.deepEqual(parseReconcile(fixture), fixture);
    } else if (fixture.missingEmployeeIds) type = "ReconcileSnapshotDto";
    else if (fixture.state === "saved") type = "WriteResultDto";
    else if (fixture.month && fixture.fetchedAt) type = "MonthDto";
    else if (fixture.error?.code === "ATTENDANCE_CONFLICT")
      type = "AttendanceApiErrorDto";
    else continue;
    assert.ok(
      accepts(fixture, schemas[type], schemas),
      `${type} must accept the full G1 JSON fixture`,
    );
    typed.push(
      `(${JSON.stringify(fixture)}) satisfies components["schemas"]["${type}"];`,
    );
  }
  assert.equal(typed.length, 12);
  const sample = fixtures.find((x) => x.operation?.type === "patch-cell");
  for (const operation of [
    { type: "patch-cell", patch: {} },
    { type: "patch-cell", patch: null },
    { type: "patch-cell", patch: { reminder: null } },
    { type: "patch-cell", patch: { extra: 1 } },
    { type: "set-value", mode: "replace", value: null, reminder: true },
    { type: "set-reminder", reminder: false, value: null },
    { type: "number", value: 1 },
  ]) {
    const invalid = { ...sample, operation };
    assert.throws(() => parseWrite(invalid));
    assert.equal(accepts(invalid, schemas.WriteAttendanceDto, schemas), false);
  }
  for (const invalid of [
    {
      ...sample,
      targets: [
        ...sample.targets,
        { ...sample.targets[0], date: "2026-10-21" },
      ],
    },
    { ...sample, source: { ...sample.targets[0], date: "2026-10-19" } },
    {
      ...sample,
      operation: {
        type: "patch-cell",
        patch: { value: { type: "absence", value: 0 } },
      },
    },
    {
      ...sample,
      operation: {
        type: "patch-cell",
        patch: { value: { type: "number", value: 3.25 } },
      },
    },
    ...[0, 24.5, 25].map((value) => ({
      ...sample,
      targets: [{ ...sample.targets[0], kind: "overtime" }],
      operation: {
        type: "set-value",
        mode: "replace",
        value: { type: "number", value },
      },
    })),
    {
      ...sample,
      targets: [{ ...sample.targets[0], kind: "overtime" }],
      operation: {
        type: "set-value",
        mode: "replace",
        value: { type: "absence" },
      },
    },
  ])
    assert.equal(
      accepts(invalid, schemas.WriteAttendanceDto, schemas),
      false,
      "OpenAPI must reject invalid shape/value/kind/cardinality",
    );
  await typecheckConsumer("g1-fixtures", typed.join("\n"));
});

async function typecheckConsumer(name, source) {
  const runs = resolve(
    root,
    ".agent-runs/MKW-PRODUCT-001/task5-fix-r1/contract-consumer",
  );
  await mkdir(runs, { recursive: true });
  const evidence = await createEvidenceRun(resolve(runs, name + "-"));
  const path = resolve(evidence, "fixture-consumer.ts");
  const generated = relative(
    evidence,
    resolve(root, "apps/web/src/shared/api/generated/schema.js"),
  ).replaceAll("\\", "/");
  await writeFile(
    path,
    `import type { components } from "${generated}";\n${source}\n`,
  );
  const result = await command(
    process.platform === "win32" ? "pnpm.exe" : "pnpm",
    [
      "exec",
      "tsc",
      "--strict",
      "--skipLibCheck",
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      path,
    ],
    { cwd: root },
  );
  await writeFile(resolve(evidence, "typecheck.log"), result.output);
  assert.equal(
    result.code,
    0,
    `Generated consumer ${name}: ${result.output} (retained ${evidence})`,
  );
}

test("reconcile requires both typed arrays while either array may supply the nonempty request", async () => {
  const schemas = (await createDocument()).components.schemas;
  const employeeId = "00000000-0000-4000-8000-000000000101";
  const key = { employeeId, date: "2026-10-20", kind: "work" };
  const positives = [
    { employeeIds: [employeeId], cells: [] },
    { employeeIds: [], cells: [key] },
    { employeeIds: [employeeId], cells: [key] },
  ];
  const negatives = [
    {},
    { employeeIds: [employeeId] },
    { cells: [key] },
    { employeeIds: 123, cells: [key] },
    { employeeIds: [123], cells: [] },
    { employeeIds: [employeeId], cells: 123 },
    { employeeIds: [employeeId], cells: [123] },
    { employeeIds: null, cells: [key] },
    { employeeIds: [employeeId], cells: null },
  ];
  for (const input of positives) {
    assert.deepEqual(parseReconcile(input), input);
    assert.equal(accepts(input, schemas.ReconcileRequestDto, schemas), true);
  }
  for (const input of [...negatives, { employeeIds: [], cells: [] }]) {
    assert.throws(() => parseReconcile(input));
    assert.equal(accepts(input, schemas.ReconcileRequestDto, schemas), false);
  }
  await typecheckConsumer(
    "i1-reconcile",
    [
      'type Request = components["schemas"]["ReconcileRequestDto"];',
      "export function count(request: Request) { return request.cells.length + request.employeeIds.length; }",
      ...positives.map(
        (input) => `(${JSON.stringify(input)}) satisfies Request;`,
      ),
      ...negatives.map(
        (input, i) =>
          `// @ts-expect-error missing array or incorrect array/item type ${i}\n(${JSON.stringify(input)}) satisfies Request;`,
      ),
    ].join("\n"),
  );
});

test("write operation branches reject forbidden fields with otherwise complete valid requests", async () => {
  const schemas = (await createDocument()).components.schemas;
  const employeeId = "00000000-0000-4000-8000-000000000101";
  const base = {
    month: "2026-10",
    expectedEmployees: [{ employeeId, expectedRevision: "employee-r1" }],
    targets: [
      { employeeId, date: "2026-10-20", kind: "work", expectedRevision: "0" },
    ],
  };
  const source = { ...base.targets[0], date: "2026-10-19" };
  const value = { type: "set-value", mode: "replace", value: null };
  const reminder = { type: "set-reminder", reminder: false };
  const patch = { type: "patch-cell", patch: { value: null, reminder: true } };
  const positives = [
    { ...base, operation: value },
    {
      ...base,
      operation: { ...value, value: { type: "number", value: 1.5 } },
      source,
    },
    { ...base, operation: reminder },
    { ...base, operation: patch },
    { ...base, operation: { type: "patch-cell", patch: { reminder: false } } },
    { ...base, operation: { type: "patch-cell", patch: { value: null } } },
  ];
  // Each negative changes only the named field from a valid complete request.
  const negatives = [
    ["reminder value", { ...base, operation: { ...reminder, value: null } }],
    [
      "reminder patch",
      { ...base, operation: { ...reminder, patch: { value: null } } },
    ],
    ["reminder source", { ...base, operation: reminder, source }],
    [
      "reminder incomplete source",
      { ...base, operation: reminder, source: { kind: "work" } },
    ],
    ["patch value", { ...base, operation: { ...patch, value: null } }],
    ["patch source", { ...base, operation: patch, source }],
    [
      "patch incomplete source",
      { ...base, operation: patch, source: { kind: "work" } },
    ],
    [
      "value patch",
      { ...base, operation: { ...value, patch: { value: null } } },
    ],
    ["value reminder", { ...base, operation: { ...value, reminder: true } }],
    ["reminder mode", { ...base, operation: { ...reminder, mode: "replace" } }],
    ["patch mode", { ...base, operation: { ...patch, mode: "replace" } }],
    ["unknown discriminator", { ...base, operation: { type: "invented" } }],
    ["unknown root", { ...base, operation: reminder, extra: true }],
    ...[null, {}, "source", 1, true].flatMap((source) => [
      ["reminder invalid source", { ...base, operation: reminder, source }],
      ["patch invalid source", { ...base, operation: patch, source }],
    ]),
  ];
  for (const input of positives) {
    assert.deepEqual(parseWrite(input), input);
    assert.equal(accepts(input, schemas.WriteAttendanceDto, schemas), true);
  }
  for (const [name, input] of negatives) {
    assert.throws(() => parseWrite(input), name);
    assert.equal(
      accepts(input, schemas.WriteAttendanceDto, schemas),
      false,
      name,
    );
  }
  // Recursive unknown-field enforcement is a runtime/OpenAPI guarantee;
  // TypeScript's structural types do not make arbitrary nested objects exact.
  const unknownTarget = {
    ...base,
    operation: reminder,
    targets: [{ ...base.targets[0], extra: true }],
  };
  assert.throws(() => parseWrite(unknownTarget));
  assert.equal(
    accepts(unknownTarget, schemas.WriteAttendanceDto, schemas),
    false,
  );
  await typecheckConsumer(
    "i2-write",
    [
      'type Request = components["schemas"]["WriteAttendanceDto"];',
      ...positives.map(
        (input) => `(${JSON.stringify(input)}) satisfies Request;`,
      ),
      ...negatives.map(
        ([name, input]) =>
          `// @ts-expect-error ${name}\n(${JSON.stringify(input)}) satisfies Request;`,
      ),
    ].join("\n"),
  );
});

test("contextual work and overtime values retain bounds, absence, null and source kind constraints", async () => {
  const schemas = (await createDocument()).components.schemas;
  const employeeId = "00000000-0000-4000-8000-000000000101";
  const typed = [];
  for (const [kind, valid, invalid] of [
    [
      "work",
      [
        null,
        { type: "absence" },
        ...[0, 0.5, 30].map((value) => ({ type: "number", value })),
      ],
      [30.5, 3.25, -0.5].map((value) => ({ type: "number", value })),
    ],
    [
      "overtime",
      [null, ...[0.5, 24].map((value) => ({ type: "number", value }))],
      [
        { type: "absence" },
        ...[0, 24.5, 3.25].map((value) => ({ type: "number", value })),
      ],
    ],
  ]) {
    const base = {
      month: "2026-10",
      expectedEmployees: [{ employeeId, expectedRevision: "employee-r1" }],
      targets: [
        { employeeId, date: "2026-10-20", kind, expectedRevision: "0" },
      ],
    };
    for (const type of ["set-value", "patch-cell"]) {
      for (const [values, allowed] of [
        [valid, true],
        [invalid, false],
      ]) {
        for (const value of values) {
          const operation =
            type === "set-value"
              ? { type, value, mode: "replace" }
              : { type, patch: { value, reminder: true } };
          const input = { ...base, operation };
          assert.deepEqual(parseWrite(input), input);
          assert.equal(
            accepts(input, schemas.WriteAttendanceDto, schemas),
            allowed,
            `${kind}/${type}/${JSON.stringify(value)}`,
          );
          if (allowed) {
            assert.doesNotThrow(() => normalizeValue(kind, value));
            typed.push(`(${JSON.stringify(input)}) satisfies Request;`);
          } else assert.throws(() => normalizeValue(kind, value));
        }
      }
    }
    const reminder = {
      ...base,
      operation: { type: "set-reminder", reminder: true },
    };
    assert.deepEqual(parseWrite(reminder), reminder);
    assert.equal(accepts(reminder, schemas.WriteAttendanceDto, schemas), true);
    typed.push(`(${JSON.stringify(reminder)}) satisfies Request;`);
    const mixedSource = {
      ...base,
      operation: {
        type: "set-value",
        value: { type: "number", value: 1 },
        mode: "fill-empty",
      },
      source: {
        ...base.targets[0],
        date: "2026-10-19",
        kind: kind === "work" ? "overtime" : "work",
      },
    };
    assert.throws(() => parseWrite(mixedSource));
    assert.equal(
      accepts(mixedSource, schemas.WriteAttendanceDto, schemas),
      false,
    );
  }
  await typecheckConsumer(
    "contextual-values",
    'type Request = components["schemas"]["WriteAttendanceDto"];\n' +
      typed.join("\n"),
  );
});
