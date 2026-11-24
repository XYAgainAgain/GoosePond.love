import { BEACON_CURVE_GLSL, RAIN_TRANSPORT } from "./beacon.ts";

// Volume and noise adapted from KELPII's clouds.ts.
export const NOISE_SIZE = 64;
export const TILE_KM = 6;
// A multiple of every noise period sampled with uDrift.
export const DRIFT_WRAP_KM = TILE_KM * 6;
const BEND_TILES = 1.5;
/** Art pixels across one cloud cell. */
export const CELL_W = 2;
export const MID_KM = 4;
const fl = (n: number) => n.toFixed(6);

export const DEPTH_GLSL = `
uniform sampler2D uDepth;
uniform bool uHasDepth;
uniform vec2 uDepthRange;
uniform vec2 uEyeOffsetM;
// uWaterline per column: the art row below the lowest land (0 if none), then the top land row.
uniform float uEyeRow;
uniform sampler2D uWaterline;
struct LandSample { vec4 rgba; float z; };
vec4 edgeTexel(sampler2D art,ivec2 lp){
  // Edge columns stretch to cover parallax.
  int w=int(uLandSize.x);
  if(lp.x<0&&lp.x>=-12) lp.x=0;
  if(lp.x>=w&&lp.x<w+12) lp.x=w-1;
  if(any(lessThan(lp,ivec2(0)))||any(greaterThanEqual(lp,ivec2(uLandSize)))) return vec4(0.);
  return texelFetch(art,lp,0);
}
int mirrorX(int x){
  int w=int(uLandSize.x), m=x%(2*w);
  if(m<0) m+=2*w;
  return m<w?m:2*w-1-m;
}
vec4 landTexel(ivec2 lp){ return edgeTexel(uLand,ivec2(mirrorX(lp.x),lp.y)); }
float landZ(ivec2 lp){
  if(!uHasDepth) return uShoreZ;
  ivec2 at=ivec2(mirrorX(lp.x),clamp(lp.y,0,int(uLandSize.y)-1));
  return mix(uDepthRange.y,uDepthRange.x,texelFetch(uDepth,at,0).r);
}
LandSample landSample(vec2 q){
  vec2 target=floor(vec2(q.x-uBandX,q.y-uHorizon+uEyeRow));
  vec2 shift=vec2(-uEyeOffsetM.x,uEyeOffsetM.y)/uRadPerPx;
  LandSample sky=LandSample(vec4(0.),uShoreZ);
  if(all(equal(shift,vec2(0.)))||!uHasDepth){
    ivec2 lp=ivec2(target-floor(shift/uShoreZ+.5));
    vec4 rgba=landTexel(lp);
    // GLSL ES disallows ?: on structs.
    if(rgba.a>=.5) return LandSample(rgba,landZ(lp));
    return sky;
  }
  float span=max(abs(shift.x),abs(shift.y));
  vec2 axis=shift/span;
  float reach=min(10.,span/uDepthRange.x);
  if(target.y<min(0.,axis.y*reach)-.5||target.y>=uLandSize.y+max(0.,axis.y*reach)+.5) return sky;
  LandSample best=sky;
  float bestError=1e6, lowError=1e6, highError=-1e6;
  for(int i=int(ceil(reach));i>=0;i--){
    vec2 source=target-floor(axis*float(i)+.5);
    vec4 rgba=landTexel(ivec2(source));
    if(rgba.a<.5) continue;
    float z=landZ(ivec2(source));
    vec2 delta=source+axis*min(10.,span/z)-target;
    if(all(equal(floor(delta+.5),vec2(0.)))) return LandSample(rgba,z);
    float error=dot(delta,delta), along=dot(delta,axis);
    lowError=min(lowError,along);
    highError=max(highError,along);
    if(error<bestError){
      best=LandSample(rgba,z);
      bestError=error;
    }
  }
  // Fill only gaps bracketed by projected land.
  if(lowError<0.&&highError>0.) return best;
  return sky;
}
vec2 landRows(float c){ return texelFetch(uWaterline,ivec2(mirrorX(int(c)),0),0).rg; }
float waterRow(float c){ return landRows(c).x; }
float shoreZ(float c){
  float w=waterRow(c);
  return landZ(ivec2(int(c),w>0.?int(w)-1:int(uLandSize.y)-1));
}
// Painted shore at screen x: art column, parallax row offset, distance. Mirrors landSample's projection.
vec3 shoreSpot(float x){
  vec2 shift=vec2(-uEyeOffsetM.x,uEyeOffsetM.y)/uRadPerPx;
  float bx=floor(x-uBandX);
  if(!uHasDepth){
    vec2 move=floor(shift/uShoreZ+.5);
    return vec3(bx-move.x,move.y,uShoreZ);
  }
  float span=max(abs(shift.x),abs(shift.y)), c=bx, z=shoreZ(bx);
  vec2 axis=span>0.?shift/span:vec2(0.);
  // As in landSample, test the largest shift first so the nearest match wins.
  for(int i=int(ceil(abs(axis.x)*min(10.,span/uDepthRange.x)));i>0;i--){
    float ci=bx-sign(axis.x)*float(i), zi=shoreZ(ci);
    if(int(floor(abs(axis.x)*min(10.,span/zi)+.5))==i){
      c=ci;
      z=zi;
      break;
    }
  }
  return vec3(c,floor(axis.y*min(10.,span/z)+.5),z);
}
float shoreAt(float x){ return shoreSpot(x).z; }
float waterlineAt(float x){
  vec3 spot=shoreSpot(x);
  float w=waterRow(spot.x);
  return w>0.?max(uHorizon,uHorizon+w-uEyeRow+spot.y):uHorizon;
}
// Between the column's painted top and waterline, a land miss is a parallax or sway gap.
bool insideLand(vec2 q){
  vec3 spot=shoreSpot(q.x);
  vec2 rows=landRows(spot.x);
  float top=uHorizon+rows.y-uEyeRow+spot.y;
  return rows.x>0.&&q.y>=top&&q.y<waterlineAt(q.x);
}
// Gap fill at q's depth shift; withFoliage patches in sway.
LandSample landFill(vec2 q){
  vec2 target=floor(vec2(q.x-uBandX,q.y-uHorizon+uEyeRow));
  vec2 shift=vec2(-uEyeOffsetM.x,uEyeOffsetM.y)/uRadPerPx;
  float z=landZ(ivec2(target)), span=max(abs(shift.x),abs(shift.y));
  vec2 move=!uHasDepth?shift/uShoreZ:span>0.?shift/span*min(10.,span/z):vec2(0.);
  ivec2 lp=ivec2(target-floor(move+.5));
  // Half-row shifts can push the lookup just past the painted edge.
  vec2 rows=landRows(float(lp.x));
  if(rows.x>0.) lp.y=clamp(lp.y,int(rows.y),int(rows.x)-1);
  vec4 rgba=landTexel(lp);
  return LandSample(rgba.a>=.5?rgba:vec4(0.),rgba.a>=.5?landZ(lp):uShoreZ);
}
`;

