import type {
  AttendanceKind,
  CellKeyDto,
  CellSnapshotDto,
  MonthDto,
} from "../model/types";
import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { AttendanceCell } from "./attendance-cell";
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
  const days = monthDays(month.month);
  const unit = kind === "work" ? "công" : "giờ";
  const cells = new Map(month.cells.map((cell) => [cellIdentity(cell), cell]));
  const ordered = orderedMonthCells(month, kind);
  const totals = month.totals[kind];
  const employeeTotals = new Map(
    totals.byEmployee.map((total) => [total.employeeId, total.value]),
  );
  const dayTotals = new Map(
    totals.byDate.map((total) => [total.date, total.value]),
  );
  const number = (value: number) =>
    formatAttendanceValue({ type: "number", value });
  function navigate(
    event: KeyboardEvent<HTMLButtonElement>,
    cell: CellSnapshotDto,
  ) {
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
  }
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
          {month.employees.map((employee) => (
            <tr key={employee.id}>
              <th
                scope="row"
                className="name"
                title={`${employee.name} · ID ${employee.id}`}
              >
                <span className="employee-name">{employee.name}</span>
                <small>ID …{employee.id.slice(-4)}</small>
              </th>
              {days.map((day) => {
                const cell = cells.get(
                  cellIdentity({
                    employeeId: employee.id,
                    date: day.date,
                    kind,
                  }),
                );
                return cell ? (
                  <AttendanceCell
                    key={day.date}
                    cell={cell}
                    employee={employee}
                    selected={
                      (selection !== null &&
                        cellIdentity(selection) === cellIdentity(cell)) ||
                      Boolean(
                        interaction?.keys.some(
                          (c) => cellIdentity(c) === cellIdentity(cell),
                        ),
                      )
                    }
                    selectInactive={Boolean(interaction?.append)}
                    onFill={
                      interaction?.source &&
                      cellIdentity(interaction.source) === cellIdentity(cell)
                        ? onFill
                        : undefined
                    }
                    onIntent={onCellIntent}
                    onKeyDown={navigate}
                  />
                ) : (
                  <td key={day.date} aria-label="Dữ liệu ô còn thiếu">
                    ?
                  </td>
                );
              })}
              <td
                className="total"
                aria-label={`Tổng ${employee.name} · ID ${employee.id} · ${unit}`}
              >
                {number(employeeTotals.get(employee.id) ?? 0)}
              </td>
            </tr>
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
