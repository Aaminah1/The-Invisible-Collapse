// js/fliers.js — minimal + calm fliers (butterflies in Full, bats in Mid2)
// hover briefly or click a flier to make it fall & fade out.
(function Fliers(){
  let built=false, cvs, ctx, w=0, h=0, dpr=1;
  let actors=[];                       // on-screen creatures
  let lastSeg=-1;
  let nextSpawn={ butterfly:0, bat:0 };
  const cursor={ x:-1, y:-1, down:false }; // window-level pointer
  let lastKnockTs=0;                   // throttle “kills”

  // layering: beneath leaves/pickups canvas
  const Z_INDEX=30, MARGIN=46, GROUND_RISE_PX=36;

  // species tuning (slow, sparse)
  const BUT = { max:2, gapMs:[4500, 9000], speed:[28, 50], amp:[6,13],  freq:[0.7,1.2], size:[10,14] };
  const BAT = { max:2, gapMs:[5200,11000], speed:[42, 66], amp:[10,18], freq:[1.0,1.6], size:[13,18] };

  // fades
  const FADE_IN=0.03, FADE_OUT=0.06;

  // interaction (very gentle)
  const INTERACT = {
    hoverArmMs: 280,                       // how long to hover before it drops
    minGapMs: 320,                         // min time between drops (global)
    hoverR: { butterfly: 18, bat: 22 },    // hover hit radius
    clickR: { butterfly: 22, bat: 26 }     // click hit radius
  };

  // -------- utils
  const clamp=(a,v,b)=>Math.max(a,Math.min(b,v));
  const rand=(a,b)=>a+Math.random()*(b-a);
  const segFromP=p=>(p<1/3?0:(p<2/3?1:2)); // 0 Full, 1 Mid1, 2 Mid2/Bare

  // -------- canvas hookup
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
    Object.assign(cvs.style,{
      position:"absolute", inset:"0", pointerEvents:"none", zIndex:String(Z_INDEX)
    });
    leaf.parentNode.insertBefore(cvs, leaf);

    ctx = cvs.getContext("2d");
    sizeToLeafCanvas();

    // pointer tracking on window (canvas is pointer-events:none)
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
    nextSpawn.butterfly = now + rand(...BUT.gapMs);
    nextSpawn.bat       = now + rand(...BAT.gapMs);

    requestAnimationFrame(loop);
    built=true;
  }

  // -------- flight bands (stick to canopy area if available)
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
  function batBand(){
    const b=canopyBand();
    return {
      x1: Math.max(0, b.x1 - 30),
      x2: Math.min(w, b.x2 + 30),
      y1: Math.max(0, b.y1 - 10),
      y2: Math.min(h, b.y2 + 6)
    };
  }

  // -------- factories
  function makeButterfly(){
    const band=canopyBand();
    const fromLeft=Math.random()<0.5;
    const startX = fromLeft ? -MARGIN : w+MARGIN;
    const y0 = rand(band.y1, band.y2);
    return {
      type:"butterfly", state:"fly",
      x:startX, y:y0 + rand(-6,6), yBase:y0,
      vx: rand(...BUT.speed) * (fromLeft?1:-1),
      amp: rand(...BUT.amp), freq: rand(...BUT.freq), phase: rand(0,Math.PI*2),
      size: rand(...BUT.size), hue: rand(18,50), sat: rand(0.70,0.92),
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0
    };
  }
  function makeBat(){
    const band=batBand();
    const fromLeft=Math.random()<0.5;
    const startX = fromLeft ? -MARGIN : w+MARGIN;
    const y0 = rand(band.y1, band.y2);
    return {
      type:"bat", state:"fly",
      x:startX, y:y0 + rand(-4,4), yBase:y0,
      vx: rand(...BAT.speed) * (fromLeft?1:-1),
      amp: rand(...BAT.amp), freq: rand(...BAT.freq), phase: rand(0,Math.PI*2),
      size: rand(...BAT.size),
      a:0, t:0, hoverT:0, vy:0, rot:0, rotV:0
    };
  }

  // -------- drawing
  function drawButterfly(b){
    const s=b.size, fl=Math.sin(b.t*10)*0.45;
    ctx.save(); ctx.translate(b.x,b.y);
    ctx.globalAlpha = clamp(0,b.a,1)*0.95;
    ctx.fillStyle = `rgba(40,35,30,${0.55*b.a})`; // body
    ctx.fillRect(-1, -s*0.55, 2, s*1.1);
    const wing=(sx)=>{ ctx.beginPath(); ctx.ellipse(sx*(s*0.9),0,s*0.95,s*0.60*(1+fl),0,0,Math.PI*2); ctx.fill(); };
    ctx.fillStyle = `hsla(${b.hue}, ${Math.round(b.sat*100)}%, 58%, ${0.82*b.a})`; wing(-1);
    ctx.fillStyle = `hsla(${b.hue+6}, ${Math.round(b.sat*100)}%, 52%, ${0.82*b.a})`; wing(+1);
    ctx.restore();
  }
  function drawBat(b){
    const span=b.size*2.1, half=span*0.5, flap=Math.sin(b.t*8)*0.30;
    ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.rot||0);
    ctx.globalAlpha = clamp(0,b.a,1)*0.90;
    ctx.fillStyle="rgba(22,24,30,1)";
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.quadraticCurveTo(-half*0.7, -half*0.20 - span*flap, -half, 0);
    ctx.quadraticCurveTo(-half*0.35,  half*0.10 + span*flap*0.6, 0, 1.5);
    ctx.quadraticCurveTo( half*0.35,  half*0.10 + span*flap*0.6,  half, 0);
    ctx.quadraticCurveTo( half*0.7,  -half*0.20 - span*flap, 0, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-1.8, 1.2, 0, Math.PI*2); ctx.fill(); // tiny head
    ctx.restore();
  }

  // -------- interaction helpers
  function radius(a){ return (a.type==="bat") ? a.size*1.2 : a.size*1.0; }
  function tryArmHover(a, dt){
    if (cursor.x<0) { a.hoverT=0; return; }
    const dx=a.x-cursor.x, dy=a.y-cursor.y, d=Math.hypot(dx,dy);
    const r = INTERACT.hoverR[a.type] || radius(a);
    if (d < r) {
      a.hoverT += dt*1000;
      if (a.hoverT > INTERACT.hoverArmMs && a.state==="fly") knockDown(a);
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
    if (best>=0){ knockDown(actors[best]); lastKnockTs=now; }
  }

  function knockDown(a){
    // throttle a little so it never becomes chaotic
    const now=performance.now();
    if (now - lastKnockTs < INTERACT.minGapMs) return;

    a.state="fall";
    a.a = Math.min(1, Math.max(0.4, a.a)); // visible if it was mid-fade-in
    a.vy = rand(22, 48);                   // downward start
    a.vx *= 0.35;                          // lose most forward speed
    a.rotV = (a.type==="bat") ? rand(-1.6, 1.6)*0.004 : rand(-1.2,1.2)*0.004;
    lastKnockTs = now;
  }

  // -------- spawns
  function count(type){ return actors.filter(a=>a.type===type && a.state!=="dead").length; }
  function maybeSpawn(now, seg){
    if (seg===0 && count("butterfly") < BUT.max && now >= nextSpawn.butterfly){
      actors.push(makeButterfly());
      nextSpawn.butterfly = now + rand(...BUT.gapMs);
    }
    if (seg===2 && count("bat") < BAT.max && now >= nextSpawn.bat){
      actors.push(makeBat());
      nextSpawn.bat = now + rand(...BAT.gapMs);
    }
  }

  // -------- loop
  let prevTS=0;
  function loop(ts){
    if (!ctx){ requestAnimationFrame(loop); return; }
    if (!prevTS) prevTS=ts;
    const dt = Math.max(0.001, Math.min(0.050, (ts - prevTS)/1000));
    prevTS = ts;

    ctx.clearRect(0,0,w,h);

    const p = window.__currentProgress || 0;
    const seg = segFromP(p);

    // scene change → retire non-native species
    if (seg !== lastSeg){
      actors.forEach(a=>{
        const keep = (seg===0 && a.type==="butterfly") || (seg===2 && a.type==="bat");
        if (!keep && a.state==="fly") a.state="retire";
      });
      const now=performance.now();
      nextSpawn.butterfly = now + rand(...BUT.gapMs);
      nextSpawn.bat       = now + rand(...BAT.gapMs);
      lastSeg = seg;
    }

    maybeSpawn(performance.now(), seg);

    const G = 360; // px/s^2 gravity
    const ground = h - GROUND_RISE_PX;

    const alive=[];
    for (let i=0;i<actors.length;i++){
      const a=actors[i];
      a.t += dt;

      if (a.state==="fly" || a.state==="retire"){
        // horizontal drift + canopy sine
        a.x += a.vx * dt;
        a.y = a.yBase + Math.sin(a.phase + a.t*a.freq)*a.amp + Math.sin(a.t*0.7)*1.1;

        // fade in normally, fade out if retiring
        a.a += (a.state==="retire" ? -FADE_OUT : FADE_IN);
        a.a = clamp(0,a.a,1);

        // arm hover drop
        tryArmHover(a, dt);

        // offscreen: drop unless still fading in
        const on = a.x>-MARGIN && a.x<w+MARGIN && a.y>-MARGIN && a.y<h+MARGIN;
        if (!on && a.a<=0.01) { a.state="dead"; }
      }
      else if (a.state==="fall"){
        a.vy += G*dt;
        a.y  += a.vy*dt;
        a.x  += a.vx*dt;
        a.rot += a.rotV; a.rotV *= 0.995;
        if (a.y >= ground){
          a.y = ground; a.vx *= 0.92; a.vy *= -0.18; a.rotV *= 0.9;
          // after a small bounce, fade away
          if (Math.abs(a.vy) < 8){ a.state="dead"; }
        }
      }
      else if (a.state==="dead"){
        a.a -= FADE_OUT*1.5;
      }

      // draw
      if (a.type==="butterfly") drawButterfly(a);
      else { drawBat(a); }

      // keep?
      if (a.a > 0 && a.y < h + MARGIN*2) alive.push(a);
    }
    actors = alive;

    requestAnimationFrame(loop);
  }

  function update(){ build(); } // called from your ScrollTrigger tick

  // expose
  window.__fliers__ = { build, update };
})();
