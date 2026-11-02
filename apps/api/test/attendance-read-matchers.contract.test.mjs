import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesAttendancePageRead } from "../../../tests/product-e2e/attendance-read-matchers.ts";

test("page read matchers reject different methods, malformed bodies and every wrong criterion", () => {
  const expected = { month: "2026-10", q: "Nguyễn", page: 30, pageSize: 25 };
  const request = (
    body = expected,
    method = "POST",
    path = "/api/v1/attendance/search",
  ) => ({
    url: () => "http://127.0.0.1" + path,
    method: () => method,
    postDataJSON: () => (typeof body === "string" ? JSON.parse(body) : body),
  });
  assert.equal(matchesAttendancePageRead(request(), expected), true);
  for (const body of [
    null,
    [],
    "{",
    {},
    { ...expected, extra: true },
    { ...expected, month: "2026-11" },
    { ...expected, q: "nguyễn" },
    { ...expected, page: 1 },
    { ...expected, pageSize: 50 },
    { ...expected, page: "30" },
    { month: "2026-10", q: "Nguyễn", page: 30 },
  ])
    assert.equal(matchesAttendancePageRead(request(body), expected), false);
  for (const method of ["GET", "PATCH", "DELETE"])
    assert.equal(
      matchesAttendancePageRead(request(expected, method), expected),
      false,
    );
  for (const path of [
    "/api/v1/attendance/month",
    "/api/v1/attendance/changes",
    "/other/api/v1/attendance/search",
  ])
    assert.equal(
      matchesAttendancePageRead(request(expected, "POST", path), expected),
      false,
    );
});
