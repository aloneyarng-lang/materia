import {reportAchievement} from './flow-achievements.js';
import {getLocale} from './i18n.js';

// Materia Focus Chrono & Pomodoro Module
// - Auto-tracks daily research time on app launch (timestamp-based, drift-free)
// - Compact graphical ring button at the bottom of .workspace-ribbon
// - Dual modes: Focus (stopwatch) & Countdown (Pomodoro 25/45/60/custom min)
// - Auto-pauses after 5 minutes of unfocused inactivity and covers app with Reimu's 6-frame prayer animation
// - Click anywhere on the veil (or Space/Enter/Esc) to return and resume timing
// - Injects an annual daily research-time heatmap in Settings right below the existing import-activity heatmap

const STORAGE_KEY = 'materia.pomodoro.v1';
const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes unfocused + no interaction
const REIMU_FRAME_MS = [120, 120, 120, 120, 120, 220];
const RING_RADIUS = 9.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
    const raw = localStorage.getItem(STORAGE_KEY);
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
      days,
    };
  } catch {
    return { version: 1, mode: 'focus', countdownMinutes: 25, days: {} };
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function playGentleChime() {
  try {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25]; // C5 -> E5 soft harmonic bell
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.16 + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.6);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1100);
  } catch {}
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
  // Compute current streak ending today (or yesterday if today not yet logged)
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

    // Reimu sprite animation timer
    this.reimuFrame = 0;
    this.reimuTimer = 0;
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
    this.mountReimuVeil();
    this.bindLifecycle();
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
    window.dispatchEvent(new Event('materia:focus-recorded'));
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
        this.countdownActive = false;
        const entry = this.todayEntry();
        entry.pomodoros += 1;
        entry.sessions += 1;
        this.flush();
        playGentleChime();
        this.countdownRemaining = this.countdownMinutes * 60;
        this.showCompletionNotice();
        this.refreshSettingsHeatmap();
      }
    }

    this.render();
  }

  enterIdleVeil() {
    this.pausedByIdle = true;
    const entry = this.todayEntry();
    this.flush();

    const { veil, veilMeta } = this.elements;
    if (veil) {
      veilMeta.textContent = `计时已自动暂停（空闲时段未计入） · 今日累计 ${formatDurationShort(entry.seconds)}`;
      veil.hidden = false;
      requestAnimationFrame(() => veil.classList.add('is-visible'));
      this.startReimuSprite();
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
        if (!this.pausedByIdle) veil.hidden = true;
      }, this.reducedMotion.matches ? 0 : 320);
    }
    this.render();
  }

  startReimuSprite() {
    this.stopReimuSprite();
    const pet = this.elements.veilPet;
    if (!pet) return;
    if (this.reducedMotion.matches) {
      pet.style.backgroundPosition = '0px 0px';
      return;
    }
    const step = () => {
      if (!this.pausedByIdle) return;
      pet.style.backgroundPosition = `${-192 * this.reimuFrame}px 0px`;
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

  showCompletionNotice() {
    const status = this.elements.statusPill;
    if (status) {
      status.textContent = '番茄完成 · 休息一下';
      setTimeout(() => this.render(), 4500);
    }
  }

  mountRibbonButton() {
    const ribbon = document.querySelector('.workspace-ribbon');
    if (!ribbon) return;
    const anchor = ribbon.querySelector('.ui-action-menu');
    const wrap = document.createElement('div');
    wrap.className = 'pomodoro-ribbon-wrap';
    wrap.innerHTML = `
      <button type="button" class="ribbon-button pomodoro-ribbon-btn" aria-label="专注与番茄钟" aria-expanded="false" aria-controls="pomodoro-popover">
        <svg class="pomodoro-ribbon-svg" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="pomodoro-ring-track" cx="12" cy="12" r="${RING_RADIUS}"></circle>
          <circle class="pomodoro-ring-progress" cx="12" cy="12" r="${RING_RADIUS}" stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}" stroke-dashoffset="0"></circle>
          <path class="pomodoro-hand" d="M12 7.5V12l3 1.8"></path>
        </svg>
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
      <div class="pomodoro-header">
        <div class="pomodoro-tabs" role="tablist" aria-label="计时模式">
          <button type="button" class="pomodoro-tab" role="tab" data-mode="focus" aria-selected="true">专注</button>
          <button type="button" class="pomodoro-tab" role="tab" data-mode="countdown" aria-selected="false">倒计时</button>
        </div>
        <span class="pomodoro-status-pill" data-pomo-status>自动记录中</span>
      </div>
      <div class="pomodoro-clock-wrap">
        <div class="pomodoro-clock" data-pomo-clock>00:00</div>
        <div class="pomodoro-subline" data-pomo-sub>今日已记录 0 分钟</div>
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
        <button type="button" class="pomodoro-veil-trigger" data-pomo-sleep title="立即进入灵梦休眠暂停">暂离休息</button>
      </div>
    `;
    document.body.append(pop);

    this.elements.popover = pop;
    this.elements.clock = pop.querySelector('[data-pomo-clock]');
    this.elements.subline = pop.querySelector('[data-pomo-sub]');
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

    this.elements.toggleBtn.addEventListener('click', () => {
      if (this.mode === 'focus') {
        this.running = !this.running;
        if (!this.running && this.sessionSeconds >= 60) {
          this.todayEntry().sessions += 1;
          this.flush();
        }
      } else {
        this.countdownActive = !this.countdownActive;
      }
      this.lastTickAt = Date.now();
      this.render();
    });

    this.elements.resetBtn.addEventListener('click', () => {
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
    });

    pop.querySelector('[data-pomo-sleep]').addEventListener('click', () => {
      this.togglePopover(false);
      this.pausedByIdle = true;
      this.flush();
      const entry = this.todayEntry();
      this.elements.veilMeta.textContent = `已手动暂停计时 · 今日累计 ${formatDurationShort(entry.seconds)}`;
      this.elements.veil.hidden = false;
      requestAnimationFrame(() => this.elements.veil.classList.add('is-visible'));
      this.startReimuSprite();
      this.render();
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
    const veil = document.createElement('div');
    veil.id = 'pomodoro-reimu-veil';
    veil.className = 'pomodoro-reimu-veil';
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    veil.setAttribute('aria-label', '计时已暂停，点击任意处返回');
    veil.hidden = true;
    veil.innerHTML = `
      <div class="pomodoro-reimu-stage">
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

    veil.addEventListener('click', () => this.exitIdleVeil());
    document.addEventListener('keydown', e => {
      if (this.pausedByIdle && ['Escape', 'Enter', ' '].includes(e.key)) {
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

    if (this.elements.ribbonBtn) {
      this.elements.ribbonBtn.dataset.running = String(isActive && !this.pausedByIdle);
      this.elements.ribbonBtn.dataset.paused = String(this.pausedByIdle || !isActive);
      const modeLabel = this.mode === 'focus' ? '专注模式' : '倒计时模式';
      this.elements.ribbonBtn.title = `${modeLabel} · ${formatClock(displaySecs)}（今日累计 ${formatDurationShort(entry.seconds)}）`;
    }

    if (this.elements.ringProgress) {
      let ratio = 1;
      if (this.mode === 'countdown') {
        const total = Math.max(1, this.countdownMinutes * 60);
        ratio = Math.max(0, Math.min(1, this.countdownRemaining / total));
      } else {
        // Subtle 60-minute cycle progress in Focus mode
        ratio = Math.min(1, (this.sessionSeconds % 3600) / 3600) || 0.08;
      }
      this.elements.ringProgress.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - ratio)).toFixed(2));
    }

    if (!this.elements.popover) return;
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
    this.elements.toggleBtn.textContent = isActive ? '暂停' : '继续';

    const cal = buildPomodoroCalendar(this.store.days);
    this.elements.todayStats.textContent = `今日 ${entry.pomodoros} 番茄 · 连续 ${cal.streak} 天`;
  }
}

let instance = null;

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
