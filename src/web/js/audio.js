// Sound effects and a little chiptune soundtrack, all generated with WebAudio
// (no audio files, nothing copyrighted).

const PENTA = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// chord roots (MIDI) and triads for the two moods
const SONGS = {
  lobby: { bpm: 100, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], drums: 'chill', arpEvery: 2 },
  race: { bpm: 138, chords: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], drums: 'drive', arpEvery: 1 },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = 0.7;
    this.musicOn = true;
    this.musicVol = 0.35;
    this.song = 'lobby';
    this.step = 0;
    this.lastTick = 0;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  enable() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 6;
    this.comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(this.comp);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? this.musicVol : 0;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextNote = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setVolumes(vol, musicOn, musicVol) {
    this.vol = vol;
    this.musicOn = musicOn;
    this.musicVol = musicVol;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(vol, t, 0.05);
    this.musicBus.gain.setTargetAtTime(musicOn ? musicVol : 0, t, 0.2);
  }

  setSong(name) {
    if (SONGS[name] && name !== this.song) {
      this.song = name;
      this.step = 0;
    }
  }

  // ---------------------------------------------------------------- building blocks
  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005, out = null, filter = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(dur, { vol = 0.2, at = 0, type = 'highpass', freq = 6000, out = null, sweep = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, at || ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- effects
  tick() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick < 0.035) return;
    this.lastTick = now;
    const n = 84 + PENTA[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 2);
    this.tone(midi(n), 0.07, { vol: 0.05 });
  }

  boing() {
    if (!this.ready) return;
    this.tone(260, 0.16, { type: 'triangle', vol: 0.16, slide: 620 });
  }

  pop() {
    if (!this.ready) return;
    this.tone(480, 0.09, { vol: 0.2, slide: 1150 });
  }

  beep(n) {
    if (!this.ready) return;
    this.tone(n > 0 ? 660 : 990, n > 0 ? 0.16 : 0.5, { type: 'square', vol: 0.12, filter: 3000 });
  }

  go() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const n of [72, 76, 79, 84]) this.tone(midi(n), 0.6, { type: 'sawtooth', vol: 0.07, at: t, filter: 2600 });
    this.hiss(0.5, { vol: 0.15, type: 'bandpass', freq: 800, sweep: 4000 });
  }

  like() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(midi(88), 0.18, { vol: 0.12, at: t });
    this.tone(midi(93), 0.3, { vol: 0.12, at: t + 0.07 });
  }

  boost() {
    if (!this.ready) return;
    this.hiss(0.45, { vol: 0.12, type: 'bandpass', freq: 400, sweep: 3000 });
    this.tone(220, 0.35, { type: 'sawtooth', vol: 0.05, slide: 880, filter: 1800 });
  }

  sub() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84, 88].forEach((n, i) => this.tone(midi(n), 0.35, { type: 'triangle', vol: 0.16, at: t + i * 0.09 }));
    this.tone(midi(96), 0.8, { vol: 0.08, at: t + 0.45 });
  }

  fanfare() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const seq = [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45], [76, 0.6], [79, 0.7]];
    for (const [n, d] of seq) this.tone(midi(n), 0.22, { type: 'square', vol: 0.08, at: t + d, filter: 3500 });
    for (const n of [72, 76, 79, 84]) this.tone(midi(n), 1.4, { type: 'sawtooth', vol: 0.05, at: t + 0.85, filter: 2800 });
    this.hiss(1.2, { vol: 0.08, at: t + 0.85, freq: 7000 });
  }

  finish() {
    if (!this.ready) return;
    this.tone(midi(91), 0.25, { type: 'triangle', vol: 0.12 });
  }

  poof() {
    if (!this.ready) return;
    this.hiss(0.25, { vol: 0.12, type: 'lowpass', freq: 3000, sweep: 300 });
  }

  // ---------------------------------------------------------------- music
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const song = SONGS[this.song];
    const stepDur = 60 / song.bpm / 4;
    if (this.nextNote < ctx.currentTime - 0.5) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.12) {
      if (this.musicOn && this.musicVol > 0) this.playStep(song, this.step, this.nextNote, stepDur);
      this.nextNote += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(song, step, t, dur) {
    const out = this.musicBus;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = song.chords[bar % song.chords.length];
    const drive = song.drums === 'drive';
    // kick
    if (s % (drive ? 4 : 8) === 0) this.tone(130, 0.2, { vol: 0.5, at: t, slide: 42, out });
    // snare
    if (drive && (s === 4 || s === 12)) this.hiss(0.14, { vol: 0.25, at: t, type: 'bandpass', freq: 1800, out });
    // hats
    if (s % 4 === 2 || (drive && s % 2 === 1)) this.hiss(0.04, { vol: drive ? 0.07 : 0.05, at: t, freq: 8000, out });
    // bass
    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      this.tone(midi(chord[0] - 12), dur * (s === 0 || s === 8 ? 2.5 : 1.6), { type: 'triangle', vol: 0.32, at: t, out });
    }
    // arpeggio
    if (s % song.arpEvery === 0) {
      const idx = Math.floor(s / song.arpEvery) % 4;
      const note = idx === 3 ? chord[1] + 12 : chord[idx] + 12;
      this.tone(midi(note), dur * 1.6, { type: 'square', vol: 0.045, at: t, out, filter: 1800 });
    }
    // little melody sparkle every other bar in the race song
    if (drive && bar % 2 === 1 && (s === 0 || s === 6 || s === 10)) {
      this.tone(midi(chord[2] + 24), dur * 3, { type: 'triangle', vol: 0.06, at: t, out });
    }
  }
}
