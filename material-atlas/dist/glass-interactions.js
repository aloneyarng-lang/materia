// Glass feedback changes presentation only; native click, focus and keyboard behavior remain intact.
// Optimized with rAF-batched pointer specular updates and cached DOMRects to avoid layout thrashing.
let controller = null, media = null;
const animations = new Map();
const rectCache = new WeakMap();
let pointerButton = null, keyButton = null;
let hoverButton = null, pendingX = 0, pendingY = 0, moveFrame = 0;

const selector = 'button,input[type="button"],input[type="submit"],a[role="button"]';
const allowed = target => {
  const button = target instanceof Element ? target.closest(selector) : null;
  return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;
};

function stopAnimation(button) {
  const animation = animations.get(button);
  if (animation) {
    animation.cancel();
    animations.delete(button);
  }
}

function clear(button) {
  if (!button) return;
  stopAnimation(button);
  delete button.dataset.glassPressed;
}

function mark(button) {
  if (button.dataset.glassInteractive !== '') {
    button.dataset.glassInteractive = '';
    if (getComputedStyle(button).position === 'static') {
      button.dataset.glassPosition = 'static';
    }
  }
}

function getCachedRect(button) {
  let box = rectCache.get(button);
  if (!box) {
    box = button.getBoundingClientRect();
    rectCache.set(button, box);
  }
  return box;
}

function invalidateRects() {
  if (hoverButton) rectCache.delete(hoverButton);
  if (pointerButton) rectCache.delete(pointerButton);
}

function flushPointerSpecular() {
  moveFrame = 0;
  const button = hoverButton;
  if (!button || !button.isConnected || media?.matches) return;
  const box = getCachedRect(button);
  button.style.setProperty('--glass-pointer-x', Math.round(pendingX - box.left) + 'px');
  button.style.setProperty('--glass-pointer-y', Math.round(pendingY - box.top) + 'px');
}

function play(button, frames, options) {
  stopAnimation(button);
  const animation = button.animate(frames, options);
  animations.set(button, animation);
  animation.onfinish = () => {
    if (animations.get(button) === animation && options.fill !== 'forwards') {
      animation.cancel();
      animations.delete(button);
    }
  };
}

function press(button) {
  mark(button);
  button.dataset.glassPressed = '';
  if (media.matches) return;
  const scale = parseFloat(getComputedStyle(button).scale) || 1;
  const width = getCachedRect(button).width;
  play(button, [{ scale: String(scale) }, { scale: String(width > 200 ? .98 : width < 48 ? .9 : .95) }], {
    duration: 85,
    easing: 'cubic-bezier(.16,.8,.24,1)',
    fill: 'forwards',
  });
}

function release(button, cancelled = false) {
  if (!button) return;
  delete button.dataset.glassPressed;
  if (cancelled || !button.isConnected || media.matches) {
    stopAnimation(button);
    return;
  }
  const measured = parseFloat(getComputedStyle(button).scale) || 1;
  // A quick tap can end before its first animation frame. Give it a small,
  // visible impulse too, while a held press releases from its actual depth.
  const start = Math.min(measured, getCachedRect(button).width > 200 ? .99 : .975);
  // A damped spring returns to exactly 1; no permanent transforms or delayed clicks.
  const frames = Array.from({ length: 29 }, (_, i) => {
    const t = i / 28;
    return { offset: t, scale: String(i === 28 ? 1 : 1 + (start - 1) * Math.exp(-6.5 * t) * Math.cos(12.8 * t)) };
  });
  play(button, frames, { duration: 420, easing: 'linear' });
}

function reset() {
  if (moveFrame) {
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
  }
  hoverButton = null;
  clear(pointerButton);
  clear(keyButton);
  pointerButton = keyButton = null;
  for (const button of [...animations.keys()]) stopAnimation(button);
}

export function setGlassInteractions(enabled) {
  if (!enabled) {
    controller?.abort();
    controller = null;
    reset();
    for (const button of document.querySelectorAll('[data-glass-interactive]')) {
      delete button.dataset.glassInteractive;
      delete button.dataset.glassPosition;
      delete button.dataset.glassPressed;
      button.style.removeProperty('--glass-pointer-x');
      button.style.removeProperty('--glass-pointer-y');
    }
    return;
  }
  if (controller) return;
  controller = new AbortController();
  const signal = controller.signal;
  media = matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', reset, { signal });

  document.addEventListener('pointerover', event => {
    const button = allowed(event.target);
    if (!button) return;
    mark(button);
    if (hoverButton !== button) {
      hoverButton = button;
      rectCache.delete(button);
    }
  }, { signal, passive: true });

  document.addEventListener('pointerout', event => {
    if (hoverButton && event.target instanceof Element && hoverButton.contains(event.target)) {
      if (!event.relatedTarget || !hoverButton.contains(event.relatedTarget)) {
        rectCache.delete(hoverButton);
        hoverButton = null;
      }
    }
  }, { signal, passive: true });

  document.addEventListener('pointermove', event => {
    const button = allowed(event.target);
    if (!button || media.matches) return;
    if (hoverButton !== button) {
      hoverButton = button;
      rectCache.delete(button);
    }
    pendingX = event.clientX;
    pendingY = event.clientY;
    if (!moveFrame) moveFrame = requestAnimationFrame(flushPointerSpecular);
  }, { signal, passive: true });

  document.addEventListener('scroll', invalidateRects, { signal, capture: true, passive: true });
  window.addEventListener('resize', invalidateRects, { signal, passive: true });

  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const button = allowed(event.target);
    if (!button) return;
    clear(pointerButton);
    pointerButton = button;
    press(button);
  }, { signal, capture: true, passive: true });

  document.addEventListener('pointerup', () => {
    release(pointerButton);
    pointerButton = null;
  }, { signal, capture: true, passive: true });

  document.addEventListener('pointercancel', () => {
    release(pointerButton, true);
    pointerButton = null;
  }, { signal, capture: true, passive: true });

  document.addEventListener('focusin', event => {
    const button = allowed(event.target);
    if (button) mark(button);
  }, { signal });

  document.addEventListener('focusout', event => {
    if (event.target === keyButton) {
      release(keyButton, true);
      keyButton = null;
    }
  }, { signal });

  document.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || ![' ', 'Enter'].includes(event.key)) return;
    const button = allowed(event.target);
    if (!button) return;
    clear(keyButton);
    keyButton = button;
    press(button);
  }, { signal, capture: true });

  document.addEventListener('keyup', event => {
    if ([' ', 'Enter'].includes(event.key)) {
      release(keyButton);
      keyButton = null;
    }
  }, { signal, capture: true });

  window.addEventListener('blur', reset, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  }, { signal });
}
