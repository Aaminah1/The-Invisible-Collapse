gsap.registerPlugin(ScrollTrigger);

/* ================= Scene 1: Typewriter + Scroll Lock + Particles ================= */
(() => {
  const mainText = "TAKE A BREATH";
  const mainTextEl   = document.getElementById("mainText");
  const dotEl        = document.getElementById("dot");
  const subTextEl    = document.getElementById("subText");
  const scrollHintEl = document.getElementById("scrollHint");
  const pCanvas      = document.getElementById("particleCanvas");
  const pCtx         = pCanvas.getContext("2d");

  // speeds
  const SPEED = {
    LETTER: 90,
    DOT_DELAY: 450,
    SUBTEXT_DELAY: 650,
    WORD_STAGGER: 140,
    SCROLL_HINT_DELAY: 2600
  };

  // simple scroll lock until the intro finishes
  let scrollLocked = true;
  const SCROLL_KEYS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','Space']);
  function prevent(e){ if(scrollLocked){ e.preventDefault(); e.stopPropagation(); } }
  function lock(){
    scrollLocked = true;
    document.body.style.overflow = "hidden";
    window.addEventListener('wheel', prevent, {passive:false});
    window.addEventListener('touchmove', prevent, {passive:false});
    window.addEventListener('keydown', e => { if (SCROLL_KEYS.has(e.code)) prevent(e); }, {passive:false});
    window.scrollTo(0,0);
  }
  function unlock(){
    scrollLocked = false;
    document.body.style.overflow = "";
    window.removeEventListener('wheel', prevent);
    window.removeEventListener('touchmove', prevent);
  }

  // particles (subtle)
  function resizeParticles(){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    pCanvas.style.width = innerWidth + "px";
    pCanvas.style.height = innerHeight + "px";
    pCanvas.width  = Math.floor(innerWidth * dpr);
    pCanvas.height = Math.floor(innerHeight * dpr);
    pCtx.setTransform(dpr,0,0,dpr,0,0);
  }
  resizeParticles();
  addEventListener("resize", resizeParticles);

  const P = Array.from({length:40}, () => ({
    x: Math.random()*innerWidth,
    y: Math.random()*innerHeight,
    vx:(Math.random()-.5)*0.35,
    vy:(Math.random()-.5)*0.35,
    r: Math.random()*2+1,
    a: 0.05 + Math.random()*0.07
  }));
  (function loop(){
    pCtx.clearRect(0,0,innerWidth,innerHeight);
    for(const p of P){
      p.x += p.vx; p.y += p.vy;
      if(p.x<0||p.x>innerWidth)  p.vx *= -1;
      if(p.y<0||p.y>innerHeight) p.vy *= -1;
      pCtx.fillStyle = `rgba(0,0,0,${p.a})`;
      pCtx.beginPath(); pCtx.arc(p.x,p.y,p.r,0,Math.PI*2); pCtx.fill();
    }
    requestAnimationFrame(loop);
  })();

  // typewriter
  function type(){
    let i=0;
    function tick(){
      if(i < mainText.length){
        mainTextEl.textContent += mainText.charAt(i++);
        mainTextEl.style.opacity = 1;
        setTimeout(tick, SPEED.LETTER);
      }else{
        setTimeout(()=>{
          dotEl.classList.remove("hidden");
          dotEl.style.opacity = 1;

          setTimeout(()=>{
            const words = subTextEl.textContent.split(" ");
            subTextEl.innerHTML = "";
            subTextEl.classList.remove("hidden");
            words.forEach((w,idx)=>{
              const span = document.createElement("span");
              span.textContent = w;
              span.style.cssText = "opacity:0;transform:translateY(10px);display:inline-block;margin-right:6px;transition:opacity .9s ease-out,transform .9s ease-out;";
              subTextEl.appendChild(span);
              setTimeout(()=>{ span.style.opacity=1; span.style.transform="translateY(0)"; }, idx*SPEED.WORD_STAGGER);
            });
          }, SPEED.SUBTEXT_DELAY);
        }, SPEED.DOT_DELAY);

        setTimeout(()=>{
          scrollHintEl.classList.remove("hidden");
          scrollHintEl.style.opacity = 1;
          unlock();
        }, SPEED.SCROLL_HINT_DELAY);
      }
    }
    tick();
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    lock();
    type();
  });
})();

/* ================= Bridge: Morph the BG gradient while leaving Scene 1 ================= */

const BRIDGE_LEN = 1; // timeline normalized 0..1

// fade Scene 1 text away softly as soon as user scrolls
gsap.timeline({
  scrollTrigger:{
    trigger:"#landing",
    start:"top top",
    end:"bottom top",
    scrub:true
  }
})
.to("#mainLine, #subText, #scrollHint", { opacity:0, y:-20, ease:"power2.out" }, 0);

// BG gradient “blooms” from bottom as we scroll through #bridge
const bridgeTL = gsap.timeline({
  scrollTrigger:{
    trigger:"#bridge",
    start:"top bottom",   // as soon as the bridge enters the viewport
    end:"bottom top",     // until it leaves
    scrub:true
  }
});

// 1) Fade the fixed sky ON (no white gaps)
bridgeTL.fromTo("#bg-sky", { opacity:0, y:20, scaleY:.96 }, { opacity:1, y:0, scaleY:1, ease:"none" }, 0);

// 2) Optionally nudge the palette slightly during the bridge
bridgeTL.to(":root", {
  "--bg-top":"#f4cd7c",
  "--bg-mid":"#be7f46",
  "--bg-bot":"#623a29",
  ease:"none"
}, 0.15);
