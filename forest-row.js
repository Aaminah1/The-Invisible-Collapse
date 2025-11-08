// forest-row.js
gsap.registerPlugin(ScrollTrigger);
gsap.config({ nullTargetWarn: false });
/* ---------- assets ---------- */
const SRC = {
  full: "images/Tree-Full11.png",
  mid1: "images/Tree-Mid111.png",
  mid2: "images/Tree-Mid211.png",
  bare: "images/Tree-Bare11.png"
};
// how much higher (in px) to spawn above the canopy band
const PICKUP_SPAWN_LIFT = {
  apple:  [140, 220],
  flower: [160, 260],
  twig:   [120, 200]
};
// --- mouse wake tuning (fast path) ---
const MOUSE_WAKE_R   = 70;
const MOUSE_WAKE_R2  = MOUSE_WAKE_R * MOUSE_WAKE_R;
const MAX_SETTLED = 1600;  
// how much higher (in px) to spawn "falling" dust above the canopy
const DUST_SPAWN_LIFT = [120, 220]; 
/* ---------- custom apple decay sequence (must be above spawnPickup) ---------- */
const APPLE_SEQ = [
  "images/apple1.png", // fresh (airborne)
  "images/apple2.png", // stage 2
  "images/apple3.png", // stage 3
  "images/apple4.png"  // stage 4 (rotten)
];
const APPLE_IMGS = APPLE_SEQ.map(src => { const i = new Image(); i.src = src; return i; });

/* Faster timings so users don’t have to wait long */
const APPLE_STAGE_TIMES = [0, 2, 5, 9];   // seconds after first ground contact
const APPLE_FADE_START  = 6;                // seconds after first ground contact
const APPLE_FADE_DUR    = 4;                // fade out over this long

/* ---------- flower decay sequence ---------- */
const FLOWER_SEQ = [
  "images/flower1.png", // fresh (airborne)
  "images/flower2.png", // bruised
  "images/flower3.png", // wilted
  "images/flower4.png"  // crumbling
];
const FLOWER_IMGS = FLOWER_SEQ.map(src => { const i = new Image(); i.src = src; return i; });

/* Tuned for a slower, more “organic” wilt than apples */
const FLOWER_STAGE_TIMES = [0, 3.5, 8, 14]; // seconds after first ground contact
const FLOWER_FADE_START  = 11;              // when fade begins
const FLOWER_FADE_DUR    = 5;               // how long it takes to disappear

/* crossfade length shared by both */
const PICKUP_XFADE = 1.25; // sec of photometric blend per boundary

// how much of the pinned span to reserve for the tractor at the very end
const TRACTOR_TAIL = 0.22; // 22% of the pin for the tractor
window.__TRACTOR_TAIL = 0.22;
// How much of the pinned span is for the FOREST transitions (0..1)
const FOREST_PORTION = 0.65;   // forest completes at 65% of the pin
// Give more scroll after the forest (the “tail”)
const EXTRA_TAIL_PX = 8400;     // runway just for the tractor


/* ---------- helpers ---------- */
function ensureTreesVisibleOnce() {
  if (window.__treesMadeVisibleOnce__) return;
  gsap.set("#forestReveal .tree, #forestReveal .tree-back", {
    opacity: 1,
    clipPath: "inset(0% 0 0 0)"
  });
  // Force stage 0 so the Full tree shows immediately
  if (typeof setStageProgress === "function") setStageProgress(0);
  window.__treesMadeVisibleOnce__ = true;
}

const clamp = (min, v, max) => Math.max(min, Math.min(max, v));
const clampSpin = (v, max) => Math.max(-max, Math.min(max, v)); // unified
const vh    = pct => (window.innerHeight * pct) / 100;
function getSizeMult(){
  const v = getComputedStyle(document.documentElement)
              .getPropertyValue("--forestSizeMult").trim();
  const n = parseFloat(v || "1");
  return Number.isFinite(n) ? n : 1;
}
function pulseTwigsOnStageChange(intensity = 1){
  const kSpin = 0.02 * intensity;
  const kKick = 0.6  * intensity;
  pickups.forEach(p=>{
    if (p.kind !== "twig") return;
    p.rVel += (Math.random()-0.5) * kSpin;   // tiny angular jitter
    p.vx   += (Math.random()-0.5) * kKick;   // dry lateral scuff
    p.vy   += -0.2 * intensity;              // little lift (optional)
  });
}

function spawnTwigBurstAtTree(treeIdx, count = 4){
  if (!leafCanvas || !TREE_RECTS.length) return;
  const rect = TREE_RECTS[treeIdx] || TREE_RECTS[0];
  const span = Math.max(1, rect.x2 - rect.x1);
  const cb   = leafCanvas.getBoundingClientRect();

  for (let i=0;i<count;i++){
    // choose a canopy x% band and convert to a fake clientX for spawnPickup
    const frac  = 0.18 + Math.random()*0.64;       // 18%..82% across the canopy
    const px    = rect.x1 + frac*span;
    const clientX = cb.left + px;

   spawnPickup("twig", treeIdx, clientX, { force: true });
    // give each twig a little outward impulse so they don’t overlap
    const p = pickups[ pickups.length - 1 ];
    if (p && p.kind === "twig"){
  // wider lateral spread + immediate downward bias
 p.vx   += (Math.random()-0.5) * 4.0;
  p.vy   += 2.2 + Math.random()*0.8;   // ⬇️ clear the canopy quickly
  p.rVel += (Math.random()-0.5) * 0.10;
}

  }
}
function addGroundPatch(x, y, opt = {}){
  addDust({
    shape: "patch",
    x, y,
    w: opt.w ?? rand(38, 82),
    h: opt.h ?? rand(18, 36),
    a: opt.a ?? rand(0.08, 0.16),
    rot: opt.rot ?? rand(0, Math.PI*2),
    fade: opt.fade ?? 0.0006,            // very slow fade
    color: opt.color ?? [95, 80, 65],    // earthy
  });
}

/* ---------- art-directed layout ---------- */
const LIMITS = {
  front: { minPx: 360, maxPx: 920 },
  back:  { minPx: 240, maxPx: 620 }
};

const FRONT_LAYOUT = [
  { left: 7,  vh: 38, y: "0vh", dx:+8,  sx:0.99,  z:3 },
  { left: 26, vh: 58, y: "0vh", dx:-8,  sx:1.02,  z:7 },
  { left: 46, vh: 47, y: "0vh", dx:+6,  sx:0.985, z:5 },
  { left: 67, vh: 56, y: "0vh", dx:-12, sx:1.01,  z:8 },
  { left: 88, vh: 44, y: "0vh", dx:+8,  sx:0.99,  z:6 }
];

const BACK_LAYOUT = [
  { left: 17, vh: 30, y: "6vh", dx:+6,  z:1 },
  { left: 38, vh: 28, y: "7vh", dx:-8,  z:1 },
  { left: 61, vh: 29, y: "7vh", dx:+4,  z:2 },
  { left: 95, vh: 27, y: "6vh", dx:-6,  z:1 }
];

/* ---------- build helpers ---------- */
function buildFixedRow(container, layout, className, limits){
  container.innerHTML = "";
  const mult = getSizeMult();

  layout.forEach((cfg, i) => {
    const wrap = document.createElement("div");
    wrap.className = "tree-wrap";

     wrap.dataset.idx = i;           // which tree in this row
    wrap.dataset.row = className;   // "tree" or "tree-back"

    wrap.style.left = `${cfg.left}%`;
    wrap.style.setProperty("--dx", (cfg.dx ?? 0) + "px");
    wrap.style.setProperty("--y",  typeof (cfg.y ?? 0) === "string" ? cfg.y : `${cfg.y ?? 0}px`);
    wrap.style.zIndex = (cfg.z ?? 1).toString();

    const hPx = clamp(limits.minPx, vh(cfg.vh) * mult, limits.maxPx);

    // contact shadow (under the tree)
    const shadow = document.createElement("div");
    shadow.className = "shadow-oval";
    Object.assign(shadow.style, {
      position: "absolute",
      left: "50%",
      bottom: "-6px",
      width: Math.round(hPx*0.7) + "px",
      height: Math.round(hPx*0.16) + "px",
      transform: "translateX(-50%) scale(1,1)",
      background: "radial-gradient(50% 60% at 50% 50%, rgba(0,0,0,0.28), rgba(0,0,0,0) 70%)",
      filter: "blur(6px)",
      opacity: "0.25",
      pointerEvents: "none",
      zIndex: "0"
    });
    wrap.appendChild(shadow);

    // base (full)
    const base = new Image();
    base.src = SRC.full;
    base.className = className; // "tree" or "tree-back"
    base.style.height = `${Math.round(hPx)}px`;
    base.style.setProperty("--sx", (cfg.sx ?? (i % 2 ? 0.985 : 1.01)));
    base.style.setProperty("--ty", (i % 3 ? "0.6vh" : "1.0vh"));
    base.style.setProperty("--d",  `${0.65 + (i * 0.18)}s`);

    wrap.style.setProperty("--hpx", `${Math.round(hPx)}px`);
    wrap.appendChild(base);
    container.appendChild(wrap);

    // overlays present but transparent (for crossfade)
    ["mid1","mid2","bare"].forEach(stage => {
      const o = new Image();
      o.src = SRC[stage];
      o.className = "tree-stage";
      o.dataset.stage = stage;
      o.style.display = "block";
      o.style.opacity = "0";
      o.style.pointerEvents = "none";
      o.style.zIndex = "1";
      wrap.appendChild(o);
    });
  });
}

function rebuildRows(){
  const backEl  = document.getElementById("treeRowBack");
  const frontEl = document.getElementById("treeRow");
  if (!backEl || !frontEl) return;

  backEl.style.position = "relative";
  buildFixedRow(backEl, BACK_LAYOUT, "tree-back", LIMITS.back);

  frontEl.style.position = "relative";
  buildFixedRow(frontEl, FRONT_LAYOUT, "tree", LIMITS.front);

  gsap.set("#treeRowBack", { y: 0 });

  cacheTreeRects();          // leaves/pickups spawn bands
  attachTreeClicks();        // ⬅️ make clicks live again
  ScrollTrigger.refresh();   
}window.addEventListener("DOMContentLoaded", () => {
    initLeafCanvas(); 
  sizeLeafCanvas();
  cacheTreeRects();
  rebuildRows();                  // calls attachTreeClicks()
    setupReveal();                         
  requestAnimationFrame(leafLoop);
});

function initLeafCanvas() {
  leafCanvas = document.getElementById("leafCanvas"); // <- your canvas id
  if (!leafCanvas) return;
  lctx = leafCanvas.getContext("2d", { alpha: true });

  // these used to be gated by `if (leafCanvas)` — bind them now that we have it
  leafCanvas.style.touchAction = "none";
  leafCanvas.style.pointerEvents = "none";

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", resetMouse,   { passive: true });
  window.addEventListener("blur",         resetMouse,   { passive: true });
  window.addEventListener("pointerdown",  onPointerDown, { passive: true });
  window.addEventListener("pointerup",    release,       { passive: true });
  window.addEventListener("pointercancel",release,       { passive: true });

  sizeLeafCanvas();
  cacheTreeRects();
}

// wire up the handlers you already wrote (lifted out of the old `if (leafCanvas)` blocks)
function onPointerMove(e){
  const r = leafCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const t = e.timeStamp || performance.now();
  if (mouse.lastT){
    const dt = Math.max(1, t - mouse.lastT);
    mouse.vx = (x - mouse.lastX) / dt * 16.67;
    mouse.vy = (y - mouse.lastY) / dt * 16.67;
  }
  mouse.x = x; mouse.y = y;
  mouse.lastX = x; mouse.lastY = y; mouse.lastT = t;
  window.__mouseLastMove = performance.now();
}
function resetMouse(){
  mouse.x = mouse.y = -1; mouse.vx = mouse.vy = 0; mouse.down = false;
  if (dragPick.active && pickups[dragPick.idx]) pickups[dragPick.idx].dragging = false;
  dragPick.active = false; dragPick.idx = -1;
}
function onPointerDown(e){
  const r = leafCanvas.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
  if (e.target && e.target.closest && e.target.closest(".tree-wrap")) return;
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = -1, bestD = 1e9;
  pickups.forEach((p,i)=>{
    const rad = Math.max(p.w, p.h)*0.5 + 18;
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d < rad && d < bestD){ best = i; bestD = d; }
  });
  if (best >= 0){
    const p = pickups[best];
    dragPick.active = true; dragPick.idx = best;
    p.dragging = true;
    p.grabDX = p.x - mx;
    p.grabDY = p.y - my;
    mouse.down = true;
  }
}
function release(){
  mouse.down = false;
  if (dragPick.active){
    const p = pickups[dragPick.idx];
    if (p){
      const mul = 0.35 * (p.ph?.throwMul ?? 1);
      p.vx += mouse.vx * mul;
      p.vy += mouse.vy * mul;
      p.dragging = false;
    }
  }
  dragPick.active = false; dragPick.idx = -1;
}

function leavesAllowedForProgress(p){
  if (p < 2/3) return true;              // Full/Mid1/Mid2 → yes
  const tBare = (p - 2/3) / (1/3);       // 0..1 within Bare
  return tBare < 0.45;                   // allow first ~45% of Bare
  // tweak 0.45 → 0.35 (less) or 0.60 (more) to taste
}


/* ---------- GSAP breathing ---------- */
/* ---------- GSAP breathing (clearer but still subtle) ---------- */
let breatheTL = null;
function startBreathing(){
  if (breatheTL) return;

  const T = 2.1; // faster cycle (was ~3s)

  breatheTL = gsap.timeline({ repeat: -1, yoyo: true });

  // Make ALL stages breathe: trunk, back row, and overlays
  breatheTL.to("#forestReveal .tree, #forestReveal .tree-back, #forestReveal .tree-stage", {
    // slightly larger but still gentle
    y: "+=8",             // was +=2
    rotation: "+=0.35",   // was +=0.25
    skewX: "+=0.18",      // tiny bend so it reads more than pure up/down
    duration: T,
    ease: "sine.inOut",
    // micro desync so the row doesn’t move as one block
    stagger: { each: 0.10, from: "random" }
  });

  // Optional tiny luminance pulse only on leaves/stage overlays (adds “breath” feel)
  breatheTL.to("#forestReveal .tree-stage", {
    filter: "brightness(1.03) saturate(1.02)",
    duration: T,
    ease: "sine.inOut",
    yoyo: true,
    repeat: 1
  }, "<"); // run in parallel with the motion tween
}
function pauseBreathing(){ if (breatheTL) breatheTL.pause(); }
function resumeBreathing(){ if (breatheTL) breatheTL.resume(); }


/* ---------- reveal (no vertical dip) ---------- */
function setupReveal(){
  const back = gsap.timeline({
    scrollTrigger: {
      trigger: "#forestReveal",
      start: "top 86%",
      end:   "top 70%",
      toggleActions: "play none none reverse",
    }
  });

  back.to(".tree-back", {
    opacity: 1,
    clipPath: "inset(0% 0 0 0)",
    duration: 0.9,
    ease: "power2.out",
    stagger: 0.12
  });

  const front = gsap.timeline({
    scrollTrigger: {
      trigger: "#forestReveal",
      start: "top 80%",
      end:   "bottom 60%",
      toggleActions: "play none none reverse",
    }
  });

  front.to(".tree", {
    opacity: 1,
    clipPath: "inset(0% 0 0 0)",
    duration: 1.1,
    ease: "power2.out",
    stagger: 0.14
  })
  .add(startBreathing);

 const els = document.querySelectorAll("#forestReveal .tree-back, #forestReveal .tree");
  if (els.length) gsap.set(els, { opacity: 0, clipPath: "inset(100% 0 0 0)" });
}

/* ---------- crossfade stages while pinned ---------- */
const SCROLL_LEN = 1400;
let breathingOn = true;

function segIndex(p){ return p < 1/3 ? 0 : (p < 2/3 ? 1 : 2); }
function segT(p){
  if (p < 1/3) return p / (1/3);
  if (p < 2/3) return (p - 1/3) / (1/3);
  return (p - 2/3) / (1/3);
}
function easeInOut(t){ return t*t*(3-2*t); }

function setStageProgress(p){
  const seg = segIndex(p);
  const t   = easeInOut(clamp(0, segT(p), 1));

  document.querySelectorAll("#forestReveal .tree-wrap").forEach(w=>{
    const base = w.querySelector(".tree") || w.querySelector(".tree-back");
    const m1   = w.querySelector('.tree-stage[data-stage="mid1"]');
    const m2   = w.querySelector('.tree-stage[data-stage="mid2"]');
    const bare = w.querySelector('.tree-stage[data-stage="bare"]');

    if (seg === 0){        // full -> mid1
      if (base) base.style.opacity = `${1 - t}`;
      if (m1)   m1.style.opacity   = `${t}`;
      if (m2)   m2.style.opacity   = "0";
      if (bare) bare.style.opacity = "0";
    } else if (seg === 1){ // mid1 -> mid2
      if (base) base.style.opacity = "0";
      if (m1)   m1.style.opacity   = `${1 - t}`;
      if (m2)   m2.style.opacity   = `${t}`;
      if (bare) bare.style.opacity = "0";
    } else {               // mid2 -> bare
      if (base) base.style.opacity = "0";
      if (m1)   m1.style.opacity   = "0";
      if (m2)   m2.style.opacity   = `${1 - t}`;
      if (bare) bare.style.opacity = `${t}`;
    }
  });

  updateShadows(p); // animate contact shadows
}

/* ---------- LEAVES (strict color, reliable spawn) ---------- */
const LEAF_SRC_BY_STAGE = {
  0: ["images/leaf_1.png"], // green
  1: ["images/leaf_2.png"], // yellow
  2: ["images/leaf_3.png"]  // brown
};




const LEAF_SPEED  = { 0: [0.5,1.1], 1: [1.0,2.0], 2: [1.8,3.0] };
const CANOPY_X_BAND = [0.25, 0.75];
const CANOPY_Y_BAND = [0.80, 0.72];

const GROUND_RISE_PX = 59;

const SEG_DENSITY = [140, 160, 180];
const MIN_SPAWN   = [1, 2, 3];

let leafCanvas = null, lctx = null;


function sizeLeafCanvas(){
  if (!leafCanvas) return;
  leafCanvas.width  = leafCanvas.clientWidth;
  leafCanvas.height = leafCanvas.clientHeight;
  cacheTreeRects();
}
window.addEventListener("resize", sizeLeafCanvas);

// canopy rects in canvas coords
// canopy rects in canvas coords
let TREE_RECTS = [];
function cacheTreeRects(){
  if (!leafCanvas) return;
  const cb = leafCanvas.getBoundingClientRect();
  TREE_RECTS = Array.from(document.querySelectorAll("#forestReveal .tree-wrap")).map(w=>{
    const base = w.querySelector(".tree") || w.querySelector(".tree-back");
    if (!base) return {x1:0,x2:0,y1:0,y2:0};
    const b = base.getBoundingClientRect();
    const x = b.left - cb.left;
    const y = b.top  - cb.top;
    const wpx = b.width, hpx = b.height;
    return { x1:x, x2:x+wpx, y1:y, y2:y+hpx };
  });
}


const rand = (a,b)=>a + Math.random()*(b-a);

let falling = [], settled = [];

/* ---------- dust pool (includes smoke) ---------- */
const DUST_MAX = 300; // cap; tune 400–800 to taste
let dust = [];
let dustHead = 0;

function addDust(p){
  if (dust.length < DUST_MAX){
    dust.push(p);            // ✅ just add it
  } else {
    dust[dustHead] = p;      // ✅ overwrite in ring buffer
    dustHead = (dustHead + 1) % DUST_MAX;
  }
}
// pointer state (with velocity for throwing)
const mouse = { x:-1, y:-1, vx:0, vy:0, lastX:-1, lastY:-1, lastT:0, down:false };




// round-robin across trees so every tree sheds
let rrIndex = 0;

function spawnLeaf(stageIdx){
  if (!leafCanvas || !TREE_RECTS.length) return;
  const sprites = LEAF_SRC_BY_STAGE[stageIdx] || [];
  if (!sprites.length) return;

  const r = TREE_RECTS[(rrIndex++) % TREE_RECTS.length];
  const x = rand(r.x1, r.x2);
  const y = rand(r.y1, r.y2);

  const img = new Image();
  img.src = sprites[0];

  const [vmin, vmax] = LEAF_SPEED[stageIdx] || [1,2];

 falling.push({
  img, x, y,
  // motion state
  vy: 0, vx: 0,

  // look
  size: rand(18, 36),
  rot: rand(0, Math.PI*2),

  // spin + wobble params
  rVel: rand(-0.06, 0.06),
  wob1: rand(0.015, 0.028),          // low-freq weave
  wob2: rand(0.055, 0.095),          // higher-freq flutter
  amp1: rand(4, 9),
  amp2: rand(2, 6),

  // extra variety
  ph1: rand(0, Math.PI*2),           // random phases so paths don’t sync
  ph2: rand(0, Math.PI*2),
  bank: rand(-0.10, 0.10),           // aerodynamic tilt preference
  liftBias:  rand(-0.25, 0.35),      // some sink more, some float more
  driftBias: rand(0.75, 1.35),       // how strongly wind pushes this leaf
  riseChance: rand(0.00, 0.22),      // chance to catch a tiny updraft

  // vertical settling
  termVy: rand(1.6, 2.6),
  dragY:  rand(0.90, 0.96),
  baseDrop: rand(vmin, vmax),

  // time
  t: 0,
  air: true
});

}

