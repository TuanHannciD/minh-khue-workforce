// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { SessionRuntime } from "@/features/session/index";
import { EmployeeDraft } from "../model/employee-draft";
import { EmployeeForm } from "./employee-form";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  "ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF",
  "AbCdEfAb-aBcD-4aBc-8AbC-aBcDeFaBcDeF",
])(
  "lost POST recovery accepts UUID %s and PATCH422 correction keeps canonical durable identity",
  async (inputId) => {
    const employee = {
      id: "abcdefab-abcd-4abc-8abc-abcdefabcdef",
      name: "Raw",
      startDate: "2026-10-15",
      endDate: null,
      revision: "r1",
    };
    const writes: { path: string; method: string; body: unknown }[] = [];
    let reads = 0;
    vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
      if (path.endsWith("/auth/session"))
        return Response.json({
          user: { userId: "one", username: "one" },
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      if (path.endsWith("/attendance/reconcile")) {
        reads++;
        expect(JSON.parse(init.body as string)).toEqual({
          employeeIds: [employee.id],
          cells: [],
        });
        return Response.json({
          fetchedAt: "now",
          employees: [{ ...employee, revision: `r${reads}` }],
          cells: [],
          missingEmployeeIds: [],
        });
      }
      writes.push({
        path,
        method: init.method!,
        body: JSON.parse(init.body as string),
      });
      if (init.method === "POST") throw new TypeError("lost after commit");
      if (writes.length === 2)
        return Response.json(
          {
            error: {
              code: "INVALID_EMPLOYMENT_INTERVAL",
              message: "Ngày kết thúc không hợp lệ.",
            },
          },
          { status: 422 },
        );
      return Response.json({
        ...employee,
        endDate: "2026-10-20",
        revision: "accepted",
      });
    });
    const runtime = new SessionRuntime(new QueryClient());
    await runtime.refresh();
    const draft = new EmployeeDraft();
    const disconnect = draft.connect(runtime);
    try {
      const user = userEvent.setup();
      const view = render(<EmployeeForm draft={draft} />);
      await user.type(screen.getByLabelText("Họ và tên"), " Raw ");
      await user.type(screen.getByLabelText("Ngày bắt đầu"), "2026-10-15");
      await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
      await screen.findByText(/Chưa xác định kết quả lưu/);
      await user.type(screen.getByLabelText("ID nhân sự đã xác định"), inputId);
      await user.click(
        screen.getByRole("button", { name: "Đối chiếu theo ID nhân sự" }),
      );
      await screen.findByText(/Dữ liệu đối chiếu:/);
      expect(draft.current?.id).toBe(employee.id);
      expect(draft.confirmedId).toBe(employee.id);
      expect(writes).toHaveLength(1);
      await user.type(screen.getByLabelText("Ngày kết thúc"), "2026-10-01");
      await user.click(
        screen.getByRole("button", {
          name: "Xác nhận ID và lưu bản nháp nhân sự",
        }),
      );
      await screen.findByText("Ngày kết thúc không hợp lệ.");
      await user.clear(screen.getByLabelText("Ngày kết thúc"));
      await user.type(screen.getByLabelText("Ngày kết thúc"), "2026-10-20");
      expect(
        screen.getByRole("button", { name: "Lưu nhân sự" }),
      ).toHaveProperty("disabled", true);
      await user.click(screen.getByRole("button", { name: "Lưu nhân sự" }));
      expect(writes).toHaveLength(2);
      view.unmount();
      render(<EmployeeForm draft={draft} />);
      expect(screen.getByLabelText("Họ và tên")).toHaveProperty(
        "value",
        " Raw ",
      );
      expect(screen.getByLabelText("Ngày kết thúc")).toHaveProperty(
        "value",
        "2026-10-20",
      );
      expect(screen.getByLabelText("ID nhân sự đã xác định")).toHaveProperty(
        "value",
        employee.id,
      );
      expect(screen.getByRole("button", { name: "Hủy" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(
        screen.queryByRole("button", {
          name: "Xác nhận ID và lưu bản nháp nhân sự",
        }),
      ).toBeNull();
      await user.click(
        screen.getByRole("button", { name: "Đối chiếu theo ID nhân sự" }),
      );
      await screen.findByText(/Dữ liệu đối chiếu:/);
      await user.click(
        screen.getByRole("button", {
          name: "Xác nhận ID và lưu bản nháp nhân sự",
        }),
      );
      await screen.findByText("Đã lưu nhân sự.");
      expect(writes.map((w) => [w.method, w.path])).toEqual([
        ["POST", "/api/v1/employees"],
        ["PATCH", `/api/v1/employees/${employee.id}`],
        ["PATCH", `/api/v1/employees/${employee.id}`],
      ]);
      expect(writes[2]!.body).toEqual({
        name: "Raw",
        startDate: "2026-10-15",
        endDate: "2026-10-20",
        expectedRevision: "r2",
      });
      expect(draft.baseline?.id).toBe(employee.id);
      expect(draft.baseline?.revision).toBe("accepted");
    } finally {
      disconnect();
      runtime.expire();
    }
  },
);
