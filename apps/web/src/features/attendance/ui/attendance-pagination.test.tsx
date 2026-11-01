// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendancePagination } from "./attendance-pagination";

afterEach(cleanup);
const pagination = {
  from: 1,
  to: 25,
  totalResults: 1000,
  monthEmployeeCount: 1000,
  page: 1,
  requestedPage: 1,
  pageSize: 25 as const,
  totalPages: 40,
};
it("pager_jump_size_and_empty_status", async () => {
  const onPage = vi.fn();
  const onSize = vi.fn();
  const user = userEvent.setup();
  render(
    <AttendancePagination
      pagination={pagination}
      disabled={false}
      onPage={onPage}
      onPageSize={onSize}
      position="top"
    />,
  );
  expect(screen.getByLabelText("Số nhân sự mỗi trang")).toHaveProperty(
    "value",
    "25",
  );
  await user.selectOptions(screen.getByLabelText("Số nhân sự mỗi trang"), "50");
  expect(onSize).toHaveBeenCalledWith(50);
  expect(onPage).not.toHaveBeenCalled();
  const input = screen.getByLabelText("Đến trang");
  await user.type(input, "4");
  expect(onPage).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Đi" }));
  expect(onPage).toHaveBeenCalledWith(4);
  await user.clear(input);
  await user.click(screen.getByRole("button", { name: "Đi" }));
  expect(screen.getByRole("alert").textContent).toContain("1 đến 40");
  expect(onPage).toHaveBeenCalledTimes(1);
  expect(screen.getByText("1–25 / 1.000 nhân sự")).toBeTruthy();
  cleanup();
  render(
    <AttendancePagination
      pagination={{
        ...pagination,
        from: 0,
        to: 0,
        totalResults: 0,
        totalPages: 0,
        page: 1,
      }}
      disabled={true}
      onPage={onPage}
      onPageSize={onSize}
      position="bottom"
    />,
  );
  expect(screen.getByText("0–0 / 0 kết quả")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Trang trước" })).toHaveProperty(
    "disabled",
    true,
  );
});

it.each(["0", "1.5", "", "41", "-1", "1e1"])(
  "pager rejects local invalid jump %s without request",
  async (raw) => {
    const onPage = vi.fn();
    render(
      <AttendancePagination
        pagination={pagination}
        disabled={false}
        onPage={onPage}
        onPageSize={() => {}}
        position="top"
      />,
    );
    fireEvent.change(screen.getByLabelText("Đến trang"), {
      target: { value: raw },
    });
    fireEvent.click(screen.getByRole("button", { name: "Đi" }));
    expect(screen.getByRole("alert").textContent).toContain("1 đến 40");
    expect(onPage).not.toHaveBeenCalled();
  },
);
it("jump 40 submits once and empty month differs from search miss", () => {
  const onPage = vi.fn();
  const props = {
    pagination,
    disabled: false,
    onPage,
    onPageSize: vi.fn(),
    position: "top" as const,
  };
  const view = render(<AttendancePagination {...props} />);
  fireEvent.change(screen.getByLabelText("Đến trang"), {
    target: { value: "40" },
  });
  expect(onPage).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole("form", { name: "Chuyển trang" }));
  expect(onPage.mock.calls).toEqual([[40]]);
  view.rerender(
    <AttendancePagination
      {...props}
      pagination={{
        ...pagination,
        from: 0,
        to: 0,
        totalPages: 0,
        totalResults: 0,
      }}
    />,
  );
  expect(screen.getByText("Trang 0 / 0")).toBeTruthy();
  expect(screen.getByText("0–0 / 0 kết quả")).toBeTruthy();
  view.rerender(
    <AttendancePagination
      {...props}
      pagination={{
        ...pagination,
        from: 0,
        to: 0,
        totalPages: 0,
        totalResults: 0,
        monthEmployeeCount: 0,
      }}
    />,
  );
  expect(screen.getByText("0–0 / 0 nhân sự")).toBeTruthy();
});
