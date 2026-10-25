// WebSocket link to the game + smooth playback of the 30-per-second race snapshots.

const DELAY = 0.1; // seconds of buffering so motion stays smooth

function lerp(a, b, f) {
  return a + (b - a) * f;
}

function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

export class Net {
  constructor(handlers, role = 'view') {
    this.h = handlers;
    this.role = role;
    this.snaps = [];
    this.hits = [];
    this.offset = null;
    this.connected = false;
    this.connect();
  }

  connect() {
    const ws = new WebSocket(`ws://${location.host}/ws?role=${this.role}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.snaps = [];
      this.offset = null;
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (m.type === 'snap') this.onSnap(m);
      else if (this.h[m.type]) this.h[m.type](m);
    };
    ws.onclose = () => {
      this.connected = false;
      setTimeout(() => this.connect(), 1000);
    };
    ws.onerror = () => {};
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  onSnap(s) {
    const now = performance.now() / 1000;
    const off = s.t - now;
    if (this.offset == null || Math.abs(off - this.offset) > 0.4) this.offset = off;
    else this.offset += (off - this.offset) * 0.05;
    const m = new Map();
    for (let i = 0; i < s.m.length; i += 5) m.set(s.m[i], [s.m[i + 1], s.m[i + 2], s.m[i + 3], s.m[i + 4]]);
    const k = new Map();
    for (let i = 0; i < s.k.length; i += 4) k.set(s.k[i], [s.k[i + 1], s.k[i + 2], s.k[i + 3]]);
    this.snaps.push({ t: s.t, cam: s.cam, m, k });
    if (this.snaps.length > 40) this.snaps.shift();
    if (s.h && s.h.length) this.hits.push({ t: s.t, ids: s.h });
  }

  // the race as it looked DELAY seconds ago, blended between the two nearest snapshots
  sample(nowMs) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const rt = nowMs / 1000 + this.offset - DELAY;
    while (this.hits.length && this.hits[0].t <= rt) {
      const h = this.hits.shift();
      if (this.h.hits) this.h.hits(h.ids);
    }
    let i = snaps.length - 1;
    while (i > 0 && snaps[i].t > rt) i--;
    const A = snaps[i];
    const B = snaps[Math.min(i + 1, snaps.length - 1)];
    let f = B.t > A.t ? (rt - A.t) / (B.t - A.t) : 1;
    if (f < 0) f = 0;
    if (f > 1) f = 1;
    const out = {
      t: lerp(A.t, B.t, f),
      cam: Math.abs(B.cam - A.cam) > 1500 ? B.cam : lerp(A.cam, B.cam, f),
      marbles: new Map(),
      kins: new Map(),
    };
    for (const [slot, b] of B.m) {
      const a = A.m.get(slot);
      if (!a || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 260) {
        out.marbles.set(slot, { x: b[0], y: b[1], a: b[2], flags: b[3] });
      } else {
        out.marbles.set(slot, { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), a: lerpAngle(a[2], b[2], f), flags: b[3] });
      }
    }
    for (const [id, b] of B.k) {
      const a = A.k.get(id);
      if (!a || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 600) out.kins.set(id, { x: b[0], y: b[1], a: b[2] });
      else out.kins.set(id, { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), a: lerpAngle(a[2], b[2], f) });
    }
    return out;
  }
}
