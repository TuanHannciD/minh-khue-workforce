// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendancePage } from "./attendance-page";
import { AttendanceDraft } from "../model/attendance-draft";
import { attendanceFixture } from "../preview/attendance-fixture";
import { SessionBoundary } from "@/shared/api/session-boundary";
afterEach(cleanup);
it("same-user reauthentication remount restores overtime editor raw and identity", () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const cell = attendanceFixture.cells.find(
    (c) => c.kind === "overtime" && c.state === "editable",
  )!;
  draft.open(attendanceFixture, cell, "owner");
  draft.change({ raw: "3,25", custom: true });
  boundary.invalidate();
  boundary.allowWrites();
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={() => {}}
      draft={draft}
      ownerUserId="owner"
    />,
  );
  expect(screen.queryByLabelText("Số giờ tùy chỉnh")).toHaveProperty(
    "value",
    "3,25",
  );
  expect(
    screen.getByRole("tab", { name: "Tăng ca" }).getAttribute("aria-selected"),
  ).toBe("true");
});

it("Keep/Escape across context guard preserves bulk raw/error/reminder/mode/source and frozen counts", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const cells = attendanceFixture.cells
    .filter(
      (c) =>
        c.employeeId === attendanceFixture.employees[0]!.id &&
        c.kind === "work",
    )
    .slice(0, 5);
  draft.openBulk(attendanceFixture, cells, "owner", cells[2]!);
  draft.change({
    raw: "3,25",
    custom: true,
    error: "Sai bước",
    reminder: true,
    mode: "replace",
  });
  const before = structuredClone(draft.edit);
  const counts = draft.bulkPreview;
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={() => {}}
      draft={draft}
      ownerUserId="owner"
    />,
  );
  const user = userEvent.setup();
  for (const decision of ["Escape", "Keep"]) {
    await user.click(screen.getByRole("tab", { name: "Tăng ca" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    if (decision === "Escape") await user.keyboard("{Escape}");
    else
      await user.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
    expect(draft.edit).toEqual(before);
    expect(draft.bulkPreview).toEqual(counts);
    expect(
      screen.getByRole("tab", { name: "Công" }).getAttribute("aria-selected"),
    ).toBe("true");
  }
});
it("context_change_requires_draft_decision with protected focus and Escape keeps invalid raw/unit/identity", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  render(
    <AttendancePage
      status="ready"
      month={attendanceFixture}
      onSubmit={() => {}}
      draft={draft}
      ownerUserId="owner"
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: /ID .*0101.*2024-02-02.*Công/ }),
  );
  await user.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  await user.type(screen.getByLabelText("Số công tùy chỉnh"), "3,25");
  const opener = screen.getByRole("tab", { name: "Tăng ca" });
  const original = structuredClone(draft.edit);
  await user.click(opener);
  expect(screen.getByRole("alertdialog").getAttribute("aria-modal")).toBe(
    "true",
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(opener));
  expect(screen.getByLabelText("Số công tùy chỉnh")).toHaveProperty(
    "value",
    "3,25",
  );
  expect(draft.edit?.cell.kind).toBe("work");
  expect(draft.edit).toEqual(original);
  await user.click(opener);
  await user.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
  await waitFor(() => expect(document.activeElement).toBe(opener));
  expect(draft.edit).toEqual(original);
  await user.click(screen.getByRole("tab", { name: "Tăng ca" }));
  await user.click(
    screen.getByRole("button", { name: "Bỏ phần nhập và tiếp tục" }),
  );
  expect(draft.edit).toBeNull();
  expect(screen.getByLabelText("Tổng tháng · giờ")).toBeTruthy();
});
