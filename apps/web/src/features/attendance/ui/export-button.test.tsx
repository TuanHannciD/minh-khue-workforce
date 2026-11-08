// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, SessionRuntime } from "@/features/session/index";
import { sessionBoundary } from "@/shared/api/session-boundary";
import { AttendanceWorkspace } from "./attendance-workspace";
import { AttendanceDraft } from "../model/attendance-draft";
import type { AttendancePageDto, PageCriteria } from "../model/types";
import { toMonthTable } from "../model/attendance-read-view";
import { attendanceFixture } from "../preview/attendance-fixture";

afterEach(() => {
  cleanup();
  sessionBoundary.invalidate();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(
  exportResponse: (signal: AbortSignal) => Promise<Response>,
) {
  const client = new QueryClient();
  const runtime = new SessionRuntime(client);
  const deadline = new Date(Date.now() + 3600000).toISOString();
  const requests: { path: string; method: string }[] = [];
  const exportSignals: AbortSignal[] = [];
  vi.stubGlobal("fetch", async (path: string, options: RequestInit) => {
    requests.push({ path, method: options.method ?? "GET" });
    if (path.includes("/attendance/export")) {
      const signal = options.signal as AbortSignal;
      exportSignals.push(signal);
      return exportResponse(signal);
    }
    const criteria: PageCriteria = path.includes("/attendance/search")
      ? (JSON.parse(options.body as string) as PageCriteria)
      : { month: "2024-02", q: "", page: 1, pageSize: 25 };
    const table = toMonthTable(attendanceFixture);
    const page: AttendancePageDto = {
      ...table,
      month: criteria.month,
      fetchedAt: "fixture",
      pagination: {
        ...table.range,
        page: criteria.page,
        requestedPage: criteria.page,
        pageSize: criteria.pageSize,
        totalPages: 1,
      },
    };
    return Response.json(
      path.includes("/auth/session")
        ? {
            user: { userId: "owner", username: "owner" },
            expiresAt: deadline,
            idleExpiresAt: deadline,
          }
        : page,
    );
  });
  const create = vi.fn(() => "blob:fixture");
  const revoke = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: create,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revoke,
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await runtime.refresh();
  const draft = new AttendanceDraft(sessionBoundary);
  draft.open(
    attendanceFixture,
    attendanceFixture.cells.find(
      (c) => c.kind === "work" && c.state === "editable",
    )!,
    "owner",
  );
  draft.change({ raw: "3,25", custom: true, reminder: true });
  const original = structuredClone(draft.edit);
  const rendered = render(
    <QueryClientProvider client={client}>
      <SessionProvider runtime={runtime}>
        <AttendanceWorkspace draft={draft} onEmployee={() => {}} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return {
    client,
    runtime,
    draft,
    original,
    requests,
    create,
    click,
    rendered,
    exportSignals,
  };
}
const xlsx = () =>
  new Response(new Uint8Array([80, 75, 3, 4]), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
it("has one export action after changing month and still preserves the page context guard", async () => {
  const s = await setup(async () => xlsx());
  try {
    await screen.findByRole("button", { name: "Xuất Excel" });
    fireEvent.change(screen.getByLabelText("Tháng chấm công"), {
      target: { value: "2026-02" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Bỏ phần nhập và đổi tháng" }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Xuất Excel" }),
      ).toHaveLength(1),
    );
  } finally {
    s.runtime.expire();
    s.client.clear();
  }
});
it("waits for the complete body, deduplicates pending download and preserves raw draft without saving", async () => {
  let finish!: (value: Blob) => void;
  let received = false;
  const body = new Promise<Blob>((r) => {
    finish = r;
  });
  const response = xlsx();
  response.blob = async () => {
    received = true;
    return body;
  };
  const s = await setup(async () => response);
  try {
    const button = await screen.findByRole("button", { name: "Xuất Excel" });
    fireEvent.click(button);
    await waitFor(() => expect(received).toBe(true));
    expect(button).toHaveProperty("disabled", true);
    expect(s.create).not.toHaveBeenCalled();
    expect(screen.queryByText(/Đã nhận tệp/)).toBeNull();
    fireEvent.click(button);
    finish(new Blob([new Uint8Array([80, 75, 3, 4])]));
    await screen.findByText(/Đã nhận tệp/);
    expect(s.click).toHaveBeenCalledTimes(1);
    expect(s.draft.edit).toEqual(s.original);
    expect(
      s.requests.filter((r) => r.path.includes("/attendance/export")),
    ).toEqual([
      { path: "/api/v1/attendance/export?month=2024-02", method: "GET" },
    ]);
    expect(
      s.requests.every(
        (r) =>
          r.method === "GET" ||
          (r.path === "/api/v1/attendance/search" && r.method === "POST"),
      ),
    ).toBe(true);
    expect(s.requests.some((r) => r.path.includes("/attendance/month"))).toBe(
      false,
    );
  } finally {
    s.runtime.expire();
    s.client.clear();
  }
});
it.each(["server", "forbidden", "network", "empty", "truncated", "wrong-type"])(
  "keeps error and offers an explicit fresh download after %s failure",
  async (failure) => {
    let attempt = 0;
    const s = await setup(async () => {
      if (++attempt > 1) return xlsx();
      if (failure === "network") throw new TypeError("offline");
      if (failure === "server" || failure === "forbidden")
        return Response.json(
          { error: { code: "EXPORT_FAILED", message: "Chưa thể xuất tệp." } },
          { status: failure === "forbidden" ? 403 : 503 },
        );
      if (failure === "wrong-type") return Response.json({});
      const response = xlsx();
      if (failure === "empty") {
        response.blob = async () => new Blob([]);
        return response;
      }
      response.blob = async () => {
        throw new TypeError("body interrupted");
      };
      return response;
    });
    try {
      fireEvent.click(
        await screen.findByRole("button", { name: "Xuất Excel" }),
      );
      await screen.findByRole("alert");
      expect(attempt).toBe(1);
      expect(s.click).not.toHaveBeenCalled();
      expect(s.draft.edit).toEqual(s.original);
      expect(
        s.client
          .getQueryCache()
          .getAll()
          .every((q) => !(q.state.data instanceof Blob)),
      ).toBe(true);
      expect(
        s.requests.every(
          (r) =>
            r.method === "GET" ||
            (r.path === "/api/v1/attendance/search" && r.method === "POST"),
        ),
      ).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Thử xuất lại" }));
      await screen.findByText(/Đã nhận tệp/);
      expect(attempt).toBe(2);
    } finally {
      s.runtime.expire();
      s.client.clear();
    }
  },
);
it("rejects a completed body from the previous session without creating a download", async () => {
  let finish!: (value: Blob) => void;
  let started = false;
  const response = xlsx();
  response.blob = () => {
    started = true;
    return new Promise((r) => {
      finish = r;
    });
  };
  const s = await setup(async () => response);
  try {
    fireEvent.click(await screen.findByRole("button", { name: "Xuất Excel" }));
    await waitFor(() => expect(started).toBe(true));
    sessionBoundary.invalidate();
    sessionBoundary.allowWrites();
    finish(new Blob(["previous-session"]));
    await screen.findByRole("alert");
    expect(s.create).not.toHaveBeenCalled();
    expect(s.exportSignals[0]!.aborted).toBe(true);
    expect(s.draft.edit).toEqual(s.original);
  } finally {
    s.runtime.expire();
    s.client.clear();
  }
});

it.each(["unmount", "month"] as const)(
  "%s aborts the export body without downloading, writing, or retrying",
  async (action) => {
    let finish!: (value: Blob) => void;
    let started = false;
    const response = xlsx();
    response.blob = () => {
      started = true;
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const s = await setup(async () => response);
    try {
      fireEvent.click(
        await screen.findByRole("button", { name: "Xuất Excel" }),
      );
      await waitFor(() => expect(started).toBe(true));
      const oldSignal = s.exportSignals[0]!;
      if (action === "unmount") s.rendered.unmount();
      else {
        fireEvent.change(screen.getByLabelText("Tháng chấm công"), {
          target: { value: "2024-03" },
        });
        fireEvent.click(
          await screen.findByRole("button", {
            name: "Bỏ phần nhập và đổi tháng",
          }),
        );
        await waitFor(() =>
          expect(screen.getByLabelText("Tháng chấm công")).toHaveProperty(
            "value",
            "2024-03",
          ),
        );
        await screen.findByText(/Tháng 2024-03 ·/);
      }
      // Workspace holds the old displayed/export month until the new page is accepted.
      await waitFor(() => expect(oldSignal.aborted).toBe(true));
      await act(async () => finish(new Blob(["late body ignores abort"])));
      expect(s.create).not.toHaveBeenCalled();
      expect(s.click).not.toHaveBeenCalled();
      expect(s.exportSignals).toHaveLength(1);
      expect(
        s.requests.filter((r) => r.path.includes("/attendance/export")),
      ).toEqual([
        { path: "/api/v1/attendance/export?month=2024-02", method: "GET" },
      ]);
      expect(
        s.requests.every(
          (r) =>
            r.method === "GET" ||
            (r.path === "/api/v1/attendance/search" && r.method === "POST"),
        ),
      ).toBe(true);
      expect(
        s.client
          .getQueryCache()
          .getAll()
          .every((q) => !(q.state.data instanceof Blob)),
      ).toBe(true);
      if (action === "unmount") expect(s.draft.edit).toEqual(s.original);
    } finally {
      s.rendered.unmount();
      s.runtime.expire();
      s.client.clear();
    }
  },
);
