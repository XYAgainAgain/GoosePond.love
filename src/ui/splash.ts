import { COPY } from "../copy.ts";
import { POND_ASSETS } from "../pond/assets.ts";
import { createPanel, type PondPanel } from "../pond/panel.ts";
import {
  DEFAULT_SETTINGS,
  mountPond,
  type PondHandle,
  type PondMood,
  type PondSettings,
} from "../pond/pond.ts";
import { doorCard, hasPass } from "./door.ts";
import { h } from "./dom.ts";
import { tapTracker } from "./tap.ts";
import { createViewer } from "./viewer.ts";

const GLIDE_MS = 1000;
/* Horizon points a full-height drag moves, and how far it may stray from the view's framing */
const HORIZON_DRAG = 24, HORIZON_REACH = 6;
/* Points per arrow keypress */
const KEY_PAN = 2, KEY_HORIZON = 1;
/* px */
const TAP_SLOP = 8;
const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

type Permission = { requestPermission?: unknown };
// iOS gates motion behind a prompt, so tilt starts only on touch devices that need none.
const tiltWithoutPrompt = () => {
  const gate = (globalThis as { DeviceOrientationEvent?: Permission }).DeviceOrientationEvent;
  return isSecureContext && !!gate && typeof gate.requestPermission !== "function" &&
    matchMedia("(any-pointer: coarse)").matches;
};

