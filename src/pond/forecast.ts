export interface Forecast {
  cover: number;
  base: number;
  mid: number;
  cirrus: number;
  storms: number;
  rain: number;
  fog: number;
  mist: number;
  wind: number;
  windFrom: number;
  cirrusDir: number;
  airC: number;
  waterC: number;
  /** Signed m upwind of the eye; −Infinity is full coverage, Infinity no front. */
  rainFront: number;
  hoursToFront: number;
  front: boolean;
}

export const createForecast = (): Forecast => ({
  cover: 0,
  base: 600,
  mid: 0,
  cirrus: 0,
  storms: 0,
  rain: 0,
  fog: 0,
  mist: 0,
  wind: 0,
  windFrom: 0,
  cirrusDir: 0,
  airC: 0,
  waterC: 0,
  rainFront: Infinity,
  hoursToFront: Infinity,
  front: false,
});

// By month from January: NOAA 1991–2020 normals for Chatham (USC00191386) and nearby series; °F, inches, %, and mph.
const CHATHAM = {
  high: [38.6, 38.9, 43.1, 51.1, 59.7, 69, 75.9, 75.8, 70.3, 61.1, 52, 44],
  low: [24.9, 25, 30.7, 39.5, 48.1, 56.6, 63.1, 62.9, 58.4, 48.7, 39.6, 31.2],
  precip: [3.97, 3.84, 4.71, 4.01, 3.3, 3.17, 2.8, 3.2, 3.78, 4.31, 4.12, 4.72],
  wet: [12.4, 10.9, 11.7, 11.5, 11, 9.6, 8.2, 8.3, 8.7, 10.8, 10.6, 12.9],
  fog: [3.7, 2.7, 6, 5.7, 5.3, 6, 9.3, 4, 4, 1.7, 2, 3.4],
  thunder: [0, 0, 0, 0, 1, 0, 0.7, 1.3, 0, 0, 0, 0],
  cloudy: [53, 54, 53, 53, 54, 49, 44, 41, 39, 40, 48, 52],
  sound: [38.3, 36.4, 39.4, 46.5, 54.4, 64, 73, 74.6, 70.1, 61.6, 52.2, 43.4],
  wind: [19.2, 18.7, 17.5, 15.5, 13.6, 12.6, 11.8, 12.1, 13.4, 15.6, 17.8, 18.5],
};

// Adapted from KELPII's forecast.ts; the epoch is midnight EST.
const EPOCH = Date.UTC(2000, 0, 1, 5), DAY = 86_400_000, DAYS = 36_525;
const dayMonth = new Uint16Array(DAYS);
const mids = new Float64Array(1202), lengths = new Float64Array(1202);
for (let m = 0; m < 1200; m++) {
  const start = (Date.UTC(2000, m, 1, 5) - EPOCH) / DAY;
  const end = (Date.UTC(2000, m + 1, 1, 5) - EPOCH) / DAY;
  dayMonth.fill(m, start, end);
  mids[m + 1] = (start + end) / 2;
  lengths[m + 1] = end - start;
}
mids[0] = mids[1200] - DAYS;
mids[1201] = mids[1] + DAYS;
lengths[0] = lengths[1200];
lengths[1201] = lengths[1];

const mod = (x: number, n: number) => ((x % n) + n) % n;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const cloudBase = (depressionC: number) => Math.max(100, Math.min(1500, 125 * depressionC));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const celsius = (f: number) => (f - 32) * 5 / 9;
const ease = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const pulse = (age: number, peak: number, end: number) =>
  age < peak ? ease(age / peak) : ease((end - age) / (end - peak));
const envelope = (age: number, start: number, peak: number, end: number) =>
  pulse(age - start, peak - start, end - start);

function random(seed: number, index: number, lane: number) {
  let x = seed ^ Math.imul(index, 0x9e3779b1) ^ Math.imul(lane, 0x85ebca77);
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (((x ^ (x >>> 15)) >>> 0) + 0.5) / 4294967296;
}

function field(d: number, seed: number, span: number, lane: number) {
  const count = Math.round(DAYS / span), u = d * count / DAYS, k = Math.floor(u);
  return mix(random(seed, k, lane), random(seed, (k + 1) % count, lane), ease(u - k));
}

function leftMonth(d: number) {
  const m = dayMonth[Math.floor(d)];
  return d < mids[m + 1] ? m - 1 : m;
}
const monthFrac = (d: number, left: number) =>
  ease((d - mids[left + 1]) / (mids[left + 2] - mids[left + 1]));
const monthValue = (v: readonly number[], left: number, f: number) =>
  mix(v[(left + 12) % 12], v[(left + 13) % 12], f);
