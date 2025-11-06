// js/bg-rain.js
(function Rain(){
  let built = false;

  // ---- DOM/state ----
  let wrap, cvs, ctx, w=0, h=0, dpr=1;        // rain layer
  let splashWrap, scvs, sctx;                 // splash layer (above ground)
  let mistEl;                                 // light mist for heavy rain

  // ---- particles ----
  const drops   = [];
  const splashes = [];

  // ---- controls ----
  let targetRate = 0;                         // drops/sec (from progress)
  let mistOpacity = 0;

  // Wind (px/sec) with smoothing
  let windX = 0;
  let windXTarget = 0;

  // Ground detection
  let groundTopY = null;                      // absolute Y in viewport px
  let groundHeightPx = 180;                   // fallback strip height
  let groundRisePx   = 0;                     // CSS --groundRise override

  // Debug
  let showGuide = false;

  // Perf clamp
  const MAX_DT = 0.05;

  /* ========================= CSS ========================= */
  function css(){
    if (document.getElementById("bgrain-style")) return;
    const s = document.createElement("style");
    s.id = "bgrain-style";
    s.textContent = `
      #bg #bgRain{ position:fixed; inset:0; pointer-events:none;
        z-index: 8; /* above ground (4), below splashes (9) and leaves */
        will-change: opacity, transform;
      }
      #bg #bgRainSplashes{ position:fixed; inset:0; pointer-events:none;
        z-index: 9; /* splashes over ground & rain */
        will-change: opacity, transform;
      }
      #bgRain canvas, #bgRainSplashes canvas{ position:fixed; inset:0; }
      #bgRain .mist{
        position:fixed; inset:0; pointer-events:none; opacity:0;
        background: radial-gradient(140% 90% at 50% 15%, rgba(200,220,240,.14), transparent 65%);
        mix-blend-mode: screen;
        transition: opacity .35s linear;
      }
    `;
    document.head.appendChild(s);
  }

  /* ========================= BUILD ========================= */
  function build(){
    if (built) return;
    css();

    // Rain layer
    wrap = document.createElement("div");
    wrap.id = "bgRain";
    cvs  = document.createElement("canvas");
    ctx  = cvs.getContext("2d");
    mistEl = document.createElement("div");
    mistEl.className = "mist";
    wrap.appendChild(cvs);
    wrap.appendChild(mistEl);

    // Splashes (above)
    splashWrap = document.createElement("div");
    splashWrap.id = "bgRainSplashes";
    scvs = document.createElement("canvas");
    sctx = scvs.getContext("2d");
    splashWrap.appendChild(scvs);

    const bg = document.getElementById("bg");
    if (bg){ bg.appendChild(wrap); bg.appendChild(splashWrap); }

    onResize();
    window.addEventListener("resize", onResize);
    built = true;
    loop();

    // Public API
    window.__rain = {
      /** Progress 0..1 drives intensity profile */
      update(progress){
        const p = Math.max(0, Math.min(1, progress));
        let dps;
        if (p < 0.30) dps = lerp(0,   220, p/0.30);           // drizzle builds
        else if (p < 0.50) dps = lerp(220, 420, (p-0.30)/0.20); // heaviest band
        else if (p < 0.80) dps = lerp(420,  90, (p-0.50)/0.30); // taper
        else dps = lerp(90, 10, (p-0.80)/0.20);                 // almost none
        targetRate = dps;

        const mistTarget = dps > 260 ? 1 : dps > 140 ? 0.5 : 0;
        mistOpacity = mistTarget;
        mistEl.style.opacity = mistOpacity.toFixed(2);
      },

      /** Mic sets wind target in px/sec; we ease to it in the loop */
      setWind(strengthPxPerSec){
        windXTarget = strengthPxPerSec || 0;
      },

      /** Fix splash line N px above bottom (recommended) */
      setGroundFromBottom(offsetPx){
        groundTopY = window.innerHeight - (offsetPx|0);
        // keep it stable across resizes by remembering the offset
        _groundFromBottom = offsetPx|0;
      },

      /** Or set an absolute Y (viewport pixels) */
      setGroundY(yPx){
        groundTopY = (yPx|0);
        _groundFromBottom = null;
      },

      /** Toggle red debug line */
      debugGround(on=true){ showGuide = !!on; }
    };
  }

  // Keep track if we’re in “offset from bottom” mode
  let _groundFromBottom = 34;

  /* ========================= LAYOUT ========================= */
  function onResize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    w = (cvs.width  = Math.round(innerWidth  * dpr));
    h = (cvs.height = Math.round(innerHeight * dpr));
    cvs.style.width  = innerWidth + "px";
    cvs.style.height = innerHeight + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);

    scvs.width  = Math.round(innerWidth  * dpr);
    scvs.height = Math.round(innerHeight * dpr);
    scvs.style.width  = innerWidth + "px";
    scvs.style.height = innerHeight + "px";
    sctx.setTransform(dpr,0,0,dpr,0,0);

    computeGroundTop();
  }

  function computeGroundTop(){
    // honor absolute setting if present
    if (_groundFromBottom != null) {
      groundTopY = window.innerHeight - _groundFromBottom;
      return;
    }

    // otherwise try to infer from #ground + CSS var
    const g = document.getElementById("ground");
    const rs = getComputedStyle(document.documentElement).getPropertyValue("--groundRise");
    groundRisePx = parseFloat((rs || "0").replace("px","")) || 0;

    if (g){
      const rect = g.getBoundingClientRect();
      groundHeightPx = rect.height || groundHeightPx;
    }
    groundTopY = window.innerHeight - (groundHeightPx - groundRisePx);
  }

  /* ========================= SPAWN ========================= */
  function spawn(n){
    for (let i=0;i<n;i++){
      const speed = 580 + Math.random()*360;           // px/sec downward
      const len   = 9 + Math.random()*14;              // streak length
      const x     = Math.random()*innerWidth;
      const y     = -20 - Math.random()*80;
      const base  = -80 + Math.random()*60;            // natural slant

      drops.push({ x, y, vy: speed, bx: base, vx: base + windX, len, life: 0 });
    }
  }

  /* ========================= SPLASHES ========================= */
  function spawnSplash(x, y, strength=1){
    // jets
    const jets = 4 + Math.floor(4*strength);
    for (let i=0;i<jets;i++){
      const ang = (-Math.PI/2) + (Math.random()-0.5)*0.9;
      const spd = 220 + Math.random()*180 * (0.6 + 0.6*strength);
      splashes.push({
        x, y,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        r:  1 + Math.random()*1.2,
        a:  0.8,
        kind: "jet"
      });
    }
    // dots
    const dots = 8 + Math.floor(10*strength);
    for (let i=0;i<dots;i++){
      const vx = (Math.random()-0.5) * (120 + 220*strength);
      const vy = - (120 + Math.random()*160) * (0.6 + 0.6*strength);
      splashes.push({
        x, y, vx, vy,
        r:  0.6 + Math.random()*1.1,
        a:  0.9,
        kind: "dot"
      });
    }
  }

  /* ========================= LOOP ========================= */
  let then = performance.now(), accSpawn = 0;
  function loop(now=performance.now()){
    requestAnimationFrame(loop);
    const dt = Math.min(MAX_DT, (now-then)/1000);
    then = now;

    // keep ground aligned (cheap)
    if (_groundFromBottom != null) groundTopY = window.innerHeight - _groundFromBottom;

    // spawn rate smoothing
    accSpawn += targetRate * dt;
    if (accSpawn >= 1){
      const n = Math.floor(accSpawn);
      accSpawn -= n;
      spawn(n);
    }

    // ease wind to target
    windX += (windXTarget - windX) * 0.18;

    // ---- draw rain ----
    ctx.clearRect(0,0,innerWidth,innerHeight);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(210,220,235,0.55)";
    ctx.beginPath();

    for (let i=0;i<drops.length;i++){
      const d = drops[i];

      d.vx = d.bx + windX;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life += dt;

      // ground collision → splash and recycle
      if (groundTopY != null && d.y >= groundTopY){
        const speedK = Math.min(1, d.vy / 900);
        spawnSplash(d.x, groundTopY, 0.4 + 0.8*speedK);

        drops[i] = drops[drops.length-1];
        drops.pop();
        i--;
        continue;
      }

      // streak (slightly exaggerated for readability)
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx*0.02, d.y - d.vy*0.02 - d.len);

      if (d.y > innerHeight + 60) { drops[i] = drops[drops.length-1]; drops.pop(); i--; }
    }
    ctx.stroke();

    // ---- draw splashes ----
    sctx.clearRect(0,0,innerWidth,innerHeight);
    for (let i=0;i<splashes.length;i++){
      const p = splashes[i];

      // motion (light gravity + drag)
      p.vy += 900 * dt * 0.9;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;

      // fade
      p.a *= (p.kind === "jet" ? 0.88 : 0.90);

      sctx.globalAlpha = Math.max(0, Math.min(1, p.a));
      sctx.beginPath();
      sctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      sctx.fillStyle = (p.kind === "jet")
        ? "rgba(210,220,235,0.9)"
        : "rgba(200,210,230,0.9)";
      sctx.fill();

      if (p.a < 0.05 || (groundTopY != null && p.y > groundTopY + 24)){
        splashes[i] = splashes[splashes.length-1];
        splashes.pop();
        i--;
      }
    }

    // optional debug ground line
    if (showGuide && groundTopY != null){
      sctx.save();
      sctx.globalAlpha = 1;
      sctx.strokeStyle = "rgba(255,60,60,.9)";
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(0, groundTopY);
      sctx.lineTo(innerWidth, groundTopY);
      sctx.stroke();
      sctx.restore();
    }
  }

  /* ========================= UTIL ========================= */
  function lerp(a,b,t){ return a + (b-a)*Math.max(0,Math.min(1,t)); }

  /* ========================= START ========================= */
  build();

  // sensible default: splash line ~34px above bottom
  // (you can override from your scripts)
  if (window.__rain && window.__rain.setGroundFromBottom){
    window.__rain.setGroundFromBottom(34);
  }
})();
