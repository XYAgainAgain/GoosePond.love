import { type Ephemeris, jdFromMs, skyAt } from "./ephemeris.ts";
import { hash } from "./util.ts";

const DEG = Math.PI / 180;
const AU = 149597870.7, EARTH_KM = 6378.137, MOON_KM = 1737.4, SUN_KM = 696000;
const DAY = 86_400_000, HOUR = DAY / 24;
// Meeus, Astronomical Algorithms ch. 49: mean new moon epoch (JDE) and synodic month.
const MONTH = 29.530588853 * DAY;
const FULL = (2451550.09765 - 2440587.5) * DAY + MONTH / 2;
const WINDOW = 2 * DAY;
const FLATTENING = 0.99664719;
// NASA Five Millennium Canon shadow convention: Danjon's enlargement of Earth's parallax.
const ENLARGE = 1.01;
// Annual aberration constant, arcsec at 1 AU.
const ABERRATION = 20.49 / 3600 * DEG;
// July 2027 graze (NASA catalog 09711), lunar radii: twice the residual of its peak penumbral magnitude.
const GRAZING_LUNATION = 340, GRAZING_OFFSET = 0.0044;
const FLOOR = 1e-4, ANNULI = 48, TOLERANCE_MS = 250;
// Geometric altitude in °: the viewing moment prefers the moon at least this high.
const VIEW_ALTITUDE = 5;
// Room inside the visible stretch for the fastest clock's first ticks after a jump.
const VIEW_MARGIN_MS = 2 * 60_000;

/** Degrees, north and east positive. */
export interface Site {
  lat: number;
  lon: number;
}
export type EclipseType = "Penumbral" | "Partial" | "Total";
/** Scene ms, start before end. */
export type Interval = readonly [number, number];

export interface EclipseSample {
  lunation: number;
  /** Shadow center from the moon's center on the disc's right and top axes, lunar radii. */
  centerRight: number;
  centerUp: number;
  /** Geocentric, lunar radii; also the length of the center offset. */
  separation: number;
  umbraRadius: number;
  penumbraRadius: number;
  umbralMagnitude: number;
  penumbralMagnitude: number;
  umbraFraction: number;
  /** Moonlight relative to the uneclipsed moon, 1e-4 to 1. */
  irradiance: number;
}

export interface EclipseEvent {
  lunation: number;
  peak: number;
  type: EclipseType;
  umbralMagnitude: number;
  penumbralMagnitude: number;
  penumbra: Interval;
  umbra: Interval | null;
  totality: Interval | null;
  /** Geometric topocentric altitude of the moon's center at peak, degrees. */
  peakAltitude: number;
  /** Stretches with the moon's center above the horizon, in order; null when there are none. */
  visibleUmbra: readonly Interval[] | null;
  visibleTotality: readonly Interval[] | null;
  /** The best moment to watch the visible umbra, as viewing() picks it; null when none of it is visible. */
  viewingPeak: number | null;
}

export interface EclipseLook {
  /** Continuous Danjon brightness, 0 (darkest) to 4 (bright copper). */
  danjon: number;
  edgeSoftness: number;
  core: [number, number, number];
  rim: [number, number, number];
}

export const createEclipseSample = (): EclipseSample => ({
  lunation: 0,
  centerRight: 0,
  centerUp: 0,
  separation: 0,
  umbraRadius: 0,
  penumbraRadius: 0,
  umbralMagnitude: 0,
  penumbralMagnitude: 0,
  umbraFraction: 0,
  irradiance: 1,
});

export const lunationAt = (ms: number) => Math.round((ms - FULL) / MONTH);
export const meanFullMoon = (lunation: number) => FULL + lunation * MONTH;

// Wider than any eclipse season, so it only skips work.
function nearNode(ms: number): boolean {
  const t = (jdFromMs(ms) - 2451545) / 36525;
  const f = 93.272095 + 483202.0175233 * t - .0036539 * t * t;
  return Math.abs(Math.sin(f * DEG)) < .5;
}

const G = { ox: 0, oy: 0, oz: 0, distance: 0, d: 0, u: 0, p: 0, um: 0, pm: 0 };

