import {mountScore} from './music-score.js';
import {createPlaybackEffect} from './music-playback-effect.js';

// Curated painterly color-field palettes: [bg, blob1, blob2, blob3, blob4]
const PALETTES = [
  // 0: Deep Cobalt, Warm Amber, Crimson, Celadon
  [[12, 18, 34], [34, 82, 214], [234, 132, 58], [198, 56, 94], [84, 194, 198]],
  // 1: Emerald Pine, Terracotta, Ochre Gold, Dusk Teal
  [[12, 24, 21], [24, 132, 106], [220, 106, 66], [196, 162, 68], [44, 102, 136]],
  // 2: Royal Violet, Rose, Warm Gold, Indigo
  [[20, 12, 30], [112, 46, 196], [228, 90, 134], [242, 170, 86], [42, 72, 178]],
  // 3: Sunset Coral, Apricot, Midnight Indigo, Magenta
  [[26, 14, 18], [234, 78, 62], [244, 158, 74], [38, 62, 142], [186, 50, 128]],
  // 4: Glacial Aurora, Mint, Deep Ocean, Lavender
  [[9, 20, 28], [38, 186, 172], [74, 204, 122], [28, 76, 168], [132, 94, 224]],
  // 5: Cinnabar, Caramel, Jade Ink, Warm Ivory
  [[24, 14, 12], [218, 64, 48], [222, 142, 54], [32, 114, 98], [236, 190, 126]]
];

function pickPalette(name) {
  if (!name) return PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

function drawSmoothClosedLoop(ctx, pts) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % n];
    const mx = (p0.x + p1.x) * 0.5;
    const my = (p0.y + p1.y) * 0.5;
    if (i === 0) {
      const prev = pts[n - 1];
      ctx.moveTo((prev.x + p0.x) * 0.5, (prev.y + p0.y) * 0.5);
    }
    ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
  }
  ctx.closePath();
}

