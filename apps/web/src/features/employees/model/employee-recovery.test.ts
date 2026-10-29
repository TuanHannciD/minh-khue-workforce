import { expect, it, vi } from "vitest";
import { EmployeeDraft } from "./employee-draft";
import { ApiError } from "@/shared/api/transport";
import type { EmployeeIntent } from "../api/employees";
import { QueryClient } from "@tanstack/react-query";
import { SessionRuntime } from "@/features/session/index";
import { SessionBoundary } from "@/shared/api/session-boundary";
const employee = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Giả",
  startDate: "2026-10-15",
  endDate: null,
  revision: "old",
};
it("PATCH lost response reconciles stable ID after month exit and explicit keep-current sends all no-op fields", async () => {
  const draft = new EmployeeDraft(employee);
  draft.change({ name: "Giả", startDate: "2026-11-01", endDate: "" });
  draft.reject(new TypeError("lost"), draft.begin());
  const current = { ...employee, startDate: "2026-11-01", revision: "new" };
  const read = vi.fn(async (input) => {
    expect(input).toEqual({ employeeIds: [employee.id], cells: [] });
    return {
      fetchedAt: "now",
      employees: [current],
      cells: [],
      missingEmployeeIds: [],
    };
  });
  await draft.reconcile(undefined, read);
  expect(draft.baseline?.revision).toBe("old");
  expect(draft.values.startDate).toBe("2026-11-01");
  expect(draft.outcome.type).toBe("unknown");
  const save = vi.fn(async (intent: EmployeeIntent) => {
    expect(intent).toMatchObject({
      id: employee.id,
      input: {
        expectedRevision: "new",
        name: "Giả",
        startDate: "2026-11-01",
        endDate: null,
      },
    });
    return { ...current, revision: "fence" };
  });
  expect(await draft.recover("current", save)).toBe(true);
  expect(save).toHaveBeenCalledTimes(1);
  expect(draft.outcome.type).toBe("saved");
});
it("missing ID vs DB failure both retain raw, clear stale read, block new intent", async () => {
  const draft = new EmployeeDraft(employee);
  draft.change({ name: "raw", startDate: "2026-11-01", endDate: "" });
  draft.reject(new TypeError("lost"), draft.begin());
  await draft.reconcile(undefined, async () => ({
    fetchedAt: "now",
    employees: [],
    cells: [],
    missingEmployeeIds: [employee.id],
  }));
  expect(draft.readError).toContain("Không tìm thấy");
  const write = vi.fn();
  expect(await draft.recover("draft", write)).toBe(false);
  await draft.reconcile(undefined, async () => {
    throw new ApiError(503, "DB", "db failed");
  });
  expect(draft.readError).toContain("Chưa thể đối chiếu");
  expect(draft.current).toBeNull();
  expect(draft.values.name).toBe("raw");
});
it("create unknown without ID never retries or resolves by duplicate name", async () => {
  const draft = new EmployeeDraft();
  draft.change({ name: "trùng tên", startDate: "2026-10-15", endDate: "" });
  draft.reject(new Error("lost"), draft.begin());
  const read = vi.fn();
  await draft.reconcile(undefined, read);
  expect(read).not.toHaveBeenCalled();
  const write = vi.fn();
  expect(await draft.recover("draft", write)).toBe(false);
  expect(write).not.toHaveBeenCalled();
  expect(draft.baseline).toBeNull();
});

it.each([400, 422])(
  "rejected recovery %s retains unknown create provenance and confirmed ID across reauthentication",
  async (status) => {
    const boundary = new SessionBoundary();
    const runtime = new SessionRuntime(new QueryClient(), boundary);
    vi.stubGlobal("fetch", async () =>
      Response.json({
        user: { userId: "owner", username: "owner" },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    );
    await runtime.refresh();
    const draft = new EmployeeDraft();
    const disconnect = draft.connect(runtime);
    try {
      draft.change({ name: " raw ", startDate: "2026-10-15", endDate: "" });
      draft.reject(new TypeError("lost POST"), draft.begin());
      const read = vi.fn(async () => ({
        fetchedAt: "now",
        employees: [employee],
        cells: [],
        missingEmployeeIds: [],
      }));
      await draft.reconcile(employee.id, read);
      draft.change({ ...draft.values, endDate: "2026-10-01" });
      expect(
        await draft.recover("draft", async () => {
          throw new ApiError(status, "VALIDATION", "invalid interval");
        }),
      ).toBe(false);
      draft.change({ ...draft.values, endDate: "2026-10-20" });
      expect(draft.requiresReconciliation).toBe(true);
      expect(draft.confirmedId).toBe(employee.id);
      expect(draft.baseline).toBeNull();
      expect(draft.values).toEqual({
        name: " raw ",
        startDate: "2026-10-15",
        endDate: "2026-10-20",
      });
      expect(draft.current).toBeNull();
      expect(draft.recoveryReady).toBe(false);
      runtime.expire();
      await runtime.refresh();
      expect(draft.resumeUnsentCreate()).toBe(false);
      const writes: EmployeeIntent[] = [];
      const save = async (intent: EmployeeIntent) => {
        writes.push(intent);
        return { ...employee, revision: "accepted" };
      };
      expect(await draft.recover("draft", save)).toBe(false);
      await draft.reconcile(undefined, read);
      expect(read.mock.calls.at(-1)).toEqual([
        { employeeIds: [employee.id], cells: [] },
        boundary.current(),
      ]);
      runtime.expire();
      await runtime.refresh();
      expect(await draft.recover("draft", save)).toBe(false);
      expect(writes).toHaveLength(0);
      await draft.reconcile(undefined, read);
      expect(await draft.recover("draft", save)).toBe(true);
      expect(writes).toEqual([
        {
          id: employee.id,
          expectedEpoch: boundary.current(),
          input: {
            expectedRevision: "old",
            name: "raw",
            startDate: "2026-10-15",
            endDate: "2026-10-20",
          },
        },
      ]);
      expect(draft.requiresReconciliation).toBe(false);
    } finally {
      disconnect();
      runtime.expire();
      vi.unstubAllGlobals();
    }
  },
);