// The ephemeris is topocentric; adding the observer back makes both bodies geocentric, in the local frame.
function shadow(eph: Ephemeris, latDeg: number, ms: number, lunation: number) {
  const lat = latDeg * DEG, sl = Math.sin(lat), cl = Math.cos(lat);
  const r = Math.atan(FLATTENING * Math.tan(lat)), cr = Math.cos(r), zr = FLATTENING * Math.sin(r);
  const obsUp = EARTH_KM * (cr * cl + zr * sl), obsSouth = EARTH_KM * (cr * sl - zr * cl);
  const m = eph.moon.direction, s = eph.sun.direction;
  const mk = eph.moon.distance * AU, sk = eph.sun.distance * AU;
  const mx = m[0] * mk, my = m[1] * mk + obsUp, mz = m[2] * mk + obsSouth;
  const sx = s[0] * sk, sy = s[1] * sk + obsUp, sz = s[2] * sk + obsSouth;
  const dm = Math.sqrt(mx * mx + my * my + mz * mz), ds = Math.sqrt(sx * sx + sy * sy + sz * sz);
  let ax = -sx / ds, ay = -sy / ds, az = -sz / ds;
  // The anti-Sun axis turns back along the ecliptic by Earth's motion during the light's trip.
  const t = (jdFromMs(ms) - 2451545) / 36525;
  const eps = (23.439291111 - .013004167 * t) * DEG, se = Math.sin(eps), ce = Math.cos(eps);
  const lst = eph.localSiderealTime, sL = Math.sin(lst), cL = Math.cos(lst);
  const px = cL * se, py = -cl * sL * se + sl * ce, pz = -sl * sL * se - cl * ce;
  // West/up/south is left-handed, so a negative ecliptic rotation adds pole × axis.
  const k = ABERRATION / (ds / AU);
  const bx = ax + k * (py * az - pz * ay),
    by = ay + k * (pz * ax - px * az),
    bz = az + k * (px * ay - py * ax);
  const bn = Math.sqrt(bx * bx + by * by + bz * bz);
  ax = bx / bn, ay = by / bn, az = bz / bn;
  const along = ax * mx + ay * my + az * mz;
  const ox = ax * along - mx, oy = ay * along - my, oz = az * along - mz;
  const axisKm = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const moonR = Math.asin(MOON_KM / dm);
  const base = ENLARGE * Math.asin(EARTH_KM / dm) + Math.asin(EARTH_KM / ds),
    sunR = Math.asin(SUN_KM / ds);
  const correction = lunation === GRAZING_LUNATION ? GRAZING_OFFSET : 0;
  G.ox = ox, G.oy = oy, G.oz = oz;
  G.d = Math.atan2(axisKm, along) / moonR + correction;
  G.distance = axisKm + correction * MOON_KM;
  G.u = (base - sunR) / moonR;
  G.p = (base + sunR) / moonR;
  G.um = (1 + G.u - G.d) / 2;
  G.pm = (1 + G.p - G.d) / 2;
}

/** Share of a unit disc covered by a circle of radius r whose center is d away. */
export function umbraCoverage(d: number, r: number): number {
  if (d >= 1 + r) return 0;
  if (d <= Math.abs(1 - r)) return Math.min(1, r * r);
  const a = (d * d + 1 - r * r) / (2 * d);
  const b = (d - a) / r;
  const area = Math.acos(Math.max(-1, Math.min(1, a))) +
    r * r * Math.acos(Math.max(-1, Math.min(1, b))) -
    d * Math.sqrt(Math.max(0, 1 - a * a));
  return Math.max(0, Math.min(1, area / Math.PI));
}

// Penumbral transmission rises as a cubic smoothstep from the umbra's edge, integrated in exact disc annuli.
export function irradiance(d: number, u: number, p: number): number {
  if (d + 1 <= u) return FLOOR;
  let sum = 0, inner = umbraCoverage(d, u);
  for (let i = 0; i < ANNULI; i++) {
    const outer = umbraCoverage(d, u + (p - u) * (i + 1) / ANNULI), x = (i + .5) / ANNULI;
    sum += (outer - inner) * x * x * (3 - 2 * x);
    inner = outer;
  }
  return Math.max(FLOOR, Math.min(1, FLOOR + (1 - FLOOR) * (sum + 1 - inner)));
}

