import { COPY } from "../copy.ts";
import { MOODS, type PondMood } from "../pond/pond.ts";
import { h } from "./dom.ts";

const T = COPY.splash;
const SLEEP_MS = 4000;

const SVG = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
const CLOUD = "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z";
/* Feather icons (MIT), as in the settings tray; fog is drawn to match */
const ICONS = {
  back: `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M15 12h.01"/>`,
  view:
    `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>`,
  weather: `<path d="${CLOUD}"/>`,
  real: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>`,
  clear:
    `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`,
  fog: `<path d="M3 8h18M5 12h14M3 16h18M7 20h10"/>`,
  rain: `<path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>`,
  storm:
    `<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><path d="M13 11l-4 6h6l-4 6"/>`,
  play: `<path d="M6 3l14 9-14 9z"/>`,
  pause: `<path d="M8 4v16M16 4v16"/>`,
  now: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
  enlarge:
    `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>`,
  shrink:
    `<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>`,
};
type Icon = keyof typeof ICONS;
const icon = (name: Icon) => `<svg ${SVG}>${ICONS[name]}</svg>`;

function iconButton(name: Icon, label: string) {
  const button = h("button", {
    type: "button",
    class: "viewer-icon",
    title: label,
    attrs: { "aria-label": label },
  });
  button.innerHTML = icon(name);
  return button;
}

export interface ViewerActions {
  back(): void;
  view(name: string): void;
  mood(name: PondMood): void;
  scrub(minutes: number): void;
  now(): void;
  play(on: boolean): void;
}

export type Viewer = ReturnType<typeof createViewer>;

export function createViewer(
  host: HTMLElement,
  options: { views: readonly string[]; view: string },
  actions: ViewerActions,
) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const controller = new AbortController();
  const signal = controller.signal;

  const back = iconButton("back", T.backToCard);
  const viewButton = iconButton("view", T.view);
  const weatherButton = iconButton("weather", T.weather);
  const full = iconButton("enlarge", T.fullscreen);
  const play = iconButton("play", T.play);
  const now = iconButton("now", T.now);
  const time = h("input", {
    type: "range",
    min: "0",
    max: "1439",
    step: "5",
    class: "viewer-time",
    attrs: { "aria-label": T.time },
  });
  const caption = h("p", { class: "viewer-caption" });

  function menu(
    toggle: HTMLButtonElement,
    id: string,
    label: string,
    items: { value: string; text: string; icon?: Icon }[],
    pick: (value: string) => void,
  ) {
    const buttons = items.map(({ value, text, icon: name }) => {
      const button = h("button", {
        type: "button",
        attrs: { "aria-pressed": "false", "data-value": value },
      });
      if (name) button.innerHTML = icon(name);
      button.append(text);
      button.addEventListener("click", () => {
        pick(value);
        close(true);
      });
      return button;
    });
    const el = h("div", {
      id,
      class: "viewer-menu",
      hidden: true,
      attrs: { role: "group", "aria-label": label },
    }, ...buttons);
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", id);
    function close(refocus = false) {
      if (el.hidden) return;
      el.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (refocus) toggle.focus();
    }
    toggle.addEventListener("click", () => {
      const open = el.hidden;
      closeMenus();
      if (!open) return;
      el.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      (buttons.find((b) => b.getAttribute("aria-pressed") === "true") ?? buttons[0]).focus();
    });
    const mark = (value: string | null) => {
      for (const b of buttons) {
        b.setAttribute("aria-pressed", String(b.dataset.value === value));
      }
    };
    return { el, close, mark };
  }

  const views = menu(
    viewButton,
    "viewer-views",
    T.view,
    options.views.map((name) => ({ value: name, text: T.views[name] ?? name })),
    actions.view,
  );
  const moods = menu(
    weatherButton,
    "viewer-moods",
    T.weather,
    MOODS.map((name) => ({ value: name, text: T.moods[name], icon: name })),
    (name) => actions.mood(name as PondMood),
  );
  const menus = [views, moods];
  function closeMenus(refocus = false) {
    for (const m of menus) m.close(refocus && !m.el.hidden);
  }
  views.mark(options.view);
  moods.mark("real");

  const canFull = document.fullscreenEnabled && typeof host.requestFullscreen === "function";
  full.hidden = !canFull;
  const showFull = () => {
    const on = document.fullscreenElement === host;
    const label = on ? T.leaveFullscreen : T.fullscreen;
    full.innerHTML = icon(on ? "shrink" : "enlarge");
    full.title = label;
    full.setAttribute("aria-label", label);
  };
  const leaveFullscreen = () => {
    if (document.fullscreenElement === host) void document.exitFullscreen().catch(() => {});
  };
  full.addEventListener("click", () => {
    if (document.fullscreenElement === host) leaveFullscreen();
    else void host.requestFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", showFull, { signal });

  back.addEventListener("click", actions.back);
  time.addEventListener("input", () => actions.scrub(Number(time.value)));
  now.addEventListener("click", actions.now);
  let playing = false;
  play.addEventListener("click", () => actions.play(!playing));

  const el = h(
    "div",
    { class: "viewer", hidden: true, attrs: { role: "group", "aria-label": T.controls } },
    caption,
    views.el,
    moods.el,
    h(
      "div",
      { class: "viewer-bar" },
      back,
      viewButton,
      weatherButton,
      full,
      h("div", { class: "viewer-clock" }, play, time, now),
    ),
  );
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || menus.every((m) => m.el.hidden)) return;
    e.stopPropagation();
    closeMenus(true);
  }, { signal });

  let timer = 0;
  const hover = matchMedia("(hover: hover)");
  // Touch screens keep :hover after a tap, which would keep the strip awake for good.
  const busy = () => !!el.querySelector(":focus-visible") || hover.matches && el.matches(":hover");
  function sleep() {
    timer = 0;
    if (busy()) wake();
    else {
      closeMenus();
      el.classList.add("asleep");
    }
  }
  function wake() {
    el.classList.remove("asleep");
    clearTimeout(timer);
    timer = reduced.matches || el.hidden ? 0 : setTimeout(sleep, SLEEP_MS);
  }
  el.addEventListener("focusin", wake, { signal });
  el.addEventListener("pointerdown", wake, { signal });
  el.addEventListener("input", wake, { signal });
  // A still frame can't run the day, so Play goes away under reduced motion.
  const motion = () => {
    play.hidden = reduced.matches;
    if (reduced.matches && playing) actions.play(false);
    wake();
  };
  play.hidden = reduced.matches;
  reduced.addEventListener("change", motion, { signal });
  host.append(el);

  return {
    el,
    wake,
    closeMenus,
    show(on: boolean) {
      el.hidden = !on;
      if (!on) {
        closeMenus();
        leaveFullscreen();
      }
      wake();
    },
    focus: () => back.focus(),
    setClock(minutes: number, reading: string) {
      time.value = String(minutes);
      time.setAttribute("aria-valuetext", reading);
    },
    setPlaying(on: boolean) {
      playing = on;
      const label = on ? T.pause : T.play;
      play.innerHTML = icon(on ? "pause" : "play");
      play.title = label;
      play.setAttribute("aria-label", label);
    },
    setMood: (name: PondMood | null) => moods.mark(name),
    setView: (name: string) => views.mark(name),
    setCaption(text: string) {
      if (caption.textContent !== text) caption.textContent = text;
    },
    destroy() {
      clearTimeout(timer);
      controller.abort();
      leaveFullscreen();
      el.remove();
    },
  };
}
