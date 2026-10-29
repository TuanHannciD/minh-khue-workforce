import { useState } from "react";
import type { AttendanceDraft } from "./attendance-draft";
import type { CellKeyDto, CellSnapshotDto, MonthDto } from "./types";
import { cellIdentity } from "./month-view";
import { rectangleCells, toggleCell, unionCells } from "./cell-selection";
import { formatAttendanceValue } from "./number-input";

export interface SelectionInteraction {
  keys: CellKeyDto[];
  source: CellKeyDto | null;
  choose: (
    cell: CellSnapshotDto,
    modifiers: { add: boolean; extend: boolean },
  ) => boolean;
  canStart: () => boolean;
  commit: (
    keys: CellKeyDto[],
    month: MonthDto,
    source?: CellKeyDto,
    expectedEpoch?: number,
  ) => void;
  preview: (keys: CellKeyDto[] | null) => void;
  append: boolean;
  endpoint: boolean;
  capture: () => MonthDto;
  epoch: number;
}
export function useCellSelection(
  month: MonthDto | null,
  draft: AttendanceDraft | undefined,
  owner: string,
  guard: (action: () => void) => void,
) {
  const [multi, setMulti] = useState(false);
  const [mode, setMode] = useState("cells");
  const [anchor, setAnchor] = useState<CellKeyDto | null>(null);
  const [base, setBase] = useState<CellKeyDto[]>([]);
  const [fill, setFill] = useState<{
    cell: CellSnapshotDto;
    month: MonthDto;
  } | null>(null);
  const [preview, setPreview] = useState<CellKeyDto[] | null>(null);
  const edit = draft?.edit;
  const keys = edit?.bulk ? edit.targets : [];
  function canStart() {
    const currentEdit = draft?.edit;
    if (!draft || !currentEdit) return Boolean(draft);
    const pristine = currentEdit.bulk
      ? currentEdit.raw === "" &&
        currentEdit.mode === "fill-empty" &&
        !currentEdit.source
      : currentEdit.raw === formatAttendanceValue(currentEdit.cell.value) &&
        currentEdit.reminder === currentEdit.cell.reminder;
    if (
      pristine &&
      month?.month === currentEdit.month &&
      [
        ...currentEdit.targets,
        ...(currentEdit.source ? [currentEdit.source] : []),
      ].every((c) => month.employees.some((e) => e.id === c.employeeId)) &&
      draft.outcome.type === "editing" &&
      draft.boundary.canWrite(currentEdit.epoch)
    )
      return true;
    // A discarded guard cannot replay an old pointer sequence.
    guard(() => {
      draft.discard();
      reset();
    });
    return false;
  }
  function capture(snapshot: MonthDto) {
    const previous = draft?.edit;
    const cells = new Map(snapshot.cells.map((c) => [cellIdentity(c), c]));
    const employees = new Map(snapshot.employees.map((e) => [e.id, e]));
    const frozen = previous?.bulk;
    (frozen?.cells ?? (previous ? [previous.cell] : [])).forEach((c) =>
      cells.set(cellIdentity(c), c),
    );
    (frozen?.employees ?? (previous ? [previous.employee] : [])).forEach((e) =>
      employees.set(e.id, e),
    );
    return {
      ...snapshot,
      cells: [...cells.values()],
      employees: snapshot.employees.map((e) => employees.get(e.id)!),
    };
  }
  function reset() {
    setAnchor(null);
    setBase([]);
    setFill(null);
    setPreview(null);
  }
  function commit(
    selected: CellKeyDto[],
    snapshot: MonthDto,
    source?: CellKeyDto,
    expectedEpoch = draft?.boundary.current(),
  ) {
    if (
      !draft ||
      expectedEpoch === undefined ||
      !draft.boundary.canWrite(expectedEpoch) ||
      !canStart()
    )
      return;
    if (
      source &&
      selected.every((c) => cellIdentity(c) === cellIdentity(source))
    ) {
      setPreview(null);
      return;
    }
    const old = draft.edit;
    // Preserve previous selected baselines on union append, including Employee
    // revisions. A polling snapshot must never rebase an existing selection.
    const frozen = old?.bulk;
    const cells = new Map(snapshot.cells.map((c) => [cellIdentity(c), c]));
    const employees = new Map(snapshot.employees.map((e) => [e.id, e]));
    frozen?.cells.forEach((c) => cells.set(cellIdentity(c), c));
    frozen?.employees.forEach((e) => employees.set(e.id, e));
    const captured = {
      ...snapshot,
      cells: [...cells.values()],
      employees: snapshot.employees.map((e) => employees.get(e.id)!),
    };
    const sourceCell = source && cells.get(cellIdentity(source));
    draft.clear();
    draft.openBulk(
      captured,
      selected.flatMap((k) => {
        const c = cells.get(cellIdentity(k));
        return c ? [c] : [];
      }),
      owner,
      sourceCell,
    );
    setPreview(null);
  }
  const interaction: SelectionInteraction | undefined = draft
    ? {
        keys: preview ?? keys,
        source:
          fill?.cell ??
          edit?.source ??
          (edit && !edit.bulk && edit.cell.value !== null ? edit.cell : null),
        append: multi,
        endpoint: Boolean(fill || (multi && mode === "range")),
        capture: () => capture(month!),
        epoch: draft.boundary.current(),
        preview: setPreview,
        canStart,
        commit,
        choose(cell, modifiers) {
          if (fill && month) {
            if (!canStart()) return true;
            commit(
              rectangleCells(fill.month, fill.cell, cell),
              fill.month,
              fill.cell,
            );
            setFill(null);
            setAnchor(null);
            return true;
          }
          if (!multi && !modifiers.add && !modifiers.extend) return false;
          if (!month || !canStart()) return true;
          if (modifiers.extend && (anchor || edit)) {
            const start = anchor ?? edit!.cell;
            commit(rectangleCells(month, start, cell), month);
            setAnchor(start);
          } else if (modifiers.add || mode === "cells") {
            const current = edit?.bulk
              ? keys
              : modifiers.add && edit
                ? [edit.cell]
                : [];
            commit(toggleCell(current, cell), month);
            setAnchor(cell);
          } else if (anchor) {
            commit(
              unionCells(base, rectangleCells(month, anchor, cell)),
              month,
            );
            setAnchor(null);
          } else {
            setAnchor(cell);
            commit(unionCells(base, [cell]), month);
          }
          return true;
        },
      }
    : undefined;
  function startFill() {
    if (!month || !edit || !canStart()) return;
    const source = month.cells.find(
      (c) => cellIdentity(c) === cellIdentity(edit.cell),
    );
    if (
      !source ||
      source.state !== "editable" ||
      source.value === null ||
      !month.employees.some((e) => e.id === source.employeeId)
    )
      return;
    setFill({
      cell: structuredClone(edit.cell),
      month: structuredClone(capture(month)),
    });
    setAnchor(null);
  }
  function changeTools(action: () => void) {
    if (!canStart()) return;
    draft?.clear();
    reset();
    action();
  }
  return {
    interaction,
    multi,
    mode,
    waiting: Boolean(fill || anchor),
    reset,
    startFill,
    toggleMulti: () =>
      changeTools(() => {
        setMulti(!multi);
        setMode("cells");
      }),
    changeMode: (value: string) => changeTools(() => setMode(value)),
    addRange: () => {
      if (canStart()) {
        setBase([...keys]);
        setAnchor(null);
        setMode("range");
        setMulti(true);
      }
    },
  };
}
