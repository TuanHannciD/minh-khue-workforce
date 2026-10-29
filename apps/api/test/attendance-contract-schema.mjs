import { isCalendarDate } from "../dist/modules/employees/index.js";

// Small assertion evaluator for the OpenAPI3.0 keywords emitted by these DTOs.
// It exercises the generated schema; it does not share the runtime parser.
export function accepts(value, schema, schemas) {
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
  if (schema.type === "array" || Array.isArray(value)) {
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
    if (schema.items && value.some((v) => !accepts(v, schema.items, schemas)))
      return false;
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