const dailyOdds = (v: readonly number[], left: number, f: number) =>
  mix(v[(left + 12) % 12] / lengths[left + 1], v[(left + 13) % 12] / lengths[left + 2], f);
const RAD = Math.PI / 180, APPROACH_H = 13 / 60;
/** blendWind's shared output: [from in degrees, m/s]. */
export const blended: [number, number] = [0, 0];
// Opposing bearings blend through calm, avoiding the 180° shortest-arc seam.
/** Wind factor 0.45–0.8: the kettle shelters the water unless the air is cold or well below the water's temperature. */
export function shelter(waterC: number, airC: number) {
  return mix(0.45, 0.8, Math.max(ease((waterC - airC - 5) / 9), ease((5 - airC) / 5)));
}

export function blendWind(from: number, speed: number, to: number, toSpeed: number, t: number) {
  const x = mix(Math.sin(from * RAD), Math.sin(to * RAD), t),
    y = mix(Math.cos(from * RAD), Math.cos(to * RAD), t);
  const length = Math.hypot(x, y);
  blended[0] = length > 1e-6 ? mod(Math.atan2(x, y) / RAD, 360) : mod(from, 360);
  blended[1] = mix(speed, toSpeed, t) * Math.min(1, length / 0.35);
  return blended;
}

/** Hours since onset, returning signed m as in Forecast.rainFront. */
export function rainLine(hours: number) {
  const line = 2000 * (1 - hours / APPROACH_H);
  if (line >= -3000) return line;
  // The far front takes 45 min to sweep the remaining sky.
  const far = -3000 * 20 ** ((-3000 - line) / 2000 * APPROACH_H / 0.75);
  return far < -60000 ? -Infinity : far;
}

function prevailingFrom(d: number) {
  const m = dayMonth[Math.floor(d)];
  const date = d - (mids[m + 1] - lengths[m + 1] / 2) + 1;
  switch (m % 12) {
    case 2:
      return mix(270, 360, ease((date - 24) / 7));
    case 3:
      return mix(0, 180, ease((date - 12) / 7));
    case 9:
      return mix(180, 270, ease((date - 1) / 8));
    default:
      return m % 12 >= 4 && m % 12 <= 8 ? 180 : 270;
  }
}

