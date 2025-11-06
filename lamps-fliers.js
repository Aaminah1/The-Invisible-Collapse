// js/lamps-fliers.js
// Lamps-scene fliers: airplanes (scene 0→1) and drones (scene 1→2).
// Hover or click to knock them down; they break on the ground and remain as wrecks.
(function LampFliers(){
  let built=false, cvs, ctx, w=0, h=0, dpr=1;
  let actors=[];     // live fliers
  let wrecks=[];     // persistent debris pieces
  let lastSeg=-1;
  let nextSpawn={ plane:0, drone:0 };
  const cursor={ x:-1, y:-1 };
// --- FLIER ALTITUDE CONFIG (spawn band in the sky) -------------------------
const ALTITUDE = {
  topFrac: 0.12,  // higher = closer to top (was ~0.30)
  botFrac: 0.36,  // lower edge of the band (was ~0.55)
  marginPx: 24    // keep clear of ground/edges
};

  // --- wreck physics (settle on ground instead of popping static) ---
  const WRECK_FRICTION = 0.90;
  const WRECK_ROT_FRICTION = 0.94;
  const WRECK_GRAV = 880; // px/s^2 (fast settle)
  function updateWrecks(dt, gy){
    for (let i=0;i<wrecks.length;i++){
      const w = wrecks[i];
      if (!w.live) continue;
      w.vy += WRECK_GRAV * dt;
      w.x  += w.vx * dt;
      w.y  += w.vy * dt;
      w.rot += (w.rotV || 0);

      if (w.y >= gy){
        w.y = gy;
        if (Math.abs(w.vy) > 50){
          w.vy = -Math.abs(w.vy) * 0.25;
        } else {
          w.vy = 0;
        }
        w.vx   *= WRECK_FRICTION;
        w.rotV  = (w.rotV || 0) * WRECK_ROT_FRICTION;

        if (Math.abs(w.vx) < 2 && Math.abs(w.vy) < 2 && Math.abs(w.rotV||0) < 0.004){
          w.vx = w.vy = w.rotV = 0;
          w.live = false;
        }
      }
    }
  }

  // --- LIGHT HELPERS -------------------------------------------------------
  function pulseSine(t, speed=1, min=0, max=1){
    const k = (Math.sin(t*speed)+1)*0.5;
    return min + (max-min)*k;
  }
  // FAA-ish white double-strobe: two quick pops per ~1.1s
  function strobeDouble(t){
    const period = 1.1;          // seconds
    const local = t % period;
    const on = (x) => x>=0 && x<0.06;   // ~60 ms flash
    return (on(local) || on(local-0.12)) ? 1 : 0;
  }
  // Slow red beacon (top/bottom fuselage) ~ once per second
  function beaconPulse(t){
    const p = (t % 1.0);
    if (p < 0.15) {                // 150 ms on
      const f = 1 - (p/0.15);
      return 0.45 + 0.55*f;
    }
    return 0;
  }
  // Small glow disc
  function glowDisc(ctx, x, y, r, rgba, alpha=1){
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x,y,0, x,y,r);
    g.addColorStop(0, rgba);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // wiring from lamps scene
  let currentScene=0;    // 0..2
  let sceneProg=0;       // 0..1 inside current scene
  let lampsPinned=true;

  // layering
  const Z_INDEX = 34; // above parallax, below lamp PNGs & litter
  const GROUND_OFFSET = -16;

  // spawn & tuning
  const PLANE = { max: 2, gapMs:[6000,12000], speed:[70,105], amp:[10,24],  freq:[0.5,0.9],  size:[16,22] };
  const DRONE = { max: 3, gapMs:[3500, 7000], speed:[45, 70], amp:[ 8,16],  freq:[0.9,1.5],  size:[12,16] };
  const MAX_WRECKS = 140;
  const MAX_ACTORS = 10;

  // interaction
  const HOVER_ARM_MS = 260;
  const CLICK_COOLDOWN_MS = 260;
  let lastKnockTs = 0;
  const HIT_R = { plane: 26, drone: 22 };

  // physics-ish
  const G = 380; // px/s^2
  const DRAG = 0.985;

  // --- CLOUDY TRAILS (cheap puff impostors) -----------------------------
  const TRAIL_MAX_PUFFS = 220;
  const TRAIL_SPAWN_MS  = [70, 110];
  const TRAIL_PUFFS = [];
  let __puffStamp;

  function buildPuffStamp(){
    if (__puffStamp) return __puffStamp;
    const s = 64;
    const oc = document.createElement('canvas');
    oc.width = s; oc.height = s;
    const c = oc.getContext('2d');
    const g = c.createRadialGradient(s/2, s/2, 1, s/2, s/2, s/2);
    g.addColorStop(0.00, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.35, 'rgba(220,225,230,0.20)');
    g.addColorStop(0.70, 'rgba(180,185,195,0.10)');
    g.addColorStop(1.00, 'rgba(160,165,175,0.00)');
    c.fillStyle = g;
    c.fillRect(0,0,s,s);
    __puffStamp = oc;
    return oc;
  }

  // --- HOVER / CLICK FX ----------------------------------------------------
  const HOVER_WOBBLE = { rot: 0.14, bob: 4.0 }; // stronger wobble for visibility
  const HOVER_GAIN   = 0.035;                   // ramp-up speed
  const HOVER_DECAY  = 0.90;                    // per-frame decay
  const CLICK_FLASH_MS = 160;

  // hover halo helper (independent of any prior path)
  function drawHoverHalo(x, y, r, strength){
    ctx.save();
    ctx.globalAlpha = 0.35 * strength;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0.0, "rgba(230,240,255,0.85)");
    g.addColorStop(0.6, "rgba(230,240,255,0.18)");
    g.addColorStop(1.0, "rgba(230,240,255,0.00)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  let CLICK_RINGS = [];
  function spawnClickRing(x,y){
    CLICK_RINGS.push({ x, y, r: 2, a: 0.85, vr: 240, fade: 0.90 });
  }
  function updateClickRings(dt){
    for (let i=CLICK_RINGS.length-1;i>=0;i--){
      const k = CLICK_RINGS[i];
      k.r += k.vr * dt;
      k.a *= Math.pow(k.fade, (dt*60));
      if (k.a < 0.04) CLICK_RINGS.splice(i,1);
    }
  }
  function drawClickRings(ctx){
    ctx.save();
    ctx.strokeStyle = "rgba(230,240,255,1)";
    for (let i=0;i<CLICK_RINGS.length;i++){
      const k = CLICK_RINGS[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, k.a));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(k.x, k.y, k.r, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function curl(nx, ny, t){
    return Math.sin((nx + t*60) * 0.006) * 0.35 +
           Math.cos((ny - t*40) * 0.004) * 0.25;
  }

  function trailSpawnPuff(plane){
    if (TRAIL_PUFFS.length >= TRAIL_MAX_PUFFS) TRAIL_PUFFS.shift();
    const dir = plane.dir || 1; // +1 L→R, -1 R→L
    const baseX = plane.x - dir * plane.size * 1.8;
    const baseY = plane.y + (Math.random()*2 - 1) * 3;
    const jitterSide = (Math.random()*2 - 1) * 8;

    TRAIL_PUFFS.push({
      x: baseX,
      y: baseY + jitterSide*0.15,
      r: 8 + Math.random()*4,
      a: 0.23 + Math.random()*0.05,
      life: 0,
      grow: 18 + Math.random()*10,
      vx: (plane.vx * 0.08) - dir * (12 + Math.random()*8),
      vy: (Math.random()*2 - 1) * 6,
      seed: Math.random()*1000
    });
  }

  function ensureTrailState(a){
    if (a._trailNext == null) {
      a._trailNext = performance.now() + (TRAIL_SPAWN_MS[0] + Math.random()*(TRAIL_SPAWN_MS[1]-TRAIL_SPAWN_MS[0]));
    }
  }

  function trailPushSample(a, dt){
    ensureTrailState(a);
    const now = performance.now();
    if (now >= a._trailNext){
      trailSpawnPuff(a);
      a._trailNext = now + (TRAIL_SPAWN_MS[0] + Math.random()*(TRAIL_SPAWN_MS[1]-TRAIL_SPAWN_MS[0]));
    }
  }

  function updateTrails(dt){
    const t = performance.now()/1000;
    for (let i=TRAIL_PUFFS.length-1;i>=0;i--){
      const p = TRAIL_PUFFS[i];
      const k = curl(p.x*0.7, p.y*0.7, t + p.seed*0.001);
      p.vx += k * 3 * dt;
      p.vy += k * 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.grow * dt;
      p.life += dt * 0.6;
      p.a *= 0.985;
      if (p.a <= 0.02 || p.r >= 90) TRAIL_PUFFS.splice(i,1);
    }
  }

  function drawTrails(ctx){
    const stamp = buildPuffStamp();
    for (let i=0;i<TRAIL_PUFFS.length;i++){
      const p = TRAIL_PUFFS[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
      const s = p.r*2;
      ctx.drawImage(stamp, p.x - p.r, p.y - p.r, s, s);
      ctx.restore();
    }
  }

  // --- FALL FX (cool white-blue "ion sparks" + impact dust) -------------
  const FALL_SPARKS = [];
  const IMPACT_PUFFS = [];
  const FALL_SPARK_MAX = 240;
  const IMPACT_PUFF_MAX = 180;

  const FALL_EMIT_MS = [20, 45]; // cadence while falling
  const SPARK_GRAV = 520;
  const SPARK_DRAG = 0.986;

  const IMPACT_GRAV = 420;
  const IMPACT_DRAG = 0.982;

  let __impactStamp;
  function buildImpactStamp(){
    if (__impactStamp) return __impactStamp;
    const s = 64;
    const oc = document.createElement('canvas');
    oc.width = s; oc.height = s;
    const c = oc.getContext('2d');
    const g = c.createRadialGradient(s/2, s/2, 1, s/2, s/2, s/2);
    g.addColorStop(0.00, 'rgba(230,235,245,0.22)');
    g.addColorStop(0.60, 'rgba(190,195,205,0.12)');
    g.addColorStop(1.00, 'rgba(160,165,175,0.00)');
    c.fillStyle = g; c.fillRect(0,0,s,s);
    __impactStamp = oc;
    return oc;
  }

  // thin, angled streaks
  function fallSpawnSpark(a){
    if (FALL_SPARKS.length >= FALL_SPARK_MAX) FALL_SPARKS.shift();
    const dir = Math.sign(a.vx || 1) || (a.dir||1);
    const sp  = 60 + Math.random()*160;
    const ang = Math.random()*Math.PI*2;
    FALL_SPARKS.push({
      x: a.x + (Math.random()*6-3),
      y: a.y + (Math.random()*6-3),
      vx: -dir * sp * 0.55 + (Math.random()*70-35),
      vy: -(30 + Math.random()*90),
      len: 6 + Math.random()*9,
      width: 1.1 + Math.random()*0.9,
      ang,
      a: 0.80 + Math.random()*0.15,
      life: 0
    });
  }

  function fallEmitStep(a){
    const now = performance.now();
    if (a._fallNext == null) a._fallNext = now + (Math.random()*(FALL_EMIT_MS[1]-FALL_EMIT_MS[0])+FALL_EMIT_MS[0]);
    if (now >= a._fallNext){
      const count = (Math.abs(a.vx)+Math.abs(a.vy)) > 160 ? 2 : 1;
      for (let i=0;i<count;i++) fallSpawnSpark(a);
      a._fallNext = now + (Math.random()*(FALL_EMIT_MS[1]-FALL_EMIT_MS[0])+FALL_EMIT_MS[0]);
    }
  }

  function updateFallFX(dt, gy){
    // sparks
    for (let i=FALL_SPARKS.length-1;i>=0;i--){
      const s = FALL_SPARKS[i];
      s.vy += SPARK_GRAV*dt;
      s.vx *= SPARK_DRAG; s.vy *= SPARK_DRAG;
      s.x  += s.vx*dt;    s.y  += s.vy*dt;
      s.life += dt;
      s.a *= 0.982;
      s.len += 8*dt;

      if (s.y >= gy){
        s.y = gy;
        s.vx *= 0.6;
        s.a *= 0.5;
        if (s.a < 0.05) FALL_SPARKS.splice(i,1);
      } else if (s.a < 0.04 || s.life > 1.6){
        FALL_SPARKS.splice(i,1);
      }
    }

    // impact dust puffs
    for (let i=IMPACT_PUFFS.length-1;i>=0;i--){
      const p = IMPACT_PUFFS[i];
      p.vy += IMPACT_GRAV*dt;
      p.vx *= IMPACT_DRAG; p.vy *= IMPACT_DRAG;
      p.x  += p.vx*dt;     p.y  += p.vy*dt;
      p.r  += p.grow*dt;
      p.a  *= 0.985;
      if (p.y >= gy){ p.y = gy; p.vx *= 0.8; }
      if (p.a < 0.02) IMPACT_PUFFS.splice(i,1);
    }
  }

  function drawFallFX(ctx){
    // cool white-blue sparks (streaks)
    ctx.save();
    ctx.fillStyle = "rgba(215,225,255,0.9)";
    for (let i=0;i<FALL_SPARKS.length;i++){
      const s = FALL_SPARKS[i];
      if (s.a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.a));
      ctx.translate(s.x, s.y);
      const theta = Math.atan2(s.vy, s.vx);
      ctx.rotate(theta);
      const wR = s.width, hR = s.len;
      ctx.beginPath();
      ctx.moveTo(-hR*0.5, -wR*0.5);
      ctx.lineTo( hR*0.5, -wR*0.5);
      ctx.lineTo( hR*0.5,  wR*0.5);
      ctx.lineTo(-hR*0.5,  wR*0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // dust
    const stamp = buildImpactStamp();
    for (let i=0;i<IMPACT_PUFFS.length;i++){
      const p = IMPACT_PUFFS[i];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
      const s = p.r*2;
      ctx.drawImage(stamp, p.x - p.r, p.y - p.r, s, s);
      ctx.restore();
    }
  }

  function burstImpactDust(x, gy, strength=1){
    const n = 10 + Math.floor(Math.random()*8);
    for (let i=0;i<n;i++){
      if (IMPACT_PUFFS.length >= IMPACT_PUFF_MAX) IMPACT_PUFFS.shift();
      const ang = (i/n)*Math.PI + (Math.random()*0.6-0.3);
      const sp  = (120 + Math.random()*180) * strength;
      IMPACT_PUFFS.push({
        x, y: gy-1,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp*0.45,
        r: 8 + Math.random()*10,
        grow: 28 + Math.random()*24,
        a: 0.24 + Math.random()*0.16
      });
    }
  }

  // util
  const clamp=(a,v,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);

  function size(){
    if (!cvs) return;
    const host = document.getElementById("lampsScene") || cvs.parentNode;
    const r = host.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    cvs.width  = Math.max(2, Math.floor(r.width  * dpr));
    cvs.height = Math.max(2, Math.floor(r.height * dpr));
    cvs.style.width  = r.width + "px";
    cvs.style.height = r.height + "px";
    if (ctx) ctx.setTransform(dpr,0,0,dpr,0,0);
    w = Math.floor(r.width);
    h = Math.floor(r.height);
  }

  function groundY(){
    const g = document.getElementById('lampsGroundStack') || document.getElementById('lampsGroundBase');
    const host = document.getElementById('lampsScene') || cvs;
    if (!(g && host)) return h - 40;
    const cb = host.getBoundingClientRect();
    const gb = g.getBoundingClientRect();
    return (gb.bottom - cb.top) + GROUND_OFFSET;
  }

  function build(){
    if (built) return;
    const host = document.getElementById("lampsScene");
    if (!host) return;

    cvs = document.createElement("canvas");
    cvs.id = "lampFliersCanvas";
    Object.assign(cvs.style, { position:"absolute", inset:"0", zIndex:String(Z_INDEX), pointerEvents:"none" });
    host.appendChild(cvs);

    ctx = cvs.getContext("2d", { alpha:true });
    size();

    window.addEventListener("pointermove", e=>{
      if (!cvs) return;
      const r = cvs.getBoundingClientRect();
      cursor.x = e.clientX - r.left;
      cursor.y = e.clientY - r.top;
    }, { passive:true });
    const reset=()=>{ cursor.x = cursor.y = -1; };
    window.addEventListener("pointerleave", reset, {passive:true});
    window.addEventListener("blur", reset, {passive:true});
    window.addEventListener("pointerdown", e=>{
      if (!cvs) return;
      const r = cvs.getBoundingClientRect();
      clickAt(e.clientX - r.left, e.clientY - r.top);
    }, { passive:true });

    window.addEventListener("resize", ()=>setTimeout(size,0), {passive:true});

    const now = performance.now();
    nextSpawn.plane = now + rand(...PLANE.gapMs);
    nextSpawn.drone = now + rand(...DRONE.gapMs);

    requestAnimationFrame(loop);
    built = true;
  }


function lampBand(){
  // Where is the ground? (already defined in your file)
  const gy = groundY();                   // pixel Y for ground surface
  const skyH = Math.max(40, gy - ALTITUDE.marginPx); // usable sky height

  // Clamp helper (re-use yours if it already exists)
  const clamp = (a,v,b)=>Math.max(a,Math.min(b,v));

  // Compute a higher band inside the sky (fractions of sky height)
  const y1 = clamp(8,  skyH * ALTITUDE.topFrac,  skyH - 20);
  const y2 = clamp(y1+10, skyH * ALTITUDE.botFrac, skyH - 10);

  return { x1: -40, x2: w+40, y1, y2 };
}

  function makePlane(){
    const band = lampBand();
    const fromLeft = Math.random() < 0.5;
    const x0 = fromLeft ? -60 : (w+60);
    const y0 = rand(band.y1, band.y2);
    return {
      type:"plane", state:"fly",
      x:x0, y:y0, yBase:y0,
      dir: (fromLeft ? 1 : -1),
      vx:  rand(...PLANE.speed) * (fromLeft?1:-1),
      amp: rand(...PLANE.amp), freq: rand(...PLANE.freq), phase: rand(0,Math.PI*2),
      size: rand(...PLANE.size),
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0,
      fxHover: 0,
      fxFlashTill: 0,
      _trailNext: performance.now() + (TRAIL_SPAWN_MS[0] + Math.random()*(TRAIL_SPAWN_MS[1]-TRAIL_SPAWN_MS[0])),
    };
  }

  function makeDrone(){
    const band = lampBand();
    const fromLeft = Math.random() < 0.5;
    const x0 = fromLeft ? -50 : (w+50);
    const y0 = rand(band.y1, band.y2);
    return {
      type:"drone", state:"fly",
      x:x0, y:y0, yBase:y0,
      vx: rand(...DRONE.speed) * (fromLeft?1:-1),
      amp: rand(...DRONE.amp), freq: rand(...DRONE.freq), phase: rand(0,Math.PI*2),
      size: rand(...DRONE.size),
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0,
      fxHover: 0,
      fxFlashTill: 0
    };
  }

  function drawShadow(x,y, gy, alpha=0.15){
    const d = Math.max(8, Math.min(42, (y - (gy-90))*0.25));
    const a = Math.max(0, Math.min(alpha, (y - (gy-140))*0.003));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(10,10,12,1)";
    ctx.beginPath();
    ctx.ellipse(x, gy+1, d, d*0.35, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlane(p){
    const s = p.size;                // scale anchor from your spawner
    const L = s * 2.6;               // fuselage length
    const H = s * 0.95;              // fuselage height (total)
    const R = H * 0.5;

    // palette (tweak freely)
    const C_WHITE = "#ffffff";
    const C_OUT   = "rgba(25,28,35,0.65)";
    const C_BELLY = "#6ea0d9";
    const C_TAIL  = "#5e94d3";
    const C_STRIP = "#f08a40";       // orange cheatline
    const C_WIN   = "#3a4c68";
    const C_WIN_H = "rgba(255,255,255,0.25)";

    ctx.save();
    ctx.translate(p.x, p.y);
    const ang = (p.state === "fall") ? (p.rot || 0) : 0;
    ctx.rotate(ang);

    // face the plane by dir (+1 L→R, -1 R→L)
    const flipX = (p.dir === -1) ? -1 : 1;
    ctx.scale(flipX, 1);

    // HOVER wobble (subtle roll + bob)
    if (p.state === "fly" && p.fxHover > 0){
      const k = p.fxHover;
      ctx.translate(0, Math.sin(p.t*8)*HOVER_WOBBLE.bob*k);
      ctx.rotate(Math.sin(p.t*5)*HOVER_WOBBLE.rot*k);
    }

    // CLICK flash timing
    const now = performance.now();
    const flashA = (now < (p.fxFlashTill||0)) ? (1 - (p.fxFlashTill-now)/CLICK_FLASH_MS) : 0;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.a));

    // ---------------- FUSELAGE SHAPE ----------------
    const left  = -L*0.52, right =  L*0.48;
    const noseX = right, tailX = left;
    const topY  = -R*0.75, botY  =  R*0.75;

    // hover halo (independent)
    if (p.state==="fly" && p.fxHover>0.01){
      drawHoverHalo(0, 0, s*2.1, p.fxHover);
    }

    // white body
    ctx.fillStyle = C_WHITE;
    ctx.strokeStyle = C_OUT;
    ctx.lineWidth = Math.max(1, s*0.06);

    ctx.beginPath();
    // tail round
    ctx.moveTo(tailX, 0);
    ctx.ellipse(tailX, 0, R*0.85, R*0.75, 0, Math.PI*0.5, Math.PI*1.5);
    // top edge to nose
    ctx.lineTo(noseX, topY);
    // rounded nose
    ctx.quadraticCurveTo(noseX + s*0.55, 0, noseX, botY);
    // bottom edge back to tail
    ctx.lineTo(tailX, botY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // blue belly (simple inset)
    ctx.fillStyle = C_BELLY;
    ctx.beginPath();
    ctx.moveTo(tailX + s*0.15, 0);
    ctx.lineTo(noseX - s*0.10, 0);
    ctx.quadraticCurveTo(noseX + s*0.38, 0, noseX - s*0.10, botY - s*0.05);
    ctx.lineTo(tailX + s*0.10, botY - s*0.05);
    ctx.quadraticCurveTo(tailX - s*0.25, botY - s*0.25, tailX + s*0.15, 0);
    ctx.closePath();
    ctx.fill();

    // thin orange cheatline
    ctx.strokeStyle = C_STRIP;
    ctx.lineWidth = Math.max(1, s*0.07);
    ctx.beginPath();
    ctx.moveTo(tailX + s*0.12, topY + R*0.95);
    ctx.lineTo(noseX - s*0.05, topY + R*0.95);
    ctx.stroke();

    // cockpit window
    ctx.fillStyle = C_WIN;
    ctx.beginPath();
    const cx = noseX - s*0.25, cy = topY + R*0.55;
    ctx.moveTo(cx - s*0.15, cy - s*0.10);
    ctx.quadraticCurveTo(cx + s*0.45, cy - s*0.18, cx + s*0.50, cy + s*0.02);
    ctx.quadraticCurveTo(cx + s*0.35, cy + s*0.22, cx - s*0.10, cy + s*0.18);
    ctx.closePath(); ctx.fill();
    // cockpit highlight
    ctx.fillStyle = C_WIN_H;
    ctx.beginPath();
    ctx.ellipse(cx + s*0.20, cy, s*0.30, s*0.14, 0, 0, Math.PI*2);
    ctx.fill();

    // tail fin (blue)
    ctx.fillStyle = C_TAIL;
    ctx.beginPath();
    ctx.moveTo(tailX + s*0.10, topY + s*0.15);
    ctx.lineTo(tailX - s*0.85, topY - s*0.35);
    ctx.lineTo(tailX - s*0.20, topY + s*0.65);
    ctx.lineTo(tailX + s*0.08, topY + s*0.48);
    ctx.closePath(); ctx.fill();
    // tail fin stripe
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1, s*0.05);
    ctx.beginPath();
    ctx.moveTo(tailX - s*0.65, topY - s*0.22);
    ctx.lineTo(tailX - s*0.10, topY + s*0.45);
    ctx.stroke();

    // simple straight wing (light gray)
    ctx.fillStyle = "#cfd7df";
    ctx.beginPath();
    ctx.moveTo(-s*0.35, botY - s*0.20);
    ctx.lineTo(-s*1.30, botY + s*0.10);
    ctx.lineTo( s*0.95,  botY - s*0.05);
    ctx.lineTo( s*0.30,  botY - s*0.30);
    ctx.closePath(); ctx.fill();

    // single under-wing engine pod (blue)
    const ex = -s*0.10, ey = botY - s*0.10;
    ctx.fillStyle = C_BELLY;
    ctx.beginPath();
    ctx.ellipse(ex, ey, s*0.55, s*0.28, 0, 0, Math.PI*2);
    ctx.fill();
    // intake
    ctx.fillStyle = "#2c3340";
    ctx.beginPath();
    ctx.ellipse(ex - s*0.18, ey, s*0.28, s*0.18, 0, 0, Math.PI*2);
    ctx.fill();
    // pylon
    ctx.fillStyle = "#9fb6cf";
    ctx.fillRect(ex - s*0.20, ey - s*0.48, s*0.24, s*0.32);

    // windows (row of rounded ovals)
    ctx.fillStyle = C_WIN;
    const nWin = 8, gap = (L*0.75)/(nWin-1), start = tailX + s*0.55;
    for (let i=0;i<nWin;i++){
      const wx = start + i*gap, wy = topY + R*0.70;
      ctx.beginPath();
      ctx.ellipse(wx, wy, s*0.17, s*0.11, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // ---------------- NAV / STROBE LIGHTS (direction-aware) ----------------
    const t = performance.now()/1000;
    const leftIsRed = (flipX === 1);
    const red   = "rgba(255,60,50,0.95)";
    const green = "rgba(80,255,130,0.95)";
    const white = "rgba(255,255,255,0.95)";

    const tipL = { x: -s*1.12, y: botY - s*0.22 };
    const tipR = { x:  s*1.12, y: botY - s*0.16 };
    const tail = { x: tailX + s*0.10, y: topY + s*0.10 };

    (typeof glowDisc==="function"?glowDisc:simpleGlow)(ctx, tipL.x, tipL.y, s*0.30, leftIsRed ? red : green, 0.55);
    (typeof glowDisc==="function"?glowDisc:simpleGlow)(ctx, tipR.x, tipR.y, s*0.30, leftIsRed ? green : red, 0.55);
    (typeof glowDisc==="function"?glowDisc:simpleGlow)(ctx, tail.x, tail.y, s*0.24, white, 0.40);

    const st = (typeof strobeDouble==="function" ? strobeDouble(t) : ((Math.sin(t*8)>0.85)?1:0));
    if (st>0) (typeof glowDisc==="function"?glowDisc:simpleGlow)(ctx, tail.x + s*0.30, topY + s*0.05, s*(0.30 + 0.10*st), white, 0.70*st);

    const be = (typeof beaconPulse==="function" ? beaconPulse(t) : (0.5 + 0.5*Math.sin(t*6)));
    if (be>0.85) (typeof glowDisc==="function"?glowDisc:simpleGlow)(ctx, 0, topY + s*0.05, s*0.28, red, 0.65);

    // click flash veil
    if (flashA>0){
      ctx.save();
      ctx.globalAlpha = 0.35*flashA;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-L, -H, L*2, H*2);
      ctx.restore();
    }

    ctx.restore();

    // fallback glow helper if your util isn't present
    function simpleGlow(c, x, y, r, color, a){
      c.save();
      c.globalAlpha = a ?? 0.6;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI*2); c.fill();
      c.restore();
    }
  }

  function drawDrone(d){
    const s=d.size;
    ctx.save(); ctx.translate(d.x,d.y);
    const ang = (d.state==="fly" || d.state==="retire") ? Math.sin(d.t*1.7)*0.04 : (d.rot||0);
    ctx.rotate(ang);

    // HOVER wobble
    if (d.state==="fly" && d.fxHover>0){
      const k = d.fxHover;
      ctx.translate(0, Math.sin(d.t*9)*HOVER_WOBBLE.bob*0.8*k);
      ctx.rotate(Math.sin(d.t*6)*HOVER_WOBBLE.rot*0.8*k);
      drawHoverHalo(0, 0, s*1.9, d.fxHover);
    }

    const now = performance.now();
    const flashA = (now < (d.fxFlashTill||0)) ? (1 - (d.fxFlashTill-now)/CLICK_FLASH_MS) : 0;
    ctx.globalAlpha = clamp(0,d.a,1);

    // body
    ctx.fillStyle="rgba(70,72,78,0.95)";
    ctx.fillRect(-s*0.6, -s*0.4, s*1.2, s*0.8);
    // arms
    ctx.fillRect(-s*1.4, -s*0.08, s*2.8, s*0.16);
    ctx.fillRect(-s*0.08, -s*1.2, s*0.16, s*2.4);

    // rotors
    const b = d.blade || 0;
    const rotor = (rx,ry)=>{
      ctx.save(); ctx.translate(rx,ry);
      ctx.rotate(b);
      ctx.fillStyle="rgba(40,40,44,0.9)"; // blades
      ctx.fillRect(-s*0.55, -s*0.08, s*1.1, s*0.16);
      ctx.fillRect(-s*0.08, -s*0.55, s*0.16, s*1.1);

      // click flash veil (covers drone)
      if (flashA>0){
        ctx.save();
        ctx.globalAlpha = 0.32*flashA;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-s*2.2, -s*2.2, s*4.4, s*4.4);
        ctx.restore();
      }
      ctx.restore();
    };
    rotor(-s*1.4, -s*1.2);
    rotor( s*1.4, -s*1.2);
    rotor(-s*1.4,  s*1.2);
    rotor( s*1.4,  s*1.2);

    // === DRONE LIGHTS ======================================================
    const t = performance.now()/1000;
    const frontIsRight = (Math.sign(d.vx||1) >= 0); // moving → front = right side
    const frontX = frontIsRight ? s*0.75 : -s*0.75;
    const rearX  = -frontX;

    // steady tiny arm LEDs (subtle)
    const armA = 0.25;
    glowDisc(ctx, -s*1.4, -s*1.2, s*0.20, 'rgba(255,255,255,0.9)', armA);
    glowDisc(ctx,  s*1.4, -s*1.2, s*0.20, 'rgba(255,255,255,0.9)', armA);
    glowDisc(ctx, -s*1.4,  s*1.2, s*0.20, 'rgba(255,255,255,0.9)', armA);
    glowDisc(ctx,  s*1.4,  s*1.2, s*0.20, 'rgba(255,255,255,0.9)', armA);

    // front white strobe (faster when falling)
    const st = d.state==="fall" ? strobeDouble(t*1.2) : strobeDouble(t);
    if (st>0){
      glowDisc(ctx, frontX, 0, s*(0.22 + 0.12*st), 'rgba(255,255,255,0.95)', 0.85*st);
    }

    // rear red slow pulse
    const be = d.state==="fall" ? Math.max(beaconPulse(t), 0.35) : beaconPulse(t);
    if (be>0){
      glowDisc(ctx, rearX, 0, s*0.26, 'rgba(255,60,50,0.95)', 0.75*be);
    }

    // faint underside glow while falling
    if (d.state === "fall"){
      const pulse = pulseSine(performance.now()*0.010, 7, 0.10, 0.22);
      glowDisc(ctx, 0, s*0.9, s*0.65, 'rgba(230,240,255,0.8)', pulse);
    }
    // ======================================================================

    ctx.restore();
  }

  // debris drawing
  function drawWreck(wr){
    ctx.save(); ctx.translate(wr.x, wr.y); ctx.rotate(wr.rot||0);
    ctx.globalAlpha = wr.a ?? 1;
    ctx.fillStyle = wr.fill || "rgba(60,60,65,1)";
    if (wr.kind === "rect") ctx.fillRect(-wr.w/2, -wr.h/2, wr.w, wr.h);
    else if (wr.kind === "circ") { ctx.beginPath(); ctx.arc(0,0, wr.r, 0, Math.PI*2); ctx.fill(); }
    else if (wr.kind === "tri") {
      ctx.beginPath();
      ctx.moveTo(-wr.w/2,  wr.h/2);
      ctx.lineTo( wr.w/2,  wr.h/2);
      ctx.lineTo( 0,      -wr.h/2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function radius(a){ return (a.type==="plane") ? 24 : 18; }

  function tryArmHover(a, dt){
    if (cursor.x<0) { a.hoverT=0; a.fxHover *= HOVER_DECAY; return; }
    const dx=a.x-cursor.x, dy=a.y-cursor.y;
    if (Math.hypot(dx,dy) < (HIT_R[a.type] || radius(a))) {
      a.hoverT += dt*1000;
      a.fxHover = Math.min(1, a.fxHover + HOVER_GAIN);
      if (a.state==="fly"){
        a.yBase += Math.sin(performance.now()*0.02)*0.10;  // tiny bob while armed
      }
      if (a.hoverT > HOVER_ARM_MS && a.state==="fly") knockDown(a);
    } else {
      a.hoverT = Math.max(0, a.hoverT - dt*400);
      a.fxHover *= HOVER_DECAY;
    }
  }

  // --- SINGLE DEFINITIONS (no duplicates) ---------------------------------
  function clickAt(x,y){
    const now=performance.now();
    if (now - lastKnockTs < CLICK_COOLDOWN_MS) return;
    let best=-1, bestD=1e9;
    for (let i=0;i<actors.length;i++){
      const a=actors[i]; if (a.state!=="fly") continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < (HIT_R[a.type]||radius(a)) && d < bestD){ best=i; bestD=d; }
    }
    if (best>=0){
      const a = actors[best];
      a.fxFlashTill = now + CLICK_FLASH_MS; // flash veil
      spawnClickRing(a.x, a.y);             // ripple ring
      knockDown(a);
      lastKnockTs=now;
    }
  }

  function knockDown(a){
    const now=performance.now();
    if (now - lastKnockTs < CLICK_COOLDOWN_MS) return;

    // small hit-jolt before fall
    const dir = Math.sign(a.vx||a.dir||1);
    a.vx += -dir * 30;
    a.vy -= 20;
    a.rotV += (a.type==="plane" ? 0.004 : 0.006) * (Math.random()<0.5?-1:1);

    a.state="fall";
    a.a = Math.max(0.6, a.a);
    a.vy = Math.max(a.vy, rand(40, 70));
    a.vx *= 0.40;

    // stop plane smoke trail; switch to sparks
    a._trailNext = Number.POSITIVE_INFINITY;
    a._fallNext  = now + (Math.random()*(FALL_EMIT_MS[1]-FALL_EMIT_MS[0]) + FALL_EMIT_MS[0]);

    lastKnockTs = now;
  }

  function explodeIntoDebris(a, gy){
    const pieces=[];
    const baseX = a.x, baseY = gy - 1;

    function shard(obj, kick=1){
      const dir = (Math.random()<0.5 ? -1 : 1);
      obj.x = baseX + (Math.random()*8 - 4);
      obj.y = baseY + (Math.random()*4 - 2);
      obj.rot = obj.rot ?? 0;
      obj.rotV = (Math.random()*0.14 - 0.07) * kick;
      obj.vx = (Math.random()*120 + 80) * dir * kick;
      obj.vy = -(Math.random()*220 + 120) * kick;
      obj.live = true;
      pieces.push(obj);
    }

    if (a.type==="plane"){
      shard({kind:"rect", w:a.size*1.8, h:a.size*0.55, fill:"rgba(140,145,152,1)"}, 1.0);
      shard({kind:"tri",  w:a.size*1.1, h:a.size*0.65, fill:"rgba(120,125,132,1)"}, 0.9);
      shard({kind:"tri",  w:a.size*1.1, h:a.size*0.65, fill:"rgba(120,125,132,1)"}, 0.9);
      shard({kind:"rect", w:a.size*0.7, h:a.size*0.35, fill:"rgba(165,170,176,1)"}, 1.1);
    } else {
      shard({kind:"rect", w:a.size*1.1, h:a.size*0.7, fill:"rgba(60,60,66,1)"}, 0.9);
      for (let i=0;i<4;i++){
        shard({kind:"circ", r:a.size*0.38, fill:"rgba(40,40,44,1)"}, 1.0);
      }
    }

    wrecks.push(...pieces);
    if (wrecks.length > MAX_WRECKS) wrecks.splice(0, wrecks.length - MAX_WRECKS);
  }

  function maybeSpawn(now, seg){
    const wantPlane = (seg === 0) || (seg===1 && sceneProg < 0.45);
    const wantDrone = (seg >= 1);

    if (actors.length < MAX_ACTORS){
      if (wantPlane){
        const have = actors.filter(a=>a.type==="plane" && a.state!=="dead").length;
        if (have < PLANE.max && now >= nextSpawn.plane){
          actors.push(makePlane());
          nextSpawn.plane = now + rand(...PLANE.gapMs);
        }
      }
      if (wantDrone){
        const have = actors.filter(a=>a.type==="drone" && a.state!=="dead").length;
        if (have < DRONE.max && now >= nextSpawn.drone){
          actors.push(makeDrone());
          nextSpawn.drone = now + rand(...DRONE.gapMs);
        }
      }
    }
  }

  function segFromScene(sceneIdx, _localP){ return sceneIdx; }

  // main loop
  let prevTS = 0;
  function loop(ts){
    if (!ctx){ requestAnimationFrame(loop); return; }
    if (!prevTS) prevTS = ts;
    const dt = Math.max(0.001, Math.min(0.050, (ts - prevTS)/1000));
    prevTS = ts;

    size();
    ctx.clearRect(0,0,w,h);
    updateClickRings(dt);

    if (lampsPinned){
      const gy = groundY();
      updateWrecks(dt, gy);

      // under-actors FX
      updateTrails(dt);
      drawTrails(ctx);

      updateFallFX(dt, gy);
      drawFallFX(ctx);
      drawClickRings(ctx);

      const seg = segFromScene(currentScene, sceneProg);
      if (seg !== lastSeg){
        actors.forEach(a=>{
          const ok = (a.type==="plane" && seg<=1) || (a.type==="drone" && seg>=1);
          if (!ok && a.state==="fly") a.state="retire";
        });
        const now = performance.now();
        nextSpawn.plane = now + rand(...PLANE.gapMs);
        nextSpawn.drone = now + rand(...DRONE.gapMs);
        lastSeg = seg;
      }

      maybeSpawn(performance.now(), seg);

      const alive = [];
      for (let i=0;i<actors.length;i++){
        const a = actors[i];
        a.t += dt;

        if (a.state==="fly" || a.state==="retire"){
          if (a.type !== "plane") a.blade = (a.blade ?? 0) + dt * 22;
          a.x += a.vx * dt;
          if (a.type === "plane") a.y = a.yBase;
          else a.y = a.yBase + Math.sin(a.phase + a.t*a.freq)*a.amp + Math.sin(a.t*0.7)*1.2;

          if (a.type === "plane") trailPushSample(a, dt);

          a.a += (a.state==="retire" ? -0.05 : 0.035);
          a.a = clamp(0, a.a, 1);

          tryArmHover(a, dt);

          const on = a.x>-80 && a.x<w+80 && a.y>-80 && a.y<h+80;
          if (!on && a.a<=0.01) a.state="dead";
        }
        else if (a.state==="fall"){
          if (a.type === "drone") a.blade = Math.max(0, (a.blade ?? 0) - dt * 12);
          a.vy += G*dt;
          a.vx *= DRAG;
          a.x  += a.vx * dt;
          a.y  += a.vy * dt;
          a.rot += a.rotV;
          a.rotV *= 0.995;

          // cool sparks while falling
          fallEmitStep(a);

          if (a.y >= gy){
            a.y = gy;
            if (Math.abs(a.vy) > 120){
              a.vy = -Math.abs(a.vy) * 0.18;
              a.vx *= 0.65;
            } else {
              burstImpactDust(a.x, gy, 1.0);
              explodeIntoDebris(a, gy);
              a.state = "dead";
              a.a = 0;
            }
          }
        }
        else if (a.state==="dead"){
          a.a = 0;
        }

        if (a.a > 0){
          drawShadow(a.x, a.y, gy);
          if (a.type === "plane") drawPlane(a);
          else drawDrone(a);
        }

        if (a.a > 0 && a.y < h + 200) alive.push(a);
      }
      actors = alive;

      for (let i=0;i<wrecks.length;i++) drawWreck(wrecks[i]);
    }

    requestAnimationFrame(loop);
  }

  function setAltitude(topFrac, botFrac){
  const clamp=(a,v,b)=>Math.max(a,Math.min(b,v));
  if (typeof topFrac === "number") ALTITUDE.topFrac = clamp(0.00, topFrac, 0.95);
  if (typeof botFrac === "number") ALTITUDE.botFrac = clamp(ALTITUDE.topFrac + 0.05, botFrac, 0.98);
}

  // public API
  function setScene(idx){ currentScene = (idx|0); }
  function setProgress(t){ sceneProg = clamp(0, +t||0, 1); }
  function setEnabled(pinned){ lampsPinned = !!pinned; }
  function update(){ if (!built) build(); }

window.__lampFliers = { setScene, setProgress, setEnabled, update, build, setAltitude };

  
})();
