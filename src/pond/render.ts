import { SKY_ALT, SKY_FRAG } from "./sky/sky.ts";
import { J2000_TO_GALACTIC, type MilkyWayMap } from "./sky/stars.ts";
import {
  CELL_W,
  CLOUD_FRAG,
  DEPTH_GLSL,
  NOISE_FRAG,
  NOISE_SIZE,
  SHADOW_CELL,
  SHADOW_FRAG,
  withStorms,
} from "./clouds.ts";
import { PLANET_COLORS, STAR_PALETTE, type Starfield } from "./starfield.ts";
import { FOG_FRAG } from "./fog.ts";
import { RAIN_FRAG } from "./rain.ts";
import { BOLT_BREAK, BOLT_POINTS } from "./lightning.ts";
import { Foliage, sourceGlsl, withFoliage } from "./foliage.ts";
import { BEACON_GLSL, type BeaconFrame } from "./beacon.ts";

// Mirrors SKY_W and SKY_H in KELPII's gl.ts.
const SKY_W = 64, SKY_H = 48;
const PI = Math.PI;
const fl = (n: number) => n.toFixed(8);

const VERT = `#version 300 es
void main(){ gl_Position=vec4(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.,0.,1.); }`;

const palette = Array.from(
  { length: STAR_PALETTE.length / 3 },
  (_, i) => `vec3(${Array.from(STAR_PALETTE.subarray(i * 3, i * 3 + 3), fl).join(",")})`,
).join(",");
const g = J2000_TO_GALACTIC;
// GLSL mat3 takes columns, while the source matrix is row-major.
const galactic = [g[0], g[3], g[6], g[1], g[4], g[7], g[2], g[5], g[8]].map(fl).join(",");
const MOVING_DEPTH_GLSL = withFoliage(DEPTH_GLSL);
/** Rows of bark that tile past the art's top and bottom. */
const FORE_BAND = 16;

const SCENE_HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
// A false switch drops code whose uniforms are zero, which compiles faster on ANGLE (Windows).
const bool SCENE_BUILD;
uniform sampler3D uSky; uniform sampler2D uLand, uMilkyWay;
uniform highp usampler2D uStars;
uniform sampler2D uCloud, uCloudLow, uShadow;
uniform bool uClouds, uShowShadow, uShowDepth;
uniform vec3 uRimLight, uCloudLightDir;
uniform float uRim, uRimStrength, uGrade, uSunset, uCloudTop;
uniform mat3 uLocalToJ2000;
uniform float uMilkyVis, uStarGain, uMilkyGain;
// Mirrors Starfield.planets in starfield.ts.
uniform vec4 uPlanets[5];
uniform vec3 uPlanetColors[5];
// Shadow offset and umbra/penumbra radii in lunar radii. Zero penumbra disables the eclipse.
uniform vec4 uEclipse;
uniform float uEclipseSoft;
uniform vec3 uEclipseCore, uEclipseRim;
uniform vec2 uRes, uLandSize;
uniform float uHorizon, uBandX, uRadPerPx, uHeadAz, uBodyR, uT, uWind, uBands, uHaze;
uniform int uBayer;
// Sun xy, moon zw: sine of altitude, then skySlice depth.
uniform vec4 uSkyAlt;
uniform float uSunAz, uMoonAz, uSkyE, uMoonE, uMoonVis, uMoonK, uSunBeam, uMoonBeam, uSkySat, uMieGain;
// Azimuth, then apparent elevation in radians.
uniform vec2 uSunAt, uMoonAt;
// Mirrors Frame.rain.front.
uniform float uRainFront, uBaseKm;
// Upwind unit vector on [west, south], shared by rain and fog.ts.
uniform vec2 uFogFrom;
uniform float uWindMs, uSlope, uAmb, uLightI, uFog, uRain, uEyeH, uShoreZ, uGlintScale, uMirror, uLandFill, uSunShare, uShadowOff;
uniform vec2 uWindTo, uPawDrift, uWaveDrift;
uniform vec3 uSunGlint, uMoonGlint, uAmbTint, uLightCol;
uniform vec3 uSunCol, uMoonCol, uMoonLight;
uniform float uBowSun, uBowMoon, uHalo, uCorona;
// Flash spread in radians and bolt points in art pixels. Mirrors Flash in lightning.ts.
uniform float uFlashSky, uFlashPatch, uFlashSpread, uBoltGlow;
uniform vec3 uFlashDir;
uniform vec2 uBolt[${BOLT_POINTS}];
uniform int uBoltN;
const vec3 FLASH=vec3(.62,.67,.76);

vec3 flashAt(vec3 v,float wash,float storm){
  float a=acos(clamp(dot(v,uFlashDir),-1.,1.))/uFlashSpread;
  return FLASH*(wash*uFlashSky+storm*uFlashPatch*exp(-a*a));
}
uniform vec3 uHaloTint, uHaloDir;
const float PI=${fl(PI)};
const vec3 MOONLIGHT=vec3(.62,.72,1.);

float bayer(ivec2 p,int levels){
  int v=0;
  for(int i=0;i<levels;i++){
    int x=(p.x>>i)&1, y=(p.y>>i)&1;
    v=(v<<2)|((x^y)<<1)|y;
  }
  return (float(v)+.5)/float(1<<(2*levels));
}

float wrapPi(float a){ return mod(a+PI,2.*PI)-PI; }
float hash(ivec3 v){
  uint h=uint(v.x)*0x8da6b343u+uint(v.y)*0xd8163841u+uint(v.z)*0xcb1ab31fu;
  h^=h>>15; h*=0x2c1b3c6du; h^=h>>12; h*=0x297a2d39u; h^=h>>15;
  return float(h>>8)/16777216.;
}

// Mirrors skyLight in KELPII's gl.ts.
vec3 skyLight(vec2 alt,float az,float bodyAz,float el){
  float rel=abs(wrapPi(az-bodyAz));
  vec3 at=vec3(sqrt(rel/PI),clamp(sqrt(el/${fl(PI / 2)}),${fl(0.5 / SKY_H)},${
  fl(1 - 0.5 / SKY_H)
})*.5,alt.y);
  vec3 ray=texture(uSky,at).rgb, mie=texture(uSky,at+vec3(0.,.5,0.)).rgb;
  float mu=sin(el)*alt.x+cos(rel)*cos(el)*sqrt(1.-alt.x*alt.x), k=1.+mu*mu;
  return ray*ray*(${fl(3 / (16 * PI))}*k)+uMieGain*mie*mie*(${
  fl((3 / (8 * PI)) * (1 - 0.64) / (2 + 0.64))
}*k/pow(1.64-1.6*mu,1.5));
}

vec3 air(float az,float el){
  vec3 radiance=skyLight(uSkyAlt.xy,az,uSunAz,el)*uSkyE+skyLight(uSkyAlt.zw,az,uMoonAz,el)*uMoonE;
  vec3 s=pow(1.-exp(-radiance),vec3(1./2.2));
  // Daylight saturation is calibrated against pond photos.
  s=max(vec3(0.),mix(vec3(dot(s,vec3(.2126,.7152,.0722))),s,uSkySat));
  return s+vec3(.01,.014,.024);
}

const vec3 STAR_COLORS[16]=vec3[16](${palette});
const mat3 EQU_TO_GAL=mat3(${galactic});
float refraction(float deg){
  float h=max(-1.5,deg);
  return 1.02/tan(radians(h+10.3/(h+5.11)))/60.;
}
// Inverts refraction like starView in KELPII's starfield.ts.
vec3 viewDir(float az,float app){
  float a=degrees(app), el=a;
  for(int i=0;i<4;i++) el=a-refraction(el);
  float e=radians(el);
  return vec3(sin(az)*cos(e),sin(e),cos(az)*cos(e));
}
// Mirrors the Milky Way band in realStarfield in KELPII's starfield.ts.
vec3 milkyWay(float az,float app){
  if(uMilkyVis<=.002) return vec3(0.);
  vec3 v=viewDir(az,app), g=EQU_TO_GAL*(uLocalToJ2000*v);
  vec2 uv=vec2(fract(.5-atan(g.y,g.x)/${fl(2 * PI)}),.5-asin(clamp(g.z,-1.,1.))/PI);
  return vec3(.44,.53,.72)*pow(texture(uMilkyWay,uv).r,1.15)*.19*uMilkyVis*smoothstep(0.,.16,v.y)*uMilkyGain;
}

const ivec2 CROSS[5]=ivec2[5](ivec2(0),ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1));
// Mirrors realStarfield in KELPII's starfield.ts.

vec3 points(ivec2 ci,float app,bool mirrored){
  vec3 r=vec3(0.);
  ivec2 size=textureSize(uStars,0);
  // Scintillation grows with airmass.
  float amp=.07+.18*(1.-sin(app));
  for(int k=0;k<5;k++){
    ivec2 c=ci+CROSS[k];
    if(any(lessThan(c,ivec2(0)))||any(greaterThanEqual(c,size))) continue;
    uvec4 cell=texelFetch(uStars,c,0);
    if(cell.r<(k>0?6u:mirrored?2u:1u)) continue;
    bool dust=cell.r==1u;
    float id=float(cell.a), twinkle=1.+(dust?.04:amp)*sin(uT*3.7+id)*sin(uT*2.3+id*1.73);
    vec3 color=dust?vec3(.62,.7,.9)*uMilkyVis*.46*uMilkyGain:STAR_COLORS[int(cell.g)]*uStarGain;
    r+=color*float(cell.b)/255.*twinkle*(k>0?.3:1.);
  }
  for(int i=0;i<5;i++){
    ivec2 d=abs(ci-ivec2(uPlanets[i].xy));
    int n=d.x+d.y;
    r+=uPlanetColors[i]*uPlanets[i].z*uStarGain*(n==0?1.:n==1&&uPlanets[i].w>1.5?.3:0.);
  }
  return r;
}

// q in lunar radii on the disc's right/up axes. Mirrors eclipseMoon in KELPII's gl.ts.
vec3 eclipseMoon(vec2 q,float b,vec3 c){
  if(uEclipse.w<=0.) return c;
  float d=length(q-uEclipse.xy), edge=d-uEclipse.z;
  float direct=pow(smoothstep(uEclipse.z,uEclipse.w,d),.4);
  float shadow=1.-smoothstep(0.,uEclipseSoft,edge);
  float rim=1.-smoothstep(0.,.7,max(0.,-edge));
  return c*direct+uMoonCol*mix(uEclipseCore,uEclipseRim,rim)*(.45+.55*clamp(b,0.,1.))*shadow;
}

float azAt(float x){ return uHeadAz+(x-uBandX-uLandSize.x*.5)*uRadPerPx; }
${MOVING_DEPTH_GLSL}
// White marks foreground depth, which is excluded from reflections.
uniform sampler2D uFore;
uniform bool uHasFore;
uniform float uForeRise;
${sourceGlsl("foreSource", "uForeFoliage", "uForeRows")}
// Trunk runs on the art's top row (0–3) and bottom row (4–7): x0, x1, and lean in px per row. Mirrors trunkEdges.
uniform vec4 uForeEdge[8];
// Past the art, mirror-tile each trunk's edge band along its lean.
vec4 foreBeyond(ivec2 lp){
  int h=int(uLandSize.y), past=lp.y<0?-lp.y-1:lp.y-h, t=past%${2 * FORE_BAND};
  int sy=t<${FORE_BAND}?t:${2 * FORE_BAND - 1}-t;
  if(lp.y>=h) sy=h-1-sy;
  float edge=lp.y<0?0.:float(h-1), x=float(lp.x);
  for(int i=0;i<8;i++){
    if((i<4)!=(lp.y<0)) continue;
    vec4 run=uForeEdge[i];
    float dx=run.z*(float(lp.y)-edge);
    if(x<run.x+dx-.5||x>run.y+dx+.5) continue;
    return edgeTexel(uFore,foreSource(ivec2(lp.x-int(floor(run.z*float(lp.y-sy)+.5)),sy)));
  }
  return vec4(0.);
}
vec4 foreAt(vec2 p){
  vec2 shift=vec2(-uEyeOffsetM.x,uEyeOffsetM.y)/uRadPerPx;
  float span=max(abs(shift.x),abs(shift.y));
  // Mirrors landSample’s projection in clouds.ts.
  vec2 move=span>0.?shift/span*min(10.,span/uDepthRange.x):vec2(0.);
  ivec2 lp=ivec2(floor(vec2(p.x-uBandX,p.y-uHorizon+uEyeRow+uForeRise))-floor(move+.5));
  if(lp.y<0||lp.y>=int(uLandSize.y)) return foreBeyond(lp);
  return edgeTexel(uFore,foreSource(lp));
}

