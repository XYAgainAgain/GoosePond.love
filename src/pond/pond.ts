import { COPY } from "../copy.ts";
import { createForecast, forecast } from "./forecast.ts";
import { LiveWeather, temperature, windText } from "./live.ts";
import {
  appearance,
  createEclipseSample,
  eclipseAt,
  finish,
  nextEclipse,
  peakMagnitudeWork,
} from "./sky/eclipse.ts";
import { type Ephemeris, equToLocal, skyAt, type Vec3 } from "./sky/ephemeris.ts";
import {
  apparentDeg,
  cloudsFor,
  fogFor,
  hue,
  lightFor,
  rainFor,
  skySlice,
  transmittance,
} from "./sky/sky.ts";
import { decodeMilkyWay, decodeStars } from "./sky/stars.ts";
import {
  DRIFT_WRAP_KM,
  JET_WRAP_KM,
  STORM_AGE_WRAP_H,
  STORM_WRAP_KM,
  stormCells,
} from "./clouds.ts";
import { Lightning } from "./lightning.ts";
import { BEACON_TURN_SECONDS, beaconFrame, beaconSite } from "./beacon.ts";
import { Tilt } from "./tilt.ts";
import { FOG_WRAP_M } from "./fog.ts";
import { WIND_WRAP_M } from "./foliage.ts";
import { type Frame, PondRenderer, type ViewArt } from "./render.ts";
import { type MoonPhase, moonPhase, nextSimMs, type Sky, skyOf } from "./scene.ts";
import { type PixelProjection, Starfield } from "./starfield.ts";

/** URLs to fetch; data URIs work too. */
export interface PondViewAssets {
  name: string;
  land: string;
  depth: string | null;
  foreground: string | null;
  foliage: string | null;
}
export interface PondAssets {
  views: PondViewAssets[];
  stars: string;
  milkyWay: string;
}

export type PondSpeed = "live" | "paused" | "minute" | "ten" | "hour" | "day";
export type PondMood = "real" | "clear" | "fog" | "rain" | "storm";
export const MOODS: readonly PondMood[] = ["real", "clear", "fog", "rain", "storm"];
export type PondWeatherMode = "manual" | "forecast" | "live";
export type PondMistStyle = "auto" | "blanket" | "wisps" | "steam";

export interface PondSettings {
  speed: PondSpeed;
  /** An unknown name shows the first view. */
  view: string;
  heading: number;
  span: number;
  horizon: number;
  pan: number;
  parallax: number;
  tilt: boolean;
  /** 0 picks the pixel size from the screen. */
  scale: number;
  weatherMode: PondWeatherMode;
  storms: number;
  rain: number;
  fog: number;
  mist: number;
  mistStyle: PondMistStyle;
  wind: number;
  windFrom: number;
  foliage: number;
  drift: number;
  cover: number;
  base: number;
  lowSoft: number;
  lowDensity: number;
  lowDetail: number;
  lowSize: number;
  mid: number;
  midSoft: number;
  midShade: number;
  midOpacity: number;
  midSize: number;
  cirrus: number;
  curl: number;
  cirrusWidth: number;
  puff: number;
  cirrusDir: number;
  lighthouse: boolean;
  beam: number;
  beamSpread: number;
  landFill: number;
  spread: number;
  mirror: number;
  glitter: number;
  rim: number;
  grade: number;
  exposure: number;
  disc: number;
  stars: number;
  milky: number;
  /** 0 turns the dither off. */
  look: number;
  bands: number;
  seed: number;
  fpsCap: number;
  showShadow: boolean;
  showDepth: boolean;
}

export const DEFAULT_SETTINGS: Readonly<PondSettings> = {
  speed: "live",
  view: "",
  heading: 252,
  span: 150,
  horizon: 45,
  pan: 50,
  parallax: 1,
  tilt: false,
  scale: 0,
  weatherMode: "manual",
  storms: 0,
  rain: 0,
  fog: 0,
  mist: 0,
  mistStyle: "auto",
  wind: 1.5,
  windFrom: 240,
  foliage: 1.5,
  drift: 1,
  cover: 35,
  base: 600,
  lowSoft: 0.5,
  lowDensity: 0.8,
  lowDetail: 0.45,
  lowSize: 6,
  mid: 15,
  midSoft: 1,
  midShade: 0.24,
  midOpacity: 1,
  midSize: 9,
  cirrus: 30,
  curl: 18,
  cirrusWidth: 20,
  puff: 0.3,
  cirrusDir: 160,
  lighthouse: true,
  beam: 2,
  beamSpread: 350,
  landFill: 5.5,
  spread: 4,
  mirror: 0.3,
  glitter: 1,
  rim: 0.5,
  grade: 0.4,
  exposure: 1,
  disc: 4,
  stars: 1,
  milky: 1,
  look: 3,
  bands: 48,
  seed: 1,
  fpsCap: 30,
  showShadow: false,
  showDepth: false,
};

/** Settings the forecast drives outside Manual mode, named as in Forecast. */
export const FORECAST_SETTINGS = [
  "cover",
  "base",
  "mid",
  "cirrus",
  "storms",
  "rain",
  "fog",
  "mist",
  "wind",
  "windFrom",
  "cirrusDir",
] as const;

type Range = { min: number; max: number; step: number };
// Engine writes snap to these as a range input would.
const RANGES: Partial<Record<keyof PondSettings, Range>> = {
  heading: { min: 0, max: 359, step: 1 },
  span: { min: 60, max: 240, step: 1 },
  horizon: { min: 30, max: 70, step: 1 },
  pan: { min: 0, max: 100, step: 1 },
  cover: { min: 0, max: 100, step: 1 },
  base: { min: 100, max: 1500, step: 50 },
  mid: { min: 0, max: 100, step: 1 },
  cirrus: { min: 0, max: 100, step: 1 },
  storms: { min: 0, max: 100, step: 1 },
  rain: { min: 0, max: 100, step: 1 },
  fog: { min: 0, max: 100, step: 1 },
  mist: { min: 0, max: 100, step: 1 },
  wind: { min: 0, max: 20, step: 0.5 },
  windFrom: { min: 0, max: 359, step: 1 },
  cirrusDir: { min: 0, max: 179, step: 1 },
};
const fit = (value: number, { min, max, step }: Range) =>
  min + Math.max(0, Math.min(Math.floor((max - min) / step), Math.round((value - min) / step))) *
    step;

