// js/bg-clouds-storm.js — Clouds (ominous Bare) + Lightning/Thunder visuals + exposure flash
(() => {

/* =========================================================
   UTILITIES
========================================================= */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const ease=(t)=>t*t*(3-2*t);
function smooth01(t){ return t<=0?0 : t>=1?1 : t*t*(3-2*t); }

/* =========================================================
   CLOUDS — stratified painterly deck with "Bare" dread
========================================================= */
(function Clouds(){
  let built=false, wrap, cvs, ctx, w=0, h=0, dpr=1;
  const SPRITES_SRC = [
    "images/clouds/cloud1.png","images/clouds/cloud2.png",
    "images/clouds/cloud3.png","images/clouds/cloud4.png"
  ];
  const sprites=[];

  // state
  const clouds=[];
  let rainProgress = 0;    // 0..1 rain intensity
  let stageProgress = 0;   // 0..1 Full→Bare
  let lastStageProbe = 0;
  let windX = 0, windTarget = 0;

  // offscreen tint buffer
  let off = document.createElement('canvas');
  let octx = off.getContext('2d');

  // stillness thresholds for Bare
  const BARE_LOCK = 0.78;  // start freezing here
  const BARE_STOP = 0.92;  // spawning fully stopped here

  // Three “decks”: top stays full; mid grows; low grows last (never too low).
  const LAYERS = [
    { key:"TOP", yFrac:0.14, jitter:12,
      density:(st,r)=> (st<1/3?0: 0.75 + 0.25*r),
      alpha:(st,r)=> 0.72 + 0.28*r },
    { key:"MID", yFrac:0.26, jitter:16,
      density:(st,r)=> (st<1/3?0: (st<2/3? (st-1/3)/(1/3)*0.8 : 0.8 + (st-2/3)/(1/3)*0.2)) * (0.75+0.25*r),
      alpha:(st,r)=> 0.66 + 0.34*r },
    { key:"LOW", yFrac:0.38, jitter:18,
      density:(st,r)=> (st<2/3?0: ((st-2/3)/(1/3))) * (0.70+0.30*r),
      alpha:(st,r)=> 0.62 + 0.38*r }
  ];
  const BASE_SPAWN = 1;      // total clouds/sec (distributed across layers)
  const MAX_CLOUDS = 30;
  const WIND_EASE  = 0.06;

  // heavier/colder tint as Bare approaches
  function darkFactor(st, rain){
    if (st < 1/3) return 0;
    const bareT = Math.max(0, (st-2/3)/(1/3));
    return (0.08 + 0.22*bareT) * (0.60 + 0.40*rain);
  }

  function resetCtx(){
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  function css(){
    if (document.getElementById("bgclouds-style")) return;
    const s = document.createElement("style");
    s.id = "bgclouds-style";
    s.textContent = `
      #bg #bgClouds{ position:fixed; inset:0; pointer-events:none; z-index:7; }
      #bgClouds canvas{
        position:fixed; inset:0;
        transform: translateZ(0);
        image-rendering: optimizeQuality;
      }
      /* storm visuals (above clouds) */
      #bg #bgStorm{ position:fixed; inset:0; pointer-events:none; z-index:8; }
      #stormBolts{ position:fixed; inset:0; width:100vw; height:100vh; }
      #stormFlash{
        position:fixed; inset:0;
        opacity:0; background:#fff; mix-blend-mode:screen;
        transition:opacity 120ms ease-out;
      }
    `;
    document.head.appendChild(s);
  }

  function loadSprites(onDone){
    let left = SPRITES_SRC.length;
    SPRITES_SRC.forEach(src=>{
      const i = new Image(); i.src = src; i.onload = ()=>{ sprites.push(i); if(--left===0) onDone(); };
    });
  }

  function build(){
    if (built) return;
    css();
    wrap = document.createElement("div");
    wrap.id = "bgClouds";
    const bg = document.getElementById("bg");
    cvs = document.createElement("canvas");
    ctx = cvs.getContext("2d");
    wrap.appendChild(cvs);
    if (bg) bg.appendChild(wrap);
    onResize(); window.addEventListener("resize", onResize);
    built = true; loop();
    // also build storm wrapper once (layer sits above clouds)
    ensureStormDOM();
  }

  function onResize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    w = cvs.width  = Math.round(innerWidth  * dpr);
    h = cvs.height = Math.round(innerHeight * dpr);
    cvs.style.width  = innerWidth + "px";
    cvs.style.height = innerHeight + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function pickLayer(){
    // weight by target densities at this moment
    const weights = LAYERS.map(L=>Math.max(0.0001, L.density(stageProgress, rainProgress)));
    const sum = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*sum, idx=0;
    for (; idx<weights.length; idx++){ if ((r-=weights[idx])<=0) break; }
    return LAYERS[Math.min(idx, LAYERS.length-1)];
  }

  function spawnCloud(scud=false){
    if (!sprites.length || stageProgress<1/3) return;
    const img  = sprites[Math.floor(Math.random()*sprites.length)];
    const L    = scud ? LAYERS[2] : pickLayer();

    const sc   = scud ? lerp(0.22, 0.38, Math.random()) : lerp(0.38, 0.88, Math.random());
    const rot  = lerp(-4, 4, Math.random()) * Math.PI/180;
    const flip = Math.random()<0.5? -1: 1;

    // start above band so it “grows” downward
    const bandY= innerHeight * L.yFrac;
    const y0   = (bandY - 120) - Math.random()*160;
    const x0   = Math.random()*innerWidth;

    const vx   = (scud ? lerp(-36, 46, Math.random()) : lerp(-16, 16, Math.random()));
    const vy   = (scud ? lerp(10, 24, Math.random())  : lerp(4, 10, Math.random()));
    const a    = 0;
    const aK   = Math.max(0.75, clamp(L.alpha(stageProgress, rainProgress), 0.25, 1));

    clouds.push({ img, x:x0, y:y0, vx, vy, sc, a, dark:0, rot, flip, aK, layer:L, scud });
    if (clouds.length > MAX_CLOUDS) clouds.shift();
  }

  // optional: storm curtains (virga-like streaks)
  function drawCurtainStreaks(){
    const streakA = Math.max(0, (stageProgress-0.74)/0.26) * (0.05 + 0.15*rainProgress);
    if (streakA<=0.01) return;
    ctx.save();
    ctx.globalAlpha = streakA;
    ctx.globalCompositeOperation='multiply';
    for (let x=0; x<innerWidth; x+= Math.round(lerp(28, 46, Math.random()))){
      const w = Math.round(lerp(1,3,Math.random()));
      ctx.fillStyle = 'rgba(70,78,88,0.8)';
      const y0 = innerHeight*0.22;
      const h = innerHeight*lerp(0.45,0.75,Math.random());
      ctx.fillRect(x, y0, w, h);
    }
    ctx.restore();
  }

  // optional: slow occlusion pulse (heavy mass overhead)
  let occlT=0, nextOcclAt=performance.now()+2000+Math.random()*4000;
  function maybeOcclusionPulse(now){
    if (stageProgress < 0.76) return;
    if (now < nextOcclAt) return;
    nextOcclAt = now + 4000 + Math.random()*5000;
    occlT = 1; // start pulse
  }
  function applyOcclusionPulse(dt){
    if (occlT<=0) return 0;
    occlT = Math.max(0, occlT - dt*0.5);
    return 0.06 * ease(occlT); // peak ~6%
  }

  /* ======= public API ======= */
  window.__clouds = {
    setRainProgress(p){ rainProgress = clamp(p||0,0,1); },
    setStageProgress(p){ stageProgress = clamp(p||0,0,1); },
    setWind(pxPerSec){ windTarget = pxPerSec||0; }
  };

  // optional auto-probe from global progress input
  setInterval(()=>{
    const now = performance.now();
    if (now - lastStageProbe > 100){
      lastStageProbe = now;
      if (typeof window.__currentProgress === "number"){
        window.__clouds.setStageProgress(window.__currentProgress);
      }
    }
  },110);

  /* ======= main loop ======= */
  let last = performance.now(), spawnAcc = 0, seeded=false, scudAcc=0;
  function loop(now = performance.now()){
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now-last)/1000); last = now;

    // wind easing
    windX += (windTarget - windX) * WIND_EASE;

    // spawn rate by density; stabilize in Bare
    const totalDensity = LAYERS.reduce((s,L)=>s + L.density(stageProgress, rainProgress), 0);

    // one-time seeding for fast scrolls
    if (!seeded && stageProgress >= 0.7) {
      const targetCount = Math.round(lerp(18, 26, rainProgress));
      for (let i = 0; i < targetCount; i++) spawnCloud();
      seeded = true;
      clouds.forEach(c => { c.vx *= 0.3; c.vy *= 0.3; });
    }

    // As we approach Bare, ramp spawning down to 0.
    const barePhase = smooth01((stageProgress - BARE_LOCK) / (BARE_STOP - BARE_LOCK)); // 0..1
    let spawnRate = BASE_SPAWN * totalDensity * (1 - barePhase);

    // Keep a stable occupancy in Bare
    const desiredCount = Math.round(lerp(18, 26, rainProgress));
    if (stageProgress >= BARE_LOCK && clouds.length >= desiredCount) spawnRate = 0;

    spawnAcc += spawnRate * dt;
    while (spawnAcc >= 1){ spawnAcc -= 1; spawnCloud(); }

    // scud tatters: low, fast, jittery when stormy
    const scudRate = (stageProgress>0.75 ? lerp(0.0, 0.6, rainProgress) : 0);
    scudAcc += scudRate * dt;
    while (scudAcc >= 1){ scudAcc -= 1; spawnCloud(true); }

    // draw
    resetCtx();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cvs.width, cvs.height);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    clouds.forEach(c=>{
      // lower deck in Bare to feel oppressive
      const deckDrop = 12 * Math.max(0, (stageProgress-0.7)/0.3);
      const stillK = smooth01((stageProgress - 0.66) / 0.34);   // 0..1: fades to still in Bare
      const baseY  = innerHeight * c.layer.yFrac + deckDrop;
      const jig    = c.layer.jitter * (1 - stillK);
      const ty     = baseY + Math.sin((now * 0.001) + c.x * 0.02) * jig;

      // Drift towards no motion as we near Bare
      const FREEZE_EASE = 0.10;
      c.vx  += (-c.vx)  * stillK * FREEZE_EASE;
      c.vy  += (-c.vy)  * stillK * FREEZE_EASE;
      c.rot += (-c.rot) * stillK * FREEZE_EASE;

      // Integrate, with wind fading out in Bare
      c.y += ((ty - c.y) * 0.06) + c.vy * dt;
      c.x += (c.vx + windX * 0.02 * (1 - stillK)) * dt;

      // fade & darken
      const targetA = c.aK;
      const alphaEase = stageProgress >= BARE_LOCK ? 0.015 : 0.04;
      c.a += (targetA - c.a) * alphaEase;

      const targetD = darkFactor(stageProgress, rainProgress);
      c.dark += (targetD - c.dark) * 0.04;

      // wrap
      const span = innerWidth + 300;
      if (c.x < -300) c.x += span; else if (c.x > innerWidth) c.x -= span;

      // render (offscreen tint)
      if (c.a > 0.01){
        const wpx = Math.max(2, Math.round(c.img.width  * c.sc));
        const hpx = Math.max(2, Math.round(c.img.height * c.sc));

        off.width  = wpx;
        off.height = hpx;

        // base: draw original
        octx.globalCompositeOperation = 'source-over';
        octx.globalAlpha = 1;
        octx.filter = 'none';
        octx.clearRect(0,0,wpx,hpx);
        octx.drawImage(c.img, 0, 0, wpx, hpx);

        // multiply cool tint clipped to cloud alpha
        octx.globalCompositeOperation = 'source-atop';
        octx.globalAlpha = Math.max(0.18, c.dark);
        octx.fillStyle = 'rgb(95,103,116)'; // cool gray base tint per cloud
        octx.fillRect(0,0,wpx,hpx);

        // main draw
        ctx.save();
        ctx.translate(Math.round(c.x), Math.round(c.y));
        ctx.scale(c.flip, 1);
        ctx.rotate(c.rot);

        // subtle sprite shadow
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur  = 20;
        ctx.shadowOffsetY = 3;

        ctx.globalAlpha = c.a;
        // slight desat/contrast in Bare overall feel
        const globalDesat = lerp(1, 0.85, Math.max(0, (stageProgress-0.75)/0.25));
        ctx.filter = `saturate(${globalDesat}) contrast(1.10) brightness(0.88)`;

        ctx.drawImage(off, Math.round(-wpx/2), Math.round(-hpx/2));

        // reset
        ctx.filter = 'none';
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.restore();
      }
    });

    // curtain streaks (virga feel)
    drawCurtainStreaks();

    // heavier multiply tint in Bare
    const dk = darkFactor(stageProgress, rainProgress);
    if (dk > 0.01){
      ctx.globalAlpha = dk;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(88,106,112)'; // colder overall wash
      ctx.fillRect(0,0,innerWidth,innerHeight);
    }

    // occasional occlusion pulse
    maybeOcclusionPulse(now);
    const pulse = applyOcclusionPulse(dt);
    if (pulse>0){
      ctx.globalAlpha = pulse;
      ctx.globalCompositeOperation='multiply';
      ctx.fillStyle = '#3a4048';
      ctx.fillRect(0,0,innerWidth,innerHeight);
    }

    // reset state
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  }

  loadSprites(build);
})();

