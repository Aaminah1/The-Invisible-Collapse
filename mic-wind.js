// mic-wind.js
// --- debug meter ---
const meter = document.createElement('div');
meter.style.cssText = `
  position:fixed; left:16px; bottom:16px; width:160px; height:10px;
  background:rgba(255,255,255,.15); border-radius:6px; overflow:hidden;
  z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,.25)`;
const fill = document.createElement('div');
fill.style.cssText = `height:100%; width:0%; background:#74f; transition:width .08s linear`;
meter.appendChild(fill);
document.body.appendChild(meter);
function meterSet(p){ fill.style.width = Math.round(p*100) + '%'; }




(() => {
  let ctx, analyser, source, rafId = 0, enabled = false;
  let baseline = 0.00;        // adaptive noise floor
  let smoothed = 0.0;         // smoothed breath strength 0..1
  const data = new Float32Array(2048);

  // simple helpers
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a,b,t) => a + (b-a)*t;

  // map current scene segment to max wind amplitude (match your gusts)
  function segFromProgress(p){
    if (p < 1/3) return 0; if (p < 2/3) return 1; return 2;
  }
  function maxWindForSeg(seg){
    // you used ~0.15 in seg0, ~0.45 in seg1, and 0 in seg2
    return seg === 0 ? 0.15 : seg === 1 ? 0.45 : 0.0;
  }

  function analyse() {
    if (!enabled || !analyser) return;

    analyser.getFloatTimeDomainData(data);

    // Center, then compute RMS (energy). Also high-pass-ish by subtracting mean.
    let mean = 0;
    for (let i = 0; i < data.length; i++) mean += data[i];
    mean /= data.length;

    let rms = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] - mean;
      rms += v * v;
    }
    rms = Math.sqrt(rms / data.length);

    // Update adaptive baseline (slowly)
    // baseline tracks ambient room noise so "quiet room" ≈ 0
    baseline = lerp(baseline, rms, 0.015);  

    // "Net" breath energy above baseline
    let net = rms - (baseline * 1.05);    // slight gate above baseline
    if (net < 0) net = 0;

    // Normalize to a rough expected mic range (tweakable)
    // Many built-in mics give rms 0.02..0.2 when blowing
    // scale so net=0.12 → strength~1
    const strength = clamp01(net / 0.04); 

    // Smooth it (fast attack, slow-ish release feels natural)
    const target = strength;
    const k = (target > smoothed) ? 0.35 : 0.12; // attack / release
    smoothed = lerp(smoothed, target, k);
meterSet(smoothed);    // Convert strength to wind + tree lean
    const p = window.__currentProgress || 0;
    // breath strength 'smoothed' is 0..1
// give a tiny floor so the world isn't dead silent
const baseAmbience = 0.06;          // ambience when not breathing
const breathBoost  = 0.9;           // how much breath adds
const vol = baseAmbience + smoothed * breathBoost;

// optional: fade out in Bare segment if you want "dead air"
const seg = segFromProgress(window.__currentProgress || 0);
const finalVol = (seg === 2) ? baseAmbience * 0.5 : vol;

setWindVolume(finalVol);

    const maxA = maxWindForSeg(seg);

    // dead air in bare stage
    const windX = maxA * smoothed;

    // Apply to your scene
    const WIND = window.__WIND__;
    if (WIND) {
      // soften injection so it doesn’t fight physics jitter
      WIND.x = lerp(WIND.x, windX, 0.55);
    }
    if (window.__treesMicSway__) {
      window.__treesMicSway__(smoothed * 1.5); 
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
    smoothed = 0;
    if (window.__WIND__) window.__WIND__.x = 0;
    btn && (btn.textContent = "🌬️ Enable Mic Wind");

    // Optionally fade wind out when disabling
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

    // ---- START/UNLOCK WIND AUDIO LOOP HERE ----
    // Use your real file path. Keep it short & seamless.
    await loadWindAudio("sounds/whoosh_soft.mp3"); // e.g. /audio/wind-loop.mp3
    if (windACtx && windACtx.state === "suspended") {
      await windACtx.resume();
    }
    // small ambient floor
    setWindVolume(0.06);

    // Kick off analysis
    enabled = true;
    baseline = 0.00; smoothed = 0.0;
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

  // Expose for debugging if you want
  window.__micWind__ = { enable: () => {
    const btn = document.getElementById("micWindBtn");
    return enableMic(btn);
  }};
})();
// --- wind audio (loop with gain) ---
let windACtx, windGain, windSrc, windReady = false;

async function loadWindAudio(url = "audio/wind-loop.mp3") {
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

// smooth volume set (0..1)
function setWindVolume(v){
  if (!windReady || !windACtx || !windGain) return;
  const now = windACtx.currentTime;
  const t = 0.08; // short ramp to avoid clicks
  windGain.gain.cancelScheduledValues(now);
  windGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), now + t);
}
