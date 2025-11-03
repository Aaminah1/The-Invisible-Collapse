// mic-wind.js  — CLEAN, REVERTED: breath → trees + leaves only (no smoke hooks)

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
  const t = 0.08; // short ramp to avoid clicks
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

  // Best-effort permissions hint
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const st = await navigator.permissions.query({ name: "microphone" });
      if (st.state === "denied") {
        throw new Error("Microphone permission is blocked. Click the padlock → Site settings → Allow Microphone, then reload.");
      }
    }
  } catch { /* ignore */ }

  // Enumerate to detect mics (may still be empty before first prompt on some browsers)
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const hasMic = devs.some(d => d.kind === "audioinput");
    if (!hasMic) console.warn("No audioinput devices visible (this can change after the first permission prompt).");
  } catch { /* ignore */ }
}

function explainGetUserMediaError(err) {
  const name = (err && (err.name || err.code)) || "Error";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Mic access was denied. Use the padlock → Site settings → Microphone → Allow, then reload.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Plug one in or enable it in OS settings.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is busy or unavailable. Close other apps using the mic and try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "The requested audio constraints aren’t supported by this device.";
  }
  if (name === "SecurityError") {
    return "Blocked by browser security policy. Ensure HTTPS/localhost and allow mic.";
  }
  return (err && err.message) ? err.message : "Unknown microphone error.";
}

