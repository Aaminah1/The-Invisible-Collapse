// mic-wind.js — Mic stays visible across site except Intro/Bridges/Outro.
// Slides IN after Intro, stays ON across Forest/Lamps/City, slides OUT at #bridge, #bridgeFade, #outro.
// Also auto-disables when hidden (privacy), but never auto-toggles between allowed sections.

/* ===================== Debug meter (bottom-left) ===================== */
(() => {
  const meter = document.createElement('div');
  meter.style.cssText = `
    position:fixed; left:16px; bottom:16px; width:160px; height:10px;
    background:rgba(255,255,255,.15); border-radius:6px; overflow:hidden;
    z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,.25)`;
  const fill = document.createElement('div');
  fill.style.cssText = `height:100%; width:0%; background:#74f; transition:width .08s linear`;
  meter.appendChild(fill);
  document.body.appendChild(meter);
  window.meterSet = (p) => { fill.style.width = Math.round(p*100) + '%'; };
})();

/* ===================== Optional wind audio loop ===================== */
let windACtx, windGain, windSrc, windReady = false;

async function loadWindAudio(url = "sounds/whoosh_soft.mp3") {
  try {
    windACtx = windACtx || new (window.AudioContext || window.webkitAudioContext)();
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audioBuf = await windACtx.decodeAudioData(buf);

    windGain = windACtx.createGain();
    windGain.gain.value = 0.0;

    windSrc = windACtx.createBufferSource();
    windSrc.buffer = audioBuf;
    windSrc.loop = true;
    windSrc.connect(windGain).connect(windACtx.destination);
    windSrc.start(0);

    windReady = true;
  } catch (e) {
    console.warn("Wind audio failed to load:", e);
  }
}

function setWindVolume(v){
  if (!windReady || !windACtx || !windGain) return;
  const now = windACtx.currentTime;
  const t = 0.08;
  windGain.gain.cancelScheduledValues(now);
  windGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), now + t);
}

/* ===================== Mic permission pre-flight ===================== */
async function preflightMic() {
  if (!window.isSecureContext) {
    throw new Error("This page isn’t on HTTPS (or localhost). Browsers block the mic on insecure origins.");
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("MediaDevices or getUserMedia is unavailable in this browser/context.");
  }
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const st = await navigator.permissions.query({ name: "microphone" });
      if (st.state === "denied") {
        throw new Error("Microphone permission is blocked. Click the padlock → Site settings → Allow Microphone, then reload.");
      }
    }
  } catch {}
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const hasMic = devs.some(d => d.kind === "audioinput");
    if (!hasMic) console.warn("No audioinput devices visible (can change after first prompt).");
  } catch {}
}

function explainGetUserMediaError(err) {
  const name = (err && (err.name || err.code)) || "Error";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Mic access was denied. Allow mic in Site settings, then reload.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")   return "No microphone was found. Plug one in or enable it in OS settings.";
  if (name === "NotReadableError" || name === "TrackStartError")     return "The microphone is busy/unavailable. Close other apps using the mic.";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return "Requested audio constraints aren’t supported.";
  if (name === "SecurityError") return "Blocked by browser security policy. Ensure HTTPS/localhost and allow mic.";
  return (err && err.message) ? err.message : "Unknown microphone error.";
}