/* Resolves once the visitor goes in; over is made inert meanwhile */
export function showSplash(over?: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const views = POND_ASSETS.views.map(({ name }) => name);
    const settings: PondSettings = {
      ...DEFAULT_SETTINGS,
      weatherMode: "live",
      view: views[Math.floor(Math.random() * views.length)],
    };
    let handle: PondHandle | undefined;
    let panel: PondPanel | undefined;
    let closed = false, uncovered = false;
    const mounting = new AbortController();
    let day = "", mood: PondMood | null = "real", captionAt = 0;

    const canvas = h("canvas", {
      class: "splash-art",
      attrs: { role: "img", "aria-label": COPY.splash.painting },
    });
    const card = doorCard(!over && !hasPass(), () => uncover(true), enter);
    const door = h("main", { class: "door" }, card.el);
    const splash = h(
      "div",
      { class: "splash" },
      canvas,
      h("div", { class: "splash-dim" }),
      door,
    );
    const viewer = createViewer(splash, { views, view: settings.view }, {
      back: () => uncover(false),
      view(name) {
        showView(name);
        panel?.setting("view", name);
      },
      mood(name) {
        handle?.mood(name);
        showMood(name);
        caption(true);
      },
      scrub(minutes) {
        if (day) handle?.setClock(day, minutes);
        caption(true);
      },
      now: () => setSpeed("live"),
      play: (on) => setSpeed(on ? "day" : "paused"),
    });

    function setSpeed(speed: PondSettings["speed"]) {
      handle?.set({ speed });
      panel?.setting("speed", speed);
      viewer.setPlaying(speed === "day");
      caption(true);
    }
    function showMood(next: PondMood | null) {
      mood = next;
      viewer.setMood(next);
    }
    function caption(force = false) {
      const now = performance.now();
      if (!handle || !uncovered || !force && now - captionAt < 1000) return;
      captionAt = now;
      const scene = handle.scene(), t = COPY.splash;
      const wind = scene.wind < 0.5 ? t.calm : t.wind(
        Math.round(scene.wind * 2.23694),
        COPY.pond.compass[Math.round(scene.windFrom / 22.5) % 16],
      );
      viewer.setCaption(
        t.caption(
          scene.time,
          t.weatherNow(t.skies[scene.sky], wind, scene.real),
          t.moons[scene.moon],
        ),
      );
    }
    function onSetting<K extends keyof PondSettings>(key: K, value: PondSettings[K]) {
      panel?.setting(key, value);
      if (key === "speed") viewer.setPlaying(value === "day");
      if (key === "weatherMode") {
        showMood(value === "live" ? "real" : mood === "real" ? null : mood);
      }
    }

    const held = new Set<string>();
    // On the document: after a drag, focus sits on the body, outside the splash.
    const keydown = (e: KeyboardEvent) => {
      if (!uncovered) return;
      viewer.wake();
      if (e.key === "Escape") {
        uncover(false);
        return;
      }
      const target = e.target as Element;
      if (
        !ARROWS.has(e.key) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
        target.closest("input, select, textarea, [role=tab], .pond-panel")
      ) return;
      e.preventDefault();
      held.add(e.key);
      const s = handle?.settings;
      if (!s) return;
      stopGlide();
      base ??= { pan: s.pan, horizon: s.horizon };
      const x = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const y = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      look(clamp(s.pan + x * KEY_PAN, 0, 100), clamp(s.horizon + y * KEY_HORIZON, ...reach(base)));
    };
    const keyup = (e: KeyboardEvent) => {
      if (!held.delete(e.key) || held.size || drag) return;
      if (!reduced.matches) glideBack();
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("keyup", keyup);

    function uncover(on: boolean) {
      uncovered = on;
      splash.classList.toggle("uncovered", on);
      door.hidden = on;
      viewer.show(on);
      held.clear();
      if (on) {
        caption(true);
        viewer.focus();
      } else card.pondButton.isConnected ? card.pondButton.focus() : card.focus();
    }

    function enter() {
      closed = true;
      mounting.abort();
      stopGlide();
      handle?.destroy();
      panel?.destroy();
      viewer.destroy();
      splash.remove();
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("keyup", keyup);
      if (over) over.inert = false;
      resolve();
    }

    function fail() {
      if (closed) return;
      handle?.destroy();
      handle = undefined;
      panel?.destroy();
      panel = undefined;
      canvas.remove();
      viewer.destroy();
      card.pondButton.remove();
      if (uncovered) uncover(false);
    }

    let base: { pan: number; horizon: number } | null = null;
    let drag: { id: number; x: number; y: number; pan: number; horizon: number } | null = null;
    let glide = 0;
    const stopGlide = () => {
      cancelAnimationFrame(glide);
      glide = 0;
    };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const reach = (from: { horizon: number }): [number, number] => [
      Math.max(30, from.horizon - HORIZON_REACH),
      Math.min(70, from.horizon + HORIZON_REACH),
    ];

    function showView(name: string) {
      stopGlide();
      base = null;
      handle?.set({ view: name, pan: 50 });
      panel?.setting("pan", 50);
      viewer.setView(name);
    }

    function look(pan: number, horizon: number) {
      handle?.set({ pan, horizon });
      panel?.setting("pan", Math.round(pan));
      panel?.setting("horizon", Math.round(horizon));
    }

    const tap = tapTracker(TAP_SLOP);
    canvas.addEventListener("pointerdown", (e) => {
      if (!uncovered) return;
      viewer.closeMenus();
      tap.down(e.pointerId, e.clientX, e.clientY);
      if (!handle || drag) return;
      stopGlide();
      const s = handle.settings;
      base ??= { pan: s.pan, horizon: s.horizon };
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: s.pan, horizon: s.horizon };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (uncovered && e.pointerType === "mouse" && !e.buttons) viewer.wake();
      tap.move(e.pointerId, e.clientX, e.clientY);
      if (!drag || e.pointerId !== drag.id || !base) return;
      look(
        clamp(drag.pan - (e.clientX - drag.x) / innerWidth * 100, 0, 100),
        clamp(drag.horizon + (e.clientY - drag.y) / innerHeight * HORIZON_DRAG, ...reach(base)),
      );
    });
    const release = (e: PointerEvent) => {
      if (e.type === "pointercancel") tap.cancel(e.pointerId);
      else if (tap.up(e.pointerId, e.clientX, e.clientY)) viewer.wake();
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      if (!reduced.matches && !held.size) glideBack();
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    function glideBack() {
      if (!handle || !base) return;
      const to = base, from = { pan: handle.settings.pan, horizon: handle.settings.horizon };
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / GLIDE_MS), ease = 1 - (1 - t) ** 3;
        look(
          from.pan + (to.pan - from.pan) * ease,
          from.horizon + (to.horizon - from.horizon) * ease,
        );
        if (t < 1) glide = requestAnimationFrame(step);
        else {
          glide = 0;
          base = null;
        }
      };
      glide = requestAnimationFrame(step);
    }

    if (new URLSearchParams(location.search).get("dev") === "1") {
      panel = createPanel(splash, { views, defaults: settings, open: false }, {
        change: (patch) => {
          handle?.set(patch);
          if (patch.view) showView(patch.view);
          if (patch.speed) viewer.setPlaying(patch.speed === "day");
          if (patch.weatherMode) onSetting("weatherMode", patch.weatherMode);
          caption(true);
        },
        clock: (date, minutes) => handle?.setClock(date, minutes),
        reset: (next) => {
          handle?.reset(next);
          viewer.setView(next.view);
          viewer.setPlaying(next.speed === "day");
          onSetting("weatherMode", next.weatherMode);
        },
        preset: (name) => handle?.preset(name),
        nextEclipse: () => handle?.nextEclipse() ?? "",
        strike: () => handle?.strike(),
        tilt: async (on) => {
          const problem = await handle?.tilt(on);
          if (problem === null || problem === undefined) return;
          panel?.showTiltNote(problem);
          if (on && !problem) {
            setTimeout(() => {
              if (!handle?.tiltSensing && panel?.isTilting()) {
                panel.showTiltNote(COPY.pond.tilt.silent);
              }
            }, 1500);
          }
        },
      });
    }

    async function startTilt() {
      if (reduced.matches || !tiltWithoutPrompt() || !handle) return;
      const pond = handle;
      panel?.setting("tilt", true);
      if (await pond.tilt(true)) {
        panel?.setting("tilt", false);
        return;
      }
      setTimeout(() => {
        if (handle !== pond || pond.tiltSensing) return;
        void pond.tilt(false);
        panel?.setting("tilt", false);
      }, 1500);
    }

    document.body.append(splash);
    if (over) over.inert = true;
    card.focus();

    if (typeof WebGL2RenderingContext === "undefined") {
      fail();
      return;
    }
    mountPond(canvas, {
      assets: POND_ASSETS,
      signal: mounting.signal,
      settings: panel?.read() ?? settings,
      on: {
        setting: onSetting,
        clock(date, minutes, reading) {
          day = date;
          panel?.showClock(date, minutes, reading);
          viewer.setClock(minutes, reading);
          caption();
        },
        readout: panel?.showReadout,
        forecast: panel?.showForecast,
        fps: panel?.showFps,
        debug: panel?.showDebug,
        strikeable: panel?.canStrike,
        ready() {
          if (closed) return;
          // A pond ready before the first paint has no starting style to fade from without this read.
          getComputedStyle(canvas).opacity;
          splash.classList.add("ready");
          card.pondButton.disabled = false;
        },
        failure: fail,
      },
    }).then((pond) => {
      if (closed) {
        pond.destroy();
        return;
      }
      handle = pond;
      if (panel) pond.set(panel.read());
      viewer.setView(pond.settings.view);
      viewer.setPlaying(pond.settings.speed === "day");
      onSetting("weatherMode", pond.settings.weatherMode);
      void startTilt();
    }, fail);
  });
}
