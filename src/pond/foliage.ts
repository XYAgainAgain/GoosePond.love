import { hash, sstep, TWO_PI } from "./sky/util.ts";
import type { Frame } from "./render.ts";

export const WIND_WRAP_M = 20 * 256;
const GUST_CELLS = 128, GUST_M = WIND_WRAP_M / GUST_CELLS;
const MAX_STEP = 3;

// Fixed ticks keep motion the same at any frame rate.
const TICK_S = 0.05;
const MAX_TICKS = 10;
const HISTORY = 16;
// Spring: angular frequency (rad/s), its smooth spread across x, and damping ratio.
const SPRING_OMEGA = 4.2, SPRING_SPREAD = 0.2, SPRING_DAMPING = 0.28;
const GUST_PUSH = 0.45;
// Ticks of delay per px below the top of a swaying run; MAX_LAG stays below HISTORY.
const LAG_PER_PX = 0.45, MAX_LAG = 12;
// Warp: noise feature size (px), strength, and drift (px/s at full crosswind).
const WARP_CELL = 9, WARP_AMP = 0.55, WARP_DRIFT = 7, WARP_RISE = 0.6;
const WARP_SIZE = 64;
// Rustle: share of 2×2 clumps flicking at full strength, flick length and cycle in ticks.
const RUSTLE_SHARE = 0.4, RUSTLE_TICKS = 2, RUSTLE_PERIOD = 29, RUSTLE_MIN_WEIGHT = 0.3;
// Unmasked foreground: sway weight for every pixel, step cap in px.
const TRUNK_SWAY = 1.2, TRUNK_LIMIT = 2;

const WARP = new Float32Array(WARP_SIZE * WARP_SIZE);
{
  // The lattice wraps at the table size, so the table scrolls seamlessly.
  const lattice = (u: number, v: number, period: number, seed: number) => {
    const h = (a: number, b: number) => hash((a % period) + seed, b % period);
    const iu = Math.floor(u), iv = Math.floor(v);
    const fu = sstep(0, 1, u - iu), fv = sstep(0, 1, v - iv);
    const top = h(iu, iv) * (1 - fu) + h(iu + 1, iv) * fu;
    const bottom = h(iu, iv + 1) * (1 - fu) + h(iu + 1, iv + 1) * fu;
    return top * (1 - fv) + bottom * fv;
  };
  const cells = Math.round(WARP_SIZE / WARP_CELL), scale = cells / WARP_SIZE;
  for (let y = 0; y < WARP_SIZE; y++) {
    for (let x = 0; x < WARP_SIZE; x++) {
      const n = 0.7 * lattice(x * scale, y * scale, cells, 401) +
        0.3 * lattice(x * scale * 2, y * scale * 2, cells * 2, 433);
      WARP[y * WARP_SIZE + x] = n * 2 - 1;
    }
  }
}

export const sourceGlsl = (name: string, sampler: string, rows: string) => `
uniform highp isampler2D ${sampler};
uniform ivec2 ${rows};
ivec2 ${name}(ivec2 lp){
  if(lp.y>=${rows}.x&&lp.y<${rows}.y&&lp.x>=0&&lp.x<int(uLandSize.x))
    lp.x-=texelFetch(${sampler},lp,0).r;
  return lp;
}
`;
// Sway mirrors with the land (mirrorX in clouds.ts), flipped to keep the wind's direction.
const SOURCE_GLSL = `
uniform highp isampler2D uFoliage;
uniform ivec2 uFoliageRows;
ivec2 foliageSource(ivec2 lp){
  int w=int(uLandSize.x), x=mirrorX(lp.x), m=lp.x%(2*w);
  if(lp.y>=uFoliageRows.x&&lp.y<uFoliageRows.y){
    int off=texelFetch(uFoliage,ivec2(x,lp.y),0).r;
    x+=(m<0?m+2*w:m)<w?-off:off;
  }
  return ivec2(x,lp.y);
}
`;

