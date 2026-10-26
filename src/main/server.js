'use strict';

// Local web server: serves the game screen (also usable as an OBS Browser Source),
// the control panel, profile pictures, and a WebSocket that streams the race.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

function createServer({ webDir, port, avatars, onControl, welcomeView, welcomeControl }) {
  const root = path.resolve(webDir);
  const views = new Set();
  const controls = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(url.pathname);
      if (p.startsWith('/avatar/')) {
        const id = p.slice(8);
        const a = await avatars.get(id);
        res.writeHead(200, {
          'Content-Type': a.type,
          'Cache-Control': a.temporary ? 'no-store' : 'max-age=3600',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(a.body);
        return;
      }
      if (p === '/' || p === '') p = '/index.html';
      if (p === '/control') p = '/control.html';
      const file = path.resolve(root, '.' + p);
      if (!file.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    } catch (e) {
      res.writeHead(500);
      res.end(String(e.message || e));
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const role = url.searchParams.get('role') === 'control' ? 'control' : 'view';
    // only pages served by this app may control it (not random websites)
    const origin = req.headers.origin;
    const trusted = !origin || origin === `http://${req.headers.host || ''}`;
    if (role === 'control' && !trusted) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.role = role;
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      (role === 'control' ? controls : views).add(ws);
      ws.on('close', () => {
        views.delete(ws);
        controls.delete(ws);
      });
      ws.on('error', () => {});
      ws.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch (e) {
          return;
        }
        if (trusted && msg && typeof msg.cmd === 'string') onControl(msg, ws);
      });
      const hello = role === 'control' ? welcomeControl() : welcomeView();
      for (const m of hello) if (m) ws.send(JSON.stringify(m));
    });
  });

  const ping = setInterval(() => {
    for (const ws of [...views, ...controls]) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (e) {
        // ignore
      }
    }
  }, 15000);

  function send(set, msg) {
    if (!set.size) return;
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of set) {
      // skip slow clients for the high-rate snapshots instead of piling up memory
      if (ws.readyState === 1 && ws.bufferedAmount < 4e6) ws.send(data);
    }
  }

  return new Promise((resolve, reject) => {
    let tryPort = port;
    const attempt = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && tryPort < port + 20) {
          tryPort++;
          attempt();
        } else reject(err);
      });
      server.listen(tryPort, '127.0.0.1', () => {
        resolve({
          port: tryPort,
          toViews: (m) => send(views, m),
          toControls: (m) => send(controls, m),
          toAll: (m) => {
            const data = JSON.stringify(m);
            send(views, data);
            send(controls, data);
          },
          counts: () => ({ views: views.size, controls: controls.size }),
          close: () => {
            clearInterval(ping);
            for (const ws of [...views, ...controls]) ws.terminate();
            server.close();
          },
        });
      });
    };
    attempt();
  });
}

module.exports = { createServer };
