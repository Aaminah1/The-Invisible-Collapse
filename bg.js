gsap.registerPlugin(ScrollTrigger);

/* ---------- CONFIG (tweak freely) ---------- */
const CFG = {
  // when each element animates during the bridge [0..1]
  seg: {
    sky:  [0.00, 0.25],
    far:  [0.12, 0.55],
    mid:  [0.32, 0.82],
    near: [0.56, 1.00],
    whiteBlendFade: [0.00, 0.40]
  },
  // how far each layer rises (px)
  lift: { far: 28, mid: 44, near: 64 }
};

/* ---------- PRELOAD (optional but avoids pops) ---------- */
["images/bg-far.png","images/bg-mid.png","images/bg-near.png"].forEach(src=>{
  const i = new Image(); i.src = src;
});

/* ---------- BRIDGE: drives only the background ---------- */
const tl = gsap.timeline({
  scrollTrigger:{
    trigger: "#bridge",
    start: "top bottom", // begins as soon as its top hits bottom of viewport
    end:   "bottom top", // ends when its bottom hits top of viewport
    scrub: true,
    // markers:true,
  }
});

/* 1) white feather shrinks away so the sky can take over */
tl.fromTo("#bg-whiteBlend",
  { height: "36vh", opacity: 1 },
  { height: "0vh",  opacity: 0.0, ease: "none",
    duration: CFG.seg.whiteBlendFade[1] - CFG.seg.whiteBlendFade[0] },
  CFG.seg.whiteBlendFade[0]
);

/* 2) sky blooms up first */
tl.fromTo("#bg-sky",
  { opacity: 0, y: 32, scaleY: .97, filter: "saturate(.90) brightness(1.02) contrast(.96)" },
  { opacity: 1, y: 0,  scaleY: 1,   filter: "saturate(1) brightness(1) contrast(1)", ease: "none",
    duration: CFG.seg.sky[1] - CFG.seg.sky[0] },
  CFG.seg.sky[0]
);

/* 3) layers rise in, back → front (very soft) */
function layerIn(sel, lift, seg, startOpacity = 0){
  tl.fromTo(sel,
    { opacity: startOpacity, y: lift, filter: "blur(2px)" },
    { opacity: 1,            y: 0,    filter: "blur(0)", ease: "none",
      duration: seg[1] - seg[0] },
    seg[0]
  );
}
layerIn(".bg-layer.far",  CFG.lift.far,  CFG.seg.far,  0.12);
layerIn(".bg-layer.mid",  CFG.lift.mid,  CFG.seg.mid,  0.00);
layerIn(".bg-layer.near", CFG.lift.near, CFG.seg.near, 0.00);

/* ---------- NOTES ----------
- If you still see any white seam, increase the landing bottom fade (in scene1.css)
  or start the sky a little earlier (lower CFG.seg.sky[0]) and/or extend whiteBlend.
- Want a longer handoff? Increase #bridge {height: ...}.
- Layers are <img> at 110vw & bottom:0 so they’re never cropped and sit
  flush with the horizon.
*/
// Ensure the white feather is fully gone after the bridge
ScrollTrigger.create({
  trigger: "#bridge",
  start: "top bottom",
  end: "bottom top",
  onLeave:     () => gsap.set("#bg-whiteBlend", { display: "none" }),
  onEnterBack: () => gsap.set("#bg-whiteBlend", { display: "block" })
});
