gsap.registerPlugin(ScrollTrigger);

/* ---------- ASSETS ---------- */
const LAMP_SRC = [
  "images/lampost1.png",  // stage 0 → lantern
  "images/lampost3.png",  // stage 1 → streetlight
  "images/lampost5.png"   // stage 2 → later streetlight
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
const XFADE_SEG_DUR    = (1 - XFADE_HOLD_START - XFADE_HOLD_END) / XFADE_SEGS;

// cut points where we switch the *spawn* pack (a bit into each crossfade so visuals lead)
const CUT1 = XFADE_HOLD_START + XFADE_SEG_DUR * 0.58;                 // ~0.317
const CUT2 = XFADE_HOLD_START + XFADE_SEG_DUR + XFADE_SEG_DUR * 0.58; // ~0.657
function sceneFromProgress(p){
  return (p < CUT1) ? 0 : (p < CUT2) ? 1 : 2;
}

/* ---- LITTER PACKS (per scene) ---- */
const LITTER_PACKS = {
  0: [
    "images/litter/paper.png",
    "images/litter/receipt.png",
    "images/litter/trash.png",
    "images/litter/rock.png"
  ],
  1: [
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
  2: [
    "images/litter/waterbottle.png",
    "images/litter/plasticpacke.png",
    "images/litter/colorcan.png",
    "images/litter/wine.png",
    "images/litter/mask.png"
  ]
};
const LITTER_PACK_DEFAULT = ["images/litter/trash.png", "images/litter/rock.png"];
const LITTER_ALL = [...new Set([...LITTER_PACK_DEFAULT, ...Object.values(LITTER_PACKS).flat()])];

/* ---------- PER-ITEM PHYSICS ---------- */
const ITEM_PHYS = {
  "paper":        { g:0.40, air:0.025, turb:0.90, lift:0.018, spin:1.20, groundFriction:0.90, rotFriction:0.94, impact:0.55, cursor:1.75 },
  "receipt":      { g:0.42, air:0.026, turb:0.95, lift:0.020, spin:1.15, groundFriction:0.90, rotFriction:0.94, impact:0.55, cursor:1.75 },
  "trash":        { g:0.55, air:0.020, turb:0.70, lift:0.010, spin:1.00, groundFriction:0.92, rotFriction:0.95, impact:0.60, cursor:1.30 },
  "mask":         { g:0.60, air:0.022, turb:0.85, lift:0.014, spin:1.10, groundFriction:0.92, rotFriction:0.95, impact:0.60, cursor:1.50 },
  "plasticpacke": { g:0.65, air:0.020, turb:0.75, lift:0.012, spin:1.00, groundFriction:0.93, rotFriction:0.95, impact:0.62, cursor:1.40 },
  "chippacket":   { g:0.68, air:0.020, turb:0.80, lift:0.013, spin:1.05, groundFriction:0.93, rotFriction:0.95, impact:0.62, cursor:1.40 },
  "moderncoffee": { g:0.95, air:0.012, turb:0.45, lift:0.004, spin:0.80, groundFriction:0.94, rotFriction:0.96, impact:0.70, cursor:1.00 },
  "coffee":       { g:1.00, air:0.012, turb:0.45, lift:0.004, spin:0.80, groundFriction:0.94, rotFriction:0.96, impact:0.70, cursor:1.00 },
  "tupperware":   { g:1.05, air:0.011, turb:0.40, lift:0.003, spin:0.75, groundFriction:0.94, rotFriction:0.96, impact:0.72, cursor:0.95 },
  "waterbottle":  { g:1.10, air:0.010, turb:0.38, lift:0.002, spin:0.70, groundFriction:0.95, rotFriction:0.96, impact:0.74, cursor:0.90 },
  "colorcan":     { g:1.30, air:0.008, turb:0.28, lift:0.001, spin:0.55, groundFriction:0.96, rotFriction:0.97, impact:0.80, cursor:0.70 },
  "wine":         { g:1.55, air:0.007, turb:0.22, lift:0.000, spin:0.45, groundFriction:0.97, rotFriction:0.975, impact:0.85, cursor:0.55 },
  "rock":         { g:1.60, air:0.006, turb:0.18, lift:0.000, spin:0.40, groundFriction:0.975,rotFriction:0.98,  impact:0.88, cursor:0.50 },
};
const DEFAULT_PHYS = { g:0.90, air:0.014, turb:0.55, lift:0.002, spin:1.00, groundFriction:0.94, rotFriction:0.96, impact:0.70, cursor:1.00 };

/* ================== LITTER CANVAS (no debug boxes) ================== */
(() => {
  const GRAVITY = 0.018, WIND_K = 0.01;
  const FRICTION = 0.94, ROT_FRICTION = 0.96, STOP_EPS = 0.03;
  const MAX_PARTS = 520, SIZE_RANGE = [28, 48];

  const LAMP_WANDER_PX = 160;
  const FREEFALL_CHANCE = 0.28;
  const TOP_SPAWN_PAD = 100, SKY_SPAWN_PAD = 140;
  const BASE_WIND_SCENE0 = -0.01, BASE_WIND_SCENE1 = 0.03;
  const GROUND_OFFSET = -6;

  let canvas = null, ctx = null;
  let LAMP_RECTS = [];
  let groundY = null;
  const parts = [];

  const SPRITE_BANK = { 0: [], 1: [], 2: [], default: [] };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  function preloadSprites() {
    const all = [...LITTER_ALL];
    return Promise.all(
      all.map(src => new Promise(res => {
        const im = new Image();
        im.onload = im.onerror = () => res([src, im]);
        im.src = src;
      }))
    ).then(pairs => {
      const map = new Map(pairs);
      [0,1,2].forEach(k => {
        SPRITE_BANK[k] = (LITTER_PACKS[k] || [])
          .map(s => ({ img: map.get(s), key: keyFromSrc(s) }))
          .filter(o => o.img);
      });
      SPRITE_BANK.default = LITTER_PACK_DEFAULT
        .map(s => ({ img: map.get(s), key: keyFromSrc(s) }))
        .filter(o => o.img);
    });
  }

  function keyFromSrc(src=""){
    const m = src.match(/([^\/]+)\.(png|jpg|jpeg|webp|gif)$/i);
    return m ? m[1].toLowerCase() : "unknown";
  }

  function sizeCanvas() {
    if (!canvas) return;
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    cacheLampRects();
    cacheGroundLine();
  }

  function cacheLampRects() {
    LAMP_RECTS = [];
    if (!canvas) return;

    const cb = canvas.getBoundingClientRect();
    document.querySelectorAll('#lampsRow .lampWrap').forEach(w => {
      const target = w.querySelector('.lamp-hit') || w;
      const r = target.getBoundingClientRect();
      LAMP_RECTS.push({
        x1: r.left  - cb.left,
        x2: r.right - cb.left,
        y1: r.top   - cb.top,
        y2: r.bottom- cb.top
      });
    });
  }

  function cacheGroundLine() {
    groundY = null;
    if (!canvas) return;
    const g = document.getElementById('lampsGroundStack') || document.getElementById('lampsGroundBase');
    if (!g) return;

    const cb = canvas.getBoundingClientRect();
    const gb = g.getBoundingClientRect();
    groundY = (gb.bottom - cb.top) + GROUND_OFFSET; // bottom edge
  }

  function pickSpriteForScene(sceneIdx){
    const bank = (SPRITE_BANK[sceneIdx] && SPRITE_BANK[sceneIdx].length)
      ? SPRITE_BANK[sceneIdx]
      : SPRITE_BANK.default;
    return bank[(Math.random() * bank.length) | 0] || null; // {img,key}
  }

  function addPart(x, y, vx, vy, sprite) {
    if (parts.length >= MAX_PARTS) {
      const idx = parts.findIndex(p => !p.settled);
      if (idx >= 0) parts.splice(idx, 1);
      else parts.shift();
    }

    const img = sprite?.img || null;
    const key = sprite?.key || "unknown";
    const phys = { ...DEFAULT_PHYS, ...(ITEM_PHYS[key] || {}) };

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
      spin: rand(-0.015, 0.015) * phys.spin,
      img, w, h,
      flip: Math.random() < 0.35 ? -1 : 1,
      settled: false,
      phys, key
    });
  }

  // public API: spawn near current lamps (asymmetric + some sky freefalls)
  window.spawnLampLitter = function(sceneIdx = 0, count = 6) {
    if (!(canvas && canvas.width && LAMP_RECTS.length)) return;

    const W = canvas.width;

    for (let i = 0; i < count; i++) {
      const sprite = pickSpriteForScene(sceneIdx);

      if (Math.random() < FREEFALL_CHANCE) {
        const x = rand(-40, W + 40);
        const y = rand(-SKY_SPAWN_PAD, 0);
        const vx = rand(-0.5, 0.5) + (sceneIdx ? BASE_WIND_SCENE1 : BASE_WIND_SCENE0);
        const vy = rand(0.6, 1.2);
        addPart(x, y, vx, vy, sprite);
        continue;
      }

      const rect = pick(LAMP_RECTS);
      let x = rand(rect.x1 - LAMP_WANDER_PX, rect.x2 + LAMP_WANDER_PX);
      let y = rect.y1 - rand(20, TOP_SPAWN_PAD);
      x = Math.max(-60, Math.min(W + 60, x));
      const vx = rand(-0.6, 0.6) + (sceneIdx ? BASE_WIND_SCENE1 : BASE_WIND_SCENE0);
      const vy = rand(0.5, 1.15);

      addPart(x, y, vx, vy, sprite);
    }
  };

  // cheap value-noise for wind jitter
  let __turbTick = 1.0;
  function turb(x, y) {
    return Math.sin((x + __turbTick) * 0.007) * 0.7 +
           Math.sin((y - __turbTick * 0.6) * 0.013) * 0.3;
  }

  function lampIndexAtCanvasPoint(x, y){
    for (let i = 0; i < LAMP_RECTS.length; i++){
      const r = LAMP_RECTS[i];
      if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return i;
    }
    return -1;
  }

  function updateCanvasCursorForLamp(e){
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const overLamp = lampIndexAtCanvasPoint(x, y) >= 0;
    canvas.style.cursor = overLamp ? "pointer" : "default";
  }

  function handleCanvasClick(e){
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (lampIndexAtCanvasPoint(x, y) >= 0){
      window.__toggleLamps?.();
      e.stopPropagation();
      e.preventDefault();
    }
  }

  function handleHoverMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const influenceRadius = 160;
    const impulseStrength = 0.25;

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx*dx + dy*dy;
      if (d2 < influenceRadius * influenceRadius) {
        const falloff = 1 - Math.sqrt(d2) / influenceRadius;
        p.settled = false;
        const mult = (p.phys?.cursor ?? 1.0);
        p.vx  += dx * impulseStrength * falloff * -0.03 * mult;
        p.vy  += dy * impulseStrength * falloff * -0.03 * mult;
        p.spin += (Math.random() - 0.5) * 0.02 * (p.phys?.spin ?? 1.0);
      }
    }
  }

  function enableLitterDrag() {
    canvas.addEventListener("mousemove", handleHoverMove);
    canvas.addEventListener("mousemove", updateCanvasCursorForLamp);
    canvas.addEventListener("click", handleCanvasClick);
  }

  function loop() {
    if (!(ctx && canvas)) return requestAnimationFrame(loop);
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    __turbTick += 1.0;
    const wind = 0;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const phys = p.phys || DEFAULT_PHYS;

      if (!p.settled) {
        p.vx  += wind * WIND_K;
        p.vy  += GRAVITY * phys.g;
        p.vx *= (1 - phys.air);
        p.vy *= (1 - phys.air * 0.60);
        p.vy -= Math.abs(p.vx) * phys.lift;

        const jitterX = turb(p.x, p.y) * 0.02 * phys.turb;
        const jitterY = turb(p.y, p.x) * 0.015 * phys.turb;
        p.vx += jitterX;
        p.vy += jitterY * 0.2;

        p.x   += p.vx;
        p.y   += p.vy;
        p.rot += p.spin;

        if (groundY != null) {
          const bottom = p.y + (p.h * 0.5);
          if (bottom >= groundY) {
            p.y = groundY - (p.h * 0.5);
            p.vy = 0;
            p.vx *= phys.impact;
            p.spin *= phys.impact * 0.9;
            p.settled = true;
          }
        }
      } else {
        p.x   += p.vx;
        p.rot += p.spin;
        p.vx  *= (p.phys?.groundFriction ?? FRICTION);
        p.spin *= (p.phys?.rotFriction ?? ROT_FRICTION);
        if (Math.abs(p.vx) < STOP_EPS) p.vx = 0;
        if (Math.abs(p.spin) < 0.002)  p.spin = 0;
      }

      if (p.y > H + 60 || p.x < -80 || p.x > W + 80) { parts.splice(i, 1); continue; }

      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(p.rot);
      ctx.scale(p.flip, 1);

      if (p.img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(p.img, -p.w/2, -p.h/2, p.w, p.h);
      } else {
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
    canvas.style.pointerEvents = "auto";
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    enableLitterDrag();
    requestAnimationFrame(loop);
  }

  window.__refreshLampLitterRects = cacheLampRects;
  window.__refreshLampGroundLine  = cacheGroundLine;

  document.addEventListener("DOMContentLoaded", init);
  init();
  preloadSprites();
})();