export function createMusicWorkspace({host: room}) {
  room.innerHTML = `
    <div class="music-stage-full" id="music-stage-full">
      <canvas class="music-canvas" aria-label="全屏色彩声场"></canvas>
      <div class="music-grain" aria-hidden="true"></div>

      <button type="button" id="music-prev" class="music-edge-zone is-prev" aria-label="上一首"><span>←</span></button>
      <button type="button" id="music-next" class="music-edge-zone is-next" aria-label="下一首"><span>→</span></button>

      <nav class="music-corner-nav music-hud" aria-label="音乐空间工具">
        <button type="button" id="music-theme-toggle" class="music-ghost-btn" aria-expanded="false">主题</button>
        <button type="button" id="music-remap-toggle" class="music-ghost-btn" aria-expanded="false">转调</button>
        <button type="button" id="music-drawer-toggle" class="music-ghost-btn" aria-expanded="false">目录</button>
        <button type="button" id="music-score-toggle" class="music-ghost-btn">记谱</button>
        <button type="button" id="music-signal-toggle" class="music-ghost-btn" hidden>卷帘</button>
      </nav>

      <div class="music-theme-popover" id="music-theme-popover" hidden>
        <span class="music-theme-heading">视觉主题</span>
        <button type="button" class="music-theme-option" data-theme="halo" aria-pressed="true">
          <span>流光声环</span><small>色场 · 光环</small>
        </button>
        <button type="button" class="music-theme-option" data-theme="ink" aria-pressed="false">
          <span>墨线声环</span><small>极简 · 纸感</small>
        </button>
        <button type="button" class="music-theme-option" data-theme="piano" aria-pressed="false">
          <span>流光琴键</span><small>电钢 · 光流</small>
        </button>
      </div>

      <div class="music-remap-popover" id="music-remap-popover" hidden>
        <audio preload="metadata" hidden></audio>
      </div>

      <div class="music-bottom-bar music-hud">
        <div class="music-headline-row">
          <div class="music-title-mask">
            <h2 id="music-title">轻触画布 · 聆听色彩</h2>
          </div>
          <div class="music-meta-right">
            <button type="button" id="music-play" class="music-play-indicator" aria-label="播放">PLAY</button>
            <div class="music-time" aria-live="off">
              <strong id="music-elapsed">00:00</strong> / <span id="music-duration">00:00</span>
            </div>
          </div>
        </div>
        <div class="music-scrubber-wrap" id="music-scrubber-wrap">
          <div class="music-scrubber-track">
            <div class="music-scrubber-fill" id="music-scrubber-fill"></div>
          </div>
          <input id="music-scrubber" class="music-scrubber-input" type="range" min="0" max="1000" value="0" aria-label="播放进度">
        </div>
      </div>

      <div class="music-drawer-backdrop" id="music-drawer-backdrop"></div>
      <aside class="music-drawer" id="music-drawer" aria-label="音乐库">
        <div class="music-drawer-head">
          <span>曲目索引</span>
          <div class="music-drawer-actions">
            <button type="button" id="music-folder" class="music-drawer-btn">打开目录</button>
            <button type="button" id="music-refresh" class="music-drawer-btn">刷新</button>
            <button type="button" id="music-drawer-close" class="music-drawer-btn">收起</button>
          </div>
        </div>
        <p id="music-status" role="status"></p>
        <div id="music-list"></div>
        <input id="music-picker" type="file" accept="audio/*" multiple hidden>
        <div class="music-drawer-footer">
          <label>音量 <input id="music-volume" type="range" min="0" max="1" step="0.02" value="0.85" aria-label="音量"></label>
          <select id="music-mode" aria-label="播放模式">
            <option>顺序播放</option>
            <option>列表循环</option>
            <option>单曲循环</option>
            <option>随机播放</option>
          </select>
        </div>
      </aside>

      <div class="music-overlay-panel" id="music-score-overlay" hidden>
        <button type="button" class="music-overlay-close" id="music-score-close">返回色彩空间 ×</button>
        <section class="music-score"></section>
      </div>

      <div class="music-overlay-panel" id="music-signal-overlay" hidden>
        <button type="button" class="music-overlay-close" id="music-signal-close">返回色彩空间 ×</button>
      </div>
    </div>`;

  const get = id => room.querySelector('#music-' + id);
  const stageFull = get('stage-full');
  const audio = room.querySelector('audio');
  const scoreHost = room.querySelector('.music-score');
  const effect = createPlaybackEffect(audio, scoreHost);
  const disposeScore = mountScore(scoreHost, audio, (scale, tonic, offsets, original) => {
    effect.change(scale, tonic, offsets, original);
    const active = !original && offsets.some(Boolean);
    const btn = get('remap-toggle');
    if (btn) {
      btn.classList.toggle('is-active', active);
      btn.textContent = active ? `转调 · ${scale}` : '转调';
    }
  });
  effect.bind();
  const canvas = room.querySelector('.music-canvas');
  const pen = canvas.getContext('2d');
  const desktop = window.materiaDesktop;
  const localFiles = new Map();

  let tracks = [], current = '', url = '', generation = 0;
  let context, analyser, bins, timeData, animation;
  let dragging = false;
  let idleTimer = null;
  let wheelLock = 0;

  // Visual theme state: 'halo' | 'ink' | 'piano'
  let visualTheme = (() => {
    try {
      const saved = localStorage.getItem('materia-music-theme');
      return ['halo', 'ink', 'piano'].includes(saved) ? saved : 'halo';
    } catch { return 'halo'; }
  })();

  // 49-key electric piano (MIDI 36 C2 .. 84 C6) state & falling light streams
  const PIANO_START = 36, PIANO_KEYS = 49;
  const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const keyEnergy = new Float32Array(PIANO_KEYS);
  const keyHold = new Float32Array(PIANO_KEYS);
  const pianoStreams = []; // {key, y, len, alpha, speed, col}

  // Color-field interpolation state (current RGB smoothly lerps toward target RGB)
  let targetPal = PALETTES[0];
  const curPal = PALETTES[0].map(c => [...c]);

  // Organic color-field blobs (elliptical, rotating, drifting across full viewport)
  const blobs = [
    {x: 0.28, y: 0.34, r: 0.56, sx: 1.35, sy: 0.85, fx: 0.23, fy: 0.19, p: 0.0, rot: 0.2},
    {x: 0.74, y: 0.62, r: 0.52, sx: 1.2, sy: 0.9, fx: 0.17, fy: 0.27, p: 1.7, rot: 1.1},
    {x: 0.62, y: 0.24, r: 0.44, sx: 1.4, sy: 0.75, fx: 0.29, fy: 0.15, p: 3.1, rot: 2.3},
    {x: 0.32, y: 0.76, r: 0.48, sx: 1.15, sy: 0.95, fx: 0.21, fy: 0.24, p: 4.5, rot: 0.7}
  ];

  // Interactive chromatic ripples & beat pulse rings
  const ripples = [];
  const pulseRings = [];
  const smoothBins = new Float32Array(72);
  const peakBins = new Float32Array(72);
  const sparks = Array.from({length: 28}, (_, i) => ({
    angle: (i / 28) * Math.PI * 2,
    orbit: 0.92 + (i % 5) * 0.08,
    speed: (i % 2 ? 1 : -1) * (0.004 + (i % 4) * 0.002),
    size: 1.2 + (i % 3) * 0.75
  }));
  const pointer = {x: 0.5, y: 0.5, tx: 0.5, ty: 0.5};
  let time = 0;
  let smoothBass = 0, smoothMid = 0, smoothHigh = 0;
  let prevBass = 0, beatCooldown = 0;
  let switchWave = 0;

  audio.volume = 0.85;

  function wakeHud() {
    stageFull.classList.remove('is-idle');
    clearTimeout(idleTimer);
    if (!audio.paused) {
      idleTimer = setTimeout(() => {
        if (!get('drawer').classList.contains('is-open')) {
          stageFull.classList.add('is-idle');
        }
      }, 3200);
    }
  }

  stageFull.addEventListener('pointermove', e => {
    wakeHud();
    const rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      pointer.tx = (e.clientX - rect.left) / rect.width;
      pointer.ty = (e.clientY - rect.top) / rect.height;
    }
  });

  // Click canvas to play/pause + spawn chromatic ripple
  canvas.addEventListener('click', async e => {
    wakeHud();
    const rect = canvas.getBoundingClientRect();
    ripples.push({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      r: 0.02,
      alpha: 0.55
    });
    if (!current) {
      if (tracks.length) return play(tracks[0], 1);
      toggleDrawer(true);
      return;
    }
    if (audio.paused) {
      await context?.resume();
      await audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    syncTransport();
  });

  // Wheel gesture on canvas to switch tracks smoothly
  canvas.addEventListener('wheel', e => {
    if (!tracks.length) return;
    const now = performance.now();
    if (now - wheelLock < 650 || Math.abs(e.deltaY) < 18) return;
    wheelLock = now;
    step(e.deltaY > 0 ? 1 : -1);
  }, {passive: true});

  // Keyboard shortcuts when music workspace is visible
  function onKeyDown(e) {
    if (room.hidden || !get('score-overlay').hidden || !get('signal-overlay').hidden) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') { e.preventDefault(); get('play').click(); }
    else if (e.key === 'Escape') { toggleDrawer(false); }
  }
  window.addEventListener('keydown', onKeyDown);

  function toggleDrawer(open) {
    const drawer = get('drawer');
    const backdrop = get('drawer-backdrop');
    const isOpen = open ?? !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', isOpen);
    backdrop.classList.toggle('is-open', isOpen);
    get('drawer-toggle').setAttribute('aria-expanded', String(isOpen));
    wakeHud();
  }

  get('drawer-toggle').onclick = () => toggleDrawer();
  get('drawer-close').onclick = () => toggleDrawer(false);
  get('drawer-backdrop').onclick = () => toggleDrawer(false);

  function applyVisualTheme(next) {
    visualTheme = ['halo', 'ink', 'piano'].includes(next) ? next : 'halo';
    try { localStorage.setItem('materia-music-theme', visualTheme); } catch {}
    stageFull.classList.toggle('is-light-theme', visualTheme === 'ink' || visualTheme === 'piano');
    room.querySelectorAll('.music-theme-option').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.theme === visualTheme));
    });
  }
  applyVisualTheme(visualTheme);

  function closePopovers() {
    get('theme-popover').hidden = true;
    get('remap-popover').hidden = true;
    get('theme-toggle').setAttribute('aria-expanded', 'false');
    get('remap-toggle').setAttribute('aria-expanded', 'false');
  }

  get('theme-toggle').onclick = () => {
    toggleDrawer(false);
    const pop = get('theme-popover');
    const next = pop.hidden;
    closePopovers();
    pop.hidden = !next;
    get('theme-toggle').setAttribute('aria-expanded', String(next));
    wakeHud();
  };

  room.querySelectorAll('.music-theme-option').forEach(btn => {
    btn.onclick = () => {
      applyVisualTheme(btn.dataset.theme);
      closePopovers();
    };
  });

  get('remap-toggle').onclick = () => {
    toggleDrawer(false);
    const pop = get('remap-popover');
    const next = pop.hidden;
    closePopovers();
    pop.hidden = !next;
    get('remap-toggle').setAttribute('aria-expanded', String(next));
    wakeHud();
  };
  get('score-toggle').onclick = () => { toggleDrawer(false); closePopovers(); get('score-overlay').hidden = false; };
  get('score-close').onclick = () => { get('score-overlay').hidden = true; };
  get('signal-toggle').onclick = () => { toggleDrawer(false); get('signal-overlay').hidden = false; };
  get('signal-close').onclick = () => { get('signal-overlay').hidden = true; };

  function syncCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => syncCanvasSize())
    : null;
  resizeObserver?.observe(canvas);

  function setTitleCinematic(text, direction = 1) {
    const el = get('title');
    if (el.textContent === text) return;
    const exitCls = direction >= 0 ? 'is-exit-up' : 'is-exit-down';
    const enterCls = direction >= 0 ? 'is-enter-from-below' : 'is-enter-from-above';
    el.classList.add(exitCls);
    setTimeout(() => {
      el.textContent = text;
      el.classList.remove(exitCls);
      el.classList.add(enterCls);
      void el.offsetWidth;
      el.classList.remove(enterCls);
    }, 220);
  }

  function drawFrame() {
    syncCanvasSize();
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    // Smoothly interpolate entire 5-color palette toward current track's mood
    for (let c = 0; c < 5; c++) {
      for (let k = 0; k < 3; k++) {
        curPal[c][k] += (targetPal[c][k] - curPal[c][k]) * 0.032;
      }
    }

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    switchWave *= 0.94;

    const playing = !audio.paused && !!analyser;
    let bass = 0, mid = 0, high = 0;
    if (playing && bins && timeData) {
      analyser.getByteFrequencyData(bins);
      analyser.getByteTimeDomainData(timeData);
      for (let i = 0; i < 14; i++) bass += bins[i];
      for (let i = 14; i < 70; i++) mid += bins[i];
      for (let i = 70; i < 180; i++) high += bins[i];
      bass /= 14 * 255;
      mid /= 56 * 255;
      high /= 110 * 255;
      for (let i = 0; i < 72; i++) {
        const idx = Math.min(bins.length - 1, Math.floor(2 ** (i * 8.6 / 72)));
        const v = bins[idx] / 255;
        smoothBins[i] += (v - smoothBins[i]) * 0.2;
        peakBins[i] = Math.max(v, peakBins[i] - 0.012);
      }
    } else {
      for (let i = 0; i < 72; i++) {
        smoothBins[i] += (0 - smoothBins[i]) * 0.08;
        peakBins[i] *= 0.94;
      }
    }

    // Beat pulse detection
    if (beatCooldown > 0) beatCooldown--;
    if (playing && bass - prevBass > 0.14 && bass > 0.35 && beatCooldown === 0) {
      pulseRings.push({r: 1.0, alpha: 0.65, width: 2.2});
      beatCooldown = 14;
    }
    prevBass = bass;

    smoothBass += (bass - smoothBass) * 0.1;
    smoothMid += (mid - smoothMid) * 0.1;
    smoothHigh += (high - smoothHigh) * 0.12;
    time += (playing ? 0.008 + smoothMid * 0.022 : 0.004) + switchWave * 0.035;

    // Special minimalist light-paper gallery mode ('ink')
    if (visualTheme === 'ink') {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const st = getComputedStyle(room);
      const colCanvas = st.getPropertyValue('--canvas').trim() || '#f7f7f2';
      const colInk = st.getPropertyValue('--ink').trim() || '#273d3e';
      const colTeal = st.getPropertyValue('--teal').trim() || '#285d59';
      const colMuted = st.getPropertyValue('--muted').trim() || '#8b9692';
      const colLine = st.getPropertyValue('--line').trim() || '#e5e9e3';

      pen.globalCompositeOperation = 'source-over';
      pen.fillStyle = colCanvas;
      pen.fillRect(0, 0, w, h);

      const cx = w * 0.5 + (pointer.x - 0.5) * 18 * dpr;
      const cy = h * 0.47 + (pointer.y - 0.5) * 12 * dpr;
      const baseR = Math.min(w, h) * 0.31 * (1 - switchWave * 0.08);

      // Subtle breathing tint aura
      const auraR = baseR * (1.28 + smoothBass * 0.25);
      const aGrad = pen.createRadialGradient(cx, cy, baseR * 0.15, cx, cy, auraR);
      aGrad.addColorStop(0, 'transparent');
      aGrad.addColorStop(0.55, colTeal);
      aGrad.addColorStop(1, 'transparent');
      pen.save();
      pen.globalAlpha = playing ? (0.035 + smoothBass * 0.07) : 0.025;
      pen.fillStyle = aGrad;
      pen.beginPath();
      pen.arc(cx, cy, auraR, 0, Math.PI * 2);
      pen.fill();
      pen.restore();

      // Architectural crosshairs & concentric grooves
      pen.save();
      pen.strokeStyle = colLine;
      pen.lineWidth = 1 * dpr;
      pen.globalAlpha = 0.75;
      pen.beginPath();
      pen.moveTo(cx - baseR * 1.48, cy);
      pen.lineTo(cx + baseR * 1.48, cy);
      pen.moveTo(cx, cy - baseR * 1.32);
      pen.lineTo(cx, cy + baseR * 1.32);
      pen.stroke();
      for (const mult of [0.54, 0.78, 1.0, 1.2]) {
        pen.beginPath();
        pen.arc(cx, cy, baseR * mult, 0, Math.PI * 2);
        pen.stroke();
      }
      pen.restore();

      // 72 precision vernier ticks
      pen.save();
      pen.strokeStyle = colTeal;
      pen.lineWidth = 1 * dpr;
      for (let i = 0; i < 72; i++) {
        const angle = (i / 72) * Math.PI * 2 + time * 0.14;
        const val = smoothBins[i];
        const inner = baseR * 1.22;
        const len = (4 + val * 26 + switchWave * 10) * dpr;
        pen.globalAlpha = 0.2 + val * 0.65;
        pen.beginPath();
        pen.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        pen.lineTo(cx + Math.cos(angle) * (inner + len), cy + Math.sin(angle) * (inner + len));
        pen.stroke();
      }
      pen.restore();

      // 3 smooth organic ink rings
      const inkRings = [
        {scale: 1.0, color: colInk, alpha: 0.9, width: 1.45 * dpr, freq: 3, amp: 0.24, dir: 0.5, off: 0},
        {scale: 0.87, color: colTeal, alpha: 0.65, width: 1.1 * dpr, freq: 5, amp: 0.18, dir: -0.38, off: 1.8},
        {scale: 1.09, color: colMuted, alpha: 0.34, width: 0.85 * dpr, freq: 2, amp: 0.14, dir: 0.24, off: 3.4}
      ];
      for (const ring of inkRings) {
        const pts = [];
        for (let i = 0; i < 64; i++) {
          const t = i / 64;
          const angle = t * Math.PI * 2 + time * ring.dir;
          const bIdx = Math.floor(Math.abs(Math.sin(t * Math.PI)) * 68);
          const audioMod = smoothBins[bIdx] * ring.amp * baseR;
          const idleWave = Math.sin(angle * ring.freq + time * 1.9 + ring.off) * baseR * (0.022 + smoothMid * 0.06);
          const subtleHarm = Math.cos(angle * (ring.freq + 2) - time * 1.3 + ring.off) * baseR * (0.012 + smoothBass * 0.04);
          const r = baseR * ring.scale + audioMod + idleWave + subtleHarm;
          pts.push({x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r});
        }
        pen.save();
        drawSmoothClosedLoop(pen, pts);
        pen.strokeStyle = ring.color;
        pen.globalAlpha = ring.alpha;
        pen.lineWidth = ring.width;
        pen.stroke();
        pen.restore();
      }

      // Orbiting fine ink dust + center dot
      pen.save();
      for (const sp of sparks.slice(0, 14)) {
        sp.angle += sp.speed * (playing ? 0.9 + smoothHigh * 3.2 : 0.6);
        const r = baseR * (sp.orbit * 0.86 + smoothHigh * 0.1);
        pen.fillStyle = colTeal;
        pen.globalAlpha = 0.25 + smoothHigh * 0.45;
        pen.beginPath();
        pen.arc(cx + Math.cos(sp.angle) * r, cy + Math.sin(sp.angle) * r, 1.3 * dpr, 0, Math.PI * 2);
        pen.fill();
      }
      pen.fillStyle = playing ? colTeal : colInk;
      pen.globalAlpha = 1;
      pen.beginPath();
      pen.arc(cx, cy, (3 + smoothBass * 3.5) * dpr, 0, Math.PI * 2);
      pen.fill();
      pen.restore();
      return;
    }

    // Pure global-theme solid background + B&W electric piano + melody-locked silk light streams ('piano')
    if (visualTheme === 'piano') {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const st = getComputedStyle(room);
      const colCanvas = st.getPropertyValue('--canvas').trim() || '#f7f7f2';
      const colTeal = st.getPropertyValue('--teal').trim() || '#285d59';
      const colLine = st.getPropertyValue('--line').trim() || '#e5e9e3';
      const colMuted = st.getPropertyValue('--muted').trim() || '#8b9692';

      // 1. Solid global theme background
      pen.globalCompositeOperation = 'source-over';
      pen.fillStyle = colCanvas;
      pen.fillRect(0, 0, w, h);

      // Keyboard geometry with generous breathing room above bottom title bar
      const padX = Math.max(28 * dpr, w * 0.048);
      const kbW = w - padX * 2;
      const kbH = Math.min(138 * dpr, Math.max(82 * dpr, h * 0.175));
      const kbY = h - kbH - Math.max(122 * dpr, h * 0.185);

      // Subtle architectural staff lines in upper negative space (whisper-quiet gallery detail)
      pen.save();
      pen.strokeStyle = colLine;
      pen.lineWidth = 1;
      pen.globalAlpha = 0.55;
      const staffMid = kbY * 0.44;
      const staffGap = Math.max(14 * dpr, kbY * 0.045);
      for (let s = -2; s <= 2; s++) {
        const sy = Math.round(staffMid + s * staffGap) + 0.5;
        pen.beginPath();
        pen.moveTo(padX, sy);
        pen.lineTo(w - padX, sy);
        pen.stroke();
      }
      pen.restore();

      // 2. Balanced full-range melody pitch extraction (4096 FFT + local peak picking)
      const sr = context?.sampleRate || 44100;
      const fft = analyser?.fftSize || 4096;
      const rawKey = new Float32Array(PIANO_KEYS);
      let meanLevel = 0;

      if (playing && bins) {
        for (let k = 0; k < PIANO_KEYS; k++) {
          const midi = PIANO_START + k;
          const hz = 440 * 2 ** ((midi - 69) / 12);
          const bin = Math.round((hz * fft) / sr);
          if (bin >= 2 && bin < bins.length - 2) {
            const fund = Math.max(bins[bin - 1], bins[bin], bins[bin + 1]) / 255;
            const h2Bin = Math.min(bins.length - 2, bin * 2);
            const h2 = Math.max(bins[h2Bin - 1], bins[h2Bin], bins[h2Bin + 1]) / 255;
            // Balanced weighting across bass, melody (C3..C5), and upper treble
            const regWeight = k < 12 ? 0.88 : k < 36 ? 1.15 : 0.92;
            rawKey[k] = (fund * 0.76 + h2 * 0.24) * regWeight;
            meanLevel += rawKey[k];
          }
        }
        meanLevel /= PIANO_KEYS;
      }

      for (let k = 0; k < PIANO_KEYS; k++) {
        let energy = 0;
        if (playing && bins) {
          const v = rawKey[k];
          const left = k > 0 ? rawKey[k - 1] : 0;
          const right = k < PIANO_KEYS - 1 ? rawKey[k + 1] : 0;
          const isPeak = v >= left * 0.96 && v >= right * 0.96;
          const threshold = Math.max(0.2, meanLevel * 1.25);
          if (isPeak && v > threshold) {
            energy = Math.min(1, ((v - threshold) / (1 - threshold + 0.01)) * 1.55);
          }
        }
        keyEnergy[k] += (energy - keyEnergy[k]) * 0.3;
        keyHold[k] = Math.max(keyEnergy[k], keyHold[k] * 0.91);

        if (energy > 0.18 && pianoStreams.length < 85 && Math.random() < 0.48) {
          pianoStreams.push({
            key: k,
            y: 0,
            len: 0.18 + energy * 0.26,
            alpha: 0.38 + energy * 0.52,
            speed: 0.0095 + energy * 0.0055
          });
        }
      }

      // Build 49-key geometry
      const whiteCount = 29;
      const whiteW = kbW / whiteCount;
      const blackW = whiteW * 0.56;
      const blackH = kbH * 0.61;
      const keyRects = new Array(PIANO_KEYS);
      let wi = 0;
      for (let k = 0; k < PIANO_KEYS; k++) {
        const black = IS_BLACK[(PIANO_START + k) % 12] === 1;
        if (!black) {
          const x = padX + wi * whiteW;
          keyRects[k] = {x, cx: x + whiteW * 0.5, w: whiteW, h: kbH, black: false};
          wi++;
        } else {
          const x = padX + wi * whiteW - blackW * 0.5;
          keyRects[k] = {x, cx: x + blackW * 0.5, w: blackW, h: blackH, black: true};
        }
      }

      // 3. Soft dual-layer silk light streams falling onto active keys
      pen.save();
      for (let k = 0; k < PIANO_KEYS; k++) {
        const e = keyHold[k];
        if (e < 0.03) continue;
        const kr = keyRects[k];
        const beamTop = kbY * (1 - Math.min(0.92, 0.26 + e * 0.72));

        // Outer soft aura ribbon
        const haloW = (kr.black ? 8 : 12) * dpr * (0.65 + e * 0.55);
        const hGrad = pen.createLinearGradient(0, beamTop, 0, kbY);
        hGrad.addColorStop(0, 'transparent');
        hGrad.addColorStop(0.6, colTeal);
        hGrad.addColorStop(1, colTeal);
        pen.globalAlpha = e * 0.14;
        pen.fillStyle = hGrad;
        pen.fillRect(kr.cx - haloW * 0.5, beamTop, haloW, kbY - beamTop);

        // Inner slender silk core
        const coreW = (kr.black ? 1.5 : 2.2) * dpr;
        pen.globalAlpha = Math.min(0.75, e * 0.72);
        pen.fillStyle = hGrad;
        pen.fillRect(kr.cx - coreW * 0.5, beamTop, coreW, kbY - beamTop);

        // Soft horizontal ripple bloom at key contact point
        const impR = (10 + e * 22) * dpr;
        const iGrad = pen.createRadialGradient(kr.cx, kbY, 0, kr.cx, kbY, impR);
        iGrad.addColorStop(0, colTeal);
        iGrad.addColorStop(1, 'transparent');
        pen.globalAlpha = e * 0.34;
        pen.fillStyle = iGrad;
        pen.beginPath();
        pen.arc(kr.cx, kbY, impR, 0, Math.PI * 2);
        pen.fill();
      }

      // Cascading slender silk drops
      for (let i = pianoStreams.length - 1; i >= 0; i--) {
        const stStream = pianoStreams[i];
        stStream.y += stStream.speed;
        const kr = keyRects[stStream.key];
        const headY = stStream.y * kbY;
        const tailY = headY - stStream.len * kbY;
        if (tailY > kbY) { pianoStreams.splice(i, 1); continue; }
        const clampHead = Math.min(kbY, headY);
        const clampTail = Math.max(0, tailY);
        if (clampHead <= clampTail) continue;

        const sw = (kr.black ? 2.2 : 3.2) * dpr;
        const sGrad = pen.createLinearGradient(0, clampTail, 0, clampHead);
        sGrad.addColorStop(0, 'transparent');
        sGrad.addColorStop(0.82, colTeal);
        sGrad.addColorStop(1, colTeal);
        pen.globalAlpha = stStream.alpha * 0.42;
        pen.fillStyle = sGrad;
        pen.beginPath();
        pen.roundRect(kr.cx - sw * 0.5, clampTail, sw, clampHead - clampTail, sw * 0.5);
        pen.fill();
      }
      pen.restore();

      // 4. Refined Architectural Black & White Piano Keyboard
      pen.save();
      // Soft grounding shadow beneath the entire keyboard
      pen.shadowColor = 'rgba(0, 0, 0, 0.08)';
      pen.shadowBlur = 22 * dpr;
      pen.shadowOffsetY = 8 * dpr;
      pen.fillStyle = '#fcfcfa';
      pen.beginPath();
      pen.roundRect(padX, kbY, kbW, kbH, [2 * dpr, 2 * dpr, 5 * dpr, 5 * dpr]);
      pen.fill();
      pen.shadowColor = 'transparent';

      // White keys with subtle bottom radius & ivory shading
      for (let k = 0; k < PIANO_KEYS; k++) {
        const kr = keyRects[k];
        if (kr.black) continue;
        const e = keyHold[k];
        const pressOffset = e * 2.2 * dpr;

        const wg = pen.createLinearGradient(0, kbY, 0, kbY + kr.h);
        wg.addColorStop(0, '#f4f4f0');
        wg.addColorStop(0.14, '#ffffff');
        wg.addColorStop(0.92, '#fbfbf8');
        wg.addColorStop(1, '#ededeb');
        pen.fillStyle = wg;
        pen.beginPath();
        pen.roundRect(kr.x + 0.5, kbY, kr.w - 1, kr.h + pressOffset, [0, 0, 3.5 * dpr, 3.5 * dpr]);
        pen.fill();

        if (e > 0.04) {
          const ag = pen.createLinearGradient(0, kbY, 0, kbY + kr.h);
          ag.addColorStop(0, colTeal);
          ag.addColorStop(0.85, 'transparent');
          pen.save();
          pen.globalAlpha = Math.min(0.36, e * 0.38);
          pen.fillStyle = ag;
          pen.beginPath();
          pen.roundRect(kr.x + 0.5, kbY, kr.w - 1, kr.h + pressOffset, [0, 0, 3.5 * dpr, 3.5 * dpr]);
          pen.fill();
          pen.restore();
        }

        // Hairline key divider
        pen.strokeStyle = 'rgba(0, 0, 0, 0.09)';
        pen.lineWidth = 1;
        pen.beginPath();
        pen.moveTo(kr.x + kr.w, kbY);
        pen.lineTo(kr.x + kr.w, kbY + kr.h);
        pen.stroke();

        // Subtle octave C labels (C2..C6)
        const midi = PIANO_START + k;
        if (midi % 12 === 0) {
          pen.save();
          pen.fillStyle = colMuted;
          pen.globalAlpha = 0.5;
          pen.font = `${Math.round(9 * dpr)}px var(--sans, sans-serif)`;
          pen.textAlign = 'center';
          pen.fillText('C' + (Math.floor(midi / 12) - 1), kr.cx, kbY + kr.h - 7 * dpr);
          pen.restore();
        }
      }

      // Subtle felt rail along top edge of keyboard
      pen.fillStyle = 'rgba(0, 0, 0, 0.16)';
      pen.fillRect(padX, kbY, kbW, 2 * dpr);

      // Black keys with sculpted bevel, soft drop shadow & rounded tips
      for (let k = 0; k < PIANO_KEYS; k++) {
        const kr = keyRects[k];
        if (!kr.black) continue;
        const e = keyHold[k];
        const pressOffset = e * 1.5 * dpr;

        pen.save();
        pen.shadowColor = 'rgba(0, 0, 0, 0.22)';
        pen.shadowBlur = 5 * dpr;
        pen.shadowOffsetX = 1 * dpr;
        pen.shadowOffsetY = 3 * dpr;

        const bgKey = pen.createLinearGradient(0, kbY, 0, kbY + kr.h);
        bgKey.addColorStop(0, '#2a2d35');
        bgKey.addColorStop(0.84, '#15171c');
        bgKey.addColorStop(1, '#262930');
        pen.fillStyle = bgKey;
        pen.beginPath();
        pen.roundRect(kr.x, kbY, kr.w, kr.h + pressOffset, [0, 0, 3 * dpr, 3 * dpr]);
        pen.fill();
        pen.restore();

        // Subtle top bevel highlight on black key
        pen.fillStyle = 'rgba(255, 255, 255, 0.08)';
        pen.fillRect(kr.x + 2 * dpr, kbY + 2 * dpr, kr.w - 4 * dpr, kr.h - 10 * dpr);

        if (e > 0.04) {
          const abg = pen.createLinearGradient(0, kbY, 0, kbY + kr.h);
          abg.addColorStop(0, colTeal);
          abg.addColorStop(1, 'transparent');
          pen.save();
          pen.globalAlpha = Math.min(0.7, e * 0.75);
          pen.fillStyle = abg;
          pen.beginPath();
          pen.roundRect(kr.x, kbY, kr.w, kr.h + pressOffset, [0, 0, 3 * dpr, 3 * dpr]);
          pen.fill();
          pen.restore();
        }
      }
      pen.restore();
      return;
    }

    // 1. Deep chromatic base wash
    const bg = curPal[0];
    pen.globalCompositeOperation = 'source-over';
    pen.fillStyle = `rgb(${bg[0] | 0}, ${bg[1] | 0}, ${bg[2] | 0})`;
    pen.fillRect(0, 0, w, h);

    // 2. Large-scale painterly flowing color fields
    const maxDim = Math.max(w, h);
    pen.globalCompositeOperation = 'screen';

    blobs.forEach((b, idx) => {
      const col = curPal[idx + 1];
      const driftX = Math.sin(time * b.fx + b.p) * 0.22 + (pointer.x - 0.5) * (idx % 2 ? 0.14 : -0.1);
      const driftY = Math.cos(time * b.fy + b.p * 1.3) * 0.22 + (pointer.y - 0.5) * (idx % 2 ? -0.1 : 0.14);
      const cx = (b.x + driftX) * w;
      const cy = (b.y + driftY) * h;

      const energy = idx === 0 ? smoothBass : idx === 1 ? smoothMid : idx === 2 ? smoothHigh : (smoothBass + smoothHigh) * 0.5;
      const radius = maxDim * (b.r + energy * 0.22 + switchWave * 0.14);
      const angle = b.rot + time * (idx % 2 ? 0.18 : -0.14);

      pen.save();
      pen.translate(cx, cy);
      pen.rotate(angle);
      pen.scale(b.sx + energy * 0.25, b.sy);

      const grad = pen.createRadialGradient(0, 0, 0, 0, 0, radius);
      const r = col[0] | 0, g = col[1] | 0, bl = col[2] | 0;
      const peakAlpha = Math.min(0.92, 0.56 + energy * 0.34 + switchWave * 0.15);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${peakAlpha.toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${r}, ${g}, ${bl}, ${(peakAlpha * 0.48).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);

      pen.fillStyle = grad;
      pen.beginPath();
      pen.arc(0, 0, radius, 0, Math.PI * 2);
      pen.fill();
      pen.restore();
    });

    // 3. Soft flowing chromatic aurora veil driven by high/mid frequencies
    if (playing || switchWave > 0.02) {
      const veilCol = curPal[4];
      pen.save();
      pen.beginPath();
      const bands = 40;
      const baseY = h * 0.54;
      for (let i = 0; i <= bands; i++) {
        const t = i / bands;
        const x = t * w;
        const env = Math.sin(t * Math.PI);
        const wave = Math.sin(t * Math.PI * 3 + time * 2.2) * h * (0.06 + smoothMid * 0.14)
          + Math.cos(t * Math.PI * 5 - time * 1.6) * h * (0.03 + smoothHigh * 0.1);
        const y = baseY + wave * env;
        if (i === 0) pen.moveTo(x, y);
        else pen.lineTo(x, y);
      }
      pen.lineTo(w, h);
      pen.lineTo(0, h);
      pen.closePath();
      const vGrad = pen.createLinearGradient(0, baseY - h * 0.2, 0, h);
      vGrad.addColorStop(0, `rgba(${veilCol[0] | 0}, ${veilCol[1] | 0}, ${veilCol[2] | 0}, ${(0.12 + smoothHigh * 0.22).toFixed(3)})`);
      vGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      pen.fillStyle = vGrad;
      pen.fill();
      pen.restore();
    }

    // 4. Interactive chromatic ripples (on click / track switch)
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 0.018;
      rp.alpha *= 0.94;
      if (rp.alpha < 0.01) {
        ripples.splice(i, 1);
        continue;
      }
      const rx = rp.x * w;
      const ry = rp.y * h;
      const rad = rp.r * maxDim;
      const rc = curPal[2];
      const rGrad = pen.createRadialGradient(rx, ry, rad * 0.65, rx, ry, rad);
      rGrad.addColorStop(0, 'rgba(255,255,255,0)');
      rGrad.addColorStop(0.85, `rgba(${rc[0] | 0}, ${rc[1] | 0}, ${rc[2] | 0}, ${rp.alpha.toFixed(3)})`);
      rGrad.addColorStop(1, 'rgba(255,255,255,0)');
      pen.fillStyle = rGrad;
      pen.beginPath();
      pen.arc(rx, ry, rad, 0, Math.PI * 2);
      pen.fill();
    }

    // 5. Foreground Visual Theme ('halo' or 'piano')
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const c1 = curPal[1], c2 = curPal[2], c3 = curPal[3], c4 = curPal[4];

    if (visualTheme === 'piano') {
      // Map FFT spectrum to 49 piano keys (MIDI 36 C2 .. 84 C6)
      const sr = context?.sampleRate || 44100;
      const fft = analyser?.fftSize || 1024;
      for (let k = 0; k < PIANO_KEYS; k++) {
        let energy = 0;
        if (playing && bins) {
          const midi = PIANO_START + k;
          const hz = 440 * 2 ** ((midi - 69) / 12);
          const bin = Math.round((hz * fft) / sr);
          if (bin >= 1 && bin < bins.length - 1) {
            energy = Math.max(bins[bin - 1], bins[bin], bins[bin + 1]) / 255;
            energy = Math.max(0, (energy - 0.24) * 1.45);
          }
        } else {
          // Gentle ambient shimmer when paused
          energy = Math.max(0, Math.sin(time * 1.4 + k * 0.42) * 0.14 - 0.06);
        }
        keyEnergy[k] += (energy - keyEnergy[k]) * 0.26;
        keyHold[k] = Math.max(keyEnergy[k], keyHold[k] * 0.92);

        // Spawn slender vertical falling light stream when note energy rises
        if (keyEnergy[k] > 0.28 && Math.random() < keyEnergy[k] * 0.34 && pianoStreams.length < 90) {
          const palettePick = k % 3 === 0 ? c2 : k % 3 === 1 ? c4 : c3;
          pianoStreams.push({
            key: k,
            y: -0.08,
            len: 0.14 + keyEnergy[k] * 0.28,
            alpha: 0.35 + keyEnergy[k] * 0.6,
            speed: 0.0085 + keyEnergy[k] * 0.007,
            col: palettePick
          });
        }
      }

      // Compute keyboard geometry (positioned cleanly above bottom title bar)
      const padX = Math.max(24 * dpr, w * 0.045);
      const kbW = w - padX * 2;
      const kbH = Math.min(132 * dpr, Math.max(76 * dpr, h * 0.17));
      const kbY = h - kbH - Math.max(92 * dpr, h * 0.145);

      // Build white/black key layout
      const whiteCount = 29; // C2..C6 has 29 white keys
      const whiteW = kbW / whiteCount;
      const blackW = whiteW * 0.58;
      const blackH = kbH * 0.62;
      const keyRects = new Array(PIANO_KEYS);
      let wi = 0;
      for (let k = 0; k < PIANO_KEYS; k++) {
        const black = IS_BLACK[(PIANO_START + k) % 12] === 1;
        if (!black) {
          const x = padX + wi * whiteW;
          keyRects[k] = {x, cx: x + whiteW * 0.5, w: whiteW, h: kbH, black: false};
          wi++;
        } else {
          const x = padX + wi * whiteW - blackW * 0.5;
          keyRects[k] = {x, cx: x + blackW * 0.5, w: blackW, h: blackH, black: true};
        }
      }

      // 5p-1. Slender vertical light streams falling from top onto matching piano keys
      pen.save();
      pen.globalCompositeOperation = 'screen';

      // Subtle continuous vertical silk beams for active keys
      for (let k = 0; k < PIANO_KEYS; k++) {
        const e = keyHold[k];
        if (e < 0.04) continue;
        const kr = keyRects[k];
        const col = k % 3 === 0 ? c2 : k % 3 === 1 ? c4 : c3;
        const beamW = (kr.black ? 1.8 : 2.6) * dpr * (0.7 + e * 0.8);
        const beamTop = kbY * (1 - Math.min(0.95, 0.28 + e * 0.85));

        const bGrad = pen.createLinearGradient(0, beamTop, 0, kbY);
        bGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        bGrad.addColorStop(0.55, `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${(e * 0.55).toFixed(3)})`);
        bGrad.addColorStop(0.92, `rgba(255, 255, 255, ${(e * 0.82).toFixed(3)})`);
        bGrad.addColorStop(1, `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${(e * 0.9).toFixed(3)})`);

        pen.fillStyle = bGrad;
        pen.fillRect(kr.cx - beamW * 0.5, beamTop, beamW, kbY - beamTop);

        // Soft impact bloom at key top edge
        const impR = (10 + e * 24) * dpr;
        const iGrad = pen.createRadialGradient(kr.cx, kbY, 0, kr.cx, kbY, impR);
        iGrad.addColorStop(0, `rgba(255, 255, 255, ${(e * 0.65).toFixed(3)})`);
        iGrad.addColorStop(0.45, `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${(e * 0.38).toFixed(3)})`);
        iGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        pen.fillStyle = iGrad;
        pen.beginPath();
        pen.arc(kr.cx, kbY, impR, 0, Math.PI * 2);
        pen.fill();
      }

      // Falling slender light ribbons cascading downward into keys
      for (let i = pianoStreams.length - 1; i >= 0; i--) {
        const st = pianoStreams[i];
        st.y += st.speed;
        const kr = keyRects[st.key];
        const headY = st.y * kbY;
        const tailY = headY - st.len * kbY;
        if (tailY > kbY) { pianoStreams.splice(i, 1); continue; }
        const clampHead = Math.min(kbY, headY);
        const clampTail = Math.max(0, tailY);
        if (clampHead <= clampTail) continue;

        const sw = (kr.black ? 1.5 : 2.2) * dpr;
        const sGrad = pen.createLinearGradient(0, clampTail, 0, clampHead);
        sGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        sGrad.addColorStop(0.75, `rgba(${st.col[0] | 0}, ${st.col[1] | 0}, ${st.col[2] | 0}, ${(st.alpha * 0.72).toFixed(3)})`);
        sGrad.addColorStop(1, `rgba(255, 255, 255, ${Math.min(0.95, st.alpha).toFixed(3)})`);
        pen.fillStyle = sGrad;
        pen.fillRect(kr.cx - sw * 0.5, clampTail, sw, clampHead - clampTail);
      }
      pen.restore();

      // 5p-2. Sleek Dark-Glass Electric Piano Keyboard
      pen.save();
      pen.globalCompositeOperation = 'source-over';

      // White keys
      for (let k = 0; k < PIANO_KEYS; k++) {
        const kr = keyRects[k];
        if (kr.black) continue;
        const e = keyHold[k];
        const col = k % 3 === 0 ? c2 : k % 3 === 1 ? c4 : c3;

        const kGrad = pen.createLinearGradient(0, kbY, 0, kbY + kr.h);
        if (e > 0.04) {
          kGrad.addColorStop(0, `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${(0.28 + e * 0.52).toFixed(3)})`);
          kGrad.addColorStop(0.7, `rgba(255, 255, 255, ${(0.12 + e * 0.22).toFixed(3)})`);
          kGrad.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
        } else {
          kGrad.addColorStop(0, 'rgba(255, 255, 255, 0.085)');
          kGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
        }
        pen.fillStyle = kGrad;
        pen.fillRect(kr.x + 1, kbY, kr.w - 2, kr.h);

        pen.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        pen.lineWidth = 1;
        pen.strokeRect(kr.x + 0.5, kbY + 0.5, kr.w - 1, kr.h - 1);
      }

      // Black keys
      for (let k = 0; k < PIANO_KEYS; k++) {
        const kr = keyRects[k];
        if (!kr.black) continue;
        const e = keyHold[k];
        const col = k % 3 === 0 ? c2 : k % 3 === 1 ? c4 : c3;

        const bGrad = pen.createLinearGradient(0, kbY, 0, kbY + kr.h);
        bGrad.addColorStop(0, 'rgba(10, 13, 20, 0.92)');
        bGrad.addColorStop(1, e > 0.04
          ? `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${(0.42 + e * 0.5).toFixed(3)})`
          : 'rgba(20, 24, 34, 0.88)');
        pen.fillStyle = bGrad;
        pen.fillRect(kr.x, kbY, kr.w, kr.h);

        pen.strokeStyle = e > 0.05
          ? `rgba(255, 255, 255, ${(0.25 + e * 0.55).toFixed(3)})`
          : 'rgba(255, 255, 255, 0.14)';
        pen.lineWidth = 1;
        pen.strokeRect(kr.x + 0.5, kbY + 0.5, kr.w - 1, kr.h - 1);
      }
      pen.restore();
    } else {
    // 'halo' theme: Luminous Kinetic Halo Ring
    const rcx = w * 0.5 + (pointer.x - 0.5) * 26 * dpr;
    const rcy = h * 0.48 + (pointer.y - 0.5) * 18 * dpr;
    const haloR = Math.min(w, h) * 0.255 * (1 + smoothBass * 0.11 - switchWave * 0.08);

    // 5a. Beat shockwave rings expanding from halo
    for (let i = pulseRings.length - 1; i >= 0; i--) {
      const pr = pulseRings[i];
      pr.r += 0.022;
      pr.alpha *= 0.94;
      if (pr.alpha < 0.01) { pulseRings.splice(i, 1); continue; }
      pen.save();
      pen.strokeStyle = `rgba(${c4[0] | 0}, ${c4[1] | 0}, ${c4[2] | 0}, ${(pr.alpha * 0.72).toFixed(3)})`;
      pen.lineWidth = pr.width * dpr;
      pen.beginPath();
      pen.arc(rcx, rcy, haloR * pr.r, 0, Math.PI * 2);
      pen.stroke();
      pen.restore();
    }

    // 5b. 72 bidirectional gradient radial spectrum flares + subtle peak sparks
    pen.save();
    for (let i = 0; i < 72; i++) {
      const angle = (i / 72) * Math.PI * 2 + time * 0.16;
      const val = smoothBins[i];
      const pk = peakBins[i];
      const outLen = (4 + val * 56 + switchWave * 20) * dpr;
      const inLen = (2 + val * 20) * dpr;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const x1 = rcx + cos * (haloR - inLen);
      const y1 = rcy + sin * (haloR - inLen);
      const x2 = rcx + cos * (haloR + outLen);
      const y2 = rcy + sin * (haloR + outLen);

      const fGrad = pen.createLinearGradient(x1, y1, x2, y2);
      fGrad.addColorStop(0, `rgba(${c1[0] | 0}, ${c1[1] | 0}, ${c1[2] | 0}, 0.06)`);
      fGrad.addColorStop(0.5, `rgba(255, 255, 255, ${(0.2 + val * 0.52).toFixed(3)})`);
      fGrad.addColorStop(1, `rgba(${c2[0] | 0}, ${c2[1] | 0}, ${c2[2] | 0}, ${(0.14 + val * 0.72).toFixed(3)})`);

      pen.strokeStyle = fGrad;
      pen.lineWidth = (1.2 + val * 1.4) * dpr;
      pen.beginPath();
      pen.moveTo(x1, y1);
      pen.lineTo(x2, y2);
      pen.stroke();

      if (pk > 0.08) {
        const px = rcx + cos * (haloR + (9 + pk * 62) * dpr);
        const py = rcy + sin * (haloR + (9 + pk * 62) * dpr);
        pen.fillStyle = `rgba(255, 255, 255, ${(0.28 + pk * 0.52).toFixed(3)})`;
        pen.beginPath();
        pen.arc(px, py, (1.1 + pk * 1.3) * dpr, 0, Math.PI * 2);
        pen.fill();
      }
    }
    pen.restore();

    // 5c. Three intertwined glowing liquid ribbons (open center)
    const ribbons = [
      {scale: 1.0, col: [255, 255, 255], glow: c4, alpha: 0.78, width: 2.0 * dpr, freq: 3, amp: 0.28, dir: 0.5, off: 0},
      {scale: 0.94, col: c2, glow: c2, alpha: 0.74, width: 1.7 * dpr, freq: 5, amp: 0.22, dir: -0.38, off: 1.7},
      {scale: 1.06, col: c3, glow: c3, alpha: 0.62, width: 1.4 * dpr, freq: 4, amp: 0.2, dir: 0.28, off: 3.3}
    ];
    for (const rb of ribbons) {
      const pts = [];
      for (let i = 0; i < 72; i++) {
        const t = i / 72;
        const angle = t * Math.PI * 2 + time * rb.dir;
        const bIdx = Math.floor(Math.abs(Math.sin(t * Math.PI)) * 71);
        const mod = smoothBins[bIdx] * rb.amp * haloR;
        const wave = Math.sin(angle * rb.freq + time * 2.2 + rb.off) * haloR * (0.03 + smoothMid * 0.085)
          + Math.cos(angle * (rb.freq + 2) - time * 1.6 + rb.off) * haloR * (0.016 + smoothBass * 0.055);
        const r = haloR * rb.scale + mod + wave;
        pts.push({x: rcx + Math.cos(angle) * r, y: rcy + Math.sin(angle) * r});
      }
      pen.save();
      drawSmoothClosedLoop(pen, pts);
      pen.shadowColor = `rgb(${rb.glow[0] | 0}, ${rb.glow[1] | 0}, ${rb.glow[2] | 0})`;
      pen.shadowBlur = (12 + smoothBass * 18) * dpr;
      pen.strokeStyle = `rgba(${rb.col[0] | 0}, ${rb.col[1] | 0}, ${rb.col[2] | 0}, ${rb.alpha})`;
      pen.lineWidth = rb.width;
      pen.stroke();
      pen.restore();
    }

    // 5d. Orbiting luminous stardust sparks
    pen.save();
    for (const sp of sparks) {
      sp.angle += sp.speed * (playing ? 1 + smoothHigh * 4.0 : 0.7) + switchWave * 0.05;
      const sr = haloR * (sp.orbit + smoothHigh * 0.18 + Math.sin(time * 2 + sp.angle) * 0.045);
      const sx = rcx + Math.cos(sp.angle) * sr;
      const sy = rcy + Math.sin(sp.angle) * sr;
      pen.fillStyle = `rgba(255, 255, 255, ${(0.28 + smoothHigh * 0.55).toFixed(3)})`;
      pen.beginPath();
      pen.arc(sx, sy, sp.size * dpr, 0, Math.PI * 2);
      pen.fill();
    }
    pen.restore();
    }

    pen.globalCompositeOperation = 'source-over';
  }

  function startLoop() {
    cancelAnimationFrame(animation);
    const loop = () => {
      if (room.hidden) return;
      drawFrame();
      animation = requestAnimationFrame(loop);
    };
    animation = requestAnimationFrame(loop);
  }

  function syncTransport() {
    const playing = !audio.paused;
    get('play').textContent = playing ? 'PAUSE' : 'PLAY';
    get('play').setAttribute('aria-label', playing ? '暂停' : '播放');
    get('elapsed').textContent = formatTime(audio.currentTime);
    get('duration').textContent = formatTime(audio.duration);
    if (!dragging) {
      const ratio = audio.duration > 0 ? Math.min(1, audio.currentTime / audio.duration) : 0;
      const pct = (ratio * 100).toFixed(2) + '%';
      get('scrubber').value = String(Math.round(ratio * 1000));
      get('scrubber-fill').style.width = pct;
    }
    if (playing) wakeHud();
    else stageFull.classList.remove('is-idle');
  }

  function render() {
    const list = get('list');
    if (!tracks.length) {
      const hint = document.createElement('div');
      hint.className = 'music-empty-hint';
      hint.textContent = desktop?.musicList
        ? '将音频放入根目录的「音乐库」文件夹，随后点击刷新。'
        : '点击上方「打开目录」选择本地音频文件。';
      list.replaceChildren(hint);
    } else {
      list.replaceChildren(...tracks.map((name, idx) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'music-track-row';
        const isCurrent = name === current;
        button.setAttribute('aria-current', String(isCurrent));
        const num = String(idx + 1).padStart(2, '0');
        button.innerHTML = `<span class="music-track-index">${num}</span><span class="music-track-name"></span><span class="music-track-mark" aria-hidden="true">${isCurrent ? '●' : '→'}</span>`;
        button.querySelector('.music-track-name').textContent = stripExt(name);
        button.title = name;
        button.onclick = () => {
          const prevIdx = tracks.indexOf(current);
          play(name, idx >= prevIdx ? 1 : -1);
          toggleDrawer(false);
        };
        return button;
      }));
    }
    const empty = !tracks.length;
    get('prev').disabled = get('next').disabled = empty;
  }

  async function refresh() {
    try {
      tracks = desktop?.musicList ? await desktop.musicList() : [...localFiles.keys()];
      get('status').textContent = tracks.length ? `共 ${tracks.length} 首` : '';
      render();
    } catch {
      get('status').textContent = '读取失败';
    }
  }

  async function play(name, direction = 1) {
    const token = ++generation;
    switchWave = 1.0;
    ripples.push({x: direction >= 0 ? 0.8 : 0.2, y: 0.5, r: 0.04, alpha: 0.65});
    try {
      if (!context) {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.82;
        bins = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.frequencyBinCount);
        const source = context.createMediaElementSource(audio);
        analyser.connect(context.destination);
        void effect.connect(source, analyser);
      }
      await context.resume();
      let file = localFiles.get(name);
      if (!file) {
        const {bytes, type} = await desktop.musicRead(name);
        file = new Blob([bytes], {type});
      }
      if (token !== generation) return;
      const previous = url;
      url = URL.createObjectURL(file);
      audio.src = url;
      if (previous) URL.revokeObjectURL(previous);
      current = name;
      targetPal = pickPalette(name);
      setTitleCinematic(stripExt(name), direction);
      render();
      await audio.play();
      syncTransport();
    } catch {
      if (token === generation) get('status').textContent = '无法播放「' + stripExt(name) + '」';
    }
  }

  function step(direction, automatic = false) {
    if (!tracks.length) return;
    const index = tracks.indexOf(current);
    if (index < 0) return play(tracks[direction < 0 ? tracks.length - 1 : 0], direction);
    const mode = get('mode').selectedIndex;
    if (automatic && mode === 0 && index === tracks.length - 1) return;
    let next = index + direction;
    if (automatic && mode === 2) next = index;
    if (mode === 3 && tracks.length > 1) next = index + 1 + Math.floor(Math.random() * (tracks.length - 1));
    play(tracks[(next + tracks.length) % tracks.length], direction);
  }

  get('play').onclick = async () => {
    if (!current) {
      if (tracks.length) return play(tracks[0], 1);
      toggleDrawer(true);
      return;
    }
    if (audio.paused) {
      await context?.resume();
      await audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    syncTransport();
  };

  const scrubber = get('scrubber');
  const scrubberWrap = get('scrubber-wrap');
  scrubber.oninput = () => {
    dragging = true;
    scrubberWrap.classList.add('is-dragging');
    const ratio = Number(scrubber.value) / 1000;
    get('scrubber-fill').style.width = (ratio * 100).toFixed(2) + '%';
    if (audio.duration > 0) get('elapsed').textContent = formatTime(ratio * audio.duration);
  };
  scrubber.onchange = () => {
    dragging = false;
    scrubberWrap.classList.remove('is-dragging');
    if (audio.duration > 0) audio.currentTime = (Number(scrubber.value) / 1000) * audio.duration;
    syncTransport();
  };

  get('volume').oninput = e => { audio.volume = Number(e.target.value); };

  audio.addEventListener('play', syncTransport);
  audio.addEventListener('pause', syncTransport);
  audio.addEventListener('timeupdate', syncTransport);
  audio.addEventListener('loadedmetadata', syncTransport);
  audio.addEventListener('ended', () => { syncTransport(); step(1, true); });

  get('next').onclick = () => step(1);
  get('prev').onclick = () => step(-1);
  get('refresh').onclick = refresh;
  if (!desktop?.musicFolder) get('folder').textContent = '选择音频';
  get('folder').onclick = async () => {
    if (!desktop?.musicFolder) return get('picker').click();
    try {
      if (await desktop.musicFolder()) throw Error();
    } catch { get('status').textContent = '无法打开文件夹'; }
  };
  get('picker').onchange = event => {
    for (const file of event.target.files) localFiles.set(file.name, file);
    refresh();
  };

  async function mountSignal() {
    const overlay = get('signal-overlay');
    const btn = get('signal-toggle');
    const signalUrl = new URL('./signal/edit.html', import.meta.url);
    try {
      const ready = desktop?.musicSignalReady ? await desktop.musicSignalReady()
        : (await fetch(signalUrl, {method: 'HEAD'})).ok;
      if (!ready || !overlay.isConnected) return;
      const frame = document.createElement('iframe');
      frame.className = 'music-signal-frame';
      frame.title = 'Signal 钢琴卷帘';
      const editor = desktop?.musicSignalReady ? new URL('materia-music://editor/edit.html') : signalUrl;
      editor.searchParams.set('disableFileSystem', 'true');
      frame.src = editor.href;
      overlay.append(frame);
      btn.hidden = false;
    } catch { /* Optional renderer */ }
  }

  let loaded = false;
  return {
    render() {
      if (!loaded) { loaded = true; refresh(); void mountSignal(); }
      syncTransport();
      startLoop();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(idleTimer);
      resizeObserver?.disconnect();
      effect.dispose();
      disposeScore();
      generation++;
      audio.pause();
      cancelAnimationFrame(animation);
      audio.removeAttribute('src');
      audio.load();
      if (url) URL.revokeObjectURL(url);
      return context?.close();
    }
  };
}
