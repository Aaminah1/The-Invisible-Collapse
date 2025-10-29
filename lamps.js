// lamps.js
gsap.registerPlugin(ScrollTrigger);

/* ---------- ASSETS ---------- */
const LAMP_SRC = [
  "images/lampost1.png",
  "images/lampost3.png",
  "images/lampost5.png"
];

const GROUND_SRC = [
  "images/ground_stage5.png",
  "images/ground_stage6.png",
  "images/ground_stage9.png"
];

const NEAR_SRC = [
  "images/city1.png",
  "images/city3.png",
  "images/city5.png"
];

const FAR_SRC = [
  "images/cityfar_1.png",
  "images/cityfar_3.png",
  "images/cityfar_5.png"
];

const NEAR_REF = "images/constructioncity_near.png";

/* ---- Crossfade timing used by both crossfade & scene mapping ---- */
const XFADE_HOLD_START = 0.12;
const XFADE_HOLD_END   = 0.20;
const XFADE_SEGS       = LAMP_SRC.length - 1; // 2 segments for 3 images
const XFADE_SEG_DUR    = (1 - XFADE_HOLD_START - XFADE_HOLD_END) / XFADE_SEGS; // 0.34
// Cut points where we switch the *spawn* pack (a bit into each crossfade so visuals lead)
const CUT1 = XFADE_HOLD_START + XFADE_SEG_DUR * 0.58;                 // ~0.317
const CUT2 = XFADE_HOLD_START + XFADE_SEG_DUR + XFADE_SEG_DUR * 0.58; // ~0.657
function sceneFromProgress(p){
  return (p < CUT1) ? 0 : (p < CUT2) ? 1 : 2;
}

/* ---- LITTER PACKS (per scene) ----
   0 = early (lampost1), 1 = mid (lampost3), 2 = late (lampost5)
*/
const LITTER_PACKS = {
  0: [ // early: paper / receipts / generic trash
    "images/litter/paper.png",
    "images/litter/receipt.png",
    "images/litter/trash.png",
    "images/litter/rock.png"
  ],
  1: [ // mid: takeaway era
    "images/litter/coffee.png",
    "images/litter/moderncoffee.png",
    "images/litter/chippacket.png",
    "images/litter/tupperware.png",
     "images/litter/waterbottle.png",
    "images/litter/plasticpacke.png",
    "images/litter/colorcan.png",
    "images/litter/wine.png",
    "images/litter/mask.png",
     "images/litter/waterbottle.png",
    "images/litter/plasticpacke.png",
    "images/litter/colorcan.png",
    "images/litter/wine.png",
    "images/litter/mask.png"
  ],
  2: [ // late: plastics/cans/masks/etc.
    "images/litter/waterbottle.png",
    "images/litter/plasticpacke.png",
    "images/litter/colorcan.png",
    "images/litter/wine.png",
    "images/litter/mask.png"
  ]
};
const LITTER_PACK_DEFAULT = ["images/litter/trash.png", "images/litter/rock.png"];
const LITTER_ALL = [...new Set([...LITTER_PACK_DEFAULT, ...Object.values(LITTER_PACKS).flat()])];

