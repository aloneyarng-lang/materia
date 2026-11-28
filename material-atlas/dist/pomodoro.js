import {installHeatmapSnake} from './heatmap-snake.js';
import {reportAchievement} from './flow-achievements.js';
import {getLocale, t as tr} from './i18n.js';
import {createPomodoroLuxuryStage} from './pomodoro-luxury.js';

// Materia Focus Chrono & Pomodoro Module
// - Auto-tracks daily research time on app launch (timestamp-based, drift-free)
// - Compact graphical ring button at the bottom of .workspace-ribbon
// - Dual modes: Focus (stopwatch) & Countdown (Pomodoro 25/45/60/custom min)
// - Selectable full-page animation styles ('shrine' | 'off') with Launch Ritual,
//   Ambient Page Aura, Completion Finale, Zen Fullscreen Stage & Reimu Idle Veil
// - Injects an annual daily research-time heatmap in Settings right below the import-activity heatmap

const STORAGE_KEY = 'materia.pomodoro.v1';
const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes unfocused + no interaction
const REIMU_FRAME_MS = [120, 120, 120, 120, 120, 220];
const RING_RADIUS = 9.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ZEN_RING_RADIUS = 142;
const AURA_PERIMETER = 1000;
const PETAL_SEEDS = [
  { x: 6, delay: 0.0, dur: 6.2, drift: 34, rot: 145, size: 11, gold: false },
  { x: 14, delay: 1.1, dur: 5.4, drift: -28, rot: -120, size: 8, gold: true },
  { x: 22, delay: 0.4, dur: 6.8, drift: 42, rot: 170, size: 12, gold: false },
  { x: 29, delay: 2.0, dur: 5.1, drift: -22, rot: 95, size: 9, gold: false },
  { x: 37, delay: 0.8, dur: 6.4, drift: 30, rot: -160, size: 7, gold: true },
  { x: 44, delay: 1.6, dur: 5.8, drift: -36, rot: 140, size: 11, gold: false },
  { x: 52, delay: 0.2, dur: 6.9, drift: 26, rot: -110, size: 10, gold: false },
  { x: 59, delay: 1.9, dur: 5.3, drift: -32, rot: 165, size: 8, gold: true },
  { x: 67, delay: 0.6, dur: 6.1, drift: 38, rot: -145, size: 12, gold: false },
  { x: 74, delay: 2.3, dur: 5.6, drift: -24, rot: 125, size: 9, gold: false },
  { x: 81, delay: 0.9, dur: 6.5, drift: 28, rot: -175, size: 7, gold: true },
  { x: 88, delay: 1.4, dur: 5.7, drift: -40, rot: 135, size: 11, gold: false },
  { x: 94, delay: 0.3, dur: 6.3, drift: -20, rot: -90, size: 9, gold: false },
  { x: 11, delay: 2.6, dur: 5.9, drift: 22, rot: 155, size: 8, gold: true },
  { x: 33, delay: 2.9, dur: 6.0, drift: -26, rot: -135, size: 10, gold: false },
  { x: 49, delay: 2.4, dur: 5.5, drift: 32, rot: 115, size: 8, gold: true },
  { x: 70, delay: 2.7, dur: 6.7, drift: -30, rot: -150, size: 11, gold: false },
  { x: 85, delay: 2.1, dur: 5.2, drift: 24, rot: 180, size: 8, gold: true },
];

export const POMODORO_ANIMATION_STYLES = ['shrine', 'chronometer', 'eclipse', 'crystal'];
export const POMODORO_ANIMATION_VALUES = [...POMODORO_ANIMATION_STYLES, 'off'];
export const DEFAULT_POMODORO_ANIMATION = 'shrine';

export function normalizePomodoroAnimation(value) {
  return POMODORO_ANIMATION_VALUES.includes(value) ? value : DEFAULT_POMODORO_ANIMATION;
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validDay(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key + 'T12:00:00Z'));
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDurationShort(totalSeconds) {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

function loadStore() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const days = {};
    for (const [k, v] of Object.entries(parsed?.days || {})) {
      if (!validDay(k) || !v || typeof v !== 'object') continue;
      const seconds = Number(v.seconds) || 0;
      const pomodoros = Number(v.pomodoros) || 0;
      const sessions = Number(v.sessions) || 0;
      if (seconds > 0 || pomodoros > 0 || sessions > 0) {
        days[k] = {
          seconds: Math.min(86400, Math.max(0, Math.round(seconds))),
          pomodoros: Math.min(200, Math.max(0, Math.round(pomodoros))),
          sessions: Math.min(500, Math.max(0, Math.round(sessions))),
          lateNight: v.lateNight === true,
        };
      }
    }
    return {
      version: 1,
      mode: parsed?.mode === 'countdown' ? 'countdown' : 'focus',
      countdownMinutes: Math.min(180, Math.max(1, Number(parsed?.countdownMinutes) || 25)),
      animationStyle: normalizePomodoroAnimation(parsed?.animationStyle),
      auraEnabled: parsed?.auraEnabled !== false,
      days,
    };
  } catch {
    return {
      version: 1,
      mode: 'focus',
      countdownMinutes: 25,
      animationStyle: DEFAULT_POMODORO_ANIMATION,
      auraEnabled: true,
      days: {},
    };
  }
}

function saveStore(store) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function playNotes(notes, peakGain = 0.085, decay = 0.58) {
  try {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    notes.forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + decay);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + decay + 0.06);
    });
    const maxOffset = notes.reduce((m, [, offset]) => Math.max(m, offset), 0);
    setTimeout(() => ctx.close().catch(() => {}), Math.round((maxOffset + decay + 0.4) * 1000));
  } catch {}
}

function playGentleChime() {
  playNotes([[523.25, 0], [659.25, 0.16]], 0.085, 0.55);
}

function playShrineChime() {
  // Pentatonic Kagura bell chord: C5 -> E5 -> G5 -> C6
  playNotes([[523.25, 0], [659.25, 0.13], [783.99, 0.26], [1046.5, 0.42]], 0.075, 0.85);
}

function playChronoChime() {
  // Crisp mechanical repeater chime: A5 -> C#6 -> E6
  playNotes([[880, 0], [1108.73, 0.13], [1318.51, 0.26]], 0.068, 0.48);
}

function playEclipseChime() {
  // Deep celestial fifths & warm shimmer: G4 -> D5 -> G5 -> D6
  playNotes([[392, 0], [587.33, 0.18], [783.99, 0.36], [1174.66, 0.56]], 0.068, 1.0);
}

function playCrystalChime() {
  // Crisp harmonic crystalline triad: E5 -> B5 -> E6 -> B6
  playNotes([[659.25, 0], [987.77, 0.11], [1318.51, 0.22], [1975.53, 0.34]], 0.062, 0.72);
}

function levelForSeconds(seconds) {
  const mins = seconds / 60;
  if (mins >= 180) return 4;
  if (mins >= 90) return 3;
  if (mins >= 30) return 2;
  if (mins > 0) return 1;
  return 0;
}

export function buildPomodoroCalendar(daysMap, year = new Date().getFullYear(), now = Date.now()) {
  const today = dayKey(now);
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));
  const cells = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push(null);
  let totalSeconds = 0, activeDays = 0, totalPomodoros = 0;
  for (let d = first; d <= last; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().slice(0, 10);
    const entry = daysMap[key] || { seconds: 0, pomodoros: 0, sessions: 0 };
    const future = key > today;
    if (!future && entry.seconds > 0) {
      totalSeconds += entry.seconds;
      activeDays += 1;
      totalPomodoros += entry.pomodoros || 0;
    }
    cells.push({
      date: key,
      seconds: entry.seconds || 0,
      pomodoros: entry.pomodoros || 0,
      sessions: entry.sessions || 0,
      future,
      level: future ? 0 : levelForSeconds(entry.seconds || 0),
    });
  }
  let streak = 0;
  let cursor = new Date(now);
  for (let i = 0; i < 366; i++) {
    const k = dayKey(cursor.getTime());
    if ((daysMap[k]?.seconds || 0) > 0) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    } else if (i === 0) {
      cursor = new Date(cursor.getTime() - 86400000);
    } else {
      break;
    }
  }
  return { year, cells, totalSeconds, activeDays, totalPomodoros, streak };
}

// Top-layer modal dialog helpers so ceremonies, zen stage and idle veil
// both paint above and stay interactive over an already-open Settings <dialog>
function openTopDialog(el) {
  if (!el) return;
  el.hidden = false;
  try {
    if (typeof el.showModal === 'function' && !el.open) {
      el.showModal();
    }
  } catch {}
}

function closeTopDialog(el) {
  if (!el) return;
  try {
    if (typeof el.close === 'function' && el.open) {
      el.close();
    }
  } catch {}
  el.hidden = true;
}

