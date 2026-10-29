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
import { isCalendarDate } from "../dist/modules/employees/index.js";
import { command } from "./auth-sandbox.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
// Small assertion evaluator for the OpenAPI3.0 keywords emitted by these DTOs.
// It exercises the generated schema; it does not share the runtime parser.
function accepts(value, schema, schemas) {
  if (schema.$ref)
    return accepts(value, schemas[schema.$ref.split("/").at(-1)], schemas);
  if (schema.enum && !schema.enum.some((x) => x === value)) return false;
  if (schema.allOf && !schema.allOf.every((s) => accepts(value, s, schemas)))
    return false;
  if (schema.anyOf && !schema.anyOf.some((s) => accepts(value, s, schemas)))
    return false;
  if (
    schema.oneOf &&
    schema.oneOf.filter((s) => accepts(value, s, schemas)).length !== 1
  )
    return false;
  if (value === null) return schema.nullable === true || !schema.type;
  if (schema.type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) return false;
    if (schema.required?.some((k) => !Object.hasOwn(value, k))) return false;
    if (
      schema.minProperties !== undefined &&
      Object.keys(value).length < schema.minProperties
    )
      return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(value).some((k) => !Object.hasOwn(schema.properties ?? {}, k))
    )
      return false;
  }
  if (
    schema.properties &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    for (const [key, s] of Object.entries(schema.properties))
      if (Object.hasOwn(value, key) && !accepts(value[key], s, schemas))
        return false;
  if (schema.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
    )
      return false;
    if (
      schema.uniqueItems &&
      new Set(value.map((x) => JSON.stringify(x))).size !== value.length
    )
      return false;
    if (value.some((v) => !accepts(v, schema.items, schemas))) return false;
  }
  if (schema.type === "string") {
    if (typeof value !== "string" || value.length < (schema.minLength ?? 0))
      return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (
      schema.format === "uuid" &&
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
    )
      return false;
    if (schema.format === "date" && !isCalendarDate(value)) return false;
    if (
      schema.format === "date-time" &&
      (!value.endsWith("Z") || !Number.isFinite(Date.parse(value)))
    )
      return false;
  }
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (
    ["number", "integer"].includes(schema.type) &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity) ||
      (schema.multipleOf && !Number.isInteger(value / schema.multipleOf)) ||
      (schema.type === "integer" && !Number.isInteger(value)))
  )
    return false;
  return true;
}

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
  const evidence = resolve(
    root,
    ".agent-runs/MKW-PRODUCT-001/task5-attendance/contract-consumer",
  );
  await mkdir(evidence, { recursive: true });
  const path = resolve(evidence, "fixture-consumer.ts");
  const generated = relative(
    evidence,
    resolve(root, "apps/web/src/shared/api/generated/schema.js"),
  ).replaceAll("\\", "/");
  await writeFile(
    path,
    `import type { components } from "${generated}";\n${typed.join("\n")}\n// @ts-expect-error unknown operation discriminator\nconst bad: components["schemas"]["WriteAttendanceDto"] = { operation: {type: "invented"} };\nvoid bad;\n`,
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
    "Complete JSON fixtures must typecheck against generated web contract; see retained typecheck.log",
  );
});
