import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/session/index";
import { retryRead, readRetryDelay } from "@/shared/api/reconcile";
import { readAttendanceMonth } from "./attendance";
import { attendanceKeys } from "./query-keys";
import { ApiError } from "@/shared/api/transport";

const stopped = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

const subscribe = (listener: () => void) => {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
export function useAttendanceMonth(month: string) {
  const { runtime, status, session } = useSession();
  const visible = useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
  );
  const epoch = runtime.boundary.current();
  return useQuery({
    queryKey: attendanceKeys.month(month, session?.user.userId, epoch),
    queryFn: ({ signal }) => readAttendanceMonth(month, epoch, signal),
    enabled:
      status === "authenticated" && visible && runtime.boundary.isActive(),
    refetchInterval: (query) => (stopped(query.state.error) ? false : 15000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) =>
      stopped(query.state.error) ? false : "always",
    refetchOnReconnect: (query) =>
      stopped(query.state.error) ? false : "always",
    retry: retryRead,
    retryDelay: readRetryDelay,
    gcTime: 0,
  });
}