/* ---------- HELPERS ---------- */
function disableCityClicks(){
  const r = document.getElementById("cityClickRouter");
  if (r){ r.style.display = "none"; r.style.pointerEvents = "none"; r.style.cursor = "default"; }
  const hit = document.getElementById("cityHit"); if (hit) hit.style.pointerEvents = "none";
  const sparks = document.getElementById("citySparks"); if (sparks) sparks.style.display = "none";
  const bgCity = document.getElementById("bgCity"); if (bgCity) bgCity.style.cursor = "default";
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
  const hit = document.getElementById("cityHit"); if (hit) hit.style.pointerEvents = show ? "auto" : "none";
  const sparks = document.getElementById("citySparks"); if (sparks) sparks.style.display = show ? "block" : "none";
  const bgCity = document.getElementById("bgCity"); if (bgCity) bgCity.style.cursor = show ? "crosshair" : "default";
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
    im.src = src; im.alt = classBase + " stage " + i;
    im.style.opacity = (i === 0 ? "1" : "0");
    el.appendChild(im);
  });
}

/* ---------- Per-scene lamp configs ---------- */
function setLampConfig(containerSel, config){
  const wraps = document.querySelectorAll(containerSel + " .lampWrap");
  wraps.forEach((wrap) => {
    if (!wrap.querySelector(".lamp-glow")) {
      const glow = document.createElement("div"); glow.className = "lamp-glow";
      const beam = document.createElement("div"); beam.className = "lamp-beam";
      wrap.appendChild(glow); wrap.appendChild(beam);
      wrap.classList.remove("on");
    }
    if (!wrap.querySelector(".lamp-hit")) {
      const hit = document.createElement("div"); hit.className = "lamp-hit";
      wrap.appendChild(hit);
    }

    const css = wrap.style;
    css.setProperty("--bx",   config.bx);
    css.setProperty("--by",   config.by);
    css.setProperty("--bw",   config.bw);
    css.setProperty("--bh",   config.bh);

    css.setProperty("--beamW", config.beamW);
    css.setProperty("--beamH", config.beamH);
    css.setProperty("--beamY", config.beamY);

    /* new: oval controls + hue */
    css.setProperty("--gScaleX", config.gScaleX || "1");
    css.setProperty("--gScaleY", config.gScaleY || "1");
    css.setProperty("--hue",     config.hue || "40deg");

    /* circle vs street styles */
    wrap.classList.toggle("isLantern", !!config.beamCircle);
    wrap.classList.toggle("isStreet",  !config.beamCircle);
  });

  window.__refreshLampLitterRects?.();
}


