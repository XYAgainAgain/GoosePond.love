import { COPY } from "../copy.ts";
import type { LabelText } from "../map/style.ts";
import { pressFeedback } from "./haptics.ts";
import { type ThemeName, THEMES } from "./themes.ts";

const KEYS = {
  theme: "goosepond.theme",
  size: "goosepond.text-size",
  face: "goosepond.font",
  shortcuts: "goosepond.shortcuts",
};

/* Mirrors the html[data-text-size] ladder in settings.css */
const SIZES = [
  { id: "xsmall", scale: 0.84 },
  { id: "small", scale: 0.91 },
  { id: "medium", scale: 1 },
  { id: "large", scale: 1.14 },
  { id: "xlarge", scale: 1.27 },
] as const;
type SizeId = (typeof SIZES)[number]["id"];
const DEFAULT_SIZE = 2;

const FACES = [
  { id: "national-park", family: "National Park" },
  { id: "figtree", family: "Figtree Variable" },
] as const;
type FaceId = (typeof FACES)[number]["id"];

/* px: fits the widest label at XL, so a size change never moves a segment under the pointer */
const THEME_WIDTHS: Record<ThemeName, number> = { ember: 104, light: 104, blackout: 146 };
const THROTTLE_MS = 300;

const SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"';
const MOON = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";
/* Feather icons (MIT) */
const ICONS: Record<ThemeName | "gear", string> = {
  ember: `<svg ${SVG}><path d="${MOON}"/></svg>`,
  light:
    `<svg ${SVG}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  blackout:
    `<svg ${SVG}><g transform="translate(3.6 0.3) scale(0.7)" stroke-width="2.86"><path d="${MOON}"/></g><path d="M2 17h20M5 20h14M8 23h8"/></svg>`,
  gear:
    `<svg ${SVG}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // private browsing or quota
    }
  },
};

const root = () => document.documentElement;

function svg(markup: string): SVGElement {
  const el = document.importNode(
    new DOMParser().parseFromString(markup, "image/svg+xml").documentElement,
    true,
  ) as unknown as SVGElement;
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("focusable", "false");
  return el;
}

/* composedPath sees through shadow roots, where e.target is retargeted to the host */
function isTyping(e: KeyboardEvent): boolean {
  const target = e.composedPath()[0] as HTMLElement | undefined;
  return !!target &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? ""));
}

function oneKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey || typeof e.key !== "string" || isTyping(e)) return null;
  return root().dataset.shortcuts === "off" ? null : e.key.toLowerCase();
}

export function currentTheme(): ThemeName {
  const t = root().dataset.theme as ThemeName;
  return THEMES.includes(t) ? t : THEMES[0];
}

function sizeIndex(): number {
  const i = SIZES.findIndex((s) => s.id === root().dataset.textSize);
  return i === -1 ? DEFAULT_SIZE : i;
}

function faceIndex(): number {
  const i = FACES.findIndex((f) => f.id === root().dataset.font);
  return i === -1 ? 0 : i;
}

export function labelText(): LabelText {
  return { scale: SIZES[sizeIndex()].scale, family: FACES[faceIndex()].family };
}

/* Repeats the pre-paint script in index.html, for a page loaded without it */
export function restoreLook() {
  const stored = storage.get(KEYS.theme);
  if (stored === "pond" || stored === "plum") storage.set(KEYS.theme, "ember");
  root().dataset.theme = THEMES.includes(stored as ThemeName) ? stored! : THEMES[0];
  const size = storage.get(KEYS.size);
  if (SIZES.some((s) => s.id === size)) root().dataset.textSize = size!;
  const face = storage.get(KEYS.face);
  if (FACES.some((f) => f.id === face)) root().dataset.font = face!;
  if (storage.get(KEYS.shortcuts) === "off") root().dataset.shortcuts = "off";
}

export type LookChange = "theme" | "size" | "face";

