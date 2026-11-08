// @vitest-environment jsdom
/**
 * File map: original month Keep/Escape checks; pageFixture/setupPages own the
 * shared real Workspace + query + session composition and delayed body seam.
 * Tests cover stale delivery, criteria/no-write, owner guards, deferred clamp,
 * initial errors and focus/scroll. export_during_page_handoff_* pins Blob/cache
 * isolation while a dirty draft holds a clamped delivery. Keep one fixture.
 */
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  within,
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
import type { PageDelivery } from "../model/page-view";
import type { AttendancePageDto, PageCriteria } from "../model/types";
import { attendanceKeys } from "../api/query-keys";
import { attendanceFixture } from "../preview/attendance-fixture";
afterEach(() => {
  cleanup();
  sessionBoundary.invalidate();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
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
          : pageFixture({ month: "2024-02", q: "", page: 1, pageSize: 25 }),
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

function pageFixture(
  criteria: PageCriteria,
  version = "old",
  effective = criteria.page,
): AttendancePageDto {
  const person = attendanceFixture.employees[0]!;
  return {
    month: criteria.month,
    fetchedAt: version,
    employees: [{ ...person, name: version }],
    cells: attendanceFixture.cells.filter((c) => c.employeeId === person.id),
    employeeTotals: {
      work: [{ employeeId: person.id, value: 3.5 }],
      overtime: [{ employeeId: person.id, value: 2 }],
    },
    monthTotals: {
      work: { byDate: [{ date: "2024-02-02", value: 123 }], grandTotal: 123 },
      overtime: { byDate: [], grandTotal: 456 },
    },
    pagination: {
      page: effective,
      requestedPage: criteria.page,
      pageSize: criteria.pageSize,
      from: (effective - 1) * criteria.pageSize + 1,
      to: effective * criteria.pageSize,
      totalPages: 40,
      totalResults: 1000,
      monthEmployeeCount: 1000,
    },
  };
}
async function setupPages(exportResponse?: () => Promise<Response>) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-02-15T00:00:00Z"));
  const client = new QueryClient();
  const runtime = new SessionRuntime(client);
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  const calls: {
    path: string;
    method: string;
    criteria: PageCriteria;
    resolve: (data: AttendancePageDto) => void;
    fail: () => void;
  }[] = [];
  const unexpected: string[] = [];
  const exports: {
    path: string;
    method: string;
    body: BodyInit | null | undefined;
  }[] = [];
  vi.stubGlobal("fetch", async (path: string, options: RequestInit = {}) => {
    if (path.includes("/auth/"))
      return Response.json({
        user: { userId: "owner", username: "owner" },
        expiresAt,
        idleExpiresAt: expiresAt,
      });
    if (path.includes("/attendance/export") && exportResponse) {
      exports.push({
        path,
        method: options.method ?? "GET",
        body: options.body,
      });
      return exportResponse();
    }
    if (path !== "/api/v1/attendance/search" || options.method !== "POST") {
      unexpected.push(`${options.method ?? "GET"} ${path}`);
      throw new Error("unexpected table/write request");
    }
    let resolve!: (data: AttendancePageDto) => void;
    let fail!: () => void;
    const body = new Promise<AttendancePageDto>((done, reject) => {
      resolve = done;
      fail = () => reject(new Error("body failure"));
    });
    calls.push({
      path,
      method: options.method,
      criteria: JSON.parse(options.body as string) as PageCriteria,
      resolve,
      fail,
    });
    return { ok: true, status: 200, json: () => body } as Response;
  });
  await runtime.refresh();
  const draft = new AttendanceDraft(sessionBoundary);
  const disconnect = draft.connect(runtime);
  const wrapper = (owner = draft) => (
    <QueryClientProvider client={client}>
      <SessionProvider runtime={runtime}>
        <AttendanceWorkspace draft={owner} onEmployee={() => {}} />
      </SessionProvider>
    </QueryClientProvider>
  );
  const rendered = render(wrapper());
  const flush = async (ms = 0) => {
    await act(() => vi.advanceTimersByTimeAsync(ms));
  };
  await flush();
  const resolve = async (index: number, name: string, effective?: number) => {
    const call = calls[index]!;
    await act(async () => {
      call.resolve(pageFixture(call.criteria, name, effective));
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
  };
  const search = (raw: string) => {
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: raw } });
    fireEvent.keyDown(input, { key: "Enter" });
  };
  return {
    client,
    runtime,
    draft,
    calls,
    unexpected,
    exports,
    flush,
    resolve,
    search,
    rendered,
    wrapper,
    stop: () => {
      rendered.unmount();
      disconnect();
      runtime.expire();
      client.clear();
    },
  };
}
it("displayed_rows_keep_old_label_during_loading_or_error and late_body_cannot_replace_view A→B→A", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "old");
    const oldTable = screen.getByRole("table");
    expect(screen.getByText("Snapshot đã lưu lúc old.")).toBeTruthy();
    const input = screen.getByRole("searchbox");
    input.focus();
    app.search("B");
    await app.flush();
    expect(app.calls[1]!.criteria).toMatchObject({
      q: "B",
      page: 1,
      pageSize: 25,
    });
    expect(screen.getByRole("table")).toBe(oldTable);
    expect(screen.getByText("Đang tải trang…")).toBeTruthy();
    expect(oldTable.closest("[aria-busy]")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(
      screen.getByRole("button", { name: /ID .*0101.*2024-02-02.*Công/ }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Snapshot đã lưu lúc old.")).toBeTruthy();
    expect(screen.getByLabelText("Tổng tháng · công").textContent).toBe("123");
    app.search("");
    await app.flush();
    expect(app.calls[2]!.criteria.q).toBe("");
    await app.resolve(1, "late-B");
    expect(screen.queryByText("Snapshot đã lưu lúc late-B.")).toBeNull();
    await app.resolve(2, "new-A");
    expect(screen.getByText("Snapshot đã lưu lúc new-A.")).toBeTruthy();
    expect(document.activeElement).toBe(input);
    app.search("error");
    await app.flush();
    app.calls[3]!.fail();
    await app.flush();
    await app.flush(1000);
    app.calls[4]!.fail();
    await app.flush();
    await app.flush(3000);
    app.calls[5]!.fail();
    await app.flush();
    expect(screen.getByRole("alert").textContent).toContain("trang đã tải");
    expect(screen.getByRole("alert").textContent).toContain(
      "Chưa tải được trang yêu cầu.",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "Chưa cập nhật được dữ liệu nền.",
    );
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
    expect(screen.getByText("Snapshot đã lưu lúc new-A.")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Quay về trang đã tải" }),
    );
    await app.flush();
    expect(app.unexpected).toEqual([]);
    expect(
      app.calls.every(
        (c) => c.path === "/api/v1/attendance/search" && c.method === "POST",
      ),
    ).toBe(true);
  } finally {
    app.stop();
  }
});
it("page size/month/search reset1, kind keeps criteria without fetching and no navigation writes", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "first");
    const top = screen.getByRole("navigation", { name: "Phân trang đầu bảng" });
    fireEvent.change(within(top).getByLabelText("Đến trang"), {
      target: { value: "40" },
    });
    fireEvent.submit(within(top).getByRole("form", { name: "Chuyển trang" }));
    await app.flush();
    expect(app.calls[1]!.criteria.page).toBe(40);
    await app.resolve(1, "last");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /Công tháng/ }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tăng ca" }));
    await app.flush();
    expect(app.calls).toHaveLength(2);
    fireEvent.change(within(top).getByLabelText("Số nhân sự mỗi trang"), {
      target: { value: "50" },
    });
    await app.flush();
    expect(app.calls[2]!.criteria).toMatchObject({
      page: 1,
      pageSize: 50,
      q: "",
    });
    await app.resolve(2, "size");
    app.search("an");
    await app.flush();
    expect(app.calls[3]!.criteria).toMatchObject({
      page: 1,
      pageSize: 50,
      q: "an",
    });
    await app.resolve(3, "search");
    fireEvent.change(screen.getByLabelText("Tháng chấm công"), {
      target: { value: "2024-03" },
    });
    await app.flush();
    expect(app.calls[4]!.criteria).toMatchObject({
      month: "2024-03",
      page: 1,
      q: "an",
      pageSize: 50,
    });
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});
it("raw search while guard pending stays local; stale owner reference cannot discard replacement", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "first");
    act(() => {
      app.draft.open(
        attendanceFixture,
        attendanceFixture.cells.find((c) => c.state === "editable")!,
        "owner",
      );
      app.draft.change({ raw: "3,25", custom: true, reminder: true });
    });
    await app.flush();
    const before = structuredClone(app.draft.edit);
    app.search("B");
    await app.flush();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(app.calls).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { hidden: true }), {
      target: { value: "C" },
    });
    await app.flush(300);
    expect(app.calls).toHaveLength(1);
    expect(app.draft.edit).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
    await app.flush();
    expect(app.draft.edit).toEqual(before);
    expect(app.calls).toHaveLength(1);
    app.search("D");
    await app.flush();
    const replacement = new AttendanceDraft(sessionBoundary);
    replacement.open(
      attendanceFixture,
      attendanceFixture.cells.find((c) => c.state === "editable")!,
      "owner",
    );
    replacement.change({ raw: "2,5", custom: true });
    app.rendered.rerender(app.wrapper(replacement));
    await app.flush();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const discard = screen.queryByRole("button", {
      name: "Bỏ phần nhập và tiếp tục",
    });
    if (discard) fireEvent.click(discard);
    await app.flush();
    expect(replacement.edit?.raw).toBe("2,5");
    expect(app.draft.edit).toEqual(before);
    expect(app.calls).toHaveLength(1);
    act(() => replacement.discard());
    await app.flush();
    app.search("replacement-search");
    await app.flush();
    expect(app.calls).toHaveLength(2);
    expect(app.calls[1]!.criteria.q).toBe("replacement-search");
  } finally {
    app.stop();
  }
});
it.each(["owner", "generation", "epoch"] as const)(
  "editor Cancel guard closes on %s invalidation and leaves the current owner usable",
  async (invalidation) => {
    const app = await setupPages();
    try {
      await app.resolve(0, "first");
      const cell = attendanceFixture.cells.find((c) => c.state === "editable")!;
      act(() => {
        app.draft.open(attendanceFixture, cell, "owner");
        app.draft.change({
          raw: "3,25",
          custom: true,
          reminder: true,
          error: "Sai bước",
        });
      });
      await app.flush();
      const original = structuredClone(app.draft.edit);
      fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
      await app.flush();
      expect(screen.getByRole("alertdialog")).toBeTruthy();

      const replacement = new AttendanceDraft(sessionBoundary);
      replacement.open(attendanceFixture, cell, "owner");
      replacement.change({ raw: "2,5", custom: true, reminder: true });
      const replacementBefore = structuredClone(replacement.edit);
      let current = app.draft;
      if (invalidation === "owner") {
        expect(replacement.ownerGeneration).toBe(app.draft.ownerGeneration);
        current = replacement;
      } else if (invalidation === "generation") {
        act(() => {
          app.draft.discard();
          app.draft.open(attendanceFixture, cell, "owner");
          app.draft.change({ raw: "2,5", custom: true, reminder: true });
        });
      } else {
        act(() => {
          sessionBoundary.invalidate();
          sessionBoundary.allowWrites();
        });
      }
      const currentBefore = structuredClone(current.edit);
      app.rendered.rerender(app.wrapper(current));
      await app.flush();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(current.edit).toEqual(currentBefore);
      expect(replacement.edit).toEqual(replacementBefore);
      if (invalidation !== "generation")
        expect(app.draft.edit).toEqual(original);
      if (invalidation === "epoch") await app.resolve(1, "fresh-epoch");
      fireEvent.change(screen.getByLabelText("Số công tùy chỉnh"), {
        target: { value: "1,5" },
      });
      expect(current.edit?.raw).toBe("1,5");
      fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
      await app.flush();
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
      await app.flush();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(current.edit?.raw).toBe("1,5");
      expect(app.calls).toHaveLength(invalidation === "epoch" ? 2 : 1);
      if (invalidation === "epoch")
        expect(app.calls[1]!.criteria).toEqual(app.calls[0]!.criteria);
      expect(
        app.calls.every(
          (call) =>
            call.path === "/api/v1/attendance/search" && call.method === "POST",
        ),
      ).toBe(true);
      expect(app.unexpected).toEqual([]);
    } finally {
      app.stop();
    }
  },
);

