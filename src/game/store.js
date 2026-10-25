'use strict';

const fs = require('fs');
const path = require('path');

// All-time wins leaderboard, saved next to the settings.
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'leaderboard.json');
    this.data = { players: {}, totalRaces: 0 };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && raw.players) this.data = { players: raw.players, totalRaces: raw.totalRaces || 0 };
    } catch (e) {
      // no leaderboard yet
    }
    this.saveTimer = null;
  }

  entry(player) {
    let e = this.data.players[player.id];
    if (!e) {
      e = { name: player.name, avatar: player.avatar, wins: 0, races: 0, podiums: 0, best: 0 };
      this.data.players[player.id] = e;
    }
    e.name = player.name;
    if (player.avatar) e.avatar = player.avatar;
    return e;
  }

  wins(id) {
    const e = this.data.players[id];
    return e ? e.wins : 0;
  }

  recordRace(racers, podium, winnerTime) {
    this.data.totalRaces++;
    for (const p of racers) {
      if (p.bot) continue;
      this.entry(p).races++;
    }
    podium.forEach((p, i) => {
      if (!p || p.bot) return;
      const e = this.entry(p);
      e.podiums++;
      if (i === 0) {
        e.wins++;
        if (winnerTime && (!e.best || winnerTime < e.best)) e.best = winnerTime;
      }
    });
    this.save();
  }

  top(n = 10) {
    return Object.entries(this.data.players)
      .filter(([, e]) => e.wins > 0)
      .sort((a, b) => b[1].wins - a[1].wins || a[1].best - b[1].best)
      .slice(0, n)
      .map(([id, e]) => ({ id, name: e.name, wins: e.wins, races: e.races }));
  }

  avatarFor(id) {
    const e = this.data.players[id];
    return e ? e.avatar : null;
  }

  reset() {
    this.data = { players: {}, totalRaces: 0 };
    this.save();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    clearTimeout(this.saveTimer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch (e) {
      console.error('could not save leaderboard:', e.message);
    }
  }
}

module.exports = { Store };