export function withFoliage(depth: string) {
  return depth
    .replace("LandSample landSample(vec2 q){", SOURCE_GLSL + "LandSample landSample(vec2 q){")
    .replace(
      "ivec2 lp=ivec2(target-floor(shift/uShoreZ+.5));",
      "ivec2 lp=foliageSource(ivec2(target-floor(shift/uShoreZ+.5)));",
    )
    .replace(
      "vec4 rgba=landTexel(ivec2(source));",
      "ivec2 lp=foliageSource(ivec2(source));\n    vec4 rgba=landTexel(lp);",
    )
    .replace("float z=landZ(ivec2(source));", "float z=landZ(lp);")
    .replace(
      "ivec2 lp=ivec2(target-floor(move+.5));",
      "ivec2 lp=foliageSource(ivec2(target-floor(move+.5)));",
    );
}

function gustAt(west: number, south: number) {
  const x = west / GUST_M, y = south / GUST_M;
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = sstep(0, 1, x - ix), v = sstep(0, 1, y - iy);
  const x0 = ix & (GUST_CELLS - 1), x1 = (ix + 1) & (GUST_CELLS - 1);
  const y0 = iy & (GUST_CELLS - 1), y1 = (iy + 1) & (GUST_CELLS - 1);
  const a = hash(x0 + 61, y0) * (1 - u) + hash(x1 + 61, y0) * u;
  const b = hash(x0 + 61, y1) * (1 - u) + hash(x1 + 61, y1) * u;
  return sstep(0.15, 0.85, a * (1 - v) + b * v);
}

interface Column {
  x: number;
  distance: number;
  end: number;
}

type Tip = [
  index: number,
  weight: number,
  limit: number,
  lag: number,
  warp: number,
  clump: number,
  phase: number,
  dir: number,
];

export class Foliage {
  readonly offsets: Int8Array;
  readonly rows: [number, number];
  readonly solid: Uint8Array;
  private readonly green: Uint8Array;
  revision = 0;
  active = false;

  private readonly colX: Int32Array;
  /** NaN without a depth map. */
  private readonly colDistance: Float32Array;
  private readonly colEnd: Int32Array;
  private readonly omega: Float32Array;
  private readonly springX: Float32Array;
  private readonly springV: Float32Array;
  private readonly gust: Float32Array;
  private readonly history: Float32Array;
  private readonly tipIndex: Int32Array;
  private readonly tipWeight: Float32Array;
  private readonly tipLimit: Int8Array;
  private readonly tipLag: Uint8Array;
  private readonly tipWarp: Int32Array;
  /** Above RUSTLE_SHARE for tips that never flick. */
  private readonly tipClump: Float32Array;
  private readonly tipPhase: Uint8Array;
  private readonly tipDir: Int8Array;
  /** An unmasked foreground bends whole, without warp or rustle. */
  private readonly rigid: boolean;
  private primed = false;
  private last = 0;
  /** Index of the last completed tick; tick k runs at time k × TICK_S. */
  private tick = 0;
  private head = 0;
  private warpX = 0;
  private warpY = 0;