/** Null outside the penumbra; fills `out` without allocating. `eph` must be skyAt() for this ms and site. */
export function eclipseAt(
  ms: number,
  site: Site,
  out: EclipseSample,
  eph?: Ephemeris,
  gates = true,
): EclipseSample | null {
  const lunation = lunationAt(ms);
  if (gates && (Math.abs(ms - meanFullMoon(lunation)) > WINDOW || !nearNode(ms))) return null;
  const e = eph ?? skyAt(ms, site.lat, site.lon);
  const m = e.moon.direction, s = e.sun.direction;
  if (gates && m[0] * s[0] + m[1] * s[1] + m[2] * s[2] > -.998) return null;
  shadow(e, site.lat, ms, lunation);
  if (G.pm <= 0) return null;
  // Mirrors the moon disc axes in sky.ts lightFor().
  const h = Math.max(1e-4, Math.sqrt(m[2] * m[2] + m[0] * m[0]));
  const rx = m[2] / h, rz = -m[0] / h;
  const x = G.ox * rx + G.oz * rz;
  const y = G.ox * (m[1] * rz) + G.oy * (m[2] * rx - m[0] * rz) - G.oz * (m[1] * rx);
  const len = Math.sqrt(x * x + y * y), k = len > 0 ? G.d / len : 0;
  out.lunation = lunation;
  out.centerRight = k * x;
  out.centerUp = k * y;
  out.separation = G.d;
  out.umbraRadius = G.u;
  out.penumbraRadius = G.p;
  out.umbralMagnitude = G.um;
  out.penumbralMagnitude = G.pm;
  out.umbraFraction = umbraCoverage(G.d, G.u);
  out.irradiance = irradiance(G.d, G.u, G.p);
  return out;
}

/** Yields after each sky evaluation, about 55 µs. */
export type Work<T> = Generator<void, T, void>;

export function finish<T>(work: Work<T>): T {
  for (;;) {
    const r = work.next();
    if (r.done) return r.value;
  }
}

// Callers read G inside f, before the yield, so interleaved work never sees another's geometry.
function* minimum(a: number, b: number, f: (ms: number) => number): Work<number> {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let x = b - ratio * (b - a), y = a + ratio * (b - a), fx = f(x);
  yield;
  let fy = f(y);
  yield;
  while (b - a > TOLERANCE_MS) {
    if (fx < fy) {
      b = y, y = x, fy = fx;
      x = b - ratio * (b - a);
      fx = f(x);
    } else {
      a = x, x = y, fx = fy;
      y = a + ratio * (b - a);
      fy = f(y);
    }
    yield;
  }
  return (a + b) / 2;
}

function* boundary(
  cold: number,
  hot: number,
  inside: (ms: number) => boolean,
  keepInside = false,
): Work<number> {
  while (Math.abs(cold - hot) > TOLERANCE_MS) {
    const mid = (cold + hot) / 2;
    if (inside(mid)) hot = mid;
    else cold = mid;
    yield;
  }
  return keepInside ? hot : (hot + cold) / 2;
}

// Maximizing the margin first catches a graze too brief for any fixed sampling step.
function* contacts(peak: number, margin: (ms: number) => number): Work<Interval | null> {
  const deepest = yield* minimum(peak - HOUR, peak + HOUR, (ms) => -margin(ms));
  if (margin(deepest) <= 0) return null;
  yield;
  const inside = (ms: number) => margin(ms) > 0;
  const start = yield* boundary(peak - 5 * HOUR, deepest, inside);
  return [start, yield* boundary(peak + 5 * HOUR, deepest, inside)];
}

// Away from the poles the altitude turns at most once in a phase, so the pieces between turns are monotonic.
function* visible(
  phase: Interval | null,
  altitude: (ms: number) => number,
): Work<Interval[] | null> {
  if (!phase) return null;
  const [a, b] = phase, inside = (ms: number) => altitude(ms) > 0;
  const cuts = [a];
  for (const sign of [1, -1]) {
    const turn = yield* minimum(a, b, (ms) => sign * altitude(ms));
    if (turn - a > TOLERANCE_MS && b - turn > TOLERANCE_MS) cuts.push(turn);
  }
  cuts.sort((x, y) => x - y).push(b);
  const out: Interval[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const x = cuts[i], y = cuts[i + 1], upX = inside(x), upY = inside(y);
    yield;
    if (!upX && !upY) continue;
    const start = upX ? x : yield* boundary(x, y, inside, true),
      end = upY ? y : yield* boundary(y, x, inside, true);
    const last = out.at(-1);
    if (last && last[1] === start) out[out.length - 1] = [last[0], end];
    else out.push([start, end]);
  }
  return out.length ? out : null;
}

function clip(phase: Interval | null, up: readonly Interval[] | null): Interval[] | null {
  if (!phase || !up) return null;
  const out: Interval[] = [];
  for (const [s, e] of up) {
    const start = Math.max(s, phase[0]), end = Math.min(e, phase[1]);
    if (start < end) out.push([start, end]);
  }
  return out.length ? out : null;
}

