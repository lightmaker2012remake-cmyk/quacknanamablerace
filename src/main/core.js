'use strict';

// Wires the game, the YouTube connection and the local server together.
// Used by the Electron app (main.js) and by the plain Node version (headless.js).

const path = require('path');
const { Settings } = require('../game/settings');
const { Store } = require('../game/store');
const { Game } = require('../game/game');
const { COURSES } = require('../game/courses');
const { YouTubeLive } = require('../youtube/live');
const { Avatars } = require('./avatars');
const { createServer } = require('./server');

async function startCore({ dataDir, fetch, onOpenControl, onOpenGame, onWindowSize, version }) {
  const settings = new Settings(dataDir);
  const store = new Store(dataDir);
  const game = new Game({ settings, store });
  const yt = new YouTubeLive({ fetch });
  const chatLog = [];
  let testCount = 0;

  const avatars = new Avatars({
    fetch,
    getSource: (id) => game.avatarSource(id),
    getName: (id) => {
      const p = game.players.get(id) || game.pending.get(id);
      return p ? p.name : '';
    },
  });

  const controlInfo = () => ({
    type: 'info',
    version,
    app: !!onOpenGame,
    port: server.port,
    url: `http://127.0.0.1:${server.port}/`,
    courses: COURSES.map((c) => ({ id: c.id, name: c.name })),
    settings: settings.all(),
    yt: yt.status,
    leaderboard: store.top(20),
  });

  const server = await createServer({
    webDir: path.join(__dirname, '..', 'web'),
    port: settings.get('port'),
    avatars,
    welcomeView: () => game.welcome(),
    welcomeControl: () => [controlInfo(), game.makeState(), { type: 'chatlog', list: chatLog }],
    onControl: (msg) => handleControl(msg),
  });

  game.on('course', (m) => server.toViews(m));
  game.on('players', (m) => server.toViews(m));
  game.on('snap', (m) => server.toViews(m));
  game.on('state', (m) => server.toAll(m));
  game.on('fx', (m) => {
    server.toViews(m);
    if (m.fx === 'winner' || m.fx === 'results') server.toControls({ type: 'leaderboard', list: store.top(20) });
  });

  function logChat(entry) {
    chatLog.push(entry);
    if (chatLog.length > 80) chatLog.shift();
    server.toControls({ type: 'chat', entry });
  }

  yt.on('status', (st) => {
    game.setYouTubeStatus(st);
    server.toControls({ type: 'yt', yt: st });
  });
  yt.on('stats', (s) => game.setStats(s));
  yt.on('chat', (msg) => {
    game.handleChat(msg);
    logChat({ kind: msg.kind, name: msg.author.name, text: msg.text, amount: msg.amount, at: Date.now() });
  });

  function handleControl(msg) {
    const n = Math.max(1, Math.min(100, parseInt(msg.n, 10) || 1));
    switch (msg.cmd) {
      case 'connect': {
        const target = String(msg.target || '').trim();
        settings.update({ youtubeTarget: target });
        yt.connect(target);
        server.toControls(controlInfo());
        break;
      }
      case 'disconnect':
        yt.disconnect();
        break;
      case 'start':
        game.startNow();
        break;
      case 'end':
        game.endRace();
        break;
      case 'bots':
        game.addBots(n);
        break;
      case 'clear':
        game.clearPlayers(!!msg.botsOnly);
        break;
      case 'like': {
        const total = (game.stats.likes || 0) + n;
        game.onLikes(n, total);
        game.stats.likes = total;
        break;
      }
      case 'sub': {
        const total = (game.stats.subs || 0) + 1;
        game.onSubs(1, total);
        game.stats.subs = total;
        break;
      }
      case 'superchat': {
        testCount++;
        const name = String(msg.name || `Big Fan ${testCount}`).slice(0, 30);
        game.handleChat({ kind: 'superchat', amount: '$5.00', text: '', author: { id: 'test-sc-' + name, name } });
        logChat({ kind: 'superchat', name, text: '(test)', amount: '$5.00', at: Date.now() });
        break;
      }
      case 'chat': {
        testCount++;
        const name = String(msg.name || `Tester ${testCount}`).slice(0, 30);
        const text = String(msg.text || 'enter').slice(0, 200);
        game.handleChat({ kind: 'text', text, author: { id: 'test-' + name, name } });
        logChat({ kind: 'text', name, text: text + ' (test)', at: Date.now() });
        break;
      }
      case 'settings': {
        const changed = settings.update(msg.values || {});
        game.settingsChanged(changed);
        server.toControls(controlInfo());
        break;
      }
      case 'resetLeaderboard':
        store.reset();
        server.toControls(controlInfo());
        break;
      case 'openControl':
        if (onOpenControl) onOpenControl();
        break;
      case 'openGame':
        if (onOpenGame) onOpenGame();
        break;
      case 'windowSize':
        if (onWindowSize) onWindowSize(msg.size);
        break;
      default:
        break;
    }
  }

  game.start();
  if (settings.get('autoConnect') && settings.get('youtubeTarget')) yt.connect(settings.get('youtubeTarget'));

  return {
    settings,
    store,
    game,
    yt,
    port: server.port,
    url: `http://127.0.0.1:${server.port}/`,
    handleControl,
    shutdown() {
      game.stop();
      yt.disconnect(true);
      store.flush();
      server.close();
    },
  };
}

module.exports = { startCore };
