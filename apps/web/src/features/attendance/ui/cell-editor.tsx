import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { formatAttendanceValue, parseNumberInput } from "../model/number-input";
import type {
  CellSnapshotDto,
  CellValueDto,
  EmployeeDto,
} from "../model/types";
import type { EditingCell } from "../model/attendance-draft";

export interface CellEditorIntent {
  cell: CellSnapshotDto;
  value: CellValueDto;
  reminder: boolean;
  raw: string;
}
export function CellEditor({
  cell,
  employee,
  onSubmit,
  onCancel,
  submitLabel = "Lưu",
  blockedReason,
  editing,
  onEdit,
  pending = false,
}: {
  cell: CellSnapshotDto;
  employee: EmployeeDto;
  onSubmit: (intent: CellEditorIntent, advance?: "enter" | "tab") => void;
  onCancel: () => void;
  submitLabel?: string;
  blockedReason?: string | undefined;
  editing?: EditingCell | undefined;
  onEdit?:
    | ((
        fields: Partial<
          Pick<EditingCell, "raw" | "reminder" | "custom" | "error">
        >,
      ) => void)
    | undefined;
  pending?: boolean;
}) {
  const id = useId();
  const [localRaw, localSetRaw] = useState(formatAttendanceValue(cell.value));
  const [localReminder, localSetReminder] = useState(cell.reminder);
  const [localCustom, localSetCustom] = useState(
    cell.value?.type === "number" && cell.value.value > 2.5,
  );
  const [localError, localSetError] = useState("");
  const raw = editing?.raw ?? localRaw;
  const reminder = editing?.reminder ?? localReminder;
  const custom = editing?.custom ?? localCustom;
  const error = editing?.error ?? localError;
  const setRaw = (value: string) =>
    onEdit ? onEdit({ raw: value }) : localSetRaw(value);
  const setReminder = (value: boolean) =>
    onEdit ? onEdit({ reminder: value }) : localSetReminder(value);
  const setCustom = (value: boolean) =>
    onEdit ? onEdit({ custom: value }) : localSetCustom(value);
  const setError = (value: string) =>
    onEdit ? onEdit({ error: value }) : localSetError(value);
  const title = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const work = cell.kind === "work";
  useEffect(() => {
    title.current?.focus();
  }, []);
  function save(event: FormEvent, advance?: "enter" | "tab") {
    event.preventDefault();
    if (blockedReason || pending) return;
    const parsed = parseNumberInput(raw, cell.kind);
    if (!parsed.valid) {
      setError(parsed.message);
      input.current?.focus();
      return;
    }
    onSubmit({ cell, value: parsed.value, reminder, raw }, advance);
  }
  function inputKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (blockedReason || pending) return; // Native Tab remains available, including Hủy.
    // Shift+Tab and Tab on all other controls keep normal browser navigation.
    if (event.key === "Tab" && !event.shiftKey) {
      const parsed = parseNumberInput(raw, cell.kind);
      if (!parsed.valid) {
        setError(parsed.message);
        return; // Keep raw, let native Tab reach reminder/cancel; no focus trap.
      }
    }
    if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey))
      save(event, event.key === "Enter" ? "enter" : "tab");
  }
  function choose(value: string) {
    setRaw(value);
    setError("");
    setCustom(false);
  }
  return (
    <section className="editor" aria-labelledby={`${id}-person`}>
      <div className="editor-top">
        <div>
          <h2 ref={title} tabIndex={-1} id={`${id}-person`}>
            {employee.name}
          </h2>
          <p className="editor-identity">ID {employee.id}</p>
          <p>
            {cell.date.split("-").toReversed().join("/")} ·{" "}
            {work ? "Công" : "Tăng ca"}
          </p>
        </div>
        <span className="unit">{work ? "Số công" : "Số giờ tăng ca"}</span>
      </div>
      <form onSubmit={save} noValidate aria-busy={pending}>
        <fieldset disabled={pending} className="editor-fields">
          {blockedReason && (
            <p className="error" role="alert">
              {blockedReason}
            </p>
          )}
          <span className="field-label" id={`${id}-values`}>
            Chọn {work ? "số công" : "số giờ"}
          </span>
          <div className="values" role="group" aria-labelledby={`${id}-values`}>
            {["0,5", "1", "1,5", "2", "2,5"].map((value) => (
              <Button
                key={value}
                aria-pressed={!custom && raw === value}
                onClick={() => choose(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <div className="secondary">
            {work && (
              <Button aria-pressed={raw === "F"} onClick={() => choose("F")}>
                F · Nghỉ
              </Button>
            )}
            <Button aria-pressed={raw === ""} onClick={() => choose("")}>
              Để trống
            </Button>
            <Button
              aria-expanded={custom}
              aria-controls={`${id}-custom`}
              onClick={() => {
                setCustom(true);
                queueMicrotask(() => input.current?.focus());
              }}
            >
              Tùy chỉnh
            </Button>
          </div>
          {custom && (
            <div className="custom" id={`${id}-custom`}>
              <label className="field-label" htmlFor={`${id}-value`}>
                {work ? "Số công" : "Số giờ"} tùy chỉnh
              </label>
              <Input
                ref={input}
                id={`${id}-value`}
                type="text"
                inputMode="decimal"
                value={raw}
                aria-invalid={Boolean(error)}
                aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setError("");
                }}
                onKeyDown={inputKeys}
              />
              <p className="help" id={`${id}-help`}>
                Tối đa {work ? "30 công" : "24 giờ"}, bước 0,5.{" "}
                {work
                  ? "Nhập 0 chuyển thành F · nghỉ cả ngày."
                  : "Không tăng ca: chọn Để trống."}{" "}
                Enter: xuống người tiếp theo; Tab: ô kế tiếp.
              </p>
            </div>
          )}
          {error && (
            <p className="error" role="alert" id={`${id}-error`}>
              {error}
            </p>
          )}
          <label className="reminder">
            <input
              type="checkbox"
              checked={reminder}
              onChange={(event) => setReminder(event.target.checked)}
            />
            <span>
              Nhắc kiểm tra ô này
              <small>
                Tô xanh để nhớ hỏi lại.
                <br />
                Giá trị vẫn được cộng vào tổng.
              </small>
            </span>
          </label>
          <div className="actions">
            <Button onClick={onCancel}>Hủy</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={Boolean(blockedReason) || pending}
            >
              {submitLabel}
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
