import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { SessionBoundary } from "@/shared/api/session-boundary";
import { downloadAttendance } from "../api/export";
import "./export-button.css";

export function ExportButton({
  month,
  boundary,
}: {
  month: string;
  boundary: SessionBoundary;
}) {
  const [state, setState] = useState<"idle" | "pending" | "error" | "received">(
    "idle",
  );
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function download() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState("pending");
    try {
      const blob = await downloadAttendance(month, boundary, controller.signal);
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = `minh-khue-${month}.xlsx`;
        document.body.append(anchor);
        anchor.click();
        setState("received");
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      if (!controller.signal.aborted) setState("error");
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  return (
    <div className="attendance-export">
      <Button
        onClick={() => {
          void download();
        }}
        disabled={state === "pending"}
        aria-describedby="export-saved-help"
      >
        <Download aria-hidden="true" />
        {state === "pending"
          ? "Đang nhận tệp…"
          : state === "error"
            ? "Thử xuất lại"
            : "Xuất Excel"}
      </Button>
      <p id="export-saved-help">
        Xuất cả Công và Tăng ca đã lưu. Phần đang nhập chưa được đưa vào tệp.
      </p>
      {state === "pending" && (
        <p role="status">Đang tải dữ liệu đã lưu của tháng {month}…</p>
      )}
      {state === "error" && (
        <p role="alert">
          Chưa tải được tệp Excel. Kiểm tra kết nối rồi thử xuất lại.
        </p>
      )}
      {state === "received" && (
        <p role="status">
          Đã nhận tệp tháng {month} và chuyển cho trình duyệt tải xuống.
        </p>
      )}
    </div>
  );
}
