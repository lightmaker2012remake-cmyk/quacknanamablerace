// The game screen. Used by the app window and by OBS (Browser Source, 1080x1920).

import { Net } from './net.js';
import { World } from './world.js';
import { Hud } from './hud.js';
import { Fx } from './fx.js';
import { Sound } from './audio.js';
import { text, BODY } from './gfx.js';

const W = 1080;
const H = 1920;
const params = new URLSearchParams(location.search);
const isWindow = params.get('view') === 'window';
const wantSound = params.has('sound') ? params.get('sound') !== '0' : isWindow;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1;

const world = new World();
const images = (url) => world.loadAvatar(url);
const hud = new Hud(images);
hud.isWindow = isWindow;
const fx = new Fx();
const sound = new Sound();
let lastSnap = null;
let state = null;
let muted = false;
let helpUntil = isWindow ? performance.now() + 12000 : 0;

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  const cssW = Math.floor(W * s);
  const cssH = Math.floor(H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.min(W, Math.round(cssW * dpr));
  const bh = Math.round((bw * H) / W);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  scale = bw / W;
}
window.addEventListener('resize', resize);
resize();

function marblePos(slot) {
  if (!lastSnap) return null;
  return lastSnap.marbles.get(slot) || null;
}

function playerName(slot) {
  const p = world.players.get(slot);
  return p ? p.name : '';
}

function onFx(e) {
  const accent = (world.theme && world.theme.accent) || '#ffd23f';
  switch (e.fx) {
    case 'join': {
      const m = marblePos(e.slot);
      if (m) {
        fx.ring(m.x, m.y, accent, 50);
        fx.sparks(m.x, m.y, 12, '#ffffff', 220);
      }
      fx.toast({ text: `${e.name} joined!`, avatar: e.avatar, color: '#3ddc84' });
      sound.pop();
      break;
    }
    case 'queued':
      fx.toast({ text: `${e.name} is in the next race!`, avatar: e.avatar, color: '#7fdcff' });
      sound.pop();
      break;
    case 'leave':
      fx.toast({ text: `${e.name} left the race`, color: '#ff8a80' });
      break;
    case 'toast':
      fx.toast({ text: e.text, color: e.kind === 'warn' ? '#ffb300' : '#ffffff' });
      break;
    case 'countdown':
      fx.banner({ text: String(e.n), size: 300, dur: 0.95, y: 1360, color: '#ffffff', priority: true });
      sound.beep(e.n);
      break;
    case 'go':
      fx.banner({ text: 'GO!', size: 280, dur: 1.2, y: 1360, color: accent, priority: true });
      fx.confetti(540, 820, 70);
      fx.shake(10, 0.4);
      sound.go();
      break;
    case 'like': {
      let any = false;
      for (const slot of e.slots || []) {
        const m = marblePos(slot);
        if (!m) continue;
        any = true;
        fx.hearts(m.x, m.y, 6);
      }
      fx.hearts(110, 1700, Math.min(10, 2 + e.n), fx.screen);
      if (any) {
        fx.banner({ text: 'LIKE BOOST!', sub: `${e.n > 1 ? e.n + ' new likes' : 'Thanks for the like'} - zoom zoom!`, color: '#ff4d7d', size: 110, dur: 1.4, y: 760 });
        sound.boost();
      }
      sound.like();
      break;
    }
    case 'likeGoal':
      fx.banner({ text: 'LIKE GOAL!', sub: `${e.total.toLocaleString()} likes - everyone gets a boost!`, color: '#ff4d7d', size: 130, dur: 2.4, y: 760 });
      fx.heartRain(70);
      sound.sub();
      break;
    case 'sub':
      fx.banner({
        text: 'NEW SUBSCRIBER!',
        sub: e.storm ? 'SUB STORM - every marble gets a boost!' : 'Thank you for subscribing!',
        color: '#ffd23f', size: 104, dur: 2.6, y: 760,
      });
      fx.goldRain(60);
      fx.confettiRain(60);
      fx.shake(8, 0.5);
      sound.sub();
      if (e.storm) sound.boost();
      break;
    case 'superchat': {
      const m = marblePos(e.slot);
      if (m) {
        fx.stars(m.x, m.y, 24);
        fx.ring(m.x, m.y, '#ffd23f', 80);
      }
      fx.banner({
        text: `${e.label}!`, sub: `${e.name} ${e.amount || ''} - GOLDEN MARBLE!`.replace(/\s+-/, ' -'),
        color: '#ffd23f', size: 104, dur: 2.6, y: 760, icon: e.avatar,
      });
      fx.goldRain(40);
      sound.sub();
      break;
    }
    case 'finish': {
      const m = marblePos(e.slot);
      if (m) fx.sparks(m.x, world.course ? world.course.finishY : m.y, 18, '#fff3a0', 380);
      sound.finish();
      break;
    }
    case 'winner': {
      const m = marblePos(e.slot);
      if (m) {
        fx.confetti(m.x, m.y, 120, fx.world, 1200);
        fx.stars(m.x, m.y, 30);
      }
      fx.banner({ text: e.timeup ? 'CLOSEST WINS!' : 'WINNER!', sub: e.name, color: '#ffd23f', size: 150, dur: 3, y: 820, icon: e.avatar, priority: true });
      fx.confettiRain(120);
      fx.shake(14, 0.6);
      sound.fanfare();
      break;
    }
    case 'timeup':
      fx.banner({ text: "TIME'S UP!", color: '#ff6b6b', size: 150, dur: 1.6, y: 820, priority: true });
      sound.beep(0);
      break;
    case 'results':
      fx.confettiRain(160);
      break;
    case 'teleport':
      fx.sparks(e.x, e.y, 14, '#d0b3ff', 200);
      fx.ring(e.x2, e.y2, '#d0b3ff', 50);
      sound.poof();
      break;
    case 'lobby':
      fx.screen.length = 0;
      break;
    default:
      break;
  }
}

