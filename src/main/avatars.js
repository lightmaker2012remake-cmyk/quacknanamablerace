'use strict';

// Profile pictures for the marbles. Real viewers' pictures are downloaded once from
// YouTube and kept in memory; CPU ducks get a drawn duck face.

const { hashString } = require('../game/rng');

const ALLOWED = /^https:\/\/(yt\d+\.ggpht\.com|yt\d+\.googleusercontent\.com|lh\d+\.googleusercontent\.com)\//;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function duckSvg(id) {
  const h = hashString(id);
  const hue = h % 360;
  const hat = (h >>> 9) % 5;
  let extra = '';
  if (hat === 1) {
    // party hat
    extra = `<path d="M50 34 L66 4 L82 34 Z" fill="hsl(${(hue + 180) % 360},80%,60%)"/><circle cx="66" cy="5" r="5" fill="#fff"/>`;
  } else if (hat === 2) {
    // sunglasses
    extra = '<rect x="38" y="52" width="24" height="14" rx="5" fill="#111"/><rect x="70" y="52" width="24" height="14" rx="5" fill="#111"/><rect x="60" y="56" width="12" height="4" fill="#111"/>';
  } else if (hat === 3) {
    // bow
    extra = `<path d="M84 28 l16 -10 v20 z M84 28 l-16 -10 v20 z" fill="hsl(${(hue + 150) % 360},85%,62%)"/><circle cx="84" cy="28" r="5" fill="hsl(${(hue + 150) % 360},85%,45%)"/>`;
  } else if (hat === 4) {
    // cap
    extra = `<path d="M34 42 q32 -30 64 0 z" fill="hsl(${(hue + 200) % 360},70%,50%)"/><rect x="62" y="38" width="44" height="8" rx="4" fill="hsl(${(hue + 200) % 360},70%,40%)"/>`;
  }
  const eyes = hat === 2 ? '' : '<circle cx="52" cy="60" r="7" fill="#222"/><circle cx="54.5" cy="57.5" r="2.5" fill="#fff"/><circle cx="80" cy="60" r="7" fill="#222"/><circle cx="82.5" cy="57.5" r="2.5" fill="#fff"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="hsl(${hue},70%,55%)"/><circle cx="64" cy="128" r="60" fill="hsl(${hue},70%,45%)"/><circle cx="66" cy="68" r="40" fill="#ffd84d"/><path d="M60 30 q2 -14 10 -4 q4 -10 9 0" stroke="#ffd84d" stroke-width="6" fill="none" stroke-linecap="round"/>${eyes}<ellipse cx="68" cy="80" rx="19" ry="9" fill="#ff8a1f"/><path d="M50 80 q18 9 36 0" stroke="#d96b00" stroke-width="2.5" fill="none"/>${extra}</svg>`;
}

function initialsSvg(id, name) {
  const hue = hashString(id) % 360;
  const letter = esc((String(name || '?').replace(/^@/, '').trim()[0] || '?').toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="hsl(${hue},65%,50%)"/><text x="64" y="86" font-family="Arial, sans-serif" font-weight="bold" font-size="64" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
}

class Avatars {
  constructor({ fetch, getSource, getName }) {
    this.fetchImpl = fetch || globalThis.fetch;
    this.getSource = getSource;
    this.getName = getName || (() => '');
    this.cache = new Map(); // id -> { type, body }
    this.inflight = new Map();
  }

  async get(id) {
    if (id.startsWith('bot-')) return { type: 'image/svg+xml', body: Buffer.from(duckSvg(id)) };
    const hit = this.cache.get(id);
    if (hit) return hit;
    if (this.inflight.has(id)) return this.inflight.get(id);
    const job = this.load(id).finally(() => this.inflight.delete(id));
    this.inflight.set(id, job);
    return job;
  }

  async load(id) {
    const src = this.getSource(id);
    if (src && ALLOWED.test(src)) {
      try {
        const res = await this.fetchImpl(src);
        if (res.ok) {
          const body = Buffer.from(await res.arrayBuffer());
          const type = res.headers.get('content-type') || 'image/jpeg';
          if (body.length > 0 && body.length < 2e6 && type.startsWith('image/')) {
            const item = { type, body };
            this.cache.set(id, item);
            if (this.cache.size > 800) this.cache.delete(this.cache.keys().next().value);
            return item;
          }
        }
      } catch (e) {
        // fall through to the letter picture
      }
    }
    return { type: 'image/svg+xml', body: Buffer.from(initialsSvg(id, this.getName(id))), temporary: true };
  }
}

module.exports = { Avatars, duckSvg, initialsSvg };
