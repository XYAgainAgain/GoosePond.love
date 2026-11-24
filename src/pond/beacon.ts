const DEG = Math.PI / 180;
const TURN = 2 * Math.PI;
const EARTH_M = 6_371_000;
const WATER_M = 4;
const OMEGA = 36 * DEG;
const SEPARATION = 75.6 * DEG;
// USCG Visual Signals p. C-5, after glazing; Blondel–Rey peak.
const PEAK_CD = 396_000 * (0.2 + 0.11) / 0.11;
// Eye adaptation: a full-moon-lit cloud (0.27 lux, albedo 0.8) reads as cloudLight's 0.1 in sky.ts.
// GLOW_CD_M2 assumes a dark rural overcast.
const MOON_CLOUD_CD_M2 = 0.27 * 0.8 / Math.PI, GLOW_CD_M2 = 1e-4;
const unitsPerCdM2 = (moon: number) => 0.1 / (GLOW_CD_M2 + MOON_CLOUD_CD_M2 * moon);

// USCG Light List 525.
const lampLat = (41 + 40 / 60 + 16.738 / 3600) * DEG;
const lampLon = -(69 + 57 / 60 + 0.564 / 3600);
const wrap = (x: number) => ((x % TURN) + TURN) % TURN;

export function beaconSite(lat: number, lon: number) {
  const eyeLat = lat * DEG, deltaLon = (lampLon - lon) * DEG;
  const west = -EARTH_M * Math.cos(lampLat) * Math.sin(deltaLon);
  const south = -EARTH_M * (
    Math.cos(eyeLat) * Math.sin(lampLat) -
    Math.sin(eyeLat) * Math.cos(lampLat) * Math.cos(deltaLon)
  );
  const y = 80 * 0.3048 - WATER_M - (west * west + south * south) / (2 * EARTH_M);
  return { lamp: [west, y, south] as [number, number, number], pondAz: Math.atan2(-west, -south) };
}

// GE Q1000T20BP: Planckian-locus xy → linear sRGB at Y = 1.
const T = 3050;
const x = -0.2661239e9 / T ** 3 - 0.234358e6 / T ** 2 + 0.8776956e3 / T + 0.179910;
const y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
const X = x / y, Z = (1 - x - y) / y;
const color = [
  3.2404542 * X - 1.5371385 - 0.4985314 * Z,
  -0.969266 * X + 1.8760108 + 0.041556 * Z,
  0.0556434 * X - 0.2040259 + 1.0572252 * Z,
];

const MESOPIC_WHITE_MIX = 0.5;

export interface BeaconFrame {
  intensity: number;
  lamp: [number, number, number];
  axes: [number, number, number, number];
  angles: [number, number];
  blur: [number, number, number, number];
  next: number;
  /** m of sideways travel inside the cloud before light leaves its base. */
  spread: number;
}

const fl = (n: number) => n.toFixed(12);
/** 1 − g for raindrops (g ≈ 0.88): the share of extinction that dims diffuse light. */
export const RAIN_TRANSPORT = 0.12;
const exponent = (half: number, outer: number) =>
  Math.log(Math.log(1 / 0.15) / Math.LN2) / Math.log(outer / half);
const H_EXP = exponent(0.7, 1.1), V_EXP = exponent(2.3, 2.9);
const SUPPORT = 2.5 * DEG;
const profile = (a: number) => Math.exp(-Math.LN2 * (a / (0.7 * DEG)) ** H_EXP);
const CDF_STEPS = 16, cdfStep = SUPPORT / CDF_STEPS;
let cumulative = 0;
// Precomputed so a box filter costs two cubic lookups.
const cdf = Array.from({ length: CDF_STEPS }, (_, i) => {
  const from = profile(i * cdfStep) * cdfStep;
  const to = profile((i + 1) * cdfStep) * cdfStep;
  const delta = (from + 4 * profile((i + 0.5) * cdfStep) * cdfStep + to) / 6;
  const coefficients = [cumulative, from, 3 * delta - 2 * from - to, from + to - 2 * delta];
  cumulative += delta;
  return `vec4(${coefficients.map(fl).join(",")})`;
});
const area = 2 * cumulative;
export const BEACON_TURN_SECONDS = TURN / OMEGA;

/** moon is 0–1: moonK × night × eclipse irradiance while the moon is up. */
export function beaconFrame(
  phaseMs: number,
  elapsed: number,
  sunY: number,
  gain: number,
  moon: number,
  { lamp, pondAz }: ReturnType<typeof beaconSite>,
  spread: number,
): BeaconFrame {
  // Compass-clockwise; the phase is arbitrary.
  const az = wrap((phaseMs % 10_000) * OMEGA / 1000);
  const second = wrap(az - SEPARATION);
  const sweep = elapsed === BEACON_TURN_SECONDS ? TURN : elapsed * OMEGA;
  const turns = Math.floor(sweep / TURN), remainder = sweep % TURN;
  const half = remainder / 2;
  const a = az - half, b = second - half;
  return {
    intensity: sunY > -Math.sin(2 * DEG) ? 0 : gain * PEAK_CD * unitsPerCdM2(moon),
    lamp,
    axes: [Math.sin(a), Math.cos(a), Math.sin(b), Math.cos(b)],
    angles: [az, second],
    blur: [half, Math.tan(Math.min(1.56, half + SUPPORT)), turns * area, sweep],
    next: Math.min(wrap(pondAz - az), wrap(pondAz - second)) / OMEGA,
    spread,
  };
}

export const BEACON_CURVE_GLSL = `
const float BEACON_R=${fl(EARTH_M)};
const float BEACON_WATER=${fl(WATER_M)};
float beaconCloudDistance(vec3 v,float height){
  float bend=dot(v.xz,v.xz)/BEACON_R;
  return 2.*height/(v.y+sqrt(v.y*v.y+2.*bend*height));
}
`;

