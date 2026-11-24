// Decoders take raw bytes; callers do the fetching.

export const STAR_MAGIC = "KSTR";
export const MILKY_WAY_MAGIC = "KMWY";
export const HEADER_BYTES = 8;
export const STAR_BYTES = 12;
export const MAG_MIN = -1.6;
export const MAG_STEP = 0.03;
export const BV_STEP = 0.02;
export const DEG = Math.PI / 180;

/** Stars brightest first. Proper motions are mas per year, with RA already multiplied by cos(dec). */
export interface StarCatalog {
  count: number;
  hr: Uint16Array;
  raDeg: Float64Array;
  decDeg: Float64Array;
  /** J2000 equatorial unit vectors, xyz per star. */
  dir: Float32Array;
  mag: Float32Array;
  bv: Float32Array;
  pmRa: Float32Array;
  pmDec: Float32Array;
}

/** Galactic equirectangular: u = (180° − l) / 360° wrapped (longitude rising leftward), v = (90° − b) / 180°. */
export interface MilkyWayMap {
  width: number;
  height: number;
  data: Uint8Array;
}

/** ICRS (J2000) to galactic rotation, row-major, from the Hipparcos introduction. */
export const J2000_TO_GALACTIC = [
  -0.0548755604162154,
  -0.8734370902348850,
  -0.4838350155487132,
  0.4941094278755837,
  -0.4448296299600112,
  0.7469822444972189,
  -0.8676661490190047,
  -0.1980763734312015,
  0.4559837761750669,
] as const;

function checkMagic(bytes: Uint8Array, magic: string) {
  if (bytes.length < HEADER_BYTES || String.fromCharCode(...bytes.subarray(0, 4)) !== magic) {
    throw new Error(`Not a ${magic} sky asset`);
  }
}

export function decodeStars(bytes: Uint8Array): StarCatalog {
  checkMagic(bytes, STAR_MAGIC);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (bytes.length !== HEADER_BYTES + count * STAR_BYTES) {
    throw new Error("Star catalog length mismatch");
  }
  const cat: StarCatalog = {
    count,
    hr: new Uint16Array(count),
    raDeg: new Float64Array(count),
    decDeg: new Float64Array(count),
    dir: new Float32Array(count * 3),
    mag: new Float32Array(count),
    bv: new Float32Array(count),
    pmRa: new Float32Array(count),
    pmDec: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * STAR_BYTES;
    const ra = (view.getUint16(o + 2, true) / 65536) * 360;
    const dec = (view.getInt16(o + 4, true) / 32767) * 90;
    cat.hr[i] = view.getUint16(o, true);
    cat.raDeg[i] = ra;
    cat.decDeg[i] = dec;
    const cd = Math.cos(dec * DEG);
    cat.dir[i * 3] = cd * Math.cos(ra * DEG);
    cat.dir[i * 3 + 1] = cd * Math.sin(ra * DEG);
    cat.dir[i * 3 + 2] = Math.sin(dec * DEG);
    cat.mag[i] = MAG_MIN + view.getUint8(o + 6) * MAG_STEP;
    cat.bv[i] = view.getInt8(o + 7) * BV_STEP;
    cat.pmRa[i] = view.getInt16(o + 8, true);
    cat.pmDec[i] = view.getInt16(o + 10, true);
  }
  return cat;
}

export function decodeMilkyWay(bytes: Uint8Array): MilkyWayMap {
  checkMagic(bytes, MILKY_WAY_MAGIC);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(4, true), height = view.getUint16(6, true);
  if (bytes.length !== HEADER_BYTES + width * height) {
    throw new Error("Milky Way map length mismatch");
  }
  return { width, height, data: bytes.subarray(HEADER_BYTES) };
}

/** Galactic longitude and latitude in degrees, longitude in [0, 360). */
export function galacticFromJ2000(x: number, y: number, z: number): [number, number] {
  const m = J2000_TO_GALACTIC;
  const gx = m[0] * x + m[1] * y + m[2] * z;
  const gy = m[3] * x + m[4] * y + m[5] * z;
  const gz = m[6] * x + m[7] * y + m[8] * z;
  const l = Math.atan2(gy, gx) / DEG;
  return [
    l < 0 ? l + 360 : l,
    Math.asin(Math.max(-1, Math.min(1, gz / Math.hypot(gx, gy, gz)))) / DEG,
  ];
}

/** Milky Way brightness 0–1 toward a J2000 unit vector, bilinear, wrapping in longitude. */
export function sampleMilkyWay(map: MilkyWayMap, x: number, y: number, z: number): number {
  const [l, b] = galacticFromJ2000(x, y, z);
  const { width: w, height: h, data } = map;
  const fx = (((540 - l) % 360) / 360) * w - 0.5;
  const fy = Math.min(h - 1, Math.max(0, ((90 - b) / 180) * h - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const xa = (x0 + w) % w, xb = (x0 + 1) % w;
  const y1 = Math.min(h - 1, y0 + 1);
  const top = data[y0 * w + xa] * (1 - tx) + data[y0 * w + xb] * tx;
  const bottom = data[y1 * w + xa] * (1 - tx) + data[y1 * w + xb] * tx;
  return (top * (1 - ty) + bottom * ty) / 255;
}

/** Star tint from B−V via Ballesteros's temperature and a blackbody fit; brightest channel 1. */
export function bvToRgb(bv: number): [number, number, number] {
  const c = Math.max(-0.4, Math.min(2.0, bv));
  const t = 4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const bl = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const rgb = [r, g, bl].map((v) => Math.max(0, Math.min(255, v)));
  const top = Math.max(...rgb);
  return [rgb[0] / top, rgb[1] / top, rgb[2] / top];
}
