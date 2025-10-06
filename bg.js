gsap.registerPlugin(ScrollTrigger);

/* ---------- CONFIG (extend your existing CFG) ---------- */
const CFG = window.__BRIDGE_CFG__ || {
  seg: {
    sky:  [0.00, 0.25],
    far:  [0.12, 0.55],
    mid:  [0.32, 0.82],
    near: [0.56, 1.00],
    whiteBlendFade: [0.00, 0.40],
    // new: overlays fade timing (covers most of the bridge)
    grade: [0.10, 0.90],
    haze:  [0.20, 0.95],
    glint: [0.65, 1.00]
  },
  lift: { far: 28, mid: 44, near: 64 },
  // new: very small sideways “breeze” during rise
  sway: { far: 6, mid: 8, near: 10 }
};
window.__BRIDGE_CFG__ = CFG;

/* ---------- STYLE (injected once) ---------- */
(function injectSmoothBridgeCSS(){
  if (document.getElementById("smooth-bridge-css")) return;
  const s = document.createElement("style");
  s.id = "smooth-bridge-css";
  s.textContent = `
    /* soft edge masks for fog so it never looks like slabs */
    #bgFog .layer{
      -webkit-mask-image:
        radial-gradient(140% 100% at 50% 60%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
              mask-image:
        radial-gradient(140% 100% at 50% 60%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
      -webkit-mask-composite: source-in;
              mask-composite: intersect;
    }
    /* grade & haze overlays (subtle) */
    #bg-gradeCool, #bg-bridgeHaze {
      position:fixed; inset:0; pointer-events:none;
    }
    #bg-gradeCool { z-index: 3; mix-blend-mode: color; opacity:0; }
    #bg-bridgeHaze { z-index: 4; opacity:0; }
    #bg-gradeCool::before{
      content:""; position:absolute; inset:0; background: rgba(92,120,150,1);
    }
    #bg-bridgeHaze::before{
      content:""; position:absolute; left:-12%; right:-12%;
      bottom:-4%; height:44vh;
      background:
        radial-gradient(110% 78% at 50% 90%,
          rgba(190,210,230,.22), rgba(120,140,160,.18) 40%,
          rgba(60,70,86,0) 100%);
      filter: blur(14px);
    }
  `;
  document.head.appendChild(s);
})();


/* ---------- BUILD overlay nodes (idempotent) ---------- */
function ensureBridgeOverlays(){
  const bg = document.getElementById("bg");
  if (!bg) return;

  if (!document.getElementById("bg-gradeOverlay")){
    const grade = document.createElement("div");
    grade.id = "bg-gradeOverlay";
    bg.appendChild(grade);
  }
  if (!document.getElementById("bg-haze")){
    const haze = document.createElement("div");
    haze.id = "bg-haze";
    bg.appendChild(haze);
  }
  if (!document.getElementById("bg-glints")){
    const gl = document.createElement("div");
    gl.id = "bg-glints";
    // scatter 7 faint lines at different x positions
    const xs = [14, 26, 38, 50, 62, 74, 86];
    xs.forEach((pct,i)=>{
      const g = document.createElement("div");
      g.className = "g";
      g.style.left = pct + "vw";
      g.style.height = (6 + (i%3)*2) + "vh";        // slight variance
      g.style.opacity = (0.04 + (i%3)*0.01).toFixed(2);
      gl.appendChild(g);
    });
    bg.appendChild(gl);
  }
}

/* ---------- PRELOAD to avoid pops ---------- */
["images/bg-far.png","images/bg-mid.png","images/bg-near.png"].forEach(src=>{
  const i = new Image(); i.src = src;
});

/* ---------- BRIDGE TIMELINE ---------- */
ensureBridgeOverlays();

const tl = gsap.timeline({
  scrollTrigger:{
    trigger: "#bridge",
    start: "top bottom",
    end:   "bottom top",
    scrub: true,
    // markers:true,
  }
});

/* 1) maintain your white feather handoff */
tl.fromTo("#bg-whiteBlend",
  { height: "36vh", opacity: 1 },
  { height: "0vh",  opacity: 0.0, ease: "none",
    duration: CFG.seg.whiteBlendFade[1] - CFG.seg.whiteBlendFade[0] },
  CFG.seg.whiteBlendFade[0]
);

