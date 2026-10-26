// Everything drawn on top of the race: title bar, timers, leaders, minimap,
// like/sub goals, the lobby screen and the results podium.

import {
  text, roundRect, circleImage, fmtTime, heart, bell, crown, person, trophy, duck, TITLE, BODY, fitText,
} from './gfx.js';

const W = 1080;
const H = 1920;
const MEDALS = ['#ffd23f', '#d6dde6', '#e08a4b'];

export class Hud {
  constructor(images) {
    this.images = images; // url -> Image
    this.state = null;
    this.players = new Map();
    this.course = null;
    this.isWindow = false;
  }

  avatar(url) {
    return url ? this.images(url) : null;
  }

  player(slot) {
    return this.players.get(slot);
  }

  draw(ctx, snap, now, connected) {
    const st = this.state;
    const t = now / 1000;
    this.drawTop(ctx, st, t);
    if (!st || !this.course) {
      text(ctx, 'LOADING...', W / 2, H / 2, { size: 80 });
      return;
    }
    const racing = st.phase === 'race' || st.phase === 'results';
    if (racing && snap) this.drawMinimap(ctx, snap, st);
    if (st.phase === 'race') this.drawLeaders(ctx, st);
    this.drawBottom(ctx, st, t);
    if (st.phase === 'lobby') this.drawLobby(ctx, st, t);
    if (st.phase === 'results') this.drawResults(ctx, st, t);
    if (this.isWindow) this.drawStatus(ctx, st, connected);
    if (!connected) {
      roundRect(ctx, 290, 900, 500, 120, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fill();
      text(ctx, 'RECONNECTING...', W / 2, 962, { size: 52 });
    }
  }

  // ---------------------------------------------------------------- top bar
  drawTop(ctx, st, t) {
    const g = ctx.createLinearGradient(0, 0, 0, 190);
    g.addColorStop(0, 'rgba(0,0,0,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 190);
    duck(ctx, 78, 84 + Math.sin(t * 2.2) * 4, 104);
    text(ctx, 'QUACKNANA', 142, 62, { size: 58, align: 'left', color: '#ffd23f', stroke: '#2a1600', strokeWidth: 11 });
    text(ctx, 'MARBLE RACE', 146, 118, { size: 42, align: 'left', color: '#ffffff', stroke: '#1a1030', strokeWidth: 9 });
    if (!st) return;
    // timer box
    let label = 'NEXT RACE';
    let value = fmtTime(Math.ceil(st.timer));
    if (st.phase === 'lobby' && st.waiting) {
      label = 'WAITING FOR';
      value = 'PLAYERS';
    } else if (st.phase === 'countdown') {
      label = 'GET READY';
      value = String(Math.max(1, Math.ceil(st.timer)));
    } else if (st.phase === 'race') {
      if (st.eta != null) {
        label = 'WINNER IN ABOUT';
        value = fmtTime(st.eta);
      } else {
        label = 'RACE TIME';
        value = fmtTime(st.raceTime);
      }
    } else if (st.phase === 'results') {
      label = 'NEXT RACE';
      value = fmtTime(st.timer + ((st.opts && st.opts.lobbySeconds) || 0));
    }
    roundRect(ctx, 742, 16, 318, 140, 26);
    ctx.fillStyle = 'rgba(10,8,30,0.7)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = (this.course && this.course.theme.accent) || '#ffd23f';
    ctx.stroke();
    text(ctx, label, 901, 42, { size: 24, font: BODY, weight: '700', color: '#cfd3ff', shadow: false });
    const big = value.length > 5 ? 50 : 66;
    text(ctx, value, 901, 92, { size: big, color: '#ffffff', stroke: '#1a1030', strokeWidth: 9 });
    if (st.course) {
      text(ctx, st.course.name, 901, 136, { size: 22, font: BODY, weight: '600', color: '#ffe9a8', shadow: false, maxWidth: 290 });
    }
  }

  drawStatus(ctx, st, connected) {
    const yt = st.yt || {};
    const ok = yt.state === 'connected';
    const label = ok ? 'CHAT CONNECTED' : yt.state === 'off' ? 'CHAT NOT CONNECTED' : 'CHAT: ' + String(yt.state).toUpperCase();
    ctx.font = `700 18px ${BODY}`;
    const w = ctx.measureText(label).width + 44;
    roundRect(ctx, 1060 - w, 164, w, 32, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1060 - w + 18, 180, 6, 0, Math.PI * 2);
    ctx.fillStyle = ok && connected ? '#3ddc84' : yt.state === 'error' ? '#ff5252' : '#ffb300';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 1060 - w + 32, 181);
  }

  // ---------------------------------------------------------------- race: leaders + minimap
  drawLeaders(ctx, st) {
    const rows = st.rank.slice(0, 5);
    if (!rows.length) return;
    const x = 16;
    const y = 190;
    const h = 52 + rows.length * 60;
    roundRect(ctx, x, y, 336, h, 22);
    ctx.fillStyle = 'rgba(10,8,30,0.6)';
    ctx.fill();
    text(ctx, 'LEADERS', x + 168, y + 28, { size: 28, color: '#ffd23f', stroke: '#1a1030', strokeWidth: 6 });
    rows.forEach((slot, i) => {
      const p = this.player(slot);
      const cy = y + 82 + i * 60;
      ctx.beginPath();
      ctx.arc(x + 32, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = MEDALS[i] || 'rgba(255,255,255,0.25)';
      ctx.fill();
      text(ctx, String(i + 1), x + 32, cy + 2, { size: 24, color: i < 3 ? '#1a1030' : '#ffffff', shadow: false });
      if (!p) return;
      circleImage(ctx, this.avatar(p.avatar), x + 82, cy, 24, p.vip ? '#ffd23f' : p.color, 3);
      text(ctx, p.name, x + 116, cy + 1, { size: 27, font: BODY, weight: '600', align: 'left', color: '#fff', shadow: false, maxWidth: 206 });
    });
  }

  drawMinimap(ctx, snap, st) {
    const c = this.course;
    const top = 210;
    const len = 1460;
    const x = 1060;
    const map = (y) => top + Math.max(0, Math.min(1, y / c.finishY)) * len;
    roundRect(ctx, x - 7, top - 8, 14, len + 16, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    // what the camera sees
    const a = map(snap.cam);
    const b = map(snap.cam + H);
    roundRect(ctx, x - 9, a, 18, Math.max(10, b - a), 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    // finish flag
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#000' : '#fff';
        ctx.fillRect(x - 10 + i * 5, top + len + 10 + j * 5, 5, 5);
      }
    }
    const rankOf = new Map();
    st.rank.slice(0, 3).forEach((slot, i) => rankOf.set(slot, i));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [slot, m] of snap.marbles) {
      if (rankOf.has(slot)) continue;
      ctx.beginPath();
      ctx.arc(x, map(m.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [slot, i] of [...rankOf.entries()].reverse()) {
      const m = snap.marbles.get(slot);
      if (!m) continue;
      const y = map(m.y);
      if (i === 0) {
        const p = this.player(slot);
        if (p) circleImage(ctx, this.avatar(p.avatar), x - 34, y, 17, MEDALS[0], 3);
      }
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = MEDALS[i];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- bottom bar
  drawBottom(ctx, st, t) {
    const g = ctx.createLinearGradient(0, 1690, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 1690, W, H - 1690);
    const s = st.stats || {};
    const opts = st.opts || {};
    this.pill(ctx, 20, 1724, 336, 'LIKE = BOOST!', s.likes, s.likeGoal, opts.likeStep, '#ff3b6b', (x, y) => heart(ctx, x, y, 36), opts.likeBoost !== false);
    this.pill(ctx, 372, 1724, 336, 'SUB = SUB STORM!', s.subs, s.subGoal, opts.subStep, '#ffd23f', (x, y) => bell(ctx, x, y, 34), opts.subStorm !== false);
    // players pill
    roundRect(ctx, 724, 1724, 336, 64, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    person(ctx, 760, 1756, 34, '#7fdcff');
    const count = st.players + (st.pending ? ` (+${st.pending})` : '');
    text(ctx, `${count} RACING`, 790, 1758, { size: 30, align: 'left', color: '#ffffff', shadow: false, maxWidth: 260 });
    // rotating call to action: what to type, and why it is worth it
    const word = String(opts.joinWord || 'enter').toUpperCase();
    const racing = st.phase === 'race' || st.phase === 'results';
    const lines = racing
      ? [{ pre: 'TYPE', key: word, post: 'TO JOIN NEXT RACE!' }, { text: 'WHO WILL WIN? COMMENT YOUR PICK!' }]
      : [{ pre: 'TYPE', key: word, post: 'IN CHAT TO JOIN!' }, { text: 'YOUR PFP BECOMES A MARBLE!' }, { text: 'WINNER GETS THE CROWN!' }];
    const slot = 4;
    const k = Math.floor(t / slot);
    const line = lines[k % lines.length];
    const phase = t - k * slot;
    const slide = phase < 0.25 ? 1 - phase / 0.25 : 0;
    const pulse = 1 + Math.sin(t * 4) * 0.025;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 1812, W, 108);
    ctx.clip();
    ctx.translate(W / 2, 1858 + slide * 90);
    ctx.scale(pulse, pulse);
    if (line.text) {
      ctx.font = `58px ${TITLE}`;
      const fit = Math.min(1, 1030 / ctx.measureText(line.text).width);
      ctx.scale(fit, fit);
      text(ctx, line.text, 0, 0, { size: 58, color: '#ffd23f', stroke: '#1a1030', strokeWidth: 9 });
    } else {
      ctx.font = `58px ${TITLE}`;
      const wPre = ctx.measureText(line.pre + ' ').width;
      const wWord = ctx.measureText(line.key).width + 36;
      const wPost = ctx.measureText(' ' + line.post).width;
      const total = wPre + wWord + wPost;
      const fit = Math.min(1, 1030 / total);
      ctx.scale(fit, fit);
      let x = -total / 2;
      text(ctx, line.pre, x, 0, { size: 58, align: 'left', color: '#ffffff', stroke: '#1a1030', strokeWidth: 9 });
      x += wPre;
      roundRect(ctx, x, -40, wWord, 80, 18);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1a1030';
      ctx.stroke();
      text(ctx, line.key, x + wWord / 2, 4, { size: 58, color: '#1a1030', shadow: false });
      x += wWord;
      text(ctx, ' ' + line.post, x, 0, { size: 58, align: 'left', color: '#ffffff', stroke: '#1a1030', strokeWidth: 9 });
    }
    ctx.restore();
  }

  pill(ctx, x, y, w, label, value, goal, step, color, icon, on) {
    roundRect(ctx, x, y, w, 64, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    icon(x + 36, y + 32);
    if (!on) {
      text(ctx, label.split('=')[0].trim() + 'S', x + 68, y + 34, { size: 28, align: 'left', color: '#fff', shadow: false });
      return;
    }
    if (value == null || goal == null) {
      text(ctx, label, x + 68, y + 34, { size: 28, align: 'left', color: '#fff', shadow: false, maxWidth: w - 80 });
      return;
    }
    text(ctx, label, x + 68, y + 20, { size: 20, align: 'left', color: '#fff', shadow: false, maxWidth: w - 80 });
    const bx = x + 68;
    const bw = w - 92;
    const span = Math.max(1, step || goal);
    const f = Math.max(0, Math.min(1, 1 - (goal - value) / span));
    roundRect(ctx, bx, y + 36, bw, 16, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    roundRect(ctx, bx, y + 36, Math.max(16, bw * f), 16, 8);
    ctx.fillStyle = color;
    ctx.fill();
    text(ctx, `${value.toLocaleString()} / ${goal.toLocaleString()}`, bx + bw / 2, y + 45, { size: 15, font: BODY, weight: '700', color: '#fff', shadow: false });
  }

  // ---------------------------------------------------------------- lobby
  drawLobby(ctx, st, t) {
    const accent = this.course.theme.accent;
    const x = 40;
    const y = 1046;
    const w = 1000;
    const h = 650;
    roundRect(ctx, x, y, w, h, 36);
    ctx.fillStyle = 'rgba(12,10,32,0.82)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = accent;
    ctx.stroke();
    if (st.waiting) {
      text(ctx, 'WAITING FOR PLAYERS', W / 2, y + 66, { size: 46, color: accent, stroke: '#1a1030', strokeWidth: 8 });
      const p = 1 + Math.sin(t * 5) * 0.05;
      ctx.save();
      ctx.translate(W / 2, y + 172);
      ctx.scale(p, p);
      text(ctx, `TYPE ${String(st.opts.joinWord || 'enter').toUpperCase()}!`, 0, 0, { size: 104, color: '#ffffff', stroke: '#1a1030', strokeWidth: 14 });
      ctx.restore();
    } else {
      text(ctx, 'NEXT RACE STARTS IN', W / 2, y + 52, { size: 40, color: accent, stroke: '#1a1030', strokeWidth: 8 });
      const urgent = st.timer <= 10;
      const p = urgent ? 1 + Math.abs(Math.sin(t * 6)) * 0.08 : 1;
      ctx.save();
      ctx.translate(W / 2, y + 158);
      ctx.scale(p, p);
      text(ctx, fmtTime(Math.ceil(st.timer)), 0, 0, { size: 150, color: urgent ? '#ff6b6b' : '#ffffff', stroke: '#1a1030', strokeWidth: 16 });
      ctx.restore();
    }
    // course name
    const cname = `COURSE ${st.course.index + 1}/${st.course.count}: ${st.course.name.toUpperCase()}`;
    ctx.font = `34px ${TITLE}`;
    const cw = Math.min(900, ctx.measureText(cname).width + 60);
    roundRect(ctx, W / 2 - cw / 2, y + 244, cw, 54, 27);
    ctx.fillStyle = accent;
    ctx.fill();
    text(ctx, cname, W / 2, y + 274, { size: 34, color: '#1a1030', shadow: false, maxWidth: cw - 40 });
    // who's in
    const list = [...this.players.values()];
    text(ctx, `${list.length} PLAYER${list.length === 1 ? '' : 'S'} IN`, W / 2, y + 334, { size: 34, color: '#ffffff', stroke: '#1a1030', strokeWidth: 6 });
    const per = 12;
    const shown = list.slice(-per * 2).reverse();
    shown.forEach((p, i) => {
      const row = Math.floor(i / per);
      const col = i % per;
      const n = Math.min(per, shown.length - row * per);
      const cx = W / 2 + (col - (n - 1) / 2) * 78;
      const cy = y + 390 + row * 74;
      circleImage(ctx, this.avatar(p.avatar), cx, cy, 32, p.vip ? '#ffd23f' : p.color, 4);
    });
    if (list.length > per * 2) {
      text(ctx, `+${list.length - per * 2} MORE`, W / 2, y + 522, { size: 26, font: BODY, weight: '700', color: '#cfd3ff', shadow: false });
    }
    if (!list.length) {
      text(ctx, 'Be the first to join!', W / 2, y + 430, { size: 36, font: BODY, weight: '600', color: '#cfd3ff', shadow: false });
    }
    // bottom row: last winner + top winners
    const by = y + 604;
    const champ = st.leaderboard && st.leaderboard[0];
    text(ctx, 'TOP WINNERS', x + 40, by - 32, { size: 26, align: 'left', color: accent, shadow: false });
    if (!st.leaderboard || !st.leaderboard.length) {
      text(ctx, 'Nobody has won yet - it could be you!', x + 40, by + 10, { size: 26, font: BODY, weight: '600', align: 'left', color: '#ffffff', shadow: false });
    } else {
      st.leaderboard.slice(0, 4).forEach((e, i) => {
        const cx = x + 70 + i * 236;
        circleImage(ctx, this.avatar(e.avatar), cx, by + 12, 26, MEDALS[i] || '#8899aa', 4);
        if (i === 0) crown(ctx, cx, by - 22, 26);
        text(ctx, e.name, cx + 36, by + 2, { size: 22, font: BODY, weight: '600', align: 'left', color: '#fff', shadow: false, maxWidth: 160 });
        text(ctx, `${e.wins} WIN${e.wins === 1 ? '' : 'S'}`, cx + 36, by + 28, { size: 20, align: 'left', color: '#ffd23f', shadow: false });
      });
    }
    void champ;
  }

  // ---------------------------------------------------------------- results
  drawResults(ctx, st, t) {
    ctx.fillStyle = 'rgba(5,4,20,0.66)';
    ctx.fillRect(0, 170, W, 1520);
    const pod = st.podium || [];
    const win = pod[0];
    if (!win) return;
    const accent = '#ffd23f';
    // light rays behind the winner
    ctx.save();
    ctx.translate(W / 2, 650);
    ctx.rotate(t * 0.3);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-60, -620);
      ctx.lineTo(60, -620);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,220,90,0.08)';
      ctx.fill();
    }
    ctx.restore();
    text(ctx, 'WINNER!', W / 2, 300, { size: 136, color: accent, stroke: '#3a1d00', strokeWidth: 18 });
    const bob = Math.sin(t * 3) * 6;
    circleImage(ctx, this.avatar(win.avatar), W / 2, 650 + bob, 175, accent, 12);
    crown(ctx, W / 2, 440 + bob, 130);
    text(ctx, win.name, W / 2, 890, { size: 72, color: '#ffffff', stroke: '#1a1030', strokeWidth: 12, maxWidth: 980 });
    const info = [];
    if (win.time != null) info.push(fmtTime(win.time) + '.' + String(Math.round((win.time % 1) * 10)));
    if (win.wins) info.push(`${win.wins} WIN${win.wins === 1 ? '' : 'S'} TOTAL`);
    if (info.length) {
      trophy(ctx, W / 2 - 230, 968, 44);
      text(ctx, info.join('   '), W / 2 + 10, 970, { size: 40, color: accent, stroke: '#1a1030', strokeWidth: 7, maxWidth: 820 });
    }
    // 2nd and 3rd
    [pod[1], pod[2]].forEach((p, i) => {
      if (!p) return;
      const cx = i === 0 ? 300 : 780;
      const cy = 1210;
      circleImage(ctx, this.avatar(p.avatar), cx, cy, 92, MEDALS[i + 1], 8);
      ctx.beginPath();
      ctx.arc(cx + 70, cy - 70, 32, 0, Math.PI * 2);
      ctx.fillStyle = MEDALS[i + 1];
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a1030';
      ctx.stroke();
      text(ctx, i === 0 ? '2' : '3', cx + 70, cy - 66, { size: 40, color: '#1a1030', shadow: false });
      text(ctx, p.name, cx, cy + 128, { size: 40, color: '#ffffff', stroke: '#1a1030', strokeWidth: 8, maxWidth: 420 });
      if (p.time != null) text(ctx, fmtTime(p.time), cx, cy + 178, { size: 30, font: BODY, weight: '700', color: '#cfd3ff', shadow: false });
    });
    text(ctx, `NEXT RACE IN ${fmtTime(Math.ceil(st.timer + ((st.opts && st.opts.lobbySeconds) || 0)))}`, W / 2, 1560, {
      size: 44, color: '#ffffff', stroke: '#1a1030', strokeWidth: 8,
    });
    const again = st.opts && st.opts.keepPlayers === false ? `Type ${String(st.opts.joinWord || 'enter').toUpperCase()} to race again!` : 'Everyone who entered races again!';
    text(ctx, again, W / 2, 1620, { size: 30, font: BODY, weight: '600', color: '#cfd3ff', shadow: false });
  }
}

export { fitText };
