import { COPY } from "../copy.ts";
import type { Edges } from "../map/view.ts";
import { h } from "./dom.ts";

export type Snap = "peek" | "half" | "full";

export interface Sheet {
  /* Call after the panel shows or hides, or anything above the stage changes height */
  sync(): void;
  /* Lowers the sheet to `snap` if higher, leaving the map room for a camera move */
  atMost(snap: Snap): void;
}

const SNAPS: Snap[] = ["peek", "half", "full"];
/* px: the handle plus a person's portrait and name */
const PEEK = 156;
/* px of finger travel read as a tap */
const TAP_SLOP = 6;
/* px/ms: a flick this fast moves one snap in its direction, wherever it's let go */
const FLICK = 0.5;
/* ms: a finger held this still before letting go isn't flicking */
const STILL_MS = 100;

/* `covered` hears which map edges the panel hides */
export function createSheet(
  panel: HTMLElement,
  stage: HTMLElement,
  covered: (edges: Omit<Edges, "top">, byHand: boolean) => void,
): Sheet {
  const phone = matchMedia("(width <= 760px)");
  let snap: Snap = "half";
  let shown = "";

  const heights = (): Record<Snap, number> => {
    const tall = stage.clientHeight;
    return { peek: Math.min(PEEK, tall * 0.35), half: Math.round(tall * 0.5), full: tall - 12 };
  };

  function report(px: number, byHand: boolean) {
    const open = !panel.hidden, sheet = phone.matches;
    const right = open && !sheet ? Math.round(panel.getBoundingClientRect().width) : 0;
    const bottom = open && sheet ? Math.round(px) : 0;
    if (`${right} ${bottom}` === shown) return;
    shown = `${right} ${bottom}`;
    covered({ right, bottom }, byHand);
  }

  function settle(next: Snap, byHand = true) {
    snap = next;
    const px = heights()[snap];
    panel.style.setProperty("--sheet-h", `${px}px`);
    handle.setAttribute("aria-valuenow", String(SNAPS.indexOf(snap)));
    report(px, byHand);
  }

  const step = (by: number) => SNAPS[Math.min(2, Math.max(0, SNAPS.indexOf(snap) + by))];
  const toggle = () => settle(snap === "half" ? "peek" : "half");

  const handle = h("button", {
    type: "button",
    class: "sheet-handle",
    attrs: {
      role: "slider",
      "aria-label": COPY.bar.sheet,
      "aria-valuemin": "0",
      "aria-valuemax": "2",
      "aria-orientation": "vertical",
    },
  });
  panel.prepend(handle);

  handle.addEventListener("keydown", (e) => {
    const by = e.key === "ArrowUp" || e.key === "PageUp"
      ? 1
      : e.key === "ArrowDown" || e.key === "PageDown"
      ? -1
      : 0;
    if (!by) return;
    e.preventDefault();
    settle(step(by));
  });

  let drag: { id: number; y: number; from: number; last: number; at: number; v: number } | null =
    null;
  handle.addEventListener("pointerdown", (e) => {
    if (!phone.matches || drag || !e.isPrimary || e.button !== 0) return;
    handle.setPointerCapture(e.pointerId);
    const from = panel.getBoundingClientRect().height;
    drag = { id: e.pointerId, y: e.clientY, from, last: e.clientY, at: e.timeStamp, v: 0 };
    panel.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (drag?.id !== e.pointerId) return;
    const { peek, full } = heights();
    const px = Math.min(full, Math.max(peek * 0.6, drag.from + drag.y - e.clientY));
    panel.style.setProperty("--sheet-h", `${px}px`);
    const dt = e.timeStamp - drag.at;
    if (dt > 0) drag.v = (drag.last - e.clientY) / dt;
    drag.last = e.clientY;
    drag.at = e.timeStamp;
  });
  const release = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    const moved = Math.abs(e.clientY - drag.y);
    const v = e.timeStamp - drag.at > STILL_MS ? 0 : drag.v;
    drag = null;
    panel.classList.remove("dragging");
    if (moved < TAP_SLOP) return toggle();
    if (Math.abs(v) > FLICK) return settle(step(v > 0 ? 1 : -1));
    const at = panel.getBoundingClientRect().height, all = heights();
    settle(SNAPS.reduce((a, b) => Math.abs(all[b] - at) < Math.abs(all[a] - at) ? b : a));
  };
  // A gesture the browser takes back snaps to where it began
  const cancel = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    drag = null;
    panel.classList.remove("dragging");
    settle(snap);
  };
  handle.addEventListener("pointerup", release);
  handle.addEventListener("lostpointercapture", cancel);
  // Enter and Space; a pointer's own click is already handled on release
  handle.addEventListener("click", (e) => {
    if (e.detail === 0 && phone.matches) toggle();
  });
  handle.addEventListener("pointercancel", cancel);

  function sync() {
    if (phone.matches) settle(snap, false);
    else {
      panel.style.removeProperty("--sheet-h");
      report(0, false);
    }
  }

  phone.addEventListener("change", sync);
  // Turning the phone changes every snap height
  new ResizeObserver(() => {
    if (drag) return;
    if (phone.matches) settle(snap, false);
    else report(0, false);
  }).observe(stage);
  sync();
  return {
    sync,
    atMost(most) {
      if (phone.matches && !panel.hidden && SNAPS.indexOf(snap) > SNAPS.indexOf(most)) {
        settle(most, false);
      }
    },
  };
}
