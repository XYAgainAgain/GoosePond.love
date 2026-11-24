import { COPY } from "../copy.ts";
import { DEFAULT_SETTINGS, FORECAST_SETTINGS, type PondSettings } from "./pond.ts";

const TAB_KEY = "pixelpond.panelTab";
const T = COPY.pondPanel;
const U = T.units;

type Key = keyof PondSettings;
const idOf = (key: Key) => `pp-${key === "weatherMode" ? "weather-mode" : key.toLowerCase()}`;
const KEYS = Object.keys(DEFAULT_SETTINGS) as Key[];
const keyOf = new Map(KEYS.map((key) => [idOf(key), key]));

type Attrs = Record<string, string | number | boolean>;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  node.append(...children);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function icon(paths: string[], cls?: string) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

type Range = [min: number, max: number, step: number, unit?: string];
type Control =
  | { kind: "range"; key: Key; label: string; range: Range }
  | { kind: "select"; key: Key; label: string; options: [string, string][] }
  | { kind: "check"; key: Key; label: string }
  | { kind: "heading"; label: string }
  | { kind: "node"; node: () => Node };

const range = (key: Key, label: string, ...r: Range): Control => ({
  kind: "range",
  key,
  label,
  range: r,
});
const select = (key: Key, label: string, options: [string, string][]): Control => ({
  kind: "select",
  key,
  label,
  options,
});
const check = (key: Key, label: string): Control => ({ kind: "check", key, label });
const heading = (label: string): Control => ({ kind: "heading", label });
const km = (...sizes: number[]) => sizes.map((n): [string, string] => [String(n), T.km(n)]);

interface PanelActions {
  change: (patch: Partial<PondSettings>) => void;
  clock: (day: string, minutes: number) => void;
  reset: (settings: PondSettings) => void;
  preset: (name: string) => void;
  nextEclipse: () => string;
  strike: () => void;
  tilt: (on: boolean) => void;
}

export interface PanelOptions {
  views: readonly string[];
  /** What Reset returns to, and the opening values; its view is the one shown first. */
  defaults: PondSettings;
  open?: boolean;
}

export type PondPanel = ReturnType<typeof createPanel>;