/* ========= LAMPS: litter sprites (leaf-style canvas), NO FADING ========= */
(() => {
  // physics/feel
  const GRAVITY = 0.018;
  const WIND_K  = 0.06;
  const FRICTION = 0.94;        // ground slide damping per frame
  const ROT_FRICTION = 0.96;    // slow spin while sliding
  const STOP_EPS = 0.03;        // stop threshold for vx
  const MAX_PARTS = 520;        // allow larger pile
  const SIZE_RANGE = [28, 48];

  // asymmetric spawn tuning
  const LAMP_WANDER_PX   = 160; // wander width around a lamp
  const FREEFALL_CHANCE  = 0.28; // % that ignore lamps entirely (breaks columns)
  const TOP_SPAWN_PAD    = 100; // above lamp top
  const SKY_SPAWN_PAD    = 140; // above whole canvas
  const BASE_WIND_SCENE0 = -0.01;
  const BASE_WIND_SCENE1 =  0.03;
  const GROUND_OFFSET    = -6;  // tuck into ground a touch

  let canvas = null, ctx = null;
  let LAMP_RECTS = [];
  let groundY = null;           // canvas-space Y where ground begins
  const parts = [];

  // per-scene preloaded sprites
  const SPRITE_BANK = { 0: [], 1: [], 2: [], default: [] };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  // Preload litter into the per-scene bank
  function preloadSprites() {
    const all = [...LITTER_ALL];
    return Promise.all(
      all.map(src => new Promise(res => {
        const im = new Image();
        im.onload = im.onerror = () => res([src, im]);
        im.src = src;
      }))
    ).then(pairs => {
      const map = new Map(pairs); // src → image
      [0,1,2].forEach(k => {
        SPRITE_BANK[k] = (LITTER_PACKS[k] || []).map(s => map.get(s)).filter(Boolean);
      });
      SPRITE_BANK.default = LITTER_PACK_DEFAULT.map(s => map.get(s)).filter(Boolean);
    });
  }

  function sizeCanvas() {
    if (!canvas) return;
    canvas.width  = canvas.clientWidth;   // 1:1 pixels
    canvas.height = canvas.clientHeight;
    cacheLampRects();
    cacheGroundLine();
  }

  function cacheLampRects() {
    LAMP_RECTS = [];
    if (!canvas) return;
    const cb = canvas.getBoundingClientRect();
    document.querySelectorAll('#lampsRow .lampWrap').forEach(w => {
      const r = w.getBoundingClientRect();
      LAMP_RECTS.push({
        x1: r.left - cb.left, x2: r.right - cb.left,
        y1: r.top  - cb.top,  y2: r.bottom - cb.top
      });
    });
  }

  function cacheGroundLine() {
    groundY = null;
    if (!canvas) return;

    // Prefer the stacked ground; fall back to the base image if needed
    const g = document.getElementById('lampsGroundStack') || document.getElementById('lampsGroundBase');
    if (!g) return;

    const cb = canvas.getBoundingClientRect();
    const gb = g.getBoundingClientRect();

    // Use the *bottom* edge so items land on visible ground
    groundY = (gb.bottom - cb.top) + GROUND_OFFSET;
  }

  function pickSpriteForScene(sceneIdx){
    const bank = (SPRITE_BANK[sceneIdx] && SPRITE_BANK[sceneIdx].length)
      ? SPRITE_BANK[sceneIdx]
      : SPRITE_BANK.default;
    return bank[(Math.random() * bank.length) | 0] || null;
  }

  function addPart(x, y, vx, vy, img) {
    // Try not to delete settled pieces
    if (parts.length >= MAX_PARTS) {
      const idx = parts.findIndex(p => !p.settled);
      if (idx >= 0) parts.splice(idx, 1);
      else parts.shift();
    }

    const target = rand(SIZE_RANGE[0], SIZE_RANGE[1]);
    let w = 18, h = 14;
    if (img) {
      const iw = img.naturalWidth  || 32;
      const ih = img.naturalHeight || 32;
      const ar = iw / ih;
      if (ar >= 1) { w = Math.round(target); h = Math.round(target / ar); }
      else         { h = Math.round(target); w = Math.round(target * ar);  }
    }

    parts.push({
      x, y, vx, vy,
      rot: rand(-Math.PI, Math.PI),
      spin: rand(-0.015, 0.015),
      img, w, h,
      flip: Math.random() < 0.35 ? -1 : 1,
      settled: false
    });
  }

  // public API: spawn near current lamps (asymmetric + some sky freefalls)
  window.spawnLampLitter = function(sceneIdx = 0, count = 6) {
    if (!(canvas && canvas.width && LAMP_RECTS.length)) return;

    const W = canvas.width;

    for (let i = 0; i < count; i++) {
      const img = pickSpriteForScene(sceneIdx);

      // sometimes ignore lamps completely → breaks the columns
      if (Math.random() < FREEFALL_CHANCE) {
        const x = rand(-40, W + 40);                     // anywhere across scene
        const y = rand(-SKY_SPAWN_PAD, 0);               // from the sky
        const vx = rand(-0.5, 0.5) + (sceneIdx ? BASE_WIND_SCENE1 : BASE_WIND_SCENE0);
        const vy = rand(0.6, 1.2);
        addPart(x, y, vx, vy, img);
        continue;
      }

      // otherwise: bias around a random lamp, but allow big wander
      const rect = pick(LAMP_RECTS);

      // expand horizontally well beyond the lamp
      let x = rand(rect.x1 - LAMP_WANDER_PX, rect.x2 + LAMP_WANDER_PX);

      // start *above* the lamp so some pieces drift across before reaching it
      let y = rect.y1 - rand(20, TOP_SPAWN_PAD);

      // clamp to canvas so nothing starts too far off-screen
      x = Math.max(-60, Math.min(W + 60, x));

      // broader horizontal speeds to avoid vertical strings
      const vx = rand(-0.6, 0.6) + (sceneIdx ? BASE_WIND_SCENE1 : BASE_WIND_SCENE0);
      const vy = rand(0.5, 1.15);

      addPart(x, y, vx, vy, img);
    }
  };

  // cheap value-noise for wind jitter
  let __turbTick = 1.0;
  function turb(x, y) {
    // blend two sines → smooth pseudo-noise in [-1,1]
    return Math.sin((x + __turbTick) * 0.007) * 0.7 +
           Math.sin((y - __turbTick * 0.6) * 0.013) * 0.3;
  }
/* ---------- USER INTERACTION (drag / flick) ---------- */
/* ---------- USER INTERACTION (drag / flick) ---------- */
let dragging = false;
let lastX = 0, lastY = 0;

function handleDown(e) {
  dragging = true;
  canvas.classList.add("dragging");
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
  e.preventDefault();
}

function handleMove(e) {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dx = x - lastX;
  const dy = y - lastY;
  lastX = x;
  lastY = y;

  const influenceRadius = 140;
  const impulseStrength = 0.45;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const distX = p.x - x;
    const distY = p.y - y;
    const d2 = distX*distX + distY*distY;
    if (d2 < influenceRadius * influenceRadius) {
      const falloff = 1 - Math.sqrt(d2) / influenceRadius;

      // Allow moving even settled pieces
      p.settled = false;

      p.vx += dx * impulseStrength * falloff * 0.03;
      p.vy += dy * impulseStrength * falloff * 0.03;
      p.spin += (Math.random() - 0.5) * 0.04;
    }
  }
}

function handleUp() {
  dragging = false;
  canvas.classList.remove("dragging");
}

function enableLitterDrag() {
  if (!canvas) return;
  canvas.addEventListener("mousedown", handleDown);
  window.addEventListener("mousemove", handleMove);
  window.addEventListener("mouseup", handleUp);
}


  function loop() {
    if (!(ctx && canvas)) return requestAnimationFrame(loop);
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // advance turbulence tick for variety
    __turbTick += 1.0;

    const wind = (window.__litterTick?.wind || 0) * 0.003;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];

      if (!p.settled) {
        // airborne physics
        p.vx  += wind * WIND_K;
        p.vy  += GRAVITY;
         p.vx *= 0.995;  // slight air drag

        // subtle turbulence so paths aren't straight
        const jitterX = turb(p.x, p.y) * 0.02;   // tweak 0.03–0.08
        const jitterY = turb(p.y, p.x) * 0.015;   // small vertical wobble
        p.vx += jitterX;
        p.vy += jitterY * 0.2;

        p.x   += p.vx;
        p.y   += p.vy;
        p.rot += p.spin;

        // hit ground?
        if (groundY != null) {
          const bottom = p.y + (p.h * 0.5);
          if (bottom >= groundY) {
            p.y = groundY - (p.h * 0.5); // snap to ground
            p.vy = 0;
            p.vx *= 0.4;                 // impact damping
            p.spin *= 0.4;
            p.settled = true;
          }
        }
      } else {
        // ground slide + friction until stopped
        p.x   += p.vx;
        p.rot += p.spin;
        p.vx  *= FRICTION;
        p.spin *= ROT_FRICTION;

        if (Math.abs(p.vx) < STOP_EPS) p.vx = 0;
        if (Math.abs(p.spin) < 0.002)  p.spin = 0;
      }

      // purge only if way offscreen
      if (p.y > H + 60 || p.x < -80 || p.x > W + 80) { parts.splice(i, 1); continue; }

      // draw (leaf-style)
      ctx.globalAlpha = 1; // ALWAYS fully opaque
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(p.rot);
      ctx.scale(p.flip, 1);

      if (p.img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(p.img, -p.w/2, -p.h/2, p.w, p.h);
      } else {
        // minimal fallback
        ctx.fillStyle = "rgba(230,230,230,1)";
        const r = 2, x0 = -p.w/2, y0 = -p.h/2, w = p.w, h = p.h;
        ctx.beginPath();
        ctx.moveTo(x0+r, y0);
        ctx.arcTo(x0+w, y0,   x0+w, y0+h, r);
        ctx.arcTo(x0+w, y0+h, x0,   y0+h, r);
        ctx.arcTo(x0,   y0+h, x0,   y0,   r);
        ctx.arcTo(x0,   y0,   x0+w, y0,   r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    requestAnimationFrame(loop);
  }

  function init() {
    canvas = document.getElementById("litterCanvas");
    if (!canvas) return;
ctx = canvas.getContext("2d", { alpha: true });
canvas.style.touchAction = "none";
canvas.style.pointerEvents = "auto";   // ✅ make it interactive


    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    enableLitterDrag();

    requestAnimationFrame(loop);
  }

  // expose for your scroll code
  window.__refreshLampLitterRects = cacheLampRects;
  window.__refreshLampGroundLine  = cacheGroundLine;

  document.addEventListener("DOMContentLoaded", init);
  init();
  // IMPORTANT: preload the litter sprites for the scene packs
  preloadSprites();
})();