function spawnDustPuff(rect){
  if (!leafCanvas) return;
  addDust({
    x: rand(rect.x1, rect.x2),
    y: leafCanvas.height - GROUND_RISE_PX - rand(8, 18),
    r: rand(2,5),
    a: rand(0.25, 0.4),
    vx: rand(-0.6, 0.6),
    vy: rand(1.4, 2.6)
  });
}

function spawnDustFallAt(treeIdx, clientX, clientY, count = 36){
  if (!leafCanvas || !TREE_RECTS.length) return;

  const rect = TREE_RECTS[treeIdx] || TREE_RECTS[0];
  const cb   = leafCanvas.getBoundingClientRect();

  // Map click to canvas coords then clamp inside the canopy band (for X only)
  let x = clientX - cb.left;
  x = clamp(rect.x1, x, rect.x2);

  // 🔼 spawn ABOVE the canopy band
  const canopyTop = Math.min(rect.y1, rect.y2);
  const y = Math.max(10, canopyTop - rand(DUST_SPAWN_LIFT[0], DUST_SPAWN_LIFT[1]));

  for (let k = 0; k < count; k++){
    const r = Math.round(rand(120,165));
    const g = Math.round(rand(110,140));
    const b = Math.round(rand(95,120));
    const jitterX = rand(-8, 8);
    const jitterY = rand(-6, 6);

    addDust({
      x: x + jitterX,
      y: y + jitterY,                  // ⬅️ start high
      r: rand(1, 3),
      a: rand(0.35, 0.60),
      vx: rand(-0.25, 0.25),
      vy: rand(0.60, 1.60),            // gentle fall
      color: [r, g, b]
    });
  }
}


function spawnDustFall(treeIdx, count = 36){
  if (!leafCanvas || !TREE_RECTS.length) return;
  const rect = TREE_RECTS[treeIdx] || TREE_RECTS[0];

  const canopyTop = Math.min(rect.y1, rect.y2);
  const y = Math.max(10, canopyTop - rand(DUST_SPAWN_LIFT[0], DUST_SPAWN_LIFT[1]));

  for (let k = 0; k < count; k++){
    const r = Math.round(rand(120,165));
    const g = Math.round(rand(110,140));
    const b = Math.round(rand(95,120));

    addDust({
      x: rand(rect.x1, rect.x2),
      y: y + rand(-6, 6),              // ⬅️ start high
      r: rand(1, 3),
      a: rand(0.35, 0.60),
      vx: rand(-0.25, 0.25),
      vy: rand(0.60, 1.60),            // gentle fall
      color: [r, g, b]
    });
  }
}


/* ---------- PICKUPS (apple/flower/twig) ---------- */
const PICKUP_SRC = {
  apple:  "images/apple.png",
  flower: "images/flower.png",
  twig:   "images/twig.png"
};

// -- Twig art direction -------------------------------------------------------
// Drop a few PNGs in /images/twigs/ (transparent background). Suggested names:
//   twig_a.png (long, thin), twig_b.png (short), twig_c.png (forked),
//   twig_d.png (with leaves), twig_bundle.png (small bundle)
// These are optional; code falls back gracefully if a file is missing.
const TWIG_VARIANTS = [
  { src:"images/twigs/twig_a.png",      w:150, h:26, weight:2.0 },
  { src:"images/twigs/twig_b.png",      w:115, h:22, weight:1.3 },
  { src:"images/twigs/twig_c.png",      w:130, h:26, weight:1.2 },
  { src:"images/twigs/twig_d.png",      w:140, h:28, weight:0.9 },
];
const TWIG_IMGS = TWIG_VARIANTS.map(v => {
  const img = new Image(); img.src = v.src;
  return { ...v, img };
});
function pickTwigVariant(){
  if (!TWIG_IMGS.length) return null;
  const total = TWIG_IMGS.reduce((s,v)=>s+(v.weight||1),0);
  let r = Math.random()*total;
  for (const v of TWIG_IMGS){ r -= (v.weight||1); if (r<=0) return v; }
  return TWIG_IMGS[TWIG_IMGS.length-1];
}

// Central knobs for twig behavior/quantity
const TWIG_CONFIG = {
  allowClickSpawn: false,         // ← no user-spawned twigs; only when trees fall
  burstEarly:  [1, 2],            // count range during the “commit lean”
  burstImpact: [2, 3],            // count range on ground impact
  maxActive:   48,                // hard cap on live twigs
  tintBright:  [0.88, 1.05],      // per-twig brightness variation
  tintSat:     [0.85, 1.08],      // per-twig saturation variation
};



const PICKUP_PRESET = {
  apple:  { baseSize:[56,56], termVy:3.2, dragY:0.96 },
  flower: { baseSize:[44,44], termVy:2.4, dragY:0.965},
  twig:   { baseSize:[160,26],termVy:3.0, dragY:0.965}
};

// Per-kind "feel"
const PICKUP_PHYS = {
  apple:  {
    airDrag:0.962, termVy:3.2, wind:0.18,
    bounce:0.18, friction:0.86,
    cursorR:80,  cursorF:0.8,  throwMul:0.8,
    // roll tuning
    rollCouple:0.0026,   // how much horizontal motion turns into spin
    rotClamp:0.06,       // max roll rate
    rotDampAir:0.96,     // bleed spin fast in the air
    rotDampGround:0.90,  // but keep some roll on ground
    grabK:0.10, grabDmp:0.82,
    rotInertia:1.0
  },
  flower: { airDrag:0.975, termVy:2.2, wind:0.95, bounce:0.35, friction:0.80,
            cursorR:130, cursorF:1.6,  throwMul:1.2, rollCouple:0.0006, rotClamp:0.10,
            rotDampAir:0.98,  rotDampGround:0.94, grabK:0.18, grabDmp:0.86, rotInertia:0.9 },
 twig: {
  airDrag: 0.975, termVy: 5.6, wind: 0.26,
  bounce:  0.14,
  friction:0.88,
  cursorR: 100, cursorF: 1.0,  throwMul: 1.0,
rollCouple: 0.0008, rotClamp: 0.10,
  rotDampAir: 0.984, rotDampGround: 0.93,
  grabK: 0.12, grabDmp: 0.84, rotInertia: 1.6,
  
}
};


let pickups = [];                         // active pickups
let dragPick = { active:false, idx:-1 };  // dragging state

function itemForSeg(seg){ return seg===0 ? "flower" : (seg===1 ? "apple" : "twig"); }

function spawnPickup(kind, treeIdx, clickClientX, opts = {}){
  if (!leafCanvas || !TREE_RECTS.length) return;
 if (kind === "twig" && !TWIG_CONFIG.allowClickSpawn && !opts.force) return;

  // live twig cap
  if (kind === "twig"){
    const liveTwigs = pickups.reduce((n,p)=>n + (p.kind==="twig" && !p.dead ? 1 : 0), 0);
    if (liveTwigs >= TWIG_CONFIG.maxActive) return;
  }

  const rect = TREE_RECTS[treeIdx] || TREE_RECTS[0];
  const cb   = leafCanvas.getBoundingClientRect();

  const clickX = (clickClientX - cb.left);
  const span   = Math.max(1, rect.x2 - rect.x1);
let frac     = (clickX - rect.x1) / span; // 0..1   frac = clamp(0.10, isFinite(frac) ? frac : 0.5, 0.90);
frac = clamp(0.10, Number.isFinite(frac) ? frac : 0.5, 0.90);
  const x = rect.x1 + frac*span + (span*0.08)*(Math.random()-0.5);

  // 🔼 spawn ABOVE the canopy band
  const canopyTop = Math.min(rect.y1, rect.y2);           // smaller y = higher on screen
  const [liftLo, liftHi] = PICKUP_SPAWN_LIFT[kind] || [120, 200];
  const y = Math.max(10, canopyTop - rand(liftLo, liftHi));

  let img = new Image(), v = null;
  if (kind === "apple")       img.src = APPLE_SEQ[0];
  else if (kind === "flower") img.src = FLOWER_SEQ[0];
  else {
    // twig: pick a variant if available, otherwise fallback
    v = pickTwigVariant();
    img = v?.img || img;        // use preloaded img if we have one
    if (!v) img.src = PICKUP_SRC.twig;
  }
  const cfg = PICKUP_PRESET[kind];
  let w = cfg.baseSize[0], h = cfg.baseSize[1];
  if (kind==="apple"){  w=h=42+Math.random()*18; }
  if (kind==="flower"){ w=h=34+Math.random()*16; }
if (kind==="twig"){
    if (v){ w = v.w; h = v.h; }
    else { w = 100 + Math.random()*50; h = 18 + Math.random()*10; }
 }

  const side = (frac-0.5);
  const spin =
    (kind==="flower") ? (Math.random()-0.5)*0.30 + side*0.12 :
    (kind==="apple")  ? 0 :
                        (Math.random()-0.5)*0.10 + side*0.05;

  const ph = PICKUP_PHYS[kind];

  pickups.push({
    id: Math.random().toString(36).slice(2),
    kind, img, x, y, w, h,
    vx: (side*(kind==="twig"?1.3:(kind==="apple"?1.1:0.9))) + (Math.random()-0.5)*0.6,
    vy: 0,                                  // gravity will take it from here
    rot: Math.random()*Math.PI*2,
    rVel: spin,
    termVy: ph.termVy,
    dragY: ph.airDrag,
    born: performance.now(),
    bruised: 0, snapped:false,
    dragging:false, dead:false,
    grabDX:0, grabDY:0,
    ph,
    // per-twig tint so they don’t all read the same
    tintB: (kind==="twig") ? rand(TWIG_CONFIG.tintBright[0], TWIG_CONFIG.tintBright[1]) : 1,
    tintS: (kind==="twig") ? rand(TWIG_CONFIG.tintSat[0],    TWIG_CONFIG.tintSat[1])    : 1,
    stageIdx: (kind === "apple" || kind === "flower") ? 0 : undefined,
    landedAt: (kind === "apple" || kind === "flower") ? null : undefined,
    alphaOverride: undefined
  });

  // keep your existing twig nudge so they don’t hover
  if (kind === "twig") {
   pickups[pickups.length - 1].vy = 2.0;
  }
}

/* ---------- Tail lock: keep trail layers fixed to the viewport during tail ---------- */
let __tailLocked = false;
function lockTailLayers(on){
  if (__tailLocked === on) return;
  __tailLocked = on;
  const ids = ["ground", "leafCanvas", "tractorLayer"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (on){
      // remember inline style so we can restore
      el.dataset.prevStyle = el.getAttribute("style") || "";
      // fix to viewport so it can't float away while user fast-scrolls
      el.style.position = "fixed";
      el.style.left = "0";
      el.style.right = "0";
      el.style.bottom = "0";
      el.style.width = "100%";
      el.style.pointerEvents = (id === "leafCanvas" ? "none" : (el.style.pointerEvents || ""));
      el.style.willChange = "transform, opacity";
      // if your ground image isn’t bottom-aligned, also set translateY to match your layout.
    } else {
      // restore original inline style
      if (el.dataset.prevStyle !== undefined){
        el.setAttribute("style", el.dataset.prevStyle);
        delete el.dataset.prevStyle;
      } else {
        el.removeAttribute("style");
      }
    }
  });
}

// NEW: central applier that always adds the temporary shake offsets
function setTreeTransforms(xF = 0, xB = 0){
  const footLift = 0.60;

  document.querySelectorAll("#forestReveal .tree").forEach(el=>{
    const cs = getComputedStyle(el);
    const sd = parseFloat(cs.getPropertyValue("--shakeDeg")) || 0;
    const sy = parseFloat(cs.getPropertyValue("--shakeY"))   || 0;
    gsap.set(el, {
      transformOrigin: "50% 125%",
      rotation: (xF * 0.85) + sd,
      skewX:    (xF * 0.28),
      y:        (-Math.abs(xF) * footLift) + sy
    });
  });

  document.querySelectorAll("#forestReveal .tree-stage").forEach(el=>{
    const cs = getComputedStyle(el);
    const sd = parseFloat(cs.getPropertyValue("--shakeDeg")) || 0;
    const sy = parseFloat(cs.getPropertyValue("--shakeY"))   || 0;
    gsap.set(el, {
      transformOrigin: "50% 125%",
      rotation: xF + sd,
      skewX:    (xF * 0.38),
      y:        (-Math.abs(xF) * footLift) + sy
    });
  });

  document.querySelectorAll("#forestReveal .tree-back").forEach(el=>{
    const cs = getComputedStyle(el);
    const sd = parseFloat(cs.getPropertyValue("--shakeDeg")) || 0;
    const sy = parseFloat(cs.getPropertyValue("--shakeY"))   || 0;
    gsap.set(el, {
      transformOrigin: "50% 125%",
      rotation: (xB * 0.75) + sd,
      skewX:    (xB * 0.22),
      y:        (-Math.abs(xB) * footLift) + sy
    });
  });
}

function shakeTree(wrap){
  const kids = wrap.querySelectorAll(".tree, .tree-back, .tree-stage");
  kids.forEach(el => {
    el.style.setProperty("--shakeDeg", "0");
    el.style.setProperty("--shakeY",   "0");
  });

  // Start a short-lived applier so shake shows even if mic loop is idle.
  let live = true;
  (function applyDuringShake(){
    if (!live) return;
    // base=0 so we only layer the temporary shake; mic loop (if on) will just overwrite with xF/xB
    setTreeTransforms(0, 0);
    requestAnimationFrame(applyDuringShake);
  })();

  // Floaty, decaying sway (no harsh yoyo)
  const tl = gsap.timeline({
    defaults: { ease: "sine.inOut" },
    onComplete(){
      live = false;
      kids.forEach(el=>{
        el.style.removeProperty("--shakeDeg");
        el.style.removeProperty("--shakeY");
      });
      // one last apply to settle to base
      setTreeTransforms(0, 0);
    }
  });

  // amplitude you like; keep small so it reads as a rustle, not a shove
  const deg1 = 3.0, deg2 = 2.2, deg3 = 1.4, deg4 = 0.6;
  const y1   =  2.0, y2   = 1.4, y3   = 0.9, y4   = 0.4;

  tl.to(kids, { duration: 0.18,  "--shakeDeg":  deg1,  "--shakeY":  y1 })
    .to(kids, { duration: 0.20,  "--shakeDeg": -deg2,  "--shakeY":  y2 })
    .to(kids, { duration: 0.22,  "--shakeDeg":  deg3,  "--shakeY":  y3 })
    .to(kids, { duration: 0.26,  "--shakeDeg": -deg4,  "--shakeY":  y4 })
    .to(kids, { duration: 0.28,  "--shakeDeg":  0.0,   "--shakeY":  0.0 });
}



function attachTreeClicks(){
  document.querySelectorAll("#forestReveal .tree-wrap").forEach((w, i)=>{
    if (w.__clickBound) return;      // ⬅️ guard
    w.__clickBound = true;
    w.style.cursor = "pointer";
    w.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      const p   = window.__currentProgress || 0;
      const seg = segFromProgress(p);
      const kind = itemForSeg(seg);

      if (p > 0.985){
        shakeTree(w);
        spawnDustFallAt(i, ev.clientX, ev.clientY, 42);
        const r = TREE_RECTS[i] || TREE_RECTS[0];
        for (let k=0; k<3; k++) setTimeout(()=>spawnDustPuff(r), k*90);
        return;
      }

      shakeTree(w);
      window.dispatchEvent(new CustomEvent("tree-shake", { detail: { idx: i, rect: TREE_RECTS[i] } }));
     if (kind === "twig") {
       // Bare stage: allow twig on click only here
       spawnPickup("twig", i, ev.clientX, { force: true });
     } else {
       spawnPickup(kind, i, ev.clientX);
     }
    }, {passive:true});
  });
}


const G = 0.25, FRICTION = 0.88, ROT_F = 0.97, BOUNCE = 0.3;
const WIND = { x: 0 };    // shared gust
window.__WIND__ = WIND; // expose to mic controller
function windGate(){
  const e = Math.max(0, Math.min(1, window.__breathEnv__ || 0));
  // ignore tiny mic hiss so leaves don't "rail" in a line
  return (e < 0.04) ? 0 : e;
}
// --- Smooth, spring-damped tree sway (no snap-back) ---
(() => {
  // State per layer
  let xF = 0, vF = 0, tF = 0;
  let xB = 0, vB = 0, tB = 0;

  // Spring: critically-damped feel (no bounce)
  let omega = 5.2;    // ↓ a touch softer than before
  const zeta  = 0.95;
  const k = omega * omega;
  const c = 2 * zeta * omega;

  let last = performance.now();
  let ticking = false;

  function tick(){
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    // integrate front
    const aF = k * (tF - xF) - c * vF;
    vF += aF * dt;
    xF += vF * dt;

    // integrate back
    const aB = k * (tB - xB) - c * vB;
    vB += aB * dt;
    xB += vB * dt;

 // put this inside the spring tick where rotation is applied
// put this inside the spring tick where rotation is applied
const footLift = 0.60;

// Foreground (trunk)
document.querySelectorAll("#forestReveal .tree").forEach(el=>{
  const cs = getComputedStyle(el);
  const sd = parseFloat(cs.getPropertyValue("--shakeDeg")) || 0;  // degrees
  const sy = parseFloat(cs.getPropertyValue("--shakeY"))   || 0;  // px
  gsap.set(el, {
    transformOrigin: "50% 125%",
    rotation: (xF * 0.85) + sd,
    skewX:   (xF * 0.28),
    y:       (-Math.abs(xF) * footLift) + sy,
  });
  setTreeTransforms(xF, xB);
});

// Canopy overlays
document.querySelectorAll("#forestReveal .tree-stage").forEach(el=>{
  const cs = getComputedStyle(el);
  const sd = parseFloat(cs.getPropertyValue("--shakeDeg")) || 0;
  const sy = parseFloat(cs.getPropertyValue("--shakeY"))   || 0;
  gsap.set(el, {
    transformOrigin: "50% 125%",
    rotation: xF + sd,
    skewX:   (xF * 0.38),
    y:       (-Math.abs(xF) * footLift) + sy
  });
});

// Back row
document.querySelectorAll("#forestReveal .tree-back").forEach(el=>{
  const cs = getComputedStyle(el);
  const sd = parseFloat(cs.getPropertyValue("--shakeDeg")) || 0;
  const sy = parseFloat(cs.getPropertyValue("--shakeY"))   || 0;
  gsap.set(el, {
    transformOrigin: "50% 125%",
    rotation: (xB * 0.75) + sd,
    skewX:   (xB * 0.22),
    y:       (-Math.abs(xB) * footLift) + sy
  });
});



    // keep ticking while moving/offset
    if (
      Math.abs(vF) > 0.0006 || Math.abs(vB) > 0.0006 ||
      Math.abs(tF - xF) > 0.0006 || Math.abs(tB - xB) > 0.0006
    ){
      requestAnimationFrame(tick);
    } else {
      ticking = false;
    }
  }

  // Helper: soft nonlinearity (keeps big breaths controlled)
  const curve = (x) => (x <= 1 ? x : 1 + (x - 1) * 0.75);

  // Public API: called every frame by mic with “amt” (you can still call it)
  // We’ll also read the fast channel directly for micro-twitch.
  window.__treesMicSway__ = (amt = 0) => {
    const env  = Math.max(0, Math.min(1, window.__breathEnv__  ?? amt));
    const fast = Math.max(0, Math.min(1, window.__breathFast__ ?? env));

    // Tiny motion floor so trees don’t look dead when leaves still wiggle
    const floor = 0.015; // ~1.5% of max
    // Mix: mostly envelope, small gust spice
    const mixed = Math.max(floor, (env * 0.88) + (fast * 0.18));

    // Map to degrees; foreground a bit stronger than background
const frontDeg = curve(mixed) * 15;  // was 3.4
const backDeg  = curve(mixed) * 10;   // was 1.8

    tF = frontDeg;
    tB = backDeg;

    if (!ticking){
      ticking = true;
      last = performance.now();
      requestAnimationFrame(tick);
    }
  };

  // Calm logic: only relax to 0 after a longer truly-quiet moment
  let calmTimer = null;
  function maybeCalmToZero(){
    const env  = window.__breathEnv__  || 0;
    const fast = window.__breathFast__ || 0;
    // lower threshold so small noise still counts as “moving”
    if (env > 0.015 || fast > 0.02){
      if (calmTimer){ clearTimeout(calmTimer); calmTimer = null; }
      return;
    }
    if (calmTimer) return;
    calmTimer = setTimeout(() => {
      tF = 0; tB = 0;
      if (!ticking){
        ticking = true;
        last = performance.now();
        requestAnimationFrame(tick);
      }
    }, 1400); // wait longer (1.4s) before drifting upright
  }
  gsap.ticker.add(maybeCalmToZero);

  // Optional live tuning (open console to tweak omega)
  window.__treesSpringTune__ = (w=5.2) => {
    omega = w;
    // recompute spring constants
    // (zeta fixed so still critically damped-ish)
    const _k = w*w, _c = 2*zeta*w;
    // overwrite in closure
    // eslint-disable-next-line no-func-assign
    k = _k; c = _c;  // if your linter complains, convert k/c to let at top
  };
})();

