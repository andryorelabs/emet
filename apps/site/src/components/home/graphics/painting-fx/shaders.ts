/** River shader: two phase-shifted samples pushed along the flow map, masked by its alpha. */
export const WATER_FRAGMENT =
  "precision mediump float;varying vec2 v;uniform sampler2D uI,uF;uniform float uT;uniform vec4 uR;uniform vec2 uS;uniform float uA;" +
  "void main(){vec4 f=texture2D(uF,v);vec2 dir=f.rg*2.-1.;vec2 p=vec2(uR.x+v.x*uR.z,uR.y+(1.-v.y)*uR.w);" +
  "vec2 off=vec2(dir.x,-dir.y)*uA/uS;float t=uT*.32;float p0=fract(t),p1=fract(t+.5);float w0=1.-abs(2.*p0-1.);" +
  "vec2 q=vec2(p.x/uS.x,1.-p.y/uS.y);vec4 a=texture2D(uI,q-off*(p0-.5));vec4 b=texture2D(uI,q-off*(p1-.5));" +
  "vec3 c=mix(texture2D(uI,q).rgb,mix(b.rgb,a.rgb,w0),.9);float al=f.a;gl_FragColor=vec4(c*al,al);}";

/** Eyes shader: gaze shift, lid squash and a warm glow inside two discs around the eyes. */
export const EYES_FRAGMENT =
  "precision highp float;varying vec2 v;uniform sampler2D uI;uniform vec4 uR;uniform vec2 uS,uE0,uE1,uO0,uO1;uniform float uLid,uGlow,uK;" +
  "void main(){vec2 p=vec2(uR.x+v.x*uR.z,uR.y+(1.-v.y)*uR.w);vec2 q=p;float hi=0.;float r0=length(p-uE0),r1=length(p-uE1);" +
  "if(r0<11.*uK){float w=1.-smoothstep(6.5*uK,11.*uK,r0);q=p-uO0*w;q.y=uE0.y+clamp((q.y-uE0.y)/mix(1.,uLid,w),-10.*uK,10.*uK);hi=max(hi,1.-smoothstep(5.*uK,9.*uK,r0));}" +
  "if(r1<11.*uK){float w=1.-smoothstep(6.5*uK,11.*uK,r1);q=p-uO1*w;q.y=uE1.y+clamp((q.y-uE1.y)/mix(1.,uLid,w),-10.*uK,10.*uK);hi=max(hi,1.-smoothstep(5.*uK,9.*uK,r1));}" +
  "vec3 c=texture2D(uI,vec2(q.x/uS.x,1.-q.y/uS.y)).rgb;c=mix(c,c*1.35+vec3(.12,.08,0.),uGlow*hi);" +
  "float al=1.-smoothstep(10.5*uK,12.5*uK,min(r0,r1));gl_FragColor=vec4(c*al,al);}";
