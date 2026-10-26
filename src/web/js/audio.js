// Sound effects and background music, all generated with WebAudio
// (no audio files, nothing copyrighted).
//
// Everything is built from soft sine/triangle tones - mallets (marimba-like),
// bells, warm pads and a round bass - plus a light reverb. No square/saw waves
// and no noise, which is what makes game synths sound buzzy and fuzzy.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];

// chords as [root, third, fifth] around C3
const C = [48, 52, 55];
const G = [43, 47, 50];
const AM = [45, 48, 52];
const F = [41, 45, 48];

// race tune: [bar, sixteenth, midi note, length in sixteenths]
const RACE_MELODY = [
  [0, 0, 79, 4], [0, 6, 76, 2], [0, 8, 79, 2], [0, 12, 84, 4],
  [1, 0, 83, 4], [1, 6, 79, 2], [1, 8, 74, 2], [1, 12, 79, 4],
  [2, 0, 81, 4], [2, 6, 76, 2], [2, 8, 72, 2], [2, 12, 76, 4],
  [3, 0, 77, 4], [3, 6, 81, 2], [3, 8, 84, 4], [3, 14, 83, 2],
];

const SONGS = {
  lobby: { bpm: 92, chords: [C, AM, F, G], arpEvery: 4, drums: false, melody: null },
  race: { bpm: 116, chords: [C, G, AM, F], arpEvery: 2, drums: true, melody: RACE_MELODY },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = 0.7;
    this.musicOn = true;
    this.musicVol = 0.35;
    this.song = 'lobby';
    this.step = 0;
    this.loop = 0;
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
    this.init(new AC());
    this.nextNote = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  // builds the mixer on any (also offline) audio context
  init(ctx) {
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.vol;
    this.master.connect(limiter);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? this.musicVol : 0;
    this.musicBus.connect(this.master);
    // small room reverb (the impulse is noise, the result is smooth)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
  }

  makeImpulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        lp += (Math.random() * 2 - 1 - lp) * 0.22; // darker tail
        d[i] = lp * Math.exp(-t * 3.2) * (t < 0.008 ? t / 0.008 : 1);
      }
    }
    return buf;
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
      this.loop = 0;
    }
  }

  now() {
    return this.ctx.currentTime + 0.005;
  }

  // ---------------------------------------------------------------- instruments
  // one sine/triangle voice with a click-free envelope
  voice(freq, at, { type = 'sine', vol = 0.1, attack = 0.004, decay = 0.3, glide = 0, out = null, wet = 0, lowpass = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + decay * 0.8);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    let node = o;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      f.Q.value = 0.5;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out || this.sfx);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(this.reverb);
    }
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  }

  // wooden marimba-ish mallet: fundamental + its 4th partial that dies fast
  mallet(freq, at, vol = 0.1, decay = 0.45, out = null, wet = 0.2) {
    this.voice(freq, at, { vol, decay, out, wet });
    this.voice(freq * 4, at, { vol: vol * 0.22, decay: decay * 0.18, out, wet });
  }

  // glockenspiel-ish bell: pure partials that ring
  bell(freq, at, vol = 0.08, decay = 1.1, out = null, wet = 0.35) {
    this.voice(freq, at, { vol, decay, out, wet });
    this.voice(freq * 2, at, { vol: vol * 0.35, decay: decay * 0.5, out, wet });
    this.voice(freq * 3.01, at, { vol: vol * 0.12, decay: decay * 0.3, out, wet });
  }

  // soft warm chord with a slow swell
  pad(notes, at, dur, vol = 0.03, out = null) {
    for (const n of notes) {
      this.voice(midi(n), at, { type: 'triangle', vol, attack: Math.min(0.5, dur * 0.3), decay: dur, lowpass: 1100, out, wet: 0.4 });
    }
  }

  // ---------------------------------------------------------------- effects
  // peg hits: quiet wind-chime notes from a pentatonic scale
  tick(at) {
    if (!this.ctx) return;
    const t = at ?? this.now();
    if (at == null && (!this.ready || t - this.lastTick < 0.085)) return;
    this.lastTick = t;
    const n = 84 + PENTA[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 2);
    this.voice(midi(n), t, { vol: 0.03 + Math.random() * 0.012, decay: 0.16, wet: 0.25 });
  }

  boing(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    this.voice(520, t, { vol: 0.13, decay: 0.22, glide: 240, lowpass: 1800, wet: 0.1 });
    this.voice(1040, t, { vol: 0.03, decay: 0.06 });
  }

  pop(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    // water-drop "bloop"
    this.voice(380, t, { vol: 0.14, decay: 0.12, glide: 1000, wet: 0.15 });
  }

  beep(n, at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    if (n > 0) {
      this.mallet(midi(72), t, 0.2, 0.5);
      this.bell(midi(84), t, 0.05, 0.6);
    } else {
      this.mallet(midi(67), t, 0.2, 0.7);
      this.mallet(midi(60), t, 0.16, 0.8);
    }
  }

  go(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    [72, 76, 79, 84].forEach((n, i) => this.mallet(midi(n), t + i * 0.035, 0.14, 0.9));
    this.bell(midi(96), t + 0.12, 0.06, 1.2);
    this.pad([60, 64, 67, 72], t, 1.4, 0.035);
  }

  like(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    this.bell(midi(88), t, 0.08, 0.7);
    this.bell(midi(93), t + 0.09, 0.08, 0.9);
  }

  boost(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    // smooth rising "zoom"
    this.voice(300, t, { type: 'triangle', vol: 0.07, attack: 0.03, decay: 0.38, glide: 1100, lowpass: 2200, wet: 0.2 });
    this.bell(midi(91), t + 0.28, 0.04, 0.5);
  }

  sub(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    [72, 76, 79, 84, 88].forEach((n, i) => this.mallet(midi(n), t + i * 0.085, 0.13, 0.7));
    this.bell(midi(96), t + 0.45, 0.06, 1.4);
    this.pad([60, 64, 67], t + 0.4, 1.6, 0.03);
  }

  fanfare(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    const tune = [[67, 0], [72, 0.14], [76, 0.28], [79, 0.42], [76, 0.62], [79, 0.76], [84, 0.95]];
    for (const [n, d] of tune) {
      this.mallet(midi(n), t + d, 0.15, 0.6);
      this.bell(midi(n + 12), t + d, 0.035, 0.5);
    }
    this.pad([48, 55, 60, 64, 67], t + 0.95, 2.4, 0.035);
    this.bell(midi(96), t + 1.0, 0.06, 1.8);
  }

  finish(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    this.bell(midi(91), at ?? this.now(), 0.07, 0.8);
  }

  poof(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    this.voice(900, t, { vol: 0.06, decay: 0.2, glide: 320, wet: 0.2 });
  }

  chime(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    this.mallet(midi(79), t, 0.1, 0.5);
    this.mallet(midi(84), t + 0.08, 0.1, 0.6);
  }

  rise(at) {
    if (!this.ctx || (at == null && !this.ready)) return;
    const t = at ?? this.now();
    [67, 71, 74, 79, 83, 86].forEach((n, i) => this.mallet(midi(n), t + i * 0.06, 0.1, 0.5));
  }

  // ---------------------------------------------------------------- music
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextNote < ctx.currentTime - 0.5) this.nextNote = ctx.currentTime + 0.05;
    while (this.nextNote < ctx.currentTime + 0.15) {
      const song = SONGS[this.song];
      if (this.musicOn && this.musicVol > 0) this.playStep(song, this.step, this.loop, this.nextNote);
      this.nextNote += 60 / song.bpm / 4;
      this.step = (this.step + 1) % 64;
      if (this.step === 0) this.loop++;
    }
  }

  // used by the offline sound check: lay down `seconds` of a song from time `at`
  renderSong(name, at, seconds) {
    const song = SONGS[name];
    const stepDur = 60 / song.bpm / 4;
    let step = 0;
    let loop = 0;
    for (let t = at; t < at + seconds; t += stepDur) {
      this.playStep(song, step, loop, t);
      step = (step + 1) % 64;
      if (step === 0) loop++;
    }
  }

  playStep(song, step, loop, t) {
    const out = this.musicBus;
    const beat = 60 / song.bpm;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = song.chords[bar % song.chords.length];
    // warm pad, one chord per bar
    if (s === 0) this.pad(chord.map((n) => n + 12), t, beat * 4, 0.03, out);
    // round plucked bass
    const bassSteps = song.drums ? [0, 6, 8, 14] : [0, 8];
    if (bassSteps.includes(s)) {
      const n = s === 14 || s === 6 ? chord[2] : chord[0];
      this.voice(midi(n), t, { vol: 0.18, decay: beat * 0.9, lowpass: 600, out });
      this.voice(midi(n) * 2, t, { vol: 0.04, decay: beat * 0.4, lowpass: 900, out });
    }
    // marimba arpeggio
    if (s % song.arpEvery === 0) {
      const i = Math.floor(s / song.arpEvery);
      const pattern = [0, 1, 2, 1, 2, 0, 1, 2];
      const n = chord[pattern[i % pattern.length]] + 24 + (i % 4 === 3 ? 12 : 0);
      this.mallet(midi(n), t, song.drums ? 0.055 : 0.07, beat * 0.9, out, 0.25);
    }
    if (song.drums) {
      // soft kick and a woodblock - no noise
      if (s === 0 || s === 8) this.voice(115, t, { vol: 0.2, decay: 0.16, glide: 48, out });
      if (s === 4 || s === 12) {
        this.voice(1250, t, { vol: 0.035, decay: 0.045, out });
        this.voice(1750, t, { vol: 0.015, decay: 0.03, out });
      }
    }
    // the tune plays every other time round, so it does not get tiring
    if (song.melody && loop % 2 === 1) {
      for (const [b, st, n, len] of song.melody) {
        if (b === bar % 4 && st === s) this.bell(midi(n), t, 0.045, (len * beat) / 4 + 0.4, out, 0.35);
      }
    }
  }
}
