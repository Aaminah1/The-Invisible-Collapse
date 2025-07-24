// =================== main.js ===================
gsap.registerPlugin(ScrollTrigger);

// ---------- CONSTANTS ----------
const SCROLL_LEN = 1400;
const STAGES     = ["full","mid1","mid2","bare"];

// Vortex state
let vortexActive = false;
let vortexTime   = 0;
let vortexDur    = 6;          // seconds
let vortexCenter = {x:0,y:0};
let _fogPulled = false;
let _blackout  = false;

// ---------- SKY FADE-IN (white → scene) ----------
gsap.to("#sky-wash", {
  opacity: 0,
  ease: "power2.out",
  scrollTrigger:{
    trigger: "#scene3",
    start: "top top",
    end:   "+=200",
    scrub: true
  }
});

// Sky block fades in when pinned arrives
gsap.fromTo("#sky", {opacity:0}, {
  opacity:1,
  duration:0.6,
  ease:"power2.out",
  scrollTrigger:{
    trigger:"#scene3",
    start:"top 85%",
    end:"top top",
    scrub:false
  }
});

// ---------- SKY GRADIENT TIMELINE ----------
const SKY_KEYS = [
  { top:"#f6d58a", mid:"#c8894f", bot:"#6b3f2b" }, // full
  { top:"#d6b06e", mid:"#a36a3e", bot:"#4c3226" }, // mid1
  { top:"#8a8a8a", mid:"#676767", bot:"#3a3a3a" }, // mid2
  { top:"#3c3c3c", mid:"#2a2a2a", bot:"#161616" }  // bare
];

const skyTL = gsap.timeline({
  scrollTrigger:{
    trigger:"#scene3",
    start:"top top",
    end:"+="+SCROLL_LEN,
    scrub:true
  }
});

for(let i=0;i<SKY_KEYS.length-1;i++){
  const t0 = i/(SKY_KEYS.length-1);
  const t1 = (i+1)/(SKY_KEYS.length-1);
  skyTL.to(":root", {
    "--sky-top": SKY_KEYS[i+1].top,
    "--sky-mid": SKY_KEYS[i+1].mid,
    "--sky-bot": SKY_KEYS[i+1].bot,
    duration: t1 - t0
  }, t0);
}

// ---------- FOG OPACITY & DRIFT ----------
skyTL.fromTo("#fog1", {opacity:0}, {opacity:0.30, duration:1}, 0.15);
skyTL.fromTo("#fog2", {opacity:0}, {opacity:0.45, duration:1}, 0.25);
skyTL.fromTo("#fog3", {opacity:0}, {opacity:0.55, duration:1}, 0.35);

// beef up last third
skyTL.to("#fog1", {opacity:0.55, filter:"blur(6px) brightness(0.9)"}, 0.66);
skyTL.to("#fog2", {opacity:0.75, filter:"blur(8px) brightness(0.8)"}, 0.66);
skyTL.to("#fog3", {opacity:0.95, filter:"blur(10px) brightness(0.7)"}, 0.66);

// tint overlay
skyTL.to(":root", {"--fog-tint":"rgba(0,0,0,0.25)"}, 0.66);
skyTL.to("#fogOverlay", {opacity:1}, 0.66);

// endless drift
document.querySelectorAll(".fog-layer").forEach((el,i)=>{
  const dir = i%2===0 ? -1 : 1;
  const dist= 1600*dir;
  const dur = 60 + i*15;
  gsap.to(el,{
    x:dist,
    duration:dur,
    repeat:-1,
    ease:"linear",
    modifiers:{ x: gsap.utils.unitize(v=>parseFloat(v)%1600) }
  });
});

// ---------- BUILD FOREST ----------
const TREE_CONFIGS = [
  { left:"12%", width:260 },
  { left:"24%", width:330 },
  { left:"38%", width:280 },
  { left:"52%", width:310 },
  { left:"66%", width:240 },
  { left:"80%", width:300 }
];

const SRC = {
  full:"images/Tree-Full.png",
  mid1:"images/Tree-Mid1.png",
  mid2:"images/Tree-Mid2.png",
  bare:"images/Tree-Bare.png"
};