export interface PondListeners {
  /** Engine writes only; set() doesn't echo. */
  setting?<K extends keyof PondSettings>(key: K, value: PondSettings[K]): void;
  clock?(day: string, minutes: number, reading: string): void;
  readout?(text: string): void;
  /** Called every frame; call text() only when the note is on screen. */
  forecast?(text: () => string): void;
  fps?(text: string): void;
  debug?(text: () => string): void;
  strikeable?(on: boolean): void;
  /** After the first frame that drew. */
  ready?(): void;
  failure?(error: unknown): void;
}

export interface PondScene {
  /** The clock in Chatham, as COPY.pond.clock reads it */
  time: string;
  sky: Sky;
  /** m/s, and the compass degrees it blows from */
  wind: number;
  windFrom: number;
  moon: MoonPhase;
  /** Live weather is on screen: the Live clock, Live mode, and fresh data */
  real: boolean;
}

export interface PondHandle {
  readonly settings: Readonly<PondSettings>;
  readonly views: readonly string[];
  readonly tiltSensing: boolean;
  /** A new view resets heading, span, and horizon to its framing. */
  set(patch: Partial<PondSettings>): void;
  /** Pauses the clock at minutes past midnight in Chatham on day (YYYY-MM-DD). */
  setClock(day: string, minutes: number): void;
  preset(name: string): void;
  /** Returns a note for the eclipse panel. */
  nextEclipse(): string;
  strike(): void;
  /** Resolves to a problem, "" when tilting, or null when a later call superseded it. */
  tilt(on: boolean): Promise<string | null>;
  /** "real" follows live weather; the others hold a fixed sky without moving the clock. */
  mood(name: PondMood): void;
  scene(): PondScene;
  /** Replaces every setting, clears lightning, and reframes the view. */
  reset(settings: PondSettings): void;
  destroy(): void;
}

const pick = <T>(table: Record<string, T>, name: string, fallback: T) =>
  Object.hasOwn(table, name) ? table[name] : fallback;
// Measured against the sun in dated photos.
const VIEW_HEADINGS: Record<string, number> = {
  sunset: 252,
  "main-camp": 252,
  famorama: 45,
  "grassy-knoll": 310,
};
// Degrees across the art; Grassy Knoll is a 28 mm-equivalent photo (63–68°).
const VIEW_SPANS: Record<string, number> = { "grassy-knoll": 66 };
// Default Horizon slider in % of screen height.
const VIEW_HORIZONS: Record<string, number> = { "grassy-knoll": 32 };
// For views above the water; Grassy Knoll assumes a 400 m far shore.
const VIEW_EYE_ROWS: Record<string, number> = { "grassy-knoll": 77 };
const VIEW_FORE_RISE: Record<string, number> = { "grassy-knoll": 8 };
const VIEW_EYE_M: Record<string, number> = { sunset: 1.6, "main-camp": 1.6, "grassy-knoll": 14 };
const VIEW_BEACON_SITES = new Map([
  ["sunset", beaconSite(41.695457, -70.005502)],
  ["main-camp", beaconSite(41.695530, -70.003806)],
  ["grassy-knoll", beaconSite(41.694407, -70.003519)],
]);

// The Point sets the sunset map's white depth endpoint.
const DEPTH_RANGES: Record<string, [number, number]> = {
  sunset: [30, 650],
  "grassy-knoll": [100, 450],
};

const DEG = Math.PI / 180;
const LAT = 41.6955, LON = -70.0045;
const SITE = { lat: LAT, lon: LON };
const DEFAULT_BEACON_SITE = beaconSite(LAT, LON);
const ZONE = "America/New_York";
const HOUR_MS = 3_600_000;

const MIN_YEAR = 1900, MAX_YEAR = 2099;

const ROWS = 260;
// Sidereal radians per simulated ms.
const TURN = 2 * Math.PI / 86_164_091;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const YEAR_MS = 365.25 * 86_400_000;
// In KELPII's sim.ts, the look is scene-linear and the disc is display-encoded.
const COPPER_EXPOSURE = 0.6, COPPER_GAMMA = 1 / 2.2;
const ECLIPSE_SEED = 1;
const ECLIPSE_SEARCH_MS = 25 * YEAR_MS;
// Westerly bias in m/s from KELPII's windsAloft. Rise in km/s.
const WESTERLY_ALOFT = 4, CLOUD_RISE = 0.002;
const SIM_MIN = Date.UTC(MIN_YEAR, 0, 1, 5), SIM_MAX = Date.UTC(MAX_YEAR + 1, 0, 1, 4, 59);
type Weather = {
  cover: number;
  base: number;
  mid: number;
  cirrus: number;
  storms: number;
  rain: number;
  fog: number;
  mist: number;
  wind: number;
  from: number;
};
// Horizon dip in degrees for low deck, mid sheet/storms, and cirrus.
const LAYER_DIP = [0.8, 2.2, 3.3];
const SHORE_M = 600;

