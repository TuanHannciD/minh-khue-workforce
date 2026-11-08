import type { components } from "@/shared/api/generated/schema";
import { apiRequest } from "@/shared/api/transport";
export { reconcileByIdentity } from "@/shared/api/reconcile";
export type {
  ReconcileRequest,
  ReconcileSnapshot,
} from "@/shared/api/reconcile";
import type { AttendancePageDto, MonthDto, PageCriteria } from "../model/types";

export type PatchAttendance = components["schemas"]["PatchCellWriteDto"];
// Concrete generated variants avoid the redundant kind-specific oneOf
// intersections in the generated aggregate. No independently authored wire DTO.
export type WriteAttendance =
  | PatchAttendance
  | components["schemas"]["SetValueWriteDto"]
  | components["schemas"]["SetReminderWriteDto"];
export type WriteResult = components["schemas"]["WriteResultDto"];
export function readAttendanceMonth(
  month: string,
  expectedEpoch: number,
  signal: AbortSignal,
): Promise<MonthDto> {
  return apiRequest(`/attendance/month?month=${encodeURIComponent(month)}`, {
    signal,
    expectedEpoch,
  });
}
export function readAttendancePage(
  input: PageCriteria,
  expectedEpoch: number,
  signal: AbortSignal,
): Promise<AttendancePageDto> {
  return apiRequest("/attendance/search", {
    method: "POST",
    body: {
      month: input.month,
      q: input.q.trim(),
      page: input.page,
      pageSize: input.pageSize,
    },
    expectedEpoch,
    signal,
    read: async (response) => {
      signal.throwIfAborted();
      const data = (await response.json()) as AttendancePageDto;
      signal.throwIfAborted();
      return data;
    },
  });
}
export function writeAttendance(
  input: WriteAttendance,
  expectedEpoch: number,
): Promise<WriteResult> {
  return apiRequest("/attendance/changes", {
    method: "POST",
    body: input,
    expectedEpoch,
  });
}