const forestEl = document.getElementById("forest");
TREE_CONFIGS.forEach((cfg,i)=>{
  const g = document.createElement("div");
  g.className = "tree-group";
  g.id = "tree"+(i+1);
  g.style.left  = cfg.left;
  g.style.width = cfg.width+"px";

  STAGES.forEach(st=>{
    const img = document.createElement("img");
    img.className = "tree-img";
    img.dataset.stage = st;
    img.src = SRC[st];
    g.appendChild(img);
  });

  forestEl.appendChild(g);

  const firstImg = g.querySelector('[data-stage="full"]');
  const setH = ()=>{
    const scale = g.clientWidth / firstImg.naturalWidth;
    g.style.height = (firstImg.naturalHeight * scale)+"px";
  };
  firstImg.complete ? setH() : firstImg.addEventListener('load', setH);
});

// ---------- MASTER PIN ----------
ScrollTrigger.create({
  trigger:"#scene3",
  start:"top top",
  end:"+="+SCROLL_LEN,
  scrub:true,
  pin:true,
  pinSpacing:true,
  onUpdate: self => {
    fadeTrees(self.progress);

    // show/hide tractor button
    const btn = document.getElementById("tractorBtn");
    if (self.progress >= 0.92 && !vortexActive){
      btn.classList.add("show");
      btn.classList.remove("hidden");
    } else if(!vortexActive){
      btn.classList.remove("show");
      btn.classList.add("hidden");
    }
  }
});

function fadeTrees(p){
  const groups = gsap.utils.toArray(".tree-group");
  groups.forEach(group=>{
    const full = group.querySelector('[data-stage="full"]');
    const m1   = group.querySelector('[data-stage="mid1"]');
    const m2   = group.querySelector('[data-stage="mid2"]');
    const bare = group.querySelector('[data-stage="bare"]');

    gsap.set([full,m1,m2,bare], {opacity:0});

    if(p<0.333){
      const t = p/0.333;
      gsap.set(full,{opacity:1-t});
      gsap.set(m1,  {opacity:t});
    }else if(p<0.666){
      const t = (p-0.333)/0.333;
      gsap.set(m1,{opacity:1-t});
      gsap.set(m2,{opacity:t});
    }else{
      const t = (p-0.666)/0.334;
      gsap.set(m2, {opacity:1-t});
      gsap.set(bare,{opacity:t});
    }
  });
}

// ---------- CANVAS / LEAVES ----------
const canvas = document.getElementById("leaf-canvas");
const ctx    = canvas.getContext("2d");

