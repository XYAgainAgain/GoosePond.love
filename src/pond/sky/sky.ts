// Hillaire 2020 atmosphere: km and per-km, for red, green, and blue.
const R_PLANET = 6360, R_TOP = 6460;
const H_RAY = 8, H_MIE = 1.2, OZONE_ALT = 25, OZONE_HALF = 15;
const RAY = [5.802e-3, 13.558e-3, 33.1e-3];
const MIE_SCAT = 3.996e-3, MIE_EXT = 4.4e-3;
const OZONE = [0.65e-3, 1.881e-3, 0.085e-3];

import type { Ephemeris } from "./ephemeris.ts";

const DEG = Math.PI / 180;
const LATITUDE = 41.69 * DEG;
const WATER_INDEX = 1.33;
// Dome squashed vertically so both bodies rise and set inside the frame.
const AZ_SPAN = 200 * DEG;
const DOME_PX = 370 / 1440;
// KELPII's enlarged disc, still used for glitter; the pond draws its disc from the Disc slider.
const BODY_PX = 56 / 1440;

type Vec3 = [number, number, number];

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function transmittance(sinEl: number): Vec3 {
  const s = Math.max(0, sinEl), oy = R_PLANET + 0.01;
  const len = -oy * s + Math.sqrt(oy * oy * s * s - oy * oy + R_TOP * R_TOP);
  const tau = [0, 0, 0];
  const steps = 24;
  const cos = Math.sqrt(1 - s * s);
  for (let i = 0; i < steps; i++) {
    const t = ((i + 0.5) / steps) * len;
    const x = cos * t, y = oy + s * t;
    const h = Math.sqrt(x * x + y * y) - R_PLANET;
    const ray = Math.exp(-h / H_RAY), mie = Math.exp(-h / H_MIE) * MIE_EXT;
    const oz = Math.max(0, 1 - Math.abs(h - OZONE_ALT) / OZONE_HALF);
    for (let c = 0; c < 3; c++) tau[c] += (RAY[c] * ray + mie + OZONE[c] * oz) * (len / steps);
  }
  return [Math.exp(-tau[0]), Math.exp(-tau[1]), Math.exp(-tau[2])];
}

export const hue = (t: Vec3): Vec3 => {
  const m = Math.max(t[0], t[1], t[2], 1e-4);
  return [t[0] / m, t[1] / m, t[2] / m];
};

// Saemundsson's refraction formula.
export function apparentDeg(deg: number) {
  const h = Math.max(-1.5, deg);
  return deg + 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG) / 60;
}

interface Placed {
  dir: Vec3;
  az: number;
  sinApp: number;
  squash: number;
  x: number;
  y: number;
  t: Vec3;
}

// Keeps the dome's top below 85° so a tall page doesn't run past the zenith.
const domeFor = (H: number, horizon: number) => Math.max(DOME_PX * H, horizon / Math.sin(85 * DEG));

function place(dir: Vec3, W: number, dome: number, disc: number, horizon: number): Placed {
  const deg = Math.asin(dir[1]) / DEG;
  const app = apparentDeg(deg);
  const sinApp = Math.sin(app * DEG);
  const az = Math.atan2(dir[0], dir[2]);
  const drawnSin = sinApp - disc * (1 - sstep(0, disc, sinApp));
  return {
    dir,
    az,
    sinApp,
    squash: Math.min(1, Math.max(0.6, apparentDeg(deg + 0.5) - apparentDeg(deg - 0.5))),
    x: W * (0.5 + az / AZ_SPAN),
    y: horizon - dome * drawnSin,
    t: transmittance(sinApp),
  };
}

const NOON_SUN = direct(Math.cos(LATITUDE));
const MOON_R_AU = 1737.4 / 149597870.7;

function direct(sinApp: number) {
  const c = Math.max(0, sinApp);
  const fresnel = 0.02 + 0.98 * Math.pow(1 - c, 5);
  return Math.pow(c * transmittance(c)[1] * (1 - fresnel), 0.6);
}

