// mic-wind.js — Button appears everywhere EXCEPT Intro/Bridges/Outro.
// OFF label = action to enable; ON label = action to disable.
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

  // --- Wind + turbulence model (leaf personalities) ---
  (function(){
    function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
    const rng = mulberry32(0xC0FFEE);
    const rand = (a,b) => a + (b-a)*rng();

    function initLeaf(p){
      p.rVel = 0;
      p.bank = rand(-0.10, 0.10);
      p.wob1 = rand(0.015, 0.028);
      p.wob2 = rand(0.055, 0.095);
      p.amp1 = rand(4, 9);
      p.amp2 = rand(2, 6);
      p.liftBias  = rand(-0.25, 0.35);
      p.driftBias = rand(0.75, 1.35);
      p.riseChance= rand(0.00, 0.25);
      p.ph1 = rand(0, Math.PI*2);
      p.ph2 = rand(0, Math.PI*2);
      return p;
    }
    function sample(t){
      const s = Math.max(0, Math.min(1, (window.__breathEnv__||0)*1.1 + Math.max(0,(window.__breathFast__||0) - (window.__breathEnv__||0)*0.7)*1.2));
      return { turb:0.7 + 1.3*s, lift:1.0 + 0.8*s, size:1.0 + 0.25*s };
    }
    window.__WIND_MODEL__ = { initLeaf, sample };
  })();

  /* ------------ Noise gate with hysteresis (no idle wind drift) ----------- */
  let __gateActive = false;            // latched state
  const GATE_ON  = 0.12;               // stricter: need >12% env to turn "on"
  const GATE_OFF = 0.08;               // drop below 8% to turn "off"
  window.__micGateOn__ = () => __gateActive;

  // wind mapping thresholds
  const WIND_START = 0.20;             // breath must exceed this before wind moves
  const DEAD_BAND  = 0.06;             // snap tiny horizontal drift to 0
  const DECAY_ZERO = 0.55;             // faster decay when target is 0
  const DECAY_MOVE = 0.70;             // normal easing when moving

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

    /* ---- Noise gate + hysteresis ---- */
    if (!__gateActive && breathEnv > GATE_ON)  __gateActive = true;
    if (__gateActive  && breathEnv < GATE_OFF) __gateActive = false;

    // UI meter shows gated env (idle looks idle)
    const gatedEnv  = __gateActive ? (breathEnv - GATE_OFF) / (1 - GATE_OFF) : 0;
    const cleanEnv  = Math.max(0, Math.min(1, gatedEnv));
    window.windGate = function windGate(){
  // 1 when breath is active, 0 when the gate is closed (idle)
  return gatedEnv > 0 ? 1 : 0;
};
    try { meterSet(cleanEnv); } catch {}

    // Ambient sound follows gated env
    setWindVolume(0.10 + cleanEnv * 0.95);

    // --- Wind mapping: nothing below WIND_START, square curve above it
    let targetWind = 0;
    if (__gateActive) {
      const norm = (cleanEnv > WIND_START) ? (cleanEnv - WIND_START) / (1 - WIND_START) : 0;
      targetWind = 0.85 * (norm * norm); // square for softer low end
    }

    // lerp with faster collapse to zero
    const k = (targetWind === 0) ? DECAY_ZERO : DECAY_MOVE;
    window.__WIND__.x = lerp(window.__WIND__.x || 0, targetWind, k);
    if (Math.abs(window.__WIND__.x) < DEAD_BAND) window.__WIND__.x = 0;

    // Litter / Smoke hooks (safe if not present)
    window.__litterSetWind && window.__litterSetWind(window.__WIND__.x * 1.8, Math.max(0, cleanEnv - 0.25));
    window.__smokeSetWind  && window.__smokeSetWind (window.__WIND__.x * 8.0);

    // Rain drift (optional): gently tilt rain by current wind
    if (window.__rain && window.__rain.setWind) {
      window.__rain.setWind((window.__WIND__.x || 0) * 260);
    }

    // Burst detection on original signals
    if (!window.__breathPrev__) window.__breathPrev__ = 0;
    const delta   = breathEnv - window.__breathPrev__;
    window.__breathPrev__ = breathEnv;
    const gust = Math.max(0, breathFast - breathEnv * 0.7);
    const isBurst = delta > 0.10 || breathFast > 0.65;
    if (isBurst) {
      window.__litterBurst && window.__litterBurst(0.9 + (gust * 0.8));
      if (window.__rain && window.__rain.setWind) {
        window.__rain.setWind((window.__WIND__.x || 0) * 320);
      }
      if (window.__smokeSetBoost) {
        const boost = { mult:1.8, speed:1.4, spread:1.2, wind:1.3, alpha:0.15, lift:1.1 };
        window.__smokeSetBoost(boost);
        setTimeout(() => {
          const back = {
            mult: 1.0 + breathEnv * 1.8 + Math.max(0, (breathFast - breathEnv * 0.7)) * 0.8,
            speed: 1.0 + breathEnv * 1.3,
            lift:  1.0 + breathEnv * 0.9,
            size:  1.0 + breathEnv * 0.35,
            wind:  1.0 + breathEnv * 1.2,
            alpha: Math.min(0.9, 0.20 + breathEnv * 0.6),
            height:Math.min(0.82, 0.30 + breathEnv * 0.45)
          };
          window.__smokeSetBoost && window.__smokeSetBoost(back);
        }, 180);
      }
    }

    // Trees sway (only when gate is ON and above wind start)
    if (__gateActive && cleanEnv > WIND_START && window.__treesMicSway__) {
      const hz = 0.35 + 0.45 * cleanEnv;
      window.__breathPhase__ += hz * (1/60);
      const phase = Math.sin(window.__breathPhase__ * Math.PI * 2);
      window.__treesMicSway__((0.5 + 0.5 * phase) * cleanEnv * 3.0);
    }

    // Leaves response (gate aware). Idle → explicit 0 and bleed off vx a bit.
    if (__gateActive && window.__leavesMicResponse__) {
      const leafStrength = clamp01(cleanEnv * 1.2 + Math.max(0, breathFast - breathEnv * 0.7) * 1.8);
      window.__leavesMicResponse__(leafStrength);
    } else {
      window.__leavesMicResponse__ && window.__leavesMicResponse__(0);
      bleedLeavesFriction(0.88); // gently damp any leftover sideways motion
    }

    rafId = requestAnimationFrame(analyse);
  }

  // Gentle friction on leaves when idle (no change needed in forest code)
  function bleedLeavesFriction(f=0.88){
    const refs = window.__leafRefs__;
    if (!refs) return;
    const { settled = [], falling = [] } = refs;
    for (let i=0; i<falling.length; i++){ const p = falling[i]; if (p) p.vx *= f; }
    for (let i=0; i<settled.length; i++){ const p = settled[i]; if (p) p.vx *= f; }
  }

  // Per-leaf asymmetric breath push (breaks “in-line” marching)
  window.__leavesMicResponse__ = (strength = 0) => {
    const refs = window.__leafRefs__;
    if (!refs) return;
    const { settled = [], falling = [] } = refs;

    if (strength > 0.02) {
      window.__wakeAllUntil = performance.now() + 300;
    }

    const IMP  = 2.8 * strength;  // impulse sideways
    const LIFT = 0.60 * strength; // upward
    const SPIN = 0.16 * strength; // rotation

    const h1 = s => {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
    const dirFrom = v => (v < 0.16 ? -1 : 1); // ~16% go left on gusts

    // Kick resting leaves
    for (let i = 0; i < settled.length; i++) {
      const p = settled[i]; if (!p) continue;
      const id = p.id || String(i);
      const a  = h1(id);
      const b  = h1(id + "b");
      const c  = h1(id + "c");

      const dir   = dirFrom(a);
      const sideK = 0.6 + 1.4 * b;
      const liftK = 0.3 + 1.2 * c;
      const k = Math.max(0.25, strength);

      p.vx   += dir * (0.35 + Math.random() * 0.9) * IMP * sideK * k;
      p.vy   -= (0.25 + Math.random()) * LIFT * liftK * k;
      p.rVel += (Math.random() - 0.5) * SPIN * (0.6 + 0.8 * a);
      p.air   = true;
    }

    // Push falling leaves
    for (let i = 0; i < falling.length; i++) {
      const p = falling[i]; if (!p) continue;
      const id = p.id || String(i);
      const a  = h1(id + "x");
      const b  = h1(id + "y");

      const dir   = dirFrom(a);
      const sideK = 0.6 + 1.4 * b;
      const k = Math.max(0.25, strength);

      p.vx   += dir * (0.25 + Math.random() * 0.7) * IMP * sideK * k;
      p.rVel += (Math.random() - 0.5) * SPIN * (0.5 + 0.9 * a);
    }
  };

  async function enableMic(btn){
    // Toggle OFF (→ "Share your breath")
    if (enabled) {
      if (window.__rain && window.__rain.setWind) window.__rain.setWind(0);

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
        setButtonLabel(btn, false);
        clickPulseOff(btn);
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
        setButtonLabel(btn, true);
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
    btn.classList.remove('exhale'); btn.offsetHeight; // restart
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

  const hardHide = () => { btn.style.display = "none"; btn.style.pointerEvents = "none"; };
  const hardShow = () => { btn.style.display = "inline-flex"; };

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

  const EXCLUDED_SEL = ["#landing", "#bridge", "#bridgeFade", "#outro"];
  let EXCLUDED = [];
  const requeryExcluded = () => {
    EXCLUDED = EXCLUDED_SEL.map(s => document.querySelector(s)).filter(Boolean);
  };
  requeryExcluded();

  const visibleExcluded = new Set();
  let shown = false;

  function evaluate() {
    const mustHide = visibleExcluded.size > 0 || window.scrollY < 1;
    if (mustHide) {
      if (shown) {
        window.__micWind__?.disable();
        slideOut();
        shown = false;
      } else {
        hardHide();
      }
      return;
    }
    if (!shown) {
      slideIn();
      shown = true;
    }
  }

  function attachIO() {
    if (!('IntersectionObserver' in window)) {
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
    }, { root: null, rootMargin: '0px', threshold: [0, 0.001, 0.01, 0.1, 1] });

    EXCLUDED.forEach(el => io.observe(el));

    requestAnimationFrame(evaluate);

    let guardFrames = 60;
    const guard = () => {
      evaluate();
      if (--guardFrames > 0) requestAnimationFrame(guard);
    };
    requestAnimationFrame(guard);

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