// Storm-free builds compile several times faster on ANGLE (Windows).
const STORMS_SWITCH = "const bool STORMS=STORMS_BUILD;";
export const withStorms = (source: string, storms: boolean) =>
  source.replace("STORMS_BUILD", String(storms));

/** Art pixels per side of a shadow texel. */
export const SHADOW_CELL = 4;
// Every lengthwise cirrus noise period must divide this distance in km.
export const JET_WRAP_KM = 180;
// One storm per cell, with periodic IDs for seamless drift.
const STORM_CELL_KM = 30, STORM_CELLS = 20;
export const STORM_WRAP_KM = STORM_CELL_KM * STORM_CELLS;
/** Drift-clock hours per storm life. */
const STORM_LIFE_H = 1.5;
/** Wrap at a whole number of lives to preserve phase and seed. */
export const STORM_AGE_WRAP_H = STORM_LIFE_H * 16;

/** Mirrors hs in LAYERS bit for bit. */
function hs(x: number, y: number, salt: number) {
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(salt, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 8) / 16777216;
}

/** Eye-relative x/z in km on [west, south], tower dimensions in km, and life fraction p in [0, 1). */
export interface StormCell {
  x: number;
  z: number;
  r: number;
  top: number;
  p: number;
}

/** Share of storm cells alive at Storms 100%. */
const STORM_SHARE = 0.7;
/** Mirrors stormDensity’s cell choice and build phase. reach is the maximum center-to-eye distance in km. */
export function stormCells(
  drift: [number, number],
  age: number,
  storms: number,
  reach: number,
  baseKm: number,
): StormCell[] {
  const out: StormCell[] = [];
  const lo = (v: number) => Math.floor((v - reach) / STORM_CELL_KM),
    hi = (v: number) => Math.floor((v + reach) / STORM_CELL_KM);
  for (let ix = lo(drift[0]); ix <= hi(drift[0]); ix++) {
    for (let iz = lo(drift[1]); iz <= hi(drift[1]); iz++) {
      const cx = ((ix % STORM_CELLS) + STORM_CELLS) % STORM_CELLS,
        cz = ((iz % STORM_CELLS) + STORM_CELLS) % STORM_CELLS;
      const t = (storms * STORM_SHARE - hs(cx, cz, 1)) / 0.06,
        born = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      if (born <= 0) continue;
      const life = age / STORM_LIFE_H + hs(cx, cz, 2), p = life - Math.floor(life);
      const gen = (Math.floor(life) % 16) * 16;
      const g = Math.min(1, p / 0.45), build = g * g * (3 - 2 * g) * born;
      const r = (4 + 2 * hs(cx, cz, gen + 5)) * (0.35 + 0.65 * build);
      const top = baseKm + 1.2 +
        (7 + (2.5 + 2.5 * hs(cx, cz, gen + 9)) * Math.min(1, 0.4 + storms) - baseKm - 1.2) * build;
      const x = STORM_CELL_KM * (ix + 0.5 + (hs(cx, cz, gen + 17) - 0.5) * 0.1) - drift[0];
      const z = STORM_CELL_KM * (iz + 0.5 + (hs(cx, cz, gen + 31) - 0.5) * 0.1) - drift[1];
      if (Math.hypot(x, z) <= reach) out.push({ x, z, r, top, p });
    }
  }
  return out;
}
const STORM_TOP_KM = 12;

