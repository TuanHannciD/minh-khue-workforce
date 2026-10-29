// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendancePage } from "./attendance-page";
import { attendanceFixture } from "../preview/attendance-fixture";

afterEach(cleanup);
it("keeps editor raw and reminder while one Save is pending, without saved feedback", async () => {
  let requests = 0;
  const user = userEvent.setup();
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={() => {
        requests++;
        return new Promise<void>(() => {});
      }}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-02.*Công/ }),
  );
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  await user.type(screen.getByLabelText("Số công tùy chỉnh"), "3.5");
  await user.click(screen.getByRole("checkbox", { name: /Nhắc kiểm tra/ }));
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(screen.queryByLabelText("Số công tùy chỉnh")).toHaveProperty(
    "value",
    "3.5",
  );
  expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
  expect(requests).toBe(1);
  expect(screen.queryByText(/Đã lưu/)).toBeNull();
});