function resizeCanvas(){
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ScrollTrigger.refresh();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let fall=[], settled=[], dust=[];
let lastState=-1;

const G=0.25, FRICTION=0.88, BOUNCE=0.3,
      ROT_FRICTION=0.97, ROT_KICK=0.25;

const rand=(a,b)=>a+Math.random()*(b-a);

// mouse shove
const mouse={x:-1,y:-1};
canvas.addEventListener("mousemove",e=>{
  const r=canvas.getBoundingClientRect();
  mouse.x=e.clientX-r.left; mouse.y=e.clientY-r.top;
});
canvas.addEventListener("mouseleave",()=>{mouse.x=-1;mouse.y=-1;});

// leaf pools
const leafPools   = {0:[1],1:[2],2:[3],3:[]};
const burstCounts = {0:3, 1:8, 2:12, 3:0};
const speedRanges = {0:[0.5,1],1:[1,2],2:[2,3],3:[1,1]};

// spawn leaves
function spawnLeaf(state, group){
  const pool = leafPools[state]||[];
  if(!pool.length) return;

  const id  = pool[Math.floor(Math.random()*pool.length)];
  const img = new Image(); img.src = `images/leaf_${id}.png`;

  const tb = group.getBoundingClientRect();
  const cb = canvas.getBoundingClientRect();

  const xMin = tb.left - cb.left + tb.width*0.2;
  const xMax = tb.left - cb.left + tb.width*0.8;
  const yMin = tb.top  - cb.top  + tb.height*0.05;
  const yMax = tb.top  - cb.top  + tb.height*0.35;

  const size = rand(18,36);
  const x    = rand(xMin,xMax);
  const y    = rand(yMin,yMax);

  const [minS,maxS] = speedRanges[state];
  const speed    = rand(minS,maxS);
  const rotSpeed = rand(-0.1,0.1);

  fall.push({
    img,x,y,size,
    speed,rot:0,rotSpeed,
    vx:0,vy:0,rVel:0,air:true,t:0,
    termVy:rand(1.6,2.6),
    dragY: rand(0.90,0.96),
    wobAmp1:rand(4,8),
    wobAmp2:rand(2,5),
    wobFreq1:rand(0.015,0.025),
    wobFreq2:rand(0.06,0.09),
    gustProb:rand(0.015,0.04)
  });
}

// dust
function spawnDust(group){
  const tb=group.getBoundingClientRect();
  const cb=canvas.getBoundingClientRect();
  dust.push({
    x:rand(tb.left-cb.left, tb.right-cb.left),
    y:rand(tb.top -cb.top , tb.bottom-cb.top),
    radius:rand(2,5),
    opacity:rand(0.25,0.4),
    speedX:rand(-0.6,0.6),
    speedY:rand(1.5,3)
  });
}

// make particle airborne again
function airborne(p){ p.air=true; if(p.t===undefined)p.t=0; }

function loop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // ==== SETTLED LEAVES ====
  settled.forEach(p=>{
    if(p.vx===undefined){
      p.vx=0;p.vy=0;p.rVel=0;p.air=false;p.t=0;
      p.termVy=rand(1.6,2.6);p.dragY=rand(0.90,0.96);
      p.wobAmp1=rand(4,8);p.wobAmp2=rand(2,5);
      p.wobFreq1=rand(0.015,0.025);p.wobFreq2=rand(0.06,0.09);
      p.gustProb=rand(0.015,0.04);
    }
    const half=p.size/2, ground=canvas.height-half;

    // mouse shove
    if(mouse.x>=0){
      const dx=p.x-mouse.x, dy=p.y-mouse.y, d=Math.hypot(dx,dy);
      if(d<60){
        const f=(60-d)/60*3;
        p.vx+=(dx/d)*f; p.vy+=(dy/d)*f-0.5;
        p.rVel+=(Math.random()-0.5)*ROT_KICK*f;
        airborne(p);
      }
    }

    // vortex force?
    if(vortexActive){
      applyVortex(p);
    }

    if(p.air||p.y<ground-1){
      p.t++;
      p.vy+=G*0.6; p.vy*=p.dragY; if(p.vy>p.termVy)p.vy=p.termVy;
      if(Math.random()<p.gustProb)p.vy-=rand(0.3,0.7);

      const wob=Math.sin(p.t*p.wobFreq1)*p.wobAmp1 +
                 Math.sin(p.t*p.wobFreq2)*p.wobAmp2;
      const sf=Math.min(Math.abs(p.rVel)*20,1);
      p.x+=p.vx + wob*0.02*(0.4+sf);
      p.y+=p.vy;

      p.rVel*=ROT_FRICTION;
      p.rot+=p.rVel;

      if(p.y>ground){
        p.y=ground;
        if(Math.abs(p.vy)>0.4){
          p.vy*=-0.35; p.vx*=0.7;
          p.rVel+=(Math.random()-0.5)*0.12;
        }else{
          p.vy=0;p.air=false;
          if(Math.abs(p.rVel)<0.01)p.rVel=0;
        }
      }
    }else{
      p.vx*=FRICTION; p.vy*=FRICTION;
      p.rVel*=ROT_FRICTION;
      p.y=ground;
    }

    // walls
    if(p.x<half){p.x=half;p.vx*=-BOUNCE;p.rVel+=(Math.random()-0.5)*0.2;}
    if(p.x>canvas.width-half){p.x=canvas.width-half;p.vx*=-BOUNCE;p.rVel+=(Math.random()-0.5)*0.2;}

    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.drawImage(p.img,-half,-half,p.size,p.size);
    ctx.restore();
  });

  // ==== FALLING LEAVES ====
  const still=[];
  fall.forEach(p=>{
    p.t++;

    if(p.termVy===undefined){
      p.termVy=rand(1.6,2.6);p.dragY=rand(0.90,0.96);
      p.wobAmp1=rand(4,8);p.wobAmp2=rand(2,5);
      p.wobFreq1=rand(0.015,0.025);p.wobFreq2=rand(0.06,0.09);
      p.gustProb=rand(0.015,0.04);
    }

    // vortex force?
    if(vortexActive){
      applyVortex(p);
    }

    p.vy=(p.vy||0)+G*0.6; p.vy*=p.dragY;
    if(p.vy>p.termVy)p.vy=p.termVy;
    if(Math.random()<p.gustProb)p.vy-=rand(0.3,0.7);

    const wob=Math.sin(p.t*p.wobFreq1)*p.wobAmp1 +
               Math.sin(p.t*p.wobFreq2)*p.wobAmp2;
    const sf=Math.min(Math.abs(p.rotSpeed)*20,1);
    const drawX=p.x + wob*(0.02*(0.4+sf));

    p.y+=(p.speed||0)+p.vy;
    p.rot+=p.rotSpeed;

    if(p.y<canvas.height-p.size/2){
      still.push(p);
      ctx.save(); ctx.translate(drawX,p.y); ctx.rotate(p.rot);
      ctx.drawImage(p.img,-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
    }else{
      const half=p.size/2;
      p.y=canvas.height-half;
      p.vx=(Math.random()-0.5)*1.5;
      p.vy=-Math.random()*2;
      p.rVel=(Math.random()-0.5)*0.3;
      p.air=true;
      settled.push(p);
    }
  });
  fall=still;

  // DUST
  dust = dust.filter(d=>d.opacity>0);
  dust.forEach(d=>{
    d.x+=d.speedX; d.y+=d.speedY; d.opacity-=0.003;
    ctx.beginPath();
    ctx.arc(d.x,d.y,d.radius,0,Math.PI*2);
    ctx.fillStyle=`rgba(140,140,140,${d.opacity})`;
    ctx.fill();
  });

  // Vortex timers & collapse
  if(vortexActive){
    vortexTime += 1/60;

    if(vortexTime > vortexDur*0.5 && !_fogPulled){
      _fogPulled = true;
      gsap.to(".fog-layer", {
        duration:2,
        x: vortexCenter.x - window.innerWidth/2,
        y: vortexCenter.y - window.innerHeight,
        scale:0.2,
        opacity:0.4,
        ease:"power2.in"
      });
      gsap.to(".tree-group", {
        duration:2.2,
        x: vortexCenter.x - window.innerWidth*0.5,
        y: vortexCenter.y - window.innerHeight*0.6,
        scale:0,
        opacity:0,
        ease:"power2.in"
      });
    }

    if(vortexTime > vortexDur*0.8 && !_blackout){
      _blackout = true;
      gsap.to("#blackout", {
        opacity:1,
        duration:1.8,
        ease:"power2.inOut",
        onComplete(){
          const cta = document.getElementById("continueBtn");
          cta.classList.add("show");
        }
      });
    }
  }

  requestAnimationFrame(loop);
}
loop();

// apply vortex force
function applyVortex(p){
  const t = Math.min(vortexTime / vortexDur, 1);
  const attract = 0.002 + t * 0.02;
  const swirl   = 0.002 + t * 0.03;

  const dx = vortexCenter.x - p.x;
  const dy = vortexCenter.y - p.y;

  const perpX = -dy;
  const perpY =  dx;

  p.vx += dx*attract + perpX*swirl;
  p.vy += dy*attract + perpY*swirl;

  if(p.size) p.size *= (1 - t*0.003);
}

// ---------- Scroll bursts (leaves/dust) ----------
let lastScrollState = -1;

ScrollTrigger.create({
  trigger:"#scene3",
  start:"top top",
  end:"+="+SCROLL_LEN,
  scrub:true,
  onUpdate(self){
    const state = Math.min(3, Math.floor(self.progress * STAGES.length));
    if(state !== lastScrollState){
      const groups = gsap.utils.toArray(".tree-group");
      groups.forEach(g=>{
        const count = burstCounts[state]||0;
        for(let i=0;i<count;i++){
          setTimeout(()=>spawnLeaf(state, g), i*100);
        }
        if(state===3 && lastScrollState===2){
          for(let k=0;k<40;k++){
            setTimeout(()=>spawnDust(g), k*60);
          }
        }
      });
      lastScrollState = state;
    }
  }
});

// ---------- BUTTON HANDLERS ----------
document.getElementById("tractorBtn").addEventListener("click", ()=>{
  if(vortexActive) return;
  vortexActive = true;

  vortexCenter.x = canvas.width * 0.5;
  vortexCenter.y = canvas.height * 0.55;

  const btn = document.getElementById("tractorBtn");
  btn.classList.remove("show");
  btn.classList.add("hidden");

  gsap.to("#scene3", {x:2,y:-2,repeat:15,yoyo:true,duration:0.05,ease:"none"});
});

document.getElementById("continueBtn").addEventListener("click", ()=>{
  // change this to whatever you want
  const scene4 = document.getElementById("scene4");
  if(scene4){
    scene4.scrollIntoView({behavior:"smooth"});
  }else{
    console.log("Add your scene4 action here.");
  }
});