/* ===================== Main mic logic (trees + leaves only) ===================== */
(() => {
  let ctx, analyser, source, rafId = 0, enabled = false;
  let baseline = 0.00;
  const data = new Float32Array(2048);

  // shared breath state (read by other scripts if needed)
  if (window.__breathEnv__   == null) window.__breathEnv__   = 0;  // slow envelope
  if (window.__breathFast__  == null) window.__breathFast__  = 0;  // fast gusts
  if (window.__breathPhase__ == null) window.__breathPhase__ = 0;  // tiny osc
  if (window.__WIND__        == null) window.__WIND__        = { x:0 }; // global wind field

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

    // Adaptive baseline (slightly quicker so small breaths register)
    baseline = lerp(baseline, rms, 0.03);

    // Net above baseline → sensitivity
    let net = rms - baseline * 1.02;
    if (net < 0) net = 0;

    // Smaller divisor = more sensitive (0.022–0.028 typical)
    const strengthRaw = clamp01(net / 0.024);

    // Two envelopes: slow env (trees) and fast gust (leaves)
    const envAttack  = 0.55, envDecay  = 0.20;
    const gustAttack = 0.85, gustDecay = 0.35;

    window.__breathEnv__  = lerp(window.__breathEnv__,  strengthRaw,
                                 strengthRaw > window.__breathEnv__  ? envAttack  : envDecay);
    window.__breathFast__ = lerp(window.__breathFast__, strengthRaw,
                                 strengthRaw > window.__breathFast__ ? gustAttack : gustDecay);

    // Convenience locals (avoid undefineds)
    const breathEnv  = (window.__breathEnv__  || 0);
    const breathFast = (window.__breathFast__ || 0);

    // === Burst detection (CALCULATE FIRST, use later) ===
    if (!window.__breathPrev__) window.__breathPrev__ = 0;
    const delta   = breathEnv - window.__breathPrev__;
    window.__breathPrev__ = breathEnv;

    const gust    = Math.max(0, breathFast - breathEnv * 0.7);  // “pop” above slow env
    const isBurst = delta > 0.10 || breathFast > 0.65;

    // UI meter shows slow envelope
    try { meterSet(breathEnv); } catch {}

    // Optional wind sound ambience
    const baseAmbience = 0.10;
    const breathBoost  = 0.95;
    setWindVolume(baseAmbience + breathEnv * breathBoost);

    // Horizontal wind push for the world (used by trees/particles)
    const maxA  = 0.55;                  // master amplitude
    const windX = maxA * breathEnv;
    window.__WIND__.x = lerp(window.__WIND__.x || 0, windX, 0.65);

    // ---- LITTER: continuous wind + a little lift
    const litterWind = windX * 1.8;                    // gentle but visible
    const litterLift = Math.max(0, breathEnv - 0.25);  // lift only on stronger breath
    window.__litterSetWind && window.__litterSetWind(litterWind, litterLift);

    // ---- SMOKE: stronger mapping so it’s obvious
    const smokeWind = windX * 8.0;                     // bold drift
    window.__smokeSetWind && window.__smokeSetWind(smokeWind);

    // Continuous smoke boost based on envelopes
    const boost = {
      mult:   1.0 + breathEnv * 1.8 + Math.max(0, (breathFast - breathEnv * 0.7)) * 0.8,
      speed:  1.0 + breathEnv * 1.3,
      lift:   1.0 + breathEnv * 0.9,
      size:   1.0 + breathEnv * 0.35,
      wind:   1.0 + breathEnv * 1.2,
      alpha:  Math.min(0.9, 0.20 + breathEnv * 0.6),
      height: Math.min(0.82, 0.30 + breathEnv * 0.45)
    };
    window.__smokeSetBoost && window.__smokeSetBoost(boost);

    // One-shot bursts for litter & smoke on sharp onset
    if (isBurst) {
      const burstPower = 0.9 + (gust * 0.8); // 0.9..1.7 typical
      window.__litterBurst && window.__litterBurst(burstPower);

      if (window.__smokeSetBoost) {
        const burst = { mult:1.8, speed:1.4, spread:1.2, wind:1.3, alpha:0.15, lift:1.1 };
        window.__smokeSetBoost(burst);
        setTimeout(() => window.__smokeSetBoost && window.__smokeSetBoost(boost), 180);
      }
    }

    // Slow, obvious tree sway tied to breath (phasey)
    if (window.__treesMicSway__) {
      const amp  = 1.9;                // exaggeration for visibility
      const baseHz = 0.35, addHz = 0.45;
      const hz = baseHz + addHz * breathEnv;
      window.__breathPhase__ += hz * (1/60);      // ~per-frame increment
      const phase = Math.sin(window.__breathPhase__ * Math.PI * 2);
      const sway = (0.5 + 0.5 * phase) * breathEnv * amp;
      window.__treesMicSway__(sway);
    }

    // Kick ALL leaves with env + gust
    if (window.__leavesMicResponse__) {
      const leafStrength = clamp01(breathEnv * 1.2 + gust * 1.8);
      window.__leavesMicResponse__(leafStrength);
    }

    rafId = requestAnimationFrame(analyse);
  }

  async function enableMic(btn){
    // Toggle OFF
    if (enabled) {
      enabled = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      try { ctx && ctx.close && ctx.state !== "closed" && await ctx.close(); } catch(e){}
      ctx = analyser = source = null;

      // settle world (moved ABOVE return so it actually runs)
      try { window.meterSet && window.meterSet(0); } catch {}
      if (window.__WIND__) window.__WIND__.x = 0;
      setWindVolume(0);
      window.__litterSetWind && window.__litterSetWind(0, 0);
      window.__smokeSetWind  && window.__smokeSetWind(0);
      window.__smokeSetBoost && window.__smokeSetBoost(null);

      btn && (btn.textContent = "🌬️ Enable Mic Wind");
      return;
    }

    // Toggle ON
    try {
      await preflightMic();

      // resume previously created audio context (if any)
      if (window.windACtx && windACtx.state === "suspended") {
        await windACtx.resume();
      }

      // request mic
      const constraints = { audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        // Safari/iOS: retry simpler constraint
        if (e.name === "OverconstrainedError") {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw e;
        }
      }

      // analysis graph
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") { await ctx.resume(); }
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      // optional ambience
      await loadWindAudio("sounds/whoosh_soft.mp3");
      if (windACtx && windACtx.state === "suspended") { await windACtx.resume(); }
      setWindVolume(0.06);

      enabled = true;
      btn && (btn.textContent = "🛑 Disable Mic Wind");
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

  // tiny helper for console testing
  window.__micWind__ = { enable: () => {
    const btn = document.getElementById("micWindBtn");
    return enableMic(btn);
  }};  
})();
