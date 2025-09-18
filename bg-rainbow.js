// js/bg-rainbow.js  (drop-in replacement)
(function Rainbow(){
  let built = false, wrap, bow, glow, grain;

  function css(){
    if (document.getElementById("bgrainbow-style")) return;
    const s = document.createElement("style");
    s.id = "bgrainbow-style";
    s.textContent = `
/* Lives inside #bg with the other background layers */
#bg #bgRainbow{
  position:fixed; inset:0; pointer-events:none;
  /* Put it in the sky: above sky/sil/fog/rays by default, still behind trees */
  z-index: var(--rainbowZ, 6);
  will-change: transform, opacity;
}
#bgRainbow .bow, #bgRainbow .glow, #bgRainbow .grain{
  position:fixed; inset:0; pointer-events:none; opacity:0;
}
/* --- TRUE BOW: 7 stacked radial bands (elliptical circle whose center is below horizon) --- */
#bgRainbow .bow{
  /* bow geometry */
  --rx: 135%;            /* x radius of the circle */
  --ry: 118%;            /* y radius (elliptical for perspective) */
  --cy: 122%;            /* center Y of the circle (below horizon) */
  /* inner/outer edge positions (percent of the radial) */
  /* band thickness ~1.6% each; arc spans ~60% -> ~71.2% */
  background:
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 60.0%, rgba(255,   30,   30, .75) 60.0%, rgba(255,   30,   30, .75) 61.6%, transparent 61.7%),
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 61.6%, rgba(255,  150,    0, .72) 61.6%, rgba(255,  150,    0, .72) 63.2%, transparent 63.3%),
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 63.2%, rgba(255,  230,   40, .70) 63.2%, rgba(255,  230,   40, .70) 64.8%, transparent 64.9%),
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 64.8%, rgba( 80,  210,   90, .70) 64.8%, rgba( 80,  210,   90, .70) 66.4%, transparent 66.5%),
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 66.4%, rgba( 55,  205,  215, .68) 66.4%, rgba( 55,  205,  215, .68) 68.0%, transparent 68.1%),
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 68.0%, rgba( 40,  135,  245, .66) 68.0%, rgba( 40,  135,  245, .66) 69.6%, transparent 69.7%),
    radial-gradient(var(--rx) var(--ry) at 50% var(--cy),
      transparent 69.6%, rgba(150,   60,  230, .64) 69.6%, rgba(150,   60,  230, .64) 71.2%, transparent 71.3%);

  /* soften & blend with sky so it sits in-scene */
  filter: blur(0.7px) saturate(0.95) contrast(1.02);
  mix-blend-mode: screen;
}

/* subtle white atmospheric glow just inside the bow */
#bgRainbow .glow{
  background:
    radial-gradient(140% 122% at 50% 118%,
      rgba(255,255,255,.28) 56%,
      rgba(255,255,255,.12) 60%,
      rgba(255,255,255,  0) 70%);
  filter: blur(10px);
}

/* microscopic grain to kill color banding (super faint) */
#bgRainbow .grain{
  background-image: url('data:image/svg+xml;utf8,\
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">\
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" stitchTiles="stitch"/></filter>\
<rect width="100%" height="100%" filter="url(#n)" opacity="0.05"/></svg>');
  background-size: 160px 160px;
  mix-blend-mode: overlay;
}

/* small screens: lower the bow a bit so it doesn’t clip */
@media (max-width: 680px){
  #bgRainbow .bow{ --cy: 128%; }
}
`;
    document.head.appendChild(s);
  }

  function build(){
    if (built) return;
    const bg = document.getElementById("bg");
    if (!bg) return;
    css();
    wrap = document.createElement("div");
    wrap.id = "bgRainbow";
    wrap.innerHTML = `<div class="glow"></div><div class="bow"></div><div class="grain"></div>`;
    bg.appendChild(wrap);
    glow = wrap.querySelector(".glow");
    bow  = wrap.querySelector(".bow");
    grain= wrap.querySelector(".grain");
    built = true;
  }

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth  = t => t*t*(3-2*t);

  function update(p){
    build(); if (!bow) return;

    // Appear mid-Full; fade through Mid1; gone in Mid2
    let a = 0;
    if (p < 1/3){
      const t = (p/(1/3) - 0.18) / 0.55;   // start ~18% into Full
      a = 0.9 * smooth(clamp01(t));
    } else if (p < 2/3){
      const t = (p - 1/3) / (1/3);         // Mid1
      a = 0.9 * smooth(1 - clamp01(t));
    } else {
      a = 0;
    }

    bow.style.opacity   = a.toFixed(3);
    glow.style.opacity  = (a * 0.45).toFixed(3);
    grain.style.opacity = (a * 0.25).toFixed(3);

    // tiny parallax lift so it feels aerial
    const y = -4 + p*8; // px
    wrap.style.transform = `translateY(${y}px)`;
  }

  window.__rainbow__ = { build, update };
})();
