/* outro.js — typewriter + soft crack overlay (PERSISTENT) + bridge cursor fixes */
(() => {
  const mainText   = "BREATHE OUT";
  const mainTextEl = document.getElementById("outroMainText");
  const dotEl      = document.getElementById("outroDot");
  const subTextEl  = document.getElementById("outroSubText");

  // timings (match scene1)
  const SPEED = {
    LETTER: 100,
    DOT_DELAY: 600,
    SUBTEXT_DELAY: 800,
    WORD_STAGGER: 160
  };

  let index = 0;
  let started = false;

  /* ========= Hairline Crack System (canvas) — FIELD SPRAY + PERSIST ========= */
  (function CrackOverlay(){
    // ---- Tunables ----
    const CFG = {
      DPR_MAX: 1.5,
      MAX_CRACKS: 320,        // allow a bit more since we persist
      FIELD_SEEDS: 18,
      WAVES: 3,
      WAVE_GAP_MS: 360,
      BRANCH_CHANCE: 0.35,
      BRANCH_MULT: 0.38,
      HOVER_RADIUS: 90,
      BASE_ALPHA: 0.24        // base darkness of ink lines
    };

    // Persistent scars state (default ON for option A)
    const STATE = { persist: true };

    let cvs, ctx, w=0, h=0, dpr=1;
    let cracks=[];
    let raf=0, running=false;
    let hover={x:-9999, y:-9999};

    // public API
    window.__outroCracks_ensure   = ensureCanvas;
    window.__outroCracks_burst    = burstCracksCentered; // local burst
    window.__outroCracks_field    = burstField;          // full screen spray
    window.__outroCracks_hover    = setHover;
    window.__outroCracks_persist  = (on)=>{ STATE.persist = !!on; };
    window.__outroCracks_clear    = ()=>{ cracks.length=0; ctx && ctx.clearRect(0,0,w,h); };

    function ensureCanvas(){
      if (cvs) return;
      const host = document.getElementById('outro');
      if (!host) return;
      cvs = document.createElement('canvas');
      cvs.id = 'outroCracks';
      Object.assign(cvs.style, {
        position:'absolute', inset:'0', zIndex:'2', pointerEvents:'none'
      });
      host.appendChild(cvs);
      ctx = cvs.getContext('2d');
      onResize();
      window.addEventListener('resize', onResize, {passive:true});
      start();
    }

    function onResize(){
      if (!cvs) return;
      const style = getComputedStyle(cvs);
      const isFixed = style.position === 'fixed';
      const cssW = isFixed ? window.innerWidth  : cvs.clientWidth;
      const cssH = isFixed ? window.innerHeight : cvs.clientHeight;
      dpr = Math.max(1, Math.min(CFG.DPR_MAX, window.devicePixelRatio || 1));
      cvs.width  = Math.round(cssW * dpr);
      cvs.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = cssW; h = cssH;
    }

    function start(){
      if (running) return;
      running = true;
      const loop = () => { tick(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }

    // ---------- generators ----------
    function makeCrack(x,y,opts={}){
      const len   = opts.len   ?? rand(160, 360);
      const seg   = opts.seg   ?? rand(4.5, 7.5);
      const kinks = opts.kinks ?? randInt(16, 28);
      const amp   = opts.amp   ?? rand(0.7, 1.6);
      const width = opts.width ?? rand(0.55, 1.1);
      const color = getComputedStyle(document.documentElement)
                      .getPropertyValue('--scratch-color').trim() || '#4b4a4a';

      let ang = rand(0, Math.PI*2);
      const pts=[{x,y}];
      let acc=0;
      for (let i=1;i<kinks;i++){
        ang += rand(-0.5,0.5)*amp*0.16;
        const step = seg * rand(0.85, 1.25);
        acc += step;
        const px = clamp(pts[i-1].x + Math.cos(ang)*step, 0, w);
        const py = clamp(pts[i-1].y + Math.sin(ang)*step, 0, h);
        pts.push({x:px, y:py});
        if (acc >= len) break;
      }

      // optional micro-branch
      let branch=null;
      if (Math.random() < CFG.BRANCH_CHANCE && pts.length>6){
        const bi = randInt(3, Math.max(4, Math.floor(pts.length*0.7)));
        const bp = pts[bi];
        const bAngle = ang + (Math.random()<0.5 ? +Math.PI/2 : -Math.PI/2) + rand(-0.35,0.35);
        branch = makeCrackFrom(bp.x, bp.y, {
          len: len*CFG.BRANCH_MULT, seg, kinks: Math.floor(kinks*CFG.BRANCH_MULT),
          amp: amp*1.2, width: width*0.85, fixedAngle:bAngle
        });
      }

      return { pts, reveal:0, speed: rand(0.006,0.012), life:1, w:width, color, branch };
    }

    function makeCrackFrom(x,y,opts){
      const len   = opts.len   ?? rand(120, 220);
      const seg   = opts.seg   ?? rand(4.5, 7.0);
      const kinks = opts.kinks ?? randInt(10, 20);
      const amp   = opts.amp   ?? rand(0.6, 1.4);
      const width = opts.width ?? rand(0.5, 1.0);
      const color = getComputedStyle(document.documentElement)
                      .getPropertyValue('--scratch-color').trim() || '#4b4a4a';
      let ang = opts.fixedAngle ?? rand(0, Math.PI*2);
      const pts=[{x,y}];
      let acc=0;
      for (let i=1;i<kinks;i++){
        ang += rand(-0.5,0.5)*amp*0.16;
        const step = seg * rand(0.85, 1.25);
        acc += step;
        const px = clamp(pts[i-1].x + Math.cos(ang)*step, 0, w);
        const py = clamp(pts[i-1].y + Math.sin(ang)*step, 0, h);
        pts.push({x:px, y:py});
        if (acc >= len) break;
      }
      return { pts, reveal:0, speed: rand(0.006,0.012), life:1, w:width, color, branch:null };
    }

    // local burst API (for clicks)
    function burstCracksCentered(cx, cy, count=7, spread=36){
      ensureCanvas();
      for (let i=0;i<count;i++){
        if (cracks.length >= CFG.MAX_CRACKS) return;
        const x = cx + rand(-spread, spread);
        const y = cy + rand(-spread*0.7, spread*0.7);
        cracks.push(makeCrack(x, y));
      }
    }

    // screen-wide spray in waves
    function burstField(intensity=1){
      ensureCanvas();
      const cols = Math.max(4, Math.round(6 * intensity));
      const rows = Math.max(3, Math.round(4 * intensity));
      const jitterX = w / (cols*3);
      const jitterY = h / (rows*3);

      const seeds=[];
      for (let r=0; r<rows; r++){
        for (let c=0; c<cols; c++){
          if (Math.random() < 0.15) continue;
          const x = (c+0.5)*(w/cols) + rand(-jitterX, jitterX);
          const y = (r+0.5)*(h/rows) + rand(-jitterY, jitterY);
          seeds.push({x,y});
        }
      }
      // shuffle
      for (let i=seeds.length-1; i>0; i--){
        const j = Math.floor(Math.random()*(i+1));
        [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
      }

      const perWave = Math.ceil(seeds.length / CFG.WAVES);
      for (let wv=0; wv<CFG.WAVES; wv++){
        const start = wv*perWave, end = Math.min(seeds.length, start+perWave);
        const batch = seeds.slice(start, end);
        setTimeout(() => {
          batch.forEach(s=>{
            if (cracks.length < CFG.MAX_CRACKS) cracks.push(makeCrack(s.x, s.y));
          });
        }, wv*CFG.WAVE_GAP_MS);
      }
    }

    function setHover(x,y){ hover.x=x; hover.y=y; }

    // ---------- render/update ----------
    function tick(){
      if (!ctx) return;
      ctx.clearRect(0,0,w,h);

      for (let i=cracks.length-1; i>=0; i--){
        const c=cracks[i];

        // grow to completion; then persist (no removal)
        if (c.reveal < 1) {
          c.reveal = Math.min(1, c.reveal + c.speed);
        } else {
          // Persistent scars: do not reduce life; do not splice/remove.
          c.life = 1;
        }

        const near = nearestPointDist(c.pts, hover.x, hover.y);
        const glow = near < CFG.HOVER_RADIUS ? (1 - near/CFG.HOVER_RADIUS) : 0;

        drawPath(c.pts, c.w, c.color, c.reveal, /*life*/1, glow);
        if (c.branch) drawPath(c.branch.pts, c.branch.w, c.branch.color, Math.min(c.reveal*1.2,1), /*life*/1, glow*0.8);
      }
    }

    function drawPath(pts, width, color, reveal, life, glow){
      ctx.save();
      // persistent alpha + hover brightening
      ctx.globalAlpha = clamp(CFG.BASE_ALPHA + glow*0.35, 0, 0.95);
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // primary stroke
      ctx.lineWidth = width;
      ctx.beginPath();
      const maxSeg = Math.max(1, Math.floor((pts.length-1) * reveal));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let s=1; s<=maxSeg; s++){
        const p = pts[s];
        const jx = glow ? (rand(-0.7,0.7)*glow) : 0;
        const jy = glow ? (rand(-0.7,0.7)*glow) : 0;
        ctx.lineTo(p.x + jx, p.y + jy);
      }
      ctx.stroke();

      // subtle secondary stroke for ink richness
      ctx.globalAlpha *= 0.35;
      ctx.lineWidth = Math.max(0.45, width*0.6);
      ctx.stroke();
      ctx.restore();
    }

    // utils
    function rand(a,b){ return a + Math.random()*(b-a); }
    function randInt(a,b){ return Math.floor(rand(a,b+1)); }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
    function nearestPointDist(pts, x, y){
      if (x===-9999) return 9999;
      let best=9999;
      for (let i=0;i<pts.length;i++){
        const dx=pts[i].x-x, dy=pts[i].y-y;
        const d=Math.hypot(dx,dy); if (d<best) best=d;
      }
      return best;
    }
  })();
  /* ========= end Crack System ========= */

  function typeWriter(){
    if(index < mainText.length){
      mainTextEl.textContent += mainText.charAt(index);
      mainTextEl.style.opacity = 1;
      index++;
      setTimeout(typeWriter, SPEED.LETTER);
    } else {
      setTimeout(() => {
        dotEl.classList.remove("hidden");
        dotEl.style.opacity = 1;

        setTimeout(() => {
          // rebuild subtext with REAL spaces
          const original = subTextEl.textContent;
          const words = original.trim().split(/\s+/);
          subTextEl.innerHTML = "";
          subTextEl.classList.remove("hidden");

          words.forEach((w, i) => {
            const span = document.createElement("span");
            span.textContent = w;
            span.className = "outroSubWord";
            span.style.cssText =
              "opacity:0;transform:translateY(10px);display:inline-block;" +
              "transition:opacity .9s ease-out,transform .9s ease-out;";
            subTextEl.appendChild(span);
            if (i < words.length - 1) subTextEl.appendChild(document.createTextNode(" "));
            setTimeout(() => {
              span.style.opacity = 1;
              span.style.transform = "translateY(0)";
            }, i * SPEED.WORD_STAGGER);
          });

          // After subline finishes → full-screen crack field (persistent)
          const totalReveal = (words.length - 1) * SPEED.WORD_STAGGER + 1000;
          setTimeout(() => {
            window.__outroCracks_field?.(1); // intensity 1.0 (try 1.2 for denser)
          }, totalReveal + 120);

        }, SPEED.SUBTEXT_DELAY);
      }, SPEED.DOT_DELAY);
    }
  }

  function init(){
    if (started) return;
    started = true;

    // neutralise city crosshair if any + mark section
    window.__cityClicksOff?.();
    document.body.classList.add('in-outro');

    // cracks canvas + listeners
    window.__outroCracks_ensure?.();

    const outro = document.getElementById("outro");
    const cracksCanvas = document.getElementById("outroCracks");

    if (outro){
      // hover → subtle brighten/wiggle mapping to canvas rect (works for fixed/absolute)
      outro.addEventListener('mousemove', (e)=>{
        const r = cracksCanvas.getBoundingClientRect();
        window.__outroCracks_hover?.(e.clientX - r.left, e.clientY - r.top);
      }, {passive:true});

      outro.addEventListener('mouseleave', ()=>{
        window.__outroCracks_hover?.(-9999, -9999);
      }, {passive:true});

      // click → local burst at cursor (persistent)
      let lastClick = 0;
      outro.addEventListener('click', (e)=>{
        const now = performance.now();
        if (now - lastClick < 120) return;
        lastClick = now;
        const r = cracksCanvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        window.__outroCracks_burst?.(x, y, 10, 44);
      }, {passive:true});

      // touch
      outro.addEventListener('touchend', (e)=>{
        const t = e.changedTouches?.[0]; if (!t) return;
        const r = cracksCanvas.getBoundingClientRect();
        const x = t.clientX - r.left;
        const y = t.clientY - r.top;
        window.__outroCracks_burst?.(x, y, 8, 40);
      }, {passive:true});
    }

    typeWriter();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const outro = document.getElementById("outro");
    if (!outro) return;

    window.__outroCracks_ensure?.();

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting){ init(); io.disconnect(); } });
    }, { threshold: 0.6 });

    const vpH = window.innerHeight || document.documentElement.clientHeight;
    const rect = outro.getBoundingClientRect();
    if (rect.top < vpH * 0.4 && rect.bottom > vpH * 0.4){
      init();
    } else {
      io.observe(outro);
    }
  });
})();

