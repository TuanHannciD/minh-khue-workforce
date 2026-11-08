import { useSyncExternalStore } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { AttendanceDraft } from "../model/attendance-draft";
import { parseNumberInput } from "../model/number-input";
import { SaveFeedback } from "./save-feedback";
export function BulkEditor({
  draft,
  onSaved,
  onCancel,
}: {
  draft: AttendanceDraft;
  onSaved: () => void;
  onCancel: () => void;
}) {
  useSyncExternalStore(draft.subscribe, draft.snapshot);
  const edit = draft.edit!;
  const preview = draft.bulkPreview!;
  const busy = draft.outcome.type === "pending" || draft.reconciling;
  const blocked =
    busy ||
    ["unknown", "conflict"].includes(draft.outcome.type) ||
    !draft.boundary.canWrite(edit.epoch);
  const valid = parseNumberInput(edit.raw, edit.cell.kind).valid;
  return (
    <section className="editor bulk-editor" aria-label="Nhập vùng">
      <h2>{edit.source ? "Điền lặp từ ô nguồn" : "Nhập các ô đã chọn"}</h2>
      <p>
        {edit.month} ·{" "}
        {edit.cell.kind === "work"
          ? "Công · đơn vị công"
          : "Tăng ca · đơn vị giờ"}
      </p>
      {edit.source && (
        <p>
          Nguồn: ID {edit.source.employeeId} · {edit.source.date} · giá trị{" "}
          {edit.raw}. Nguồn chỉ đọc, không chép nhắc.
        </p>
      )}
      <p role="status">
        {preview.selected} ô chọn · {preview.eligible} ô đủ điều kiện ·{" "}
        {preview.skipped} ô N/— bỏ qua · {preview.changed} ô đổi nội dung
      </p>
      <p className="help">
        {edit.mode === "replace"
          ? `Ghi đè nội dung của ${preview.occupied} ô đã có số/F khi Áp dụng.`
          : `Giữ nguyên ${preview.occupied} ô đã có số/F khi chỉ điền ô trống.`}{" "}
        Giữ nhắc riêng của từng đích.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked && valid && preview.eligible)
            void draft.submit().then((saved) => {
              if (saved) onSaved();
            });
        }}
      >
        <fieldset disabled={busy} className="editor-fields">
          <label className="field-label" htmlFor="bulk-mode">
            Chế độ áp dụng
          </label>
          <select
            id="bulk-mode"
            value={edit.mode}
            onChange={(e) =>
              draft.change({ mode: e.target.value as "fill-empty" | "replace" })
            }
          >
            <option value="fill-empty">Chỉ điền ô trống</option>
            <option value="replace">Ghi đè cả vùng</option>
          </select>
          {!edit.source && (
            <>
              <div className="values">
                {[
                  "0,5",
                  "1",
                  "1,5",
                  "2",
                  "2,5",
                  ...(edit.cell.kind === "work" ? ["F"] : []),
                ].map((v) => (
                  <Button
                    key={v}
                    onClick={() => draft.change({ raw: v, error: "" })}
                  >
                    {v}
                  </Button>
                ))}
              </div>
              <label className="field-label" htmlFor="bulk-value">
                {edit.cell.kind === "work" ? "Số công" : "Số giờ"} áp dụng
              </label>
              <Input
                id="bulk-value"
                inputMode="decimal"
                value={edit.raw}
                onChange={(e) =>
                  draft.change({ raw: e.target.value, error: "" })
                }
              />
            </>
          )}
          {edit.error && (
            <p role="alert" className="error">
              {edit.error}
            </p>
          )}
          {!valid && edit.raw && (
            <p role="alert">
              Giữ nguyên nội dung nhập. Dùng bước 0,5 và giới hạn{" "}
              {edit.cell.kind === "work" ? "30 công" : "24 giờ"}.
            </p>
          )}
          {preview.eligible === 0 && (
            <p>
              Không có ô đủ điều kiện; không gửi lưu hoặc xác nhận kết quả cũ.
            </p>
          )}
          <div className="actions">
            <Button onClick={onCancel}>Hủy</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={blocked || !valid || preview.eligible === 0}
            >
              Áp dụng
            </Button>
          </div>
        </fieldset>
      </form>
      <SaveFeedback draft={draft} onSaved={onSaved} />
    </section>
  );
}
