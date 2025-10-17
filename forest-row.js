// forest-row.js
gsap.registerPlugin(ScrollTrigger);

/* ---------- assets ---------- */
const SRC = {
  full: "images/Tree-Full.png",
  mid1: "images/Tree-Mid1.png",
  mid2: "images/Tree-Mid2.png",
  bare: "images/Tree-Bare.png"
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
const TRACTOR_TAIL = 0.22; // 12% of the pin for the tractor
window.__TRACTOR_TAIL = 0.22;
// How much of the pinned span is for the FOREST transitions (0..1)
const FOREST_PORTION = 0.65;   // ← forest completes at 84% of the pin

// Give more scroll after the forest (the “tail”)
const EXTRA_TAIL_PX = 8400;     // runway just for the tractor


/* ---------- helpers ---------- */
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

    spawnPickup("twig", treeIdx, clientX);
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
let breatheTL = null;
function startBreathing(){
  if (breatheTL) return;
  breatheTL = gsap.timeline({ repeat: -1, yoyo: true });
  breatheTL.to(".tree-back, .tree", {
    y: "+=6",
    rotation: "+=0.25",
    duration: 3,
    ease: "sine.inOut",
    stagger: { each: 0.12, from: "random" }
  });
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

  gsap.set(".tree-back, .tree", { opacity: 0, clipPath: "inset(100% 0 0 0)" });
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
let TREE_RECTS = [];
function cacheTreeRects(){
  if (!leafCanvas) return;
  const cb = leafCanvas.getBoundingClientRect();
  TREE_RECTS = [...document.querySelectorAll("#forestReveal .tree-wrap")].map(w=>{
    const base = w.querySelector(".tree") || w.querySelector(".tree-back");
    if (!base) return {x1:0,x2:0,y1:0,y2:0};
    const b = base.getBoundingClientRect();
    const x = b.left - cb.left;
    const y = b.top  - cb.top;
    const wpx = b.width, hpx = b.height;
    return {
      x1: x + CANOPY_X_BAND[0]*wpx,
      x2: x + CANOPY_X_BAND[1]*wpx,
      y1: y + CANOPY_Y_BAND[0]*hpx,
      y2: y + CANOPY_Y_BAND[1]*hpx
    };
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
    vy: 0, vx: 0,
    size: rand(18, 36),
    rot: rand(0, Math.PI*2),
    rVel: rand(-0.06, 0.06),
    wob1: rand(0.015, 0.025),
    wob2: rand(0.06,  0.09),
    amp1: rand(4, 8),
    amp2: rand(2, 5),
    termVy: rand(1.6, 2.6),
    dragY: rand(0.90, 0.96),
    baseDrop: rand(vmin, vmax),
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
  twig:   "images/twig2.png"
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
  airDrag: 0.972, termVy: 6.0, wind: 0.28,
  bounce:  0.18,
  friction:0.86,
  cursorR: 100, cursorF: 1.0,  throwMul: 1.0,
rollCouple: 0.0008, rotClamp: 0.10,
  rotDampAir: 0.982, rotDampGround: 0.92,
  grabK: 0.12, grabDmp: 0.84, rotInertia: 1.6,
  
}
};


let pickups = [];                         // active pickups
let dragPick = { active:false, idx:-1 };  // dragging state

function itemForSeg(seg){ return seg===0 ? "flower" : (seg===1 ? "apple" : "twig"); }

function spawnPickup(kind, treeIdx, clickClientX){
  if (!leafCanvas || !TREE_RECTS.length) return;

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

  const img = new Image();
  if (kind === "apple")      img.src = APPLE_SEQ[0];
  else if (kind === "flower")img.src = FLOWER_SEQ[0];
  else                       img.src = PICKUP_SRC[kind];

  const cfg = PICKUP_PRESET[kind];
  let w = cfg.baseSize[0], h = cfg.baseSize[1];
  if (kind==="apple"){  w=h=42+Math.random()*18; }
  if (kind==="flower"){ w=h=34+Math.random()*16; }
  if (kind==="twig"){   w=90+Math.random()*60; h=18+Math.random()*12; }

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
    stageIdx: (kind === "apple" || kind === "flower") ? 0 : undefined,
    landedAt: (kind === "apple" || kind === "flower") ? null : undefined,
    alphaOverride: undefined
  });

  // keep your existing twig nudge so they don’t hover
  if (kind === "twig") {
   pickups[pickups.length - 1].vy = 2.0;
  }
}


// drag handling on the page (pick up, hold, throw)
if (leafCanvas){
  window.addEventListener("pointerdown", (e)=>{
    const r = leafCanvas.getBoundingClientRect();
    // only if inside the canvas rectangle
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    // ignore clicks on trees so their click-to-spawn still works
    if (e.target && e.target.closest && e.target.closest(".tree-wrap")) return;

    const mx = e.clientX - r.left, my = e.clientY - r.top;

    // choose nearest pickup under cursor
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
      p.grabDX = p.x - mx;    // keep offset so item doesn't jump
      p.grabDY = p.y - my;
      mouse.down = true;
    }
  }, {passive:true});

  const release = ()=>{
    mouse.down = false;
    if (dragPick.active){
      const p = pickups[dragPick.idx];
      if (p){
        // throw impulse from pointer velocity (weighted)
        const mul = 0.35 * (p.ph?.throwMul ?? 1);
        p.vx += mouse.vx * mul;
        p.vy += mouse.vy * mul;
        p.dragging = false;
      }
    }
    dragPick.active = false; dragPick.idx = -1;
  };
  window.addEventListener("pointerup", release, {passive:true});
  window.addEventListener("pointercancel", release, {passive:true});
}

