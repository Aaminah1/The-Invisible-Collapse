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
    TARGET: 50,       // calm amount at end of ramp
    RAMP_MS: 3000,
    ALPHA_MAX: 0.16
  };

  // === Rain + smoothing config ===
  const RAIN = {
    GRAV_MAX: 0.28,        // max downward accel when scrolling hard
    BOOST_GAIN: 0.95,      // how much velocity amplifies gravity
    VEL_NORM: 1800,        // divisor for self.getVelocity() normalization
    // Damping:
    AIR_RESIST_ACTIVE: 0.995,  // when raining
    AIR_RESIST_IDLE_X: 0.995,  // idle sideways damping (keep drift alive)
    AIR_RESIST_IDLE_Y: 0.965,  // idle vertical damping (stop the fall smoothly)
    VEL_CLAMP: 3.0,            // cap speed so it doesn’t streak too far
    IDLE_DRIFT_BOOST: 5,    // more lively while static
    FALL_DECAY_MS: 520         // how long gravity fades to zero after scroll stops
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

  // ---------------- state ----------------
  let index = 0, mouseX = 0, mouseY = 0;
  let particles = [];
  let particleAlpha = 0;    // 0 -> ALPHA_MAX
  let animateStarted = false;
  let driftMul = 0.6;       // ramped up during intro (0.6 -> ~1.2)
  let sizeMul  = 0.85;      // ramped up during intro
  let rafOn = true;

  // Rain state (smoothed)
  let grav = 0;             // current applied gravity
  let gravTarget = 0;       // target gravity set by scroll
  let falloffTween = null;  // tween that brings gravTarget -> 0 when scroll stops

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
    // Smoothly approach target gravity
    grav = lerp(grav, gravTarget, 0.14);

    pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);

    const idle = grav < 0.01; // treat as idle when gravity is tiny
    const driftEff = driftMul * (idle ? RAIN.IDLE_DRIFT_BOOST : 1);

    for(const p of particles){
      // subtle mouse repulsion
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const dist = Math.hypot(dx,dy);
      if(dist < 100){
        p.vx += dx/dist*0.01;
        p.vy += dy/dist*0.01;
      }

      // apply gravity only when scrolling (and smoothly via grav)
      p.vy += grav;

      // damping: stronger vertical damping when idle to stop the fall,
      // lighter damping sideways to keep the idle drift lively
      if (idle){
        p.vx *= RAIN.AIR_RESIST_IDLE_X;
        p.vy *= RAIN.AIR_RESIST_IDLE_Y;
      } else {
        p.vx *= RAIN.AIR_RESIST_ACTIVE;
        p.vy *= RAIN.AIR_RESIST_ACTIVE;
      }

      // clamp velocities
      p.vx = Math.max(-RAIN.VEL_CLAMP, Math.min(RAIN.VEL_CLAMP, p.vx));
      p.vy = Math.max(-RAIN.VEL_CLAMP, Math.min(RAIN.VEL_CLAMP, p.vy));

      // integrate with (possibly boosted) idle drift
      p.x += p.vx * driftEff;
      p.y += p.vy * driftEff;

      // wrap horizontally; respawn at top when off the bottom
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

    animateParticles(); // start draw loop

    const t0 = performance.now();
    let spawned = 0;

    const easeInCubic = t => t*t*t;
    const easeInQuint = t => t*t*t*t*t;

    function tick(){
      const elapsed = performance.now() - t0;
      const t = Math.min(1, elapsed / PARTICLES.RAMP_MS);

      // COUNT (quint)
      const shouldHave = Math.floor(PARTICLES.TARGET * easeInQuint(t));
      while (spawned < shouldHave) {
        particles.push(createParticle());
        spawned++;
      }

      // OPACITY (cubic)
      const eAlpha = easeInCubic(t);
      const startAlpha = 0.01;
      particleAlpha = startAlpha + (PARTICLES.ALPHA_MAX - startAlpha) * eAlpha;

      // MOTION + SIZE
      driftMul = 0.6 + 0.6 * eAlpha;   // 0.6 -> 1.2
      sizeMul  = 0.85 + 0.35 * eAlpha; // ~1.2x by end

      if (t < 1) requestAnimationFrame(tick);
    }
    tick();
  }

  // ---------------- init ----------------
  function init(){
    lockScroll();
    resizeCanvas();
    typeWriter();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("resize", resizeCanvas);

  // pointer for subtle repulsion
  window.addEventListener("mousemove", e=>{
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // ===== SCROLL-DRIVEN bits =====
  gsap.registerPlugin(ScrollTrigger);

  // Fade landing text while leaving #landing
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

  // Drive gravity by scroll progress + velocity.
  // When scrolling stops, ease gravity back to 0 smoothly.
  ScrollTrigger.create({
    trigger:"#landing",
    start:"top top",
    end:"bottom top",
    scrub:true,
    onUpdate(self){
      // cancel any ongoing falloff tween while actively scrolling
      if (falloffTween) { falloffTween.kill(); falloffTween = null; }

      const base = RAIN.GRAV_MAX * easeOutCubic(self.progress);
      const v = self.getVelocity(); // +down, -up
      const vNorm = gsap.utils.clamp(-1, 1, v / RAIN.VEL_NORM);
      const boost = vNorm > 0 ? vNorm * RAIN.GRAV_MAX * RAIN.BOOST_GAIN : 0;

      gravTarget = base + boost; // rainy while moving
    },
    onScrubComplete(self){
      // smoothly glide back to no-gravity for seamless feel
      const cur = gravTarget;
      falloffTween = gsap.to({g: cur}, {
        duration: RAIN.FALL_DECAY_MS / 1000,
        g: 0,
        ease: "power2.out",
        onUpdate(){
          gravTarget = this.targets()[0].g;
        }
      });
    }
  });

  // Fade particle canvas across the #bridge section and stop RAF at end
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
      rafOn = false; // stop particle loop once bridge completes
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