export interface SkyState {
  sinSun: number;
  sinMoon: number;
  sunAz: number;
  moonAz: number;
  azSpan: number;
  dome: number;
  bodyR: number;
  sunPos: [number, number];
  moonPos: [number, number];
  squash: [number, number];
  sunCol: Vec3;
  moonCol: Vec3;
  moonLight: Vec3;
  moonVis: number;
  cloudLight: Vec3;
  ambTint: Vec3;
  skyE: number;
  moonE: number;
  sunDir: Vec3;
  moonDir: Vec3;
  lightDir: Vec3;
  cloudLightDir: Vec3;
  cloudAmb: Vec3;
  bowSun: number;
  bowMoon: number;
  bowFog: number;
  halo: number;
  haloTint: Vec3;
  corona: number;
  moonShows: number;
  /** Sun then moon: column x, column width in px, chance a cell is lit, and glint brightness. */
  glints: number[];
  glintRows: [number, number];
  /** Sun then moon, for the far sea: apparent sine of elevation, and glint odds before a facet's tilt. */
  seaGlints: number[];
  /** Cox–Munk surface slope along the sightline. */
  seaSlope: number;
  /** This and the rest are absent outside a lunar eclipse; 1 is the uneclipsed moon. */
  moonIrradiance?: number;
  /** Shadow center right and up from the disc's center, then the umbra's and penumbra's radii, all in lunar radii. */
  eclipse?: [number, number, number, number];
  /** The umbra's edge width in lunar radii, and its display colors at the center and the edge. */
  eclipseSoft?: number;
  eclipseCore?: Vec3;
  eclipseRim?: Vec3;
}

export interface Light {
  sunX: number;
  sunY: number;
  lightCol: Vec3;
  amb: number;
  lightI: number;
  beam: number;
  diffuse: number;
  night: number;
  glow: number;
  day: number;
  moonK: number;
  sunTan: number;
  sunLens: [number, number];
  /** Not in KELPII: each body's direct strength, before weather. */
  sunI: number;
  moonI: number;
  sky: SkyState;
}

// Capillary ripples that survive still air, so dead calm is a near-mirror.
const CALM_RIPPLE = 0.7;
const GLINT_LIT = 0.65, GLINT_GAIN = 10;
const MOON_GLINT_CUTOFF = 0.001;
// Below this, lunar glint odds fall with irradiance squared.
const MOON_GLINT_FULL = 0.25;

/** [width, chance, Fresnel, rows, pre-tilt chance]; a facet tilts half the body's elevation to send it level. */
function glitter(sinApp: number, wind: number, W: number, bodyR: number) {
  const el = Math.asin(Math.max(0, sinApp));
  const u = CALM_RIPPLE + Math.abs(wind);
  // Eased from the strict odds so a mid-height body still sparkles.
  const halfTan = (0.75 * Math.tan(el / 2)) / slopeFor(wind);
  const low = 1 - sstep(0.05, 0.35, sinApp);
  const spread = Math.sqrt(0.003 + 1.92e-3 * u) * (el + DEG);
  // The disc is drawn larger than life, so its reflection widens to match.
  const width = Math.hypot((spread * W) / AZ_SPAN, bodyR * 0.9) * (1 + 0.5 * low);
  const lit = GLINT_LIT * (1 + 0.3 * low);
  return [
    width,
    lit * Math.exp(-0.5 * halfTan * halfTan),
    0.02 + 0.98 * Math.pow(1 - Math.sin(el / 2), 5),
    2.5 + 3 * low,
    lit,
  ];
}

const slopeFor = (wind: number) => Math.sqrt(3.16e-3 * (CALM_RIPPLE + Math.abs(wind)));

// Marshall-Palmer drop counts per m³ per mm; the slider's top is a 50 mm/h cloudburst.
const DROP_N0 = 8000;
const RAIN_PEAK = 50;
export const FALL_PEAK = 9.65;
// Bigger drops read from farther away, so the landing depth scales with cross-section.
const STRIP_REF_MM = 2;

