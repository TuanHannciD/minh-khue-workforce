import type { components } from "@/shared/api/generated/schema";
import { apiRequest } from "@/shared/api/transport";
export { reconcileByIdentity } from "@/shared/api/reconcile";
export type {
  ReconcileRequest,
  ReconcileSnapshot,
} from "@/shared/api/reconcile";
import type { MonthDto } from "../model/types";

export type WriteAttendance = components["schemas"]["PatchCellWriteDto"];
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