/* ---------- low-res buffer just for smoke ---------- */
const PERF = {
  fpsTargetMs: 16.7,
  exScaleMin: 0.28,
  exScaleMax: 0.6,
  exScale: 0.5,
  bud: 1,
  skipComposite: 0,
  frame: 0,
  maDt: 16.7
};
const exhaustCanvas = document.createElement("canvas");
const exCtx = exhaustCanvas.getContext("2d");

function sizeExhaustCanvas(){
  if (!leafCanvas) return;
  const s = PERF.exScale;
  exhaustCanvas.width  = Math.max(1, Math.floor(leafCanvas.width  * s));
  exhaustCanvas.height = Math.max(1, Math.floor(leafCanvas.height * s));
  exCtx.clearRect(0, 0, exhaustCanvas.width, exhaustCanvas.height);
}
sizeExhaustCanvas();
window.addEventListener("resize", sizeExhaustCanvas);






// smooth crossfade between apple frames
const smooth01 = t => t*t*(3 - 2*t); // smoothstep


// stage index from tSec (no blending)
function discreteStage(tSec, STAGE_TIMES){
  let s = 0;
  while (s < STAGE_TIMES.length - 1 && tSec >= STAGE_TIMES[s + 1]) s++;
  return s; // 0..3
}
const easeOut = t => 1 - Math.pow(1 - t, 3);


function mouseIsActive(now){ return (now - (window.__mouseLastMove || 0)) < 120; } // 120ms

function leafLoop(){
  if (!leafCanvas || !lctx) return;
  if (window.__muteLeaves) {
    // clear once to be safe, then skip the heavy work
    lctx.clearRect(0, 0, leafCanvas.width, leafCanvas.height);
    requestAnimationFrame(leafLoop);
    return;
  }
  const now = performance.now(); // single timestamp per frame
   leafLoop.__wokenThisFrame = 0; 


   window.__leafRefs__ = { settled, falling };
  // ---- auto quality (keeps 55–60fps) ----
PERF.frame++;
const last = (leafLoop.__lastTS || now);
const dt = now - last;
leafLoop.__lastTS = now;

// EMA (moving average)
PERF.maDt = PERF.maDt * 0.9 + dt * 0.1;

// adjust smoke budget (0..1)
if (PERF.maDt > 26) PERF.bud = Math.max(0.15, PERF.bud - 0.12);
else                PERF.bud = Math.min(1.00, PERF.bud + 0.06);

// drive SMOKE + cadence from budget
SMOKE.master = Math.max(SMOKE.master ?? 0, PERF.bud);

// downshift resolution and cadence under load
const wantScale = PERF.exScaleMax - (PERF.exScaleMax - PERF.exScaleMin) * (1 - PERF.bud); // lower bud => lower res
if (Math.abs(wantScale - PERF.exScale) > 0.02){
  PERF.exScale = wantScale;
  sizeExhaustCanvas();               // re-size low-res buffer on the fly
}
PERF.skipComposite = (PERF.bud > 0.75) ? 0 : (PERF.bud > 0.45 ? 1 : 2);

  lctx.clearRect(0, 0, leafCanvas.width, leafCanvas.height);
  // clear the smoke buffer once per frame too
exCtx.clearRect(0, 0, exhaustCanvas.width, exhaustCanvas.height);
    const tractorRect = TRACTOR_WASH.enabled ? tractorRectInCanvas() : null;
// puff exhaust circles from the pipe position (behind the direction of travel)
if (tractorRect){
  const speedK = Math.min(1, __tractorSpeed / 10);   // faster = more puffs
  const nowMs  = now;                                // reuse frame timestamp
  const gap    = 90 - 50 * speedK;                   // 90ms → 40ms at speed
  if (!window.__lastTrSmoke || nowMs - window.__lastTrSmoke > gap){
    emitTractorExhaust(tractorRect);
    window.__lastTrSmoke = nowMs;
  }
}

  /* ---------------- settled leaves ---------------- */
  settled.forEach(p => {
  const half   = p.size / 2;
  const ground = leafCanvas.height - half - GROUND_RISE_PX;

  // quick “near tractor?” test
  let nearTractor = false;
  if (tractorRect){
    const rx = Math.max(tractorRect.x1, Math.min(p.x, tractorRect.x2));
    const ry = Math.max(tractorRect.y1, Math.min(p.y, tractorRect.y2));
    const dx = p.x - rx, dy = p.y - ry;
    nearTractor = (dx*dx + dy*dy) < (TRACTOR_WASH.radius * TRACTOR_WASH.radius);
  }

  const mouseActive = mouse.x >= 0 && mouseIsActive(performance.now()) &&
                      Math.abs(p.x - mouse.x) < 80 && Math.abs(p.y - mouse.y) < 80;

  // FAST PATH: truly idle leaf → no physics, no trig, no rotate
 const waking = (window.__wakeAllUntil && performance.now() < window.__wakeAllUntil);
if (!waking && !p.air && p.vy === 0 && p.rVel === 0 && !mouseActive && !nearTractor){
  lctx.drawImage(p.img, p.x - half, ground - half, p.size, p.size);
  return;
}

  // wake by mouse (lightweight, squared distance)
  if (mouseActive){
    const dx = p.x - mouse.x, dy = p.y - mouse.y;
const r2 = MOUSE_WAKE_R2;
    const d2 = dx*dx + dy*dy;
    if (d2 < r2){
      const d = Math.max(1e-3, Math.sqrt(d2));
      const f = (70 - d)/70 * 3.0;
      p.vx += (dx/d) * f;
      p.vy += (dy/d) * f - 0.6;
      p.rVel += (Math.random()-0.5) * 0.22;
      p.air = true;
    }
  }

  if (p.air) {
    p.vy += G * 0.6;
    p.vy *= p.dragY;
    if (p.vy > p.termVy) p.vy = p.termVy;
   p.x += p.vx + (WIND.x * windGate());
    p.y += p.vy;
    p.rVel *= ROT_F;
    p.rot += p.rVel;

   if (p.y > ground) {
  p.y = ground;
  const gateOn = window.windGate ? window.windGate() : 0;
  if (gateOn && Math.abs(p.vy) > 0.4) {
    // allow a little lively bounce only while user is blowing
    p.vy *= -0.35; p.vx *= 0.7;
    p.rVel += (Math.random() - 0.5) * 0.12;
  } else {
    // settle immediately when breath is idle
    p.vx *= 0.5;
    p.vy = 0;
    p.air = false;
    if (Math.abs(p.rVel) < 0.01) p.rVel = 0;
  }
}

  } else {
    // only minimal decay when resting
    p.vx *= FRICTION; p.vy = 0; p.rVel *= ROT_F;
    p.y = ground;
  }
if (windGate() === 0 && !p.air) {
  // bleed off any residual sideways drift quickly when breath is idle
  p.vx *= 0.86;
  if (Math.abs(p.vx) < 0.02) p.vx = 0;
}

  if (p.x < half) { p.x = half; p.vx *= -BOUNCE; }
  if (p.x > leafCanvas.width - half) { p.x = leafCanvas.width - half; p.vx *= -BOUNCE; }

  if (tractorRect) applyTractorWashToPoint(p, tractorRect);

  // draw (rotated only if needed)
  if (p.rVel !== 0 || p.air){
    lctx.save(); lctx.translate(p.x, p.y); lctx.rotate(p.rot);
    lctx.drawImage(p.img, -half, -half, p.size, p.size);
    lctx.restore();
  } else {
    lctx.drawImage(p.img, p.x - half, ground - half, p.size, p.size);
  }
});
const mdl  = window.__WIND_MODEL__;
const tune = mdl ? mdl.sample(performance.now()/1000) : { turb:1, lift:1, size:1 };
/* ---------------- falling leaves ---------------- */
const still = [];
falling.forEach(p => {
  // one-time per-leaf defaults (so old leaves keep working)
if (!p.__init) {
  p.ph1 = p.ph1 ?? Math.random() * Math.PI * 2;
  p.ph2 = p.ph2 ?? Math.random() * Math.PI * 2;
  p.wob1 = p.wob1 ?? (0.015 + Math.random() * 0.013);  // low-freq weave
  p.wob2 = p.wob2 ?? (0.055 + Math.random() * 0.040);  // hi-freq flutter
  p.amp1 = p.amp1 ?? (4 + Math.random() * 5);
  p.amp2 = p.amp2 ?? (2 + Math.random() * 4);
  p.bank = p.bank ?? (Math.random() * 0.20 - 0.10);    // ± tilt bias
  p.liftBias  = p.liftBias  ?? (Math.random() * 0.60 - 0.25);
  p.driftBias = p.driftBias ?? (0.75 + Math.random() * 0.60);
  p.riseChance= p.riseChance?? (Math.random() * 0.22);
  p.vx = p.vx ?? 0;
  p.rVel = p.rVel ?? 0;
  p.__init = 1;
}

  // one-time per-leaf defaults (so old leaves keep working)
  if (!p.__init) {
    p.ph1 = p.ph1 ?? Math.random() * Math.PI * 2;
    p.ph2 = p.ph2 ?? Math.random() * Math.PI * 2;
    p.wob1 = p.wob1 ?? (0.015 + Math.random() * 0.013);  // low-freq weave
    p.wob2 = p.wob2 ?? (0.055 + Math.random() * 0.040);  // hi-freq flutter
    p.amp1 = p.amp1 ?? (4 + Math.random() * 5);
    p.amp2 = p.amp2 ?? (2 + Math.random() * 4);
    p.bank = p.bank ?? (Math.random() * 0.20 - 0.10);    // ± tilt bias
    p.liftBias  = p.liftBias  ?? (Math.random() * 0.60 - 0.25);
    p.driftBias = p.driftBias ?? (0.75 + Math.random() * 0.60);
    p.riseChance= p.riseChance?? (Math.random() * 0.22);
    p.vx = p.vx ?? 0;
    p.rVel = p.rVel ?? 0;
    p.__init = 1;
  }

  // time & vertical settle
  p.t++;
  p.vy += G * 0.6;
  p.vy *= p.dragY;
  if (p.vy > p.termVy) p.vy = p.termVy;

  // occasional tiny updraft so some leaves climb briefly
  if (Math.random() < (0.004 * tune.lift) && Math.random() < (p.riseChance||0)) {
    p.vy -= 0.4 + Math.random() * 0.5;
  }

  // natural lateral drift = wind + two sin wobbles
const wob = Math.sin(p.t * p.wob1 + (p.ph1||0)) * (p.amp1 * tune.turb)
           + Math.sin(p.t * p.wob2 + (p.ph2||0)) * (p.amp2 * tune.turb);

  // integrate (X uses a little inertia so paths don't look rail-guided)
const targetDx = wob * 0.06 + (WIND.x * windGate() * (p.driftBias || 1));
  p.vx += (targetDx - p.vx) * 0.12; // ease towards target lateral drift
  p.x  += p.vx;

  // vertical position includes baseDrop and lift personality
  p.y += p.baseDrop + p.vy * (1.0 - 0.22 * p.liftBias);

  // rotation softly “banks” with drift
  const bankAim = (p.bank || 0) + p.vx * 0.002;
  p.rVel += (bankAim - p.rVel) * 0.06;
  p.rot  += p.rVel;

  const half   = p.size / 2;
  const ground = leafCanvas.height - half - GROUND_RISE_PX;

  if (p.y < ground) {
    still.push(p);
    lctx.save();
    lctx.translate(p.x, p.y);
    lctx.rotate(p.rot);
    lctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
    lctx.restore();
  } else {
    p.y = ground;
    p.vx = (Math.random() - 0.5) * 1.4;
    p.vy = -Math.random() * 2;
    p.rVel = (Math.random() - 0.5) * 0.3;
    p.air = true;
    settled.push(p);

    if (settled.length > MAX_SETTLED) {
      settled.splice(0, settled.length - MAX_SETTLED);
    }
  }
});
falling = still;
window.__leafRefs__ = { settled, falling };

  /* ---------------- pickups (apple/flower/twig) ---------------- */
  pickups = pickups.filter(p => !p.dead);

  pickups.forEach(p => {
    const ground = leafCanvas.height - (p.h / 2) - GROUND_RISE_PX;
    const ageSec = (now - p.born) / 1000;

    // dragging spring or cursor push
    if (p.dragging) {
      const k = p.ph?.grabK ?? 0.14;
      const dmp = p.ph?.grabDmp ?? 0.85;
      const tx = mouse.x + (p.grabDX || 0);
      const ty = mouse.y + (p.grabDY || 0);
      p.vx += (tx - p.x) * k;
      p.vy += (ty - p.y) * k;
      p.vx *= dmp; p.vy *= dmp;
    } else {
     if (mouse.x >= 0 && mouseIsActive(now)) {
  const R  = p.ph?.cursorR ?? 100;
  const R2 = R*R;
  const dx = p.x - mouse.x;
  if (dx > -R && dx < R) {
    const dy = p.y - mouse.y;
    if (dy > -R && dy < R) {
      const d2 = dx*dx + dy*dy;
      if (d2 < R2 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const f = (R - d) / R * (p.ph?.cursorF ?? 1.2);
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f - 0.10;
        p.rVel += (Math.random() - 0.5) * 0.02;
      }
    }
  }
}

      p.vy += G * 0.7;
      p.vy *= p.dragY;
      if (p.vy > p.termVy) p.vy = p.termVy;
      p.vx += WIND.x * (p.ph?.wind ?? 0.25) * 0.15;
    }

    // angular damping per kind
    if (p.kind === "apple") {
      if (p.y < ground - 0.5) {
        p.rVel *= p.ph?.rotDampAir ?? 0.96;
      } else {
        p.rVel *= p.ph?.rotDampGround ?? 0.90;
      }
    } else {
      p.rVel *= p.ph?.rotDampAir ?? 0.985;
    }

    // integrate
    p.x += p.vx; p.y += p.vy;
    const rotInertia = p.ph?.rotInertia ?? 1.0;
    p.rot += p.rVel / rotInertia;

    // ground collision
    if (p.y > ground) {
      // inside pickups.forEach(p => { ... ground collision for twigs ... })
if (p.kind === "twig" && Math.abs(p.vy) > 2.2) {
  const n = 6 + Math.floor(Math.random()*5); // 6–10 chips
  for (let i=0;i<n;i++){
    addDust({
      shape: "chip",                // <-- new
      x: p.x + rand(-8,8),
      y: ground - 2 + rand(-2,2),
      w: rand(3,8), h: rand(1,2),   // skinny rectangle
      a: rand(0.35, 0.55),
      vx: rand(-1.4, 1.4),
      vy: rand(0.6, 1.6),
      r: rand(0, Math.PI*2),        // rotation
      vr: rand(-0.1, 0.1),          // spin
      color: [120 + Math.random()*40, 95 + Math.random()*30, 70 + Math.random()*20] // woody
    });
  }
}

      // first ground touch for apples → start decay clock
if ((p.kind === "apple" || p.kind === "flower") && p.landedAt == null) p.landedAt = now;

      if (Math.abs(p.vy) > 1.6) {
       addDust({
          x: p.x, y: leafCanvas.height - ((Math.random() * 10) + 8),
          r: (Math.random() * 3) + 2, a: 0.25 + Math.random() * 0.15,
          vx: (Math.random() - 0.5) * 1.2, vy: 1.4 + Math.random() * 1.2
        });

        // twig snap
        if (p.kind === "twig" && !p.snapped && ageSec > 12 && Math.random() < 0.08) {
          p.snapped = true;
          const mk = (w, vx) => ({
            id: Math.random().toString(36).slice(2), kind: "twig", img: p.img,
            x: p.x + (Math.random() - 0.5) * 10, y: ground - 1, w,
            h: Math.max(18, p.h * 0.9), vx, vy: -1.2,
            rot: p.rot + (Math.random() - 0.5) * 0.2, rVel: (Math.random() - 0.5) * 0.06,
            termVy: p.termVy, dragY: p.dragY, born: now, snapped: true, dragging: false, dead: false, ph: p.ph
          });
          pickups.push(mk(p.w * 0.55, -1.2), mk(p.w * 0.35, 1.2));
        }
      }

      p.y = ground;
      p.vy *= -(p.ph?.bounce ?? 0.25);
      p.vx *=  (p.ph?.friction ?? 0.78);

      // rolling couple on ground
      if (p.kind === "apple") {
        const couple = p.ph?.rollCouple ?? 0.0015;
        const clampR = p.ph?.rotClamp   ?? 0.05;
        p.rVel = clampSpin(p.rVel * (p.ph?.rotDampGround ?? 0.90) + p.vx * couple, clampR);
      } else {
        p.rVel *= (p.ph?.rotDampGround ?? 0.92);
      }

      if (Math.abs(p.vy) < 0.02) p.vy = 0;
      if (Math.abs(p.rVel) < 0.001) p.rVel = 0;
    }

    // walls
    if (p.x < p.w / 2) { p.x = p.w / 2; p.vx *= -0.35; }
    if (p.x > leafCanvas.width - p.w / 2) { p.x = leafCanvas.width - p.w / 2; p.vx *= -0.35; }

    // clamp spin
    p.rVel = clampSpin(p.rVel, p.ph?.rotClamp ?? 0.05);

    /* ---- apple decay frames & fade (run EVERY frame) ---- */
/* ---- sequence-driven decay (apple & flower) ---- */
/* ---- sequence-driven decay (apple & flower) without crossfade ---- */
if (p.kind === "apple" || p.kind === "flower") {
  if (p.landedAt != null) {
    const tSec  = (now - p.landedAt) / 1000;
    const TIMES = (p.kind === "apple") ? APPLE_STAGE_TIMES : FLOWER_STAGE_TIMES;

    // compute desired stage from elapsed time
    const want = discreteStage(tSec, TIMES);

    // if we advanced a stage, hard-switch the frame and fire a tiny physical cue
    if ((p.stageIdx ?? 0) !== want) {
      p.stageIdx = want;                 // commit frame index
      p.stagePulse = 1.0;                // 0..1 decaying “squash” pulse
      p.stageJitter = (Math.random() * 2 - 1) * 0.06; // one-time angle nudge

      // a few crumble/dust bits to camouflage the cut
      const N = (p.kind === "flower") ? 10 : 6;
      for (let i = 0; i < N; i++) {
        addDust({
          x: p.x + (Math.random() - 0.5) * p.w * 0.45,
          y: p.y + p.h * 0.40 + Math.random() * 4,
          r: (p.kind === "flower") ? rand(0.8, 1.8) : rand(1.2, 2.4),
          a: rand(0.35, 0.55),
          vx: rand(-0.5, 0.5),
          vy: rand(0.6, 1.4),
          color: (p.kind === "flower")
            ? [230 + Math.random()*15, 155 + Math.random()*25, 165 + Math.random()*25]  // pink specks
            : undefined // default grey/brown
        });
      }
    }

    // fade-out schedules stay item-specific
    const FSTART = (p.kind === "apple") ? APPLE_FADE_START : FLOWER_FADE_START;
    const FDUR   = (p.kind === "apple") ? APPLE_FADE_DUR   : FLOWER_FADE_DUR;
    if (tSec >= FSTART) {
      const ft = clamp(0, (tSec - FSTART) / FDUR, 1);
      p.alphaOverride = 1 - ft;
      if (ft >= 1) p.dead = true;
    } else {
      p.alphaOverride = undefined;
    }

  } else {
    // airborne
    p.stageIdx = 0; p.alphaOverride = undefined;
  }
}


    /* ---- generic aging (SKIP apples so it doesn't fight the sequence) ---- */
    let sat = 1, bright = 1, blur = 0, alpha = 1, scale = 1;
  if (p.kind !== "apple" && p.kind !== "flower") {
    if (p.kind === "twig" && ageSec > 18) {
   // twigs fade earlier than other junk
   const t = Math.min(1, (ageSec - 18) / 10);
   alpha *= (1 - 0.6*t);
   if (t >= 1) p.dead = true;
 }
      if (ageSec > 8) {
        const t = Math.min(1, (ageSec - 8) / 10);
        sat = 1 - t * 0.35; bright = 1 - t * 0.15; scale = 1 - t * 0.02;
      }
      if (ageSec > 18) {
        const t = Math.min(1, (ageSec - 18) / 12);
        sat -= t * 0.25; bright -= t * 0.25; blur = t * 0.5;
        if (p.kind === "flower") scale -= t * 0.02;
        if (p.kind === "twig")   scale -= t * 0.01;
      }
      if (ageSec > 30) {
        const t = Math.min(1, (ageSec - 30) / 8);
        alpha = 1 - t; blur += t * 0.8; scale -= t * 0.03;
        if (t >= 1) p.dead = true;
      }
    }

    // apply apple fade override if present
    if (p.alphaOverride !== undefined) alpha *= p.alphaOverride;

    /* ---- draw pickup (shadow + sprite) ---- */
    lctx.save();
    lctx.translate(p.x, p.y);

    // soft contact shadow when resting
    if (Math.abs(p.vy) < 0.02) {
      lctx.save();
      lctx.filter = "blur(2px)";
      lctx.globalAlpha = 0.18 * alpha;
      lctx.fillStyle = "#000";
      lctx.scale(1, 0.5);
      lctx.beginPath();
      lctx.ellipse(0, p.h, p.w * 0.45, p.h * 0.25, 0, 0, Math.PI * 2);
      lctx.fill();
      lctx.restore();
    }

    // sprite
 // sprite (with apple crossfade if needed)
lctx.rotate(p.rot);
// fold in per-twig tint if present
const bMul = (p.kind==="twig" && p.tintB) ? (bright * p.tintB) : bright;
const sMul = (p.kind==="twig" && p.tintS) ? (sat    * p.tintS) : sat;
const needFilter = (blur > 0.0001) || (sMul < 0.999 || sMul > 1.001) || (bMul < 0.999 || bMul > 1.001);
lctx.filter = needFilter ? `brightness(${bMul}) saturate(${sMul}) blur(${blur}px)` : "none";

const dw = p.w * scale, dh = p.h * scale;

if (p.kind === "apple" || p.kind === "flower") {
  const Arr = (p.kind === "apple") ? APPLE_IMGS : FLOWER_IMGS;
  const frame = Arr[p.stageIdx || 0];

  // stage pulse decays → micro squash (feels like settling/wilting)
  if (p.stagePulse && p.stagePulse > 0) {
    const t = easeOut(p.stagePulse);
    const sx = 1 + 0.03 * t;      // slight grow
    const sy = 1 - 0.03 * t;      // slight squash
    lctx.scale(sx, sy);
    p.stagePulse *= 0.85;         // decay
    if (p.stagePulse < 0.01) p.stagePulse = 0;
  }

  // tiny one-shot angle nudge on switch
  if (p.stageJitter) {
    p.rot += p.stageJitter;
    p.stageJitter = 0;
  }
    

  lctx.drawImage(frame, -dw / 2, -dh / 2, dw, dh);
} else {
  lctx.drawImage(p.img, -dw / 2, -dh / 2, dw, dh);
}




    // bruise overlay (apples)
    if (p.kind === "apple" && p.bruised > 0) {
      const rr = Math.max(12, p.w * 0.18);
      const g = lctx.createRadialGradient(0, 0, 4, 0, 0, rr);
      g.addColorStop(0, `rgba(90,45,35,${0.25 * p.bruised})`);
      g.addColorStop(1, "rgba(90,45,35,0)");
      lctx.globalCompositeOperation = "multiply";
      lctx.fillStyle = g;
      lctx.beginPath(); lctx.arc(0, 0, rr, 0, Math.PI * 2); lctx.fill();
      lctx.globalCompositeOperation = "source-over";
    }

    lctx.restore();
  });

  /* ---------------- dust ---------------- */
dust = dust.filter(d => d.a > 0);

// physics + render
for (let i=0; i<dust.length; i++){
  const d = dust[i];

  // integrate
  d.x += d.vx || 0;
  d.y += d.vy || 0;
  if (d.grow) d.r += d.grow;

  // fade
  let da = 0.003;
   if (d.smoke){
    // life/update
    d.life = (d.life || 0) + 1;

    // subtle curl so circles drift a bit
    const curl = (SMOKE.curl || 0.03);
    d.vx += Math.sin(d.seed + d.life * 0.06) * curl * 0.6;
    d.vy += Math.cos(d.seed * 1.3 + d.life * 0.05) * curl * 0.4;

    // gentle rise
    d.vy += -0.01;

    // growth + fade tailored for round puffs
    if (d.grow) d.r += d.grow;
    d.a -= (d.fade || 0.003);
    if (d.a <= 0) { d.a = 0; continue;

} else if (d.shape === "spark") {
      // update
      d.vx *= 0.986;
      d.vy = (d.vy || 0) + (d.g || 0.22);
      d.a  = (d.a  || 0) - (d.fade || 0.05);
      if (d.a <= 0){ d.a = 0; continue; }

      // draw a short additive line
      lctx.save();
      lctx.globalCompositeOperation = "lighter";
      lctx.globalAlpha = d.a;
      lctx.translate(d.x, d.y);
      lctx.rotate(d.rot || 0);
      lctx.lineWidth = 1.2;   
     const c = d.color || [255, 240, 200];
if (Math.random() < 0.3) lctx.strokeStyle = `rgba(160,220,255,${d.a})`;
      lctx.beginPath();
      const L = d.len || 12;
      lctx.moveTo(0, 0);
      lctx.lineTo(L, 0);
      lctx.stroke();
      lctx.restore();
      // integrate after-draw
      d.x += d.vx || 0;
     d.y += d.vy || 0;
      continue;


     }

    // draw the circle into the low-res exhaust buffer (exhaustCanvas)
   const sx = d.x * PERF.exScale;
const sy = d.y * PERF.exScale;
const rr = Math.max(1, d.r * PERF.exScale);

    exCtx.save();
    exCtx.globalAlpha = d.a;
exCtx.fillStyle = `rgba(${d.color[0]},${d.color[1]},${d.color[2]},1)`;
exCtx.beginPath();
exCtx.arc(sx, sy, rr, 0, Math.PI*2);
exCtx.fill();
    exCtx.globalCompositeOperation = "lighter"; // additive-ish for fluffy glow
    exCtx.globalAlpha = d.a;
exCtx.filter = `blur(${((d.blur || 2) * (PERF?.exScale ?? 0.5)).toFixed(2)}px)`;    exCtx.fillStyle = `rgba(${d.color[0]},${d.color[1]},${d.color[2]},1)`;
    exCtx.beginPath();
    exCtx.arc(sx, sy, rr, 0, Math.PI*2);
    exCtx.fill();
    exCtx.restore();

    continue;
} else if (d.shape === "chip") {
  // draw a tiny rotated rectangle chip
  lctx.save();
  lctx.globalAlpha = d.a;
  lctx.translate(d.x, d.y);
  lctx.rotate(d.r || 0);
  lctx.fillStyle = d.color
    ? `rgba(${Math.round(d.color[0])},${Math.round(d.color[1])},${Math.round(d.color[2])},${d.a.toFixed(3)})`
    : `rgba(120,100,80,${d.a.toFixed(3)})`;
  const w = d.w || 4, h = d.h || 1.5;
  lctx.fillRect(-w*0.5, -h*0.5, w, h);
  lctx.restore();

 } else {
   // default round speck
   lctx.beginPath();
   lctx.arc(d.x, d.y, d.r||2, 0, Math.PI*2);
   if (d.color){
     lctx.fillStyle = `rgba(${d.color[0]},${d.color[1]},${d.color[2]},${d.a.toFixed(3)})`;
   } else {
     lctx.fillStyle = `rgba(140,140,140,${d.a.toFixed(3)})`;
   }
   lctx.fill();
 }
}

// composite the low-res smoke layer once per frame
lctx.save();
lctx.imageSmoothingEnabled = true;
lctx.globalAlpha = 1;
lctx.drawImage(exhaustCanvas, 0, 0, leafCanvas.width, leafCanvas.height);
lctx.restore();



  requestAnimationFrame(leafLoop);
}