/** Appends the tuning panel to host; it only writes settings and calls actions. */
export function createPanel(host: HTMLElement, options: PanelOptions, actions: PanelActions) {
  const { views, defaults } = options;
  const controller = new AbortController();
  const note = (id: string, live = false) =>
    el("p", { id, class: "pp-note", ...(live ? { "aria-live": "polite" } : {}) });
  const readout = note("pp-readout");
  const fullNote = note("pp-full-note", true);
  const clock = el("output", { id: "pp-clock", for: "pp-time" });
  const date = el("input", { id: "pp-date", type: "date", min: "1900-01-01", max: "2099-12-31" });
  const time = el("input", { id: "pp-time", type: "range", min: 0, max: 1439, step: 1 });
  const nowButton = el("button", { id: "pp-now", type: "button" }, T.now);
  const eclipseButton = el("button", { id: "pp-next-eclipse", type: "button" }, T.nextEclipse);
  const eclipseNote = note("pp-eclipse-note", true);
  const tiltNote = note("pp-tilt-note", true);
  const forecastNote = note("pp-forecast-note");
  const liveCredit = el(
    "p",
    { id: "pp-live-credit", class: "pp-note", hidden: true },
    el(
      "a",
      { href: "https://open-meteo.com/", target: "_blank", rel: "noopener noreferrer" },
      T.liveCredit,
    ),
  );
  const strike = el("button", { id: "pp-strike", type: "button" }, T.strike);
  const presets = Object.entries(T.presets).map(([name, label]) =>
    el("button", { type: "button", "data-preset": name }, label)
  );
  const debug = note("pp-debug");
  const deg = U.degrees, pct = U.percent, times = U.times;

  const panes: [keyof typeof T.tabs, Control[]][] = [
    ["time", [
      { kind: "node", node: () => el("label", { for: "pp-date" }, T.date) },
      { kind: "node", node: () => date },
      { kind: "node", node: () => el("label", { for: "pp-time" }, `${T.time} `, clock) },
      { kind: "node", node: () => time },
      { kind: "node", node: () => el("div", { class: "pp-row" }, nowButton, eclipseButton) },
      { kind: "node", node: () => eclipseNote },
    ]],
    ["view", [
      select("view", T.view, views.map((name) => [name, COPY.splash.views[name] ?? name])),
      range("heading", T.heading, 0, 359, 1, deg),
      range("span", T.span, 60, 240, 1, deg),
      range("horizon", T.horizon, 30, 70, 1, pct),
      range("pan", T.pan, 0, 100, 1, pct),
      range("parallax", T.parallax, 0, 2, 0.1, times),
      check("tilt", T.tilt),
      { kind: "node", node: () => tiltNote },
      select("scale", T.scale, [
        ["0", T.scaleAuto],
        ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n): [string, string] => [String(n), String(n)]),
      ]),
    ]],
    ["weather", [
      select("weatherMode", T.weather, Object.entries(T.weatherModes)),
      { kind: "node", node: () => forecastNote },
      { kind: "node", node: () => liveCredit },
      { kind: "node", node: () => el("div", { class: "pp-row" }, ...presets, strike) },
      range("storms", T.storms, 0, 100, 1, pct),
      range("rain", T.rain, 0, 100, 1, pct),
      range("fog", T.fog, 0, 100, 1, pct),
      range("mist", T.mist, 0, 100, 1, pct),
      select("mistStyle", T.mistStyle, Object.entries(T.mistStyles)),
      range("wind", T.wind, 0, 20, 0.5, U.speed),
      range("windFrom", T.windFrom, 0, 359, 1, deg),
      range("foliage", T.foliage, 0, 2, 0.1, times),
      range("drift", T.drift, 1, 30, 1, times),
    ]],
    ["clouds", [
      heading(T.low),
      range("cover", T.cover, 0, 100, 1, pct),
      range("base", T.base, 100, 1500, 50, U.meters),
      range("lowSoft", T.softness, 0, 1, 0.05),
      range("lowDensity", T.density, 0.2, 2, 0.05, times),
      range("lowDetail", T.billows, 0, 1, 0.05),
      select("lowSize", T.size, km(4, 6, 9, 12)),
      heading(T.mid),
      range("mid", T.cover, 0, 100, 1, pct),
      range("midSoft", T.softness, 0.3, 3, 0.1),
      range("midShade", T.shading, 0, 0.6, 0.02),
      range("midOpacity", T.opacity, 0.2, 1.3, 0.05, times),
      select("midSize", T.size, km(6, 9, 12, 18)),
      heading(T.cirrus),
      range("cirrus", T.cover, 0, 100, 1, pct),
      range("curl", T.curl, 0, 40, 1),
      range("cirrusWidth", T.width, 3, 30, 0.5),
      range("puff", T.puffiness, 0, 1, 0.05),
      range("cirrusDir", T.cirrusHeading, 0, 179, 1, deg),
    ]],
    ["light", [
      check("lighthouse", T.lighthouse),
      range("beam", T.beam, 0, 30, 0.5, times),
      range("beamSpread", T.beamSpread, 0, 1500, 25, U.meters),
      range("landFill", T.landFill, 0, 12, 0.5),
      range("spread", T.shadowScale, 1, 12, 0.5, times),
      range("mirror", T.reflection, 0, 1, 0.05),
      range("glitter", T.glitter, 0, 2, 0.05, times),
      range("rim", T.rim, 0, 1, 0.05),
      range("grade", T.grade, 0, 1, 0.05),
      range("exposure", T.exposure, 0.5, 3, 0.1, times),
    ]],
    ["look", [
      range("disc", T.disc, 1, 8, 0.5, times),
      range("stars", T.stars, 0, 3, 0.1, times),
      range("milky", T.milky, 0, 4, 0.1, times),
      select(
        "look",
        T.dither,
        ["1", "2", "3", "0"].map((v): [string, string] => [v, T.dithers[v]]),
      ),
      range("bands", T.levels, 6, 64, 1),
    ]],
    ["debug", [
      { kind: "node", node: () => el("label", { for: idOf("seed") }, T.seed) },
      { kind: "node", node: () => el("input", { id: idOf("seed"), type: "number", step: 1 }) },
      select("fpsCap", T.frameCap, [20, 30, 60, 1000].map((n) => [String(n), T.cap(n)])),
      check("showShadow", T.showShadow),
      check("showDepth", T.showDepth),
      { kind: "node", node: () => debug },
    ]],
  ];

  function build(control: Control): Node[] {
    switch (control.kind) {
      case "heading":
        return [el("h3", {}, control.label)];
      case "node":
        return [control.node()];
      case "check":
        return [
          el("label", { for: idOf(control.key), class: "pp-tap" }, control.label),
          el("input", { id: idOf(control.key), type: "checkbox" }),
        ];
      case "select":
        return [
          el("label", { for: idOf(control.key) }, control.label),
          el(
            "select",
            { id: idOf(control.key) },
            ...control.options.map(([value, label]) => new Option(label, value)),
          ),
        ];
      case "range": {
        const id = idOf(control.key), [min, max, step, unit] = control.range;
        return [
          el("label", { for: id }, control.label),
          el("input", { id, type: "range", min, max, step }),
          el("output", { id: `${id}-value`, for: id, ...(unit ? { "data-unit": unit } : {}) }),
        ];
      }
    }
  }

  const tabList = el("div", { class: "pp-tabs", role: "tablist", "aria-label": T.tabsLabel });
  const paneBox = el("div", { class: "pp-panes" });
  for (const [name, controls] of panes) {
    tabList.append(
      el("button", {
        id: `pp-tab-${name}`,
        type: "button",
        role: "tab",
        "aria-controls": `pp-pane-${name}`,
      }, T.tabs[name]),
    );
    paneBox.append(
      el("div", {
        id: `pp-pane-${name}`,
        class: "pp-grid",
        role: "tabpanel",
        "aria-labelledby": `pp-tab-${name}`,
      }, ...controls.flatMap(build)),
    );
  }
  const form = el(
    "form",
    { class: "pp-controls" },
    el(
      "div",
      { class: "pp-grid pp-clock-strip" },
      ...build(select("speed", T.clock, Object.entries(T.speeds))),
      readout,
      fullNote,
    ),
    tabList,
    paneBox,
  );
  const fps = el("output", { class: "pp-fps" });
  const fullscreen = el(
    "button",
    {
      class: "pp-fullscreen",
      type: "button",
      "aria-label": T.fullscreen,
      title: T.fullscreen,
      "aria-pressed": "false",
    },
    icon([
      "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
    ], "pp-enter"),
    icon([
      "M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3",
    ], "pp-leave"),
  );
  const resetButton = el(
    "button",
    { class: "pp-reset", type: "button", "aria-label": T.reset, title: T.reset },
    icon(["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"]),
  );
  const panel = el(
    "details",
    { class: "pond-panel", open: options.open ?? true },
    el(
      "summary",
      {},
      icon(["M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"]),
      el("span", {}, T.title),
      fps,
    ),
    fullscreen,
    resetButton,
    form,
  );

  const field = (id: string) => form.elements.namedItem(id) as HTMLInputElement | HTMLSelectElement;
  const input = (id: string) => field(id) as HTMLInputElement;
  const showValue = (id: string) => {
    const output = form.elements.namedItem(`${id}-value`);
    if (output instanceof HTMLOutputElement) {
      output.textContent = input(id).value + (output.dataset.unit ?? "");
    }
  };
  // Defaults go in the attributes, so form.reset() restores them.
  for (const key of KEYS) {
    const control = field(idOf(key)), value = defaults[key];
    if (control instanceof HTMLSelectElement) {
      for (const option of control.options) option.defaultSelected = option.value === String(value);
    } else if (typeof value === "boolean") control.defaultChecked = value;
    else control.defaultValue = String(value);
  }
  const outputs = form.querySelectorAll<HTMLOutputElement>('output[id$="-value"]');
  const speed = field(idOf("speed"));
  const view = field(idOf("view")) as HTMLSelectElement;
  const weatherMode = field(idOf("weatherMode"));
  const weatherPane = form.querySelector<HTMLElement>("#pp-pane-weather")!;
  const debugPane = form.querySelector<HTMLElement>("#pp-pane-debug")!;
  const syncWeatherMode = () => {
    const driving = weatherMode.value !== "manual";
    for (const key of FORECAST_SETTINGS) input(idOf(key)).disabled = driving;
    forecastNote.textContent = "";
    liveCredit.hidden = weatherMode.value !== "live";
  };
  const showEclipseNote = (text: string) => eclipseNote.textContent = text;
  const valueOf = (key: Key) => {
    const control = field(idOf(key));
    const kind = typeof DEFAULT_SETTINGS[key];
    if (kind === "boolean") return (control as HTMLInputElement).checked;
    if (key === "seed") return Number(control.value || "1");
    return kind === "number" ? Number(control.value) : control.value;
  };
  const read = () =>
    Object.fromEntries(KEYS.map((key) => [key, valueOf(key)])) as unknown as PondSettings;

  form.addEventListener("submit", (event) => event.preventDefault());
  for (const type of ["input", "change"]) {
    form.addEventListener(type, (event) => {
      const key = keyOf.get((event.target as HTMLElement).id);
      if (key && key !== "tilt") actions.change({ [key]: valueOf(key) });
    });
  }
  weatherMode.addEventListener("change", syncWeatherMode);
  syncWeatherMode();
  wireTabs(tabList, paneBox);
  wireFullscreen(fullscreen, fullNote, controller.signal);
  for (const output of outputs) {
    const id = output.htmlFor.value;
    input(id).addEventListener("input", () => showValue(id));
    showValue(id);
  }
  for (const control of [date, time]) {
    control.addEventListener("input", () => {
      showEclipseNote("");
      actions.clock(date.value, Number(time.value));
    });
  }
  nowButton.addEventListener("click", () => {
    speed.value = "live";
    actions.change({ speed: "live" });
    showEclipseNote("");
  });
  eclipseButton.addEventListener("click", () => showEclipseNote(actions.nextEclipse()));
  const tilt = input(idOf("tilt"));
  tilt.addEventListener("change", () => actions.tilt(tilt.checked));
  strike.addEventListener("click", actions.strike);
  for (const button of presets) {
    button.addEventListener("click", () => {
      weatherMode.value = "manual";
      syncWeatherMode();
      actions.change({ weatherMode: "manual" });
      showEclipseNote("");
      actions.preset(button.dataset.preset!);
    });
  }
  resetButton.addEventListener("click", () => {
    const tilting = tilt.checked, shown = view.value;
    form.reset();
    view.value = shown;
    syncWeatherMode();
    for (const output of outputs) showValue(output.htmlFor.value);
    if (tilting) actions.tilt(false);
    showEclipseNote("");
    actions.reset(read());
  });
  host.append(panel);

  return {
    element: panel,
    destroy() {
      controller.abort();
      panel.remove();
    },
    read,
    setting<K extends Key>(key: K, value: PondSettings[K]) {
      const id = idOf(key), control = field(id);
      if (typeof value === "boolean") (control as HTMLInputElement).checked = value;
      else {
        control.value = String(value);
        showValue(id);
      }
      if (key === "weatherMode") syncWeatherMode();
    },
    showClock(day: string, minutes: number, reading: string) {
      date.value = day;
      time.value = String(minutes);
      clock.textContent = reading;
      time.setAttribute("aria-valuetext", reading);
    },
    showReadout: (text: string) => readout.textContent = text,
    showForecast(text: () => string) {
      if (weatherPane.hidden || !panel.open) return;
      const next = text();
      if (forecastNote.textContent !== next) forecastNote.textContent = next;
    },
    showFps: (text: string) => fps.textContent = text,
    showDebug(text: () => string) {
      if (!debugPane.hidden && panel.open) debug.textContent = text();
    },
    showTiltNote: (text: string) => tiltNote.textContent = text,
    isTilting: () => tilt.checked,
    canStrike(on: boolean) {
      if (strike.disabled === on) strike.disabled = !on;
    },
  };
}

