import { reportAchievement } from './flow-achievements.js';

export const NIXIE_TARGET = '1.048596';

const WORLDLINE_PHRASES = new Set([
  'el psy kongroo',
  'el psy congroo',
]);

export function matchesWorldlinePhrase(raw) {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return WORLDLINE_PHRASES.has(normalized);
}

function playWorldlineAudio() {
  try {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;

    // Subtle mechanical relay tick + warm Steins;Gate lock chime
    const notes = [
      [440, 0, 0.09, 0.025],
      [659.25, 0.04, 0.36, 0.042],
      [987.77, 0.11, 0.52, 0.036],
    ];
    for (const [freq, offset, dur, peak] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.04);
    }
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {}
}

export function initEasterEggs({ searchInput } = {}) {
  let meter = null;
  let flash = null;
  let scrambleTimer = 0;
  let lockTimer = 0;
  let flashTimer = 0;
  let dismissTimer = 0;
  let hideTimer = 0;
  let armed = true;
  let lastTriggeredAt = 0;

  const reducedMotion = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function ensureDom() {
    if (meter && flash) return;

    flash = document.createElement('div');
    flash.id = 'materia-worldline-flash';
    flash.className = 'materia-worldline-flash';
    flash.setAttribute('aria-hidden', 'true');
    flash.hidden = true;
    document.body.append(flash);

    meter = document.createElement('div');
    meter.id = 'materia-nixie-meter';
    meter.className = 'materia-nixie-meter';
    meter.setAttribute('popover', 'manual');
    meter.setAttribute('role', 'status');
    meter.setAttribute('aria-live', 'polite');
    meter.hidden = true;

    const tubesHtml = [...NIXIE_TARGET].map((ch, idx) => {
      if (ch === '.') {
        return `<span class="nixie-tube is-dot" data-nixie-index="${idx}" aria-hidden="true"><span class="nixie-digit">.</span></span>`;
      }
      return `<span class="nixie-tube" data-nixie-index="${idx}"><span class="nixie-digit">${ch}</span></span>`;
    }).join('');

    meter.innerHTML = `
      <div class="nixie-chassis">
        <div class="nixie-header">
          <span class="nixie-eyebrow">DIVERGENCE METER // STEINS;GATE</span>
          <button type="button" class="nixie-close" data-nixie-close aria-label="关闭世界线变动率仪">✕</button>
        </div>
        <div class="nixie-tubes" aria-label="世界线变动率 ${NIXIE_TARGET} 百分比">
          ${tubesHtml}
          <span class="nixie-unit" aria-hidden="true">%</span>
        </div>
        <p class="nixie-sub" data-nixie-sub>正在读取世界线变动率…</p>
      </div>
    `;
    document.body.append(meter);

    meter.querySelector('[data-nixie-close]')?.addEventListener('click', () => {
      closeMeter(false);
    });
  }

  function clearTimers() {
    clearInterval(scrambleTimer);
    clearTimeout(lockTimer);
    clearTimeout(flashTimer);
    clearTimeout(dismissTimer);
    clearTimeout(hideTimer);
    scrambleTimer = 0;
    lockTimer = 0;
    flashTimer = 0;
    dismissTimer = 0;
    hideTimer = 0;
  }

  function closeMeter(immediate = false) {
    clearTimers();
    if (!meter) return;
    meter.classList.remove('is-visible', 'is-locked');
    if (flash) {
      flash.classList.remove('is-active');
      flash.hidden = true;
    }
    const finishHide = () => {
      if (!meter || meter.classList.contains('is-visible')) return;
      try {
        if (typeof meter.hidePopover === 'function' && meter.matches(':popover-open')) {
          meter.hidePopover();
        }
      } catch {}
      meter.hidden = true;
    };
    if (immediate || reducedMotion.matches) {
      finishHide();
    } else {
      hideTimer = setTimeout(finishHide, 260);
    }
  }

  function finishLock(digits, subEl) {
    digits.forEach((el, idx) => {
      el.textContent = NIXIE_TARGET[idx];
      el.parentElement?.classList.add('is-tube-locked');
    });
    meter.classList.add('is-locked');
    if (subEl) {
      subEl.textContent = 'β → Steins;Gate · 世界线已收敛 — 「不要小看世界线的收敛啊。」';
    }
    if (!reducedMotion.matches && flash) {
      flash.hidden = false;
      flash.classList.remove('is-active');
      void flash.offsetWidth;
      flash.classList.add('is-active');
      flashTimer = setTimeout(() => {
        flash?.classList.remove('is-active');
        if (flash) flash.hidden = true;
      }, 280);
    }
    playWorldlineAudio();
    reportAchievement('worldlineTriggers', 1, 'add');
    dismissTimer = setTimeout(() => closeMeter(false), 3600);
  }

  function triggerWorldlineMeter() {
    ensureDom();
    clearTimers();

    const activeBefore = document.activeElement;
    meter.classList.remove('is-visible', 'is-locked');
    const digits = [...meter.querySelectorAll('.nixie-digit')];
    const subEl = meter.querySelector('[data-nixie-sub]');
    digits.forEach(el => el.parentElement?.classList.remove('is-tube-locked'));
    if (subEl) subEl.textContent = '正在校准世界线收敛点…';

    meter.hidden = false;
    try {
      if (typeof meter.showPopover === 'function' && !meter.matches(':popover-open')) {
        meter.showPopover();
      }
    } catch {}
    void meter.offsetWidth;
    meter.classList.add('is-visible');

    // Never steal focus from the search input while typing
    if (activeBefore === searchInput && document.activeElement !== searchInput) {
      searchInput.focus({ preventScroll: true });
    }

    if (reducedMotion.matches) {
      finishLock(digits, subEl);
      return;
    }

    const start = Date.now();
    const totalMs = 920;
    const lockableIndices = [...NIXIE_TARGET].map((ch, i) => (ch === '.' ? -1 : i)).filter(i => i >= 0);

    scrambleTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const lockedCount = Math.floor((elapsed / totalMs) * (lockableIndices.length + 0.5));
      for (let i = 0; i < digits.length; i++) {
        if (NIXIE_TARGET[i] === '.') {
          digits[i].textContent = '.';
          continue;
        }
        const rank = lockableIndices.indexOf(i);
        if (rank < lockedCount) {
          digits[i].textContent = NIXIE_TARGET[i];
          digits[i].parentElement?.classList.add('is-tube-locked');
        } else {
          digits[i].textContent = String(Math.floor(Math.random() * 10));
        }
      }
      if (elapsed >= totalMs) {
        clearInterval(scrambleTimer);
        scrambleTimer = 0;
        finishLock(digits, subEl);
      }
    }, 45);
  }

  function onInput(event) {
    const val = event?.target?.value ?? searchInput?.value ?? '';
    if (matchesWorldlinePhrase(val)) {
      const now = Date.now();
      if (armed && now - lastTriggeredAt > 1500) {
        armed = false;
        lastTriggeredAt = now;
        triggerWorldlineMeter();
      }
    } else {
      armed = true;
    }
  }

  searchInput?.addEventListener('input', onInput);

  return {
    triggerWorldlineMeter,
    dispose() {
      searchInput?.removeEventListener('input', onInput);
      closeMeter(true);
      meter?.remove();
      flash?.remove();
      meter = null;
      flash = null;
    },
  };
}