/* ---------- leaf spawning driven by scroll ---------- */
let lastSeg = -1;
let lastP   = 0;

function segFromProgress(p){
  if (p < 1/3) return 0;
  if (p < 2/3) return 1;
  return 2;
}

function updateLeavesForProgress(p){
   if (!leavesAllowedForProgress(p)){
    if (lastSeg !== 2) falling.length = 0;   // stop airborne leaves
    lastSeg = 2; lastP = p; return;
  }
  const seg = segFromProgress(p);
  const dp  = Math.abs(p - lastP);

  if (seg !== lastSeg) falling.length = 0; // no color mixing

  const tInSeg = easeInOut(segT(p));                 // 0..1 eased
  const density = SEG_DENSITY[seg] * (0.35 + 0.65*tInSeg);
  let count = Math.min(60, Math.ceil(dp * density));
  if (dp > 0 && count < MIN_SPAWN[seg]) count = MIN_SPAWN[seg];

  for (let i=0; i<count; i++) spawnLeaf(seg);

  if (seg !== lastSeg){
    TREE_RECTS.forEach((r, ti)=>{
      for (let i=0; i<5; i++){
        setTimeout(()=>spawnLeaf(seg), i*70 + ti*25);
      }
    });
    pulseTwigsOnStageChange(seg === 2 ? 1.2 : 0.8);
     // (optional) a hair of dust so the shake “reads”
  const r = TREE_RECTS[ (rrIndex-1+TREE_RECTS.length)%TREE_RECTS.length ] || TREE_RECTS[0];
  if (r) for (let i=0;i<2;i++) setTimeout(()=>spawnDustPuff(r), i*90);

    if (seg === 2 && lastSeg === 1){
      TREE_RECTS.forEach(r=>{
        for (let k=0; k<4; k++) setTimeout(()=>spawnDustPuff(r), k*80);
      });
    }
    lastSeg = seg;
  }
  lastP = p;
}

/* ---------- BACKGROUND FOG (continuous drift) ---------- */
/* ---------- BACKGROUND FOG (endless tiling + smoother Mid2/Bare) ---------- */
(function BackgroundFog(){
  let tailBoost = 0;
  let built = false, t = 0, prog = 0;
  let L1, L2, L3;
function boostTail(k){ tailBoost = Math.max(0, Math.min(1, k||0)); } // NEW

  function css(){
    if (document.getElementById("bgfog-style")) return;
    const s = document.createElement("style");
    s.id = "bgfog-style";
s.textContent = `
  #bg #bgFog{ position:fixed; inset:0; pointer-events:none; z-index:0; } /* was 2 */
  /* Each layer is a full-viewport div with repeat-x background so it never "runs out" */
  #bgFog .layer{
    position:fixed; inset:0;
    background-repeat: repeat-x;
    background-position: 0 0;
    background-size: auto 130%;                /* was 90%: taller coverage */
    will-change: background-position, opacity, transform, filter;
    filter: blur(1px);
    opacity: 0;
  }
  /* slight different scales so parallax looks deeper */
  #bgFog .l1{ background-size: auto 135%; }    /* was 92%  */
  #bgFog .l2{ background-size: auto 140%; }    /* was 100% */
  #bgFog .l3{ background-size: auto 130%; }    /* was 96%  */
`;

    document.head.appendChild(s);
  }

  function build(){
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg) return;

    css();

    const wrap = document.createElement("div");
    wrap.id = "bgFog";
    wrap.innerHTML = `
      <div class="layer l1"></div>
      <div class="layer l2"></div>
      <div class="layer l3"></div>
    `;
    bg.appendChild(wrap);

    L1 = wrap.querySelector(".l1");
    L2 = wrap.querySelector(".l2");
    L3 = wrap.querySelector(".l3");

    // Set images once (PNG with soft edges works best)
    L1.style.backgroundImage = 'url("images/fog1.png")';
    L2.style.backgroundImage = 'url("images/fog2.png")';
    L3.style.backgroundImage = 'url("images/fog3.png")';

    tick();
    built = true;
  }

  // small utility eases
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth = v => v*v*(3-2*v);

  function tick(){
    t += 1/60;

    // drift speeds (px/sec in background-position)
    const s1 = -18, s2 = 22, s3 = -12;

    // gentle bob so it feels volumetric
    const bob1 = Math.sin(t*0.55) * 6;
    const bob2 = Math.cos(t*0.48) * 8;
    const bob3 = Math.sin(t*0.42) * 10;

    if (L1) L1.style.backgroundPosition = `${(t*s1).toFixed(2)}px ${bob1.toFixed(2)}px`;
    if (L2) L2.style.backgroundPosition = `${(t*s2).toFixed(2)}px ${bob2.toFixed(2)}px`;
    if (L3) L3.style.backgroundPosition = `${(t*s3).toFixed(2)}px ${bob3.toFixed(2)}px`;

    requestAnimationFrame(tick);
  }

function update(p){
  build(); if (!L1 || !L2 || !L3) return;

  // helpers local to update
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth  = v => v*v*(3-2*v);

  const prog = clamp01(p);
  const seg  = prog < 1/3 ? 0 : prog < 2/3 ? 1 : 2;
  const tSeg = seg === 0 ? prog/(1/3)
            : seg === 1 ? (prog-1/3)/(1/3)
            : (prog-2/3)/(1/3);
  const t = smooth(clamp01(tSeg));

  // Clear defaults (these must exist before you touch them)
  let o1 = 0, o2 = 0, o3 = 0;

  // ---- distribution per segment ----
  // NOTE: these blocks are unchanged from your version, just left intact
  const nearBiasSeg1 = 0.25;
  const nearBiasSeg2 = 0.55;

  if (seg === 1){
    const base = 0.05 + 0.10 * t;
    const bias = nearBiasSeg1 * t;
    o1 = base * (0.70 - bias*0.4);
    o2 = base * (1.20 + bias*0.8);
    o3 = base * (0.85 - bias*0.2);

    const filt = `saturate(${(1 - 0.05*t).toFixed(3)}) brightness(${(1 - 0.03*t).toFixed(3)})`;
    L1.style.filter = `blur(1.4px) ${filt}`;
    L2.style.filter = `blur(1.2px) ${filt}`;
    L3.style.filter = `blur(1.6px) ${filt}`;
  }
  else if (seg === 2){
    const dens = 0.22 + 0.56 * t;
    const bias = nearBiasSeg2 * (0.4 + 0.6*t);
    o1 = dens * (0.70 - bias*0.35);
    o2 = dens * (1.35 + bias*0.95);
    o3 = dens * (0.95 - bias*0.20);

    const grime = `grayscale(${(0.20 + 0.45*t).toFixed(3)}) contrast(${(1.06 + 0.28*t).toFixed(3)}) brightness(${(0.94 - 0.22*t).toFixed(3)}) saturate(${(1 - 0.22*t).toFixed(3)})`;
    L1.style.filter = `blur(${(1.0 - 0.25*t).toFixed(2)}px) ${grime}`;
    L2.style.filter = `blur(${(0.9 - 0.22*t).toFixed(2)}px) ${grime}`;
    L3.style.filter = `blur(${(1.2 - 0.36*t).toFixed(2)}px) ${grime}`;
  }

 // ✅ Apply tail boost *after* o1/o2/o3 exist
const fogMul = 1 + 0.9*tailBoost;
o1 *= fogMul; o2 *= fogMul; o3 *= fogMul;

// NEW: global clearing (from Step 1)
const clearK = (window.__airClear__ || 0);   // 0..1
const clearMul = 1 - 0.95*clearK;            // ← clear
o1 *= clearMul; o2 *= clearMul; o3 *= clearMul;  // ← clear

// Clamp & apply
const c = v => Math.max(0, Math.min(0.95, v));
L1.style.opacity = c(o1).toFixed(3);
L2.style.opacity = c(o2).toFixed(3);
L3.style.opacity = c(o3).toFixed(3);

}



 
  window.__fog__ = { build, update, boostTail }; // CHANGED

})();

/* ---------- BACKGROUND STARS (fade in Mid2, persist in Bare) ---------- */

/* === add near the top of BackgroundStars === */
let shimmerBoost = 0; // 0..1, driven by ScrollTrigger before fade
let opacityOverride = null; // null = ignore; else 0..1 hard set

/* expose minimal API */
window.__bgStars__ = window.__bgStars__ || {};
window.__bgStars__.setShimmer = (v=0) => { shimmerBoost = Math.max(0, Math.min(1, v)); };
window.__bgStars__.setOpacity = (v=null) => {
  opacityOverride = (v==null ? null : Math.max(0, Math.min(1, v)));
  if (wrap && v!=null) wrap.style.opacity = String(opacityOverride);
};



(function BackgroundStars(){
  let built = false, wrap, cvs, ctx, stars = [], w = 0, h = 0;

  function css(){
    if (document.getElementById("bgstars-style")) return;
    const s = document.createElement("style");
    s.id = "bgstars-style";
    s.textContent = `
      #bg #bgStars{ position:fixed; inset:0; pointer-events:none; z-index:5; } /* under fog (z:6) */
      #bgStars canvas{ position:absolute; inset:0; width:100%; height:100%; }
    `;
    document.head.appendChild(s);
  }

  function size(){
    if (!cvs) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = cvs.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width  * dpr * 0.7));  // half-ish res for perf
    h = Math.max(1, Math.floor(rect.height * dpr * 0.7));
    cvs.width = w; cvs.height = h;
  }

  function makeStars(n=90){
  stars.length = 0;

  // ---- SKY BAND KNOBS ----
  const TOP_BAND = 0.28;   // top % of canvas
  const Y_OFFSET = 0.02;   // keep a small margin from the very top
  const yMax = h * TOP_BAND;
  const yMin = h * Y_OFFSET;

  for (let i=0;i<n;i++){
    const y = yMin + Math.random() * (yMax - yMin);
    stars.push({
      x: Math.random()*w,
      y,
      r: 0.5 + Math.random()*1.4,
      b: 0.35 + Math.random()*0.65,
      tw: 0.6 + Math.random()*1.2,
      ph: Math.random()*Math.PI*2,
      drift: (Math.random()-0.5)*0.04,

      // fade stars that are lower in the band, so they feel “higher”
      yFade: Math.pow(1 - (y - yMin) / Math.max(1, yMax - yMin), 1.4)
    });
  }
}


  function build(){
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg) return;

    css();
    wrap = document.createElement("div");
    wrap.id = "bgStars";
    cvs = document.createElement("canvas");
    wrap.appendChild(cvs);
    bg.appendChild(wrap);
wrap.style.opacity = "0";  
    ctx = cvs.getContext("2d");
    size(); makeStars();

    window.addEventListener("resize", ()=>{ size(); makeStars(stars.length); });
    built = true;
  }
/* === add after build(); start the loop once === */
function loop(ts){
  if (!ctx || !cvs) return;
  draw(ts || performance.now());
  requestAnimationFrame(loop);
}
if (!built) { build(); requestAnimationFrame(loop); }

/* === renderer with shimmer burst === */
function draw(ts){
  ctx.clearRect(0,0,w,h);

  // background fade (very subtle) so boosted shimmer “glows” a bit
  // optional: comment out if you don’t want a faint film
  ctx.globalAlpha = 1;
  // ctx.fillStyle = "rgba(0,0,16,0.05)";
  // ctx.fillRect(0,0,w,h);

  for (let i=0;i<stars.length;i++){
    const s = stars[i];

    // drift horizontally
    s.x += s.drift;
    if (s.x < -2) s.x = w+2;
    if (s.x > w+2) s.x = -2;

    // base twinkle
    const t = ts * 0.001;                            // seconds
    const twSpeed = s.tw * (0.4 + 1.6*shimmerBoost); // faster when boosted
    const pulse = 0.5 + 0.5 * Math.sin(s.ph + t*twSpeed*Math.PI*2);

    // brightness & radius modulation
    const baseB = s.b;                                // 0.35..1.0
    const boostB = baseB * (1 + 1.6*shimmerBoost);    // brighter with boost
    const b = Math.min(1, boostB * (0.75 + 0.25*pulse) * s.yFade);

    const baseR = s.r;                                // 0.5..1.9
    const r = baseR * (0.85 + 0.35*pulse) * (1 + 0.8*shimmerBoost);

    // soft glow: outer halo then inner core
    // outer halo
    ctx.globalAlpha = 0.35 * b;
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r*3.5);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r*3.5, 0, Math.PI*2);
    ctx.fill();

    // inner core
    ctx.globalAlpha = Math.min(1, 0.75 * b);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI*2);
    ctx.fill();
  }

  // if a hard opacity is set via API, apply to the wrapper
  if (opacityOverride != null && wrap) {
    wrap.style.opacity = String(opacityOverride);
  }
}

  function clear(){ ctx.clearRect(0,0,w,h); }

  // forestP = 0..1 (Full->Mid1->Mid2->Bare)
  function update(forestP){
    if (!built) return;
    clear();

    // compute segment + eased t within segment (same logic as setStageProgress)
   // compute segment + eased t within segment (same as before)
const seg = (forestP < 1/3) ? 0 : (forestP < 2/3) ? 1 : 2;
const segT = (seg === 0) ? (forestP/(1/3))
            : (seg === 1) ? ((forestP-1/3)/(1/3))
                          : ((forestP-2/3)/(1/3));
const easeInOut = t => t*t*(3-2*t);



const t = Math.max(0, Math.min(1, easeInOut(segT)));

// ---- APPEARANCE KNOBS ----
const LATE_MID2_T   = 0.82; // start to whisper-in near the end of Mid-2
const LATE_MID2_OP  = 0.02; // almost invisible
const SEG2_DELAY    = 0.25; // delay into Seg2 before real ramp begins
const SEG2_BASE_OP  = 0.15; // base opacity at ramp start
const SEG2_PEAK_OP  = 1.00; // peak opacity by Bare

let op = 0;

  if (seg === 1) {
    // late Mid-2 whisper only
    if (segT >= LATE_MID2_T) op = LATE_MID2_OP;
  } else if (seg === 2) {
    // ramp in Mid-2 → Bare
    const td = Math.max(0, (segT - SEG2_DELAY) / (1 - SEG2_DELAY)); // 0..1
    const e  = easeInOut(td);
    op = SEG2_BASE_OP + (SEG2_PEAK_OP - SEG2_BASE_OP) * e;
  }

  // Set wrapper opacity (reverse scroll works automatically)
 
// seg 0 stays at 0


    // gentle twinkle + micro parallax drift
    const now = performance.now()/1000;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let s of stars){
      s.x += s.drift; if (s.x < -2) s.x = w+2; if (s.x > w+2) s.x = -2;
      const tw = 0.5 + 0.5*Math.sin(s.ph + now*s.tw);   // 0..1
      const a  = op * (s.b*0.4 + tw*0.6);               // brightness*opacity
      if (a < 0.01) continue;

      // soft star core + glow (two passes)
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();

      ctx.globalAlpha = a * 0.5;
      ctx.filter = "blur(1.2px)";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*2.2, 0, Math.PI*2); ctx.fill();
      ctx.filter = "none";
    }
    ctx.restore();
     wrap.style.opacity = op.toFixed(3);

  }

  window.__stars__ = { build, update };
})();



