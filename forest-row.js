// forest-row.js
gsap.registerPlugin(ScrollTrigger);

/* ---------- assets ---------- */
const SRC = {
  full: "images/Tree-Full.png",
  mid1: "images/Tree-Mid1.png",
  mid2: "images/Tree-Mid2.png",
  bare: "images/Tree-Bare.png"
};

/* ---------- helpers ---------- */
const clamp = (min, v, max) => Math.max(min, Math.min(max, v));
const vh    = pct => (window.innerHeight * pct) / 100;
function getSizeMult(){
  const v = getComputedStyle(document.documentElement)
              .getPropertyValue("--forestSizeMult").trim();
  const n = parseFloat(v || "1");
  return Number.isFinite(n) ? n : 1;
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
  ScrollTrigger.refresh();   // recalc after layout changes
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
const CANOPY_Y_BAND = [0.02, 0.20];
const GROUND_RISE_PX = 36;

const SEG_DENSITY = [140, 160, 180];
const MIN_SPAWN   = [1, 2, 3];

// canvas
const leafCanvas = document.getElementById("leafCanvas");
let  lctx = leafCanvas ? leafCanvas.getContext("2d") : null;

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

let falling = [], settled = [], dust = [];
const mouse = { x:-1, y:-1 };
window.addEventListener("mousemove", (e)=>{
  if (!leafCanvas) return;
  const r = leafCanvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
window.addEventListener("mouseleave", ()=>{ mouse.x=-1; mouse.y=-1; });

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
  dust.push({
    x: rand(rect.x1, rect.x2),
    y: leafCanvas.height - GROUND_RISE_PX - rand(8, 18),
    r: rand(2,5),
    a: rand(0.25, 0.4),
    vx: rand(-0.6, 0.6),
    vy: rand(1.4, 2.6)
  });
}

/* ---------- PICKUPS (apple/flower/twig) ---------- */
const PICKUP_SRC = {
  apple:  "images/apple.png",
  flower: "images/flower.png",
  twig:   "images/twig.png"
};
const PICKUP_PRESET = {
  apple:  { baseSize:[56,56], termVy:3.2, dragY:0.96 },
  flower: { baseSize:[44,44], termVy:2.4, dragY:0.965},
  twig:   { baseSize:[160,26],termVy:3.0, dragY:0.965}
};

let pickups = [];                         // active pickups
let dragPick = { active:false, idx:-1 };  // dragging state

function itemForSeg(seg){ return seg===0 ? "apple" : (seg===1 ? "flower" : "twig"); }

function spawnPickup(kind, treeIdx, clickClientX){
  if (!leafCanvas || !TREE_RECTS.length) return;

  const rect = TREE_RECTS[treeIdx] || TREE_RECTS[0];
  const cb   = leafCanvas.getBoundingClientRect();

  const clickX = (clickClientX - cb.left);
  const span   = Math.max(1, rect.x2 - rect.x1);
  let frac     = (clickX - rect.x1) / span; // 0..1
  frac = clamp(0.10, isFinite(frac) ? frac : 0.5, 0.90);

  const x = rect.x1 + frac*span + (span*0.08)*(Math.random()-0.5);
  const y = rect.y1 + (rect.y2 - rect.y1)*(0.05 + Math.random()*0.10);

  const img = new Image(); img.src = PICKUP_SRC[kind];

  const cfg = PICKUP_PRESET[kind];
  let w = cfg.baseSize[0], h = cfg.baseSize[1];
  if (kind==="apple"){ w=h=42+Math.random()*18; }
  if (kind==="flower"){ w=h=34+Math.random()*16; }
  if (kind==="twig"){ w=90+Math.random()*60; h=18+Math.random()*12; }

  const side = (frac-0.5);
const spin = (kind==="flower") ? (Math.random()-0.5)*0.30 + side*0.12 :
             (kind==="apple")  ? 0 : // apples start unspun; they'll get tiny roll on ground
                                   (Math.random()-0.5)*0.10 + side*0.05;


  pickups.push({
    id: Math.random().toString(36).slice(2),
    kind, img, x, y, w, h,
    vx: (side* (kind==="twig"?1.3:(kind==="apple"?1.1:0.9))) + (Math.random()-0.5)*0.6,
    vy: 0,
    rot: Math.random()*Math.PI*2,
    rVel: spin,
    termVy: cfg.termVy, dragY: cfg.dragY,
    born: performance.now(),
    bruised: 0, snapped:false,
    dragging:false, dead:false
  });
}

// drag handling on the canvas
if (leafCanvas){
  leafCanvas.addEventListener("pointerdown", e=>{
    const r = leafCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    // find nearest pickup
    let best=-1, bd=90;
    pickups.forEach((p,i)=>{ const d=Math.hypot(p.x-mx,p.y-my); if(d<bd){bd=d;best=i;} });
    if (best>=0){
      dragPick.active=true; dragPick.idx=best; pickups[best].dragging=true;
    }
  });
  ["pointerup","pointerleave","pointercancel"].forEach(evt=>{
    leafCanvas.addEventListener(evt, ()=>{
      if (dragPick.active && pickups[dragPick.idx]) pickups[dragPick.idx].dragging=false;
      dragPick.active=false; dragPick.idx=-1;
    });
  });
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
    w.style.cursor = "pointer";
    w.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      const p   = window.__currentProgress || 0;
      const seg = segFromProgress(p); // 0 full, 1 mid1, 2 mid2
      if (p > 0.985){ shakeTree(w); return; } // bare: nothing drops
      shakeTree(w);
      const kind = itemForSeg(seg);
      spawnPickup(kind, i, ev.clientX);
    }, {passive:true});
  });
}

