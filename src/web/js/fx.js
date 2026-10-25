// Particles, pop-up banners and the join feed.

import { text, heart, star, circleImage, roundRect, TITLE, BODY } from './gfx.js';

const W = 1080;
const H = 1920;
const CONFETTI = ['#ff5c8a', '#ffd23f', '#4fc3f7', '#7bc96f', '#c084fc', '#ff8c42', '#ffffff'];

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export class Fx {
  constructor() {
    this.world = []; // particles in course coordinates
    this.screen = []; // particles in screen coordinates
    this.banners = [];
    this.toasts = [];
    this.shakeT = 0;
    this.shakeAmp = 0;
  }

  add(list, p) {
    if (list.length > 1600) list.shift();
    list.push(p);
  }

  sparks(x, y, n, color = '#fff6c2', speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add(this.world, { kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 400, life: 0, max: 0.4 + Math.random() * 0.4, size: 3 + Math.random() * 4, color });
    }
  }

  hearts(x, y, n, list = this.world) {
    for (let i = 0; i < n; i++) {
      this.add(list, {
        kind: 'heart', x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 200, g: -40, life: 0,
        max: 1.2 + Math.random() * 0.8, size: 22 + Math.random() * 22, color: Math.random() < 0.8 ? '#ff3b6b' : '#ff8fb1',
      });
    }
  }

  confetti(x, y, n, list = this.world, up = 900) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = up * (0.4 + Math.random() * 0.7);
      this.add(list, {
        kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, drag: 1.6, life: 0,
        max: 2.2 + Math.random() * 1.6, size: 10 + Math.random() * 10, color: CONFETTI[i % CONFETTI.length],
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, ph: Math.random() * 6,
      });
    }
  }

  confettiRain(n) {
    for (let i = 0; i < n; i++) {
      this.add(this.screen, {
        kind: 'confetti', x: Math.random() * W, y: -40 - Math.random() * 900, vx: (Math.random() - 0.5) * 120,
        vy: 160 + Math.random() * 260, g: 60, drag: 0, life: 0, max: 7, size: 12 + Math.random() * 12,
        color: CONFETTI[i % CONFETTI.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, ph: Math.random() * 6,
      });
    }
  }

  heartRain(n) {
    for (let i = 0; i < n; i++) {
      this.add(this.screen, {
        kind: 'heart', x: Math.random() * W, y: H + 40 + Math.random() * 500, vx: (Math.random() - 0.5) * 60,
        vy: -260 - Math.random() * 300, g: 0, life: 0, max: 6, size: 30 + Math.random() * 40, color: Math.random() < 0.7 ? '#ff3b6b' : '#ff8fb1',
      });
    }
  }

  goldRain(n) {
    for (let i = 0; i < n; i++) {
      this.add(this.screen, {
        kind: 'star', x: Math.random() * W, y: -40 - Math.random() * 700, vx: (Math.random() - 0.5) * 80,
        vy: 240 + Math.random() * 300, g: 80, life: 0, max: 6, size: 14 + Math.random() * 18, color: '#ffd23f',
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6,
      });
    }
  }

  ring(x, y, color = '#ffffff', size = 60) {
    this.add(this.world, { kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0, max: 0.6, size, color });
  }

  stars(x, y, n, color = '#ffd23f') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 260;
      this.add(this.world, {
        kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 200, life: 0, max: 0.7 + Math.random() * 0.6,
        size: 10 + Math.random() * 12, color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
      });
    }
  }

  shake(amp, dur = 0.4) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const a = this.shakeAmp * Math.min(1, this.shakeT * 3);
    return [(Math.random() - 0.5) * a * 2, (Math.random() - 0.5) * a * 2];
  }

  // big centre text: { text, sub, color, size, dur, y, priority }
  banner(b) {
    const item = Object.assign({ color: '#ffd23f', size: 120, dur: 1.8, y: 820, age: 0 }, b);
    if (b.priority) this.banners = this.banners.filter((x) => !x.priority);
    if (this.banners.length > 4) this.banners.splice(1, this.banners.length - 4);
    this.banners.push(item);
  }

  toast(t) {
    this.toasts.push(Object.assign({ age: 0, color: '#ffffff' }, t));
    if (this.toasts.length > 6) this.toasts.shift();
  }

  update(dt) {
    for (const list of [this.world, this.screen]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += dt;
        if (p.life >= p.max) {
          list.splice(i, 1);
          continue;
        }
        if (p.drag) {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
    }
    if (this.shakeT > 0) this.shakeT -= dt;
    else this.shakeAmp = 0;
    // banners play one after another (priority ones jump the queue)
    if (this.banners.length) {
      const pri = this.banners.findIndex((b) => b.priority);
      if (pri > 0) this.banners.unshift(this.banners.splice(pri, 1)[0]);
      const b = this.banners[0];
      b.age += dt;
      if (b.age >= b.dur) this.banners.shift();
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].age += dt;
      if (this.toasts[i].age > 5) this.toasts.splice(i, 1);
    }
  }

  drawParticles(ctx, list) {
    for (const p of list) {
      const f = p.life / p.max;
      const alpha = f > 0.7 ? (1 - f) / 0.3 : 1;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - f * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'heart') {
        ctx.globalAlpha = alpha;
        heart(ctx, p.x, p.y, p.size, p.color);
      } else if (p.kind === 'confetti') {
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(Math.cos(p.life * 8 + p.ph), 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6 * (1 - f) + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + f * 1.4), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.globalAlpha = alpha;
        star(ctx, p.x, p.y, p.size, p.color, p.rot);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawWorld(ctx) {
    this.drawParticles(ctx, this.world);
  }

  drawScreen(ctx, images) {
    this.drawParticles(ctx, this.screen);
    // banner
    const b = this.banners[0];
    if (b) {
      const k = Math.min(1, b.age / 0.28);
      const s = Math.max(0.01, easeOutBack(k));
      const fade = b.age > b.dur - 0.3 ? Math.max(0, (b.dur - b.age) / 0.3) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(W / 2, b.y);
      ctx.scale(s, s);
      if (b.icon && images) {
        const img = images(b.icon);
        circleImage(ctx, img, 0, -b.size * 1.05, b.size * 0.55, '#fff', 6);
      }
      text(ctx, b.text, 0, 0, { size: b.size, color: b.color, stroke: '#1a1030', strokeWidth: b.size * 0.16, maxWidth: 1000 });
      if (b.sub) text(ctx, b.sub, 0, b.size * 0.78, { size: b.size * 0.36, font: BODY, weight: '700', color: '#ffffff', stroke: '#1a1030', strokeWidth: 8, maxWidth: 980 });
      ctx.restore();
    }
    // join feed (bottom-left during races, top-left in the lobby)
    const top = !!this.toastTop;
    let y = top ? 236 : 1660;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      const slide = Math.min(1, t.age / 0.25);
      const fade = t.age > 4.5 ? Math.max(0, (5 - t.age) / 0.5) : 1;
      const x = 24 - (1 - slide) * 420;
      ctx.globalAlpha = fade;
      ctx.font = `600 30px ${BODY}`;
      const label = t.text.length > 34 ? t.text.slice(0, 33) + '…' : t.text;
      const w = Math.min(760, ctx.measureText(label).width + 100);
      roundRect(ctx, x, y - 30, w, 60, 30);
      ctx.fillStyle = 'rgba(10,10,25,0.72)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = t.color;
      ctx.stroke();
      if (t.avatar && images) circleImage(ctx, images(t.avatar), x + 32, y, 22, t.color, 3);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 64, y + 1);
      ctx.globalAlpha = 1;
      y += top ? 70 : -70;
    }
  }
}
