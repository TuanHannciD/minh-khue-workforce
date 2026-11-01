// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AttendancePage } from "./attendance-page";
import { AttendanceDraft } from "../model/attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { toMonthTable } from "../model/attendance-read-view";
import { attendanceFixture as month } from "../preview/attendance-fixture";
import { ApiError } from "@/shared/api/transport";

afterEach(cleanup);
const cell = (day: string) =>
  screen.getByRole("button", {
    name: new RegExp(`ID .*0101.*2024-02-${day}.*Công`),
  });
it.each(["save", "recovery"])(
  "successful single-cell %s ends pending fill and ordinary click opens only that cell",
  async (action) => {
    const boundary = new SessionBoundary();
    boundary.allowWrites();
    const draft = new AttendanceDraft(boundary);
    const accepted = async () => ({
      state: "saved" as const,
      cells: [],
      employees: [],
      counts: { selected: 1, eligible: 1, skipped: 0, changed: 1 },
      savedAt: "now",
    });
    const submit = draft.submit.bind(draft),
      recover = draft.recover.bind(draft);
    vi.spyOn(draft, "submit").mockImplementation(() => submit(accepted));
    vi.spyOn(draft, "recover").mockImplementation((choice) =>
      recover(choice, accepted),
    );
    render(
      <AttendancePage
        status="ready"
        month={toMonthTable(month)}
        draft={draft}
        ownerUserId="owner"
        onSubmit={() => {}}
      />,
    );
    fireEvent.click(cell("03"));
    fireEvent.click(screen.getByRole("button", { name: "Điền từ ô này" }));
    expect(screen.getByText(/Chọn ô cuối bằng/)).toBeTruthy();
    if (action === "save") {
      fireEvent.click(screen.getByRole("button", { name: "2" }));
      fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    } else {
      await act(async () => {
        draft.change({ raw: "2" });
        await submit(async () => {
          throw new ApiError(409, "ATTENDANCE_CONFLICT", "Ô đã thay đổi");
        });
      });
      expect(screen.getByText(/Chọn ô cuối bằng/)).toBeTruthy();
      await act(async () => {
        await draft.reconcile(async () => ({
          cells: [draft.edit!.cell],
          employees: month.employees,
          missingEmployeeIds: [],
          fetchedAt: "now",
        }));
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Lưu bản nháp sau đối chiếu" }),
      );
    }
    await waitFor(() => expect(draft.edit).toBeNull());
    expect(screen.queryByText(/Chọn ô cuối bằng/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(cell("03")));
    fireEvent.click(cell("05"));
    expect(draft.edit?.cell.date).toBe("2024-02-05");
    expect(draft.edit?.mode).toBe("patch-cell");
    expect(draft.edit?.targets).toHaveLength(1);
    expect(draft.edit?.source).toBeNull();
  },
);