/** Tileable channels: R billows (Perlin-Worley), G erosion (Worley), B wisps, and A weather. */
export const NOISE_FRAG = `#version 300 es
precision highp float;
uniform float uSlice; out vec4 o;
vec3 h33(vec3 p){
  p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123);
}
float worley(vec3 p,float n){
  vec3 i=floor(p*n),f=fract(p*n); float m=1.;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 g=vec3(x,y,z),r=g+h33(mod(i+g,n))-f;
    m=min(m,dot(r,r));
  }
  return 1.-sqrt(m);
}
float perlin(vec3 p,float n){
  vec3 i=floor(p*n),f=fract(p*n),u=f*f*f*(f*(f*6.-15.)+10.);
  float v[8];
  for(int k=0;k<8;k++){
    vec3 c=vec3(k&1,(k>>1)&1,(k>>2)&1);
    v[k]=dot(h33(mod(i+c,n))*2.-1.,f-c);
  }
  return .5+.9*mix(mix(mix(v[0],v[1],u.x),mix(v[2],v[3],u.x),u.y),mix(mix(v[4],v[5],u.x),mix(v[6],v[7],u.x),u.y),u.z);
}
float wf(vec3 p,float n){ return worley(p,n)*.625+worley(p,n*2.)*.25+worley(p,n*4.)*.125; }
float pf(vec3 p,float n){ return perlin(p,n)*.57+perlin(p,n*2.)*.29+perlin(p,n*4.)*.14; }
void main(){
  vec3 p=vec3(gl_FragCoord.xy,uSlice+.5)/${fl(NOISE_SIZE)};
  float w=wf(p,4.);
  float billow=clamp((pf(p,4.)-(1.-w)*.75)/.25+.1,0.,1.);
  o=vec4(billow,wf(p,8.),pf(p,6.),perlin(p,2.)*.7+perlin(p,4.)*.3);
}`;

/** Distances in km on the [west, up, south] axes of direction() in sky.ts. */
const VOLUME = `
uniform sampler3D uNoise;
uniform float uCover,uStratus,uBaseKm,uThick,uSigma,uHeavy,uChurn,uChurnT;

uniform float uLowSoft,uLowDetail,uLowTile;
uniform vec3 uDrift,uLightDir;
vec3 gWarp=vec3(0.);
float remap(float x,float a,float b){ return clamp((x-a)/max(b-a,.001),0.,1.); }
float density(vec3 P,float lod){
  float y=(P.y-uBaseKm)/uThick;
  if(y<=0.||y>=1.) return 0.;
  vec4 n=textureLod(uNoise,(P+uDrift+gWarp)/uLowTile,lod);
  float prof=mix(smoothstep(0.,.1,y)*(1.-smoothstep(.35,1.,y)),smoothstep(0.,.2,y)*(1.-smoothstep(.75,1.,y)),uStratus);
  prof*=mix(1.,.45+1.1*n.a,uStratus);
  float cover=clamp(uCover+(n.a-.5)*.7*(1.-uStratus),0.,1.);
  float d=remap(n.r*prof,1.-cover,1.);
  d=remap(d,(1.-d)*n.g*uLowDetail,1.);
  d=pow(d,1.+2.*uLowSoft);
  float s=uStratus*uStratus;
  return max(d,s*s*cover*prof*(.3+.5*n.g));
}
vec3 bend(vec3 q){ vec4 n=textureLod(uNoise,q,1.); return vec3(n.b-.5,n.a-.5,n.g-.6); }

float churnRay(vec3 P){
  vec3 q=(P+uDrift)/${fl(TILE_KM * BEND_TILES)}+vec3(0.,0.,uChurnT);
  vec3 b=bend(q+bend(q)*.35+vec3(.37,.11,.71));
  gWarp=b*uChurn*4.;
  return length(b);
}`;

