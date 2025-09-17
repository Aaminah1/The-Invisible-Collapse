// Scene 1 (landing) intro + particles + handoff to background bridge
(() => {
  const mainText = "TAKE A BREATH";
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
    SCROLL_HINT_DELAY: 3200
  };

  // ---------------- particles knobs ----------------
  const PARTICLES = {
    TARGET: 50,
    RAMP_MS: 3000,
    ALPHA_MAX: 0.16
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
    FALL_DECAY_MS: 520
  };

  const lerp = (a,b,t)=>a+(b-a)*t;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

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
    // Try to start and immediately pause to satisfy some browsers’ gesture requirement
    particleSound.play().then(() => {
      particleSound.pause();
      particleSound.currentTime = 0;
      audioPrimed = true;
      // If particles already started but we couldn’t play earlier, play now
      if (animateStarted && !whooshPlayed) {
        try { particleSound.currentTime = 0; particleSound.play(); whooshPlayed = true; } catch {}
      }
    }).catch(() => {
      // Even if play() rejects here, having created it during a gesture often unlocks later plays
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
  let sizeMul  = 0.85;
  let rafOn = true;

  // Rain state (smoothed)
  let grav = 0;
  let gravTarget = 0;
  let falloffTween = null;

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

      setTimeout(() => {
        scrollHintEl.classList.remove("hidden");
        scrollHintEl.style.opacity = 1;
        unlockScroll();
      }, SPEED.SCROLL_HINT_DELAY);
    }
  }

  // ---------------- particles ----------------
  function createParticle(){
    const size = Math.random()*2 + 1;
    return {
      x: Math.random()*pCanvas.width,
      y: Math.random()*pCanvas.height,
      vx:(Math.random()-0.5)*0.5,
      vy:(Math.random()-0.5)*0.5,
      size
    };
  }

  function drawParticles(){
    grav = lerp(grav, gravTarget, 0.14);

    pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);

    const idle = grav < 0.01;
    const driftEff = driftMul * (idle ? RAIN.IDLE_DRIFT_BOOST : 1);

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

      if (p.x < -6) p.x = pCanvas.width + 6;
      if (p.x > pCanvas.width + 6) p.x = -6;
      if (p.y - p.size > pCanvas.height + 2) {
        p.y = -p.size - 2;
        p.x = Math.random() * pCanvas.width;
        p.vy *= 0.25;
      }

      pCtx.fillStyle = `rgba(0,0,0,${Math.min(PARTICLES.ALPHA_MAX, particleAlpha).toFixed(3)})`;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size * sizeMul, 0, Math.PI*2);
      pCtx.fill();
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
      .catch(() => {
        // Will auto-play on first gesture via primeAudioOnce()
      });
    }

    animateParticles();

    const t0 = performance.now();
    let spawned = 0;

    const easeInCubic = t => t*t*t;
    const easeInQuint = t => t*t*t*t*t;

    function tick(){
      const elapsed = performance.now() - t0;
      const t = Math.min(1, elapsed / PARTICLES.RAMP_MS);

      const shouldHave = Math.floor(PARTICLES.TARGET * easeInQuint(t));
      while (spawned < shouldHave) {
        particles.push(createParticle());
        spawned++;
      }

      const eAlpha = easeInCubic(t);
      const startAlpha = 0.01;
      particleAlpha = startAlpha + (PARTICLES.ALPHA_MAX - startAlpha) * eAlpha;

      driftMul = 0.6 + 0.6 * eAlpha;
      sizeMul  = 0.85 + 0.35 * eAlpha;

      if (t < 1) requestAnimationFrame(tick);
    }
    tick();
  }

  // ---------------- init ----------------
  function init(){
    lockScroll();
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

  ScrollTrigger.create({
    trigger:"#landing",
    start:"top top",
    end:"bottom top",
    scrub:true,
    onUpdate(self){
      if (falloffTween) { falloffTween.kill(); falloffTween = null; }
      const base = RAIN.GRAV_MAX * easeOutCubic(self.progress);
      const v = self.getVelocity();
      const vNorm = gsap.utils.clamp(-1, 1, v / RAIN.VEL_NORM);
      const boost = vNorm > 0 ? vNorm * RAIN.GRAV_MAX * RAIN.BOOST_GAIN : 0;
      gravTarget = base + boost;
    },
    onScrubComplete(self){
      const cur = gravTarget;
      falloffTween = gsap.to({g: cur}, {
        duration: RAIN.FALL_DECAY_MS / 1000,
        g: 0,
        ease: "power2.out",
        onUpdate(){ gravTarget = this.targets()[0].g; }
      });
    }
  });

  ScrollTrigger.create({
    trigger:"#bridge",
    start:"top bottom",
    end:"bottom top",
    scrub:true,
    onUpdate(self){
      const p = self.progress;
      gsap.to("#particleCanvas", { opacity: 1 - p, overwrite: "auto", duration: 0.1 });
    },
    onLeave(){
      rafOn = false;
      gsap.set("#particleCanvas", { opacity: 0 });
    },
    onLeaveBack(){
      if (!rafOn){
        rafOn = true;
        requestAnimationFrame(animateParticles);
      }
      gsap.set("#particleCanvas", { opacity: 1 });
    }
  });
})();
