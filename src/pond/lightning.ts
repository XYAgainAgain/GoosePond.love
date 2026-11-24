import type { StormCell } from "./clouds.ts";

/** Mirrors uBolt’s array length in render.ts. */
export const BOLT_POINTS = 32;
/** Stroke break, finite for the bolt segment test in render.ts. */
export const BOLT_BREAK = -1e4;
// Above the cloud base, so bolts overlap the tower.
const BASE_KM = 1.4;
/** Minimum s between wash starts (WCAG 2.3.1 flash limit). */
const WASH_GAP = 1.2;

type Point = [number, number, number];

interface Strike {
  /** Eye-relative km on [west, up, south]. */
  at: Point;
  r: number;
  /** World points in km, with NaN rows between strokes and null for in-cloud flashes. */
  bolt: Point[] | null;
}

export interface Flash {
  sky: number;
  /** Unit vector on [west, up, south]. */
  dir: [number, number, number];
  /** Angular radius, rad. */
  spread: number;
  patch: number;
  /** Strike position in km on [west, up, south], then brightness. Mirrors uFlash in clouds.ts. */
  cloud: [number, number, number, number];
  /** Art-pixel x/y pairs, empty without a visible bolt. */
  bolt: number[];
  glow: number;
}

/** Mirrors azAt in render.ts. */
export interface Projection {
  width: number;
  horizon: number;
  centerX: number;
  headAz: number;
  radPerPx: number;
}

const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

function channel(from: Point, to: Point, n: number, wander: number): Point[] {
  const out: Point[] = [];
  let dx = 0, dz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Keep fork origins attached to the parent channel.
    if (i > 0) {
      dx += (Math.random() - 0.5) * wander;
      dz += (Math.random() - 0.5) * wander;
    }
    const pull = 1 - t;
    out.push([
      from[0] + (to[0] - from[0]) * t + dx * pull,
      from[1] + (to[1] - from[1]) * t + (i > 0 ? (Math.random() - 0.5) * 0.03 : 0),
      from[2] + (to[2] - from[2]) * t + dz * pull,
    ]);
  }
  out[n - 1] = to;
  return out;
}

function bolt(cell: StormCell): Point[] {
  const a = Math.random() * 2 * Math.PI, r = Math.random() * cell.r * 0.4;
  const top: Point = [cell.x + Math.sin(a) * r, BASE_KM, cell.z + Math.cos(a) * r];
  const ground: Point = [
    top[0] + (Math.random() - 0.5) * 0.8,
    0,
    top[2] + (Math.random() - 0.5) * 0.8,
  ];
  const main = channel(top, ground, 20, 0.16);
  const out = [...main];
  for (let f = 0; f < 2; f++) {
    const at = main[3 + Math.floor(Math.random() * 8)];
    const end: Point = [
      at[0] + (Math.random() - 0.5) * 0.6,
      at[1] * 0.45,
      at[2] + (Math.random() - 0.5) * 0.6,
    ];
    out.push([NaN, NaN, NaN], ...channel(at, end, 5, 0.08));
  }
  return out.slice(0, BOLT_POINTS);
}

/** Stroke start times, s from onset. */
function strokes(ground: boolean) {
  const out = [0];
  const n = ground ? 2 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    out.push(out[i] + (ground ? 0.04 : 0.06) + Math.random() * (ground ? 0.05 : 0.1));
  }
  return out;
}

export class Lightning {
  private wait = 4;
  strikes = 0;
  private dt = 0;
  private since = 99;
  private strike: (Strike & { t: number; strokes: number[]; wash: boolean }) | null = null;

  static live(cells: StormCell[]) {
    return cells.filter((c) => c.p > 0.3 && c.p < 0.85 && c.top > 5);
  }

  clear() {
    this.strike = null;
  }

