// js/fliers.js — butterflies, bees, flies, alates, bats
// Segments by progress p in [0..1]:
//  0: butterflies
//  1: butterflies + bees
//  2: flies
//  3: alates
//  4: bats
//
// Hover/Click → HURT → FALL (spin → limp, fold/twitch wings, desaturate) → land puff → fade.

(function Fliers(){
  let built=false, cvs, ctx, w=0, h=0, dpr=1;
  let actors=[];
  let lastSeg=-1;

  let nextSpawn={ but:0, bee:0, fly:0, alate:0, bat:0 };
  let lastAnySpawnTs=0, lastSpecies="";
  const cursor={ x:-1, y:-1 };
  let lastKnockTs=0;

  const Z_INDEX=30, MARGIN=46, GROUND_RISE_PX=36;

  /* ===================== SPEED / SPAWN BOOST DIALS ====================== */
  const SPEED_BOOST  = { but:1.05, bee:2.05, fly:2.00, alate:1.65, bat:1.85 };
  const WOBBLE_MULT  = { but:1.00, bee:1.20, fly:1.35, alate:1.25, bat:1.15 };
  const FLAP_MULT    = { but:1.00, bee:1.35, fly:1.45, alate:1.25, bat:1.25 };
  // <1 = spawn sooner; reduced bees/flies/bats noticeably
  const GAP_MULT     = { but:0.90, bee:0.40, fly:0.45, alate:0.65, bat:0.60 };
  /* ===================================================================== */

  const BUT  = { max:4, gapMs:[4200,8800], speed:[26,58], amp:[6,14],  freq:[0.65,1.25], size:[10,15], hurtMs:220, spin:[-0.9,0.9] };
  const BEE  = { max:4, gapMs:[3600,7200], speed:[30,62], amp:[4,12],  freq:[0.9,1.6],  size:[9,14],  hurtMs:200, spin:[-1.0,1.0] };
  const FLY  = { max:6, gapMs:[2200,5200], speed:[46,86], amp:[3,8],   freq:[1.25,2.2], size:[4.5,8.5], hurtMs:160, spin:[-1.6,1.6] };
  const ALATE= { max:3, gapMs:[3400,7200], speed:[18,40], amp:[7,15],  freq:[0.7,1.15], size:[10,16], hurtMs:220, spin:[-0.8,0.8] };
  const BAT  = { max:3, gapMs:[5200,11000], speed:[40,70], amp:[10,20], freq:[1.0,1.6], size:[13,19],  hurtMs:260, spin:[-0.8,0.8] };

  const FLY_SKINS = {
    house: { thorax:"#5c646e", abdomen:"#3e444c", eye:"rgba(150,40,40,0.55)" },
    blue:  { thorax:"#607a8c", abdomen:"#3b5a70", eye:"rgba(150,40,40,0.55)" },
    green: { thorax:"#5f7955", abdomen:"#3d5b3a", eye:"rgba(150,40,40,0.55)" }
  };

  const SEG_MULT = {
    but:  [1.3, 1.1, 0,   0,   0],
    bee:  [0,   1.0, 0,   0,   0],
    fly:  [0,   0,   1.8, 0,   0],
    alate:[0,   0,   0,   1.0, 0],
    bat:  [0,   0,   0,   0,   1.0]
  };

  const BUT_PALETTES = {
    peach:  { wing:"#F6B592", edge:"#E28C63", edgeAlt:"#C77649", glow:"rgba(255,201,168,0.18)", body:"#5A4A40" },
    pollen: { wing:"#F4E08A", edge:"#D1B54A", edgeAlt:"#B79B3F", glow:"rgba(255,240,166,0.16)", body:"#5A4A40" },
    lilac:  { wing:"#C9B4F6", edge:"#9B86D6", edgeAlt:"#7E6EB8", glow:"rgba(230,218,255,0.16)", body:"#4C445C" },
    sage:   { wing:"#B6D0B5", edge:"#82A884", edgeAlt:"#6D9270", glow:"rgba(200,230,200,0.14)", body:"#495246" },
    dusk:   { wing:"#9FB3C7", edge:"#6E889D", edgeAlt:"#5A7283", glow:"rgba(190,210,230,0.14)", body:"#3F4650" },
    coral:  { wing:"#F2B3A4", edge:"#D9826E", edgeAlt:"#B96554", glow:"rgba(255,200,185,0.16)", body:"#5A443F" },
    sky:    { wing:"#BFD9F6", edge:"#86AEDD", edgeAlt:"#6E98C9", glow:"rgba(200,225,255,0.14)", body:"#3F4A58" },
    clay:   { wing:"#D9C0A6", edge:"#B39173", edgeAlt:"#9C7B5F", glow:"rgba(235,215,195,0.14)", body:"#4D4036" },
    mint:   { wing:"#CFE8DC", edge:"#9BC7B5", edgeAlt:"#7FAE9B", glow:"rgba(210,240,230,0.14)", body:"#405047" },
    ember:  { wing:"#E4C3A7", edge:"#B77F4E", edgeAlt:"#9D683D", glow:"rgba(255,215,185,0.14)", body:"#563F2F" }
  };

  // ===== Color helpers (for desaturation-on-fall) =====
  function hexToRgb(hex){
    if (hex.startsWith("rgba") || hex.startsWith("rgb")) return null; // skip non-hex
    const m = hex.replace("#","").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i); if(!m) return null;
    let h = m[1];
    if (h.length===3) h = h.split("").map(c=>c+c).join("");
    const r = parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
    return {r,g,b};
  }
  function rgbToHex(r,g,b){
    const h = v=>("0"+Math.max(0,Math.min(255, v|0)).toString(16)).slice(-2);
    return "#"+h(r)+h(g)+h(b);
  }
  function desaturateHex(hex, k){ // k: 0=no change, 1=gray
    const C = hexToRgb(hex); if (!C) return hex;
    const L = 0.2126*C.r + 0.7152*C.g + 0.0722*C.b;
    const r = C.r + (L - C.r)*k, g = C.g + (L - C.g)*k, b = C.b + (L - C.b)*k;
    return rgbToHex(r,g,b);
  }

  const HURT_SLOW = { but:0.35, bee:0.30, fly:0.26, alate:0.80, bat:0.40 };
  const SPIN_CAP  = { but:0.0009, bee:0.0014, fly:0.0017, alate:0.0015, bat:0.0013 };
  const FALL_DRIFT_MIN = { but:12, bee:14, fly:16, alate:24, bat:18 };
  const FALL_VX_MUL    = { but:0.40, bee:0.38, fly:0.36, alate:0.55, bat:0.45 };

  const CROSS_GAP_MS = 650;
  const CUT = { S0:0.20, S1:0.45, S2:0.70, S3:0.90 };
  const segFromP = p => (p<CUT.S0?0 : p<CUT.S1?1 : p<CUT.S2?2 : p<CUT.S3?3 : 4);

  const FADE_IN=0.03, FADE_OUT=0.06;

  const INTERACT = {
    hoverR: { but:18, bee:18, fly:14, alate:18, bat:22 },
    clickR: { but:22, bee:22, fly:18, alate:22, bat:26 },
    minGapMs: 160
  };

  const BUT_TURN_MAX = 1.6;
  const BUT_Y_SMOOTH = 5.0;

  const clamp=(a,v,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const rint=(a,b)=>Math.floor(rand(a,b+1));
  const randExp = mean => -Math.log(1-Math.random()) * mean;

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
    window.addEventListener("pointerleave", ()=>{ cursor.x=cursor.y=-1; }, {passive:true});
    window.addEventListener("blur", ()=>{ cursor.x=cursor.y=-1; }, {passive:true});
    window.addEventListener("pointerdown", e=>{
      if (!cvs) return;
      const r=cvs.getBoundingClientRect();
      clickAt(e.clientX - r.left, e.clientY - r.top);
    }, {passive:true});
    window.addEventListener("resize", ()=>setTimeout(sizeToLeafCanvas,0), {passive:true});

    const now=performance.now();
    seedSpawnTimes(now);

    requestAnimationFrame(loop);
    built=true;
  }

  function meanGap(specKey){
    const s = specKey==="but"?BUT: specKey==="bee"?BEE: specKey==="fly"?FLY: specKey==="alate"?ALATE:BAT;
    const base = (s.gapMs[0] + s.gapMs[1]) / 2;
    return base * (GAP_MULT[specKey] || 1);
  }

  function seedSpawnTimes(now){
    nextSpawn.but   = now + rint(80,380)  + randExp(meanGap("but"));
    nextSpawn.bee   = now + rint(120,420) + randExp(meanGap("bee"));
    nextSpawn.fly   = now + rint(60,260)  + randExp(meanGap("fly"));
    nextSpawn.alate = now + rint(140,460) + randExp(meanGap("alate"));
    nextSpawn.bat   = now + rint(160,520) + randExp(meanGap("bat"));
    lastAnySpawnTs  = now - CROSS_GAP_MS;
  }

  function canopyBand(){
    const L = (window.TREE_RECTS || []);
    if (L && L.length){
      const r = L[rint(0, L.length-1)];
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
    const b=canopyBand();
    return { x1: Math.max(0, b.x1 - 60), x2: Math.min(w, b.x2 + 60),
             y1: clamp(0, b.y1 + (b.y2-b.y1)*0.15, h*0.62),
             y2: clamp(0, b.y2 + (b.y2-b.y1)*0.40, h*0.78) };
  };

  function makeBase(type, band, spec){
    const fromLeft=Math.random()<0.5;
    const startX = fromLeft ? -MARGIN : w+MARGIN;
    const y0 = rand(band.y1, band.y2);

    const speedJitter = rand(0.85, 1.20);
    const scaleJitter = rand(0.85, 1.25);
    const phase2      = Math.random()*Math.PI*2;

    const wander = {
      t: rand(0, 1000),
      ampX: rand(0.4, 1.2),
      ampY: rand(0.6, 2.0),
      fX: rand(0.35, 0.75),
      fY: rand(0.25, 0.65),
      swerveEvery: rint(1500, 3200),
      nextSwerve: performance.now() + rint(600, 2200),
      swerveVX: 0
    };

    let vx  = rand(...spec.speed) * speedJitter * (SPEED_BOOST[type] || 1) * (fromLeft?1:-1);
    const facing = (vx>=0)? 1 : -1;

    return {
      type, state:"fly",
      x:startX, y:y0 + rand(-6,6), yBase:y0,
      vx, facing,
      amp: rand(...spec.amp),
      freq: rand(...spec.freq) * (WOBBLE_MULT[type] || 1),
      phase: rand(0,Math.PI*2),
      size: rand(...spec.size),
      scale: scaleJitter,
      phase2,
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0,
      hurtT:0, hurtMs: spec.hurtMs || 200, hurtFlash:0,
      landT:0, landed:false, landR:0,
      hue: rand(42,54), sat: rand(0.70,0.92),
      spinMin: spec.spin[0], spinMax: spec.spin[1],
      noise: wander,
      _px: startX, _py: y0
    };
  }

  const makeButterfly = ()=> {
    const a = makeBase("but", canopyBand(), BUT);
    const keys = Object.keys(BUT_PALETTES);
    a.skin = BUT_PALETTES[ keys[(Math.random()*keys.length)|0] ];
    a.skinAltEdge = Math.random() < 0.12;
    a.tone = 0.92 + Math.random()*0.16;
    a.heading = 0;
    a.ySmooth = a.y;
    a.phase2  = Math.random()*Math.PI*2;
    a.scale   = 1 + Math.random()*0.25;
    a.amp    *= 0.9 + Math.random()*0.35;
    a.freq   *= 0.9 + Math.random()*0.3;

    // NEW: per-actor twitch for fall
    a.twitch = rand(3.6, 5.0);
    return a;
  };

  const makeBee = ()=> {
    const a = makeBase("bee", canopyBand(), BEE);
    a.freq *= rand(0.95,1.15) * (WOBBLE_MULT.bee || 1);
    return a;
  };

  const makeFly = ()=> {
    const a = makeBase("fly", flyBand(), FLY);
    a.skin  = FLY_SKINS[ ["house","blue","green"][rint(0,2)] ];
    a.spark = Math.random()*Math.PI*2;
    a.scale *= rand(0.95,1.15);
    return a;
  };

  const makeAlate = ()=> {
    const a = makeBase("alate", alateBand(), ALATE);
    a.breakT=0; a.broken=false; a.shards=null;
    return a;
  };

  const makeBat = ()=> makeBase("bat", batBand(), BAT);

  // ---------- tiny helper for fall trail ----------
  function fallTrail(X, size){
    if (X.state!=="fall" || X.a<=0) return;
    ctx.save();
    ctx.globalAlpha = 0.06 * (1 - (X.limp||0)) * clamp(0, Math.min(1, Math.abs(X.vx)/120), 1);
    ctx.fillStyle = "rgba(30,30,40,1)";
    ctx.beginPath();
    ctx.ellipse(X.x - (X.facing||1)*(size*0.8), X.y, size*0.8, size*0.28, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- drawing ----------
  function drawButterfly(b){
    const s  = b.size * (b.scale || 1);
    const t  = b.t;
    const fallLimp = (b.state==="fall") ? (b.limp || 0) : 0;

    // wing flap: fade + add asym “twitch” while falling
    let fl = Math.sin(t*10 + (b.phase2||0))*0.42 * (b.state==="fall" ? (1 - 0.90*fallLimp) : 1);
    const twitch = (b.state==="fall") ? Math.sin(t * (b.twitch || 4.2)) * 0.06 * (1 - fallLimp) : 0;

    const j  = (b.state==="hurt") ? (Math.sin(t*60)*0.12) : 0;
    const A  = clamp(0, (b.hurtFlash>0 ? b.hurtFlash : b.a), 1);
    const skin = b.skin || BUT_PALETTES.peach;

    // desaturation amount grows with limp
    const kDesat = (b.state==="fall") ? (0.25 + 0.55*fallLimp) : 0;
    const wingCol = desaturateHex(skin.wing, kDesat);
    const edgeCol = desaturateHex((b.skinAltEdge && skin.edgeAlt) ? skin.edgeAlt : skin.edge, kDesat);
    const bodyCol = desaturateHex(skin.body, kDesat);
    const tone    = b.tone || 1.0;

    const bodyH = s*1.10, bodyW = s*0.18;

    // NEW: real wing narrowing (not just tilt) during fall
    const wingL = s*0.95;
    const wingWBase = s*0.62;
    const wingW = (b.state==="fall") ? wingWBase * (1 - 0.38*fallLimp) : wingWBase;

    ctx.save();
    ctx.translate(b.x, b.y);

    // rotate: fly uses heading; fall uses tumble
    const bodyAngle = (b.state==="fall" ? (b.rot || 0) : (b.heading || 0)) + j*(1 - fallLimp*0.8);
    ctx.rotate(bodyAngle);

    // soft overall glow
    ctx.save();
    ctx.globalAlpha = A;
    ctx.shadowColor = skin.glow;
    ctx.shadowBlur  = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // body (desaturated on fall)
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW, bodyH*0.52, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -bodyH*0.46, bodyW*1.1, 0, Math.PI*2);
    ctx.fill();

    ctx.restore(); // remove shadow before wing edges

    function paintWing(sign){
      ctx.save();

      // extra fold-in + asym twitch on fall
      const foldIn = (b.state==="fall") ? (0.16 + 0.30*fallLimp) : 0;
      const baseTilt = (0.20 - 0.16*fallLimp + foldIn) * sign + (twitch * sign);
      const flapTilt = fl * (0.55 * (1 - 0.6*fallLimp)) * sign;
      ctx.rotate(baseTilt + flapTilt);

      const grad = ctx.createLinearGradient(0, 0, wingL * sign, 0);
      grad.addColorStop(0.00, wingCol);
      grad.addColorStop(1.00, wingCol);
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo( wingL*0.35*sign, -wingW*0.85, wingL*0.86*sign, -wingW*0.55 );
      ctx.quadraticCurveTo( wingL*1.02*sign, -wingW*0.10, wingL*0.92*sign,  wingW*0.08 );
      ctx.quadraticCurveTo( wingL*0.36*sign,  wingW*0.82,  0,  wingW*0.12 );
      ctx.quadraticCurveTo( wingL*0.04*sign,  wingW*0.04,  0, 0 );
      ctx.closePath();

      ctx.globalAlpha = A * 0.92 * tone;
      ctx.fill();

      ctx.globalAlpha = A * 0.55 * tone;
      ctx.strokeStyle = edgeCol;
      ctx.lineWidth   = Math.max(1, s*0.06);
      ctx.stroke();

      // veins fade slightly when falling
      ctx.globalAlpha = A * (b.state==="fall" ? 0.18 : 0.25);
      ctx.strokeStyle = "rgba(80,70,60,0.7)";
      ctx.lineWidth   = Math.max(1, s*0.025);
      for(let i=0;i<3;i++){
        const tt = i/2;
        const ang = (-0.18 + tt*0.36) * sign;
        const tipX = Math.cos(ang)*wingL*0.90 * sign;
        const tipY = Math.sin(ang)*wingW*0.78;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo( wingL*0.38*sign, tipY*0.42, tipX, tipY );
        ctx.stroke();
      }

      ctx.restore();
    }

    paintWing(-1);
    paintWing(+1);

    // Antennae: tuck/shorten and curve more during fall
    const antennaAlpha = A * (b.state==="fall" ? 0.60 : 0.75);
    ctx.globalAlpha = antennaAlpha;
    ctx.strokeStyle = bodyCol;
    const antennaW = Math.max(1, s*0.03);
    ctx.lineWidth   = antennaW;

    const tuckMul  = (b.state==="fall") ? (1 - 0.35*fallLimp) : 1; // shorter
    const curveMul = (b.state==="fall") ? (1 + 0.45*fallLimp) : 1; // more curl

    // Right antenna
    ctx.beginPath();
    ctx.moveTo( 0, -bodyH*0.52 * tuckMul);
    ctx.quadraticCurveTo(  s*0.22*curveMul, -bodyH*0.75*tuckMul,  s*0.30*tuckMul, -bodyH*0.60*tuckMul );
    ctx.stroke();
    // Left antenna
    ctx.beginPath();
    ctx.moveTo( 0, -bodyH*0.52 * tuckMul);
    ctx.quadraticCurveTo( -s*0.22*curveMul, -bodyH*0.75*tuckMul, -s*0.30*tuckMul, -bodyH*0.60*tuckMul );
    ctx.stroke();

    ctx.restore();
    fallTrail(b, s);
  }

  function drawBee(b){
    const s = b.size * (b.scale || 1);
    const fallLimp = (b.state==="fall") ? (b.limp || 0) : 0;
    let flap = Math.sin((b.t*16 + (b.phase2 || 0)) * (FLAP_MULT.bee || 1)) * 0.35 * (b.state==="fall" ? (1 - 0.9*fallLimp) : 1);
    const j = (b.state==="hurt") ? (Math.sin(b.t*70)*0.14) : 0;
    const A = Math.max(0, Math.min(1, (b.hurtFlash>0 ? b.hurtFlash : b.a)));

    // body hue → slightly duller when falling
    const hue = b.hue, sat = b.sat*(b.state==="fall" ? (0.75 - 0.3*fallLimp) : 1);
    ctx.save(); ctx.translate(b.x,b.y); ctx.scale(b.facing,1); ctx.rotate((b.state==="fall" ? (b.rot||0) : 0) + j*(1 - fallLimp*0.8));

    // wings (tuck inward on fall)
    ctx.save();
    ctx.globalAlpha = (0.38*A + b.hurtFlash*0.18) * (b.state==="fall" ? 0.8 : 1);
    const g = ctx.createLinearGradient(-s*0.8,0,s*0.8,0);
    g.addColorStop(0,"rgba(220,230,240,0.9)");
    g.addColorStop(1,"rgba(220,230,240,0.6)");
    ctx.fillStyle = g;
    const foldScale = (b.state==="fall") ? (0.9 - 0.5*fallLimp) : 1;
    ctx.beginPath(); ctx.ellipse(-s*0.55, -s*0.1, s*0.60*foldScale, s*0.34*(1+flap)*foldScale, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( s*0.55, -s*0.1, s*0.60*foldScale, s*0.34*(1-flap)*foldScale, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // body
    ctx.globalAlpha = A;
    ctx.fillStyle = `hsl(${Math.round(hue)}, ${Math.round(sat*85)}%, 44%)`;
    ctx.beginPath(); ctx.ellipse(0,0, s*0.9, s*0.55, 0, 0, Math.PI*2); ctx.fill();

    // stripes
    ctx.fillStyle = "rgba(30,28,24,0.95)";
    for(let i=-1;i<=1;i++) ctx.fillRect(-s*0.9 + (i+1)*s*0.55, -s*0.55, s*0.22, s*1.1);

    // head
    const headLead = Math.max(-0.25, Math.min(0.25, b.vx*0.002));
    ctx.save(); ctx.translate(s*0.9, 0); ctx.rotate(headLead); ctx.beginPath(); ctx.arc(0, 0, s*0.24, 0, Math.PI*2); ctx.fill(); ctx.restore();

    ctx.restore();
    fallTrail(b, s);
  }

  function drawFly(f){
    const s = f.size * (f.scale || 1);
    const fallLimp = (f.state==="fall") ? (f.limp || 0) : 0;
    let flap = Math.sin((f.t*18 + (f.phase2 || f.spark || 0)) * (FLAP_MULT.fly || 1))*0.30 * (f.state==="fall" ? (1 - 0.9*fallLimp) : 1);
    const j = (f.state==="hurt") ? (Math.sin(f.t*90)*0.18) : 0;
    const A = Math.max(0, Math.min(1, (f.hurtFlash>0 ? f.hurtFlash : f.a)));
    const skin = f.skin || FLY_SKINS.house;

    ctx.save(); ctx.translate(f.x,f.y); ctx.scale(f.facing,1);
    ctx.rotate((f.state==="fall" ? (f.rot||0) : 0) + j*(1 - fallLimp*0.8));

    const dull = (f.state==="fall") ? (0.25 + 0.50*fallLimp) : 0;
    const abdW = s*0.55, abdH = s*0.36;

    // abdomen (desaturate by mixing toward center gray via gradient middle)
    let g = ctx.createLinearGradient(-abdW,0,abdW,0);
    const abdA = desaturateHex(skin.abdomen, dull);
    g.addColorStop(0.0, abdA);
    g.addColorStop(0.5, desaturateHex("#2b3036", dull));
    g.addColorStop(1.0, abdA);
    ctx.globalAlpha = 0.95*A;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-s*0.28, 0, abdW, abdH, 0, 0, Math.PI*2); ctx.fill();

    const thW = s*0.48, thH = s*0.34;
    g = ctx.createLinearGradient(-thW,0,thW,0);
    g.addColorStop(0.0, desaturateHex(skin.thorax, dull));
    g.addColorStop(1.0, desaturateHex("#474e58", dull));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0,0, thW, thH, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = desaturateHex("#2a2a2e", dull*0.8);
    ctx.beginPath(); ctx.arc(s*0.50, 0, s*0.18, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.70*A;
    ctx.fillStyle = "rgba(150,40,40," + (0.55*(1 - 0.8*fallLimp)) + ")";
    ctx.beginPath(); ctx.ellipse(s*0.47, -s*0.05, s*0.14, s*0.11, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s*0.47,  s*0.05, s*0.14, s*0.11, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.35*A*(1 - 0.7*fallLimp); ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.arc(s*0.56, -s*0.07, s*0.03, 0, Math.PI*2); ctx.fill();

    const wingW = s*0.65, wingH = s*0.36;
    ctx.globalAlpha = (0.36*A + f.hurtFlash*0.18) * (1 - 0.4*fallLimp);
    ctx.fillStyle = "rgba(220,230,238,1)";
    const tuck = (f.state==="fall") ? (0.90 - 0.55*fallLimp) : 1;
    ctx.save();
    ctx.translate(-s*0.10, -s*0.05); ctx.rotate( 0.10 + flap*0.35);
    ctx.beginPath(); ctx.ellipse(-s*0.55, 0, wingW*tuck, wingH*tuck, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate( s*0.10, -s*0.05); ctx.rotate(-0.10 - flap*0.35);
    ctx.beginPath(); ctx.ellipse( s*0.20, 0, wingW*tuck, wingH*tuck, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // speed streak only in fly state
    if (Math.abs(f.vx) > 55 && f.state==="fly"){
      ctx.globalAlpha = 0.18*A; ctx.strokeStyle = "rgba(60,66,75,1)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s*0.95, 0); ctx.lineTo(-s*0.35, 0); ctx.stroke();
    }

    ctx.restore();
    fallTrail(f, s);
  }

  function drawAlate(a){
    const s = (a.size * (a.scale || 1)) * 1.15;
    const t = a.t;
    const fallLimp = (a.state==="fall") ? (a.limp || 0) : 0;

    // wing stall + micro quiver on fall
    let flap = Math.sin((t*9.5 + (a.phase2 || 0)) * (FLAP_MULT.alate || 1))*0.40 * (a.state==="fall" ? (1 - 0.9*fallLimp) : 1);
    const quiver = (a.state==="fall") ? Math.sin(t * (a.twitch || 3.6)) * 0.05 * (1 - fallLimp) : 0;

    const jitter = (a.state==="hurt") ? Math.sin(t*65)*0.12 : 0;
    const A = Math.max(0, Math.min(1, (a.hurtFlash>0 ? a.hurtFlash : a.a)));
    const hinge = { x: -s*0.05, y: -s*0.02 };
    let wingLen  = s * 2.10, wingWide = s * 0.48;

    let breakAlpha = 1.0, breakShorten = 0;
    if (a.broken){
      const k = clamp(0, a.breakT / 0.45, 1);
      breakAlpha = 1 - k*0.65;
      breakShorten = k * (s*0.95);
    }

    function wingPath(len, wide){
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.quadraticCurveTo( len*0.38, -wide*0.85, len*0.86, -wide*0.55);
      ctx.quadraticCurveTo( len*1.02, -wide*0.10, len*0.92,  wide*0.08);
      ctx.quadraticCurveTo( len*0.36,  wide*0.82,  0,  wide*0.12);
      ctx.quadraticCurveTo( len*0.04,  wide*0.04,  0, 0);
      ctx.closePath();
    }
    function paintWing(baseAngle, alphaMul, broken=false){
      ctx.save(); ctx.translate(hinge.x, hinge.y); ctx.rotate(baseAngle);
      let len = wingLen, wide = wingWide, mul = alphaMul;

      // fade + fold a bit on fall
      if (a.state==="fall"){ mul *= (0.85 - 0.35*fallLimp); wide *= (1 - 0.25*fallLimp); }
      if (broken){ len = Math.max(wingLen - breakShorten, s*0.9); mul *= breakAlpha; }

      const g = ctx.createLinearGradient(0,0, len, 0);
      g.addColorStop(0.00, `rgba(248,246,240,${0.74*A*mul})`);
      g.addColorStop(0.65, `rgba(238,236,230,${0.58*A*mul})`);
      g.addColorStop(1.00, `rgba(232,228,220,${0.48*A*mul})`);
      ctx.fillStyle = g; wingPath(len, wide); ctx.fill();

      ctx.globalAlpha = A * 0.22 * mul; ctx.strokeStyle = "rgba(175,150,120,1)";
      ctx.lineWidth = Math.max(1, s*0.06); wingPath(len, wide); ctx.stroke();

      ctx.globalAlpha = A * 0.26 * mul; ctx.strokeStyle = "rgba(150,145,135,1)";
      ctx.lineWidth = Math.max(1, s*0.025);
      for(let i=0;i<5;i++){ const tt=i/4, ang=(-0.22+tt*0.44) + quiver;
        const tipX=Math.cos(ang)*len*0.90, tipY=Math.sin(ang)*wide*0.78;
        ctx.beginPath(); ctx.moveTo(0,0);
        ctx.quadraticCurveTo(len*0.38, tipY*0.42, tipX, tipY); ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save(); ctx.translate(a.x, a.y); ctx.scale(a.facing, 1);
    ctx.rotate((a.state==="fall" ? (a.rot||0) : 0) + jitter*(1 - fallLimp*0.8));

    const L = (Math.PI*0.58 + (flap + quiver)*0.45);
    const R = (-Math.PI*0.58 - (flap - quiver)*0.45);

    // back pair
    paintWing(L, 0.80, false);
    paintWing(R, 0.80, a.broken); // break the right wing
    // front pair (slightly stronger)
    paintWing(Math.PI*0.52 + (flap+quiver)*0.70, 1.00, false);
    paintWing(-Math.PI*0.52 - (flap-quiver)*0.70, 1.00, a.broken);

    // body/head (subtle desaturation)
    ctx.globalAlpha = A;
    const bodyDull = 0.2 + 0.45*fallLimp;
    const body1 = desaturateHex("#AA8C69", bodyDull), body2 = desaturateHex("#50463C", bodyDull);
    ctx.fillStyle = body1; ctx.beginPath(); ctx.ellipse(-s*0.05, s*0.04, s*0.32, s*0.68, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = A*0.35; ctx.strokeStyle= body2; ctx.lineWidth=Math.max(1, s*0.04);
    for(let i=-2;i<=2;i++){ const yy=i*(s*0.12); ctx.beginPath(); ctx.ellipse(-s*0.05, yy*0.18+s*0.04, s*0.26, s*0.08, 0, 0, Math.PI*2); ctx.stroke(); }
    ctx.globalAlpha = A; ctx.fillStyle= desaturateHex("#A07D5F", bodyDull);
    ctx.beginPath(); ctx.ellipse(-s*0.00, 0, s*0.22, s*0.22, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle= desaturateHex("#504138", bodyDull);
    ctx.beginPath(); ctx.ellipse(s*0.26, -s*0.02, s*0.14, s*0.13, 0, 0, Math.PI*2); ctx.fill();

    // shards puff
    if (a.shards && a.shards.length){
      for (const sh of a.shards){
        ctx.save();
        ctx.globalAlpha = clamp(0, sh.a, 1);
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.r);
        ctx.fillStyle = "rgba(230,225,215,0.85)";
        ctx.fillRect(-sh.s*0.5, -sh.s*0.2, sh.s, sh.s*0.4);
        ctx.restore();
      }
    }

    ctx.restore();
    fallTrail(a, s);
  }

  function drawBat(b){
    const span=(b.size * (b.scale || 1)) * 2.1;
    const half=span*0.5;
    const fallLimp = (b.state==="fall") ? (b.limp || 0) : 0;
    let flap=Math.sin((b.t*8 + (b.phase2 || 0)) * (FLAP_MULT.bat || 1))*0.30 * (b.state==="fall" ? (1 - 0.9*fallLimp) : 1);
    const j = (b.state==="hurt") ? (Math.sin(b.t*55)*0.12) : 0;

    ctx.save(); ctx.translate(b.x,b.y); ctx.scale(b.facing,1);
    ctx.rotate((b.rot||0) + j*(1 - fallLimp*0.9));

    ctx.globalAlpha = clamp(0,b.a,1) * (0.90 - 0.25*fallLimp);
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

    fallTrail(b, span*0.48);
  }

  function drawLandPuff(a){
    if (!a.landed) return;
    const t=a.landT, life=0.45;
    if (t>life) return;
    const k=t/life, r=a.landR*(0.6+0.8*k), alpha = (1-k)*0.35*clamp(0,a.a,1);
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "rgba(120,120,120,1)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(a.x, a.y+1, r, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  }

function triggerHurt(a, fromClick=false){
  if (a.state!=="fly") return;
  a.state="hurt";
  a.hurtT = 0;
  a.hurtFlash = 1.0;
  a.vx *= (HURT_SLOW[a.type] ?? 0.3);
  if (fromClick) a.vx *= 0.85;

  const spec = (a.type==="but"?BUT: a.type==="bee"?BEE: a.type==="fly"?FLY: a.type==="alate"?ALATE:BAT);
  const raw  = rand(spec.spin[0], spec.spin[1]) * 0.004;
  const cap  = SPIN_CAP[a.type] ?? 0.0015;
  a.rotV = Math.max(-cap, Math.min(cap, raw));

  if (a.type==="alate"){
    // Fall immediately + add a strong downward impulse so it “drops” on hit.
    beginFall(a);
    a.vy += 120;          // downward kick
    a.vx *= 0.8;          // slight horizontal loss when dropping
    a.rot += rand(-0.12, 0.12); // tiny tumble bias so it feels reactive
  }
}


  function beginFall(a){
    if (a.state==="fall") return;
    a.state = "fall";
    a.a = Math.min(1, Math.max(0.6, a.a));
    a.vy = rand(22, 48);

    // death/limp ramp + per-actor wing fall behavior
    a.deathT = 0;
    a.limp   = 0;
    a.stiffenAt = rand(0.22, 0.34);
    a.twitch = a.twitch || rand(3.2, 5.2); // ensures butterflies also have one
    a.foldBias = rand(-0.08, 0.08);

    const min  = FALL_DRIFT_MIN[a.type] ?? 12;
    const sign = (a.vx>=0)? 1 : -1;
    const base = Math.max(Math.abs(a.vx), min);
    const mul  = FALL_VX_MUL[a.type] ?? 0.4;
    a.vx = sign * base * mul;

    const spec = (a.type==="but"?BUT: a.type==="bee"?BEE: a.type==="fly"?FLY: a.type==="alate"?ALATE:BAT);
    const raw  = rand(spec.spin[0], spec.spin[1]) * 0.006;
    const cap  = SPIN_CAP[a.type] ?? 0.0015;
    a.rotV = Math.max(-cap, Math.min(cap, raw));
    a.rot  = (a.rot || 0) + rand(-0.08, 0.08);
  }

  function radius(a){
    if (a.type==="bat") return a.size*1.2;
    if (a.type==="fly") return a.size*0.9;
    return a.size*1.0;
  }
  function tryArmHover(a){
    if (cursor.x<0) { a.hoverT=0; return; }
    if (a.state!=="fly") return;
    const dx=a.x-cursor.x, dy=a.y-cursor.y, d=Math.hypot(dx,dy);
    const r = (INTERACT.hoverR[a.type] || radius(a));
    if (d < r) triggerHurt(a, false);
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

  const count = type => actors.filter(a=>a.type===type && a.state!=="dead").length;

  function scheduleNext(specKey, now){
    const mean = meanGap(specKey);
    const jit  = rint(40,260);
    nextSpawn[specKey] = now + jit + randExp(mean);
  }

  function trySpawn(specKey, makeFn, now, seg){
    const baseSpec = specKey==="but"?BUT: specKey==="bee"?BEE: specKey==="fly"?FLY: specKey==="alate"?ALATE:BAT;
    const mult = (SEG_MULT[specKey] && SEG_MULT[specKey][seg]) || 0;
    const maxAllowed = Math.ceil((baseSpec.max||1) * mult);
    if (maxAllowed <= 0) { scheduleNext(specKey, now); return false; }

    if (count(specKey) < maxAllowed && now >= nextSpawn[specKey]){
      if (seg===1 && now - lastAnySpawnTs < CROSS_GAP_MS && lastSpecies !== specKey){
        nextSpawn[specKey] = lastAnySpawnTs + CROSS_GAP_MS + rand(50,220);
        return false;
      }
      actors.push(makeFn());
      scheduleNext(specKey, now);
      lastAnySpawnTs = now;
      lastSpecies = specKey;
      return true;
    }
    return false;
  }

  function maybeSpawn(now, seg){
    if (seg===0){ trySpawn("but", makeButterfly, now, seg); }
    else if (seg===1){ trySpawn("but", makeButterfly, now, seg); trySpawn("bee", makeBee, now, seg); }
    else if (seg===2){ trySpawn("fly", makeFly, now, seg); }
    else if (seg===3){ trySpawn("alate", makeAlate, now, seg); }
    else if (seg===4){ trySpawn("bat", makeBat, now, seg); }
  }

  function gentleKick(seg){
    const now = performance.now();
    const enqueue = (fn, delay)=> setTimeout(()=>actors.push(fn()), delay);
    if (seg===0){ enqueue(makeButterfly, rint(40,180)); }
    else if (seg===1){ enqueue(makeButterfly, rint(40,160)); enqueue(makeBee, rint(180,360)); }
    else if (seg===2){ enqueue(makeFly, rint(40,140)); }
    else if (seg===3){ enqueue(makeAlate, rint(60,200)); }
    else if (seg===4){ enqueue(makeBat, rint(100,280)); }
    scheduleNext("but", now+rint(120,360));
    scheduleNext("bee", now+rint(120,360));
    scheduleNext("fly", now+rint(120,360));
    scheduleNext("alate", now+rint(120,360));
    scheduleNext("bat", now+rint(120,360));
  }

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
      seedSpawnTimes(now);
      lastSpecies = "";
      lastSeg = seg;
      gentleKick(seg);
    }

    maybeSpawn(performance.now(), seg);

    const G = 360;
    const ground = h - GROUND_RISE_PX;

    const alive=[];
    for (let i=0;i<actors.length;i++){
      const a=actors[i];
      a.t += dt;

      const n = a.noise;
      if (n){
        n.t += dt*1000;
        const wigY = Math.sin(n.t * 0.001 * n.fY) * n.ampY;
        const wigX = Math.sin((n.t+333) * 0.001 * n.fX) * n.ampX;

        if (n.t >= n.nextSwerve){
          n.swerveVX = rand(-18, 18) * (a.facing || 1);
          n.nextSwerve = n.t + n.swerveEvery + rint(-400,400);
        }
        a.vx += (n.swerveVX - 0) * 0.02;
        a.vx *= 0.995;
        a._wigY = wigY;
        a._wigX = wigX;
      }

      if (a.state==="fly" || a.state==="retire"){
        a.x += (a.vx + (a._wigX||0)) * dt;

        if (a.type==="but"){
          const yIntended =
            a.yBase + (a._wigY||0) +
            Math.sin(a.phase + a.t*a.freq)*a.amp +
            Math.sin(a.t*0.7)*1.1;
          const k = Math.min(1, BUT_Y_SMOOTH * dt);
          a.ySmooth = a.ySmooth + (yIntended - a.ySmooth) * k;
          a.y = a.ySmooth;
        } else if (a.type==="alate"){
          a.y = a.yBase + (a._wigY||0) + Math.sin(a.phase + a.t*a.freq)*a.amp + Math.sin(a.t*0.9 + a.phase*0.5)*1.8;
        } else {
          a.y = a.yBase + (a._wigY||0) + Math.sin(a.phase + a.t*a.freq)*a.amp + Math.sin(a.t*0.7)*1.1;
        }

        a.facing = (a.vx>=0)? 1 : -1;

        a.a += (a.state==="retire" ? -FADE_OUT : FADE_IN);
        a.a = clamp(0,a.a,1);

        tryArmHover(a);

        if (a.type === "but") {
          const prevHeading = a.heading || 0;
          const dx = (a.x - (a._px ?? a.x));
          const dy = (a.y - (a._py ?? a.y));
          const raw = Math.atan2(dy, dx || 0.0001);
          let delta = raw - prevHeading;
          while (delta >  Math.PI) delta -= 2*Math.PI;
          while (delta < -Math.PI) delta += 2*Math.PI;
          const maxStep = BUT_TURN_MAX * dt;
          if (delta >  maxStep) delta =  maxStep;
          if (delta < -maxStep) delta = -maxStep;
          a.heading = prevHeading + delta;
        }
        a._px = a.x; a._py = a.y;

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
        a.deathT += dt;
        const LIMP_RISE = 3.6;
        a.limp = clamp(0, (a.limp||0) + LIMP_RISE*dt, 1);

        const VTERM = { but:520, bee:540, fly:560, alate:500, bat:520 };
        const DRAG  = 0.992;
        a.vy = Math.min(VTERM[a.type] || 540, a.vy + 360*dt);
        a.vx *= DRAG;

        a.rotV += rand(-0.00008, 0.00008);
        a.rot  += a.rotV;
        a.rotV *= 0.995;

        a.y  += a.vy*dt;
        a.x  += a.vx*dt;

        if (a.y >= h - GROUND_RISE_PX){
          a.y = h - GROUND_RISE_PX;
          if (!a.landed){
            a.landed = true; a.landT = 0; a.landR = Math.max(6, a.size*0.9);
            if (a.type==="alate" && !a.broken){
              a.broken = true; a.breakT = 0;
              a.shards = Array.from({length:rint(4,7)},()=>({
                x:a.x + rand(-6,6), y:a.y + rand(-4,4),
                vx: rand(40,90), vy: rand(-120,-60),
                r: rand(-0.6,0.6), rv: rand(-1.2,1.2),
                s: rand(2,5), a: 0.9
              }));
            }
          }
          a.vx   *= 0.90;
          a.vy   *= -0.12;
          a.rotV *= 0.80;
          if (Math.abs(a.vy) < 8){ a.state="dead"; }
        }
      }
      else if (a.state==="dead"){
        a.a -= FADE_OUT*1.5;
      }

      if (a.landed){ a.landT += dt; }
      if (a.type==="alate" && a.broken){
        a.breakT += dt;
        if (a.shards){
          for (const sh of a.shards){
            sh.vy += 600*dt;
            sh.x  += sh.vx*dt;
            sh.y  += sh.vy*dt;
            sh.r  += sh.rv*dt;
            sh.a  -= 1.4*dt;
          }
          a.shards = a.shards.filter(sh=>sh.a>0 && sh.y < h+12);
        }
      }

      if (a.type==="but")        drawButterfly(a);
      else if (a.type==="bee")   drawBee(a);
      else if (a.type==="fly")   drawFly(a);
      else if (a.type==="alate") drawAlate(a);
      else                       drawBat(a);

      drawLandPuff(a);

      if (a.a > 0 && a.y < h + MARGIN*2) alive.push(a);
      a._wigX = a._wigY = 0;
    }
    actors = alive;

    requestAnimationFrame(loop);
  }

  function update(){ build(); } // call this from your ScrollTrigger tick

  window.__fliers__ = { build, update };
})();
