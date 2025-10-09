// tractor.js (no bounce, stable facing)
(() => {
  gsap.registerPlugin(ScrollTrigger);

  // --- knobs ---
  const TRACTOR_APPEAR = 0.60;   // when it shows in the tail
  const MOVE_END       = 0.98;   // finish moving by this point in tail
  const START_X_VW     = 105;    // offscreen right
  const END_X_VW       = -12;    // end further left
  const GROUND_PX      = 22;     // vertical placement

  // "heavy but no bounce" smoothing (0..1); smaller = heavier
  const FOLLOW = 0.06;

  // facing stability
  const DIR_SMOOTH  = 0.85;
  const DIR_THRESH  = 0.002;
  const FLIP_FRAMES = 6;

  const _clamp01 = v => Math.max(0, Math.min(1, v));
  const _smooth  = t => t*t*(3-2*t);
  const _lerp    = (a,b,t) => a + (b-a)*t;
  const vw       = v => (innerWidth/100) * v;

  // DOM
  function ensureTractorDOM(){
    let layer = document.getElementById("tractorLayer");
    let img   = document.getElementById("tractor");
    const parent = document.getElementById("forestReveal") || document.body;

    if (!layer) {
      layer = document.createElement("div");
      layer.id = "tractorLayer";
      layer.setAttribute("aria-hidden","true");
      parent.appendChild(layer);
      Object.assign(layer.style, { position:"absolute", inset:"0", pointerEvents:"none", zIndex:"60" });
    }
    if (!img) {
      img = document.createElement("img");
      img.id = "tractor";
      img.alt = "";
      img.src = "images/tractor.png";
      layer.appendChild(img);
      Object.assign(img.style, {
        position:"absolute",
        bottom: GROUND_PX + "px",
        height:"min(22vmin, 220px)",
        transform:"translate3d(120vw,0,0)",
        opacity:"0",
        willChange:"transform, opacity"
      });
    }
  }

  // state
  let posX = 0, tgtX = 0;
  let setX, setY, setO, setScaleX;
  let tickerStarted = false;

  // facing
  let facing = -1; // default left
  let smoothDir = 0;
  let lastTailT = 0;
  let flipCounter = 0;

  function ensureSetters(){
    if (setX) return;
    setX      = gsap.quickSetter("#tractor", "x", "px");
    setY      = gsap.quickSetter("#tractor", "y", "px");  // no tween → no bob/lag
    setO      = gsap.quickTo("#tractor", "opacity", { duration: 0.16, ease: "linear", overwrite: "auto" });
    setScaleX = gsap.quickTo("#tractor", "scaleX",  { duration: 0.14, ease: "power2.out", overwrite: "auto" });
  }

  function startTicker(){
    if (tickerStarted) return;
    tickerStarted = true;
    gsap.ticker.add(() => {
      if (!setX) return;
      // simple low-pass follow, no velocity term, so no overshoot
      posX += (tgtX - posX) * FOLLOW;
      // snap when extremely close to avoid shimmer
      if (Math.abs(tgtX - posX) < 0.4) posX = tgtX;
      setX(posX);
    });
  }

  function targetXFromTail(tailT){
    if (tailT <= TRACTOR_APPEAR) return vw(START_X_VW);
    const spanT = (tailT - TRACTOR_APPEAR) / (MOVE_END - TRACTOR_APPEAR);
    const e = _smooth(_clamp01(spanT));
    return vw(_lerp(START_X_VW, END_X_VW, e));
  }

  function updateFacing(tailT, visible){
    const raw = tailT - lastTailT;  // >0 when scrolling down
    lastTailT = tailT;
    smoothDir = DIR_SMOOTH * smoothDir + (1 - DIR_SMOOTH) * raw;

    const want =
      smoothDir >  DIR_THRESH ? +1 :
      smoothDir < -DIR_THRESH ? -1 :
      facing;

    const parkedEnd = (tailT >= 0.995);
    if (!visible || parkedEnd) return;

    if (want !== facing) {
      if (++flipCounter >= FLIP_FRAMES) {
        facing = want;
        setScaleX(facing);
        flipCounter = 0;
      }
    } else {
      flipCounter = 0;
    }
  }

  // called from forest-row.js with tailT: 0..1
  function updateTail(tailT){
    ensureTractorDOM(); ensureSetters(); startTicker();

    const visible = tailT > TRACTOR_APPEAR;

    tgtX = targetXFromTail(tailT);
    setO(visible ? 1 : 0);

    // no bob: keep y flat (or set a tiny constant like -1 if you prefer)
    setY(0);

    updateFacing(tailT, visible);
  }

  window.__tractor__ = {
    init(){
      ensureTractorDOM(); ensureSetters(); startTicker();
      posX = tgtX = vw(START_X_VW);
      setX(posX); setY(0); setO(0); setScaleX(facing);
      lastTailT = 0; smoothDir = 0; flipCounter = 0;
    },
    updateTail
  };

  (document.readyState === "loading")
    ? document.addEventListener("DOMContentLoaded", window.__tractor__.init)
    : window.__tractor__.init();
})();
