'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  youtubeTarget: '', // @handle, channel link or live video link
  autoConnect: true,
  joinKeywords: ['enter', '!enter'],
  leaveKeywords: ['leave', '!leave'],
  lobbySeconds: 120, // countdown between races
  raceSeconds: 180, // how long a race should take (the course length is built to match)
  raceMaxSeconds: 0, // 0 = automatic time limit
  resultsSeconds: 12,
  keepPlayers: true, // everyone that entered races again next round
  maxPlayers: 150,
  marbleSize: 28, // marble radius in pixels (18-28)
  showNames: false, // name tags on the marbles
  course: 'random', // 'random' or a course id (pond, candy, lava, galaxy, ice)
  likeBoost: true,
  likeGoalStep: 10,
  subStorm: true,
  subGoalStep: 10,
  superChatVip: true,
  botFill: 0, // add CPU ducks until there are at least this many marbles
  soundVolume: 0.7,
  music: true,
  musicVolume: 0.35,
  port: 7777,
};

const LIMITS = {
  lobbySeconds: [10, 900],
  raceSeconds: [30, 600],
  raceMaxSeconds: [0, 1200],
  resultsSeconds: [5, 60],
  maxPlayers: [2, 200],
  marbleSize: [18, 28],
  likeGoalStep: [1, 100000],
  subGoalStep: [1, 100000],
  botFill: [0, 100],
  soundVolume: [0, 1],
  musicVolume: [0, 1],
  port: [1024, 65535],
};

function clean(input) {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in input)) continue;
    const def = DEFAULTS[key];
    let v = input[key];
    if (typeof def === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) continue;
      const [lo, hi] = LIMITS[key] || [-Infinity, Infinity];
      v = Math.min(hi, Math.max(lo, v));
    } else if (typeof def === 'boolean') {
      v = v === true || v === 'true' || v === 1;
    } else if (Array.isArray(def)) {
      if (typeof v === 'string') v = v.split(',');
      if (!Array.isArray(v)) continue;
      v = v.map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 20);
      if (!v.length) continue;
    } else {
      v = String(v).trim().slice(0, 300);
    }
    out[key] = v;
  }
  return out;
}

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      Object.assign(this.values, clean(raw));
    } catch (e) {
      // first run, or a broken file: use the defaults
    }
  }

  get(key) {
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  update(partial) {
    const changed = clean(partial || {});
    Object.assign(this.values, changed);
    this.save();
    return changed;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    } catch (e) {
      console.error('could not save settings:', e.message);
    }
  }
}

module.exports = { Settings, DEFAULTS };