export interface Rain {
  level: number;
  /** The Wind slider's mean in m/s, positive left to right. */
  wind: number;
  lambda: number;
  hits: number;
}

export interface Clouds {
  cover: number;
  /** 0 is separate cumulus, 1 is a closed sheet. */
  stratus: number;
  heavy: number;
  fair: number;
  /** Km deep, and extinction per km at full density. */
  thick: number;
  sigma: number;
  overcast: number;
  /** churnRate is in noise tiles per second. */
  churn: number;
  churnRate: number;
  cirrus: number;
}

export interface Fog {
  amount: number;
  /** Tallest bank, as a share of the sky band. */
  reach: number;
  /** m/s downwind, signed like the wind; wander is the either-way drift in still air. */
  drift: number;
  wander: number;
  /** swirl is in radians per second. */
  churn: number;
  churnRate: number;
  swirl: number;
}

export function fogFor(slider: number, rain: Rain): Fog {
  const w = Math.abs(rain.wind), toward = rain.wind < 0 ? -1 : 1;
  // Folds are tuned for winds up to about 5 m/s; past 6 the fog is mostly shredded.
  const tumble = Math.min(w, 6);
  const amount = slider * (1 - 0.85 * sstep(4, 9, w));
  return {
    amount,
    reach: 0.16 + 0.3 * amount,
    drift: toward * (0.25 + 0.5 * w),
    wander: 0.35 * (1 - sstep(0.5, 3, w)),
    churn: 0.6 + 0.4 * sstep(0.5, 3, w),
    churnRate: 0.009 + 0.012 * tumble,
    swirl: 0.1 + 0.08 * tumble,
  };
}

export function cloudsFor(slider: number, rainSlider: number): Clouds {
  const heavy = sstep(0.08, 0.85, rainSlider);
  const cover = slider;
  const stratus = sstep(0.35, 0.8, cover);
  return {
    cover,
    stratus,
    heavy,
    fair: (1 - heavy) * (1 - 0.5 * stratus),
    thick: 1.2 + (0.5 - 1.2) * stratus + 1.7 * heavy,
    sigma: 30 + 40 * heavy,
    overcast: Math.max(sstep(0.5, 0.95, cover), 0.7 * heavy),
    churn: 0.12 + 0.88 * heavy,
    churnRate: 0.006 + 0.035 * heavy,
    cirrus: sstep(0.05, 0.22, cover) * (1 - sstep(0.7, 0.98, cover)) * (1 - 0.8 * heavy),
  };
}

export function rainFor(level: number, wind: number): Rain {
  if (level < 0.002) return { level: 0, wind, lambda: 1, hits: 0 };
  const lambda = 4.1 * Math.pow(RAIN_PEAK * level * level, -0.21);
  // Landings per m² per second per meter of strip: count × fall speed × (D/reference)², integrated.
  const hits = (2 * DROP_N0 * (FALL_PEAK / lambda ** 3 - 10.3 / (lambda + 0.6) ** 3)) /
    (STRIP_REF_MM * STRIP_REF_MM);
  return { level, wind, lambda, hits };
}

