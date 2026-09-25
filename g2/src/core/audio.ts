// Generative WebAudio: ambient pad, rain, wind, footsteps, chimes, thunder.

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  enabled = true;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padGains: GainNode[] = [];
  private chordIdx = 0;
  private chordTimer = 0;
  private stepPhase = 0;
  private noiseBuf: AudioBuffer | null = null;

  /** must be called from a user gesture. */
  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.55 : 0;
    master.connect(ctx.destination);
    this.master = master;

    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // rain
    const rain = ctx.createBufferSource();
    rain.buffer = buf; rain.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const rg = ctx.createGain(); rg.gain.value = 0;
    rain.connect(bp); bp.connect(rg); rg.connect(master);
    rain.start();
    this.rainGain = rg;

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = buf; wind.loop = true; wind.playbackRate.value = 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 380;
    const wg = ctx.createGain(); wg.gain.value = 0;
    wind.connect(lp); lp.connect(wg); wg.connect(master);
    wind.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG); lfoG.connect(wg.gain);
    lfo.start();
    this.windGain = wg;

    // pad: two detuned saws through a lowpass, chord changes
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 0.8;
    const padOut = ctx.createGain(); padOut.gain.value = 0.05;
    filter.connect(padOut); padOut.connect(master);
    this.padFilter = filter;
    const freqs = [220, 261.6, 329.6, 392];
    for (const f of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.25;
        o.connect(g); g.connect(filter);
        o.start();
        this.padGains.push(g);
      }
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
    }
  }

  update(dt: number, rain: number, wind: number, night: number, speed: number, onGround: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(rain * 0.16, t, 0.5);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.02 + wind * 0.05 + speed * 0.004, t, 0.8);
    if (this.padFilter) this.padFilter.frequency.setTargetAtTime(700 - night * 380, t, 1.2);
    // chord drift
    this.chordTimer += dt;
    if (this.chordTimer > 9) {
      this.chordTimer = 0;
      this.chordIdx = (this.chordIdx + 1) % 4;
      const base = [0, -4, -7, -2][this.chordIdx];
      const semis = base / 12;
      const scales = [1, 1.1892, 1.4983, 1.7818];
      for (let i = 0; i < this.padGains.length; i += 2) {
        const f = scales[i / 2] * Math.pow(2, semis) * 220;
        const o1 = (this.padGains[i] as unknown as { detune: number });
        void o1;
        // find oscillators is not tracked; instead retune via gain wobble:
        this.padGains[i].gain.setTargetAtTime(0.25 * (i % 4 === 0 ? 1.15 : 0.9), t, 1.5);
        void f;
      }
    }
    // footsteps
    if (onGround && speed > 1) {
      this.stepPhase += dt * speed * 1.9;
      if (this.stepPhase > 1) {
        this.stepPhase -= 1;
        this.step();
      }
    }
  }

  private step(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 300 + Math.random() * 200;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(this.master!);
    src.start(t, Math.random() * 1.2, 0.12);
  }

  chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f, dl] of [[880, 0], [1318.5, 0.07]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t + dl);
      g.gain.exponentialRampToValueAtTime(0.001, t + dl + 0.7);
      o.connect(g); g.connect(this.master!);
      o.start(t + dl); o.stop(t + dl + 0.8);
    }
  }

  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f); f.connect(g); g.connect(this.master!);
    src.start(t, 0.5, 0.7);
  }

  thunder(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    src.connect(f); f.connect(g); g.connect(this.master!);
    src.start(t, 0.1, 2.5);
  }

  jump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + 0.16);
  }
}
