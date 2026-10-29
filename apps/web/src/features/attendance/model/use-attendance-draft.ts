import { useSyncExternalStore } from "react";
import type { AttendanceDraft } from "./attendance-draft";

export function useAttendanceDraft(draft: AttendanceDraft) {
  useSyncExternalStore(draft.subscribe, draft.structureSnapshot);
  return draft;
}
