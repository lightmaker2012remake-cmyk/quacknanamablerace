'use strict';

// The game: lobby countdown -> race -> results -> lobby ...
// Runs the physics at 60 steps per second and emits plain-data messages
// ('course', 'players', 'state', 'snap', 'fx') that the renderers draw.

const EventEmitter = require('events');
const { buildCourse, COURSES } = require('./courses');
const { Physics } = require('./physics');
const { hashString } = require('./rng');

const DT = 1 / 60;
const VIEW_H = 1920;
const LOBBY_CAM = -230;
const LEADER_SCREEN_Y = 1150;

const BOT_NAMES = [
  'Quackers', 'Waddles', 'Puddles', 'Sir Quacks', 'Nugget', 'Biscuit', 'Pickles', 'Sunny', 'Peanut', 'Bubbles',
  'Noodle', 'Mallard', 'Feathers', 'Drizzle', 'Splash', 'Ducky', 'Pebble', 'Mango', 'Waffles', 'Maple',
];

function avatarUrl(id) {
  return '/avatar/' + encodeURIComponent(id);
}

function colorFor(id) {
  const h = hashString(String(id)) % 360;
  return `hsl(${h}, 85%, 60%)`;
}

function cleanName(name) {
  const s = String(name || 'Player').replace(/^@/, '').replace(/[\u0000-\u001f]/g, '').trim();
  return (s || 'Player').slice(0, 40);
}

