import { h } from "./dom.ts";

export interface RadialItem {
  label: string;
  run(): void;
}

/* An oval, so wide labels on the left and right clear those above and below; px */
const RX = 132, RY = 100;
/* Room a button needs past its center: half a long label across, half a tap target down; px */
const HALF_W = 80, HALF_H = 26;
const STEP = 50;

/* A column where the map is too small for a ring; Escape, a tap outside, Tab, or a pick closes it */
export function openRadial(
  host: HTMLElement,
  at: { x: number; y: number },
  title: string,
  items: RadialItem[],
): () => void {
  const box = host.getBoundingClientRect();
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const ring = box.width >= 2 * (RX + HALF_W) && box.height >= 2 * (RY + HALF_H);
  const tall = (items.length - 1) * STEP;
  const x = ring
    ? clamp(at.x, RX + HALF_W, box.width - RX - HALF_W)
    : clamp(at.x, HALF_W, box.width - HALF_W);
  const y = ring
    ? clamp(at.y, RY + HALF_H, box.height - RY - HALF_H)
    : clamp(at.y - tall / 2, HALF_H, box.height - tall - HALF_H);
  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const buttons = items.map((item, i) => {
    const turn = (i / items.length) * Math.PI * 2 - Math.PI / 2;
    const [dx, dy] = ring ? [Math.cos(turn) * RX, Math.sin(turn) * RY] : [0, i * STEP];
    return h("button", {
      type: "button",
      class: "radial-item",
      attrs: { role: "menuitem", style: `--dx: ${dx}px; --dy: ${dy}px` },
      onclick: () => {
        close();
        item.run();
      },
    }, item.label);
  });
  const menu = h(
    "div",
    {
      class: "radial",
      attrs: { role: "menu", "aria-label": title, style: `left: ${x}px; top: ${y}px` },
    },
    ...buttons,
  );
  host.append(menu);
  buttons[0]?.focus();

  const outside = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node)) close();
  };
  const keys = (e: KeyboardEvent) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(i + 1) % buttons.length].focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length].focus();
    }
  };
  const left = (e: FocusEvent) => {
    if (!menu.contains(e.relatedTarget as Node | null)) close(false);
  };
  // A frame later, so the press that opened the ring doesn't close it
  const armed = requestAnimationFrame(() => addEventListener("pointerdown", outside, true));
  menu.addEventListener("keydown", keys);
  menu.addEventListener("focusout", left);

  let open = true;
  function close(restore = true) {
    if (!open) return;
    open = false;
    cancelAnimationFrame(armed);
    removeEventListener("pointerdown", outside, true);
    menu.remove();
    if (restore && returnTo?.isConnected) returnTo.focus();
  }
  return close;
}