/* 2) sky first in */
tl.fromTo("#bg-sky",
  { opacity: 0, y: 32, scaleY: .97, filter: "saturate(.90) brightness(1.02) contrast(.96)" },
  { opacity: 1, y: 0,  scaleY: 1,   filter: "saturate(1) brightness(1) contrast(1)", ease: "none",
    duration: CFG.seg.sky[1] - CFG.seg.sky[0] },
  CFG.seg.sky[0]
);

/* helper: a tiny sideways sway while rising */
function layerIn(sel, lift, seg, startOpacity = 0, sway = 0){
  const dur = seg[1] - seg[0];
  // rise + unblur + fade
  tl.fromTo(sel,
    { opacity: startOpacity, y: lift, x: 0, filter: "blur(2px)" },
    { opacity: 1,            y: 0,    x: 0, filter: "blur(0px)", ease: "none", duration: dur },
    seg[0]
  );
  // subtle breeze sway overlapping the same window
  if (sway > 0){
    tl.fromTo(sel,
      { x: -sway },
      { x: sway, ease: "sine.inOut", yoyo: true, repeat: 1, duration: dur },
      seg[0]
    );
  }
}

/* 3) back→front layers with a tiny breeze */
layerIn(".bg-layer.far",  CFG.lift.far,  CFG.seg.far,  0.12, CFG.sway.far);
layerIn(".bg-layer.mid",  CFG.lift.mid,  CFG.seg.mid,  0.00, CFG.sway.mid);
layerIn(".bg-layer.near", CFG.lift.near, CFG.seg.near, 0.00, CFG.sway.near);

/* 4) COLOR GRADE: warm -> cool (subtle) */
tl.fromTo("#bg-gradeOverlay",
  // start slightly warm and light
  { opacity: 0.00, filter: "hue-rotate(-8deg) saturate(1.08) brightness(1.04) contrast(0.98)" },
  // end slightly cool and dimmer (pre-city)
  { opacity: 0.38, filter: "hue-rotate(18deg) saturate(0.88) brightness(0.93) contrast(1.03)", ease: "none",
    duration: CFG.seg.grade[1] - CFG.seg.grade[0] },
  CFG.seg.grade[0]
);

/* 5) HAZE: breathe in, then thin out slightly near the end */
tl.fromTo("#bg-haze",
  { opacity: 0.00, y: 8 },
  { opacity: 0.22, y: 0, ease: "sine.out",
    duration: (CFG.seg.haze[1] - CFG.seg.haze[0]) * 0.65 },
  CFG.seg.haze[0]
);
// slight thinning toward the very end so city lights can later shine through
tl.to("#bg-haze",
  { opacity: 0.16, ease: "sine.inOut",
    duration: (CFG.seg.haze[1] - CFG.seg.haze[0]) * 0.35 },
  CFG.seg.haze[0] + (CFG.seg.haze[1] - CFG.seg.haze[0]) * 0.65
);

/* 6) GLINTS: hint of structures (very faint) */
tl.fromTo("#bg-glints",
  { opacity: 0, y: 12, filter: "blur(1.6px)" },
  { opacity: 0.10, y: 0, filter: "blur(0.6px)", ease: "none",
    duration: CFG.seg.glint[1] - CFG.seg.glint[0] },
  CFG.seg.glint[0]
);
// tiny individual shimmer so they feel alive
gsap.utils.toArray("#bg-glints .g").forEach((el, i) => {
  tl.fromTo(el, { scaleY: 0.96 }, { scaleY: 1.02, ease: "sine.inOut", yoyo: true, repeat: 1, duration: 0.25 }, CFG.seg.glint[0] + 0.05*i);
});

/* 7) housekeeping: hide white blend after handoff */
ScrollTrigger.create({
  trigger: "#bridge",
  start: "top bottom",
  end:   "bottom top",
  onLeave:     () => gsap.set("#bg-whiteBlend", { display: "none" }),
  onEnterBack: () => gsap.set("#bg-whiteBlend", { display: "block" })
});
