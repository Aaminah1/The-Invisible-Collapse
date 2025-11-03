(() => {
  if (window.__LAMPS_SINGLETON__) {
    console.warn("lamps script already loaded; skipping re-init");
    return;
  }
  window.__LAMPS_SINGLETON__ = true;

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- GLOBAL SCROLL SPEED CONTROL ---------- */
  /* Larger = slower. 2000vh ≈ 20 screens of scrolling. Adjust if you want even slower/faster. */
  const LAMPS_PIN_VH = 2000;
  function computePinLenPx(){
    return Math.round(window.innerHeight * (LAMPS_PIN_VH / 100));
  }

  /* ---------- ASSETS ---------- */
  const LAMP_SRC = [
    "images/lampost1.png",     // stage 0 → lantern
    "images/lampost3.png",     // stage 1 → streetlight
    "images/lampost4.1.png",   // stage 2 → later streetlight (build-up)
    "images/lampost4.1.png",   // stage 3 → later streetlight (blackout, same art)
  ];

  const GROUND_SRC = [
    "images/ground_stage5.png",
    "images/ground_stage6.png",
    "images/ground_stage8.png",
    "images/ground_stage8.png",
  ];

  const NEAR_SRC = [
    "images/city1.png",
    "images/city3.png",
    "images/city4.png",
    "images/city4.png",
  ];

  const FAR_SRC = [
    "images/cityfar_1.png",
    "images/cityfar_3.png",
    "images/cityfar_4.png",
    "images/cityfar_4.png"
  ];

  const NEAR_REF = "images/constructioncity_near.png";

  /* Track whether the user has explicitly chosen a state via click.
     null = no override (allow scene logic), 'on' | 'off' = respect user choice. */
  window.__lampsUserOverride = null;

  /* Route the public toggle through an override setter */
  function __applyUserOverride(nextOn){
    window.__lampsUserOverride = nextOn ? 'on' : 'off';
    __setLampsOn(nextOn, { noFlicker:true });
    // When user clicks, also clear any smoke program override (keeps it simple)
    window.__smokeSetBoost?.(null);
  }
  window.__toggleLamps = function () {
    __applyUserOverride(!window.__lampsOn);
  };

  /* ---- Equal scene quarters + crossfade timing ---- */
  /* Scenes: [0..0.25) lantern, [0.25..0.5) street, [0.5..0.75) late-street, [0.75..1] blackout */
  const CUT1 = 0.25;
  const CUT2 = 0.50;
  const CUT3 = 0.75;

  /* Keep all image crossfades inside the first 75% (3 segments x 25%) */
  const XFADE_HOLD_START = 0.00;
  const XFADE_HOLD_END   = 0.25;     // last quarter strictly for blackout scene visuals
  const XFADE_SEGS       = (LAMP_SRC.length - 1); // should be 3 with 4 imgs
  const XFADE_SEG_DUR    = (1 - XFADE_HOLD_START - XFADE_HOLD_END) / XFADE_SEGS; // 0.25

  function sceneFromProgress(p){
    if (p < CUT1) return 0;  // lantern
    if (p < CUT2) return 1;  // streetlight
    if (p < CUT3) return 2;  // late streetlight (build-up)
    return 3;                // blackout
  }

  /* ---- LITTER PACKS ---- */
  const LITTER_PACKS = {
    0: ["images/litter/paper.png","images/litter/receipt.png","images/litter/trash.png","images/litter/rock.png"],
    1: [
      "images/litter/coffee.png","images/litter/moderncoffee.png","images/litter/chippacket.png",
      "images/litter/tupperware.png","images/litter/waterbottle.png","images/litter/plasticpacke.png",
      "images/litter/colorcan.png","images/litter/wine.png","images/litter/mask.png",
      "images/litter/waterbottle.png","images/litter/plasticpacke.png","images/litter/colorcan.png",
      "images/litter/wine.png","images/litter/mask.png"
    ],
    2: ["images/litter/waterbottle.png","images/litter/plasticpacke.png","images/litter/colorcan.png","images/litter/wine.png","images/litter/mask.png"]
  };
  const LITTER_PACK_DEFAULT = ["images/litter/plasticpacke.png", "images/litter/rock.png"];
  const LITTER_ALL = [...new Set([...LITTER_PACK_DEFAULT, ...Object.values(LITTER_PACKS).flat()])];

  /* ---------- PER-ITEM PHYS ---------- */
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

/* ================== LITTER CANVAS ================== */
/* ================== LITTER CANVAS ================== */
(() => {
  // --- screen-edge walls for litter ---
  const WALL_MARGIN   = 12;   // how close to the edge before we clamp/bounce
  const WALL_REST_AIR = 0.35; // bounce energy when airborne
  const WALL_REST_GND = 0.20; // bounce energy when on ground (lower = deader)
  const WALL_EDGE_FRI = 0.90; // extra friction when scraping along wall
  const WALL_SPIN_KICK = 0.008; // ↓ reduced to avoid over-spinning on wall hits

  function handleWalls(p, W) {
    const halfW = p.w * 0.5;
    const leftLimit  = WALL_MARGIN + halfW;
    const rightLimit = W - WALL_MARGIN - halfW;

    // Too far left: clamp & bounce
    if (p.x < leftLimit) {
      p.x = leftLimit;
      p.vx = Math.abs(p.vx) * (p.settled ? WALL_REST_GND : WALL_REST_AIR);
      p.spin += WALL_SPIN_KICK * (0.5 + Math.random());
      // scrape friction
      p.vx *= WALL_EDGE_FRI;
    }
    // Too far right: clamp & bounce
    else if (p.x > rightLimit) {
      p.x = rightLimit;
      p.vx = -Math.abs(p.vx) * (p.settled ? WALL_REST_GND : WALL_REST_AIR);
      p.spin -= WALL_SPIN_KICK * (0.5 + Math.random());
      p.vx *= WALL_EDGE_FRI;
    }
  }

  // --- spin governor (keeps angular velocity sensible) ---
  const SPIN_MAX_HARD   = 0.12;  // absolute max |spin| (rad/frame)
  const SPIN_SOFT_CAP   = 0.08;  // start damping more aggressively above this
  const SPIN_BASE_DAMP  = 0.985; // mild baseline damping every frame
  const SPIN_GROUND_DMP = 0.92;  // extra damping when settled

  function limitSpin(p){
    // mild baseline damping always
    p.spin *= SPIN_BASE_DAMP;

    // extra damping when resting on ground (prevents “stuck spinning” look)
    if (p.settled) p.spin *= SPIN_GROUND_DMP;

    // soft cap → if above threshold, damp progressively harder
    const a = Math.abs(p.spin);
    if (a > SPIN_SOFT_CAP){
      const over = Math.min(1.5, (a - SPIN_SOFT_CAP) / (SPIN_MAX_HARD - SPIN_SOFT_CAP)); // 0..~1.5
      const extra = 0.90 - over * 0.25;   // 0.90 → 0.525
      p.spin *= Math.max(0.52, extra);
    }

    // hard clamp
    if (p.spin >  SPIN_MAX_HARD) p.spin =  SPIN_MAX_HARD;
    if (p.spin < -SPIN_MAX_HARD) p.spin = -SPIN_MAX_HARD;
  }

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

  // --- breath-driven wind controls for litter ---
  let __LITTER_WIND_X = 0;      // continuous side push from mic (pixels/frame-ish)
  let __LITTER_LIFT   = 0;      // small upward lift from strong breath (for airborne only)
  let __LITTER_GUST   = 0;      // short-lived burst impulse

  // external setters (mic-wind.js will call these)
  window.__litterSetWind  = (wx = 0, lift = 0) => { __LITTER_WIND_X = +wx || 0; __LITTER_LIFT = +lift || 0; };
  window.__litterBurst    = (power = 1)        => { __LITTER_GUST = Math.max(__LITTER_GUST, +power || 0); };

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

    const target = Math.random() * (SIZE_RANGE[1]-SIZE_RANGE[0]) + SIZE_RANGE[0];
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
      rot: (Math.random()*Math.PI*2) - Math.PI,
      spin: (Math.random()-0.5) * 0.03 * phys.spin,
      img, w, h,
      flip: Math.random() < 0.35 ? -1 : 1,
      settled: false,
      phys, key
    });
  }

  // public API
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

  // jitter
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

        // ↓ reduced hover spin impulse so nothing re-ignites too fast
        p.spin += (Math.random() - 0.5) * 0.012 * (p.phys?.spin ?? 1.0);
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

    for (let i = parts.length - 1; i >= 0; i--) {
      const p   = parts[i];
      const phys = p.phys || DEFAULT_PHYS;

      // live wind values each frame
      const WIND_PUSH = __LITTER_WIND_X;   // ~ 0..0.6 typical
      const LIFT_PUSH = __LITTER_LIFT;     // only for airborne
      const sail = (phys?.turb ?? 0.6) * 0.65 + (phys?.lift ?? 0.01) * 10; // “sail-ness”
      const light = 1.0 / Math.max(0.6, (phys?.g ?? 0.9));                 // lighter = more

      if (!p.settled) {
        // ---------- AIRBORNE PHYSICS ----------
        p.vx *= (1 - phys.air);
        p.vy *= (1 - phys.air * 0.60);
        p.vy += GRAVITY * phys.g;
        p.vy -= Math.abs(p.vx) * phys.lift;

        const jitterX = turb(p.x, p.y) * 0.02 * phys.turb;
        const jitterY = turb(p.y, p.x) * 0.015 * phys.turb;
        p.vx += jitterX;
        p.vy += jitterY * 0.2;

        // breath wind (airborne)
        p.vx += WIND_PUSH * sail * 0.12;
        p.vy -= Math.abs(WIND_PUSH) * 0.02 * (phys?.lift ?? 0.01) * 11;
        p.vy -= LIFT_PUSH * 0.015;

        // gust (airborne)
        if (__LITTER_GUST > 0) {
          const g = __LITTER_GUST;
          p.vx += (WIND_PUSH >= 0 ? 1 : -1) * 0.45 * g * light * (0.8 + Math.random()*0.4);
          p.vy -= 0.10 * g * light * (0.8 + Math.random()*0.4);
        }

        p.x   += p.vx;
        p.y   += p.vy;
        p.rot += p.spin;

        // apply spin governor here
        limitSpin(p);

        // ground collision
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
        // ---------- ON-GROUND (SETTLED) PHYSICS ----------
        // continuous sideways push along the ground (no lift)
        const baseSlide = (1 - (phys?.groundFriction ?? 0.94)); // slipperier → bigger
        const groundPush = WIND_PUSH * (0.06 + 0.48 * baseSlide) * sail * 0.18;
        p.vx += groundPush;

        // tiny ground jitter so piles “wake up”
        p.vx += turb(p.x * 0.6, p.y) * 0.004 * (0.6 + phys.turb*0.5);

        // gust → strong ground kick (no vertical pop)
        if (__LITTER_GUST > 0) {
          const g = __LITTER_GUST;
          p.vx += Math.sign(WIND_PUSH || 1) * 0.35 * g * light * (0.8 + Math.random()*0.4);
        }

        // integrate & damp
        p.x   += p.vx;
        p.rot += p.spin;
        p.vx  *= (p.phys?.groundFriction ?? FRICTION);
        p.spin*= (p.phys?.rotFriction    ?? ROT_FRICTION);

        // apply spin governor here too (extra ground damping inside)
        limitSpin(p);

        // if it started moving enough, mark un-settled so it keeps creeping
        if (Math.abs(p.vx) > 0.02) p.settled = false;

        // keep clamped to ground line visually
        if (groundY != null) {
          const wantY = groundY - (p.h * 0.5);
          if (Math.abs((p.y - wantY)) > 0.1) p.y = wantY;
        }

        if (Math.abs(p.vx) < STOP_EPS) p.vx = 0;
        if (Math.abs(p.spin) < 0.002)  p.spin = 0;
      }

      // keep inside horizontal bounds (bounce), still cull if far below
      handleWalls(p, W);
      if (p.y > H + 60) { parts.splice(i, 1); continue; }

      // draw
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

    // natural gust decay
    __LITTER_GUST *= 0.86;

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
  function sceneLocalProgress(p){
    // Map p to a clean 0..1 within each equal quarter
    let segIdx, start, end;
    if (p < CUT1){ segIdx = 0; start = 0.00; end = CUT1; }
    else if (p < CUT2){ segIdx = 1; start = CUT1; end = CUT2; }
    else if (p < CUT3){ segIdx = 2; start = CUT2; end = CUT3; }
    else { segIdx = 3; start = CUT3; end = 1.00; }

    const t = Math.max(start, Math.min(p, end));
    const span = Math.max(1e-6, end - start);
    return [segIdx, (t - start) / span];
  }

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
    if (!el) return;
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
  let __CURRENT_LAMP_CFG = null; // track for intensity math

  function setLampConfig(containerSel, config){
    __CURRENT_LAMP_CFG = config;
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
        // make sure clicks always reach the lamp
        hit.style.zIndex = "5";
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

      css.setProperty("--gScaleX", config.gScaleX || "1");
      css.setProperty("--gScaleY", config.gScaleY || "1");
      css.setProperty("--hue",     config.hue || "40deg");

      wrap.classList.toggle("isLantern", !!config.beamCircle);
      wrap.classList.toggle("isStreet",  !config.beamCircle);
    });

    window.__refreshLampLitterRects?.();
  }

  /* Visual intensity (0..1), multiplies current config’s on-levels */
  function __setLampVisualIntensity(t){
    const cfg = __CURRENT_LAMP_CFG || {};
    const glowMax = parseFloat(cfg.glowOn ?? "1") || 1;
    const beamMax = parseFloat(cfg.beamOn ?? "1") || 1;
    const glowTarget = Math.max(0, Math.min(1, glowMax * t));
    const beamTarget = Math.max(0, Math.min(1, beamMax * t));
    document.querySelectorAll("#lampsRow .lampWrap").forEach(w=>{
      const glow = w.querySelector(".lamp-glow");
      const beam = w.querySelector(".lamp-beam");
      if (glow) glow.style.opacity = String(glowTarget);
      if (beam) beam.style.opacity = String(beamTarget);
    });
  }

  /* ---------- Unified lamp intensity driving sprite AND overlays ---------- */
  function __applyLampIntensity(t){
    const clamped = Math.max(0, Math.min(1, t));
    __setLampVisualIntensity(clamped);  // overlays
    // darken/brighten the lamp sprites themselves
    document.querySelectorAll("#lampsRow .lamp").forEach(img=>{
      // Floor brightness high enough to avoid “black” lamps when OFF.
      const b = 0.90 + 0.60 * clamped; // OFF≈0.90, ON≈1.50
      img.style.filter =
        `drop-shadow(0 6px 16px rgba(0,0,0,.35)) brightness(${b.toFixed(3)}) contrast(1.02)`;
    });
    window.__lampIntensity = clamped;   // for debugging
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

  /* Streetlight (cone) — scene 2 */
  const STREETLIGHT_CFG = {
    beamCircle: false,
    bx:  "calc(50% + 60px)",
    by:  "calc(8% + 180px)",
    bw:  "48px",
    bh:  "44px",
    gScaleX: "1.15",
    gScaleY: "0.66",
    beamW: "330px",
    beamH: "400px",
    beamY: "30px",
    hue:    "200deg",
    glowOn: "1.00",
    beamOn: "0.98",
    hitW: "110px", hitH: "65%", hitTop: "200px"
  };

  /* Late Streetlight (harsher, colder) — scene 3 */
  const LATE_STREET_CFG = {
    ...STREETLIGHT_CFG,
    gScaleX: "1.60",
    gScaleY: "0.68",
    beamW: "360px",
    beamH: "460px",
    beamY: "18px",
    hue: "215deg",
    glowOn: "0.88",
    beamOn: "0.96"
  };

  /* degraders (banding/haze/jitter) */
  function __setLampDegrade({ bands=0, haze=0, jitter=0 }){
    document.querySelectorAll("#lampsRow .lampWrap").forEach(w=>{
      w.style.setProperty("--beamBands", String(Math.max(0, Math.min(1, bands))));
      w.style.setProperty("--beamHaze",  String(Math.max(0, Math.min(1, haze))));
      const glow = w.querySelector(".lamp-glow");
      const beam = w.querySelector(".lamp-beam");
      if (glow) glow.style.filter = `brightness(${(1 + jitter*0.08).toFixed(3)})`;
      if (beam) beam.style.filter = `brightness(${(1 + jitter*0.10).toFixed(3)})`;
    });
  }
  function __setLampVisualIntensityIfOn(base){
    const t = window.__lampsOn ? Math.max(0, Math.min(1, base)) : 0;
    __applyLampIntensity(t);
  }

  /* ---------- Lamps ON/OFF ---------- */
  window.__lampsOn = false;

  function __setLampsOn(on, opts = {}) {
    const noFlicker = !!opts.noFlicker;

    document.querySelectorAll("#lampsRow .lampWrap")
      .forEach(w => w.classList.toggle("on", on));
    window.__lampsOn = on;

    // Immediately reflect click in visuals + sprite brightness
    __applyLampIntensity(on ? 1 : 0);

    if (on && !noFlicker) {
      document.querySelectorAll("#lampsRow .lampWrap").forEach(w => {
        w.classList.add("flicker");
        setTimeout(() => w.classList.remove("flicker"), 900);
      });
    }

    // keep smoke perfectly in lockstep with lamp state
    window.__smokeEnable?.(on);

    // broadcast state
    window.dispatchEvent(new CustomEvent("lamps:state", { detail: { on } }));
  }
  window.addEventListener("lamps:state", (e) => {
    const on = !!e.detail?.on;
    window.__smokeEnable?.(on); // safe if duplicate
  });

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
    const segs = XFADE_SEGS;      // 3
    const segDur = XFADE_SEG_DUR; // 0.25
    const tl = gsap.timeline({ paused: true });

    // Scene switches aligned exactly to CUTs (quarter points)
    const tToStreet = CUT1 + 0.0001; // 0.2501
    const tToLate   = CUT2 + 0.0001; // 0.5001

    // Init with lantern
    tl.add(() => {
      const keep = window.__lampsOn;
      setLampConfig("#lampsScene", LANTERN_CFG);
      __setLampsOn(keep, { noFlicker: true });
    }, 0);

    // Scene 1 → streetlight
    tl.add(() => {
      const keep = window.__lampsOn;
      setLampConfig("#lampsScene", STREETLIGHT_CFG);
      __setLampsOn(keep, { noFlicker: true });
    }, tToStreet);

    // Scene 2 → late streetlight (harsher)
    tl.add(() => {
      const keep = window.__lampsOn;
      setLampConfig("#lampsScene", LATE_STREET_CFG);
      __setLampsOn(keep, { noFlicker: true });
    }, tToLate);

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

    // segment starts: 0.00, 0.25, 0.50
    for (let i = 0; i < segs; i++){
      const t = XFADE_HOLD_START + i * segDur;
      fadeLamps(t, i, i + 1);
      fadeContainer(t, "#lampsGroundStack",  "ground", i, i + 1);
      fadeContainer(t, "#parallaxNearStack", "near",   i, i + 1);
      fadeContainer(t, "#parallaxFarStack",  "far",    i, i + 1);
    }
    return tl;
  }

  /* ================== CHIMNEY + FACTORY SMOKE ================== */
  (() => {
    const cvs = document.getElementById('smokeCanvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d', { alpha:true });

    const DRIFT_SRCS = [
      "images/smoke/drift_puff_01.png","images/smoke/drift_puff_02.png","images/smoke/drift_puff_03.png",
      "images/smoke/drift_puff_04.png","images/smoke/drift_puff_05.png","images/smoke/drift_puff_06.png"
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

    /* Tuning */
    const MAX_PARTS       = 520;
    const TARGET_FPS      = 30;
    const BASE_SPAWN      = 1.0;
    const DRAG            = 0.985;
    const CEILING_FRAC    = 0.10;  // rises higher before capping
    const LIFT_BASE       = -0.080; // stronger updraft
    const WIND_K          = 0.10;   // stronger horizontal wind coupling

    const SMOG = { 0:{a:0.06,h:0.16}, 1:{a:0.28,h:0.46}, 2:{a:0.52,h:0.70} };
    let smogAlpha  = 0;
    let smogHeight = 0;

    const SCENE_MULT = { 0:0.28, 1:1.00, 2:1.60 };

    let lampsOn = false;
    let currentScene = 0;
    let globalWind = 0;

    // main override so Scene 3 can force emission even if lamps are off
    let override = null;
    window.__smokeSetBoost = (o)=>{ override = o || null; };

    const SIZE_SCENE  = { 0: 0.50, 1: 1.15, 2: 1.55, 3: 2.40 };
    const SPEED_SCENE = { 0: 0.30, 1: 1.10, 2: 1.45, 3: 2.30 };
    const LIFT_SCENE  = { 0: 0.35, 1: 1.25, 2: 1.55, 3: 1.90 };
    const WIND_SCENE  = { 0: 0.25, 1: 1.00, 2: 1.25, 3: 1.60 };

    // HARD RESET: wipe all visual darkness sources immediately
    window.__smokeHardReset = function(){
      // clear puff particles
      while (parts.length) freePart(parts.pop());
      // clear soot blobs
      soot.length = 0;
      // zero smog curtain immediately
      smogAlpha  = 0;
      smogHeight = 0;
      // forget overrides
      override = null;
    };

    function size() {
      const w = cvs.clientWidth | 0;
      const h = cvs.clientHeight | 0;
      if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
    }
    size(); addEventListener('resize', size);

    const parts = [];
    const pool  = [];
    function getPart(){ return pool.pop() || {}; }
    function freePart(p){ pool.push(p); }

    function rand(a, b){ return a + Math.random() * (b - a); }
    function pick(arr){ return arr[(Math.random() * arr.length) | 0]; }

    addEventListener('lamps:state', (e) => { lampsOn = !!e.detail?.on; });
    function setScene(idx){ currentScene = (idx|0); }
    window.__setSmokeScene = setScene;
    window.__smokeSetScene = setScene;
    window.__smokeSetWind  = (w) => { globalWind = +w || 0; };

    /* ======= SOOT BLOBS (pre-blackout spread) ======= */
    const soot = [];              // {x,y,r,dr,a}
    let sootCfg = { target:0, seed:0, grow:0, jitter:0.4, maxAlpha:0.98 };
// === draw the soot blobs ===
function renderSoot(ctx, W, H){
  if (!soot.length) return;
  ctx.save();
  // slightly heavier blend to darken scene without banding
  ctx.globalCompositeOperation = "multiply";

  for (let i = 0; i < soot.length; i++){
    const b = soot[i];               // {x,y,r,dr,a}
    const r = Math.max(4, b.r);
    const g = ctx.createRadialGradient(b.x, b.y, r*0.15, b.x, b.y, r);
    const a = Math.max(0, Math.min(1, b.a));

    // soft center → feathered edge
    g.addColorStop(0.00, `rgba(10,10,12,${a})`);
    g.addColorStop(0.35, `rgba(10,10,12,${a*0.75})`);
    g.addColorStop(0.70, `rgba(10,10,12,${a*0.40})`);
    g.addColorStop(1.00, `rgba(10,10,12,0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

    function __smokeSetSoot(cfg){
      sootCfg = { ...sootCfg, ...(cfg||{}) };
    }
    window.__smokeSetSoot = __smokeSetSoot;

    function seedSoot(n, W, H){
      for(let i=0;i<n;i++){
        const x = Math.random()*W;
        const y = Math.random()*H*0.55;
        soot.push({ x, y, r: 20+Math.random()*40, dr: 4+Math.random()*10, a: 0.05+Math.random()*0.12 });
      }
    }

    function updateSoot(dt, W, H){
      const want = Math.floor(sootCfg.target * 160); // a bit more capacity
      const deficit = Math.max(0, want - soot.length);
      if (deficit > 0) seedSoot(Math.min(deficit, Math.ceil(sootCfg.seed*dt)), W, H);

      for(let i=soot.length-1;i>=0;i--){
        const b = soot[i];
        b.r  += (sootCfg.grow || 0) * dt;
        b.x  += (Math.random()-0.5) * (sootCfg.jitter*2);
        b.y  += (Math.random()-0.5) * (sootCfg.jitter*2);
        b.a   = Math.min(sootCfg.maxAlpha, b.a + 0.25*dt);
        if (b.r > Math.max(W,H)*2.0) soot.splice(i,1);
      }
    }

    window.__smokeEnable = (on) => {
      if (!on) { for (let i=parts.length-1;i>=0;i--) freePart(parts.pop()); }
      lampsOn = !!on;
    };

    function spawn(ex, ey, near=true) {
      if (!assetsReady || !puffImgs.length) return;

      const speedMul = (override && override.speed) || (SPEED_SCENE[currentScene] || 1);
      const sizeMul  = (override && override.size)  || (SIZE_SCENE[currentScene]  || 1);

      const p = getPart();
      p.x = ex + rand(-6, 6);
      p.y = ey + rand(-2, 2);

      const windMul = (override && override.wind) || (WIND_SCENE[currentScene] || 1);
      p.vx = rand(-0.12, 0.12) * speedMul * windMul;
      p.vy = (-0.050 + rand(-0.015, -0.030)) * speedMul;

      p.rot = rand(0, Math.PI * 2);
      p.img = pick(puffImgs);
      p.depth = near ? 'near' : 'far';

      p.s = (near ? rand(0.05, 0.20) : rand(0.03, 0.09)) * sizeMul;

      p.aBase = near ? rand(0.55, 0.85) : rand(0.45, 0.72);
      p.life = 1.0;
      parts.push(p);
      if (parts.length > MAX_PARTS) freePart(parts.shift());
    }

    function update(dt) {
      size();
      const W = cvs.width, H = cvs.height;
      const ceilY = CEILING_FRAC * H;
      updateSoot(dt, W, H);

      if (lampsOn || (override && override.force)) {
        const emitters = window.__SMOKE_EMITTERS?.[currentScene] || [];
        let densMul = SCENE_MULT[currentScene] ?? 1;
        let tgt = SMOG[currentScene] || {a:0.25,h:0.42};

        if (override){
          densMul = override.mult   ?? densMul;
          tgt = { a: override.alpha ?? tgt.a, h: override.height ?? tgt.h };
        }

        const k = BASE_SPAWN * densMul * dt;

        for (let i=0;i<emitters.length;i++){
          const e = emitters[i];
          const ex = (e.xPct/100) * W;
          const ey = (e.yPct/100) * H;
          const near = e.depth !== 'far';

          e._carry = (e._carry || 0) + e.rate * k;
          const n = e._carry | 0;
          e._carry -= n;
          for (let j=0;j<n;j++) spawn(ex, ey, near);
        }

        smogAlpha  += (tgt.a - smogAlpha) * 0.05;
        smogHeight += (tgt.h - smogHeight) * 0.045;
      } else {
        smogAlpha  += (0 - smogAlpha) * 0.06;
        smogHeight += (0 - smogHeight) * 0.06;
      }

      for (let i=parts.length-1;i>=0;i--){
        const p = parts[i];

        const speedMul = (override && override.speed) || (SPEED_SCENE[currentScene] || 1);
        const liftMul  = (override && override.lift)  || (LIFT_SCENE[currentScene]  || 1);
        const windMul  = (override && override.wind)  || (WIND_SCENE[currentScene]  || 1);

        p.vx += globalWind * WIND_K * speedMul * windMul * (p.depth === 'near' ? 1.0 : 0.65);
        p.vy += LIFT_BASE * speedMul * liftMul;

        if (p.y < ceilY) {
          p.vx += (Math.random()*0.04 - 0.02) * speedMul;
          p.vy  = Math.min(p.vy, -0.02 * speedMul);
        }

        const dragPow = Math.max(0.8, Math.min(1.2, speedMul));
        p.vx *= Math.pow(DRAG, dragPow);
        p.vy *= Math.pow(DRAG, dragPow);

        p.x  += p.vx * (dt * 60);
        p.y  += p.vy * (dt * 60);
        p.rot += 0.0009 * (dt * 1000) * speedMul;

        p.life -= 0.30 * dt;
        if (p.life <= 0 || p.y < -120) { freePart(parts.splice(i,1)[0]); }
      }
    }

    function render() {
      const W = cvs.width, H = cvs.height;
      ctx.clearRect(0,0,W,H);

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

      renderSoot(ctx, W, H);

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

    let last = performance.now(), acc = 0;
    function raf(now){
      const dt = now - last; last = now;
      acc += dt;
      const step = 1000 / 30;
      while (acc >= step) { update(step/1000); acc -= step; }
      render();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // store emitters externally so we can set them before init (simple)
    window.__SMOKE_EMITTERS = window.__SMOKE_EMITTERS || { 0:[],1:[],2:[] };
  })();

  /* ---------- BLACKOUT OVERLAY (scoped to lamps scene) ---------- */
  (function ensureBlackout(){
    const host = document.getElementById("lampsScene") || document.body; // fallback
    let d = document.getElementById("blackoutOverlay");
    if (!d) {
      d = document.createElement("div");
      d.id = "blackoutOverlay";
      Object.assign(d.style, {
        position: host.id === "lampsScene" ? "absolute" : "fixed",
        inset:"0",
        background:"#000",
        opacity:"0",
        pointerEvents:"none",
        zIndex:"110",                     // tiny, within the scene
        transition:"opacity 0.14s linear"
      });
      host.appendChild(d);
    } else {
      if (d.parentElement !== host) host.appendChild(d);
      d.style.position = "absolute";
      d.style.zIndex   = "110";
    }
  })();

  /* ---------- BLACKOUT HELPERS ---------- */
  function __getBlack() {
    return document.getElementById("blackoutOverlay");
  }
  function __blackoutTo(alpha = 0) {
    const el = __getBlack(); if (!el) return;
    const a = Math.max(0, Math.min(1, alpha));
    el.style.opacity = String(a);
    el.style.pointerEvents = "none";
  }
  function __blackoutOffNow() {
    const el = __getBlack(); if (!el) return;
    const prev = el.style.transition;
    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    void el.offsetHeight; // force reflow
    el.style.transition = prev || "opacity 0.14s linear";
  }
  function __clearBlackPrograms() {
    window.__smokeSetBoost?.(null);
    window.__smokeSetSoot?.({ target: 0, seed: 0, grow: 0, jitter: 0.4, maxAlpha: 0 });
  }

  /* ---------- BLACKOUT LATCH (NEW) ---------- */
  window.__lampsBlackHold = false;  // true = keep screen black across forward scroll/outro
  function __holdBlack(on){
    window.__lampsBlackHold = !!on;
    if (on) {
      __blackoutTo(1);
    }
  }

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

    // Emitters (scenes 0–2)
    window.__SMOKE_EMITTERS[0] = [
      { xPct: 5,  yPct: 50, rate: 14, depth: 'far' },
      { xPct: 73, yPct: 68, rate: 16, depth: 'near' },
      { xPct: 92, yPct: 51, rate: 14, depth: 'far' },
    ];
    window.__SMOKE_EMITTERS[1] = [
      { xPct: 16, yPct: 48, rate: 18, depth: 'near' },
      { xPct: 66, yPct: 49, rate: 20, depth: 'near' },
      { xPct: 41, yPct: 50, rate: 18, depth: 'near' },
      { xPct: 86, yPct: 50, rate: 10, depth: 'near' },
      { xPct: 22, yPct: 17, rate: 26, depth: 'far' },
      { xPct: 85, yPct: 16, rate: 26, depth: 'far' },
      { xPct: 56, yPct: 32, rate: 20, depth: 'far' },
      { xPct: 51, yPct: 32, rate: 20, depth: 'far' },
    ];
    window.__SMOKE_EMITTERS[2] = [
      { xPct: 16, yPct: 48, rate: 30, depth: 'near' },
      { xPct: 66, yPct: 49, rate: 28, depth: 'near' },
      { xPct: 41, yPct: 50, rate: 24, depth: 'near' },
      { xPct: 86, yPct: 50, rate: 30, depth: 'near' },
      { xPct: 22, yPct: 17, rate: 60, depth: 'far' },
      { xPct: 85, yPct: 16, rate: 30, depth: 'far' },
      { xPct: 56, yPct: 32, rate: 40, depth: 'far' },
      { xPct: 51, yPct: 32, rate: 30, depth: 'far' },
      { xPct: 60, yPct: 20, rate: 30, depth: 'far' },
      { xPct: 70, yPct: 12, rate: 30, depth: 'far' },
      { xPct: 80, yPct: 22, rate: 30, depth: 'far' },
      { xPct: 65, yPct: 27, rate: 30, depth: 'far' },
      { xPct: 77, yPct: 18, rate: 30, depth: 'far' },
      { xPct: 48, yPct: 10, rate: 30, depth: 'far' },
    ];

    setLampConfig("#lampsScene", LANTERN_CFG);
    __setLampsOn(false);
    __applyLampIntensity(0); // start dark

    window.__refreshLampGroundLine?.();
    window.__refreshLampLitterRects?.();
    window.dispatchEvent(new Event("resize"));

    const xfade = buildCrossfade();

    // *** NEW: long, fixed pin length for slow scrolling ***
    const st = ScrollTrigger.create({
      trigger: "#lampsScene",
      start: "top top",
      end: "+=" + computePinLenPx(), // very long, smooth, consistent pin
      scrub: true,
      pin: true,
      anticipatePin: 1,

      /* ---------- UPDATED CALLBACKS (respect latch) ---------- */
      onEnter(self){
        // entering lamp scene from above
        disableCityClicks();
        if (!window.__lampsBlackHold) __blackoutOffNow(); // clear only if not latched
      },

      onEnterBack(self){
        // re-entering lamp scene from below (scrolling up)
        disableCityClicks();
        if (window.__lampsBlackHold) __blackoutTo(1); else __blackoutOffNow();
      },

      onLeave(self){
        // leaving lamp scene downward into outro
        enableCityClicks();
        if (self.direction === 1 && window.__lampsBlackHold) {
          // keep it black for the outro
          __blackoutTo(1);
        } else {
          __blackoutOffNow();
          __clearBlackPrograms();
        }
      },

      onLeaveBack(self){
        // leaving lamp scene upward back to tractor/earlier scenes
        enableCityClicks();
        __blackoutOffNow();
        __clearBlackPrograms();
        window.__lampsBlackHold = false; // release latch when fully out above
      },

      onUpdate(self){
        const p = self.progress;       // 0..1 across the long pin
        xfade.progress(p);

        window.__litterTick ??= { p:0, acc:0, wind:0, spawnMult:1 };
        const LT = window.__litterTick;
        const dp = p - LT.p;

        if (p < XFADE_HOLD_START) LT.acc += 40;
        LT.acc  += Math.abs(dp) * 1000;
        LT.wind += (Math.random() - 0.5) * 60;
        LT.p     = p;

        const [sceneIdx, sProg] = sceneLocalProgress(p);

        const artScene = Math.min(sceneIdx, 2);
        window.__smokeSetScene?.(artScene);
        window.__smokeSetWind?.((LT.wind ?? 0)*0.02);

        if (sceneIdx >= 1 && window.__lampsUserOverride == null) {
          if (!window.__lampsOn) __setLampsOn(true, { noFlicker:true });
        }
        if (sceneIdx === 0 && window.__lampsUserOverride == null) {
          if (window.__lampsOn) __setLampsOn(false, { noFlicker:true });
        }

        // Degradation & intensity program + BLACKOUT LATCH BEHAVIOR
        if (sceneIdx === 1){
          __setLampVisualIntensityIfOn(1.0);
          __setLampDegrade({ bands: 0.05 * sProg, haze: 0.04 * sProg, jitter: 0.02 });
          window.__smokeSetBoost?.(null);
          LT.spawnMult = 1.0;
          if (!window.__lampsBlackHold) __blackoutTo(0);
        }
        else if (sceneIdx === 2){
          __setLampVisualIntensityIfOn(1.0);
          __setLampDegrade({
            bands: 0.18 + 0.35 * sProg,
            haze:  0.12 + 0.30 * sProg,
            jitter: 0.06 + 0.10 * sProg
          });
          window.__smokeSetBoost?.({
            mult: 1.0 + 1.8 * sProg,
            alpha: 0.25 + 0.60 * sProg,
            height: 0.42 + 0.45 * sProg,
            force: false
          });
          LT.spawnMult = 1.0 + 2.2 * sProg;
          if (!window.__lampsBlackHold) __blackoutTo(0);
        }
        else if (sceneIdx === 3){
          // compute fillTarget first
          const fillTarget = 0.85 + 0.15 * sProg; // 0.85 → 1.00 across scene 3

          // blackout opacity: once nearly sealed and moving forward, latch full black
          const progressingForward = (self.direction === 1);
          const nearingSeal = sProg >= 0.94;
          if (progressingForward && nearingSeal) __holdBlack(true);

          if (window.__lampsBlackHold) {
            __blackoutTo(1);
          } else {
            const a = Math.min(1, 0.65*sProg + 0.55*Math.min(1, fillTarget));
            __blackoutTo(a);
          }

          // brief hue shove 225→215 to feel “stressed”
          const h = 215 + 10 * Math.max(0, 1 - sProg*1.4);
          document.querySelectorAll("#lampsRow .lampWrap").forEach(w=>{
            w.style.setProperty("--hue", h + "deg");
          });

          __setLampDegrade({
            bands: 0.55,
            haze:  0.50,
            jitter: 0.18 * (1 - sProg)
          });

          // BASE blackout push (already heavy)
          window.__smokeSetBoost?.({
            mult:   8.0,     // ↑ base density
            alpha:  0.999,   // near-opaque heads
            height: 1.00,    // full curtain
            speed:  2.90,
            size:   3.10,
            wind:   1.9,
            lift:   1.8,
            force:  true
          });

          // final quarter → violent surge to seal any gaps
          if (sProg > 0.75) {
            const t = (sProg - 0.75) / 0.25; // 0→1 near the end
            window.__smokeSetBoost?.({
              mult:   8.0 + 6.5 * t,   // up to ~14.5
              alpha:  0.999,
              height: 1.00,
              speed:  2.90 + 1.10 * t, // up to ~4.0
              size:   3.10 + 0.90 * t, // up to ~4.0
              wind:   1.9  + 0.9  * t,
              lift:   1.8  + 0.7  * t,
              force:  true
            });
          }

          // soot spread → fully seal the frame
          window.__smokeSetSoot({
            target:   fillTarget,
            seed:     220,          // more blobs
            grow:     180,          // faster radius growth
            jitter:   0.9,
            maxAlpha: 0.997
          });

          LT.spawnMult = 3.6;

          // fade lamp visuals out but still respect manual ON
          const lampI = Math.max(0, 1 - sProg * 1.15);
          __applyLampIntensity(window.__lampsOn ? lampI : 0);

        } else {
          // lantern scene
          __setLampVisualIntensityIfOn(1.0);
          __setLampDegrade({ bands: 0, haze: 0, jitter: 0 });
          window.__smokeSetBoost?.(null);
          LT.spawnMult = 1;
          if (!window.__lampsBlackHold) __blackoutTo(0);
        }

        // If scrolling upward out of Scene 4, release and clear darkness
        if (self.direction === -1 && (sceneIdx < 3 || (sceneIdx === 3 && sProg < 0.02))) {
          if (window.__lampsBlackHold) {
            window.__lampsBlackHold = false;
            __blackoutTo(0);
            __clearBlackPrograms();
            window.__smokeHardReset?.();
          }
        }

        // fliers (if you have them)
        window.__lampFliers?.setScene(artScene);
        window.__lampFliers?.setProgress(sProg);
        window.__lampFliers?.update();

        // spawn litter
        while (LT.acc > 85){
          const base  = 4 + (Math.random()*4|0);
          const count = Math.max(1, Math.round(base * (LT.spawnMult ?? 1)));
          window.spawnLampLitter?.(artScene, count);
          LT.acc -= 85;
        }

        // lock parallax x each tick
        gsap.set("#parallaxNearStack", { x: 0 });
        gsap.set("#parallaxFarStack",  { x: 0 });
      },

      onRefresh(){},
      invalidateOnRefresh: true,
      onRefreshInit(){ xfade.progress(0); }
    });

    const refresh = () => {
      const row = document.getElementById("lampsRow");
      if (row) row.style.setProperty("--lampH", computeLampHeightPx());
      window.__refreshLampLitterRects?.();
      window.__refreshLampGroundLine?.();

      // Re-apply end length when screen size changes
      st.vars.end = "+=" + computePinLenPx();
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
})();
