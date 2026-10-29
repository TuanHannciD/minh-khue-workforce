import type { AttendanceDraft } from "../model/attendance-draft";
import { formatAttendanceValue } from "../model/number-input";
import { Button } from "@/shared/ui/button";
import { cellIdentity } from "../model/month-view";

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
  const shown =
    current ??
    draft.conflictCells.find(
      (c) => edit && cellIdentity(c) === cellIdentity(edit.cell),
    );
  const outcome = draft.outcome;
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
      {shown && (
        <p>
          Dữ liệu hiện tại: {formatAttendanceValue(shown.value) || "trống"} ·{" "}
          {shown.reminder ? "có nhắc" : "không nhắc"} ·{" "}
          {shown.state === "editable"
            ? "trong mốc làm việc"
            : "ngoài mốc làm việc"}
          .
        </p>
      )}
      {current && needsRecovery && !draft.readError && (
        <>
          <p>
            Đã đối chiếu lúc {draft.current?.fetchedAt}. Chọn một ý định lưu mới
            sau khi xem dữ liệu. Giữ dữ liệu hiện tại cũng gửi lần lưu có kiểm
            phiên bản mới.
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
              Ô đã ra ngoài mốc; giữ bản nháp để kiểm tra, không thể ghi ô N/—.
              Yêu cầu cũ vẫn chưa được xác nhận kết quả.
            </p>
          )}
          <p className="help">
            Chỉ lần lưu mới được chấp nhận trên ô hợp lệ mới bảo vệ ý định đó.
            Đọc, bỏ bản nháp, ô bị bỏ qua, nguồn chỉ đọc hoặc không có đích hợp
            lệ không tạo bảo vệ này.
          </p>
        </>
      )}
    </section>
  );
}
