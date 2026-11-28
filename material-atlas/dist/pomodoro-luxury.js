// Luxury WebGL2 + High-DPI Canvas 2D stage engine for Pomodoro themes:
// 'shrine' | 'chronometer' | 'eclipse' | 'crystal'

const VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 1. Shrine Barrier: Urushi lacquer void, volumetric temple lantern god-rays, 8/16-fold sacred barrier caustics
const SHRINE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uPhase; // 0=launch, 1=complete, 2=zen
uniform float uRatio;
uniform float uSeconds;
out vec4 fragColor;

#define PI 3.14159265359

void main() {
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec2 p = (vUv - 0.5) * aspect * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);

  float isLaunch = 1.0 - step(0.5, uPhase);
  float isComplete = step(0.5, uPhase) * (1.0 - step(1.5, uPhase));
  float isZen = step(1.5, uPhase);

  // Urushi black lacquer & midnight-plum velvet backdrop
  vec3 lacquer = mix(vec3(0.032, 0.014, 0.024), vec3(0.105, 0.024, 0.032), exp(-r * 1.45));
  lacquer += vec3(0.16, 0.06, 0.03) * exp(-r * 2.8) * (0.4 + 0.6 * isComplete);

  // Volumetric temple lantern god-rays from center
  float rayA = sin(a * 8.0 + uTime * 0.16) * 0.5 + 0.5;
  float rayB = sin(a * 16.0 - uTime * 0.24) * 0.5 + 0.5;
  float rays = (pow(max(rayA, 1e-4), 3.0) * 0.65 + pow(max(rayB, 1e-4), 5.0) * 0.45) * exp(-r * 0.85);
  vec3 godRayCol = mix(vec3(0.88, 0.34, 0.22), vec3(0.98, 0.78, 0.42), rayB);

  // Rotating 8/16-fold luminous sacred barrier caustics
  float caustic = sin(r * 18.0 - uTime * 1.2 + sin(a * 8.0 + uTime * 0.3) * 1.8)
                * cos(a * 16.0 - r * 8.0 - uTime * 0.6);
  caustic = pow(max(caustic * 0.5 + 0.5, 1e-4), 4.0) * exp(-abs(r - 0.66) * 2.8);

  // Launch spiritual shockwave
  float shockR = clamp(uTime * 1.25, 0.0, 2.2);
  float shock = exp(-abs(r - shockR) * 28.0) * (1.0 - smoothstep(0.6, 1.8, uTime)) * isLaunch;

  // Complete sakura-gold blessing sunburst
  float burst = exp(-r * 1.9) * (0.55 + 0.45 * sin(uTime * 1.6)) * isComplete;

  // Zen calm breathing aura
  float zenHalo = exp(-abs(r - 0.68) * 16.0) * (0.5 + 0.35 * sin(uTime * 0.9)) * isZen;

  float rayBoost = 0.52 + 0.55 * isComplete + 0.25 * isLaunch;
  vec3 col = lacquer
    + godRayCol * rays * rayBoost * 0.58
    + vec3(0.98, 0.76, 0.42) * caustic * 0.52
    + vec3(1.0, 0.85, 0.54) * (shock * 1.45 + burst * 0.55 + zenHalo * 0.38);

  // Subtle vermilion-gold vignette
  col *= smoothstep(1.95, 0.28, r * 0.75);
  float alpha = 0.96;
  fragColor = vec4(col * alpha, alpha);
}`;

// 2. Editorial Chronometer: Engine-turned Guilloche sunburst + Clous de Paris metallic watch dial
const CHRONO_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uPhase;
uniform float uRatio;
uniform float uSeconds;
out vec4 fragColor;

#define PI 3.14159265359

void main() {
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec2 p = (vUv - 0.5) * aspect * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);

  float isLaunch = 1.0 - step(0.5, uPhase);
  float isComplete = step(0.5, uPhase) * (1.0 - step(1.5, uPhase));

  // Guilloche normal perturbation: sunburst radial flutes + Clous de Paris diamond hobnail micro-pyramids
  float sunburst = sin(a * 90.0 + sin(r * 22.0) * 0.5) * smoothstep(0.18, 0.86, r);
  vec2 hob = abs(fract(p * 34.0) - 0.5) * 2.0;
  float clous = (1.0 - max(hob.x, hob.y)) * smoothstep(0.88, 0.32, r);
  vec2 nOff = vec2(cos(a), sin(a)) * sunburst * 0.14 + (hob - 0.5) * clous * 0.12;
  vec3 N = normalize(vec3(nOff, 1.0));

  // Anisotropic rotating studio light sweep
  float lightAng = uTime * 0.42 + isComplete * 0.6;
  vec3 L = normalize(vec3(cos(lightAng) * 0.72, sin(lightAng) * 0.58 + 0.25, 0.76));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 1e-4), 38.0);
  float aniso = pow(max(1.0 - abs(sin(a * 2.0 - lightAng * 2.0)), 1e-4), 5.0);

  // Obsidian-slate dial + 18K rose-gold metallic highlights
  vec3 baseMetal = mix(vec3(0.035, 0.040, 0.052), vec3(0.085, 0.095, 0.122), diff);
  vec3 roseGold = vec3(0.88, 0.66, 0.44);
  vec3 warmIvory = vec3(0.98, 0.94, 0.86);

  vec3 col = baseMetal;
  col += roseGold * aniso * (0.24 + 0.22 * smoothstep(0.25, 0.82, r));
  col += mix(roseGold, warmIvory, 0.55) * spec * 0.55;

  // Sapphire crystal radial edge dispersion & bevel ring
  float bevel = exp(-abs(r - 0.84) * 42.0);
  float innerBevel = exp(-abs(r - 0.48) * 34.0);
  col += vec3(0.55, 0.78, 1.0) * bevel * 0.28 + roseGold * (bevel * 0.45 + innerBevel * 0.30);

  // Launch iris light reveal
  float iris = smoothstep(0.0, 0.72, uTime);
  float irisMask = mix(smoothstep(iris * 1.45, iris * 1.45 - 0.25, r), 1.0, 1.0 - isLaunch);
  col *= mix(0.28, 1.0, irisMask);

  // Warm archival spotlight on Complete
  col += roseGold * exp(-r * 1.65) * 0.28 * isComplete;

  col *= smoothstep(1.95, 0.32, r * 0.78);
  float alpha = 0.96;
  fragColor = vec4(col * alpha, alpha);
}`;

