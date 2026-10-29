import type { components } from "@/shared/api/generated/schema";
import { apiRequest } from "@/shared/api/transport";
export { reconcileByIdentity } from "@/shared/api/reconcile";
export type {
  ReconcileRequest,
  ReconcileSnapshot,
} from "@/shared/api/reconcile";
import type { MonthDto } from "../model/types";

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
