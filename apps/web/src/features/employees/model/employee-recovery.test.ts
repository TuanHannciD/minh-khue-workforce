import { expect, it, vi } from "vitest";
import { EmployeeDraft } from "./employee-draft";
import { ApiError } from "@/shared/api/transport";
import type { EmployeeIntent } from "../api/employees";
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
