import type { AttendanceReadView } from "../model/attendance-read-view";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AttendanceKind, CellKeyDto } from "../model/types";
import type { SelectionInteraction } from "../model/use-cell-selection";
import { cellIdentity } from "../model/month-view";
import { rectangleCells, unionCells } from "../model/cell-selection";
import {
  createSelectionGesture,
  type GesturePoint,
} from "../model/selection-gesture";

// DOM adapter: native pan/zoom until hold wins, hit-testing, pointer ownership,
// edge scrolling and global cancellation. No writes; release emits one preview.
export function useGridGesture(
  region: RefObject<HTMLDivElement | null>,
  month: AttendanceReadView,
  interaction?: SelectionInteraction,
  kind: AttendanceKind = "work",
) {
  const latest = useRef({ month, interaction });
  useLayoutEffect(() => {
    latest.current = { month, interaction };
  });
  const suppressClick = useRef(false);
  const [active, setActive] = useState(false);
  const enabled = Boolean(interaction);
  const context = `${month.month}/${month.employees.map((e) => e.id).join(",")}/${kind}/${interaction?.epoch}/${interaction?.generation}/${interaction?.contextKey}`;
  const ownerToken = interaction?.ownerToken;
  useLayoutEffect(() => {
    const element = region.current;
    if (!element || !latest.current.interaction) return;
    const grid: HTMLDivElement = element;
    let pointerId: number | null = null,
      touchId: number | null = null,
      frame = 0;
    let start: CellKeyDto | null = null,
      source: CellKeyDto | undefined;
    let captured: AttendanceReadView,
      before: CellKeyDto[] = [],
      selected: CellKeyDto[] = [];
    let point: GesturePoint = { x: 0, y: 0 },
      origin: GesturePoint = point,
      moved = false,
      append = false;
    let epoch = -1,
      generation = -1,
      capturedOwnerToken: object | undefined;
    const read = (target: EventTarget | null) => {
      const element =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-position]")
          : null;
      return element && grid.contains(element)
        ? (latest.current.month.cells.find(
            (c) => cellIdentity(c) === element.dataset.position,
          ) ?? null)
        : null;
    };
    const at = (p: GesturePoint, fallback?: EventTarget | null) => {
      const box = grid.getBoundingClientRect();
      const name = grid.querySelector("tbody th.name")?.getBoundingClientRect();
      const total = grid
        .querySelector("tbody td.total")
        ?.getBoundingClientRect();
      const head = grid.querySelector("thead")?.getBoundingClientRect();
      const x = Math.max(
        (name?.right ?? box.left) + 2,
        Math.min(p.x, (total?.left ?? box.right) - 2),
      );
      const y = Math.max(
        (head?.bottom ?? box.top) + 2,
        Math.min(p.y, box.bottom - 8),
      );
      return read(document.elementFromPoint?.(x, y) ?? fallback ?? null);
    };
    function update(p: GesturePoint, fallback?: EventTarget | null) {
      point = p;
      if (p.x !== origin.x || p.y !== origin.y) moved = true;
      const end = at(p, fallback);
      if (!start || !end) return;
      const range = rectangleCells(captured, start, end).filter(
        (c) => !source || cellIdentity(c) !== cellIdentity(source),
      );
      selected = unionCells(append ? before : [], range);
      latest.current.interaction?.preview(selected);
    }
    function scroll() {
      if (!gesture.active) return;
      const box = grid.getBoundingClientRect();
      const left =
        grid.querySelector("tbody th.name")?.getBoundingClientRect().right ??
        box.left;
      const right =
        grid.querySelector("tbody td.total")?.getBoundingClientRect().left ??
        box.right;
      const top =
        grid.querySelector("thead")?.getBoundingClientRect().bottom ?? box.top;
      const dx =
        point.x < left + 20
          ? -12
          : point.x > Math.min(right, box.right) - 20
            ? 12
            : 0;
      const dy = point.y < top + 20 ? -10 : point.y > box.bottom - 22 ? 10 : 0;
      if (moved && (dx || dy)) {
        grid.scrollBy?.(dx, dy);
        update(point);
      }
      frame = requestAnimationFrame(scroll);
    }
    const gesture = createSelectionGesture({
      canActivate: () => {
        const options = latest.current.interaction;
        const allowed =
          options?.ownerToken === ownerToken &&
          options?.ownerToken === capturedOwnerToken &&
          options?.epoch === epoch &&
          options.generation === generation &&
          options.canStart();
        if (!allowed) suppressClick.current = true;
        return Boolean(allowed);
      },
      activate: () => {
        suppressClick.current = true;
        setActive(true);
        selected = unionCells(
          append ? before : [],
          source ? [] : start ? [start] : [],
        );
        latest.current.interaction?.preview(selected);
      },
      move: (p) => update(p),
      capture: () => {
        if (pointerId !== null)
          try {
            grid.setPointerCapture(pointerId);
          } catch {
            /* Synthetic input may not own a pointer. */
          }
      },
      release: () => {
        if (pointerId !== null && grid.hasPointerCapture?.(pointerId))
          grid.releasePointerCapture(pointerId);
      },
      startScroll: () => {
        frame = requestAnimationFrame(scroll);
      },
      stopScroll: () => {
        cancelAnimationFrame(frame);
        frame = 0;
        setActive(false);
      },
      restore: () => {
        latest.current.interaction?.preview(null);
      },
      finish: () => {
        const options = latest.current.interaction;
        if (
          options &&
          options.ownerToken === ownerToken &&
          options.ownerToken === capturedOwnerToken &&
          options.epoch === epoch &&
          options.generation === generation
        )
          options.commit(selected, captured, source, epoch);
      },
    });
    function begin(
      target: EventTarget | null,
      p: GesturePoint,
      touch: boolean,
      add: boolean,
    ) {
      suppressClick.current = false;
      const cell = read(target),
        options = latest.current.interaction;
      // Touch only arms a candidate. Dirty guard may move focus/inert the grid,
      // so it belongs to activation after the native pan/zoom window has won.
      if (!cell || !options || (!touch && !options.canStart())) {
        suppressClick.current = true;
        return false;
      }
      const handle = target instanceof Element && target.closest("[data-fill]");
      if (handle && (cell.value === null || cell.state !== "editable"))
        return false;
      start = cell;
      source = handle ? cell : undefined;
      captured = structuredClone(options.capture());
      capturedOwnerToken = options.ownerToken;
      epoch = options.epoch;
      generation = options.generation;
      before = [...options.keys];
      if (add && before.length === 0 && options.source)
        before = [options.source];
      append = !source && (add || options.append);
      selected = [];
      point = p;
      origin = p;
      moved = false;
      gesture.start({ ...p, touch });
      return true;
    }
    function pointerDown(e: PointerEvent) {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.shiftKey) return;
      // Two-endpoint mode remains a click/keyboard operation.
      if (
        latest.current.interaction?.endpoint ||
        (latest.current.interaction?.append &&
          !e.ctrlKey &&
          !e.metaKey &&
          !(e.target instanceof Element && e.target.closest("[data-fill]")))
      )
        return;
      pointerId = e.pointerId;
      touchId = null;
      if (
        begin(
          e.target,
          { x: e.clientX, y: e.clientY },
          false,
          e.ctrlKey || e.metaKey,
        )
      )
        e.preventDefault();
    }
    function pointerMove(e: PointerEvent) {
      if (e.pointerId === pointerId) {
        point = { x: e.clientX, y: e.clientY };
        gesture.move(point);
        if (gesture.active) update(point, e.target);
      }
    }
    function pointerUp(e: PointerEvent) {
      if (e.pointerId === pointerId) {
        if (gesture.active) update({ x: e.clientX, y: e.clientY }, e.target);
        gesture.end();
        pointerId = null;
      }
    }
    function touchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        cancel();
        return;
      }
      const t = e.touches[0]!;
      touchId = t.identifier;
      pointerId = null;
      begin(e.target, { x: t.clientX, y: t.clientY }, true, false);
    }
    function multi(e: TouchEvent) {
      if (e.touches.length > 1) cancel();
    }
    function touchMove(e: TouchEvent) {
      if (touchId === null) return;
      const t = Array.from(e.touches).find((t) => t.identifier === touchId);
      if (!t || e.touches.length !== 1 || (gesture.active && !e.cancelable)) {
        cancel();
        return;
      }
      point = { x: t.clientX, y: t.clientY };
      gesture.move(point);
      if (gesture.active) {
        e.preventDefault();
        update(point, e.target);
      } else if (!gesture.pending) suppressClick.current = true;
    }
    function touchEnd(e: TouchEvent) {
      if (
        touchId === null ||
        !Array.from(e.changedTouches).some((t) => t.identifier === touchId)
      )
        return;
      if (gesture.active && e.cancelable) e.preventDefault();
      gesture.end();
      touchId = null;
    }
    function cancel() {
      gesture.cancel();
      pointerId = null;
      touchId = null;
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (gesture.active || gesture.pending)) {
        e.preventDefault();
        cancel();
      }
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const pan = () => {
      if (gesture.pending) cancel();
    };
    const menu = (e: Event) => {
      if (gesture.pending || gesture.active) e.preventDefault();
    };
    grid.addEventListener("pointerdown", pointerDown);
    grid.addEventListener("touchstart", touchStart, { passive: true });
    grid.addEventListener("contextmenu", menu);
    document.addEventListener("pointermove", pointerMove);
    document.addEventListener("pointerup", pointerUp);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("touchstart", multi, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("touchend", touchEnd, { passive: false });
    document.addEventListener("touchcancel", cancel);
    document.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("scroll", pan, { capture: true, passive: true });
    window.addEventListener("blur", cancel);
    return () => {
      if (gesture.active || gesture.pending) suppressClick.current = true;
      gesture.dispose();
      grid.removeEventListener("pointerdown", pointerDown);
      grid.removeEventListener("touchstart", touchStart);
      grid.removeEventListener("contextmenu", menu);
      document.removeEventListener("pointermove", pointerMove);
      document.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchstart", multi, true);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", touchEnd);
      document.removeEventListener("touchcancel", cancel);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("scroll", pan, true);
      window.removeEventListener("blur", cancel);
    };
  }, [region, context, enabled, ownerToken]);
  return {
    active,
    consumeClick: () => {
      const suppress = suppressClick.current;
      suppressClick.current = false;
      return suppress;
    },
  };
}
