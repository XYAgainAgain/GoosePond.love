// Ported from KELPII's starfield.ts.
import type { PlanetName, PlanetPosition } from "./sky/ephemeris.ts";
import { apparentDeg } from "./sky/sky.ts";
import { bvToRgb, DEG, type MilkyWayMap, sampleMilkyWay, type StarCatalog } from "./sky/stars.ts";

/** Angles in radians, azimuth from south toward west. Coordinates are art pixels from top left. */
export interface PixelProjection {
  width: number;
  /** Includes the horizon row. */
  horizon: number;
  centerX: number;
  headAz: number;
  radPerPx: number;
}

export interface StarfieldInput {
  equToLocal: ArrayLike<number>;
  yearsSinceJ2000: number;
  projection: PixelProjection;
  planets: Record<PlanetName, PlanetPosition>;
  /** Geometric altitude in degrees. */
  sunAltitude: number;
  /** Moonlight relative to a full moon overhead. */
  moonlight: number;
}

export const PLANET_ORDER: readonly PlanetName[] = [
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
];
export const PLANET_COLORS = [
  0.9,
  0.85,
  0.76,
  1,
  0.96,
  0.8,
  1,
  0.42,
  0.22,
  1,
  0.87,
  0.67,
  1,
  0.8,
  0.48,
];
const PM_RAD = DEG / 3_600_000;
// Finer pixels than KELPII's glyph cells need more samples to reach DUST_FILL.
const DUST_SAMPLES = 131072;

