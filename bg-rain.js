// js/bg-rain.js
(function Rain(){
  let built = false, wrap, cvs, ctx, w=0, h=0, dpr=1;
  let drops = [];
  let mistOpacity = 0;      // light haze for heavier rain
  let targetRate  = 0;      // target spawns/sec based on forest progress

  // Live wind with smoothing (px/sec)
  let windX = 0;            // current applied wind
  let windXTarget = 0;      // target wind set by mic

  function css(){
    if (document.getElementById("bgrain-style")) return;
    const s = document.createElement("style");
    s.id = "bgrain-style";
    s.textContent = `
      #bg #bgRain{ position:fixed; inset:0; pointer-events:none;
        /* under trees, above parallax backgrounds (match your other bg-fx) */
        z-index: 8;
        will-change: opacity, transform;
      }
      #bgRain canvas{ position:fixed; inset:0; }
      #bgRain .mist{ position:fixed; inset:0; pointer-events:none; opacity:0;
        background: radial-gradient(140% 90% at 50% 15%, rgba(200,220,240,.14), transparent 65%);
        mix-blend-mode: screen;
        transition: opacity .35s linear;
      }
    `;
    document.head.appendChild(s);
  }

  function build(){
    if (built) return;
    css();
    wrap = document.createElement("div");
    wrap.id = "bgRain";
    cvs  = document.createElement("canvas");
    ctx  = cvs.getContext("2d");
    const mist = document.createElement("div");
    mist.className = "mist";
    wrap.appendChild(cvs);
    wrap.appendChild(mist);
    document.getElementById("bg")?.appendChild(wrap); // lives inside #bg
    onResize(); window.addEventListener("resize", onResize);
    built = true;
    loop();

    // expose simple API
    window.__rain = {
      update(progress){   // progress: 0..1
        // Intensity profile per scene progress:
        // 0.00–0.30 → 0→220 dps (drizzle)
        // 0.30–0.50 → 220→420 dps (gentle rain)
        // 0.50–0.80 → 420→90 dps (taper)
        // 0.80–1.00 → 90→10 dps  (almost none)
        const p = Math.max(0, Math.min(1, progress));
        let dps;
        if (p < 0.30) dps = lerp(0,   220, p/0.30);
        else if (p < 0.50) dps = lerp(220, 420, (p-0.30)/0.20);
        else if (p < 0.80) dps = lerp(420,  90, (p-0.50)/0.30);
        else                dps = lerp( 90,  10, (p-0.80)/0.20);
        targetRate = dps;

        // Mist only when it’s heavier
        const mistTarget = dps > 260 ? 1 : dps > 140 ? 0.5 : 0;
        mistOpacity = mistTarget;
        mist.style.opacity = mistOpacity.toFixed(2);
      },

      // Mic sets the *target* wind; loop eases to it
      setWind(strength){
        windXTarget = strength || 0; // px/sec lateral
      }
    };
  }

  function onResize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = (cvs.width  = Math.round(innerWidth  * dpr));
    h = (cvs.height = Math.round(innerHeight * dpr));
    cvs.style.width  = innerWidth + "px";
    cvs.style.height = innerHeight + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function spawn(n){
    for (let i=0;i<n;i++){
      // Spawn across the top band; vary size/speed slightly
      const speed = 580 + Math.random()*360;    // px/sec
      const len   = 9 + Math.random()*14;       // drop length
      const x     = Math.random()*innerWidth;
      const y     = -20 - Math.random()*80;

      // Base lateral drift (no wind); vx is recomputed every frame
      const base = -80 + Math.random()*60;
      drops.push({ x, y, vy: speed, bx: base, vx: base + windX, len, life: 0 });
    }
  }

  let then = performance.now(), accSpawn = 0;
  function loop(now=performance.now()){
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now-then)/1000); // clamp ~50ms
    then = now;

    // Spawn rate smoothing
    accSpawn += targetRate * dt;
    if (accSpawn >= 1){
      const n = Math.floor(accSpawn);
      accSpawn -= n;
      spawn(n);
    }

    // Ease wind toward target so it doesn’t snap
    windX += (windXTarget - windX) * 0.18;

    // Draw
    ctx.clearRect(0,0,innerWidth,innerHeight);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth   = 1;
    ctx.strokeStyle = "rgba(210,220,235,0.55)";
    ctx.beginPath();

    const heavy = targetRate > 260;   // toggle for splash effect
    const groundY = innerHeight - 36; // tweak if your ground sits higher

    for (let i=0;i<drops.length;i++){
      const d = drops[i];

      // Live wind: recompute vx every frame
      d.vx = d.bx + windX;

      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life += dt;

      // Streak with a bit more stretch so lean is readable
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx*0.02, d.y - d.vy*0.02 - d.len);

      // Ground splash sparkle for heavier rain
      if (heavy && d.y >= groundY) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.85, 0.25 + (targetRate/420)*0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x - 4, groundY + 1);
        ctx.lineTo(d.x + 4, groundY + 1);
        ctx.strokeStyle = "rgba(230,240,255,0.65)";
        ctx.stroke();
        ctx.restore();

        // recycle this drop (remove quickly so splashes don’t stack)
        drops[i] = drops[drops.length - 1];
        drops.pop();
        i--;
        continue;
      }

      // Offscreen recycle
      if (d.y > innerHeight + 40) {
        drops[i] = drops[drops.length-1];
        drops.pop();
        i--;
      }
    }
    ctx.stroke();
  }

  function lerp(a,b,t){ return a + (b-a)*Math.max(0,Math.min(1,t)); }

  // build immediately
  build();
})();
