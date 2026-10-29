import { calendarMonth, isCalendarDate } from "../employees/index.js";
import type { CellExpectation, CellKey } from "./attendance.types.js";
import { cellId } from "./attendance.types.js";
import { attendanceError, invalidInput } from "./attendance-errors.js";
import type {
  ReconcileRequestDto,
  WriteAttendanceDto,
} from "./attendance.dto.js";

// Runtime DTO parsers validate the unconverted JSON before the use case. Shape
// checks are recursive, including discriminators; null is never omission.
function shape(
  value: unknown,
  required: string[],
  optional: string[] = [],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some(
      (k) => !required.includes(k) && !optional.includes(k),
    )
  )
    invalidInput();
}
function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return invalidInput();
  return value.toLowerCase();
}
function revision(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length) invalidInput();
}
function list(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) invalidInput();
}
function unique(keys: string[], code = "INVALID_INPUT") {
  if (new Set(keys).size !== keys.length)
    attendanceError(400, code, "Danh sách có định danh trùng lặp.");
}
function parseKey(
  input: unknown,
  expectation = false,
): CellKey | CellExpectation {
  shape(input, [
    "employeeId",
    "date",
    "kind",
    ...(expectation ? ["expectedRevision"] : []),
  ]);
  const employeeId = uuid(input.employeeId);
  if (
    typeof input.date !== "string" ||
    !isCalendarDate(input.date) ||
    (input.kind !== "work" && input.kind !== "overtime")
  )
    return invalidInput();
  if (expectation) revision(input.expectedRevision);
  return {
    employeeId,
    date: input.date,
    kind: input.kind,
    ...(expectation
      ? { expectedRevision: input.expectedRevision as string }
      : {}),
  };
}
function parseValue(value: unknown) {
  if (value === null) return;
  shape(value, ["type"], ["value"]);
  if (value.type === "absence") {
    if (Object.hasOwn(value, "value")) invalidInput();
  } else if (
    value.type !== "number" ||
    typeof value.value !== "number" ||
    !Number.isFinite(value.value)
  )
    invalidInput();
}
export function parseMonth(input: unknown): string {
  if (typeof input !== "string") return invalidInput();
  try {
    calendarMonth(input);
  } catch {
    return invalidInput();
  }
  return input;
}
export function parseMonthQuery(input: unknown) {
  shape(input, ["month"]);
  return parseMonth(input.month);
}
export function parseReconcile(input: unknown): ReconcileRequestDto {
  shape(input, ["employeeIds", "cells"]);
  list(input.employeeIds);
  list(input.cells);
  const employeeIds = input.employeeIds.map(uuid),
    cells = input.cells.map((k) => parseKey(k));
  if (!employeeIds.length && !cells.length) invalidInput();
  unique(employeeIds);
  unique(cells.map(cellId));
  return { employeeIds, cells };
}
export function parseWrite(input: unknown): WriteAttendanceDto {
  shape(
    input,
    ["month", "expectedEmployees", "targets", "operation"],
    ["source"],
  );
  const month = parseMonth(input.month);
  list(input.targets);
  list(input.expectedEmployees);
  if (!input.targets.length || !input.expectedEmployees.length) invalidInput();
  const targets = input.targets.map(
    (k) => parseKey(k, true) as CellExpectation,
  );
  unique(targets.map(cellId), "DUPLICATE_TARGET");
  const expectedEmployees = input.expectedEmployees.map((e) => {
    shape(e, ["employeeId", "expectedRevision"]);
    revision(e.expectedRevision);
    return {
      employeeId: uuid(e.employeeId),
      expectedRevision: e.expectedRevision,
    };
  });
  unique(expectedEmployees.map((e) => e.employeeId));
  const operation = input.operation;
  shape(operation, ["type"], ["value", "mode", "reminder", "patch"]);
  if (operation.type === "set-value") {
    shape(operation, ["type", "value", "mode"]);
    parseValue(operation.value);
    if (operation.mode !== "fill-empty" && operation.mode !== "replace")
      invalidInput();
  } else if (operation.type === "set-reminder") {
    shape(operation, ["type", "reminder"]);
    if (typeof operation.reminder !== "boolean") invalidInput();
  } else if (operation.type === "patch-cell") {
    shape(operation, ["type", "patch"]);
    shape(operation.patch, [], ["value", "reminder"]);
    if (!Object.keys(operation.patch).length) invalidInput();
    if (Object.hasOwn(operation.patch, "value"))
      parseValue(operation.patch.value);
    if (
      Object.hasOwn(operation.patch, "reminder") &&
      typeof operation.patch.reminder !== "boolean"
    )
      invalidInput();
  } else invalidInput();
  if (
    operation.type !== "set-value" &&
    (targets.length !== 1 || Object.hasOwn(input, "source"))
  )
    invalidInput();
  const source = Object.hasOwn(input, "source")
    ? (parseKey(input.source, true) as CellExpectation)
    : undefined;
  const involved = [...targets, ...(source ? [source] : [])];
  const ids = new Set(involved.map((k) => k.employeeId));
  if (
    ids.size !== expectedEmployees.length ||
    expectedEmployees.some((e) => !ids.has(e.employeeId))
  )
    invalidInput();
  if (
    involved.some(
      (k) => !k.date.startsWith(month + "-") || k.kind !== targets[0]!.kind,
    ) ||
    (source && targets.some((k) => cellId(k) === cellId(source)))
  )
    attendanceError(
      422,
      "INVALID_TARGET_SCOPE",
      "Nguồn và các ô đích phải khác nhau, cùng tháng và loại bảng.",
    );
  return {
    month,
    expectedEmployees,
    targets,
    operation,
    ...(source ? { source } : {}),
  } as unknown as WriteAttendanceDto;
}
