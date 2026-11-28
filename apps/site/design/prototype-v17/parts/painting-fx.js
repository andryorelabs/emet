function paintingFx(host,o){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small=matchMedia('(max-width:900px), (pointer:coarse)').matches;
  const base=o.base||host.querySelector('img'),tex=o.tex||base,SC=o.eyeScale||1,SM=o.skyMask||[.33,.43],when=o.when||(()=>true);
  const IW=o.iw||1672,IH=o.ih||941,POS=o.pos||(()=>{const q=getComputedStyle(base).objectPosition.split(' ').map(v=>parseFloat(v)/100);return q.length===2&&q.every(isFinite)?q:[.5,.5]})();
  const flags=Object.assign({clouds:1,water:1,eyes:1},o.flags||{});
  if(small){flags.clouds=0;flags.eyes=0}
  if(reduce){flags.clouds=0;flags.water=0;flags.eyes=0}
  const api={flags,glowAt:-1e9,blinkAt:-1e9,destroy(){alive=false}};
  let alive=true,visible=false,G={s:1,ox:0,oy:0,cw:0,ch:0};
  const mk=(tag,cls)=>{const e=document.createElement(tag);e.className=cls;e.setAttribute('aria-hidden','true');e.style.cssText='position:absolute;pointer-events:none;display:none';return e};
  const sky=mk('div','fx-sky');sky.style.inset='0';sky.style.overflow='hidden';
  const skyImg=new Image();const bs=getComputedStyle(base);skyImg.src=tex.currentSrc||tex.src;skyImg.alt='';skyImg.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:'+(bs.objectPosition||'50% 50%')+';filter:'+(bs.filter||'none');
  sky.appendChild(skyImg);
  const water=mk('canvas','fx-water'),eyes=mk('canvas','fx-eyes');
  (o.anchor||base).after(sky,water,eyes);
  function geo(){const cw=host.clientWidth,ch=host.clientHeight,s=Math.max(cw/IW,ch/IH);G={s,cw,ch,ox:(cw-IW*s)*POS[0],oy:(ch-IH*s)*POS[1]};
    const y1=G.oy+IH*s*SM[0],y2=G.oy+IH*s*SM[1],m=`linear-gradient(180deg,#000 0,#000 ${y1}px,transparent ${y2}px)`;sky.style.webkitMaskImage=m;sky.style.maskImage=m;
    place(water,o.waterRegion||[560,600,600,341]);place(eyes,eyeRegion())}
  function place(c,r){c.style.left=(G.ox+r[0]*G.s)+'px';c.style.top=(G.oy+r[1]*G.s)+'px';c.style.width=(r[2]*G.s)+'px';c.style.height=(r[3]*G.s)+'px'}
  const E=o.eyes||[[1352,672],[1386,672.5]];
  function eyeRegion(){const x0=Math.min(E[0][0],E[1][0])-24*SC,x1=Math.max(E[0][0],E[1][0])+24*SC,y0=Math.min(E[0][1],E[1][1])-22*SC,y1=Math.max(E[0][1],E[1][1])+24*SC;return[x0,y0,x1-x0,y1-y0]}
  const LINES=[{p:[[603,627],[660,638],[707,657],[747,677],[793,696],[827,707],[850,718]],w:[8,9,11,13,14,14,14]},{p:[[1110,621],[1060,635],[1003,652],[960,667],[940,680],[923,697],[903,710]],w:[8,9,10,11,12,12,12]},{p:[[837,613],[835,623],[853,637],[877,648],[910,658],[932,667]],w:[4,4,4,4,4,4]},{p:[[872,722],[862,780],[838,840],[805,941]],w:[34,80,130,190]}];
  function flowMap(R){const W=R[2],H=R[3],d=new Uint8Array(W*H*4);
    for(let r=0;r<H;r++)for(let x=0;x<W;x++){const px=R[0]+x+.5,py=R[1]+H-(r+.5);let best=0,bdx=0,bdy=0;
      for(const ln of LINES)for(let i=0;i<ln.p.length-1;i++){const ax=ln.p[i][0],ay=ln.p[i][1],bx=ln.p[i+1][0],by=ln.p[i+1][1],sx=bx-ax,sy=by-ay,l2=sx*sx+sy*sy,u=Math.max(0,Math.min(1,((px-ax)*sx+(py-ay)*sy)/l2)),cx=ax+sx*u,cy=ay+sy*u,dist=Math.hypot(px-cx,py-cy),hw=ln.w[i]+(ln.w[i+1]-ln.w[i])*u;
        if(dist<hw){const t=Math.max(0,Math.min(1,(dist-hw*.5)/(hw*.5))),m=1-t*t*(3-2*t);if(m>best){best=m;const sl=Math.sqrt(l2);bdx=sx/sl;bdy=sy/sl}}}
      const q=(r*W+x)*4;d[q]=Math.round((bdx*.5+.5)*255);d[q+1]=Math.round((bdy*.5+.5)*255);d[q+3]=Math.round(best*255)}
    return d}
  const VS='attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  function program(c,fs){const g=c.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:false});if(!g)return null;
    const sh=(t,src)=>{const s=g.createShader(t);g.shaderSource(s,src);g.compileShader(s);return s};
    const pr=g.createProgram();g.attachShader(pr,sh(g.VERTEX_SHADER,VS));g.attachShader(pr,sh(g.FRAGMENT_SHADER,fs));g.linkProgram(pr);g.useProgram(pr);
    const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);const al=g.getAttribLocation(pr,'a');g.enableVertexAttribArray(al);g.vertexAttribPointer(al,2,g.FLOAT,false,0,0);
    const tex=(unit,flip,fn)=>{const t=g.createTexture();g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,t);for(const k of[g.TEXTURE_MIN_FILTER,g.TEXTURE_MAG_FILTER])g.texParameteri(g.TEXTURE_2D,k,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,flip);fn()};
    return{g,pr,U:n=>g.getUniformLocation(pr,n),tex}}
  let W=null,Ey=null,wFail=false,eFail=false;
  function makeWater(){if(!tex.complete||!tex.naturalWidth)return null;const R=o.waterRegion||[560,600,600,341];
    const P=program(water,'precision mediump float;varying vec2 v;uniform sampler2D uI,uF;uniform float uT;uniform vec4 uR;uniform vec2 uS;uniform float uA;void main(){vec4 f=texture2D(uF,v);vec2 dir=f.rg*2.-1.;vec2 p=vec2(uR.x+v.x*uR.z,uR.y+(1.-v.y)*uR.w);vec2 off=vec2(dir.x,-dir.y)*uA/uS;float t=uT*.32;float p0=fract(t),p1=fract(t+.5);float w0=1.-abs(2.*p0-1.);vec2 q=vec2(p.x/uS.x,1.-p.y/uS.y);vec4 a=texture2D(uI,q-off*(p0-.5));vec4 b=texture2D(uI,q-off*(p1-.5));vec3 c=mix(texture2D(uI,q).rgb,mix(b.rgb,a.rgb,w0),.9);float al=f.a;gl_FragColor=vec4(c*al,al);}');
    if(!P){wFail=true;return null}const g=P.g;
    P.tex(0,true,()=>g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,tex));
    P.tex(1,false,()=>g.texImage2D(g.TEXTURE_2D,0,g.RGBA,R[2],R[3],0,g.RGBA,g.UNSIGNED_BYTE,flowMap(R)));
    g.uniform1i(P.U('uI'),0);g.uniform1i(P.U('uF'),1);g.uniform4f(P.U('uR'),R[0],R[1],R[2],R[3]);g.uniform2f(P.U('uS'),IW,IH);g.uniform1f(P.U('uA'),12);const uT=P.U('uT');
    return{draw(t){const tw=Math.max(2,Math.round(R[2]*G.s)),th=Math.max(2,Math.round(R[3]*G.s));if(water.width!==tw||water.height!==th){water.width=tw;water.height=th}g.viewport(0,0,tw,th);g.uniform1f(uT,t/1000);g.drawArrays(g.TRIANGLE_STRIP,0,4)}}}
  function makeEyes(){if(!tex.complete||!tex.naturalWidth)return null;const R=eyeRegion();
    const P=program(eyes,'precision highp float;varying vec2 v;uniform sampler2D uI;uniform vec4 uR;uniform vec2 uS,uE0,uE1,uO0,uO1;uniform float uLid,uGlow,uK;void main(){vec2 p=vec2(uR.x+v.x*uR.z,uR.y+(1.-v.y)*uR.w);vec2 q=p;float hi=0.;float r0=length(p-uE0),r1=length(p-uE1);'
      +'if(r0<11.*uK){float w=1.-smoothstep(6.5*uK,11.*uK,r0);q=p-uO0*w;q.y=uE0.y+clamp((q.y-uE0.y)/mix(1.,uLid,w),-10.*uK,10.*uK);hi=max(hi,1.-smoothstep(5.*uK,9.*uK,r0));}'
      +'if(r1<11.*uK){float w=1.-smoothstep(6.5*uK,11.*uK,r1);q=p-uO1*w;q.y=uE1.y+clamp((q.y-uE1.y)/mix(1.,uLid,w),-10.*uK,10.*uK);hi=max(hi,1.-smoothstep(5.*uK,9.*uK,r1));}'
      +'vec3 c=texture2D(uI,vec2(q.x/uS.x,1.-q.y/uS.y)).rgb;c=mix(c,c*1.35+vec3(.12,.08,0.),uGlow*hi);float al=1.-smoothstep(10.5*uK,12.5*uK,min(r0,r1));gl_FragColor=vec4(c*al,al);}');
    if(!P){eFail=true;return null}const g=P.g;
    P.tex(0,true,()=>g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,tex));
    g.uniform1i(P.U('uI'),0);g.uniform4f(P.U('uR'),R[0],R[1],R[2],R[3]);g.uniform2f(P.U('uS'),IW,IH);g.uniform2f(P.U('uE0'),E[0][0],E[0][1]);g.uniform2f(P.U('uE1'),E[1][0],E[1][1]);g.uniform1f(P.U('uK'),SC);
    const uO0=P.U('uO0'),uO1=P.U('uO1'),uLid=P.U('uLid'),uGlow=P.U('uGlow'),d=Math.min(devicePixelRatio||1,2);
    return{draw(off,lid,glow){const tw=Math.max(2,Math.round(R[2]*G.s*d)),th=Math.max(2,Math.round(R[3]*G.s*d));if(eyes.width!==tw||eyes.height!==th){eyes.width=tw;eyes.height=th}g.viewport(0,0,tw,th);g.uniform2f(uO0,off[0][0],off[0][1]);g.uniform2f(uO1,off[1][0],off[1][1]);g.uniform1f(uLid,lid);g.uniform1f(uGlow,glow);g.drawArrays(g.TRIANGLE_STRIP,0,4)}}}
  const off=[[0,0],[0,0]];let blinkNext=performance.now()+3000,blinkStart=-1e9;
  function frame(t){if(!alive)return;requestAnimationFrame(frame);if(!visible||document.hidden)return;if(!when()){sky.style.display=water.style.display=eyes.style.display='none';return}
    skyImg.parentNode.style.display=flags.clouds?'block':'none';
    if(flags.clouds)skyImg.style.transform=`translateX(${(Math.sin(t/70000*6.2832)*G.cw*.026).toFixed(2)}px) scaleX(1.05)`;
    if(flags.water&&!wFail){if(!W)W=makeWater();if(W){water.style.display='block';W.draw(t)}}else water.style.display='none';
    if(flags.eyes&&!eFail){if(!Ey)Ey=makeEyes();if(Ey){eyes.style.display='block';const gz=o.gaze&&o.gaze(),tg=[[0,0],[0,0]];
        if(gz)E.forEach((e,i)=>{const dx=gz.x-(G.ox+e[0]*G.s),dy=gz.y-(G.oy+e[1]*G.s),d=Math.hypot(dx,dy)||1,k=Math.min(d/90,1)*3*SC;tg[i]=[dx/d*k,dy/d*k]});
        if(t>blinkNext){blinkStart=t;blinkNext=t+3500+Math.random()*3500}if(api.blinkAt>blinkStart){blinkStart=t;api.blinkAt=-1e9}
        off.forEach((q,i)=>{q[0]+=(tg[i][0]-q[0])*.25;q[1]+=(tg[i][1]-q[1])*.25});
        const bt=t-blinkStart,lid=bt>=0&&bt<160?1-.88*Math.sin(Math.PI*bt/160):1;Ey.draw(off,lid,Math.max(0,1-(t-api.glowAt)/900))}}
    else eyes.style.display='none'}
  new ResizeObserver(geo).observe(host);geo();
  new IntersectionObserver(es=>{visible=es[0].isIntersecting}).observe(host);
  if(!reduce)requestAnimationFrame(frame);
  return api}
