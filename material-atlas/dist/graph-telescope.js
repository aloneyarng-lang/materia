import { prefersReducedMotion } from './ui-motion.js';

/**
 * Observatory telescope eyepiece calibration overlay displayed over `#graph-wrap`
 * during Star Graph natural layout ("自然整理"). Pointer-transparent and theme-aware.
 */
export function createGraphTelescope(host) {
  let root = null;
  let hudEl = null;
  let hideTimer = 0;
  let active = false;

  function ensureMounted() {
    if (root || !host || typeof document === 'undefined') return root;
    root = document.createElement('div');
    root.className = 'graph-telescope';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="telescope-vignette"></div>
      <div class="telescope-brackets"><i></i><i></i><i></i><i></i></div>
      <svg class="telescope-reticle" viewBox="0 0 600 600" fill="none">
        <circle class="telescope-ring-track" cx="300" cy="300" r="244" />
        <circle class="telescope-ring-outer" cx="300" cy="300" r="244" stroke-dasharray="6 14 2 14" />
        <circle class="telescope-ring-mid" cx="300" cy="300" r="198" stroke-dasharray="28 10 4 10" />
        <g class="telescope-focus-group">
          <circle class="telescope-ring-focus" cx="300" cy="300" r="148" />
          <circle class="telescope-lock-ring" cx="300" cy="300" r="148" />
        </g>
        <g class="telescope-crosshairs">
          <line x1="300" y1="24" x2="300" y2="122" />
          <line x1="300" y1="478" x2="300" y2="576" />
          <line x1="24" y1="300" x2="122" y2="300" />
          <line x1="478" y1="300" x2="576" y2="300" />
        </g>
        <g class="telescope-stars">
          <circle class="t-star s1" cx="122" cy="144" r="2.2" />
          <circle class="t-star s2" cx="468" cy="134" r="2.5" />
          <circle class="t-star s3" cx="486" cy="438" r="2.0" />
          <circle class="t-star s4" cx="136" cy="458" r="2.4" />
        </g>
      </svg>
      <div class="telescope-hud">
        <span class="telescope-dot"></span>
        <span data-telescope-readout>OBSERVATORY · FOCUSING STAR FIELD</span>
      </div>
    `;
    hudEl = root.querySelector('[data-telescope-readout]');
    host.append(root);
    return root;
  }

  function update({ busy = false, progress = null } = {}) {
    if (!host) return;
    if (busy) {
      clearTimeout(hideTimer);
      const el = ensureMounted();
      if (!el) return;
      active = true;
      el.hidden = false;
      el.dataset.state = 'focusing';
      const ratio = progress?.total > 0 ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0;
      el.style.setProperty('--focus-p', ratio.toFixed(3));
      const pct = Math.round(ratio * 100);
      if (hudEl) {
        hudEl.textContent = progress?.total
          ? `OBSERVATORY · CALIBRATING LATTICE · ${String(pct).padStart(2, '0')}%`
          : 'OBSERVATORY · FOCUSING STAR FIELD';
      }
      return;
    }

    if (!active || !root) return;
    active = false;

    if (prefersReducedMotion()) {
      root.hidden = true;
      delete root.dataset.state;
      return;
    }

    root.style.setProperty('--focus-p', '1');
    root.dataset.state = 'locked';
    if (hudEl) hudEl.textContent = 'LOCKED · CONSTELLATION ALIGNED';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!active && root) {
        root.hidden = true;
        delete root.dataset.state;
      }
    }, 540);
  }

  function dispose() {
    clearTimeout(hideTimer);
    active = false;
    root?.remove();
    root = null;
    hudEl = null;
  }

  return { update, dispose };
}
