export type GesturePoint = { x: number; y: number };
export type GestureOptions = {
  activate: () => void;
  move: (point: GesturePoint) => void;
  finish: () => void;
  restore: () => void;
  capture: () => void;
  release: () => void;
  startScroll: () => void;
  stopScroll: () => void;
  canActivate?: () => boolean;
};
export type GestureController = ReturnType<typeof createSelectionGesture>;
// No DOM, submit, or business state. The adapter owns hit-testing and scroll.
export function createSelectionGesture(options: GestureOptions) {
  let origin: (GesturePoint & { touch: boolean }) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false,
    panning = false;
  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }
  function activate() {
    if (!origin || panning) return;
    if (options.canActivate && !options.canActivate()) {
      cleanup();
      return;
    }
    clearTimer();
    active = true;
    options.activate();
    if (!origin.touch) options.capture();
    options.startScroll();
  }
  function cleanup() {
    clearTimer();
    if (active) {
      options.stopScroll();
      if (!origin?.touch) options.release();
    }
    origin = null;
    active = false;
    panning = false;
  }
  function cancel(_reason?: string) {
    void _reason;
    const restore = active;
    cleanup();
    if (restore) options.restore();
  }
  return {
    get active() {
      return active;
    },
    get pending() {
      return origin !== null && !active && !panning;
    },
    start(point: GesturePoint & { touch: boolean }) {
      cancel();
      origin = point;
      if (point.touch) timer = setTimeout(activate, 450);
    },
    move(point: GesturePoint) {
      if (!origin || panning) return;
      if (!active) {
        const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
        if (origin.touch) {
          if (distance > 10) {
            clearTimer();
            panning = true;
          }
          return;
        }
        if (distance === 0) return;
        activate();
      }
      if (!active) return;
      options.move(point);
    },
    end() {
      const finished = active;
      cleanup();
      if (finished) options.finish();
      return finished;
    },
    cancel,
    dispose: () => cancel("unmount"),
  };
}
