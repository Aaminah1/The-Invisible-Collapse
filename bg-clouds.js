// js/bg-clouds.js — stratified painterly clouds synced to rain + forest stages
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
let off = document.createElement('canvas');
let octx = off.getContext('2d');

// --- stillness thresholds for Bare ---
const BARE_LOCK = 0.78;  // start freezing here
const BARE_STOP = 0.92;  // spawning fully stopped here

// smooth 0→1 clamp
function smooth01(t){ return t<=0?0 : t>=1?1 : t*t*(3-2*t); }

  /* ======= tuning ======= */
  // Three “decks”: top stays full; mid grows; low grows last (never too low).
const LAYERS = [
  { key:"TOP", yFrac:0.14, jitter:12,
    density:(st,r)=> (st<1/3?0: 0.75 + 0.25*r),
    alpha:(st,r)=> 0.72 + 0.28*r },       // much higher base alpha
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
function resetCtx(){
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

  // visibility & heaviness
 function darkFactor(st, rain){
  if (st < 1/3) return 0;
  const bareT = Math.max(0, (st-2/3)/(1/3));
  // slightly toned down so per-cloud darkening stays visible
  return (0.08 + 0.22*bareT) * (0.60 + 0.40*rain);
}

  /* ======= build ======= */
  function css(){
    if (document.getElementById("bgclouds-style")) return;
    const s = document.createElement("style");
    s.id = "bgclouds-style";
    s.textContent = `
      #bg #bgClouds{ position:fixed; inset:0; pointer-events:none; z-index:7; }
      #bgClouds canvas{
  position:fixed; inset:0;
  transform: translateZ(0);      /* GPU promote */
  image-rendering: optimizeQuality;
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
  }
  function onResize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    w = cvs.width  = Math.round(innerWidth  * dpr);
    h = cvs.height = Math.round(innerHeight * dpr);
    cvs.style.width  = innerWidth + "px";
    cvs.style.height = innerHeight + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  /* ======= utils ======= */
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);
  const ease=(t)=>t*t*(3-2*t);

  function pickLayer(){
    // weight by target densities at this moment
    const weights = LAYERS.map(L=>Math.max(0.0001, L.density(stageProgress, rainProgress)));
    const sum = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*sum, idx=0;
    for (; idx<weights.length; idx++){ if ((r-=weights[idx])<=0) break; }
    return LAYERS[Math.min(idx, LAYERS.length-1)];
  }

  function spawnCloud(){
    if (!sprites.length || stageProgress<1/3) return;
    const img  = sprites[Math.floor(Math.random()*sprites.length)];
    const L    = pickLayer();

    // smaller, more variety
    const sc   = lerp(0.38, 0.88, Math.random());          // smaller scale range
    const rot  = lerp(-4, 4, Math.random()) * Math.PI/180; // subtle tilt
    const flip = Math.random()<0.5? -1: 1;

    // start well above the band so it “grows” downward
    const bandY= innerHeight * L.yFrac;
    const y0   = (bandY - 120) - Math.random()*160;
    const x0   = Math.random()*innerWidth;

    const vx   = lerp(-16, 16, Math.random());             // lateral drift
    const vy   = lerp(4, 10, Math.random());               // gentle descent
    const a    = 0;                                        // fade in
const aK = Math.max(0.75, clamp(L.alpha(stageProgress, rainProgress), 0.25, 1));

    clouds.push({ img, x:x0, y:y0, vx, vy, sc, a, dark:0, rot, flip, aK, layer:L });
    if (clouds.length > MAX_CLOUDS) clouds.shift();
  }

  /* ======= public API ======= */
  window.__clouds = {
    setRainProgress(p){ rainProgress = clamp(p||0,0,1); },
    setStageProgress(p){ stageProgress = clamp(p||0,0,1); },
    setWind(pxPerSec){ windTarget = pxPerSec||0; }
  };

  // optional auto-probe if you already keep this updated elsewhere
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
  let last = performance.now(), spawnAcc = 0;
  let seeded = false;
  function loop(now = performance.now()){
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now-last)/1000); last = now;

    // wind easing
    windX += (windTarget - windX) * WIND_EASE;

    // spawn: distribute across layers by current density
  const totalDensity = LAYERS.reduce((s,L)=>s + L.density(stageProgress, rainProgress), 0);
  // === one-time seeding for fast scrolls ===
if (!seeded && stageProgress >= 0.7) {
  const targetCount = Math.round(lerp(18, 26, rainProgress));
  for (let i = 0; i < targetCount; i++) spawnCloud();
  seeded = true;
  // lock the early clouds into calmer drift
  clouds.forEach(c => {
    c.vx *= 0.3;
    c.vy *= 0.3;
  });
}

// As we approach Bare, ramp spawning down to 0.
const barePhase = smooth01((stageProgress - BARE_LOCK) / (BARE_STOP - BARE_LOCK)); // 0..1
let spawnRate = BASE_SPAWN * totalDensity * (1 - barePhase);

// Keep a stable occupancy in Bare: if we already have enough, stop spawning completely.
const desiredCount = Math.round(lerp(18, 26, rainProgress)); // tune: how full Bare should look
if (stageProgress >= BARE_LOCK && clouds.length >= desiredCount) spawnRate = 0;

spawnAcc += spawnRate * dt;
while (spawnAcc >= 1){ spawnAcc -= 1; spawnCloud(); }


    // draw
// avoid tile seams: clear in device pixels with a neutral transform
resetCtx();
ctx.setTransform(1,0,0,1,0,0);
ctx.clearRect(0,0,cvs.width, cvs.height);
ctx.setTransform(dpr,0,0,dpr,0,0);

    clouds.forEach(c=>{
  // --- target band & stillness (single, safe version) ---
const stillK = smooth01((stageProgress - 0.66) / 0.34);   // 0..1: fades to still in Bare
const baseY  = innerHeight * c.layer.yFrac;
const jig    = c.layer.jitter * (1 - stillK);             // kill bobbing progressively
let ty       = baseY + Math.sin((now * 0.001) + c.x * 0.02) * jig;

// Drift towards no motion as we near Bare
const FREEZE_EASE = 0.10;
c.vx  += (-c.vx)  * stillK * FREEZE_EASE;
c.vy  += (-c.vy)  * stillK * FREEZE_EASE;
c.rot += (-c.rot) * stillK * FREEZE_EASE;

// Integrate, with wind fading out in Bare
c.y += ((ty - c.y) * 0.06) + c.vy * dt;
c.x += (c.vx + windX * 0.02 * (1 - stillK)) * dt;


      // fade & darken
      const targetA   = c.aK;  // layer-specific visible alpha (already high)
   const alphaEase = stageProgress >= BARE_LOCK ? 0.015 : 0.04; // gentler in Bare
c.a += (targetA - c.a) * alphaEase;

      const targetD   = darkFactor(stageProgress, rainProgress);
      c.dark += (targetD - c.dark) * 0.04;

      // wrap
      const span = innerWidth + 300;
      if (c.x < -300) c.x += span; else if (c.x > innerWidth) c.x -= span;

  // render (offscreen tint to avoid block artifacts)
if (c.a > 0.01){
  // compute on-canvas size
  const wpx = Math.max(2, Math.round(c.img.width  * c.sc));
  const hpx = Math.max(2, Math.round(c.img.height * c.sc));

  // 1) Build a tinted sprite in OFFSCREEN using the image as a mask
  off.width  = wpx;
  off.height = hpx;

  // (A) base: draw the original cloud (no filter/shadow here)
  octx.globalCompositeOperation = 'source-over';
  octx.globalAlpha = 1;
  octx.filter = 'none';
  octx.clearRect(0,0,wpx,hpx);
  octx.drawImage(c.img, 0, 0, wpx, hpx);

  // (B) overlay: multiply tint clipped to the cloud's alpha ONLY
  octx.globalCompositeOperation = 'source-atop';
  octx.globalAlpha = Math.max(0.18, c.dark);       // heaviness
  octx.fillStyle = 'rgb(95,103,116)';              // cool gray
  octx.fillRect(0,0,wpx,hpx);

  // 2) Draw to MAIN canvas with transforms (shadow/filters ok here)
  ctx.save();
  ctx.translate(Math.round(c.x), Math.round(c.y));
  ctx.scale(c.flip, 1);
  ctx.rotate(c.rot);

  // Optional readability: subtle shadow on the whole composited sprite
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur  = 20;
  ctx.shadowOffsetY = 3;

  ctx.globalAlpha = c.a;                  // overall cloud opacity
  ctx.filter = 'brightness(0.88) contrast(1.10)';

  ctx.drawImage(off, Math.round(-wpx/2), Math.round(-hpx/2));

  // reset drawing state (important)
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();


}

    });

    // heavier tint in Bare (multiply)
const dk = darkFactor(stageProgress, rainProgress);
if (dk > 0.01){
  ctx.globalAlpha = dk;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(112,120,132)';
  ctx.fillRect(0,0,innerWidth,innerHeight);
}
// Reset state after
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 1;
ctx.filter = 'none';
ctx.shadowColor = 'transparent';
ctx.shadowBlur = 0;
ctx.shadowOffsetX = ctx.shadowOffsetY = 0;

    ctx.globalAlpha = 1;
  }

  loadSprites(build);
})();