/* =========================================================
   STORM — lightning bolts + screen flash + exposure pop
========================================================= */
function ensureStormDOM(){
  if (document.getElementById('bgStorm')) return;
  const bg = document.getElementById('bg');
  if (!bg) return;
  const d = document.createElement('div'); d.id='bgStorm';
  const c = document.createElement('canvas'); c.id='stormBolts';
  const f = document.createElement('div'); f.id='stormFlash';
  d.appendChild(c); d.appendChild(f); bg.appendChild(d);
}

(function Storm(){
  let built=false, cvs, ctx, w=0, h=0, dpr=1, last=performance.now();
  const bolts=[];              // active bolts
  let severity=0;              // 0..1, how stormy (you control this)
  let armed=true;              // simple cadence gate

  function build(){
    if (built) return;
    ensureStormDOM();
    cvs=document.getElementById('stormBolts');
    if (!cvs){ return; }
    ctx=cvs.getContext('2d');
    onResize(); window.addEventListener('resize', onResize);
    built=true; loop();
  }
  function onResize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    w = cvs.width  = Math.round(innerWidth  * dpr);
    h = cvs.height = Math.round(innerHeight * dpr);
    cvs.style.width  = innerWidth + 'px';
    cvs.style.height = innerHeight + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function exposureFlash(mult=1){
    const root = document.getElementById('bg') || document.documentElement;
    root.style.transition = 'filter 90ms ease-out';
    root.style.filter = 'brightness(1.22) contrast(1.05)';
    setTimeout(()=>{
      root.style.transition = 'filter 260ms ease-out';
      root.style.filter = '';
    }, 90 * mult);
  }

  function microShake(px, ms){
    const el = document.getElementById('bg') || document.body;
    const t0 = performance.now();
    function step(){
      const t = performance.now()-t0;
      if (t>ms){ el.style.transform=''; return; }
      const dx = (Math.random()*2-1)*px;
      const dy = (Math.random()*2-1)*px;
      el.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(step);
    }
    step();
  }

  function strike(x0, y0, power=1){
    const yTarget = Math.random() < 0.55 ? innerHeight*0.65 : innerHeight*0.85;
    const maxSeg  = Math.round(lerp(10, 22, power));
    const jitterX = lerp(14, 36, power);
    const branchP = lerp(0.06, 0.22, power);
    const nodes = [{x:x0, y:y0, age:0, life: lerp(90,140,power), segs:[] }];

    // main trunk
    let x=x0, y=y0;
    for (let i=0;i<maxSeg;i++){
      const nx = x + (Math.random()*2-1)*jitterX;
      const ny = y + lerp(18, 42, power);
      nodes[0].segs.push([x,y,nx,ny]);
      // random branch
      if (Math.random()<branchP){
        const bx = nx + (Math.random()*2-1)*jitterX*0.8;
        const by = ny + lerp(10, 28, power)*0.8;
        nodes.push({x:nx,y:ny,age:0,life: lerp(70,120,power)*0.85, segs:[[nx,ny,bx,by]]});
      }
      x=nx; y=ny; if (y>yTarget) break;
    }

    bolts.push({nodes, alpha:1, power});
    // screen flash
    const flash = document.getElementById('stormFlash');
    if (flash){
      flash.style.opacity = String(lerp(0.25, 0.75, power));
      requestAnimationFrame(()=> flash.style.opacity='0');
    }
    // exposure + micro shake
    exposureFlash();
    microShake(lerp(1,3,power), 180);
  }

  function loop(now=performance.now()){
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now-last)/1000); last=now;

    // auto-strike cadence by severity
    if (severity>0 && armed){
      armed=false;
      const delay = lerp(5000, 900, severity); // ms between chances
      setTimeout(()=>{ 
        armed=true;
        if (Math.random() < lerp(0.15, 0.65, severity)){
          const x = Math.random()*innerWidth*(Math.random()<0.5?0.6:1);
          const y = innerHeight * lerp(0.12, 0.24, Math.random());
          strike(x, y, lerp(0.5, 1, Math.random()));
        }
      }, delay);
    }

    // clear
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    // draw bolts
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i=bolts.length-1;i>=0;i--){
      const b = bolts[i];
      const width = lerp(1.2, 2.6, b.power);
      const glow  = lerp(12, 30, b.power);
      ctx.lineCap='round';

      b.nodes.forEach(n=>{
        n.age += dt*1000;
        const lifeLeft = Math.max(0, n.life - n.age);
        const a = Math.max(0, Math.min(1, lifeLeft / n.life)) * 0.95 * b.power;
        ctx.shadowColor = `rgba(200,230,255,${a})`;
        ctx.shadowBlur  = glow;
        ctx.strokeStyle = `rgba(220,240,255,${a})`;
        ctx.lineWidth = width;
        n.segs.forEach(([x1,y1,x2,y2])=>{
          ctx.beginPath();
          ctx.moveTo(x1,y1);
          ctx.lineTo(x2,y2);
          ctx.stroke();
        });
      });

      b.alpha -= dt * lerp(3.5, 6.0, b.power);
      if (b.alpha<=0) bolts.splice(i,1);
    }
    ctx.restore();
  }

  // public API
  window.__storm = {
    setSeverity(p){ severity = clamp(p||0,0,1); },
    strikeAt(x, y, power){ strike(x,y,power||1); }
  };

  build();
})();

/* =========================================================
   AUTO-WIRING — ramp storm in Bare; expose simple hooks
========================================================= */
(function AutoWire(){
  // If you already update these elsewhere, this is safe/no-op.
  // Here we map storm severity to late Bare by default.
  const T = setInterval(()=>{
    if (typeof window.__clouds === 'undefined' || typeof window.__storm === 'undefined') return;
    // pull stage progress if present
    let st = 0;
    try {
      if (typeof window.__currentProgress === 'number') st = window.__currentProgress;
    } catch(e){}
    // ramp severity 0→1 from ~0.72..1.0
    const sev = Math.max(0, (st-0.72)/0.28);
    window.__storm.setSeverity(sev);
  }, 200);

  // Optional: expose helpers globally
  window.__stormControls = {
    setSeverity:(p)=>window.__storm?.setSeverity(p),
    testStrike:()=>window.__storm?.strikeAt(innerWidth*0.7, innerHeight*0.18, 1)
  };
})();
})();