function firstWord(text) {
  const t = String(text || '').trim().toLowerCase();
  const w = t.split(/\s+/)[0] || '';
  // drop trailing punctuation / emoji, keep a leading "!"
  return w.replace(/^[^\p{L}\p{N}!]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

class Game extends EventEmitter {
  constructor({ settings, store }) {
    super();
    this.settings = settings;
    this.store = store;
    this.t = 0;
    this.players = new Map(); // racing this round, id -> player
    this.pending = new Map(); // joined during a race, waiting for the next one
    this.phase = 'lobby';
    this.round = 0;
    this.timer = 0;
    this.raceTime = 0;
    this.raceMax = 0;
    this.cam = LOBBY_CAM;
    this.courseIndex = -1;
    this.courseCache = new Map();
    this.finishOrder = [];
    this.winner = null;
    this.winnerAt = 0;
    this.podium = [];
    this.champion = null;
    this.botCount = 0;
    this.popTimer = 0;
    this.stats = { likes: null, subs: null, viewers: null };
    this.yt = { state: 'off', message: 'Not connected', title: '' };
    this.lastSnapAt = 0;
    this.lastStateAt = 0;
    this.playersDirty = true;
    this.enterLobby();
  }

  // ------------------------------------------------------------------ loop
  start() {
    let last = process.hrtime.bigint();
    let acc = 0;
    this.interval = setInterval(() => {
      const now = process.hrtime.bigint();
      acc += Number(now - last) / 1e9;
      last = now;
      if (acc > 0.25) acc = 0.25; // after a stall, skip ahead instead of fast-forwarding
      let steps = 0;
      while (acc >= DT) {
        this.step();
        acc -= DT;
        steps++;
      }
      if (steps) this.publish();
    }, 1000 / 60);
  }

  stop() {
    clearInterval(this.interval);
  }

  step() {
    if (this.phase === 'lobby') this.tickLobby();
    else if (this.phase === 'countdown') this.tickCountdown();
    else if (this.phase === 'race') this.tickRace();
    else if (this.phase === 'results') this.tickResults();
    this.applyBoosts();
    this.physics.step(DT, this.t);
    this.t += DT;
    this.checkBounds();
    this.updateCamera();
  }

  publish(force) {
    if (this.playersDirty) {
      this.playersDirty = false;
      this.emit('players', this.makePlayers());
    }
    if (force || this.t - this.lastSnapAt >= 1 / 30 - 1e-6) {
      this.lastSnapAt = this.t;
      this.emit('snap', this.makeSnap());
    }
    if (force || this.t - this.lastStateAt >= 0.2) {
      this.lastStateAt = this.t;
      this.emit('state', this.makeState());
    }
  }

  fx(ev) {
    this.emit('fx', Object.assign({ type: 'fx' }, ev));
  }

  // ------------------------------------------------------------------ phases
  enterLobby() {
    this.phase = 'lobby';
    this.round++;
    this.timer = this.settings.get('lobbySeconds');
    if (!this.settings.get('keepPlayers')) {
      for (const p of [...this.players.values()]) this.players.delete(p.id);
    }
    const max = this.settings.get('maxPlayers');
    for (const p of this.pending.values()) {
      if (this.players.size >= max) break;
      this.players.set(p.id, p);
    }
    this.pending.clear();
    // hand out fresh slot numbers (renderers use them as marble ids)
    let slot = 0;
    for (const p of this.players.values()) {
      p.slot = slot++;
      p.finished = false;
      p.place = 0;
      p.boostUntil = 0;
    }
    this.winner = null;
    this.podium = [];
    this.finishOrder = [];
    this.loadCourse(this.pickCourse());
    this.cam = LOBBY_CAM;
    this.playersDirty = true;
    this.fx({ fx: 'lobby', round: this.round });
  }

  tickLobby() {
    if (this.players.size === 0) {
      this.timer = this.settings.get('lobbySeconds');
    } else {
      this.timer -= DT;
      if (this.timer <= 0) {
        this.enterCountdown();
        return;
      }
    }
    this.popcorn();
  }

  enterCountdown() {
    this.fillBots();
    if (this.players.size === 0) {
      this.timer = this.settings.get('lobbySeconds');
      return;
    }
    this.phase = 'countdown';
    this.timer = 3;
    this.lastCount = 4;
  }

  tickCountdown() {
    this.timer -= DT;
    const c = Math.ceil(this.timer);
    if (c < this.lastCount && c >= 1) {
      this.lastCount = c;
      this.fx({ fx: 'countdown', n: c });
    }
    if (this.timer <= 0) this.enterRace();
  }

  enterRace() {
    if (this.players.size === 0) {
      this.enterLobby();
      return;
    }
    this.phase = 'race';
    this.raceTime = 0;
    this.finishOrder = [];
    this.winner = null;
    const target = this.course.target;
    this.raceMax = this.settings.get('raceMaxSeconds') || Math.round(Math.max(target * 1.5, target + 60));
    this.physics.state.gateOpenAt = this.t;
    for (const p of this.players.values()) {
      p.finished = false;
      p.place = 0;
      p.finishTime = 0;
      p.bestY = -1e9;
      p.bestT = this.t;
      p.nudges = 0;
    }
    this.eta = null;
    this.leaderId = null;
    this.leadCandidate = null;
    this.leadSince = 0;
    this.lastLeaderCall = -1e9;
    this.stretchCalled = false;
    this.neckCalled = false;
    this.fx({ fx: 'go' });
  }

  tickRace() {
    this.raceTime += DT;
    if (this.players.size === 0) {
      // everybody left: nothing to race, back to the lobby
      this.enterLobby();
      return;
    }
    let racing = 0;
    let lead = null;
    let leadY = -1e9;
    let secondY = -1e9;
    for (const p of this.players.values()) {
      if (p.finished) continue;
      const m = this.physics.getMarble(p.slot);
      if (!m) continue;
      if (m.y > this.course.finishY) {
        this.finishPlayer(p);
        continue;
      }
      racing++;
      if (m.y > leadY) {
        secondY = leadY;
        leadY = m.y;
        lead = p;
      } else if (m.y > secondY) {
        secondY = m.y;
      }
      this.antiStuck(p, m);
    }
    if (lead && !this.winner) this.raceHype(lead, leadY, secondY, racing);
    if (this.winner) {
      const podiumDone = this.finishOrder.length >= Math.min(3, this.players.size);
      if (podiumDone || racing === 0 || this.t - this.winnerAt > 12) this.enterResults();
    } else if (this.raceTime >= this.raceMax) {
      this.timeUp();
    }
  }

  // the bits that keep people watching: winner countdown and race callouts
  raceHype(lead, leadY, secondY, racing) {
    const prog = Math.max(0, Math.min(1, leadY / this.course.finishY));
    // early on trust the course length, later trust how far the leader has got
    const byLength = Math.max(3, this.course.target - this.raceTime);
    const byProgress = prog > 0.05 ? this.raceTime / prog - this.raceTime : byLength;
    const w = Math.max(0, Math.min(1, (prog - 0.15) / 0.5));
    const est = byProgress * w + byLength * (1 - w);
    this.eta = this.eta == null ? est : this.eta + (est - this.eta) * 0.03;
    // announce a new leader once they have held the lead for a moment
    if (lead.id !== this.leadCandidate) {
      this.leadCandidate = lead.id;
      this.leadSince = this.t;
    } else if (lead.id !== this.leaderId && this.t - this.leadSince > 1.2) {
      if (this.leaderId && this.raceTime > 5 && prog > 0.15 && this.t - this.lastLeaderCall > 6) {
        this.lastLeaderCall = this.t;
        this.fx({ fx: 'leader', slot: lead.slot, name: lead.name, avatar: avatarUrl(lead.id) });
      }
      this.leaderId = lead.id;
    }
    if (!this.stretchCalled && prog > 0.82) {
      this.stretchCalled = true;
      this.fx({ fx: 'stretch' });
    }
    if (!this.neckCalled && prog > 0.7 && racing >= 2 && leadY - secondY < 70) {
      this.neckCalled = true;
      this.fx({ fx: 'neck' });
    }
  }

  finishPlayer(p) {
    p.finished = true;
    p.place = this.finishOrder.length + 1;
    p.finishTime = this.raceTime;
    this.finishOrder.push(p);
    this.fx({ fx: 'finish', slot: p.slot, place: p.place });
    if (p.place === 1) {
      this.winner = p;
      this.winnerAt = this.t;
      this.fx({
        fx: 'winner', slot: p.slot, name: p.name, avatar: avatarUrl(p.id),
        time: r1(p.finishTime), wins: p.bot ? 0 : this.store.wins(p.id) + 1,
      });
    }
  }

  timeUp() {
    const ranked = this.ranking();
    const best = ranked[0];
    this.fx({ fx: 'timeup' });
    if (best) {
      this.winner = best;
      this.winnerAt = this.t - 9; // results in ~3 seconds
      this.fx({
        fx: 'winner', slot: best.slot, name: best.name, avatar: avatarUrl(best.id),
        time: null, wins: best.bot ? 0 : this.store.wins(best.id) + 1, timeup: true,
      });
    } else {
      this.enterResults();
    }
  }

  enterResults() {
    this.phase = 'results';
    this.timer = this.settings.get('resultsSeconds');
    const ranked = this.ranking();
    const top = ranked.slice(0, 3);
    this.podium = top.map((p, i) => ({
      slot: p.slot, id: p.id, name: p.name, avatar: avatarUrl(p.id), place: i + 1,
      time: p.finished ? r1(p.finishTime) : null, wins: p.bot ? 0 : this.store.wins(p.id) + (i === 0 ? 1 : 0),
    }));
    this.store.recordRace([...this.players.values()], top, this.winner && this.winner.finished ? this.winner.finishTime : 0);
    this.champion = this.winner ? this.winner.id : null;
    this.fx({ fx: 'results' });
    this.publish(true);
  }

  tickResults() {
    this.timer -= DT;
    if (this.timer <= 0) this.enterLobby();
  }

  // ------------------------------------------------------------------ course
  pickCourse() {
    const choice = this.settings.get('course');
    const fixed = COURSES.findIndex((c) => c.id === choice);
    if (fixed >= 0) return fixed;
    let i;
    do {
      i = Math.floor(Math.random() * COURSES.length);
    } while (COURSES.length > 1 && i === this.courseIndex);
    return i;
  }

  loadCourse(index) {
    const target = this.settings.get('raceSeconds');
    const key = index + ':' + target;
    let course = this.courseCache.get(key);
    if (!course) {
      course = buildCourse(index, target);
      this.courseCache.set(key, course);
    }
    this.course = course;
    this.courseIndex = index;
    this.radius = this.settings.get('marbleSize');
    this.physics = new Physics(course, { radius: this.radius });
    this.physics.syncKinematics(this.t);
    this.placeInPen([...this.players.values()]);
    this.courseMsg = {
      type: 'course',
      index,
      id: course.id,
      name: course.name,
      theme: course.theme,
      themeId: course.themeId,
      height: course.height,
      finishY: course.finishY,
      binFloor: course.binFloor,
      penBottom: course.penBottom,
      statics: course.statics,
      kinematics: course.kinematics.map((k) => ({ id: k.id, kind: k.kind, r: k.r, style: k.style, shapes: k.shapes })),
      sections: course.sections,
    };
    this.emit('course', this.courseMsg);
  }

  penCells() {
    const r = this.radius;
    const cell = 2 * r + 6;
    const x0 = 40 + r + 4;
    const x1 = 1040 - r - 4;
    const y0 = 24 + r;
    const y1 = this.course.penBottom - r - 4;
    const cells = [];
    for (let y = y1; y >= y0; y -= cell) {
      for (let x = x0; x <= x1; x += cell) cells.push([x, y]);
    }
    return cells;
  }

  placeInPen(list) {
    const cells = this.penCells();
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    list.forEach((p, i) => {
      const c = cells[i % cells.length];
      const lift = Math.floor(i / cells.length) * 7;
      this.physics.addMarble(p.slot, c[0] + (Math.random() - 0.5) * 4, c[1] - lift, (Math.random() - 0.5) * 120, 0);
    });
  }

  spawnInPen(p) {
    const r = this.radius;
    let spot = null;
    for (let tries = 0; tries < 40 && !spot; tries++) {
      const x = 40 + r + 6 + Math.random() * (1000 - 2 * r - 12);
      const y = 30 + r + Math.random() * 260;
      let ok = true;
      for (const q of this.players.values()) {
        if (q === p) continue;
        const m = this.physics.getMarble(q.slot);
        if (m && (m.x - x) ** 2 + (m.y - y) ** 2 < (2 * r + 4) ** 2) {
          ok = false;
          break;
        }
      }
      if (ok) spot = [x, y];
    }
    if (!spot) spot = [540 + (Math.random() - 0.5) * 600, 30 + r];
    this.physics.addMarble(p.slot, spot[0], spot[1], (Math.random() - 0.5) * 200, 150);
  }

  // marbles waiting in the start pen hop around like popcorn
  popcorn() {
    this.popTimer -= DT;
    if (this.popTimer > 0) return;
    this.popTimer = 0.3;
    const list = [...this.players.values()];
    if (!list.length) return;
    const k = 1 + Math.floor(list.length / 15);
    for (let i = 0; i < k; i++) {
      const p = list[Math.floor(Math.random() * list.length)];
      const m = this.physics.getMarble(p.slot);
      if (!m || Math.hypot(m.vx, m.vy) > 120) continue;
      this.physics.push(p.slot, (Math.random() - 0.5) * 360, -(380 + Math.random() * 320));
    }
  }

  antiStuck(p, m) {
    if (m.y > p.bestY + 25) {
      p.bestY = m.y;
      p.bestT = this.t;
      p.nudges = 0;
      return;
    }
    if (this.t - p.bestT < 4 + p.nudges * 2.5) return;
    if (p.nudges < 3) {
      this.physics.push(p.slot, (Math.random() - 0.5) * 600, -300 - Math.random() * 200);
      p.nudges++;
    } else {
      const rp = this.respawnBelow(m.y + 30);
      this.physics.teleport(p.slot, rp.x + (Math.random() - 0.5) * 60, rp.y);
      this.fx({ fx: 'teleport', slot: p.slot, x: r1(m.x), y: r1(m.y), x2: rp.x, y2: rp.y });
      p.bestT = this.t;
      p.nudges = 0;
    }
  }

  respawnBelow(y) {
    const list = this.course.respawns;
    return list.find((r) => r.y > y) || list[list.length - 1];
  }

  respawnAbove(y) {
    const list = this.course.respawns;
    let best = list[0];
    for (const r of list) if (r.y <= y) best = r;
    return best;
  }

  checkBounds() {
    for (const p of this.players.values()) {
      const m = this.physics.getMarble(p.slot);
      if (!m) continue;
      if (m.x > 10 && m.x < 1070 && m.y > -150 && m.y < this.course.binFloor + 60) continue;
      if (this.phase !== 'race' && this.phase !== 'results') {
        this.physics.removeMarble(p.slot);
        this.spawnInPen(p);
      } else if (p.finished) {
        this.physics.teleport(p.slot, 540, this.course.finishY + 120);
      } else {
        const rp = this.respawnAbove(Math.max(0, p.bestY || 0));
        this.physics.teleport(p.slot, rp.x, rp.y);
      }
    }
  }

  updateCamera() {
    let target = LOBBY_CAM;
    if (this.phase === 'race' || this.phase === 'results') {
      let lead = -1e9;
      for (const p of this.players.values()) {
        if (p.finished) continue;
        const m = this.physics.getMarble(p.slot);
        if (m && m.y > lead) lead = m.y;
      }
      if (this.finishOrder.length) lead = Math.max(lead, this.course.finishY);
      if (lead < -1e8) lead = this.course.finishY;
      target = Math.min(lead, this.course.finishY + 200) - LEADER_SCREEN_Y;
    }
    const maxCam = this.course.binFloor + 170 - VIEW_H;
    target = Math.max(LOBBY_CAM, Math.min(maxCam, target));
    this.cam += (target - this.cam) * (1 - Math.exp(-DT * 3));
  }

  ranking() {
    const list = [...this.players.values()];
    const ys = new Map();
    for (const p of list) {
      const m = this.physics.getMarble(p.slot);
      ys.set(p, m ? m.y : -1e9);
    }
    return list.sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return ys.get(b) - ys.get(a);
    });
  }

  // ------------------------------------------------------------------ boosts
  boost(p, seconds) {
    p.boostUntil = Math.max(p.boostUntil || 0, this.t + seconds);
    const m = this.physics.getMarble(p.slot);
    if (!m) return;
    const sp = Math.hypot(m.vx, m.vy);
    if (sp > 80) this.physics.push(p.slot, (m.vx / sp) * 300, (m.vy / sp) * 300 + 120);
    else this.physics.push(p.slot, (Math.random() - 0.5) * 200, 380);
  }

  // boosted marbles get extra push every step while the boost lasts
  applyBoosts() {
    if (this.phase !== 'race') return;
    for (const p of this.players.values()) {
      if (!(p.boostUntil > this.t) || p.finished) continue;
      const m = this.physics.getMarble(p.slot);
      if (!m) continue;
      const sp = Math.hypot(m.vx, m.vy);
      const a = 900 * DT;
      if (sp > 60) this.physics.push(p.slot, (m.vx / sp) * a, (m.vy / sp) * a + 0.3 * a);
      else this.physics.push(p.slot, 0, a);
    }
  }

  racers() {
    return [...this.players.values()].filter((p) => !p.finished && this.physics.marbles.has(p.slot));
  }

  // ------------------------------------------------------------------ players
  join(user, opts = {}) {
    const id = String(user.id || '');
    if (!id) return 'invalid';
    const existing = this.players.get(id) || this.pending.get(id);
    if (existing) {
      existing.name = cleanName(user.name || existing.name);
      if (user.avatar) existing.avatar = user.avatar;
      return 'already';
    }
    if (this.players.size + this.pending.size >= this.settings.get('maxPlayers')) {
      this.fx({ fx: 'toast', text: 'The race is full!', kind: 'warn' });
      return 'full';
    }
    const p = {
      id, name: cleanName(user.name), avatar: user.avatar || null, color: colorFor(id),
      vip: !!opts.vip, bot: !!user.bot, slot: -1, boostUntil: 0, finished: false, place: 0,
    };
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      const used = new Set([...this.players.values()].map((q) => q.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      p.slot = slot;
      this.players.set(id, p);
      this.spawnInPen(p);
      this.fx({ fx: 'join', slot: p.slot, name: p.name, avatar: avatarUrl(id) });
    } else {
      this.pending.set(id, p);
      this.fx({ fx: 'queued', name: p.name, avatar: avatarUrl(id) });
    }
    this.playersDirty = true;
    return 'joined';
  }

  leave(id) {
    const p = this.players.get(id);
    if (p) {
      this.physics.removeMarble(p.slot);
      this.players.delete(id);
      this.playersDirty = true;
      this.fx({ fx: 'leave', name: p.name });
    }
    if (this.pending.delete(id)) this.playersDirty = true;
  }

  addBots(n) {
    for (let i = 0; i < n; i++) {
      this.botCount++;
      const base = BOT_NAMES[(this.botCount - 1) % BOT_NAMES.length];
      const lap = Math.ceil(this.botCount / BOT_NAMES.length);
      this.join({ id: 'bot-' + this.botCount, name: lap > 1 ? `${base} ${lap}` : base, bot: true });
    }
  }

  fillBots() {
    const want = Math.min(this.settings.get('botFill'), this.settings.get('maxPlayers'));
    let guard = 0;
    while (this.players.size < want && guard++ < 200) this.addBots(1);
  }

  clearPlayers(botsOnly) {
    for (const p of [...this.players.values()]) {
      if (botsOnly && !p.bot) continue;
      this.physics.removeMarble(p.slot);
      this.players.delete(p.id);
    }
    for (const p of [...this.pending.values()]) if (!botsOnly || p.bot) this.pending.delete(p.id);
    this.playersDirty = true;
  }

  avatarSource(id) {
    const p = this.players.get(id) || this.pending.get(id);
    if (p) return p.avatar;
    return this.store.avatarFor(id);
  }

  // ------------------------------------------------------------------ chat + stream events
  handleChat(msg) {
    const a = msg.author || {};
    if (msg.kind && msg.kind !== 'text') {
      this.vipEvent(msg);
      return;
    }
    const word = firstWord(msg.text);
    if (!word) return;
    if (this.settings.get('joinKeywords').includes(word)) this.join(a);
    else if (this.settings.get('leaveKeywords').includes(word)) this.leave(a.id);
    else if ((a.isOwner || a.isMod) && word === '!start') this.startNow();
  }

  vipEvent(msg) {
    const a = msg.author || {};
    const labels = { superchat: 'SUPER CHAT', sticker: 'SUPER STICKER', member: 'NEW MEMBER', gift: 'GIFT' };
    let p = this.players.get(a.id) || this.pending.get(a.id);
    if (!p && msg.kind === 'gift') {
      p = [...this.players.values(), ...this.pending.values()].find((q) => q.name === cleanName(a.name));
    }
    if (this.settings.get('superChatVip')) {
      if (!p && a.id) {
        this.join(a, { vip: true });
        p = this.players.get(a.id) || this.pending.get(a.id);
      }
      if (p) {
        p.vip = true;
        this.playersDirty = true;
      }
    }
    const racing = p && this.players.get(p.id) === p;
    this.fx({
      fx: 'superchat', slot: racing ? p.slot : -1, name: cleanName(a.name), avatar: a.id ? avatarUrl(a.id) : null,
      amount: msg.amount || '', label: labels[msg.kind] || 'THANK YOU',
    });
    if (this.phase === 'race' && racing && !p.finished) this.boost(p, 3.5);
  }

  setStats(s) {
    if (s.likes != null) {
      if (this.stats.likes != null && s.likes > this.stats.likes) this.onLikes(s.likes - this.stats.likes, s.likes);
      this.stats.likes = s.likes;
    }
    if (s.subs != null) {
      if (this.stats.subs != null && s.subs > this.stats.subs) this.onSubs(s.subs - this.stats.subs, s.subs);
      this.stats.subs = s.subs;
    }
    if (s.viewers != null) this.stats.viewers = s.viewers;
  }

  onLikes(n, total) {
    n = Math.min(n, 50);
    const slots = [];
    if (this.phase === 'race' && this.settings.get('likeBoost')) {
      const pool = this.racers();
      for (let i = 0; i < Math.min(n, 5) && pool.length; i++) {
        const p = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        this.boost(p, 2);
        slots.push(p.slot);
      }
    }
    this.fx({ fx: 'like', n, total, slots });
    const step = this.settings.get('likeGoalStep');
    if (Math.floor(total / step) > Math.floor((total - n) / step)) {
      this.fx({ fx: 'likeGoal', total: Math.floor(total / step) * step });
      if (this.phase === 'race' && this.settings.get('likeBoost')) for (const p of this.racers()) this.boost(p, 1.5);
    }
  }

  onSubs(n, total) {
    const storm = this.phase === 'race' && this.settings.get('subStorm');
    if (storm) for (const p of this.racers()) this.boost(p, 3);
    this.fx({ fx: 'sub', n: Math.min(n, 50), total, storm });
  }

  setYouTubeStatus(st) {
    this.yt = { state: st.state, message: st.message || '', title: st.title || '' };
  }

  // ------------------------------------------------------------------ controls
  startNow() {
    if (this.phase === 'lobby') {
      if (this.players.size === 0 && !this.settings.get('botFill')) {
        this.fx({ fx: 'toast', text: 'Nobody has entered yet!', kind: 'warn' });
        return;
      }
      this.enterCountdown();
    }
  }

  endRace() {
    if (this.phase === 'race') {
      if (this.winner) this.enterResults();
      else this.timeUp();
    } else if (this.phase === 'results') {
      this.enterLobby();
    } else if (this.phase === 'countdown') {
      this.enterRace();
    }
  }

  settingsChanged(changed) {
    if ('raceSeconds' in changed) {
      this.courseCache.clear();
      if (this.phase === 'lobby') {
        this.loadCourse(this.courseIndex);
        this.playersDirty = true;
      }
    }
    if ('lobbySeconds' in changed && this.phase === 'lobby') this.timer = Math.min(this.timer, changed.lobbySeconds);
    if ('showNames' in changed || 'joinKeywords' in changed) this.publish(true);
    if ('course' in changed && this.phase === 'lobby') {
      this.loadCourse(this.pickCourse());
      this.playersDirty = true;
    }
    if ('marbleSize' in changed && this.phase === 'lobby') {
      this.loadCourse(this.courseIndex);
      this.playersDirty = true;
    }
  }

  // ------------------------------------------------------------------ messages
  makePlayers() {
    const list = [];
    for (const p of this.players.values()) {
      list.push({ slot: p.slot, id: p.id, name: p.name, avatar: avatarUrl(p.id), color: p.color, vip: p.vip, bot: p.bot });
    }
    return { type: 'players', list, radius: this.radius, pending: this.pending.size };
  }

  makeSnap() {
    const m = [];
    for (const p of this.players.values()) {
      const s = this.physics.getMarble(p.slot);
      if (!s) continue;
      let flags = 0;
      if (p.boostUntil > this.t) flags |= 1;
      if (p.vip) flags |= 2;
      if (p.finished) flags |= 4;
      if (p.id === this.champion) flags |= 8;
      m.push(p.slot, r1(s.x), r1(s.y), r3(s.a), flags);
    }
    const hits = [...new Set(this.physics.pegHits)];
    this.physics.pegHits.length = 0;
    return {
      type: 'snap', t: r3(this.t), cam: r1(this.cam), m,
      k: this.physics.kinematicTransforms(this.cam - 300, this.cam + VIEW_H + 300), h: hits,
    };
  }

  makeState() {
    const st = this.stats;
    const likeStep = this.settings.get('likeGoalStep');
    const subStep = this.settings.get('subGoalStep');
    const racing = this.phase === 'race' || this.phase === 'results';
    const w = this.winner;
    return {
      type: 'state',
      phase: this.phase,
      round: this.round,
      timer: r1(Math.max(0, this.timer)),
      raceTime: r1(this.raceTime),
      raceMax: this.raceMax,
      eta: this.phase === 'race' && !this.winner && this.eta != null ? Math.max(1, Math.round(this.eta)) : null,
      waiting: this.phase === 'lobby' && this.players.size === 0,
      course: { index: this.courseIndex, id: this.course.id, name: this.course.name, count: COURSES.length },
      players: this.players.size,
      pending: this.pending.size,
      max: this.settings.get('maxPlayers'),
      rank: racing ? this.ranking().slice(0, 10).map((p) => p.slot) : [],
      winner: w ? { slot: w.slot, id: w.id, name: w.name, avatar: avatarUrl(w.id), time: w.finished ? r1(w.finishTime) : null } : null,
      podium: this.phase === 'results' ? this.podium : [],
      leaderboard: this.store.top(8).map((e) => Object.assign(e, { avatar: avatarUrl(e.id) })),
      stats: {
        likes: st.likes,
        subs: st.subs,
        viewers: st.viewers,
        likeGoal: st.likes == null ? null : (Math.floor(st.likes / likeStep) + 1) * likeStep,
        subGoal: st.subs == null ? null : (Math.floor(st.subs / subStep) + 1) * subStep,
      },
      yt: this.yt,
      opts: {
        showNames: this.settings.get('showNames'),
        joinWord: this.settings.get('joinKeywords')[0] || 'enter',
        likeBoost: this.settings.get('likeBoost'),
        subStorm: this.settings.get('subStorm'),
        likeStep,
        subStep,
        keepPlayers: this.settings.get('keepPlayers'),
        lobbySeconds: this.settings.get('lobbySeconds'),
        soundVolume: this.settings.get('soundVolume'),
        music: this.settings.get('music'),
        musicVolume: this.settings.get('musicVolume'),
      },
    };
  }

  // everything a newly connected screen needs
  welcome() {
    return [this.courseMsg, this.makePlayers(), this.makeState(), this.makeSnap()];
  }
}

module.exports = { Game, firstWord };
