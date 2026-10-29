import type {
  AttendanceKind,
  CellKeyDto,
  CellSnapshotDto,
  MonthDto,
} from "../model/types";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { AttendanceRow } from "./attendance-row";
import {
  cellIdentity,
  monthDays,
  nextEligibleCell,
  orderedMonthCells,
} from "../model/month-view";
import { formatAttendanceValue } from "../model/number-input";
import type { SelectionInteraction } from "../model/use-cell-selection";
import { useGridGesture } from "./use-grid-gesture";
export interface AttendanceGridProps {
  month: MonthDto;
  kind?: AttendanceKind;
  selection: CellKeyDto | null;
  onCellIntent: (cell: CellSnapshotDto) => void;
  interaction?: SelectionInteraction | undefined;
  onFill?: (() => void) | undefined;
}
export function AttendanceGrid({
  month,
  kind = "work",
  selection,
  onCellIntent,
  interaction,
  onFill,
}: AttendanceGridProps) {
  const region = useRef<HTMLDivElement>(null);
  const gesture = useGridGesture(region, month, interaction, kind);
  // Structural projections only change with a new snapshot/filter/kind. Raw
  // editor state remains in its subscriber, never a second server-state cache.
  const {
    month: monthKey,
    cells: monthCells,
    employees,
    totals: monthTotals,
  } = month;
  const projection = useMemo(() => {
    const days = monthDays(monthKey);
    const cells = new Map(monthCells.map((cell) => [cellIdentity(cell), cell]));
    const totals = monthTotals[kind];
    const employeeTotals = new Map(
      totals.byEmployee.map((total) => [total.employeeId, total.value]),
    );
    return {
      days,
      cells,
      totals,
      ordered: orderedMonthCells(
        { month: monthKey, cells: monthCells, employees },
        kind,
      ),
      dayTotals: new Map(
        totals.byDate.map((total) => [total.date, total.value]),
      ),
      rows: employees.map((employee) => ({
        employee,
        total: employeeTotals.get(employee.id) ?? 0,
        cells: days.map((day) =>
          cells.get(
            cellIdentity({ employeeId: employee.id, date: day.date, kind }),
          ),
        ),
      })),
    };
  }, [monthKey, monthCells, employees, monthTotals, kind]);
  const { days, cells, ordered, totals, dayTotals } = projection;
  const unit = kind === "work" ? "công" : "giờ";
  const selectedByEmployee = new Map<string, string[]>();
  for (const cell of [
    ...(selection ? [selection] : []),
    ...(interaction?.keys ?? []),
  ]) {
    if (cell.kind !== kind) continue;
    const dates = selectedByEmployee.get(cell.employeeId) ?? [];
    dates.push(cell.date);
    selectedByEmployee.set(cell.employeeId, dates);
  }
  // Stable DOM dispatchers forward to the latest committed props. No custom
  // memo comparator hides callbacks, owner, session epoch or generation changes.
  const latest = useRef({ onCellIntent, onFill, interaction, ordered });
  useLayoutEffect(() => {
    latest.current = { onCellIntent, onFill, interaction, ordered };
  });
  const intent = useCallback(
    (cell: CellSnapshotDto) => latest.current.onCellIntent(cell),
    [],
  );
  const fill = useCallback(() => latest.current.onFill?.(), []);
  const number = (value: number) =>
    formatAttendanceValue({ type: "number", value });
  const navigate = useCallback(function navigate(
    event: KeyboardEvent<HTMLButtonElement>,
    cell: CellSnapshotDto,
  ) {
    const { interaction, ordered } = latest.current;
    if (
      interaction &&
      ((event.key === " " && (event.ctrlKey || event.metaKey)) ||
        ((event.key === "Enter" || event.key === " ") &&
          (interaction.append || interaction.endpoint || event.shiftKey)))
    ) {
      event.preventDefault();
      interaction.choose(cell, {
        add: event.ctrlKey || event.metaKey,
        extend: event.shiftKey,
      });
      return;
    }
    const direction =
      event.key === "ArrowDown"
        ? "enter"
        : event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)
          ? "tab"
          : null;
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!direction && !backward) return;
    const next = nextEligibleCell(
      backward ? ordered.toReversed() : ordered,
      cell,
      event.key === "ArrowUp" ? "enter" : (direction ?? "tab"),
    );
    if (!next) return; // Tab at the edge leaves the table normally.
    event.preventDefault();
    const target = Array.from(
      region.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-cell]",
      ) ?? [],
    ).find((button) => button.dataset.cell === cellIdentity(next));
    target?.focus();
    if (event.shiftKey && interaction)
      interaction.choose(next, { add: false, extend: true });
  }, []);
  return (
    <div
      ref={region}
      className={`grid-scroll${gesture.active ? " selection-dragging" : ""}`}
      onClickCapture={(event) => {
        if (gesture.consumeClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (
          event.target instanceof Element &&
          event.target.closest("[data-fill]")
        )
          return;
        const button =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-position]")
            : null;
        const cell = button && cells.get(button.dataset.position!);
        if (
          cell &&
          interaction?.choose(cell, {
            add: event.ctrlKey || event.metaKey,
            extend: event.shiftKey,
          })
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      tabIndex={0}
      role="region"
      aria-label="Bảng tháng, cuộn để xem thêm ngày và nhân sự"
    >
      <table>
        <caption>
          {kind === "work" ? "Công" : "Tăng ca"} tháng {month.month}, đơn vị{" "}
          {unit}. Tổng ngày tính toàn bộ nhân sự, kể cả khi tìm kiếm.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="name">
              Nhân sự
            </th>
            {days.map((day) => (
              <th scope="col" key={day.date}>
                {day.day} <small>{day.weekday}</small>
              </th>
            ))}
            <th scope="col" className="total">
              Tổng<small>{unit}</small>
            </th>
          </tr>
        </thead>
        <tbody>
          {projection.rows.map((row) => (
            <AttendanceRow
              key={row.employee.id}
              row={row}
              days={days}
              unit={unit}
              selectedDates={(
                selectedByEmployee.get(row.employee.id) ?? []
              ).join(",")}
              sourceDate={
                interaction?.source?.kind === kind &&
                interaction.source.employeeId === row.employee.id
                  ? interaction.source.date
                  : null
              }
              selectInactive={Boolean(interaction?.append)}
              onIntent={intent}
              onKeyDown={navigate}
              onFill={onFill ? fill : undefined}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="name">
              Tổng {unit}
            </th>
            {days.map((day) => (
              <td key={day.date} aria-label={`Tổng ${day.date} · ${unit}`}>
                {number(dayTotals.get(day.date) ?? 0)}
              </td>
            ))}
            <td className="total" aria-label={`Tổng tháng · ${unit}`}>
              {number(totals.grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
