import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { EmployeeDraft } from "../model/employee-draft";
import type { Employee, EmployeeIntent } from "../api/employees";

export function EmployeeRecovery({
  draft,
  save,
  onRecovered,
}: {
  draft: EmployeeDraft;
  save: (intent: EmployeeIntent) => Promise<Employee>;
  onRecovered: () => void;
}) {
  const [knownId, setKnownId] = useState("");
  const busy = draft.pending || draft.reconciling;
  async function recover(choice: "draft" | "current") {
    if (await draft.recover(choice, save)) onRecovered();
  }
  return (
    <section aria-label="Đối chiếu nhân sự" className="save-feedback">
      <p>
        Đối chiếu chỉ đọc theo ID, kể cả khi người này đã ra khỏi tháng. Đọc
        hoặc bỏ bản nháp không hủy lần lưu trước.
      </p>
      {!draft.baseline && (
        <>
          {draft.needsRecovery && !draft.requiresReconciliation && (
            <>
              <p>
                Bản nháp tạo mới chưa có yêu cầu chưa xác định. Sau khi đăng
                nhập lại cùng tài khoản, chọn tiếp tục để tự kiểm tra và lưu.
              </p>
              <Button onClick={() => draft.resumeUnsentCreate()}>
                Tiếp tục sửa bản nháp tạo mới
              </Button>
            </>
          )}
          {draft.requiresReconciliation && (
            <>
              <p>
                Lần tạo chưa trả ID: kết quả chưa xác định. Không tự gửi lại
                hoặc nhận diện theo tên vì có thể trùng tên. Tải lại bảng tháng
                để đối chiếu; chỉ nhập ID khi đã tự xác định đúng nhân sự. Bản
                này không bảo đảm tạo đúng một lần.
              </p>
              <label htmlFor="recovery-employee-id">
                ID nhân sự đã xác định
              </label>
              <Input
                id="recovery-employee-id"
                value={draft.confirmedId ?? knownId}
                readOnly={draft.confirmedId !== null}
                onChange={(event) => setKnownId(event.target.value)}
                disabled={busy}
              />
            </>
          )}
        </>
      )}
      {draft.requiresReconciliation && !draft.current && (
        <p>
          Đối chiếu lại theo ID trước khi chọn lần lưu mới. Bản nháp và ID đã
          xác nhận được giữ; việc đọc hoặc một lần lưu bị từ chối không hủy yêu
          cầu trước.
        </p>
      )}
      <Button
        disabled={
          busy ||
          (!draft.baseline &&
            !draft.confirmedId &&
            !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(knownId))
        }
        onClick={() => {
          void draft.reconcile(knownId || undefined);
        }}
      >
        {draft.reconciling
          ? "Đang đối chiếu nhân sự…"
          : "Đối chiếu theo ID nhân sự"}
      </Button>
      {draft.readError && <p role="alert">{draft.readError}</p>}
      {draft.current && (
        <>
          <p>
            Dữ liệu đối chiếu: {draft.current.name} · ID {draft.current.id} · từ{" "}
            {draft.current.startDate} đến{" "}
            {draft.current.endDate ?? "chưa kết thúc"}. Phần nhập và phiên bản
            ban đầu vẫn giữ nguyên.
          </p>
          <p>
            Chọn lần lưu mới có kiểm phiên bản vừa xem. Giữ thông tin hiện tại
            cũng gửi các field tường minh; không xác nhận kết quả hay tác giả
            của lần lưu cũ.
          </p>
          <Button
            disabled={busy || !draft.recoveryReady}
            onClick={() => {
              void recover("draft");
            }}
          >
            Xác nhận ID và lưu bản nháp nhân sự
          </Button>
          <Button
            disabled={busy || !draft.recoveryReady}
            onClick={() => {
              void recover("current");
            }}
          >
            Giữ thông tin nhân sự hiện tại và xác nhận
          </Button>
        </>
      )}
    </section>
  );
}