const net = new Net({
  course: (c) => {
    world.setCourse(c);
    hud.course = c;
  },
  players: (m) => {
    world.setPlayers(m.list, m.radius);
    hud.players = world.players;
  },
  state: (st) => {
    state = st;
    hud.state = st;
    world.rank = st.rank;
    world.phase = st.phase;
    world.showNames = !!(st.opts && st.opts.showNames);
    fx.toastTop = st.phase === 'lobby' || st.phase === 'countdown';
    sound.setSong(st.phase === 'race' ? 'race' : 'lobby');
    if (st.opts) sound.setVolumes(muted ? 0 : st.opts.soundVolume, st.opts.music, st.opts.musicVolume);
  },
  fx: onFx,
  hits: (ids) => {
    const now = performance.now();
    world.hit(ids, now);
    if (!lastSnap || !world.course) return;
    // only make noise for pegs that are on screen
    for (const id of ids) {
      const s = world.course.statics[id];
      if (!s) continue;
      if (s.y > lastSnap.cam - 50 && s.y < lastSnap.cam + H + 50) {
        if (s.kind === 'bumper' || s.kind === 'sling') sound.boing();
        else sound.tick();
      }
    }
  },
});

// ---------------------------------------------------------------- sound unlock
function tryEnableSound() {
  if (!wantSound) return;
  sound.enable();
  setTimeout(() => {
    const tap = document.getElementById('tap');
    if (!sound.ready) {
      tap.hidden = false;
      const go = () => {
        sound.enable();
        tap.hidden = true;
      };
      tap.onclick = go;
      window.addEventListener('pointerdown', go, { once: true });
      window.addEventListener('keydown', go, { once: true });
    }
  }, 600);
}

// ---------------------------------------------------------------- hotkeys (app window)
if (isWindow) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    const cmd = {
      ' ': { cmd: 'start' }, b: { cmd: 'bots', n: 5 }, l: { cmd: 'like', n: 1 }, s: { cmd: 'sub' },
      g: { cmd: 'superchat' }, c: { cmd: 'openControl' }, e: { cmd: 'end' },
    }[k];
    if (cmd) {
      net.send(cmd);
      e.preventDefault();
    } else if (k === 'm') {
      muted = !muted;
      if (state && state.opts) sound.setVolumes(muted ? 0 : state.opts.soundVolume, state.opts.music, state.opts.musicVolume);
      fx.toast({ text: muted ? 'Sound off (M)' : 'Sound on (M)', color: '#ffffff' });
    } else if (k === 'h' || k === 'f1') {
      helpUntil = helpUntil > performance.now() ? 0 : performance.now() + 15000;
    }
  });
}

function drawHelp(now) {
  if (helpUntil < now) return;
  const lines = [
    'C  open the control panel',
    'SPACE  start the race now',
    'B  add 5 test marbles',
    'L / S / G  test like / sub / super chat',
    'E  end race    M  mute    F11  fullscreen',
    'H  show / hide this help',
  ];
  const a = Math.min(1, (helpUntil - now) / 600);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(140, 640, 800, 70 + lines.length * 52);
  text(ctx, 'APP WINDOW SHORTCUTS', 540, 680, { size: 40, color: '#ffd23f' });
  lines.forEach((l, i) => text(ctx, l, 540, 740 + i * 52, { size: 32, font: BODY, weight: '600', color: '#fff', shadow: false }));
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const snap = net.sample(now);
  if (snap) lastSnap = snap;
  fx.update(dt);
  const view = lastSnap ? Object.assign({}, lastSnap) : null;
  if (view) view.cam -= fx.shakeOffset()[1];
  world.draw(ctx, view, scale, now);
  if (view) {
    ctx.setTransform(scale, 0, 0, scale, 0, -view.cam * scale);
    fx.drawWorld(ctx);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  hud.draw(ctx, lastSnap, now, net.connected);
  fx.drawScreen(ctx, images);
  drawHelp(now);
}

document.fonts.load(`40px "Luckiest Guy"`).catch(() => {});
document.fonts.load(`600 40px Fredoka`).catch(() => {});
document.fonts.ready.then(() => requestAnimationFrame(frame));
tryEnableSound();
