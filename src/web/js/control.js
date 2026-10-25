// Control panel: connect YouTube, start races, test effects, change settings.

const $ = (id) => document.getElementById(id);
let ws = null;
let settings = {};
let testN = 0;

const PHASES = { lobby: 'Lobby', countdown: 'Countdown', race: 'Racing', results: 'Winner screen' };

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?role=control`);
  ws.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch (err) {
      return;
    }
    if (handlers[m.type]) handlers[m.type](m);
  };
  ws.onclose = () => {
    $('phase').textContent = 'Game not running';
    setTimeout(connect, 1000);
  };
}

function fmt(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showYt(yt) {
  const box = $('ytStatus');
  box.className = 'status ' + (yt.state || 'off');
  let msg = yt.message || '';
  if (yt.state === 'connected') msg = `Connected - reading chat of "${yt.title || yt.videoId}"`;
  $('ytText').textContent = msg;
}

function fillSettings(s) {
  settings = s;
  const form = $('settings');
  for (const el of form.elements) {
    if (!el.name || !(el.name in s)) continue;
    const v = s[el.name];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (Array.isArray(v)) el.value = v.join(', ');
    else el.value = v;
  }
  if (document.activeElement !== $('target')) $('target').value = s.youtubeTarget || '';
}

function addChat(entry) {
  const box = $('chat');
  if (box.querySelector('.hint')) box.innerHTML = '';
  const div = document.createElement('div');
  const word = String(entry.text || '').trim().toLowerCase().split(/\s+/)[0] || '';
  const isJoin = (settings.joinKeywords || ['enter']).some((k) => word.replace(/[^\p{L}\p{N}!]/gu, '') === k);
  div.className = 'msg' + (isJoin ? ' join' : '') + (entry.kind && entry.kind !== 'text' ? ' vip' : '');
  const b = document.createElement('b');
  b.textContent = entry.name + ': ';
  div.appendChild(b);
  const label = entry.kind && entry.kind !== 'text' ? `[${entry.kind}${entry.amount ? ' ' + entry.amount : ''}] ` : '';
  div.appendChild(document.createTextNode(label + (entry.text || '')));
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.appendChild(div);
  while (box.children.length > 120) box.removeChild(box.firstChild);
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function showBoard(list) {
  const ol = $('board');
  ol.innerHTML = '';
  if (!list || !list.length) {
    const li = document.createElement('li');
    li.textContent = 'No winners yet.';
    ol.appendChild(li);
    return;
  }
  for (const e of list) {
    const li = document.createElement('li');
    li.textContent = `${e.name} `;
    const span = document.createElement('span');
    span.className = 'wins';
    span.textContent = `${e.wins} win${e.wins === 1 ? '' : 's'}`;
    li.appendChild(span);
    li.appendChild(document.createTextNode(` (${e.races} races)`));
    ol.appendChild(li);
  }
}

const handlers = {
  info(m) {
    $('obsUrl').value = m.url;
    for (const id of ['openGame', 'sizeFull', 'sizeFit']) $(id).hidden = !m.app;
    $('footer').textContent = `Version ${m.version || ''} - game screen ${m.url} - your settings and winners are saved on this PC`;
    const sel = $('courseSelect');
    if (sel.options.length <= 1) {
      for (const c of m.courses) {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.name;
        sel.appendChild(o);
      }
    }
    fillSettings(m.settings);
    showYt(m.yt);
    showBoard(m.leaderboard);
  },
  state(st) {
    let txt = PHASES[st.phase] || st.phase;
    if (st.phase === 'lobby') txt = st.waiting ? 'Lobby - waiting for players' : `Lobby - race in ${fmt(st.timer)}`;
    if (st.phase === 'race') txt = `Racing ${fmt(st.raceTime)}`;
    $('phase').textContent = `${txt} | ${st.players} in${st.pending ? ` (+${st.pending} next)` : ''} | ${st.course.name}`;
    const s = st.stats || {};
    const parts = [];
    if (s.viewers != null) parts.push(`<span>Watching <b>${s.viewers.toLocaleString()}</b></span>`);
    if (s.likes != null) parts.push(`<span>Likes <b>${s.likes.toLocaleString()}</b> (goal ${s.likeGoal.toLocaleString()})</span>`);
    if (s.subs != null) parts.push(`<span>Subscribers <b>${s.subs.toLocaleString()}</b></span>`);
    $('ytStats').innerHTML = parts.join('');
    if (st.yt) showYt(st.yt);
  },
  yt(m) {
    showYt(m.yt);
  },
  chatlog(m) {
    for (const e of m.list) addChat(e);
  },
  chat(m) {
    addChat(m.entry);
  },
  leaderboard(m) {
    showBoard(m.list);
  },
};

$('connect').onclick = () => {
  const target = $('target').value.trim();
  if (!target) {
    $('target').focus();
    return;
  }
  send({ cmd: 'connect', target });
};
$('target').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('connect').click();
});
$('disconnect').onclick = () => send({ cmd: 'disconnect' });
$('copyUrl').onclick = async () => {
  const el = $('obsUrl');
  try {
    await navigator.clipboard.writeText(el.value);
  } catch (e) {
    el.select();
    document.execCommand('copy');
  }
  $('copyUrl').textContent = 'Copied!';
  setTimeout(() => ($('copyUrl').textContent = 'Copy'), 1500);
};
$('openGame').onclick = () => send({ cmd: 'openGame' });
$('sizeFull').onclick = () => send({ cmd: 'windowSize', size: 'full' });
$('sizeFit').onclick = () => send({ cmd: 'windowSize', size: 'fit' });
$('start').onclick = () => send({ cmd: 'start' });
$('end').onclick = () => send({ cmd: 'end' });
$('bots5').onclick = () => send({ cmd: 'bots', n: 5 });
$('botsClear').onclick = () => send({ cmd: 'clear', botsOnly: true });
$('clearAll').onclick = () => {
  if (confirm('Remove every player from the race?')) send({ cmd: 'clear' });
};
$('tLike').onclick = () => send({ cmd: 'like', n: 1 });
$('tSub').onclick = () => send({ cmd: 'sub' });
$('tSuper').onclick = () => send({ cmd: 'superchat' });
$('tEnter').onclick = () => send({ cmd: 'chat', name: `Viewer ${++testN}`, text: (settings.joinKeywords || ['enter'])[0] });
$('resetBoard').onclick = () => {
  if (confirm('Reset the all-time winners list?')) send({ cmd: 'resetLeaderboard' });
};

$('settings').addEventListener('submit', (e) => {
  e.preventDefault();
  const values = {};
  for (const el of e.target.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') values[el.name] = el.checked;
    else if (el.type === 'number' || el.type === 'range') values[el.name] = Number(el.value);
    else values[el.name] = el.value;
  }
  send({ cmd: 'settings', values });
  $('saved').textContent = 'Saved!';
  setTimeout(() => ($('saved').textContent = ''), 2000);
});

connect();
