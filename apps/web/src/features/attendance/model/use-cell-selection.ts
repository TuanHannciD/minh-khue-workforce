import type { AttendanceReadView } from "./attendance-read-view";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AttendanceDraft } from "./attendance-draft";
import type { CellKeyDto, CellSnapshotDto } from "./types";
import { cellIdentity } from "./month-view";
import {
  rectangleCells,
  toggleCell,
  unionCells,
  visibleCells,
} from "./cell-selection";
import { formatAttendanceValue } from "./number-input";

export interface SelectionInteraction {
  contextKey: string;
  keys: CellKeyDto[];
  source: CellKeyDto | null;
  choose: (
    cell: CellSnapshotDto,
    modifiers: { add: boolean; extend: boolean },
  ) => boolean;
  canStart: () => boolean;
  commit: (
    keys: CellKeyDto[],
    month: AttendanceReadView,
    source?: CellKeyDto,
    expectedEpoch?: number,
  ) => void;
  preview: (keys: CellKeyDto[] | null) => void;
  append: boolean;
  endpoint: boolean;
  capture: () => AttendanceReadView;
  epoch: number;
  generation: number;
}
export function useCellSelection(
  month: AttendanceReadView | null,
  draft: AttendanceDraft | undefined,
  owner: string,
  guard: (action: () => void) => void,
  requestedContextKey?: string,
) {
  const contextKey = JSON.stringify([
    requestedContextKey,
    month?.month,
    month?.employees.map((e) => e.id),
  ]);
  const [multi, setMulti] = useState(false);
  const [mode, setMode] = useState("cells");
  const [anchor, setAnchor] = useState<CellKeyDto | null>(null);
  const [base, setBase] = useState<CellKeyDto[]>([]);
  const [fill, setFill] = useState<{
    cell: CellSnapshotDto;
    month: AttendanceReadView;
  } | null>(null);
  const [preview, setPreview] = useState<CellKeyDto[] | null>(null);
  const generation = draft?.ownerGeneration;
  const epoch = draft?.boundary.current();
  const lease = useMemo(
    () => ({ draft, owner, contextKey, generation, epoch }),
    [draft, owner, contextKey, generation, epoch],
  );
  const current = useRef<typeof lease | null>(null);
  useLayoutEffect(() => {
    current.current = lease;
    return () => {
      current.current = null;
    };
  }, [lease]);
  const [lifetime, setLifetime] = useState({
    draft,
    owner,
    generation,
    epoch,
    contextKey,
  });
  // Pending decisions belong to one owner lifetime, never a later editor or
  // reauthenticated lease. Internal selection commits explicitly renew it.
  if (
    lifetime.draft !== draft ||
    lifetime.owner !== owner ||
    lifetime.generation !== generation ||
    lifetime.epoch !== epoch ||
    lifetime.contextKey !== contextKey
  ) {
    setLifetime({ draft, owner, generation, epoch, contextKey });
    reset();
  }
  const edit = draft?.edit;
  const keys = edit?.bulk ? edit.targets : [];
  function isCurrent() {
    return Boolean(
      draft &&
      current.current === lease &&
      draft.ownerGeneration === generation &&
      draft.boundary.canWrite(epoch),
    );
  }
  function canStart() {
    if (
      !month ||
      !draft ||
      !isCurrent() ||
      draft.outcome.type === "pending" ||
      draft.reconciling
    )
      return false;
    const currentEdit = draft?.edit;
    if (!currentEdit) return true;
    const pristine =
      !currentEdit.error &&
      currentEdit.reminder === currentEdit.cell.reminder &&
      (currentEdit.bulk
        ? !currentEdit.custom &&
          currentEdit.raw === "" &&
          currentEdit.mode === "fill-empty" &&
          !currentEdit.source
        : currentEdit.raw === formatAttendanceValue(currentEdit.cell.value) &&
          currentEdit.custom ===
            (currentEdit.cell.value?.type === "number" &&
              currentEdit.cell.value.value > 2.5));
    if (
      pristine &&
      month?.month === currentEdit.month &&
      [
        ...currentEdit.targets,
        ...(currentEdit.source ? [currentEdit.source] : []),
      ].every((c) => visibleCells(month, [c]).length === 1) &&
      draft.outcome.type === "editing" &&
      draft.boundary.canWrite(currentEdit.epoch)
    )
      return true;
    // A discarded guard cannot replay an old pointer sequence.
    reset();
    guard(() => {
      if (isCurrent() && draft.discard()) reset();
    });
    return false;
  }
  function capture(snapshot: AttendanceReadView) {
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
      cells: snapshot.cells.map((c) => cells.get(cellIdentity(c))!),
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
    snapshot: AttendanceReadView,
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
    // A captured selection is page-local. Never silently intersect a frozen
    // intent with new membership, or clear it before discovering a hidden key.
    if (
      [snapshot, month!].some(
        (view) =>
          visibleCells(view, selected).length !==
            unionCells([], selected).length ||
          (source && !visibleCells(view, [source]).length),
      )
    )
      return;
    if (
      source &&
      selected.every((c) => cellIdentity(c) === cellIdentity(source))
    ) {
      setPreview(null);
      return;
    }
    // Preserve previous selected baselines on union append, including Employee
    // revisions. A polling snapshot must never rebase an existing selection.
    const captured = capture(snapshot);
    const cells = new Map(captured.cells.map((c) => [cellIdentity(c), c]));
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
    setLifetime({
      draft,
      owner,
      generation: draft.ownerGeneration,
      epoch: draft.boundary.current(),
      contextKey,
    });
    setPreview(null);
  }
  const interaction: SelectionInteraction | undefined =
    draft && month
      ? {
          contextKey,
          keys: preview ?? keys,
          source:
            fill?.cell ??
            edit?.source ??
            (edit && !edit.bulk && edit.cell.value !== null ? edit.cell : null),
          append: multi,
          endpoint: Boolean(fill || (multi && mode === "range")),
          capture: () => capture(month!),
          epoch: draft.boundary.current(),
          generation: draft.ownerGeneration,
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
