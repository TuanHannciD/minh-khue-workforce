// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendancePage } from "./attendance-page";
import { AttendanceDraft } from "../model/attendance-draft";
import { SessionBoundary } from "@/shared/api/session-boundary";
import { attendanceFixture as month } from "../preview/attendance-fixture";
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