/* ---------- HELPERS ---------- */
function disableCityClicks(){
  const r = document.getElementById("cityClickRouter");
  if (r){
    r.style.display = "none";
    r.style.pointerEvents = "none";
    r.style.cursor = "default";
  }
  const hit = document.getElementById("cityHit");
  if (hit) hit.style.pointerEvents = "none";
  const sparks = document.getElementById("citySparks");
  if (sparks) sparks.style.display = "none";
  const bgCity = document.getElementById("bgCity");
  if (bgCity) bgCity.style.cursor = "default";
}
function cityIsVisible(){
  const b = document.querySelector("#bgCity .back");
  const m = document.querySelector("#bgCity .mid");
  const n = document.querySelector("#bgCity .near");
  if (!b || !m || !n) return false;
  const ob = parseFloat(getComputedStyle(b).opacity || "0");
  const om = parseFloat(getComputedStyle(m).opacity || "0");
  const on = parseFloat(getComputedStyle(n).opacity || "0");
  return (ob + om + on) > 0.05;
}
function enableCityClicks(){
  const show = cityIsVisible();
  const r = document.getElementById("cityClickRouter");
  if (r){
    r.style.display = show ? "block" : "none";
    r.style.pointerEvents = show ? "auto" : "none";
    r.style.cursor = show ? "crosshair" : "default";
  }
  const hit = document.getElementById("cityHit");
  if (hit) hit.style.pointerEvents = show ? "auto" : "none";
  const sparks = document.getElementById("citySparks");
  if (sparks) sparks.style.display = show ? "block" : "none";
  const bgCity = document.getElementById("bgCity");
  if (bgCity) bgCity.style.cursor = show ? "crosshair" : "default";
}

