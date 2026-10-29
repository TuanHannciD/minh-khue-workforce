/**
 * File map: AttendancePage composes the C surface and owns context/focus guards.
 * requestContext/close guard transitions; submit/complete restore cell focus.
 * useCellSelection owns selection; AttendanceGrid owns gesture DOM integration;
 * CellEditor/BulkEditor and SaveFeedback render the app-owned draft lifecycle.
 */
import { useRef, useState, useSyncExternalStore } from "react";
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
import type { AttendanceDraft } from "../model/attendance-draft";
import { SaveFeedback } from "./save-feedback";
import { ConfirmDiscard } from "@/shared/ui/confirm-discard";
import { useCellSelection } from "../model/use-cell-selection";
import { SelectionTools } from "./selection-tools";
import { BulkEditor } from "./bulk-editor";
const noSubscribe = () => () => {};
const noSnapshot = () => 0;

export interface AttendancePageProps {
  status: "ready" | "loading" | "error";
  month: MonthDto | null;
  onSubmit: (intent: CellEditorIntent) => unknown;
  onRetry?: () => void;
  submitLabel?: string;
  draft?: AttendanceDraft;
  ownerUserId?: string;
  onSaved?: () => void;
  onEmployee?: (employee: EmployeeDto) => void;
}
export function AttendancePage({
  status,
  month,
  onSubmit,
  onRetry,
  submitLabel,
  draft,
  ownerUserId,
  onSaved,
  onEmployee,
}: AttendancePageProps) {
  useSyncExternalStore(
    draft?.subscribe ?? noSubscribe,
    draft?.snapshot ?? noSnapshot,
  );
  const [kind, setKind] = useState<AttendanceKind>(
    () => draft?.edit?.cell.kind ?? "work",
  );
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [localSelection, setSelection] = useState<{
    cell: CellSnapshotDto;
    employee: EmployeeDto;
  } | null>(null);
  const selection = draft ? draft.edit : localSelection;
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [guard, setGuard] = useState<{ action: () => void } | null>(null);
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
  const bulk = useCellSelection(
    visibleMonth,
    draft,
    ownerUserId ?? "",
    requestContext,
  );
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
  const blockedReason = draft
    ? draft.edit &&
      (["conflict", "unknown"].includes(draft.outcome.type) ||
        !draft.boundary.canWrite(draft.edit.epoch))
      ? "Phần nhập được giữ. Đối chiếu dữ liệu đã lưu trước khi tạo lần lưu mới."
      : undefined
    : active && available && !baselineMatches
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
  function requestContext(action: () => void) {
    if (pending || draft?.outcome.type === "pending" || draft?.reconciling)
      return;
    if (active && draft) setGuard({ action });
    else action();
  }
  function close() {
    if (draft) draft.discard();
    else setSelection(null);
    bulk.reset();
  }
  function complete(intent: CellEditorIntent, advance?: "enter" | "tab") {
    const ordered = visibleMonth ? orderedMonthCells(visibleMonth, kind) : [];
    const next = advance
      ? nextEligibleCell(ordered, intent.cell, advance)
      : intent.cell;
    setSelection(null);
    bulk.reset();
    focusCell(next ?? intent.cell);
    onSaved?.();
  }
  function submit(intent: CellEditorIntent, advance?: "enter" | "tab") {
    if (!available || !visibleMonth || blockedReason) return;
    if (submitting.current) return;
    const result = draft ? draft.submit() : onSubmit(intent);
    if (result instanceof Promise) {
      submitting.current = true;
      setPending(true);
      void result
        .then((saved) => {
          if (saved !== false) complete(intent, advance);
        })
        .catch(() => {})
        .finally(() => {
          submitting.current = false;
          setPending(false);
        });
    } else complete(intent, advance);
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
          activationMode={active && draft ? "manual" : "automatic"}
          onValueChange={(value) => {
            requestContext(() => {
              close();
              setKind(value as AttendanceKind);
            });
          }}
        >
          <div className="tools">
            <TabsList aria-label="Loại bảng">
              <TabsTrigger value="work" disabled={Boolean(active) && !draft}>
                Công
              </TabsTrigger>
              <TabsTrigger
                value="overtime"
                disabled={Boolean(active) && !draft}
              >
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
                onChange={(event) => {
                  const value = event.target.value;
                  requestContext(() => {
                    close();
                    setSearch(value);
                  });
                }}
                disabled={Boolean(active) && !draft}
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
          {draft && (
            <SelectionTools
              multi={bulk.multi}
              mode={bulk.mode}
              waiting={bulk.waiting}
              onToggle={bulk.toggleMulti}
              onMode={bulk.changeMode}
              onAdd={bulk.addRange}
            />
          )}
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
                  interaction={bulk.interaction}
                  onFill={bulk.startFill}
                  onCellIntent={(cell) => {
                    requestContext(() => {
                      if (!active || draft) {
                        const person = month?.employees.find(
                          (item) => item.id === cell.employeeId,
                        );
                        if (person) {
                          close();
                          if (draft && month && ownerUserId)
                            draft.open(month, cell, ownerUserId);
                          else setSelection({ cell, employee: person });
                        }
                        setExpanded(false);
                      }
                    });
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
            {draft?.edit?.bulk ? (
              <BulkEditor
                draft={draft}
                onSaved={() => {
                  focusCell(active);
                  bulk.reset();
                  onSaved?.();
                }}
                onCancel={() =>
                  requestContext(() => {
                    close();
                    focusCell(active);
                  })
                }
              />
            ) : active && employee ? (
              <div className="editor-column">
                <CellEditor
                  key={cellIdentity(active)}
                  cell={active}
                  employee={employee}
                  onSubmit={submit}
                  onCancel={() => {
                    requestContext(() => {
                      close();
                      focusCell(active);
                    });
                  }}
                  submitLabel={submitLabel ?? "Lưu"}
                  blockedReason={blockedReason}
                  editing={draft?.edit ?? undefined}
                  onEdit={draft ? (fields) => draft.change(fields) : undefined}
                  pending={
                    pending ||
                    draft?.outcome.type === "pending" ||
                    Boolean(draft?.reconciling)
                  }
                />
                {draft && (
                  <SaveFeedback
                    draft={draft}
                    onSaved={() => {
                      focusCell(active);
                      bulk.reset();
                      onSaved?.();
                    }}
                  />
                )}
                {draft && currentCell && !baselineMatches && (
                  <p className="help">
                    Bảng tháng có dữ liệu mới; phần nhập và phiên bản ban đầu
                    vẫn được giữ.
                  </p>
                )}
                {onEmployee && (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      requestContext(() => {
                        close();
                        onEmployee(currentEmployee ?? employee);
                      })
                    }
                  >
                    Sửa thông tin nhân sự
                  </Button>
                )}
                {draft && active.value !== null && (
                  <Button onClick={bulk.startFill}>Điền từ ô này</Button>
                )}
              </div>
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
        {!active && draft && (
          <SaveFeedback draft={draft} onSaved={() => onSaved?.()} />
        )}
        {guard && (
          <ConfirmDiscard
            title="Giữ hay bỏ phần nhập"
            onKeep={() => setGuard(null)}
            onDiscard={() => {
              guard.action();
              setGuard(null);
            }}
          >
            <p>
              Phần nhập đang gắn với {employee?.name}, {active?.date},{" "}
              {active?.kind === "work" ? "Công" : "Tăng ca"}. Giữ phần nhập hoặc
              bỏ trước khi đổi ngữ cảnh.
            </p>
            {draft?.outcome.type === "unknown" && (
              <p>
                Bỏ bản nháp không hủy yêu cầu cũ; kết quả vẫn chưa xác định.
              </p>
            )}
          </ConfirmDiscard>
        )}
      </section>
    </>
  );
}
