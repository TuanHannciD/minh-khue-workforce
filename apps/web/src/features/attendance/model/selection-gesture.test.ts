import { afterEach, expect, it, vi } from "vitest";
import { createSelectionGesture } from "./selection-gesture";
afterEach(() => vi.useRealTimers());
it("a context guard rejected at activation cannot leak a mouse preview or rearm a hold", () => {
  vi.useFakeTimers();
  const moved = vi.fn(),
    activated = vi.fn();
  const gesture = createSelectionGesture({
    activate: activated,
    move: moved,
    finish: vi.fn(),
    restore: vi.fn(),
    capture: vi.fn(),
    release: vi.fn(),
    startScroll: vi.fn(),
    stopScroll: vi.fn(),
    canActivate: () => false,
  });
  gesture.start({ x: 0, y: 0, touch: false });
  gesture.move({ x: 12, y: 0 });
  expect(moved).not.toHaveBeenCalled();
  expect(activated).not.toHaveBeenCalled();
  gesture.start({ x: 0, y: 0, touch: true });
  vi.advanceTimersByTime(450);
  expect(gesture.active).toBe(false);
  expect(gesture.pending).toBe(false);
});
function setup() {
  vi.useFakeTimers();
  const calls: string[] = [];
  const gesture = createSelectionGesture({
    activate: () => calls.push("active"),
    move: () => calls.push("move"),
    finish: () => calls.push("preview"),
    restore: () => calls.push("restore"),
    capture: () => calls.push("capture"),
    release: () => calls.push("release"),
    startScroll: () => calls.push("scroll"),
    stopScroll: () => calls.push("stop"),
  });
  return { gesture, calls };
}
it("touch at449 is pending,450 activates; exactly10 eligible,11 permanently yields native pan", () => {
  const { gesture, calls } = setup();
  gesture.start({ x: 0, y: 0, touch: true });
  gesture.move({ x: 10, y: 0 });
  vi.advanceTimersByTime(449);
  expect(calls).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(calls).toEqual(["active", "scroll"]); // no touch pointer capture
  expect(gesture.end()).toBe(true);
  expect(calls).toEqual(["active", "scroll", "stop", "preview"]);
  calls.length = 0;
  gesture.start({ x: 0, y: 0, touch: true });
  gesture.move({ x: 11, y: 0 });
  gesture.move({ x: 0, y: 0 });
  vi.advanceTimersByTime(500);
  expect(gesture.end()).toBe(false);
  expect(calls).toEqual([]);
});
it.each(["cancel", "multitouch", "blur", "escape", "unmount"])(
  "%s releases active mouse capture/scroll and restores once; pending timers never replay",
  (reason) => {
    const { gesture, calls } = setup();
    gesture.start({ x: 0, y: 0, touch: false });
    gesture.move({ x: 20, y: 0 });
    gesture.cancel(reason);
    gesture.dispose();
    expect(calls).toEqual([
      "active",
      "capture",
      "scroll",
      "move",
      "stop",
      "release",
      "restore",
    ]);
    calls.length = 0;
    gesture.start({ x: 0, y: 0, touch: true });
    gesture.dispose();
    vi.advanceTimersByTime(500);
    expect(calls).toEqual([]);
  },
);