vec2 shadowAt(vec2 q){
  if(!uClouds) return vec2(1.);
  // Clamp sampling to one side of the horizon. Mirrors SHADOW_FRAG in clouds.ts.
  float y=q.y<uHorizon?min(q.y,uHorizon-${fl(SHADOW_CELL / 2)}):max(q.y,uHorizon+${
  fl(SHADOW_CELL / 2)
});
  return texture(uShadow,vec2(q.x,y-uShadowOff)/(${
  fl(SHADOW_CELL)
}*vec2(textureSize(uShadow,0)))).rg;
}
// lightFor’s ambient sets intensity: the exposure-adapted sky stays bright through dusk.

vec3 fillAt(float az){
  vec3 sky=air(az,.8), hue=sky/max(.001,max(sky.r,max(sky.g,sky.b)));
  return mix(vec3(dot(hue,vec3(.2126,.7152,.0722))),hue,.5)*uAmb*uLandFill;
}


float facing(float az,vec2 body){
  float s=max(0.,sin(body.y));
  return .35*s+.75*max(0.,-cos(az-body.x))*sqrt(1.-s*s);
}
// Koschmieder inverse visibility in m⁻¹.
float airK(){ return 1./(40000.*exp(-4.6*uFog)); }
float rainK(){ return (exp(7.*uRain)-1.)/20000.; }
float rainHere(float az,float Z){
  return smoothstep(-25.,25.,Z*dot(vec2(sin(az),cos(az)),uFogFrom)-uRainFront);
}
// m of the ray inside the rain.
float rainPath(float az,float Z){
  float lead=dot(vec2(sin(az),cos(az)),uFogFrom);
  if(abs(lead)<.001) return uRainFront<0.?Z:0.;
  float at=uRainFront/lead;
  return lead>0.?max(0.,Z-max(0.,at)):clamp(at,0.,Z);
}
float haze(float az,float Z){ return 1.-exp(-3.912*(airK()*Z+rainK()*rainPath(az,Z))); }
float rayLength(float el){ return min(1500./max(sin(el),.001),60000.); }
// Cap the rain veil to preserve cloud contrast.
float rainVeil(float az,float el){ return .8*(1.-exp(-3.912*rainK()*rainPath(az,rayLength(el)))); }

vec3 veil(float az,float L){
  vec3 a=air(az,0.), grey=vec3(dot(a,vec3(.2126,.7152,.0722)))*min(1.,3.*uAmb)*.6+.6*uAmb*uAmbTint;
  float rain=rainK()*rainPath(az,L)/L;
  return mix(a,grey,rain/(airK()+rain));
}
vec3 litLand(vec3 albedo,float az,vec2 q,float Z){
  vec2 lit=shadowAt(q);
  vec3 light=fillAt(az)+uSunCol*uSunBeam*facing(az,uSunAt)*lit.x+MOONLIGHT*uMoonBeam*facing(az,uMoonAt)*lit.y+flashAt(vec3(sin(az),0.,cos(az)),.35,.35);
  return mix(albedo*light,veil(az,Z),max(uHaze*Z/uShoreZ,haze(az,Z)));
}

float landAt(vec2 q){
  return step(.5,landSample(q).rgba.a);
}

ivec2 cloudCell(vec2 q){ return ivec2(floor(q.x/${fl(CELL_W)}),floor(q.y)-uCloudTop); }
vec4 cloudTexel(ivec2 c){
  if(!uClouds||any(lessThan(c,ivec2(0)))||any(greaterThanEqual(c,textureSize(uCloud,0)))) return vec4(0.);
  return texelFetch(uCloud,c,0);
}
vec4 cloudAt(vec2 q){ return cloudTexel(cloudCell(q)); }
bool cloudEdge(vec2 q,float op){
  if(op<.45) return false;
  ivec2 c=cloudCell(q), last=textureSize(uCloud,0)-1;
  float clear=1.;
  int solid=0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    if(x==0&&y==0) continue;
    // Clamping keeps the frame border from registering as clear sky.
    float a=cloudTexel(clamp(c+ivec2(x,y),ivec2(0),last)).a;
    clear=min(clear,a);
    solid+=a>=.45?1:0;
  }
  return clear<.12&&solid>=4;
}

vec4 rimmed(vec4 cloud,vec2 q,float az,float el){
  vec3 v=vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el));
  bool backlit=smoothstep(.55,.9,dot(v,uCloudLightDir))>.5&&uCloudLightDir.y>-.05;
  if(!backlit||uRim<=0.||!cloudEdge(q,cloud.a)) return cloud;
  float k=uRim*uRimStrength;
  return vec4(mix(cloud.rgb,uRimLight,k),max(cloud.a,.9*k));
}


vec3 grade(vec3 c){
  float l=dot(c,vec3(.2126,.7152,.0722)), k=uGrade;
  c=mix(c,c*vec3(.82,.86,1.08),(1.-l)*.6*k);
  c=mix(c,c*vec3(1.06,.95,.9),l*uSunset*k);
  return mix(c,vec3(c.r,c.g*.88,c.b*1.18+.02),uSunset*k*.8);
}

// Mirrors spectrum in KELPII’s gl.ts. Input in [0, 1] runs violet → red.
vec3 spectrum(float t){
  vec3 c=vec3(smoothstep(.5,.9,t)+.35*(1.-smoothstep(0.,.18,t)),1.-smoothstep(.12,.45,abs(t-.52)),1.-smoothstep(.12,.5,t));
  return c*smoothstep(0.,.2,t)*(1.-smoothstep(.8,1.,t));
}
vec3 dirAt(vec2 at){ return vec3(sin(at.x)*cos(at.y),sin(at.y),cos(at.x)*cos(at.y)); }
float degFrom(vec3 v,vec3 dir){ return degrees(acos(clamp(dot(v,dir),-1.,1.))); }
// Primary and secondary rainbow angle bands mirror KELPII’s addBows.
vec3 bows(vec3 v,vec3 dir,float sat){
  float a=degFrom(v,-dir);
  if(a>53.7) return vec3(0.);
  vec3 c=1.8*spectrum((a-40.6)/1.8)+.85*spectrum((53.4-a)/3.);
  c=mix(vec3(dot(c,vec3(.33))),c,sat*.8);
  return c+vec3(.22*smoothstep(28.,40.6,a)*(1.-step(40.6,a))-.08*step(42.4,a)*(1.-step(50.4,a)));
}
vec3 optics(vec2 q,float a){
  float az=azAt(q.x), el=(uHorizon-q.y)*uRadPerPx;
  // Mirrors scene’s elevation cutoff.
  if(el>1.553) return vec3(0.);
  vec3 v=dirAt(vec2(az,el)), o=vec3(0.);
  if(uBowSun>.002) o+=.28*uBowSun*uSunCol*bows(v,dirAt(uSunAt),1.);
  // Moonbows are colorless to night vision.
  if(uBowMoon>.002) o+=.28*uBowMoon*bows(v,dirAt(uMoonAt),0.);
  if(uHalo>.002){
    float h=degFrom(v,uHaloDir);
    if(h>21.6&&h<23.2) o+=uHalo*.22*(.4+.6*a)*uHaloTint*mix(vec3(1.,.55,.35),vec3(.9,.94,1.),smoothstep(21.6,23.,h));
  }
  if(uCorona>.002){
    float r=degFrom(v,dirAt(uMoonAt)), r0=degrees(uBodyR);
    if(r<5.&&r>r0*1.05){
      vec3 ring=spectrum((r-2.)/2.2);
      vec3 c=mix(vec3(.85,.9,1.),mix(vec3(dot(ring,vec3(.33))),ring,.25),smoothstep(1.4,2.1,r));
      float fall=exp(-(r-r0)/1.5)*(1.-smoothstep(4.,5.,r));
      o+=uCorona*.12*uMoonVis*uMoonCol*c*fall*smoothstep(.05,.3,a)*(1.-smoothstep(.85,1.,a));
    }
  }
  if(uBoltN>1){
    float d=1e3;
    // A uniform bound stops Direct3D unrolling all ${BOLT_POINTS} points (ANGLE on Windows).
    for(int i=0;i<min(uBoltN,${BOLT_POINTS})-1;i++){
      vec2 p0=uBolt[i],p1=uBolt[i+1];
      if(p0.x<${BOLT_BREAK / 2}.||p1.x<${BOLT_BREAK / 2}.) continue;
      vec2 ab=p1-p0;
      d=min(d,length(q-p0-ab*clamp(dot(q-p0,ab)/max(dot(ab,ab),1e-4),0.,1.)));
    }
    o+=uBoltGlow*(1.-.7*a)*(step(d,.71)*vec3(1.)+.35*exp(-.6*d)*vec3(.7,.75,1.));
  }
  return o;
}

// The caller composites cloud and quantizes the scene before adding lights.
vec4 scene(vec2 q,LandSample land,bool mirrored,out vec3 lights,out vec4 cloud){
  lights=vec3(0.);
  cloud=vec4(0.);
  float rise=(uHorizon-q.y)*uRadPerPx, az=azAt(q.x), el=clamp(rise,0.,1.553);
  if(land.rgba.a>=.5) return vec4(litLand(land.rgba.rgb,az,q,land.z),1.);
  vec3 v=vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el)), s=air(az,el)+flashAt(v,.35,.8);
  float starVis=1.-smoothstep(.05,.3,max(s.r,max(s.g,s.b)));
  vec2 mv=vec2(wrapPi(az-uMoonAt.x),el-uMoonAt.y)/uBodyR;
  float mr=dot(mv,mv);
  if(rise>1.553) return vec4(s,0.);
  if(starVis>.001&&mr>=1.3){
    s+=milkyWay(az,el)*starVis;
    lights=points(ivec2(floor(q)),el,mirrored)*starVis;
  }
  if(mr<1.){
    float b=max(0.,dot(vec3(mv,sqrt(1.-mr)),uMoonLight));
    vec3 c=uMoonCol*(b>.03?.55+.6*b:.05*(1.-uMoonK));
    s+=eclipseMoon(mv,b,c)*uMoonVis;
  }
  vec2 sv=vec2(wrapPi(az-uSunAt.x),el-uSunAt.y)/uBodyR;
  float sr=dot(sv,sv);
  if(sr<1.) s=uSunCol*(1.9-1.14*(1.-sqrt(1.-sr)));
  vec4 raw=cloudAt(q);
  cloud=raw.a>0.?rimmed(raw,q,az,el):vec4(0.);
  cloud.rgb+=flashAt(v,1.6,1.6);
  return vec4(s,0.);
}