function shrineMandalaSVG(extraClass = '', withProgress = false) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const x1 = (160 + 132 * Math.cos(a)).toFixed(1);
    const y1 = (160 + 132 * Math.sin(a)).toFixed(1);
    const x2 = (160 + 146 * Math.cos(a)).toFixed(1);
    const y2 = (160 + 146 * Math.sin(a)).toFixed(1);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const petals = Array.from({ length: 8 }, (_, i) =>
    `<ellipse class="shrine-mandala-petal" cx="160" cy="84" rx="11" ry="28" transform="rotate(${i * 45} 160 160)"/>`
  ).join('');
  return `
    <svg class="shrine-mandala ${extraClass}" viewBox="0 0 320 320" aria-hidden="true">
      <g class="shrine-mandala-outer">
        <circle class="shrine-mandala-ring" cx="160" cy="160" r="146"/>
        <circle class="shrine-mandala-ring is-dashed" cx="160" cy="160" r="126"/>
        <g class="shrine-mandala-ticks">${ticks}</g>
      </g>
      <g class="shrine-mandala-octagon">
        <rect class="shrine-mandala-square" x="72" y="72" width="176" height="176" rx="4"/>
        <rect class="shrine-mandala-square" x="72" y="72" width="176" height="176" rx="4" transform="rotate(45 160 160)"/>
      </g>
      <g class="shrine-mandala-core">
        ${petals}
        <circle class="shrine-mandala-ring is-inner" cx="160" cy="160" r="56"/>
        <circle class="shrine-mandala-ring is-gold" cx="160" cy="160" r="38"/>
      </g>
      ${withProgress ? `<circle class="shrine-zen-progress" cx="160" cy="160" r="${ZEN_RING_RADIUS}" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/>` : ''}
    </svg>
  `;
}

function shrineOfudaSVG() {
  return `
    <svg class="shrine-ofuda-svg" viewBox="0 0 44 126" aria-hidden="true">
      <rect class="shrine-ofuda-paper" x="2" y="2" width="40" height="122" rx="3"/>
      <rect class="shrine-ofuda-border" x="6" y="6" width="32" height="114" rx="1.5"/>
      <path class="shrine-ofuda-glyph" d="M22 18v14M14 25h16M15 44h14M22 39v24M14 57l8-6 8 6M16 74h12M16 83h12M22 69v24"/>
      <circle class="shrine-ofuda-seal" cx="22" cy="106" r="5.5"/>
    </svg>
  `;
}

function shrineCornerSVG(pos) {
  return `
    <span class="shrine-corner" data-corner="${pos}" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <path d="M2 28V6a4 4 0 0 1 4-4h22"/>
        <path class="is-inner" d="M8 22V9a1 1 0 0 1 1-1h13"/>
        <circle cx="8" cy="8" r="1.8"/>
      </svg>
    </span>
  `;
}

function shrineCornersHTML() {
  return ['tl', 'tr', 'bl', 'br'].map(shrineCornerSVG).join('');
}

function shrinePetalsHTML(count, className = 'shrine-petal') {
  return Array.from({ length: count }, (_, i) => {
    const p = PETAL_SEEDS[i % PETAL_SEEDS.length];
    const kind = p.gold ? 'gold' : 'petal';
    return `<span class="${className} is-${kind}" style="--px:${p.x}%;--delay:${p.delay}s;--dur:${p.dur}s;--drift:${p.drift}px;--rot:${p.rot}deg;--size:${p.size}px" aria-hidden="true"></span>`;
  }).join('');
}

function chronoCropsHTML() {
  return ['tl', 'tr', 'bl', 'br'].map(pos =>
    `<span class="chrono-crop" data-corner="${pos}" aria-hidden="true"></span>`
  ).join('');
}

function chronoDigitReelsHTML(clockStr) {
  let digitIdx = 0;
  return Array.from(String(clockStr)).map(ch => {
    if (!/\d/.test(ch)) {
      return `<span class="chrono-colon">${ch}</span>`;
    }
    const target = Number(ch);
    const seq = [4, 3, 2, 1, 0].map(off => `<span>${(target + off) % 10}</span>`).join('');
    const html = `<span class="chrono-digit-window" style="--di:${digitIdx}"><span class="chrono-digit-reel">${seq}</span></span>`;
    digitIdx += 1;
    return html;
  }).join('');
}