// 3. Solar Eclipse: Volumetric multi-octave polar FBM solar corona, totality transit & Diamond Ring anamorphic flare
const ECLIPSE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uPhase;
uniform float uRatio;
uniform float uSeconds;
out vec4 fragColor;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p *= 2.04;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec2 p = (vUv - 0.5) * aspect * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);

  float isLaunch = 1.0 - step(0.5, uPhase);
  float isComplete = step(0.5, uPhase) * (1.0 - step(1.5, uPhase));
  float isZen = step(1.5, uPhase);

  // Deep cosmic void + subtle twinkling starfield
  vec3 space = mix(vec3(0.012, 0.014, 0.028), vec3(0.04, 0.028, 0.046), exp(-r * 1.4));
  vec2 starCell = floor(p * 26.0);
  vec2 starUv = fract(p * 26.0) - 0.5;
  float starRand = hash21(starCell);
  if (starRand > 0.945) {
    float tw = 0.45 + 0.55 * sin(uTime * 2.4 + starRand * 62.0);
    space += vec3(1.0, 0.92, 0.78) * exp(-length(starUv) * 14.0) * tw * smoothstep(0.42, 0.75, r);
  }

  // Lunar transit offset during Launch (slides into syzygy totality)
  float transit = smoothstep(0.0, 1.05, uTime);
  vec2 moonPos = vec2(mix(-0.46, 0.0, transit), mix(-0.18, 0.0, transit)) * isLaunch;
  if (isComplete > 0.5) moonPos = vec2(0.14, -0.09);

  float sunR = 0.34;
  float moonR = 0.332;
  float dSun = length(p);
  float dMoon = length(p - moonPos);

  // Volumetric multi-octave polar FBM solar corona plasma streamers
  vec2 pol = vec2(cos(a) * 2.6, sin(a) * 2.6) + vec2(uTime * 0.06, -uTime * 0.04);
  float streamer = fbm(pol * 1.7 + vec2(r * 1.8 - uTime * 0.14, 0.0));
  float fineFlames = fbm(vec2(a * 5.0, r * 4.5 - uTime * 0.26));
  float coronaDensity = exp(-max(dSun - sunR, 0.0) * (3.6 - 1.5 * streamer)) * (0.55 + 0.95 * streamer * fineFlames);
  float innerRim = exp(-abs(dSun - sunR) * 44.0);

  vec3 plasma = mix(vec3(0.72, 0.22, 0.06), vec3(0.98, 0.72, 0.30), clamp(coronaDensity * 1.2, 0.0, 1.0));
  plasma = mix(plasma, vec3(1.0, 0.95, 0.84), innerRim * 0.85);

  // Diamond Ring / Baily's Bead anamorphic flare at upper-right contact point
  vec2 beadPos = normalize(vec2(0.74, 0.67)) * sunR;
  vec2 bp = p - beadPos;
  float beadStrength = isLaunch * smoothstep(0.45, 1.0, transit) * (0.65 + 0.55 * sin(uTime * 3.1))
                     + isComplete * 0.9
                     + isZen * 0.32;
  float hFlare = exp(-abs(bp.y) * 58.0) * exp(-abs(bp.x) * 3.2);
  float dFlare6 = exp(-length(bp) * 14.0) + exp(-abs(bp.x * 0.5 + bp.y * 0.866) * 52.0) * exp(-length(bp) * 5.5) * 0.45;
  vec3 diamondCol = vec3(1.0, 0.96, 0.86) * (hFlare * 1.1 + dFlare6) * beadStrength;

  // Gravitational shockwave on totality lock
  float shockR = max(0.0, (uTime - 0.72) * 1.55);
  float shock = exp(-abs(r - shockR) * 32.0) * (1.0 - smoothstep(0.9, 1.85, uTime)) * isLaunch * step(0.72, uTime);

  // Subtle chromatic lens-flare rings
  float lensRing = exp(-abs(r - 0.62) * 28.0) * 0.22;
  vec3 lensCol = vec3(0.98, 0.74, 0.38) * lensRing;

  // Lunar disc occultation
  float moonMask = smoothstep(moonR - 0.008, moonR + 0.012, dMoon);
  vec3 moonSurface = vec3(0.015, 0.015, 0.024) + vec3(0.96, 0.72, 0.36) * exp(-abs(dMoon - moonR) * 65.0) * 0.55;

  vec3 col = space + plasma * (0.85 + 0.35 * isComplete) + lensCol;
  col = mix(moonSurface, col, moonMask);
  col += diamondCol + vec3(1.0, 0.86, 0.54) * shock * 1.25;

  float alpha = 0.97;
  fragColor = vec4(col * alpha, alpha);
}`;

// 4. Crystal Lattice: Real-time Voronoi polycrystalline thermal annealing + Michel-Levy birefringence + laser wave
const CRYSTAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uPhase;
uniform float uRatio;
uniform float uSeconds;
out vec4 fragColor;

#define PI 3.14159265359

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

vec3 michelLevy(float phase) {
  vec3 c0 = vec3(0.08, 0.76, 0.84);
  vec3 c1 = vec3(0.48, 0.32, 0.90);
  vec3 c2 = vec3(0.94, 0.78, 0.48);
  vec3 c3 = vec3(0.80, 0.94, 1.00);
  float t = fract(phase) * 4.0;
  float i = floor(t);
  float f = smoothstep(0.0, 1.0, fract(t));
  if (i < 0.5) return mix(c0, c1, f);
  if (i < 1.5) return mix(c1, c2, f);
  if (i < 2.5) return mix(c2, c3, f);
  return mix(c3, c0, f);
}

void voronoi(vec2 x, out float minDist, out float edgeDist, out float cellId) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md1 = 8.0, md2 = 8.0;
  vec2 mr = vec2(0.0);
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) {
        md2 = md1;
        md1 = d;
        mr = r;
        id = o.x * 0.63 + o.y * 0.37;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  minDist = sqrt(md1);
  edgeDist = sqrt(md2) - sqrt(md1);
  cellId = id;
}

void main() {
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec2 p = (vUv - 0.5) * aspect * 2.0;
  float r = length(p);

  float isLaunch = 1.0 - step(0.5, uPhase);
  float isComplete = step(0.5, uPhase) * (1.0 - step(1.5, uPhase));
  float isZen = step(1.5, uPhase);

  // Voronoi polycrystalline field
  float minD, edgeD, cid;
  voronoi(p * 4.2, minD, edgeD, cid);
  float grainBoundary = exp(-edgeD * 32.0);

  // Launch electron-beam thermal annealing scan sweeping top -> bottom
  float beamY = mix(1.22, -1.25, clamp(uTime / 1.35, 0.0, 1.0));
  float annealed = mix(1.0, smoothstep(beamY - 0.14, beamY + 0.16, p.y), isLaunch);
  float beamLine = exp(-abs(p.y - beamY) * 58.0) * isLaunch * (1.0 - smoothstep(1.2, 1.5, uTime));

  // Unannealed molten thermal-amber state vs crystallized Michel-Levy birefringent facets
  vec3 molten = mix(vec3(0.14, 0.05, 0.02), vec3(0.95, 0.48, 0.14), grainBoundary * 0.8 + 0.2 * sin(r * 12.0 - uTime * 3.0));
  float polPhase = cid + r * 0.55 + uTime * 0.08 + uRatio * 0.45 * isZen;
  vec3 crystalCol = michelLevy(polPhase) * (0.20 + 0.24 * (1.0 - minD * 0.6));
  crystalCol += vec3(0.45, 0.92, 1.0) * grainBoundary * 0.42;

  // Complete hexagonal Bragg diffraction caustics & RGB chromatic ripples
  float hexRipple = sin(r * 24.0 - uTime * 2.4) * 0.5 + 0.5;
  vec3 bragg = michelLevy(r * 0.9 - uTime * 0.3) * pow(max(hexRipple, 1e-4), 4.0) * exp(-r * 0.95) * isComplete * 0.55;

  vec3 baseVoid = mix(vec3(0.016, 0.032, 0.052), vec3(0.008, 0.014, 0.026), smoothstep(0.1, 1.5, r));
  vec3 col = baseVoid + mix(molten, crystalCol, annealed) * 0.72 + bragg;
  col += vec3(0.68, 0.96, 1.0) * beamLine * 1.35;

  col *= smoothstep(1.98, 0.30, r * 0.75);
  float alpha = 0.96;
  fragColor = vec4(col * alpha, alpha);
}`;