// With 20 m cells, the period matches WIND_WRAP_M in foliage.ts.
float vnoise(vec2 p){
  vec2 i=floor(p),f=p-i; f=f*f*(3.-2.*f);
  vec2 a=mod(i,256.),b=mod(i+1.,256.);
  float h00=hash(ivec3(a,7)),h10=hash(ivec3(b.x,a.y,7)),h01=hash(ivec3(a.x,b.y,7)),h11=hash(ivec3(b,7));
  return mix(mix(h00,h10,f.x),mix(h01,h11,f.x),f.y);
}

// Mirrors seaGlintOdds in KELPII's farsea.ts.
float glintOdds(vec2 body,vec3 g,float px,float dep){
  if(g.y<=0.) return 0.;
  float elb=asin(clamp(g.x,0.,1.)), low=1.-smoothstep(.05,.35,g.x);
  float off=wrapPi(azAt(px)-body.x);
  vec2 at=vec2(px-off/uRadPerPx,uHorizon-body.y/uRadPerPx);
  float w=length(vec2(sqrt(.003+.6076*uSlope*uSlope)*(elb+dep+.0175),uBodyR*.9*(1.+.5*low)));
  float dx=off/w;
  if(abs(dx)>3.5) return 0.;
  float t=.75*tan(.5*(elb-dep))/uSlope;
  return g.y*exp(-.5*(t*t+dx*dx))*(1.-.75*landAt(at));
}

${FOG_FRAG}
${RAIN_FRAG}
${BEACON_GLSL}

bool clipBeaconEdge(float origin,float slope,inout vec2 interval){
  if(abs(slope)<1e-7) return origin>=0.;
  float t=-origin/slope;
  if(slope>0.) interval.x=max(interval.x,t);
  else interval.y=min(interval.y,t);
  return interval.y>interval.x;
}

vec4 beaconCone(vec3 origin,vec3 v,vec2 span,float slopeLimit){
  // A symmetric cone can leave two spans on opposite sides of the lamp.
  float up=beaconUp(origin), slope=beaconUp(v), k2=slopeLimit*slopeLimit;
  float a=slope*slope-k2*dot(v.xz,v.xz);
  float b=up*slope-k2*dot(origin.xz,v.xz);
  float c=up*up-k2*dot(origin.xz,origin.xz);
  vec2 empty=span.yy;
  if(abs(a)<1e-9){
    if(clipBeaconEdge(-c,-2.*b,span)) return vec4(span,empty);
    return vec4(empty,empty);
  }
  float disc=b*b-a*c;
  if(disc<=0.) return vec4(a<0.?span:empty,empty);
  float farRoot=-b-(b<0.?-1.:1.)*sqrt(disc);
  vec2 roots=vec2(farRoot/a,c/farRoot);
  float lo=clamp(min(roots.x,roots.y),span.x,span.y);
  float hi=clamp(max(roots.x,roots.y),span.x,span.y);
  return a>0.?vec4(lo,hi,empty):vec4(span.x,lo,hi,span.y);
}

vec2 beaconSpan(vec3 origin,vec3 v,vec2 axis,vec2 interval){
  if(uBeaconBlur.z==0.&&uBeaconBlur.x+BEACON_SUPPORT<1.56){
    float x=dot(axis,origin.xz)*uBeaconBlur.y, y=beaconCross(axis,origin.xz);
    float dx=dot(axis,v.xz)*uBeaconBlur.y, dy=beaconCross(axis,v.xz);
    if(!clipBeaconEdge(x+y,dx+dy,interval)||!clipBeaconEdge(x-y,dx-dy,interval)) return vec2(0.);
  }
  return interval;
}

vec3 beaconSkirtSpans(vec2 outer,vec4 fan,out vec3 starts){
  vec4 cut=clamp(fan,outer.x,outer.y);
  starts=vec3(outer.x,cut.y,cut.w);
  return vec3(cut.x,cut.z,outer.y)-starts;
}

float beaconSpanAngle(float offset,vec3 starts,vec3 widths){
  if(offset<widths.x) return starts.x+offset;
  offset-=widths.x;
  if(offset<widths.y) return starts.y+offset;
  return starts.z+offset-widths.y;
}

// Both beams in one loop: each inlined body copy costs about a second of ANGLE compile time.
float beaconShafts(vec3 v,vec4 outerA,vec4 outerB,vec2 a,vec2 b,bool hitA,bool hitB,float cloudT,float cloudAlpha,float mistTau){
  vec3 eye=vec3(0.,uEyeH,0.), origin=eye-uBeaconLamp;
  float center=-dot(v,origin), impact=max(1.,length(origin+center*v));
  float air=beaconAirK(), rain=beaconRainK(), rainScatter=beaconRainScatter();
  float eyeSide=beaconRainSide(eye), lampSide=beaconRainSide(uBeaconLamp);
  float light=0., sum=0.;
  vec2 axis;
  vec4 fan;
  vec3 startsA, startsB, skirtA, skirtB;
  float fanFirst, fanStep, skirtFirst, skirtStep;
  for(int j=0;j<2*uBeaconSteps;j++){
    int i=j%uBeaconSteps;
    bool second=j>=uBeaconSteps;
    if(i==0){
      if(second){
        if(hitA) light+=sum/impact;
        sum=0.;
      }
      axis=second?uBeaconAxes.zw:uBeaconAxes.xy;
      // Integrate in angle about the lamp to absorb the inverse-square factor.
      fan=atan((beaconCone(origin,v,second?b:a,BEACON_FAN_TAN)-center)/impact);
      vec4 outer=atan(((second?outerB:outerA)-center)/impact);
      fanFirst=fan.y-fan.x;
      fanStep=(fanFirst+(fan.w-fan.z))/6.;
      skirtA=beaconSkirtSpans(outer.xy,fan,startsA);
      skirtB=beaconSkirtSpans(outer.zw,fan,startsB);
      skirtFirst=dot(skirtA,vec3(1.));
      skirtStep=(skirtFirst+dot(skirtB,vec3(1.)))/2.;
    }
    if(!(second?hitB:hitA)) continue;
    bool mainLobe=i<uBeaconSteps-2;
    float stepSize=mainLobe?fanStep:skirtStep;
    if(stepSize<=0.) continue;
    float offset=(float(mainLobe?i:i-uBeaconSteps+2)+.5)*stepSize;
    float angle=mainLobe?(offset<fanFirst?fan.x+offset:fan.z+offset-fanFirst):
      (offset<skirtFirst?beaconSpanAngle(offset,startsA,skirtA):
        beaconSpanAngle(offset-skirtFirst,startsB,skirtB));
    float t=center+impact*tan(angle);
    vec3 p=eye+v*t, delta=p-uBeaconLamp;
    float altitude=BEACON_WATER+p.y+dot(p.xz,p.xz)/(2.*BEACON_R);
    float h=beaconElevation(delta);
    float vertical=beaconSkirt(h);
    if(mainLobe) vertical+=beaconMain(h);
    if(vertical<1e-7) continue;
    float weight=beaconBeam(axis,delta.xz)*vertical*smoothstep(30.,45.,altitude);
    if(weight<1e-9) continue;
    float d=length(delta), side=beaconRainSide(p);
    float bank=0., bankTau=0.;
    if(uFogBank>0.){
      if(t*length(v.xz)<6000.&&p.y<210.) bank=bankAt(p.xz,p.y)/120.;
      bankTau=bankDepth(v,t*length(v.xz),.5);
    }
    float path=t*beaconRainFraction(eyeSide,side)+d*beaconRainFraction(lampSide,side);
    float tau=air*(t+d)+rain*path+bankTau+mistTau;
    float mu=clamp(-dot(v,delta)/d,-1.,1.);
    float phaseBase=1.49-1.4*mu;
    float phase=(.51/(4.*PI))*inversesqrt(phaseBase)/phaseBase;
    float scat=air+rainScatter*step(0.,side)+bank;
    sum+=stepSize*weight*scat*phase*exp(-tau)*(t>cloudT?1.-cloudAlpha:1.);
  }
  if(hitB) light+=sum/impact;
  return light;
}

vec2 beaconLowOpacity(ivec2 cell){
  if(!uClouds||any(lessThan(cell,ivec2(0)))||any(greaterThanEqual(cell,textureSize(uCloudLow,0)))) return vec2(0.);
  return texelFetch(uCloudLow,cell,0).rg;
}

vec3 beaconSky(vec2 p,float el){
  vec3 v=dirAt(vec2(azAt(p.x),el));
  vec3 origin=vec3(0.,uEyeH,0.)-uBeaconLamp;
  float start=beaconCloudDistance(v,30.-BEACON_WATER-uEyeH);
  float end=min(40000.,rayLength(el));
  if(end<=start) return vec3(0.);
  vec2 interval=vec2(start,end);
  bool fullTurn=beaconFullTurn();
  vec2 a=beaconSpan(origin,v,uBeaconAxes.xy,interval);
  vec2 b=fullTurn?vec2(0.):beaconSpan(origin,v,uBeaconAxes.zw,interval);
  vec4 outerA=a.y>a.x?beaconCone(origin,v,a,BEACON_SKIRT_TAN):vec4(0.);
  vec4 outerB=b.y>b.x?beaconCone(origin,v,b,BEACON_SKIRT_TAN):vec4(0.);
  bool hitA=outerA.y>outerA.x||outerA.w>outerA.z;
  bool hitB=outerB.y>outerB.x||outerB.w>outerB.z;
  if(!hitA&&!hitB) return vec3(0.);
  float cloudAlpha=beaconLowOpacity(cloudCell(p)).r;
  float cloudT=cloudAlpha>0.?beaconCloudDistance(v,uBaseKm*1000.-uEyeH):end;
  float mistTau=uMist>0.?mistDepth(v,1e6,shoreAt(p.x),.5):0.;
  float light=beaconShafts(v,outerA,outerB,a,b,hitA,hitB,cloudT,cloudAlpha,mistTau);
  return BEACON_COLOR*(uBeaconIntensity*light*(fullTurn?2.:1.));
}

vec3 beaconCloud(vec2 q){
  ivec2 cell=cloudCell(q);
  float opacity=beaconLowOpacity(cell).g;
  if(opacity<=0.) return vec3(0.);
  float az=azAt((float(cell.x)+.5)*${fl(CELL_W)});
  float el=clamp((uHorizon-(float(cell.y)+.5+uCloudTop))*uRadPerPx,0.,1.553);
  vec3 v=dirAt(vec2(az,el));
  float t=beaconCloudDistance(v,uBaseKm*1000.-uEyeH);
  if(t>40000.) return vec3(0.);
  vec3 p=vec3(0.,uEyeH,0.)+v*t, delta=p-uBeaconLamp;
  float spread=min(.5,uBeaconSpread/max(length(delta.xz),1.));
  float beam=beaconBeamSpread(uBeaconAxes.xy,delta.xz,spread)+beaconBeamSpread(uBeaconAxes.zw,delta.xz,spread);
  if(beam<=0.) return vec3(0.);
  float d=length(delta), side=beaconRainSide(p);
  // Lamp to cloud, then cloud back down to the eye.
  float rainPath=d*beaconRainFraction(beaconRainSide(uBeaconLamp),side)+t*beaconRainFraction(beaconRainSide(vec3(0.,uEyeH,0.)),side);
  float tau=d*beaconAirK()+beaconRainK()*rainPath;
  float fade=1.-smoothstep(36000.,40000.,t);
  return BEACON_COLOR*(uBeaconIntensity*opacity*.8/PI)*beam*beaconVertical(delta)*fade*exp(-tau)/(d*d);
}
float foldReflection(float y,float lim){ return y<lim?2.*lim-y:y; }