export function forecast(ms: number, seed: number, out: Forecast): Forecast {
  const d = mod(ms - EPOCH, DAYS * DAY) / DAY;
  const today = Math.floor(d), hour = (d - today) * 24;
  const left = leftMonth(d), f = monthFrac(d, left);
  let highCloud = 0, midCloud = 0, lowCloud = 0, rainRate = 0, storms = 0;
  let ahead = 0, behind = 0, calm = 0, rainFront = Infinity, hoursToFront = Infinity;

  for (let offset = -1; offset <= 1; offset++) {
    const id = mod(today + offset, DAYS), sample = id + 0.5;
    const m = leftMonth(sample), blend = monthFrac(sample, m);
    const roll = random(seed, id, 1);
    if (roll >= dailyOdds(CHATHAM.wet, m, blend)) continue;
    const thunder = roll < dailyOdds(CHATHAM.thunder, m, blend);
    const timing = random(seed, id, 2);
    const start = thunder ? 15 + 3 * timing : 24 * timing;
    const duration = thunder ? 1.5 + 1.5 * random(seed, id, 3) : 3 + 6 * random(seed, id, 3);
    const age = hour - (24 * offset + start);
    const intensity = 0.72 + 0.28 * random(seed, id, 4);
    if (age < -10) hoursToFront = Math.min(hoursToFront, -10 - age);
    highCloud = Math.max(highCloud, intensity * envelope(age, -10, -5.5, duration + 4));
    midCloud = Math.max(midCloud, intensity * envelope(age, -7, -2, duration + 3));
    lowCloud = Math.max(lowCloud, intensity * envelope(age, -4, 0.8, duration + 2));
    ahead = Math.max(ahead, envelope(age, -6, 0.25, duration * 0.55));
    behind = Math.max(behind, envelope(age, duration * 0.45, duration + 0.5, duration + 5));
    calm = Math.max(calm, envelope(age, duration, duration + 0.25, duration + 2));
    if (thunder) {
      storms = Math.max(storms, intensity * envelope(age, -1, 0.7, duration));
    }
    if (age < 0 || age >= duration) continue;
    rainFront = Math.min(rainFront, rainLine(age));
    const mmPerWetDay = 25.4 * monthValue(CHATHAM.precip, m, blend) /
      monthValue(CHATHAM.wet, m, blend);
    const peakRate = thunder ? 15 + 3 * mmPerWetDay : 2 * mmPerWetDay / duration;
    rainRate += peakRate * intensity * envelope(age, 0, 0.08, duration);
  }

  const fogOffset = hour >= 21 ? 1 : 0;
  const fogDay = mod(today + fogOffset, DAYS);
  const fogMonth = leftMonth(fogDay + 0.5), fogBlend = monthFrac(fogDay + 0.5, fogMonth);
  const fog = random(seed, fogDay, 5) < dailyOdds(CHATHAM.fog, fogMonth, fogBlend)
    ? envelope(hour - fogOffset * 24, -3, 6, 11.5) * (1 - 0.9 * lowCloud)
    : 0;
  const fogBearing = random(seed, fogDay, 6) < 0.06
    ? 160 + 40 * random(seed, fogDay, 7)
    : 5 + 50 * random(seed, fogDay, 7);

  const daytime = (1 + Math.cos(Math.PI * (hour - 15) / 12)) / 2;
  const lowF = monthValue(CHATHAM.low, left, f), highF = monthValue(CHATHAM.high, left, f);
  const air = celsius(mix(lowF, highF, daytime));
  const airC = air + 8 * (field(d, seed, 2.5, 10) - 0.5) - 2.5 * Math.max(lowCloud, calm);
  const lag = mod(d - 14, DAYS), waterMonth = leftMonth(lag);
  const waterC = celsius(monthValue(CHATHAM.sound, waterMonth, monthFrac(lag, waterMonth)));
  const gust = field(d, seed, 0.018, 11);
  let wind = monthValue(CHATHAM.wind, left, f) * 0.44704 *
    mix(0.55, 1.45, field(d, seed, 1.5, 12)) * mix(0.85, 1.15, daytime);
  wind = (wind + 2 * ahead + storms * (4 + 11 * gust)) * shelter(waterC, airC);
  wind = mix(wind, 0.3, calm * (1 - Math.max(lowCloud * 0.35, storms)));
  let windFrom = prevailingFrom(d) + 50 * (field(d, seed, 2, 13) - 0.5) - 55 * ahead;
  [windFrom, wind] = blendWind(windFrom, wind, 315, wind, behind);
  [windFrom, wind] = blendWind(windFrom, wind, fogBearing, 0.8, ease(fog * 2));

  const cloudy = monthValue(CHATHAM.cloudy, left, f) / 100;
  const sky = ease((field(d, seed, 1.75, 14) + cloudy - 0.8) / 0.4);
  const night = 1 - ease((hour - 6) / 5) + ease((hour - 18) / 4);
  const mist = ease((waterC - airC) / 8) * (1 - ease((wind - 0.5) / 3)) *
    Math.max(night, calm) * (1 - ease(rainRate / 3));

  // East and south winds bring marine air.
  const onshore = Math.max(0, Math.cos((windFrom - 135) * RAD)) * ease(wind / 5);
  const marine = onshore * mix(0.25, 0.7, ease((airC - waterC) / 8));
  const dayRangeC = (highF - lowF) * 5 / 9;
  const fairDepression = 3.5 + dayRangeC * daytime * mix(0.8, 1.15, 1 - cloudy);
  const dryDepression = mix(fairDepression, mix(2.5, 4.5, daytime), Math.max(sky, marine));
  const frontal = Math.max(ease(highCloud / 0.75), ahead, ease(rainRate / 2), lowCloud);
  const wetDepression = mix(3.5, 1.2, ease(rainRate / 4));
  const depression = mix(
    mix(dryDepression, Math.min(dryDepression, wetDepression), frontal),
    0.8,
    ease(Math.max(fog, mist) * 1.5),
  );

  out.cover = 100 * Math.max(mix(0.1, 0.82, sky), lowCloud, storms * 0.75);
  out.base = cloudBase(depression);
  out.mid = 100 * Math.max(mix(0.08, 0.42, sky), midCloud, storms * 0.6);
  out.cirrus = 100 * Math.max(mix(0.15, 0.44, field(d, seed, 1.2, 15)), highCloud);
  out.storms = 100 * storms;
  out.rain = 100 * clamp(Math.sqrt(rainRate / 50));
  out.fog = 100 * fog;
  out.mist = 100 * mist;
  out.wind = Math.min(20, wind);
  out.windFrom = mod(windFrom, 360);
  out.cirrusDir = 120 + 40 * field(d, seed, 5, 16) ** 2;
  out.airC = airC;
  out.waterC = waterC;
  out.rainFront = rainFront;
  out.hoursToFront = hoursToFront;
  out.front = highCloud > 0;
  return out;
}
