let workspaceMotionInitialized = false;
const brandOrbitSources = new Set();

export const THEME_TRANSITION_STYLES = ['iris', 'curtain', 'shutter', 'prism'];
export const THEME_TRANSITION_VALUES = [...THEME_TRANSITION_STYLES, 'off'];
export const DEFAULT_THEME_TRANSITION = 'iris';

export function normalizeThemeTransition(value) {
  return THEME_TRANSITION_VALUES.includes(value) ? value : DEFAULT_THEME_TRANSITION;
}

/**
 * Run a View Transition animation (`iris` | `curtain` | `shutter` | `prism`)
 * around a DOM/theme mutation, gracefully falling back to direct execution.
 */
export async function runThemeTransition(style, applyMutation, origin = null) {
  const chosen = normalizeThemeTransition(style);
  if (
    chosen === 'off' ||
    prefersReducedMotion() ||
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function'
  ) {
    return await applyMutation();
  }

  const root = document.documentElement;
  const vw = globalThis.innerWidth || 1280;
  const vh = globalThis.innerHeight || 800;
  const x = Number.isFinite(origin?.x) && origin.x > 0 ? origin.x : vw / 2;
  const y = Number.isFinite(origin?.y) && origin.y > 0 ? origin.y : vh / 2;
  const radius = Math.ceil(Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y)));

  root.style.setProperty('--vt-x', `${Math.round(x)}px`);
  root.style.setProperty('--vt-y', `${Math.round(y)}px`);
  root.style.setProperty('--vt-r', `${radius}px`);
  root.dataset.themeTransition = chosen;

  const veil = document.createElement('div');
  veil.className = 'ui-theme-transition-veil';
  veil.dataset.style = chosen;
  veil.setAttribute('aria-hidden', 'true');
  document.body?.append(veil);

  let result;
  let transition;
  try {
    transition = document.startViewTransition(async () => {
      result = await applyMutation();
    });
    await transition.finished;
  } catch {
    if (result === undefined) result = await applyMutation();
  } finally {
    veil.remove();
    if (root.dataset.themeTransition === chosen) delete root.dataset.themeTransition;
  }
  return result;
}

let previewTimer = 0;

/**
 * Live-preview a theme transition style inside Settings without mutating saved themes.
 */
export async function previewThemeTransition(style, origin = null) {
  const chosen = normalizeThemeTransition(style);
  if (chosen === 'off' || typeof document === 'undefined') return false;
  const root = document.documentElement;
  clearTimeout(previewTimer);
  delete root.dataset.themePreviewFlash;
  await runThemeTransition(
    chosen,
    () => {
      root.dataset.themePreviewFlash = 'true';
    },
    origin
  );
  previewTimer = setTimeout(() => {
    delete root.dataset.themePreviewFlash;
  }, 180);
  return true;
}

/**
 * Track active background tasks (e.g. 'ai', 'sync') and toggle the top-left
 * brand satellite orbit only while work is underway.
 */
export function setBrandOrbitActivity(source, active) {
  const key = String(source || 'task');
  if (active) brandOrbitSources.add(key);
  else brandOrbitSources.delete(key);

  if (typeof document !== 'undefined' && document.documentElement) {
    if (brandOrbitSources.size > 0) {
      document.documentElement.dataset.brandOrbiting = 'true';
    } else {
      delete document.documentElement.dataset.brandOrbiting;
    }
  }
  return brandOrbitSources.size > 0;
}

/**
 * Safely check whether the user or OS requests reduced motion.
 */
export function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/**
 * Position and slide the shared glass pill indicator over the active child
 * inside a segmented tab bar, navigation group, or mode switcher.
 */