  /** nearest uses the white depth endpoint for the foreground. mask (white sways most) replaces the green test. */
  constructor(
    land: ImageBitmap,
    depth: ImageBitmap | null,
    depthRange: [number, number],
    nearest = false,
    mask: ImageBitmap | null = null,
  ) {
    const { width, height } = land;
    this.rigid = nearest && !mask;
    this.offsets = new Int8Array(width * height);
    this.solid = new Uint8Array(width * height);
    this.green = new Uint8Array(width * height);
    this.rows = [height, 0];
    const cols: Column[] = [];
    const tips: Tip[] = [];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) this.scan(ctx, land, depth, depthRange, nearest, mask, cols, tips);
    this.colX = Int32Array.from(cols, (c) => c.x);
    this.colDistance = Float32Array.from(cols, (c) => c.distance);
    this.colEnd = Int32Array.from(cols, (c) => c.end);
    // Smooth in x: per-column variation reads as vertical lines walking.
    this.omega = Float32Array.from(cols, (c) =>
      this.rigid ? SPRING_OMEGA : SPRING_OMEGA *
        (1 + SPRING_SPREAD *
            (0.6 * Math.sin(c.x * TWO_PI / 41 + 1.3) + 0.4 * Math.sin(c.x * TWO_PI / 97))));
    this.springX = new Float32Array(cols.length);
    this.springV = new Float32Array(cols.length);
    this.gust = new Float32Array(cols.length);
    this.history = new Float32Array(cols.length * HISTORY);
    this.tipIndex = Int32Array.from(tips, (t) => t[0]);
    this.tipWeight = Float32Array.from(tips, (t) => t[1]);
    this.tipLimit = Int8Array.from(tips, (t) => t[2]);
    this.tipLag = Uint8Array.from(tips, (t) => t[3]);
    this.tipWarp = Int32Array.from(tips, (t) => t[4]);
    this.tipClump = Float32Array.from(tips, (t) => t[5]);
    this.tipPhase = Uint8Array.from(tips, (t) => t[6]);
    this.tipDir = Int8Array.from(tips, (t) => t[7]);
  }

  private scan(
    ctx: CanvasRenderingContext2D,
    land: ImageBitmap,
    depth: ImageBitmap | null,
    depthRange: [number, number],
    nearest: boolean,
    mask: ImageBitmap | null,
    cols: Column[],
    tips: Tip[],
  ) {
    const { width, height } = land;
    ctx.drawImage(land, 0, 0);
    const paint = ctx.getImageData(0, 0, width, height).data;
    let depths: Uint8ClampedArray | null = null;
    if (nearest) depths = new Uint8ClampedArray(width * height * 4).fill(255);
    else if (depth) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(depth, 0, 0);
      depths = ctx.getImageData(0, 0, width, height).data;
    }
    let sway: Uint8ClampedArray | null = null;
    if (mask && mask.width === width && mask.height === height) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(mask, 0, 0);
      sway = ctx.getImageData(0, 0, width, height).data;
    }
    const swayAt = (i: number) => sway ? sway[i * 4] * sway[i * 4 + 3] / 65025 : 0;
    for (let i = 0; i < this.solid.length; i++) {
      const p = i * 4;
      this.solid[i] = Number(paint[p + 3] >= 128);
      this.green[i] = sway
        ? Number(swayAt(i) > 0)
        : this.rigid
        ? this.solid[i]
        : Number(paint[p + 1] >= paint[p] + 5 && paint[p + 1] > paint[p + 2]);
    }
    const weight = new Float32Array(width * height);
    const tops = new Int32Array(width).fill(height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (!this.solid[y * width + x]) continue;
        tops[x] = y;
        break;
      }
      const depthRows = sway || this.rigid ? height : Math.min(12, (height - tops[x]) * 0.65);
      for (let y = tops[x]; y < Math.min(height - 3, tops[x] + depthRows); y++) {
        const i = y * width + x;
        if (!this.solid[i] || !this.green[i]) continue;
        if (sway) {
          const near = depths ? depths[i * 4] / 255 : 0;
          weight[i] = swayAt(i) * sstep(2, 7, height - 1 - y) * (0.64 + 1.96 * near * near);
          continue;
        }
        if (this.rigid) {
          weight[i] = TRUNK_SWAY;
          continue;
        }
        const tip = 1 - (y - tops[x]) / depthRows;
        const exposed = y === 0 || !this.solid[i - width];
        const anchor = sstep(2, 7, height - 1 - y);
        const near = depths ? depths[i * 4] / 255 : 0;
        weight[i] = (exposed ? Math.max(0.8, tip) : tip * tip) * anchor *
          (0.64 + 1.96 * near * near);
      }
    }
    // Lag counts from each run's top: a mask column can hold several trees.
    const lags = new Uint8Array(width * height);
    for (let x = 0; x < width; x++) {
      let runTop = -1;
      for (let y = 0; y < height; y++) {
        const i = y * width + x;
        if (!this.solid[i] || weight[i] === 0) {
          runTop = -1;
          continue;
        }
        if (runTop < 0) runTop = y;
        lags[i] = Math.min(MAX_LAG, Math.round((y - runTop) * LAG_PER_PX));
      }
    }
    for (let x = 0; x < width; x++) {
      // Land samples past the art mirror back in; the unmirrored foreground fades out at the edges.
      const edge = this.rigid ? sstep(0, MAX_STEP + 1, Math.min(x, width - 1 - x)) : 1;
      const begin = tips.length;
      // The foreground shifts whole, so its bottom rows move too.
      for (let y = 0; y < (this.rigid ? height : height - 3); y++) {
        const index = y * width + x;
        let sample = index;
        // Extend the displacement into adjacent sky to make room for the crown.
        if (!this.solid[sample]) {
          for (let dx = 1; dx <= MAX_STEP; dx++) {
            if (x >= dx && weight[index - dx] > 0) {
              sample = index - dx;
              break;
            }
            if (x + dx < width && weight[index + dx] > 0) {
              sample = index + dx;
              break;
            }
          }
        }
        if (weight[sample] === 0) continue;
        const w = weight[sample] * edge;
        // 2×2 clumps, staggered every other row pair so they don't read as a grid.
        const cy = y >> 1, cx = (x + (cy & 1)) >> 1;
        tips.push([
          index,
          w,
          this.rigid ? TRUNK_LIMIT : depths && depths[sample * 4] > 96 ? MAX_STEP : 1,
          this.rigid ? 0 : lags[sample],
          (y & (WARP_SIZE - 1)) * WARP_SIZE + (x & (WARP_SIZE - 1)),
          w >= RUSTLE_MIN_WEIGHT ? hash(cx * 977 + cy, 113) : 1,
          Math.floor(hash(cx, cy * 31 + 7) * RUSTLE_PERIOD),
          hash(cy, cx * 13 + 5) < 0.7 ? 1 : -1,
        ]);
        this.rows[0] = Math.min(this.rows[0], y);
        this.rows[1] = Math.max(this.rows[1], y + 1);
      }
      if (tips.length === begin) continue;
      const top = tops[x] < height ? tops[x] * width + x : tips[begin][0];
      const near = depths ? depths[top * 4] / 255 : 0;
      const distance = depths && tops[x] < height
        ? depthRange[1] + (depthRange[0] - depthRange[1]) * near
        : NaN;
      cols.push({ x, distance, end: tips.length });
    }
  }

  private target(c: number, t: number, strength: number, crosswind: number) {
    // Rigid columns share one phase so the whole layer shifts together.
    const x = this.rigid ? 0 : this.colX[c], g = this.gust[c];
    const sway = 0.66 * Math.sin((t % 5.2) * TWO_PI / 5.2 + x * TWO_PI / 116) +
      0.2 * Math.sin((t % 8.1) * TWO_PI / 8.1 - x * TWO_PI / 211);
    return strength * (sway * (0.74 + 0.55 * g * g) +
      crosswind * (0.12 + 0.25 * g + GUST_PUSH * g * g));
  }

  update({ time, foliage, headAz, radPerPx, water }: Frame, width: number) {
    const strength = foliage * Math.max(0, Math.min(1, (water.windMs - 1.5) / 16.5));
    if (strength < 0.125) {
      this.active = false;
      this.primed = false;
      return false;
    }
    const crosswind = (water.windTo[0] * Math.cos(headAz) - water.windTo[1] * Math.sin(headAz)) /
      water.windMs;
    const cols = this.colX.length;
    const dt = time - this.last, due = Math.floor(time / TICK_S);
    // The frame loop caps a background gap at 1 s, so only a larger jump resets.
    const reset = !this.primed || dt < 0 || dt > 1.5;
    this.last = time;
    let ticks = 0;
    if (reset) this.tick = due;
    else {
      ticks = Math.min(due - this.tick, MAX_TICKS);
      if (ticks <= 0) return false;
    }
    for (let c = 0; c < cols; c++) {
      if (this.rigid && c > 0) {
        this.gust[c] = this.gust[0];
        continue;
      }
      const az = headAz + (this.colX[c] + 0.5 - width / 2) * radPerPx;
      const d = this.colDistance[c], z = d === d ? d : water.shoreZ;
      this.gust[c] = gustAt(
        Math.sin(az) * z + water.pawDrift[0],
        Math.cos(az) * z + water.pawDrift[1],
      );
    }
    if (reset) {
      this.primed = true;
      for (let c = 0; c < cols; c++) {
        const x0 = this.target(c, time, strength, crosswind);
        this.springX[c] = x0;
        this.springV[c] = 0;
        this.history.fill(x0, c * HISTORY, c * HISTORY + HISTORY);
      }
    }
    for (let k = due - ticks + 1; k <= due; k++) {
      const t = k * TICK_S;
      this.head = (this.head + 1) & (HISTORY - 1);
      for (let c = 0; c < cols; c++) {
        const w = this.omega[c];
        const target = this.target(c, t, strength, crosswind);
        const v = this.springV[c] +
          (w * w * (target - this.springX[c]) - 2 * SPRING_DAMPING * w * this.springV[c]) * TICK_S;
        this.springV[c] = v;
        this.springX[c] += v * TICK_S;
        this.history[c * HISTORY + this.head] = this.springX[c];
      }
      this.warpX = (this.warpX + crosswind * WARP_DRIFT * TICK_S) % WARP_SIZE;
      this.warpY = (this.warpY + WARP_RISE * TICK_S) % WARP_SIZE;
    }
    // Sampling at x − drift moves the field downwind.
    const ox = Math.floor(-this.warpX), fx = -this.warpX - ox;
    const oy = Math.floor(this.warpY) * WARP_SIZE;
    const wrapX = WARP_SIZE - 1, wrapAll = WARP_SIZE * WARP_SIZE - 1;
    this.tick = due;
    const share = sstep(0.3, 0.75, strength) * RUSTLE_SHARE;
    const down = crosswind < 0 ? -1 : 1;
    let changed = false, active = false, start = 0;
    for (let c = 0; c < cols; c++) {
      const x = this.colX[c], g = this.gust[c], end = this.colEnd[c];
      const warp = this.rigid ? 0 : WARP_AMP * strength * (0.6 + 0.8 * g);
      const clumps = this.rigid ? 0 : share * (0.2 + 0.8 * g);
      const base = c * HISTORY;
      for (let t = start; t < end; t++) {
        const cell = this.tipWarp[t];
        const row = ((cell + oy) & wrapAll) - (cell & wrapX), col = cell & wrapX;
        const a = WARP[row + ((col + ox) & wrapX)], b = WARP[row + ((col + ox + 1) & wrapX)];
        const bend = this.history[base + ((this.head - this.tipLag[t]) & (HISTORY - 1))] +
          warp * (a + (b - a) * fx);
        let step = Math.round(this.tipWeight[t] * bend);
        if (
          this.tipClump[t] < clumps &&
          (this.tick + this.tipPhase[t]) % RUSTLE_PERIOD < RUSTLE_TICKS
        ) {
          step += down * this.tipDir[t];
        }
        const limit = this.tipLimit[t];
        step = step > limit ? limit : step < -limit ? -limit : step;
        const index = this.tipIndex[t], sx = x - step;
        const source = index - x + (sx < 0 ? -sx - 1 : sx >= width ? 2 * width - 1 - sx : sx);
        if (
          step && ((this.rigid && (sx < 0 || sx >= width)) ||
            (this.solid[source] && !this.green[source]))
        ) {
          step = 0;
        }
        if (this.offsets[index] !== step) {
          this.offsets[index] = step;
          changed = true;
        }
        if (step) active = true;
      }
      start = end;
    }
    this.active = active;
    if (changed) this.revision++;
    return changed;
  }
}