/** Sun and moon arrive in the local west, up, south frame; `irr` scales every lunar light, never the phase. */
export function lightFor(
  eph: Ephemeris,
  rain: Rain,
  clouds: Clouds,
  fog: Fog,
  W: number,
  H: number,
  horizon: number,
  irr = 1,
): Light {
  const { overcast, heavy, cirrus, cover } = clouds;
  const { level } = rain;
  const dome = domeFor(H, horizon), disc = (BODY_PX * H) / dome;
  const sun = place(eph.sun.direction, W, dome, disc, horizon);
  const moon = place(eph.moon.direction, W, dome, disc, horizon);
  const up = sun.dir[1];

  const dayRamp = sstep(-0.1, 0.03, up);
  const night = 1 - dayRamp;
  const moonK = (1 - dot(sun.dir, moon.dir)) / 2;

  const sunI = (1.17 * direct(sun.sinApp)) / NOON_SUN * sstep(-0.02, 0.01, sun.sinApp);
  const moonUp = Math.max(0, moon.sinApp);
  const moonI = (0.04 + 0.85 * moonK) * moonK * night * Math.pow(moonUp * moon.t[1], 0.6) * irr;

  const sw = sunI / Math.max(1e-4, sunI + moonI);
  const blend = (a: number, b: number) => a * sw + b * (1 - sw);
  const elev = Math.max(0, blend(sun.sinApp, moon.sinApp));
  const west = blend(sun.dir[0], moon.dir[0]);

  // Vector Snell's law; rays run opposite the body's direction.
  const sinZenith2 = Math.max(1e-6, 1 - elev * elev);
  const sinWater2 = sinZenith2 / (WATER_INDEX * WATER_INDEX);
  const cosWater = Math.sqrt(1 - sinWater2);
  const lens = 1 - elev / (WATER_INDEX * cosWater);
  const along = Math.min(1, (west * west) / sinZenith2);
  const stretch = 1 / (cosWater * cosWater);

  // Clouds keep catching sun a few degrees after it sets at the surface.
  const cloudSin = Math.sin(Math.asin(Math.max(-1, Math.min(1, up))) + 3 * DEG);
  const cloudHue = hue(transmittance(cloudSin));
  const cloudDay = sstep(-0.09, 0.05, up);

  const sunHue = hue(sun.t);
  const moonHue = hue(moon.t);
  const lightCol = sunHue.map((c) => blend(c, 1)) as Vec3;

  // Moon disc axes; sunlight expressed in them sets the terminator's phase and tilt.
  const m = moon.dir;
  const len = Math.max(1e-4, Math.hypot(m[2], m[0]));
  const right: Vec3 = [m[2] / len, 0, -m[0] / len];
  const top: Vec3 = [
    m[1] * right[2] - m[2] * right[1],
    m[2] * right[0] - m[0] * right[2],
    m[0] * right[1] - m[1] * right[0],
  ];

  const tint = sstep(-0.04, 0.3, up);
  const bow = sstep(0.02, 0.15, level) * (1 - overcast) * (1 - overcast) * (1 - fog.amount);
  const open = (sunI + moonI) * (1 - 0.6 * heavy);
  const beam = open * (1 - 0.55 * fog.amount);
  const moonShows = moonK * moonK * night * sstep(0, 0.1, moon.sinApp) * irr;
  const bodyR = BODY_PX * H;
  // Like drawnSin in place(), but the squashed disc's top edge lands on the horizon at the real upper limb.
  const limbSin = (b: Placed, rise: number) =>
    b.sinApp - (disc * b.squash + rise) * (1 - sstep(rise, disc, b.sinApp));
  const sunDrawnSin = limbSin(sun, Math.sin(-0.267 * DEG));
  const moonDrawnSin = limbSin(moon, -MOON_R_AU / eph.moon.distance);
  const clear = (1 - overcast) * (1 - 0.9 * fog.amount);
  const [sunW, sunLit, sunF, sunRows, sunRaw] = glitter(sun.sinApp, rain.wind, W, bodyR);
  const [moonW, moonLit, , moonRows, moonRaw] = glitter(moon.sinApp, rain.wind, W, bodyR);
  const sunOn = clear * sstep(0, 0.02, sun.sinApp),
    moonOn = clear * night * sstep(0, 0.02, moon.sinApp) *
      (irr < MOON_GLINT_CUTOFF ? 0 : Math.min(1, irr / MOON_GLINT_FULL) ** 2);
  return {
    sunX: blend(sun.x, moon.x),
    sunY: blend(sun.y, moon.y),
    lightCol,
    sunI,
    moonI,
    night,
    glow: night * sstep(0.2, 0.5, night),
    day: dayRamp * (1 - 0.5 * overcast),
    moonK,
    amb: (0.16 * sstep(-0.208, 0.19, up) + 0.03 * moonK * moonK * night * Math.sqrt(moonUp) * irr) *
      (1 - 0.3 * overcast),
    // The shader cuts the beam per column by cloud shadow; cloud or fog returns part as glow.
    beam,
    diffuse: beam * 0.28 * overcast * (1 - 0.35 * heavy) + open * 0.35 * fog.amount,
    // Estimate of that for light that skips the per-column shadow.
    lightI: beam * (1 - 0.85 * overcast),
    sunTan: (-west / WATER_INDEX) / cosWater,
    sunLens: [lens * (along * stretch + 1 - along), lens * ((1 - along) * stretch + along)],
    sky: {
      sinSun: Math.max(-0.5, Math.min(1, up)),
      sinMoon: Math.max(-0.5, Math.min(1, moon.dir[1])),
      sunAz: sun.az,
      moonAz: moon.az,
      azSpan: AZ_SPAN,
      dome,
      bodyR,
      sunPos: [sun.x, horizon - dome * sunDrawnSin],
      moonPos: [moon.x, horizon - dome * moonDrawnSin],
      squash: [sun.squash, moon.squash],
      sunCol: sunHue,
      moonCol: moonHue,
      moonLight: [dot(sun.dir, right), dot(sun.dir, top), -dot(sun.dir, m)],
      moonVis: 0.22 + 0.78 * night,
      cloudLight: [
        cloudHue[0] * 0.7 * cloudDay + 0.09 * moonK * night * irr,
        cloudHue[1] * 0.7 * cloudDay + 0.1 * moonK * night * irr,
        cloudHue[2] * 0.7 * cloudDay + 0.12 * moonK * night * irr,
      ],
      ambTint: [0.62 + 0.38 * tint, 0.72 + 0.28 * tint, 1],
      // The eye adapts further into twilight than KELPII's; night holds at zero.
      skyE: 9 * (1 + 18 * (1 - sstep(-0.12, 0.2, up))) * sstep(-0.31, -0.1, up),
      moonE: 0.6 * moonK * moonK * night * irr,
      sunDir: sun.dir,
      moonDir: moon.dir,
      lightDir: sw >= 0.5 ? sun.dir : moon.dir,
      cloudLightDir: cloudDay > 0.02 ? sun.dir : moon.dir,
      // Pixel Pond: cloud undersides keep twilight skylight until the sun is 12° down.
      cloudAmb: [0.55, 0.62, 0.7].map((c) =>
        c *
        ((sstep(-0.21, 0.08, up) * 0.9 +
              0.8 * sstep(-0.21, -0.03, up) * (1 - sstep(0.05, 0.2, up))) * (1 - 0.1 * heavy) +
          0.1 * moonK * night * irr)
      ) as Vec3,
      bowSun: bow * sstep(-0.02, 0.03, sun.sinApp),
      bowMoon: bow * 0.3 * moonShows,
      bowFog: fog.amount * (1 - overcast) * sstep(0, 0.05, sun.sinApp),
      halo: cirrus * (1 - overcast) * (sw >= 0.5 ? sstep(0, 0.1, sun.sinApp) : 0.5 * moonShows),
      haloTint: sw >= 0.5 ? sunHue : moonHue,
      corona: sstep(0.05, 0.3, cover) * (1 - sstep(0.62, 0.92, cover)) * (1 - heavy) * moonShows,
      moonShows,
      // Air dims a low sun faster than Fresnel brightens its glints; a half moon is ~⅛ as bright as full.
      glints: [
        sun.x,
        sunW,
        sunLit * sunOn,
        Math.min(3, GLINT_GAIN * sunF * Math.pow(sun.t[1], 0.6)),
        moon.x,
        moonW,
        moonLit * moonOn,
        moonK * moonK * moonK * irr,
      ],
      glintRows: [sunRows, moonRows],
      seaGlints: [sun.sinApp, sunRaw * sunOn, moon.sinApp, moonRaw * moonOn],
      seaSlope: slopeFor(rain.wind),
    },
  };
}