const G = 0.25, FRICTION = 0.88, ROT_F = 0.97, BOUNCE = 0.3;
const WIND = { x: 0 };    // shared gust

function leafLoop(){
  if (!leafCanvas || !lctx){ return; }
  lctx.clearRect(0,0,leafCanvas.width, leafCanvas.height);

  // ---------------- settled leaves ----------------
  settled.forEach(p=>{
    const half = p.size/2, ground = leafCanvas.height - half - GROUND_RISE_PX;

    if (mouse.x>=0){
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx,dy);
      if (d < 70){
        const f = (70 - d)/70 * 3.0;
        p.vx += (dx/d) * f;
        p.vy += (dy/d) * f - 0.6;
        p.rVel += (Math.random()-0.5) * 0.22;
        p.air = true;
      }
    }

    if (p.air){
      p.vy += G*0.6; p.vy *= p.dragY; if (p.vy>p.termVy) p.vy = p.termVy;
      const wob = Math.sin(p.t*p.wob1)*p.amp1 + Math.sin(p.t*p.wob2)*p.amp2;
      p.x += p.vx + wob*0.02 + WIND.x;
      p.y += p.vy;
      p.rVel *= ROT_F; p.rot += p.rVel; p.t++;

      if (p.y > ground){
        p.y = ground;
        if (Math.abs(p.vy)>0.4){
          p.vy *= -0.35; p.vx *= 0.7;
          p.rVel += (Math.random()-0.5)*0.12;
        } else {
          p.vy = 0; p.air = false;
          if (Math.abs(p.rVel) < 0.01) p.rVel = 0;
        }
      }
    } else {
      p.vx *= FRICTION; p.vy *= FRICTION; p.rVel *= ROT_F;
      p.y = ground;
    }

    if (p.x < half){ p.x = half; p.vx *= -BOUNCE; }
    if (p.x > leafCanvas.width-half){ p.x = leafCanvas.width-half; p.vx *= -BOUNCE; }

    lctx.save(); lctx.translate(p.x,p.y); lctx.rotate(p.rot);
    lctx.drawImage(p.img, -half, -half, p.size, p.size);
    lctx.restore();
  });

  // ---------------- falling leaves ----------------
  const still = [];
  falling.forEach(p=>{
    p.t++;
    p.vy += G*0.6; p.vy *= p.dragY; if (p.vy>p.termVy) p.vy = p.termVy;
    const wob = Math.sin(p.t*p.wob1)*p.amp1 + Math.sin(p.t*p.wob2)*p.amp2;
    p.y += p.baseDrop + p.vy;
    p.x += wob * 0.02 + WIND.x;
    p.rot += p.rVel;

    const half = p.size/2, ground = leafCanvas.height - half - GROUND_RISE_PX;

    if (p.y < ground){
      still.push(p);
      lctx.save(); lctx.translate(p.x,p.y); lctx.rotate(p.rot);
      lctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
      lctx.restore();
    } else {
      p.y = ground;
      p.vx = (Math.random()-0.5)*1.4;
      p.vy = -Math.random()*2;
      p.rVel = (Math.random()-0.5)*0.3;
      p.air = true;
      settled.push(p);
    }
  });
  falling = still;

  // ---------------- pickups (update + draw) ----------------
  const now = performance.now();
    const clampSpin = (v, max) => Math.max(-max, Math.min(max, v));
  pickups = pickups.filter(p=>!p.dead);


  pickups.forEach(p=>{
    const ground = leafCanvas.height - (p.h/2) - GROUND_RISE_PX;
    const ageSec = (now - p.born)/1000;

    if (p.dragging){
      // spring to cursor
      const k=0.14, dmp=0.85;
      const dx = mouse.x - p.x, dy = mouse.y - p.y;
      p.vx += dx*k; p.vy += dy*k; p.vx*=dmp; p.vy*=dmp;
    }else{
      // gravity & breeze
      p.vy += G*0.7; p.vy *= p.dragY; if (p.vy > p.termVy) p.vy = p.termVy;
      p.vx += WIND.x * (p.kind==="flower" ? 0.9 : p.kind==="twig" ? 0.45 : 0.25) * 0.15;
    }
// ---- angular behavior (apples spin in air, settle on ground) ----
const clampSpin = (v, max) => Math.max(-max, Math.min(max, v)); // keep if not already defined here
if (p.kind === "apple") {
  if (p.y < ground - 0.5) {          // IN AIR
    // sideways motion -> gentle spin
    const target = clampSpin(p.vx * 0.03 + Math.sign(p.vx)*0.012, 0.16);
    p.rVel += (target - p.rVel) * 0.08;          // ease toward target
    p.rVel += (Math.random()-0.5) * 0.003;       // tiny turbulence
  } else {                                       // ON / NEAR GROUND
    p.rVel *= 0.90;                               // bleed out quickly
  }
} else {
  p.rVel *= 0.985;                                // default slow damping
}


    // integrate
    p.x += p.vx; p.y += p.vy; p.rot += p.rVel;

    // ground collision
    if (p.y > ground){
      if (Math.abs(p.vy) > 1.6){
        dust.push({ x: p.x, y: leafCanvas.height - rand(8,18), r: rand(2,5), a: rand(0.25,0.4), vx: rand(-0.6,0.6), vy: rand(1.4,2.6) });
  if (p.kind === "twig" && !p.snapped && ageSec > 12 && Math.random() < 0.08){
          // snap twig into two fragments
          p.snapped = true;
          const mk = (w, vx)=>({
            id:Math.random().toString(36).slice(2), kind:"twig", img:p.img,
            x:p.x+(Math.random()-0.5)*10, y:ground-1, w, h:Math.max(18, p.h*0.9),
            vx:vx, vy:-1.2, rot:p.rot+(Math.random()-0.5)*0.2, rVel:(Math.random()-0.5)*0.06,
            termVy:p.termVy, dragY:p.dragY, born:now, snapped:true, dragging:false, dead:false
          });
          pickups.push(mk(p.w*0.55, -1.2), mk(p.w*0.35, 1.2));
        }
      }
    p.y = ground;
// softer bounce; keep a bit of horizontal so it rolls briefly
p.vy *= -0.25;
p.vx *= 0.78;

if (p.kind === "apple") {
  // convert a touch of horizontal motion into roll; clamp roll rate
  p.rVel = clampSpin(p.rVel * 0.90 + p.vx * 0.0015, 0.05);
} else {
  p.rVel *= 0.92;
}
      if (Math.abs(p.vy) < 0.02) p.vy = 0;
      if (Math.abs(p.rVel) < 0.001) p.rVel = 0;
    }

    // walls
    if (p.x < p.w/2){ p.x = p.w/2; p.vx *= -0.35; }
    if (p.x > leafCanvas.width - p.w/2){ p.x = leafCanvas.width - p.w/2; p.vx *= -0.35; }
if (p.kind === "apple") {
  // hard clamp each frame
  p.rVel = clampSpin(p.rVel, 0.05);
  // if resting (on ground with almost no horizontal motion), fade spin out fast
  if (p.y >= ground - 0.5 && Math.abs(p.vx) < 0.15) {
    p.rVel *= 0.90;
    if (Math.abs(p.rVel) < 0.002) p.rVel = 0;
  }
}

    // aging & decay visual
    let sat=1, bright=1, blur=0, alpha=1, scale=1;
    if (ageSec > 8){
      const t = Math.min(1,(ageSec-8)/10);
      sat = 1 - t*0.35; bright = 1 - t*0.15; scale = 1 - t*0.02;
    }
    if (ageSec > 18){
      const t = Math.min(1,(ageSec-18)/12);
      sat -= t*0.25; bright -= t*0.25; blur = t*0.5;
      if (p.kind==="flower") scale -= t*0.02;
      if (p.kind==="apple")  scale -= t*0.01;
    }
    if (ageSec > 30){
      const t = Math.min(1,(ageSec-30)/8);
      alpha = 1 - t; blur += t*0.8; scale -= t*0.03;
      if (t>=1) p.dead = true;
    }

    // draw shadow if resting
    lctx.save();
    lctx.translate(p.x, p.y);
    if (Math.abs(p.vy) < 0.02){
      lctx.save();
      lctx.filter = "blur(2px)";
      lctx.globalAlpha = 0.18*alpha;
      lctx.fillStyle = "#000";
      lctx.scale(1,0.5);
      lctx.beginPath(); lctx.ellipse(0, p.h, p.w*0.45, p.h*0.25, 0, 0, Math.PI*2); lctx.fill();
      lctx.restore();
    }

    // item
    lctx.rotate(p.rot);
    lctx.filter = `brightness(${bright}) saturate(${sat}) blur(${blur}px)`;
    lctx.globalAlpha = alpha;
    const dw = p.w*scale, dh = p.h*scale;
    lctx.drawImage(p.img, -dw/2, -dh/2, dw, dh);

    // apple bruise overlay
    if (p.kind==="apple" && p.bruised>0){
      const r = Math.max(12, p.w*0.18);
      const g = lctx.createRadialGradient(0,0,4, 0,0,r);
      g.addColorStop(0, `rgba(90,45,35,${0.25*p.bruised})`);
      g.addColorStop(1, "rgba(90,45,35,0)");
      lctx.globalCompositeOperation = "multiply";
      lctx.fillStyle = g; lctx.beginPath(); lctx.arc(0,0,r,0,Math.PI*2); lctx.fill();
      lctx.globalCompositeOperation = "source-over";
    }

    lctx.restore();
  });

  // ---------------- dust ----------------
  dust = dust.filter(d=>d.a>0);
  dust.forEach(d=>{
    d.x += d.vx; d.y += d.vy; d.a -= 0.003;
    lctx.beginPath(); lctx.arc(d.x,d.y,d.r,0,Math.PI*2);
    lctx.fillStyle = `rgba(140,140,140,${d.a})`;
    lctx.fill();
  });

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
(function BackgroundFog(){
  let built = false, rafId = null, t = 0, prog = 0;
  let f1, f2, f3;

  function injectStyle(){
    if (document.getElementById("bgfog-style")) return;
    const css = `
      #bg{ position: fixed; inset: 0; pointer-events:none; }
      /* Fog above parallax, below trees/leaves */
      #bg #bgFog{ position: fixed; inset: 0; pointer-events:none; z-index: 2; }
      #bgFog .fog{
        position: fixed; width:160%; left:-30%; bottom:12%;
        opacity:0; filter:blur(1px); will-change:transform,opacity;
      }
      #bgFog .f1{ bottom:20%; width:170%; left:-35%; }
      #bgFog .f2{ bottom:12%; width:160%; left:-30%; }
      #bgFog .f3{ bottom:24%; width:180%; left:-40%; }
    `;
    const el = document.createElement("style");
    el.id = "bgfog-style";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function build(){
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg){ console.warn("[Fog] #bg not found."); return; }

    injectStyle();

    const fogWrap = document.createElement("div");
    fogWrap.id = "bgFog";
    fogWrap.innerHTML = `
      <img class="fog f1" src="images/fog1.png" alt="">
      <img class="fog f2" src="images/fog2.png" alt="">
      <img class="fog f3" src="images/fog3.png" alt="">
    `;
    fogWrap.style.zIndex = "2";
    bg.appendChild(fogWrap);

    f1 = fogWrap.querySelector(".f1");
    f2 = fogWrap.querySelector(".f2");
    f3 = fogWrap.querySelector(".f3");

    const tick = () => {
      t += 1/60; // ~seconds
      const base = prog * 240;

      // drift slows and nearly stops toward the end for "stillness"
      const still = Math.max(0, 1 - Math.max(0, prog - 0.85) / 0.15); // 1→0 from 85% to end
      const slow  = 0.5 + 0.5*still; // 1→0.5

      if (f1) f1.style.transform =
        `translate3d(${-base*0.06 - t*8*slow}px, ${ (Math.sin(t*0.6)*6 - 6)*slow }px, 0)`;
      if (f2) f2.style.transform =
        `translate3d(${ base*0.05 + t*10*slow}px, ${ (Math.cos(t*0.52)*8 - 4)*slow }px, 0)`;
      if (f3) f3.style.transform =
        `translate3d(${-base*0.03 - t*6*slow}px, ${ (Math.sin(t*0.44)*10)*slow }px, 0)`;

      rafId = requestAnimationFrame(tick);
    };
    tick();

    built = true;
  }

  function segInfo(p){
    const s = Math.max(0, Math.min(0.9999, p)) * 3;
    const seg = Math.floor(s);   // 0,1,2
    const t   = s - seg;         // 0..1
    return { seg, t };
  }

  function update(p){
    build();
    prog = p;

    const { seg, t } = segInfo(p);
    if (!f1 || !f2 || !f3) return;

    // NO fog in Full
    let o1 = 0, o2 = 0, o3 = 0;

    if (seg === 1){ // appears during Mid1->Mid2
      const tt = Math.max(0, (t - 0.15) / 0.85);
      o1 = 0.18 * tt;
      o2 = 0.26 * tt;
      o3 = 0.12 * tt;
    } else if (seg === 2){ // densest in Mid2->Bare and a touch heavier at the end
      o1 = 0.28 + 0.10*t;
      o2 = 0.36 + 0.16*t + (p>0.92 ? 0.08*(p-0.92)/0.08 : 0);
      o3 = 0.22 + 0.18*t + (p>0.92 ? 0.05*(p-0.92)/0.08 : 0);
    }

    f1.style.opacity = o1.toFixed(3);
    f2.style.opacity = o2.toFixed(3);
    f3.style.opacity = o3.toFixed(3);
  }

  window.__fog__ = { build, update };
})();

