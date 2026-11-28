// Frameless WebGL2 + High-DPI Canvas 2D luxury splash engine for 'prism' and 'chrome'.
(() => {
  const root = document.documentElement;
  const style = root.dataset.style;
  if (style !== 'prism' && style !== 'chrome') return;

  function boot() {
    const glCanvas = document.querySelector(`[data-luxury-gl="${style}"]`);
    const fxCanvas = document.querySelector(`[data-luxury-fx="${style}"]`);
    if (!glCanvas || !fxCanvas) return;

    const VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  // Style 3: Dichroic Cathedral / Birefringent Rose Window
  const PRISM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uProgress;
uniform float uDepart;
out vec4 fragColor;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Michel-Levy polarized birefringence palette: peacock cyan, imperial amethyst, pearl opal, champagne gold
vec3 michelLevy(float phase) {
  vec3 c0 = vec3(0.05, 0.78, 0.84);
  vec3 c1 = vec3(0.56, 0.30, 0.94);
  vec3 c2 = vec3(0.95, 0.80, 0.52);
  vec3 c3 = vec3(0.84, 0.95, 1.00);
  float t = fract(phase) * 4.0;
  float i = floor(t);
  float f = smoothstep(0.0, 1.0, fract(t));
  if (i < 0.5) return mix(c0, c1, f);
  if (i < 1.5) return mix(c1, c2, f);
  if (i < 2.5) return mix(c2, c3, f);
  return mix(c3, c0, f);
}

vec3 sampleCrystalField(vec2 p, float t, float prog, float dep) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Kaleidoscopic departure twist
  float twist = dep * dep * (2.6 - r * 1.4);
  a += twist;
  r *= 1.0 + dep * 0.48;

  // 12-fold & 24-fold faceted cathedral sectors
  float sec12 = abs(fract(a / (PI / 6.0)) - 0.5) * 2.0;
  float sec24 = abs(fract((a + PI / 24.0) / (PI / 12.0)) - 0.5) * 2.0;

  // Faceted radial bands
  float ringZone = smoothstep(0.16, 0.24, r) * (1.0 - smoothstep(0.68, 0.80, r));
  float innerWreath = smoothstep(0.18, 0.26, r) * (1.0 - smoothstep(0.46, 0.54, r));
  float outerTracery = smoothstep(0.45, 0.50, r) * (1.0 - smoothstep(0.71, 0.76, r));

  // Polarizer sweep (0 -> 90 deg) + subtle living shimmer
  float polAngle = prog * 1.5707 + t * 0.18;
  float facetId = floor((a + PI) / (PI / 12.0)) * 0.13 + floor(r * 14.0) * 0.19;
  float phase = r * 1.9 + sin(a * 6.0 + polAngle) * 0.38 + cos(r * 10.0 - t * 0.7) * 0.16 + facetId;

  vec3 biref = michelLevy(phase + polAngle * 0.32);

  // Luminous caustics web inside crystals
  float caustic = sin(r * 28.0 - t * 1.9 + sin(a * 12.0) * 2.1) * cos(a * 24.0 + r * 12.0 - t * 1.1);
  caustic = pow(clamp(caustic * 0.5 + 0.5, 0.001, 1.0), 4.0);

  // Sharp crystal bevel edges
  float facetEdge = pow(max(1.0 - min(sec12, sec24), 0.001), 7.0);
  float rimGlow = exp(-abs(r - 0.73) * 44.0) + 0.55 * exp(-abs(r - 0.48) * 38.0);

  vec3 col = biref * (0.28 + 0.66 * caustic) * ringZone;
  col += vec3(0.48, 0.92, 1.0) * facetEdge * innerWreath * 0.48;
  col += mix(vec3(0.55, 0.42, 0.95), vec3(0.95, 0.82, 0.58), 0.5 + 0.5 * sin(a * 12.0 + t)) * outerTracery * 0.38;
  col += vec3(0.78, 0.94, 1.0) * rimGlow * (0.55 + 0.45 * sin(a * 6.0 - t));

  // Outer spectral diffraction halo
  float haloRing = exp(-abs(r - 0.87) * 28.0);
  col += michelLevy(a / (2.0 * PI) + t * 0.08) * haloRing * 0.28;

  return col;
}

void main() {
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 center = vec2(0.5, 0.56); // 0.44 from top in GL coords
  vec2 p = (vUv - center) * aspect * 2.0;
  float r = length(p);

  // Feathered radial obsidian-midnight void halo for frameless floating over desktop
  float ovalR = length(vec2(p.x * 0.80, (vUv.y - 0.5) * 1.94));
  float voidMask = 1.0 - smoothstep(0.68, 1.06, ovalR);
  vec3 bg = mix(vec3(0.010, 0.012, 0.022), vec3(0.032, 0.048, 0.082), exp(-r * 2.4));

  // Opening polarized excitation beam (0 -> 0.55s)
  float beamIn = smoothstep(0.0, 0.16, uTime) * (1.0 - smoothstep(0.32, 0.82, uTime));
  float beamLine = exp(-abs(p.x) * 95.0) * smoothstep(1.1, 0.0, abs(p.y)) * beamIn * 1.45;
  float bloomIn = smoothstep(0.12, 0.88, uTime);

  // RGB chromatic dispersion split intensifies on departure
  float disp = 0.004 + uDepart * 0.042;
  vec2 dir = r > 0.001 ? p / r : vec2(1.0, 0.0);
  vec3 crystal;
  crystal.r = sampleCrystalField(p + dir * disp, uTime, uProgress, uDepart).r;
  crystal.g = sampleCrystalField(p, uTime, uProgress, uDepart).g;
  crystal.b = sampleCrystalField(p - dir * disp, uTime, uProgress, uDepart).b;

  // Intense horizontal anamorphic lens flare + vertical diamond spike at core
  float coreBurst = smoothstep(0.14, 0.58, uTime);
  float hFlare = exp(-abs(p.y) * 56.0) * exp(-abs(p.x) * 2.7) * (0.85 + 0.25 * sin(uTime * 2.4));
  float vFlare = exp(-abs(p.x) * 66.0) * exp(-abs(p.y) * 4.2) * 0.58;
  float coreGlow = exp(-r * 7.2) * 0.92;
  vec3 flareCol = vec3(0.56, 0.92, 1.0) * hFlare + vec3(0.88, 0.96, 1.0) * (vFlare + coreGlow);

  // Subtle concentric diffraction rings
  float diffWave = sin(r * 42.0 - uTime * 3.0) * 0.5 + 0.5;
  float diffMask = exp(-abs(r - 0.19) * 18.0) * diffWave * 0.24;

  vec3 color = bg + crystal * bloomIn + flareCol * coreBurst + vec3(0.75, 0.96, 1.0) * (beamLine + diffMask);

  // Shatter-fade departure
  float departAlpha = 1.0 - smoothstep(0.18, 1.0, uDepart);
  float alpha = clamp(voidMask * (0.94 * smoothstep(0.0, 0.18, uTime + 0.05) + beamLine * 0.5 + length(crystal) * 0.25), 0.0, 1.0);
  alpha *= departAlpha;

  color *= alpha;
  fragColor = vec4(color, alpha);
}`;

  // Style 5: Liquid Chrome Neo-Baroque (SDF Raymarching + Cathedral HDRI + Glass Ripples)
  const CHROME_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uProgress;
uniform float uDepart;
out vec4 fragColor;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 360-degree Cathedral HDRI procedural reflection: dark liquid-mercury contrast with amber-gold stained glass, diamond white, cobalt sapphire
vec3 cathedralHDRI(vec3 dir, float t) {
  float lon = atan(dir.z, dir.x);
  float lat = dir.y;

  // Vertical stained-glass ribs and dark obsidian gaps for mirror-chrome realism
  float ribs = pow(max(0.5 + 0.5 * cos(lon * 7.0 + t * 0.22), 0.001), 4.0);
  float darkBands = smoothstep(-0.1, 0.45, sin(lon * 5.0 - lat * 3.0));
  float warmGold = pow(max(0.5 + 0.5 * sin(lon * 3.0 - 0.9 + lat * 1.4), 0.001), 5.0) * smoothstep(-0.5, 0.55, lat);
  float cobalt = smoothstep(0.35, -0.75, lat) * pow(max(0.5 + 0.5 * cos(lon * 2.0 + 1.1), 0.001), 2.0);
  float overhead = pow(max(dir.y, 0.001), 6.0);
  float horizonBand = exp(-abs(dir.y - 0.05) * 9.0);

  vec3 col = vec3(0.025, 0.032, 0.052);
  col += vec3(0.08, 0.20, 0.46) * cobalt * (0.45 + 0.55 * darkBands);
  col += vec3(0.88, 0.58, 0.22) * warmGold * (0.55 + 0.75 * ribs);
  col += vec3(0.92, 0.95, 1.0) * (overhead * 1.05 + horizonBand * 0.62 * ribs) * (0.35 + 0.65 * darkBands);

  // Razor-sharp studio rim strips
  float strip = smoothstep(0.93, 0.996, sin(lon * 4.0 + dir.y * 5.0 - t * 0.35));
  col += vec3(1.0, 0.96, 0.90) * strip * 1.15;
  return col;
}

float mapChrome(vec3 p, float t, float surge, float dep) {
  float d = 10.0;

  // Departure shockwave distortion
  float shock = dep * dep * 1.35;
  p += shock * vec3(sin(p.y * 5.0 + t * 4.0), cos(p.x * 4.5 - t * 3.0), sin(p.z * 4.0)) * 0.42;

  // Upper neo-baroque pouring chrome crown
  float dropY = mix(0.95, 0.0, surge);
  vec3 pc = p - vec3(0.0, 0.92 + dropY, 0.0);
  float crown = length(vec3(pc.x * 0.74, pc.y * 1.15, pc.z * 1.1)) - 0.52;
  // Crown ribs & dripping tendrils
  float ribs = sin(p.x * 9.5 + sin(p.y * 4.2 + t * 1.1)) * cos(p.z * 7.0);
  crown += ribs * 0.065;

  // 5 pouring liquid crown spikes reaching toward center
  for (int i = 0; i < 5; i++) {
    float fi = float(i) - 2.0;
    float sway = sin(t * 1.2 + fi * 1.3) * 0.045;
    vec3 sp = p - vec3(fi * 0.24 + sway, 0.62 - abs(fi) * 0.05 + dropY * 0.6, sin(fi * 1.9) * 0.08);
    float spike = length(vec3(sp.x * 2.6, sp.y * 0.55, sp.z * 2.2)) - 0.16;
    crown = smin(crown, spike, 0.18);
  }
  d = min(d, crown);

  // Lower surging molten platinum sculpture
  vec3 pb = p - vec3(0.0, -0.96 - dropY, 0.0);
  float base = length(vec3(pb.x * 0.70, pb.y * 1.05, pb.z * 1.0)) - 0.58;
  base += sin(p.x * 7.2 - t * 0.95 + p.y * 3.5) * cos(p.y * 6.0 + t * 0.7) * 0.085;

  // Rising diagonal sculptural arms framing the center
  vec3 armL = p - vec3(-0.34 - sin(t * 0.8) * 0.03, -0.52 - dropY * 0.5, 0.05);
  float fArmL = length(vec3((armL.x + armL.y * 0.42) * 2.1, armL.y * 0.65, armL.z * 2.1)) - 0.14;
  vec3 armR = p - vec3(0.36 + cos(t * 0.9) * 0.03, -0.50 - dropY * 0.5, -0.04);
  float fArmR = length(vec3((armR.x - armR.y * 0.36) * 2.0, armR.y * 0.62, armR.z * 2.0)) - 0.15;
  base = smin(base, fArmL, 0.18);
  base = smin(base, fArmR, 0.18);
  d = smin(d, base, 0.22);

  // Orbiting suspended mercury spheres
  for (int j = 0; j < 6; j++) {
    float fj = float(j);
    float ang = fj * 1.0472 + t * 0.32;
    float rad = 0.62 + 0.18 * sin(fj * 2.3);
    vec3 orbPos = vec3(cos(ang) * rad * 1.25, sin(ang * 1.2 + fj) * 0.48, sin(ang) * 0.25);
    float orb = length(p - orbPos) - (0.045 + 0.02 * sin(fj * 1.7));
    d = smin(d, orb, 0.09);
  }

  return d;
}

vec3 calcNormal(vec3 p, float t, float surge, float dep) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0028;
  return normalize(
    k.xyy * mapChrome(p + k.xyy * h, t, surge, dep) +
    k.yyx * mapChrome(p + k.yyx * h, t, surge, dep) +
    k.yxy * mapChrome(p + k.yxy * h, t, surge, dep) +
    k.xxx * mapChrome(p + k.xxx * h, t, surge, dep)
  );
}

void main() {
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 p2 = (vUv - 0.5) * aspect * 2.0;
  float r2 = length(p2);

  // Feathered radial obsidian-indigo void halo
  float ovalR = length(vec2(p2.x * 0.78, (vUv.y - 0.5) * 2.02));
  float voidMask = 1.0 - smoothstep(0.68, 1.05, ovalR);

  // Concentric refractive optical glass lens ripples behind the wordmark
  float rippleZone = smoothstep(0.18, 0.34, r2) * (1.0 - smoothstep(0.72, 0.96, r2));
  float ringPhase = r2 * 26.0 - uTime * 1.4 - uDepart * 10.0;
  float glassWave = sin(ringPhase) * 0.5 + 0.5;
  vec2 glassOffset = (r2 > 0.001 ? p2 / r2 : vec2(0.0)) * sin(ringPhase) * 0.06 * rippleZone;
  vec3 glassDir = normalize(vec3(p2 + glassOffset * 2.6, 1.1));
  vec3 glassCol = cathedralHDRI(glassDir, uTime * 0.7) * (0.24 + 0.46 * pow(max(glassWave, 0.001), 2.2)) * rippleZone;
  float glassRim = exp(-abs(r2 - 0.68) * 32.0) * 0.34;

  vec3 bg = mix(vec3(0.012, 0.015, 0.026), vec3(0.024, 0.032, 0.058), exp(-r2 * 1.8));
  bg += glassCol + vec3(0.72, 0.84, 1.0) * glassRim;

  // Raymarch liquid chrome sculpture
  float surge = smoothstep(0.0, 0.78, uTime);
  vec3 ro = vec3(0.0, 0.0, 2.35);
  vec3 rd = normalize(vec3(p2, -1.78));
  float td = 0.0;
  bool hit = false;
  for (int i = 0; i < 44; i++) {
    vec3 pos = ro + rd * td;
    float dist = mapChrome(pos, uTime, surge, uDepart);
    if (dist < 0.0024) { hit = true; break; }
    td += dist * 0.85;
    if (td > 4.6) break;
  }

  vec3 color = bg;
  if (hit) {
    vec3 pos = ro + rd * td;
    vec3 n = calcNormal(pos, uTime, surge, uDepart);
    vec3 v = -rd;
    vec3 refl = reflect(rd, n);
    float fresnel = pow(clamp(1.0 - max(dot(n, v), 0.0), 0.001, 1.0), 3.4);

    // Subtle chromatic dispersion across mirror curves
    vec3 envR = cathedralHDRI(normalize(refl + vec3(0.016, 0.0, 0.0)), uTime);
    vec3 envG = cathedralHDRI(refl, uTime);
    vec3 envB = cathedralHDRI(normalize(refl - vec3(0.016, 0.0, 0.0)), uTime);
    vec3 chrome = vec3(envR.r, envG.g, envB.b);

    chrome = mix(chrome * 0.82, vec3(0.92, 0.96, 1.0), fresnel * 0.58);
    // Deep velvet-silver curvature contrast
    chrome = pow(clamp(chrome, 0.001, 1.35), vec3(1.18));
    color = mix(bg, chrome, 0.96);
  }

  // Subtle dark vignette at bottom edge so status line always reads cleanly
  float statusMask = smoothstep(-0.45, -0.92, p2.y) * smoothstep(0.85, 0.1, abs(p2.x));
  color = mix(color, vec3(0.015, 0.018, 0.032), statusMask * 0.58);

  // Departure shockwave ring + evaporation fade
  float shockRing = exp(-abs(r2 - uDepart * 1.45) * 26.0) * uDepart * (1.0 - uDepart) * 2.2;
  color += vec3(0.86, 0.93, 1.0) * shockRing;

  float departAlpha = 1.0 - smoothstep(0.20, 1.0, uDepart);
  float alpha = clamp(voidMask * (0.95 * smoothstep(0.0, 0.16, uTime + 0.04) + (hit ? 0.35 : 0.0)), 0.0, 1.0);
  alpha *= departAlpha;

  color *= alpha;
  fragColor = vec4(color, alpha);
}`;

  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOutCubic = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeOutBack = t => {
    const x = clamp01(t);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

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

  function createGLRenderer(canvas, fragSrc) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uProgress = gl.getUniformLocation(prog, 'uProgress');
    const uDepart = gl.getUniformLocation(prog, 'uDepart');

    return {
      render(w, h, dpr, time, progress, depart) {
        const pw = Math.max(1, Math.round(w * dpr));
        const ph = Math.max(1, Math.round(h * dpr));
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
        gl.viewport(0, 0, pw, ph);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(uRes, pw, ph);
        gl.uniform1f(uTime, time);
        gl.uniform1f(uProgress, progress);
        gl.uniform1f(uDepart, depart);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  // Exact normalized Materia 8-ray angles & relative reaches (from startup.html 512x512 mark)
  const MATERIA_RAYS = [
    { angle: -1.588, len: 1.00 }, // 12 o'clock tall spike
    { angle: -0.870, len: 0.66 }, // upper-right
    { angle:  0.252, len: 0.96 }, // right horizontal spike
    { angle:  0.996, len: 0.62 }, // lower-right
    { angle:  1.712, len: 0.98 }, // bottom spike
    { angle:  2.616, len: 0.64 }, // lower-left
    { angle: -2.885, len: 0.96 }, // left horizontal spike
    { angle: -2.238, len: 0.64 }, // upper-left
  ];
  const SAT_ANGLE = -0.517;
  const SAT_DIST = 1.04;

  // Deterministic sparkle particles
  const SPARKLES = Array.from({ length: 64 }, (_, i) => {
    const s1 = Math.sin(i * 12.9898) * 43758.5453;
    const s2 = Math.sin(i * 78.233 + 1.3) * 23421.631;
    const s3 = Math.sin(i * 45.164 + 2.7) * 19384.221;
    return {
      ang: (s1 - Math.floor(s1)) * Math.PI * 2,
      rad: 0.24 + (s2 - Math.floor(s2)) * 0.95,
      size: 1.4 + (s3 - Math.floor(s3)) * 3.4,
      speed: 0.15 + (s2 - Math.floor(s2)) * 0.45,
      phase: (s1 - Math.floor(s1)) * 6.283,
      hue: i % 3,
    };
  });

  function drawFallbackBackdrop(ctx, w, h, cx, cy, isPrism, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.52);
    if (isPrism) {
      g.addColorStop(0, 'rgba(26, 48, 78, 0.95)');
      g.addColorStop(0.55, 'rgba(10, 14, 28, 0.92)');
      g.addColorStop(1, 'rgba(6, 8, 16, 0)');
    } else {
      g.addColorStop(0, 'rgba(22, 30, 48, 0.96)');
      g.addColorStop(0.55, 'rgba(10, 12, 20, 0.94)');
      g.addColorStop(1, 'rgba(6, 7, 12, 0)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Draw Style 3 High-DPI Canvas overlay: spectral ticks, gothic rose tracery, faceted gems, crystal Materia emblem
  function renderPrismFX(ctx, w, h, time, progress, depart, hasGL) {
    ctx.clearRect(0, 0, w, h);
    const fadeOut = 1 - easeOutCubic(depart);
    if (fadeOut <= 0.002) return;

    const cx = w * 0.5;
    const cy = h * 0.44;
    const R = Math.min(w, h) * 0.365;

    if (!hasGL) drawFallbackBackdrop(ctx, w, h, cx, cy, true, fadeOut);

    const openT = easeOutCubic(time / 0.85);
    const crystalBloom = easeOutBack((time - 0.16) / 0.85);
    const emblemReveal = easeOutBack((time - 0.34) / 0.72);
    const rot = time * 0.065 + depart * 0.55;

    ctx.save();
    ctx.globalAlpha = fadeOut * clamp01(time / 0.25 + 0.1);
    ctx.translate(cx, cy);
    if (depart > 0) {
      const s = 1 + depart * 0.16;
      ctx.scale(s, s);
    }

    // 1. Outer astronomical spectral calibration rings & 180 ticks
    ctx.save();
    ctx.rotate(rot * 0.4);
    const outerR = R * 1.24;
    const innerCalR = R * 1.07;

    ctx.strokeStyle = 'rgba(190, 232, 255, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(235, 224, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, innerCalR, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const major = i % 15 === 0;
      const mid = i % 5 === 0;
      const len = major ? 10 : mid ? 6 : 3;
      ctx.strokeStyle = major ? 'rgba(255, 240, 210, 0.78)' : 'rgba(180, 228, 255, 0.32)';
      ctx.lineWidth = major ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (outerR - len), Math.sin(a) * (outerR - len));
      ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
      ctx.stroke();
    }

    // 4 orbiting optical glint dots on outer calibration ring
    for (let k = 0; k < 4; k++) {
      const ga = k * Math.PI * 0.5 + time * 0.25;
      const gx = Math.cos(ga) * outerR;
      const gy = Math.sin(ga) * outerR;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 9);
      gg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      gg.addColorStop(0.35, 'rgba(130, 235, 255, 0.55)');
      gg.addColorStop(1, 'rgba(130, 235, 255, 0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. 12-fold Gothic Rose Window Platinum Filigree Tracery & 24 Rim Jewels
    ctx.save();
    ctx.scale(0.86 + 0.14 * openT, 0.86 + 0.14 * openT);
    ctx.rotate(-rot * 0.22);

    // Beveled metallic outer frame
    const frameGrad = ctx.createLinearGradient(-R, -R, R, R);
    frameGrad.addColorStop(0, 'rgba(235, 246, 255, 0.86)');
    frameGrad.addColorStop(0.35, 'rgba(162, 188, 230, 0.65)');
    frameGrad.addColorStop(0.65, 'rgba(248, 224, 182, 0.78)');
    frameGrad.addColorStop(1, 'rgba(165, 225, 245, 0.84)');

    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.94, 0, Math.PI * 2);
    ctx.stroke();

    const sectors = 12;
    for (let i = 0; i < sectors; i++) {
      const a = (i / sectors) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);

      // Pointed gothic lancet arch
      ctx.strokeStyle = 'rgba(218, 232, 252, 0.64)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(R * 0.52, -R * 0.085);
      ctx.quadraticCurveTo(R * 0.78, -R * 0.16, R * 0.94, 0);
      ctx.quadraticCurveTo(R * 0.78, R * 0.16, R * 0.52, R * 0.085);
      ctx.stroke();

      // Inner gothic cusp tracery
      ctx.strokeStyle = 'rgba(182, 214, 248, 0.42)';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(R * 0.64, -R * 0.06);
      ctx.quadraticCurveTo(R * 0.77, 0, R * 0.64, R * 0.06);
      ctx.stroke();

      // Faceted teardrop / diamond gemstone in each gothic petal
      const jewelType = i % 3;
      const jr = R * 0.84;
      ctx.beginPath();
      ctx.moveTo(jr + 9, 0);
      ctx.lineTo(jr, -6.5);
      ctx.lineTo(jr - 11, 0);
      ctx.lineTo(jr, 6.5);
      ctx.closePath();

      const jg = ctx.createLinearGradient(jr - 11, -6, jr + 9, 6);
      if (jewelType === 0) {
        jg.addColorStop(0, 'rgba(255, 236, 185, 0.95)');
        jg.addColorStop(0.5, 'rgba(215, 168, 92, 0.86)');
        jg.addColorStop(1, 'rgba(130, 88, 34, 0.9)');
      } else if (jewelType === 1) {
        jg.addColorStop(0, 'rgba(165, 255, 250, 0.95)');
        jg.addColorStop(0.5, 'rgba(24, 186, 198, 0.88)');
        jg.addColorStop(1, 'rgba(16, 78, 112, 0.92)');
      } else {
        jg.addColorStop(0, 'rgba(232, 195, 255, 0.95)');
        jg.addColorStop(0.5, 'rgba(142, 72, 224, 0.88)');
        jg.addColorStop(1, 'rgba(54, 24, 118, 0.92)');
      }
      ctx.fillStyle = jg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.restore();
    }

    // 3. 36 Fibonacci-Spiral Dichroic Crystal Shards (Inner Wreath)
    const shardCount = 36;
    for (let i = 0; i < shardCount; i++) {
      const stagger = clamp01((time - 0.14 - (i / shardCount) * 0.32) / 0.45);
      const scaleS = easeOutBack(stagger);
      if (scaleS <= 0.01) continue;

      const ring = i % 2;
      const baseA = (i / shardCount) * Math.PI * 2 + ring * 0.14;
      const dist = R * (ring === 0 ? 0.56 : 0.43) * (0.65 + 0.35 * scaleS);
      const tilt = baseA + 0.52 + Math.sin(time * 0.8 + i) * 0.03;

      ctx.save();
      ctx.translate(Math.cos(baseA) * dist, Math.sin(baseA) * dist);
      ctx.rotate(tilt);
      ctx.scale(scaleS, scaleS);

      const len = R * (ring === 0 ? 0.22 : 0.17);
      const wid = R * (ring === 0 ? 0.048 : 0.038);

      // Elongated hexagonal crystal prism
      ctx.beginPath();
      ctx.moveTo(len * 0.65, 0);
      ctx.lineTo(len * 0.15, -wid);
      ctx.lineTo(-len * 0.55, -wid * 0.62);
      ctx.lineTo(-len * 0.72, 0);
      ctx.lineTo(-len * 0.55, wid * 0.62);
      ctx.lineTo(len * 0.15, wid);
      ctx.closePath();

      const phase = (i / shardCount) + progress * 0.45 + time * 0.06;
      const tint = i % 4;
      const sg = ctx.createLinearGradient(-len * 0.7, -wid, len * 0.65, wid);
      if (tint === 0) {
        sg.addColorStop(0, 'rgba(24, 210, 224, 0.78)');
        sg.addColorStop(0.5, 'rgba(182, 248, 255, 0.88)');
        sg.addColorStop(1, 'rgba(130, 82, 235, 0.74)');
      } else if (tint === 1) {
        sg.addColorStop(0, 'rgba(168, 86, 245, 0.78)');
        sg.addColorStop(0.5, 'rgba(245, 220, 255, 0.86)');
        sg.addColorStop(1, 'rgba(42, 198, 212, 0.74)');
      } else if (tint === 2) {
        sg.addColorStop(0, 'rgba(255, 212, 140, 0.78)');
        sg.addColorStop(0.5, 'rgba(255, 250, 235, 0.90)');
        sg.addColorStop(1, 'rgba(90, 212, 232, 0.72)');
      } else {
        sg.addColorStop(0, 'rgba(120, 235, 245, 0.72)');
        sg.addColorStop(0.45, 'rgba(255, 232, 195, 0.88)');
        sg.addColorStop(1, 'rgba(170, 95, 240, 0.74)');
      }
      ctx.fillStyle = sg;
      ctx.fill();

      // Internal facet ridge & crisp edge
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.62 + 0.2 * Math.sin(phase * 6.28)})`;
      ctx.lineWidth = 0.95;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-len * 0.72, 0);
      ctx.lineTo(len * 0.65, 0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();

    // 4. Sculpted Crystalline Materia Emblem at Center
    if (emblemReveal > 0.01) {
      ctx.save();
      const coreR = R * 0.148;
      const embScale = 0.65 + 0.35 * emblemReveal;
      ctx.scale(embScale, embScale);

      // 8 razor-sharp faceted diamond starburst rays
      for (const ray of MATERIA_RAYS) {
        ctx.save();
        ctx.rotate(ray.angle);
        const start = coreR * 0.92;
        const tip = coreR + R * 0.25 * ray.len;
        const halfW = R * 0.032;

        // Upper light facet
        ctx.beginPath();
        ctx.moveTo(start, 0);
        ctx.lineTo(start + (tip - start) * 0.25, -halfW);
        ctx.lineTo(tip, 0);
        ctx.closePath();
        const fg1 = ctx.createLinearGradient(start, -halfW, tip, 0);
        fg1.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        fg1.addColorStop(0.6, 'rgba(224, 248, 255, 0.92)');
        fg1.addColorStop(1, 'rgba(255, 236, 192, 0.96)');
        ctx.fillStyle = fg1;
        ctx.fill();

        // Lower prismatic shadow facet
        ctx.beginPath();
        ctx.moveTo(start, 0);
        ctx.lineTo(start + (tip - start) * 0.25, halfW);
        ctx.lineTo(tip, 0);
        ctx.closePath();
        const fg2 = ctx.createLinearGradient(start, 0, tip, halfW);
        fg2.addColorStop(0, 'rgba(182, 232, 255, 0.88)');
        fg2.addColorStop(0.55, 'rgba(165, 196, 245, 0.82)');
        fg2.addColorStop(1, 'rgba(246, 222, 178, 0.94)');
        ctx.fillStyle = fg2;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(start, 0);
        ctx.lineTo(start + (tip - start) * 0.25, -halfW);
        ctx.lineTo(tip, 0);
        ctx.lineTo(start + (tip - start) * 0.25, halfW);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      // Luminous crystalline double core ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(175, 242, 255, 0.72)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 0.78, 0, Math.PI * 2);
      ctx.stroke();

      // Pearl / diamond satellite orb at upper-right
      const satDist = coreR + R * 0.25 * SAT_DIST;
      const sx = Math.cos(SAT_ANGLE) * satDist;
      const sy = Math.sin(SAT_ANGLE) * satDist;
      const satR = R * 0.036;
      const satG = ctx.createRadialGradient(sx - satR * 0.35, sy - satR * 0.35, 0.5, sx, sy, satR);
      satG.addColorStop(0, '#ffffff');
      satG.addColorStop(0.45, '#d8f4ff');
      satG.addColorStop(0.82, '#9ec3e6');
      satG.addColorStop(1, '#5878a8');
      ctx.fillStyle = satG;
      ctx.beginPath();
      ctx.arc(sx, sy, satR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 5. Drifting diamond/rhombus optical bokeh glints
    for (const sp of SPARKLES) {
      const a = sp.ang + time * sp.speed * 0.15;
      const rr = R * sp.rad * (0.9 + 0.1 * crystalBloom);
      const sx = Math.cos(a) * rr;
      const sy = Math.sin(a) * rr;
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(time * 2.8 + sp.phase), 3);
      if (pulse < 0.08) continue;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = fadeOut * pulse * 0.85;
      ctx.fillStyle = sp.hue === 0 ? '#ffffff' : sp.hue === 1 ? '#8ff6ff' : '#ffe3ad';
      const s = sp.size * (0.6 + 0.6 * pulse);
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.4);
      ctx.lineTo(s * 0.45, -s * 0.45);
      ctx.lineTo(s * 1.4, 0);
      ctx.lineTo(s * 0.45, s * 0.45);
      ctx.lineTo(0, s * 1.4);
      ctx.lineTo(-s * 0.45, s * 0.45);
      ctx.lineTo(-s * 1.4, 0);
      ctx.lineTo(-s * 0.45, -s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw Style 5 High-DPI Canvas overlay: gothic chrome thorn filigree arcs, beveled Materia chrome emblem, mirror satellite
  function renderChromeFX(ctx, w, h, time, _progress, depart, hasGL) {
    ctx.clearRect(0, 0, w, h);
    const fadeOut = 1 - easeOutCubic(depart);
    if (fadeOut <= 0.002) return;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const S = Math.min(w, h) * 0.42;

    if (!hasGL) drawFallbackBackdrop(ctx, w, h, cx, cy, false, fadeOut);

    const openT = easeOutCubic(time / 0.78);
    const embT = easeOutBack((time - 0.30) / 0.72);

    ctx.save();
    ctx.globalAlpha = fadeOut * clamp01(time / 0.22 + 0.1);
    ctx.translate(cx, cy);
    if (depart > 0) {
      const ds = 1 + depart * 0.22;
      ctx.scale(ds, ds);
    }

    // 1. Symmetrical Neo-Baroque Chrome Gothic Thorn Filigree Arcs framing left & right
    const thornAlpha = clamp01((time - 0.12) / 0.65);
    if (thornAlpha > 0.01) {
      const cubicPt = (p0, p1, p2, p3, t) => {
        const u = 1 - t;
        return {
          x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
        };
      };
      const p0 = { x: S * 0.46, y: -S * 0.84 };
      const p1 = { x: S * 1.14, y: -S * 0.48 };
      const p2 = { x: S * 1.14, y: S * 0.48 };
      const p3 = { x: S * 0.46, y: S * 0.84 };

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side * (0.86 + 0.14 * openT), 0.86 + 0.14 * openT);
        ctx.globalAlpha *= thornAlpha;

        // Tapered outer sweep crescent blade
        const metalGrad = ctx.createLinearGradient(S * 0.46, -S * 0.84, S * 1.05, S * 0.84);
        metalGrad.addColorStop(0, '#eef4ff');
        metalGrad.addColorStop(0.24, '#3d4c66');
        metalGrad.addColorStop(0.48, '#ffd493');
        metalGrad.addColorStop(0.72, '#242c3b');
        metalGrad.addColorStop(1, '#dce7f7');

        ctx.fillStyle = metalGrad;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(p1.x + 3, p1.y, p2.x + 3, p2.y, p3.x, p3.y);
        ctx.bezierCurveTo(p2.x - 4, p2.y, p1.x - 4, p1.y, p0.x, p0.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 0.7;
        ctx.stroke();

        // Connected sweeping gothic barbed filigree blades anchored directly on the crescent spine
        const thorns = [
          [0.14, 0.28, -0.22],
          [0.29, 0.24, -0.10],
          [0.44, 0.19,  0.04],
          [0.58, 0.21,  0.10],
          [0.72, 0.25,  0.16],
          [0.86, 0.26,  0.22],
        ];
        for (const [t, tlen, dirY] of thorns) {
          const base = cubicPt(p0, p1, p2, p3, t);
          const prev = cubicPt(p0, p1, p2, p3, Math.max(0, t - 0.045));
          const next = cubicPt(p0, p1, p2, p3, Math.min(1, t + 0.045));
          const tipX = base.x - S * tlen;
          const tipY = base.y + S * dirY;

          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.quadraticCurveTo(base.x - S * tlen * 0.48, base.y + S * dirY * 0.22, tipX, tipY);
          ctx.quadraticCurveTo(base.x - S * tlen * 0.34, next.y + S * dirY * 0.35, next.x, next.y);
          ctx.closePath();

          const tg = ctx.createLinearGradient(tipX, tipY, base.x, base.y);
          tg.addColorStop(0, '#ffffff');
          tg.addColorStop(0.32, '#9fb6d8');
          tg.addColorStop(0.68, '#1a202c');
          tg.addColorStop(1, '#e6ba7c');
          ctx.fillStyle = tg;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 2. Sculpted 3D-Beveled Liquid-Chrome Materia Emblem overlaid cleanly at center
    if (embT > 0.01) {
      ctx.save();
      const coreR = S * 0.23;
      const embScale = 0.62 + 0.38 * embT;
      ctx.scale(embScale, embScale);

      // Subtle dark backing aura around center ring so chrome bevel pops cleanly over wordmark
      const aura = ctx.createRadialGradient(0, 0, coreR * 0.4, 0, 0, coreR * 2.2);
      aura.addColorStop(0, 'rgba(6, 8, 16, 0.52)');
      aura.addColorStop(1, 'rgba(6, 8, 16, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 8 dagger-like beveled chrome starburst rays
      for (let i = 0; i < MATERIA_RAYS.length; i++) {
        const ray = MATERIA_RAYS[i];
        ctx.save();
        ctx.rotate(ray.angle);
        const start = coreR * 0.90;
        const tip = coreR + S * 0.44 * ray.len;
        const shoulder = start + (tip - start) * 0.16;
        const halfW = S * 0.044;

        // Bright silver-amber upper bevel face
        ctx.beginPath();
        ctx.moveTo(start, 0);
        ctx.lineTo(shoulder, -halfW);
        ctx.lineTo(tip, 0);
        ctx.closePath();
        const f1 = ctx.createLinearGradient(start, -halfW, tip, 0);
        f1.addColorStop(0, '#ffffff');
        f1.addColorStop(0.45, '#cfe0f5');
        f1.addColorStop(0.8, '#ffcf8f');
        f1.addColorStop(1, '#ffffff');
        ctx.fillStyle = f1;
        ctx.fill();

        // Dark obsidian-cobalt mirror lower bevel face
        ctx.beginPath();
        ctx.moveTo(start, 0);
        ctx.lineTo(shoulder, halfW);
        ctx.lineTo(tip, 0);
        ctx.closePath();
        const f2 = ctx.createLinearGradient(start, 0, tip, halfW);
        f2.addColorStop(0, '#2a354b');
        f2.addColorStop(0.45, '#111521');
        f2.addColorStop(0.82, '#5a739c');
        f2.addColorStop(1, '#dce7f5');
        ctx.fillStyle = f2;
        ctx.fill();

        // Specular ridge & outer silhouette edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.84)';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(start, 0);
        ctx.lineTo(shoulder, -halfW);
        ctx.lineTo(tip, 0);
        ctx.lineTo(shoulder, halfW);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      // Sculpted chrome double ring
      const ringGrad = ctx.createLinearGradient(-coreR, -coreR, coreR, coreR);
      ringGrad.addColorStop(0, '#ffffff');
      ringGrad.addColorStop(0.28, '#4e6080');
      ringGrad.addColorStop(0.55, '#ffd79b');
      ringGrad.addColorStop(0.78, '#1a202c');
      ringGrad.addColorStop(1, '#f0f6ff');

      ctx.strokeStyle = 'rgba(10, 14, 22, 0.72)';
      ctx.lineWidth = 7.5;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 0.84, 0, Math.PI * 2);
      ctx.stroke();

      // Hyper-reflective platinum satellite sphere at upper-right
      const satDist = coreR + S * 0.42 * SAT_DIST;
      const sx = Math.cos(SAT_ANGLE) * satDist;
      const sy = Math.sin(SAT_ANGLE) * satDist;
      const satR = S * 0.056;
      const sg = ctx.createRadialGradient(sx - satR * 0.36, sy - satR * 0.36, 0.5, sx, sy, satR);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(0.28, '#e8f1ff');
      sg.addColorStop(0.58, '#28364e');
      sg.addColorStop(0.84, '#d8a464');
      sg.addColorStop(1, '#8fb2e0');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, satR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.restore();
    }

    // 3. Subtle suspended liquid-chrome micro-droplets
    for (let i = 0; i < 14; i++) {
      const sp = SPARKLES[i];
      const a = sp.ang + time * 0.14;
      const rr = S * (0.62 + 0.58 * (i / 14));
      const dx = Math.cos(a) * rr * 1.15;
      const dy = Math.sin(a) * rr * 0.86;
      const dr = 2.2 + (i % 4) * 1.3;
      const dg = ctx.createRadialGradient(dx - dr * 0.35, dy - dr * 0.35, 0.3, dx, dy, dr);
      dg.addColorStop(0, '#ffffff');
      dg.addColorStop(0.45, '#5b7296');
      dg.addColorStop(0.82, '#e2b274');
      dg.addColorStop(1, '#1c2434');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  const glRenderer = createGLRenderer(glCanvas, style === 'prism' ? PRISM_FRAG : CHROME_FRAG);
  const fxCtx = fxCanvas.getContext('2d');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let playStart = 0;
  let departStart = 0;
  let rafId = 0;
  const departDuration = style === 'prism' ? 560 : 580;

  function renderFrame(now) {
    const rect = fxCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || 760));
    const h = Math.max(1, Math.round(rect.height || 560));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const fw = Math.round(w * dpr);
    const fh = Math.round(h * dpr);
    if (fxCanvas.width !== fw || fxCanvas.height !== fh) {
      fxCanvas.width = fw;
      fxCanvas.height = fh;
    }

    const time = reducedMotion ? 2.0 : (playStart ? Math.max(0, (now - playStart) / 1000) : 0);
    const progress = reducedMotion ? 1 : (typeof window.__materiaStartupProgress === 'number' ? window.__materiaStartupProgress : 0);
    const depart = (!reducedMotion && departStart) ? clamp01((now - departStart) / departDuration) : 0;

    if (glRenderer) {
      glRenderer.render(w, h, dpr, time, progress, depart);
    }
    if (fxCtx) {
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (style === 'prism') {
        renderPrismFX(fxCtx, w, h, time, progress, depart, Boolean(glRenderer));
      } else {
        renderChromeFX(fxCtx, w, h, time, progress, depart, Boolean(glRenderer));
      }
    }

    if (!reducedMotion && (!departStart || depart < 1)) {
      rafId = requestAnimationFrame(renderFrame);
    } else {
      rafId = 0;
    }
  }

  function sync() {
    if (reducedMotion) {
      if (!rafId) renderFrame(performance.now());
      return;
    }
    if (root.classList.contains('playing') && !playStart) {
      playStart = performance.now();
      if (!rafId) rafId = requestAnimationFrame(renderFrame);
    }
    if (root.classList.contains('depart') && !departStart) {
      departStart = performance.now();
      if (!rafId) rafId = requestAnimationFrame(renderFrame);
    }
  }

  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => {
    if (!rafId) renderFrame(performance.now());
  });
  renderFrame(performance.now());
  sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
