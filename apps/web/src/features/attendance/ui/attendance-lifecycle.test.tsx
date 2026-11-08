// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendancePage } from "./attendance-page";
import { AttendancePreview } from "../preview/attendance-preview";
import { toMonthTable } from "../model/attendance-read-view";
import { attendanceFixture } from "../preview/attendance-fixture";
import type { CellEditorIntent } from "./cell-editor";

afterEach(cleanup);
const month = {
  ...attendanceFixture,
  employees: attendanceFixture.employees.slice(0, 1),
  cells: attendanceFixture.cells.filter((cell) =>
    cell.employeeId.endsWith("0101"),
  ),
};
const selected = /ID .*0101.*2024-02-02.*Công/;

async function edit(raw: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: selected }));
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  const input = screen.getByLabelText("Số công tùy chỉnh");
  await user.type(input, raw);
  await user.click(screen.getByRole("checkbox", { name: /Nhắc kiểm tra/ }));
  if (raw === "3,25") {
    await user.click(input);
    await user.tab();
    expect(screen.getByRole("alert").textContent).toContain("0,5");
  }
  return { user, input };
}

for (const status of ["loading", "error"] as const) {
  for (const raw of ["3.5", "3,25"]) {
    it(`same Page preserves ${raw} and selection through ${status}, without an implicit intent`, async () => {
      const intents: CellEditorIntent[] = [];
      const onSubmit = (intent: CellEditorIntent) => intents.push(intent);
      const { rerender } = render(
        <AttendancePage
          status="ready"
          month={toMonthTable(month)}
          onSubmit={onSubmit}
        />,
      );
      const { user, input } = await edit(raw);
      rerender(
        <AttendancePage status={status} month={null} onSubmit={onSubmit} />,
      );
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(intents).toHaveLength(0);
      rerender(
        <AttendancePage
          status="ready"
          month={toMonthTable(structuredClone(month))}
          onSubmit={onSubmit}
        />,
      );
      expect(screen.getByLabelText("Số công tùy chỉnh")).toBe(input);
      expect(input).toHaveProperty("value", raw);
      expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
      expect(
        screen
          .getByRole("button", { name: selected })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      const editor = screen.getByRole("region", { name: "Nguyễn Văn An" });
      expect(editor.textContent).toContain(
        "ID 00000000-0000-4000-8000-000000000101",
      );
      expect(editor.textContent).toContain("02/02/2024 · Công");
      expect(screen.getByRole("tab", { name: "Tăng ca" })).toHaveProperty(
        "disabled",
        true,
      );
      // Search is owned by Workspace; Page never filters this snapshot.
      expect(screen.queryByRole("searchbox")).toBeNull();
      if (raw === "3,25")
        expect(screen.getByRole("alert").textContent).toContain("0,5");
      await user.click(screen.getByRole("button", { name: "Mở rộng bảng" }));
      expect(screen.getByLabelText("Số công tùy chỉnh")).toBe(input);
      if (raw === "3.5") {
        await user.click(screen.getByRole("button", { name: "Lưu" }));
        expect(intents).toHaveLength(1);
        expect(intents[0]).toMatchObject({
          cell: {
            employeeId: "00000000-0000-4000-8000-000000000101",
            date: "2024-02-02",
            kind: "work",
            revision: "fixture-cell",
            value: null,
            reminder: true,
          },
          raw: "3.5",
          value: { type: "number", value: 3.5 },
          reminder: false,
        });
      } else {
        await user.click(screen.getByRole("button", { name: "Hủy" }));
        expect(intents).toHaveLength(0);
      }
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: selected }),
      );
    });

    it(`preview preserves ${raw}, reminder and identity through ${status}`, async () => {
      render(<AttendancePreview />);
      const { user, input } = await edit(raw);
      const controls = screen.getByRole("group", { name: "Trạng thái UI mẫu" });
      await user.click(
        within(controls).getByRole("button", {
          name: status === "loading" ? "Đang tải" : "Lỗi tải",
        }),
      );
      expect(screen.queryByRole("checkbox")).toBeNull();
      await user.click(
        within(controls).getByRole("button", { name: "Có dữ liệu" }),
      );
      expect(screen.getByLabelText("Số công tùy chỉnh")).toBe(input);
      expect(input).toHaveProperty("value", raw);
      expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
      expect(
        screen.getByRole("region", { name: "Nguyễn Văn An" }).textContent,
      ).toContain("02/02/2024 · Công");
      expect(
        screen
          .getByRole("button", { name: selected })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      expect(screen.queryByText(/Đã nhận ý định thử/)).toBeNull();
      await user.click(screen.getByRole("button", { name: "Hủy" }));
      expect(screen.queryByText(/Đã nhận ý định thử/)).toBeNull();
    });
  }
}

it.each(["changed", "missing cell", "missing employee"])(
  "keeps the draft but blocks stale intent after a %s snapshot",
  async (change) => {
    const intents: CellEditorIntent[] = [];
    const onSubmit = (intent: CellEditorIntent) => intents.push(intent);
    const { rerender } = render(
      <AttendancePage
        status="ready"
        month={toMonthTable(month)}
        onSubmit={onSubmit}
      />,
    );
    const { user, input } = await edit("3.5");
    rerender(
      <AttendancePage status="error" month={null} onSubmit={onSubmit} />,
    );
    const recovered = structuredClone(month);
    if (change === "changed") {
      recovered.cells = recovered.cells.map((cell) =>
        cell.date === "2024-02-02"
          ? {
              ...cell,
              revision: "new-revision",
              value: { type: "number", value: 2 },
            }
          : cell,
      );
    } else if (change === "missing cell") {
      recovered.cells = [];
    } else {
      recovered.employees = [];
    }
    rerender(
      <AttendancePage
        status="ready"
        month={toMonthTable(recovered)}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText("Số công tùy chỉnh")).toBe(input);
    expect(input).toHaveProperty("value", "3.5");
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    expect(screen.getByRole("alert").textContent).toContain(
      "Phần nhập được giữ",
    );
    expect(screen.getByRole("button", { name: "Lưu" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(input);
    await user.keyboard("{Enter}");
    await user.tab();
    expect(intents).toHaveLength(0);
    expect(screen.getByLabelText("Số công tùy chỉnh")).toBe(input);
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(intents).toHaveLength(0);
    expect(screen.queryByLabelText("Số công tùy chỉnh")).toBeNull();
  },
);
