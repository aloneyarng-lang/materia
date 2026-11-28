// Isolate narrow tonal bands by complex demodulation, then move each band
// by its mapped interval. The residual (including transients) stays dry.
class MusicRemapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bands = [];
    this.port.onmessage = ({data: offsets}) => {
      this.bands = [];
      for (let note = 33; note <= 103; note++) {
        const offset = offsets[note % 12];
        if (!offset) continue;
        const hz = 440 * 2 ** ((note - 69) / 12);
        const angle = 2 * Math.PI * hz / sampleRate;
        const target = angle * 2 ** (offset / 12);
        this.bands.push({
          a: 1 - Math.exp(-angle * 0.022),
          cos: Math.cos(angle), sin: Math.sin(angle),
          outCos: Math.cos(target), outSin: Math.sin(target),
          x: 1, y: 0, u: 1, v: 0, state: []
        });
      }
    };
  }
  process([input], [output]) {
    for (let ch = 0; ch < output.length; ch++) {
      if (input[ch]) output[ch].set(input[ch]);
    }
    for (const band of this.bands) {
      let {x,y,u,v} = band;
      for (let i = 0; i < output[0].length; i++) {
        for (let ch = 0; ch < input.length; ch++) {
          const s = band.state[ch] ??= new Float64Array(4);
          const sample = input[ch][i];
          s[0] += band.a * (sample*x - s[0]);
          s[1] += band.a * (sample*y - s[1]);
          s[2] += band.a * (s[0] - s[2]);
          s[3] += band.a * (s[1] - s[3]);
          output[ch][i] += 2 * (s[2]*(u-x) + s[3]*(v-y));
        }
        const nx = x*band.cos - y*band.sin;
        y = y*band.cos + x*band.sin;
        x = nx;
        const nu = u*band.outCos - v*band.outSin;
        v = v*band.outCos + u*band.outSin;
        u = nu;
      }
      Object.assign(band,{x,y,u,v});
    }
    return true;
  }
}
registerProcessor('music-audio-remap', MusicRemapProcessor);