function chronoZenDialSVG() {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 * Math.PI) / 180;
    const major = i % 5 === 0;
    const r1 = major ? 136 : 143;
    const r2 = 152;
    const x1 = (180 + r1 * Math.cos(a)).toFixed(1);
    const y1 = (180 + r1 * Math.sin(a)).toFixed(1);
    const x2 = (180 + r2 * Math.cos(a)).toFixed(1);
    const y2 = (180 + r2 * Math.sin(a)).toFixed(1);
    return `<line class="${major ? 'is-major' : 'is-minor'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  return `
    <svg class="chrono-zen-dial" viewBox="0 0 360 360" aria-hidden="true">
      <circle class="chrono-dial-hairline" cx="180" cy="180" r="166"/>
      <circle class="chrono-dial-track" cx="180" cy="180" r="158"/>
      <circle class="chrono-zen-progress" cx="180" cy="180" r="158" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/>
      <g class="chrono-dial-ticks">${ticks}</g>
      <circle class="chrono-dial-inner" cx="180" cy="180" r="122"/>
      <g class="chrono-zen-needle-wrap">
        <line class="chrono-zen-needle" x1="180" y1="30" x2="180" y2="18"/>
      </g>
    </svg>
  `;
}

const ECLIPSE_STARS = [
  { x: 9, y: 14, delay: 0.2, size: 2.4 },
  { x: 18, y: 28, delay: 1.4, size: 1.6 },
  { x: 25, y: 74, delay: 0.8, size: 2.0 },
  { x: 34, y: 18, delay: 2.1, size: 1.5 },
  { x: 42, y: 84, delay: 0.5, size: 2.2 },
  { x: 54, y: 12, delay: 1.8, size: 1.8 },
  { x: 63, y: 79, delay: 1.1, size: 2.5 },
  { x: 72, y: 22, delay: 0.3, size: 1.6 },
  { x: 81, y: 66, delay: 2.3, size: 2.1 },
  { x: 89, y: 31, delay: 0.9, size: 1.9 },
  { x: 14, y: 56, delay: 1.7, size: 1.5 },
  { x: 28, y: 41, delay: 2.5, size: 2.0 },
  { x: 68, y: 46, delay: 0.6, size: 1.7 },
  { x: 77, y: 86, delay: 1.3, size: 2.3 },
  { x: 92, y: 78, delay: 2.0, size: 1.8 },
  { x: 47, y: 24, delay: 0.4, size: 1.6 },
  { x: 58, y: 62, delay: 1.9, size: 2.0 },
  { x: 8, y: 86, delay: 1.0, size: 2.2 },
  { x: 85, y: 14, delay: 1.5, size: 2.4 },
  { x: 38, y: 68, delay: 0.7, size: 1.5 },
];

function eclipseStarsHTML(count = 18) {
  return Array.from({ length: count }, (_, i) => {
    const s = ECLIPSE_STARS[i % ECLIPSE_STARS.length];
    return `<span class="eclipse-star" style="--ex:${s.x}%;--ey:${s.y}%;--delay:${s.delay}s;--size:${s.size}px" aria-hidden="true"></span>`;
  }).join('');
}

function eclipseZenDialSVG() {
  return `
    <svg class="eclipse-zen-dial" viewBox="0 0 360 360" aria-hidden="true">
      <circle class="eclipse-dial-azimuth" cx="180" cy="180" r="168"/>
      <circle class="eclipse-dial-corona" cx="180" cy="180" r="158"/>
      <circle class="eclipse-zen-progress" cx="180" cy="180" r="158" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/>
      <circle class="eclipse-dial-inner" cx="180" cy="180" r="126"/>
      <path class="eclipse-dial-glints" d="M180 18v8M180 334v8M18 180h8M334 180h8"/>
      <g class="eclipse-zen-moon-wrap">
        <circle class="eclipse-zen-moon" cx="180" cy="22" r="5.5"/>
      </g>
    </svg>
  `;
}

function crystalReticlesHTML() {
  return ['tl', 'tr', 'bl', 'br'].map(pos =>
    `<span class="crystal-reticle" data-corner="${pos}" aria-hidden="true"></span>`
  ).join('');
}

function crystalHexPoints(cx, cy, r, rotDeg = -90) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((rotDeg + i * 60) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function crystalHexSVG(extraClass = '') {
  const outer = crystalHexPoints(160, 160, 128, -90);
  const mid = crystalHexPoints(160, 160, 96, -60);
  const inner = crystalHexPoints(160, 160, 56, -90);
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    const x = (160 + 128 * Math.cos(a)).toFixed(1);
    const y = (160 + 128 * Math.sin(a)).toFixed(1);
    return `<circle class="crystal-hex-node" cx="${x}" cy="${y}" r="3.4"/>`;
  }).join('');
  return `
    <svg class="crystal-hex ${extraClass}" viewBox="0 0 320 320" aria-hidden="true">
      <polygon class="crystal-hex-outer" points="${outer}"/>
      <polygon class="crystal-hex-mid" points="${mid}"/>
      <polygon class="crystal-hex-inner" points="${inner}"/>
      <g class="crystal-hex-bonds">
        <line x1="160" y1="32" x2="160" y2="288"/>
        <line x1="49.1" y1="96" x2="270.9" y2="224"/>
        <line x1="270.9" y1="96" x2="49.1" y2="224"/>
      </g>
      ${nodes}
    </svg>
  `;
}

function crystalZenDialSVG() {
  const outer = crystalHexPoints(180, 180, 148, -90);
  const inner = crystalHexPoints(180, 180, 134, -60);
  const nodes = Array.from({ length: 12 }, (_, i) => {
    const a = ((-90 + i * 30) * Math.PI) / 180;
    const r = i % 2 === 0 ? 148 : 134;
    const cx = (180 + r * Math.cos(a)).toFixed(1);
    const cy = (180 + r * Math.sin(a)).toFixed(1);
    return `<circle class="${i % 2 === 0 ? 'is-major' : 'is-minor'}" cx="${cx}" cy="${cy}" r="${i % 2 === 0 ? '2.6' : '1.7'}"/>`;
  }).join('');
  return `
    <svg class="crystal-zen-dial" viewBox="0 0 360 360" aria-hidden="true">
      <polygon class="crystal-dial-hex" points="${outer}"/>
      <polygon class="crystal-dial-hex is-sub" points="${inner}"/>
      <circle class="crystal-dial-track" cx="180" cy="180" r="158"/>
      <circle class="crystal-zen-progress" cx="180" cy="180" r="158" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/>
      <g class="crystal-dial-nodes">${nodes}</g>
    </svg>
  `;
}

function pomodoroRibbonIconSVG() {
  return `
    <svg class="pomodoro-ribbon-svg" viewBox="0 0 28 28" aria-hidden="true">
      <path class="pomodoro-icon-crown" d="M11.5 2.4h5M14 2.4v2.1"/>
      <circle class="pomodoro-icon-bezel" cx="14" cy="15" r="11.4"/>
      <circle class="pomodoro-ring-track" cx="14" cy="15" r="9.6"/>
      <circle class="pomodoro-ring-progress" cx="14" cy="15" r="9.6" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/>
      <g class="pomodoro-icon-shrine">
        <rect class="pomodoro-icon-seal" x="9.6" y="10.6" width="8.8" height="8.8" rx="0.8"/>
        <rect class="pomodoro-icon-seal is-rot" x="9.6" y="10.6" width="8.8" height="8.8" rx="0.8" transform="rotate(45 14 15)"/>
        <circle class="pomodoro-icon-core" cx="14" cy="15" r="1.45"/>
      </g>
      <g class="pomodoro-icon-chrono">
        <path class="pomodoro-icon-ticks" d="M14 7.2v1.6M14 21.2v1.6M6.2 15h1.6M20.2 15h1.6"/>
        <path class="pomodoro-hand" d="M14 10.6V15l2.7 1.6"/>
        <g class="pomodoro-icon-sec-wrap">
          <line class="pomodoro-icon-sec-hand" x1="14" y1="15" x2="14" y2="8.2"/>
        </g>
      </g>
      <g class="pomodoro-icon-eclipse">
        <circle class="pomodoro-icon-disc" cx="14" cy="15" r="4.4"/>
        <path class="pomodoro-icon-crescent" d="M11.6 10.8a4.7 4.7 0 0 1 6.7 5.2"/>
        <path class="pomodoro-icon-spark" d="M18.6 9.9v2.2M17.5 11h2.2"/>
      </g>
      <g class="pomodoro-icon-crystal">
        <polygon class="pomodoro-icon-hex" points="14,9.8 18.5,12.4 18.5,17.6 14,20.2 9.5,17.6 9.5,12.4"/>
        <path class="pomodoro-icon-spokes" d="M14 9.8V15m0 0 4.5 2.6M14 15l-4.5 2.6"/>
        <circle class="pomodoro-icon-core" cx="14" cy="15" r="1.35"/>
      </g>
      <g class="pomodoro-icon-minimal">
        <path class="pomodoro-icon-ticks" d="M14 7.6v1.2M14 21.2v1.2M6.6 15h1.2M20.2 15h1.2"/>
        <path class="pomodoro-hand" d="M14 10.4V15l3 1.7"/>
      </g>
      <g class="pomodoro-icon-tip-wrap">
        <circle class="pomodoro-icon-tip" cx="14" cy="5.4" r="1.45"/>
      </g>
    </svg>
  `;
}

function pomodoroMiniDialSVG() {
  const chronoTicks = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 * Math.PI) / 180;
    const major = i % 5 === 0;
    const r1 = major ? 66 : 70;
    const r2 = 74;
    const x1 = (90 + r1 * Math.cos(a)).toFixed(1);
    const y1 = (90 + r1 * Math.sin(a)).toFixed(1);
    const x2 = (90 + r2 * Math.cos(a)).toFixed(1);
    const y2 = (90 + r2 * Math.sin(a)).toFixed(1);
    return `<line class="${major ? 'is-major' : 'is-minor'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const shrineDots = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const cx = (90 + 70 * Math.cos(a)).toFixed(1);
    const cy = (90 + 70 * Math.sin(a)).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${i % 3 === 0 ? '1.35' : '0.85'}"/>`;
  }).join('');
  return `
    <svg class="pomodoro-mini-dial" viewBox="0 0 180 180" aria-hidden="true">
      <circle class="pomodoro-mini-outer" cx="90" cy="90" r="85"/>
      <circle class="pomodoro-mini-track" cx="90" cy="90" r="78"/>
      <g class="pomodoro-mini-shrine">
        <rect class="pomodoro-mini-seal" x="45" y="45" width="90" height="90" rx="2"/>
        <rect class="pomodoro-mini-seal is-rot" x="45" y="45" width="90" height="90" rx="2" transform="rotate(45 90 90)"/>
        <g class="pomodoro-mini-dots">${shrineDots}</g>
      </g>
      <g class="pomodoro-mini-chrono">
        <circle class="pomodoro-mini-inner" cx="90" cy="90" r="64"/>
        <g class="pomodoro-mini-ticks">${chronoTicks}</g>
        <g class="pomodoro-mini-sec-wrap">
          <line class="pomodoro-mini-sec" x1="90" y1="20" x2="90" y2="12"/>
        </g>
      </g>
      <g class="pomodoro-mini-eclipse">
        <circle class="pomodoro-mini-eclipse-halo" cx="90" cy="90" r="66"/>
        <circle class="pomodoro-mini-eclipse-orbit" cx="93" cy="88" r="59"/>
        <path class="pomodoro-mini-eclipse-glints" d="M90 19v6M90 155v6M19 90h6M155 90h6"/>
      </g>
      <g class="pomodoro-mini-crystal">
        <polygon class="pomodoro-mini-hex" points="${crystalHexPoints(90, 90, 68, -90)}"/>
        <polygon class="pomodoro-mini-hex is-rot" points="${crystalHexPoints(90, 90, 62, -60)}"/>
        <g class="pomodoro-mini-crystal-nodes">
          ${Array.from({ length: 6 }, (_, i) => {
            const a = ((-90 + i * 60) * Math.PI) / 180;
            return `<circle cx="${(90 + 68 * Math.cos(a)).toFixed(1)}" cy="${(90 + 68 * Math.sin(a)).toFixed(1)}" r="1.9"/>`;
          }).join('')}
        </g>
      </g>
      <g class="pomodoro-mini-minimal">
        <path class="pomodoro-mini-cardinals" d="M90 15v5M90 160v5M15 90h5M160 90h5"/>
      </g>
      <circle class="pomodoro-mini-progress" cx="90" cy="90" r="78" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/>
      <g class="pomodoro-mini-tip-wrap">
        <circle class="pomodoro-mini-tip" cx="90" cy="12" r="2.7"/>
      </g>
    </svg>
  `;
}

class PomodoroController {
  constructor() {
    this.store = loadStore();
    this.mode = this.store.mode;
    this.countdownMinutes = this.store.countdownMinutes;

    // Auto-start tracking as soon as Materia launches
    this.running = true;
    this.pausedByIdle = false;
    this.lastTickAt = Date.now();
    this.sessionSeconds = 0;
    this.countdownRemaining = this.countdownMinutes * 60;
    this.countdownActive = false;

    // Unfocused inactivity tracking
    this.windowFocused = typeof document !== 'undefined' ? document.hasFocus() : true;
    this.unfocusedSince = this.windowFocused ? 0 : Date.now();
    this.unflushedSeconds = 0;

    // Ceremony / Zen / Reimu sprite state
    this.reimuFrame = 0;
    this.reimuTimer = 0;
    this.ceremonyTimer = 0;
    this.ceremonyPhase = '';
    this.ceremonyPreview = false;
    this.ceremonyLuxury = null;
    this.zenOpen = false;
    this.zenLuxury = null;
    this.zenLuxuryStyle = '';
    this.reducedMotion = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

    this.heatmapYear = new Date().getFullYear();
    this.elements = {};
    this.tickTimer = 0;
    this.settingsObserver = null;
  }