const fl = (n: number) => n.toFixed(6);
const vec = (v: number[]) => `vec3(${v.map(fl).join(",")})`;

// Sine of altitude per sky-table slice: sparse where the sky is black, dense on both sides of the horizon.
export const SKY_ALT = Float32Array.from([
  ...Array.from({ length: 2 }, (_, k) => -0.5 + 0.1 * k),
  ...Array.from({ length: 6 }, (_, k) => -0.3 + 0.03 * k),
  ...Array.from({ length: 20 }, (_, k) => -0.12 * (1 - k / 20) ** 1.5),
  ...Array.from({ length: 20 }, (_, k) => (k / 19) ** 3),
]);

/** Texture depth for a sine of altitude, clamped to the end slices' centers. */
export function skySlice(sinEl: number) {
  const a = SKY_ALT, n = a.length;
  let k = 0;
  while (k < n - 2 && a[k + 1] <= sinEl) k++;
  return (k + Math.max(0, Math.min(1, (sinEl - a[k]) / (a[k + 1] - a[k]))) + 0.5) / n;
}

/** Single scattering per view ray: Rayleigh in each slice's lower half, Mie in the upper, phase-free and square-rooted for eight-bit targets; skyLight inverts it. */
export const SKY_FRAG = `#version 300 es
precision highp float;
uniform float uSinEl; uniform vec2 uRes; out vec4 o;
const float RP=${fl(R_PLANET)}, RT=${fl(R_TOP)}, PI=3.14159265;
const vec3 RAY=${vec(RAY)}, OZ=${vec(OZONE)};
vec3 extinction(float h){
  return RAY*exp(-h/${fl(H_RAY)})+${fl(MIE_EXT)}*exp(-h/${fl(H_MIE)})+OZ*max(0.,1.-abs(h-${
  fl(OZONE_ALT)
})/${fl(OZONE_HALF)});
}
float toTop(vec3 p,vec3 d){ float b=dot(p,d); return -b+sqrt(max(0.,b*b-dot(p,p)+RT*RT)); }
bool hitsPlanet(vec3 p,vec3 d){ float b=dot(p,d); return b<0.&&b*b-dot(p,p)+RP*RP>0.; }
void main(){
  bool mie=gl_FragCoord.y>=uRes.y;
  vec2 uv=vec2(gl_FragCoord.x,gl_FragCoord.y-(mie?uRes.y:0.))/uRes;
  float rel=uv.x*uv.x*PI, el=uv.y*uv.y*PI*.5;
  vec3 view=vec3(sin(rel)*cos(el),sin(el),cos(rel)*cos(el));
  vec3 body=vec3(0.,uSinEl,sqrt(1.-uSinEl*uSinEl));
  vec3 eye=vec3(0.,RP+.01,0.);
  float len=toTop(eye,view), prev=0.;
  vec3 sum=vec3(0.), depth=vec3(0.);
  for(int i=0;i<40;i++){
    // Quadratic steps: the dense air near the eye needs the finer sampling.
    float f=float(i+1)/40., t=len*f*f, dt=t-prev;
    vec3 p=eye+view*(prev+.5*dt);
    float h=length(p)-RP;
    vec3 e=extinction(h);
    if(!hitsPlanet(p,body)){
      float ls=toTop(p,body)/16.;
      vec3 toBody=vec3(0.);
      for(int j=0;j<16;j++) toBody+=extinction(length(p+body*(float(j)+.5)*ls)-RP)*ls;
      vec3 scatter=mie?vec3(${fl(MIE_SCAT)}*exp(-h/${fl(H_MIE)})):RAY*exp(-h/${fl(H_RAY)});
      sum+=exp(-depth-e*dt*.5-toBody)*scatter*dt;
    }
    depth+=e*dt;
    prev=t;
  }
  o=vec4(sqrt(sum),1.);
}`;
