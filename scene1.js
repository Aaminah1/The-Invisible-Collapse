// scene1.js
(() => {
  const mainText = "TAKE A BREATH";
  const mainTextEl   = document.getElementById("mainText");
  const dotEl        = document.getElementById("dot");
  const subTextEl    = document.getElementById("subText");
  const scrollHintEl = document.getElementById("scrollHint");
  const pCanvas      = document.getElementById("particleCanvas");
  const pCtx         = pCanvas.getContext("2d");
  const audio        = document.getElementById("ambientAudio");

  // ---------------- speed knobs ----------------
  const SPEED = {
    LETTER: 100,            // headline typing speed (original)
    DOT_DELAY: 600,         // after headline finishes
    SUBTEXT_DELAY: 800,     // after dot
    WORD_STAGGER: 160,      // per-word reveal
    SCROLL_HINT_DELAY: 3200 // after headline finishes
  };

  // ---------------- particles knobs ----------------
  const PARTICLES = {
    TARGET: 50,     // total by the end (calm)
    RAMP_MS: 3000,  // how long the ramp lasts
    ALPHA_MAX: 0.16 // final opacity density cap
  };

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
    window.removeEventListener('wheel', preventScroll, {passive:false});
    window.removeEventListener('touchmove', preventScroll, {passive:false});
    window.removeEventListener('keydown', keyBlock, {passive:false});
  }

  // ---------------- state ----------------
  let index = 0, mouseX = 0, mouseY = 0;
  let particles = [];

  // ramped properties (start subtle, grow obvious)
  let particleAlpha = 0;     // 0 -> ALPHA_MAX
  let animateStarted = false;
  let driftMul = 0.6;        // movement speed multiplier (0.6 -> ~1.2)
  let sizeMul  = 0.85;       // size multiplier (0.85 -> ~1.2)

  // ---------------- setup ----------------
 // replace your resizeCanvas with this
function resizeCanvas(){
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  pCanvas.style.width  = w + "px";
  pCanvas.style.height = h + "px";
  pCanvas.width  = Math.floor(w * dpr);
  pCanvas.height = Math.floor(h * dpr);
  pCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}


  // ---------------- typewriter ----------------
  function typeWriter(){
    if(index < mainText.length){
      mainTextEl.textContent += mainText.charAt(index);
      mainTextEl.style.opacity = 1;
      index++;
      setTimeout(typeWriter, SPEED.LETTER);
    } else {
      // DOT
      setTimeout(() => {
        dotEl.classList.remove("hidden");
        dotEl.style.opacity = 1;

        // start particles only now (they ramp in gently)
        startParticles();

        // SUBTEXT
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

      // SCROLL HINT + UNLOCK
      setTimeout(() => {
        scrollHintEl.classList.remove("hidden");
        scrollHintEl.style.opacity = 1;
        unlockScroll(); // allow scrolling only now
      }, SPEED.SCROLL_HINT_DELAY);
    }
  }

  // expose for onclick
  function scrollToForest(){
    unlockScroll(); // safety
    document.getElementById("scene3").scrollIntoView({behavior:"smooth"});
  }
  window.scrollToForest = scrollToForest;

  // ---------------- particles ----------------
  function createParticle(){
    const size = Math.random()*2 + 1; // base size (scaled by sizeMul later)
    return {
      x: Math.random()*pCanvas.width,
      y: Math.random()*pCanvas.height,
      vx:(Math.random()-0.5)*0.5,
      vy:(Math.random()-0.5)*0.5,
      size
    };
  }

  function drawParticles(){
    pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
    for(const p of particles){
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const dist = Math.hypot(dx,dy);
      if(dist < 100){
        p.vx += dx/dist*0.01;
        p.vy += dy/dist*0.01;
      }
      // movement ramps from gentle to more noticeable
      p.x += p.vx * driftMul;
      p.y += p.vy * driftMul;

      pCtx.fillStyle = `rgba(0,0,0,${Math.min(PARTICLES.ALPHA_MAX, particleAlpha).toFixed(3)})`;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size * sizeMul, 0, Math.PI*2);
      pCtx.fill();
    }
  }

  function animateParticles(){
    drawParticles();
    requestAnimationFrame(animateParticles);
  }

  function startParticles(){
    if (animateStarted) return;
    animateStarted = true;

    animateParticles(); // start the draw loop (alpha starts at 0)

    const t0 = performance.now();
    let spawned = 0;

    const easeInCubic = t => t*t*t;         // nice for opacity/motion/size
    const easeInQuint = t => t*t*t*t*t;     // stronger acceleration for count

    function tick(){
      const elapsed = performance.now() - t0;
      const t = Math.min(1, elapsed / PARTICLES.RAMP_MS);

      // 1) COUNT: almost none at first, then more (quint)
      const shouldHave = Math.floor(PARTICLES.TARGET * easeInQuint(t));
      while (spawned < shouldHave) {
        particles.push(createParticle());
        spawned++;
      }

      // 2) OPACITY: gentle start → readable end (cubic)
      const eAlpha = easeInCubic(t);
      const startAlpha = 0.01; // nearly invisible at the beginning
      particleAlpha = startAlpha + (PARTICLES.ALPHA_MAX - startAlpha) * eAlpha;

      // 3) MOTION + SIZE ramp (cubic)
      driftMul = 0.6 + 0.6 * eAlpha;   // 0.6x -> 1.2x
      sizeMul  = 0.85 + 0.35 * eAlpha; // slightly larger by the end

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

  // pointer for subtle repulsion
  window.addEventListener("mousemove", e=>{
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
})();
