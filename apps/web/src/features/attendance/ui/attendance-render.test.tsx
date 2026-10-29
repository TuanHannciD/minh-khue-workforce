// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceGrid } from "./attendance-grid";
import { AttendancePage } from "./attendance-page";
import { AttendanceDraft } from "../model/attendance-draft";
import { attendanceFixture } from "../preview/attendance-fixture";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { ApiError } from "@/shared/api/transport";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("raw/reminder/custom/error edits update the real editor without projecting or rendering unrelated grid cells", async () => {
  const month = structuredClone(attendanceFixture);
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const editable = month.cells.filter(
    (c) => c.kind === "work" && c.state === "editable",
  );
  draft.open(month, editable[0]!, "owner");
  const projection = vi.spyOn(month.cells, "map");
  const neighbor = editable.at(-1)!;
  const renderRead = vi.fn(() => false);
  Object.defineProperty(neighbor, "reminder", { get: renderRead });
  render(
    <AttendancePage
      status="ready"
      month={month}
      onSubmit={() => {}}
      draft={draft}
      ownerUserId="owner"
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  projection.mockClear();
  renderRead.mockClear();
  const input = screen.getByLabelText("Số công tùy chỉnh");
  for (const value of ["3", "3,", "3,2", "3,25"])
    fireEvent.change(input, { target: { value } });
  await user.click(
    screen.getByRole("checkbox", { name: /Nhắc kiểm tra ô này/ }),
  );
  await user.click(screen.getByRole("button", { name: "Lưu" }));
  expect(input).toHaveProperty("value", "3,25");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(draft.edit?.reminder).toBe(true);
  expect(draft.edit?.custom).toBe(true);
  expect(projection).not.toHaveBeenCalled();
  expect(renderRead).not.toHaveBeenCalled();
  // Selection must read the dirty edit live even though the table skipped raw renders.
  await user.click(screen.getByRole("button", { name: "Chọn nhiều" }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(input).toHaveProperty("value", "3,25");
});
it("pending/conflict and polling keep original CAS while current callbacks remain live", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const cell = attendanceFixture.cells.find(
    (c) => c.kind === "work" && c.state === "editable",
  )!;
  draft.open(attendanceFixture, cell, "owner");
  draft.change({ raw: "2", custom: true });
  const original = structuredClone(draft.edit);
  const oldCallback = vi.fn(),
    latestCallback = vi.fn();
  const props = {
    status: "ready" as const,
    month: attendanceFixture,
    onSubmit: () => {},
    draft,
    ownerUserId: "owner",
  };
  const view = render(<AttendancePage {...props} onEmployee={oldCallback} />);
  let rejectWrite!: (reason: unknown) => void;
  let sending!: Promise<boolean>;
  act(() => {
    sending = draft.submit(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
  });
  expect(screen.getByRole("button", { name: "Lưu" })).toHaveProperty(
    "disabled",
    true,
  );
  await act(async () => {
    rejectWrite(new ApiError(409, "CONFLICT", "Changed", {}));
    await sending;
  });
  expect(
    screen.getByRole("button", { name: "Đối chiếu dữ liệu đã lưu" }),
  ).toBeTruthy();
  const polled = structuredClone(attendanceFixture);
  polled.cells.find(
    (c) =>
      c.employeeId === cell.employeeId &&
      c.date === cell.date &&
      c.kind === cell.kind,
  )!.revision = "new-revision";
  view.rerender(
    <AttendancePage {...props} month={polled} onEmployee={latestCallback} />,
  );
  expect(draft.edit).toEqual(original);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Sửa thông tin nhân sự" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Bỏ phần nhập và tiếp tục" }),
  );
  expect(oldCallback).not.toHaveBeenCalled();
  expect(latestCallback).toHaveBeenCalledOnce();
});

it("freshness-only polling reuses structural grid rows while replacing event callbacks", async () => {
  const month = structuredClone(attendanceFixture);
  const projection = vi.spyOn(month.cells, "map");
  const props = { status: "ready" as const, month, onSubmit: () => {} };
  const view = render(<AttendancePage {...props} />);
  projection.mockClear();
  view.rerender(
    <AttendancePage {...props} month={{ ...month, fetchedAt: "fresh" }} />,
  );
  expect(projection).not.toHaveBeenCalled();
});

it("memoized grid cells forward clicks to the latest committed callback", async () => {
  const calls: string[] = [];
  const props = { month: attendanceFixture, selection: null };
  const view = render(
    <AttendanceGrid {...props} onCellIntent={() => calls.push("old")} />,
  );
  view.rerender(
    <AttendanceGrid {...props} onCellIntent={() => calls.push("new")} />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-02.*Công/ }),
  );
  expect(calls).toEqual(["new"]);
});