// m/s and m. Mirrors WaterFrame.waveDrift in render.ts.
const WAVE_SPEED = 0.6, WAVE_WRAP_M = 4096;
/** at is minutes past local midnight. sunset is minutes relative to sunset. */
const PRESETS: Record<string, Weather & ({ at: number } | { sunset: number })> = {
  fair: {
    cover: 30,
    base: 1150,
    mid: 10,
    cirrus: 35,
    storms: 0,
    rain: 0,
    fog: 0,
    mist: 0,
    wind: 4,
    from: 240,
    at: 14 * 60,
  },
  mackerel: {
    cover: 12,
    base: 1000,
    mid: 65,
    cirrus: 40,
    storms: 0,
    rain: 0,
    fog: 0,
    mist: 0,
    wind: 3,
    from: 260,
    sunset: 4,
  },
  storm: {
    cover: 60,
    base: 400,
    mid: 40,
    cirrus: 20,
    storms: 25,
    rain: 12,
    fog: 0,
    mist: 0,
    wind: 7,
    from: 290,
    sunset: -30,
  },
  overcast: {
    cover: 95,
    base: 300,
    mid: 90,
    cirrus: 0,
    storms: 0,
    rain: 5,
    fog: 10,
    mist: 30,
    wind: 5,
    from: 60,
    at: 11 * 60,
  },
  thunder: {
    cover: 25,
    base: 350,
    mid: 30,
    cirrus: 10,
    storms: 70,
    rain: 20,
    fog: 0,
    mist: 0,
    wind: 9,
    from: 230,
    sunset: -150,
  },
};
const FOG: Weather = {
  cover: 70,
  base: 200,
  mid: 40,
  cirrus: 0,
  storms: 0,
  rain: 0,
  fog: 75,
  mist: 60,
  wind: 1.5,
  from: 150,
};
const MOOD_WEATHER: Record<Exclude<PondMood, "real">, Weather> = {
  clear: PRESETS.fair,
  fog: FOG,
  rain: { ...PRESETS.overcast, rain: 45, fog: 0, mist: 10 },
  storm: PRESETS.thunder,
};
/** Simulated seconds per real second, or null to follow the real clock. */
const SPEEDS: Record<PondSpeed, number | null> = {
  live: null,
  paused: 0,
  minute: 60,
  ten: 600,
  hour: 3600,
  day: 1440,
};

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const wallFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallClock(ms: number) {
  const part: Record<string, number> = {};
  for (const { type, value } of wallFormat.formatToParts(ms)) part[type] = Number(value);
  return part;
}

const zoneOffset = (ms: number) => {
  const w = wallClock(ms);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) -
    Math.floor(ms / 1000) * 1000;
};

/** Chatham minutes past midnight, with prefer giving the UTC offset in ms for repeated hours. */
function fromWall(year: number, month: number, day: number, minutes: number, prefer: number) {
  const target = Date.UTC(year, month - 1, day, 0, minutes);
  const near = target - zoneOffset(target);
  const before = zoneOffset(near - 3 * HOUR_MS), after = zoneOffset(near + 3 * HOUR_MS);
  const fits = [before, after].filter((offset) => zoneOffset(target - offset) === offset);
  // Use the pre-transition offset to shift nonexistent times past the spring gap.
  if (fits.length === 0) return target - before;
  return target - (fits.includes(prefer) ? prefer : fits[0]);
}

const pad = (n: number) => String(n).padStart(2, "0");

function closeArt(views: ViewArt[]) {
  for (const v of views) {
    for (const image of [v.land, v.depth, v.foreground, v.foliage]) image?.close();
  }
}

