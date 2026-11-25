// Real-time Web Audio envelope bridge for Materia AI Companion (WebGL portrait + backdrop pulse).
// Connects to any HTMLAudioElement playing local GPT-SoVITS WAV output, computes smoothed RMS & low-band
// energy via AnalyserNode, and exposes CSS variables (--voice-rms, --voice-low) + frame callbacks.

export class AudioReactiveBridge {
  constructor({
    stageElement = null,
    onLevel = null,
    fftSize = 256,
    smoothing = 0.78,
    attack = 0.35,
    release = 0.14,
  } = {}) {
    this.stageElement = stageElement;
    this.onLevel = onLevel;
    this.fftSize = fftSize;
    this.smoothing = smoothing;
    this.attack = attack;
    this.release = release;
    this.context = null;
    this.analyser = null;
    this.sources = new WeakMap();
    this.timeData = null;
    this.freqData = null;
    this.frame = 0;
    this.rms = 0;
    this.low = 0;
    this.activeAudio = null;
    this.motionMedia = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };
  }

  ensureContext() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return this.context;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    this.context = new Ctor();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothing;
    this.analyser.connect(this.context.destination);
    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    return this.context;
  }

  attachAudio(audioElement) {
    if (!audioElement) return () => {};
    const ctx = this.ensureContext();
    if (!ctx) return () => {};

    let source = this.sources.get(audioElement);
    if (!source) {
      source = ctx.createMediaElementSource(audioElement);
      source.connect(this.analyser);
      this.sources.set(audioElement, source);
    }

    const onPlay = () => {
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
      this.activeAudio = audioElement;
      this.setSpeaking(true);
      this.startLoop();
    };
    const onStop = () => {
      if (this.activeAudio === audioElement) {
        this.activeAudio = null;
        this.setSpeaking(false);
        this.stopLoop();
      }
    };

    audioElement.addEventListener('play', onPlay);
    audioElement.addEventListener('pause', onStop);
    audioElement.addEventListener('ended', onStop);
    audioElement.addEventListener('error', onStop);

    if (!audioElement.paused && !audioElement.ended) onPlay();

    return () => {
      audioElement.removeEventListener('play', onPlay);
      audioElement.removeEventListener('pause', onStop);
      audioElement.removeEventListener('ended', onStop);
      audioElement.removeEventListener('error', onStop);
      onStop();
    };
  }

  setSpeaking(speaking) {
    if (!this.stageElement) return;
    this.stageElement.dataset.voiceSpeaking = speaking ? 'true' : 'false';
    if (!speaking) {
      this.stageElement.style.setProperty('--voice-rms', '0');
      this.stageElement.style.setProperty('--voice-low', '0');
    }
  }

  startLoop() {
    if (this.frame || this.motionMedia.matches) return;
    const tick = () => {
      this.frame = 0;
      if (!this.activeAudio || this.activeAudio.paused || this.activeAudio.ended || this.motionMedia.matches) {
        this.rms = 0;
        this.low = 0;
        this.emit(0, 0);
        return;
      }
      this.analyser.getByteTimeDomainData(this.timeData);
      this.analyser.getByteFrequencyData(this.freqData);

      let sumSq = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const sample = (this.timeData[i] - 128) / 128;
        sumSq += sample * sample;
      }
      const rawRms = Math.min(1, Math.sqrt(sumSq / this.timeData.length) * 2.6);

      // Voice fundamental / chest warmth band (first 16 bins)
      const lowBins = Math.min(16, this.freqData.length);
      let lowSum = 0;
      for (let i = 0; i < lowBins; i++) lowSum += this.freqData[i];
      const rawLow = Math.min(1, lowSum / (lowBins * 255));

      this.rms += (rawRms - this.rms) * (rawRms > this.rms ? this.attack : this.release);
      this.low += (rawLow - this.low) * (rawLow > this.low ? this.attack : this.release);
      this.emit(this.rms, this.low);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  emit(rms, low) {
    const r = Number(rms.toFixed(4));
    const l = Number(low.toFixed(4));
    if (this.stageElement) {
      this.stageElement.style.setProperty('--voice-rms', String(r));
      this.stageElement.style.setProperty('--voice-low', String(l));
    }
    this.onLevel?.({ rms: r, low: l, speaking: Boolean(this.activeAudio) });
  }

  stopLoop() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.rms = 0;
    this.low = 0;
    this.emit(0, 0);
  }

  dispose() {
    this.stopLoop();
    this.setSpeaking(false);
    this.activeAudio = null;
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
      this.analyser = null;
    }
  }
}

// Helper for mapping Kurisu's 11 pre-rendered VP9 transparent WebM clips to Agent lifecycle states.
export const KURISU_STAGE_ACTIONS = Object.freeze({
  idle: '01',
  thinking: '02',
  writing: '03',
  waitingVoice: '08',
  fetchingPaper: '09',
  readingPaper: '11',
});

export function pickCompanionAction(state) {
  switch (state) {
    case 'tool_call': return KURISU_STAGE_ACTIONS.fetchingPaper;
    case 'reading': return KURISU_STAGE_ACTIONS.readingPaper;
    case 'voice_synthesizing': return KURISU_STAGE_ACTIONS.waitingVoice;
    case 'streaming': return KURISU_STAGE_ACTIONS.writing;
    case 'thinking': return KURISU_STAGE_ACTIONS.thinking;
    default: return KURISU_STAGE_ACTIONS.idle;
  }
}
