export const RAIN_FRAG = `
float surfaceRainRings(vec2 p,float Z){
  if(Z>=90.) return 0.;
  const vec2 size=vec2(11.,6.);
  ivec2 base=ivec2(floor(p/size-vec2(.5,0.)));
  float odds=.02*smoothstep(0.,.08,uRain)+.12*uRain;
  float mark=0.;
  for(int y=-1;y<=1;y++)for(int x=0;x<=1;x++){
    ivec2 id=base+ivec2(x,y);
    float seed=hash(ivec3(id,137));
    float clock=uT/.75+seed*43., age=fract(clock);
    float roll=hash(ivec3(id,int(mod(floor(clock),65536.))+191));
    if(roll>=odds) continue;
    vec2 center=(vec2(id)+.5)*size;
    center+=vec2(floor(hash(ivec3(id,217))*3.)-1.,.5);
    if(center.y<=uHorizon) continue;
    float dep=min((center.y-uHorizon)*uRadPerPx,1.5);
    float distanceM=min(shoreAt(center.x),uEyeH/tan(dep));
    if(roll>=odds*(1.-smoothstep(30.,90.,distanceM))) continue;
    float radius=(4.+6.*seed)*age*.75;
    vec2 offset=p-center;
    float ink;
    if(radius<1.15){
      ink=all(lessThan(abs(offset),vec2(.5)))?-.48:0.;
    }else{
      vec2 axes=vec2(radius,max(1.,radius*sin(dep)));
      vec2 q=offset/axes;
      float edge=(dot(q,q)-1.)/max(.001,2.*length(q/axes));
      ink=edge>=-.25&&edge<.65?1.:edge>=-1.25&&edge<-.25?-.42:0.;
    }
    ink*=1.-smoothstep(.22,1.,age);
    if(abs(ink)>abs(mark)) mark=ink;
  }
  return mark*(1.-smoothstep(75.,90.,Z));
}

vec3 weatherSky(vec3 sky){
  float luma=dot(sky,vec3(.2126,.7152,.0722));
  return mix(vec3(luma),sky,.35)*min(1.,3.*uAmb)+.85*uAmb*uAmbTint;
}

vec3 rainSurface(vec3 color,vec2 p,float Z,vec3 light,float hiss,float wet){
  if(wet<=0.) return color;
  float ring=surfaceRainRings(p,Z)*(1.-.65*hiss)*wet;
  color=color*(1.+.28*min(ring,0.))+.23*max(ring,0.)*light;
  if(hiss<=0.) return color;
  ivec2 pixel=ivec2(floor(p));
  float phase=hash(ivec3(pixel,337));
  float slot=floor(uT*8.+phase);
  float roll=hash(ivec3(pixel,int(mod(slot,65536.))+373));
  float nearWater=1.-smoothstep(18.,90.,Z);
  float bounce=roll<.03*hiss*nearWater?1.:0.;
  return color*(1.+(roll-.5)*.1*hiss)+.3*bounce*light;
}

float pondFoam(vec2 p,float Z,float paw){
  float wind=smoothstep(12.,20.,uWindMs);
  if(wind<=0.||Z>=90.) return 0.;
  vec2 size=vec2(5.,2.), cell=floor(p/size);
  ivec2 id=ivec2(cell);
  float seed=hash(ivec3(id,419));
  float clock=uT/(.38+.41*seed)+seed*41., age=fract(clock);
  float roll=hash(ivec3(id,int(mod(floor(clock),65536.))+431));
  float nearWater=1.-smoothstep(12.,90.,Z);
  if(roll>=.05*wind*nearWater*paw) return 0.;
  vec2 local=floor(p-cell*size);
  float width=1.+floor(min(2.,2.8*wind*nearWater*seed));
  float start=floor(fract(seed*19.)*(6.-width));
  if(local.y!=floor(seed*2.)||local.x<start||local.x>=start+width) return 0.;
  return smoothstep(0.,.12,age)*(1.-smoothstep(.48,1.,age));
}

float rainStreak(vec2 p,float across,float depth,float fall,vec2 size,float run,float odds,int salt){
  if(odds<=0.) return 0.;
  float lean=clamp(across/fall,-.9,.9);
  float speed=fall/(depth*uRadPerPx);
  float period=size.y*8192./speed;
  vec2 grid=vec2(p.x-lean*(p.y-uHorizon),p.y-mod(uT,period)*speed);
  vec2 cell=floor(grid/size), local=grid-cell*size;
  ivec2 id=ivec2(mod(cell,8192.));
  if(hash(ivec3(id,salt))>=odds) return 0.;
  float seed=hash(ivec3(id,salt+1));
  float lengthPx=run+floor(seed*2.);
  float head=floor(fract(seed*37.)*(size.y-lengthPx+1.));
  float column=floor(seed*size.x);
  return floor(local.x)==column&&local.y>=head&&local.y<head+lengthPx?1.:0.;
}

vec3 fallingRain(vec3 color,vec2 p,float el){
  float across=dot(uWindTo,vec2(cos(uHeadAz),-sin(uHeadAz)));
  float az=azAt(p.x);
  // Near run ≈ one 30 FPS frame of fall, so drops streak instead of hopping.
  float farDrop=rainStreak(p,across,24.,7.,vec2(9.,13.),3.,.65*uRain*rainHere(az,24.),487);
  float nearDrop=rainStreak(p,across,8.,9.,vec2(12.,19.),7.,.53*uRain*rainHere(az,8.),509);
  // rainVeil covers bright backgrounds.
  float dark=1.-smoothstep(.08,.35,dot(color,vec3(.2126,.7152,.0722)));
  float opacity=(.08*farDrop+.35*nearDrop)*dark;
  if(opacity<=0.) return color;
  vec3 lit=weatherSky(air(az,clamp(el,0.,1.553)));
  return color+opacity*lit*(1.-clamp(color,0.,1.));
}
`;