export const BEACON_GLSL = `
${BEACON_CURVE_GLSL}
uniform float uBeaconIntensity;
// A uniform bound stops ANGLE's Direct3D compiler unrolling the shaft loop.
uniform int uBeaconSteps;
uniform vec4 uBeaconAxes, uBeaconBlur;
uniform vec3 uBeaconWeather, uBeaconLamp;
uniform vec2 uBeaconWind;
uniform float uBeaconSpread;
const vec3 BEACON_COLOR=vec3(${
  color.map((channel) => fl(channel + (1 - channel) * MESOPIC_WHITE_MIX)).join(",")
});
const float BEACON_FAN_TAN=${fl(Math.tan(4 * DEG))};
const float BEACON_SKIRT_TAN=${fl(Math.tan(15 * DEG))};
const float BEACON_SUPPORT=${fl(SUPPORT)};
const float BEACON_TURN=${fl(TURN)};
const float BEACON_AREA=${fl(area)};
const vec4 BEACON_CDF[${CDF_STEPS}]=vec4[](${cdf.join(",\n")});
// Assumed spill from glazing reflections and drum leakage.
const float BEACON_SKIRT=.02;
float beaconCross(vec2 a,vec2 b){ return a.x*b.y-a.y*b.x; }
float beaconAirK(){ return 3.912/(40000.*exp(-4.6*uBeaconWeather.x)); }
// Assumption: full rain is 2 km visibility, not the veil's whiteout.
float beaconRainScatter(){ return 3.912/2000.*pow(uBeaconWeather.y,1.5); }
float beaconRainK(){ return ${fl(RAIN_TRANSPORT)}*beaconRainScatter(); }
float beaconRainSide(vec3 p){ return dot(p.xz,uBeaconWind)-uBeaconWeather.z; }
float beaconRainFraction(float a,float b){
  if(min(a,b)>=0.) return 1.;
  if(max(a,b)<=0.) return 0.;
  return max(a,b)/abs(a-b);
}
// CIM 16500.3A Table 6-13.
float beaconHorizontal(float a){ return exp2(-pow(abs(a)/${fl(0.7 * DEG)},${fl(H_EXP)})); }
float beaconCdf(float a){
  float u=abs(a)*${fl(1 / cdfStep)};
  if(u>=${CDF_STEPS}.) return sign(a)*BEACON_AREA*.5;
  float t=fract(u);
  vec4 c=BEACON_CDF[int(u)];
  return sign(a)*(((c.w*t+c.z)*t+c.y)*t+c.x);
}
bool beaconFullTurn(){ return uBeaconBlur.x==0.&&uBeaconBlur.z>0.; }
float beaconBeam(vec2 axis,vec2 q){
  if(beaconFullTurn()) return BEACON_AREA/BEACON_TURN;
  float front=dot(axis,q), side=beaconCross(axis,q);
  float halfSweep=uBeaconBlur.x;
  if(halfSweep+BEACON_SUPPORT<1.56&&(front<=0.||abs(side)>uBeaconBlur.y*front)){
    return uBeaconBlur.z/max(uBeaconBlur.w,1e-5);
  }
  float a=atan(side,front);
  if(uBeaconBlur.w<1e-5) return beaconHorizontal(a);
  float lo=a-halfSweep, hi=a+halfSweep;
  float integral=beaconCdf(hi)-beaconCdf(lo);
  if(hi>BEACON_TURN*.5) integral+=beaconCdf(hi-BEACON_TURN)+BEACON_AREA*.5;
  if(lo< -BEACON_TURN*.5) integral+=BEACON_AREA*.5-beaconCdf(lo+BEACON_TURN);
  return max(0.,uBeaconBlur.z+integral)/uBeaconBlur.w;
}
float beaconBox(float a,float w){
  float lo=a-w, hi=a+w;
  float integral=beaconCdf(hi)-beaconCdf(lo);
  if(hi>BEACON_TURN*.5) integral+=beaconCdf(hi-BEACON_TURN)+BEACON_AREA*.5;
  if(lo< -BEACON_TURN*.5) integral+=BEACON_AREA*.5-beaconCdf(lo+BEACON_TURN);
  return max(0.,uBeaconBlur.z+integral)/(uBeaconBlur.w+2.*(w-uBeaconBlur.x));
}
// spread is rad per side; two box widths soften the patch edge.
float beaconBeamSpread(vec2 axis,vec2 q,float spread){
  // The bearing is undefined straight above the lamp.
  if(beaconFullTurn()||dot(q,q)<1e-6) return BEACON_AREA/BEACON_TURN;
  float a=atan(beaconCross(axis,q),dot(axis,q));
  if(uBeaconBlur.w+spread<1e-5) return beaconHorizontal(a);
  return .5*(beaconBox(a,uBeaconBlur.x+.5*spread)+beaconBox(a,uBeaconBlur.x+1.5*spread));
}
float beaconUp(vec3 delta){
  // Assumption: the axis is level in the lamp's local tangent plane.
  return delta.y+dot(delta.xz,uBeaconLamp.xz)/BEACON_R;
}
float beaconElevation(vec3 delta){ return atan(abs(beaconUp(delta)),length(delta.xz)); }
float beaconMain(float h){ return exp2(-pow(h/${fl(2.3 * DEG)},${fl(V_EXP)})); }
float beaconSkirt(float h){ return BEACON_SKIRT*(1.-smoothstep(0.,${fl(15 * DEG)},h)); }
float beaconVertical(vec3 delta){
  float h=beaconElevation(delta);
  return beaconMain(h)+beaconSkirt(h);
}
`;
