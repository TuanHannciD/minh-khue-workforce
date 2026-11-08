// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { EmployeeForm } from "./employee-form";
import { EmployeeDraft } from "../model/employee-draft";
import { SessionRuntime } from "@/features/session/index";
import type { Employee } from "../api/employees";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sessionFixture() {
  const runtime = new SessionRuntime(new QueryClient());
  const draft = new EmployeeDraft();
  let userId = "one";
  const deadline = new Date(Date.now() + 3600000).toISOString();
  const writes: { path: string; method: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/v1/auth/session")
      return Response.json({
        user: { userId, username: userId },
        expiresAt: deadline,
        idleExpiresAt: deadline,
      });
    if (path === "/api/v1/employees" && init.method === "POST") {
      const body = JSON.parse(init.body as string) as object;
      writes.push({ path, method: init.method, body });
      return Response.json(
        {
          ...body,
          id: `employee-${writes.length}`,
          revision: `r${writes.length}`,
        },
        { status: 201 },
      );
    }
    throw new Error(`Unexpected fixture request: ${init.method} ${path}`);
  });
  return {
    runtime,
    draft,
    writes,
    switchUser: () => {
      userId = "two";
    },
  };
}

async function fill(name: string, startDate: string, endDate = "") {
  const user = userEvent.setup();
  for (const [label, value] of [
    ["Họ và tên", name],
    ["Ngày bắt đầu", startDate],
    ["Ngày kết thúc", endDate],
  ] as const) {
    await user.clear(screen.getByLabelText(label));
    if (value) await user.type(screen.getByLabelText(label), value);
  }
}

it("clean account refresh clears saved identity and rendered fields before another POST", async () => {
  const { runtime, draft, writes, switchUser } = sessionFixture();
  await runtime.refresh();
  const disconnect = draft.connect(runtime);
  try {
    render(<EmployeeForm draft={draft} />);
    const user = userEvent.setup();
    await fill("Nhân sự A", "2026-10-15", "2026-10-20");
    await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
    await screen.findByText("Đã lưu nhân sự.");
    expect(draft.baseline?.id).toBe("employee-1");
    expect(runtime.hasDirtyState()).toBe(false);
    switchUser();
    await act(() => runtime.refresh());
    expect(runtime.snapshot()).toMatchObject({
      status: "authenticated",
      session: { user: { userId: "two" } },
    });
    expect(draft.baseline).toBeNull();
    expect(draft.values).toEqual({ name: "", startDate: "", endDate: "" });
    expect(screen.getByRole("heading", { name: "Thêm nhân sự" })).toBeTruthy();
    expect(screen.queryByText(/employee-1/)).toBeNull();
    for (const label of ["Họ và tên", "Ngày bắt đầu", "Ngày kết thúc"])
      expect(screen.getByLabelText(label)).toHaveProperty("value", "");
    await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
    await screen.findByRole("alert");
    expect(writes).toHaveLength(1);
    await fill("Nhân sự B", "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
    await screen.findByText("Đã lưu nhân sự.");
    expect(writes).toEqual([
      {
        path: "/api/v1/employees",
        method: "POST",
        body: {
          name: "Nhân sự A",
          startDate: "2026-10-15",
          endDate: "2026-10-20",
        },
      },
      {
        path: "/api/v1/employees",
        method: "POST",
        body: { name: "Nhân sự B", startDate: "2026-11-01", endDate: null },
      },
    ]);
    expect(draft.baseline?.id).toBe("employee-2");
  } finally {
    disconnect();
    runtime.expire();
  }
});

it("same-user refresh retains invalid raw fields and errors; dirty account switch requires confirmation", async () => {
  const { runtime, draft, writes, switchUser } = sessionFixture();
  await runtime.refresh();
  const disconnect = draft.connect(runtime);
  try {
    const view = render(<EmployeeForm draft={draft} />);
    await fill("Bản nháp", "2026-02-29");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Lưu nhân sự" }));
    await screen.findByRole("alert");
    await act(() => runtime.refresh());
    expect(screen.getByLabelText("Ngày bắt đầu")).toHaveProperty(
      "value",
      "2026-02-29",
    );
    expect(
      screen.getByLabelText("Ngày bắt đầu").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.getByRole("alert")).toBeTruthy();
    view.unmount();
    render(<EmployeeForm draft={draft} />);
    expect(screen.getByLabelText("Ngày bắt đầu")).toHaveProperty(
      "value",
      "2026-02-29",
    );
    switchUser();
    await act(() => runtime.refresh());
    expect(runtime.snapshot().status).toBe("account-change");
    expect(draft.values.name).toBe("Bản nháp");
    expect(screen.getByLabelText("Họ và tên")).toHaveProperty(
      "value",
      "Bản nháp",
    );
    act(() => runtime.confirmAccountChange());
    expect(runtime.snapshot().status).toBe("authenticated");
    expect(draft.values.name).toBe("");
    expect(screen.getByLabelText("Họ và tên")).toHaveProperty("value", "");
    expect(writes).toHaveLength(0);
  } finally {
    disconnect();
    runtime.expire();
  }
});

it.each(["resolve", "reject"] as const)(
  "lifecycle clear fences late %s and releases mounted pending state",
  async (outcome) => {
    const draft = new EmployeeDraft();
    let resolve!: (employee: Employee) => void;
    let reject!: (error: Error) => void;
    const save = () =>
      new Promise<Employee>((yes, no) => {
        resolve = yes;
        reject = no;
      });
    render(<EmployeeForm draft={draft} save={save} />);
    await fill("Cũ", "2026-10-15");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Lưu nhân sự" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Họ và tên")).toHaveProperty(
        "disabled",
        true,
      ),
    );
    act(() => draft.clear());
    expect(screen.getByLabelText("Họ và tên")).toHaveProperty(
      "disabled",
      false,
    );
    await fill("Mới", "2026-11-01");
    await act(async () => {
      if (outcome === "resolve")
        resolve({
          id: "old",
          revision: "old",
          name: "Cũ",
          startDate: "2026-10-15",
          endDate: null,
        });
      else reject(new TypeError("late network error"));
    });
    expect(draft.baseline).toBeNull();
    expect(draft.outcome.type).toBe("editing");
    expect(screen.getByLabelText("Họ và tên")).toHaveProperty("value", "Mới");
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