/* ===================== Main mic logic (trees + leaves only) ===================== */
(() => {
  let ctx, analyser, source, rafId = 0, enabled = false;
  let micStream = null;
  let baseline = 0.00;
  const data = new Float32Array(2048);

  // shared breath state (read by other scripts if needed)
  if (window.__breathEnv__   == null) window.__breathEnv__   = 0;
  if (window.__breathFast__  == null) window.__breathFast__  = 0;
  if (window.__breathPhase__ == null) window.__breathPhase__ = 0;
  if (window.__WIND__        == null) window.__WIND__        = { x:0 };

  // public on/off state
  window.__micWindState__ = { isOn:false };

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp    = (a,b,t) => a + (b-a)*t;

  function analyse() {
    if (!enabled || !analyser) return;

    analyser.getFloatTimeDomainData(data);

    // Center + RMS
    let mean = 0; for (let i = 0; i < data.length; i++) mean += data[i];
    mean /= data.length;

    let rms = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] - mean;
      rms += v * v;
    }
    rms = Math.sqrt(rms / data.length);

    // Adaptive baseline
    baseline = lerp(baseline, rms, 0.03);

    // Sensitivity
    let net = rms - baseline * 1.02;
    if (net < 0) net = 0;
    const strengthRaw = clamp01(net / 0.024);

    // Envelopes
    const envAttack  = 0.55, envDecay  = 0.20;
    const gustAttack = 0.85, gustDecay = 0.35;
    window.__breathEnv__  = lerp(window.__breathEnv__,  strengthRaw, strengthRaw > window.__breathEnv__  ? envAttack  : envDecay);
    window.__breathFast__ = lerp(window.__breathFast__, strengthRaw, strengthRaw > window.__breathFast__ ? gustAttack : gustDecay);

    const breathEnv  = (window.__breathEnv__  || 0);
    const breathFast = (window.__breathFast__ || 0);

    // Burst detection
    if (!window.__breathPrev__) window.__breathPrev__ = 0;
    const delta   = breathEnv - window.__breathPrev__;
    window.__breathPrev__ = breathEnv;
    const gust = Math.max(0, breathFast - breathEnv * 0.7);
    const isBurst = delta > 0.10 || breathFast > 0.65;

    // UI meter
    try { meterSet(breathEnv); } catch {}

    // Ambient sound
    setWindVolume(0.10 + breathEnv * 0.95);

    // Global wind push
    const windX = 0.55 * breathEnv;
    window.__WIND__.x = lerp(window.__WIND__.x || 0, windX, 0.65);

    // Litter / Smoke hooks (safe if not present)
    window.__litterSetWind && window.__litterSetWind(windX * 1.8, Math.max(0, breathEnv - 0.25));
    window.__smokeSetWind  && window.__smokeSetWind(windX * 8.0);

    const boost = {
      mult: 1.0 + breathEnv * 1.8 + Math.max(0, (breathFast - breathEnv * 0.7)) * 0.8,
      speed: 1.0 + breathEnv * 1.3,
      lift:  1.0 + breathEnv * 0.9,
      size:  1.0 + breathEnv * 0.35,
      wind:  1.0 + breathEnv * 1.2,
      alpha: Math.min(0.9, 0.20 + breathEnv * 0.6),
      height:Math.min(0.82, 0.30 + breathEnv * 0.45)
    };
    window.__smokeSetBoost && window.__smokeSetBoost(boost);

    if (isBurst) {
      window.__litterBurst && window.__litterBurst(0.9 + (Math.max(0, breathFast - breathEnv * 0.7) * 0.8));
      if (window.__smokeSetBoost) {
        const burst = { mult:1.8, speed:1.4, spread:1.2, wind:1.3, alpha:0.15, lift:1.1 };
        window.__smokeSetBoost(burst);
        setTimeout(() => window.__smokeSetBoost && window.__smokeSetBoost(boost), 180);
      }
    }

    // Trees sway + leaves
    if (window.__treesMicSway__) {
      const hz = 0.35 + 0.45 * breathEnv;
      window.__breathPhase__ += hz * (1/60);
      const phase = Math.sin(window.__breathPhase__ * Math.PI * 2);
      window.__treesMicSway__((0.5 + 0.5 * phase) * breathEnv * 1.9);
    }
    if (window.__leavesMicResponse__) {
      const leafStrength = clamp01(breathEnv * 1.2 + (Math.max(0, breathFast - breathEnv * 0.7)) * 1.8);
      window.__leavesMicResponse__(leafStrength);
    }

    rafId = requestAnimationFrame(analyse);
  }

  async function enableMic(btn){
    // Toggle OFF
    if (enabled) {
      enabled = false;
      window.__micWindState__.isOn = false;

      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;

      try { ctx && ctx.close && ctx.state !== "closed" && await ctx.close(); } catch(e){}
      ctx = analyser = source = null;

      try { if (micStream) micStream.getTracks().forEach(tr => tr.stop()); } catch {}
      micStream = null;

      try { window.meterSet && window.meterSet(0); } catch {}
      if (window.__WIND__) window.__WIND__.x = 0;
      setWindVolume(0);
      window.__litterSetWind && window.__litterSetWind(0, 0);
      window.__smokeSetWind  && window.__smokeSetWind(0);
      window.__smokeSetBoost && window.__smokeSetBoost(null);

      btn && (btn.textContent = "🌬️ Enable mic");
      try { if (windACtx && windACtx.state === "running") await windACtx.suspend(); } catch {}
      return;
    }

    // Toggle ON
    try {
      await preflightMic();

      if (window.windACtx && windACtx.state === "suspended") { await windACtx.resume(); }

      // request mic
      const constraints = { audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } };
      try { micStream = await navigator.mediaDevices.getUserMedia(constraints); }
      catch (e) {
        if (e.name === "OverconstrainedError") micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        else throw e;
      }

      // analysis graph
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") { await ctx.resume(); }
      source = ctx.createMediaStreamSource(micStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      await loadWindAudio("sounds/whoosh_soft.mp3");
      if (windACtx && windACtx.state === "suspended") { await windACtx.resume(); }
      setWindVolume(0.06);

      enabled = true;
      window.__micWindState__.isOn = true;
      btn && (btn.textContent = "🛑 Disable Mic");
      analyse();
    } catch (err) {
      console.error("Mic error:", err);
      alert(explainGetUserMediaError(err));
    }
  }

  function attachButton(){
    const btn = document.getElementById("micWindBtn");
    if (!btn) return;
    btn.addEventListener("click", () => enableMic(btn));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachButton);
  } else {
    attachButton();
  }

  window.__micWind__ = {
    enable: () => { const btn = document.getElementById("micWindBtn"); return enableMic(btn); },
    disable: async () => {
      if (window.__micWindState__?.isOn) {
        const btn = document.getElementById("micWindBtn");
        await enableMic(btn); // toggles OFF
      }
    },
    isOn: () => !!window.__micWindState__?.isOn
  };
})();