(function TailSmoke(){
  let acc = 0; // frame accumulator
  function tick(doom){
    if ((SMOKE.master ?? 1) <= 0.02) { acc = 0; return; }  // ← new
 
    // cadence: a few plumes per second as doom grows
    acc += doom * 0.06;   // called every onUpdate; scale to your frame cadence
    const need = Math.floor(acc);
    if (need <= 0) return;
    acc -= need;

    // darker shade & slightly bigger near the end
    const d = Math.max(0, Math.min(1, doom));
    const baseY = (leafCanvas?.height || window.innerHeight) - (GROUND_RISE_PX || 60) - 4;
    for (let i=0;i<need;i++){
      const x = (leafCanvas?.width || window.innerWidth) * (0.15 + 0.70*Math.random());
      // temporarily bias SMOKE colors darker
      const oldLo = SMOKE.colorLo.slice(), oldHi = SMOKE.colorHi.slice();
      SMOKE.colorLo = [90  - Math.round(50*d), 90  - Math.round(50*d), 90  - Math.round(50*d)];
      SMOKE.colorHi = [150 - Math.round(40*d), 150 - Math.round(40*d), 150 - Math.round(40*d)];
      spawnSmokePlume(x, baseY, 0.7 + 0.6*d);
      SMOKE.colorLo = oldLo; SMOKE.colorHi = oldHi;
    }
  }
  window.__tailsmoke__ = { tick };
})();

function getTractorCenterX(){
  const t = document.getElementById("tractor");
  if (!t) return null;
  const op = parseFloat(getComputedStyle(t).opacity || "0");
  if (op <= 0.05) return null;                 // treat as “not in scene” yet
  const r = t.getBoundingClientRect();
  return (r.left + r.right) * 0.5;             // screen-space center (px)
}

/* ---------- CITY (reveal stays the same; parallax via background-position-x with repeat-x) ---------- */

// --- CITY SPARKS: bright, fast-fading streaks drawn on leafCanvas ---
function emitCitySparks(x, y, {count=20, speed=6, gravity=0.22, len=[8,16]} = {}){
  for (let i=0; i<count; i++){
    const ang = (Math.random() * Math.PI/2) - Math.PI/4; // ±45°
    const spd = speed + Math.random()*4;
    addDust({
      shape: "spark",
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 1.2,
      len: len[0] + Math.random()*(len[1]-len[0]),
      a: 0.9,
fade: 0.04 + Math.random()*0.015,
      g: gravity,
      rot: ang,
      color: [255, 210 - (Math.random()*50|0), 110 + (Math.random()*60|0)] // warm steel
    });
    // a tiny ember afterglow
    addDust({
      x: x + (Math.random()-0.5)*5,
      y: y + (Math.random()-0.5)*5,
      r: 1 + Math.random()*1.5,
      a: 0.45,
      fade: 0.02 + Math.random()*0.02,
      vx: (Math.random()-0.5)*0.7,
      vy: -0.3 + Math.random()*0.6,
      color: [255, 180, 90]
    });
  }
}



