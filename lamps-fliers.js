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
// --- wreck physics (settle on ground instead of popping static) ---
const WRECK_FRICTION = 0.90;
const WRECK_ROT_FRICTION = 0.94;
const WRECK_GRAV = 880; // px/s^2 (fast settle)
function updateWrecks(dt, gy){
  for (let i=0;i<wrecks.length;i++){
    const w = wrecks[i];
    if (!w.live) continue;
    // gravity + motion
    w.vy += WRECK_GRAV * dt;
    w.x  += w.vx * dt;
    w.y  += w.vy * dt;
    w.rot += (w.rotV || 0);

    // floor
    if (w.y >= gy){
      w.y = gy;
      // bounce a touch, then skid
      if (Math.abs(w.vy) > 50){
        w.vy = -Math.abs(w.vy) * 0.25;
      } else {
        w.vy = 0;
      }
      w.vx   *= WRECK_FRICTION;
      w.rotV  = (w.rotV || 0) * WRECK_ROT_FRICTION;

      // sleep when slow
      if (Math.abs(w.vx) < 2 && Math.abs(w.vy) < 2 && Math.abs(w.rotV||0) < 0.004){
        w.vx = w.vy = w.rotV = 0;
        w.live = false; // settled
      }
    }
  }
}


  // wiring from lamps scene
  let currentScene=0;    // 0..2
  let sceneProg=0;       // 0..1 inside current scene
  let lampsPinned=true;  // show/hide based on scene visibility if needed

  // layering (tweak if needed)
  const Z_INDEX = 34; // above far/near parallax, below lamp PNGs & litter
  const GROUND_OFFSET = -16; // same trick you use in litter script

  // spawn & tuning
  const PLANE = { max: 2, gapMs:[6000,12000], speed:[70,105], amp:[10,24],  freq:[0.5,0.9],  size:[16,22] };
  const DRONE = { max: 3, gapMs:[3500, 7000], speed:[45, 70], amp:[ 8,16],  freq:[0.9,1.5],  size:[12,16] };
  const MAX_WRECKS = 140;      // total debris pieces retained
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
const TRAIL_MAX_PUFFS = 220;     // global cap (perf guard)
const TRAIL_SPAWN_MS  = [70, 110]; // spawn cadence per plane (ms)
const TRAIL_PUFFS = [];          // pooled list of puffs
let __puffStamp;                 // offscreen radial gradient

// Build a reusable radial gradient stamp once (fast drawImage later)
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

// light “value noise” to curl the plume
function curl(nx, ny, t){
  // nx,ny in pixels → small freqs to keep it gentle
  return Math.sin((nx + t*60) * 0.006) * 0.35 +
         Math.cos((ny - t*40) * 0.004) * 0.25;
}

// spawn a puff just behind the plane’s nose
function trailSpawnPuff(plane){
  if (TRAIL_PUFFS.length >= TRAIL_MAX_PUFFS) {
    // drop oldest to keep CPU stable
    TRAIL_PUFFS.shift();
  }
  const dir = plane.dir || 1; // +1 L→R, -1 R→L
  const baseX = plane.x - dir * plane.size * 1.8;   // behind nose
  const baseY = plane.y + (Math.random()*2 - 1) * 3; // tiny vertical jitter

  // lateral jitter so it isn’t a line
  const jitterSide = (Math.random()*2 - 1) * 8;

  TRAIL_PUFFS.push({
    x: baseX,
    y: baseY + jitterSide*0.15,
    r: 8 + Math.random()*4,      // start radius
    a: 0.23 + Math.random()*0.05, // opacity
    life: 0,                     // 0..1
    grow: 18 + Math.random()*10, // px/sec radius growth
    vx: (plane.vx * 0.08) - dir * (12 + Math.random()*8), // drift backwards
    vy: (Math.random()*2 - 1) * 6, // slight vertical drift
    seed: Math.random()*1000      // noise phase
  });
}

// keep a per-plane timer for spawn cadence
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

// move/fade puffs + add “curl” so it looks like fumes
function updateTrails(dt){
  const t = performance.now()/1000;
  for (let i=TRAIL_PUFFS.length-1;i>=0;i--){
    const p = TRAIL_PUFFS[i];

    // curl force (very cheap)
    const k = curl(p.x*0.7, p.y*0.7, t + p.seed*0.001);
    p.vx += k * 3 * dt;
    p.vy += k * 1.5 * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.r += p.grow * dt;          // widen plume
    p.life += dt * 0.6;          // normalize to ~1.5–2s lifespan
    p.a *= 0.985;                // slow fade

    // reap
    if (p.a <= 0.02 || p.r >= 90){
      TRAIL_PUFFS.splice(i,1);
    }
  }
}

// draw the puffs UNDER planes (so planes stay crisp)
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

    // pointer on window, same pattern as forest fliers
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

  // bands: keep fliers mostly around lamp horizon line
  function lampBand(){
    // vertical band ~ middle third
    const y1 = h*0.30, y2 = h*0.55;
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

  // arm the puff timer immediately (first spawn ~40–90ms)
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
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0
    };
  }