const LAYERS = `
${VOLUME}
uniform float uMidCover,uStorms,uStormAge;

uniform float uMidSoft,uMidShade,uMidOpacity,uMidTile;
uniform vec2 uMidDrift,uStormDrift;
float lodAt(float t,float tile){ return log2(max(1.,t*.012*${fl(NOISE_SIZE)}/tile)); }
float midPeak(){ return min(1.,(.55+.35*uMidCover)*uMidOpacity); }

float midAlpha(vec2 xz,float lod){
  vec2 q=(xz+uMidDrift)/uMidTile;
  vec4 n=textureLod(uNoise,vec3(q.x,.29+uChurnT,q.y),lod);
  float field=n.g*.6+n.a*.4, edge=1.-uMidCover*.85;
  return smoothstep(edge-.1*uMidSoft,edge+.27*uMidSoft,field)*midPeak();
}
float h12(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }

float hs(vec2 cell,uint salt){
  uvec2 c=uvec2(cell);
  uint h=c.x*0x8da6b343u^c.y*0xd8163841u^salt*0xcb1ab31fu;
  h^=h>>16; h*=0x7feb352du; h^=h>>15; h*=0x846ca68bu; h^=h>>16;
  return float(h>>8)/16777216.;
}
// Change the shape seed only at zero density.
float stormLife(vec2 w,out vec2 id,out vec2 cell,out uint gen,out float born){
  id=floor(w/${fl(STORM_CELL_KM)});
  cell=mod(id,${fl(STORM_CELLS)});
  born=smoothstep(0.,.06,uStorms*${fl(STORM_SHARE)}-hs(cell,1u));
  float life=uStormAge/${fl(STORM_LIFE_H)}+hs(cell,2u);
  gen=uint(mod(floor(life),16.))*16u;
  return fract(life);
}
vec2 stormCenter(vec2 id,vec2 cell,uint gen){ return ${
  fl(STORM_CELL_KM)
}*(id+.5+(vec2(hs(cell,gen+17u),hs(cell,gen+31u))-.5)*.1); }
float stormDensity(vec3 P){
  vec2 w=P.xz+uStormDrift, id, cell;
  uint gen;
  float born, p=stormLife(w,id,cell,gen,born);
  if(born<=0.) return 0.;
  float build=smoothstep(0.,.45,p)*born, fade=1.-smoothstep(.75,.97,p);
  if(build<.01||fade<.001) return 0.;
  float R=(4.+2.*hs(cell,gen+5u))*(.35+.65*build), H=mix(uBaseKm+1.2,7.+(2.5+2.5*hs(cell,gen+9u))*min(1.,.4+uStorms),build);
  if(P.y<uBaseKm||P.y>H) return 0.;
  float anv=hs(cell,gen+13u)<.6?smoothstep(.4,.6,p)*born:0.;
  // Anvil, shear, noise, and center offset must fit within half a cell.
  vec2 center=stormCenter(id,cell,gen);
  float anvil=anv*smoothstep(H-2.2,H-1.2,P.y);
  center.x-=R*.3*smoothstep(.4,1.,P.y/H)*anv;
  float r=R*mix(1.-.25*smoothstep(.2,.8,P.y/H),1.5,anvil);
  // The margin covers the radial noise below.
  if(length(w-center)>r+R*.4) return 0.;
  // Whole vertical noise tiles per churn cycle preserve phase.
  vec4 n=textureLod(uNoise,vec3(w.x/10.,P.y*.15-uChurnT*2.,w.y/10.),2.);
  float d=length(w-center)+(n.r-.5)*R*.45+(n.a-.5)*R*.35;
  float top=mix(1.-smoothstep(H-2.5,H,P.y+(d/r)*(d/r)*2.),1.-smoothstep(H-.6,H,P.y),anv);
  float life=smoothstep(.01,.12,build)*mix(fade,sqrt(fade)*smoothstep(0.,.2,fade),anvil);
  return (1.-smoothstep(r*.6,r,d))*top*(1.-.35*anvil)*life;
}
`;