/* Lantern (circle) */
const LANTERN_CFG = {
  beamCircle: true,
  bx: "calc(50% + 55px)",
  by: "calc(22% + 200px)",
  bw: "64px",  bh: "64px",
  beamD: "220px",
  beamYOffset: "-60px",
  beamW: "260px", beamH: "260px", beamY: "20px",
  hue: "40deg",
  glowOn: "0.95",
  beamOn: "0.90",
  hitW: "110px", hitH: "65%", hitTop: "200px"
};

/* Streetlight (cone) */
const STREETLIGHT_CFG = {
  beamCircle: false,
  /* bulb center */
  bx:  "calc(50% + 60px)",   // was +6px → nudge RIGHT
  by:  "calc(8% + 180px)",   // was +148px → push DOWN

  /* inner glow size */
  bw:  "60px",
  bh:  "60px",
  /* oval shaping */
  gScaleX: "1.35",       // wider
  gScaleY: "0.75",       // flatter
  /* cone footprint */
  beamW: "330px",            // a touch wider
  beamH: "400px",            // a bit longer
  beamY: "30px",             // distance from bulb → cone apex (slightly shorter after moving bulb down)

  /* color & intensity */
  hue:    "200deg",          // cooler blue-white
  glowOn: "1.00",            // max (CSS opacity caps at 1)
  beamOn: "0.98",

  /* click zone (unchanged) */
  hitW: "110px",
  hitH: "65%",
  hitTop: "200px"
};


