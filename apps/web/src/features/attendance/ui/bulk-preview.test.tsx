// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkEditor } from "./bulk-editor";
import { AttendanceDraft } from "../model/attendance-draft";
import { sessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture } from "../preview/attendance-fixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionBoundary.invalidate();
});
function Host({ draft }: { draft: AttendanceDraft }) {
  useSyncExternalStore(draft.subscribe, draft.snapshot);
  return draft.edit ? (
    <BulkEditor
      draft={draft}
      onSaved={() => {}}
      onCancel={() => draft.clear()}
    />
  ) : (
    <p>Đã đóng phần nhập</p>
  );
}
it.each([false, true])(
  "preview source=%s confirms occupied frozen baseline by mode and writes one atomic batch only after Apply",
  async (source) => {
    const month = structuredClone(attendanceFixture);
    const cells = month.cells
      .filter(
        (c) => c.employeeId === month.employees[0]!.id && c.kind === "work",
      )
      .slice(0, 4);
    const skipped = month.cells.filter(
      (c) =>
        c.employeeId === month.employees[1]!.id &&
        c.kind === "work" &&
        ["2024-02-01", "2024-02-29"].includes(c.date),
    );
    sessionBoundary.allowWrites();
    const draft = new AttendanceDraft();
    expect(
      draft.openBulk(
        month,
        [...cells, cells[0]!, ...skipped],
        "owner",
        source ? cells[2]! : undefined,
      ),
    ).toBe(true);
    const requests: { path: string; method: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
      requests.push({
        path,
        method: init.method!,
        body: JSON.parse(init.body as string),
      });
      return Response.json({
        state: "saved",
        cells: [],
        employees: month.employees,
        counts: {
          selected: source ? 5 : 6,
          eligible: source ? 3 : 4,
          skipped: 2,
          changed: 3,
        },
        savedAt: "now",
      });
    });
    render(<Host draft={draft} />);
    const user = userEvent.setup();
    const occupied = source ? 1 : 2;
    expect(
      screen.getByText(new RegExp(`Giữ nguyên ${occupied} ô đã có số/F`)),
    ).toBeTruthy();
    // A later snapshot/mutation cannot replace the captured preview baseline.
    for (const c of month.cells) c.value = null;
    await user.selectOptions(
      screen.getByLabelText("Chế độ áp dụng"),
      "replace",
    );
    expect(
      screen.getByText(
        new RegExp(`Ghi đè nội dung của ${occupied} ô đã có số/F`),
      ),
    ).toBeTruthy();
    if (!source) await user.type(screen.getByLabelText("Số công áp dụng"), "F");
    expect(screen.getByRole("status").textContent).toContain(
      "3 ô đổi nội dung",
    );
    expect(screen.getByRole("status").textContent).toContain("2 ô N/— bỏ qua");
    expect(requests).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Áp dụng" }));
    await screen.findByText("Đã đóng phần nhập");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      path: "/api/v1/attendance/changes",
      method: "POST",
      body: {
        operation: {
          type: "set-value",
          mode: "replace",
          value: source ? { type: "number", value: 3.5 } : { type: "absence" },
        },
      },
    });
    const body = requests[0]!.body as {
      targets: { date: string; employeeId: string }[];
      source?: { date: string };
      operation: object;
    };
    expect(body.targets).toHaveLength(source ? 5 : 6);
    if (source) {
      expect(body.source?.date).toBe("2024-02-03");
      expect(
        body.targets.some(
          (c) =>
            c.date === "2024-02-03" && c.employeeId === cells[2]!.employeeId,
        ),
      ).toBe(false);
    }
    expect(body.operation).not.toHaveProperty("reminder");
  },
);
