import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { PageCriteria } from "../model/types";

export const attendanceKeys = {
  all: ["attendance"] as const,
  month: (month: string, userId: string | undefined, epoch: number) =>
    ["attendance", userId, epoch, month] as const,
  page: (criteria: PageCriteria, userId: string | undefined, epoch: number) =>
    [
      "attendance",
      "page",
      userId,
      epoch,
      criteria.month,
      criteria.q.trim(),
      criteria.page,
      criteria.pageSize,
    ] as const,
  pages: (month: string, userId: string | undefined, epoch: number) =>
    ["attendance", "page", userId, epoch, month] as const,
};

function inScope(key: QueryKey, userId: string, epoch: number, month?: string) {
  if (key[0] !== "attendance") return false;
  return key[1] === "page"
    ? key[2] === userId &&
        key[3] === epoch &&
        (month === undefined || key[4] === month)
    : key[1] === userId &&
        key[2] === epoch &&
        (month === undefined || key[3] === month);
}
export function invalidateAttendancePages(
  client: QueryClient,
  month: string,
  userId: string,
  epoch: number,
): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => inScope(query.queryKey, userId, epoch, month),
    refetchType: "active",
  });
}
export function invalidateAttendanceScope(
  client: QueryClient,
  userId: string,
  epoch: number,
): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => inScope(query.queryKey, userId, epoch),
    refetchType: "active",
  });
}