it("held clamp keeps one envelope, raw baseline/footer/fetchedAt; explicit discard adopts canonical delivery", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "first");
    const top = screen.getByRole("navigation", { name: "Phân trang đầu bảng" });
    fireEvent.change(within(top).getByLabelText("Đến trang"), {
      target: { value: "40" },
    });
    fireEvent.submit(within(top).getByRole("form", { name: "Chuyển trang" }));
    await app.flush();
    await app.resolve(1, "old40");
    act(() => {
      app.draft.open(
        attendanceFixture,
        attendanceFixture.cells.find((c) => c.state === "editable")!,
        "owner",
      );
      app.draft.change({
        raw: "3,25",
        custom: true,
        error: "Sai bước",
        reminder: true,
      });
    });
    await app.flush();
    const before = structuredClone(app.draft.edit);
    await app.flush(15000);
    expect(app.calls).toHaveLength(3);
    await app.resolve(2, "clamp39", 39);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Snapshot đã lưu lúc old40.")).toBeTruthy();
    expect(screen.getAllByText("Trang 40 / 40")).toHaveLength(2);
    expect(app.draft.edit).toEqual(before);
    expect(
      app.client.getQueryData(
        attendanceKeys.page(
          { ...app.calls[2]!.criteria, page: 39 },
          "owner",
          sessionBoundary.current(),
        ),
      ),
    ).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
    await app.flush();
    expect(screen.getByText("Snapshot đã lưu lúc old40.")).toBeTruthy();
    expect(app.draft.edit).toEqual(before);
    await app.flush(15000);
    await app.resolve(3, "clamp-latest", 39);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(app.draft.edit).toEqual(before);
    act(() => app.draft.change({ raw: "2", error: "" }));
    await app.flush();
    expect(screen.getByRole("button", { name: "Lưu" })).toHaveProperty(
      "disabled",
      false,
    );
    const exact = app.client.getQueryData<PageDelivery>(
      attendanceKeys.page(
        app.calls[3]!.criteria,
        "owner",
        sessionBoundary.current(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    await app.flush();
    fireEvent.click(
      screen.getByRole("button", { name: "Bỏ phần nhập và tiếp tục" }),
    );
    await app.flush();
    expect(app.draft.edit).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /Công tháng/ }),
    );
    expect(screen.getByText("Snapshot đã lưu lúc clamp-latest.")).toBeTruthy();
    expect(screen.getAllByText("Trang 39 / 40")).toHaveLength(2);
    expect(app.calls).toHaveLength(4);
    const delivery = app.client.getQueryData<{ data: AttendancePageDto }>(
      attendanceKeys.page(
        { ...app.calls[2]!.criteria, page: 39 },
        "owner",
        sessionBoundary.current(),
      ),
    );
    expect(delivery).toBe(exact);
    expect(delivery?.data.fetchedAt).toBe("clamp-latest");
    const focus = document.activeElement;
    await app.flush(15000);
    expect(app.calls[4]!.criteria.page).toBe(39);
    await app.resolve(4, "poll39", 39);
    expect(document.activeElement).toBe(focus);
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});

