// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { EmployeeForm } from "./employee-form";
import { EmployeeDraft } from "../model/employee-draft";
import { ApiError } from "@/shared/api/transport";
import { SessionRuntime } from "@/features/session/index";
import { SessionBoundary } from "@/shared/api/session-boundary";
import type { Employee } from "../api/employees";

const employee: Employee = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Trùng tên",
  startDate: "2026-10-15",
  endDate: "2026-10-20",
  revision: "baseline",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("RHF/Zod date errors preserve raw input, associate labels and support keyboard submit", async () => {
  const save = vi.fn();
  const draft = new EmployeeDraft();
  render(<EmployeeForm draft={draft} save={save} />);
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("Họ và tên"));
  await user.type(screen.getByLabelText("Họ và tên"), "Nhân sự giả");
  await user.tab();
  await user.type(screen.getByLabelText("Ngày bắt đầu"), "2026-02-29");
  await user.tab();
  await user.type(screen.getByLabelText("Ngày kết thúc"), "2026-02-28");
  await user.tab();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("kiểm tra"),
  );
  expect(screen.getByLabelText("Ngày bắt đầu")).toHaveProperty(
    "value",
    "2026-02-29",
  );
  expect(
    screen.getByLabelText("Ngày bắt đầu").getAttribute("aria-invalid"),
  ).toBe("true");
  expect(save).not.toHaveBeenCalled();
  expect(draft.values.startDate).toBe("2026-02-29");
});

it("employment_change_preserves_all_months shows exact offenders and retains ID, dates and name draft", async () => {
  const draft = new EmployeeDraft(employee);
  const save = vi.fn().mockRejectedValue(
    new ApiError(
      422,
      "EMPLOYMENT_DATA_OUTSIDE_INTERVAL",
      "Mốc mới loại ô đã có dữ liệu.",
      {
        cells: [
          { employeeId: employee.id, date: "2025-03-01", kind: "work" },
          { employeeId: employee.id, date: "2027-01-01", kind: "overtime" },
        ],
      },
    ),
  );
  render(<EmployeeForm draft={draft} save={save} />);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Ngày bắt đầu"));
  await user.type(screen.getByLabelText("Ngày bắt đầu"), "2026-10-16");
  await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
  expect(await screen.findByText(/2025-03-01.*Công/)).toBeTruthy();
  expect(screen.getByText(/2027-01-01.*Tăng ca/)).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(employee.name);
  expect(screen.getByRole("alert").textContent).toContain(employee.id);
  expect(draft.baseline).toEqual(employee);
  expect(draft.values.startDate).toBe("2026-10-16");
  expect(save).toHaveBeenCalledTimes(1);
});

it("explicit same-field save sends no-op CAS and null endDate; successful month exit retains identity", async () => {
  const draft = new EmployeeDraft(employee);
  const result = {
    ...employee,
    startDate: "2026-11-01",
    endDate: null,
    revision: "next",
  };
  const save = vi
    .fn()
    .mockResolvedValueOnce({ ...employee, revision: "noop" })
    .mockResolvedValueOnce(result);
  const view = render(<EmployeeForm draft={draft} save={save} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0]).toEqual({
    id: employee.id,
    input: {
      expectedRevision: "baseline",
      name: employee.name,
      startDate: employee.startDate,
      endDate: employee.endDate,
    },
  });
  await user.clear(screen.getByLabelText("Ngày bắt đầu"));
  await user.type(screen.getByLabelText("Ngày bắt đầu"), "2026-11-01");
  await user.clear(screen.getByLabelText("Ngày kết thúc"));
  await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
  await screen.findByText("Đã lưu nhân sự.");
  view.unmount();
  render(<EmployeeForm draft={draft} save={save} />);
  expect(draft.baseline?.id).toBe(employee.id);
  expect(draft.baseline?.revision).toBe("next");
  expect(screen.getByLabelText("Ngày bắt đầu")).toHaveProperty(
    "value",
    "2026-11-01",
  );
  expect(save.mock.calls[1]?.[0]).toMatchObject({
    id: employee.id,
    input: { expectedRevision: "noop", endDate: null },
  });
});

it("conflict and lost response preserve baseline/draft across remount without automatic resend", async () => {
  for (const failure of [
    new ApiError(409, "EMPLOYEE_CONFLICT", "Thông tin đã thay đổi.", {
      current: { ...employee, startDate: "2026-11-01", revision: "other" },
    }),
    new TypeError("network"),
  ]) {
    const draft = new EmployeeDraft(employee),
      save = vi.fn().mockRejectedValue(failure);
    const view = render(<EmployeeForm draft={draft} save={save} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Họ và tên"));
    await user.type(screen.getByLabelText("Họ và tên"), "Bản nháp giữ nguyên");
    await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
    await screen.findByRole("alert");
    view.unmount();
    render(<EmployeeForm draft={draft} save={save} />);
    expect(draft.baseline).toEqual(employee);
    expect(screen.getByLabelText("Họ và tên")).toHaveProperty(
      "value",
      "Bản nháp giữ nguyên",
    );
    expect(screen.getByRole("button", { name: "Lưu nhân sự" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(save).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

it("draft attaches to session lifecycle, survives same-user expiry and is cleared on account change", async () => {
  const boundary = new SessionBoundary();
  const runtime = new SessionRuntime(new QueryClient(), boundary);
  let userId = "one";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            user: { userId, username: userId },
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
          }),
          { status: 200 },
        ),
    ),
  );
  await runtime.login({ username: "one", password: "fake" });
  const draft = new EmployeeDraft(employee);
  const disconnect = draft.connect(runtime);
  draft.change({
    name: "Giữ",
    startDate: employee.startDate,
    endDate: employee.endDate!,
  });
  expect(runtime.hasDirtyState()).toBe(true);
  runtime.expire();
  expect(draft.values.name).toBe("Giữ");
  await runtime.login({ username: "one", password: "fake" });
  expect(draft.values.name).toBe("Giữ");
  userId = "two";
  await runtime.login({ username: "two", password: "fake" });
  expect(runtime.snapshot().status).toBe("account-change");
  runtime.confirmAccountChange();
  expect(draft.values.name).toBe("");
  expect(draft.baseline).toBeNull();
  disconnect();
  await runtime.logout(true);
});

it.each([
  new TypeError("network"),
  new ApiError(401, "SESSION_CHANGED", "Phiên đã thay đổi."),
])("unknown result cannot be dismissed as cancelled (%s)", async (failure) => {
  const draft = new EmployeeDraft(employee);
  const save = vi.fn().mockRejectedValue(failure);
  render(<EmployeeForm draft={draft} save={save} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Lưu nhân sự" }));
  await screen.findByRole("alert");
  expect(draft.outcome.type).toBe("unknown");
  expect(screen.getByRole("button", { name: "Hủy" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("button", { name: "Lưu nhân sự" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(draft.baseline?.id).toBe(employee.id);
});
