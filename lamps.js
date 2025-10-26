// lamps.js
gsap.registerPlugin(ScrollTrigger);

/* assets */
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

/* helpers */
function preload(srcs){
  return Promise.all(srcs.map(s => new Promise(r => { const i=new Image(); i.onload=i.onerror=r; i.src=s; })));
}
function sizeMult(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--citySizeMult').trim();
  const n = parseFloat(v||'1'); return Number.isFinite(n) ? n : 1;
}
function computeLampHeightPx(){
  const vh = window.innerHeight;
  const base = vh * 0.70 * sizeMult();
  const h = Math.max(520, Math.min(base, 1100));
  return Math.round(h) + "px";
}

/* build layers */
function buildGroundStack(){
  const stack = document.getElementById("lampsGroundStack");
  stack.innerHTML = "";
  GROUND_SRC.forEach((src,i)=>{
    const im = document.createElement("img");
    im.className = "ground stage"+i;
    im.src = src; im.alt = "ground stage "+i;
    im.style.opacity = (i===0?"1":"0");
    stack.appendChild(im);
  });
}
function buildLampRow(n=5){
  const row = document.getElementById("lampsRow");
  row.innerHTML = "";
  row.style.setProperty("--lampH", computeLampHeightPx());
  for (let i=0;i<n;i++){
    const wrap = document.createElement("div");
    wrap.className = "lampWrap";
    wrap.style.left = (((i+1)/(n+1))*100) + "%";
    LAMP_SRC.forEach((src,si)=>{
      const img = document.createElement("img");
      img.className = "lamp stage"+si;
      img.src = src; img.alt = "lamp stage "+si;
      img.style.opacity = (si===0?"1":"0");
      wrap.appendChild(img);
    });
    row.appendChild(wrap);
  }
}

/* crossfade (same hold timing as earlier) */
function buildCrossfade(){
  const HOLD_START = 0.12, HOLD_END = 0.20;
  const segs = LAMP_SRC.length - 1;
  const segDur = (1 - HOLD_START - HOLD_END) / segs;
  const tl = gsap.timeline({ paused:true });

  function fadeLamps(t,a,b){
    document.querySelectorAll("#lampsRow .lampWrap").forEach(w=>{
      const A = w.querySelector(".stage"+a), B = w.querySelector(".stage"+b);
      if(!(A&&B)) return;
      tl.set(A,{opacity:1},t).set(B,{opacity:0},t)
        .to(A,{opacity:0,duration:segDur,ease:"none"},t)
        .to(B,{opacity:1,duration:segDur,ease:"none"},t);
    });
  }
  function fadeGrounds(t,a,b){
    const s = document.getElementById("lampsGroundStack");
    const A = s.querySelector(".stage"+a), B = s.querySelector(".stage"+b);
    if(!(A&&B)) return;
    tl.set(A,{opacity:1},t).set(B,{opacity:0},t)
      .to(A,{opacity:0,duration:segDur,ease:"none"},t)
      .to(B,{opacity:1,duration:segDur,ease:"none"},t);
  }

  for (let i=0;i<segs;i++){
    const t = HOLD_START + i*segDur;
    fadeLamps(t,i,i+1);
    fadeGrounds(t,i,i+1);
  }
  return tl;
}

/* init: pinned right after forest section in page flow */
const ALL = [...LAMP_SRC, ...GROUND_SRC];
preload(ALL).then(()=>{
  buildGroundStack();
  buildLampRow(5);
  const xfade = buildCrossfade();

  // hint fade
  gsap.to("#lampsScene .lampsHint", {
    opacity: 0, duration: 0.4,
    scrollTrigger: { trigger: "#lampsScene", start: "top top+=1", end: "+=1", scrub: true }
  });

  // Match forest crossfade rate (~2.12k px per transition)
  const st = ScrollTrigger.create({
    trigger: "#lampsScene",
    start: "top top",
    end: "+=9400",
    scrub: true,
    pin: true,
    anticipatePin: 1,
    onUpdate(self){ xfade.progress(self.progress); },
    invalidateOnRefresh: true,
    onRefreshInit(){ xfade.progress(0); }
  });

  // responsive sizing + stable first measure
  const refresh = ()=>{
    document.getElementById("lampsRow").style.setProperty("--lampH", computeLampHeightPx());
    st.refresh();
  };
  window.addEventListener("resize", refresh);
  requestAnimationFrame(()=> ScrollTrigger.refresh());
});
