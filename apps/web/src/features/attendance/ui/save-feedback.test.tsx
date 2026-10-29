// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AttendanceDraft } from "../model/attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture as month } from "../preview/attendance-fixture";
import { SaveFeedback } from "./save-feedback";
import { ApiError } from "@/shared/api/transport";

afterEach(cleanup);
it("shows every nonfirst target and source conflict with identity, current content and draft; reconcile shows all original keys", async () => {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const source = month.cells.find(
    (c) => c.date === "2024-02-03" && c.kind === "work",
  )!;
  const first = { ...source, date: "2024-02-10", value: null };
  const second = {
    ...source,
    employeeId: month.employees[1]!.id,
    date: "2024-02-12",
    value: null,
  };
  const snapshot = { ...month, cells: [source, first, second] };
  draft.openBulk(snapshot, [first, second], "owner", source);
  const conflicts = [
    {
      ...second,
      value: { type: "absence" as const },
      reminder: true,
      revision: "second-new",
    },
    {
      ...source,
      value: { type: "number" as const, value: 5 },
      reminder: false,
      revision: "source-new",
    },
  ];
  await draft.submit(async () => {
    throw new ApiError(409, "CONFLICT", "Ô đã thay đổi", { cells: conflicts });
  });
  const { rerender } = render(
    <SaveFeedback draft={draft} onSaved={() => {}} />,
  );
  const list = screen.getByRole("list", { name: "Các ô xung đột" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent).toContain(second.employeeId);
  expect(rows[0]!.textContent).toContain(month.employees[1]!.name);
  expect(rows[0]!.textContent).toContain("2024-02-12");
  expect(rows[0]!.textContent).toMatch(/Công.*F.*có nhắc.*3,5/s);
  expect(rows[1]!.textContent).toMatch(
    /Nguồn.*2024-02-03.*5.*không nhắc.*3,5/s,
  );
  await draft.reconcile(async () => ({
    employees: month.employees,
    missingEmployeeIds: [],
    cells: [first, ...conflicts],
    fetchedAt: "now",
  }));
  rerender(<SaveFeedback draft={draft} onSaved={() => {}} />);
  const compared = screen.getByRole("list", { name: "Các ô đã đối chiếu" });
  expect(within(compared).getAllByRole("listitem")).toHaveLength(3);
  expect(compared.textContent).toContain("2024-02-10");
  expect(compared.textContent).toContain("2024-02-12");
  expect(compared.textContent).toContain("2024-02-03");
  expect(draft.edit?.raw).toBe("3,5");
  expect(draft.edit?.mode).toBe("fill-empty");
  await draft.reconcile(async () => ({
    employees: month.employees,
    missingEmployeeIds: [],
    cells: [
      first,
      conflicts[0]!,
      { ...source, value: null, state: "before-start" },
    ],
    fetchedAt: "later",
  }));
  rerender(<SaveFeedback draft={draft} onSaved={() => {}} />);
  expect(
    screen.getByRole("list", { name: "Các ô đã đối chiếu" }).textContent,
  ).toContain("Dữ liệu hiện tại: N");
});