function preload(srcs){
  return Promise.all(
    srcs.map(s => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = s; }))
  );
}

function sizeMult(){
  const v = getComputedStyle(document.documentElement)
              .getPropertyValue('--citySizeMult').trim();
  const n = parseFloat(v || '1');
  return Number.isFinite(n) ? n : 1;
}
function computeLampHeightPx(){
  const vh = window.innerHeight;
  const base = vh * 0.70 * sizeMult();
  const h = Math.max(520, Math.min(base, 1100));
  return Math.round(h) + "px";
}
function setNearAspectFromRef(){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ar = (img.naturalWidth && img.naturalHeight)
        ? img.naturalWidth / img.naturalHeight
        : 2.40;
      document.documentElement.style.setProperty("--nearAR", ar);
      resolve();
    };
    img.onerror = resolve;
    img.src = NEAR_REF;
  });
}
function buildStack(containerId, classBase, srcs){
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  srcs.forEach((src, i) => {
    const im = document.createElement("img");
    im.className = classBase + " stage" + i;
    im.src = src;
    im.alt = classBase + " stage " + i;
    im.style.opacity = (i === 0 ? "1" : "0");
    el.appendChild(im);
  });
}
function attachLampToggle(containerSel, config){
  const wraps = document.querySelectorAll(containerSel + " .lampWrap");
  wraps.forEach((wrap, i) => {
    if (!wrap.querySelector(".lamp-glow")) {
      const glow = document.createElement("div"); glow.className = "lamp-glow";
      const beam = document.createElement("div"); beam.className = "lamp-beam";
      const hit  = document.createElement("div"); hit.className  = "lamp-hit";
      wrap.appendChild(glow); wrap.appendChild(beam); wrap.appendChild(hit);
      wrap.classList.remove("on");
      hit.addEventListener("mouseenter", ()=> wrap.classList.add("hover"));
      hit.addEventListener("mouseleave", ()=> wrap.classList.remove("hover"));
      hit.addEventListener("click", () => {
        const turningOn = !wrap.classList.contains("on");
        wrap.classList.toggle("on", turningOn);
        if (turningOn){
          wrap.classList.add("flicker");
          setTimeout(()=> wrap.classList.remove("flicker"), 950);
        } else {
          wrap.classList.remove("flicker");
        }
        window.dispatchEvent(new CustomEvent("lamp:toggle", {
          detail: { index: i, on: turningOn }
        }));
      });
    }
    const css = wrap.style;
    css.setProperty("--bx",    config.bx);
    css.setProperty("--by",    config.by);
    css.setProperty("--bw",    config.bw);
    css.setProperty("--bh",    config.bh);
    css.setProperty("--beamW", config.beamW);
    css.setProperty("--beamH", config.beamH);
    css.setProperty("--beamY", config.beamY);
  });
}
const LANTERN_CFG = {
  bx:"50%", by:"6%",  bw:"80px", bh:"92px",
  beamW:"240px", beamH:"300px", beamY:"90px",
  hue:"40deg"
};
const STREETLIGHT_CFG = {
  bx:"66%", by:"-6%", bw:"62px", bh:"62px",
  beamW:"300px", beamH:"260px", beamY:"68px",
  hue:"58deg"
};

