import type { ReconcileSnapshot } from "../api/attendance";
import type { EditingCell } from "./draft-types";
import { cellIdentity } from "./month-view";
import { eligibleCells, sameValue, type WriteIntent } from "./fill-intent";
import { parseNumberInput } from "./number-input";

// A recovery read is kept separately. This builder runs only after an explicit
// choice; it cannot change the draft, selected keys, or fill-empty/replace mode.
export function recoveryBulkIntent(
  edit: EditingCell,
  current: ReconcileSnapshot,
  choice: "draft" | "current",
): WriteIntent | null {
  const bulk = edit.bulk;
  if (!bulk || edit.mode === "patch-cell" || current.missingEmployeeIds.length)
    return null;
  const cells = new Map(current.cells.map((c) => [cellIdentity(c), c]));
  const employees = new Map(current.employees.map((e) => [e.id, e]));
  const required = [...edit.targets, ...(edit.source ? [edit.source] : [])];
  if (
    required.some((t) => !cells.has(cellIdentity(t))) ||
    bulk.intent.expectedEmployees.some((e) => !employees.has(e.employeeId))
  )
    return null;
  const source = edit.source && cells.get(cellIdentity(edit.source));
  if (
    edit.source &&
    (!source || source.state !== "editable" || source.value === null)
  )
    return null;
  const parsed = parseNumberInput(edit.raw, edit.cell.kind);
  if (!parsed.valid && choice === "draft" && !source) return null;
  let value = source ? source.value : parsed.valid ? parsed.value : null;
  const intent: WriteIntent = {
    month: edit.month,
    targets: edit.targets.map((t) => ({
      ...t,
      expectedRevision: cells.get(cellIdentity(t))!.revision,
    })),
    expectedEmployees: bulk.intent.expectedEmployees.map((e) => ({
      employeeId: e.employeeId,
      expectedRevision: employees.get(e.employeeId)!.revision,
    })),
    operation: { type: "set-value", mode: edit.mode, value },
    ...(source
      ? { source: { ...edit.source!, expectedRevision: source.revision } }
      : {}),
  };
  const eligible = eligibleCells(intent, current.cells);
  if (!eligible.length) return null;
  if (choice === "current") {
    value = eligible[0]!.value;
    // The public batch has one value. Never split it or silently replace mode
    // to invent a heterogeneous keep-current operation.
    if (
      eligible.some((c) => !sameValue(c.value, value)) ||
      (source && !sameValue(source.value, value))
    )
      return null;
    intent.operation.value = value;
  }
  return intent;
}