function shakeTree(wrap){
  const kids = wrap.querySelectorAll(".tree, .tree-back, .tree-stage");
  gsap.fromTo(kids,
    { rotation: -1 },
    { rotation: 1, duration: 0.06, repeat: 8, yoyo: true,
      ease: "sine.inOut", transformOrigin: "bottom center" }
  );
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

      if (p > 0.985){
        shakeTree(w);
        spawnDustFallAt(i, ev.clientX, ev.clientY, 42);
        const r = TREE_RECTS[i] || TREE_RECTS[0];
        for (let k=0; k<3; k++) setTimeout(()=>spawnDustPuff(r), k*90);
        return;
      }

      shakeTree(w);
      window.dispatchEvent(new CustomEvent("tree-shake", { detail: { idx: i, rect: TREE_RECTS[i] } }));
      const kind = itemForSeg(seg);
      spawnPickup(kind, i, ev.clientX);
    }, {passive:true});
  });
}


const G = 0.25, FRICTION = 0.88, ROT_F = 0.97, BOUNCE = 0.3;
const WIND = { x: 0 };    // shared gust
window.__WIND__ = WIND; // expose to mic controller

window.__treesMicSway__ = (amt) => {
  gsap.to("#forestReveal .tree-wrap", {
   rotation: amt * 2.5,
    duration: 0.12,
    ease: "sine.inOut",
    overwrite: "auto",
    transformOrigin: "50% 100%" // bottom center
  });
};

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

  const now = performance.now(); // single timestamp per frame
   leafLoop.__wokenThisFrame = 0; 
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
SMOKE.master = PERF.bud;

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
  if (!p.air && p.vy === 0 && p.rVel === 0 && !mouseActive && !nearTractor){
    lctx.drawImage(p.img, p.x - half, ground - half, p.size, p.size);
    return; // ✅
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
    p.x += p.vx + WIND.x;
    p.y += p.vy;
    p.rVel *= ROT_F;
    p.rot += p.rVel;

    if (p.y > ground) {
      p.y = ground;
      if (Math.abs(p.vy) > 0.4) {
        p.vy *= -0.35; p.vx *= 0.7;
        p.rVel += (Math.random() - 0.5) * 0.12;
      } else {
        p.vy = 0; p.air = false;
        if (Math.abs(p.rVel) < 0.01) p.rVel = 0;
      }
    }
  } else {
    // only minimal decay when resting
    p.vx *= FRICTION; p.vy = 0; p.rVel *= ROT_F;
    p.y = ground;
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


  /* ---------------- falling leaves ---------------- */
  const still = [];
  falling.forEach(p => {
    p.t++;
    p.vy += G * 0.6;
    p.vy *= p.dragY;
    if (p.vy > p.termVy) p.vy = p.termVy;

    const wob = Math.sin(p.t * p.wob1) * p.amp1 + Math.sin(p.t * p.wob2) * p.amp2;
    p.y += p.baseDrop + p.vy;
    p.x += wob * 0.02 + WIND.x;
    p.rot += p.rVel;

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
const needFilter = (blur > 0.0001) || (sat < 0.999 || sat > 1.001) || (bright < 0.999 || bright > 1.001);
lctx.filter = needFilter ? `brightness(${bright}) saturate(${sat}) blur(${blur}px)` : "none";


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
    if (d.a <= 0) { d.a = 0; continue; }

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
  #bg #bgFog{ position:fixed; inset:0; pointer-events:none; z-index:6; } /* was 2 */
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

/* ---------- CITY (reveals during the tractor tail; SPRING-SMOOTH parallax when tractor is visible) ---------- */
/* ---------- CITY (reveal stays the same; parallax via background-position-x with repeat-x) ---------- */
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
      }
      #bgCity .back{ z-index:1; }
      #bgCity .mid { z-index:2; }
      #bgCity .near{ z-index:3; }
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
    back.style.backgroundImage = 'url("images/constructioncity_far.png")';
    mid .style.backgroundImage = 'url("images/constructioncity_mid.png")';
    near.style.backgroundImage = 'url("images/constructioncity_near.png")';

    // start hidden (reveal curve unchanged)
    [back, mid, near].forEach(el=>{
      el.style.opacity = "0";
      el.style.transform = "translate3d(0,30px,0)";
      el.style.filter = "blur(2px)";
      // initialize background positions
      el.style.backgroundPosition = "50% 100%";
    });

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
  const base = 0.45;                                // visible even when slow
  const spdK = Math.min(1, __tractorSpeed / 12);    // ramps up fast
  const strength = Math.min(1, base + spdK * 0.75);

  // temporarily bias smoke darker/thicker for exhaust look
  const prevLo = SMOKE.colorLo.slice(), prevHi = SMOKE.colorHi.slice();
  const prevStart = SMOKE.startR.slice(), prevFade = SMOKE.fade.slice();

  SMOKE.colorLo = [90, 90, 90];
  SMOKE.colorHi = [160,160,160];
  SMOKE.startR  = [12, 30];              // a bit larger
  SMOKE.fade    = [0.0014, 0.0028];      // lives longer

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

  function jitter(el, times=6, amp=1.4, dur=0.04){
    const tl = gsap.timeline();
    for (let i=0;i<times;i++){
      tl.to(el, {
        x:(Math.random()-0.5)*amp,
        y:(Math.random()-0.5)*amp,
        rotation:(Math.random()-0.5)*1.2,
        duration:dur,
        ease:"sine.inOut"
      });
    }
    tl.to(el, { x:0, y:0, rotation:0, duration:dur*0.8, ease:"sine.out" });
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


 

  // 🔄 REPLACEMENT STARTS HERE
  function cullTree(wrap){
    if (!wrap || wrap.dataset.gone === "1") return;
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

    // hinge at base
    gsap.set(wrap, { transformOrigin:"50% 100%" });
    kids.forEach(k => gsap.set(k, { transformOrigin:"50% 100%" }));

    const dirAway = (movingLeft === true) ? +1 : -1; // +1 = fall right, -1 = fall left

    const tl = gsap.timeline({
      onComplete(){
        // ensure fully invisible after the act
        gsap.set(kids, { opacity: 0, filter: `blur(${BLUR_PX}px)` });
      }
    });

    // 1) chainsaw buzz
    tl.add(jitter(wrap, 6, 1.6, 0.035));

    // 2) micro pre-tip (away from nose)
    tl.to(wrap, {
      rotation: dirAway * TOPPLE.tip1,
      y: -TOPPLE.preLift,
      duration: TOPPLE.tPre,
      ease: "power2.out"
    });

    // 3) commit the lean (start sliding & lowering a bit)
    tl.to(wrap, {
      rotation: dirAway * (TOPPLE.tip1 + TOPPLE.hinge1),
      x: `+=${dirAway * TOPPLE.xDrift1}`,
      y: `+=${TOPPLE.drop1}`,
      duration: TOPPLE.tLean1,
      ease: "power2.in"
    });
// early burst (twig + dust) right as the lean commits
tl.add(() => {
   if (!wrap.__burstEarly) {
     wrap.__burstEarly = true;
     spawnTwigBurstAtTree(idx, 3 + Math.floor(Math.random()*2)); // 3–4 twigs
      const rect = TREE_RECTS[idx] || TREE_RECTS[0];
      for (let i=0;i<3;i++) setTimeout(()=>spawnDustPuff(rect), i*90);
   }
 }, "-=0.10");


    // 4) accelerate into the fall (bigger rotation + drift + drop)
    tl.to(wrap, {
      rotation: dirAway * TOPPLE.finalRot,
      x: `+=${dirAway * (TOPPLE.xDrift2 - TOPPLE.xDrift1)}`,
      y: `+=${TOPPLE.drop2 - TOPPLE.drop1}`,
      duration: TOPPLE.tLean2,
      ease: "power4.in"
    }, "<");

    // shadow stretches & fades during fall
    if (shadow){
      tl.to(shadow, {
        opacity: 0.10,
        scaleX: 1.2,
        scaleY: 0.7,
        duration: TOPPLE.tLean1 + TOPPLE.tLean2,
        ease: "power2.inOut"
      }, "<");
    }

    // slight blur ramp on sprites as they move fast / out of focus
    tl.to(kids, {
      filter: `blur(${BLUR_PX}px)`,
      duration: TOPPLE.tLean2 * 0.8,
      ease: "power2.in"
    }, "<+0.05");

    // 5) impact bounce (tiny)
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
        // shake the sprite a hair on impact
        gsap.fromTo(wrap, { x: `+=${dirAway*1.2}` }, { x: `-=${dirAway*1.2}`, duration: 0.08, yoyo:true, repeat:3, ease:"sine.inOut" });
      }
    });
tl.add(() => {
  const r = TREE_RECTS[idx] || TREE_RECTS[0];
  if (!r || !leafCanvas) return;
  // drop a couple of larger stains
  for (let i=0;i<2;i++){
    addGroundPatch(
      (r.x1+r.x2)/2 + rand(-40, 40),
      leafCanvas.height - GROUND_RISE_PX + rand(-2, 2),
      { w: rand(60,110), h: rand(24,42), a: rand(0.10,0.18) }
    );
  }
}, "<+0.02");


  // 6) impact burst → TWIGS + dust (no leaves)

 tl.add(() => {
   if (!wrap.__burstImpact) {
     wrap.__burstImpact = true;
    spawnTwigBurstAtTree(idx, 3 + Math.floor(Math.random()*2)); // 3–4 twigs
      const rect = TREE_RECTS[idx] || TREE_RECTS[0];
      for (let i=0;i<3;i++) setTimeout(()=>spawnDustPuff(rect), i*90);
   }
 }, "<");



    // 7) fade out while it settles out of frame
    tl.to(kids, { opacity: 0, duration: TOPPLE.tFade, ease: "power1.in" }, "+=0.05");
    if (shadow) tl.to(shadow, { opacity: 0, duration: TOPPLE.tFade*0.9, ease: "power1.in" }, "<+0.05");
  }
  // 🔄 REPLACEMENT ENDS HERE

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
    document.querySelectorAll("#forestReveal .tree-wrap").forEach(w=>{
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
  plumeCount: [6, 12],     // fewer, chunkier puffs
  startR: [14, 30],        // larger initial circles
  grow: [0.05, 0.10],      // slower growth → stays circular longer
  fade: [0.0016, 0.0032],  // lingers a bit
  blur: [1.8, 3.2],
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
  const s = Math.max(0, Math.min(1, strength)) * (m * m);

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
      a: 0.22 + Math.random()*0.28,
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
      <img class="far"  src="images/sil_far.png"  style="position:fixed;bottom:18%;left:-5%;width:110%;opacity:.6;filter:blur(0px);">
      <img class="near" src="images/sil_near.png" style="position:fixed;bottom:10%;left:-5%;width:110%;opacity:.8;filter:blur(0px);">`;
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
    smog.style.transform = `translateY(${(p*18).toFixed(2)}px)`;
  }

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
        background: radial-gradient(ellipse at 50% 55%,
          rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%);
        opacity: 0; will-change: opacity; mix-blend-mode: normal;
      }
      #bgGrade .hue{
        position: fixed; inset: 0;
        background: rgba(70,100,140,1);
        opacity: 0; mix-blend-mode: color;
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

    let tintOp = 0, vigOp = 0, hueOp = 0;
    let r = 10, g = 14, b = 20; // deep cold
    let hueColor = `rgb(70,100,140)`;

    if (seg === 1){
      const tt = Math.max(0, (t - 0.10) / 0.90);
      r = 26; g = 34; b = 48;
      tintOp = L(0.00, 0.35, tt);
      vigOp  = L(0.00, 0.18, tt);
      hueOp  = L(0.00, 0.20, tt);
    } else if (seg === 2){
      r = 10; g = 14; b = 20;
      tintOp = L(0.35, 0.65, t);
      vigOp  = L(0.18, 0.40, t);
      hueOp  = L(0.20, 0.38, t);
    }

    tint.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    tint.style.opacity = tintOp.toFixed(3);
    vig.style.opacity  = vigOp.toFixed(3);
    hue.style.backgroundColor = hueColor;
    hue.style.opacity  = hueOp.toFixed(3);
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
    // p = 0..1 across the whole pinned range (forest + tail)
    const p = self.progress;

    // forestP = 0..1 only over the FOREST portion, then clamped (freezes at bare)
    const forestP = Math.min(p / FOREST_PORTION, 1);

    // expose for any other code that reads it
    window.__currentProgress = forestP;

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

    // --- TRACTOR TAIL (0..1 only inside the tail) ---
    // tailT = 0 while in forest; grows 0→1 only after forest is done
    const tailT = Math.max(0, Math.min(1, (p - FOREST_PORTION) / (1 - FOREST_PORTION)));
    // Tractor exhaust: only when on-screen and actually moving
{
  const tr = tractorRectInCanvas(); // uses your existing helper
  if (tr && __tractorSpeed > 0.4 && (SMOKE.master ?? 1) > 0.02 && leafCanvas) {
    const now = performance.now();
    if (now - window.__lastTrSmoke > 50) {       // ~20 plumes/sec max
      const baseY   = leafCanvas.height - GROUND_RISE_PX - 4;
      const backX   = tr.cx - (tr.dirX || 1) * 42; // a bit behind the tractor
      const strength= Math.min(1, __tractorSpeed / 20); // faster → stronger
      spawnSmokePlume(backX, baseY, strength);
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
SMOKE.master = 1 - (clearK * clearK);

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

  onLeaveBack(){
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

    const bg = document.getElementById("bg");
    if (bg){
      bringToFront(document.getElementById("bgSky"));   // z:1
      bringToFront(document.getElementById("bgSil"));   // z:1 (near silhouettes)
      bringToFront(document.getElementById("bgGrade")); // z:2 (tint/vignette)
      bringToFront(document.getElementById("bgCity"));
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