// q mirrors the sky about the horizon; bank mirrors land about its waterline.
struct Water { float d,az,dep,Z,blowW,slick,paw,wet,hiss,chop,glass; vec2 q,bank; };
// Adapted from farSea in KELPII's farsea.ts.
Water waterAt(vec2 p){
  // Cap depression short of the nadir to keep water distance positive.
  float d=p.y-uHorizon, az=azAt(p.x), dep=min(d*uRadPerPx,1.5);
  float slope=tan(dep), shore=shoreAt(p.x);
  float Z=min(shore,uEyeH/slope), blowW=min(1.,uWindMs/20.);
  vec2 ground=vec2(sin(az),cos(az))*Z;
  float lane=smoothstep(.74,.86,vnoise(vec2((az-uHeadAz)*Z/260.,Z/7.)))*step(60.,Z);
  float slick=lane*(1.-smoothstep(4.,6.,uWindMs));
  float paw=smoothstep(.6,.8,vnoise((ground+uPawDrift)/20.))*smoothstep(2.5,6.,uWindMs)*(1.-slick);
  float wet=rainHere(az,Z), hiss=smoothstep(.22,1.,uRain)*wet;
  float chop=max(smoothstep(8.,20.,uWindMs),.6*hiss);
  float glass=max(1.-smoothstep(.4,2.,uWindMs),slick)*(1.-hiss);
  float ph=30.*log(1.+d*.3);
  float n=sin(p.x*.045+uT*.21)+sin(p.x*.013-uT*.13+d*.07);
  float amp=(.35+5.5*uWind)*(.25+d/45.)*(1.+paw)*(1.-.7*slick)*(1.+.85*chop);
  float ox=amp*sin(ph-uT*1.3+n*1.7)+.5*amp*sin(ph*2.3+uT*.9+p.x*.11);
  float oy=(.35+.14*chop)*amp*sin(ph*1.7-uT*1.1+n);
  if(hiss>0.){
    vec2 rough=vec2(vnoise(vec2(p.x*.46,d*.8-uT*8.)),vnoise(vec2(p.x*.31+53.,d*.95+uT*9.)));
    ox+=6.*hiss*(rough.x-.5);
    oy+=4.*hiss*(rough.y-.5);
  }
  float qx=p.x+floor(ox+.5);
  qx=qx<0.?-qx:qx>=uRes.x?2.*uRes.x-qx:qx;
  // Fold at the reflected bottom row. Mirrors the coverage in drawClouds.
  float ripple=floor(oy+.5), lim=2.*uHorizon-uRes.y+.5;
  vec2 q=vec2(qx,foldReflection(min(uHorizon-d-ripple,uHorizon-.5),lim));
  float wl=waterlineAt(qx);
  vec2 bank=vec2(qx,foldReflection(min(2.*wl-p.y-ripple,wl-.5),lim));
  return Water(d,az,dep,Z,blowW,slick,paw,wet,hiss,chop,glass,q,bank);
}

const float FORE=0., SKY=1., WATER=2.;
// Foreground distance in m for haze and fog.
const float FORE_M=3.;
// at and el give the sky ray: the pixel itself, or the mirrored point for water.
struct Sample { vec3 color, lights; float cloudA, kind; bool land; vec2 at; float el, hit; };
// One call site per helper, since Direct3D's compiler inlines every call (ANGLE on Windows).
Sample sampleAt(vec2 p){
  float el=min((uHorizon-p.y)*uRadPerPx,1.553);
  vec4 fore=uHasFore?foreAt(p):vec4(0.);
  if(fore.a>=.5){
    float hit=FORE_M;
    vec3 c=litLand(fore.rgb,azAt(p.x),vec2(p.x,min(uRes.y-.5,uHorizon+atan(uEyeH/hit)/uRadPerPx)),hit);
    return Sample(c,vec3(0.),0.,FORE,true,p,el,hit);
  }
  bool below=p.y>=uHorizon, water=false;
  Water w;
  if(below) w=waterAt(p);
  vec2 s=p;
  LandSample ls;
  // Direct land, else water reflecting land, then sky; the loop keeps one landSample call site.
  for(int i=0;i<2;i++){
    ls=landSample(s);
    if(ls.rgba.a<.5&&insideLand(s)) ls=landFill(s);
    if(ls.rgba.a>=.5||!below||water) break;
    water=true;
    s=w.bank;
  }
  if(water&&ls.rgba.a<.5) s=w.q;
  if(water) el=(uHorizon-s.y)*uRadPerPx;
  vec3 lights;
  vec4 cloud;
  vec4 here=scene(s,ls,water,lights,cloud);
  bool land=here.a>.5;
  vec3 extra=!OPTICS||land?vec3(0.):optics(s,cloud.a), glow=GLOW&&uBeaconIntensity>0.&&!land?beaconCloud(s):vec3(0.);
  vec3 c;
  float rough=water?.65*smoothstep(1.5,7.,uWindMs):0.;
  if(water){
    c=mix(here.rgb,cloud.rgb,cloud.a)+extra*(1.-here.a);
    c=mix(c,air(azAt(p.x),min(1.2,w.dep+.35)),rough);
  }else{
    c=mix(here.rgb,cloud.rgb,cloud.a);
    if(!land) c+=extra;
  }
  if(!land&&uRain>0.){
    float wet=rainVeil(azAt(s.x),el);
    c=mix(c,veil(azAt(s.x),rayLength(el)),wet);
    if(!water) lights*=1.-wet;
  }
  // beaconCloud includes rain extinction, so the glow joins after the veil.
  if(uBeaconIntensity>0.&&!land) c+=glow*(1.-rough);
  if(!water) lights*=1.-cloud.a;
  return Sample(c,lights,cloud.a,water?WATER:SKY,land,s,el,land?ls.z:1e6);
}

// eye picks the water-to-eye ray over the sample's sky ray.
vec4 fogRay(Sample s,vec2 p,bool eye){
  if(!eye) return fogLight(s.at,s.el,s.hit,s.land);
  if(s.kind!=WATER) return vec4(0.,0.,0.,1.);
  Water w=waterAt(p);
  return fogLight(p,-w.dep,w.Z,false);
}

vec3 beaconRay(Sample s){
  return uBeaconIntensity>0.&&!s.land&&s.kind!=FORE&&s.el<=1.553?beaconSky(s.at,s.el):vec3(0.);
}

vec4 finish(vec2 p,Sample s,vec4 fogA,vec4 fogB,vec3 beacon){
  vec3 c=s.color, lights=s.lights;
  vec4 dash=vec4(0.);
  float hit=s.hit, el=s.el;
  bool land=s.land, fog=uMist>0.||uFogBank>0.;
  if(s.kind==WATER){
    Water w=waterAt(p);
    float d=w.d, az=w.az, dep=w.dep, Z=w.Z, paw=w.paw, hiss=w.hiss;
    hit=Z;
    el=-dep;
    land=false;
    float mirrored=s.land?1.:0.;
    // Schlick with n = 1.333.
    float R=(.0204+.9796*pow(1.-sin(dep),5.))*(1.-.25*w.blowW)*(1.-.3*paw);
    // Pond photos put the end of treeline mirroring near 5 m/s.
    R+=(1.-R)*uMirror*(1.-smoothstep(1.5,5.,uWindMs));
    R*=1.-.72*hiss;
    vec2 under=shadowAt(p);
    float sunlit=mix(under.y,under.x,uSunShare);
    vec3 lit=uAmb*3.*uAmbTint+uLightI*uLightCol*sunlit;
    vec3 body=vec3(.04,.09,.14)*(uAmb*3.*uAmbTint+uLightI*.5*uLightCol*sunlit);
    vec3 seen=c;
    if(fog) fogged(fogA,seen);
    if(uBeaconIntensity>0.&&mirrored<.5&&s.el<=1.553) seen+=beacon*(1.-.65*smoothstep(1.5,7.,uWindMs));
    c=seen*R+body*(1.-R);
    lights*=R*w.glass*(1.-s.cloudA);
    float face=(1.-.6*w.slick)*(1.+.5*paw)*(1.-mirrored)*(1.-s.cloudA)*(1.-.85*w.glass);
    float cs=glintOdds(uSunAt,uSunGlint,p.x,dep)*face*uGlintScale*under.x, cm=glintOdds(uMoonAt,uMoonGlint,p.x,dep)*face*uGlintScale*under.y;
    if(cs+cm>0.){
      float hg=hash(ivec3(floor(p),3)), t=uT*(1.5+2.5*hg)+hg*61., slot=floor(t);
      float roll=hash(ivec3(floor(p),int(mod(slot,8192.))));
      if(roll<cs+cm){
        bool sun=roll<cs;
        lights+=(sun?uSunCol*uSunGlint.z:vec3(.72,.84,1.)*uMoonGlint.z)*(t-slot>=.7?.3:1.);
      }
    }
    float L=3.+min(6.,floor(d/12.)), slide=-dot(uWaveDrift,vec2(cos(az),-sin(az)))/(max(2.,Z)*uRadPerPx);
    float cell=floor((p.x+slide)/L), inCell=p.x+slide-cell*L;
    float hd=hash(ivec3(int(mod(cell,8192.)),int(d),11));
    float dslot=floor(uT*(.4+.5*hd)+hd*9.);
    float dens=(mix(.1,.03,smoothstep(0.,40.,d))*(.3+.7*smoothstep(0.,5.,uWindMs))+.06*paw)*(1.-.75*w.slick)*(1.-.7*w.glass)+.18*w.chop;
    if(inCell<L-1.&&hash(ivec3(int(mod(cell,8192.)),int(d),int(mod(dslot,8192.))))<dens) dash=vec4(c*1.45+.03*lit,1.-mirrored*.7);
    vec3 horizonAir=air(az,0.);
    float foam=pondFoam(p,Z,paw);
    if(RAIN&&uRain>0.||foam>0.){
      c=mix(c,dash.rgb,dash.a);
      dash=vec4(0.);
      vec3 wetLight=weatherSky(horizonAir);
      if(RAIN&&uRain>0.){
        vec3 gray=vec3(dot(wetLight,vec3(.2126,.7152,.0722)));
        c=mix(c,.57*gray,.72*hiss);
        c=rainSurface(c,p,Z,wetLight,hiss,w.wet);
        lights*=1.-.9*hiss;
      }
      c=mix(c,wetLight*1.6,foam*.88);
    }
    float hazed=haze(az,Z);
    vec3 far=veil(az,Z);
    c=mix(c,far,hazed);
    dash.rgb=mix(dash.rgb,far,hazed);
    // Weaker glint haze, as in KELPII.
    lights*=1.-.7*hazed;
    c=mix(grade(c),c,mirrored);
    dash.rgb=mix(grade(dash.rgb),dash.rgb,mirrored);
  }
  if(fog){
    vec3 clearColor=c;
    float transmittance=fogged(s.kind==WATER?fogB:fogA,c);
    lights*=transmittance;
    dash.rgb+=c-clearColor;
    dash.a*=transmittance;
  }
  if(uBeaconIntensity>0.&&!land&&p.y<uHorizon) c+=beacon;
  if(RAIN&&uRain>0.) c=fallingRain(c,p,el);
  c=clamp(c,0.,1.);
  if(uBands>0.){
    // Quantize the peak channel on a square-root scale: keeps hue and dark-end steps.
    float l=max(c.r,max(c.g,c.b));
    float q=floor(sqrt(l)*uBands+.5+(bayer(ivec2(gl_FragCoord.xy),uBayer)-.5)/3.)/uBands;
    c*=q*q/max(l,1e-4);
  }
  if(p.y<uHorizon&&!land){
    c=grade(c);
  }
  c=mix(c,dash.rgb,dash.a);
  vec3 sum=c+lights;
  vec4 o=vec4(sum/max(1.,max(sum.r,max(sum.g,sum.b))),1.);
  if(uShowShadow&&(p.y>=uHorizon||land)) o=vec4(vec3(shadowAt(p).x),1.);
  if(uShowDepth){
    // Water uses a log depth scale to resolve the shallows.
    float g=1.-clamp((hit-uDepthRange.x)/(uDepthRange.y-uDepthRange.x),0.,1.);
    float w=1.-clamp(log(hit/2.)/log(uDepthRange.y/2.),0.,1.);
    o=vec4(land?vec3(g):p.y>=uHorizon?w*vec3(.55,.75,1.):vec3(.03,.04,.07),1.);
  }
  return o;
}
vec2 pixel(){ return vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y); }
`;

const PASS_INPUT = `
uniform highp sampler2D uPass0, uPass1, uPass2;
Sample passSample(ivec2 at){
  vec4 a=texelFetch(uPass0,at,0), b=texelFetch(uPass1,at,0), c=texelFetch(uPass2,at,0);
  return Sample(a.rgb,b.rgb,a.a,mod(b.a,4.),b.a>=4.,c.xy,c.z,c.w);
}
`;

// Separate programs stay small: ANGLE's Direct3D compile time grows faster than shader size.
const SCENE_MAINS = {
  // Output 0 is unused and trivial, as in CLOUD_FRAG.
  sample: `layout(location=0) out vec4 unused;
