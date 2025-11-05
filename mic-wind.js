// mic-wind.js — Button appears everywhere EXCEPT Intro/Bridges/Outro.
// Slides in after Intro; slides out on #bridge, #bridgeFade, #outro.
// Labels are ACTION-based:
//   OFF: "🌬️ Share your breath"  (click → enable)
//   ON : "🛑 Withdraw breath"     (click → disable)
// When ON, title shows: "Breath is shaping this moment".

/* ===================== Debug meter (bottom-left) ===================== */
(() => {
  const meter = document.createElement('div');
  meter.style.cssText = `
    position:fixed; left:16px; bottom:16px; width:160px; height:10px;
    background:rgba(255,255,255,.15); border-radius:6px; overflow:hidden;
    z-index:9998; box-shadow:0 4px 16px rgba(0,0,0,.25)`;
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

/* ===================== Main mic logic (trees + leaves only) ===================== */
(() => {
  let ctx, analyser, source, rafId = 0, enabled = false;
  let micStream = null;
  let baseline = 0.00;
  const data = new Float32Array(2048);

  // shared breath state
  if (window.__breathEnv__   == null) window.__breathEnv__   = 0;
  if (window.__breathFast__  == null) window.__breathFast__  = 0;
  if (window.__breathPhase__ == null) window.__breathPhase__ = 0;
  if (window.__WIND__        == null) window.__WIND__        = { x:0 };

  // public on/off state
  window.__micWindState__ = { isOn:false };

  // labels (ACTION-based)
  const MIC_LABELS = {
    enable: "🌬️ Share your breath",
    disable: "🛑 Withdraw breath",
    activeTitle: "Breath is shaping this moment",
    withdrawnNote: "Breath withdrawn"
  };

  // util
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp    = (a,b,t) => a + (b-a)*t;

function setButtonLabel(btn, isOn){
  if (!btn) return;
  const inner = ensureMicInner(btn);
  inner.textContent = isOn ? MIC_LABELS.disable : MIC_LABELS.enable;
  btn.title = isOn ? MIC_LABELS.activeTitle : "";
  btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
  if (isOn) btn.setAttribute('data-on','1'); else btn.removeAttribute('data-on');
}

  function toastWithdrawn(){
    let toast = document.getElementById("micWithdrawnToast");
    if (!toast){
      toast = document.createElement("div");
      toast.id = "micWithdrawnToast";
      toast.style.cssText = `
        position:fixed; right:16px; bottom:72px; z-index:9999;
        padding:6px 10px; border-radius:10px;
        color:#dfe3ee; background:rgba(10,10,13,.82);
        border:1px solid rgba(255,255,255,.06);
        font:500 12px/1.2 system-ui; opacity:0; pointer-events:none;
        transform:translateY(6px)`;
      document.body.appendChild(toast);
    }
    toast.textContent = MIC_LABELS.withdrawnNote;

    if (window.gsap){
      gsap.killTweensOf(toast);
      gsap.set(toast, { opacity:0, y:6 });
      gsap.to(toast, { opacity:1, y:0, duration:.18, ease:"power2.out" });
      gsap.to(toast, { opacity:0, y:6, duration:.25, ease:"power2.in", delay:1.0 });
    } else {
      toast.style.opacity = "1";
      setTimeout(()=> toast.style.opacity="0", 1200);
    }
  }

  // click feel: compress → soft pulse
  function clickPulseOn(btn){
    if (!btn) return;
    if (window.gsap){
      const tl = gsap.timeline();
      tl.to(btn, { duration:0.12, ease:"power2.out", scale:0.985 }, 0)
        .to(btn, { duration:0.28, ease:"sine.out",  scale:1.0, boxShadow:"0 8px 28px rgba(0,0,0,.28)" }, 0.12)
        .to(btn, { duration:0.28, ease:"sine.out",  boxShadow:"0 6px 20px rgba(0,0,0,.25)" }, 0.12);
    } else {
      btn.style.transform = "scale(0.985)";
      setTimeout(()=> btn.style.transform = "scale(1.0)", 120);
    }
  }
  function clickPulseOff(btn){
    if (!btn) return;
    if (window.gsap){
      gsap.to(btn, { duration:0.18, ease:"power2.out", scale:0.995 })
          .to(btn, { duration:0.22, ease:"power2.inOut", scale:1.0 }, ">-0.06");
    } else {
      btn.style.transform = "scale(0.995)";
      setTimeout(()=> btn.style.transform = "scale(1.0)", 180);
    }
  }

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
    // Toggle OFF (→ "Share your breath")
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

      if (btn){
        setButtonLabel(btn, false); // OFF label = action to enable
        clickPulseOff(btn);
        // small toast so user knows they disabled
        toastWithdrawn();
      }

      try { if (windACtx && windACtx.state === "running") await windACtx.suspend(); } catch {}
      return;
    }

    // Toggle ON (→ "Withdraw breath")
    try {
      await preflightMic();

      if (window.windACtx && windACtx.state === "suspended") { await windACtx.resume(); }

      const constraints = { audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } };
      try { micStream = await navigator.mediaDevices.getUserMedia(constraints); }
      catch (e) {
        if (e.name === "OverconstrainedError") micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        else throw e;
      }

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

      if (btn){
        setButtonLabel(btn, true);   // ON label = action to disable
        clickPulseOn(btn);
      }

      analyse();
    } catch (err) {
      console.error("Mic error:", err);
      alert(explainGetUserMediaError(err));
    }
  }

function exhaleRipple(btn, evt){
  if (!btn) return;
  const inner = ensureMicInner(btn);
  const r = inner.getBoundingClientRect();
  const x = (evt?.clientX ?? (r.left + r.width*0.5)) - r.left;
  const y = (evt?.clientY ?? (r.top  + r.height*0.5)) - r.top;
  inner.style.setProperty('--pulse-x', x + 'px');
  inner.style.setProperty('--pulse-y', y + 'px');

  btn.classList.remove('exhale');     // restart
  // force reflow
  // eslint-disable-next-line no-unused-expressions
  btn.offsetHeight;
  btn.classList.add('exhale');
  setTimeout(()=> btn.classList.remove('exhale'), 480);
}

function ensureMicInner(btn){
  if (!btn) return null;
  let inner = btn.querySelector('.micInner');
  if (!inner){
    inner = document.createElement('span');
    inner.className = 'micInner';
    inner.textContent = btn.textContent || "";
    btn.textContent = "";
    btn.appendChild(inner);
  }
  return inner;
}

  function attachButton(){
  const btn = document.getElementById("micWindBtn");
  if (!btn) return;

  ensureMicInner(btn);
  setButtonLabel(btn, false);

  btn.addEventListener("click", (e) => {
    enableMic(btn);
    exhaleRipple(btn, e);
  });

  // Pointer feel (writes CSS var consumed by .micInner)
  const setScale = s => btn.style.setProperty('--btnScale', s);
  btn.addEventListener('pointerdown', () => setScale('.985'));
  btn.addEventListener('pointerup',   () => setScale('1'));
  btn.addEventListener('pointerleave',() => setScale('1'));
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

/* ===================== Visibility controller (strict: NO button in Intro/Bridges/Outro) ===================== */
(() => {
  const btn = document.getElementById("micWindBtn");
  if (!btn) return;

  // Hard hide helpers (avoid flicker)
  const hardHide = () => { btn.style.display = "none"; btn.style.pointerEvents = "none"; };
  const hardShow = () => { btn.style.display = "inline-flex"; };

  // Start fully hidden (prevents flash on Intro)
  hardHide();
  if (window.gsap) gsap.set(btn, { xPercent: 120, autoAlpha: 0 });

  const slideIn  = () => {
    hardShow();
    btn.style.pointerEvents = "auto";
    if (window.gsap) gsap.to(btn, { xPercent: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
    else { btn.style.opacity='1'; btn.style.transform='translateX(0)'; }
  };
  const slideOut = () => {
    if (window.gsap) {
      gsap.to(btn, {
        xPercent: 120, autoAlpha: 0, duration: 0.35, ease: "power2.in",
        onComplete: () => { btn.style.pointerEvents = "none"; hardHide(); }
      });
    } else {
      btn.style.opacity='0'; btn.style.transform='translateX(120%)';
      btn.style.pointerEvents='none'; hardHide();
    }
  };

  // Sections where the mic MUST NOT appear
  const EXCLUDED_SEL = ["#landing", "#bridge", "#bridgeFade", "#outro"];
  let EXCLUDED = [];

  // Make it resilient if those sections mount late
  const requeryExcluded = () => {
    EXCLUDED = EXCLUDED_SEL.map(s => document.querySelector(s)).filter(Boolean);
  };
  requeryExcluded();

  const visibleExcluded = new Set();
  let shown = false;

  // Decide show/hide based on whether ANY excluded is intersecting by even 1%
  function evaluate() {
    const mustHide =
      visibleExcluded.size > 0 ||
      window.scrollY < 1; // also hide if literally at top (landing edge cases)

    if (mustHide) {
      if (shown) {
        // Privacy: fully disable when entering excluded area
        window.__micWind__?.disable();
        slideOut();
        shown = false;
      } else {
        // ensure hard hidden from first paint
        hardHide();
      }
      return;
    }

    if (!shown) {
      slideIn();
      shown = true;
    }
  }

  // IntersectionObserver that treats ANY overlap as "visible"
  function attachIO() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: simple scroll check
      const inView = el => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        return Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) > 0;
      };
      const onScroll = () => {
        visibleExcluded.clear();
        EXCLUDED.forEach(el => { if (inView(el)) visibleExcluded.add(el.id || 'x'); });
        evaluate();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      onScroll();
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const key = e.target.id || e.target.getAttribute('aria-label') || 'excluded';
        if (e.isIntersecting && e.intersectionRatio > 0.001) {
          visibleExcluded.add(key);
        } else {
          visibleExcluded.delete(key);
        }
      });
      evaluate();
    }, {
      root: null,
      rootMargin: '0px',
      threshold: [0, 0.001, 0.01, 0.1, 1]
    });

    EXCLUDED.forEach(el => io.observe(el));

    // Initial pass (covers deep-links and first paint)
    requestAnimationFrame(evaluate);

    // Also enforce for the first second to beat any pin/scrub race
    let guardFrames = 60;
    const guard = () => {
      evaluate();
      if (--guardFrames > 0) requestAnimationFrame(guard);
    };
    requestAnimationFrame(guard);

    // If DOM mutates and sections appear later, re-observe them
    const mo = new MutationObserver(() => {
      const before = EXCLUDED.length;
      requeryExcluded();
      if (EXCLUDED.length !== before) {
        io.disconnect();
        EXCLUDED.forEach(el => io.observe(el));
        evaluate();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  attachIO();
})();

