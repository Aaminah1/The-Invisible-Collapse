// lamps.js
gsap.registerPlugin(ScrollTrigger);

/* ---------- ASSETS ---------- */
const LAMP_SRC = [
  "images/lampost1.png",
  "images/lampost2.png",
  "images/lampost3.png",
  "images/lampost4.png"
];

const GROUND_SRC = [
  "images/ground_stage5.png",
  "images/ground_stage6.png",
  "images/ground_stage7.png",
  "images/ground_stage8.png"
];

/* Near city layers (replace last when ready) */
const NEAR_SRC = [
  "images/city1.png",
  "images/city2.png",
  "images/city3.png",
  "images/city4.png" // placeholder
];

/* Far city layers (your new grayscale sequence) */
const FAR_SRC = [
  "images/cityfar_1.png",
  "images/cityfar_2.png",
  "images/cityfar_3.png",
  "images/cityfar_4.png"
];

/* Reference to size near stack exactly like old art */
const NEAR_REF = "images/constructioncity_near.png";

/* ---------- HELPERS ---------- */
function preload(srcs){
  return Promise.all(
    srcs.map(s => new Promise(r => {
      const i = new Image();
      i.onload = i.onerror = r;  // tolerate missing files
      i.src = s;
    }))
  );
}

function sizeMult(){
  const v = getComputedStyle(document.documentElement)
              .getPropertyValue('--citySizeMult').trim();
  const n = parseFloat(v || '1');
  return Number.isFinite(n) ? n : 1;
}

function computeLampHeightPx(){
  const vh = window.innerHeight;
  const base = vh * 0.70 * sizeMult();
  const h = Math.max(520, Math.min(base, 1100));
  return Math.round(h) + "px";
}

/* Set CSS --nearAR from the reference image's intrinsic aspect ratio */
function setNearAspectFromRef(){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ar = (img.naturalWidth && img.naturalHeight)
        ? img.naturalWidth / img.naturalHeight
        : 2.40; // safe fallback
      document.documentElement.style.setProperty("--nearAR", ar);
      resolve();
    };
    img.onerror = resolve; // continue with fallback
    img.src = NEAR_REF;
  });
}

/* Generic builder for stacked cross-fade groups */
function buildStack(containerId, classBase, srcs){
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  srcs.forEach((src, i) => {
    const im = document.createElement("img");
    im.className = classBase + " stage" + i;
    im.src = src;
    im.alt = classBase + " stage " + i;
    im.style.opacity = (i === 0 ? "1" : "0");
    el.appendChild(im);
  });
}

/* ---------- BUILD LAYERS ---------- */
function buildGroundStack(){
  buildStack("lampsGroundStack", "ground", GROUND_SRC);
}

function buildNearParallax(){
  buildStack("parallaxNearStack", "near", NEAR_SRC);
}

function buildFarParallax(){
  buildStack("parallaxFarStack", "far", FAR_SRC);
}


function buildLampRow(n = 5){
  const row = document.getElementById("lampsRow");
  row.innerHTML = "";
  row.style.setProperty("--lampH", computeLampHeightPx());

  for (let i = 0; i < n; i++){
    const wrap = document.createElement("div");
    wrap.className = "lampWrap";
    wrap.style.left = (((i + 1) / (n + 1)) * 100) + "%";

    LAMP_SRC.forEach((src, si) => {
      const img = document.createElement("img");
      img.className = "lamp stage" + si;
      img.src = src; img.alt = "lamp stage " + si;
      img.style.opacity = (si === 0 ? "1" : "0");
      wrap.appendChild(img);
    });

    row.appendChild(wrap);
  }
}

/* ---------- CROSSFADES ---------- */
function buildCrossfade(){
  const HOLD_START = 0.12, HOLD_END = 0.20;
  const segs = LAMP_SRC.length - 1;
  const segDur = (1 - HOLD_START - HOLD_END) / segs;
  const tl = gsap.timeline({ paused: true });

  function fadeLamps(t, a, b){
    document.querySelectorAll("#lampsRow .lampWrap").forEach(w => {
      const A = w.querySelector(".stage" + a), B = w.querySelector(".stage" + b);
      if(!(A && B)) return;
      tl.set(A, {opacity:1}, t).set(B, {opacity:0}, t)
        .to(A, {opacity:0, duration:segDur, ease:"none"}, t)
        .to(B, {opacity:1, duration:segDur, ease:"none"}, t);
    });
  }

  function fadeContainer(t, containerSel, classBase, a, b){
    const ctn = document.querySelector(containerSel);
    if(!ctn) return;
    const A = ctn.querySelector("." + classBase + ".stage" + a);
    const B = ctn.querySelector("." + classBase + ".stage" + b);
    if(!(A && B)) return;
    tl.set(A, {opacity:1}, t).set(B, {opacity:0}, t)
      .to(A, {opacity:0, duration:segDur, ease:"none"}, t)
      .to(B, {opacity:1, duration:segDur, ease:"none"}, t);
  }

  for (let i = 0; i < segs; i++){
    const t = HOLD_START + i * segDur;
    fadeLamps(t, i, i + 1);
    fadeContainer(t, "#lampsGroundStack",  "ground", i, i + 1);
    fadeContainer(t, "#parallaxNearStack", "near",   i, i + 1);
    fadeContainer(t, "#parallaxFarStack",  "far",    i, i + 1); 
  }
  return tl;
}

/* ---------- INIT ---------- */
const ALL = [...LAMP_SRC, ...GROUND_SRC, ...NEAR_SRC, NEAR_REF];

preload(ALL).then(async () => {
  await setNearAspectFromRef();   // ensure same size as constructioncity_near

  buildGroundStack();
    buildFarParallax();
  buildNearParallax();
  buildLampRow(5);

  const xfade = buildCrossfade();

  // pin scene and drive timeline
  const st = ScrollTrigger.create({
    trigger: "#lampsScene",
    start: "top top",
    end: "+=9400",
    scrub: true,
    pin: true,
    anticipatePin: 1,
    onUpdate(self){
      xfade.progress(self.progress);
      // ensure no positional drift
      gsap.set("#parallaxNearStack", { x: 0 });
       gsap.set("#parallaxFarStack",  { x: 0 });
    },
    invalidateOnRefresh: true,
    onRefreshInit(){ xfade.progress(0); }
  });

  // responsive
  const refresh = () => {
    document.getElementById("lampsRow")
      .style.setProperty("--lampH", computeLampHeightPx());
    st.refresh();
  };
  window.addEventListener("resize", refresh);
  requestAnimationFrame(() => ScrollTrigger.refresh());
});