/* ---------- BACKGROUND SKY (orange dawn → cold) + SUN + horizon belt ---------- */
(function BackgroundSky(){
  let built = false, sun, belt;
  function css(){
    if (document.getElementById("bgsky-style")) return;
    const el = document.createElement("style");
    el.id = "bgsky-style";
    el.textContent = `
      #bg #bgSky{position:fixed;inset:0;pointer-events:none;z-index:1}
      #bgSky .sky{position:fixed;inset:0;transition:background 0.1s linear}
      #bgSky .sun{
        position:fixed; left:50%; width:26vmin; height:26vmin; border-radius:50%;
        filter: blur(18px); transform:translate(-50%, -40%); opacity:.9;
        background: radial-gradient(circle, rgba(255,190,90,.95), rgba(255,140,60,.45) 55%, rgba(255,160,60,0) 72%);
      }
      #bgSky .belt{
        position:fixed; inset:0; pointer-events:none;
        background:
          radial-gradient(120% 65% at 50% 92%,
            rgba(255,180,90,.55), rgba(255,150,60,.35) 25%,
            rgba(255,150,60,.12) 45%, rgba(0,0,0,0) 70%);
        opacity:0; transition:opacity .12s linear;
      }`;
    document.head.appendChild(el);
  }
  function build(){
    if (built) return;
    const bg = document.getElementById("bg"); if (!bg) return;
    css();
    const wrap = document.createElement("div");
    wrap.id="bgSky"; wrap.innerHTML = `<div class="sky"></div><div class="sun"></div><div class="belt"></div>`;
    bg.appendChild(wrap);
    sun  = wrap.querySelector(".sun");
    belt = wrap.querySelector(".belt");
    built = true;
  }
  const lerp=(a,b,t)=>a+(b-a)*t, clamp01=(x)=>Math.max(0,Math.min(1,x));
  function mixHex(a,b,m){const ah=parseInt(a.slice(1),16),bh=parseInt(b.slice(1),16);
    const ar=(ah>>16)&255, ag=(ah>>8)&255, ab=ah&255;
    const br=(bh>>16)&255, bg=(bh>>8)&255, bb=bh&255;
    const r=Math.round(lerp(ar,br,m)), g=Math.round(lerp(ag,bg,m)), bl=Math.round(lerp(ab,bb,m));
    return `rgb(${r},${g},${bl})`;
  }
  function update(p){
    build(); const sky = document.querySelector("#bgSky .sky"); if(!sky||!sun) return;
    const seg = p<1/3?0:p<2/3?1:2; const t = (p*3 - seg);

    const warmTop = `#ffb56b`, warmBot = `#ffd596`;
    const coolTop = `#6f7f92`, coolBot = `#2b3644`;
    const mix = seg===0 ? 0 : seg===1 ? Math.min(0.65, t*0.65) : 0.65 + Math.min(0.35,t*0.35);
    const top = mixHex(warmTop, coolTop, clamp01(mix));
    const bot = mixHex(warmBot, coolBot, clamp01(mix));
    sky.style.background = `linear-gradient(${top}, ${bot})`;

    const beltIn = seg===0 ? 1 : Math.max(0, 1 - t*1.4);
    if (belt) belt.style.opacity = (0.9*beltIn).toFixed(3);

    const sunT = clamp01(p*1.6);
    const y = lerp(-40, 58, sunT);
    sun.style.transform = `translate(-50%, ${y}%)`;
    sun.style.opacity = String(lerp(0.95, 0.0, sunT));
  }
  window.__sky__ = { build, update };
})();