/** RGBA8 per cell, with straight RGB and opacity in A. First row is uTop. */
export const CLOUD_FRAG = `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
${STORMS_SWITCH}
${LAYERS}
uniform float uHorizon,uCenterX,uRadPerPx,uHeadAz,uFair,uTop,uCirrus,uCirrusCurl,uCirrusWidth,uCirrusPuff;
uniform vec2 uCirrusDir;
uniform vec2 uJetDrift;
uniform vec3 uLowLight,uMidLight,uHighLight,uCloudAmb,uMidDir,uHighDir;
// Mirrors Flash.cloud in lightning.ts.
uniform vec4 uFlash;
// 0–1 strength of low-sun shading, zero for moonlit decks.
uniform float uLowSun;
uniform float uBeaconEyeH;
// ANGLE (Windows) links output 0 alone and compiles the rest at first draw, so it stays trivial.
layout(location=0) out vec4 unused;
layout(location=1) out vec4 o;
layout(location=2) out vec2 lowOpacity;
${BEACON_CURVE_GLSL}
float hazeAt(float t){ return exp(-t/28.); }
float hg(float g,float mu){ return (1.-g*g)/pow(1.+g*g-2.*g*mu,1.5); }
// Mirrors cloudTint in KELPII's gl.ts.
vec3 tint(vec3 light,float lit,float amb){
  vec3 body=light*lit*5.+uCloudAmb*amb*1.2;
  // Normalize by peak to preserve sunset hue.
  body/=1.+max(body.r,max(body.g,body.b))*.5;
  body*=.68+.27*uFair;
  return body*min(1.,.92/max(.001,max(body.r,max(body.g,body.b))));
}
vec4 over(vec4 back,vec3 c,float a){ return vec4(c*a+back.rgb*(1.-a),a+back.a*(1.-a)); }
vec4 lowDeck(vec3 v,float mu){
  // Mirrors the march in KELPII's CLOUD_FRAG.
  float t0=uBaseKm/v.y,t1=(uBaseKm+uThick)/v.y,dt=(t1-t0)/5.,lod=lodAt(t0,uLowTile);
  float bent=churnRay(v*(t0+t1)*.5);
  float phase=min(4.,mix(hg(.8,mu),hg(-.5,mu),.5)),softer=min(2.,hg(.4,mu));
  float trans=1.,lit=0.,amb=0.;
  for(int i=0;i<5&&trans>.02;i++){
    vec3 P=v*(t0+dt*(float(i)+.5));
    float d=density(P,lod);
    if(d<.002) continue;
    float near=density(P+uLightDir*.15,lod+1.),far=density(P+uLightDir*.55,lod+2.);
    float tl=(near*.15+far*.4)*uSigma;
    // Weaker extinction and broader phase approximate multiple scattering.
    float bounce=exp(-tl)*phase+.5*exp(-.5*tl)*softer+.25*exp(-.25*tl)+.35*uFair;
    float powder=1.-exp(-5.*d);
    float tau=d*uSigma*dt;
    float w=trans*(1.-exp(-tau));
    lit+=w*bounce*powder;
    amb+=w*mix(.3,1.,clamp((P.y-uBaseKm)/uThick,0.,1.))*(.55+.8*d);
    trans*=exp(-tau);
  }
  float seen=1.-trans;
  if(seen<.001) return vec4(0.);
  float bruise=smoothstep(.06,.42,bent)*uChurn;
  float ambient=amb/seen*(1.-.65*bruise);
  vec3 col=tint(uLowLight,min(1.,lit/seen*.25)*(1.-.55*bruise),ambient);
  // Blend tints after normalization to preserve the shade.
  float under=smoothstep(.8,.99,mu)*(1.-smoothstep(.03,.14,v.y));
  float sunlit=mix(1.,mix(max(.05,1.-1.1*sqrt(uCover)),1.,under),uLowSun);
  return vec4(mix(tint(vec3(0.),0.,ambient),col,sunlit),seen*hazeAt(t0));
}
float beaconDeckOpacity(vec3 v){
  float t0=beaconCloudDistance(v,uBaseKm*1000.-uBeaconEyeH)*.001;
  if(t0>=40.) return 0.;
  float t1=beaconCloudDistance(v,(uBaseKm+uThick)*1000.-uBeaconEyeH)*.001;
  float dt=(t1-t0)/5., lod=lodAt(t0,uLowTile), tau=0.;
  for(int i=0;i<5&&tau<4.;i++){
    float t=t0+(float(i)+.5)*dt;
    float height=v.y*t+dot(v.xz,v.xz)*t*t*500./BEACON_R+uBeaconEyeH*.001;
    float d=density(vec3(v.x*t,height,v.z*t),lod);
    if(d>=.002) tau+=d*uSigma*dt;
  }
  return (1.-exp(-tau))*hazeAt(t0);
}
vec4 midLayer(vec3 v,float mu){
  float t=${fl(MID_KM)}/v.y, a=midAlpha(v.xz*t,lodAt(t,uMidTile)*.5);
  if(a<=0.) return vec4(0.);
  float lit=.25*(.7+.5*min(3.,hg(.6,mu)))*(1.-uMidShade*a/midPeak());
  float sunlit=mix(1.,mix(max(.1,1.-.9*sqrt(uCover)),1.,smoothstep(.8,.99,mu)*(1.-smoothstep(.05,.2,v.y))),uLowSun);
  return vec4(mix(tint(vec3(0.),0.,.85),tint(uMidLight,lit,.85),sunlit),a*hazeAt(t*.6));
}
// Adapted from KELPII’s cirrusAt.

vec2 ribbonAt(vec2 P){
  vec2 a=vec2(dot(P,uCirrusDir),dot(P,vec2(-uCirrusDir.y,uCirrusDir.x)));
  vec2 s=vec2(a.x+.4*a.y,a.y);
  s.x+=uJetDrift.x;
  s.y+=(textureLod(uNoise,vec3(s.x/36.,.61,s.y/45.),2.).a-.5)*uCirrusCurl;
  return s;
}
float ribbonBody(vec2 s){
  vec4 n=textureLod(uNoise,vec3(s.x/90.,.37+uChurnT,s.y/uCirrusWidth),1.);
  return smoothstep(.55-.15*uCirrus-.08*uCirrusPuff,.72+.1*uCirrusPuff,n.b*.6+n.a*.4)*uCirrus;
}
float cirrusAt(vec2 P){
  vec2 s=ribbonAt(P);
  float fiber=textureLod(uNoise,vec3(s.x/18.,.83+uChurnT,s.y/1.2),0.).b;
  float lumps=textureLod(uNoise,vec3(s.x/18.,.47+uChurnT,s.y/3.),1.).r;
  return ribbonBody(s)*mix(.55+.45*fiber,1.,.7*uCirrusPuff)*mix(1.,.3+lumps,uCirrusPuff);
}
vec4 cirrusSheet(vec3 v,float mu){
  float t=9./max(v.y,.06);
  vec2 P=(v*t).xz;
  float c=cirrusAt(P);
  if(c<=0.) return vec4(0.);
  // Omit fiber and lump lookups from light probes to cap texture fetches.
  vec2 L=uHighDir.xz/max(length(uHighDir.xz),.15);
  float side=exp(-2.5*(ribbonBody(ribbonAt(P+L*.9))*.6+ribbonBody(ribbonAt(P+L*2.2))*.4));
  float lit=.25*(.9+.6*min(3.,hg(.7,mu)))*mix(.25,2.4,side);
  vec3 col=tint(uHighLight,lit,.9*mix(.7,1.,side));
  // Desaturation approximates multiple scattering in ice.
  float top=max(col.r,max(col.g,col.b));
  return vec4(mix(col,vec3(top),.3*side),min(.95,c*1.5)*hazeAt(t*.25));
}
// Ray bounds in km. Split segments share one step budget.
vec4 towers(vec3 v,float mu,float jitter,float t0,float t1,int steps){
  if(t1<=t0||steps<1) return vec4(0.);
  float dt=(t1-t0)/float(steps),trans=1.,lit=0.,amb=0.,bolt=0.;
  float phase=min(4.,mix(hg(.8,mu),hg(-.5,mu),.5));
  for(int i=0;i<32&&i<steps&&trans>.03;i++){
    vec3 P=v*(t0+dt*(float(i)+jitter));
    float d=stormDensity(P);
    if(d<.01) continue;
    float tl=stormDensity(P+uMidDir*1.2)*10.;
    float tau=d*8.*dt, w=trans*(1.-exp(-tau));
    lit+=w*(exp(-tl)*phase+.5*exp(-.5*tl)+.25)*(1.-exp(-4.*d));
    amb+=w*mix(.35,1.,P.y/${fl(STORM_TOP_KM)});
    if(uFlash.w>0.){ vec3 f=P-uFlash.xyz; bolt+=w*exp(-dot(f,f)/16.); }
    trans*=exp(-tau);
  }
  float seen=1.-trans;
  if(seen<.001) return vec4(0.);
  vec3 col=tint(uMidLight,min(1.,lit/seen*.25),amb/seen)+vec3(.62,.67,.76)*uFlash.w*min(1.5,bolt/seen*3.);
  return vec4(col,seen*hazeAt(t0*.5));
}

float rainAt(vec2 xz){
  vec2 w=xz+uStormDrift, id, cell;
  uint gen;
  float born, p=stormLife(w,id,cell,gen,born);
  float wet=smoothstep(.3,.5,p)*(1.-smoothstep(.8,.95,p))*born;
  if(wet<.01) return 0.;
  float R=(4.+2.*hs(cell,gen+5u))*(.35+.65*smoothstep(0.,.45,p)*born);
  return wet*(1.-smoothstep(R*.25,R*.6,length(w-stormCenter(id,cell,gen))));
}
// Shafts composite in front because they lie below the cloud base.
vec4 shafts(vec3 v,float jitter){
  float t1=min(uBaseKm/v.y,60.), dt=t1/6., tau=0., at=0.;
  for(int i=0;i<6;i++){
    float t=dt*(float(i)+jitter);
    vec3 P=v*t;
    float r=rainAt(P.xz);
    if(r<=0.) continue;
    // Whole streak tiles per STORM_AGE_WRAP_H preserve phase.
    vec2 w=P.xz+uStormDrift;
    float streak=textureLod(uNoise,vec3(w.x*.1,P.y*.3+uStormAge*9.,w.y*.1),0.).r;
    float k=r*(.35+.65*streak)*dt*.15;
    tau+=k;
    at+=k*t;
  }
  if(tau<.002) return vec4(0.);
  return vec4(tint(uLowLight,.1,.9)*.85,(1.-exp(-tau))*hazeAt(at/tau));
}
void main(){
  vec2 cc=vec2(gl_FragCoord.x*${fl(CELL_W)},gl_FragCoord.y+uTop);
  float az=uHeadAz+(cc.x-uCenterX)*uRadPerPx;
  // Ease below the 1.72° floor; a hard clamp repeats one row as vertical stripes.
  float floorEl=asin(.03), rise0=(uHorizon-cc.y)*uRadPerPx;
  float el=min(rise0>=floorEl?rise0:floorEl*exp(rise0/floorEl-1.),1.553);
  vec3 v=vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el));
  float mu=dot(v,uLightDir),muMid=dot(v,uMidDir),muHigh=dot(v,uHighDir);
  vec4 sky=vec4(0.);
  // Split storms at sheet crossings for back-to-front compositing.
  // Fixed cell jitter breaks up march bands.
  float jitter=h12(gl_FragCoord.xy), t0=uBaseKm/v.y, t1=min(${fl(STORM_TOP_KM)}/v.y,90.);
  float tMid=clamp(${fl(MID_KM)}/v.y,t0,t1), tHigh=clamp(9./max(v.y,.06),tMid,t1);
  bool storms=STORMS&&uStorms>.002;
  int beyond=int(32.*(t1-tHigh)/(t1-t0)+.5), between=int(32.*(tHigh-tMid)/(t1-t0)+.5);
  if(storms){ vec4 l=towers(v,muMid,jitter,tHigh,t1,beyond); sky=over(sky,l.rgb,l.a); }
  if(uCirrus>.002){ vec4 l=cirrusSheet(v,muHigh); sky=over(sky,l.rgb,l.a); }
  if(storms){ vec4 l=towers(v,muMid,jitter,tMid,tHigh,between); sky=over(sky,l.rgb,l.a); }
  if(uMidCover>.002){ vec4 l=midLayer(v,muMid); sky=over(sky,l.rgb,l.a); }
  if(storms){ vec4 l=towers(v,muMid,jitter,t0,tMid,max(0,32-beyond-between)); sky=over(sky,l.rgb,l.a); }
  float baseOpacity=0.;
  if(uCover>.002){
    vec4 l=lowDeck(v,mu);
    sky=over(sky,l.rgb,l.a);
    baseOpacity=l.a;
    // Below 1.72° the color pass compresses elevation, so its deck mask is not the beam's.
    float rise=max(0.,(uHorizon-cc.y)*uRadPerPx);
    if(uBeaconEyeH>=0.&&rise<.05){
      vec3 ray=vec3(sin(az)*cos(rise),sin(rise),cos(az)*cos(rise));
      baseOpacity=mix(beaconDeckOpacity(ray),baseOpacity,smoothstep(asin(.03),.05,rise));
    }
  }
  float shaftOpacity=0.;
  if(storms){ vec4 l=shafts(v,jitter); sky=over(sky,l.rgb,l.a); shaftOpacity=l.a; }
  unused=vec4(0.);
  // Storm rain dims the beam's light on the deck by RAIN_TRANSPORT of its optical depth.
  lowOpacity=vec2(baseOpacity,baseOpacity*pow(1.-min(shaftOpacity,.999),${fl(RAIN_TRANSPORT)}));
  o=vec4(sky.a>.001?sky.rgb/sky.a:vec3(0.),sky.a);
}`;