layout(location=1) out vec4 o0;
layout(location=2) out vec4 o1;
layout(location=3) out vec4 o2;
void main(){
  unused=vec4(0.);
  Sample s=sampleAt(pixel());
  o0=vec4(s.color,s.cloudA);
  o1=vec4(s.lights,s.kind+(s.land?4.:0.));
  o2=vec4(s.at,s.el,s.hit);
}`,
  fog: `${PASS_INPUT}uniform bool uFogEye;
out vec4 o;
void main(){ o=fogRay(passSample(ivec2(gl_FragCoord.xy)),pixel(),uFogEye); }`,
  beacon: `${PASS_INPUT}out vec4 o;
void main(){ o=vec4(beaconRay(passSample(ivec2(gl_FragCoord.xy))),1.); }`,
  composite: `${PASS_INPUT}uniform highp sampler2D uFogA, uFogB, uBeacon;
out vec4 o;
void main(){
  ivec2 at=ivec2(gl_FragCoord.xy);
  bool fog=uMist>0.||uFogBank>0.;
  vec4 clear=vec4(0.,0.,0.,1.);
  vec3 beacon=uBeaconIntensity>0.?texelFetch(uBeacon,at,0).rgb:vec3(0.);
  o=finish(pixel(),passSample(at),fog?texelFetch(uFogA,at,0):clear,fog?texelFetch(uFogB,at,0):clear,beacon);
}`,
  whole: `out vec4 o;
