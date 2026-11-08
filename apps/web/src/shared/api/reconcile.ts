import type { components } from "./generated/schema";
import { apiRequest, ApiError } from "./transport";
import { sessionBoundary } from "./session-boundary";

export type ReconcileRequest = components["schemas"]["ReconcileRequestDto"];
export type ReconcileSnapshot = components["schemas"]["ReconcileSnapshotDto"];
export const retryRead = (count: number, error: unknown) =>
  sessionBoundary.isActive() &&
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
  count < 2;
export const readRetryDelay = (attempt: number) =>
  attempt === 0 ? 1000 : 3000;

// This POST is a read. Its response never establishes a write fence.
export async function reconcileByIdentity(
  input: ReconcileRequest,
  expectedEpoch: number,
): Promise<ReconcileSnapshot> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await apiRequest<ReconcileSnapshot>("/attendance/reconcile", {
        method: "POST",
        body: input,
        expectedEpoch,
      });
    } catch (error) {
      if (
        !retryRead(attempt, error) ||
        !sessionBoundary.canWrite(expectedEpoch)
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, readRetryDelay(attempt)),
      );
    }
  }
}