it("export_during_page_handoff_keeps_draft_and_cache_untouched", async () => {
  let finish!: (body: Blob) => void;
  const body = new Promise<Blob>((resolve) => {
    finish = resolve;
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
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const app = await setupPages(
    async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        blob: () => body,
      }) as Response,
  );
  try {
    await app.resolve(0, "first");
    app.search("private query");
    await app.flush();
    await app.resolve(1, "filtered");
    const top = screen.getByRole("navigation", { name: "Phân trang đầu bảng" });
    fireEvent.change(within(top).getByLabelText("Đến trang"), {
      target: { value: "40" },
    });
    fireEvent.submit(within(top).getByRole("form", { name: "Chuyển trang" }));
    await app.flush();
    await app.resolve(2, "old40");
    act(() => {
      app.draft.open(
        attendanceFixture,
        attendanceFixture.cells.find((c) => c.state === "editable")!,
        "owner",
      );
      app.draft.change({
        raw: "3,25",
        reminder: true,
        custom: true,
        error: "frozen",
      });
    });
    await app.flush();
    const before = structuredClone(app.draft.edit);
    const generation = app.draft.ownerGeneration;
    await app.flush(15000);
    await app.resolve(3, "clamp39", 39);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
    await app.flush();
    const pageKey = attendanceKeys.page(
      app.calls[3]!.criteria,
      "owner",
      sessionBoundary.current(),
    );
    const accepted = app.client.getQueryData<PageDelivery>(pageKey)!;
    expect(accepted.data.fetchedAt).toBe("clamp39");
    const cacheBefore = app.client.getQueryCache().getAll();
    fireEvent.click(screen.getByRole("button", { name: "Xuất Excel" }));
    await app.flush();
    expect(create).not.toHaveBeenCalled();
    const pending = screen.getByRole("button", { name: "Đang nhận tệp…" });
    expect(pending).toHaveProperty("disabled", true);
    fireEvent.click(pending);
    expect(app.client.getQueryData(pageKey)).toBe(accepted);
    expect(app.draft.edit).toEqual(before);
    const blob = new Blob([new Uint8Array([80, 75, 3, 4])]);
    await act(async () => finish(blob));
    await app.flush();
    expect(create).toHaveBeenCalledExactlyOnceWith(blob);
    expect(app.exports).toEqual([
      {
        path: "/api/v1/attendance/export?month=2024-02",
        method: "GET",
        body: undefined,
      },
    ]);
    expect(app.calls).toHaveLength(4);
    expect(app.unexpected).toEqual([]);
    expect(app.client.getQueryData(pageKey)).toBe(accepted);
    expect(app.client.getQueryCache().getAll()).toEqual(cacheBefore);
    expect(
      app.client
        .getQueryCache()
        .getAll()
        .every((q) => !(q.state.data instanceof Blob)),
    ).toBe(true);
    expect(app.draft.edit).toEqual(before);
    expect(app.draft.ownerGeneration).toBe(generation);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Snapshot đã lưu lúc old40.")).toBeTruthy();
    expect(screen.getByLabelText("Tổng tháng · công").textContent).toBe("123");
    await app.flush(1000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fixture");
    expect(app.exports).toHaveLength(1);
  } finally {
    app.stop();
  }
});

it("background error retains the saved envelope and the established stale-data reminder", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "saved");
    fireEvent.click(screen.getByRole("button", { name: "Tải lại bảng" }));
    await app.flush();
    app.calls[1]!.fail();
    await app.flush();
    await app.flush(1000);
    app.calls[2]!.fail();
    await app.flush();
    await app.flush(3000);
    app.calls[3]!.fail();
    await app.flush();
    expect(screen.getByText(/Chưa cập nhật được dữ liệu nền/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Chưa cập nhật được dữ liệu nền.",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "Chưa tải được trang yêu cầu.",
    );
    expect(screen.getByText("Snapshot đã lưu lúc saved.")).toBeTruthy();
    expect(screen.getByLabelText("Tổng tháng · công").textContent).toBe("123");
    expect(screen.queryByText(/Chưa có nhân sự/)).toBeNull();
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});
it("initial error is not empty and can explicitly retry without full-month request", async () => {
  const app = await setupPages();
  try {
    app.calls[0]!.fail();
    await app.flush();
    await app.flush(1000);
    app.calls[1]!.fail();
    await app.flush();
    await app.flush(3000);
    app.calls[2]!.fail();
    await app.flush();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/Chưa có nhân sự/)).toBeNull();
    expect(screen.queryByText("Nhập theo ô")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Chưa tải được");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await app.flush();
    await app.resolve(3, "retry");
    expect(screen.getByText("Snapshot đã lưu lúc retry.")).toBeTruthy();
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});