const DUST_FILL = 0.2;
// Floor the cosine to bound the rank scan near zenith.
const DUST_COS_FLOOR = 0.05;
const PALETTE_SIZE = 16;
export const STAR_PALETTE = new Float32Array(PALETTE_SIZE * 3);
for (let i = 0; i < PALETTE_SIZE; i++) {
  STAR_PALETTE.set(bvToRgb(-0.4 + i * 2.4 / (PALETTE_SIZE - 1)), i * 3);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// lowbias32 avoids runs from KELPII's hash at one pixel per point.
const hash = (i: number) => {
  let h = i + 1;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const wrapPi = (a: number) =>
  ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** Atmospheric extinction in magnitudes. */
export const extinction = (up: number) => 0.18 * (1 / (Math.max(0, up) + 0.025) - 1);

export function starLimit(sunAltitude: number, moonlight: number): number {
  return 6.05 - 9 * smooth(-18, -3, sunAltitude) - 2.7 * clamp(moonlight, 0, 1);
}

/** Returns −1 off the sky. xy is valid only when a pixel index is returned. */
export function projectPixel(
  west: number,
  up: number,
  south: number,
  p: PixelProjection,
  xy?: Float64Array,
): number {
  if (up < Math.sin(-1.5 * DEG)) return -1;
  const app = apparentDeg(Math.asin(clamp(up, -1, 1)) / DEG);
  if (app <= 0) return -1;
  let x = p.centerX + wrapPi(Math.atan2(west, south) - p.headAz) / p.radPerPx;
  // A full-turn view centered off-screen can extend past ±180° on one side.
  if (x < 0) x += 2 * Math.PI / p.radPerPx;
  else if (x >= p.width) x -= 2 * Math.PI / p.radPerPx;
  x = Math.floor(x);
  const y = p.horizon - 1 - Math.floor(app * DEG / p.radPerPx);
  if (xy) {
    xy[0] = x;
    xy[1] = y;
  }
  return x >= 0 && x < p.width && y >= 0 ? y * p.width + x : -1;
}

/** RGBA8UI from top row: tier (1 dust, 2–6 stars), B−V palette index, intensity, and twinkle identity. */
export class Starfield {
  cells = new Uint8Array(4);
  width = 1;
  rows = 1;
  revision = 0;
  visible = 0;
  limit = 0;
  /** Four floats per planet: x, y, strength, and tier (0–2). Off-sky x is −10000. */
  readonly planets = new Float32Array(20);
  /** Upload with transpose=false to read row-major equToLocal as column-major local-to-J2000. */
  readonly localToJ2000 = new Float32Array(9);
  milkyVisibility = 1;
  private touched = new Uint32Array(1);
  private used = 0;
  private readonly direction: Float64Array;
  private readonly velocity: Float64Array;
  private readonly color: Uint8Array;
  private readonly dust: Float64Array;
  private readonly dustBrightness: Float32Array;
  private readonly dustRank: Float32Array;
  private readonly xy = new Float64Array(2);

  constructor(readonly catalog: StarCatalog, map: MilkyWayMap) {
    this.direction = new Float64Array(catalog.count * 3);
    this.velocity = new Float64Array(catalog.count * 3);
    this.color = new Uint8Array(catalog.count);
    for (let i = 0; i < catalog.count; i++) {
      const a = catalog.raDeg[i] * DEG, d = catalog.decDeg[i] * DEG;
      const sa = Math.sin(a), ca = Math.cos(a), sd = Math.sin(d), cd = Math.cos(d);
      const mr = catalog.pmRa[i] * PM_RAD, md = catalog.pmDec[i] * PM_RAD, j = i * 3;
      this.direction[j] = cd * ca;
      this.direction[j + 1] = cd * sa;
      this.direction[j + 2] = sd;
      this.velocity[j] = -mr * sa - md * sd * ca;
      this.velocity[j + 1] = mr * ca - md * sd * sa;
      this.velocity[j + 2] = md * cd;
      this.color[i] = Math.round(clamp((catalog.bv[i] + 0.4) / 2.4, 0, 1) * (PALETTE_SIZE - 1));
    }
    // Sample random sky positions to avoid screen-space crawl and lattice rows.
    const points: { x: number; y: number; z: number; b: number; rank: number }[] = [];
    for (let i = 0; i < DUST_SAMPLES; i++) {
      const z = 1 - 2 * hash(3 * i), a = 2 * Math.PI * hash(3 * i + 1);
      const r = Math.sqrt(1 - z * z), x = r * Math.cos(a), y = r * Math.sin(a);
      const b = sampleMilkyWay(map, x, y, z);
      if (b > 0.04) points.push({ x, y, z, b, rank: hash(3 * i + 2) / (b * b) });
    }
    // Rank order makes a density cut a prefix.
    points.sort((a, b) => a.rank - b.rank);
    this.dust = new Float64Array(points.length * 3);
    this.dustBrightness = new Float32Array(points.length);
    this.dustRank = new Float32Array(points.length);
    points.forEach((d, i) => {
      this.dust.set([d.x, d.y, d.z], i * 3);
      this.dustBrightness[i] = d.b;
      this.dustRank[i] = d.rank;
    });
  }

  get dustCount(): number {
    return this.dustBrightness.length;
  }

  private write(cell: number, tier: number, color: number, intensity: number, identity: number) {
    const o = cell * 4;
    if (this.cells[o] > tier || (this.cells[o] === tier && this.cells[o + 2] >= intensity)) return;
    if (!this.cells[o]) this.touched[this.used++] = cell;
    this.cells[o] = tier;
    this.cells[o + 1] = color;
    this.cells[o + 2] = intensity;
    this.cells[o + 3] = identity;
  }

  update(input: StarfieldInput): void {
    const p = input.projection, m = input.equToLocal;
    if (
      !Number.isInteger(p.width) || !Number.isInteger(p.horizon) || p.width < 1 || p.horizon < 1 ||
      !(p.radPerPx > 0)
    ) {
      throw new RangeError("Invalid starfield projection");
    }
    if (this.width !== p.width || this.rows !== p.horizon) {
      this.width = p.width;
      this.rows = p.horizon;
      this.cells = new Uint8Array(p.width * p.horizon * 4);
      this.touched = new Uint32Array(p.width * p.horizon);
    } else {
      for (let i = 0; i < this.used; i++) {
        this.cells.fill(0, this.touched[i] * 4, this.touched[i] * 4 + 4);
      }
    }
    this.used = 0;
    for (let i = 0; i < 9; i++) this.localToJ2000[i] = m[i];
    const limit = this.limit = starLimit(input.sunAltitude, input.moonlight);
    this.milkyVisibility = (1 - smooth(-18, -9, input.sunAltitude)) *
      (1 - 0.94 * Math.sqrt(clamp(input.moonlight, 0, 1)));
    const years = input.yearsSinceJ2000;
    let stars = 0;
    for (let k = 0; k < this.catalog.count; k++) {
      if (this.catalog.mag[k] > limit) continue;
      const j = k * 3;
      const x = this.direction[j] + years * this.velocity[j];
      const y = this.direction[j + 1] + years * this.velocity[j + 1];
      const z = this.direction[j + 2] + years * this.velocity[j + 2];
      const n = 1 / Math.sqrt(x * x + y * y + z * z);
      const up = (m[3] * x + m[4] * y + m[5] * z) * n;
      if (up < 0) continue;
      const cell = projectPixel(
        (m[0] * x + m[1] * y + m[2] * z) * n,
        up,
        (m[6] * x + m[7] * y + m[8] * z) * n,
        p,
      );
      if (cell < 0) continue;
      const mag = this.catalog.mag[k] + extinction(up);
      if (mag > limit + 0.25) continue;
      const fade = 1 - smooth(limit - 0.4, limit + 0.25, mag);
      const tier = mag < 0 ? 6 : mag < 1.4 ? 5 : mag < 2.8 ? 4 : mag < 4.2 ? 3 : 2;
      const intensity = Math.round(255 * fade * clamp(0.95 - mag * 0.115, 0.12, 1));
      if (intensity === 0) continue;
      this.write(cell, tier, this.color[k], intensity, this.catalog.hr[k] & 255);
      stars++;
    }
    if (this.milkyVisibility >= 0.002) {
      // Pixel solid angle scales with cos(elevation).
      const perPixel = (DUST_SAMPLES / (4 * Math.PI)) * p.radPerPx * p.radPerPx;
      const widest = DUST_FILL / (perPixel * DUST_COS_FLOOR);
      for (let k = 0; k < this.dustCount && this.dustRank[k] < widest; k++) {
        const j = k * 3, x = this.dust[j], y = this.dust[j + 1], z = this.dust[j + 2];
        const up = m[3] * x + m[4] * y + m[5] * z;
        if (up < 0) continue;
        const cosEl = Math.max(DUST_COS_FLOOR, Math.sqrt(Math.max(0, 1 - up * up)));
        if (this.dustRank[k] >= DUST_FILL / (perPixel * cosEl)) continue;
        const cell = projectPixel(
          m[0] * x + m[1] * y + m[2] * z,
          up,
          m[6] * x + m[7] * y + m[8] * z,
          p,
        );
        if (cell < 0) continue;
        const intensity = Math.round(
          255 * this.dustBrightness[k] * Math.exp(-0.7 * extinction(up)),
        );
        if (intensity > 0) this.write(cell, 1, 7, intensity, (k * 73) & 255);
      }
    }
    for (let i = 0; i < PLANET_ORDER.length; i++) {
      const body = input.planets[PLANET_ORDER[i]], d = body.direction, j = i * 4;
      const cell = projectPixel(d[0], d[1], d[2], p, this.xy);
      this.planets[j] = cell < 0 ? -10000 : this.xy[0];
      this.planets[j + 1] = cell < 0 ? -10000 : this.xy[1];
      const mag = body.magnitude + extinction(d[1]);
      this.planets[j + 2] = clamp(1.25 - mag * 0.18, 0.2, 2.2) *
        (1 - smooth(limit, limit + 1, mag));
      this.planets[j + 3] = mag < -2 ? 2 : mag < 0 ? 1 : 0;
    }
    this.visible = stars;
    this.revision++;
  }
}