(function City(){
  let built = false, wrap, back, mid, near;

  // spring state (for smooth parallax target → value)
  const S = {
    far:  { x:0, v:0, t:0 },
    mid:  { x:0, v:0, t:0 },
    near: { x:0, v:0, t:0 }
  };

  // motion feel (unchanged reveal; just X amplitudes)
  const MIN_AMP   = 12;  // base when tractor first appears
  const AMP_NEAR  = 72;
  const AMP_MID   = 48;
  const AMP_FAR   = 28;

  const OMEGA   = 6.0; // spring stiffness
  const ZETA    = 1.0; // critical damping
  const MAX_VEL = 900; // px/s cap
  const MAX_DT  = 1/30;

  let tickerOn = false;
  let lastTS   = performance.now();

  function css(){
    if (document.getElementById("city-style")) return;
    const s = document.createElement("style");
    s.id = "city-style";
    s.textContent = `
      #bg #bgCity{ position:fixed; inset:0; pointer-events:none; z-index:5; }
      #bgCity .layer{
        position:fixed; inset:0;
        opacity:0;
        /* IMPORTANT: we tile horizontally and slide the texture, not the element */
        background-repeat: repeat-x;
        background-position: 50% 100%; /* we'll override X in JS */
        background-size: auto 100%;    /* keep height locked; natural width for tiling */
        will-change: opacity, filter, transform, background-position;
        filter: blur(2px);
        transform: translate3d(0,30px,0); /* Y is animated during reveal; no X here */
        pointer-events:auto;          /* enable clicks on the images */
              optional: “clickable effect” cursor */
        user-select:none;
      }
      #bgCity .back{ z-index:1; }
      #bgCity .mid { z-index:2; }
      #bgCity .near{ z-index:3; }
      /* full-screen canvas that we draw sparks onto (above the near layer) */
      #citySparks{
        position: fixed; inset: 0; z-index: 4;  /* back:1, mid:2, near:3, sparks:4 */
        pointer-events: none;                    /* doesn't block clicks */
      }
    `;
    
    document.head.appendChild(s);
  }

  function build(){
    if (built) return;
    const bg = document.getElementById("bg"); if (!bg) return;

    css();

    wrap = document.createElement("div");
    wrap.id = "bgCity";
    wrap.innerHTML = `
      <div class="layer back"></div>
      <div class="layer mid"></div>
      <div class="layer near"></div>
    `;
    bg.appendChild(wrap);

    back = wrap.querySelector(".back");
    mid  = wrap.querySelector(".mid");
    near = wrap.querySelector(".near");

    // your tiling art
    back.style.backgroundImage = 'url("images/constructioncity_far1.png")';
    mid .style.backgroundImage = 'url("images/constructioncity_mid1.png")';
    near.style.backgroundImage = 'url("images/constructioncity_near1.png")';
// after back/mid/near exist & have images…
/* ===== City click router (only active while city is visible) ===== */
let router = document.getElementById("cityClickRouter");
if (!router){
  router = document.createElement("div");
  router.id = "cityClickRouter";
  document.body.appendChild(router);
}

window.__cityClicksOff = function(){
  const r = document.getElementById("cityClickRouter");
  if (r) {
    r.style.display = "none";
    r.style.pointerEvents = "none";
    r.style.cursor = "default";
  }
  const sparks = document.getElementById("citySparks");
  if (sparks) sparks.style.display = "none";
};

window.__cityClicksOn = function(){
  const r = document.getElementById("cityClickRouter");
  if (r) {
    r.style.display = "block";
    r.style.pointerEvents = "auto";
  
  }
  const sparks = document.getElementById("citySparks");
  if (sparks) sparks.style.display = "block";
};


// keep default cursor AND let events through when hovering the mic button
(() => {
  const router = document.getElementById("cityClickRouter");
  if (!router) return;

  function isMic(el){
    return !!(el && (el.id === "micWindBtn" || (el.closest && el.closest("#micWindBtn"))));
  }

  let punched = false;
  function punchThrough(on){
    if (on && !punched){
      router.style.pointerEvents = "none"; // let mic receive hover/click
      punched = true;
      // fail-safe: restore on next frame in case we moved off instantly
      requestAnimationFrame(() => {
        if (punched && !isMic(document.elementFromPoint(window._mx||0, window._my||0))){
          router.style.pointerEvents = "auto";
          punched = false;
        }
      });
    } else if (!on && punched){
      router.style.pointerEvents = "auto";
      punched = false;
    }
  }

  // Track mouse position so the rAF fail-safe can re-check
  window._mx = 0; window._my = 0;

  router.addEventListener("mousemove", (e) => {
    window._mx = e.clientX; window._my = e.clientY;

    // peek under the overlay to see what's really beneath
    let under;
    if (typeof elementUnder === "function") {
      under = elementUnder(e.clientX, e.clientY); // uses temporary pointerEvents:none
    } else {
      // do a manual peek
      router.style.pointerEvents = "none";
      under = document.elementFromPoint(e.clientX, e.clientY);
      router.style.pointerEvents = punched ? "none" : "auto";
    }

    const overMic = isMic(under);
    router.style.cursor = overMic ? "auto" : "pointer";
    punchThrough(overMic);
  }, {passive:true});

  // If the mouse leaves the router overlay, restore pointer-events
  router.addEventListener("mouseleave", () => punchThrough(false), {passive:true});

  // Also restore when user clicks somewhere that isn’t the mic
  router.addEventListener("pointerdown", (e) => {
    if (!isMic(e.target)) punchThrough(false);
  }, {passive:true});
})();


function debugDot(x,y){
  const d = document.createElement("div");
  d.className = "city-dot";
  d.style.left = x + "px"; d.style.top = y + "px";
  document.body.appendChild(d);
  requestAnimationFrame(()=> d.classList.add("fade"));
  setTimeout(()=> d.remove(), 420);
}

function elementUnder(x, y){
  router.style.pointerEvents = "none";
  const el = document.elementFromPoint(x, y);
  router.style.pointerEvents = "auto";
  return el;
}

// emit sparks into your existing leafCanvas/addDust system
function emitCitySparksAtClientXY(clientX, clientY, {count=22} = {}){
  if (!window.leafCanvas || typeof addDust !== "function") return false;
  const cb = leafCanvas.getBoundingClientRect();
  const x = clientX - cb.left, y = clientY - cb.top;

  for (let i=0;i<count;i++){
    const ang = (Math.random()*Math.PI/2) - Math.PI/4; // ±45°
    const spd = 6 + Math.random()*4;
    addDust({
      shape: "spark",
      x, y,
      vx: Math.cos(ang)*spd,
      vy: Math.sin(ang)*spd - 1.2,
      len: 10 + Math.random()*14,
      a: 0.95,
      fade: 0.045 + Math.random()*0.02,
      g: 0.22,
      rot: ang,
      color: [255, 200 - (Math.random()*60|0), 110 + (Math.random()*70|0)]
    });
    // ember
    addDust({
      x: x + (Math.random()-0.5)*5,
      y: y + (Math.random()-0.5)*5,
      r: 1 + Math.random()*1.6,
      a: 0.5,
      fade: 0.02 + Math.random()*0.02,
      vx: (Math.random()-0.5)*0.7,
      vy: -0.3 + Math.random()*0.6,
      color: [255, 180, 90]
    });
  }
  return true;
}

// route clicks only during this scene
router.addEventListener("click", (ev)=>{
  // safety: ignore if router is hidden
  if (router.style.display === "none") return;

  const x = ev.clientX, y = ev.clientY;
 

  // if over a tree-wrap, forward so your existing tree click logic runs
  const under = elementUnder(x,y);
  const treeWrap = under && under.closest && under.closest("#forestReveal .tree-wrap");
  if (treeWrap){ treeWrap.click(); return; }

  // otherwise treat as city click (choose intensity by depth)
  const depth =
    (under && under.classList && under.classList.contains("near")) ? "near" :
    (under && under.classList && under.classList.contains("mid"))  ? "mid"  : "back";
  const counts = { near: 26, mid: 20, back: 16 };
  emitCitySparksAtClientXY(x, y, { count: counts[depth] || 20 });
}, {passive:true});

/* monitor visibility: enable router only while city layers are visible
   (opacity > 0 on any layer). This piggybacks on your City animation. */
function updateRouterActiveFlag(){
  // use computed opacity; reveal drives these from 0 → 1
  const ob = parseFloat(getComputedStyle(back).opacity || "0");
  const om = parseFloat(getComputedStyle(mid ).opacity || "0");
  const on = parseFloat(getComputedStyle(near).opacity || "0");
  const visible = (ob + om + on) > 0.05; // any layer showing?
  setRouterEnabled(visible);
}
// run once now
updateRouterActiveFlag();
// and run on interval while city is building
let routerWatch = setInterval(updateRouterActiveFlag, 1500);
// optional: stop the watcher after a long while, or keep it—cheap enough.

const hit = document.createElement("div");
hit.id = "cityHit";
wrap.appendChild(hit);

// helper: tiny debug dot so you can *see* the click landed


// attempt to grab your existing leaf canvas + context
function getLeafCtx(){
  // If your globals exist, use them
  if (window.lctx && window.leafCanvas) return {ctx: window.lctx, canvas: window.leafCanvas};
  // Common fallbacks
  const c = document.getElementById("leafCanvas") || document.querySelector('canvas#leaves, canvas[data-role="leaves"]');
  if (!c) return null;
  const ctx = c.getContext("2d");
  return {ctx, canvas: c};
}

// Canvas sparks (Plan A)
function sparksCanvas(x, y, opts = {}){
  const L = getLeafCtx();
  if (!L) return false; // tell caller to try the DOM fallback
  const {ctx} = L;
  const count   = opts.count   ?? 22;
  const speed   = opts.speed   ?? 7;
  const gravity = opts.gravity ?? 0.25;
  const lenMin  = opts.lenMin  ?? 10;
  const lenMax  = opts.lenMax  ?? 22;

  for (let i=0; i<count; i++){
    const ang = (Math.random()*Math.PI/2) - Math.PI/4; // ±45°
    const spd = speed + Math.random()*3;

    // one-shot streak (simple: draw & let fade in-place without pooling)
    const Lseg = lenMin + Math.random()*(lenMax - lenMin);
    const c = [255, 200 - (Math.random()*60|0), 110 + (Math.random()*70|0)];
    const steps = 12 + (Math.random()*6|0);
    let px = x, py = y, vx = Math.cos(ang)*spd, vy = Math.sin(ang)*spd - 1.2;

    (function animateSpark(step, alpha){
      if (alpha <= 0 || step > steps) return;
      // draw segment
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(Lseg, 0);
      ctx.stroke();
      ctx.restore();

      // integrate
      vx *= 0.986;
      vy += gravity;
      px += vx;
      py += vy;

      requestAnimationFrame(()=> animateSpark(step+1, alpha - (1/steps)));
    })(0, 0.95);
  }

  // embers (few dots)
  for (let i=0; i<10; i++){
    const rr = 1 + Math.random()*1.6;
    const ox = (Math.random()-0.5)*6;
    const oy = (Math.random()-0.5)*6;
    const c2 = [255, 180, 90];
    let ax = x+ox, ay = y+oy, vx = (Math.random()-0.5)*0.7, vy = -0.3 + Math.random()*0.6, a = 0.6;

    (function ember(){
      if (a <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(ax, ay, rr, 0, Math.PI*2); ctx.fillStyle = `rgba(${c2[0]},${c2[1]},${c2[2]},${a})`; ctx.fill();
      ctx.restore();

      vx *= 0.985; vy += 0.22; ax += vx; ay += vy; a -= 0.06;
      requestAnimationFrame(ember);
    })();
  }

  return true;
}

/* ==== 👇 ADD THIS BLOCK (sparks canvas + clicks) ==== */
const sparks = document.createElement("canvas");
sparks.id = "citySparks";
wrap.appendChild(sparks);

const sctx = sparks.getContext("2d", { alpha: true });
const SP = { list: [], last: performance.now() };

function resizeSparks(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  sparks.width  = Math.round(window.innerWidth  * dpr);
  sparks.height = Math.round(window.innerHeight * dpr);
  sparks.style.width  = window.innerWidth + "px";
  sparks.style.height = window.innerHeight + "px";
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeSparks();
window.addEventListener("resize", resizeSparks);

/* emitter: short, bright welding streaks */
function emitCityWeldSparks(x, y, count = 18){
  for (let i = 0; i < count; i++){
    const ang = (Math.random()*Math.PI/3) - Math.PI/6; // ±30°
    const spd = 8 + Math.random()*6;
    addDust({
      shape: "spark",
      x, y,
      vx: Math.cos(ang)*spd,
      vy: Math.sin(ang)*spd + 1.5,  // slight downward pull
      len: 10 + Math.random()*10,
      a: 1.0,
      fade: 0.08 + Math.random()*0.03,  // very fast fade
      g: 0.35,
      rot: ang,
      color: [255, 255 - (Math.random()*60|0), 200 - (Math.random()*100|0)] // white-yellow core
    });
  }

  // blue-white flash at the welding point
  const L = window.lctx;
  if (L){
    const grd = L.createRadialGradient(x, y, 0, x, y, 25);
    grd.addColorStop(0, "rgba(255,255,255,0.8)");
    grd.addColorStop(0.4, "rgba(150,220,255,0.5)");
    grd.addColorStop(1, "rgba(150,220,255,0)");
    L.save();
    L.fillStyle = grd;
    L.fillRect(x-25, y-25, 50, 50);
    L.restore();
  }
}

/* render loop just for city sparks */
function tickSparks(ts){
  const dt = Math.min(0.05, Math.max(1/120, (ts - SP.last)/1000 || 0));
  SP.last = ts;

  sctx.clearRect(0, 0, sparks.width, sparks.height);

  // draw particles
  for (let i=SP.list.length-1;i>=0;i--){
    const p = SP.list[i];
    p.a -= p.fade;
    if (p.a <= 0){ SP.list.splice(i,1); continue; }

    if (p.ember){
      p.vx *= 0.985;
      p.vy += 0.22*dt*60;
      p.x  += p.vx;
      p.y  += p.vy;

      sctx.globalCompositeOperation = "lighter";
      sctx.globalAlpha = p.a;
      sctx.beginPath();
      sctx.arc(p.x, p.y, p.r || 1.2, 0, Math.PI*2);
      sctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${Math.min(1,p.a)})`;
      sctx.fill();
    } else {
      // spark streak
      p.vx *= 0.986;
      p.vy += 0.22*dt*60;
      p.x  += p.vx;
      p.y  += p.vy;

      sctx.save();
      sctx.globalCompositeOperation = "lighter";
      sctx.globalAlpha = p.a;
      sctx.translate(p.x, p.y);
      sctx.rotate(p.rot || 0);
      sctx.lineWidth = 1.4;
      sctx.strokeStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${Math.min(1,p.a)})`;
      sctx.beginPath();
      const L = p.len || 12;
      sctx.moveTo(0,0); sctx.lineTo(L,0);
      sctx.stroke();
      sctx.restore();
    }
  }
  requestAnimationFrame(tickSparks);
}
requestAnimationFrame(tickSparks);

/* click → canvas coords → emit, tuned per depth */
function onCityClick(layer){
  const cfg = layer==="near" ? {count:24,speed:7.5,gravity:0.24,len:[10,18]}
            : layer==="mid"  ? {count:18,speed:6.0, gravity:0.20,len:[8,15]}
                              : {count:14,speed:5.0, gravity:0.18,len:[7,13]};
  return (ev)=>{
    const x = ev.clientX;         // sparks canvas is fullscreen, so viewport coords are canvas coords
    const y = ev.clientY;
    emitCitySparks(x, y, cfg);
  };
}
back.addEventListener("click", onCityClick("back"), {passive:true});
mid .addEventListener("click", onCityClick("mid"),  {passive:true});
near.addEventListener("click", onCityClick("near"), {passive:true});


    built = true;
    startTicker();
  }

  // critically-damped spring step
  function springStep(state, target, dt){
    const k = OMEGA*OMEGA;
    const c = 2*ZETA*OMEGA;
    const a = k*(target - state.x) - c*state.v;
    state.v += a * dt;
    if (state.v >  MAX_VEL) state.v =  MAX_VEL;
    if (state.v < -MAX_VEL) state.v = -MAX_VEL;
    state.x += state.v * dt;
  }
function setRouterEnabled(on){
  const r = document.getElementById("cityClickRouter");
  if (!r) return;
  r.style.display = on ? "block" : "none";
  
}
  function startTicker(){
    if (tickerOn) return;
    tickerOn = true;

    function tick(ts){
      const dtRaw = (ts - lastTS) / 1000;
      lastTS = ts;
      const dt = Math.min(MAX_DT, Math.max(1/120, dtRaw || 0));

      // advance spring toward targets
      springStep(S.far,  S.far.t,  dt);
      springStep(S.mid,  S.mid.t,  dt);
      springStep(S.near, S.near.t, dt);

      // APPLY PARALLAX BY SLIDING THE TEXTURE, NOT THE ELEMENT
      // (negative to match perceived transform direction)
      if (back) back.style.backgroundPosition = `${(-S.far.x).toFixed(2)}px 100%`;
      if (mid)  mid .style.backgroundPosition = `${(-S.mid.x).toFixed(2)}px 100%`;
      if (near) near.style.backgroundPosition = `${(-S.near.x).toFixed(2)}px 100%`;

      // Y is composed via translateY only (kept from reveal logic)
      if (back) back.style.transform = `translate3d(0,${back.__cityY || 30}px,0)`;
      if (mid)  mid .style.transform = `translate3d(0,${mid .__cityY || 30}px,0)`;
      if (near) near.style.transform = `translate3d(0,${near.__cityY || 30}px,0)`;
if (wrap) {
  // keep router enabled only while city is visible
  const ob = back ? parseFloat(getComputedStyle(back).opacity || "0") : 0;
  const om = mid  ? parseFloat(getComputedStyle(mid ).opacity || "0") : 0;
  const on = near ? parseFloat(getComputedStyle(near).opacity || "0") : 0;
  const visible = (ob + om + on) > 0.05;
  (visible ? setRouterEnabled(true) : setRouterEnabled(false));
}

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function tractorCenterX(){
    const t = document.getElementById("tractor");
    if (!t) return null;
    const op = parseFloat(getComputedStyle(t).opacity || "0");
    if (op <= 0.05) return null;
    const r = t.getBoundingClientRect();
    return (r.left + r.right) * 0.5;
  }

function updateTail(k){
  if (!built) build();
  if (!back || !mid || !near) return;

  // helpers
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth  = t => t*t*(3-2*t);
  const L = (a,b,t)=> a+(b-a)*t;

  // keep your reveal window + easing the same for OPACITY/BLUR only
  const start = 0.00, end = 0.70;
  const t = clamp01((k - start) / (end - start));
  const e = smooth(t);

  // reveal: only fade/blur — NO vertical translate
  const opB = L(0, 0.95, e), opM = L(0, 0.98, e), opN = L(0, 1.00, e);
  const blurB = L(2.0, 1.2, e), blurM = L(2.0, 0.9, e), blurN = L(2.0, 0.6, e);

  back.style.opacity = opB.toFixed(3);
  mid .style.opacity = opM.toFixed(3);
  near.style.opacity = opN.toFixed(3);

  // 🔒 lock Y to 0 the whole tail (no downwards drift)
  back.__cityY = 0;
  mid .__cityY = 0;
  near.__cityY = 0;

  back.style.transform = `translate3d(0,0,0)`;
  mid .style.transform = `translate3d(0,0,0)`;
  near.style.transform = `translate3d(0,0,0)`;

  back.style.filter = `blur(${blurB.toFixed(2)}px)`;
  mid .style.filter = `blur(${blurM.toFixed(2)}px)`;
  near.style.filter = `blur(${blurN.toFixed(2)}px)`;

  // horizontal parallax targets (same as before; spring smooths it)
  const tEl = document.getElementById("tractor");
  const cx  = tEl && parseFloat(getComputedStyle(tEl).opacity||"0") > 0.05
    ? ((tEl.getBoundingClientRect().left + tEl.getBoundingClientRect().right) * 0.5)
    : null;

  const vpW = window.innerWidth || 1920;
  const nx  = (cx == null) ? 0 : Math.max(-1, Math.min(1, (cx / vpW) * 2 - 1));

  const MIN_AMP = 12, AMP_NEAR = 72, AMP_MID = 48, AMP_FAR = 28;
  const base    = MIN_AMP;
  const ampNear = base + AMP_NEAR * e;
  const ampMid  = base + AMP_MID  * e;
  const ampFar  = base + AMP_FAR  * e;

  S.near.t = (cx == null) ? 0 : nx * ampNear;
  S.mid .t = (cx == null) ? 0 : nx * ampMid;
  S.far .t = (cx == null) ? 0 : nx * ampFar;

  // keep your forest dim-out near end of tail
  const fadeForest = Math.max(0, (k - 0.65) / 0.25);
  const forestDark = 1 - 0.20*fadeForest;
  const forestSat  = 1 - 0.30*fadeForest;
  const forestCon  = 1 + 0.08*fadeForest;
  gsap.set(".tree, .tree-back, .tree-stage", {
    filter: `brightness(${forestDark}) saturate(${forestSat}) contrast(${forestCon})`
  });
}


  window.__city__ = { build, updateTail };
})();

// continuous exhaust tied to the tractor's exhaust pipe
function emitTractorExhaust(trRect){
  if (!leafCanvas || !trRect) return;

  // place the plume a bit *behind and above* the tractor's center (fake pipe)
  // dir-aware so it always appears behind the motion direction
  const pipeOffsetX = (trRect.dirX || 1) * -54; // behind the tractor
  const pipeOffsetY = -28;                      // slightly higher than center

  const x = trRect.cx + pipeOffsetX;
  const y = trRect.cy + pipeOffsetY;

  // strength scales with speed but never goes to zero
  const base = 0.18;                          // lighter baseline
 const spdK = Math.min(1, __tractorSpeed / 14);
 const strength = Math.min(1, base + spdK * 0.55);
  // temporarily bias smoke darker/thicker for exhaust look
  const prevLo = SMOKE.colorLo.slice(), prevHi = SMOKE.colorHi.slice();
  const prevStart = SMOKE.startR.slice(), prevFade = SMOKE.fade.slice();

  SMOKE.colorLo = [90, 90, 90];
  SMOKE.colorHi = [160,160,160];
 SMOKE.startR  = [9, 22];
 SMOKE.fade    = [0.0025, 0.0040];    // lives longer

  spawnSmokePlume(x, y, strength);

  // restore shared settings
  SMOKE.colorLo = prevLo; SMOKE.colorHi = prevHi;
  SMOKE.startR  = prevStart; SMOKE.fade  = prevFade;
}

/* ---------- TRACTOR CULL (lift each tree only as the tractor nose passes it + pre-exit animation) ---------- */

(function TractorCull(){
  const PASS_PAD = 8;    // trigger window around tree center
  const BLUR_PX  = 8;    // final blur
  const DUR      = 0.50; // legacy (still used by fade tail)

  // NEW: topple tuning
  const TOPPLE = {
    tip1: 6,                 // small pre-tip (deg)
    preLift: 6,              // tiny lift before falling (px)
    hinge1: 16,              // first committed lean (deg)
    hinge2: 52,              // second stage lean (deg)
    finalRot: 118,           // total rotation at rest (deg)
    xDrift1: 28,             // slide while leaning (px)
    xDrift2: 120,            // slide during fall (px)
    drop1: 10,               // early drop (px)
    drop2: 46,               // late drop (px)
    bounceY: 10,             // little ground bounce (px)
    bounceRot: 4,            // little rotational bounce (deg)
    tPre:   0.22,            // time pre-lean
    tLean1: 0.28,            // time to hinge1
    tLean2: 0.50,            // time to final
    tFade:  0.60             // fade tail time
  };

  let lastEdgeX = null;
  let movingLeft = null;
  let haveDirection = false;
  let armed = false;
function jitterInPlace(el, times=5, rotDeg=1.0, dur=0.035){
  const tl = gsap.timeline();
  for (let i=0;i<times;i++){
    tl.to(el, {
      rotation: (Math.random()-0.5) * rotDeg, // rotation only
      duration: dur,
      ease: "sine.inOut"
    });
  }
  tl.to(el, { rotation: 0, duration: dur*0.8, ease: "sine.out" });
  return tl;
}


  function forestBandX(){
    const bases = [...document.querySelectorAll("#forestReveal .tree-wrap .tree, #forestReveal .tree-wrap .tree-back")];
    if (!bases.length) return null;
    const xs = bases.map(b => {
      const r = b.getBoundingClientRect();
      return r.left + r.width * 0.5;
    });
    return { min: Math.min(...xs), max: Math.max(...xs) };
  }

  function tractorNose(){
    const t = document.getElementById("tractor");
    if (!t) return null;
    const op = parseFloat(getComputedStyle(t).opacity || "0");
    if (op < 0.05) return null;

    const r = t.getBoundingClientRect();
    const leftEdge  = r.left;
    const rightEdge = r.right;

    const probe = (movingLeft === true) ? leftEdge
                : (movingLeft === false) ? rightEdge
                : (lastEdgeX == null ? leftEdge : rightEdge);

    if (lastEdgeX != null){
      const dx = probe - lastEdgeX;
      if (Math.abs(dx) > 0.5){
        movingLeft = dx < 0;
        haveDirection = true;
      }
    }
    lastEdgeX = probe;
    if (!haveDirection) return null;
    return movingLeft ? leftEdge : rightEdge;
  }


 
function cullTree(wrap){
  if (!wrap || wrap.dataset.gone === "1" || wrap.dataset.gone === "2") return;
  wrap.dataset.gone = "1";

  // per-tree burst guards (init here where wrap exists)
  if (wrap.__burstEarly   == null) wrap.__burstEarly   = false;
  if (wrap.__burstImpact  == null) wrap.__burstImpact  = false;

  const idx    = parseInt(wrap.dataset.idx || "0", 10);
  const kids   = wrap.querySelectorAll(".tree, .tree-back, .tree-stage");
  const base   = wrap.querySelector(".tree, .tree-back");
  const shadow = wrap.querySelector(".shadow-oval");

  // debris you already had
  if (typeof spawnDustFall === "function") spawnDustFall(idx, 24);
  const rect = TREE_RECTS[idx] || TREE_RECTS[0];
  for (let k=0;k<3;k++) setTimeout(()=>spawnDustPuff(rect), k*80);

  // pointer off
  gsap.set(wrap, { pointerEvents: "none" });

  // ✅ Pivot close to the stump so rotation stays “in place”
  gsap.set(wrap, { transformOrigin:"50% 98%" });
  kids.forEach(k => gsap.set(k, { transformOrigin:"50% 98%" }));

  const dirAway = (movingLeft === true) ? +1 : -1; // +1 = fall right, -1 = fall left

  const tl = gsap.timeline({
    onComplete(){
        wrap.dataset.gone = "2";            
      gsap.set(kids, { opacity: 0, filter: `blur(${BLUR_PX}px)` });
    }
  });

  // 1) chainsaw buzz (reduced amplitude to avoid visible drift)
tl.add(jitterInPlace(wrap, 5, 1.0, 0.035));

  // 2) micro pre-tip (away from nose) — no x drift
  tl.to(wrap, {
    rotation: dirAway * TOPPLE.tip1,
    y: -TOPPLE.preLift,
    duration: TOPPLE.tPre,
    ease: "power2.out"
  });

  // 3) commit the lean — ❌ remove lateral slide; keep drop
  tl.to(wrap, {
    rotation: dirAway * (TOPPLE.tip1 + TOPPLE.hinge1),
    // x: `+=${dirAway * TOPPLE.xDrift1}`,   // removed
    y: `+=${TOPPLE.drop1}`,
    duration: TOPPLE.tLean1,
    ease: "power2.in"
  });

  // early burst (twig + dust) right as the lean commits
  tl.add(() => {
    if (!wrap.__burstEarly) {
      wrap.__burstEarly = true;
      const cEarly = Math.floor(rand(TWIG_CONFIG.burstEarly[0], TWIG_CONFIG.burstEarly[1] + 1));
      spawnTwigBurstAtTree(idx, cEarly);
      for (let i=0;i<3;i++) setTimeout(()=>spawnDustPuff(rect), i*90);
    }
  }, "-=0.10");

  // 4) accelerate into the fall — ❌ no extra x drift; keep rotation + drop
  tl.to(wrap, {
    rotation: dirAway * TOPPLE.finalRot,
    // x: `+=${dirAway * (TOPPLE.xDrift2 - TOPPLE.xDrift1)}`, // removed
    y: `+=${TOPPLE.drop2 - TOPPLE.drop1}`,
    duration: TOPPLE.tLean2,
    ease: "power4.in"
  }, "<");

  // shadow stretches & fades during fall (unchanged)
  if (shadow){
    tl.to(shadow, {
      opacity: 0.10,
      scaleX: 1.2,
      scaleY: 0.7,
      duration: TOPPLE.tLean1 + TOPPLE.tLean2,
      ease: "power2.inOut"
    }, "<");
  }

  // slight blur ramp as it moves fast / out of focus (unchanged)
  tl.to(kids, {
    filter: `blur(${BLUR_PX}px)`,
    duration: TOPPLE.tLean2 * 0.8,
    ease: "power2.in"
  }, "<+0.05");

  // 5) impact bounce — keep tiny rotation, switch impact shake to Y so it doesn't “walk” sideways
  tl.to(wrap, {
    y: `+=${TOPPLE.bounceY}`,
    rotation: `+=${dirAway * TOPPLE.bounceRot}`,
    duration: 0.18,
    ease: "bounce.out",
    onStart(){
      // dusty thump
      if (typeof spawnDustPuff === "function") {
        const r = TREE_RECTS[idx] || TREE_RECTS[0];
        for (let i=0;i<2;i++) setTimeout(()=>spawnDustPuff(r), i*80);
      }
      // shake vertically instead of x so it stays in place
      gsap.fromTo(wrap, { y: "+=1.2" }, { y: "-=1.2", duration: 0.08, yoyo:true, repeat:3, ease:"sine.inOut" });
    }
  });

  // ground stains (unchanged)
  tl.add(() => {
    const r = TREE_RECTS[idx] || TREE_RECTS[0];
    if (!r || !leafCanvas) return;
    for (let i=0;i<2;i++){
      addGroundPatch(
        (r.x1+r.x2)/2 + rand(-40, 40),
        leafCanvas.height - GROUND_RISE_PX + rand(-2, 2),
        { w: rand(60,110), h: rand(24,42), a: rand(0.10,0.18) }
      );
    }
  }, "<+0.02");

  // 6) impact burst → TWIGS + dust (unchanged)
  tl.add(() => {
    if (!wrap.__burstImpact) {
      wrap.__burstImpact = true;
      const cImpact = Math.floor(rand(TWIG_CONFIG.burstImpact[0], TWIG_CONFIG.burstImpact[1] + 1));
      spawnTwigBurstAtTree(idx, cImpact);
      for (let i=0;i<3;i++) setTimeout(()=>spawnDustPuff(rect), i*90);
    }
  }, "<");

  // 7) fade out while it settles (unchanged)
  tl.to(kids, { opacity: 0, duration: TOPPLE.tFade, ease: "power1.in" }, "+=0.05");
  if (shadow) tl.to(shadow, { opacity: 0, duration: TOPPLE.tFade*0.9, ease: "power1.in" }, "<+0.05");
}

 


  function loop(){
    const nose = tractorNose();
    const band = forestBandX();

    if (nose != null && band){
      const margin = 40;
      armed = (nose >= band.min - margin) && (nose <= band.max + margin);

      if (armed){
        document.querySelectorAll("#forestReveal .tree-wrap").forEach(w=>{
          if (w.dataset.gone === "1") return;
          const base = w.querySelector(".tree, .tree-back");
          if (!base) return;
          const r  = base.getBoundingClientRect();
          const cx = r.left + r.width * 0.5;

          if (movingLeft){
            if (nose <= cx - PASS_PAD) cullTree(w);
          } else {
            if (nose >= cx + PASS_PAD) cullTree(w);
          }
        });
      }
    }
    requestAnimationFrame(loop);
  }
function resetAll(){
  const wraps = document.querySelectorAll("#forestReveal .tree-wrap");
  if (!wraps.length) return; // <-- add this

  wraps.forEach(w=>{
    w.dataset.gone = "0";
    w.__burstEarly = false;
    w.__burstImpact = false;
    const kids = w.querySelectorAll(".tree, .tree-back, .tree-stage");
    const sh   = w.querySelector(".shadow-oval");
    gsap.set(w,    { clearProps:"x,y,rotation,scale,skew,transform,pointerEvents" });
    gsap.set(kids, { clearProps:"opacity,filter,transform" });
    if (sh) gsap.set(sh, { clearProps:"opacity,transform" });
  });
  lastEdgeX = null; movingLeft = null; haveDirection = false; armed = false;
}


  loop();
  window.__uncullTrees__ = resetAll;
  window.addEventListener("forest-reset", resetAll);
})();


/* ---------- TRACTOR WASH (impulse to ground items near the tractor) ---------- */
const TRACTOR_WASH = {
  enabled: true,
  backOnly: true,      // ← only affect points behind the tractor
  backPad: 24,         // pixels behind the tractor center before we count it as “behind”
  liftVy: -1.0,        // was -2.2  → lower = less vertical pop
  pushVx: 0.9,         // was 1.6   → lower = less sideways shove
  radius: 110,         // was 140   → tighter influence zone
  rectPad: 10,         // was 12    → closer to the sprite
  maxBoostPerFrame: 0.55 // was 0.9 → softer impulses per frame
};
let __tractorPrevX = null;
let __tractorSpeed = 0; // 0..30-ish
let __tractorDirX  = 0; // -1 = moving left, +1 = moving right

function tractorRectInCanvas(){
  if (!leafCanvas) return null;
  const tractor = document.getElementById("tractor");
  if (!tractor) return null;

  const cb = leafCanvas.getBoundingClientRect();
  const tb = tractor.getBoundingClientRect();

  let x1 = tb.left  - cb.left - TRACTOR_WASH.rectPad;
  let y1 = tb.top   - cb.top  - TRACTOR_WASH.rectPad;
  let x2 = tb.right - cb.left + TRACTOR_WASH.rectPad;
  let y2 = tb.bottom- cb.top  + TRACTOR_WASH.rectPad;

  x1 = Math.max(-200, x1); y1 = Math.max(-200, y1);
  x2 = Math.min(leafCanvas.width + 200, x2);
  y2 = Math.min(leafCanvas.height + 200, y2);

  const cx = (x1 + x2) * 0.5;

  if (__tractorPrevX != null){
    const dx = cx - __tractorPrevX;
    __tractorSpeed = Math.max(0, Math.min(30, Math.abs(dx)));
    __tractorDirX  = Math.abs(dx) > 0.3 ? (dx > 0 ? +1 : -1) : __tractorDirX;
  }
  __tractorPrevX = cx;

  return { x1, y1, x2, y2, cx, cy:(y1+y2)*0.5, dirX: __tractorDirX };
}

/* ---------- SMOKE (bigger, softer, varied) ---------- */
const SMOKE = {
  enabled: true,
  master: 1,
  plumeCount: [2, 5],         // fewer puffs per burst
   startR: [8, 18],            // smaller circles
   grow: [0.04, 0.08],         // gentler growth
   fade: [0.003, 0.006],       // fade out faster
   blur: [1.2, 2.2],
  vyUp: [-1.4, -0.6],
  vxDrift: [-0.4, 0.4],
  curl: 0.03,
  colorLo: [110,110,110],
  colorHi: [180,180,180]
};

function randf(a,b){ return a + Math.random()*(b-a); }
function randi(a,b){ return Math.floor(randf(a,b+1)); }

function spawnSmokePlume(x, y, strength = 1){
  if (!leafCanvas || !SMOKE.enabled) return;

  const m = (SMOKE.master ?? 1);
  if (m <= 0.15) return;
const s = 0.8 * Math.max(0, Math.min(1, strength)) * (m * m);

  const n = randi(
    Math.max(4, Math.round(SMOKE.plumeCount[0] * s)),
    Math.max(6, Math.round(SMOKE.plumeCount[1] * s))
  );
  for (let i=0;i<n;i++){
    const t = Math.random();
    const r = [
      Math.round(SMOKE.colorLo[0] + (SMOKE.colorHi[0]-SMOKE.colorLo[0]) * t),
      Math.round(SMOKE.colorLo[1] + (SMOKE.colorHi[1]-SMOKE.colorLo[1]) * t),
      Math.round(SMOKE.colorLo[2] + (SMOKE.colorHi[2]-SMOKE.colorLo[2]) * t)
    ];
    addDust({
      smoke: true,
      x: x + randf(-6, 6),
      y: y + randf(-4, 2),
      r: randf(SMOKE.startR[0], SMOKE.startR[1]) * (0.7 + s*0.6),
      a: 0.10 + Math.random()*0.18,
      vx: randf(SMOKE.vxDrift[0], SMOKE.vxDrift[1]) + (WIND?.x || 0)*0.4,
      vy: randf(SMOKE.vyUp[0], SMOKE.vyUp[1]),
      grow: randf(SMOKE.grow[0], SMOKE.grow[1]),
      fade: randf(SMOKE.fade[0], SMOKE.fade[1]) * (1.0 + 3.0 * (1 - s)),
      blur: randf(SMOKE.blur[0], SMOKE.blur[1]),
      color: r,
      seed: Math.random()*Math.PI*2,
      life: 0,
      exhaust: false // set true if you want to tag tractor-only plumes
    });
  }
}



function applyTractorWashToPoint(pt, rect){
  // Early out if we only want the back and we know the travel direction
  if (TRACTOR_WASH.backOnly && rect && rect.dirX){
    const rel = pt.x - rect.cx;                 // + = right of center, - = left of center
    const isBehind = rect.dirX > 0
      ? (rel < -TRACTOR_WASH.backPad)           // moving right → behind is to the left
      : (rel >  TRACTOR_WASH.backPad);          // moving left  → behind is to the right
    if (!isBehind) return;
  }

  // Distance to the expanded footprint
  const rx = Math.max(rect.x1, Math.min(pt.x, rect.x2));
  const ry = Math.max(rect.y1, Math.min(pt.y, rect.y2));
  const dx = pt.x - rx;
  const dy = pt.y - ry;
  const d  = Math.hypot(dx, dy);

  const R = TRACTOR_WASH.radius;
  if (d > R) return;

  // Softer, smoother falloff + speed scaling
  const t = 1 - (d / R);                          // 0..1
  const speedMul = 0.25 + 0.75*(__tractorSpeed / 30);
  const boost = Math.min(TRACTOR_WASH.maxBoostPerFrame, t * t * speedMul); // quadratic falloff

  // Outward push from center, reduced lift
  const side = Math.sign((pt.x - rect.cx) || 1);
  pt.vx += (TRACTOR_WASH.pushVx * side) * boost * (0.85 + Math.random()*0.3);
  pt.vy += (TRACTOR_WASH.liftVy)        * boost * (0.85 + Math.random()*0.3);

  if ("air" in pt) pt.air = true;
  if ("rVel" in pt) pt.rVel += (Math.random()-0.5) * 0.06 * boost;

  // smokier ground plume proportional to the local boost
const m = (SMOKE.master ?? 1);
if (m > 0.02 && Math.random() < 0.12 * boost * m){
  const baseY = leafCanvas.height - GROUND_RISE_PX - 4;
  spawnSmokePlume(pt.x, baseY, Math.min(1.0, (boost * 2.2) * m));
}

}

/* ---------- BACKGROUND SKY (expose sun center via CSS vars) ---------- */
(function BackgroundSky() {
  let built = false,
    wrap,
    sky,
    sunWrap,
    sunCore,
    sunHalo,
    horizonGlow;

  function css() {
    if (document.getElementById("bgsky-style")) return;
    const el = document.createElement("style");
    el.id = "bgsky-style";
    el.textContent = `
#bg{
  --sunX:50%; --sunY:20%;
  --sunXpx:50%; --sunYpx:20%;
  --sunBiasXpx:0px;  /* tweak left/right if needed */
  --sunBiasYpx:8px;  /* nudge rays slightly down to match the drawn core */
}#bg #bgSky{position:fixed;inset:0;pointer-events:none;z-index:1}

      #bgSky .sky{position:fixed;inset:0;transition:background 0.08s linear}

      .sunWrap{
        position:fixed; left:50%; top:0;
        width:32vmin; height:32vmin; transform:translate(-50%,-40%);
        pointer-events:none; filter:saturate(1.1);
      }
      .sunCore{
        position:absolute; inset:0; border-radius:50%;
        background: radial-gradient(circle at 50% 50%,
          rgba(255,230,170,1) 0%,
          rgba(255,200,120,0.95) 40%,
          rgba(255,150,70,0.55) 68%,
          rgba(255,140,60,0.00) 82%);
        filter: blur(2px); opacity:.95;
      }
      .sunHalo{
        position:absolute; inset:-18%; border-radius:50%;
        background: radial-gradient(circle,
          rgba(255,190,120,0.55) 0%,
          rgba(255,170,90,0.35) 28%,
          rgba(255,160,80,0.15) 56%,
          rgba(255,160,80,0.00) 80%);
        filter: blur(12px); opacity:.9; mix-blend-mode:screen;
      }
      .horizonGlow{
        position:fixed; inset:0; pointer-events:none;
        background: radial-gradient(120% 70% at 50% 96%,
          rgba(255,200,120,.72), rgba(255,160,80,.42) 28%,
          rgba(255,140,60,.18) 46%, rgba(0,0,0,0) 70%);
        opacity:0; transition:opacity .14s linear; mix-blend-mode:screen;
      }
    `;
    document.head.appendChild(el);
  }

  function build() {
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg) return;
    css();
    wrap = document.createElement("div");
    wrap.id = "bgSky";
    wrap.innerHTML = `
      <div class="sky"></div>
      <div class="sunWrap"><div class="sunHalo"></div><div class="sunCore"></div></div>
      <div class="horizonGlow"></div>`;
    bg.appendChild(wrap);
    sky = wrap.querySelector(".sky");
    sunWrap = wrap.querySelector(".sunWrap");
    sunCore = wrap.querySelector(".sunCore");
    sunHalo = wrap.querySelector(".sunHalo");
    horizonGlow = wrap.querySelector(".horizonGlow");
    built = true;
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  function mixHex(a, b, m) {
    const ah = parseInt(a.slice(1), 16),
      bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 255,
      ag = (ah >> 8) & 255,
      ab = ah & 255;
    const br = (bh >> 16) & 255,
      bg = (bh >> 8) & 255,
      bb = bh & 255;
    return `rgb(${Math.round(lerp(ar, br, m))},${Math.round(
      lerp(ag, bg, m)
    )},${Math.round(lerp(ab, bb, m))})`;
  }

  function update(p) {
    build();
    if (!sky || !sunWrap) return;

    const seg = p < 1 / 3 ? 0 : p < 2 / 3 ? 1 : 2;
    const t = p * 3 - seg;

    // sky gradient
    const top = mixHex("#ffb56b", "#6f7f92", seg === 0 ? 0 : seg === 1 ? Math.min(0.7, t * 0.7) : 1.0);
    const bot = mixHex("#ffd9a0", "#2b3644", seg === 0 ? 0 : seg === 1 ? Math.min(0.7, t * 0.7) : 1.0);
    sky.style.background = `linear-gradient(${top}, ${bot})`;

    // sun path
    const sunT = clamp01(p * 1.5);
    const yPct = lerp(-40, 62, sunT);
    const scale = lerp(1.0, 1.14, Math.pow(1 - sunT, 0.8));
    sunWrap.style.transform = `translate(-50%, ${yPct}%) scale(${scale})`;

    // expose CSS vars for other layers to lock to the sun center
// expose CSS vars for other layers to lock to the sun center
const bg = document.getElementById("bg");
if (bg) {
  // keep the % vars for anyone using them
  bg.style.setProperty("--sunX", "50%");
  bg.style.setProperty("--sunY", `${yPct + 16}%`);

  // use the bright disc as the perceived center
  const r = sunCore.getBoundingClientRect();
  const cx = r.left + r.width  * 0.5;
  const cy = r.top  + r.height * 0.5;

  // small hand-tune without touching JS again
  const cs = getComputedStyle(bg);
  const bx = parseFloat(cs.getPropertyValue("--sunBiasXpx")) || 0;
  const by = parseFloat(cs.getPropertyValue("--sunBiasYpx")) || 0;

  bg.style.setProperty("--sunXpx", `${Math.round(cx + bx)}px`);
  bg.style.setProperty("--sunYpx", `${Math.round(cy + by)}px`);
}


    // visibility
    const sunVis =
      seg === 0 ? 1 : seg === 1 ? Math.max(0, 1 - t * 0.9) : Math.max(0, 0.1 - t * 0.1);
    sunCore.style.opacity = (0.95 * sunVis).toFixed(3);
    sunHalo.style.opacity = (0.9 * sunVis).toFixed(3);

    const glowIn = seg === 0 ? 1 : Math.max(0, 1 - t * 1.2);
    horizonGlow.style.opacity = (0.95 * glowIn).toFixed(3);
  }

  window.__sky__ = { build, update };
})();

/* ---------- DISTANT SILHOUETTES (dissolve + blur) ---------- */
(function BackgroundSil() {
  let built = false,
    near,
    far;
  function build() {
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg) return;
    const el = document.createElement("div");
    el.id = "bgSil";
    el.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:1;";
    el.innerHTML = `
      <img class="far"  src=""  style="position:fixed;bottom:18%;left:-5%;width:110%;opacity:.6;filter:blur(0px);">
      <img class="near" src="" style="position:fixed;bottom:10%;left:-5%;width:110%;opacity:.8;filter:blur(0px);">`;
    bg.appendChild(el);
    far = el.querySelector(".far");
    near = el.querySelector(".near");
    built = true;
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function update(p) {
    build();
    if (!near || !far) return;
    far.style.opacity = String(clamp01(0.7 - p * 0.5));
    near.style.opacity = String(clamp01(0.85 - p * 0.35));
    far.style.filter = `blur(${(p * 3).toFixed(2)}px)`;
    near.style.filter = `blur(${(p * 1.8).toFixed(2)}px)`;
    near.style.transform = `translateY(${p * 6}px)`;
    far.style.transform = `translateY(${p * 4}px)`;
  }
  window.__sil__ = { build, update };
})();

/* ---------- GOD-RAYS (locked to sun) → SMOG (realistic) ---------- */
(function RaysToSmog() {
  let built = false, wrap, rays, raysPulse, smog, lastProg = 0, rot = 0, raf;

  function css(){
    if (document.getElementById("bgrays-style")) return;
    const s = document.createElement("style");
    s.id = "bgrays-style";
    s.textContent = `
  #bg #bgRays{ position:fixed; inset:0; pointer-events:none; z-index:7;
    --rayOverscanX: 12vw;  /* must match the negative inset below */
    --rayOverscanY: 12vh;
  }

  #bgRays .rays, #bgRays .raysPulse{
    position:fixed; inset:-12% -12%; /* overscan so edges never show */
    mix-blend-mode:screen; opacity:0;
    will-change:transform, opacity, filter, background, -webkit-mask-image, mask-image;
    filter: saturate(1.05) contrast(1.04) blur(0.8px);
    transform-origin:
      calc(var(--sunXpx, 50%) + var(--rayOverscanX))
      calc(var(--sunYpx, 20%) + var(--rayOverscanY));
  }
  #bgRays .raysPulse{ filter: saturate(1.08) contrast(1.06) blur(1.1px); }

  #bgRays .rays, #bgRays .raysPulse{
    -webkit-mask-image:
      linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,1) 100%),
      radial-gradient(120vmax 120vmax at
        calc(var(--sunXpx,50%) + var(--rayOverscanX))
        calc(var(--sunYpx,20%) + var(--rayOverscanY)),
        rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%);
    -webkit-mask-composite: source-in;
            mask-image:
      linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,1) 100%),
      radial-gradient(120vmax 120vmax at
        calc(var(--sunXpx,50%) + var(--rayOverscanX))
        calc(var(--sunYpx,20%) + var(--rayOverscanY)),
        rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%);
    mask-composite: intersect;
  }

 #bgRays .smog{
  position:fixed; inset:0; pointer-events:none;
  opacity:0;
  filter: blur(1.2px);
  background:
    radial-gradient(120% 85% at 50% 95%,
      rgba(70,70,70,0.00) 0%,
      rgba(70,70,70,0.15) 45%,
      rgba(60,60,60,0.35) 80%);
}

`;

    document.head.appendChild(s);
  }

 function rayBackground(){
  const at = `calc(var(--sunXpx,50%) + var(--rayOverscanX)) calc(var(--sunYpx,20%) + var(--rayOverscanY))`;
  return `
    repeating-conic-gradient(from 0deg at ${at},
      rgba(255,235,190,0.22) 0deg 4.5deg, rgba(255,235,190,0.00) 4.5deg 14deg),
    repeating-conic-gradient(from 0.8deg at ${at},
      rgba(255,220,160,0.10) 0deg 2.2deg, rgba(255,220,160,0.00) 2.2deg 8.5deg),
    radial-gradient(85vmax 85vmax at ${at},
      rgba(255,200,140,0.16) 0%, rgba(255,200,140,0.00) 60%)`;
}
function rayBackgroundPulse(){
  const at = `calc(var(--sunXpx,50%) + var(--rayOverscanX)) calc(var(--sunYpx,20%) + var(--rayOverscanY))`;
  return `
    repeating-conic-gradient(from 0deg at ${at},
      rgba(255,215,150,0.16) 0deg 2deg, rgba(255,215,150,0.00) 2deg 9deg),
    radial-gradient(90vmax 90vmax at ${at},
      rgba(255,190,120,0.18) 0%, rgba(255,190,120,0.00) 60%)`;
}


  function build(){
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg) return;
    css();

    wrap = document.createElement("div");
    wrap.id = "bgRays";
    wrap.innerHTML = `<div class="rays"></div><div class="raysPulse"></div><div class="smog"></div>`;
    bg.appendChild(wrap);

    rays      = wrap.querySelector(".rays");
    raysPulse = wrap.querySelector(".raysPulse");
    smog      = wrap.querySelector(".smog");

    // set backgrounds once (they follow the CSS vars as they change)
    rays.style.background      = rayBackground();
    raysPulse.style.background = rayBackgroundPulse();

    tick();
    built = true;
  }

  function tick(){
    // subtle rotation; slows toward the end so bands don’t swim too much
    const still = Math.max(0, 1 - Math.max(0, lastProg - 0.8) / 0.2);
    rot += 0.04 * still;
    if (rays) {
      const xShift = lastProg * 5, yShift = lastProg * 8; // gentle parallax drift
      const base   = `translate(${xShift}px, ${yShift}px)`;
      rays.style.transform      = `${base} rotate(${rot}deg)`;
      raysPulse.style.transform = `${base} rotate(${rot*0.6}deg)`;
    }
    raf = requestAnimationFrame(tick);
  }

  function update(p){
    build(); if (!rays || !smog) return;
    lastProg = p;

    // segments: 0 warm, 1 fading, 2 gone → smog
    const seg = p < 1/3 ? 0 : p < 2/3 ? 1 : 2;
    const t   = (p*3 - seg); // 0..1 inside segment

    // ---- ray visibility (monotonic fade: once gone, they never come back) ----
// drop goes 0→1 across the *second third* of the scroll (Mid1), then stays at 1.
const drop = clamp(0, (p - 1/3) / (1/3), 1); // uses your global clamp(min,v,max)

// main sheet + pulse both fade to 0 by the end of Mid1
const raysIn  = 1 - drop;        // 1 → 0, then stays 0 in Mid2
const pulseIn = 0.9 * (1 - drop);

rays.style.opacity      = (0.32 * raysIn).toFixed(3);
raysPulse.style.opacity = (0.26 * pulseIn).toFixed(3);

   // smog rises only in segment 2
    const smogIn = seg < 2 ? 0 : t;
    smog.style.opacity  = (0.14 + 0.36*smogIn).toFixed(3);
    smog.style.transform = `translateY(${(p * 18).toFixed(2)}px)`;
  }

  // public API
  window.__rays__ = { build, update };
})();

 

/* ---------- BACKGROUND GRADING (tint + vignette + HUE) ---------- */
(function BackgroundGrade(){
  let built = false;

  function injectStyle(){
    if (document.getElementById("bggrade-style")) return;
    const css = `
      #bg #bgGrade{ position: fixed; inset: 0; pointer-events:none; z-index: 2; }
      #bgGrade .tint{
        position: fixed; inset: 0;
        background: #000; opacity: 0; will-change: opacity, background-color;
      }
      #bgGrade .vignette{
  position: fixed; inset: 0;
/* softer / disabled vignette */
  background: radial-gradient(ellipse at 50% 55%,
    rgba(0,0,0,0) 40%, rgba(0,0,0,0.20) 100%);
  opacity: 0;                    /* <- keep at 0 to remove vignette */
  mix-blend-mode: normal;
  will-change: opacity;
}
#bgGrade .hue{
  position: fixed; inset: 0;
/* push to cooler blue */
  background: rgb(80,120,180);
  opacity: 0;                    /* will be driven in update() */
  mix-blend-mode: color;
  will-change: opacity, background-color;
}
    `;
    const el = document.createElement("style");
    el.id = "bggrade-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function build(){
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg){ console.warn("[Grade] #bg not found."); return; }

    injectStyle();

    const wrap = document.createElement("div");
    wrap.id = "bgGrade";
    wrap.innerHTML = `
      <div class="tint"></div>
      <div class="hue"></div>
      <div class="vignette"></div>
    `;
    bg.appendChild(wrap);
    built = true;
  }

  function segInfo(p){
    const s = Math.max(0, Math.min(0.9999, p)) * 3;
    const seg = Math.floor(s);   // 0: full, 1: mid1->mid2, 2: mid2->bare
    const t   = s - seg;         // 0..1 inside segment
    return { seg, t };
  }

  const L = (a,b,t)=>a+(b-a)*t;

function update(p){
  build();
  const { seg, t } = segInfo(p);
  const tint = document.querySelector("#bgGrade .tint");
  const hue  = document.querySelector("#bgGrade .hue");
  const vig  = document.querySelector("#bgGrade .vignette");
  if (!tint || !vig || !hue) return;

  // ---------- COLOR PRESET: Deep cold blue like the reference ----------
  // Neutral "dark base" behind everything (very subtle)
  // If you want deeper, lower the numbers or raise tintOp below slightly.
  let r = 16, g = 24, b = 32;                       // deep cold base
  let hueColor = `rgb(70, 115, 160)`;               // bluish overlay (teal-ish)

  // ---------- Opacity dials ----------
  // We keep vignette OFF (0). The blue comes from the HUE layer.
  let tintOp = 0;   // neutral dark tint strength (keep low to avoid grey)
  let hueOp  = 0;   // blue strength
  let vigOp  = 0;   // vignette disabled

  // Ease helper for nice ramps
  const clamp01 = (x)=>Math.max(0, Math.min(1, x));
  const smooth = (x)=>x*x*(3-2*x);                  // smoothstep (0..1)

  // We map the three construction segments to a blue ramp,
  // keeping "tint" small so the blue isn't muddied to grey.
  if (seg === 0){
    // Full → mid1 (early construction): very subtle wash
    const tt = smooth(t);
    hueOp  = 0.18 * tt;
    tintOp = 0.05 * tt;                              // tiny depth, avoid greying
  } else if (seg === 1){
    // mid1 → mid2: strengthen blue, keep tint modest
    const tt = smooth(t);
    hueOp  = 0.18 + 0.14 * tt;                       // 0.18 → 0.32
    tintOp = 0.05 + 0.06 * tt;                       // 0.05 → 0.11
  } else {
    // mid2 → bare: strongest blue, tint still controlled
    const tt = smooth(t);
    hueOp  = 0.32 + 0.10 * tt;                       // 0.32 → 0.42
    tintOp = 0.11 + 0.05 * tt;                       // 0.11 → 0.16
  }

  // Safety clamps
  hueOp  = clamp01(hueOp);
  tintOp = clamp01(tintOp);
  vigOp  = 0;                                        // force vignette OFF

  // Apply
  tint.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  tint.style.opacity = tintOp.toFixed(3);

  hue.style.backgroundColor = hueColor;
  hue.style.opacity = hueOp.toFixed(3);

  vig.style.opacity = vigOp.toFixed(3);
}


  window.__grade__ = { build, update };
})();

/* ---------- PARALLAX PER-LAYER GRADING (filters on far/mid/near) ---------- */
(function ParallaxGrade(){
  const SEL = {
    far:  [".bg-layer--far", ".parallax-far",  "#bg .far"],
    mid:  [".bg-layer--mid", ".parallax-mid",  "#bg .mid"],
    near: [".bg-layer--near",".parallax-near", "#bg .near"]
  };
  function pick(list){ for (const s of list){ const el=document.querySelector(s); if (el) return el; } return null; }
  let far=null, mid=null, near=null, built=false;
  function build(){ if (built) return; far=pick(SEL.far); mid=pick(SEL.mid); near=pick(SEL.near); built=true; }
  const clamp01=(x)=>Math.max(0,Math.min(1,x)), L=(a,b,t)=>a+(b-a)*t;
  function update(p){
    build(); if(!far && !mid && !near) return;
    const seg = p<1/3?0:p<2/3?1:2; const t=(p*3 - seg);

    const warmBoost = seg===0 ? 1 : seg===1 ? Math.max(0, 1 - t*1.2) : 0;
    const coldBoost = seg<2 ? 0 : t;

    const hueWarm = -12 * warmBoost;
    const sat     = L(1.15*warmBoost + 1.0*(1-warmBoost), 0.70, coldBoost);
    const brightF = L(1.04, 0.82, coldBoost);
    const cont    = L(1.0, 1.06, coldBoost);

    const f = (k)=>`hue-rotate(${hueWarm}deg) saturate(${(sat*k).toFixed(3)}) brightness(${(brightF/k).toFixed(3)}) contrast(${cont.toFixed(3)}) blur(${(2.5*coldBoost/k).toFixed(2)}px)`;

  if (far)  far.style.filter  = f(1.25);
if (mid)  mid.style.filter  = f(1.0);

if (near){
  if (seg === 2){
    // extra grimness on near layer in Bare
    const darker = `grayscale(${(0.25 + 0.35*t).toFixed(3)}) brightness(${(0.78 - 0.10*t).toFixed(3)}) contrast(${(1.10 + 0.12*t).toFixed(3)})`;
    near.style.filter = `${f(0.85)} ${darker}`;
    // Optional extra depth (fade a bit under the haze):
    // near.style.opacity = (1.0 - 0.18 - 0.22*t).toFixed(3);
  } else {
    near.style.filter = f(0.85);
    // near.style.opacity = "1";
  }
}


  }
  window.__pgrade__ = { build, update };
})();

/* ---------- DEPTH OF FIELD on parallax layers ---------- */
(function DoF(){
  const SEL = {
    far:  [".bg-layer--far", ".parallax-far",  "#bg .far"],
    mid:  [".bg-layer--mid", ".parallax-mid",  "#bg .mid"],
    near: [".bg-layer--near",".parallax-near", "#bg .near"]
  };
  function pick(selList){ for (const s of selList){ const el=document.querySelector(s); if (el) return el; } return null; }
  let far=null, mid=null, near=null, built=false;
  function build(){
    if (built) return;
    far = pick(SEL.far); mid = pick(SEL.mid); near = pick(SEL.near);
    built = true;
  }
  function update(p){
    build();
    if (!far && !mid && !near) return;
    const seg = p<1/3?0:p<2/3?1:2; const t=(p*3 - seg);
    const k = seg===2 ? (0.4 + 0.6*t) : seg===1 ? 0.25*t : 0;
    if (far)  far.style.filter  = `blur(${(k*4).toFixed(2)}px) saturate(${(1 - k*0.25).toFixed(3)})`;
    if (mid)  mid.style.filter  = `blur(${(k*2.4).toFixed(2)}px) saturate(${(1 - k*0.18).toFixed(3)})`;
    if (near) near.style.filter = `blur(${(k*1.3).toFixed(2)}px) saturate(${(1 - k*0.10).toFixed(3)})`;
  }
  window.__dof__ = { build, update };
})();

/* ---------- WIND GUSTS (push leaves; flex trees) ---------- */
(function Wind(){
  let running = false;
  function nextGust(){
    const wait = 4000 + Math.random()*5000;
    setTimeout(() => {
      const s = segFromProgress(window.__currentProgress || 0);
      const amp = (s === 0) ? 0.15 : (s === 1) ? 0.45 : 0.0; // dead air in seg2
      gsap.to(WIND, {
        x: amp,
        duration: 0.9,
        ease: "sine.out",
        yoyo: true,
        repeat: 1,
        onStart(){
          if (amp>0){
            gsap.to(".tree, .tree-back", {
              rotation: "+=0.5",
              duration: 0.9,
              ease: "sine.inOut",
              yoyo: true,
              repeat: 1
            });
          }
        },
        onComplete(){
          WIND.x = 0;
          nextGust();
        }
      });
    }, wait);
  }
  function start(){ if (running) return; running = true; nextGust(); }
  window.__wind__ = { start };
})();
// ✅ Mic → leaves response (strength is 0..1)
window.__leavesMicResponse__ = function(strength = 0){
  const refs = window.__leafRefs__;
  if (!refs) return;

  const { settled = [], falling = [] } = refs;
  window.__leafRefs__ = { settled, falling };

  // Direction: use current wind sign if available; default to +1
  const dir  = Math.sign((window.__WIND__ && window.__WIND__.x) || 1) || 1;

  // Tunables — tweak to taste
  const IMP  = 2.4 * strength;  // lateral impulse
  const LIFT = 0.55 * strength; // upward kick
  const SPIN = 0.14 * strength; // rotational nudge

  // Hit EVERY settled leaf (wake them back into air)
  for (let i = 0; i < settled.length; i++){
    const p = settled[i];
    if (!p) continue;
    p.vx   += (0.4 + Math.random()*0.9) * IMP * dir;
    p.vy   -= LIFT * (0.6 + Math.random()*0.7);
    p.rVel += (Math.random() - 0.5) * SPIN;
    p.air   = true; // mark as airborne so your physics updates it
  }

  // Also push EVERY falling leaf
  for (let i = 0; i < falling.length; i++){
    const p = falling[i];
    if (!p) continue;
    p.vx   += (0.25 + Math.random()*0.6) * IMP * dir;
    p.rVel += (Math.random() - 0.5) * SPIN * 0.7;
  }
};

/* ---------- contact shadow animation ---------- */
function updateShadows(p){
  if (typeof updateShadows !== "function") {
  var updateShadows = function(){};
}

  const seg = segIndex(p);
  const t   = easeInOut(clamp(0, segT(p), 1));
  const stillness = p>0.85 ? (p-0.85)/0.15 : 0;
  document.querySelectorAll("#forestReveal .tree-wrap .shadow-oval").forEach(el=>{
    let op = 0.22, scaleY = 1.0;
    if (seg===1){ op = 0.22 + 0.10*t; scaleY = 1.0 + 0.06*t; }
    if (seg===2){ op = 0.32 + 0.20*t + 0.15*stillness; scaleY = 1.06 + 0.12*t; }
    el.style.opacity = op.toFixed(3);
    el.style.transform = `translateX(-50%) scale(1, ${scaleY.toFixed(3)})`;
  });
}

/* ---------- keep FX on top of parallax (but under trees) ---------- */
function bringToFront(el){ if(el && el.parentNode){ el.parentNode.appendChild(el); } }
window.__lastTrSmoke = 0;
/* ---------- pinned scroll control (forest + tractor tail) ---------- */
ScrollTrigger.create({
  trigger: "#forestReveal",
  start: "bottom bottom",
  end: "+=" + (SCROLL_LEN + EXTRA_TAIL_PX),  // add runway after the forest
  pin: true,
  pinSpacing: true,
  scrub: true,

  onUpdate(self){
       ensureTreesVisibleOnce(); 
    // p = 0..1 across the whole pinned range (forest + tail)
    const p = self.progress;

    // forestP = 0..1 only over the FOREST portion, then clamped (freezes at bare)
    const forestP = Math.min(p / FOREST_PORTION, 1);

    
    // expose for any other code that reads it
    
window.__currentProgress = forestP;
if (window.__rain) window.__rain.update(forestP);

if (window.__clouds)  window.__clouds.setStageProgress(forestP); 

    // --- add this block just after you compute forestP ---
window.__enteredForestOnce__ ??= true;  // init
if (forestP < 1) {
  if (!window.__enteredForestOnce__) {
    // we just re-entered the forest from the tail → restore trees
    if (window.__uncullTrees__) window.__uncullTrees__();
    window.__enteredForestOnce__ = true;
  }
} else {
  // we're in the tail
  window.__enteredForestOnce__ = false;
}

    // --- FOREST SYSTEMS (drive with forestP only) ---
    if (breathingOn && forestP > 0.001){
      pauseBreathing();
      breathingOn = false;
    }

    // trees + ground phases should use forestP (not total p)
    setStageProgress(forestP);
    setGroundProgress(forestP);

    // only spawn/update leaves while the forest is still evolving
    if (forestP < 1){
      updateLeavesForProgress(forestP);
    }

    // background stacks freeze once forestP hits 1 (bare look locked in)
    if (window.__sky__)     window.__sky__.update(forestP);
    if (window.__sil__)     window.__sil__.update(forestP);
    if (window.__rays__)    window.__rays__.update(forestP);
    if (window.__fog__)     window.__fog__.update(forestP);
    if (window.__grade__)   window.__grade__.update(forestP);
    if (window.__dof__)     window.__dof__.update(forestP);
    if (window.__pgrade__)  window.__pgrade__.update(forestP);
    if (window.__rainbow__) window.__rainbow__.update(forestP);
    if (window.__fliers__)  window.__fliers__.update(forestP);
    if (window.__stars__)   window.__stars__.update(forestP);

    // --- TRACTOR TAIL (0..1 only inside the tail) ---
    // tailT = 0 while in forest; grows 0→1 only after forest is done
    const tailT = Math.max(0, Math.min(1, (p - FOREST_PORTION) / (1 - FOREST_PORTION)));
if (tailT > 0 && tailT < 1){
  lockTailLayers(true);
} else {
  lockTailLayers(false);
}


// Tractor exhaust: whenever tractor is visible in tail (speed influences strength, not on/off)
{
  const tr = tractorRectInCanvas();
  const tractorVisible = !!tr; // you already return null if opacity ~0

  if (tractorVisible && leafCanvas) {
    const now = performance.now();

    // Cadence: steady baseline, quickens with speed
    const speed = Math.max(0, __tractorSpeed || 0);
    const gap   = 80 - 40 * Math.min(1, speed / 10); // 80ms → 40ms at speed

    if (!window.__lastTrSmoke || now - window.__lastTrSmoke > gap) {
      const baseY    = leafCanvas.height - GROUND_RISE_PX - 4;
      const backX    = tr.cx - (tr.dirX || 1) * 42;
      // Strength: never zero, scale with speed
      const strength = Math.min(1, 0.25 + 0.75 * Math.min(1, speed / 12));

   emitTractorExhaust({ cx: tr.cx, cy: baseY, dirX: tr.dirX || 1 });
      window.__lastTrSmoke = now;
    }
  }
}

    if (window.__tractor__ && typeof window.__tractor__.updateTail === "function"){
      window.__tractor__.updateTail(tailT);
    }

    if (window.__city__ && typeof window.__city__.updateTail === "function"){
  window.__city__.updateTail(tailT);
}
  // --- Ground STAGE 4 during the city reveal ---
(function setGroundTail() {
  // Match City.revealMap(k): start a bit into the tail, finish ~70% through
  const start = 0.08, end = 0.70;
  const cityK = clamp(0, (tailT - start) / (end - start), 1); // 0..1 as city appears

  const g3 = document.querySelector('#ground .stage3');
  const g4 = document.querySelector('#ground .stage4');

  // If stage4 doesn’t exist yet, do nothing (fails safe)
  if (!g4) return;

  // While forest is still progressing, keep stage4 hidden
  const forestP = Math.min(self.progress / FOREST_PORTION, 1);
  if (forestP < 1) {
    if (g4) g4.style.opacity = "0";
    return;
  }

  // Fade stage3 → stage4 as city appears
  if (g3) g3.style.opacity = (1 - cityK).toFixed(3);
  g4.style.opacity = cityK.toFixed(3);
})();

// --- TAIL DOOM & SMOKE FADE ---
// --- TAIL DOOM & SMOKE FADE (TAIL-ONLY) ---
const doom = Math.pow(tailT, 1.0);
window.__tailDoom = doom;

// fog/smoke should ONLY start fading once the tractor tail is underway
const fadeStartTail = 0.28;   // when tractor is already on-screen
const fadeEndTail   = 0.70;   // fully cleared late in tail
const kTail = clamp(0, (tailT - fadeStartTail) / (fadeEndTail - fadeStartTail), 1);

// no forest-phase clearing at all:
const clearK = kTail;                // ← **TAIL ONLY**
window.__airClear__ = clearK;        // 0..1 used by BackgroundFog.update

// particle smoke follow the same factor (square for faster visual drop)
SMOKE.master = Math.max(SMOKE.master ?? 0, 0.18 + 0.82 * (1 - (clearK * clearK)));

// hard stop any lingering smoke once basically gone
if (SMOKE.master <= 0.01) {
  dust = dust.filter(d => !d.smoke);
}

// keep your tail grading and fog boost, but scale by remaining haze if you like
if (window.__tailgrade__) window.__tailgrade__.update(doom * (1 - clearK));
if (window.__fog__?.boostTail) window.__fog__.boostTail(doom * (1 - clearK));

// (leave your tree darkening the same)
const treeDark = 1 - 0.26*doom;
const treeSat  = 1 - 0.35*doom;
const treeCon  = 1 + 0.12*doom;
gsap.set(".tree, .tree-back, .tree-stage", {
  filter: `brightness(${treeDark}) saturate(${treeSat}) contrast(${treeCon})`
});



// nudge background systems darker/heavier in tail
if (window.__tailgrade__) window.__tailgrade__.update(doom);
if (window.__fog__?.boostTail) window.__fog__.boostTail(doom);

// add a little ambient smoke in the tail (not only from the tractor)


    // --- local helper kept here to avoid changing your global function list ---
    function setGroundProgress(pct){
      const seg = (pct < 1/3) ? 0 : (pct < 2/3 ? 1 : 2);
      const t   = (pct < 1/3) ? (pct/(1/3))
                : (pct < 2/3) ? ((pct-1/3)/(1/3))
                : ((pct-2/3)/(1/3));

      const g0 = document.querySelector('#ground .stage0');
      const g1 = document.querySelector('#ground .stage1');
      const g2 = document.querySelector('#ground .stage2');
      const g3 = document.querySelector('#ground .stage3');
      if (!g0) return;

      if (seg === 0){
        g0.style.opacity = 1 - t; g1.style.opacity = t;     g2.style.opacity = 0;     g3.style.opacity = 0;
      } else if (seg === 1){
        g0.style.opacity = 0;     g1.style.opacity = 1 - t; g2.style.opacity = t;     g3.style.opacity = 0;
      } else {
        g0.style.opacity = 0;     g1.style.opacity = 0;     g2.style.opacity = 1 - t; g3.style.opacity = t;
      }
    }
  },

   onLeave() {
  lockTailLayers(false);
},
onLeaveBack() {
  // always unlock tail when scrolling back above
  lockTailLayers(false);
    // reset forest to start
    setStageProgress(0);
    if (!breathingOn){ resumeBreathing(); breathingOn = true; }

    if (window.__sky__)     window.__sky__.update(0);
    if (window.__sil__)     window.__sil__.update(0);
    if (window.__rays__)    window.__rays__.update(0);
    if (window.__fog__)     window.__fog__.update(0);
    if (window.__grade__)   window.__grade__.update(0);
    if (window.__dof__)     window.__dof__.update(0);
    if (window.__pgrade__)  window.__pgrade__.update(0);
    if (window.__rainbow__) window.__rainbow__.update(0);
    if (window.__fliers__)  window.__fliers__.update(0);
if (window.__stars__)   window.__stars__.update(0); 
    // hide tractor if rewinding into forest
    if (window.__tractor__ && typeof window.__tractor__.updateTail === "function"){
      window.__tractor__.updateTail(0);
    }

     window.dispatchEvent(new Event("forest-reset"));

  },

  onRefresh: () => {
    cacheTreeRects();
    sizeLeafCanvas();


    // rebuild once; then sync visuals to current forest progress
    if (window.__city__) { window.__city__.build(); }

    if (window.__sky__)     { window.__sky__.build();     window.__sky__.update(window.__currentProgress || 0); }
    if (window.__sil__)      window.__sil__.build();
    if (window.__rays__)     window.__rays__.build();
    if (window.__fog__)      window.__fog__.build();
    if (window.__grade__)    window.__grade__.build();
    if (window.__dof__)      window.__dof__.build();
    if (window.__pgrade__)  { window.__pgrade__.build();  window.__pgrade__.update(0); }
    if (window.__rainbow__)  window.__rainbow__.build();
    if (window.__fliers__)   window.__fliers__.build();
 if (window.__stars__)   { window.__stars__.build();   window.__stars__.update(window.__currentProgress || 0); }
    const bg = document.getElementById("bg");
    if (bg){
      bringToFront(document.getElementById("bgSky"));   // z:1
      bringToFront(document.getElementById("bgSil"));   // z:1 (near silhouettes)
      bringToFront(document.getElementById("bgGrade")); // z:2 (tint/vignette)
      bringToFront(document.getElementById("bgCity"));
        bringToFront(document.getElementById("bgStars")); 
      bringToFront(document.getElementById("bgFog"));   // z:6 (fog layers)
      bringToFront(document.getElementById("bgRays"));  // z:7 (smog = top)
    }
    // keep stage4 hidden unless we’re in the tail reveal
const g4 = document.querySelector('#ground .stage4');
if (g4) g4.style.opacity = "0";

  }
  
});
(function TailGrade(){
  let built=false, wrap, tint, vig, hue;
  function css(){
    if (document.getElementById("tailgrade-style")) return;
    const s = document.createElement("style");
    s.id="tailgrade-style";
    s.textContent = `
      #bg #bgTailGrade{position:fixed;inset:0;pointer-events:none;z-index:3}
      #bgTailGrade .tint{position:fixed;inset:0;background:#0a0f16;opacity:0}
      #bgTailGrade .hue{ position:fixed;inset:0;background:#415269;mix-blend-mode:color;opacity:0 }
      #bgTailGrade .vig{ position:fixed;inset:0;
        background: radial-gradient(120% 90% at 50% 55%,
          rgba(0,0,0,0) 35%, rgba(0,0,0,0.85) 100%);
        opacity:0
      }`;
    document.head.appendChild(s);
  }
  function build(){
    if (built) return;
    const bg = document.getElementById("bg"); if(!bg) return;
    css();
    wrap = document.createElement("div");
    wrap.id="bgTailGrade";
    wrap.innerHTML = `<div class="tint"></div><div class="hue"></div><div class="vig"></div>`;
    bg.appendChild(wrap);
    tint = wrap.querySelector(".tint");
    hue  = wrap.querySelector(".hue");
    vig  = wrap.querySelector(".vig");
    built = true;
  }
  function update(k){ // k = 0..1
    build(); if(!tint) return;
    // ramp these softly; they *layer on top* of your existing grade
    const tTint = 0.55*k;       // extra darkening
    const tHue  = 0.30*k;       // cool cast
    const tVig  = 0.35*k;       // vignette
    tint.style.opacity = tTint.toFixed(3);
    hue.style.opacity  = tHue.toFixed(3);
    vig.style.opacity  = tVig.toFixed(3);
  }
  window.__tailgrade__ = { update };
})();

/* ---------- init ---------- */
function init(){
  rebuildRows();
  attachTreeClicks();
  setupReveal();
  setStageProgress(0);
  sizeLeafCanvas();
  if (leafCanvas) requestAnimationFrame(leafLoop);
if (window.__city__) { window.__city__.build(); window.__city__.updateTail(0); }
  if (window.__sky__)   { window.__sky__.build();   window.__sky__.update(0); }
  if (window.__sil__)   { window.__sil__.build();   window.__sil__.update(0); }
  if (window.__rays__)  { window.__rays__.build();  window.__rays__.update(0); }
  if (window.__fog__)   { window.__fog__.build();   window.__fog__.update(0); }
  if (window.__grade__) { window.__grade__.build(); window.__grade__.update(0); }
  if (window.__dof__)   { window.__dof__.build();   window.__dof__.update(0); }
  if (window.__wind__)  window.__wind__.start();
  if (window.__pgrade__) { window.__pgrade__.build(); window.__pgrade__.update(0); }

  const bg = document.getElementById("bg");
  if (bg){
    if (window.__rainbow__) window.__rainbow__.build();
bringToFront(document.getElementById("bgRainbow"));

    bringToFront(document.getElementById("bgSky"));
    bringToFront(document.getElementById("bgSil"));
    bringToFront(document.getElementById("bgRays"));
    bringToFront(document.getElementById("bgGrade"));
    bringToFront(document.getElementById("bgCity")); 
    bringToFront(document.getElementById("bgFog"));
  }

  // stage4 starts hidden on initial load
const g4init = document.querySelector('#ground .stage4');
if (g4init) g4init.style.opacity = "0";

}

/* debounce */
function debounce(fn, wait){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
window.addEventListener("resize", debounce(rebuildRows, 120));
(function CityClickRouter(){
  if (document.getElementById("cityClickRouter")) return;

  const overlay = document.createElement("div");
  overlay.id = "cityClickRouter";
  overlay.style.display = "none";
overlay.style.pointerEvents = "none";
overlay.style.cursor = "default";
  document.body.appendChild(overlay);

  function debugDot(x,y){
    const d = document.createElement("div");
    d.className = "city-dot";
    d.style.left = x + "px";
    d.style.top  = y + "px";
    document.body.appendChild(d);
    requestAnimationFrame(()=> d.classList.add("fade"));
    setTimeout(()=> d.remove(), 420);
  }

  function elementUnder(x, y){
    // temporarily let the real underlying element be hit-tested
    overlay.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    overlay.style.pointerEvents = "auto";
    return el;
  }

  // emit sparks into YOUR existing leafCanvas/addDust pipeline
  function emitCitySparksAtClientXY(clientX, clientY, {count=22} = {}){
    if (!window.leafCanvas) return false;
    const cb = leafCanvas.getBoundingClientRect();
    const x = clientX - cb.left, y = clientY - cb.top;

    for (let i=0;i<count;i++){
      const ang = (Math.random()*Math.PI/2) - Math.PI/4; // ±45°
      const spd = 6 + Math.random()*4;
      addDust({
        shape: "spark",
        x, y,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd - 1.2,
        len: 10 + Math.random()*14,
        a: 0.95,
        fade: 0.045 + Math.random()*0.02,
        g: 0.22,
        rot: ang,
        color: [255, 200 - (Math.random()*60|0), 110 + (Math.random()*70|0)]
      });
      // little ember
      addDust({
        x: x + (Math.random()-0.5)*5,
        y: y + (Math.random()-0.5)*5,
        r: 1 + Math.random()*1.6,
        a: 0.5,
        fade: 0.02 + Math.random()*0.02,
        vx: (Math.random()-0.5)*0.7,
        vy: -0.3 + Math.random()*0.6,
        color: [255, 180, 90]
      });
    }
    return true;
  }

  // decide where the click should go
  overlay.addEventListener("click", (ev)=>{
    const x = ev.clientX, y = ev.clientY;
    debugDot(x,y);

    const under = elementUnder(x,y);

    // if you clicked a tree, forward the click so your existing handler runs
    const treeWrap = under && under.closest && under.closest("#forestReveal .tree-wrap");
    if (treeWrap){
      // forward: this triggers your existing attachTreeClicks() logic
      treeWrap.click();
      return;
    }

    // if it's the city (your City layers container) or the bg area → sparks
    const onCity =
      (under && (under.closest && under.closest("#bgCity"))) ||  // City IIFE wrap
      document.getElementById("bgCity"); // fallback allow anywhere if city visible

    if (onCity){
      emitCitySparksAtClientXY(x, y, {
        count:  (under && under.classList && under.classList.contains("near")) ? 26 :
                (under && under.classList && under.classList.contains("mid"))  ? 20 : 16
      });
      return;
    }

    // anything else (sky/empty) → no-op (or do subtle dust if you want)
  }, {passive:true});
})();