  mount() {
    this.mountRibbonButton();
    this.mountPopover();
    this.mountAura();
    this.mountCeremony();
    this.mountZenStage();
    this.mountReimuVeil();
    this.bindLifecycle();
    installHeatmapSnake();
    this.observeSettingsHeatmap();
    this.render();
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  todayEntry() {
    const key = dayKey();
    if (!this.store.days[key]) {
      this.store.days[key] = { seconds: 0, pomodoros: 0, sessions: 0 };
    }
    return this.store.days[key];
  }

  commitSeconds(deltaSeconds) {
    if (deltaSeconds <= 0) return;
    const entry = this.todayEntry();
    const hour = new Date().getHours();
    if (hour >= 1 && hour < 5) entry.lateNight = true;
    entry.seconds = Math.min(86400, entry.seconds + deltaSeconds);
    this.unflushedSeconds += deltaSeconds;
    if (this.unflushedSeconds >= 15) {
      this.flush();
    }
  }

  flush() {
    this.unflushedSeconds = 0;
    this.store.mode = this.mode;
    this.store.countdownMinutes = this.countdownMinutes;
    saveStore(this.store);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('materia:focus-recorded'));
    }
  }

  setAnimationStyle(style) {
    this.store.animationStyle = normalizePomodoroAnimation(style);
    saveStore(this.store);
    this.render();
    return this.store.animationStyle;
  }

  setAuraEnabled(enabled) {
    this.store.auraEnabled = Boolean(enabled);
    saveStore(this.store);
    this.render();
    return this.store.auraEnabled;
  }

  tick() {
    const now = Date.now();
    if (this.pausedByIdle) return;
    if (!this.windowFocused && this.unfocusedSince) {
      if (now - this.unfocusedSince >= IDLE_LIMIT_MS) this.enterIdleVeil();
      return;
    }

    const elapsed = Math.max(0, Math.floor((now - this.lastTickAt) / 1000));
    this.lastTickAt += elapsed * 1000;
    if (elapsed >= IDLE_LIMIT_MS / 1000) {
      this.lastTickAt = now;
      return;
    }

    if (this.mode === 'focus' && this.running && elapsed > 0) {
      this.sessionSeconds += elapsed;
      this.commitSeconds(elapsed);
    } else if (this.mode === 'countdown' && this.countdownActive && elapsed > 0) {
      const step = Math.min(elapsed, this.countdownRemaining);
      this.countdownRemaining -= step;
      this.commitSeconds(step);
      if (this.countdownRemaining <= 0) {
        const finishedMinutes = this.countdownMinutes;
        this.countdownActive = false;
        const entry = this.todayEntry();
        entry.pomodoros += 1;
        entry.sessions += 1;
        this.flush();
        if (this.store.animationStyle === 'shrine') playShrineChime();
        else if (this.store.animationStyle === 'chronometer') playChronoChime();
        else if (this.store.animationStyle === 'eclipse') playEclipseChime();
        else if (this.store.animationStyle === 'crystal') playCrystalChime();
        else playGentleChime();
        this.countdownRemaining = this.countdownMinutes * 60;
        this.showCompletionNotice(finishedMinutes);
        this.refreshSettingsHeatmap();
      }
    }

    this.render();
  }

  enterIdleVeil(manual = false) {
    this.pausedByIdle = true;
    this.closeZenStage();
    this.flush();
    const entry = this.todayEntry();
    const { veil, veilMeta, veilPet } = this.elements;
    if (veil) {
      veil.dataset.style = this.store.animationStyle;
      veilMeta.textContent = manual
        ? `已手动暂停计时 · 今日累计 ${formatDurationShort(entry.seconds)}`
        : `计时已自动暂停（空闲时段未计入） · 今日累计 ${formatDurationShort(entry.seconds)}`;
      openTopDialog(veil);
      requestAnimationFrame(() => veil.classList.add('is-visible'));
      this.startReimuSprite(veilPet, () => this.pausedByIdle);
    }
    this.render();
  }

  exitIdleVeil() {
    if (!this.pausedByIdle) return;
    reportAchievement('reimuVeilReturns', 1, 'add');
    this.pausedByIdle = false;
    this.lastTickAt = Date.now();
    this.unfocusedSince = 0;
    this.stopReimuSprite();

    const { veil } = this.elements;
    if (veil) {
      veil.classList.remove('is-visible');
      setTimeout(() => {
        if (!this.pausedByIdle) closeTopDialog(veil);
      }, this.reducedMotion.matches ? 0 : 320);
    }
    this.render();
  }

  startReimuSprite(petEl, isActiveFn) {
    this.stopReimuSprite();
    if (!petEl) return;
    if (this.reducedMotion.matches) {
      petEl.style.backgroundPosition = '0px 0px';
      return;
    }
    const step = () => {
      if (!isActiveFn()) return;
      petEl.style.backgroundPosition = `${-192 * this.reimuFrame}px 0px`;
      const delay = REIMU_FRAME_MS[this.reimuFrame];
      this.reimuFrame = (this.reimuFrame + 1) % REIMU_FRAME_MS.length;
      this.reimuTimer = setTimeout(step, delay);
    };
    this.reimuFrame = 0;
    step();
  }

  stopReimuSprite() {
    if (this.reimuTimer) {
      clearTimeout(this.reimuTimer);
      this.reimuTimer = 0;
    }
  }

  showCompletionNotice(finishedMinutes = this.countdownMinutes) {
    const status = this.elements.statusPill;
    if (status) {
      status.textContent = '番茄完成 · 休息一下';
      setTimeout(() => this.render(), 4500);
    }
    if (this.store.animationStyle !== 'off') {
      this.playCompletionCeremony({ durationMinutes: finishedMinutes, isPreview: false });
    }
  }

  mountAura() {
    const aura = document.createElement('div');
    aura.id = 'pomodoro-aura-overlay';
    aura.className = 'pomodoro-aura';
    aura.setAttribute('aria-hidden', 'true');
    aura.hidden = true;
    aura.innerHTML = `
      <div class="shrine-aura-layer">
        ${shrineCornersHTML()}
        <svg class="shrine-aura-frame" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <rect class="shrine-aura-track" x="3" y="3" width="994" height="594" rx="10" pathLength="${AURA_PERIMETER}"/>
          <rect class="shrine-aura-progress" x="3" y="3" width="994" height="594" rx="10" pathLength="${AURA_PERIMETER}" stroke-dasharray="${AURA_PERIMETER}" stroke-dashoffset="0"/>
        </svg>
        <div class="shrine-aura-motes">${shrinePetalsHTML(6, 'shrine-petal is-ambient')}</div>
      </div>
      <div class="chrono-aura-layer">
        ${chronoCropsHTML()}
        <div class="chrono-aura-ruler">
          <div class="chrono-aura-ticks"></div>
          <div class="chrono-aura-fill"></div>
          <span class="chrono-aura-needle"></span>
        </div>
      </div>
      <div class="eclipse-aura-layer">
        <svg class="eclipse-aura-frame" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <rect class="eclipse-aura-track" x="3" y="3" width="994" height="594" rx="14" pathLength="${AURA_PERIMETER}"/>
          <rect class="eclipse-aura-progress" x="3" y="3" width="994" height="594" rx="14" pathLength="${AURA_PERIMETER}" stroke-dasharray="${AURA_PERIMETER}" stroke-dashoffset="0"/>
        </svg>
      </div>
      <div class="crystal-aura-layer">
        ${crystalReticlesHTML()}
        <div class="crystal-aura-rail">
          <div class="crystal-aura-fill"></div>
          <span class="crystal-aura-head"></span>
        </div>
      </div>
    `;
    document.body.append(aura);
    this.elements.aura = aura;
    this.elements.auraProgress = aura.querySelector('.shrine-aura-progress');
    this.elements.eclipseAuraProgress = aura.querySelector('.eclipse-aura-progress');
  }

  syncAura(ratio, isActive) {
    const aura = this.elements.aura;
    if (!aura) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    const visible =
      this.mode === 'countdown' &&
      isActive &&
      !this.pausedByIdle &&
      !this.zenOpen &&
      this.store.animationStyle !== 'off' &&
      this.store.auraEnabled;
    aura.hidden = !visible;
    aura.classList.toggle('is-active', visible);
    aura.dataset.style = this.store.animationStyle;
    aura.dataset.urgent = String(visible && this.countdownRemaining <= 60);
    aura.style.setProperty('--aura-ratio', clamped.toFixed(4));
    const offset = (AURA_PERIMETER * (1 - clamped)).toFixed(2);
    this.elements.auraProgress?.setAttribute('stroke-dashoffset', offset);
    this.elements.eclipseAuraProgress?.setAttribute('stroke-dashoffset', offset);
  }

  mountCeremony() {
    const el = document.createElement('dialog');
    el.id = 'pomodoro-ceremony';
    el.className = 'pomodoro-ceremony';
    el.setAttribute('aria-label', '结界祈愿全屏演出');
    el.hidden = true;
    const content = document.createElement('div');
    content.className = 'pomo-ceremony-content';
    el.append(content);
    document.body.append(el);
    this.elements.ceremony = el;
    this.elements.ceremonyContent = content;
    this.ceremonyLuxury = createPomodoroLuxuryStage(el);

    el.addEventListener('cancel', e => {
      e.preventDefault();
      this.closeCeremony(true);
    });

    el.addEventListener('click', e => {
      if (e.target.closest('[data-ceremony-restart]')) {
        const wasPreview = this.ceremonyPreview;
        this.closeCeremony(true);
        if (!wasPreview) {
          this.mode = 'countdown';
          this.countdownRemaining = this.countdownMinutes * 60;
          this.countdownActive = true;
          this.lastTickAt = Date.now();
          this.flush();
          this.render();
          this.playLaunchCeremony(this.countdownMinutes, { isPreview: false });
        }
        return;
      }
      if (e.target.closest('[data-ceremony-rest]')) {
        this.closeCeremony(true);
        this.enterIdleVeil(true);
        return;
      }
      if (e.target.closest('[data-ceremony-close]') || this.ceremonyPhase === 'launch' || e.target === el || e.target === content) {
        this.closeCeremony(true);
      }
    });
  }

  playLaunchCeremony(minutes = this.countdownMinutes, { isPreview = false, style = this.store.animationStyle } = {}) {
    const chosen = normalizePomodoroAnimation(style);
    if (chosen === 'off') return false;
    const el = this.elements.ceremony;
    const content = this.elements.ceremonyContent || el;
    if (!el || !content) return false;

    clearTimeout(this.ceremonyTimer);
    this.stopReimuSprite();
    this.ceremonyPhase = 'launch';
    this.ceremonyPreview = isPreview;
    el.dataset.style = chosen;
    el.dataset.phase = 'launch';
    if (chosen === 'chronometer') {
      const clockText = formatClock(minutes * 60);
      content.innerHTML = `
        <div class="chrono-ceremony-backdrop"></div>
        <div class="chrono-curtain-left" aria-hidden="true"></div>
        <div class="chrono-curtain-right" aria-hidden="true"></div>
        ${chronoCropsHTML()}
        <header class="chrono-folio-bar">
          <span>EDITION // MATERIA CHRONOGRAPH</span>
          <span>CAL. ${String(minutes).padStart(2, '0')}M · 18,000 VPH</span>
        </header>
        <div class="chrono-launch-stage">
          <div class="chrono-launch-clock" aria-label="${clockText}">${chronoDigitReelsHTML(clockText)}</div>
          <div class="chrono-ruler" aria-hidden="true">
            <span class="chrono-ruler-line"></span>
            <div class="chrono-ruler-marks"><span>00</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
          </div>
          <p class="chrono-launch-subtitle">活版时漏 · 专注校准完成</p>
          <span class="chrono-launch-hint">点击或按 Esc 跳过</span>
        </div>
      `;
    } else if (chosen === 'eclipse') {
      content.innerHTML = `
        <div class="eclipse-ceremony-backdrop"></div>
        <div class="eclipse-stars-field">${eclipseStarsHTML(18)}</div>
        <div class="eclipse-launch-stage">
          <span class="eclipse-corona-wave" aria-hidden="true"></span>
          <div class="eclipse-body" aria-hidden="true">
            <span class="eclipse-sun"></span>
            <span class="eclipse-moon"></span>
            <span class="eclipse-diamond-flare"></span>
          </div>
          <div class="eclipse-launch-copy">
            <span class="eclipse-eyebrow">SOLAR ECLIPSE // 日蝕入定</span>
            <strong class="eclipse-launch-clock">${formatClock(minutes * 60)}</strong>
            <p class="eclipse-launch-subtitle">光环掩星 · 步入心流</p>
            <span class="eclipse-launch-hint">点击或按 Esc 跳过</span>
          </div>
        </div>
      `;
    } else if (chosen === 'crystal') {
      content.innerHTML = `
        <div class="crystal-ceremony-backdrop">
          <div class="crystal-lattice-bg" aria-hidden="true"></div>
        </div>
        ${crystalReticlesHTML()}
        <span class="crystal-scan-beam" aria-hidden="true"></span>
        <div class="crystal-launch-stage">
          <span class="crystal-hex-wave" aria-hidden="true"></span>
          ${crystalHexSVG('is-launch')}
          <div class="crystal-launch-copy">
            <span class="crystal-eyebrow">THERMAL ANNEALING // 晶體退火</span>
            <strong class="crystal-launch-clock">${formatClock(minutes * 60)}</strong>
            <p class="crystal-launch-subtitle">晶格锁定 · 恒温专注</p>
            <span class="crystal-launch-hint">点击或按 Esc 跳过</span>
          </div>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="shrine-ceremony-backdrop"></div>
        ${shrineCornersHTML()}
        <div class="shrine-ofuda-cluster" aria-hidden="true">
          <div class="shrine-ofuda" data-corner="tl">${shrineOfudaSVG()}</div>
          <div class="shrine-ofuda" data-corner="tr">${shrineOfudaSVG()}</div>
          <div class="shrine-ofuda" data-corner="bl">${shrineOfudaSVG()}</div>
          <div class="shrine-ofuda" data-corner="br">${shrineOfudaSVG()}</div>
        </div>
        <div class="shrine-launch-stage">
          <span class="shrine-shockwave" aria-hidden="true"></span>
          ${shrineMandalaSVG('is-launch', false)}
          <div class="shrine-launch-copy">
            <span class="shrine-eyebrow">SHRINE BARRIER // 結界展開</span>
            <strong class="shrine-launch-clock">${formatClock(minutes * 60)}</strong>
            <p class="shrine-launch-subtitle">结界已立 · 专注开始</p>
            <span class="shrine-launch-hint">点击或按 Esc 跳过</span>
          </div>
        </div>
      `;
    }
    openTopDialog(el);
    this.ceremonyLuxury?.start({ style: chosen, phase: 'launch', ratio: 1, seconds: minutes * 60, running: true });
    requestAnimationFrame(() => el.classList.add('is-visible'));

    const holdMs = this.reducedMotion.matches ? 480 : 2200;
    this.ceremonyTimer = setTimeout(() => {
      if (this.ceremonyPhase !== 'launch') return;
      if (isPreview) {
        this.playCompletionCeremony({ isPreview: true, durationMinutes: minutes, style: chosen });
      } else {
        this.closeCeremony();
      }
    }, holdMs);
    return true;
  }

  playCompletionCeremony({ isPreview = false, durationMinutes = this.countdownMinutes, style = this.store.animationStyle } = {}) {
    const chosen = normalizePomodoroAnimation(style);
    if (chosen === 'off') return false;
    const el = this.elements.ceremony;
    const content = this.elements.ceremonyContent || el;
    if (!el || !content) return false;

    clearTimeout(this.ceremonyTimer);
    this.ceremonyPhase = 'complete';
    this.ceremonyPreview = isPreview;
    el.dataset.style = chosen;
    el.dataset.phase = 'complete';

    const entry = this.todayEntry();
    const cal = buildPomodoroCalendar(this.store.days);
    const pomoCount = isPreview ? Math.max(1, entry.pomodoros) : entry.pomodoros;
    const streakCount = Math.max(1, cal.streak);

    if (chosen === 'chronometer') {
      this.stopReimuSprite();
      const dateStr = dayKey().replace(/-/g, '.');
      content.innerHTML = `
        <div class="chrono-ceremony-backdrop is-complete">
          <div class="chrono-grid-lines" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>
        ${chronoCropsHTML()}
        <article class="chrono-complete-spread">
          <div class="chrono-spread-folio">
            <span>FOCUS LOG // FOLIO NO. ${String(pomoCount).padStart(2, '0')}</span>
            <span>${dateStr}</span>
          </div>
          <div class="chrono-rule-line" aria-hidden="true"></div>
          <div class="chrono-spread-hero">
            <strong class="chrono-spread-clock">${String(durationMinutes).padStart(2, '0')}:00</strong>
            <div class="chrono-spread-heading">
              <h2 class="chrono-complete-title">专注篇章已归档</h2>
              <p class="chrono-complete-sub">CHAPTER ARCHIVED · REST ADVISED</p>
            </div>
          </div>
          <div class="chrono-telemetry-grid">
            <div><small>SESSION</small><strong>${durationMinutes} 分钟</strong></div>
            <div><small>TODAY</small><strong>第 ${pomoCount} 番茄</strong></div>
            <div><small>STREAK</small><strong>连续 ${streakCount} 天</strong></div>
          </div>
          <div class="shrine-complete-actions">
            <button type="button" class="primary" data-ceremony-restart>${isPreview ? tr('结束预览') : tr('再来一轮')}</button>
            <button type="button" class="outline-button" data-ceremony-rest>${tr('暂离休息')}</button>
            <button type="button" class="outline-button" data-ceremony-close>${tr('返回文献')}</button>
          </div>
        </article>
      `;
      openTopDialog(el);
      this.ceremonyLuxury?.start({ style: chosen, phase: 'complete', ratio: 1, seconds: durationMinutes * 60, running: true });
      requestAnimationFrame(() => el.classList.add('is-visible'));
      return true;
    }

    if (chosen === 'eclipse') {
      this.stopReimuSprite();
      content.innerHTML = `
        <div class="eclipse-ceremony-backdrop is-complete"></div>
        <div class="eclipse-stars-field">${eclipseStarsHTML(20)}</div>
        <div class="eclipse-emergence-glow" aria-hidden="true"></div>
        <div class="eclipse-complete-card">
          <div class="eclipse-complete-emblem" aria-hidden="true">
            <span class="eclipse-sun is-emerge"></span>
            <span class="eclipse-moon is-emerge"></span>
          </div>
          <span class="eclipse-eyebrow">EMERGENCE // 生光復明</span>
          <h2 class="eclipse-complete-title">日蚀圆满 · 专注归来</h2>
          <div class="eclipse-complete-stats">
            <span>本次 ${durationMinutes} 分钟</span>
            <span>今日第 ${pomoCount} 番茄</span>
            <span>连续 ${streakCount} 天</span>
          </div>
          <div class="shrine-complete-actions">
            <button type="button" class="primary" data-ceremony-restart>${isPreview ? tr('结束预览') : tr('再来一轮')}</button>
            <button type="button" class="outline-button" data-ceremony-rest>${tr('暂离休息')}</button>
            <button type="button" class="outline-button" data-ceremony-close>${tr('返回文献')}</button>
          </div>
        </div>
      `;
      openTopDialog(el);
      this.ceremonyLuxury?.start({ style: chosen, phase: 'complete', ratio: 1, seconds: durationMinutes * 60, running: true });
      requestAnimationFrame(() => el.classList.add('is-visible'));
      return true;
    }

    if (chosen === 'crystal') {
      this.stopReimuSprite();
      content.innerHTML = `
        <div class="crystal-ceremony-backdrop is-complete">
          <div class="crystal-lattice-bg" aria-hidden="true"></div>
        </div>
        ${crystalReticlesHTML()}
        <span class="crystal-ripple is-1" aria-hidden="true"></span>
        <span class="crystal-ripple is-2" aria-hidden="true"></span>
        <span class="crystal-ripple is-3" aria-hidden="true"></span>
        <div class="crystal-planes" aria-hidden="true"><span>(111)</span><span>(200)</span><span>(220)</span></div>
        <div class="crystal-complete-card">
          <div class="crystal-complete-emblem">${crystalHexSVG('is-complete')}</div>
          <span class="crystal-eyebrow">CRYSTALLIZATION COMPLETE // 退火完成</span>
          <h2 class="crystal-complete-title">晶体生长已定型</h2>
          <div class="crystal-telemetry-grid">
            <div><small>HOLD</small><strong>${durationMinutes} MIN</strong></div>
            <div><small>SAMPLE</small><strong>#${String(pomoCount).padStart(2, '0')}</strong></div>
            <div><small>STREAK</small><strong>${streakCount} D</strong></div>
          </div>
          <div class="shrine-complete-actions">
            <button type="button" class="primary" data-ceremony-restart>${isPreview ? tr('结束预览') : tr('再来一轮')}</button>
            <button type="button" class="outline-button" data-ceremony-rest>${tr('暂离休息')}</button>
            <button type="button" class="outline-button" data-ceremony-close>${tr('返回文献')}</button>
          </div>
        </div>
      `;
      openTopDialog(el);
      this.ceremonyLuxury?.start({ style: chosen, phase: 'complete', ratio: 1, seconds: durationMinutes * 60, running: true });
      requestAnimationFrame(() => el.classList.add('is-visible'));
      return true;
    }

    content.innerHTML = `
      <div class="shrine-ceremony-backdrop is-complete"></div>
      ${shrineCornersHTML()}
      <div class="shrine-petals-field">${shrinePetalsHTML(18)}</div>
      <div class="shrine-complete-burst" aria-hidden="true"></div>
      <div class="shrine-complete-card">
        <div class="shrine-complete-emblem">
          ${shrineMandalaSVG('is-complete', false)}
          <div class="pomodoro-reimu-pet shrine-complete-pet" role="img" aria-label="博丽灵梦"></div>
        </div>
        <span class="shrine-eyebrow">BARRIER RELEASED // 修行完了</span>
        <h2 class="shrine-complete-title">一轮专注已圆满完成</h2>
        <div class="shrine-complete-stats">
          <span>本次 ${durationMinutes} 分钟</span>
          <span>今日第 ${pomoCount} 番茄</span>
          <span>连续 ${streakCount} 天</span>
        </div>
        <div class="shrine-complete-actions">
          <button type="button" class="primary" data-ceremony-restart>${isPreview ? tr('结束预览') : tr('再来一轮')}</button>
          <button type="button" class="outline-button" data-ceremony-rest>${tr('暂离休息')}</button>
          <button type="button" class="outline-button" data-ceremony-close>${tr('返回文献')}</button>
        </div>
      </div>
    `;
    openTopDialog(el);
    this.ceremonyLuxury?.start({ style: chosen, phase: 'complete', ratio: 1, seconds: durationMinutes * 60, running: true });
    requestAnimationFrame(() => el.classList.add('is-visible'));
    const pet = content.querySelector('.shrine-complete-pet');
    this.startReimuSprite(pet, () => this.ceremonyPhase === 'complete' && !el.hidden);
    return true;
  }

  closeCeremony(immediate = false) {
    clearTimeout(this.ceremonyTimer);
    this.ceremonyTimer = 0;
    const wasComplete = this.ceremonyPhase === 'complete';
    this.ceremonyPhase = '';
    this.ceremonyPreview = false;
    if (wasComplete && !this.pausedByIdle) {
      this.stopReimuSprite();
    }
    const el = this.elements.ceremony;
    if (!el) return;
    el.classList.remove('is-visible');
    const finish = () => {
      if (!this.ceremonyPhase) {
        this.ceremonyLuxury?.stop();
        closeTopDialog(el);
      }
    };
    if (immediate || this.reducedMotion.matches) finish();
    else setTimeout(finish, 260);
  }

  mountZenStage() {
    const stage = document.createElement('dialog');
    stage.id = 'pomodoro-zen-stage';
    stage.className = 'pomodoro-zen-stage';
    stage.setAttribute('aria-label', '沉浸全屏计时舞台');
    stage.hidden = true;
    stage.innerHTML = `
      <div class="shrine-zen-bg">
        <div class="shrine-zen-backdrop"></div>
        ${shrineCornersHTML()}
        <div class="shrine-petals-field">${shrinePetalsHTML(10)}</div>
      </div>
      <div class="chrono-zen-bg">
        <div class="chrono-zen-backdrop">
          <div class="chrono-grid-lines" aria-hidden="true"><span></span><span></span><span></span></div>
        </div>
        ${chronoCropsHTML()}
      </div>
      <div class="eclipse-zen-bg">
        <div class="eclipse-zen-backdrop"></div>
        <div class="eclipse-stars-field">${eclipseStarsHTML(18)}</div>
      </div>
      <div class="crystal-zen-bg">
        <div class="crystal-zen-backdrop">
          <div class="crystal-lattice-bg" aria-hidden="true"></div>
        </div>
        ${crystalReticlesHTML()}
      </div>
      <div class="shrine-zen-center">
        ${shrineMandalaSVG('is-zen', true)}
        ${chronoZenDialSVG()}
        ${eclipseZenDialSVG()}
        ${crystalZenDialSVG()}
        <div class="shrine-zen-readout">
          <span class="shrine-eyebrow" data-zen-eyebrow>SHRINE FOCUS // 結界集中</span>
          <div class="shrine-zen-clock" data-zen-clock>25:00</div>
          <p class="shrine-zen-sub" data-zen-sub>今日累计 0 分钟</p>
        </div>
      </div>
      <div class="shrine-zen-dock">
        <button type="button" class="primary" data-zen-toggle>暂停</button>
        <button type="button" class="outline-button" data-zen-reset>重置</button>
        <button type="button" class="outline-button" data-zen-sleep>${tr('暂离休息')}</button>
        <button type="button" class="outline-button" data-zen-close>${tr('退出全屏')}</button>
      </div>
    `;
    document.body.append(stage);
    this.zenLuxury = createPomodoroLuxuryStage(stage);

    this.elements.zenStage = stage;
    this.elements.zenEyebrow = stage.querySelector('[data-zen-eyebrow]');
    this.elements.zenClock = stage.querySelector('[data-zen-clock]');
    this.elements.zenSub = stage.querySelector('[data-zen-sub]');
    this.elements.zenToggle = stage.querySelector('[data-zen-toggle]');
    this.elements.zenProgress = stage.querySelector('.shrine-zen-progress');
    this.elements.chronoZenProgress = stage.querySelector('.chrono-zen-progress');
    this.elements.eclipseZenProgress = stage.querySelector('.eclipse-zen-progress');
    this.elements.crystalZenProgress = stage.querySelector('.crystal-zen-progress');

    stage.addEventListener('cancel', e => {
      e.preventDefault();
      this.closeZenStage();
    });
    this.elements.zenToggle.addEventListener('click', () => this.toggleActiveTimer());
    stage.querySelector('[data-zen-reset]').addEventListener('click', () => this.resetActiveTimer());
    stage.querySelector('[data-zen-sleep]').addEventListener('click', () => this.enterIdleVeil(true));
    stage.querySelector('[data-zen-close]').addEventListener('click', () => this.closeZenStage());
  }

  openZenStage() {
    this.togglePopover(false);
    this.zenOpen = true;
    const stage = this.elements.zenStage;
    if (stage) {
      stage.dataset.style = this.store.animationStyle;
      openTopDialog(stage);
      requestAnimationFrame(() => stage.classList.add('is-visible'));
    }
    this.render();
  }

  closeZenStage() {
    if (!this.zenOpen) return;
    this.zenOpen = false;
    this.zenLuxuryStyle = '';
    const stage = this.elements.zenStage;
    if (stage) {
      stage.classList.remove('is-visible');
      setTimeout(() => {
        if (!this.zenOpen) {
          this.zenLuxury?.stop();
          closeTopDialog(stage);
        }
      }, this.reducedMotion.matches ? 0 : 260);
    }
    this.render();
  }

  toggleActiveTimer() {
    if (this.mode === 'focus') {
      this.running = !this.running;
      if (!this.running && this.sessionSeconds >= 60) {
        this.todayEntry().sessions += 1;
        this.flush();
      }
    } else {
      const startingFresh = !this.countdownActive && this.countdownRemaining === this.countdownMinutes * 60;
      this.countdownActive = !this.countdownActive;
      this.lastTickAt = Date.now();
      this.render();
      if (startingFresh && this.countdownActive && this.store.animationStyle !== 'off') {
        this.playLaunchCeremony(this.countdownMinutes, { isPreview: false });
      }
      return;
    }
    this.lastTickAt = Date.now();
    this.render();
  }

  resetActiveTimer() {
    if (this.mode === 'focus') {
      if (this.sessionSeconds >= 60) {
        this.todayEntry().sessions += 1;
        this.flush();
      }
      this.sessionSeconds = 0;
    } else {
      this.countdownActive = false;
      this.countdownRemaining = this.countdownMinutes * 60;
    }
    this.render();
  }

  mountRibbonButton() {
    const ribbon = document.querySelector('.workspace-ribbon');
    if (!ribbon) return;
    const anchor = ribbon.querySelector('.ui-action-menu');
    const wrap = document.createElement('div');
    wrap.className = 'pomodoro-ribbon-wrap';
    wrap.innerHTML = `
      <button type="button" class="ribbon-button pomodoro-ribbon-btn" aria-label="专注与番茄钟" aria-expanded="false" aria-controls="pomodoro-popover">
        ${pomodoroRibbonIconSVG()}
        <span class="pomodoro-live-dot" aria-hidden="true"></span>
      </button>
    `;
    if (anchor) ribbon.insertBefore(wrap, anchor);
    else ribbon.append(wrap);

    const btn = wrap.querySelector('.pomodoro-ribbon-btn');
    this.elements.ribbonBtn = btn;
    this.elements.ringProgress = wrap.querySelector('.pomodoro-ring-progress');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !this.elements.popover.hidden;
      this.togglePopover(!open);
    });
  }

  mountPopover() {
    const pop = document.createElement('section');
    pop.id = 'pomodoro-popover';
    pop.className = 'pomodoro-popover';
    pop.setAttribute('aria-label', '专注与番茄钟');
    pop.hidden = true;
    pop.innerHTML = `
      <span class="pomodoro-pop-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <div class="pomodoro-header">
        <div class="pomodoro-tabs" role="tablist" aria-label="计时模式">
          <button type="button" class="pomodoro-tab" role="tab" data-mode="focus" aria-selected="true">专注</button>
          <button type="button" class="pomodoro-tab" role="tab" data-mode="countdown" aria-selected="false">倒计时</button>
        </div>
        <span class="pomodoro-status-pill" data-pomo-status>自动记录中</span>
      </div>
      <div class="pomodoro-mini-stage">
        ${pomodoroMiniDialSVG()}
        <div class="pomodoro-clock-wrap pomodoro-mini-readout">
          <span class="pomodoro-mini-eyebrow" data-pomo-eyebrow>SHRINE // 結界</span>
          <div class="pomodoro-clock" data-pomo-clock>00:00</div>
          <div class="pomodoro-subline" data-pomo-sub>今日已记录 0 分钟</div>
        </div>
      </div>
      <div class="pomodoro-presets" data-pomo-presets hidden>
        <button type="button" class="pomodoro-preset-btn" data-min="25">25m</button>
        <button type="button" class="pomodoro-preset-btn" data-min="45">45m</button>
        <button type="button" class="pomodoro-preset-btn" data-min="60">60m</button>
        <input type="number" class="pomodoro-custom-min" min="1" max="180" aria-label="自定义分钟数" placeholder="分钟">
      </div>
      <div class="pomodoro-actions">
        <button type="button" class="primary" data-pomo-toggle>暂停</button>
        <button type="button" class="outline-button" data-pomo-reset>重置</button>
      </div>
      <div class="pomodoro-footer">
        <span data-pomo-today-stats>今日 0 番茄 · 连续 0 天</span>
        <span class="pomodoro-footer-actions">
          <button type="button" class="pomodoro-veil-trigger" data-pomo-zen title="进入全屏计时舞台">${tr('沉浸全屏')}</button>
          <button type="button" class="pomodoro-veil-trigger" data-pomo-sleep title="立即进入灵梦休眠暂停">${tr('暂离休息')}</button>
        </span>
      </div>
    `;
    document.body.append(pop);

    this.elements.popover = pop;
    this.elements.clock = pop.querySelector('[data-pomo-clock]');
    this.elements.subline = pop.querySelector('[data-pomo-sub]');
    this.elements.miniEyebrow = pop.querySelector('[data-pomo-eyebrow]');
    this.elements.miniProgress = pop.querySelector('.pomodoro-mini-progress');
    this.elements.statusPill = pop.querySelector('[data-pomo-status]');
    this.elements.presets = pop.querySelector('[data-pomo-presets]');
    this.elements.customMin = pop.querySelector('.pomodoro-custom-min');
    this.elements.toggleBtn = pop.querySelector('[data-pomo-toggle]');
    this.elements.resetBtn = pop.querySelector('[data-pomo-reset]');
    this.elements.todayStats = pop.querySelector('[data-pomo-today-stats]');

    pop.querySelectorAll('.pomodoro-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.mode = tab.dataset.mode;
        this.flush();
        this.render();
      });
    });

    pop.querySelectorAll('.pomodoro-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.countdownMinutes = Number(btn.dataset.min);
        this.countdownRemaining = this.countdownMinutes * 60;
        this.countdownActive = false;
        this.flush();
        this.render();
      });
    });

    this.elements.customMin.addEventListener('change', () => {
      const val = Math.min(180, Math.max(1, Math.round(Number(this.elements.customMin.value) || 25)));
      this.countdownMinutes = val;
      this.countdownRemaining = val * 60;
      this.countdownActive = false;
      this.flush();
      this.render();
    });

    this.elements.toggleBtn.addEventListener('click', () => this.toggleActiveTimer());
    this.elements.resetBtn.addEventListener('click', () => this.resetActiveTimer());
    pop.querySelector('[data-pomo-zen]').addEventListener('click', () => this.openZenStage());
    pop.querySelector('[data-pomo-sleep]').addEventListener('click', () => {
      this.togglePopover(false);
      this.enterIdleVeil(true);
    });

    document.addEventListener('click', e => {
      if (pop.hidden) return;
      if (!pop.contains(e.target) && !this.elements.ribbonBtn?.contains(e.target)) {
        this.togglePopover(false);
      }
    });
  }

  togglePopover(show) {
    const { popover, ribbonBtn } = this.elements;
    if (!popover) return;
    popover.hidden = !show;
    ribbonBtn?.setAttribute('aria-expanded', String(show));
  }

  mountReimuVeil() {
    const veil = document.createElement('dialog');
    veil.id = 'pomodoro-reimu-veil';
    veil.className = 'pomodoro-reimu-veil';
    veil.setAttribute('aria-label', '计时已暂停，点击任意处返回');
    veil.hidden = true;
    veil.innerHTML = `
      <div class="shrine-veil-decor" aria-hidden="true">
        ${shrineCornersHTML()}
        <div class="shrine-petals-field">${shrinePetalsHTML(8)}</div>
      </div>
      <div class="chrono-veil-decor" aria-hidden="true">${chronoCropsHTML()}</div>
      <div class="eclipse-veil-decor" aria-hidden="true"><div class="eclipse-stars-field">${eclipseStarsHTML(12)}</div></div>
      <div class="crystal-veil-decor" aria-hidden="true">${crystalReticlesHTML()}</div>
      <div class="pomodoro-reimu-stage">
        <div class="shrine-veil-halo" aria-hidden="true">${shrineMandalaSVG('is-veil', false)}</div>
        <div class="pomodoro-reimu-pet" role="img" aria-label="博丽灵梦闭眼持御币，正在祈愿"></div>
        <p class="pomodoro-reimu-prayer" lang="ja">少女祈願中<span class="pomodoro-reimu-dots" aria-hidden="true">...</span></p>
        <p class="pomodoro-reimu-meta" data-veil-meta>计时已自动暂停</p>
        <span class="pomodoro-reimu-hint">点击任意处返回继续</span>
      </div>
    `;
    document.body.append(veil);

    this.elements.veil = veil;
    this.elements.veilPet = veil.querySelector('.pomodoro-reimu-pet');
    this.elements.veilMeta = veil.querySelector('[data-veil-meta]');

    veil.addEventListener('cancel', e => {
      e.preventDefault();
      this.exitIdleVeil();
    });
    veil.addEventListener('click', () => this.exitIdleVeil());
    document.addEventListener('keydown', e => {
      if (!this.elements.ceremony?.hidden && e.key === 'Escape') {
        e.preventDefault();
        this.closeCeremony(true);
      } else if (this.zenOpen && e.key === 'Escape') {
        e.preventDefault();
        this.closeZenStage();
      } else if (this.pausedByIdle && ['Escape', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        this.exitIdleVeil();
      } else if (!this.elements.popover?.hidden && e.key === 'Escape') {
        this.togglePopover(false);
      }
    });
  }

  bindLifecycle() {
    const updateFocus = focused => {
      if (this.windowFocused === focused) return;
      this.tick();
      this.windowFocused = focused;
      this.unfocusedSince = focused ? 0 : Date.now();
      if (focused) this.tick();
    };
    window.addEventListener('focus', () => updateFocus(true));
    window.addEventListener('blur', () => updateFocus(false));
    document.addEventListener('visibilitychange', () => updateFocus(!document.hidden && document.hasFocus()));

    const onExit = () => {
      this.tick();
      this.flush();
    };
    window.addEventListener('beforeunload', onExit);
    window.addEventListener('pagehide', onExit);
  }

  observeSettingsHeatmap() {
    const tryInject = () => {
      const hostCard = document.querySelector('#settings-import-activity');
      if (!hostCard || !hostCard.parentElement) return;
      let card = hostCard.parentElement.querySelector('#settings-focus-activity');
      if (!card) {
        card = document.createElement('section');
        card.id = 'settings-focus-activity';
        card.className = 'settings-activity';
        card.setAttribute('aria-label', '科研专注时长');
        hostCard.insertAdjacentElement('afterend', card);
      }
      this.elements.heatmapCard = card;
      this.refreshSettingsHeatmap();
    };

    tryInject();
    this.settingsObserver = new MutationObserver(() => {
      if (!this.elements.heatmapCard || !this.elements.heatmapCard.isConnected) {
        tryInject();
      }
    });
    this.settingsObserver.observe(document.body, { childList: true, subtree: true });
  }

  refreshSettingsHeatmap() {
    const card = this.elements.heatmapCard;
    if (!card || !card.isConnected) return;
    const data = buildPomodoroCalendar(this.store.days, this.heatmapYear);
    const years = [...new Set([
      new Date().getFullYear(),
      ...Object.keys(this.store.days).map(k => Number(k.slice(0, 4))),
    ])].sort((a, b) => b - a);

    const hoursText = (data.totalSeconds / 3600).toFixed(1);
    const monthLabels = Array.from({ length: 12 }, (_, i) =>
      `<span>${new Intl.DateTimeFormat(getLocale(), { month: 'short' }).format(new Date(2020, i, 1))}</span>`
    ).join('');

    const cellsHtml = data.cells.map(c => {
      if (!c) return '<i class="activity-blank"></i>';
      const tip = `${c.date} · 在研 ${formatDurationShort(c.seconds)} · ${c.pomodoros} 番茄`;
      return `<button type="button" class="activity-day" data-pomo-date="${c.date}" data-level="${c.level}" ${c.future ? 'disabled' : ''} title="${tip}" aria-label="${tip}"></button>`;
    }).join('');

    card.innerHTML = `
      <div class="activity-heading">
        <div>
          <strong>科研专注时长</strong>
          <p>${hoursText} 小时 · ${data.activeDays} 个活跃日 · ${data.totalPomodoros} 个番茄 · 连续 ${data.streak} 天</p>
        </div>
        <select data-pomo-year aria-label="专注时长年份">
          ${years.map(y => `<option value="${y}" ${y === this.heatmapYear ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
      </div>
      <div class="activity-scroll">
        <div class="activity-months" aria-hidden="true">${monthLabels}</div>
        <div class="activity-calendar" aria-label="${this.heatmapYear} 年每日科研时长">${cellsHtml}</div>
      </div>
      <div class="activity-footer">
        <span data-pomo-detail aria-live="polite">点击方块查看当天科研时长</span>
        <span class="activity-legend">少 ${[0, 1, 2, 3, 4].map(i => `<i data-level="${i}"></i>`).join('')} 多</span>
      </div>
    `;

    card.querySelector('[data-pomo-year]')?.addEventListener('change', e => {
      this.heatmapYear = Number(e.target.value);
      this.refreshSettingsHeatmap();
    });

    const detail = card.querySelector('[data-pomo-detail]');
    card.querySelectorAll('[data-pomo-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pomoDate;
        const entry = this.store.days[key] || { seconds: 0, pomodoros: 0, sessions: 0 };
        detail.textContent = `${key} · 在研 ${formatDurationShort(entry.seconds)} · 完成 ${entry.pomodoros} 番茄 · ${entry.sessions} 次专注`;
      });
    });
  }

  render() {
    const entry = this.todayEntry();
    const isActive = this.mode === 'focus' ? this.running : this.countdownActive;
    const displaySecs = this.mode === 'focus' ? this.sessionSeconds : this.countdownRemaining;

    let ratio = 1;
    if (this.mode === 'countdown') {
      const total = Math.max(1, this.countdownMinutes * 60);
      ratio = Math.max(0, Math.min(1, this.countdownRemaining / total));
    } else {
      ratio = Math.min(1, (this.sessionSeconds % 3600) / 3600) || 0.08;
    }

    const style = this.store.animationStyle;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const secDeg = `${(displaySecs % 60) * 6}deg`;
    const runningNow = isActive && !this.pausedByIdle;

    if (this.elements.ribbonBtn) {
      this.elements.ribbonBtn.dataset.style = style;
      this.elements.ribbonBtn.dataset.running = String(runningNow);
      this.elements.ribbonBtn.dataset.paused = String(!runningNow);
      this.elements.ribbonBtn.style.setProperty('--pomo-ratio', clampedRatio.toFixed(4));
      this.elements.ribbonBtn.style.setProperty('--pomo-sec-deg', secDeg);
      const modeLabel = this.mode === 'focus' ? '专注模式' : '倒计时模式';
      this.elements.ribbonBtn.title = `${modeLabel} · ${formatClock(displaySecs)}（今日累计 ${formatDurationShort(entry.seconds)}）`;
    }

    if (this.elements.ringProgress) {
      this.elements.ringProgress.setAttribute('stroke-dashoffset', (100 * (1 - clampedRatio)).toFixed(2));
    }

    this.syncAura(ratio, isActive);

    const toggleLabel = isActive
      ? '暂停'
      : (this.mode === 'countdown' && this.countdownRemaining === this.countdownMinutes * 60 ? '开始' : '继续');

    if (this.elements.zenStage) {
      this.elements.zenStage.dataset.style = style;
      this.elements.zenStage.style.setProperty('--pomo-ratio', clampedRatio.toFixed(4));
      this.elements.zenStage.style.setProperty('--chrono-sec-deg', secDeg);
      const zenLabelMap = {
        shrine: this.mode === 'focus' ? 'SHRINE FOCUS // 結界集中' : 'COUNTDOWN // 結界計時',
        chronometer: this.mode === 'focus' ? 'CHRONOGRAPH // 活版專注' : 'CHRONOGRAPH // 活版計時',
        eclipse: this.mode === 'focus' ? 'SOLAR ECLIPSE // 日蝕心流' : 'SOLAR ECLIPSE // 日蝕計時',
        crystal: this.mode === 'focus' ? 'THERMAL LOCK // 晶體退火' : 'ANNEALING // 晶體計時',
        off: this.mode === 'focus' ? 'FOCUS CHRONO' : 'POMODORO',
      };
      this.elements.zenEyebrow.textContent = zenLabelMap[style] || zenLabelMap.off;
      this.elements.zenClock.textContent = formatClock(displaySecs);
      this.elements.zenSub.textContent = `今日累计 ${formatDurationShort(entry.seconds)} · 今日 ${entry.pomodoros} 番茄`;
      this.elements.zenToggle.textContent = toggleLabel;
      const offset = (1000 * (1 - clampedRatio)).toFixed(2);
      this.elements.zenProgress?.setAttribute('stroke-dashoffset', offset);
      this.elements.chronoZenProgress?.setAttribute('stroke-dashoffset', offset);
      this.elements.eclipseZenProgress?.setAttribute('stroke-dashoffset', offset);
      this.elements.crystalZenProgress?.setAttribute('stroke-dashoffset', offset);
      if (this.zenOpen) {
        if (style === 'off') {
          this.zenLuxury?.stop();
          this.zenLuxuryStyle = '';
        } else if (this.zenLuxuryStyle !== style) {
          this.zenLuxury?.start({ style, phase: 'zen', ratio: clampedRatio, seconds: displaySecs, running: runningNow });
          this.zenLuxuryStyle = style;
        } else {
          this.zenLuxury?.update({ ratio: clampedRatio, seconds: displaySecs, running: runningNow });
        }
      }
    }

    if (!this.elements.popover) return;
    this.elements.popover.dataset.style = style;
    this.elements.popover.dataset.running = String(runningNow);
    this.elements.popover.style.setProperty('--pomo-ratio', clampedRatio.toFixed(4));
    this.elements.popover.style.setProperty('--pomo-sec-deg', secDeg);
    this.elements.miniProgress?.setAttribute('stroke-dashoffset', (1000 * (1 - clampedRatio)).toFixed(2));
    if (this.elements.miniEyebrow) {
      const mm = String(this.countdownMinutes).padStart(2, '0');
      const miniLabelMap = {
        shrine: this.mode === 'countdown' ? 'SHRINE // 結界' : 'SHRINE // 集中',
        chronometer: this.mode === 'countdown' ? `${mm}M // CHRONO` : 'CHRONO // 活版',
        eclipse: this.mode === 'countdown' ? `${mm}M // ECLIPSE` : 'ECLIPSE // 集中',
        crystal: this.mode === 'countdown' ? `${mm}M // ANNEAL` : 'LATTICE // 晶格',
        off: this.mode === 'countdown' ? 'POMODORO' : 'FOCUS',
      };
      this.elements.miniEyebrow.textContent = miniLabelMap[style] || miniLabelMap.off;
    }
    this.elements.popover.querySelectorAll('.pomodoro-tab').forEach(tab => {
      tab.setAttribute('aria-selected', String(tab.dataset.mode === this.mode));
    });
    this.elements.presets.hidden = this.mode !== 'countdown';
    this.elements.popover.querySelectorAll('.pomodoro-preset-btn').forEach(btn => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.min) === this.countdownMinutes));
    });
    this.elements.clock.textContent = formatClock(displaySecs);
    this.elements.subline.textContent = `今日累计 ${formatDurationShort(entry.seconds)}`;
    this.elements.statusPill.textContent = this.pausedByIdle
      ? '已休眠暂停'
      : isActive
        ? (this.mode === 'focus' ? '自动记录中' : '倒计时进行中')
        : '已暂停';
    this.elements.toggleBtn.textContent = toggleLabel;

    const cal = buildPomodoroCalendar(this.store.days);
    this.elements.todayStats.textContent = `今日 ${entry.pomodoros} 番茄 · 连续 ${cal.streak} 天`;
  }
}