/* ===================== Visibility controller (strict: hide only on Intro/Bridges/Outro) ===================== */
(() => {
  const btn = document.getElementById("micWindBtn");
  if (!btn) return;

  // Start hidden until we pass the intro
  if (window.gsap) {
    gsap.set(btn, { xPercent: 120, autoAlpha: 0 });
  } else {
    btn.style.transform = 'translateX(120%)';
    btn.style.opacity = '0';
  }
  btn.style.pointerEvents = "none";

  const slideIn  = () => {
    btn.style.pointerEvents = "auto";
    if (window.gsap) gsap.to(btn, { xPercent: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
    else { btn.style.transform='translateX(0)'; btn.style.opacity='1'; }
  };
  const slideOut = () => {
    if (window.gsap) gsap.to(btn, {
      xPercent: 120, autoAlpha: 0, duration: 0.35, ease: "power2.in",
      onComplete: () => (btn.style.pointerEvents = "none")
    });
    else { btn.style.transform='translateX(120%)'; btn.style.opacity='0'; btn.style.pointerEvents='none'; }
  };

  // Sections where the mic MUST be hidden
  const EXCLUDED_SEL = ["#landing", "#bridge", "#bridgeFade", "#outro"];
  const EXCLUDED = EXCLUDED_SEL.map(s => document.querySelector(s)).filter(Boolean);

  // Track which excluded elements are currently onscreen (≥ 25% visible)
  const visibleExcluded = new Set();
  let visible = false;            // current visual state (do we think it's shown?)
  let forestSeenOnce = false;     // label hint the first time

  function evaluate() {
    const mustHide = visibleExcluded.size > 0;

    if (mustHide) {
      if (visible) {
        // Hide + disable mic so user isn't recorded in excluded areas
        window.__micWind__?.disable();
        btn.textContent = "🌬️ Enable mic";
        slideOut();
        visible = false;
      }
      return;
    }

    // Allowed area → show
    if (!visible) {
      // First time we leave intro into forest, nudge the CTA text
      const fr = document.querySelector("#forestReveal");
      if (!forestSeenOnce && fr) {
        const r = fr.getBoundingClientRect();
        const inView = r.bottom > 1 && r.top < (window.innerHeight || document.documentElement.clientHeight) - 1;
        if (inView && !window.__micWind__?.isOn()) {
          btn.textContent = "🌬️ Enable mic for Forest";
          forestSeenOnce = true;
        }
      }
      slideIn();
      visible = true;
    }
  }

  // IntersectionObserver is more reliable than multiple triggers with pins/scrub
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const id = e.target.id || e.target.getAttribute('aria-label') || 'excluded';
        if (e.isIntersecting && e.intersectionRatio >= 0.25) {
          visibleExcluded.add(id);
        } else {
          visibleExcluded.delete(id);
        }
      });
      evaluate();
    }, {
      root: null,
      rootMargin: '0px',
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });

    EXCLUDED.forEach(el => io.observe(el));

    // Initial pass (handles deep-linking past the intro)
    // If none are in view yet, show; else hide/disable.
    requestAnimationFrame(() => evaluate());
  } else {
    // Fallback: simple scroll check if IO isn't available
    const inView = (el) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      return vis >= vh * 0.25; // ~25% visible
    };
    const onScroll = () => {
      visibleExcluded.clear();
      EXCLUDED.forEach(el => { if (inView(el)) visibleExcluded.add(el.id); });
      evaluate();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  // Keep label synced after user toggles
  btn.addEventListener("click", () => {
    setTimeout(() => {
      if (window.__micWind__?.isOn()) {
        btn.textContent = "🛑 Disable Mic";
      } else {
        btn.textContent = forestSeenOnce ? "🌬️ Enable mic" : "🌬️ Enable mic for Forest";
      }
    }, 0);
  });
})();
