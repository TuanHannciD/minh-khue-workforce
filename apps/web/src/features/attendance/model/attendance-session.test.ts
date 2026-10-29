import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { SessionRuntime } from "@/features/session/index";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { AttendanceDraft } from "./attendance-draft";
import { attendanceFixture } from "../preview/attendance-fixture";
import { EmployeeDraft } from "@/features/employees/index";

afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const boundary = new SessionBoundary(),
    client = new QueryClient();
  const runtime = new SessionRuntime(client, boundary);
  const draft = new AttendanceDraft(boundary);
  let userId = "owner",
    logoutCalls = 0;
  const deadline = new Date(Date.now() + 3600000).toISOString();
  vi.stubGlobal("fetch", async (path: string) => {
    if (path.endsWith("/logout")) {
      logoutCalls++;
      return new Response(null, { status: 204 });
    }
    return Response.json({
      user: { userId, username: userId },
      expiresAt: deadline,
      idleExpiresAt: deadline,
    });
  });
  await runtime.refresh();
  const disconnect = draft.connect(runtime);
  const cell = attendanceFixture.cells.find(
    (c) => c.kind === "work" && c.state === "editable",
  )!;
  draft.open(attendanceFixture, cell, "owner");
  draft.change({ raw: "3,25", reminder: !cell.reminder, custom: true });
  return {
    draft,
    runtime,
    boundary,
    client,
    disconnect,
    switchUser: () => {
      userId = "other";
    },
    logoutCalls: () => logoutCalls,
  };
}
it("expiry retains raw, same user requires fresh reconcile; account switch clears draft and ignores late response", async () => {
  const f = await setup();
  try {
    const original = structuredClone(f.draft.edit);
    f.runtime.expire();
    expect(f.draft.edit).toEqual(original);
    await f.runtime.refresh();
    const write = vi.fn();
    await f.draft.submit(write);
    expect(write).not.toHaveBeenCalled();
    expect(f.draft.edit?.raw).toBe("3,25");
    f.switchUser();
    await f.runtime.refresh();
    expect(f.runtime.snapshot().status).toBe("account-change");
    expect(f.draft.edit).not.toBeNull();
    f.runtime.confirmAccountChange();
    expect(f.draft.edit).toBeNull();
    expect(f.draft.current).toBeNull();
    expect(f.client.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    f.disconnect();
    f.runtime.expire();
  }
});
it("dirty logout sends0 until explicit discard, then clears query/draft and stops boundary", async () => {
  const f = await setup();
  try {
    f.client.setQueryData(
      ["attendance", "owner", 1, "2024-02"],
      attendanceFixture,
    );
    expect(await f.runtime.logout()).toBe(false);
    expect(f.logoutCalls()).toBe(0);
    expect(await f.runtime.logout(true)).toBe(true);
    expect(f.logoutCalls()).toBe(1);
    expect(f.draft.edit).toBeNull();
    expect(f.boundary.isActive()).toBe(false);
    expect(f.client.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    f.disconnect();
    f.runtime.expire();
  }
});
it("clean Employee create gets fresh lease after reauthentication; dirty unsent requires explicit resume", async () => {
  const f = await setup();
  const employee = new EmployeeDraft();
  const disconnect = employee.connect(f.runtime);
  try {
    f.runtime.expire();
    await f.runtime.refresh();
    expect(employee.needsRecovery).toBe(false);
    employee.change({ name: "Giả", startDate: "2026-10-01", endDate: "" });
    f.runtime.expire();
    await f.runtime.refresh();
    expect(employee.needsRecovery).toBe(true);
    expect(employee.resumeUnsentCreate()).toBe(true);
    expect(employee.needsRecovery).toBe(false);
    employee.reject(new Error("response loss"), employee.begin());
    f.runtime.expire();
    await f.runtime.refresh();
    expect(employee.resumeUnsentCreate()).toBe(false);
    expect(employee.outcome.type).toBe("unknown");
  } finally {
    disconnect();
    f.disconnect();
    f.runtime.expire();
  }
});
