// mic-wind.js  — breath-driven wind (trees + leaves) with audio + debug meter

/* ---------- tiny debug meter (bottom-left) ---------- */
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
  window.__meterSet__ = (p)=>{ fill.style.width = Math.round(p*100) + '%'; };
})();

/* ---------- wind audio (short loop with gain) ---------- */
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

/* ---------- main mic logic ---------- */
(() => {
  let ctx, analyser, source, rafId = 0, enabled = false;
  let baseline = 0.00;                 // adaptive noise floor
  const data = new Float32Array(2048);

  // helpers
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a,b,t) => a + (b-a)*t;

  // per-scene segment mapping (kept for your existing progress logic)
  function segFromProgress(p){
    if (p < 1/3) return 0; if (p < 2/3) return 1; return 2;
  }

  // state shared with other scripts (trees/leaves will read these)
  if (window.__breathEnv__  == null) window.__breathEnv__  = 0;  // slow envelope
  if (window.__breathFast__ == null) window.__breathFast__ = 0;  // fast gusts
  if (window.__breathPhase__== null) window.__breathPhase__= 0;  // internal osc

  // ---- ANALYSIS LOOP ----
  function analyse() {
    if (!enabled || !analyser) return;

    analyser.getFloatTimeDomainData(data);

    // 1) center + RMS
    let mean = 0;
    for (let i = 0; i < data.length; i++) mean += data[i];
    mean /= data.length;

    let rms = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] - mean;
      rms += v * v;
    }
    rms = Math.sqrt(rms / data.length);

    // 2) adaptive baseline (slightly quicker so tiny breaths register)
    baseline = lerp(baseline, rms, 0.025);

    // 3) net breath above baseline
    let net = rms - (baseline * 1.02);
    if (net < 0) net = 0;

    // 4) sensitivity — smaller divisor => stronger response
    //    Tweak this one value if you want everything to react more/less:
    const strengthRaw = clamp01(net / 0.030); // (0.028 default-ish, 0.022 stronger)

    // 5) two time-constants: envelope (slow) + gusts (fast)
    const envAttack  = 0.50, envDecay  = 0.06;
    const gustAttack = 0.75, gustDecay = 0.30;

    {
      const target = strengthRaw;
      const k = (target > window.__breathEnv__) ? envAttack : envDecay;
      window.__breathEnv__ = lerp(window.__breathEnv__, target, k);
    }
    {
      const target = strengthRaw;
      const k = (target > window.__breathFast__) ? gustAttack : gustDecay;
      window.__breathFast__ = lerp(window.__breathFast__, target, k);
    }

    // debug meter shows the smooth envelope
    window.__meterSet__ && window.__meterSet__(window.__breathEnv__);

    // 6) audio volume
    const baseAmbience = 0.10;
    const breathBoost  = 0.95;
    const p   = window.__currentProgress || 0;
    const seg = segFromProgress(p);
    const vol = baseAmbience + window.__breathEnv__ * breathBoost;
    const finalVol = (seg === 2) ? baseAmbience * 0.6 : vol;
    setWindVolume(finalVol);

    // 7) horizontal wind push (optional global for physics etc.)
    const maxA0 = 0.20, maxA1 = 0.55; // seg 0/1
    const maxA  = seg === 0 ? maxA0 : seg === 1 ? maxA1 : 0.05;
    const windX = maxA * window.__breathEnv__;
    if (window.__WIND__) { window.__WIND__.x = lerp(window.__WIND__.x || 0, windX, 0.60); }

    // 8) trees sway — phasey + envelope (more obvious)
    if (window.__treesMicSway__) {
      const swayAmp = 2.6;                 // exaggeration factor
      const baseHz = 0.40, addHz = 0.55;   // slightly snappier than before
      window.__breathPhase__ += (baseHz + addHz * window.__breathEnv__) * (1/60);
      const phase = Math.sin(window.__breathPhase__ * Math.PI * 2);
      const sway = (0.5 + 0.5 * phase) * window.__breathEnv__ * swayAmp;
      window.__treesMicSway__(sway);
    }

    // 9) leaves — gusts + envelope
    if (window.__leavesMicResponse__) {
      const gust = Math.max(0, window.__breathFast__ - (window.__breathEnv__ * 0.7));
      const leafStrength = clamp01(window.__breathEnv__ * 1.2 + gust * 1.8);
      window.__leavesMicResponse__(leafStrength);
    }

    rafId = requestAnimationFrame(analyse);
  }

  // ---- enable/disable mic ----
  async function enableMic(btn){
    // Toggle OFF
    if (enabled) {
      enabled = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      try { ctx && ctx.close && ctx.state !== "closed" && await ctx.close(); } catch(e){}
      ctx = analyser = source = null;
      if (window.__WIND__) window.__WIND__.x = 0;
      btn && (btn.textContent = "🌬️ Enable Mic Wind");
      setWindVolume(0);
      return;
    }

    // Toggle ON
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }
      });

      ctx = new (window.AudioContext || window.webkitAudioContext)();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      await loadWindAudio("sounds/whoosh_soft.mp3");
      if (windACtx && windACtx.state === "suspended") {
        await windACtx.resume();
      }
      setWindVolume(0.06); // small floor

      enabled = true;
      btn && (btn.textContent = "🛑 Disable Mic Wind");
      analyse();
    } catch (err) {
      console.error("Mic error:", err);
      alert("Couldn’t access the microphone. Check permissions/HTTPS.");
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

  // quick dev hook
  window.__micWind__ = {
    enable: () => {
      const btn = document.getElementById("micWindBtn");
      return enableMic(btn);
    }
  };
})();