function themePill(signal: AbortSignal, changed: (what: LookChange) => void) {
  const pill = document.createElement("div");
  pill.className = "theme-pill";
  pill.setAttribute("role", "group");
  pill.setAttribute("aria-label", COPY.settings.themeGroup);
  // Memory is authoritative, so the theme cycles even when storage fails
  let current = currentTheme();

  const buttons = THEMES.map((id) => {
    const words = COPY.settings.themes[id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-pill__btn";
    btn.dataset.press = "glyph";
    btn.title = words.long;
    btn.setAttribute("aria-label", words.long);
    btn.style.setProperty("--theme-pill-seg", `${THEME_WIDTHS[id]}px`);
    const icon = document.createElement("span");
    icon.className = "theme-pill__icon";
    icon.append(svg(ICONS[id]));
    const text = document.createElement("span");
    text.className = "theme-pill__text";
    text.textContent = words.label;
    btn.append(icon, text);
    btn.addEventListener("click", () => set(id), { signal });
    return btn;
  });
  pill.append(...buttons);

  function sync() {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(THEMES[i] === current)));
  }

  function set(id: ThemeName) {
    if (id === current) return;
    current = id;
    storage.set(KEYS.theme, id);
    root().dataset.theme = id;
    sync();
    changed("theme");
  }

  document.addEventListener("keydown", (e) => {
    if (oneKey(e) !== "t") return;
    e.preventDefault();
    set(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
  }, { signal });

  sync();
  return pill;
}

function isInline(el: Element) {
  return getComputedStyle(el).display.startsWith("inline");
}

