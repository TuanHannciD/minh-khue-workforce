// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceGrid } from "./attendance-grid";
import { AttendancePage } from "./attendance-page";
import { attendanceFixture } from "../preview/attendance-fixture";
import { CellEditor } from "./cell-editor";

afterEach(cleanup);
it("invalid input stays raw while Tab can leave the field, and cancellation remains reachable", async () => {
  const cell = attendanceFixture.cells.find(
    (c) => c.date === "2024-02-02" && c.kind === "overtime",
  )!;
  const user = userEvent.setup();
  render(
    <CellEditor
      cell={cell}
      employee={attendanceFixture.employees[0]!}
      onSubmit={() => {
        throw new Error("invalid input must not submit");
      }}
      onCancel={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  const input = screen.getByLabelText("Số giờ tùy chỉnh");
  await user.type(input, "24,5");
  await user.tab();
  expect(input).toHaveProperty("value", "24,5");
  expect(document.activeElement).toBe(screen.getByRole("checkbox"));
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Hủy" }),
  );
});
it("Tab after a valid editor value returns focus to the next eligible day without changing snapshot totals", async () => {
  const intents: unknown[] = [];
  const user = userEvent.setup();
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={(intent) => {
        intents.push(intent);
      }}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-28.*Công/ }),
  );
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  await user.type(screen.getByLabelText("Số công tùy chỉnh"), "30");
  await user.tab();
  expect(intents).toHaveLength(1);
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /ID .*0101.*2024-02-29.*Công/,
  );
  expect(screen.getByLabelText("Tổng tháng · công").textContent).toBe("3,5");
});
it("renders one semantic leap-month table with distinct symbols, ID labels and independent snapshot totals", () => {
  render(
    <AttendanceGrid
      month={attendanceFixture}
      kind="work"
      selection={null}
      onCellIntent={() => {}}
    />,
  );
  const table = screen.getByRole("table");
  expect(
    within(table).getByRole("columnheader", { name: "29 T5" }),
  ).toBeTruthy();
  expect(within(table).queryByRole("columnheader", { name: /30/ })).toBeNull();
  expect(
    screen.getAllByRole("rowheader", { name: /Nguyễn Văn An/ }),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-01.*Công.*F/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: /ID .*0101.*2024-02-02.*trống.*Nhắc kiểm tra/,
    }),
  ).toBeTruthy();
  expect(table.textContent).toContain("N");
  expect(table.textContent).toContain("—");
  expect(screen.getByLabelText("Tổng tháng · công").textContent).toBe("3,5");
});
it("keeps loading, first-load error, empty and filtered-empty distinct", async () => {
  const { rerender } = render(
    <AttendancePage status="loading" month={null} onSubmit={() => {}} />,
  );
  expect(screen.getByRole("status").textContent).toContain("Đang tải");
  expect(screen.queryByRole("table")).toBeNull();
  rerender(<AttendancePage status="error" month={null} onSubmit={() => {}} />);
  expect(screen.getByRole("alert").textContent).toContain("Chưa tải được");
  rerender(
    <AttendancePage
      status="ready"
      month={{ ...attendanceFixture, employees: [], cells: [] }}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByText(/Chưa có nhân sự/)).toBeTruthy();
  rerender(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={() => {}}
    />,
  );
  await userEvent.type(screen.getByLabelText("Tìm nhân sự"), "không có tên");
  expect(screen.getByText(/Không tìm thấy nhân sự/)).toBeTruthy();
});
it("retains invalid raw input, sends exact identity/value/reminder only on Save, and advances through eligible cells", async () => {
  const intents: unknown[] = [];
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={(intent) => {
        intents.push(intent);
      }}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-02.*Công.*trống/ }),
  );
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  const input = screen.getByLabelText("Số công tùy chỉnh");
  await user.type(input, "3,25");
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(intents).toHaveLength(0);
  expect(input).toHaveProperty("value", "3,25");
  expect(screen.getByRole("alert").textContent).toContain("0,5");
  await user.clear(input);
  await user.type(input, "3.5");
  await user.click(screen.getByRole("checkbox", { name: /Nhắc kiểm tra/ }));
  await user.click(input);
  await user.keyboard("{Enter}");
  expect(intents).toHaveLength(1);
  expect(intents[0]).toMatchObject({
    cell: {
      employeeId: "00000000-0000-4000-8000-000000000101",
      date: "2024-02-02",
      kind: "work",
    },
    value: { type: "number", value: 3.5 },
    reminder: false,
    raw: "3.5",
  });
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /ID .*0102.*2024-02-02/,
  );
  expect(screen.getByLabelText("Tổng tháng · công").textContent).toBe("3,5");
});
it("switches units without mixing totals, overtime never offers F, and cancel emits no intent", async () => {
  const intents: unknown[] = [];
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={(intent) => {
        intents.push(intent);
      }}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Tăng ca" }));
  expect(screen.getByLabelText("Tổng tháng · giờ").textContent).toBe("2");
  await user.click(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-02.*Tăng ca/ }),
  );
  expect(screen.queryByRole("button", { name: "F · Nghỉ" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "2,5" }));
  await user.click(screen.getByRole("button", { name: "Hủy" }));
  expect(intents).toHaveLength(0);
});