const FRAG_MAP = {
  shrine: SHRINE_FRAG,
  chronometer: CHRONO_FRAG,
  eclipse: ECLIPSE_FRAG,
  crystal: CRYSTAL_FRAG,
};

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOutCubic = t => 1 - Math.pow(1 - clamp01(t), 3);

// Deterministic floating particles for Shrine & Crystal
const MOTES = Array.from({ length: 56 }, (_, i) => {
  const s1 = Math.sin(i * 12.9898) * 43758.5453;
  const s2 = Math.sin(i * 78.233 + 1.3) * 23421.631;
  const s3 = Math.sin(i * 45.164 + 2.7) * 19384.221;
  return {
    x: s1 - Math.floor(s1),
    y: s2 - Math.floor(s2),
    size: 2.5 + (s3 - Math.floor(s3)) * 5.5,
    speed: 0.04 + (s2 - Math.floor(s2)) * 0.08,
    drift: ((s1 - Math.floor(s1)) - 0.5) * 0.08,
    phase: (s3 - Math.floor(s3)) * Math.PI * 2,
    isGold: i % 3 === 0,
  };
});

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createWebGL2Host(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  if (!vs) return null;

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const cache = new Map();

  function getProgram(style) {
    if (cache.has(style)) return cache.get(style);
    const fragSrc = FRAG_MAP[style];
    if (!fragSrc) return null;
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!fs) {
      cache.set(style, null);
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      cache.set(style, null);
      return null;
    }
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const rec = {
      prog,
      uRes: gl.getUniformLocation(prog, 'uRes'),
      uTime: gl.getUniformLocation(prog, 'uTime'),
      uPhase: gl.getUniformLocation(prog, 'uPhase'),
      uRatio: gl.getUniformLocation(prog, 'uRatio'),
      uSeconds: gl.getUniformLocation(prog, 'uSeconds'),
    };
    cache.set(style, rec);
    return rec;
  }

  return {
    render(style, w, h, dpr, time, phaseNum, ratio, seconds) {
      const rec = getProgram(style);
      if (!rec) return false;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(rec.prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(rec.uRes, pw, ph);
      gl.uniform1f(rec.uTime, time);
      gl.uniform1f(rec.uPhase, phaseNum);
      gl.uniform1f(rec.uRatio, ratio);
      gl.uniform1f(rec.uSeconds, seconds);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
  };
}

function drawFallbackBg(ctx, w, h, style) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.62);
  if (style === 'shrine') {
    g.addColorStop(0, '#2a0d16');
    g.addColorStop(1, '#090408');
  } else if (style === 'chronometer') {
    g.addColorStop(0, '#181c26');
    g.addColorStop(1, '#08090e');
  } else if (style === 'eclipse') {
    g.addColorStop(0, '#231618');
    g.addColorStop(1, '#060710');
  } else {
    g.addColorStop(0, '#0f2432');
    g.addColorStop(1, '#060c14');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// High-DPI Canvas 2D Precision Overlays
function renderShrineFX(ctx, w, h, time, phase, ratio) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.min(w, h) * (phase === 'zen' ? 0.31 : 0.35);
  const open = phase === 'launch' ? easeOutCubic(time / 0.85) : 1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.84 + 0.16 * open, 0.84 + 0.16 * open);

  // Outer 72-tick sacred barrier ring
  ctx.save();
  ctx.rotate(time * 0.045);
  ctx.strokeStyle = 'rgba(235, 192, 120, 0.42)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.12, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    const len = major ? 12 : 5;
    ctx.strokeStyle = major ? 'rgba(255, 224, 158, 0.82)' : 'rgba(228, 92, 75, 0.42)';
    ctx.lineWidth = major ? 1.6 : 0.9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (R * 1.12 - len), Math.sin(a) * (R * 1.12 - len));
    ctx.lineTo(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12);
    ctx.stroke();
  }
  ctx.restore();

  // Counter-rotating gilded octagonal seal
  ctx.save();
  ctx.rotate(-time * 0.06);
  const sq = R * 0.72;
  ctx.strokeStyle = 'rgba(228, 92, 75, 0.52)';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = 'rgba(235, 192, 120, 0.58)';
  ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
  ctx.restore();

  // 16 glowing translucent lotus / sakura glass petals
  ctx.save();
  ctx.rotate(time * 0.03);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    const pr = i % 2 === 0 ? R * 0.84 : R * 0.66;
    ctx.beginPath();
    ctx.moveTo(R * 0.34, 0);
    ctx.quadraticCurveTo(pr * 0.74, -R * 0.08, pr, 0);
    ctx.quadraticCurveTo(pr * 0.74, R * 0.08, R * 0.34, 0);
    const pg = ctx.createLinearGradient(R * 0.34, 0, pr, 0);
    pg.addColorStop(0, 'rgba(228, 92, 75, 0.06)');
    pg.addColorStop(0.65, 'rgba(246, 194, 199, 0.16)');
    pg.addColorStop(1, 'rgba(255, 224, 158, 0.28)');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 214, 148, 0.45)' : 'rgba(246, 184, 194, 0.35)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Zen live gilded progress arc & spiritual bead
  if (phase === 'zen') {
    const startA = -Math.PI / 2;
    const endA = startA + Math.PI * 2 * clamp01(ratio);
    ctx.strokeStyle = 'rgba(235, 192, 120, 0.18)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    const arcG = ctx.createLinearGradient(-R, -R, R, R);
    arcG.addColorStop(0, '#ffd88e');
    arcG.addColorStop(0.5, '#e86858');
    arcG.addColorStop(1, '#ffe8b8');
    ctx.strokeStyle = arcG;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.98, startA, endA);
    ctx.stroke();

    const bx = Math.cos(endA) * R * 0.98;
    const by = Math.sin(endA) * R * 0.98;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, 10);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.4, '#ffd480');
    bg.addColorStop(1, 'rgba(232, 104, 88, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Drifting sakura petals & Kinpaku gold-leaf flakes across viewport
  for (const m of MOTES) {
    const py = ((m.y + time * m.speed * (phase === 'complete' ? 1.5 : 0.75)) % 1.16) - 0.08;
    const px = (m.x + Math.sin(time * 0.9 + m.phase) * 0.03 + time * m.drift + 10) % 1;
    const x = px * w;
    const y = py * h;
    const rot = time * 1.4 + m.phase;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (m.isGold) {
      ctx.fillStyle = `rgba(255, 224, 146, ${0.42 + 0.42 * Math.abs(Math.sin(rot))})`;
      const s = m.size * 0.65;
      ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
    } else {
      ctx.fillStyle = 'rgba(248, 192, 202, 0.72)';
      ctx.beginPath();
      ctx.ellipse(0, 0, m.size * 0.55, m.size * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawSkeletonGear(ctx, x, y, r, teeth, angle, spokeCount, ruby, goldTint) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Outer toothed rim
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.35) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.55) / teeth) * Math.PI * 2;
    const a3 = ((i + 0.90) / teeth) * Math.PI * 2;
    const rOut = r;
    const rIn = r * 0.91;
    if (i === 0) ctx.moveTo(Math.cos(a0) * rIn, Math.sin(a0) * rIn);
    ctx.lineTo(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
    ctx.lineTo(Math.cos(a2) * rOut, Math.sin(a2) * rOut);
    ctx.lineTo(Math.cos(a3) * rIn, Math.sin(a3) * rIn);
  }
  ctx.closePath();

  const rimG = ctx.createLinearGradient(-r, -r, r, r);
  if (goldTint) {
    rimG.addColorStop(0, 'rgba(255, 226, 178, 0.85)');
    rimG.addColorStop(0.5, 'rgba(182, 128, 72, 0.68)');
    rimG.addColorStop(1, 'rgba(248, 206, 146, 0.82)');
  } else {
    rimG.addColorStop(0, 'rgba(232, 240, 255, 0.72)');
    rimG.addColorStop(0.5, 'rgba(92, 108, 134, 0.58)');
    rimG.addColorStop(1, 'rgba(216, 226, 244, 0.74)');
  }
  ctx.strokeStyle = rimG;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Inner rim & spokes
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = Math.max(1.4, r * 0.045);
  for (let s = 0; s < spokeCount; s++) {
    const sa = (s / spokeCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(sa) * r * 0.18, Math.sin(sa) * r * 0.18);
    ctx.lineTo(Math.cos(sa) * r * 0.76, Math.sin(sa) * r * 0.76);
    ctx.stroke();
  }

  // Ruby jewel bearing at axle
  if (ruby) {
    const jr = Math.max(3.5, r * 0.11);
    const jg = ctx.createRadialGradient(-jr * 0.3, -jr * 0.3, 0.5, 0, 0, jr);
    jg.addColorStop(0, '#ffd4dc');
    jg.addColorStop(0.45, '#d62848');
    jg.addColorStop(1, '#580c1c');
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.arc(0, 0, jr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 226, 178, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function renderChronoFX(ctx, w, h, time, phase, ratio, seconds, running) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.min(w, h) * (phase === 'zen' ? 0.34 : 0.37);
  const spinRate = running ? 1 : 0.12;

  ctx.save();
  ctx.translate(cx, cy);

  // 5 Interlocking Skeletonized Tourbillon Gears
  ctx.save();
  ctx.globalAlpha = phase === 'zen' ? 0.58 : 0.74;
  drawSkeletonGear(ctx, -R * 0.44, -R * 0.28, R * 0.34, 24, time * 0.28 * spinRate, 5, true, true);
  drawSkeletonGear(ctx, R * 0.46, -R * 0.22, R * 0.28, 20, -time * 0.34 * spinRate + 0.2, 4, true, false);
  drawSkeletonGear(ctx, R * 0.22, R * 0.44, R * 0.36, 26, time * 0.22 * spinRate + 0.1, 6, true, true);
  drawSkeletonGear(ctx, -R * 0.36, R * 0.38, R * 0.24, 18, -time * 0.40 * spinRate, 4, false, false);
  drawSkeletonGear(ctx, 0, 0, R * 0.62, 36, time * 0.08 * spinRate, 6, false, true);
  ctx.restore();

  // Outer 240 micro-graduated fifth-second chapter ring
  ctx.strokeStyle = 'rgba(236, 198, 148, 0.52)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.06, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 246, 230, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.94, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const hour = i % 20 === 0;
    const sec = i % 4 === 0;
    const len = hour ? 13 : sec ? 7 : 3.5;
    ctx.strokeStyle = hour
      ? 'rgba(255, 226, 178, 0.88)'
      : sec
        ? 'rgba(232, 236, 244, 0.48)'
        : 'rgba(232, 236, 244, 0.18)';
    ctx.lineWidth = hour ? 1.8 : sec ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (R * 1.06 - len), Math.sin(a) * (R * 1.06 - len));
    ctx.lineTo(Math.cos(a) * R * 1.06, Math.sin(a) * R * 1.06);
    ctx.stroke();
  }

  // Cardinal Roman Numerals
  ctx.font = `600 ${Math.round(R * 0.095)}px "Materia New York", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 232, 194, 0.85)';
  const numerals = [['XII', 0, -R * 1.15], ['III', R * 1.15, 0], ['VI', 0, R * 1.15], ['IX', -R * 1.15, 0]];
  for (const [label, nx, ny] of numerals) {
    ctx.fillText(label, nx, ny);
  }

  // Zen progress arc & Breguet chronograph hand
  if (phase === 'zen') {
    const startA = -Math.PI / 2;
    const endA = startA + Math.PI * 2 * clamp01(ratio);
    ctx.strokeStyle = 'rgba(235, 94, 72, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.99, startA, endA);
    ctx.stroke();

    const secAngle = ((seconds % 60) / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(secAngle);
    ctx.strokeStyle = '#ff6b54';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R * 0.72, 0);
    ctx.lineTo(R * 1.03, 0);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function renderEclipseFX(ctx, w, h, time, phase, ratio) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.min(w, h) * (phase === 'zen' ? 0.34 : 0.37);

  ctx.save();
  ctx.translate(cx, cy);

  // Precision gilded astronomical armillary & azimuth coordinate rings
  ctx.save();
  ctx.rotate(time * 0.028);
  ctx.strokeStyle = 'rgba(255, 218, 142, 0.28)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.16, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([4, 8]);
  ctx.strokeStyle = 'rgba(255, 224, 162, 0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.98, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const major = i % 12 === 0;
    const len = major ? 14 : 5;
    ctx.strokeStyle = major ? 'rgba(255, 232, 178, 0.82)' : 'rgba(255, 212, 138, 0.32)';
    ctx.lineWidth = major ? 1.5 : 0.9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (R * 1.16 - len), Math.sin(a) * (R * 1.16 - len));
    ctx.lineTo(Math.cos(a) * R * 1.16, Math.sin(a) * R * 1.16);
    ctx.stroke();
  }
  ctx.restore();

  // Ecliptic crosshairs
  ctx.strokeStyle = 'rgba(255, 218, 146, 0.22)';
  ctx.lineWidth = 1;
  for (const [x1, y1, x2, y2] of [
    [-R * 1.28, 0, -R * 1.02, 0],
    [R * 1.02, 0, R * 1.28, 0],
    [0, -R * 1.28, 0, -R * 1.02],
    [0, R * 1.02, 0, R * 1.28],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Zen orbital crescent progress arc & lunar phase node
  if (phase === 'zen') {
    const startA = -Math.PI / 2;
    const endA = startA + Math.PI * 2 * clamp01(ratio);
    const cg = ctx.createLinearGradient(-R, -R, R, R);
    cg.addColorStop(0, '#ffe4a2');
    cg.addColorStop(0.5, '#f0a642');
    cg.addColorStop(1, '#fff6dc');
    ctx.strokeStyle = cg;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.05, startA, endA);
    ctx.stroke();

    const mx = Math.cos(endA) * R * 1.05;
    const my = Math.sin(endA) * R * 1.05;
    ctx.fillStyle = '#0c0c16';
    ctx.strokeStyle = '#ffd88a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function renderCrystalFX(ctx, w, h, time, phase, ratio) {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.min(w, h) * (phase === 'zen' ? 0.33 : 0.36);

  ctx.save();
  ctx.translate(cx, cy);

  // Multi-tiered beveled crystal hexagons
  const drawHex = (rad, rot, stroke, width, dash = []) => {
    ctx.save();
    ctx.rotate(rot);
    ctx.setLineDash(dash);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const hx = Math.cos(a) * rad;
      const hy = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  drawHex(R * 1.12, time * 0.025, 'rgba(130, 232, 248, 0.58)', 1.5);
  drawHex(R * 0.96, -time * 0.03 + Math.PI / 6, 'rgba(196, 162, 255, 0.45)', 1.1, [6, 7]);
  drawHex(R * 0.72, time * 0.025, 'rgba(255, 224, 162, 0.48)', 1.2);

  // Bragg diffraction spots with optical cross flares at hexagonal vertices
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + time * 0.025;
    const vx = Math.cos(a) * R * 1.12;
    const vy = Math.sin(a) * R * 1.12;
    const sg = ctx.createRadialGradient(vx, vy, 0, vx, vy, 12);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.35, 'rgba(114, 232, 255, 0.75)');
    sg.addColorStop(1, 'rgba(114, 232, 255, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(vx, vy, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Miller index annotations
  ctx.font = '600 11px "Materia SF Mono", Consolas, monospace';
  ctx.fillStyle = 'rgba(154, 238, 255, 0.68)';
  ctx.textAlign = 'center';
  ctx.fillText('(111)', -R * 1.24, -R * 0.62);
  ctx.fillText('(200)', R * 1.24, -R * 0.48);
  ctx.fillText('(220)', -R * 1.18, R * 0.72);

  // Zen prismatic progress arc
  if (phase === 'zen') {
    const startA = -Math.PI / 2;
    const endA = startA + Math.PI * 2 * clamp01(ratio);
    const cg = ctx.createLinearGradient(-R, -R, R, R);
    cg.addColorStop(0, '#72e8ff');
    cg.addColorStop(0.5, '#c292ff');
    cg.addColorStop(1, '#ffe0a2');
    ctx.strokeStyle = cg;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.20, startA, endA);
    ctx.stroke();
  }

  ctx.restore();

  // Drifting prism diamond bokeh motes
  for (let i = 0; i < 28; i++) {
    const m = MOTES[i];
    const px = (m.x + time * m.drift * 0.5 + 10) % 1;
    const py = (m.y - time * m.speed * 0.35 + 10) % 1;
    const pulse = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(time * 2.2 + m.phase), 2);
    const s = m.size * 0.55;
    ctx.save();
    ctx.translate(px * w, py * h);
    ctx.globalAlpha = pulse * 0.72;
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#72ebff' : '#d8b4ff';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.35, -s * 0.35);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.35, s * 0.35);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.35, s * 0.35);
    ctx.lineTo(-s, 0);
    ctx.lineTo(-s * 0.35, -s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function createPomodoroLuxuryStage(hostEl) {
  if (!hostEl || typeof document === 'undefined') {
    return { start() {}, update() {}, stop() {} };
  }

  let layer = hostEl.querySelector(':scope > .pomo-luxury-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'pomo-luxury-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<canvas class="pomo-luxury-gl" data-pomo-gl></canvas><canvas class="pomo-luxury-fx" data-pomo-fx></canvas>';
    hostEl.prepend(layer);
  }

  const glCanvas = layer.querySelector('[data-pomo-gl]');
  const fxCanvas = layer.querySelector('[data-pomo-fx]');
  const glHost = glCanvas ? createWebGL2Host(glCanvas) : null;
  const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;

  const reducedQuery = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  let active = false;
  let rafId = 0;
  let startAt = 0;
  let state = { style: 'shrine', phase: 'launch', ratio: 1, seconds: 1500, running: true };

  const phaseNum = p => (p === 'complete' ? 1 : p === 'zen' ? 2 : 0);

  function renderFrame(now) {
    if (!active) return;
    const w = Math.max(1, window.innerWidth || hostEl.clientWidth || 1280);
    const h = Math.max(1, window.innerHeight || hostEl.clientHeight || 800);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const fw = Math.round(w * dpr);
    const fh = Math.round(h * dpr);
    if (fxCanvas && (fxCanvas.width !== fw || fxCanvas.height !== fh)) {
      fxCanvas.width = fw;
      fxCanvas.height = fh;
    }

    const reduced = Boolean(reducedQuery.matches);
    const t = reduced ? 1.6 : Math.max(0, (now - startAt) / 1000);

    const glOK = glHost
      ? glHost.render(state.style, w, h, dpr, t, phaseNum(state.phase), state.ratio, state.seconds)
      : false;

    if (fxCtx) {
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxCtx.clearRect(0, 0, w, h);
      if (!glOK) drawFallbackBg(fxCtx, w, h, state.style);
      if (state.style === 'shrine') renderShrineFX(fxCtx, w, h, t, state.phase, state.ratio);
      else if (state.style === 'chronometer') renderChronoFX(fxCtx, w, h, t, state.phase, state.ratio, state.seconds, state.running);
      else if (state.style === 'eclipse') renderEclipseFX(fxCtx, w, h, t, state.phase, state.ratio);
      else if (state.style === 'crystal') renderCrystalFX(fxCtx, w, h, t, state.phase, state.ratio);
    }

    if (!reduced && active) {
      rafId = requestAnimationFrame(renderFrame);
    } else {
      rafId = 0;
    }
  }

  function stop() {
    active = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    hostEl.classList.remove('has-luxury-stage');
  }

  function start(opts = {}) {
    const style = opts.style || state.style;
    if (!FRAG_MAP[style]) {
      stop();
      return;
    }
    state = {
      style,
      phase: opts.phase || 'launch',
      ratio: Number.isFinite(opts.ratio) ? opts.ratio : 1,
      seconds: Number.isFinite(opts.seconds) ? opts.seconds : 0,
      running: opts.running !== false,
    };
    active = true;
    startAt = performance.now();
    hostEl.classList.add('has-luxury-stage');
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    renderFrame(startAt);
  }

  function update(patch = {}) {
    if (!active) return;
    if (patch.style && patch.style !== state.style) {
      start({ ...state, ...patch });
      return;
    }
    if (Number.isFinite(patch.ratio)) state.ratio = patch.ratio;
    if (Number.isFinite(patch.seconds)) state.seconds = patch.seconds;
    if (typeof patch.running === 'boolean') state.running = patch.running;
    if (patch.phase) state.phase = patch.phase;
    if (reducedQuery.matches) renderFrame(performance.now());
  }

  return { start, update, stop };
}
