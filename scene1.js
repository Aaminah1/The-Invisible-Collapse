// Scene 1 (landing) intro + particles + handoff to background bridge
(() => {
  const mainText = "BREATHE IN";
  const mainTextEl   = document.getElementById("mainText");
  const dotEl        = document.getElementById("dot");
  const subTextEl    = document.getElementById("subText");
  const scrollHintEl = document.getElementById("scrollHint");
  const pCanvas      = document.getElementById("particleCanvas");
  const pCtx         = pCanvas.getContext("2d");

  // ---------------- speed knobs ----------------
  const SPEED = {
    LETTER: 100,
    DOT_DELAY: 600,
    SUBTEXT_DELAY: 800,
    WORD_STAGGER: 160,
    // SCROLL_HINT_DELAY is now handled by size ramp completion (see showHintAndUnlock)
  };

  // ---------------- particles knobs (VISIBILITY BOOST) ----------------
  const PARTICLES = {
    TARGET: 110,      // final density
    RAMP_MS: 3000,    // how fast we REACH target count
    ALPHA_MAX: 0.22
  };

  // ----- NEW: size growth timing (tiny -> full) -----
  const GROW = {
    SIZE_MS: 5000,    // total time to reach full size
    START_SIZE_MUL: 0.45, // tiny start
    END_SIZE_MUL:   1.00  // full size matches your current look
  };

  // === Rain + smoothing config ===
  const RAIN = {
    GRAV_MAX: 0.28,
    BOOST_GAIN: 0.95,
    VEL_NORM: 1800,
    AIR_RESIST_ACTIVE: 0.995,
    AIR_RESIST_IDLE_X: 0.995,
    AIR_RESIST_IDLE_Y: 0.965,
    VEL_CLAMP: 3.0,
    IDLE_DRIFT_BOOST: 5,
    FALL_DECAY_MS: 520,

    // streak morph controls (VISIBILITY BOOST)
    STREAK_LEN_MAX: 36,
    STREAK_SMOOTH: 0.14,
    STREAK_WIDTH_MIN: 1.0,
    STREAK_WIDTH_MAX: 2.6
  };

  // --- Direction flip controls (keeps "no sky lines") ---
  const DIR = {
    THRESH: 120,
    UP_SNAP_MS: 140,
    DAMP_ON_FLIP: 0.35
  };

  const lerp = (a,b,t)=>a+(b-a)*t;
  const easeInCubic = t => t*t*t;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  const clamp01 = x => Math.max(0, Math.min(1, x));

  // ---------------- scroll lock ----------------
  let scrollLocked = true;
  const SCROLL_KEYS = new Set([
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'PageUp','PageDown','Home','End','Space'
  ]);

  function preventScroll(e){
    if (!scrollLocked) return;
    e.preventDefault(); e.stopPropagation();
  }
  function keyBlock(e){
    if (!scrollLocked) return;
    if (SCROLL_KEYS.has(e.code)) e.preventDefault();
  }
  function lockScroll(){
    scrollLocked = true;
    document.body.classList.add('scroll-locked');
    history.scrollRestoration = 'manual';
    window.scrollTo(0,0);
    window.addEventListener('wheel', preventScroll, {passive:false});
    window.addEventListener('touchmove', preventScroll, {passive:false});
    window.addEventListener('keydown', keyBlock, {passive:false});
  }
  function unlockScroll(){
    if (!scrollLocked) return;
    scrollLocked = false;
    document.body.classList.remove('scroll-locked');
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    window.removeEventListener('keydown', keyBlock);
  }

  // ---------------- ONE-SHOT AUDIO with gesture priming ----------------
  let particleSound = null;
  let audioPrimed = false;
  let animateStarted = false;
  let whooshPlayed = false;

  function createAudio() {
    const a = new Audio("sounds/whoosh_soft.mp3");
    a.preload = "auto";
    a.volume = 0.6;
    a.onerror = () => console.warn("[scene1] whoosh sound failed to load (check path: /sounds/whoosh_soft.mp3)");
    return a;
  }

  function primeAudioOnce() {
    if (audioPrimed) return;
    particleSound = createAudio();
    particleSound.play().then(() => {
      particleSound.pause();
      particleSound.currentTime = 0;
      audioPrimed = true;
      if (animateStarted && !whooshPlayed) {
        try { particleSound.currentTime = 0; particleSound.play(); whooshPlayed = true; } catch {}
      }
    }).catch(() => {
      audioPrimed = true;
      if (animateStarted && !whooshPlayed) {
        try { particleSound.currentTime = 0; particleSound.play(); whooshPlayed = true; } catch {}
      }
    });

    window.removeEventListener("pointerdown", primeAudioOnce);
    window.removeEventListener("touchstart", primeAudioOnce);
    window.removeEventListener("keydown", primeAudioOnce);
  }

  // ---------------- state ----------------
  let index = 0, mouseX = 0, mouseY = 0;
  let particles = [];
  let particleAlpha = 0;    // 0 -> ALPHA_MAX
  let driftMul = 0.6;
  let sizeMul  = GROW.START_SIZE_MUL;  // start tiny, ramp to 1.0
  let rafOn = true;

  // Rain state (smoothed)
  let grav = 0;
  let gravTarget = 0;
  let falloffTween = null;

  // Streak morph state (0..1)
  let streak = 0;
  let streakTarget = 0;

  // Direction state
  let lastDir = 0; // -1 up, 0 idle, +1 down

  // hint control
  let hintShown = false;
  function showHintAndUnlock(){
    if (hintShown) return;
    hintShown = true;
    scrollHintEl.classList.remove("hidden");
    scrollHintEl.style.opacity = 1;
    unlockScroll();
  }

  // ---------------- setup ----------------
  function resizeCanvas(){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    pCanvas.style.width  = w + "px";
    pCanvas.style.height = h + "px";
    pCanvas.width  = Math.floor(w * dpr);
    pCanvas.height = Math.floor(h * dpr);
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------------- typewriter ----------------
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

        startParticles();

        setTimeout(() => {
          const words = subTextEl.textContent.split(" ");
          subTextEl.innerHTML = "";
          subTextEl.classList.remove("hidden");
          words.forEach((w,i) => {
            const span = document.createElement("span");
            span.textContent = w;
            span.style.cssText = "opacity:0;transform:translateY(10px);display:inline-block;margin-right:6px;transition:opacity 1s ease-out,transform 1s ease-out;";
            subTextEl.appendChild(span);
            setTimeout(() => {
              span.style.opacity = 1;
              span.style.transform = "translateY(0)";
            }, i * SPEED.WORD_STAGGER);
          });
        }, SPEED.SUBTEXT_DELAY);
      }, SPEED.DOT_DELAY);

      // NOTE: we no longer show the scroll hint here.
      // It appears when the SIZE ramp completes (see startParticles()).
    }
  }

  // ---------------- particles ----------------
  function createParticle(){
    // keep your base particle size distribution; actual draw size scales by sizeMul
    const size = Math.random()*2.2 + 1.2;
    return {
      x: Math.random()*pCanvas.width,
      y: Math.random()*pCanvas.height,
      vx:(Math.random()-0.5)*0.5,
      vy:(Math.random()-0.5)*0.5,
      size
    };
  }

  function drawParticles(){
    // smooth gravity + streak factor
    grav = lerp(grav, gravTarget, 0.14);
    streak = lerp(streak, streakTarget, RAIN.STREAK_SMOOTH);

    pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);

    const idle = grav < 0.01;
    const driftEff = driftMul * (idle ? RAIN.IDLE_DRIFT_BOOST : 1);

    // stroke width: thicker for dots, thinner (but still visible) for streaks
    const lineW = lerp(RAIN.STREAK_WIDTH_MAX, RAIN.STREAK_WIDTH_MIN, streak);

    for(const p of particles){
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const dist = Math.hypot(dx,dy);
      if(dist < 100){
        p.vx += dx/dist*0.01;
        p.vy += dy/dist*0.01;
      }

      p.vy += grav;

      if (idle){
        p.vx *= RAIN.AIR_RESIST_IDLE_X;
        p.vy *= RAIN.AIR_RESIST_IDLE_Y;
      } else {
        p.vx *= RAIN.AIR_RESIST_ACTIVE;
        p.vy *= RAIN.AIR_RESIST_ACTIVE;
      }

      p.vx = Math.max(-RAIN.VEL_CLAMP, Math.min(RAIN.VEL_CLAMP, p.vx));
      p.vy = Math.max(-RAIN.VEL_CLAMP, Math.min(RAIN.VEL_CLAMP, p.vy));

      p.x += p.vx * driftEff;
      p.y += p.vy * driftEff;

      // wrap / recycle
      if (p.x < -6) p.x = pCanvas.width + 6;
      if (p.x > pCanvas.width + 6) p.x = -6;
      if (p.y - p.size > pCanvas.height + 2) {
        p.y = -p.size - 2;
        p.x = Math.random() * pCanvas.width;
        p.vy *= 0.25;
      }

      const alpha = Math.min(PARTICLES.ALPHA_MAX, particleAlpha);
      pCtx.strokeStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      pCtx.fillStyle   = `rgba(0,0,0,${alpha.toFixed(3)})`;

      if (streak < 0.10) {
        // dots
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.size * sizeMul, 0, Math.PI*2);
        pCtx.fill();
      } else {
        // streaks (slightly stronger slant & length for visibility)
        const vyPos = Math.max(0, p.vy + grav);
        const len   = lerp(p.size * 0.9, p.size * 0.9 + RAIN.STREAK_LEN_MAX, streak) + vyPos * 7.5 * streak;
        const slant = p.vx * 3.8 * streak;

        pCtx.beginPath();
        pCtx.lineWidth = lineW;
        pCtx.lineCap = "round";
        pCtx.moveTo(p.x - slant, p.y - len);
        pCtx.lineTo(p.x, p.y);
        pCtx.stroke();
      }
    }
  }

  function animateParticles(){
    if (!rafOn) return;
    drawParticles();
    requestAnimationFrame(animateParticles);
  }

  function startParticles(){
    if (animateStarted) return;
    animateStarted = true;

    // Try to play whoosh now (may still be blocked until first gesture)
    if (!particleSound) particleSound = createAudio();
    if (!whooshPlayed) {
      particleSound.currentTime = 0;
      particleSound.play().then(() => { whooshPlayed = true; })
      .catch(() => { /* will play on first gesture */ });
    }

    animateParticles();

    const t0 = performance.now();
    let spawned = 0;

    function tick(){
      const elapsed = performance.now() - t0;

      // count/alpha ramps (unchanged from your boosted setup)
      const tCountRaw = Math.min(1, elapsed / PARTICLES.RAMP_MS);
      const tCount    = easeInCubic(tCountRaw);
      const shouldHave = Math.floor(PARTICLES.TARGET * tCount);
      while (spawned < shouldHave) {
        particles.push(createParticle());
        spawned++;
      }

      const aT = easeInCubic(tCountRaw);
      const startAlpha = 0.01;
      particleAlpha = startAlpha + (PARTICLES.ALPHA_MAX - startAlpha) * aT;

      // ---- NEW: size-only ramp (tiny -> full), controls when we show hint ----
      const tSizeRaw = Math.min(1, elapsed / GROW.SIZE_MS);
      const tSize    = easeInOutCubic(tSizeRaw);
      sizeMul = lerp(GROW.START_SIZE_MUL, GROW.END_SIZE_MUL, tSize);

      // once full size reached, reveal hint & unlock scroll
      if (tSizeRaw >= 1 && !hintShown) {
        showHintAndUnlock();
      }

      if (tSizeRaw < 1 || tCountRaw < 1) requestAnimationFrame(tick);
    }
    tick();
  }

  // ---------------- init ----------------
  function init(){
    lockScroll(); // keep locked until size ramp completes
    resizeCanvas();
    typeWriter();

    // Prime audio on first user gesture (click/touch/keydown)
    window.addEventListener("pointerdown", primeAudioOnce, { once:false });
    window.addEventListener("touchstart", primeAudioOnce, { once:false, passive:true });
    window.addEventListener("keydown", primeAudioOnce, { once:false });
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("mousemove", e=>{
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // ===== SCROLL-DRIVEN bits =====
  gsap.registerPlugin(ScrollTrigger);

  // fade out the lines during scroll
  gsap.timeline({
    scrollTrigger:{
      trigger:"#landing",
      start:"top top",
      end:"bottom top",
      scrub:true
    }
  })
  .to("#mainLine",  { opacity:0, y:-20, ease:"power2.out" }, 0)
  .to("#subText",   { opacity:0, y:-10, ease:"power2.out" }, 0)
  .to("#scrollHint",{ opacity:0,           ease:"power2.out" }, 0);

  // gravity & streak control based on scroll direction/velocity
  ScrollTrigger.create({
    trigger:"#landing",
    start:"top top",
    end:"bottom top",
    scrub:true,
    onUpdate(self){
      if (falloffTween) { falloffTween.kill(); falloffTween = null; }

      // base gravity from progress
      const base = RAIN.GRAV_MAX * easeOutCubic(self.progress);

      // velocity & direction
      const v = self.getVelocity();
      const dir = (v > DIR.THRESH) ? 1 : (v < -DIR.THRESH) ? -1 : 0;

      // detect flip to UP: snap streaks off + damp vy to kill long lines
      if (dir === -1 && lastDir !== -1) {
        gsap.killTweensOf(streakTarget);
        gsap.killTweensOf(streak);
        streakTarget = 0;
        gsap.to({val: streak}, {
          duration: DIR.UP_SNAP_MS / 1000,
          val: 0,
          ease: "power2.out",
          onUpdate(){ streak = this.targets()[0].val; }
        });
        for (const p of particles) p.vy *= DIR.DAMP_ON_FLIP;
      }
      lastDir = dir;

      // velocity boost only when moving down
      const vNorm = gsap.utils.clamp(-1, 1, v / RAIN.VEL_NORM);
      const boost = vNorm > 0 ? vNorm * RAIN.GRAV_MAX * RAIN.BOOST_GAIN : 0;
      gravTarget = base + boost;

      // streak target only grows on downward motion; clamps 0..1
      const down = Math.max(0, v) / RAIN.VEL_NORM;
      streakTarget = (dir === 1) ? gsap.utils.clamp(0, 1, down) : 0;

      // also force dots near the very top to prevent “sky lines”
      if (self.progress < 0.02) {
        streakTarget = 0;
      }
    },
    onScrubComplete(){
      const cur = gravTarget;
      // decay gravity smoothly after scroll settles
      falloffTween = gsap.to({g: cur}, {
        duration: RAIN.FALL_DECAY_MS / 1000,
        g: 0,
        ease: "power2.out",
        onUpdate(){ gravTarget = this.targets()[0].g; }
      });

      // relax streaks after scrub stops
      gsap.to({s: streakTarget}, {
        duration: 0.35,
        s: 0,
        ease: "power2.out",
        onUpdate(){ streakTarget = this.targets()[0].s; }
      });
    }
  });

  // fade away particle layer across the bridge section
  ScrollTrigger.create({
    trigger:"#bridge",
    start:"top bottom",
    end:"bottom top",
    scrub:true,
    onUpdate(self){
      const p = self.progress;
      const vis = (1 - p) * (1 - 0.35 * streak); // bias opacity down when heavy rain
      gsap.to("#particleCanvas", { opacity: vis, overwrite: "auto", duration: 0.1 });
    },
    onLeave(){
      rafOn = false;
      gsap.set("#particleCanvas", { opacity: 0 });
    },
    onLeaveBack(){
      // coming back up from below: reset to dots immediately
      streak = 0;
      streakTarget = 0;
      if (!rafOn){
        rafOn = true;
        requestAnimationFrame(animateParticles);
      }
      gsap.set("#particleCanvas", { opacity: 1 });
    }
  });
})();
