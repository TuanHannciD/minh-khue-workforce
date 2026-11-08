import { ApiError, apiRequest } from "@/shared/api/transport";
import type { SessionBoundary } from "@/shared/api/session-boundary";
import type { paths } from "@/shared/api/generated/schema";
type ExportMonth =
  paths["/api/v1/attendance/export"]["get"]["parameters"]["query"]["month"];

export function downloadAttendance(
  month: ExportMonth,
  boundary: SessionBoundary,
  signal: AbortSignal,
) {
  return apiRequest<Blob>(
    `/attendance/export?month=${encodeURIComponent(month)}`,
    {
      boundary,
      expectedEpoch: boundary.current(),
      signal,
      async read(response) {
        if (
          response.headers.get("content-type")?.split(";")[0] !==
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
          throw new ApiError(
            502,
            "INVALID_DOWNLOAD",
            "Chưa nhận được tệp Excel hợp lệ.",
          );
        const blob = await response.blob();
        if (!blob.size)
          throw new ApiError(502, "EMPTY_DOWNLOAD", "Tệp tải về đang trống.");
        return blob;
      },
    },
  );
}
