// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  act,
} from "@testing-library/react";
import { useState } from "react";
import { AttendanceSearch } from "./attendance-search";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("ime_enter_debounce_one_transition", () => {
  vi.useFakeTimers();
  const onCommit = vi.fn();
  function Search() {
    const [raw, setRaw] = useState("");
    return (
      <AttendanceSearch
        value={raw}
        disabled={false}
        onValue={setRaw}
        onCommit={onCommit}
      />
    );
  }
  const view = render(<Search />);
  const input = screen.getByRole("searchbox", {
    name: "Tìm tên hoặc ID trong toàn bộ nhân sự của tháng",
  });
  fireEvent.change(input, { target: { value: " an " } });
  act(() => vi.advanceTimersByTime(299));
  expect(onCommit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onCommit.mock.calls).toEqual([["an"]]);
  onCommit.mockClear();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "Nguyễ" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  act(() => vi.advanceTimersByTime(500));
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Nguyễn" } });
  fireEvent.compositionEnd(input);
  act(() => vi.advanceTimersByTime(299));
  expect(onCommit).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onCommit.mock.calls).toEqual([["Nguyễn"]]);
  onCommit.mockClear();
  fireEvent.change(input, { target: { value: "ID" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onCommit.mock.calls).toEqual([["ID"]]);
  act(() => vi.advanceTimersByTime(300));
  expect(onCommit).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "unmounted" } });
  view.unmount();
  act(() => vi.advanceTimersByTime(300));
  expect(onCommit).toHaveBeenCalledTimes(1);
});
it("disabled cancels pending commit and composition cleanup", () => {
  vi.useFakeTimers();
  const commit = vi.fn();
  const props = {
    value: "",
    disabled: false,
    onValue: vi.fn(),
    onCommit: commit,
  };
  const view = render(<AttendanceSearch {...props} />);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "pending" },
  });
  view.rerender(<AttendanceSearch {...props} disabled />);
  act(() => vi.advanceTimersByTime(300));
  expect(commit).not.toHaveBeenCalled();
});