it.each(["manual", "background-retry", "initial-retry"] as const)(
  "all_workspace_refetch_buttons_dispatch_one_real_read: %s",
  async (route) => {
    const app = await setupPages();
    try {
      if (route !== "initial-retry") await app.resolve(0, "saved");
      if (route === "background-retry") {
        fireEvent.click(screen.getByRole("button", { name: "Tải lại bảng" }));
        await app.flush();
      }
      if (route !== "manual") {
        const failedIndex = route === "initial-retry" ? 0 : 1;
        app.calls[failedIndex]!.fail();
        await app.flush();
        await app.flush(1000);
        app.calls[failedIndex + 1]!.fail();
        await app.flush();
        await app.flush(3000);
        app.calls[failedIndex + 2]!.fail();
        await app.flush();
        expect(screen.getByRole("alert")).toBeTruthy();
      }
      const before = app.calls.length;
      fireEvent.click(
        screen.getByRole("button", {
          name: route === "manual" ? "Tải lại bảng" : "Thử lại",
        }),
      );
      await app.flush();
      expect(app.calls).toHaveLength(before + 1);
      expect(app.calls[before]!.criteria).toEqual({
        month: "2024-02",
        q: "",
        page: 1,
        pageSize: 25,
      });
      await app.resolve(before, "explicit-retry");
      expect(
        screen.getByText("Snapshot đã lưu lúc explicit-retry."),
      ).toBeTruthy();
      expect(app.calls).toHaveLength(before + 1);
      expect(app.unexpected).toEqual([]);
    } finally {
      app.stop();
    }
  },
);
it("page success resets vertical position, preserves horizontal day, and poll does not steal focus", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "first");
    const region = screen.getByRole("region", {
      name: "Bảng tháng, cuộn để xem thêm ngày và nhân sự",
    });
    region.scrollTop = 300;
    region.scrollLeft = 400;
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Phân trang cuối bảng" }),
      ).getByRole("button", { name: "Trang tiếp" }),
    );
    await app.flush();
    await app.resolve(1, "second");
    expect(region.scrollTop).toBe(0);
    expect(region.scrollLeft).toBe(400);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /Công tháng/ }),
    );
    const search = screen.getByRole("searchbox");
    search.focus();
    await app.flush(15000);
    await app.resolve(2, "poll");
    expect(document.activeElement).toBe(search);
  } finally {
    app.stop();
  }
});

