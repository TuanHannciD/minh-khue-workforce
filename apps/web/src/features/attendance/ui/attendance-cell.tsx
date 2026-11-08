import { Flag } from "lucide-react";
import { memo, type KeyboardEvent } from "react";
import type { CellSnapshotDto, EmployeeDto } from "../model/types";
import { cellIdentity } from "../model/month-view";
import { formatAttendanceValue } from "../model/number-input";
import { FillHandle } from "./fill-handle";

export const AttendanceCell = memo(function AttendanceCell({
  readOnly = false,
  cell,
  employee,
  selected,
  onIntent,
  onKeyDown,
  onFill,
  selectInactive = false,
}: {
  readOnly?: boolean;
  cell: CellSnapshotDto;
  employee: EmployeeDto;
  selected: boolean;
  onIntent: (cell: CellSnapshotDto) => void;
  onFill?: (() => void) | undefined;
  selectInactive?: boolean;
  onKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    cell: CellSnapshotDto,
  ) => void;
}) {
  const value =
    cell.state === "before-start"
      ? "N"
      : cell.state === "after-end"
        ? "—"
        : formatAttendanceValue(cell.value);
  const label = `${employee.name} · ID ${employee.id} · ${cell.date} · ${cell.kind === "work" ? "Công" : "Tăng ca"} · ${value || "trống"}${cell.reminder ? " · Nhắc kiểm tra, vẫn tính tổng" : ""}`;
  return (
    <td
      data-position={cellIdentity(cell)}
      className={[
        cell.state !== "editable" ? "inactive" : "",
        cell.reminder ? "reminded" : "",
        selected ? "selected" : "",
      ].join(" ")}
    >
      {cell.state === "editable" || selectInactive ? (
        <button
          type="button"
          disabled={readOnly}
          data-cell={cellIdentity(cell)}
          aria-label={label}
          aria-pressed={selected}
          onClick={() => onIntent(cell)}
          onKeyDown={(event) => onKeyDown(event, cell)}
        >
          {value}
          {cell.reminder && (
            <Flag className="reminder-icon" aria-hidden="true" />
          )}
        </button>
      ) : (
        <span aria-label={label}>{value}</span>
      )}
      {!readOnly &&
        onFill &&
        cell.state === "editable" &&
        cell.value !== null && <FillHandle onFill={onFill} />}
    </td>
  );
});