/* ---------- Lamps ON/OFF ---------- */
window.__lampsOn = false;

function __setLampsOn(on){
  document.querySelectorAll("#lampsRow .lampWrap")
    .forEach(w => w.classList.toggle("on", on));
  window.__lampsOn = on;

  if (on){
    document.querySelectorAll("#lampsRow .lampWrap")
      .forEach(w => {
        w.classList.add("flicker");
        setTimeout(()=> w.classList.remove("flicker"), 900);
      });
  }
  window.dispatchEvent(new CustomEvent("lamps:state", { detail:{ on } }));
  window.addEventListener("lamps:state", (e)=>{
  const on = !!e.detail?.on;
  window.__smokeEnable?.(on);     // emit only when ON
});
}
window.__toggleLamps = function(){ __setLampsOn(!window.__lampsOn); };

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

/* ---------- CROSSFADES & CONFIG SWITCHES ---------- */
function buildCrossfade(){
  const HOLD_START = XFADE_HOLD_START, HOLD_END = XFADE_HOLD_END;
  const segs = LAMP_SRC.length - 1;
  const segDur = (1 - HOLD_START - HOLD_END) / segs;
  const tl = gsap.timeline({ paused: true });

  // on scrub TO stage 1 → swap to streetlight & force OFF
  const tToStreet = HOLD_START + 1 * segDur + 0.001;
  tl.add(() => {
    setLampConfig("#lampsScene", STREETLIGHT_CFG);
    __setLampsOn(false);
  }, tToStreet);

  // on scrub BACK to the very start → restore lantern & OFF
  tl.add(() => {
    setLampConfig("#lampsScene", LANTERN_CFG);
    __setLampsOn(false);
  }, 0);

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
/* ================== CHIMNEY + FACTORY SMOKE ================== */
/* ================== CHIMNEY + FACTORY SMOKE (sprite-based, pooled) ================== */
(() => {
  const cvs = document.getElementById('smokeCanvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d', { alpha:true });

  /* ------- ASSETS (put your PNGs in /images/smoke/ ) ------- */
  const DRIFT_SRCS = [
    "images/smoke/drift_puff_01.png",
    "images/smoke/drift_puff_02.png",
    "images/smoke/drift_puff_03.png",
    "images/smoke/drift_puff_04.png",
    "images/smoke/drift_puff_05.png",
    "images/smoke/drift_puff_06.png"
  ];
  const puffImgs = [];
  let assetsReady = false;

  function preloadPuffs() {
    return Promise.all(DRIFT_SRCS.map(src => new Promise(res => {
      const im = new Image();
      im.onload = im.onerror = () => res(im);
      im.src = src;
    }))).then(arr => { puffImgs.push(...arr.filter(Boolean)); assetsReady = true; });
  }
  preloadPuffs();

  /* ------- PERF / TUNING ------- */
  const MAX_PARTS       = 360;  // cap particles
  const TARGET_FPS      = 30;   // logic tick
  const BASE_SPAWN      = 1.0;  // global density multiplier
  const DRAG            = 0.985;
  const CEILING_FRAC    = 0.18; // fraction of H where smoke “hits the ceiling”
  const CEILING_SPREAD  = 0.020; // extra lateral spread when above ceiling
  const LIFT_BASE       = -0.050; // baseline rise (negative y velocity)
  const LIFT_JITTER     = -0.030; // random extra rise
  const WIND_K          = 0.06;  // wind effect scaler
  const FADE_PER_SEC    = 0.30;  // life decay per second (0..1)
const NEAR_SCALE = [0.05, 0.20];  // near chimneys (houses)
const FAR_SCALE  = [0.03, 0.09];  // far factories / back houses
  const NEAR_ALPHA      = [0.55, 0.85];
  const FAR_ALPHA       = [0.45, 0.72];

  // “Top smog” blanket targets per scene (fills down from the top)
  const SMOG = {
    0: { a: 0.15, h: 0.28 },
    1: { a: 0.25, h: 0.42 },
    2: { a: 0.38, h: 0.58 },
  };
  let smogAlpha  = 0;
  let smogHeight = 0;

  // Scene multipliers (density)
  const SCENE_MULT = { 0: 0.65, 1: 1.00, 2: 1.40 };

  // Lamp + scene state (fed externally)
  let lampsOn = false;
  let currentScene = 0;
  let globalWind = 0; // gentle ± value set from your litter wind

  // Resize
  function size() {
    const w = cvs.clientWidth | 0;
    const h = cvs.clientHeight | 0;
    if (cvs.width !== w || cvs.height !== h) {
      cvs.width = w; cvs.height = h;
    }
  }
  size(); addEventListener('resize', size);

  /* ------- Emitters (percent positions, easy to line up with art) ------- */
  // depth: 'near' or 'far'; rate ≈ particles/sec at SCENE_MULT=1 when lamps ON
  const EMITTERS = {
    0: [ // Lantern scene — 3 house chimneys, lighter
  { xPct: 5,  yPct: 50, rate: 14, depth: 'far' },
  { xPct: 73, yPct: 68, rate: 16, depth: 'near' },
  { xPct: 92, yPct: 51, rate: 14, depth: 'far' },
    ],


    1: [ // Streetlight scene — more chimneys + distant factories
     // --- NEAR (green) — house roofs ---
  { xPct: 16, yPct: 48, rate: 18, depth: 'near' }, // left house
  { xPct: 66, yPct: 49, rate: 20, depth: 'near' }, // middle house
  { xPct: 41, yPct: 50, rate: 18, depth: 'near' }, // right house
{ xPct: 86, yPct: 50, rate: 10, depth: 'near' }, // right house

  // --- FAR (orange) — skyline stacks ---
  { xPct: 22, yPct: 17, rate: 26, depth: 'far' },  // far-left tall stack
  { xPct: 85, yPct: 16, rate: 26, depth: 'far' },  // far-right tall stack
  { xPct: 56, yPct: 32, rate: 20, depth: 'far' },  // far-right tall stack
    { xPct: 51, yPct: 32, rate: 20, depth: 'far' },  // far-right tall stack

    ],


    2: [ // Later streetlight — densest, more factories
      // --- NEAR (green) — house roofs ---
  { xPct: 16, yPct: 48, rate: 18, depth: 'near' }, // left house
  { xPct: 66, yPct: 49, rate: 20, depth: 'near' }, // middle house
  { xPct: 41, yPct: 50, rate: 18, depth: 'near' }, // right house
{ xPct: 86, yPct: 50, rate: 10, depth: 'near' }, // right house

  // --- FAR (orange) — skyline stacks ---
  { xPct: 22, yPct: 17, rate: 26, depth: 'far' },  // far-left tall stack
  { xPct: 85, yPct: 16, rate: 26, depth: 'far' },  // far-right tall stack
  { xPct: 56, yPct: 32, rate: 20, depth: 'far' },  // far-right tall stack
    { xPct: 51, yPct: 32, rate: 20, depth: 'far' },  // far-right tall stack

    ],
  };

  // Expose a tiny API so you can tweak anchors live if needed
  window.__smokeSetEmitters = (sceneIdx, list) => { EMITTERS[sceneIdx|0] = list || []; };

  /* ------- Pool & Parts ------- */
  const parts = [];
  const pool  = [];
  function getPart(){ return pool.pop() || {}; }
  function freePart(p){ pool.push(p); }

  function rand(a, b){ return a + Math.random() * (b - a); }
  function pick(arr){ return arr[(Math.random() * arr.length) | 0]; }

  function spawn(ex, ey, near=true) {
    if (!assetsReady || !puffImgs.length) return;
    const p = getPart();
    p.x = ex + rand(-6, 6);
    p.y = ey + rand(-2, 2);
    p.vx = rand(-0.12, 0.12);
    p.vy = LIFT_BASE + rand(LIFT_JITTER * 0.5, LIFT_JITTER); // rising up (negative)
    p.rot = rand(0, Math.PI * 2);
    p.img = pick(puffImgs);
    p.depth = near ? 'near' : 'far';
    p.s = near ? rand(NEAR_SCALE[0], NEAR_SCALE[1]) : rand(FAR_SCALE[0], FAR_SCALE[1]);
    p.aBase = near ? rand(NEAR_ALPHA[0], NEAR_ALPHA[1]) : rand(FAR_ALPHA[0], FAR_ALPHA[1]);
    p.life = 1.0; // 1 → 0
    parts.push(p);
    if (parts.length > MAX_PARTS) freePart(parts.shift());
  }

  /* ------- State wiring from your app ------- */
  addEventListener('lamps:state', (e) => { lampsOn = !!e.detail?.on; });

  // Accept both names (you used both in your code)
  function setScene(idx){ currentScene = (idx|0); }
  window.__setSmokeScene = setScene;
  window.__smokeSetScene = setScene;

  window.__smokeSetWind = (w) => { globalWind = +w || 0; };

  window.__smokeEnable = (on) => {
    // If you ever want to hard stop & clear immediately:
    if (!on) { for (let i=parts.length-1;i>=0;i--) freePart(parts.pop()); }
    lampsOn = !!on;
  };

  /* ------- Main loop (throttled logic) ------- */
  let last = performance.now(), acc = 0;
  function raf(now){
    const dt = now - last; last = now;
    acc += dt;
    const step = 1000 / TARGET_FPS;
    while (acc >= step) { update(step/1000); acc -= step; }
    render();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  function update(dt) {
    size();
    const W = cvs.width, H = cvs.height;
    const ceilY = CEILING_FRAC * H;

    // Emit
    if (lampsOn) {
      const emitters = EMITTERS[currentScene] || [];
      const dens = SCENE_MULT[currentScene] ?? 1;
      const k = BASE_SPAWN * dens * dt; // scalar

      for (let i=0;i<emitters.length;i++){
        const e = emitters[i];
        const ex = (e.xPct/100) * W;
        const ey = (e.yPct/100) * H;
        const near = e.depth !== 'far';

        // Poisson-ish spawn count
        e._carry = (e._carry || 0) + e.rate * k;
        const n = e._carry | 0;
        e._carry -= n;
        for (let j=0;j<n;j++) spawn(ex, ey, near);
      }
    }

    // Physics
    for (let i=parts.length-1;i>=0;i--){
      const p = parts[i];

      // wind + rise
      p.vx += globalWind * WIND_K * (p.depth === 'near' ? 1.0 : 0.65);
      p.vy += -0.012; // constant tug upwards

      // ceiling behavior → flatten outward
      if (p.y < ceilY) {
        p.vx += rand(-CEILING_SPREAD, CEILING_SPREAD);
        p.vy = Math.min(p.vy, -0.02);
      }

      // decay & motion
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.x  += p.vx * (dt * 60);
      p.y  += p.vy * (dt * 60);
      p.rot += 0.0009 * (dt * 1000);

      // fade out
      p.life -= FADE_PER_SEC * dt;
      if (p.life <= 0 || p.y < -120) {
        freePart(parts.splice(i,1)[0]);
      }
    }

    // Smog blanket easing (only while lampsOn)
    const tgt = SMOG[currentScene] || SMOG[1];
    const mul = lampsOn ? 1 : 0;
    smogAlpha  += ((tgt.a * mul) - smogAlpha) * 0.05;
    smogHeight += ((tgt.h * mul) - smogHeight) * 0.045;
  }

  function render() {
    const W = cvs.width, H = cvs.height;
    ctx.clearRect(0,0,W,H);

    // You can sort by depth to draw far first (soft layering)
    // Simple pass: draw all (they have different alpha/scale anyway)
    for (let i=0;i<parts.length;i++){
      const p = parts[i];
      const img = p.img; if (!img) continue;
      const w = img.width * p.s, h = img.height * p.s;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.aBase * p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(img, -w/2, -h/2, w, h);
      ctx.restore();
    }

    // Top smog
    if (smogAlpha > 0.002 && smogHeight > 0.001) {
      const hpx = smogHeight * H;
      const g = ctx.createLinearGradient(0,0,0,hpx);
      g.addColorStop(0.00, `rgba(15,15,20,${smogAlpha})`);
      g.addColorStop(0.55, `rgba(15,15,20,${smogAlpha*0.66})`);
      g.addColorStop(1.00, `rgba(15,15,20,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0,0,W,hpx);
    }
  }
})();


/* ---------- INIT ---------- */
const ALL = [
  ...LAMP_SRC, ...GROUND_SRC, ...NEAR_SRC, ...FAR_SRC, NEAR_REF,
  ...LITTER_ALL
];

preload(ALL).then(async () => {
  await setNearAspectFromRef();

  buildGroundStack();
  buildFarParallax();
  buildNearParallax();
  buildLampRow(5);

  // Chimney anchors for SCENE 0 (lantern scene)
window.__smokeSetEmitters(0, [
  // LEFT roof (back row)
  { xPct: 5,  yPct: 50, rate: 14, depth: 'far' },

  // SMALL house between lamp 4 & 5 (front/near)
  { xPct: 73, yPct: 68, rate: 16, depth: 'near' },

  // RIGHT roof (back row)
  { xPct: 92, yPct: 51, rate: 14, depth: 'far' },
]);

/* -------------------------------
   Scene 1 emitters (city streetlights)
-------------------------------- */
window.__smokeSetEmitters(1, [
    // --- NEAR (green) — house roofs ---
  { xPct: 16, yPct: 48, rate: 18, depth: 'near' }, // left house
  { xPct: 66, yPct: 49, rate: 20, depth: 'near' }, // middle house
  { xPct: 41, yPct: 50, rate: 18, depth: 'near' }, // right house
{ xPct: 86, yPct: 50, rate: 10, depth: 'near' }, // right house

  // --- FAR (orange) — skyline stacks ---
  { xPct: 22, yPct: 17, rate: 26, depth: 'far' },  // far-left tall stack
  { xPct: 85, yPct: 16, rate: 26, depth: 'far' },  // far-right tall stack
  { xPct: 56, yPct: 32, rate: 20, depth: 'far' },  // far-right tall stack
    { xPct: 51, yPct: 32, rate: 20, depth: 'far' },  // far-right tall stack

]);

  /* start in lantern style, lights OFF */
  setLampConfig("#lampsScene", LANTERN_CFG);
  __setLampsOn(false);

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
      xfade.progress(self.progress);

      // litter spawns tied to scroll distance
      window.__litterTick ??= { p:0, acc:0, wind:0 };
      const LT = window.__litterTick;
      const p  = self.progress;
      const dp = p - LT.p;

      if (p < XFADE_HOLD_START) LT.acc += 40;
      LT.acc  += Math.abs(dp) * 1000;
      LT.wind += (Math.random() - 0.5) * 60;
      LT.p     = p;

      const sceneIdx = sceneFromProgress(p);
      window.__smokeSetScene?.(sceneIdx);                         // ← set which anchors
  window.__smokeSetWind?.((window.__litterTick?.wind ?? 0)*0.02); // ← gentle wind

      while (LT.acc > 85){
        window.spawnLampLitter?.(sceneIdx, 4 + (Math.random()*4|0));
        LT.acc -= 85;
      }

      gsap.set("#parallaxNearStack", { x: 0 });
      gsap.set("#parallaxFarStack",  { x: 0 });
      
    },
    onRefresh(){},
    invalidateOnRefresh: true,
    onRefreshInit(){ xfade.progress(0); }
  });

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

/* ---------- SEED (optional) ---------- */
function __seedInitialLitter(){
  requestAnimationFrame(()=>{
    window.__refreshLampLitterRects?.();
    window.spawnLampLitter?.(0, 28);
  });
}