  update(dt: number, cells: StormCell[], force: boolean) {
    this.since += dt;
    this.dt = dt;
    if (this.strike) this.strike.t += dt;
    const live = Lightning.live(cells);
    this.wait -= dt;
    const busy = this.strike !== null &&
      this.strike.t < this.strike.strokes[this.strike.strokes.length - 1] + 0.2;
    if (busy || (!force && (live.length === 0 || this.wait > 0))) return;
    const pool = live.length > 0 ? live : force ? cells : [];
    const weight = pool.map((c) => 1 / (400 + c.x * c.x + c.z * c.z));
    let pick = Math.random() * weight.reduce((a, b) => a + b, 0);
    const cell = pool.find((_, i) => (pick -= weight[i]) <= 0) ?? null;
    if (!cell) return;
    this.wait = Math.random() < 0.3
      ? 0.3 + Math.random() * 0.9
      : (6 + Math.random() * 14) / Math.sqrt(Math.max(1, live.length));
    const wash = this.since >= WASH_GAP;
    if (wash) this.since = 0;
    const ground = Math.hypot(cell.x, cell.z) < 35 && Math.random() < 0.25;
    this.strikes++;
    this.strike = {
      at: [
        cell.x + (Math.random() - 0.5) * cell.r * 1.4,
        Math.min(cell.top * 0.7, 3 + Math.random() * cell.top * 0.5),
        cell.z + (Math.random() - 0.5) * cell.r * 1.4,
      ],
      r: cell.r,
      bolt: ground ? bolt(cell) : null,
      t: 0,
      strokes: strokes(ground),
      wash,
    };
  }

  frame(p: Projection): Flash {
    const s = this.strike;
    const none: Flash = {
      sky: 0,
      dir: [0, 0, 1],
      spread: 1,
      patch: 0,
      cloud: [0, 0, 0, 0],
      bolt: [],
      glow: 0,
    };
    if (!s) return none;
    const t = s.t, last = s.strokes[s.strokes.length - 1];
    // Show short return strokes at peak on the first frame that samples them.
    const pulse = (at: number, decay: number) =>
      t < at ? 0 : t - at < this.dt ? 1 : decay ** (t - at);
    let stroke = t <= last + 0.12 ? 0.15 : 0;
    for (const at of s.strokes) stroke = Math.max(stroke, pulse(at, Math.exp(-20)));
    const wash = s.wash ? Math.max(0.9 * pulse(0, 2 ** -9), 0.6 * pulse(0.09, 2 ** -9)) : 0;
    if (stroke < 0.01 && wash < 0.01) return none;
    const dist = Math.hypot(s.at[0], s.at[2]), range = Math.hypot(dist, s.at[1]);
    const sky = wash * Math.min(1, Math.max(0.06, 12 / dist));
    // Distance shrinks the lit cloud, as in clouds.ts.
    const spread = Math.atan2(Math.max(2, s.r) * 1.3, dist);
    // Restrict large patches to the gated wash.
    const wide = Math.min(1, Math.max(0, 16 * spread / (p.width * p.radPerPx) - 1));
    // clouds.ts gates tower glow the same way.
    const flicker = stroke * (1 - wide);
    const patch = Math.max(wash, flicker) * Math.exp(-dist / 56);
    const px: number[] = [];
    if (s.bolt && stroke > 0.1) {
      // Unwrap across branch breaks to keep the bolt continuous at the panorama seam.
      let prev = NaN, rel = 0;
      for (const [x, y, z] of s.bolt) {
        if (Number.isNaN(x)) {
          px.push(BOLT_BREAK, BOLT_BREAK);
          continue;
        }
        const az = Math.atan2(x, z);
        rel = Number.isNaN(prev) ? wrapPi(az - p.headAz) : rel + wrapPi(az - prev);
        prev = az;
        px.push(
          p.centerX + rel / p.radPerPx,
          p.horizon - Math.atan2(y, Math.hypot(x, z)) / p.radPerPx,
        );
      }
      // An off-center band can put the visible bolt a full turn from the heading.
      const turn = 2 * Math.PI / p.radPerPx, x0 = px[0];
      const shift = x0 < 0 && x0 + turn <= p.width
        ? turn
        : x0 > p.width && x0 - turn >= 0
        ? -turn
        : 0;
      if (shift) {
        for (let i = 0; i < px.length; i += 2) if (px[i] !== BOLT_BREAK) px[i] += shift;
      }
    }
    return {
      sky,
      dir: [s.at[0] / range, s.at[1] / range, s.at[2] / range],
      spread,
      patch,
      cloud: [...s.at, Math.max(0.8 * flicker, wash * (0.6 + 0.4 * stroke))],
      bolt: px,
      glow: 1.4 * stroke,
    };
  }
}