// Deepest shadow with the moon at VIEW_ALTITUDE or higher, else its highest point.
function* viewing(
  peak: number,
  umbra: Interval,
  up: readonly Interval[],
  altitude: (ms: number) => number,
  at: (ms: number) => Ephemeris,
): Work<number> {
  let best = peak;
  if (altitude(peak) < VIEW_ALTITUDE) {
    const high = yield* visible(umbra, (ms) => altitude(ms) - VIEW_ALTITUDE);
    if (high) {
      // Separation is unimodal around the peak, so each stretch's deepest moment is the peak clamped into it.
      let closest = Infinity;
      for (const [s, e] of high) {
        const t = Math.max(s, Math.min(e, peak));
        at(t);
        if (G.distance < closest) closest = G.distance, best = t;
      }
    } else {
      let top = -Infinity;
      for (const [s, e] of up) {
        const turn = yield* minimum(s, e, (ms) => -altitude(ms));
        for (const t of [s, turn, e]) {
          const a = altitude(t);
          if (a > top) top = a, best = t;
        }
      }
    }
  }
  const [s, e] = up.find(([s, e]) => best >= s && best <= e)!;
  return e - s < 2 * VIEW_MARGIN_MS
    ? (s + e) / 2
    : Math.max(s + VIEW_MARGIN_MS, Math.min(e - VIEW_MARGIN_MS, best));
}

const shadowAt = (lunation: number, site: Site) => (ms: number) => {
  const eph = skyAt(ms, site.lat, site.lon);
  shadow(eph, site.lat, ms, lunation);
  return eph;
};

const peakOf = (lunation: number, at: (ms: number) => Ephemeris) => {
  const mean = meanFullMoon(lunation);
  return minimum(mean - WINDOW, mean + WINDOW, (ms) => (at(ms), G.distance));
};

/** The umbral magnitude at greatest eclipse; no contacts or visibility. */
export function* peakMagnitudeWork(lunation: number, site: Site): Work<number> {
  const at = shadowAt(lunation, site), peak = yield* peakOf(lunation, at);
  at(peak);
  return G.um;
}

export function* eventWork(lunation: number, site: Site, gates = true): Work<EclipseEvent | null> {
  if (gates && !nearNode(meanFullMoon(lunation))) return null;
  const at = shadowAt(lunation, site);
  const peak = yield* peakOf(lunation, at);
  const penumbra = yield* contacts(peak, (ms) => (at(ms), G.pm));
  if (!penumbra) return null;
  const umbra = yield* contacts(peak, (ms) => (at(ms), G.um));
  const totality = umbra && (yield* contacts(peak, (ms) => (at(ms), G.um - 1)));
  const altitude = (ms: number) => Math.asin(skyAt(ms, site.lat, site.lon).moon.direction[1]) / DEG;
  const visibleUmbra = yield* visible(umbra, altitude),
    visibleTotality = clip(totality, visibleUmbra);
  const viewingPeak = visibleUmbra && (yield* viewing(peak, umbra!, visibleUmbra, altitude, at));
  const peakAltitude = Math.asin(at(peak).moon.direction[1]) / DEG;
  return {
    lunation,
    peak,
    type: totality ? "Total" : umbra ? "Partial" : "Penumbral",
    umbralMagnitude: G.um,
    penumbralMagnitude: G.pm,
    penumbra,
    umbra,
    totality,
    peakAltitude,
    visibleUmbra,
    visibleTotality,
    viewingPeak,
  };
}

/** The first event whose peak, or with `visibleOnly` whose viewing peak, lies strictly between `after` and `end`. */
export const nextEclipse = (
  after: number,
  end: number,
  site: Site,
  visibleOnly = false,
  gates = true,
) => finish(nextWork(after, end, site, visibleOnly, gates));

export function* nextWork(
  after: number,
  end: number,
  site: Site,
  visibleOnly = false,
  gates = true,
): Work<EclipseEvent | null> {
  for (let k = lunationAt(after - WINDOW); meanFullMoon(k) - WINDOW < end; k++) {
    const event = yield* eventWork(k, site, gates);
    const at = visibleOnly ? event?.viewingPeak ?? null : event?.peak ?? null;
    if (at !== null && at > after && at < end) return event;
  }
  return null;
}

/** Same lunation, magnitude, and seed give the same look on every page. */
export function appearance(
  event: Pick<EclipseEvent, "lunation" | "umbralMagnitude">,
  seed: number,
): EclipseLook {
  const dust = hash(event.lunation, seed);
  const depth = Math.max(0, Math.min(1, (event.umbralMagnitude - 1) / .85));
  const danjon = Math.max(0, Math.min(4, 4 - 1.8 * depth - 2.3 * dust));
  const warmth = danjon / 4;
  return {
    danjon,
    edgeSoftness: .08,
    core: [.008 + .12 * warmth, .006 + .029 * warmth, .006 + .009 * warmth],
    rim: [.022 + .27 * warmth, .012 + .12 * warmth, .009 + .05 * warmth],
  };
}
