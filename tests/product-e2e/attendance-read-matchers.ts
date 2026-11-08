import type { Request } from "@playwright/test";

export type PageReadCriteria = {
  month: string;
  q: string;
  page: number;
  pageSize: 25 | 50;
};

// An exact read exemption. A different POST, extra field, or query context is
// still unexpected traffic in write accounting and must not satisfy a waiter.
export function matchesAttendancePageRead(
  request: Request,
  expected: PageReadCriteria,
): boolean {
  if (
    new URL(request.url()).pathname !== "/api/v1/attendance/search" ||
    request.method() !== "POST"
  )
    return false;
  try {
    const body = request.postDataJSON();
    return (
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      Object.keys(body).length === 4 &&
      Object.entries(expected).every(([key, value]) => body[key] === value)
    );
  } catch {
    return false;
  }
}