/* ----- Lamps → Outro bridge controller ----- */
(() => {
  if (!window.gsap || !window.ScrollTrigger) return;
  const bridge = document.getElementById('bridgeFade');
  if (!bridge) return;

  function killCityClicks() {
    window.__cityClicksOff?.();
    const hit = document.getElementById('cityHit');
    if (hit) hit.style.display = 'none';
    document.documentElement.style.cursor = 'default';
    document.body.style.cursor = 'default';
  }

  const gradient = bridge.querySelector('.bridgeGradient');

  function setBridgeAlpha(t){
    const clamped = Math.max(0, Math.min(1, t));
    gradient && gradient.style.setProperty('--a', (0.95 * clamped).toFixed(3));
    if (typeof window.__blackoutTo === 'function') window.__blackoutTo(1 - clamped);
  }

  gsap.to({}, {
    scrollTrigger: {
      trigger: bridge,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
      onUpdate(self){
        const eased = gsap.parseEase("power2.out")(self.progress);
        setBridgeAlpha(eased);
      },
      onEnter(){
        document.body.classList.add('in-bridge');
        killCityClicks();
      },
      onEnterBack(){
        document.body.classList.add('in-bridge');
        killCityClicks();
      },
      onLeave(){
        document.body.classList.remove('in-bridge');
      },
      onLeaveBack(){
        document.body.classList.remove('in-bridge');
      }
    }
  });
})();
(() => {
  if (!window.gsap || !window.ScrollTrigger) return;
  const el = document.getElementById('outro');
  if (!el) return;

  function cityClicksOff(){
    window.disableCityClicks?.();
    const hit = document.getElementById('cityHit');
    if (hit) hit.style.display = 'none';
  }
  function cityClicksOn(){
    window.enableCityClicks?.();
    const hit = document.getElementById('cityHit');
    if (hit) hit.style.display = '';
  }

  gsap.to({}, {
    scrollTrigger: {
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      onEnter(){ 
        document.body.classList.add('in-outro');
        cityClicksOff();
      },
      onEnterBack(){ 
        document.body.classList.add('in-outro');
        cityClicksOff();
      },
      onLeave(){ 
        document.body.classList.remove('in-outro');
        // leaving downward → no need to enable city here
      },
      onLeaveBack(){ 
        document.body.classList.remove('in-outro');
        // leaving upward → back to city → re-enable
        cityClicksOn();
      }
    }
  });
})();
