// js/handoff-bridge.js — Pin Relay (Lite, BOOSTED, OPTIMIZED)
// - Short, smooth handoff (default 60vh) so lamps appear sooner
// - Kills floating forest ground & leaf/twig canvas immediately
// - Cloud press, camera push, cool→warm grade, subtle lightning
// - Perf: CSS vars for grade, cached selectors, quickSetter, epsilon guards
// Requires: GSAP + ScrollTrigger

(() => {
  if (window.__HANDOFF_BUILT__) return;
  window.__HANDOFF_BUILT__ = true;

  /* ========================= SELECTORS ========================= */
  const SEL = {
    forestSection : "#forestReveal",
    lampsSection  : "#lampsScene",
    forestGround  : "#forestReveal #ground",
    bgRoot        : "#bg" // overlay parent
  };

  /* ============================ DIALS =========================== */
  const DIALS = {
    relayVH    : 60,    // length of handoff pin (vh). Lower → lamps sooner (try 40–90)
    cloudPress : 70,    // px clouds press down at peak
    pushScale  : 0.030, // camera push (1 → +3%)
    pushY      : 40,    // px camera nudges downward
    windShear  : 18,    // cloud sideways shear px/s

    coolHue    : -10,   // early cool hue (negative = blue)
    warmHue    :  16,   // late warm hue
    sepiaMax   : 0.35,  // max sepia near lamps
    veilBase   : 0.28,  // base multiply veil
    flashAmp   : 0.20   // lightning flash intensity
  };

  /* ========================= DOM LOOKUPS ======================== */
  const forest = document.querySelector(SEL.forestSection);
  const lamps  = document.querySelector(SEL.lampsSection);
  const bgRoot = document.querySelector(SEL.bgRoot) || document.body;

  if (!forest || !lamps) {
    console.warn("[handoff-bridge] missing #forestReveal or #lampsScene");
    return;
  }

  /* ====================== SENTINEL + OVERLAYS =================== */
  const sentinel = document.createElement("div");
  sentinel.id = "handoffSentinel";
  sentinel.style.minHeight = "1px";
  lamps.parentNode.insertBefore(sentinel, lamps);

  // Styles (grade uses CSS vars for speed)
  const style = document.createElement("style");
  style.textContent = `
    /* Grade vars (set by JS) */
    #bgGrade .tint{
      --grade-hue:   0deg;
      --grade-sat:   1;
      --grade-bri:   1;
      --grade-sepia: 0;
      filter:
        hue-rotate(var(--grade-hue))
        saturate(var(--grade-sat))
        brightness(var(--grade-bri))
        sepia(var(--grade-sepia));
      will-change: filter;
    }
    #bgClouds canvas { will-change: transform; }
    #parallaxFarStack, #parallaxNearStack { will-change: transform; }

    #handoffBridge{ position:fixed; inset:0; pointer-events:none; z-index:9000; display:none; }
    #handoffBridge .veil{
      position:absolute; inset:0; opacity:0;
      background: linear-gradient(to bottom,
        rgba(0,0,0,.30) 0%,
        rgba(0,0,0,0) 40%,
        rgba(0,0,0,.24) 100%);
      mix-blend-mode: multiply;
      transition: opacity .22s ease;
    }
    #handoffBridge .flash{
      position:absolute; inset:0; opacity:0;
      background:#fff;
      mix-blend-mode:screen;
      transition: opacity .06s linear;
    }
  `;
  document.head.appendChild(style);

  const bridge = document.createElement("div");
  bridge.id = "handoffBridge";
  const veil  = document.createElement("div");
  veil.className = "veil";
  const flash = document.createElement("div");
  flash.className = "flash";
  bridge.appendChild(veil);
  bridge.appendChild(flash);
  bgRoot.appendChild(bridge);

  /* ============================= GSAP =========================== */
  if (!window.gsap || !window.ScrollTrigger) {
    console.warn("[handoff-bridge] GSAP/ScrollTrigger not found");
    return;
  }
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  const pxFromVH = (vh) => Math.round(window.innerHeight * (vh / 100));
  const clamp01  = (x)  => Math.max(0, Math.min(1, x));
  const ease     = (t)  => t*t*(3-2*t);

  /* ====================== CACHES & QUICK SETTERS ===================== */
  const tintEl       = document.querySelector("#bgGrade .tint");
  const cloudCanvas  = document.querySelector("#bgClouds canvas");
  const farStack     = document.querySelector("#parallaxFarStack");
  const nearStack    = document.querySelector("#parallaxNearStack");

  const setCloudY = cloudCanvas ? gsap.quickSetter(cloudCanvas, "y", "px") : null;
  const setFarY   = farStack    ? gsap.quickSetter(farStack,    "y", "px") : null;
  const setNearY  = nearStack   ? gsap.quickSetter(nearStack,   "y", "px") : null;
  const setFarS   = farStack    ? gsap.quickSetter(farStack,    "scale")   : null;
  const setNearS  = nearStack   ? gsap.quickSetter(nearStack,   "scale")   : null;

  // epsilon-guard memo so we only update when values actually change
  const __last = { wind: 1e9, rain: 1e9, hue: 1e9, sat: 1e9, bri: 1e9, sep: 1e9, veil: 1e9, flash: 1e9, cY: 1e9, fY: 1e9, nY: 1e9, fS: 1e9, nS: 1e9 };
  function changed(val, key, eps = 0.003){
    if (Math.abs((__last[key] ?? 0) - val) > eps){ __last[key] = val; return true; }
    return false;
  }

  /* ============ EARLY PHASE: hide floating ground immediately ==== */
  ScrollTrigger.create({
    trigger: sentinel,
    start:  "top bottom",
    end:    "top top",
    onEnter: () => {
      bridge.style.display = "block";
      veil.style.opacity   = "0.35";

      // hide ground & leaf/twig canvas
      gsap.set(SEL.forestGround, { autoAlpha: 0 });
      gsap.set("#leafCanvas",    { autoAlpha: 0, pointerEvents: "none" });
      window.__muteLeaves = true;

      // ensure lamps can appear later
      gsap.set(SEL.lampsSection, { autoAlpha: 1, yPercent: 0 });
    },
    onLeaveBack: () => {
      bridge.style.display = "none";
      veil.style.opacity   = "0";
      gsap.set(SEL.forestGround, { autoAlpha: 1 });
      gsap.set("#leafCanvas",    { autoAlpha: 1, pointerEvents: "none" });
      window.__muteLeaves = false;
    }
  });

  /* ======================== MAIN RELAY (PIN) ===================== */
  let st;
  function buildRelay(){
    if (st) st.kill();

    st = ScrollTrigger.create({
      trigger:  sentinel,
      start:    "top top",
      end:      "+=" + pxFromVH(DIALS.relayVH),
      pin:      true,
      scrub:    true,
      anticipatePin: 1,

      onEnter(){
        bridge.style.display = "block";
        gsap.set(SEL.forestGround, { autoAlpha: 0 });
      },

      onUpdate(self){
        const t  = self.progress; // 0..1
        const t1 = ease( clamp01((t - 0.00) / 0.25) ); // Beat 1
        const t2 = ease( clamp01((t - 0.25) / 0.35) ); // Beat 2
        const t3 = ease( clamp01((t - 0.60) / 0.25) ); // Beat 3

        /* ===== BEAT 1: hush & cool ===== */
        const cY = Math.round(DIALS.cloudPress * t1);
if (setCloudY && changed(cY, "cY", 0.5)) setCloudY(cY);

        const coolHue = DIALS.coolHue * t1;
        const coolSat = 1 - 0.22 * t1;  // 1 → 0.78
        const coolBri = 1 - 0.10 * t1;  // 1 → 0.90

        // update grade via CSS vars only when values move meaningfully
        if (tintEl){
          if (changed(coolHue, "hue", 0.2)) tintEl.style.setProperty("--grade-hue", `${coolHue}deg`);
          if (changed(coolSat, "sat", 0.01)) tintEl.style.setProperty("--grade-sat", String(coolSat));
          if (changed(coolBri, "bri", 0.01)) tintEl.style.setProperty("--grade-bri", String(coolBri));
          // sepia stays 0 in beat 1
          if (changed(0, "sep", 0.01)) tintEl.style.setProperty("--grade-sepia", "0");
        }

        gsap.to("#bg #stars, #stars", { opacity: 1 - t1, overwrite: "auto", duration: 0.1 });

        // soften rain a touch
        const RainSet = window.__rain?.setIntensity || window.__rainSetIntensity;
        const rain1 = 1 - 0.25 * t1;
        if (typeof RainSet === "function"){
          if (changed(rain1, "rain", 0.02)) RainSet(rain1);
        } else {
          if (changed(rain1, "rain", 0.02)) document.documentElement.style.setProperty("--rainIntensity", String(rain1));
        }

        /* ===== BEAT 2: industry builds (camera push + wind shear) ===== */
       const fS = 1 + DIALS.pushScale * t2;
const nS = fS;
const fY = Math.round(DIALS.pushY * t2);
const nY = fY;

if (setFarS && changed(fS, "fS", 0.0008)) setFarS(fS);
if (setNearS && changed(nS, "nS", 0.0008)) setNearS(nS);
if (setFarY && changed(fY, "fY", 0.5))     setFarY(fY);
if (setNearY && changed(nY, "nY", 0.5))    setNearY(nY);

        const wind = DIALS.windShear * t2;
        if (changed(wind, "wind", 0.2)) window.__clouds?.setWind(wind);

        window.__smokeSetBoost?.({
          mult:  1 + 0.35 * t2,
          alpha: 0.15 * t2,
          height:0.08 * t2
        });

        /* ===== BEAT 3: warmth arrives ===== */
        const warmHue = DIALS.warmHue * t3;
        const sepia   = DIALS.sepiaMax * t3;
        const warmBri = (1 - 0.10) + 0.14 * t3; // 0.90 → ~1.04
        const satBack = (1 - 0.22) + 0.18 * t3; // 0.78 → 0.96
        const hueMix  = (DIALS.coolHue * t1) + warmHue;

        if (tintEl){
          if (changed(hueMix,  "hue", 0.2))  tintEl.style.setProperty("--grade-hue",   `${hueMix}deg`);
          if (changed(satBack, "sat", 0.01)) tintEl.style.setProperty("--grade-sat",   String(satBack));
          if (changed(warmBri, "bri", 0.01)) tintEl.style.setProperty("--grade-bri",   String(warmBri));
          if (changed(sepia,   "sep", 0.01)) tintEl.style.setProperty("--grade-sepia", String(sepia));
        }

        // veil base fades out with a small pulse around ~70–80%
       const pulse = Math.sin(Math.PI * clamp01((t - 0.64) / 0.16));
let veilOp = DIALS.veilBase * (1 - t) + Math.max(0, 0.16 * pulse);

// don’t render a near-zero gradient edge (prevents a faint line)
if (veilOp < 0.02) {
  if (changed(0, "veil", 0.01)) veil.style.opacity = "0";
  bridge.style.display = "none";
} else {
  bridge.style.display = "block";
  if (changed(veilOp, "veil", 0.01)) veil.style.opacity = String(veilOp);
}

        // two quick “electric” flashes
        const f1 = clamp01((t - 0.66) / 0.03);
        const f2 = clamp01((t - 0.76) / 0.03);
        const flashOp = DIALS.flashAmp * Math.max(Math.sin(f1 * Math.PI), Math.sin(f2 * Math.PI));
        if (changed(flashOp, "flash", 0.01)) flash.style.opacity = String(flashOp);

        // rain gently tapers as we warm
        const rain3 = 0.75 - 0.35 * t3;
        if (typeof RainSet === "function"){
          if (changed(rain3, "rain", 0.02)) RainSet(rain3);
        } else {
          if (changed(rain3, "rain", 0.02)) document.documentElement.style.setProperty("--rainIntensity", String(rain3));
        }
      },

      onLeave(){
        bridge.style.display = "none";
        veil.style.opacity   = "0";
        gsap.set(SEL.forestGround, { autoAlpha: 0 });
        ScrollTrigger.refresh();
      },

      onEnterBack(){
        bridge.style.display = "block";
        veil.style.opacity   = "0.25";
        gsap.set(SEL.forestGround, { autoAlpha: 1 });
      },

      onLeaveBack(){
        bridge.style.display = "none";
        veil.style.opacity   = "0";
        ScrollTrigger.refresh();
      },

      invalidateOnRefresh: true
    });
  }

  buildRelay();

  window.addEventListener("resize", () => {
    if (st){
      st.vars.end = "+=" + pxFromVH(DIALS.relayVH);
      st.refresh();
    }
  });
})();