function isPinned(el: Element, stop: Element) {
  for (let n: Element | null = el; n && n !== stop; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
}

function grabAnchor(scroller: HTMLElement | null) {
  if (!scroller || scroller.hidden || !scroller.scrollTop) return null;
  const box = scroller.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + 10;
  let el: Element | undefined = document.elementsFromPoint(x, y)
    .find((n) => n !== scroller && scroller.contains(n) && !isPinned(n, scroller));
  while (el && el.parentElement !== scroller && isInline(el)) el = el.parentElement ?? undefined;
  while (el) {
    const next: Element | undefined = [...el.children].find((c) =>
      !isInline(c) && c.getBoundingClientRect().bottom > y && !isPinned(c, scroller)
    );
    if (!next) break;
    el = next;
  }
  return el ? { scroller, el, top: el.getBoundingClientRect().top } : null;
}

// Forced instant: a smooth scroll-behavior would animate the correction visibly
function restoreAnchor(anchor: ReturnType<typeof grabAnchor>) {
  if (!anchor || !anchor.el.isConnected) return;
  const delta = anchor.el.getBoundingClientRect().top - anchor.top;
  if (delta) anchor.scroller.scrollBy({ top: delta, behavior: "instant" });
}

function textRocker(
  signal: AbortSignal,
  scroller: () => HTMLElement | null,
  changed: (what: LookChange) => void,
) {
  const t = COPY.settings;
  let lastSize = 0;
  let lastFace = 0;

  const rocker = document.createElement("div");
  rocker.className = "rocker";
  rocker.setAttribute("role", "group");
  rocker.setAttribute("aria-label", t.textGroup);

  const button = (cls: string, label: string, content: Node | string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = cls;
    btn.dataset.press = "glyph";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.append(content);
    return btn;
  };
  const stepper = (d: string) =>
    svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${d}"/></svg>`);

  const minus = button("rocker__btn", t.smaller, stepper("M3 8h10"));
  const label = button(
    "rocker__label",
    t.resetTo(t.sizes[SIZES[DEFAULT_SIZE].id].name),
    "",
  );
  label.title = t.reset;
  const face = button("rocker__btn rocker__btn--face", "", t.faceButton);
  const plus = button("rocker__btn", t.larger, stepper("M3 8h10M8 3v10"));
  const live = document.createElement("span");
  live.className = "rocker__live";
  live.setAttribute("role", "status");
  rocker.append(minus, label, face, plus, live);

  function refreshSize() {
    const i = sizeIndex();
    label.textContent = t.sizes[SIZES[i].id as SizeId].label;
    minus.disabled = i === 0;
    plus.disabled = i === SIZES.length - 1;
  }

  function refreshFace() {
    const next = FACES[(faceIndex() + 1) % FACES.length];
    face.style.fontFamily = `"${next.family}", system-ui, sans-serif`;
    face.title = t.switchFace(t.faces[next.id as FaceId]);
    face.setAttribute("aria-label", face.title);
  }

  function applySize(i: number) {
    const anchor = grabAnchor(scroller());
    const id = SIZES[i].id;
    root().dataset.textSize = id;
    storage.set(KEYS.size, id);
    refreshSize();
    live.textContent = t.sizeSaid(t.sizes[id].name);
    restoreAnchor(anchor);
    changed("size");
  }

  function applyFace(i: number) {
    const anchor = grabAnchor(scroller());
    const id = FACES[i].id;
    root().dataset.font = id;
    storage.set(KEYS.face, id);
    refreshFace();
    live.textContent = t.faceSaid(t.faces[id]);
    restoreAnchor(anchor);
    changed("face");
  }

  // A held key or a double tap moves one rung
  function step(delta: 1 | -1) {
    const now = Date.now();
    if (now - lastSize < THROTTLE_MS) return;
    lastSize = now;
    const next = sizeIndex() + delta;
    if (next >= 0 && next < SIZES.length) applySize(next);
  }

  function cycleFace() {
    const now = Date.now();
    if (now - lastFace < THROTTLE_MS) return;
    lastFace = now;
    applyFace((faceIndex() + 1) % FACES.length);
  }

  minus.addEventListener("click", () => step(-1), { signal });
  plus.addEventListener("click", () => step(1), { signal });
  label.addEventListener("click", () => applySize(DEFAULT_SIZE), { signal });
  face.addEventListener("click", cycleFace, { signal });

  // preventDefault keeps a handled key from also starting find-as-you-type
  document.addEventListener("keydown", (e) => {
    const key = oneKey(e);
    if (key !== "[" && key !== "]" && key !== "f") return;
    e.preventDefault();
    if (key === "f") cycleFace();
    else step(key === "]" ? 1 : -1);
  }, { signal });

  refreshSize();
  refreshFace();
  return rocker;
}

function row(control: Element) {
  const el = document.createElement("div");
  el.className = "settings-tray__row";
  el.append(control);
  return el;
}

export interface SettingsOptions {
  bar: HTMLElement;
  /* Its reading position survives a text-size change */
  scroller: () => HTMLElement | null;
  changed: (what: LookChange) => void;
}

/* Returns the gear for the bar, or the controls themselves without the Popover API */
export function createSettings({ bar, scroller, changed }: SettingsOptions): HTMLElement {
  const controller = new AbortController();
  const signal = controller.signal;
  const pill = themePill(signal, changed);
  const rocker = textRocker(signal, scroller, changed);

  if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
    const inline = document.createElement("div");
    inline.className = "settings-inline";
    inline.append(pill, rocker);
    return inline;
  }

  const tray = document.createElement("div");
  tray.className = "settings-tray";
  tray.id = "settings-tray";
  tray.popover = "auto";
  tray.setAttribute("role", "group");
  tray.setAttribute("aria-label", COPY.settings.tray);
  tray.append(
    row(pill),
    row(rocker),
  );
  document.body.append(tray);
  pressFeedback(tray, signal);

  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "settings-gear";
  gear.title = COPY.settings.gear;
  gear.setAttribute("aria-label", COPY.settings.gear);
  gear.setAttribute("popovertarget", tray.id);
  gear.append(svg(ICONS.gear));

  if (CSS.supports("anchor-name: --a")) {
    const current = getComputedStyle(bar).getPropertyValue("anchor-name").trim();
    bar.style.setProperty(
      "anchor-name",
      current && current !== "none" ? `${current}, --settings-tray-bar` : "--settings-tray-bar",
    );
  }

  // Feeds the no-anchor fallback, clamped inside the viewport gutter
  function measure() {
    const barBox = bar.getBoundingClientRect();
    const gearBox = gear.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const gutter = parseFloat(getComputedStyle(tray).getPropertyValue("--settings-tray-gutter")) ||
      16;
    let end = viewport - gearBox.right;
    if (tray.offsetWidth) end = Math.min(end, viewport - tray.offsetWidth - gutter);
    tray.style.setProperty("--settings-tray-top", `${Math.round(barBox.bottom)}px`);
    tray.style.setProperty("--settings-tray-end", `${Math.max(0, Math.round(end))}px`);
  }

  tray.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState === "open") measure();
  }, { signal });
  tray.addEventListener("toggle", (e) => {
    if ((e as ToggleEvent).newState === "open") measure();
  }, { signal });
  addEventListener("resize", () => {
    if (tray.matches(":popover-open")) measure();
  }, { passive: true, signal });

  // Some mobile browsers light-dismiss only on a full click, so a touch outside closes it too
  document.addEventListener("pointerdown", (e) => {
    if (!tray.matches(":popover-open")) return;
    const target = e.target as Node;
    if (tray.contains(target) || gear.contains(target)) return;
    tray.hidePopover();
  }, { passive: true, signal });

  // A back-forward cache restore keeps these listeners and never reruns this
  addEventListener("pagehide", (e) => {
    if (!e.persisted) controller.abort();
  }, { signal });

  return gear;
}
