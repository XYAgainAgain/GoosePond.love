const MIST_TILE_M = 240, BANK_TILE_M = 480;
// The wrap includes a full half-frequency warp period.
export const FOG_WRAP_M = 2 * BANK_TILE_M;

/** Horizontal distances are in m from the eye. */
export const FOG_FRAG = `
uniform sampler3D uNoise;
uniform float uMist, uFogBank, uFogBow, uMistBow, uMistRise;
// Blanket, wisp, and steam weights summing to 1 (mistStyle in pond.ts).
uniform vec3 uMistStyle;
// m upwind from the eye to the coast.
uniform float uFogCoast;
uniform vec2 uFogDrift, uFogBeam;

// Mirrors KELPII’s fogDensity warp order.
float warped(vec3 p,float lod){
  vec3 w=textureLod(uNoise,p*.5+vec3(.37,.11,.27),lod+1.).gba-.5;
  float turn=w.z*14.;
  vec2 bend=vec2(cos(turn),sin(turn))*(.03+length(w)*.25);
  vec4 n=textureLod(uNoise,p+vec3(bend.x,w.x*.2,bend.y),lod);
  return mix(n.a,n.r,.45);
}


float mistTop(){ return dot(uMistStyle,vec3(3.,6.,10.))*(.6+.4*uMist); }

float mistAt(vec2 g,float h,float top){
  float n=warped(vec3(g.x/${MIST_TILE_M}.,h/16.+.43,g.y/${MIST_TILE_M}.),0.);
  float d=uMistStyle.x*(.7+.3*n)+uMistStyle.y*smoothstep(.4,.68,n);
  if(uMistStyle.z>.01) d+=uMistStyle.z*smoothstep(.5,.78,textureLod(uNoise,vec3(g.x/40.,h/7.-uMistRise,g.y/40.),0.).r)*(.4+.6*n);
  return d*(1.-smoothstep(.3,1.,h/top));
}

float mistDepth(vec3 v,float hit,float shore,float jit){
  float top=mistTop(), slope=v.y/length(v.xz);
  float start=8., end=min(hit,shore);
  if(slope>0.) end=min(end,(top-uEyeH)/slope);
  else if(uEyeH>top) start=max(start,(top-uEyeH)/slope);
  if(end<=start) return 0.;
  vec2 dir=normalize(v.xz);
  float sum=0.;
  for(int i=0;i<2;i++){
    float z=mix(start,end,(float(i)+jit)*.5), h=uEyeH+z*slope;
    sum+=mistAt(dir*z+uFogDrift,h,top)*smoothstep(8.,40.,z)*mix(.6,1.,1.-smoothstep(.8*shore,shore,z));
  }
  // 60 m extinction length at full mist density.
  return .5*sum*(end-start)*uMist/60.;
}

float bankAt(vec2 xz,float h){
  vec2 g=xz+uFogDrift;
  float n=warped(vec3(g.x/${BANK_TILE_M}.,h/130.+.13,g.y/${BANK_TILE_M}.),2.);
  float s=dot(xz,uFogFrom)-mix(uFogCoast,-2000.,uFogBank)-(n-.5)*500.;
  if(s<=0.) return 0.;
  float deep=smoothstep(100.,1000.,s), top=mix(90.,160.,deep)*(.7+.6*n), base=mix(22.,0.,deep);
  return smoothstep(0.,300.,s)*smoothstep(base,base+8.,h)*(1.-smoothstep(top*.55,top,h))*mix(smoothstep(.22,.6,n),1.,.75*deep);
}

float bankDepth(vec3 v,float hit,float jit){
  float slope=v.y/length(v.xz), lead=dot(normalize(v.xz),uFogFrom);
  // The front's leading edge under bankAt's noise.
  float front=mix(uFogCoast,-2000.,uFogBank)-250.;
  float start=8., end=min(hit,6000.);
  if(slope>0.) end=min(end,(210.-uEyeH)/slope);
  if(front>0.){
    if(lead<=.01) return 0.;
    start=max(start,front/lead);
  }else if(lead<-.01) end=min(end,front/lead);
  if(end<=start) return 0.;
  vec2 dir=normalize(v.xz);
  float sum=0.;
  for(int i=0;i<4;i++){
    float z=mix(start,end,(float(i)+jit)*.25);
    sum+=bankAt(dir*z,uEyeH+z*slope);
  }
  // 120 m extinction length at full bank density.
  return .25*sum*(end-start)/120.;
}

float fogGlow(float mu){
  return min(1.4,.47/pow(1.52-1.44*clamp(mu,-1.,1.),1.5));
}

// rgb light, a transmittance (1 leaves the color untouched).
vec4 fogLight(vec2 p,float el,float hit,bool land){
  // Fixed jitter: random samples checkerboard after quantization.
  float az=azAt(p.x), jit=.5;
  vec3 v=dirAt(vec2(az,el));
  float shore=0.;
  if(uMist>0.) for(int i=-2;i<=2;i++) shore+=shoreAt(p.x+float(i)*7.)*float(3-abs(i))/9.;
  float mistHit=uMist>0.&&!land&&abs(hit-shoreAt(p.x))<1.?shore:hit;
  float mist=uMist>0.?mistDepth(v,mistHit,shore,jit):0., bank=uFogBank>0.?bankDepth(v,hit,jit):0.;
  float depth=mist+bank;
  if(depth<=.001) return vec4(0.,0.,0.,1.);
  // Nearby water shadows stand in for direct light reaching the fog.
  vec2 lit=shadowAt(vec2(p.x,uHorizon+atan(uEyeH/min(hit,200.))/uRadPerPx));
  vec3 sun=dirAt(uSunAt), moon=dirAt(uMoonAt);
  vec3 sunCol=mix(uSunCol,vec3(dot(uSunCol,vec3(.2126,.7152,.0722))),.5);
  float bow=(uFogBow*bank+uMistBow*mist)/depth, glow=fogGlow(dot(v,sun));
  if(bow>.002){
    // Fogbow ring: radius and width in degrees from the antisolar point.
    float arc=(degFrom(v,-sun)-40.)/6.;
    glow+=.25*bow*exp2(-4.*arc*arc)*smoothstep(.25,1.1,depth);
  }
  vec3 light=.52*air(az,.12)+.55*uAmb*uAmbTint
    +.6*(sunCol*uFogBeam.x*lit.x*glow+MOONLIGHT*uFogBeam.y*lit.y*fogGlow(dot(v,moon)));
  light/=1.+.55*max(light.r,max(light.g,light.b));
  light=mix(light,vec3(dot(light,vec3(.2126,.7152,.0722)))*vec3(1.25,1.28,1.32),1.-exp(-.35*depth));
  return vec4(light,exp(-depth));
}
float fogged(vec4 fog,inout vec3 color){
  if(fog.a<1.) color=mix(fog.rgb,color,fog.a);
  return fog.a;
}
`;