async function loadArt(assets: PondAssets, signal: AbortSignal | undefined) {
  const fetched = async (url: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response;
  };
  const made: ImageBitmap[] = [];
  let failed = false;
  const bitmap = async (url: string) => {
    // Keeps depth greys exact.
    const image = await createImageBitmap(await (await fetched(url)).blob(), {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    // Decodes still in flight when a sibling fails land after the cleanup below.
    if (failed) image.close();
    else made.push(image);
    return image;
  };
  const bytes = async (url: string) => new Uint8Array(await (await fetched(url)).arrayBuffer());
  const [views, starBytes, milkyBytes] = await Promise.all([
    Promise.all(assets.views.map(async (v): Promise<ViewArt> => {
      const land = await bitmap(v.land);
      return {
        name: v.name,
        land,
        eyeRow: pick(VIEW_EYE_ROWS, v.name, land.height),
        foreRise: pick(VIEW_FORE_RISE, v.name, 0),
        depth: v.depth ? await bitmap(v.depth) : null,
        foreground: v.foreground ? await bitmap(v.foreground) : null,
        foliage: v.foliage ? await bitmap(v.foliage) : null,
        depthRange: pick(DEPTH_RANGES, v.name, [30, 650]),
      };
    })),
    bytes(assets.stars),
    bytes(assets.milkyWay),
  ]).catch((error) => {
    failed = true;
    for (const image of made) image.close();
    throw error;
  });
  if (views.length === 0) throw new Error("No views: add views/<name>/land.png and rebuild");
  return { views, stars: decodeStars(starBytes), milkyWay: decodeMilkyWay(milkyBytes) };
}

// Mounts on one canvas share its WebGL context, so releasing either would blank both.
const owners = new WeakMap<HTMLCanvasElement, symbol>();
// A released context stays lost, so a canvas hosts at most one pond.
const spent = new WeakSet<HTMLCanvasElement>();

/** Rejects when the canvas has or had a pond, or when signal aborts before the renderer starts. */
export async function mountPond(
  canvas: HTMLCanvasElement,
  options: {
    assets: PondAssets;
    settings?: Partial<PondSettings>;
    on?: PondListeners;
    signal?: AbortSignal;
  },
): Promise<PondHandle> {
  const { assets, on = {}, signal } = options;
  signal?.throwIfAborted();
  if (owners.has(canvas) || spent.has(canvas)) throw new Error("This canvas already has a pond");
  const owner = Symbol();
  owners.set(canvas, owner);
  const disown = () => {
    if (owners.get(canvas) === owner) owners.delete(canvas);
  };
  signal?.addEventListener("abort", disown);
  let art: Awaited<ReturnType<typeof loadArt>> | undefined, renderer: PondRenderer, started = false;
  try {
    art = await loadArt(assets, signal);
    signal?.throwIfAborted();
    started = true;
    renderer = new PondRenderer(canvas, art.views[0], art.milkyWay);
  } catch (error) {
    if (art) closeArt(art.views);
    if (started) {
      spent.add(canvas);
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    }
    disown();
    throw error;
  } finally {
    signal?.removeEventListener("abort", disown);
  }
  const { views, milkyWay } = art;

  const settings: PondSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  function write<K extends keyof PondSettings>(key: K, value: PondSettings[K]) {
    const range = RANGES[key];
    const next = (range ? fit(value as number, range) : value) as PondSettings[K];
    if (settings[key] === next) return;
    settings[key] = next;
    on.setting?.(key, next);
  }

  let view = views[0], lost = false;
  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  const contextRestored = () => {
    try {
      renderer = new PondRenderer(canvas, view, milkyWay);
    } catch (error) {
      fatal(error);
      return;
    }
    lost = false;
    redraw();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  const starfield = new Starfield(art.stars, milkyWay);
  let rasterMs = NaN, rasterKey = "";
  const shadow = createEclipseSample(), peaks = new Map<number, number>();
  const drift: [number, number, number] = [0, 0, 0];
  const midDrift: [number, number] = [0, 0], jetDrift: [number, number] = [0, 0];
  const stormDrift: [number, number] = [0, 0];
  let stormAge = 0;
  const pawDrift: [number, number] = [0, 0], waveDrift: [number, number] = [0, 0];
  const fogDrift: [number, number] = [0, 0];
  let mistRise = 0;
  const lightning = new Lightning();
  let strikeNow = false, storms = { live: 0, near: 0 };
  const tilt = new Tilt();
  let frames = 0, scriptMs = 0, countFrom = performance.now(), frameMs = 0, scriptAvg = 0;
  let churnT = 0;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let simMs = Date.now(), last = performance.now(), due = 0, waterT = 0;
  let beaconMs = simMs;
  const predicted = createForecast();
  const liveWeather = new LiveWeather();
  const lifetime = new AbortController();
  let forecastOn = false, rainFront = Infinity;
  let animation = 0, destroyed = false, drawn = false;

  const horizonOf = (name: string) => pick(VIEW_HORIZONS, name, 45);
  function frameView() {
    write("heading", pick(VIEW_HEADINGS, view.name, 252));
    write("span", pick(VIEW_SPANS, view.name, 150));
    write("horizon", horizonOf(view.name));
  }
  showView();

  const reading = (w: Record<string, number>) =>
    COPY.pond.clock(w.hour % 12 || 12, pad(w.minute), w.hour < 12);
  function showClock() {
    const w = wallClock(simMs);
    on.clock?.(`${w.year}-${pad(w.month)}-${pad(w.day)}`, w.hour * 60 + w.minute, reading(w));
  }

  function setClock(day: string, minutes: number) {
    const [year, month, date] = day.split("-").map(Number);
    if (!(year >= MIN_YEAR && year <= MAX_YEAR) || !month || !date) return;
    simMs = fromWall(year, month, date, minutes, zoneOffset(simMs));
    write("speed", "paused");
    showClock();
  }
  function showView() {
    // The paintings are closed on destroy.
    if (destroyed) return;
    view = views.find((v) => v.name === settings.view) ?? views[0];
    renderer.setView(view);
    frameView();
  }

  function frameMoon(ms: number) {
    const { width, height } = layout(), moon = skyAt(ms, LAT, LON).moon.direction;
    const el = apparentDeg(Math.asin(moon[1]) / DEG);
    const need = el + 0.266 * settings.disc + 2;
    write("heading", Math.round((180 + Math.atan2(moon[0], moon[2]) / DEG + 360) % 360));
    const degPerRow = Math.min(settings.span / renderer.landWidth, 360 / width);
    write("horizon", Math.ceil(100 * need / degPerRow / height));
    const rows = height * settings.horizon / 100;
    if (rows * degPerRow < need) write("span", Math.ceil(need / rows * renderer.landWidth));
    write("pan", 50);
    return el;
  }
  function sunsetOn(ms: number) {
    const w = wallClock(ms);
    let lit = fromWall(w.year, w.month, w.day, 12 * 60, zoneOffset(ms)), dark = lit + 12 * HOUR_MS;
    const up = (t: number) => apparentDeg(Math.asin(skyAt(t, LAT, LON).sun.direction[1]) / DEG);
    for (let i = 0; i < 30; i++) {
      const mid = (lit + dark) / 2;
      if (up(mid) > 0) lit = mid;
      else dark = mid;
    }
    return lit;
  }
  function applyWeather(preset: Weather) {
    write("cover", preset.cover);
    write("base", preset.base);
    write("rain", preset.rain);
    write("fog", preset.fog);
    write("mist", preset.mist);
    write("mid", preset.mid);
    write("cirrus", preset.cirrus);
    write("storms", preset.storms);
    write("wind", preset.wind);
    write("windFrom", preset.from);
  }
  function applyPreset(name: string) {
    const preset = PRESETS[name];
    applyWeather(preset);
    const w = wallClock(simMs);
    simMs = "at" in preset
      ? fromWall(w.year, w.month, w.day, preset.at, zoneOffset(simMs))
      : sunsetOn(simMs) + preset.sunset * 60_000;
    write("speed", "paused");
    showClock();
  }

  function updateForecast(liveClock: boolean) {
    const mode = settings.weatherMode;
    forecastOn = mode !== "manual";
    if (!forecastOn) {
      rainFront = Infinity;
      return;
    }

    forecast(simMs, settings.seed | 0, predicted);
    if (mode === "live" && liveClock) {
      void liveWeather.poll(simMs, lifetime.signal).then((fresh) => fresh && still() && redraw());
      liveWeather.apply(simMs, simMs, predicted);
    }
    for (const key of FORECAST_SETTINGS) {
      const value = predicted[key];
      write(
        key,
        key === "wind"
          ? Math.round(value * 2) / 2
          : key === "windFrom"
          ? Math.round(value) % 360
          : key === "base"
          ? Math.round(value / 50) * 50
          : Math.round(value),
      );
    }
    rainFront = predicted.rainFront;
    on.forecast?.(
      mode === "live"
        ? () => liveClock ? liveWeather.readout(simMs) : COPY.pond.liveNeedsClock
        : forecastText,
    );
  }

  function forecastText() {
    const hours = predicted.hoursToFront;
    const t = COPY.pond;
    const front = predicted.front
      ? t.frontPassing
      : hours < 1
      ? t.frontMinutes(Math.ceil(hours * 60))
      : Number.isFinite(hours)
      ? t.frontHours(Math.ceil(hours))
      : t.noFront;
    return t.forecast(
      front,
      temperature(predicted.airC),
      temperature(predicted.waterC),
      windText(predicted.wind, predicted.windFrom),
    );
  }

  /** dip sets the horizon fade midpoint in degrees below horizontal. */
  function layerLight(
    sunDir: Vec3,
    moonDir: Vec3,
    dip: number,
    moonK: number,
    night: number,
    irr: number,
  ) {
    const up = sunDir[1],
      sin = Math.asin(Math.max(-1, Math.min(1, up))) + dip * DEG,
      edge = -Math.sin(dip * DEG);
    const sun = hue(transmittance(Math.sin(sin))),
      day = 0.7 * sstep(edge - 0.015, edge + 0.015, up);
    // Mirrors the moonlight term of cloudLight in lightFor.
    const moon = moonK * night * irr * sstep(edge - 0.015, edge + 0.015, moonDir[1]);
    const light: Vec3 = [
      sun[0] * day + 0.09 * moon,
      sun[1] * day + 0.1 * moon,
      sun[2] * day + 0.12 * moon,
    ];
    return { light, dir: (sun[0] + sun[1] + sun[2]) * day >= 0.31 * moon ? sunDir : moonDir };
  }

  /** Downwind m/s on [west, south]. */
  function windTo(): [number, number] {
    const from = settings.windFrom * DEG, wind = settings.wind;
    return [wind * Math.sin(from), wind * Math.cos(from)];
  }

  /** Measured map distances in m to open water at 45° intervals clockwise from north. */
  function coastM(bearing: number) {
    const at = [2400, 2600, 4500, 3500, 2400, 2800, 8000, 6000, 2400];
    const i = Math.floor(bearing / 45) % 8, t = (bearing % 45) / 45;
    return at[i] + (at[i + 1] - at[i]) * t;
  }

  function mistStyle(sinSun: number): [number, number, number] {
    const pick = settings.mistStyle;
    if (pick !== "auto") {
      return [pick === "blanket" ? 1 : 0, pick === "wisps" ? 1 : 0, pick === "steam" ? 1 : 0];
    }
    if (forecastOn) {
      const { airC, waterC, wind } = predicted;
      const steam = sstep(2, 8, waterC - airC) * (1 - sstep(9, 17, airC)) *
        (1 - sstep(1.5, 4, wind));
      const blanket = (1 - steam) * (1 - sstep(0.8, 2.5, wind)) * (1 - sstep(-0.1, 0.05, sinSun));
      return [blanket, 1 - steam - blanket, steam];
    }
    const w = wallClock(simMs), hour = w.hour + w.minute / 60;
    const cold = [10, 11, 12, 1, 2, 3, 4].includes(w.month)
      ? 1
      : w.month === 5 || w.month === 9
      ? 0.5
      : 0;
    const steam = cold * sstep(4, 6, hour) * (1 - sstep(10, 12, hour));
    const blanket = (1 - steam) * (1 - sstep(0.8, 2.5, settings.wind)) *
      (1 - sstep(-0.1, 0.05, sinSun));
    return [blanket, 1 - steam - blanket, steam];
  }

  function weather() {
    const cover = settings.cover / 100, level = settings.rain / 100, wind = settings.wind;
    const rain = rainFor(level, wind);
    const clouds = { ...cloudsFor(cover, level), cirrus: settings.cirrus / 100 };
    return { rain, clouds, fog: fogFor(settings.fog / 100, rain) };
  }
  /** seconds includes the Cloud speed multiplier. */
  function advanceClouds(seconds: number) {
    const from = settings.windFrom * DEG, wind = settings.wind;
    // A wind from compass θ blows toward [sin θ, 0, cos θ] on [west, up, south].
    const deck = [0.9 * wind * Math.sin(from) - WESTERLY_ALOFT, 0, 0.9 * wind * Math.cos(from)];
    const wrap = (v: number) => ((v % DRIFT_WRAP_KM) + DRIFT_WRAP_KM) % DRIFT_WRAP_KM;
    drift[0] = wrap(drift[0] - deck[0] * seconds / 1000);
    drift[1] = wrap(drift[1] + CLOUD_RISE * seconds);
    drift[2] = wrap(drift[2] - deck[2] * seconds / 1000);
    churnT = (churnT + weather().clouds.churnRate * seconds) % 1;
    const aloft = 8 + 0.4 * wind, jet = 12 + 0.5 * wind;
    const mid = [0.5 * wind * Math.sin(from) - aloft, 0.5 * wind * Math.cos(from)];
    midDrift[0] = wrap(midDrift[0] - mid[0] * seconds / 1000);
    midDrift[1] = wrap(midDrift[1] - mid[1] * seconds / 1000);
    const wrapAt = (v: number, at: number) => ((v % at) + at) % at;
    jetDrift[0] = wrapAt(jetDrift[0] + jet * seconds / 1000, JET_WRAP_KM);
    stormDrift[0] = wrapAt(stormDrift[0] - mid[0] * seconds / 1000, STORM_WRAP_KM);
    stormDrift[1] = wrapAt(stormDrift[1] - mid[1] * seconds / 1000, STORM_WRAP_KM);
    stormAge = (stormAge + seconds / 3600) % STORM_AGE_WRAP_H;
  }

  function showNextEclipse() {
    const end = Math.min(simMs + ECLIPSE_SEARCH_MS, Date.UTC(MAX_YEAR, 11, 31, 12));
    const event = end > simMs ? nextEclipse(simMs, end, SITE, true) : null;
    if (!event?.viewingPeak) return COPY.pond.noEclipse;
    peaks.set(event.lunation, event.umbralMagnitude);
    simMs = event.viewingPeak;
    write("speed", "paused");
    showClock();
    const el = frameMoon(simMs);
    return COPY.pond.eclipse(event.type, event.umbralMagnitude.toFixed(2), Math.round(el));
  }

  function layout() {
    const dpr = devicePixelRatio || 1;
    const deviceW = Math.round(innerWidth * dpr), deviceH = Math.round(innerHeight * dpr);
    const chosen = settings.scale;
    const scale = chosen ||
      Math.max(1, Math.ceil(deviceW / renderer.landWidth), Math.round(deviceH / ROWS));
    const width = Math.ceil(deviceW / scale), height = Math.ceil(deviceH / scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.style.width = `${(width * scale) / dpr}px`;
    canvas.style.height = `${(height * scale) / dpr}px`;
    return { width, height, scale };
  }

  function rasterStars(p: PixelProjection, eph: Ephemeris, moonlight: number) {
    const key = `${p.width} ${p.horizon} ${p.centerX} ${p.headAz} ${p.radPerPx}`;
    if (key === rasterKey && Math.abs(simMs - rasterMs) * TURN < 0.5 * p.radPerPx) return;
    rasterKey = key;
    rasterMs = simMs;
    starfield.update({
      equToLocal: equToLocal(simMs, LAT, LON),
      yearsSinceJ2000: (simMs - J2000_MS) / YEAR_MS,
      projection: p,
      planets: eph.planets,
      sunAltitude: Math.asin(Math.max(-1, Math.min(1, eph.sun.direction[1]))) / DEG,
      moonlight,
    });
  }

  function draw(beaconElapsed: number, baseKm: number) {
    const { width, height, scale } = layout();
    const eph = skyAt(simMs, LAT, LON);
    const eclipse = eclipseAt(simMs, SITE, shadow, eph);
    const irr = eclipse?.irradiance ?? 1;
    const exposure = settings.exposure, look = settings.look;
    const { rain, clouds, fog } = weather();
    // Canvas dimensions affect only KELPII's dome placement.
    const light = lightFor(eph, rain, clouds, fog, 480, 270, 120, irr);
    // Undo lightFor's overcast cut because the shadow map dims glints per pixel.
    const unclouded = (odds: number) => clouds.overcast < 0.999 ? odds / (1 - clouds.overcast) : 0;
    const clear = (1 - 0.6 * clouds.heavy) * (1 - 0.55 * fog.amount);
    const sky = light.sky, sun = eph.sun.direction, moon = eph.moon.direction;
    const mist = settings.mist / 100;
    const sunEl = apparentDeg(Math.asin(sun[1]) / DEG) * DEG,
      moonEl = apparentDeg(Math.asin(moon[1]) / DEG) * DEG;
    const landWidth = renderer.landWidth;
    const horizonPct = settings.horizon, pan = settings.pan;
    const horizon = Math.max(1, Math.round(height * horizonPct / 100));
    const bandX = Math.round((width - landWidth) * pan / 100);
    const parallax = settings.parallax;
    const tiltX = reduced.matches ? 0 : tilt.x, tiltY = reduced.matches ? 0 : tilt.y;
    const level = horizonOf(view.name);
    const lift = (horizonPct - level) / (horizonPct < level ? level - 30 : 70 - level);
    const radPerPx = Math.min(settings.span * DEG / landWidth, 2 * Math.PI / width);
    const headAz = (settings.heading - 180) * DEG;
    const moonlight = light.moonK ** 3 * Math.sqrt(Math.max(0, moon[1])) * irr;
    const flash = lightning.frame({
      width,
      horizon,
      centerX: bandX + landWidth / 2,
      headAz,
      radPerPx,
    });
    // Assumption: full overcast leaves 15% of the moon's contribution to eye adaptation.
    const beaconMoon = light.moonK * light.night * irr * sstep(0, 0.05, moon[1]) *
      (1 - 0.85 * clouds.overcast);
    const beacon = beaconFrame(
      beaconMs,
      reduced.matches ? BEACON_TURN_SECONDS : beaconElapsed,
      sun[1],
      settings.lighthouse ? settings.beam : 0,
      beaconMoon,
      VIEW_BEACON_SITES.get(view.name) ?? DEFAULT_BEACON_SITE,
      settings.beamSpread,
    );
    on.strikeable?.(settings.storms > 0 && !reduced.matches);
    rasterStars(
      { width, horizon, centerX: bandX + landWidth / 2, headAz, radPerPx },
      eph,
      moonlight,
    );
    let shown: Frame["eclipse"] = null;
    if (eclipse) {
      let peak = peaks.get(eclipse.lunation);
      if (peak === undefined) {
        peak = finish(peakMagnitudeWork(eclipse.lunation, SITE));
        peaks.set(eclipse.lunation, peak);
      }
      const look = appearance({ lunation: eclipse.lunation, umbralMagnitude: peak }, ECLIPSE_SEED);
      const encode = (c: number[]) =>
        c.map((v) => (v * COPPER_EXPOSURE) ** COPPER_GAMMA) as [number, number, number];
      shown = {
        shadow: [
          eclipse.centerRight,
          eclipse.centerUp,
          eclipse.umbraRadius,
          eclipse.penumbraRadius,
        ],
        soft: look.edgeSoftness,
        core: encode(look.core),
        rim: encode(look.rim),
      };
    }
    const [low, mid, high] = LAYER_DIP.map((dip) =>
      layerLight(sky.sunDir, sky.moonDir, dip, light.moonK, light.night, irr)
    );
    const frame: Frame = {
      width,
      height,
      horizon,
      bandX,
      eyeOffsetM: [1.5 * ((pan - 50) / 50 + tiltX) * parallax, 0.6 * (lift - tiltY) * parallax],
      radPerPx,
      headAz,
      bodyR: 0.266 * DEG * settings.disc,
      time: waterT,
      wind: Math.min(1, settings.wind / 10),
      foliage: settings.foliage,
      bands: look ? settings.bands : 0,
      bayer: look,
      haze: 0.12,
      sinSun: sky.sinSun,
      sunSlice: skySlice(sky.sinSun),
      sinMoon: sky.sinMoon,
      moonSlice: skySlice(sky.sinMoon),
      sunAz: sky.sunAz,
      moonAz: sky.moonAz,
      sunEl,
      moonEl,
      // Reduce KELPII's daylight exposure to match pond photos.
      skyE: sky.skyE * exposure * (1 - 0.35 * sstep(0.05, 0.35, sky.sinSun)),
      skySat: 1.35,
      mieGain: 0.55,
      moonE: sky.moonE,
      moonVis: sky.moonVis,
      moonK: light.moonK,
      sunCol: sky.sunCol,
      moonCol: sky.moonCol,
      moonLight: sky.moonLight,
      sunBeam: light.sunI * clear,
      // Attenuate KELPII's underwater moonlight for land.
      moonBeam: light.moonI * 0.16 * clear,
      showShadow: settings.showShadow,
      showDepth: settings.showDepth,
      landFill: settings.landFill *
        (1 - 0.45 * sstep(0.2, 1, Math.max(clouds.cover, 0.8 * settings.mid / 100))) *
        (1 - 0.3 * clouds.heavy),
      fog: {
        mist,
        bank: settings.fog / 100,
        drift: fogDrift,
        bow: sky.bowFog,
        mistBow: mist * (1 - clouds.overcast) * sstep(0, 0.05, sky.sinSun),
        beam: [light.sunI * (1 - 0.6 * clouds.heavy), light.moonI * (1 - 0.6 * clouds.heavy)],
        style: mistStyle(sky.sinSun),
        rise: mistRise,
        from: [-Math.sin(settings.windFrom * DEG), -Math.cos(settings.windFrom * DEG)],
        coast: coastM(settings.windFrom),
      },
      // The shader expects a finite offset for full rain coverage.
      rain: { level: rain.level, front: Number.isFinite(rainFront) ? rainFront : -1e6 },
      water: {
        windMs: settings.wind,
        windTo: windTo(),
        pawDrift,
        waveDrift,
        slope: sky.seaSlope,
        sunGlint: [sky.seaGlints[0], unclouded(sky.seaGlints[1]), sky.glints[3]],
        moonGlint: [sky.seaGlints[2], unclouded(sky.seaGlints[3]), sky.glints[7]],
        glintScale: settings.glitter,
        amb: light.amb,
        ambTint: sky.ambTint,
        lightI: light.beam,
        sunShare: light.sunI / Math.max(1e-4, light.sunI + light.moonI),
        lightCol: light.lightCol,
        fog: fog.amount,
        eyeH: pick(VIEW_EYE_M, view.name, 1.6),
        shoreZ: SHORE_M,
        mirror: settings.mirror,
      },
      starfield,
      starGain: settings.stars,
      milkyGain: settings.milky,
      eclipse: shown,
      rim: settings.rim,
      grade: settings.grade,
      sunset: sstep(-0.12, 0, sky.sinSun) * (1 - sstep(0.1, 0.35, sky.sinSun)),
      flash,
      beacon,
      optics: {
        bowSun: sky.bowSun,
        bowMoon: sky.bowMoon,
        halo: sky.halo,
        haloTint: sky.haloTint,
        haloDir: sky.lightDir,
        corona: sky.moonShows * (1 - clouds.heavy),
      },
      clouds: clouds.cover < 0.002 && settings.mid < 0.2 && settings.cirrus < 0.2 &&
          settings.storms < 0.2
        ? null
        : {
          cover: clouds.cover,
          stratus: clouds.stratus,
          baseKm,
          thick: clouds.thick,
          sigma: clouds.sigma * settings.lowDensity,
          heavy: clouds.heavy,
          churn: clouds.churn,
          churnT,
          drift,
          fair: clouds.fair,
          lowDir: low.dir,
          midDir: mid.dir,
          highDir: high.dir,
          sunDir: sky.sunDir,
          moonDir: sky.moonDir,
          shadowSpread: settings.spread,
          amb: sky.cloudAmb,
          lowLight: low.light,
          midLight: mid.light,
          highLight: high.light,
          midCover: settings.mid / 100,
          lowSoft: settings.lowSoft,
          lowDetail: settings.lowDetail,
          lowTile: settings.lowSize,
          midSoft: settings.midSoft,
          midShade: settings.midShade,
          midOpacity: settings.midOpacity,
          midTile: settings.midSize,
          cirrus: settings.cirrus / 100,
          cirrusCurl: settings.curl,
          cirrusWidth: settings.cirrusWidth,
          cirrusPuff: settings.puff,
          cirrusDir: [Math.sin(settings.cirrusDir * DEG), Math.cos(settings.cirrusDir * DEG)],
          midDrift,
          jetDrift,
          storms: settings.storms / 100,
          stormDrift,
          stormAge,
          flash: flash.cloud,
          lowSun: low.dir === sky.sunDir ? 1 - sstep(0.05, 0.35, sky.sinSun) : 0,
        },
    };
    renderer.draw(frame);

    const compass = (az: number) => Math.round(((az / DEG + 180) % 360 + 360) % 360);
    const signed = (el: number) => `${el < 0 ? "−" : "+"}${Math.abs(el / DEG).toFixed(1)}°`;
    const t = COPY.pond;
    on.readout?.(
      t.readout(
        compass(sky.sunAz),
        signed(sunEl),
        compass(sky.moonAz),
        signed(moonEl),
        Math.round(eph.moon.illuminatedFraction * 100),
        starfield.visible,
        starfield.limit.toFixed(1),
      ) + (eclipse ? t.readoutEclipse(Math.round(irr * 100)) : ""),
    );
    on.debug?.(() => {
      const d = t.debug;
      return [
        d.frame(frameMs.toFixed(1), scriptAvg.toFixed(1)),
        d.canvas(width, height, scale),
        d.gpu(renderer.gpu),
        d.view(
          view.name,
          renderer.landWidth,
          view.depth !== null,
          view.foreground !== null,
          view.foliage !== null,
        ),
        d.storms(storms.live, storms.near, lightning.strikes),
        reduced.matches ? d.beaconAverage : d.beacon(
          beacon.angles.map((az) => `${compass(az) % 360}°`),
          beacon.next.toFixed(2),
        ),
        d.eye(frame.eyeOffsetM.map((m) => m.toFixed(2))),
        !Number.isFinite(rainFront)
          ? d.noRainFront
          : rainFront > 0
          ? d.rainFront(Math.round(rainFront))
          : d.rainPassing,
      ].join("\n");
    });
  }

  // Updates the clock and weather so scene() is current before the next frame.
  function settle() {
    const live = SPEEDS[settings.speed] === null;
    if (live) simMs = Date.now();
    updateForecast(live);
    showClock();
  }

  // Reduced motion draws one still frame per change instead of looping.
  const still = () => reduced.matches;
  function redraw() {
    if (!destroyed && !animation) animation = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    animation = still() ? 0 : requestAnimationFrame(tick);
    // Carry the frame deadline forward to preserve cadence on uneven refresh intervals.
    const interval = 1000 / settings.fpsCap;
    if (!still() && now < due - 1) return;
    due = Math.max(due + interval, now);
    const elapsed = now - last;
    const dt = Math.min(1, elapsed / 1000);
    last = now;
    const rate = SPEEDS[settings.speed];
    simMs = Math.min(SIM_MAX, Math.max(SIM_MIN, nextSimMs(simMs, dt, rate, still(), Date.now())));
    updateForecast(rate === null);
    const baseKm = (forecastOn ? predicted.base : settings.base) / 1000;
    if (!reduced.matches) {
      // The beam turns in page time, whatever the sim clock does.
      beaconMs += elapsed;
      waterT += dt;
      advanceClouds(dt * settings.drift);
      const [w, s] = windTo();
      fogDrift[0] = (fogDrift[0] - w * dt * 0.25) % FOG_WRAP_M;
      fogDrift[1] = (fogDrift[1] - s * dt * 0.25) % FOG_WRAP_M;
      // Steam noise uses 7 m tiles, giving about 1 m/s of rise.
      mistRise = (mistRise + dt * 0.15) % 1;
      const cells = stormCells(stormDrift, stormAge, settings.storms / 100, 90, baseKm);
      storms = { live: Lightning.live(cells).length, near: cells.length };
      if (lightning.update(dt, cells, strikeNow)) strikeNow = false;
      tilt.update(dt);
      pawDrift[0] = (((pawDrift[0] - w * dt) % WIND_WRAP_M) + WIND_WRAP_M) % WIND_WRAP_M;
      pawDrift[1] = (((pawDrift[1] - s * dt) % WIND_WRAP_M) + WIND_WRAP_M) % WIND_WRAP_M;
      const speed = Math.hypot(w, s), wave = speed > 0 ? WAVE_SPEED * dt / speed : 0;
      waveDrift[0] = (waveDrift[0] + w * wave) % WAVE_WRAP_M;
      waveDrift[1] = (waveDrift[1] + s * wave) % WAVE_WRAP_M;
    } else {
      lightning.clear();
      strikeNow = false;
    }
    if (rate !== 0) showClock();
    if (!lost) {
      const start = performance.now();
      // Shaders compile on first use, so a link failure surfaces here.
      try {
        draw(dt, baseKm);
      } catch (error) {
        // A context lost mid-link fails the status check; webglcontextrestored recovers it.
        if (renderer.contextLost) lost = true;
        else fatal(error);
        return;
      }
      scriptMs += performance.now() - start;
      frames++;
      if (!drawn) {
        drawn = true;
        on.ready?.();
      }
    }
    if (now - countFrom >= 1000) {
      on.fps?.(COPY.pond.fps(Math.round(frames * 1000 / (now - countFrom))));
      frameMs = frames ? (now - countFrom) / frames : 0;
      scriptAvg = frames ? scriptMs / frames : 0;
      frames = scriptMs = 0;
      countFrom = now;
    }
  }
  showClock();
  animation = requestAnimationFrame(tick);
  const motionChanged = () => {
    last = performance.now();
    redraw();
  };
  reduced.addEventListener("change", motionChanged);
  addEventListener("resize", redraw);
  // A still frame refreshes each minute for the clock and late live weather.
  const refresh = setInterval(() => still() && redraw(), 60_000);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    spent.add(canvas);
    lifetime.abort();
    cancelAnimationFrame(animation);
    clearInterval(refresh);
    reduced.removeEventListener("change", motionChanged);
    removeEventListener("resize", redraw);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    tilt.disable();
    renderer.release();
    closeArt(views);
    disown();
  }
  function fatal(error: unknown) {
    destroy();
    on.failure?.(error);
  }

  return {
    settings,
    views: views.map(({ name }) => name),
    get tiltSensing() {
      return tilt.sensing;
    },
    set(patch) {
      const shown = settings.view;
      for (const key of Object.keys(patch) as (keyof PondSettings)[]) {
        const range = RANGES[key], value = patch[key];
        (settings as Record<keyof PondSettings, unknown>)[key] = range
          ? Math.min(range.max, Math.max(range.min, value as number))
          : value;
      }
      if (settings.view !== shown) showView();
      if ("tilt" in patch && !settings.tilt) tilt.disable();
      if ("speed" in patch || "weatherMode" in patch) settle();
      redraw();
    },
    mood(name) {
      if (name === "real") write("weatherMode", "live");
      else {
        write("weatherMode", "manual");
        applyWeather(MOOD_WEATHER[name]);
      }
      settle();
      redraw();
    },
    scene() {
      const w = wallClock(simMs);
      const lit = (ms: number) => skyAt(ms, LAT, LON).moon.illuminatedFraction;
      const fraction = lit(simMs);
      return {
        time: reading(w),
        sky: skyOf(settings),
        wind: settings.wind,
        windFrom: settings.windFrom,
        moon: moonPhase(fraction, lit(simMs + 6 * HOUR_MS) > fraction),
        real: settings.weatherMode === "live" && SPEEDS[settings.speed] === null &&
          liveWeather.live,
      };
    },
    setClock(day, minutes) {
      setClock(day, minutes);
      settle();
      redraw();
    },
    preset(name) {
      applyPreset(name);
      redraw();
    },
    nextEclipse() {
      const note = showNextEclipse();
      redraw();
      return note;
    },
    strike: () => strikeNow = true,
    async tilt(on) {
      if (destroyed) return null;
      settings.tilt = on;
      if (!on) {
        tilt.disable();
        return "";
      }
      const problem = await tilt.enable();
      // Reset or a second tap can supersede an open permission prompt.
      if (!settings.tilt || destroyed) return null;
      if (problem) write("tilt", false);
      return problem;
    },
    reset(next) {
      Object.assign(settings, next);
      if (!settings.tilt) tilt.disable();
      lightning.clear();
      showView();
      redraw();
    },
    destroy,
  };
}
