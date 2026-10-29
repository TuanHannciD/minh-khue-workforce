import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/session/index";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { AttendanceDraft } from "../model/attendance-draft";
import type { EmployeeDto } from "../model/types";
import { useAttendanceMonth } from "../api/use-attendance-month";
import { attendanceKeys } from "../api/query-keys";
import { useAttendanceDraft } from "../model/use-attendance-draft";
import { AttendancePage } from "./attendance-page";
import { ConfirmDiscard } from "@/shared/ui/confirm-discard";

export function AttendanceWorkspace({
  draft: owner,
  onEmployee,
}: {
  draft: AttendanceDraft;
  onEmployee: (employee: EmployeeDto) => void;
}) {
  const draft = useAttendanceDraft(owner);
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(
    () =>
      draft.edit?.month ??
      `${new Date().getFullYear().toString().padStart(4, "0")}-${(new Date().getMonth() + 1).toString().padStart(2, "0")}`,
  );
  const [nextMonth, setNextMonth] = useState<string | null>(null);
  const query = useAttendanceMonth(month);
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
  };
  return (
    <>
      <div className="month-control">
        <label htmlFor="attendance-month">Tháng chấm công</label>
        <Input
          id="attendance-month"
          type="month"
          value={month}
          disabled={draft.outcome.type === "pending" || draft.reconciling}
          onChange={(event) => {
            const value = event.target.value;
            if (
              !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
              value.startsWith("0000")
            )
              return;
            if (draft.edit) setNextMonth(value);
            else setMonth(value);
          }}
        />
        <Button
          onClick={() => {
            void query.refetch();
          }}
        >
          Tải lại bảng
        </Button>
      </div>
      {nextMonth && (
        <ConfirmDiscard
          title="Đổi tháng khi có phần nhập"
          onKeep={() => setNextMonth(null)}
          onDiscard={() => {
            if (draft.discard()) setMonth(nextMonth);
            setNextMonth(null);
          }}
          discardLabel="Bỏ phần nhập và đổi tháng"
        >
          <p>
            Giữ phần nhập ở tháng {month}, hoặc bỏ để xem tháng {nextMonth}. Bỏ
            phần nhập không hủy yêu cầu đã gửi.
          </p>
        </ConfirmDiscard>
      )}
      {query.data && (
        <div className="snapshot-freshness" aria-live="polite">
          <p>Snapshot đã lưu lúc {query.data.fetchedAt}.</p>
          {query.isFetching && (
            <p role="status">Đang cập nhật bảng và tổng đã lưu…</p>
          )}
          {query.isError && (
            <p role="alert">
              Chưa cập nhật được dữ liệu nền. Bảng và tổng đang hiển thị
              snapshot cũ; bản nháp được giữ.
            </p>
          )}
        </div>
      )}
      <AttendancePage
        key={month}
        status={query.data ? "ready" : query.isError ? "error" : "loading"}
        month={query.data ?? null}
        onSubmit={() => {}}
        onRetry={() => {
          void query.refetch();
        }}
        draft={draft}
        ownerUserId={session?.user.userId ?? ""}
        onSaved={reload}
        onEmployee={onEmployee}
      />
    </>
  );
}
