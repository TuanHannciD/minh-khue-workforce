// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, SessionRuntime } from "@/features/session/index";
import { sessionBoundary } from "@/shared/api/session-boundary";
import { AttendanceWorkspace } from "./attendance-workspace";
import { AttendanceDraft } from "../model/attendance-draft";
import { attendanceFixture } from "../preview/attendance-fixture";
afterEach(() => {
  cleanup();
  sessionBoundary.invalidate();
  vi.unstubAllGlobals();
});

it.each(["keep", "escape"])(
  "month guard %s restores month input and preserves raw, ID, baseline and unit",
  async (choice) => {
    const client = new QueryClient();
    const runtime = new SessionRuntime(client);
    const deadline = new Date(Date.now() + 3600000).toISOString();
    vi.stubGlobal("fetch", async (path: string) =>
      Response.json(
        path.includes("/auth/session")
          ? {
              user: { userId: "owner", username: "owner" },
              expiresAt: deadline,
              idleExpiresAt: deadline,
            }
          : attendanceFixture,
      ),
    );
    await runtime.refresh();
    const draft = new AttendanceDraft(sessionBoundary);
    const cell = attendanceFixture.cells.find(
      (c) => c.kind === "overtime" && c.state === "editable",
    )!;
    draft.open(attendanceFixture, cell, "owner");
    draft.change({ raw: "3,25", custom: true, reminder: true });
    const original = structuredClone(draft.edit);
    try {
      render(
        <QueryClientProvider client={client}>
          <SessionProvider runtime={runtime}>
            <AttendanceWorkspace draft={draft} onEmployee={() => {}} />
          </SessionProvider>
        </QueryClientProvider>,
      );
      await screen.findByLabelText("Số giờ tùy chỉnh");
      const opener = screen.getByLabelText("Tháng chấm công");
      opener.focus();
      fireEvent.change(opener, { target: { value: "2024-03" } });
      await screen.findByRole("alertdialog");
      const user = userEvent.setup();
      if (choice === "keep")
        await user.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
      else await user.keyboard("{Escape}");
      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(opener).toHaveProperty("value", "2024-02");
      expect(screen.getByLabelText("Số giờ tùy chỉnh")).toHaveProperty(
        "value",
        "3,25",
      );
      expect(draft.edit).toEqual(original);
      expect(
        screen
          .getByRole("tab", { name: "Tăng ca" })
          .getAttribute("aria-selected"),
      ).toBe("true");
    } finally {
      runtime.expire();
      client.clear();
    }
  },
);
