import { memo, type KeyboardEvent } from "react";
import type { CellSnapshotDto, EmployeeDto } from "../model/types";
import type { monthDays } from "../model/month-view";
import { formatAttendanceValue } from "../model/number-input";
import { AttendanceCell } from "./attendance-cell";

// Default memo compares every prop, including callbacks. A new snapshot row,
// selection, source or interaction mode always reaches its cells.
export const AttendanceRow = memo(function AttendanceRow({
  row,
  days,
  unit,
  selectedDates,
  sourceDate,
  selectInactive,
  onIntent,
  onKeyDown,
  onFill,
}: {
  row: {
    employee: EmployeeDto;
    cells: (CellSnapshotDto | undefined)[];
    total: number;
  };
  days: ReturnType<typeof monthDays>;
  unit: string;
  selectedDates: string;
  sourceDate: string | null;
  selectInactive: boolean;
  onIntent: (cell: CellSnapshotDto) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    cell: CellSnapshotDto,
  ) => void;
  onFill: (() => void) | undefined;
}) {
  const { employee } = row;
  const selected = new Set(selectedDates.split(","));
  return (
    <tr>
      <th
        scope="row"
        className="name"
        title={`${employee.name} · ID ${employee.id}`}
      >
        <span className="employee-name">{employee.name}</span>
        <small>ID …{employee.id.slice(-4)}</small>
      </th>
      {row.cells.map((cell, index) =>
        cell ? (
          <AttendanceCell
            key={days[index]!.date}
            cell={cell}
            employee={employee}
            selected={selected.has(cell.date)}
            selectInactive={selectInactive}
            onFill={cell.date === sourceDate ? onFill : undefined}
            onIntent={onIntent}
            onKeyDown={onKeyDown}
          />
        ) : (
          <td key={days[index]!.date} aria-label="Dữ liệu ô còn thiếu">
            ?
          </td>
        ),
      )}
      <td
        className="total"
        aria-label={`Tổng ${employee.name} · ID ${employee.id} · ${unit}`}
      >
        {formatAttendanceValue({ type: "number", value: row.total })}
      </td>
    </tr>
  );
});