/* ---------- BUILD LAYERS ---------- */
function buildGroundStack(){ buildStack("lampsGroundStack", "ground", GROUND_SRC); }
function buildNearParallax(){ buildStack("parallaxNearStack", "near", NEAR_SRC); }
function buildFarParallax(){  buildStack("parallaxFarStack",  "far",  FAR_SRC ); }

function buildLampRow(n = 5){
  const row = document.getElementById("lampsRow");
  row.innerHTML = "";
  row.style.setProperty("--lampH", computeLampHeightPx());
  for (let i = 0; i < n; i++){
    const wrap = document.createElement("div");
    wrap.className = "lampWrap";
    wrap.style.left = (((i + 1) / (n + 1)) * 100) + "%";
    LAMP_SRC.forEach((src, si) => {
      const img = document.createElement("img");
      img.className = "lamp stage" + si;
      img.src = src; img.alt = "lamp stage " + si;
      img.style.opacity = (si === 0 ? "1" : "0");
      wrap.appendChild(img);
    });
    row.appendChild(wrap);
  }
}

/* ---------- CROSSFADES ---------- */
function buildCrossfade(){
  const HOLD_START = XFADE_HOLD_START, HOLD_END = XFADE_HOLD_END;
  const segs = LAMP_SRC.length - 1;
  const segDur = (1 - HOLD_START - HOLD_END) / segs;
  const tl = gsap.timeline({ paused: true });

  // retarget click geometry once we pass into stage 1 visuals
  tl.add(() => attachLampToggle("#lampsScene", STREETLIGHT_CFG),
         HOLD_START + 1 * segDur + 0.001);

  function fadeLamps(t, a, b){
    document.querySelectorAll("#lampsRow .lampWrap").forEach(w => {
      const A = w.querySelector(".stage" + a), B = w.querySelector(".stage" + b);
      if(!(A && B)) return;
      tl.set(A, {opacity:1}, t).set(B, {opacity:0}, t)
        .to(A, {opacity:0, duration:segDur, ease:"none"}, t)
        .to(B, {opacity:1, duration:segDur, ease:"none"}, t);
    });
  }
  function fadeContainer(t, containerSel, classBase, a, b){
    const ctn = document.querySelector(containerSel);
    if(!ctn) return;
    const A = ctn.querySelector("." + classBase + ".stage" + a);
    const B = ctn.querySelector("." + classBase + ".stage" + b);
    if(!(A && B)) return;
    tl.set(A, {opacity:1}, t).set(B, {opacity:0}, t)
      .to(A, {opacity:0, duration:segDur, ease:"none"}, t)
      .to(B, {opacity:1, duration:segDur, ease:"none"}, t);
  }
  for (let i = 0; i < segs; i++){
    const t = HOLD_START + i * segDur;
    fadeLamps(t, i, i + 1);
    fadeContainer(t, "#lampsGroundStack",  "ground", i, i + 1);
    fadeContainer(t, "#parallaxNearStack", "near",   i, i + 1);
    fadeContainer(t, "#parallaxFarStack",  "far",    i, i + 1);
  }
  return tl;
}