export function syncSlidingPill(container, activeSelector = '.active', { immediate = false } = {}) {
  if (!container || typeof document === 'undefined') return;

  let indicator = container.querySelector(':scope > .ui-pill-indicator');
  if (prefersReducedMotion()) {
    delete container.dataset.slidingReady;
    if (indicator) indicator.style.opacity = '0';
    return;
  }

  const active = container.querySelector(activeSelector);
  if (!active) {
    if (indicator) indicator.style.opacity = '0';
    return;
  }

  container.dataset.slidingReady = 'true';

  // Prefer layout offsets when container is offsetParent so transient press/spring
  // scale transforms (from glass-interactions.js) never skew the resting pill size.
  let x, y, width, height;
  if (active.offsetParent === container) {
    x = active.offsetLeft;
    y = active.offsetTop;
    width = active.offsetWidth;
    height = active.offsetHeight;
  } else {
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    x = activeRect.left - containerRect.left - container.clientLeft + container.scrollLeft;
    y = activeRect.top - containerRect.top - container.clientTop + container.scrollTop;
    width = activeRect.width;
    height = activeRect.height;
  }

  if (width <= 0 || height <= 0) {
    delete container.dataset.slidingReady;
    if (indicator) indicator.style.opacity = '0';
    return;
  }

  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'ui-pill-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    container.prepend(indicator);
  }

  const firstPlacement = immediate || indicator.dataset.positioned !== 'true';
  if (firstPlacement) indicator.dataset.noTransition = 'true';

  indicator.style.width = `${width}px`;
  indicator.style.height = `${height}px`;
  indicator.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  indicator.style.opacity = '1';

  if (firstPlacement) {
    void indicator.offsetWidth;
    indicator.dataset.positioned = 'true';
    requestAnimationFrame(() => {
      if (indicator.isConnected) delete indicator.dataset.noTransition;
    });
  }
}

/**
 * Smoothly interpolate a numeric element using easeOutExpo over ~260ms.
 * Falls back to immediate assignment when reduced motion is enabled.
 */
export function animateNumber(element, from, to, formatter, { duration = 260, signal } = {}) {
  if (!element) return () => {};
  const startVal = Number.isFinite(from) ? from : 0;
  const endVal = Number.isFinite(to) ? to : 0;

  if (prefersReducedMotion() || startVal === endVal || duration <= 0 || typeof requestAnimationFrame !== 'function') {
    element.textContent = formatter(endVal);
    return () => {};
  }

  let frameId = 0;
  let stopped = false;
  const startTime = performance.now();

  const stop = () => {
    stopped = true;
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };

  if (signal) {
    if (signal.aborted) {
      element.textContent = formatter(endVal);
      return () => {};
    }
    signal.addEventListener('abort', stop, { once: true });
  }

  const step = now => {
    if (stopped || !element.isConnected) return;
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = startVal + (endVal - startVal) * eased;
    element.textContent = formatter(progress >= 1 ? endVal : current);
    if (progress < 1) {
      frameId = requestAnimationFrame(step);
    } else {
      frameId = 0;
    }
  };

  frameId = requestAnimationFrame(step);
  return stop;
}

/**
 * Initialize global sliding-pill motion tracking across workspace tabs,
 * primary sidebar navigation, and theme mode switchers.
 */
export function initWorkspaceMotion() {
  if (workspaceMotionInitialized || typeof document === 'undefined') return;
  workspaceMotionInitialized = true;

  const targets = [
    { selector: '.surface-toolbar .view-tabs', active: '.view-tab.active' },
    { selector: '.sidebar .main-nav', active: '.nav-item.active' },
    { selector: '#modal .theme-mode-control', active: 'button.active' },
  ];

  let frame = 0;
  const observed = new WeakSet();
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => scheduleSync())
    : null;

  function syncAll(immediate = false) {
    for (const target of targets) {
      for (const container of document.querySelectorAll(target.selector)) {
        if (!observed.has(container)) {
          observed.add(container);
          resizeObserver?.observe(container);
          mutationObserver.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'hidden'],
          });
        }
        syncSlidingPill(container, target.active, { immediate });
      }
    }
  }

  function scheduleSync(immediate = false) {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      syncAll(immediate);
    });
  }

  const mutationObserver = new MutationObserver(() => scheduleSync(false));

  const modalContent = document.getElementById('modal-content');
  if (modalContent) {
    mutationObserver.observe(modalContent, { childList: true, subtree: true });
  }
  const modal = document.getElementById('modal');
  if (modal) {
    mutationObserver.observe(modal, { attributes: true, attributeFilter: ['open'] });
  }

  window.addEventListener('resize', () => scheduleSync(true), { passive: true });
  try {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => scheduleSync(true));
  } catch {}

  scheduleSync(true);
}
