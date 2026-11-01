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
import { AttendancePage } from "./attendance-page";
import { AttendanceDraft } from "../model/attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture as month } from "../preview/attendance-fixture";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useCellSelection } from "../model/use-cell-selection";
import { useGridGesture } from "./use-grid-gesture";
import { cellIdentity } from "../model/month-view";
import type { AttendanceReadView } from "../model/attendance-read-view";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup() {
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const submit = vi.spyOn(draft, "submit").mockResolvedValue(false);
  render(
    <AttendancePage
      status="ready"
      month={month}
      draft={draft}
      ownerUserId="owner"
      onSubmit={() => {}}
    />,
  );
  return { draft, submit };
}
const cell = (day: string, person = "0101") =>
  screen.getByRole("button", {
    name: new RegExp(`ID .*${person}.*2024-02-${day}.*Công`),
  });
it("Ctrl/Cmd clicks union three disjoint cells, remove one and Apply sends only two; selection never writes", async () => {
  const { draft, submit } = setup();
  fireEvent.click(cell("02"), { ctrlKey: true });
  fireEvent.click(cell("05"), { metaKey: true });
  fireEvent.click(cell("08"), { ctrlKey: true });
  expect(draft.edit?.targets.map((c) => c.date)).toEqual([
    "2024-02-02",
    "2024-02-05",
    "2024-02-08",
  ]);
  fireEvent.click(cell("05"), { ctrlKey: true });
  expect(draft.edit?.targets.map((c) => c.date)).toEqual([
    "2024-02-02",
    "2024-02-08",
  ]);
  expect(submit).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "1" }));
  await userEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
  expect(submit).toHaveBeenCalledTimes(1);
});
it("keyboard endpoint selection and Chọn nhiều taps are functional and skip N/— in preview", async () => {
  const { draft, submit } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Chọn nhiều" }));
  await userEvent.selectOptions(screen.getByLabelText("Cách chọn ô"), "range");
  cell("01").focus();
  fireEvent.keyDown(cell("01"), { key: "Enter" });
  cell("03", "0102").focus();
  fireEvent.keyDown(cell("03", "0102"), { key: "Enter" });
  expect(draft.edit?.targets).toHaveLength(6);
  expect(draft.bulkPreview).toMatchObject({
    selected: 6,
    eligible: 3,
    skipped: 1,
  });
  expect(submit).not.toHaveBeenCalled();
});
it("dirty raw blocks a gesture; discard never replays the old drag; Keep/Escape restores opener focus", async () => {
  const { draft, submit } = setup();
  await userEvent.click(cell("02"));
  await userEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
  await userEvent.type(screen.getByLabelText("Số công tùy chỉnh"), "3,25");
  fireEvent.pointerDown(cell("05"), {
    pointerType: "mouse",
    pointerId: 1,
    button: 0,
    clientX: 1,
    clientY: 1,
  });
  fireEvent.pointerMove(document, {
    pointerType: "mouse",
    pointerId: 1,
    buttons: 1,
    clientX: 40,
    clientY: 1,
  });
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(draft.edit?.raw).toBe("3,25");
  expect(submit).not.toHaveBeenCalled();
  fireEvent.pointerDown(cell("05"), {
    pointerType: "mouse",
    pointerId: 2,
    button: 0,
    clientX: 1,
    clientY: 1,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Bỏ phần nhập và tiếp tục" }),
  );
  fireEvent.pointerMove(document, {
    pointerType: "mouse",
    pointerId: 2,
    buttons: 1,
    clientX: 50,
    clientY: 1,
  });
  fireEvent.pointerUp(document, {
    pointerType: "mouse",
    pointerId: 2,
    clientX: 50,
    clientY: 1,
  });
  expect(draft.edit).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
it("Ctrl can select a displayed N cell and preview disables Apply instead of inventing a writable target", () => {
  const { draft, submit } = setup();
  const label = screen.getByLabelText(/ID .*0102.*2024-02-01.*Công/);
  fireEvent.click(label, { ctrlKey: true });
  expect(draft.bulkPreview).toMatchObject({
    selected: 1,
    eligible: 0,
    skipped: 1,
  });
  expect(screen.getByRole("button", { name: "Áp dụng" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(submit).not.toHaveBeenCalled();
});
it("synthetic touch hold450 selects without toggle on release; cancel/multitouch rolls back", () => {
  vi.useFakeTimers();
  const { draft, submit } = setup();
  const touch = { identifier: 1, clientX: 2, clientY: 2 };
  const target = cell("02");
  fireEvent.touchStart(target, { touches: [touch], changedTouches: [touch] });
  vi.advanceTimersByTime(449);
  expect(draft.edit).toBeNull();
  vi.advanceTimersByTime(1);
  fireEvent.touchEnd(target, { touches: [], changedTouches: [touch] });
  expect(draft.edit?.targets).toHaveLength(1);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.touchStart(cell("05"), { touches: [touch] });
  vi.advanceTimersByTime(450);
  fireEvent.touchStart(document, {
    touches: [touch, { ...touch, identifier: 2 }],
  });
  fireEvent.touchEnd(document, { touches: [], changedTouches: [touch] });
  expect(draft.edit?.targets.map((c) => c.date)).toEqual(["2024-02-02"]);
});
it("a held touch moved inside the same edge cell scrolls; stationary hold and Escape do not", () => {
  vi.useFakeTimers();
  const { draft, submit } = setup();
  const grid = screen.getByRole("region", { name: /Bảng tháng, cuộn/ });
  const box = (x: number, y: number, width: number, height: number) =>
    new DOMRect(x, y, width, height);
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue(box(0, 0, 500, 300));
  vi.spyOn(
    grid.querySelector("tbody th.name")!,
    "getBoundingClientRect",
  ).mockReturnValue(box(0, 40, 100, 40));
  vi.spyOn(
    grid.querySelector("tbody td.total")!,
    "getBoundingClientRect",
  ).mockReturnValue(box(450, 40, 50, 40));
  vi.spyOn(
    grid.querySelector("thead")!,
    "getBoundingClientRect",
  ).mockReturnValue(box(0, 0, 500, 40));
  const scroll = vi.fn();
  grid.scrollBy = scroll;
  const target = cell("02");
  const touch = { identifier: 1, clientX: 440, clientY: 150 };
  fireEvent.touchStart(target, { touches: [touch], changedTouches: [touch] });
  vi.advanceTimersByTime(466);
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.touchMove(target, {
    touches: [{ ...touch, clientX: 441 }],
  });
  vi.advanceTimersByTime(20);
  expect(scroll).toHaveBeenCalledWith(12, 0);
  fireEvent.keyDown(document, { key: "Escape" });
  const count = scroll.mock.calls.length;
  vi.advanceTimersByTime(60);
  expect(scroll).toHaveBeenCalledTimes(count);
  expect(draft.edit).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

function dirtyTouch() {
  vi.useFakeTimers();
  const state = setup();
  fireEvent.click(cell("02"));
  act(() => state.draft.change({ raw: "3,25", custom: true }));
  const touch = { identifier: 1, clientX: 2, clientY: 2 };
  const target = cell("05");
  fireEvent.touchStart(target, { touches: [touch], changedTouches: [touch] });
  return { ...state, touch, target };
}
it("dirty touch arms only until450; exactly10px still guards then discard cannot replay the gesture", () => {
  const { draft, submit, touch, target } = dirtyTouch();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.touchMove(target, { touches: [{ ...touch, clientX: 12 }] });
  act(() => vi.advanceTimersByTime(449));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(draft.edit?.raw).toBe("3,25");
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(draft.edit?.raw).toBe("3,25");
  fireEvent.click(
    screen.getByRole("button", { name: "Bỏ phần nhập và tiếp tục" }),
  );
  fireEvent.touchMove(target, { touches: [{ ...touch, clientX: 40 }] });
  fireEvent.touchEnd(target, { touches: [], changedTouches: [touch] });
  fireEvent.click(target); // A trailing compatibility click must not replay it.
  act(() => vi.advanceTimersByTime(500));
  expect(draft.edit).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
it.each(["11px", "scroll", "multitouch", "release", "blur", "owner", "epoch"])(
  "dirty prehold %s cancels without guard, raw loss, preview or delayed activation",
  (reason) => {
    const { draft, submit, touch, target } = dirtyTouch();
    if (reason === "11px") {
      fireEvent.touchMove(target, {
        touches: [{ ...touch, clientX: 13 }],
        targetTouches: [touch],
      });
      fireEvent.touchMove(target, { touches: [touch], targetTouches: [touch] });
    } else if (reason === "scroll")
      fireEvent.scroll(document.querySelector(".grid-scroll")!);
    else if (reason === "multitouch")
      fireEvent.touchStart(document, {
        touches: [touch, { ...touch, identifier: 2 }],
        targetTouches: [touch],
      });
    else if (reason === "release")
      fireEvent.touchEnd(target, { touches: [], changedTouches: [touch] });
    else if (reason === "blur") fireEvent.blur(window);
    else if (reason === "owner")
      act(() => {
        draft.clear();
        draft.open(
          month,
          month.cells.find(
            (c) => c.date === "2024-02-02" && c.kind === "work",
          )!,
          "owner",
        );
        draft.change({ raw: "3,25" });
      });
    else
      act(() => {
        draft.boundary.invalidate();
        draft.boundary.allowWrites();
      });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.touchEnd(target, { touches: [], changedTouches: [touch] });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(draft.edit?.raw).toBe("3,25");
    expect(draft.edit?.mode).toBe("patch-cell");
    expect(document.querySelector(".selection-dragging")).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  },
);

function GestureContext({
  draft,
  contextKey,
  kind = "work",
  view = month,
  releaseInLayout = false,
}: {
  draft: AttendanceDraft;
  contextKey: string;
  kind?: "work" | "overtime";
  view?: AttendanceReadView;
  releaseInLayout?: boolean;
}) {
  useSyncExternalStore(draft.subscribe, draft.structureSnapshot);
  const selection = useCellSelection(
    view,
    draft,
    "owner",
    () => {},
    contextKey,
  );
  const region = useRef<HTMLDivElement>(null);
  const gesture = useGridGesture(region, view, selection.interaction, kind);
  useLayoutEffect(() => {
    if (releaseInLayout)
      fireEvent.pointerUp(document, {
        pointerType: "mouse",
        pointerId: 9,
        clientX: 3,
        clientY: 2,
      });
  }, [releaseInLayout]);
  const first = view.cells.find((c) => c.kind === "work" && c.value === null)!;
  return (
    <div
      ref={region}
      data-testid="context-grid"
      className={gesture.active ? "dragging" : ""}
    >
      <button data-testid="context-cell" data-position={cellIdentity(first)}>
        cell
      </button>
      <output>{selection.interaction?.keys.length ?? 0}</output>
    </div>
  );
}
it.each(["page", "q", "pageSize", "kind", "membership"])(
  "page_context_cancels_gesture timer at449ms with same IDs: %s",
  (change) => {
    vi.useFakeTimers();
    const boundary = new SessionBoundary();
    boundary.allowWrites();
    const draft = new AttendanceDraft(boundary);
    const { rerender } = render(
      <GestureContext draft={draft} contextKey="initial" />,
    );
    const touch = { identifier: 1, clientX: 2, clientY: 2 };
    fireEvent.touchStart(screen.getByTestId("context-cell"), {
      touches: [touch],
      changedTouches: [touch],
    });
    act(() => vi.advanceTimersByTime(449));
    rerender(
      <GestureContext
        draft={draft}
        contextKey={change === "membership" ? "initial" : change}
        kind={change === "kind" ? "overtime" : "work"}
        view={
          change === "membership"
            ? {
                ...month,
                employees: month.employees.slice(1),
                cells: month.cells.filter(
                  (c) => c.employeeId !== month.employees[0]!.id,
                ),
              }
            : month
        }
      />,
    );
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("context-grid").className).toBe("");
    fireEvent.touchEnd(document, { touches: [], changedTouches: [touch] });
    expect(draft.edit).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("page_context_cancels_gesture releases pointer capture and RAF, clears preview, release never commits", () => {
  vi.useFakeTimers();
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const { rerender } = render(
    <GestureContext draft={draft} contextKey="initial" />,
  );
  const grid = screen.getByTestId("context-grid");
  grid.setPointerCapture = vi.fn();
  grid.hasPointerCapture = () => true;
  grid.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(screen.getByTestId("context-cell"), {
    pointerType: "mouse",
    pointerId: 9,
    button: 0,
    clientX: 2,
    clientY: 2,
  });
  fireEvent.pointerMove(document, {
    pointerType: "mouse",
    pointerId: 9,
    clientX: 3,
    clientY: 2,
  });
  expect(grid.setPointerCapture).toHaveBeenCalledWith(9);
  expect(grid.className).toBe("dragging");
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  rerender(<GestureContext draft={draft} contextKey="new-q-same-ids" />);
  expect(grid.releasePointerCapture).toHaveBeenCalledWith(9);
  expect(grid.className).toBe("");
  expect(grid.querySelector("output")!.textContent).toBe("0");
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.pointerUp(document, {
    pointerType: "mouse",
    pointerId: 9,
    clientX: 3,
    clientY: 2,
  });
  expect(draft.edit).toBeNull();
});

it("a context change cancels capture before layout callbacks can release the old pointer into the new page", () => {
  vi.useFakeTimers();
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const { rerender } = render(
    <GestureContext draft={draft} contextKey="initial" />,
  );
  fireEvent.pointerDown(screen.getByTestId("context-cell"), {
    pointerType: "mouse",
    pointerId: 9,
    button: 0,
    clientX: 2,
    clientY: 2,
  });
  fireEvent.pointerMove(document, {
    pointerType: "mouse",
    pointerId: 9,
    clientX: 3,
    clientY: 2,
  });
  expect(screen.getByTestId("context-grid").className).toBe("dragging");
  rerender(
    <GestureContext draft={draft} contextKey="new-context" releaseInLayout />,
  );
  expect(draft.edit).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("active touch at450ms clears preview/RAF on context change and release cannot select or write", () => {
  vi.useFakeTimers();
  const boundary = new SessionBoundary();
  boundary.allowWrites();
  const draft = new AttendanceDraft(boundary);
  const { rerender } = render(
    <GestureContext draft={draft} contextKey="initial" />,
  );
  const touch = { identifier: 1, clientX: 2, clientY: 2 };
  fireEvent.touchStart(screen.getByTestId("context-cell"), {
    touches: [touch],
    changedTouches: [touch],
  });
  act(() => vi.advanceTimersByTime(450));
  expect(screen.getByTestId("context-grid").className).toBe("dragging");
  rerender(<GestureContext draft={draft} contextKey="new-size" />);
  expect(screen.getByTestId("context-grid").className).toBe("");
  expect(
    screen.getByTestId("context-grid").querySelector("output")!.textContent,
  ).toBe("0");
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.touchEnd(document, { touches: [], changedTouches: [touch] });
  expect(draft.edit).toBeNull();
});