function wireTabs(list: HTMLElement, panes: HTMLElement) {
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(panes.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

  function activate(index: number, save: boolean) {
    if (panels[index].hidden) panes.scrollTop = 0;
    for (const [i, tab] of tabs.entries()) {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    }
    if (save) {
      try {
        localStorage.setItem(TAB_KEY, tabs[index].textContent);
      } catch { /* Blocked on file URLs */ }
    }
  }

  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener("click", () => activate(i, true));
    tab.addEventListener("keydown", (event) => {
      let next: number;
      switch (event.key) {
        case "ArrowLeft":
          next = (i - 1 + tabs.length) % tabs.length;
          break;
        case "ArrowRight":
          next = (i + 1) % tabs.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      activate(next, true);
      tabs[next].focus();
    });
  }
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch { /* Storage may be blocked. */ }
  activate(Math.max(0, tabs.findIndex((tab) => tab.textContent === saved)), false);
}

type Legacy = () => void;
type LegacyRoot = HTMLElement & {
  webkitRequestFullscreen?: Legacy;
  mozRequestFullScreen?: Legacy;
  msRequestFullscreen?: Legacy;
};
type LegacyDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: Legacy;
  mozCancelFullScreen?: Legacy;
  msExitFullscreen?: Legacy;
};