/* ---------- INIT ---------- */
const ALL = [
  ...LAMP_SRC, ...GROUND_SRC, ...NEAR_SRC, ...FAR_SRC, NEAR_REF,
  ...LITTER_ALL // ✅ use the new litter list, not the old LITTER_SPRITES
];

preload(ALL).then(async () => {
  await setNearAspectFromRef();
  // also ensure litter sprite images are instantiated into per-scene pools
  // (we loaded URLs above so they're cached; now build the banks)
  // NOTE: this calls the internal preloadSprites() inside the IIFE — it ran on DOMContentLoaded,
  // but awaiting here guarantees the banks are ready before first spawn.
  if (window.requestAnimationFrame) { /* no-op, just keeping structure readable */ }

  buildGroundStack();
  buildFarParallax();
  buildNearParallax();
  buildLampRow(5);
  attachLampToggle("#lampsScene", LANTERN_CFG);

  // Nudge the litter module to know lamp positions/ground line
  window.__refreshLampGroundLine?.();
  window.__refreshLampLitterRects?.();
  
  window.dispatchEvent(new Event("resize"));

 

  const xfade = buildCrossfade();

  const st = ScrollTrigger.create({
    trigger: "#lampsScene",
    start: "top top",
    end: "+=9400",
    scrub: true,
    pin: true,
    anticipatePin: 1,

   onEnter(){ disableCityClicks(); },
onEnterBack(){ disableCityClicks(); },
    onLeave(){ enableCityClicks(); },
    onLeaveBack(){ enableCityClicks(); },

    onUpdate(self){
      // crossfades
      xfade.progress(self.progress);

      // litter spawns tied to scroll distance
      window.__litterTick ??= { p:0, acc:0, wind:0 };
      const LT = window.__litterTick;
      const p  = self.progress;
      const dp = p - LT.p;

      if (p < XFADE_HOLD_START) LT.acc += 40; // baseline while in stage 0
      LT.acc  += Math.abs(dp) * 1000;         // “budget”
      LT.wind += (Math.random() - 0.5) * 60;  // drift noise
      LT.p     = p;

      const sceneIdx = sceneFromProgress(p);  // ✅ use the 0/1/2 mapper
      while (LT.acc > 85){
        window.spawnLampLitter?.(sceneIdx, 4 + (Math.random()*4|0));
        LT.acc -= 85;
      }

      gsap.set("#parallaxNearStack", { x: 0 });
      gsap.set("#parallaxFarStack",  { x: 0 });
    },
    onRefresh(self){
      
    },
    invalidateOnRefresh: true,
    onRefreshInit(){ xfade.progress(0); }
  });

  // responsive
  const refresh = () => {
    document.getElementById("lampsRow")
      .style.setProperty("--lampH", computeLampHeightPx());
    window.__refreshLampLitterRects?.();
    window.__refreshLampGroundLine?.();
    st.refresh();
  };
  window.addEventListener("resize", refresh);
  requestAnimationFrame(() => ScrollTrigger.refresh());
});

/* ---------- SEED ---------- */
function __seedInitialLitter(){
  requestAnimationFrame(()=>{
    window.__refreshLampLitterRects?.();
    window.spawnLampLitter?.(0, 28);
  });
}
