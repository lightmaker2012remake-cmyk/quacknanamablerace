// Sound effects (generated with WebAudio) and the background music track.
//
// The effects are deep and punchy: drum-like booms, wooden "toks" and warm
// brass hits in a low register, tuned to the key of the music (E major).
// Drums and brass run through a gentle saturator for extra punch. The brass
// uses sawtooth waves behind two lowpass filters, so it stays warm and never
// buzzy, and there is no noise anywhere.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// stop an automated value where it is at time t, so a new change starts from there
function hold(param, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
  } else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
}

// E major pentatonic, E3..E4
const PEG_NOTES = [52, 54, 56, 59, 61, 64];
const E_CHORD = [40, 47, 52, 56, 59]; // E2 B2 E3 G#3 B3
const E_POWER = [40, 47, 52]; // E2 B2 E3
const B_CHORD = [35, 47, 51, 54]; // B1 B2 D#3 F#3

// "Background Music" by ikoliks_aj (Pixabay). 100 BPM, so one bar is 2.4 s.
// After the intro it loops bars 27-54 forever: bar 54 is crossfaded into bar 26,
// so jumping back to bar 27 sounds exactly like the song carrying on.
const MUSIC = {
  url: 'music/background-music.mp3',
  loopStart: 64.81, // start of bar 27 (just before its first beat)
  loopEnd: 132.01, // end of bar 54
  crossfade: 2.4, // one bar
  gain: 0.6, // the track is mastered loud; this sits it under the effects
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = 0.7;
    this.musicOn = true;
    this.musicVol = 0.35;
    this.phase = 'lobby';
    this.tense = false;
    this.music = null;
    this.musicLoading = false;
    this.last = {};
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
    this.loadMusic();
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
    // gentle saturation (tanh) for drums and brass: more punch, no fuzz
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(3 * ((i / (curve.length - 1)) * 2 - 1)) / 3;
    shaper.curve = curve;
    shaper.oversample = '2x';
    const post = ctx.createGain();
    post.gain.value = 2;
    pre.connect(shaper);
    shaper.connect(post);
    post.connect(this.sfx);
    this.punch = pre;
    // a big dark hall for the booms and brass (the impulse is noise, the result is smooth)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
    // music: track -> trim -> volume -> countdown filter -> ducking -> master
    this.musicTrim = ctx.createGain();
    this.musicTrim.gain.value = MUSIC.gain;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? this.musicVol : 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.7;
    this.musicDuck = ctx.createGain();
    this.musicTrim.connect(this.musicBus);
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.musicDuck);
    this.musicDuck.connect(this.master);
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
        lp += (Math.random() * 2 - 1 - lp) * 0.12; // dark tail
        d[i] = lp * Math.exp(-t * 2.6) * (t < 0.01 ? t / 0.01 : 1);
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

  // the countdown muffles the music; any other phase brings it back
  setPhase(phase) {
    this.phase = phase;
    if (phase !== 'countdown' && this.tense) this.tension(false, 0.3);
  }

  now() {
    return this.ctx.currentTime + 0.005;
  }

  // true when an effect may play now: sound is on and it is not spamming
  can(name, gap, at) {
    if (!this.ctx) return false;
    if (at != null) return true; // scheduled on purpose (offline renders)
    if (!this.ready) return false;
    const t = this.ctx.currentTime;
    if (gap && t - (this.last[name] || -1) < gap) return false;
    this.last[name] = t;
    return true;
  }

  // ---------------------------------------------------------------- music
  async loadMusic() {
    if (this.music || this.musicLoading) return;
    this.musicLoading = true;
    try {
      const res = await fetch(MUSIC.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.playMusic(buf);
    } catch (e) {
      console.warn('Background music did not load:', e);
    } finally {
      this.musicLoading = false;
    }
  }

  // Crossfade the bar before loopEnd into the bar before loopStart, so the jump
  // from loopEnd back to loopStart lands where the music would naturally be.
  prepareLoop(buf) {
    const sr = buf.sampleRate;
    const a = Math.round(MUSIC.loopStart * sr);
    const b = Math.round(MUSIC.loopEnd * sr);
    const x = Math.round(MUSIC.crossfade * sr);
    if (b > buf.length || a < x || b - a <= x) return { start: 0, end: buf.duration }; // some other file: loop it whole
    const len = b - a;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = b - x; i < b; i++) {
        const w = 0.5 - 0.5 * Math.cos((Math.PI * (i - (b - x))) / x);
        d[i] = d[i] * (1 - w) + d[i - len] * w;
      }
    }
    return { start: a / sr, end: b / sr };
  }

  playMusic(buf, at = this.ctx.currentTime + 0.05, offset = 0) {
    const loop = this.prepareLoop(buf);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = loop.start;
    src.loopEnd = loop.end;
    src.connect(this.musicTrim);
    src.start(at, offset);
    this.music = src;
    return loop;
  }

  // countdown build-up: the music closes down to a muffled rumble, GO blasts it open
  tension(on, release = 0.06, at) {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    const f = this.musicFilter.frequency;
    this.tense = on;
    hold(f, t);
    if (on) f.exponentialRampToValueAtTime(420, t + 2.6);
    else f.exponentialRampToValueAtTime(20000, t + release);
  }

  // make room for a big moment: the music dips, then swells back
  duck(db, length, at) {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    const g = this.musicDuck.gain;
    hold(g, t);
    g.setTargetAtTime(Math.pow(10, -db / 20), t, 0.04);
    g.setTargetAtTime(1, t + length, 0.5);
  }

  // ---------------------------------------------------------------- instruments
  // one oscillator with a click-free envelope; `from` starts the pitch higher and
  // drops it to `freq` (the thump of a drum), `glide` sweeps to another pitch
  osc(freq, at, { type = 'sine', vol = 0.1, attack = 0.003, decay = 0.3, from = 0, drop = 0.04, glide = 0, lowpass = 0, pan = 0, out = null, wet = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    if (from) {
      o.frequency.setValueAtTime(freq * from, at);
      o.frequency.exponentialRampToValueAtTime(freq, at + drop);
    } else {
      o.frequency.setValueAtTime(freq, at);
    }
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + attack + decay * 0.8);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    let node = o;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      f.Q.value = 0.5;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      node = p;
    }
    node.connect(out || this.sfx);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      node.connect(s);
      s.connect(this.reverb);
    }
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  }

  // deep drum: a sine whose pitch falls fast (kick drum / timpani boom), with a knock
  // on top so it is still heard on phone speakers, which cannot play the low end
  boom(freq, at, vol, decay = 0.4, from = 3, pan = 0, wet = 0.15) {
    this.osc(freq, at, { vol, decay, from, drop: 0.07, pan, out: this.punch, wet });
    this.osc(freq * 2, at, { type: 'triangle', vol: vol * 0.35, decay: decay * 0.5, from, drop: 0.07, pan, out: this.punch });
    this.osc(freq * 4, at, { vol: vol * 0.18, decay: decay * 0.35, from, drop: 0.07, pan, out: this.punch });
    const knock = clamp(freq * 6, 300, 560);
    this.osc(knock, at, { vol: vol * 0.3, decay: clamp(decay * 0.2, 0.045, 0.09), from: 1.6, drop: 0.015, pan, out: this.punch });
    this.osc(knock * 2.71, at, { vol: vol * 0.1, decay: 0.02, pan });
  }

  // wooden "tok": a low note plus an overtone that dies almost at once
  tok(freq, at, vol, pan = 0, decay = 0.13) {
    this.osc(freq, at, { vol, decay, from: 1.35, drop: 0.018, pan, out: this.punch, wet: 0.05 });
    this.osc(freq * 2.71, at, { vol: vol * 0.38, decay: 0.03, pan });
  }

  // warm brass chord (the movie-trailer "BRAAAM"): sawtooth voices behind two lowpass
  // filters that open on the attack and close again
  brass(notes, at, dur, vol, { open = 1500, close = 420, attack = 0.035, wet = 0.3 } = {}) {
    const ctx = this.ctx;
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    for (const f of [f1, f2]) {
      f.type = 'lowpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(160, at);
      f.frequency.exponentialRampToValueAtTime(open, at + attack + 0.05);
      f.frequency.exponentialRampToValueAtTime(close, at + dur);
    }
    f1.connect(f2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.setTargetAtTime(vol * 0.7, at + attack, dur * 0.5);
    g.gain.setTargetAtTime(0.0001, at + dur, 0.12);
    f2.connect(g);
    g.connect(this.punch);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(this.reverb);
    }
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(f1);
        o.start(at);
        o.stop(at + dur + 0.9);
      }
    }
  }

  // low gong: inharmonic partials that ring out
  gong(freq, at, vol, decay = 2.4) {
    const partials = [[1, 1, 1], [1.48, 0.55, 0.75], [1.96, 0.4, 0.55], [2.53, 0.25, 0.4], [3.07, 0.15, 0.3]];
    for (const [r, v, d] of partials) this.osc(freq * r, at, { vol: vol * v, attack: 0.004, decay: decay * d, from: 1.015, drop: 0.25, wet: 0.4 });
  }

  // rising "VWOOM": two detuned triangles and a sub sweeping up together
  sweep(f0, f1, at, dur, vol) {
    for (const det of [0.995, 1.005]) {
      this.osc(f0 * det, at, { type: 'triangle', vol, attack: dur * 0.3, decay: dur, glide: f1 * det, lowpass: 1000, out: this.punch, wet: 0.15 });
    }
    this.osc(f0 / 2, at, { vol: vol * 1.2, attack: dur * 0.3, decay: dur, glide: f1 / 2, out: this.punch });
  }

  // ---------------------------------------------------------------- effects
  // peg hits: deep wooden toks from the song's scale, panned to where the peg is
  tick(x = 540, at) {
    if (!this.can('tick', 0.07, at)) return;
    const t = at ?? this.now();
    const n = PEG_NOTES[Math.floor(Math.random() * PEG_NOTES.length)];
    this.tok(midi(n), t, 0.22 + Math.random() * 0.08, ((x - 540) / 540) * 0.6);
  }

  // bumpers and slingshots: BOOM with a slap on top
  boing(x = 540, at) {
    if (!this.can('boing', 0.05, at)) return;
    const t = at ?? this.now();
    const pan = ((x - 540) / 540) * 0.6;
    this.boom(82.4, t, 0.5, 0.3, 2.8, pan);
    this.osc(247, t, { type: 'triangle', vol: 0.16, decay: 0.07, from: 2, drop: 0.03, pan, out: this.punch });
  }

  // someone joined: a thud and a little bounce up
  pop(at) {
    if (!this.can('pop', 0.06, at)) return;
    const t = at ?? this.now();
    this.boom(82.4, t, 0.4, 0.22, 2.4);
    this.osc(midi(59), t + 0.05, { type: 'triangle', vol: 0.1, decay: 0.16, glide: midi(64), lowpass: 1400, wet: 0.15 });
  }

  // countdown 3-2-1: trailer hits that get bigger; 0 is the "time's up" drop
  beep(n, at) {
    if (!this.can('beep' + n, 0.3, at)) return;
    const t = at ?? this.now();
    if (n > 0) {
      const k = 1 + (3 - Math.min(3, n)) * 0.18;
      this.boom(41.2, t, 0.6 * k, 0.6, 3.2);
      this.brass(n === 1 ? [40, 47, 52, 59] : E_POWER, t, 0.45, 0.05 * k, { open: 900 + 200 * (3 - n) });
      if (n === 3) this.tension(true, 0.06, t);
    } else {
      this.boom(41.2, t, 0.75, 0.9, 3.5);
      this.brass([40, 47], t, 1.1, 0.06, { open: 1000, close: 160 });
    }
  }

  // the gate opens: huge boom, BRAAAM, and the music slams back in
  go(at) {
    if (!this.can('go', 0.5, at)) return;
    const t = at ?? this.now();
    this.tension(false, 0.06, t);
    this.duck(4, 0.9, t);
    this.boom(41.2, t, 0.9, 1.0, 3.5, 0, 0.25);
    this.brass(E_CHORD, t, 1.5, 0.055);
    this.osc(160, t, { type: 'triangle', vol: 0.2, decay: 0.09, from: 4, drop: 0.035, out: this.punch });
  }

  // a like: quick "ba-DUM" punch
  like(at) {
    if (!this.can('like', 0.12, at)) return;
    const t = at ?? this.now();
    this.tok(midi(52), t, 0.24);
    this.tok(midi(59), t + 0.075, 0.24);
    this.boom(98, t + 0.075, 0.3, 0.18, 1.8);
  }

  // speed boost: turbo "VWOOM" into a thump
  boost(at) {
    if (!this.can('boost', 0.25, at)) return;
    const t = at ?? this.now();
    this.sweep(70, 250, t, 0.42, 0.11);
    this.boom(110, t + 0.38, 0.3, 0.16, 1.8);
  }

  // subscriber / like goal / super chat: BOOM BOOM BRAAAM
  sub(at) {
    if (!this.can('sub', 0.6, at)) return;
    const t = at ?? this.now();
    this.duck(6, 1.6, t);
    this.boom(55, t, 0.6, 0.35, 2.6);
    this.boom(55, t + 0.18, 0.6, 0.35, 2.6);
    this.boom(41.2, t + 0.36, 0.85, 1.0, 3.5, 0, 0.25);
    this.brass(E_CHORD, t + 0.36, 1.5, 0.06);
  }

  // winner: brass fanfare with timpani, ending on a giant E chord and a gong
  fanfare(at) {
    if (!this.can('fanfare', 1, at)) return;
    const t = at ?? this.now();
    this.duck(9, 3, t);
    const stab = [40, 52, 56, 59];
    for (const d of [0, 0.16, 0.32]) {
      this.brass(stab, t + d, 0.11, 0.055, { open: 1300, close: 700, attack: 0.02, wet: 0.2 });
      this.boom(82.4, t + d, 0.45, 0.25, 1.8);
    }
    this.brass(B_CHORD, t + 0.5, 0.42, 0.06, { open: 1300, close: 600 });
    this.boom(61.7, t + 0.5, 0.55, 0.4, 2.2);
    this.brass([28, ...E_CHORD, 64], t + 1.0, 2.2, 0.065, { open: 1400, close: 380 });
    this.boom(41.2, t + 1.0, 0.95, 1.2, 3.5, 0, 0.3);
    this.gong(82.4, t + 1.0, 0.12, 3);
  }

  // a marble crossed the line (the winner gets the fanfare as well)
  finish(place = 2, at) {
    if (!this.can('finish', 0.09, at)) return;
    const t = at ?? this.now();
    if (place === 1) {
      this.gong(82.4, t, 0.1, 2.5);
      return;
    }
    this.boom(82.4, t, 0.32, 0.22, 1.8);
    this.tok(midi(59), t, 0.12);
  }

  // stuck marble moved on: low "fwump"
  poof(at) {
    if (!this.can('poof', 0.1, at)) return;
    const t = at ?? this.now();
    this.osc(260, t, { type: 'triangle', vol: 0.18, decay: 0.2, glide: 70, lowpass: 700, out: this.punch, wet: 0.15 });
  }

  // NEW LEADER: short brass "BWAM!"
  chime(at) {
    if (!this.can('chime', 0.5, at)) return;
    const t = at ?? this.now();
    this.brass(E_POWER, t, 0.3, 0.05, { open: 1100, close: 500 });
    this.boom(55, t, 0.45, 0.35, 2.5);
  }

  // FINAL STRETCH: drum roll that speeds up into a hit; NECK AND NECK: "DUN-DUN!"
  rise(kind = 'stretch', at) {
    if (!this.can('rise', 0.5, at)) return;
    const t = at ?? this.now();
    if (kind === 'neck') {
      this.brass([35, 42], t, 0.18, 0.05, { open: 900, close: 400 });
      this.boom(61.7, t, 0.5, 0.3, 2.2);
      this.brass(E_POWER, t + 0.24, 0.32, 0.055, { open: 1100, close: 450 });
      this.boom(82.4, t + 0.24, 0.55, 0.4, 2.2);
      return;
    }
    let d = 0;
    for (let i = 0; i < 11; i++) {
      this.boom(82.4 * Math.pow(2, (i * 7) / 10 / 12), t + d, 0.22 + i * 0.03, 0.18, 1.8);
      d += 0.14 - i * 0.008;
    }
    this.sweep(55, 165, t, d, 0.07);
    this.brass(E_POWER, t + d, 0.5, 0.055);
    this.boom(41.2, t + d, 0.8, 0.8, 3.2);
  }
}