function drawShadow(x,y, gy, alpha=0.15){
  const d = Math.max(8, Math.min(42, (y - (gy-90))*0.25)); // size grows as it nears ground
  const a = Math.max(0, Math.min(alpha, (y - (gy-140))*0.003));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(10,10,12,1)";
  ctx.beginPath();
  ctx.ellipse(x, gy+1, d, d*0.35, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

  // visuals — simple vector shapes (no external images required)
  function drawPlane(p){
  const s = p.size, body = s*2.4, wing = s*1.6;
  ctx.save();
  ctx.translate(p.x, p.y);

  // No banking when flying/retiring. Only rotate during fall (crash tumble).
  const ang = (p.state==="fall") ? (p.rot || 0) : 0;
  ctx.rotate(ang);

  // Mirror for direction so the nose points correctly.
  // dir = +1 means left→right (no flip), -1 means right→left (flip X)
  const flipX = (p.dir === -1) ? -1 : 1;
  ctx.scale(flipX, 1);

  ctx.globalAlpha = Math.max(0, Math.min(1, p.a));

  // fuselage (centered), nose points to +X in local space (flip handles facing)
  ctx.fillStyle = "rgba(200,205,210,0.95)";
  ctx.fillRect(-body*0.5, -s*0.25, body, s*0.5);

  // nose cone
  ctx.beginPath();
  ctx.moveTo(body*0.5, -s*0.25);
  ctx.lineTo(body*0.5 + s*0.7, 0);
  ctx.lineTo(body*0.5,  s*0.25);
  ctx.closePath();
  ctx.fill();

  // wings (no flap wobble for realism)
  ctx.fillStyle = "rgba(170,175,182,0.95)";
  ctx.fillRect(-wing*0.2, -s*0.9, wing*0.4, s*1.8);

  // tail
  ctx.fillRect(-body*0.45, -s*0.75, s*0.25, s*0.9);

  ctx.restore();
}


  function drawDrone(d){
  const s=d.size;
  ctx.save(); ctx.translate(d.x,d.y);
  // gentle drift while flying; use crash rotation when falling
  const ang = (d.state==="fly" || d.state==="retire") ? Math.sin(d.t*1.7)*0.04 : (d.rot||0);
  ctx.rotate(ang);
  ctx.globalAlpha = clamp(0,d.a,1);

  // body
  ctx.fillStyle="rgba(70,72,78,0.95)";
  ctx.fillRect(-s*0.6, -s*0.4, s*1.2, s*0.8);
  // arms
  ctx.fillRect(-s*1.4, -s*0.08, s*2.8, s*0.16);
  ctx.fillRect(-s*0.08, -s*1.2, s*0.16, s*2.4);

  // spinning rotors (use d.blade)
  const b = d.blade || 0;
  const rotor = (rx,ry)=>{
    ctx.save(); ctx.translate(rx,ry);
    ctx.rotate(b);
    ctx.fillStyle="rgba(40,40,44,0.9)";
    // draw a simple cross blade that “spins”
    ctx.fillRect(-s*0.55, -s*0.08, s*1.1, s*0.16);
    ctx.fillRect(-s*0.08, -s*0.55, s*0.16, s*1.1);
    ctx.restore();
  };
  rotor(-s*1.4, -s*1.2);
  rotor( s*1.4, -s*1.2);
  rotor(-s*1.4,  s*1.2);
  rotor( s*1.4,  s*1.2);

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
    if (cursor.x<0) { a.hoverT=0; return; }
    const dx=a.x-cursor.x, dy=a.y-cursor.y;
    if (Math.hypot(dx,dy) < (HIT_R[a.type] || radius(a))) {
      a.hoverT += dt*1000;
      if (a.hoverT > HOVER_ARM_MS && a.state==="fly") knockDown(a);
    } else {
      a.hoverT = Math.max(0, a.hoverT - dt*400);
    }
  }
  function clickAt(x,y){
    const now=performance.now();
    if (now - lastKnockTs < CLICK_COOLDOWN_MS) return;
    let best=-1, bestD=1e9;
    for (let i=0;i<actors.length;i++){
      const a=actors[i]; if (a.state!=="fly") continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < (HIT_R[a.type]||radius(a)) && d < bestD){ best=i; bestD=d; }
    }
    if (best>=0){ knockDown(actors[best]); lastKnockTs=now; }
  }

function knockDown(a){
  const now=performance.now();
  if (now - lastKnockTs < CLICK_COOLDOWN_MS) return;
  a.state="fall";
  a.a = Math.max(0.6, a.a);
  a.vy = rand(40, 70);
  a.vx *= 0.40;
  a.rotV = (a.type==="plane") ? rand(-1.2,1.2)*0.004 : rand(-1.6,1.6)*0.005;

// stop emitting puffs after the hit
a._trailNext = Number.POSITIVE_INFINITY;

  lastKnockTs = now;
}


  function explodeIntoDebris(a, gy){
  const pieces=[];
  const baseX = a.x, baseY = gy - 1;

  // helper to push a live, moving fragment
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
    // fuselage chunk
    shard({kind:"rect", w:a.size*1.8, h:a.size*0.55, fill:"rgba(140,145,152,1)"}, 1.0);
    // wing shards
    shard({kind:"tri",  w:a.size*1.1, h:a.size*0.65, fill:"rgba(120,125,132,1)"}, 0.9);
    shard({kind:"tri",  w:a.size*1.1, h:a.size*0.65, fill:"rgba(120,125,132,1)"}, 0.9);
    // nose cone
    shard({kind:"rect", w:a.size*0.7, h:a.size*0.35, fill:"rgba(165,170,176,1)"}, 1.1);
  } else {
    // drone body
    shard({kind:"rect", w:a.size*1.1, h:a.size*0.7, fill:"rgba(60,60,66,1)"}, 0.9);
    // four rotors pop off
    for (let i=0;i<4;i++){
      shard({kind:"circ", r:a.size*0.38, fill:"rgba(40,40,44,1)"}, 1.0);
    }
  }

  // keep + cap
  wrecks.push(...pieces);
  if (wrecks.length > MAX_WRECKS) wrecks.splice(0, wrecks.length - MAX_WRECKS);
}



  function maybeSpawn(now, seg){
    // seg mapping: lean toward planes early, drones later
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

  function segFromScene(sceneIdx, localP){
    // keep three logical spans consistent with your crossfades
    return sceneIdx; // 0,1,2 directly maps for lamps
  }

  // main loop
  // --- replace the whole loop(ts) with this ---
let prevTS = 0;
function loop(ts){
  if (!ctx){ requestAnimationFrame(loop); return; }
  if (!prevTS) prevTS = ts;
  const dt = Math.max(0.001, Math.min(0.050, (ts - prevTS)/1000));
  prevTS = ts;

  size();
  ctx.clearRect(0,0,w,h);

  if (lampsPinned){
    const gy = groundY();
    updateWrecks(dt, gy);

     //keep the cloudy plume alive >>>
  updateTrails(dt);
  drawTrails(ctx);

    const seg = segFromScene(currentScene, sceneProg);

    if (seg !== lastSeg){
      // retire non-native types softly (let them fly out)
      // planes allowed in 0..1; drones allowed in 1..2
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
        // drones: rotor spin while flying/retiring
        if (a.type !== "plane") {
          a.blade = (a.blade ?? 0) + dt * 22; // radians/s
        }

        // move
        a.x += a.vx * dt;

        // planes: perfectly level; drones: gentle hover wobble
        if (a.type === "plane") {
          a.y = a.yBase;
        } else {
          a.y = a.yBase
              + Math.sin(a.phase + a.t*a.freq)*a.amp
              + Math.sin(a.t*0.7)*1.2;
        }

         //  sample the smoke trail for planes (after x/y are updated) <<<
  if (a.type === "plane"){
    trailPushSample(a, dt);
  }

        // fade logic
        a.a += (a.state==="retire" ? -0.05 : 0.035);
        a.a = clamp(0, a.a, 1);

        // hover-to-knock interaction
        tryArmHover(a, dt);

        // offscreen cleanup if fully faded
        const on = a.x>-80 && a.x<w+80 && a.y>-80 && a.y<h+80;
        if (!on && a.a<=0.01) a.state="dead";
      }
      else if (a.state==="fall"){
        // during fall, spin props down + tumble for drones only
        if (a.type === "drone"){
          a.blade = Math.max(0, (a.blade ?? 0) - dt * 12);
        }

        a.vy += G*dt;
        a.vx *= DRAG;
        a.x  += a.vx * dt;
        a.y  += a.vy * dt;
        a.rot += a.rotV;
        a.rotV *= 0.995;

        if (a.y >= gy){
          a.y = gy;
          // tiny ground “bounce” before breakup for feel
          if (Math.abs(a.vy) > 120){
            a.vy = -Math.abs(a.vy) * 0.18;
            a.vx *= 0.65;
          } else {
            // break apart and persist
            explodeIntoDebris(a, gy);
            a.state = "dead";
            a.a = 0;
          }
        }
      }
      else if (a.state==="dead"){
        a.a = 0;
      }

      // draw live
  if (a.a > 0){
  // trail first so it appears behind the plane
  drawShadow(a.x, a.y, gy);
  if (a.type === "plane") drawPlane(a);
  else drawDrone(a);
}


      if (a.a > 0 && a.y < h + 200) alive.push(a);
    }
    actors = alive;

    // draw wrecks after actors
    for (let i=0;i<wrecks.length;i++) drawWreck(wrecks[i]);
  }

  requestAnimationFrame(loop);
}


  // public API (called from lamps ScrollTrigger onUpdate)
  function setScene(idx){ currentScene = (idx|0); }
  function setProgress(t){ sceneProg = clamp(0, +t||0, 1); }
  function setEnabled(pinned){ lampsPinned = !!pinned; }
  function update(){ if (!built) build(); }

  // expose
  window.__lampFliers = { setScene, setProgress, setEnabled, update, build };
})();
