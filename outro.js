// outro.js — typewriter exhale (mirrors scene1 typewriter but no particles)
(() => {
  const mainText      = "BREATHE OUT";
  const mainTextEl    = document.getElementById("outroMainText");
  const dotEl         = document.getElementById("outroDot");
  const subTextEl     = document.getElementById("outroSubText");

  // timings mirrored from your scene1 feel (letters -> dot -> subline)
  const SPEED = {
    LETTER: 100,        // per character
    DOT_DELAY: 600,     // after headline completes
    SUBTEXT_DELAY: 800, // after the dot appears
    WORD_STAGGER: 160   // subline word-by-word rise
  };

  let index = 0;

  function typeWriter(){
    if(index < mainText.length){
      mainTextEl.textContent += mainText.charAt(index);
      mainTextEl.style.opacity = 1;
      index++;
      setTimeout(typeWriter, SPEED.LETTER);
    } else {
      // reveal dot, then reveal subline word-by-word (same UX rhythm as intro)
      setTimeout(() => {
        dotEl.classList.remove("hidden");
        dotEl.style.opacity = 1;

        setTimeout(() => {
          const words = subTextEl.textContent.split(" ");
          subTextEl.innerHTML = "";
          subTextEl.classList.remove("hidden");
          words.forEach((w,i) => {
            const span = document.createElement("span");
            span.textContent = w;
            span.style.cssText =
              "opacity:0;transform:translateY(10px);display:inline-block;margin-right:6px;" +
              "transition:opacity 1s ease-out,transform 1s ease-out;";
            subTextEl.appendChild(span);
            setTimeout(() => {
              span.style.opacity = 1;
              span.style.transform = "translateY(0)";
            }, i * SPEED.WORD_STAGGER);
          });
        }, SPEED.SUBTEXT_DELAY);
      }, SPEED.DOT_DELAY);
    }
  }

  function init(){
    // keep cursor visible (no hide-cursor class here)
    // start the typewriter on arrival
    typeWriter();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // if this scene is not at top, also start when the section enters
    const outro = document.getElementById("outro");
    if (!outro) return;
    // if already visible, start immediately; else start on first intersection
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting){
          typeWriter();
          io.disconnect();
        }
      });
    }, { threshold: 0.6 });
    // if user lands here from above fold, run init now; else observe
    const vpH = window.innerHeight || document.documentElement.clientHeight;
    const rect = outro.getBoundingClientRect();
    if (rect.top < vpH * 0.4 && rect.bottom > vpH * 0.4){
      init();
    } else {
      io.observe(outro);
    }
  });
})();