let instance = null;

export function getPomodoroAnimation() {
  return instance ? instance.store.animationStyle : loadStore().animationStyle;
}

export function setPomodoroAnimation(value) {
  const normalized = normalizePomodoroAnimation(value);
  if (instance) return instance.setAnimationStyle(normalized);
  const store = loadStore();
  store.animationStyle = normalized;
  saveStore(store);
  return normalized;
}

export function getPomodoroAuraEnabled() {
  return instance ? instance.store.auraEnabled : loadStore().auraEnabled;
}

export function setPomodoroAuraEnabled(enabled) {
  const next = Boolean(enabled);
  if (instance) return instance.setAuraEnabled(next);
  const store = loadStore();
  store.auraEnabled = next;
  saveStore(store);
  return next;
}

export function previewPomodoroAnimation(style = getPomodoroAnimation()) {
  const chosen = normalizePomodoroAnimation(style);
  if (chosen === 'off' || typeof document === 'undefined') return false;
  const ctrl = instance || initPomodoro();
  if (!ctrl) return false;
  return ctrl.playLaunchCeremony(ctrl.countdownMinutes, { isPreview: true, style: chosen });
}

export function initPomodoro() {
  if (instance) return instance;
  instance = new PomodoroController();
  instance.mount();
  return instance;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPomodoro, { once: true });
  } else {
    initPomodoro();
  }
}