/* ---------- DISTANT SILHOUETTES (dissolve + blur) ---------- */
(function BackgroundSil(){
  let built = false, near, far;
  function build(){
    if (built) return;
    const bg = document.getElementById("bg"); if (!bg) return;
    const el = document.createElement("div");
    el.id="bgSil"; el.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:1;";
    el.innerHTML = `
      <img class="far"  src="images/sil_far.png"  style="position:fixed;bottom:18%;left:-5%;width:110%;opacity:.6;filter:blur(0px);">
      <img class="near" src="images/sil_near.png" style="position:fixed;bottom:10%;left:-5%;width:110%;opacity:.8;filter:blur(0px);">`;
    bg.appendChild(el);
    far = el.querySelector(".far");
    near = el.querySelector(".near");
    built = true;
  }
  const clamp01=(x)=>Math.max(0,Math.min(1,x));
  function update(p){
    build(); if(!near||!far) return;
    far.style.opacity  = String(clamp01(.7  - p*0.5));
    near.style.opacity = String(clamp01(.85 - p*0.35));
    far.style.filter = `blur(${(p*3).toFixed(2)}px)`;
    near.style.filter= `blur(${(p*1.8).toFixed(2)}px)`;
    near.style.transform = `translateY(${p*6}px)`;
    far.style.transform  = `translateY(${p*4}px)`;
  }
  window.__sil__ = { build, update };
})();

