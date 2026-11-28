export function createPlaybackEffect(audio, score) {
  const controls = document.createElement('div');
  controls.className = 'music-tools';
  controls.innerHTML = '<label>播放调式 <select id="music-scale"></select></label><label>主音 <select id="music-tonic"></select></label><span id="music-effect-status" role="status"></span>';
  audio.after(controls);
  const [scaleControl, tonicControl] = controls.querySelectorAll('select');
  const status = controls.querySelector('[role="status"]');
  let source, analyser, processor, loading, offsets = [];
  let disposed = false;
  async function route(original) {
    if (!source || disposed) return;
    if (!offsets.some(Boolean)) {
      source.disconnect();
      processor?.disconnect();
      source.connect(analyser);
      status.textContent = original ? '正在对比原音' : '';
      return;
    }
    try {
      const context = source.context;
      loading ??= context.audioWorklet.addModule(new URL('./music-audio-remap.js', import.meta.url));
      await loading;
      if (disposed || !offsets.some(Boolean)) return;
      processor ??= new AudioWorkletNode(context, 'music-audio-remap');
      processor.port.postMessage(offsets);
      source.disconnect();
      processor.disconnect();
      source.connect(processor).connect(analyser);
      status.textContent = '变奏已启用';
    } catch {
      loading = null;
      status.textContent = '变奏加载失败，当前为原音';
    }
  }
  return {
    bind() {
      for (const [control,key] of [[scaleControl,'scale'],[tonicControl,'root']]) {
        const shared = score.querySelector('[data-'+key+']');
        control.replaceChildren(...Array.from(shared.options, option => option.cloneNode(true)));
        control.onchange = () => {
          const value = control.value;
          const compare = score.querySelector('[data-ab]');
          if (compare.getAttribute('aria-pressed') === 'true') compare.click();
          shared.value = value;
          shared.dispatchEvent(new Event('change'));
        };
      }
    },
    change(scale, tonic, next, original) {
      scaleControl.value = scale;
      tonicControl.value = String(tonic);
      offsets = next;
      void route(original);
    },
    connect(node, target) {
      source = node;
      analyser = target;
      source.connect(analyser);
      return route(false);
    },
    dispose() { disposed = true; processor?.disconnect(); }
  };
}
