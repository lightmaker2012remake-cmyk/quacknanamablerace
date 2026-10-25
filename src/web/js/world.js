// Draws the course (background, obstacles, finish line) and the marbles.

import { makeCanvas, text, crown, TITLE, BODY } from './gfx.js';

const W = 1080;
const H = 1920;
const BUCKET = 400;
const SS = 2; // marble sprites are drawn at 2x for crisp profile pictures

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a, b, f) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`;
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function glowSprite(radius, color, inner = 0.2) {
  const size = radius * 2;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(radius, radius, radius * inner, radius, radius, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export class World {
  constructor() {
    this.course = null;
    this.theme = null;
    this.players = new Map();
    this.radius = 24;
    this.flash = new Map();
    this.trails = new Map();
    this.rank = [];
    this.phase = 'lobby';
    this.showNames = false;
    this.frame = 0;
    this.avatarCache = new Map(); // url -> Image
  }

  // ------------------------------------------------------------------ course setup
  setCourse(c) {
    this.course = c;
    this.theme = c.theme;
    this.buckets = new Map();
    for (const s of c.statics) {
      let minY;
      let maxY;
      let minX;
      let maxX;
      if (s.type === 'circle') {
        minY = s.y - s.r;
        maxY = s.y + s.r;
        minX = s.x - s.r;
        maxX = s.x + s.r;
      } else {
        minY = Math.min(...s.pts.map((p) => p[1]));
        maxY = Math.max(...s.pts.map((p) => p[1]));
        minX = Math.min(...s.pts.map((p) => p[0]));
        maxX = Math.max(...s.pts.map((p) => p[0]));
      }
      // the long side walls are drawn as one strip instead of box by box
      if (s.kind === 'wall' && (maxX <= 41 || minX >= 1039)) continue;
      if (s.type === 'poly' && (s.kind === 'ramp' || s.kind === 'ice')) {
        // find the walkable top edge of the ramp for the highlight line
        const e1 = [s.pts[0], s.pts[1]];
        const e2 = [s.pts[2], s.pts[3]];
        s._top = e1[0][1] + e1[1][1] < e2[0][1] + e2[1][1] ? e1 : e2;
      }
      for (let b = Math.floor(minY / BUCKET); b <= Math.floor(maxY / BUCKET); b++) {
        if (!this.buckets.has(b)) this.buckets.set(b, []);
        this.buckets.get(b).push(s);
      }
    }
    this.makeThemeSprites();
    this.kinDefs = new Map();
    for (const k of c.kinematics) this.kinDefs.set(k.id, Object.assign({}, k, { sprite: this.makeKinSprite(k) }));
    this.makeDecor();
    this.flash.clear();
  }

  makeThemeSprites() {
    const th = this.theme;
    // peg with a soft glow
    const ps = makeCanvas(64, 64);
    const g = ps.getContext('2d');
    g.drawImage(glowSprite(32, rgba(th.pegGlow, 0.55), 0.25), 0, 0);
    g.beginPath();
    g.arc(32, 32, 12, 0, Math.PI * 2);
    g.fillStyle = th.peg;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = th.pegRim || 'rgba(0,0,0,0.25)';
    g.stroke();
    g.beginPath();
    g.arc(28, 28, 4, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fill();
    this.pegSprite = ps;
    this.pegFlash = glowSprite(46, 'rgba(255,255,255,0.95)', 0.1);
    this.bumperGlow = glowSprite(80, rgba(th.bumper, 0.7), 0.3);
    this.blob = glowSprite(256, rgba(th.accent, 0.10), 0);
    this.ember = glowSprite(12, 'rgba(255,170,60,0.9)', 0.1);
    // candy stripes for candy ramps
    const pc = makeCanvas(40, 40);
    const pg = pc.getContext('2d');
    pg.fillStyle = th.ramp;
    pg.fillRect(0, 0, 40, 40);
    pg.strokeStyle = '#ffffff';
    pg.lineWidth = 9;
    for (let i = -40; i <= 80; i += 20) {
      pg.beginPath();
      pg.moveTo(i, 0);
      pg.lineTo(i - 40, 40);
      pg.stroke();
    }
    this.stripes = pc;
    this.stripePattern = null;
    // hazard stripes for the start gate
    const hz = makeCanvas(48, 48);
    const hg = hz.getContext('2d');
    hg.fillStyle = '#1b1b1b';
    hg.fillRect(0, 0, 48, 48);
    hg.strokeStyle = th.gate || '#ffd23f';
    hg.lineWidth = 12;
    for (let i = -48; i <= 96; i += 24) {
      hg.beginPath();
      hg.moveTo(i, 0);
      hg.lineTo(i - 48, 48);
      hg.stroke();
    }
    this.hazard = hz;
  }

  makeKinSprite(k) {
    const th = this.theme;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of k.shapes) {
      if (s.type === 'circle') {
        minX = Math.min(minX, s.x - s.r);
        maxX = Math.max(maxX, s.x + s.r);
        minY = Math.min(minY, s.y - s.r);
        maxY = Math.max(maxY, s.y + s.r);
      } else {
        for (const p of s.pts) {
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        }
      }
    }
    const pad = 8;
    const c = makeCanvas(maxX - minX + pad * 2, maxY - minY + pad * 2);
    const g = c.getContext('2d');
    g.translate(pad - minX, pad - minY);
    g.lineJoin = 'round';
    const kind = k.kind;
    const fill = {
      spinner: th.spinner, pinwheel: th.spinner, hammer: th.hammer, slider: th.slider, wheel: th.wheel,
      flap: th.flap, bucket: th.flap, gate: th.gate,
    }[kind] || th.spinner;
    const edge = kind === 'spinner' || kind === 'pinwheel' ? th.spinnerEdge : 'rgba(255,255,255,0.55)';
    k.shapes.forEach((s, i) => {
      if (s.type === 'circle') {
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fillStyle = s.deco || kind === 'hammer' || kind === 'flap' ? '#2b2b33' : fill;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.stroke();
        g.beginPath();
        g.arc(s.x, s.y, Math.max(3, s.r * 0.35), 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fill();
        return;
      }
      polyPath(g, s.pts);
      if (kind === 'gate') {
        g.fillStyle = g.createPattern(this.hazard, 'repeat');
      } else if (kind === 'hammer' && i === 0) {
        g.fillStyle = '#8d939e';
      } else {
        g.fillStyle = fill;
      }
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.stroke();
      // light edge
      polyPath(g, s.pts);
      g.save();
      g.clip();
      g.lineWidth = 4;
      g.strokeStyle = edge;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(s.pts[0][0], s.pts[0][1]);
      g.lineTo(s.pts[1][0], s.pts[1][1]);
      g.stroke();
      g.restore();
    });
    return { canvas: c, ox: pad - minX, oy: pad - minY };
  }

  makeDecor() {
    const rnd = seeded(String(this.course.id).split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    this.decor = [];
    for (let i = 0; i < 70; i++) {
      this.decor.push({
        x: rnd() * W, y: rnd() * (H + 200), s: 0.5 + rnd() * 1.5, d: 0.12 + rnd() * 0.45,
        ph: rnd() * Math.PI * 2, sp: 10 + rnd() * 40, c: Math.floor(rnd() * 6), r: rnd() * Math.PI,
      });
    }
    this.blobs = [];
    for (let i = 0; i < 6; i++) this.blobs.push({ x: rnd() * W, y: rnd() * (H + 600), s: 1 + rnd() * 1.5, d: 0.05 + rnd() * 0.1 });
  }

  // ------------------------------------------------------------------ players
  setPlayers(list, radius) {
    if (radius && radius !== this.radius) {
      this.radius = radius;
      this.shared = null;
      for (const p of this.players.values()) p.sprite = null;
    }
    const next = new Map();
    for (const info of list) {
      let p = this.players.get(info.slot);
      if (!p || p.id !== info.id) p = { id: info.id, sprite: null };
      Object.assign(p, info);
      if (p.vipShown !== p.vip) {
        p.vipShown = p.vip;
        p.sprite = null;
      }
      if (!p.img) p.img = this.loadAvatar(info.avatar);
      next.set(info.slot, p);
    }
    this.players = next;
  }

  loadAvatar(url) {
    let img = this.avatarCache.get(url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = url;
      this.avatarCache.set(url, img);
      if (this.avatarCache.size > 600) this.avatarCache.delete(this.avatarCache.keys().next().value);
    }
    return img;
  }

  sharedSprites() {
    if (this.shared) return this.shared;
    const R = this.radius;
    const size = Math.ceil((R + 2) * 2 * SS);
    const hl = makeCanvas(size, size);
    const g = hl.getContext('2d');
    const c = size / 2;
    const r = R * SS;
    // dark rim + glossy highlight = glass marble look
    let grad = g.createRadialGradient(c, c, r * 0.6, c, c, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    grad = g.createRadialGradient(c - r * 0.35, c - r * 0.42, 0, c - r * 0.35, c - r * 0.42, r * 0.75);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(c - r * 0.42, c - r * 0.5, r * 0.16, r * 0.1, -0.7, 0, Math.PI * 2);
    g.fill();
    const shadow = glowSprite(Math.ceil(R * 1.3), 'rgba(0,0,0,0.45)', 0.55);
    const vip = glowSprite(Math.ceil(R * 2), 'rgba(255,210,60,0.75)', 0.45);
    const boost = glowSprite(Math.ceil(R * 1.2), 'rgba(255,160,40,0.8)', 0.1);
    this.shared = { hl, shadow, vip, boost, size };
    return this.shared;
  }

  marbleSprite(p) {
    if (p.sprite && p.spriteReady) return p.sprite;
    const R = this.radius;
    const sh = this.sharedSprites();
    const size = sh.size;
    const c = size / 2;
    const r = R * SS;
    const cv = p.sprite || makeCanvas(size, size);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.clip();
    const img = p.img;
    const ready = img && img.complete && img.naturalWidth > 0;
    if (ready) {
      g.drawImage(img, c - r, c - r, r * 2, r * 2);
    } else {
      g.fillStyle = p.color || '#888';
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(r)}px ${BODY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText((p.name || '?')[0].toUpperCase(), c, c + r * 0.05);
    }
    g.restore();
    g.beginPath();
    g.arc(c, c, r - 2 * SS, 0, Math.PI * 2);
    g.lineWidth = 4 * SS;
    g.strokeStyle = p.vip ? '#ffd23f' : p.color || '#fff';
    g.stroke();
    p.sprite = cv;
    p.spriteReady = !!ready || (img && img.complete && img.naturalWidth === 0);
    return cv;
  }

  hit(ids, now) {
    for (const id of ids) this.flash.set(id, now);
  }

  // ------------------------------------------------------------------ drawing
  draw(ctx, snap, scale, now) {
    if (!this.course) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    this.frame++;
    const cam = snap ? snap.cam : -230;
    const th = this.theme;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.drawBackground(ctx, cam, now);
    ctx.setTransform(scale, 0, 0, scale, 0, -cam * scale);
    this.drawLabels(ctx, cam);
    this.drawFinish(ctx, cam, now);
    this.drawStatics(ctx, cam, now);
    if (snap) this.drawKinematics(ctx, snap, scale, cam);
    this.drawWalls(ctx, cam, th);
    if (snap) this.drawMarbles(ctx, snap, scale, cam, now);
  }

  drawBackground(ctx, cam, now) {
    const th = this.theme;
    const prog = Math.max(0, Math.min(1, cam / Math.max(1, this.course.height)));
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, mixHex(th.bg[0], th.bgEnd[0], prog));
    grad.addColorStop(1, mixHex(th.bg[1], th.bgEnd[1], prog));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const t = now / 1000;
    for (const b of this.blobs) {
      const y = ((((b.y - cam * b.d) % (H + 600)) + H + 600) % (H + 600)) - 300;
      const s = 512 * b.s;
      ctx.drawImage(this.blob, b.x - s / 2, y - s / 2, s, s);
    }
    const kind = th.decor;
    for (const p of this.decor) {
      let y = p.y - cam * p.d;
      let x = p.x;
      if (kind === 'bubbles' || kind === 'embers') y -= t * p.sp;
      if (kind === 'snow' || kind === 'sprinkles') y += t * p.sp * 0.6;
      if (kind === 'snow' || kind === 'bubbles') x += Math.sin(t * 0.8 + p.ph) * 18;
      y = (((y % (H + 200)) + H + 200) % (H + 200)) - 100;
      if (kind === 'bubbles') {
        ctx.beginPath();
        ctx.arc(x, y, 5 + p.s * 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(x - 2 - p.s, y - 2 - p.s, 1.5 + p.s, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'sprinkles') {
        const colors = ['#ffffff', '#ffe066', '#7ee8fa', '#ff5c8a', '#a3ff8f', '#c084fc'];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.r + t * 0.5);
        ctx.fillStyle = colors[p.c];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(-7 * p.s, -2 * p.s, 14 * p.s, 4 * p.s);
        ctx.restore();
      } else if (kind === 'embers') {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + p.ph));
        ctx.globalAlpha = a;
        const s = 10 + p.s * 8;
        ctx.drawImage(this.ember, x - s / 2, y - s / 2, s, s);
        ctx.globalAlpha = 1;
      } else if (kind === 'stars') {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + p.ph));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        if (p.c === 0) {
          const s = 3 + p.s * 3;
          ctx.beginPath();
          ctx.moveTo(x, y - s * 2);
          ctx.lineTo(x + s * 0.4, y - s * 0.4);
          ctx.lineTo(x + s * 2, y);
          ctx.lineTo(x + s * 0.4, y + s * 0.4);
          ctx.lineTo(x, y + s * 2);
          ctx.lineTo(x - s * 0.4, y + s * 0.4);
          ctx.lineTo(x - s * 2, y);
          ctx.lineTo(x - s * 0.4, y - s * 0.4);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(x, y, 1.5 + p.s * 1.5, 1.5 + p.s * 1.5);
        }
      } else if (kind === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(x, y, 2 + p.s * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawLabels(ctx, cam) {
    const th = this.theme;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `100px ${TITLE}`;
    ctx.fillStyle = th.label;
    for (const s of this.course.sections) {
      if (s.name === 'FINISH') continue;
      const y = s.name === 'START' ? 420 : s.y0 + 60;
      if (y < cam - 120 || y > cam + H + 120) continue;
      ctx.fillText(s.name, W / 2, y);
    }
  }

  drawFinish(ctx, cam, now) {
    const c = this.course;
    const fy = c.finishY;
    if (fy + 700 < cam || fy - 300 > cam + H) return;
    const th = this.theme;
    // the catch bin
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(40, fy, 1000, c.binFloor - fy);
    // light beams
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    const beam = ctx.createLinearGradient(0, fy - 260, 0, fy);
    beam.addColorStop(0, 'rgba(255,255,255,0)');
    beam.addColorStop(1, `rgba(255,255,255,${0.12 + pulse * 0.08})`);
    ctx.fillStyle = beam;
    ctx.fillRect(40, fy - 260, 1000, 260);
    // checkered line
    const sq = 25;
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        ctx.fillRect(40 + i * sq, fy - sq + j * sq, sq, sq);
      }
    }
    text(ctx, 'FINISH', W / 2, fy - 90, { size: 96, color: th.accent, stroke: '#111', strokeWidth: 14 });
  }

  drawStatics(ctx, cam, now) {
    const th = this.theme;
    const frame = this.frame;
    const list = [];
    for (let b = Math.floor((cam - 60) / BUCKET); b <= Math.floor((cam + H + 60) / BUCKET); b++) {
      const arr = this.buckets.get(b);
      if (!arr) continue;
      for (const s of arr) {
        if (s._f === frame) continue;
        s._f = frame;
        list.push(s);
      }
    }
    if (!this.stripePattern) this.stripePattern = ctx.createPattern(this.stripes, 'repeat');
    // polygons first, then round things on top
    for (const s of list) {
      if (s.type !== 'poly') continue;
      this.drawPoly(ctx, s, th);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(40, cam - 100, 1000, H + 200);
    ctx.clip();
    for (const s of list) {
      if (s.type !== 'circle') continue;
      const fl = this.flash.get(s.id);
      const age = fl ? (now - fl) / 1000 : 9;
      if (s.kind === 'peg') {
        const sz = s.r * 5.2;
        ctx.drawImage(this.pegSprite, s.x - sz / 2, s.y - sz / 2, sz, sz);
        if (age < 0.35) {
          ctx.globalAlpha = 1 - age / 0.35;
          const fs = s.r * 7;
          ctx.drawImage(this.pegFlash, s.x - fs / 2, s.y - fs / 2, fs, fs);
          ctx.globalAlpha = 1;
        }
      } else if (s.kind === 'bumper') {
        const pop = age < 0.25 ? 1 + 0.18 * (1 - age / 0.25) : 1;
        const r = s.r * pop;
        if (age < 0.4) {
          ctx.globalAlpha = 1 - age / 0.4;
          ctx.drawImage(this.bumperGlow, s.x - r * 2.2, s.y - r * 2.2, r * 4.4, r * 4.4);
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = th.bumperRing;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = age < 0.15 ? '#ffffff' : th.bumper;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = th.bumperRing;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x - r * 0.3, s.y - r * 0.32, r * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
      } else {
        // bumps on the walls
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = age < 0.2 ? '#ffffff' : th.bump;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawPoly(ctx, s, th) {
    const k = s.kind;
    polyPath(ctx, s.pts);
    if (k === 'ramp' || k === 'ice') {
      const style = k === 'ice' ? 'ice' : th.rampStyle;
      if (style === 'candy') ctx.fillStyle = this.stripePattern;
      else if (style === 'ice') ctx.fillStyle = 'rgba(200,240,255,0.75)';
      else ctx.fillStyle = th.ramp;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      if (s._top) {
        const [a, b] = s._top;
        ctx.lineCap = 'round';
        if (style === 'neon' || style === 'lava') {
          ctx.strokeStyle = rgba(th.rampEdge, 0.35);
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
        ctx.strokeStyle = th.rampEdge;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      return;
    }
    if (k === 'diamond') {
      const cx = (s.pts[0][0] + s.pts[2][0]) / 2;
      const cy = (s.pts[1][1] + s.pts[3][1]) / 2;
      ctx.fillStyle = th.bump;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.pts[0][0], s.pts[0][1]);
      ctx.lineTo(s.pts[1][0], s.pts[1][1]);
      ctx.lineTo(cx, cy);
      ctx.lineTo(s.pts[3][0], s.pts[3][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
      polyPath(ctx, s.pts);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      return;
    }
    if (k === 'wall') ctx.fillStyle = th.wall;
    else if (k === 'sling') ctx.fillStyle = th.bumper;
    else ctx.fillStyle = th.funnel;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = k === 'wall' ? th.wallEdge : 'rgba(255,255,255,0.45)';
    ctx.stroke();
  }

  drawWalls(ctx, cam, th) {
    const top = Math.max(-80, cam - 20);
    const bottom = Math.min(this.course.binFloor + 80, cam + H + 20);
    if (bottom <= top) return;
    ctx.fillStyle = th.wall;
    ctx.fillRect(0, top, 40, bottom - top);
    ctx.fillRect(1040, top, 40, bottom - top);
    ctx.fillStyle = rgba(th.wallEdge, 0.25);
    ctx.fillRect(34, top, 10, bottom - top);
    ctx.fillRect(1036, top, 10, bottom - top);
    ctx.fillStyle = th.wallEdge;
    ctx.fillRect(37, top, 4, bottom - top);
    ctx.fillRect(1039, top, 4, bottom - top);
  }

  drawKinematics(ctx, snap, scale, cam) {
    for (const [id, tr] of snap.kins) {
      const k = this.kinDefs.get(id);
      if (!k) continue;
      const c = Math.cos(tr.a);
      const s = Math.sin(tr.a);
      ctx.setTransform(scale * c, scale * s, -scale * s, scale * c, tr.x * scale, (tr.y - cam) * scale);
      ctx.drawImage(k.sprite.canvas, -k.sprite.ox, -k.sprite.oy);
    }
    ctx.setTransform(scale, 0, 0, scale, 0, -cam * scale);
  }

  drawMarbles(ctx, snap, scale, cam, now) {
    const R = this.radius;
    const sh = this.sharedSprites();
    const t = now / 1000;
    const racing = this.phase === 'race' || this.phase === 'results';
    const rankOf = new Map();
    if (racing) this.rank.slice(0, 3).forEach((slot, i) => rankOf.set(slot, i));
    const visible = [];
    for (const [slot, m] of snap.marbles) {
      if (m.y < cam - 80 || m.y > cam + H + 80) {
        this.trails.delete(slot);
        continue;
      }
      visible.push([slot, m]);
    }
    // shadows
    const ss = R * 2.6;
    for (const [, m] of visible) ctx.drawImage(sh.shadow, m.x - ss / 2 + 4, m.y - ss / 2 + 7, ss, ss);
    // boost trails + vip glow (additive)
    ctx.globalCompositeOperation = 'lighter';
    for (const [slot, m] of visible) {
      const boosted = m.flags & 1;
      let tr = this.trails.get(slot);
      if (boosted) {
        if (!tr) {
          tr = [];
          this.trails.set(slot, tr);
        }
        tr.push(m.x, m.y);
        if (tr.length > 24) tr.splice(0, 2);
        for (let i = 0; i < tr.length; i += 2) {
          const f = (i / tr.length) * 0.9 + 0.1;
          const s = R * 2.4 * f;
          ctx.globalAlpha = f * 0.8;
          ctx.drawImage(sh.boost, tr[i] - s / 2, tr[i + 1] - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      } else if (tr) {
        this.trails.delete(slot);
      }
      if (m.flags & 2) {
        const s = R * 4 * (1 + 0.08 * Math.sin(t * 6 + slot));
        ctx.globalAlpha = 0.75;
        ctx.drawImage(sh.vip, m.x - s / 2, m.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // the marbles themselves
    const d = sh.size / SS;
    for (const [slot, m] of visible) {
      const p = this.players.get(slot);
      if (!p) continue;
      const spr = this.marbleSprite(p);
      const c = Math.cos(m.a);
      const s = Math.sin(m.a);
      ctx.setTransform(scale * c, scale * s, -scale * s, scale * c, m.x * scale, (m.y - cam) * scale);
      ctx.drawImage(spr, -d / 2, -d / 2, d, d);
    }
    ctx.setTransform(scale, 0, 0, scale, 0, -cam * scale);
    for (const [slot, m] of visible) {
      ctx.drawImage(sh.hl, m.x - d / 2, m.y - d / 2, d, d);
    }
    // crowns, rank badges, names
    for (const [slot, m] of visible) {
      const p = this.players.get(slot);
      if (!p) continue;
      let top = m.y - R - 6;
      if (m.flags & 8) {
        crown(ctx, m.x, top - 10, 30);
        top -= 26;
      }
      const ri = rankOf.get(slot);
      if (ri != null) {
        const colors = ['#ffd23f', '#d6dde6', '#e08a4b'];
        const bx = m.x + R * 0.78;
        const by = m.y - R * 0.78;
        ctx.beginPath();
        ctx.arc(bx, by, 14, 0, Math.PI * 2);
        ctx.fillStyle = colors[ri];
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#1a1a1a';
        ctx.stroke();
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `20px ${TITLE}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ri + 1), bx, by + 2);
      }
      if (this.showNames) {
        text(ctx, p.name, m.x, top - 8, {
          size: 22, font: BODY, weight: '600', stroke: 'rgba(0,0,0,0.85)', strokeWidth: 5, shadow: false, maxWidth: 160,
        });
      }
    }
  }
}
