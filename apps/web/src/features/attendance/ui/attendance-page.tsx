import { useRef, useState } from "react";
import { Flag, Maximize, Minimize, Search } from "lucide-react";
import type {
  AttendanceKind,
  MonthDto,
  CellSnapshotDto,
  EmployeeDto,
} from "../model/types";
import {
  cellIdentity,
  nextEligibleCell,
  orderedMonthCells,
} from "../model/month-view";
import { AttendanceGrid } from "./attendance-grid";
import { CellEditor } from "./cell-editor";
import type { CellEditorIntent } from "./cell-editor";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import "./attendance.css";

export interface AttendancePageProps {
  status: "ready" | "loading" | "error";
  month: MonthDto | null;
  onSubmit: (intent: CellEditorIntent) => void;
  onRetry?: () => void;
  submitLabel?: string;
}
export function AttendancePage({
  status,
  month,
  onSubmit,
  onRetry,
  submitLabel,
}: AttendancePageProps) {
  const [kind, setKind] = useState<AttendanceKind>("work");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<{
    cell: CellSnapshotDto;
    employee: EmployeeDto;
  } | null>(null);
  const root = useRef<HTMLElement>(null);
  const available = status === "ready" && Boolean(month);
  const employees =
    month?.employees.filter(
      (employee) =>
        employee.name
          .toLocaleLowerCase("vi")
          .includes(search.trim().toLocaleLowerCase("vi")) ||
        employee.id.includes(search.trim()),
    ) ?? [];
  const visibleMonth = month ? { ...month, employees } : null;
  const active = selection?.cell.kind === kind ? selection.cell : null;
  const employee = selection?.employee;
  const currentEmployee = month?.employees.find(
    (person) => person.id === active?.employeeId,
  );
  const currentCell =
    active &&
    month?.cells.find((cell) => cellIdentity(cell) === cellIdentity(active));
  // Keep the original draft baseline. Never silently rebase an open editor.
  const baselineMatches =
    active &&
    currentCell &&
    currentEmployee &&
    currentEmployee.revision === employee?.revision &&
    currentCell.state === "editable" &&
    currentCell.revision === active.revision &&
    currentCell.reminder === active.reminder &&
    currentCell.value?.type === active.value?.type &&
    (currentCell.value?.type !== "number" ||
      (active.value?.type === "number" &&
        currentCell.value.value === active.value.value));
  const blockedReason =
    active && available && !baselineMatches
      ? "Ô hoặc nhân sự đã thay đổi trong bảng tháng. Phần nhập được giữ; chọn Hủy khi muốn đóng phần nhập và kiểm tra lại dữ liệu."
      : undefined;
  function focusCell(cell: CellSnapshotDto | null) {
    queueMicrotask(() => {
      const button = Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-cell]",
        ) ?? [],
      ).find((target) => target.dataset.cell === (cell && cellIdentity(cell)));
      button?.focus();
      button?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  }
  function submit(intent: CellEditorIntent, advance?: "enter" | "tab") {
    if (!available || !visibleMonth || blockedReason) return;
    onSubmit(intent); // Pure UI intent; caller owns persistence and feedback.
    const ordered = orderedMonthCells(visibleMonth, kind);
    const next = advance
      ? nextEligibleCell(ordered, intent.cell, advance)
      : intent.cell;
    setSelection(null);
    focusCell(next ?? intent.cell);
  }
  const tableTitle = `${kind === "work" ? "Công" : "Tăng ca"} tháng ${Number(month?.month.slice(5))}`;
  return (
    <>
      {status === "loading" ? (
        <p role="status" className="empty">
          Đang tải bảng tháng…
        </p>
      ) : (
        !available && (
          <div className="empty">
            <p role="alert">
              Chưa tải được bảng tháng. Vui lòng kiểm tra kết nối.
            </p>
            {onRetry && <Button onClick={onRetry}>Thử lại</Button>}
          </div>
        )
      )}
      <section
        ref={root}
        hidden={!available}
        className={`attendance-screen${expanded ? " expanded" : ""}`}
        aria-label="Chấm công tháng"
      >
        <div className="heading">
          <div>
            <h1>Bảng chấm công</h1>
            <p>Một bảng tháng, đầy đủ công và tăng ca.</p>
          </div>
          <div className="month">
            {month && (
              <>
                Tháng {Number(month.month.slice(5))} / {month.month.slice(0, 4)}
              </>
            )}
          </div>
        </div>
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value as AttendanceKind);
            setSelection(null);
          }}
        >
          <div className="tools">
            <TabsList aria-label="Loại bảng">
              <TabsTrigger value="work" disabled={Boolean(active)}>
                Công
              </TabsTrigger>
              <TabsTrigger value="overtime" disabled={Boolean(active)}>
                Tăng ca
              </TabsTrigger>
            </TabsList>
            <label className="search">
              <Search aria-hidden="true" />
              <Input
                type="search"
                aria-label="Tìm nhân sự"
                placeholder="Tìm nhân sự…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={Boolean(active)}
              />
            </label>
            <Button
              className="expand"
              aria-label={expanded ? "Thu gọn bảng" : "Mở rộng bảng"}
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <Minimize aria-hidden="true" />
              ) : (
                <Maximize aria-hidden="true" />
              )}
              <span>{expanded ? "Thu gọn bảng" : "Mở rộng bảng"}</span>
            </Button>
          </div>
          <TabsContent value={kind} className="workspace">
            <section className="sheet" aria-labelledby="sheet-title">
              <div className="sheet-heading">
                <h2 id="sheet-title">{tableTitle}</h2>
                <span>
                  {employees.length} nhân sự · Đơn vị:{" "}
                  {kind === "work" ? "công" : "giờ"}
                </span>
              </div>
              {visibleMonth && employees.length ? (
                <AttendanceGrid
                  month={visibleMonth}
                  kind={kind}
                  selection={active}
                  onCellIntent={(cell) => {
                    if (!active) {
                      const person = month?.employees.find(
                        (item) => item.id === cell.employeeId,
                      );
                      if (person) setSelection({ cell, employee: person });
                      setExpanded(false);
                    }
                  }}
                />
              ) : (
                <p className="empty">
                  {month?.employees.length
                    ? "Không tìm thấy nhân sự. Thử tên khác hoặc xóa nội dung tìm kiếm."
                    : "Chưa có nhân sự trong tháng này."}
                </p>
              )}
              <div className="legend">
                <span>
                  <Flag className="mark" aria-hidden="true" />
                  Nhắc kiểm tra · vẫn tính tổng
                </span>
                <span>F · Nghỉ cả ngày</span>
                <span>N · Chưa bắt đầu</span>
                <span>— · Đã kết thúc</span>
                <span>
                  Tổng ngày và tháng tính toàn bộ nhân sự, kể cả khi tìm kiếm.
                </span>
              </div>
            </section>
            {active && employee ? (
              <CellEditor
                key={cellIdentity(active)}
                cell={active}
                employee={employee}
                onSubmit={submit}
                onCancel={() => {
                  setSelection(null);
                  focusCell(active);
                }}
                submitLabel={submitLabel ?? "Lưu"}
                blockedReason={blockedReason}
              />
            ) : (
              !expanded && (
                <aside className="editor editor-empty">
                  <h2>Nhập theo ô</h2>
                  <p>
                    Chọn ô để nhập {kind === "work" ? "công" : "giờ tăng ca"} và
                    nhắc kiểm tra.
                  </p>
                  <p className="help">
                    Phím mũi tên di chuyển. Enter mở ô; Tab sang ô kế tiếp. Ô
                    N/— không nhận dữ liệu.
                  </p>
                </aside>
              )
            )}
          </TabsContent>
        </Tabs>
        {active && (
          <p className="help">
            Hoàn tất hoặc Hủy phần nhập hiện tại để chọn ô khác, đổi loại bảng
            hoặc tìm nhân sự.
          </p>
        )}
      </section>
    </>
  );
}