// iPad Safari, Firefox <64, and old Edge use prefixed fullscreen calls without a promise.
function wireFullscreen(button: HTMLButtonElement, note: HTMLElement, signal: AbortSignal) {
  const root = document.documentElement as LegacyRoot, doc = document as LegacyDocument;
  const current = () =>
    doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.mozFullScreenElement ??
      doc.msFullscreenElement ?? null;
  const show = () => button.setAttribute("aria-pressed", String(current() !== null));
  const refused = () => note.textContent = T.fullscreenRefused;
  button.addEventListener("click", async () => {
    note.textContent = "";
    try {
      if (current()) {
        const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.mozCancelFullScreen ??
          doc.msExitFullscreen;
        await exit?.call(doc);
        return;
      }
      const enter = root.requestFullscreen ?? root.webkitRequestFullscreen ??
        root.mozRequestFullScreen ?? root.msRequestFullscreen;
      if (enter) await enter.call(root);
      else note.textContent = T.fullscreenMissing;
    } catch {
      refused();
    }
  });
  for (const prefix of ["", "webkit", "moz"]) {
    document.addEventListener(`${prefix}fullscreenchange`, show, { signal });
    document.addEventListener(`${prefix}fullscreenerror`, refused, { signal });
  }
  document.addEventListener("MSFullscreenChange", show, { signal });
  document.addEventListener("MSFullscreenError", refused, { signal });
}