/** Sun/moon transmittance in R/G, with top row at uRowOff. */
export const SHADOW_FRAG = `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
${STORMS_SWITCH}
${LAYERS}
uniform float uHorizon,uCenterX,uRadPerPx,uHeadAz,uEyeH,uShoreZ,uSpread,uRowOff,uBandX;
uniform vec2 uLandSize;
uniform sampler2D uLand;
${DEPTH_GLSL}
uniform vec3 uSunDir,uMoonDir;
out vec4 o;
// Mirrors SHADOW_FRAG in KELPII's clouds.ts.
float through(vec3 P0,vec3 dir){
  if(dir.y<-.1) return 1.;
  vec3 L=normalize(vec3(dir.x,max(dir.y,.05),dir.z));
  vec3 side=normalize(cross(L,vec3(0.,1.,0.))+vec3(1e-4,0.,0.));
  float lit=0.;
  for(int j=-2;j<=2;j++){
    vec3 P=P0+side*float(j)*.08;
    float tau=0.;
    if(uCover>.002){
      float t0=max(0.,uBaseKm-P.y)/L.y,t1=max(0.,uBaseKm+uThick-P.y)/L.y,dt=(t1-t0)/6.;
      churnRay(P+L*(t0+t1)*.5);
      for(int i=0;i<6;i++) tau+=density(P+L*(t0+dt*(float(i)+.5)),1.5)*dt*uSigma;
    }
    if(STORMS&&uStorms>.002){
      float t0=max(0.,uBaseKm-P.y)/L.y,t1=min((12.-P.y)/L.y,90.),dt=(t1-t0)/8.;
      for(int i=0;i<8;i++) tau+=stormDensity(P+L*(t0+dt*(float(i)+.5)))*8.*dt;
    }
    float ray=exp(-tau);
    if(uMidCover>.002) ray*=1.-.85*midAlpha((P+L*((${fl(MID_KM)}-P.y)/L.y)).xz,1.);
    lit+=ray;
  }
  return lit/5.;
}
void main(){
  // Align the horizon to a texel boundary. Mirrors shadowAt in render.ts.
  vec2 px=vec2(gl_FragCoord.x*${fl(SHADOW_CELL)},gl_FragCoord.y*${fl(SHADOW_CELL)}+uRowOff);
  float az=uHeadAz+(px.x-uCenterX)*uRadPerPx, d=px.y-uHorizon;
  // Sample the lowest painted texel to include one-pixel shorelines.
  vec2 corner=px-vec2(${fl((SHADOW_CELL - 1) / 2)}), ground=px;
  float Z=uShoreZ;
  bool land=false;
  for(int k=${SHADOW_CELL * SHADOW_CELL - 1};k>=0;k--){
    vec2 q=corner+vec2(k%${SHADOW_CELL},k/${SHADOW_CELL});
    LandSample sampleAt=landSample(q);
    if(sampleAt.rgba.a<.5) continue;
    Z=sampleAt.z;
    ground=q;
    land=true;
    break;
  }
  if(d>0.&&!land) Z=min(shoreAt(px.x),uEyeH/tan(min(d*uRadPerPx,1.5)));
  float rise=d<0.||land?uEyeH+Z*tan(clamp((uHorizon-ground.y)*uRadPerPx,-1.2,1.2)):0.;
  // As KELPII's SHADOW_SPREAD: one cloud cell can't shadow the whole pond.
  vec3 P0=vec3(sin(az)*Z*uSpread,rise,cos(az)*Z*uSpread)*.001;
  o=vec4(through(P0,uSunDir),through(P0,uMoonDir),0.,1.);
}`;
