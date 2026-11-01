import { toMonthTable } from "../model/attendance-read-view";
import { useState } from "react";
import { AttendancePage } from "../ui/attendance-page";
import { attendanceFixture } from "./attendance-fixture";
import { Button } from "@/shared/ui/button";

export function AttendancePreview() {
  const [status, setStatus] = useState<"ready" | "loading" | "error">("ready");
  const [empty, setEmpty] = useState(false);
  const [feedback, setFeedback] = useState("");
  return (
    <main className="product-layout">
      <p className="review-note">
        Xem thử UI Task6 · Dữ liệu nhân sự giả tháng 02/2024. Không gọi API,
        không lưu dữ liệu. Lưu thử chỉ phát ý định nhập; bảng và tổng vẫn là
        snapshot mẫu.
      </p>
      <header className="masthead">
        <div className="brand">
          Minh Khuê<span>Workforce</span>
        </div>
        <span>Xem thử giao diện</span>
      </header>
      <div
        className="preview-tools"
        role="group"
        aria-label="Trạng thái UI mẫu"
      >
        {(["ready", "loading", "error"] as const).map((state) => (
          <Button
            key={state}
            aria-pressed={status === state}
            onClick={() => {
              setStatus(state);
              setEmpty(false);
            }}
          >
            {state === "ready"
              ? "Có dữ liệu"
              : state === "loading"
                ? "Đang tải"
                : "Lỗi tải"}
          </Button>
        ))}
        <Button
          aria-pressed={empty}
          onClick={() => {
            setStatus("ready");
            setEmpty(true);
          }}
        >
          Tháng trống
        </Button>
      </div>
      <AttendancePage
        status={status}
        month={toMonthTable(
          empty
            ? { ...attendanceFixture, employees: [], cells: [] }
            : attendanceFixture,
        )}
        submitLabel="Lưu thử"
        onRetry={() => setStatus("ready")}
        onSubmit={(intent) =>
          setFeedback(
            `Đã nhận ý định thử: ${intent.cell.employeeId} · ${intent.cell.date} · ${intent.cell.kind === "work" ? "Công" : "Tăng ca"}. Chưa lưu vào hệ thống; snapshot mẫu không đổi.`,
          )
        }
      />
      {feedback && (
        <p role="status" className="preview-feedback">
          {feedback}
        </p>
      )}
      <a className="preview-return" href="/">
        Về ứng dụng
      </a>
    </main>
  );
}