it("search success resets vertical scroll while preserving horizontal day and input focus; poll preserves both", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "first");
    const region = screen.getByRole("region", {
      name: "Bảng tháng, cuộn để xem thêm ngày và nhân sự",
    });
    region.scrollTop = 300;
    region.scrollLeft = 400;
    const input = screen.getByRole("searchbox");
    input.focus();
    app.search("an");
    await app.flush();
    expect(app.calls[1]!.criteria).toMatchObject({ q: "an", page: 1 });
    expect(region.scrollTop).toBe(300);
    await app.resolve(1, "searched");
    expect(region.scrollTop).toBe(0);
    expect(region.scrollLeft).toBe(400);
    expect(document.activeElement).toBe(input);

    region.scrollTop = 250;
    await app.flush(15000);
    expect(app.calls[2]!.criteria).toEqual(app.calls[1]!.criteria);
    await app.resolve(2, "poll");
    expect(region.scrollTop).toBe(250);
    expect(region.scrollLeft).toBe(400);
    expect(document.activeElement).toBe(input);
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});

it("ime_enter_debounce_one_transition sends one POST from actual Workspace at300ms and none during composition", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "initial");
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "an" } });
    await app.flush(299);
    expect(app.calls).toHaveLength(1);
    await app.flush(1);
    expect(app.calls).toHaveLength(2);
    expect(app.calls[1]!.criteria).toMatchObject({
      q: "an",
      page: 1,
      pageSize: 25,
    });
    await app.resolve(1, "debounced");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "Nguyễ" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    await app.flush(500);
    expect(app.calls).toHaveLength(2);
    fireEvent.change(input, { target: { value: "Nguyễn" } });
    fireEvent.compositionEnd(input);
    await app.flush(299);
    expect(app.calls).toHaveLength(2);
    await app.flush(1);
    expect(app.calls).toHaveLength(3);
    expect(app.calls[2]!.criteria.q).toBe("Nguyễn");
    await app.resolve(2, "ime");
    fireEvent.change(input, { target: { value: "id" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await app.flush();
    expect(app.calls).toHaveLength(4);
    expect(app.calls[3]!.criteria.q).toBe("id");
    await app.flush(300);
    expect(app.calls).toHaveLength(4);
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});

it("pending write locks search/month/pager and preserves raw without navigation or another write", async () => {
  const app = await setupPages();
  try {
    await app.resolve(0, "loaded");
    let rejectWrite!: (error: unknown) => void;
    let submitted!: Promise<boolean>;
    let writes = 0;
    act(() => {
      app.draft.open(
        attendanceFixture,
        attendanceFixture.cells.find((c) => c.state === "editable")!,
        "owner",
      );
      app.draft.change({ raw: "2,5", custom: true, reminder: true });
      submitted = app.draft.submit(() => {
        writes++;
        return new Promise((_resolve, reject) => {
          rejectWrite = reject;
        });
      });
    });
    await app.flush();
    expect(screen.getByRole("searchbox")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Tháng chấm công")).toHaveProperty(
      "disabled",
      true,
    );
    const bottom = screen.getByRole("navigation", {
      name: "Phân trang cuối bảng",
    });
    expect(
      within(bottom).getByRole("button", { name: "Trang tiếp" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(within(bottom).getByRole("button", { name: "Trang tiếp" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tăng ca" }));
    await app.flush();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(app.calls).toHaveLength(1);
    expect(writes).toBe(1);
    expect(app.draft.edit?.raw).toBe("2,5");
    await act(async () => {
      rejectWrite(new TypeError("fixture response loss"));
      await submitted;
    });
    await app.flush();
    expect(writes).toBe(1);
    expect(app.draft.edit?.raw).toBe("2,5");
    expect(app.unexpected).toEqual([]);
  } finally {
    app.stop();
  }
});
