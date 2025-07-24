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

  let index = 0, mouseX = 0, mouseY = 0;
  let particles = [];

  function resizeCanvas(){
    pCanvas.width  = window.innerWidth;
    pCanvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function typeWriter(){
    if(index < mainText.length){
      mainTextEl.textContent += mainText.charAt(index);
      mainTextEl.style.opacity = 1;
      index++;
      setTimeout(typeWriter, 100);
    }else{
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
            }, i*500);
          });
        }, 2000);
      }, 2000);

      setTimeout(() => {
        scrollHintEl.classList.remove("hidden");
        scrollHintEl.style.opacity = 1;
      }, 8000);
    }
  }
  window.addEventListener("DOMContentLoaded", typeWriter);

  function scrollToForest(){
    document.getElementById("scene3").scrollIntoView({behavior:"smooth"});
  }
  window.scrollToForest = scrollToForest; // make callable from HTML onclick

  // ---- particles ----
  function createParticle(){
    const size = Math.random()*2+1;
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
      p.x += p.vx;
      p.y += p.vy;

      pCtx.fillStyle = "rgba(0,0,0,0.15)";
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      pCtx.fill();
    }
  }

  function animateParticles(){
    drawParticles();
    requestAnimationFrame(animateParticles);
  }

  function startParticles(){
    for(let i=0;i<50;i++) particles.push(createParticle());
    animateParticles();
  }

  window.addEventListener("mousemove", e=>{
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
})();