void main(){
  vec2 p=pixel();
  Sample s=sampleAt(p);
  vec4 a=vec4(0.,0.,0.,1.), b=a;
  if(uMist>0.||uFogBank>0.){
    a=fogRay(s,p,false);
    b=fogRay(s,p,true);
  }
  o=finish(p,s,a,b,beaconRay(s));
}`,
};
type ScenePass = keyof typeof SCENE_MAINS;
const PASS_NAMES = ["uPass0", "uPass1", "uPass2", "uFogA", "uFogB", "uBeacon"];
const PASS_UNITS = [12, 13, 14, 15, 16, 17];
const WATERLINE_UNIT = 18;

/** Up to four trunk runs per edge as x0, x1, and lean in px per row; unused slots never match. */
function trunkEdges(solid: Uint8Array | null, width: number, height: number) {
  const edges = new Float32Array(32);
  for (let i = 0; i < 8; i++) edges.set([1, 0, 0, 0], i * 4);
  if (!solid || height <= 2 * FORE_BAND) return edges;
  const runs = (y: number) => {
    const found: [number, number][] = [];
    for (let x = 0; x < width; x++) {
      if (!solid[y * width + x]) continue;
      const start = x;
      while (x + 1 < width && solid[y * width + x + 1]) x++;
      if (x - start >= 2) found.push([start, x]);
    }
    return found.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 4);
  };
  const center = ([a, b]: [number, number]) => (a + b) / 2;
  for (const [slot, row, inner] of [[0, 0, FORE_BAND], [4, height - 1, height - 1 - FORE_BAND]]) {
    const deeper = runs(inner);
    runs(row).forEach((run, i) => {
      const c = center(run);
      const match = deeper.reduce<[number, number] | null>(
        (best, r) => !best || Math.abs(center(r) - c) < Math.abs(center(best) - c) ? r : best,
        null,
      );
      const lean = match && Math.abs(center(match) - c) < FORE_BAND
        ? (center(match) - c) / (inner - row)
        : 0;
      edges.set([run[0], run[1], lean, 0], (slot + i) * 4);
    });
  }
  return edges;
}
// Mirrors the storm gates in clouds.ts, compared in float32 like the shader.
const stormsOn = (storms: number) => Math.fround(storms) > Math.fround(0.002);
/** Switches for code that compiles slowly; each may be false only when its uniforms are zero. */
interface SceneBuild {
  rain: boolean;
  optics: boolean;
  glow: boolean;
}
const FULL: SceneBuild = { rain: true, optics: true, glow: true };
const LEAN: SceneBuild = { rain: false, optics: false, glow: false };
const sceneSource = (pass: ScenePass, b = FULL) =>
  SCENE_HEAD.replace("SCENE_BUILD", `RAIN=${b.rain}, OPTICS=${b.optics}, GLOW=${b.glow}`) +
  SCENE_MAINS[pass];

type Vec3 = [number, number, number];

/** Build-time depth and foreground images must match land dimensions. */
export interface ViewArt {
  name: string;
  land: ImageBitmap;
  depth: ImageBitmap | null;
  foreground: ImageBitmap | null;
  foliage: ImageBitmap | null;
  /** Depth endpoints in m, white → black. */
  depthRange: [number, number];
  /** The art row that sits on the horizon row. */
  eyeRow: number;
  /** Rows the foreground sits above the land. */
  foreRise: number;
}

/** Angles in radians. Azimuth follows KELPII’s south → west convention. */
export interface Frame {
  width: number;
  height: number;
  horizon: number;
  /** Left edge in art pixels, negative when cropped. */
  bandX: number;
  /** Screen right/up in m. */
  eyeOffsetM: [number, number];
  radPerPx: number;
  headAz: number;
  bodyR: number;
  /** Real seconds. */
  time: number;
  /** Normalized wind, 0–1. */
  wind: number;
  foliage: number;
  /** Zero disables brightness quantization. */
  bands: number;
  /** Base-2 exponent of dither matrix width. */
  bayer: number;
  haze: number;
  sinSun: number;
  sunSlice: number;
  sinMoon: number;
  moonSlice: number;
  sunAz: number;
  moonAz: number;
  sunEl: number;
  moonEl: number;
  skyE: number;
  skySat: number;
  mieGain: number;
  moonE: number;
  moonVis: number;
  moonK: number;
  sunCol: Vec3;
  moonCol: Vec3;
  moonLight: Vec3;
  sunBeam: number;
  moonBeam: number;
  water: WaterFrame;
  /** As Forecast.rainFront, with −1e6 for full coverage. */
  rain: { level: number; front: number };
  fog: {
    mist: number;
    bank: number;
    drift: [number, number];
    bow: number;
    mistBow: number;
    beam: [number, number];
    style: Vec3;
    /** Steam rise in noise tiles, modulo 1. */
    rise: number;
    from: [number, number];
    coast: number;
  };
  landFill: number;
  showShadow: boolean;
  showDepth: boolean;
  starfield: Starfield;
  starGain: number;
  milkyGain: number;
  /** Mirrors uEclipse, with null disabling the shadow. */
  eclipse: { shadow: [number, number, number, number]; soft: number; core: Vec3; rim: Vec3 } | null;
  /** Null skips cloud rendering. */
  clouds: CloudFrame | null;
  rim: number;
  grade: number;
  /** Warm grade weight, 0–1. */
  sunset: number;
  optics: {
    bowSun: number;
    bowMoon: number;
    halo: number;
    haloTint: Vec3;
    haloDir: Vec3;
    corona: number;
  };
  /** Mirrors the sky and bolt fields of Flash in lightning.ts. */
  flash: { sky: number; dir: Vec3; spread: number; patch: number; bolt: number[]; glow: number };
  beacon: BeaconFrame;
}

/** Distances in m, speeds in m/s, and glint vectors in [sine of altitude, odds, gain] order from lightFor. */
export interface WaterFrame {
  windMs: number;
  windTo: [number, number];
  pawDrift: [number, number];
  /** Downwind offset in m, modulo WAVE_WRAP_M in pond.ts. */
  waveDrift: [number, number];
  slope: number;
  sunGlint: Vec3;
  moonGlint: Vec3;
  glintScale: number;
  amb: number;
  ambTint: Vec3;
  lightI: number;
  lightCol: Vec3;
  fog: number;
  eyeH: number;
  shoreZ: number;
  mirror: number;
  sunShare: number;
}

/** Mirrors KELPII's Clouds and lane values. Distances in km on [west, up, south]. */
export interface CloudFrame {
  cover: number;
  stratus: number;
  baseKm: number;
  thick: number;
  sigma: number;
  heavy: number;
  churn: number;
  churnT: number;
  drift: Vec3;
  fair: number;
  lowDir: Vec3;
  midDir: Vec3;
  highDir: Vec3;
  sunDir: Vec3;
  moonDir: Vec3;
  shadowSpread: number;
  amb: Vec3;
  lowLight: Vec3;
  midLight: Vec3;
  highLight: Vec3;
  midCover: number;
  lowSoft: number;
  lowDetail: number;
  lowTile: number;
  midSoft: number;
  midShade: number;
  midOpacity: number;
  midTile: number;
  cirrus: number;
  cirrusCurl: number;
  /** Noise cell width in km across the ribbon axis. */
  cirrusWidth: number;
  cirrusPuff: number;
  /** Ribbon-axis unit vector on [west, south]. */
  cirrusDir: [number, number];
  /** West/south km modulo DRIFT_WRAP_KM. */
  midDrift: [number, number];
  /** x is lengthwise km modulo JET_WRAP_KM, and y is unused. */
  jetDrift: [number, number];
  storms: number;
  /** West/south km modulo STORM_WRAP_KM. */
  stormDrift: [number, number];
  /** Drift-clock hours modulo STORM_AGE_WRAP_H. */
  stormAge: number;
  /** Mirrors Flash.cloud in lightning.ts. */
  flash: [number, number, number, number];
  lowSun: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

class Program {
  readonly program: WebGLProgram;
  private readonly shaders: WebGLShader[];
  private linked = false;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  /** Status checks wait for the link, so they are deferred to use() to let queued programs compile back to back. */
  constructor(private readonly gl: WebGL2RenderingContext, vert: string, frag: string) {
    const program = this.program = gl.createProgram()!;
    this.shaders = [compile(gl, gl.VERTEX_SHADER, vert), compile(gl, gl.FRAGMENT_SHADER, frag)];
    for (const shader of this.shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);
  }

  /** Throws the link logs on failure. */
  check() {
    const gl = this.gl;
    if (this.linked) return;
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const logs = this.shaders.map((shader) => gl.getShaderInfoLog(shader)).filter(Boolean);
      throw new Error(
        [`Program failed to link: ${gl.getProgramInfoLog(this.program)}`, ...logs].join("\n"),
      );
    }
    this.linked = true;
  }

  use() {
    this.check();
    this.gl.useProgram(this.program);
  }

  u(name: string) {
    let location = this.locations.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.program, name);
      this.locations.set(name, location);
    }
    return location;
  }
}

export class PondRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs = new Map<string, Program>();
  private readonly parallel: KHR_parallel_shader_compile | null;
  private warming: Program | undefined;
  private warmed = false;
  private warmFailed = false;
  /** Keys whose warm-up failed to link; asking for one again gets the lean build. */
  private readonly failed = new Set<string>();
  private frames = 0;
  /** Float targets let the scene run as separate passes; without them it compiles as one program. */
  private passes: boolean;
  private readonly passTex: WebGLTexture[] = [];
  private readonly passTargets: WebGLFramebuffer[] = [];
  private passSize = [0, 0];
  private readonly triangle: WebGLVertexArrayObject;
  private readonly skyTex: WebGLTexture;
  private readonly landTex: WebGLTexture;
  private readonly starTex: WebGLTexture;
  private readonly milkyTex: WebGLTexture;
  private readonly noiseTex: WebGLTexture;
  private readonly cloudTex: WebGLTexture;
  private readonly cloudLowTex: WebGLTexture;
  private readonly cloudTarget: WebGLFramebuffer;
  private cloudSize = [0, 0];
  private readonly shadowTex: WebGLTexture;
  private readonly shadowTarget: WebGLFramebuffer;
  private shadowSize = [0, 0];
  private shadowOff = 0;
  private cloudTop = 0;
  private cloudKey = "";
  private cloudBaseKm = 0;
  private shadowPose = 0;
  private landSize: [number, number] = [1, 1];
  private readonly depthTex: WebGLTexture;
  private readonly waterlineTex: WebGLTexture;
  private readonly foliageTex: WebGLTexture;
  private foliage!: Foliage;
  private readonly foreTex: WebGLTexture;
  private readonly foreFoliageTex: WebGLTexture;
  private foreFoliage: Foliage | null = null;
  private foreEdges = trunkEdges(null, 1, 1);
  private hasDepth = false;
  private depthRange: [number, number] = [30, 650];
  private eyeRow = 1;
  private foreRise = 0;
  private viewName = "";
  private starSize = [0, 0];
  private starRevision = -1;

  constructor(canvas: HTMLCanvasElement, view: ViewArt, milkyWay: MilkyWayMap) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.parallel = gl.getExtension("KHR_parallel_shader_compile");
    this.triangle = gl.createVertexArray()!;

    this.landTex = gl.createTexture()!;
    this.depthTex = gl.createTexture()!;
    this.waterlineTex = gl.createTexture()!;
    this.foliageTex = gl.createTexture()!;
    this.foreTex = gl.createTexture()!;
    this.foreFoliageTex = gl.createTexture()!;
    this.setView(view);

    this.milkyTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.milkyTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      milkyWay.width,
      milkyWay.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      milkyWay.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.starTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.starTex);
    this.nearest(gl.TEXTURE_2D);
    this.skyTex = this.bakeSky();
    this.noiseTex = this.bakeNoise();
    this.cloudTex = gl.createTexture()!;
    this.cloudLowTex = gl.createTexture()!;
    this.cloudTarget = gl.createFramebuffer()!;
    this.shadowTex = gl.createTexture()!;
    this.shadowTarget = gl.createFramebuffer()!;
    this.passes = gl.getExtension("EXT_color_buffer_float") !== null;
    if (this.passes) {
      for (let i = 0; i < PASS_UNITS.length; i++) this.passTex.push(gl.createTexture()!);
      for (let i = 0; i < 4; i++) this.passTargets.push(gl.createFramebuffer()!);
    }
  }

  get contextLost() {
    return this.gl.isContextLost();
  }

  release() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private program(key: string, frag: () => string) {
    let program = this.programs.get(key);
    if (!program) {
      program = new Program(this.gl, VERT, frag());
      this.programs.set(key, program);
    }
    return program;
  }

  /** Firefox compiles again on a program's first draw, so after warmAll it keeps drawing the full builds. */
  private get fullFirst() {
    return this.warmed && !this.warmFailed && !this.parallel;
  }

  private cloudProgram(storms: boolean) {
    if (this.fullFirst) storms = true;
    if (this.failed.has(`cloud ${storms}`)) storms = false;
    return this.programs.get(`cloud ${storms}`) ?? this.programs.get("cloud true") ??
      this.program(`cloud ${storms}`, () => withStorms(CLOUD_FRAG, storms));
  }

  private shadowProgram(storms: boolean) {
    if (this.fullFirst) storms = true;
    if (this.failed.has(`shadow ${storms}`)) storms = false;
    return this.programs.get(`shadow ${storms}`) ?? this.programs.get("shadow true") ??
      this.program(
        `shadow ${storms}`,
        () => withStorms(SHADOW_FRAG.replace(DEPTH_GLSL, MOVING_DEPTH_GLSL), storms),
      );
  }

  /** Prefers a warmed full build to compiling a smaller one. */
  private sceneProgram(pass: ScenePass, b = FULL) {
    // Only the whole-page fallback reads all three switches.
    if (this.fullFirst) b = FULL;
    if (pass === "sample") b = { ...b, rain: false };
    if (pass === "composite") b = { ...b, optics: false, glow: false };
    const key = (build: SceneBuild) => `${pass} ${build.rain} ${build.optics} ${build.glow}`;
    if (this.failed.has(key(b))) b = LEAN;
    const full = pass === "sample"
      ? { ...FULL, rain: false }
      : pass === "composite"
      ? { ...FULL, optics: false, glow: false }
      : FULL;
    return this.programs.get(key(b)) ?? this.programs.get(key(full)) ??
      this.program(key(b), () => sceneSource(pass, b));
  }

  private warmBuilds() {
    const scene: ScenePass[] = this.passes ? ["sample", "beacon", "fog", "composite"] : ["whole"];
    return [
      ...scene.map((pass) => () => this.sceneProgram(pass)),
      () => this.cloudProgram(true),
      () => this.shadowProgram(true),
    ];
  }

  /** Without parallel compiles each link stalls the page, so all of them share one stall after the first frame. */
  private warmAll() {
    for (const build of this.warmBuilds()) {
      const program = build();
      this.tryWarm(program);
    }
    this.warmed = true;
    // Redraw the cached clouds so the full cloud build's first draw lands in the same stall.
    this.cloudKey = "";
  }

  private tryWarm(program: Program) {
    try {
      program.check();
    } catch {
      // An effect off screen mustn't stop the painting: drop the build, keep the lean variants.
      for (const [key, p] of this.programs) {
        if (p !== program) continue;
        this.programs.delete(key);
        this.failed.add(key);
      }
      this.warmFailed = true;
    }
  }

  /** Compiles one unused build at a time after startup, so a later switch doesn't stall. */
  private warmNext() {
    if (!this.parallel || this.warmed) return;
    if (
      this.warming &&
      !this.gl.getProgramParameter(this.warming.program, this.parallel.COMPLETION_STATUS_KHR)
    ) return;
    if (this.warming) this.tryWarm(this.warming);
    const builds = this.warmBuilds();
    const count = this.programs.size;
    for (const build of builds) {
      const program = build();
      if (this.programs.size > count) {
        this.warming = program;
        return;
      }
    }
    this.warmed = true;
  }

  /** Sample targets in units 12–14, then fog A, fog B, and beacon. */
  private sizePasses(width: number, height: number) {
    const gl = this.gl;
    if (this.passSize[0] === width && this.passSize[1] === height) return;
    this.passSize = [width, height];
    this.passTex.forEach((tex, i) => {
      gl.activeTexture(gl.TEXTURE0 + PASS_UNITS[i]);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      this.nearest(gl.TEXTURE_2D);
    });
    const attach = (target: WebGLFramebuffer, textures: WebGLTexture[], first = 0) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      textures.forEach((tex, i) =>
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0 + first + i,
          gl.TEXTURE_2D,
          tex,
          0,
        )
      );
      gl.drawBuffers([
        ...Array(first).fill(gl.NONE),
        ...textures.map((_, i) => gl.COLOR_ATTACHMENT0 + first + i),
      ]);
    };
    const [a, b, c, fogA, fogB, beacon] = this.passTex;
    attach(this.passTargets[0], [a, b, c], 1);
    attach(this.passTargets[1], [fogA]);
    attach(this.passTargets[2], [fogB]);
    attach(this.passTargets[3], [beacon]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.passTargets[0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) this.passes = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Mirrors bakeNoise in KELPII's gl.ts. */
  private bakeNoise() {
    const gl = this.gl;
    const program = new Program(gl, VERT, NOISE_FRAG);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(
      gl.TEXTURE_3D,
      Math.log2(NOISE_SIZE) + 1,
      gl.RGBA8,
      NOISE_SIZE,
      NOISE_SIZE,
      NOISE_SIZE,
    );
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, axis, gl.REPEAT);
    }
    const target = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
    gl.bindVertexArray(this.triangle);
    program.use();
    for (let z = 0; z < NOISE_SIZE; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
      if (z === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("The cloud noise can't be rendered on this GPU");
      }
      gl.uniform1f(program.u("uSlice"), z);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(target);
    gl.deleteProgram(program.program);
    gl.generateMipmap(gl.TEXTURE_3D);
    return tex;
  }

  /** One texel per CELL_W × 1 art pixels, top row first. */
  private layerUniforms(p: Program, c: CloudFrame, f: Frame, lightDir: Vec3) {
    const gl = this.gl;
    p.use();
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
    gl.uniform1i(p.u("uNoise"), 5);
    gl.uniform1f(p.u("uCover"), c.cover);
    gl.uniform1f(p.u("uStratus"), c.stratus);
    gl.uniform1f(p.u("uBaseKm"), c.baseKm);
    gl.uniform1f(p.u("uThick"), c.thick);
    gl.uniform1f(p.u("uSigma"), c.sigma);
    gl.uniform1f(p.u("uHeavy"), c.heavy);
    gl.uniform1f(p.u("uChurn"), c.churn);
    gl.uniform1f(p.u("uChurnT"), c.churnT);
    gl.uniform3fv(p.u("uDrift"), c.drift);
    gl.uniform3fv(p.u("uLightDir"), lightDir);
    gl.uniform1f(p.u("uMidCover"), c.midCover);
    gl.uniform1f(p.u("uLowSoft"), c.lowSoft);
    gl.uniform1f(p.u("uLowDetail"), c.lowDetail);
    gl.uniform1f(p.u("uLowTile"), c.lowTile);
    gl.uniform1f(p.u("uMidSoft"), c.midSoft);
    gl.uniform1f(p.u("uMidShade"), c.midShade);
    gl.uniform1f(p.u("uMidOpacity"), c.midOpacity);
    gl.uniform1f(p.u("uMidTile"), c.midTile);
    gl.uniform2fv(p.u("uMidDrift"), c.midDrift);
    gl.uniform1f(p.u("uStorms"), c.storms);
    gl.uniform2fv(p.u("uStormDrift"), c.stormDrift);
    gl.uniform1f(p.u("uStormAge"), c.stormAge);
    gl.uniform1f(p.u("uHorizon"), f.horizon);
    gl.uniform1f(p.u("uCenterX"), f.bandX + this.landSize[0] / 2);
    gl.uniform1f(p.u("uRadPerPx"), f.radPerPx);
    gl.uniform1f(p.u("uHeadAz"), f.headAz);
  }

  /** Leaves the texture and framebuffer bound even when the size matches. */
  private sizeTarget(
    tex: WebGLTexture,
    target: WebGLFramebuffer,
    size: number[],
    cols: number,
    rows: number,
    filter: number,
    attachment = 0,
  ) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    if (size[0] === cols && size[1] === rows) return;
    size[0] = cols;
    size[1] = rows;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.nearest(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0 + attachment,
      gl.TEXTURE_2D,
      tex,
      0,
    );
  }

  private beaconUniforms(p: Program, f: Frame) {
    const gl = this.gl;
    gl.uniform1f(p.u("uBeaconIntensity"), f.beacon.intensity);
    gl.uniform1i(p.u("uBeaconSteps"), 8);
    if (f.beacon.intensity <= 0) return;
    gl.uniform3fv(p.u("uBeaconLamp"), f.beacon.lamp);
    gl.uniform4fv(p.u("uBeaconAxes"), f.beacon.axes);
    gl.uniform4fv(p.u("uBeaconBlur"), f.beacon.blur);
    gl.uniform3f(p.u("uBeaconWeather"), f.water.fog, f.rain.level, f.rain.front);
    gl.uniform2fv(p.u("uBeaconWind"), f.fog.from);
    gl.uniform1f(p.u("uBeaconSpread"), f.beacon.spread);
  }

  private drawClouds(f: Frame, c: CloudFrame, water: WaterFrame) {
    const gl = this.gl;
    // Include cloud rows sampled only by reflections.
    const top = Math.max(
      Math.min(0, 2 * f.horizon - f.height),
      f.horizon - Math.ceil(1.553 / f.radPerPx),
    );
    const cols = Math.ceil(f.width / CELL_W), rows = f.horizon - top;
    const beaconEyeH = f.beacon.intensity > 0 ? water.eyeH : -1;
    const { baseKm, ...cloudLayers } = c;
    const key = JSON.stringify([
      cloudLayers,
      f.width,
      f.height,
      f.horizon,
      top,
      f.bandX,
      f.eyeOffsetM,
      f.radPerPx,
      f.headAz,
      water.eyeH,
      water.shoreZ,
      beaconEyeH,
      this.viewName,
    ]);
    this.cloudTop = top;
    const storms = stormsOn(c.storms);
    const redrawClouds = key !== this.cloudKey || Math.abs(baseKm - this.cloudBaseKm) >= 0.003;
    const pose = this.foliage.active ? this.foliage.revision : 0;
    if (!redrawClouds && pose === this.shadowPose) return;
    this.shadowPose = pose;
    gl.bindVertexArray(this.triangle);

    if (redrawClouds) {
      this.cloudKey = key;
      this.cloudBaseKm = baseKm;
      const p = this.cloudProgram(storms);
      gl.activeTexture(gl.TEXTURE4);
      const resize = cols !== this.cloudSize[0] || rows !== this.cloudSize[1];
      this.sizeTarget(this.cloudTex, this.cloudTarget, this.cloudSize, cols, rows, gl.NEAREST, 1);
      if (resize) {
        // Keep the base opacity and the visible fraction of the lit deck separate.
        gl.activeTexture(gl.TEXTURE11);
        gl.bindTexture(gl.TEXTURE_2D, this.cloudLowTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, cols, rows, 0, gl.RG, gl.UNSIGNED_BYTE, null);
        this.nearest(gl.TEXTURE_2D);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT2,
          gl.TEXTURE_2D,
          this.cloudLowTex,
          0,
        );
        // Mirrors the outputs in CLOUD_FRAG.
        gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
      }
      gl.viewport(0, 0, cols, rows);
      this.layerUniforms(p, c, f, c.lowDir);
      gl.uniform1f(p.u("uFair"), c.fair);
      gl.uniform1f(p.u("uCirrus"), c.cirrus);
      gl.uniform1f(p.u("uCirrusCurl"), c.cirrusCurl);
      gl.uniform1f(p.u("uCirrusWidth"), c.cirrusWidth);
      gl.uniform1f(p.u("uCirrusPuff"), c.cirrusPuff);
      gl.uniform2fv(p.u("uCirrusDir"), c.cirrusDir);
      gl.uniform2fv(p.u("uJetDrift"), c.jetDrift);
      gl.uniform3fv(p.u("uLowLight"), c.lowLight);
      gl.uniform3fv(p.u("uMidLight"), c.midLight);
      gl.uniform3fv(p.u("uHighLight"), c.highLight);
      gl.uniform3fv(p.u("uMidDir"), c.midDir);
      gl.uniform4fv(p.u("uFlash"), c.flash);
      gl.uniform1f(p.u("uLowSun"), c.lowSun);
      gl.uniform3fv(p.u("uHighDir"), c.highDir);
      gl.uniform3fv(p.u("uCloudAmb"), c.amb);
      gl.uniform1f(p.u("uTop"), top);
      gl.uniform1f(p.u("uBeaconEyeH"), beaconEyeH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const sp = this.shadowProgram(storms);
    const rowOff = (f.horizon % SHADOW_CELL) - SHADOW_CELL;
    this.shadowOff = rowOff;
    const sCols = Math.ceil(f.width / SHADOW_CELL),
      sRows = Math.ceil((f.height - rowOff) / SHADOW_CELL);
    gl.activeTexture(gl.TEXTURE6);
    this.sizeTarget(this.shadowTex, this.shadowTarget, this.shadowSize, sCols, sRows, gl.LINEAR);
    gl.viewport(0, 0, sCols, sRows);
    this.layerUniforms(sp, redrawClouds ? c : { ...c, baseKm: this.cloudBaseKm }, f, c.lowDir);
    gl.uniform3fv(sp.u("uSunDir"), c.sunDir);
    gl.uniform3fv(sp.u("uMoonDir"), c.moonDir);
    gl.uniform1f(sp.u("uRowOff"), rowOff);
    gl.uniform1f(sp.u("uBandX"), f.bandX);
    gl.uniform2fv(sp.u("uEyeOffsetM"), f.eyeOffsetM);
    gl.uniform2f(sp.u("uLandSize"), this.landSize[0], this.landSize[1]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.landTex);
    gl.uniform1i(sp.u("uLand"), 1);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.uniform1i(sp.u("uDepth"), 7);
    this.waterlineUniforms(sp);
    this.foliageUniforms(sp);
    gl.uniform1i(sp.u("uHasDepth"), this.hasDepth ? 1 : 0);
    gl.uniform2fv(sp.u("uDepthRange"), this.depthRange);
    gl.uniform1f(sp.u("uEyeH"), water.eyeH);
    gl.uniform1f(sp.u("uShoreZ"), water.shoreZ);
    gl.uniform1f(sp.u("uSpread"), c.shadowSpread);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private waterlineUniforms(program: Program) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + WATERLINE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.waterlineTex);
    gl.uniform1i(program.u("uWaterline"), WATERLINE_UNIT);
    gl.uniform1f(program.u("uEyeRow"), this.eyeRow);
  }

  private foliageUniforms(program: Program) {
    const gl = this.gl;
    gl.uniform1i(program.u("uFoliage"), 8);
    const [first, end] = this.foliage.rows;
    gl.uniform2i(program.u("uFoliageRows"), first, this.foliage.active ? end : first);
  }

  private nearest(target: number) {
    const gl = this.gl;
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private bakeSky() {
    const gl = this.gl, n = SKY_ALT.length;
    const program = new Program(gl, VERT, SKY_FRAG);
    const format = gl.getExtension("EXT_color_buffer_float") ? gl.RGBA16F : gl.RGBA8;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, format, SKY_W, SKY_H * 2, n);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
    }
    const target = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, SKY_W, SKY_H * 2);
    gl.bindVertexArray(this.triangle);
    program.use();
    gl.uniform2f(program.u("uRes"), SKY_W, SKY_H);
    for (let slice = 0; slice < n; slice++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, slice);
      if (slice === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("The sky table can't be rendered on this GPU");
      }
      gl.uniform1f(program.u("uSinEl"), SKY_ALT[slice]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(target);
    gl.deleteProgram(program.program);
    return tex;
  }

  /** Top row first for texelFetch by art-pixel y. */
  private uploadStars(field: Starfield) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.starTex);
    if (this.starRevision === field.revision) return;
    this.starRevision = field.revision;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.starSize[0] !== field.width || this.starSize[1] !== field.rows) {
      this.starSize = [field.width, field.rows];
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8UI,
        field.width,
        field.rows,
        0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_BYTE,
        field.cells,
      );
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        field.width,
        field.rows,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_BYTE,
        field.cells,
      );
    }
  }

  draw(f: Frame) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.foliageTex);
    if (this.foliage.update(f, this.landSize[0])) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        ...this.landSize,
        gl.RED_INTEGER,
        gl.BYTE,
        this.foliage.offsets,
      );
    }
    const fore = this.foreFoliage;
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this.foreFoliageTex);
    if (fore?.update(f, this.landSize[0])) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        ...this.landSize,
        gl.RED_INTEGER,
        gl.BYTE,
        fore.offsets,
      );
    }
    if (this.passes) this.sizePasses(f.width, f.height);
    // Mirrors the shader's gates.
    const on = (value: number, above = 0) => Math.fround(value) > Math.fround(above);
    const rain = on(f.rain.level),
      beacon = on(f.beacon.intensity),
      fog = on(f.fog.mist) || on(f.fog.bank);
    const { bowSun, bowMoon, halo, corona } = f.optics;
    const optics = [bowSun, bowMoon, halo, corona].some((v) => on(v, 0.002)) ||
      f.flash.bolt.length > 2;
    // Warm before choosing programs, so frame 3 draws the full builds.
    ++this.frames;
    if (!this.parallel) {
      if (this.frames === 3 && !this.warmed) this.warmAll();
    } else if (this.frames >= 90 && this.frames % 30 === 0) this.warmNext();
    // Create every program this frame needs before the first status check waits on a link.
    const scene = this.passes
      ? [
        this.sceneProgram("sample", { rain: false, optics, glow: beacon }),
        fog ? this.sceneProgram("fog") : null,
        beacon ? this.sceneProgram("beacon") : null,
        this.sceneProgram("composite", { rain, optics: false, glow: false }),
      ]
      : [this.sceneProgram("whole", { rain, optics, glow: beacon })];
    if (f.clouds) {
      this.cloudProgram(stormsOn(f.clouds.storms));
      this.shadowProgram(stormsOn(f.clouds.storms));
    }
    if (f.clouds) this.drawClouds(f, f.clouds, f.water);
    this.uploadStars(f.starfield);
    gl.viewport(0, 0, f.width, f.height);
    gl.bindVertexArray(this.triangle);
    const [first, fogPass, beaconPass, last] = scene;
    if (!this.passes) {
      this.sceneUniforms(first!, f);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    const pass = (program: Program, target: WebGLFramebuffer | null) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      this.sceneUniforms(program, f);
      PASS_NAMES.forEach((name, i) => gl.uniform1i(program.u(name), PASS_UNITS[i]));
    };
    pass(first!, this.passTargets[0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (fogPass) {
      pass(fogPass, this.passTargets[1]);
      gl.uniform1i(fogPass.u("uFogEye"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.passTargets[2]);
      gl.uniform1i(fogPass.u("uFogEye"), 1);
      // Only water reads this target, so rows above the horizon can retain their previous values.
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, f.width, Math.max(0, Math.ceil(f.height - Math.fround(f.horizon) + 0.5)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
    }
    if (beaconPass) {
      pass(beaconPass, this.passTargets[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    pass(last!, null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private sceneUniforms(s: Program, f: Frame) {
    const gl = this.gl, fore = this.foreFoliage;
    s.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.skyTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.landTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.milkyTex);
    gl.uniform1i(s.u("uSky"), 0);
    gl.uniform1i(s.u("uLand"), 1);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
    gl.uniform1i(s.u("uNoise"), 5);
    gl.uniform1f(s.u("uMist"), f.fog.mist);
    gl.uniform1f(s.u("uFogBank"), f.fog.bank);
    gl.uniform2fv(s.u("uFogDrift"), f.fog.drift);
    gl.uniform1f(s.u("uFogBow"), f.fog.bow);
    gl.uniform1f(s.u("uMistBow"), f.fog.mistBow);
    gl.uniform2fv(s.u("uFogBeam"), f.fog.beam);
    gl.uniform3fv(s.u("uMistStyle"), f.fog.style);
    gl.uniform1f(s.u("uMistRise"), f.fog.rise);
    gl.uniform2fv(s.u("uFogFrom"), f.fog.from);
    gl.uniform1f(s.u("uFogCoast"), f.fog.coast);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
    gl.uniform1i(s.u("uDepth"), 7);
    this.waterlineUniforms(s);
    this.foliageUniforms(s);
    gl.uniform1i(s.u("uHasDepth"), this.hasDepth ? 1 : 0);
    gl.uniform2fv(s.u("uDepthRange"), this.depthRange);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.foreTex);
    gl.uniform1i(s.u("uFore"), 9);
    gl.uniform1i(s.u("uHasFore"), fore ? 1 : 0);
    gl.uniform4fv(s.u("uForeEdge"), this.foreEdges);
    gl.uniform1f(s.u("uForeRise"), this.foreRise);
    gl.uniform1i(s.u("uForeFoliage"), 10);
    const foreRows = fore?.rows ?? [0, 0];
    gl.uniform2i(s.u("uForeRows"), foreRows[0], fore?.active ? foreRows[1] : foreRows[0]);
    gl.uniform1i(s.u("uStars"), 2);
    gl.uniform1i(s.u("uMilkyWay"), 3);
    gl.uniform2f(s.u("uRes"), f.width, f.height);
    gl.uniform2f(s.u("uLandSize"), this.landSize[0], this.landSize[1]);
    gl.uniform1f(s.u("uHorizon"), f.horizon);
    gl.uniform1f(s.u("uBandX"), f.bandX);
    gl.uniform2fv(s.u("uEyeOffsetM"), f.eyeOffsetM);
    gl.uniform1f(s.u("uRadPerPx"), f.radPerPx);
    gl.uniform1f(s.u("uHeadAz"), f.headAz);
    gl.uniform1f(s.u("uBodyR"), f.bodyR);
    gl.uniform1f(s.u("uT"), f.time);
    gl.uniform1f(s.u("uWind"), f.wind);
    gl.uniform1f(s.u("uBands"), f.bands);
    gl.uniform1i(s.u("uBayer"), f.bayer);
    gl.uniform1f(s.u("uHaze"), f.haze);
    gl.uniform4f(s.u("uSkyAlt"), f.sinSun, f.sunSlice, f.sinMoon, f.moonSlice);
    gl.uniform1f(s.u("uSunAz"), f.sunAz);
    gl.uniform1f(s.u("uMoonAz"), f.moonAz);
    gl.uniform1f(s.u("uSkyE"), f.skyE);
    gl.uniform1f(s.u("uSkySat"), f.skySat);
    gl.uniform1f(s.u("uMieGain"), f.mieGain);
    gl.uniform1f(s.u("uMoonE"), f.moonE);
    gl.uniform1f(s.u("uMoonVis"), f.moonVis);
    gl.uniform1f(s.u("uMoonK"), f.moonK);
    gl.uniform1f(s.u("uSunBeam"), f.sunBeam);
    gl.uniform1f(s.u("uMoonBeam"), f.moonBeam);
    gl.uniform1f(s.u("uBowSun"), f.optics.bowSun);
    gl.uniform1f(s.u("uBowMoon"), f.optics.bowMoon);
    gl.uniform1f(s.u("uHalo"), f.optics.halo);
    gl.uniform3fv(s.u("uHaloTint"), f.optics.haloTint);
    gl.uniform3fv(s.u("uHaloDir"), f.optics.haloDir);
    gl.uniform1f(s.u("uCorona"), f.optics.corona);
    gl.uniform1f(s.u("uFlashSky"), f.flash.sky);
    gl.uniform1f(s.u("uBaseKm"), f.clouds ? this.cloudBaseKm : 0);
    this.beaconUniforms(s, f);
    gl.uniform3fv(s.u("uFlashDir"), f.flash.dir);
    gl.uniform1f(s.u("uFlashSpread"), f.flash.spread);
    gl.uniform1f(s.u("uFlashPatch"), f.flash.patch);
    gl.uniform1f(s.u("uBoltGlow"), f.flash.glow);
    const n = Math.min(BOLT_POINTS, f.flash.bolt.length / 2);
    gl.uniform1i(s.u("uBoltN"), n);
    if (n > 1) gl.uniform2fv(s.u("uBolt"), f.flash.bolt.slice(0, n * 2));
    gl.uniform2f(s.u("uSunAt"), f.sunAz, f.sunEl);
    gl.uniform2f(s.u("uMoonAt"), f.moonAz, f.moonEl);
    const w = f.water;
    gl.uniform1f(s.u("uWindMs"), w.windMs);
    gl.uniform2fv(s.u("uWindTo"), w.windTo);
    gl.uniform2fv(s.u("uPawDrift"), w.pawDrift);
    gl.uniform2fv(s.u("uWaveDrift"), w.waveDrift);
    gl.uniform1f(s.u("uSlope"), w.slope);
    gl.uniform3fv(s.u("uSunGlint"), w.sunGlint);
    gl.uniform3fv(s.u("uMoonGlint"), w.moonGlint);
    gl.uniform1f(s.u("uGlintScale"), w.glintScale);
    gl.uniform1f(s.u("uAmb"), w.amb);
    gl.uniform3fv(s.u("uAmbTint"), w.ambTint);
    gl.uniform1f(s.u("uLightI"), w.lightI);
    gl.uniform3fv(s.u("uLightCol"), w.lightCol);
    gl.uniform1f(s.u("uFog"), w.fog);
    gl.uniform1f(s.u("uRain"), f.rain.level);
    gl.uniform1f(s.u("uRainFront"), f.rain.front);
    gl.uniform1f(s.u("uEyeH"), w.eyeH);
    gl.uniform1f(s.u("uShoreZ"), w.shoreZ);
    gl.uniform1f(s.u("uMirror"), w.mirror);
    gl.uniform1f(s.u("uLandFill"), f.landFill);
    gl.uniform3fv(s.u("uSunCol"), f.sunCol);
    gl.uniform3fv(s.u("uMoonCol"), f.moonCol);
    gl.uniform3fv(s.u("uMoonLight"), f.moonLight);
    const field = f.starfield, e = f.eclipse;
    gl.uniformMatrix3fv(s.u("uLocalToJ2000"), false, field.localToJ2000);
    gl.uniform1f(s.u("uMilkyVis"), field.milkyVisibility);
    gl.uniform4fv(s.u("uPlanets"), field.planets);
    gl.uniform3fv(s.u("uPlanetColors"), PLANET_COLORS);
    gl.uniform1f(s.u("uStarGain"), f.starGain);
    gl.uniform1f(s.u("uMilkyGain"), f.milkyGain);
    gl.uniform4fv(s.u("uEclipse"), e ? e.shadow : [0, 0, 0, 0]);
    gl.uniform1f(s.u("uEclipseSoft"), e ? e.soft : 1);
    gl.uniform3fv(s.u("uEclipseCore"), e ? e.core : [0, 0, 0]);
    gl.uniform3fv(s.u("uEclipseRim"), e ? e.rim : [0, 0, 0]);
    const c = f.clouds;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.uniform1i(s.u("uCloud"), 4);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudLowTex);
    gl.uniform1i(s.u("uCloudLow"), 11);
    gl.uniform1i(s.u("uClouds"), c ? 1 : 0);
    const peak = c ? Math.max(1e-3, ...c.lowLight) : 1;
    gl.uniform3fv(s.u("uRimLight"), c ? c.lowLight.map((v) => v / peak) : [0, 0, 0]);
    // Fade weak light to offset peak normalization.
    gl.uniform1f(s.u("uRimStrength"), Math.min(1, Math.max(0, (peak - 0.05) / 0.25)));
    gl.uniform3fv(s.u("uCloudLightDir"), c ? c.lowDir : [0, 1, 0]);
    gl.uniform1f(s.u("uCloudTop"), this.cloudTop);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(s.u("uShadow"), 6);
    gl.uniform1f(s.u("uShadowOff"), this.shadowOff);
    gl.uniform1f(s.u("uSunShare"), f.water.sunShare);
    gl.uniform1i(s.u("uShowShadow"), f.showShadow ? 1 : 0);
    gl.uniform1i(s.u("uShowDepth"), f.showDepth ? 1 : 0);
    gl.uniform1f(s.u("uRim"), f.rim);
    gl.uniform1f(s.u("uGrade"), f.grade);
    gl.uniform1f(s.u("uSunset"), f.sunset);
  }

  setView(view: ViewArt) {
    const gl = this.gl;
    this.landSize = [view.land.width, view.land.height];
    this.hasDepth = view.depth !== null && view.depth.width === view.land.width &&
      view.depth.height === view.land.height;
    this.viewName = view.name;
    this.depthRange = view.depthRange;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    for (const [tex, image] of [[this.landTex, view.land], [this.depthTex, view.depth]] as const) {
      if (!image) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.nearest(gl.TEXTURE_2D);
    }
    this.foliage = new Foliage(
      view.land,
      this.hasDepth ? view.depth : null,
      this.depthRange,
      false,
      view.foliage,
    );
    this.eyeRow = view.eyeRow;
    this.foreRise = view.foreRise;
    const [width, height] = this.landSize, rows = new Float32Array(width * 2);
    for (let x = 0; x < width; x++) {
      let top = -1;
      for (let y = 0; y < height; y++) {
        if (!this.foliage.solid[y * width + x]) continue;
        if (top < 0) top = y;
        rows[x * 2] = y + 1;
      }
      rows[x * 2 + 1] = Math.max(0, top);
    }
    gl.activeTexture(gl.TEXTURE0 + WATERLINE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.waterlineTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, width, 1, 0, gl.RG, gl.FLOAT, rows);
    this.nearest(gl.TEXTURE_2D);
    this.shadowPose = -1;
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.foliageTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8I,
      ...this.landSize,
      0,
      gl.RED_INTEGER,
      gl.BYTE,
      this.foliage.offsets,
    );
    this.nearest(gl.TEXTURE_2D);
    const fore = view.foreground;
    this.foreFoliage = fore && fore.width === view.land.width && fore.height === view.land.height
      ? new Foliage(fore, null, this.depthRange, true)
      : null;
    this.foreEdges = trunkEdges(this.foreFoliage?.solid ?? null, ...this.landSize);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.foreTex);
    if (this.foreFoliage && fore) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fore);
    } else {gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(4),
      );}
    this.nearest(gl.TEXTURE_2D);
    const foreSize = this.foreFoliage ? this.landSize : [1, 1];
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this.foreFoliageTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8I,
      foreSize[0],
      foreSize[1],
      0,
      gl.RED_INTEGER,
      gl.BYTE,
      this.foreFoliage?.offsets ?? new Int8Array(1),
    );
    this.nearest(gl.TEXTURE_2D);
  }

  get gpu() {
    return String(this.gl.getParameter(this.gl.RENDERER));
  }

  get landWidth() {
    return this.landSize[0];
  }
}