/* ---------- GOD-RAYS → SMOG STREAKS ---------- */
(function RaysToSmog(){
  let built=false, rays, smog;
  function css(){
    if (document.getElementById("bgrays-style")) return;
    const s = document.createElement("style");
    s.id="bgrays-style";
    s.textContent = `
      #bg #bgRays{ position:fixed; inset:0; z-index:2; pointer-events:none; }
      #bgRays .layer{ position:fixed; inset:0; opacity:0; will-change:opacity,transform,filter; }
      #bgRays .rays{
        mix-blend-mode: screen;
        background: repeating-linear-gradient( 115deg,
          rgba(255,255,220,0.05) 0px, rgba(255,255,220,0.05) 6px,
          rgba(255,255,220,0.00) 24px, rgba(255,255,220,0.00) 48px);
        filter: blur(2px);
      }
      #bgRays .smog{
        mix-blend-mode: multiply;
        background: repeating-linear-gradient( 90deg,
          rgba(40,45,55,0.02) 0px, rgba(40,45,55,0.02) 8px,
          rgba(40,45,55,0.10) 16px, rgba(40,45,55,0.10) 18px);
        filter: blur(0.6px) contrast(1.05);
      }`;
    document.head.appendChild(s);
  }
  function build(){
    if(built) return;
    const bg=document.getElementById("bg"); if(!bg) return;
    css();
    const w=document.createElement("div");
    w.id="bgRays";
    w.innerHTML=`<div class="layer rays"></div><div class="layer smog"></div>`;
    bg.appendChild(w);
    rays=w.querySelector(".rays");
    smog=w.querySelector(".smog");
    built=true;
  }
  function update(p){
    build(); if(!rays||!smog) return;
    const seg = p<1/3?0:p<2/3?1:2; const t=(p*3 - seg);
    const raysIn = seg===0 ? 1 : Math.max(0, 1 - t*1.4);
    rays.style.opacity = (0.26 * raysIn).toFixed(3);
    rays.style.transform = `translateY(${p*12}px) translateX(${p*6}px)`;

    const smogIn = seg<2 ? 0 : t;
    smog.style.opacity = (0.12 + 0.22*smogIn).toFixed(3);
    smog.style.transform = `translateY(${p*8}px)`;
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
    if (near) near.style.filter = f(0.85);
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

/* ---------- pinned scroll control ---------- */
ScrollTrigger.create({
  trigger: "#forestReveal",
  start: "bottom bottom",
  end:   "+=" + SCROLL_LEN,
  pin: true,
  pinSpacing: true,
  scrub: true,
  onUpdate(self){
    window.__currentProgress = self.progress; 
    if (breathingOn && self.progress > 0.001){
      pauseBreathing();
      breathingOn = false;
    }
    setStageProgress(self.progress);
    updateLeavesForProgress(self.progress);

    if (window.__sky__)   window.__sky__.update(self.progress);
    if (window.__sil__)   window.__sil__.update(self.progress);
    if (window.__rays__)  window.__rays__.update(self.progress);
    if (window.__fog__)   window.__fog__.update(self.progress);
    if (window.__grade__) window.__grade__.update(self.progress);
    if (window.__dof__)   window.__dof__.update(self.progress);
    if (window.__pgrade__) window.__pgrade__.update(self.progress);
  },
  onLeaveBack(){
    setStageProgress(0);
    if (!breathingOn){
      resumeBreathing();
      breathingOn = true;
    }
    if (window.__sky__)   window.__sky__.update(0);
    if (window.__sil__)   window.__sil__.update(0);
    if (window.__rays__)  window.__rays__.update(0);
    if (window.__fog__)   window.__fog__.update(0);
    if (window.__grade__) window.__grade__.update(0);
    if (window.__dof__)   window.__dof__.update(0);
    if (window.__pgrade__) window.__pgrade__.update(0);
  },
  onRefresh: () => {
    cacheTreeRects(); sizeLeafCanvas();
    if (window.__sky__)   window.__sky__.build();
    if (window.__sil__)   window.__sil__.build();
    if (window.__rays__)  window.__rays__.build();
    if (window.__fog__)   window.__fog__.build();
    if (window.__grade__) window.__grade__.build();
    if (window.__dof__)   window.__dof__.build();
    if (window.__pgrade__) { window.__pgrade__.build(); window.__pgrade__.update(0); }

    const bg = document.getElementById("bg");
    if (bg){
      bringToFront(document.getElementById("bgSky"));
      bringToFront(document.getElementById("bgSil"));
      bringToFront(document.getElementById("bgRays"));
      bringToFront(document.getElementById("bgGrade"));
      bringToFront(document.getElementById("bgFog"));
    }
  }
});

/* ---------- init ---------- */
function init(){
  rebuildRows();
  attachTreeClicks();
  setupReveal();
  setStageProgress(0);
  sizeLeafCanvas();
  if (leafCanvas) requestAnimationFrame(leafLoop);

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
    bringToFront(document.getElementById("bgSky"));
    bringToFront(document.getElementById("bgSil"));
    bringToFront(document.getElementById("bgRays"));
    bringToFront(document.getElementById("bgGrade"));
    bringToFront(document.getElementById("bgFog"));
  }
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
window.addEventListener("resize", sizeLeafCanvas);
