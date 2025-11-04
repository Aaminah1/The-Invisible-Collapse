// js/fliers.js — butterflies, bees, flies, alates, bats
// Segments by progress p in [0..1]:
//  0: butterflies
//  1: butterflies + bees (interleaved; never same tick)
//  2: flies
//  3: alates (winged termites)
//  4: bats
//
// Hover/click → 'hurt' flash/jitter → fall with spin → land puff → fade.

(function Fliers(){
  let built=false, cvs, ctx, w=0, h=0, dpr=1;
  let actors=[];
  let lastSeg=-1;
  let nextSpawn={ but:0, bee:0, fly:0, alate:0, bat:0 };
  let lastAnySpawnTs=0, lastSpecies="";

  const cursor={ x:-1, y:-1, down:false };
  let lastKnockTs=0;

  const Z_INDEX=30, MARGIN=46, GROUND_RISE_PX=36;

  // ---- per-species tuning ----
  const BUT  = { max:3, gapMs:[4200, 8800], speed:[28, 50], amp:[6,13],  freq:[0.7,1.2], size:[10,14], hurtMs:220, spin:[-0.9,0.9] };
  const BEE  = { max:3, gapMs:[3600, 7200], speed:[32, 56], amp:[5,11],  freq:[0.9,1.5], size:[9,13],  hurtMs:200, spin:[-1.0,1.0] };
  const FLY  = { max:4, gapMs:[2800, 5400], speed:[44, 72], amp:[4,9],   freq:[1.2,1.9], size:[6,9],  hurtMs:160, spin:[-1.6,1.6] };
  const ALATE= { max:3, gapMs:[3600, 7400], speed:[20, 38], amp:[7,14],  freq:[0.7,1.1], size:[10,15], hurtMs:220, spin:[-0.8,0.8] };
  const BAT  = { max:2, gapMs:[5200,11000], speed:[42, 66], amp:[10,18], freq:[1.0,1.6], size:[13,18], hurtMs:260, spin:[-0.8,0.8] };

  // per-segment density multipliers (0..4)
  const SEG_MULT = {
    but:  [1.3, 1.2, 0,   0,   0],
    bee:  [0,   1.0, 0,   0,   0],
    fly:  [0,   0,   1.0, 0,   0],
    alate:[0,   0,   0,   1.0, 0],
    bat:  [0,   0,   0,   0,   1.0]
  };

  // cross-species spawn spacing (ms) for seg 1
  const CROSS_GAP_MS = 650;

  // segment cuts (tweak to taste)
  const CUT = { S0:0.20, S1:0.45, S2:0.70, S3:0.90 }; 
  function segFromP(p){
    if (p < CUT.S0) return 0; // Full
    if (p < CUT.S1) return 1; // Mid1
    if (p < CUT.S2) return 2; // Mid2
    if (p < CUT.S3) return 3; // Mid3
    return 4;                 // Bare
  }

  const FADE_IN=0.03, FADE_OUT=0.06;

  const INTERACT = {
    hoverArmMs: 280,
    minGapMs: 320,
    hoverR: { but: 18, bee: 18, fly: 14, alate: 18, bat: 22 },
    clickR: { but: 22, bee: 22, fly: 18, alate: 22, bat: 26 }
  };

  const clamp=(a,v,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
// wing-shedding particles (tiny translucent flakes)
let _wingFlakes = [];

  // sizing to leaf canvas
  function sizeToLeafCanvas(){
    const leaf=document.getElementById("leafCanvas");
    if (!leaf || !cvs) return;
    const r=leaf.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    cvs.width  = Math.max(2, Math.floor(r.width  * dpr));
    cvs.height = Math.max(2, Math.floor(r.height * dpr));
    cvs.style.width  = r.width + "px";
    cvs.style.height = r.height + "px";
    if (ctx) ctx.setTransform(dpr,0,0,dpr,0,0);
    w = Math.floor(r.width); h = Math.floor(r.height);
  }

  function build(){
    if (built) return;
    const leaf=document.getElementById("leafCanvas");
    if (!leaf) return;

    cvs=document.createElement("canvas");
    cvs.id="crittersCanvas";
    Object.assign(cvs.style, { position:"absolute", inset:"0", pointerEvents:"none", zIndex:String(Z_INDEX) });
    leaf.parentNode.insertBefore(cvs, leaf);

    ctx = cvs.getContext("2d");
    sizeToLeafCanvas();

    window.addEventListener("pointermove", e=>{
      if (!cvs) return;
      const r=cvs.getBoundingClientRect();
      cursor.x = e.clientX - r.left; cursor.y = e.clientY - r.top;
    }, {passive:true});
    const reset=()=>{ cursor.x=cursor.y=-1; cursor.down=false; };
    window.addEventListener("pointerleave", reset, {passive:true});
    window.addEventListener("blur", reset, {passive:true});
    window.addEventListener("pointerdown", e=>{
      if (!cvs) return;
      const r=cvs.getBoundingClientRect();
      clickAt(e.clientX - r.left, e.clientY - r.top);
    }, {passive:true});

    window.addEventListener("resize", ()=>setTimeout(sizeToLeafCanvas,0), {passive:true});

    const now=performance.now();
    nextSpawn.but   = now + rand(...BUT.gapMs);
    nextSpawn.bee   = now + rand(...BEE.gapMs);
    nextSpawn.fly   = now + rand(...FLY.gapMs);
    nextSpawn.alate = now + rand(...ALATE.gapMs);
    nextSpawn.bat   = now + rand(...BAT.gapMs);
    lastAnySpawnTs  = now - CROSS_GAP_MS;

    requestAnimationFrame(loop);
    built=true;
  }

  // flight bands
  function canopyBand(){
    const L = (window.TREE_RECTS || []);
    if (L && L.length){
      const r = L[Math.floor(Math.random()*L.length)];
      const y1 = r.y1 + 2;
      const y2 = Math.min(h, r.y1 + Math.max(14, (r.y2 - r.y1) * 0.55));
      const x1 = Math.max(0, r.x1 - 40);
      const x2 = Math.min(w, r.x2 + 40);
      return {x1,x2,y1,y2};
    }
    return {x1:w*0.15, x2:w*0.85, y1:h*0.28, y2:h*0.45};
  }
  const batBand = ()=> {
    const b=canopyBand();
    return { x1: Math.max(0, b.x1 - 30), x2: Math.min(w, b.x2 + 30),
             y1: Math.max(0, b.y1 - 10), y2: Math.min(h, b.y2 + 6) };
  };
  const flyBand = ()=> {
    const b=canopyBand();
    return { x1: Math.max(0, b.x1 - 50), x2: Math.min(w, b.x2 + 50),
             y1: clamp(0, b.y1 + (b.y2-b.y1)*0.25, h*0.65),
             y2: clamp(0, b.y2 + (b.y2-b.y1)*0.45, h*0.78) };
  };
  const alateBand = ()=> {
    // a touch below canopy, fairly wide (they drift near branches)
    const b=canopyBand();
    return { x1: Math.max(0, b.x1 - 60), x2: Math.min(w, b.x2 + 60),
             y1: clamp(0, b.y1 + (b.y2-b.y1)*0.15, h*0.62),
             y2: clamp(0, b.y2 + (b.y2-b.y1)*0.40, h*0.78) };
  };

  // factories
  function makeBase(type, band, spec){
    const fromLeft=Math.random()<0.5;
    const startX = fromLeft ? -MARGIN : w+MARGIN;
    const y0 = rand(band.y1, band.y2);
    const vx  = rand(...spec.speed) * (fromLeft?1:-1);
    const facing = (vx>=0)? 1 : -1; // for mirroring
    return {
      type, state:"fly",
      x:startX, y:y0 + rand(-6,6), yBase:y0,
      vx, facing,
      amp: rand(...spec.amp), freq: rand(...spec.freq), phase: rand(0,Math.PI*2),
      size: rand(...spec.size),
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0,
      hurtT:0, hurtMs: spec.hurtMs || 200, hurtFlash:0,
      landT:0, landed:false, landR:0,
      hue: rand(42,54), sat: rand(0.70,0.92),
      spinMin: spec.spin[0], spinMax: spec.spin[1]
    };
  }
  const makeButterfly = ()=> makeBase("but",   canopyBand(), BUT);
  const makeBee       = ()=> makeBase("bee",   canopyBand(), BEE);
  const makeFly       = ()=> makeBase("fly",   flyBand(),    FLY);
  const makeAlate     = ()=> makeBase("alate", alateBand(),  ALATE);
  const makeBat       = ()=> makeBase("bat",   batBand(),    BAT);

  // drawing
  function drawButterfly(b){
    const s=b.size, fl=Math.sin(b.t*10)*0.45;
    const j = (b.state==="hurt") ? (Math.sin(b.t*60)*0.12) : 0;
    ctx.save(); ctx.translate(b.x,b.y); ctx.scale(b.facing,1); ctx.rotate(j);
    const flash = (b.hurtFlash>0) ? b.hurtFlash : b.a;

    ctx.globalAlpha = clamp(0,flash,1)*0.95;
    ctx.fillStyle = `rgba(40,35,30,${0.55*flash})`;
    ctx.fillRect(-1, -s*0.55, 2, s*1.1);

    const wing=(sx)=>{ ctx.beginPath(); ctx.ellipse(sx*(s*0.9),0,s*0.95,s*0.60*(1+fl),0,0,Math.PI*2); ctx.fill(); };
    ctx.fillStyle = `hsla(28, 80%, 58%, ${0.82*flash})`; wing(-1);
    ctx.fillStyle = `hsla(34, 84%, 52%, ${0.82*flash})`; wing(+1);
    ctx.restore();
  }

  function drawBee(b){
    const s=b.size, flap=Math.sin(b.t*16)*0.35;
    const j = (b.state==="hurt") ? (Math.sin(b.t*70)*0.14) : 0;
    ctx.save(); ctx.translate(b.x,b.y); ctx.scale(b.facing,1); ctx.rotate(j);

    // wings
    ctx.save();
    ctx.globalAlpha = 0.45*b.a + (b.hurtFlash*0.2);
    ctx.fillStyle = "rgba(210,220,230,1)";
    ctx.beginPath(); ctx.ellipse(-s*0.6, -s*0.1, s*0.65, s*0.38*(1+flap), 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( s*0.6, -s*0.1, s*0.65, s*0.38*(1-flap), 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // body + stripes + head
    ctx.globalAlpha = clamp(0,b.a,1);
    ctx.fillStyle = `hsl(${Math.round(b.hue)}, ${Math.round(b.sat*100)}%, 44%)`;
    ctx.beginPath(); ctx.ellipse(0,0, s*0.9, s*0.55, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(30,28,24,0.95)";
    for(let i=-1;i<=1;i++) ctx.fillRect(-s*0.9 + (i+1)*s*0.55, -s*0.55, s*0.22, s*1.1);
    ctx.beginPath(); ctx.arc(s*0.9, 0, s*0.22, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawFly(f){
    const s=f.size, flap=Math.sin(f.t*18)*0.30;
    const j = (f.state==="hurt") ? (Math.sin(f.t*90)*0.18) : 0;
    ctx.save(); ctx.translate(f.x,f.y); ctx.scale(f.facing,1); ctx.rotate(j);

    ctx.globalAlpha = clamp(0,f.a,1);
    ctx.fillStyle = "rgba(45,48,55,1)";
    ctx.beginPath(); ctx.ellipse(0,0, s*0.55, s*0.35, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(60,64,72,1)";
    ctx.beginPath(); ctx.arc(s*0.55, 0, s*0.22, 0, Math.PI*2); ctx.fill();

    ctx.globalAlpha = 0.42*f.a + (f.hurtFlash*0.18);
    ctx.fillStyle = "rgba(210,220,230,1)";
    ctx.beginPath(); ctx.ellipse(-s*0.55, -s*0.05, s*0.65, s*0.35*(1+flap), 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( s*0.20, -s*0.05, s*0.65, s*0.35*(1-flap), 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // --- Realistic winged termite (alate) with hinged flapping wings ---
function drawAlate(a){
  // proportions tuned to your size range; wings flap from a thorax hinge
  const s = a.size * 1.15;                     // a touch larger for readability
  const t = a.t;
  const flap = Math.sin(t*9.5)*0.40;           // dynamic flap (−0.4..0.4 rad)
  const jitter = (a.state==="hurt") ? Math.sin(t*65)*0.12 : 0;
  const A = Math.max(0, Math.min(1, (a.hurtFlash>0 ? a.hurtFlash : a.a)));

  // Wing geometry relative to hinge
  const hinge = { x: -s*0.05, y: -s*0.02 };
  const wingLen  = s * 2.10;                   // long, extends well past abdomen
  const wingWide = s * 0.48;
  const rimAlpha = 0.22;                       // soft rim
  const veinAlpha= 0.26;

  // Draw a single wing oriented along +X from the hinge, then rotate it
  function wingPath(){
    // slim teardrop/capsule with a gentle point
    ctx.beginPath();
    // root
    ctx.moveTo(0, 0);
    // upper edge toward tip
    ctx.quadraticCurveTo( wingLen*0.38, -wingWide*0.85, wingLen*0.86, -wingWide*0.55);
    // tip
    ctx.quadraticCurveTo( wingLen*1.02, -wingWide*0.10, wingLen*0.92,  wingWide*0.08);
    // lower edge back to root
    ctx.quadraticCurveTo( wingLen*0.36,  wingWide*0.82,  0,  wingWide*0.12);
    // close near root
    ctx.quadraticCurveTo( wingLen*0.04,  wingWide*0.04,  0, 0);
    ctx.closePath();
  }

  function paintWing(baseAngle, alphaMul, warmTint){
    ctx.save();
    ctx.translate(hinge.x, hinge.y);
    ctx.rotate(baseAngle);
    // fill (translucent beige with slight warm edge)
    const g = ctx.createLinearGradient(0,0, wingLen, 0);
    g.addColorStop(0.00, `rgba(248,246,240,${0.86*A*alphaMul})`);
    g.addColorStop(0.65, `rgba(238,236,230,${0.66*A*alphaMul})`);
    g.addColorStop(1.00, `rgba(232,228,220,${0.54*A*alphaMul})`);
    ctx.fillStyle = g;
    wingPath(); ctx.fill();

    // soft rim
    ctx.globalAlpha = A * rimAlpha * alphaMul;
    ctx.strokeStyle = warmTint ? "rgba(175,150,120,1)" : "rgba(130,125,120,1)";
    ctx.lineWidth = Math.max(1, s*0.06);
    wingPath(); ctx.stroke();

    // faint veins (rays from root)
    ctx.globalAlpha = A * veinAlpha * alphaMul;
    ctx.strokeStyle = "rgba(150,145,135,1)";
    ctx.lineWidth = Math.max(1, s*0.025);
    const rays = 5;
    for(let i=0;i<rays;i++){
      const t = i/(rays-1);
      const ang = -0.22 + t*0.44;                         // spread
      const tipX = Math.cos(ang)*wingLen*0.90;
      const tipY = Math.sin(ang)*wingWide*0.78;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.quadraticCurveTo(wingLen*0.38, tipY*0.42, tipX, tipY);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.scale(a.facing, 1);
  ctx.rotate(jitter);

  // --- Wings (draw hind first, fore second) ---
  // base angles: vertical-ish; add opposite flap for each side, smaller for hind
  const leftBase  =  Math.PI*0.52 + flap*0.70;   // fore left
  const leftHind  =  Math.PI*0.58 + flap*0.45;   // hind left (slightly behind)
  const rightBase = -Math.PI*0.52 - flap*0.70;   // fore right
  const rightHind = -Math.PI*0.58 - flap*0.45;   // hind right

  // hind pair (slightly dimmer)
  paintWing(leftHind, 0.80, true);
  paintWing(rightHind,0.80, true);
  // fore pair (brighter)
  paintWing(leftBase, 1.00, true);
  paintWing(rightBase,1.00, true);

  // --- Body: tan abdomen with segments, compact thorax, dark head ---
  // abdomen (segmented; slightly glossy)
  ctx.globalAlpha = A;
  ctx.fillStyle = "rgba(170,140,105,0.95)";
  ctx.beginPath(); ctx.ellipse(-s*0.05, s*0.04, s*0.32, s*0.68, 0, 0, Math.PI*2); ctx.fill();
  // segment hints
  ctx.globalAlpha = A*0.35;
  ctx.strokeStyle = "rgba(110,90,70,1)";
  ctx.lineWidth = Math.max(1, s*0.04);
  for(let i=-2;i<=2;i++){
    const yy = i* (s*0.12);
    ctx.beginPath();
    ctx.ellipse(-s*0.05, yy*0.18 + s*0.04, s*0.26, s*0.08, 0, 0, Math.PI*2);
    ctx.stroke();
  }

  // thorax (wing hinge area)
  ctx.globalAlpha = A;
  ctx.fillStyle = "rgba(160,125,95,0.96)";
  ctx.beginPath(); ctx.ellipse(hinge.x + s*0.05, hinge.y + s*0.04, s*0.22, s*0.22, 0, 0, Math.PI*2); ctx.fill();

  // head (darker brown) + tiny mandible hint
  ctx.fillStyle = "rgba(80,65,55,1)";
  ctx.beginPath(); ctx.ellipse(s*0.26, -s*0.02, s*0.14, s*0.13, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = A*0.9;
  ctx.fillStyle = "rgba(70,58,50,1)";
  ctx.beginPath(); ctx.ellipse(s*0.36, -s*0.02, s*0.05, s*0.04, 0, 0, Math.PI*2); ctx.fill(); // mandible blob

  // antennae (straight, not elbowed)
  ctx.globalAlpha = A*0.9;
  ctx.strokeStyle = "rgba(80,70,62,1)";
  ctx.lineWidth = Math.max(1, s*0.018);
  ctx.beginPath(); ctx.moveTo(s*0.20, -s*0.06); ctx.quadraticCurveTo(s*0.48, -s*0.22, s*0.66, -s*0.20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*0.12, -s*0.06); ctx.quadraticCurveTo(-s*0.12, -s*0.22, -s*0.28, -s*0.18); ctx.stroke();

  // soft highlight on abdomen
  ctx.globalAlpha = A*0.28;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.ellipse(-s*0.14, -s*0.10, s*0.07, s*0.18, 0.3, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

  function drawBat(b){
    const span=b.size*2.1, half=span*0.5, flap=Math.sin(b.t*8)*0.30;
    const j = (b.state==="hurt") ? (Math.sin(b.t*55)*0.12) : 0;
    ctx.save(); ctx.translate(b.x,b.y); ctx.scale(b.facing,1); ctx.rotate((b.rot||0)+j);
    ctx.globalAlpha = clamp(0,b.a,1)*0.90;
    ctx.fillStyle="rgba(22,24,30,1)";
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.quadraticCurveTo(-half*0.7, -half*0.20 - span*flap, -half, 0);
    ctx.quadraticCurveTo(-half*0.35,  half*0.10 + span*flap*0.6,  0, 1.5);
    ctx.quadraticCurveTo( half*0.35,  half*0.10 + span*flap*0.6,  half, 0);
    ctx.quadraticCurveTo( half*0.7,  -half*0.20 - span*flap,       0, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-1.8, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // landing puff
  function drawLandPuff(a){
    if (!a.landed) return;
    const t=a.landT, life=0.45;
    if (t>life) return;
    const k=t/life, r=a.landR*(0.6+0.8*k), alpha = (1-k)*0.35*clamp(0,a.a,1);
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "rgba(120,120,120,1)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(a.x, a.y+1, r, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  }

  // interaction helpers
  function radius(a){ 
    if (a.type==="bat") return a.size*1.2;
    if (a.type==="fly") return a.size*0.9;
    return a.size*1.0; 
  }
  function tryArmHover(a, dt){
    if (cursor.x<0) { a.hoverT=0; return; }
    const dx=a.x-cursor.x, dy=a.y-cursor.y, d=Math.hypot(dx,dy);
    const r = INTERACT.hoverR[a.type] || radius(a);
    if (d < r) {
      a.hoverT += dt*1000;
      if (a.hoverT > INTERACT.hoverArmMs && a.state==="fly") triggerHurt(a);
    } else {
      a.hoverT = Math.max(0, a.hoverT - dt*500);
    }
  }
  function clickAt(x,y){
    const now=performance.now();
    if (now - lastKnockTs < INTERACT.minGapMs) return;
    let best=-1, bestD=1e9;
    for (let i=0;i<actors.length;i++){
      const a=actors[i]; if (a.state!=="fly") continue;
      const r = INTERACT.clickR[a.type] || radius(a);
      const d=Math.hypot(a.x - x, a.y - y);
      if (d < r && d < bestD){ best=i; bestD=d; }
    }
    if (best>=0){ triggerHurt(actors[best], true); lastKnockTs=now; }
  }

  function triggerHurt(a, fromClick=false){
    if (a.state!=="fly") return;
    a.state="hurt";
    a.hurtT=0;
    a.hurtFlash = 1.0;
    if (fromClick) a.vx *= 0.7;
    const spec = (a.type==="but"?BUT: a.type==="bee"?BEE: a.type==="fly"?FLY: a.type==="alate"?ALATE:BAT);
    a.rotV = rand(spec.spin[0], spec.spin[1]) * 0.004;
  }

  function beginFall(a){
    if (a.state==="fall") return;
    a.state="fall";
    a.a = Math.min(1, Math.max(0.5, a.a));
    a.vy = rand(22, 48);
    a.vx *= 0.35;
  }

  // spawn helpers
  const count = type => actors.filter(a=>a.type===type && a.state!=="dead").length;

  function trySpawn(specKey, makeFn, now, seg){
    const baseSpec = specKey==="but"?BUT: specKey==="bee"?BEE: specKey==="fly"?FLY: specKey==="alate"?ALATE:BAT;
    const mult = (SEG_MULT[specKey] && SEG_MULT[specKey][seg]) || 0;
    const maxAllowed = Math.ceil((baseSpec.max||1) * mult);
    if (maxAllowed <= 0) return false;

    if (count(specKey) < maxAllowed && now >= nextSpawn[specKey]){
      // cross-species staggering (seg 1)
      if (seg===1 && now - lastAnySpawnTs < CROSS_GAP_MS && lastSpecies !== specKey){
        nextSpawn[specKey] = lastAnySpawnTs + CROSS_GAP_MS + rand(50,220);
        return false;
      }
      actors.push(makeFn());
      nextSpawn[specKey] = now + rand(...baseSpec.gapMs);
      lastAnySpawnTs = now;
      lastSpecies = specKey;
      return true;
    }
    return false;
  }

  function maybeSpawn(now, seg){
    if (seg===0){ // butterflies
      trySpawn("but", makeButterfly, now, seg);
    }
    else if (seg===1){ // butterflies + bees
      const due = [
        {k:"but",  t:nextSpawn.but,  fn:makeButterfly},
        {k:"bee",  t:nextSpawn.bee,  fn:makeBee}
      ].sort((a,b)=>a.t-b.t);
      trySpawn(due[0].k, due[0].fn, now, seg);
      trySpawn(due[1].k, due[1].fn, now, seg);
    }
    else if (seg===2){ // flies
      trySpawn("fly", makeFly, now, seg);
    }
    else if (seg===3){ // alates
      trySpawn("alate", makeAlate, now, seg);
    }
    else if (seg===4){ // bats
      trySpawn("bat", makeBat, now, seg);
    }
  }

  // loop
  let prevTS=0;
  function loop(ts){
    if (!ctx){ requestAnimationFrame(loop); return; }
    if (!prevTS) prevTS=ts;
    const dt = Math.max(0.001, Math.min(0.050, (ts - prevTS)/1000));
    prevTS = ts;

    ctx.clearRect(0,0,w,h);

    const p = window.__currentProgress || 0;
    const seg = segFromP(p);

    if (seg !== lastSeg){
      actors.forEach(a=>{
        const keep =
          (seg===0 && a.type==="but") ||
          (seg===1 && (a.type==="but" || a.type==="bee")) ||
          (seg===2 && a.type==="fly") ||
          (seg===3 && a.type==="alate") ||
          (seg===4 && a.type==="bat");
        if (!keep && (a.state==="fly" || a.state==="hurt")) a.state="retire";
      });
      const now=performance.now();
      nextSpawn.but   = now + rand(...BUT.gapMs);
      nextSpawn.bee   = now + rand(...BEE.gapMs);
      nextSpawn.fly   = now + rand(...FLY.gapMs);
      nextSpawn.alate = now + rand(...ALATE.gapMs);
      nextSpawn.bat   = now + rand(...BAT.gapMs);
      lastAnySpawnTs  = now - CROSS_GAP_MS;
      lastSpecies = "";
      lastSeg = seg;
    }

    maybeSpawn(performance.now(), seg);

    const G = 360; // px/s^2
    const ground = h - GROUND_RISE_PX;

    const alive=[];
    for (let i=0;i<actors.length;i++){
      const a=actors[i];
      a.t += dt;

      if (a.state==="fly" || a.state==="retire"){
        a.x += a.vx * dt;

        // flight path
        if (a.type==="alate"){
          // slightly clumsy bob
          a.y = a.yBase + Math.sin(a.phase + a.t*a.freq)*a.amp + Math.sin(a.t*0.9 + a.phase*0.5)*1.8;
        } else {
          a.y = a.yBase + Math.sin(a.phase + a.t*a.freq)*a.amp + Math.sin(a.t*0.7)*1.1;
        }

        a.facing = (a.vx>=0)? 1 : -1; // keep facing updated
        a.a += (a.state==="retire" ? -FADE_OUT : FADE_IN);
        a.a = clamp(0,a.a,1);
        tryArmHover(a, dt);

        const on = a.x>-MARGIN && a.x<w+MARGIN && a.y>-MARGIN && a.y<h+MARGIN;
        if (!on && a.a<=0.01) { a.state="dead"; }
      }
      else if (a.state==="hurt"){
        a.hurtT += dt*1000;
        a.hurtFlash = Math.max(0, 1.0 - (a.hurtT / a.hurtMs));
        a.x += a.vx * dt * 0.3;
        if (a.hurtT >= a.hurtMs) beginFall(a);
      }
      else if (a.state==="fall"){
        a.vy += G*dt;
        a.y  += a.vy*dt;
        a.x  += a.vx*dt;
        a.rot += a.rotV; a.rotV *= 0.995;

        if (a.y >= ground){
          a.y = ground; 
          if (!a.landed){
            a.landed = true; a.landT = 0; a.landR = Math.max(6, a.size*0.9);
          }
          a.vx *= 0.90; a.vy *= -0.18; a.rotV *= 0.9;
          if (Math.abs(a.vy) < 8){ a.state="dead"; }
        }
      }
      else if (a.state==="dead"){
        a.a -= FADE_OUT*1.5;
      }

      // draw critter
      if (a.type==="but")        drawButterfly(a);
      else if (a.type==="bee")   drawBee(a);
      else if (a.type==="fly")   drawFly(a);
      else if (a.type==="alate") drawAlate(a);
      else                       drawBat(a);

      if (a.landed){ a.landT += dt; drawLandPuff(a); }
      if (a.a > 0 && a.y < h + MARGIN*2) alive.push(a);
    }
    actors = alive;

    requestAnimationFrame(loop);
  }

  function update(){ build(); } // call from your ScrollTrigger tick

  window.__fliers__ = { build, update };
})();
