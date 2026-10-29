import type { components } from "@/shared/api/generated/schema";
import type {
  CellKeyDto,
  CellSnapshotDto,
  CellValueDto,
  MonthDto,
} from "./types";
import { cellKey, unionCells, visibleCells } from "./cell-selection";
import { cellIdentity } from "./month-view";
export type WriteIntent = components["schemas"]["SetValueWriteDto"];
export type TargetPreview = components["schemas"]["TargetPreviewDto"];
export const sameValue = (a: CellValueDto, b: CellValueDto) =>
  JSON.stringify(a) === JSON.stringify(b);
export function captureBulkIntent(
  month: MonthDto,
  selected: CellKeyDto[],
  value: CellValueDto,
  mode: WriteIntent["operation"]["mode"],
  source?: CellKeyDto,
): WriteIntent | null {
  const snapshots = new Map(month.cells.map((c) => [cellIdentity(c), c]));
  const sourceCell = source && snapshots.get(cellIdentity(source));
  if (
    source &&
    (!sourceCell ||
      sourceCell.state !== "editable" ||
      sourceCell.value === null ||
      !visibleCells(month, [source]).length)
  )
    return null;
  const cells = visibleCells(month, selected).filter(
    (c) => !source || cellIdentity(c) !== cellIdentity(source),
  );
  if (
    !cells.length ||
    cells.some((c) => c.kind !== cells[0]!.kind) ||
    (source && source.kind !== cells[0]!.kind)
  )
    return null;
  const ids = new Set(
    unionCells(cells, source ? [source] : []).map((c) => c.employeeId),
  );
  const expectation = (cell: CellKeyDto) => ({
    ...cellKey(cell),
    expectedRevision: snapshots.get(cellIdentity(cell))!.revision,
  });
  return {
    month: month.month,
    expectedEmployees: month.employees
      .filter((e) => ids.has(e.id))
      .map((e) => ({ employeeId: e.id, expectedRevision: e.revision })),
    targets: cells.map(expectation),
    operation: {
      type: "set-value",
      mode,
      value: structuredClone(sourceCell ? sourceCell.value : value),
    },
    ...(source ? { source: expectation(source) } : {}),
  };
}
export function eligibleCells(intent: WriteIntent, cells: CellSnapshotDto[]) {
  const map = new Map(cells.map((c) => [cellIdentity(c), c]));
  return intent.targets.flatMap((t) => {
    const c = map.get(cellIdentity(t));
    return c?.state === "editable" &&
      (intent.operation.mode === "replace" || c.value === null)
      ? [c]
      : [];
  });
}
export function previewTargets(
  intent: WriteIntent,
  month: Pick<MonthDto, "cells">,
): TargetPreview {
  const eligible = eligibleCells(intent, month.cells);
  const selected = new Set(intent.targets.map(cellIdentity));
  return {
    selected: selected.size,
    eligible: eligible.length,
    skipped: month.cells.filter(
      (c) => selected.has(cellIdentity(c)) && c.state !== "editable",
    ).length,
    changed: eligible.filter((c) => !sameValue(c.value, intent.operation.value))
      .length,
  };
}
