import type { AttendanceDraft } from "../model/attendance-draft";
import { formatAttendanceValue } from "../model/number-input";
import { Button } from "@/shared/ui/button";
import { cellIdentity } from "../model/month-view";
import { recoveryBulkIntent } from "../model/bulk-recovery";

export function SaveFeedback({
  draft,
  onSaved,
}: {
  draft: AttendanceDraft;
  onSaved: () => void;
}) {
  const edit = draft.edit;
  const current = draft.current?.cells.find(
    (c) => edit && cellIdentity(c) === cellIdentity(edit.cell),
  );
  const comparedCells = draft.current?.cells ?? draft.conflictCells;
  const outcome = draft.outcome;
  const bulk = edit?.bulk;
  const bulkCurrent = bulk && draft.current;
  const source =
    edit?.source &&
    draft.current?.cells.find(
      (c) => cellIdentity(c) === cellIdentity(edit.source!),
    );
  const needsRecovery =
    edit &&
    (outcome.type === "unknown" ||
      outcome.type === "conflict" ||
      !draft.boundary.canWrite(edit.epoch));
  const busy = outcome.type === "pending" || draft.reconciling;
  async function recover(choice: "draft" | "current") {
    if (await draft.recover(choice)) onSaved();
  }
  return (
    <section
      className="save-feedback"
      aria-label="Kết quả lưu ô"
      aria-busy={busy}
    >
      {outcome.type === "pending" && <p role="status">Đang lưu ô…</p>}
      {outcome.message && (
        <p role={outcome.type === "saved" ? "status" : "alert"}>
          {outcome.message}
        </p>
      )}
      {needsRecovery && (
        <>
          <p>
            Bản nháp giữ nguyên người, ngày, loại và phiên bản ban đầu. Đọc đối
            chiếu không hủy yêu cầu cũ và không xác nhận đã lưu.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void draft.reconcile();
            }}
          >
            {draft.reconciling ? "Đang đối chiếu…" : "Đối chiếu dữ liệu đã lưu"}
          </Button>
        </>
      )}
      {draft.readError && <p role="alert">{draft.readError}</p>}
      {edit && comparedCells.length > 0 && (
        <ul
          aria-label={draft.current ? "Các ô đã đối chiếu" : "Các ô xung đột"}
        >
          {comparedCells.map((cell) => {
            const isSource =
              edit.source && cellIdentity(cell) === cellIdentity(edit.source);
            const person =
              draft.current?.employees.find((e) => e.id === cell.employeeId) ??
              edit.bulk?.employees.find((e) => e.id === cell.employeeId) ??
              (edit.employee.id === cell.employeeId
                ? edit.employee
                : undefined);
            return (
              <li
                key={cellIdentity(cell)}
                data-feedback-cell={cellIdentity(cell)}
              >
                {isSource ? "Nguồn" : "Đích"}: {person?.name ?? "Nhân sự"} · ID{" "}
                {cell.employeeId} · {cell.date} ·{" "}
                {cell.kind === "work" ? "Công" : "Tăng ca"}. Dữ liệu hiện tại:{" "}
                {cell.state === "before-start"
                  ? "N · chưa bắt đầu"
                  : cell.state === "after-end"
                    ? "— · đã kết thúc"
                    : formatAttendanceValue(cell.value) || "trống"}{" "}
                · {cell.reminder ? "có nhắc" : "không nhắc"} ·{" "}
                {cell.state === "editable"
                  ? "trong mốc làm việc"
                  : "ngoài mốc làm việc"}
                . Giá trị bản nháp: {edit.raw || "trống"}
                {cell.kind === "work" ? " công" : " giờ"}.
                {!bulk && (
                  <>
                    {" "}
                    Nhắc bản nháp: {edit.reminder ? "có nhắc" : "không nhắc"}.
                  </>
                )}
                {bulk && !isSource && " Giữ nhắc riêng của đích."}
              </li>
            );
          })}
        </ul>
      )}
      {bulk && draft.current && (
        <>
          <p>
            Đối chiếu {draft.current.cells.length} ô theo ID và ngày ban đầu.
            Bảng tháng không tự thêm người đã rời tháng.
          </p>
          {source && (
            <p>
              Nguồn hiện tại: {formatAttendanceValue(source.value) || "trống"} ·{" "}
              {source.state === "editable"
                ? "trong mốc làm việc"
                : "ngoài mốc làm việc"}
              . Giá trị bản nháp: {edit.raw}.
            </p>
          )}
          <p>
            Quyết định mới giữ nguyên chế độ{" "}
            {edit.mode === "fill-empty" ? "chỉ điền ô trống" : "ghi đè cả vùng"}
            . Không đổi nguồn hoặc ô bị loại.
          </p>
          <div className="actions">
            <Button
              disabled={
                busy ||
                !draft.recoveryReady ||
                !recoveryBulkIntent(edit, draft.current, "draft")
              }
              onClick={() => {
                void recover("draft");
              }}
            >
              {edit.source
                ? "Điền giá trị nguồn hiện tại sau đối chiếu"
                : "Lưu bản nháp sau đối chiếu"}
            </Button>
            <Button
              disabled={
                busy ||
                !draft.recoveryReady ||
                !recoveryBulkIntent(edit, draft.current, "current")
              }
              onClick={() => {
                void recover("current");
              }}
            >
              Giữ dữ liệu hiện tại và xác nhận
            </Button>
          </div>
          <p className="help">
            Chỉ đích đủ điều kiện của lần ghi mới được bảo vệ; nguồn, N/— và ô
            đã có số/F bị loại không được xác nhận. Nguồn trống/ngoài mốc hoặc
            không có đích hợp lệ: giữ bản nháp để kiểm tra, không thể áp dụng.
            Nếu giá trị hiện tại khác nhau, không thể xác nhận bằng một giá trị
            chung; bỏ và chọn lại khi có quyết định mới.
          </p>
        </>
      )}
      {!bulkCurrent &&
        !bulk &&
        current &&
        needsRecovery &&
        !draft.readError && (
          <>
            <p>
              Đã đối chiếu lúc {draft.current?.fetchedAt}. Chọn một ý định lưu
              mới sau khi xem dữ liệu. Giữ dữ liệu hiện tại cũng gửi lần lưu có
              kiểm phiên bản mới.
            </p>
            {current.state === "editable" ? (
              <div className="actions">
                <Button
                  disabled={busy || !draft.recoveryReady}
                  onClick={() => {
                    void recover("draft");
                  }}
                >
                  Lưu bản nháp sau đối chiếu
                </Button>
                <Button
                  disabled={busy || !draft.recoveryReady}
                  onClick={() => {
                    void recover("current");
                  }}
                >
                  Giữ dữ liệu hiện tại và xác nhận
                </Button>
              </div>
            ) : (
              <p>
                Ô đã ra ngoài mốc; giữ bản nháp để kiểm tra, không thể ghi ô
                N/—. Yêu cầu cũ vẫn chưa được xác nhận kết quả.
              </p>
            )}
            <p className="help">
              Chỉ lần lưu mới được chấp nhận trên ô hợp lệ mới bảo vệ ý định đó.
              Đọc, bỏ bản nháp, ô bị bỏ qua, nguồn chỉ đọc hoặc không có đích
              hợp lệ không tạo bảo vệ này.
            </p>
          </>
        )}
    </section>
  );
}
