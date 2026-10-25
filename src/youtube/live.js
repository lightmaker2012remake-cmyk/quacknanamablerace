'use strict';

// Reads a YouTube live chat with no API key, the same way the YouTube website does
// (the "innertube" endpoints). Also polls the stream's like count, viewer count and
// the channel's subscriber count.
//
// events:
//   'status' { state: 'off'|'connecting'|'waiting'|'connected'|'error', message, title, videoId }
//   'chat'   { id, kind: 'text'|'superchat'|'sticker'|'member'|'gift', text, amount, author }
//   'stats'  { likes?, viewers?, subs? }

const EventEmitter = require('events');

const API = 'https://www.youtube.com/youtubei/v1/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const CLIENT = { clientName: 'WEB', clientVersion: '2.20260918.01.00', hl: 'en', gl: 'US' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function textOf(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (t.simpleText != null) return t.simpleText;
  if (t.content != null) return t.content;
  if (Array.isArray(t.runs)) {
    return t.runs
      .map((r) => {
        if (r.text != null) return r.text;
        if (r.emoji) return (r.emoji.shortcuts && r.emoji.shortcuts[0]) || (r.emoji.emojiId || '');
        return '';
      })
      .join('');
  }
  return '';
}

// depth-first search for the first value stored under `key`
function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 40) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const k in obj) {
    const v = obj[k];
    if (v && typeof v === 'object') {
      const r = findKey(v, key, depth + 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function parseCount(s) {
  if (s == null) return null;
  const m = /([\d][\d.,]*)\s*([KMB])?/i.exec(String(s));
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

function bigAvatar(url) {
  if (!url) return null;
  let u = url.startsWith('//') ? 'https:' + url : url;
  u = u.replace(/=s\d+(-|$)/, '=s240$1');
  return u;
}

function videoIdFromUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1, 12) || null;
    if (!host.endsWith('youtube.com')) return null;
    if (url.searchParams.get('v')) return url.searchParams.get('v').slice(0, 11);
    const m = /^\/(live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    return m ? m[2] : null;
  } catch (e) {
    return null;
  }
}

class YouTubeLive extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.fetchImpl = opts.fetch || globalThis.fetch;
    this.runId = 0;
    this.status = { state: 'off', message: 'Not connected', title: '', videoId: '' };
    this.seen = new Set();
    this.seenOrder = [];
  }

  setStatus(state, message, extra = {}) {
    this.status = Object.assign({ state, message, title: '', videoId: '' }, extra);
    this.emit('status', this.status);
  }

  connect(target) {
    this.disconnect(true);
    const t = String(target || '').trim();
    if (!t) {
      this.setStatus('off', 'Type your channel @handle or live link first');
      return;
    }
    this.target = t;
    const run = ++this.runId;
    this.loop(run).catch((e) => this.setStatus('error', e.message));
  }

  disconnect(silent) {
    this.runId++;
    clearInterval(this.likeTimer);
    clearInterval(this.subTimer);
    if (!silent) this.setStatus('off', 'Not connected');
  }

  alive(run) {
    return run === this.runId;
  }

  async post(path, body) {
    const res = await this.fetchImpl(API + path + '?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Youtube-Client-Name': '1',
        'X-Youtube-Client-Version': CLIENT.clientVersion,
        Origin: 'https://www.youtube.com',
        Referer: 'https://www.youtube.com/',
      },
      body: JSON.stringify(Object.assign({ context: { client: CLIENT } }, body)),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('YouTube answered ' + res.status);
    return res.json();
  }

  async loop(run) {
    while (this.alive(run)) {
      try {
        this.setStatus('connecting', 'Looking for the live stream...');
        const videoId = await this.resolveVideo(this.target);
        if (!this.alive(run)) return;
        if (!videoId) {
          this.setStatus('waiting', 'Not live right now. Checking again in 20 seconds...');
          await sleep(20000);
          continue;
        }
        const info = await this.videoInfo(videoId);
        if (!this.alive(run)) return;
        if (!info.chat) {
          this.setStatus('waiting', `"${info.title || videoId}" has no live chat yet. Checking again in 20 seconds...`, {
            title: info.title, videoId,
          });
          await sleep(20000);
          continue;
        }
        this.setStatus('connected', 'Reading live chat', { title: info.title, videoId });
        this.startStats(run, videoId, info);
        await this.chatLoop(run, info.chat);
        if (!this.alive(run)) return;
        clearInterval(this.likeTimer);
        clearInterval(this.subTimer);
        this.setStatus('waiting', 'The live chat ended. Looking for a new stream in 15 seconds...');
        await sleep(15000);
      } catch (e) {
        if (!this.alive(run)) return;
        this.setStatus('error', `${e.message || e}. Retrying in 15 seconds...`);
        await sleep(15000);
      }
    }
  }

  // @handle, channel link, channel id, live link or video id -> current live video id
  async resolveVideo(target) {
    let t = target.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
    if (/^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(t)) {
      if (!/^https?:/i.test(t)) t = 'https://' + t;
      const id = videoIdFromUrl(t);
      if (id) return id;
      const url = new URL(t);
      const m = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/.exec(url.pathname);
      if (!m) throw new Error('That link is not a channel or a live stream');
      return this.liveFor('https://www.youtube.com/' + m[1] + '/live');
    }
    if (/^UC[A-Za-z0-9_-]{22}$/.test(t)) return this.liveFor('https://www.youtube.com/channel/' + t + '/live');
    if (!t.startsWith('@')) t = '@' + t;
    return this.liveFor('https://www.youtube.com/' + encodeURI(t) + '/live');
  }

  async liveFor(url) {
    const r = await this.post('navigation/resolve_url', { url });
    if (!r) throw new Error('Channel not found - check the @handle');
    const ep = r.endpoint || {};
    if (ep.watchEndpoint && ep.watchEndpoint.videoId) return ep.watchEndpoint.videoId;
    return null; // resolves to the channel page: not live
  }

  async videoInfo(videoId) {
    const d = await this.post('next', { videoId });
    if (!d) throw new Error('Video not found');
    const lcr = findKey(d, 'liveChatRenderer');
    let chat = null;
    if (lcr && Array.isArray(lcr.continuations)) {
      for (const c of lcr.continuations) {
        const cd = c.reloadContinuationData || c.invalidationContinuationData || c.timedContinuationData;
        if (cd && cd.continuation) {
          chat = cd.continuation;
          break;
        }
      }
    }
    const primary = findKey(d, 'videoPrimaryInfoRenderer') || {};
    const owner = findKey(d, 'videoOwnerRenderer') || {};
    return {
      chat,
      title: textOf(primary.title),
      channel: textOf(owner.title),
      subs: parseCount(textOf(owner.subscriberCountText)),
    };
  }

  startStats(run, videoId, info) {
    if (info.subs != null) this.emit('stats', { subs: info.subs });
    const likes = async () => {
      try {
        const d = await this.post('updated_metadata', { videoId });
        if (!this.alive(run) || !d) return;
        const ent = findKey(d, 'likeCountEntity');
        const out = {};
        if (ent) {
          const n = parseInt(ent.likeCountIfIndifferentNumber || ent.likeCountIfDislikedNumber, 10);
          if (Number.isFinite(n)) out.likes = n;
        }
        const views = findKey(d, 'videoViewCountRenderer');
        if (views && views.originalViewCount != null) out.viewers = parseInt(views.originalViewCount, 10) || 0;
        if (Object.keys(out).length) this.emit('stats', out);
      } catch (e) {
        // stats are a bonus; chat keeps working without them
      }
    };
    const subs = async () => {
      try {
        const i = await this.videoInfo(videoId);
        if (this.alive(run) && i.subs != null) this.emit('stats', { subs: i.subs });
      } catch (e) {
        // ignore
      }
    };
    likes();
    this.likeTimer = setInterval(likes, 8000);
    this.subTimer = setInterval(subs, 45000);
  }

  async chatLoop(run, continuation) {
    let cont = continuation;
    let switched = false;
    const since = Date.now() * 1000 - 20e6; // ignore chat from before we connected (20s grace)
    let errors = 0;
    while (this.alive(run)) {
      let d;
      try {
        d = await this.post('live_chat/get_live_chat', { continuation: cont });
        errors = 0;
      } catch (e) {
        if (++errors >= 5) throw e;
        await sleep(2000 * errors);
        continue;
      }
      if (!this.alive(run)) return;
      const lcc = d && d.continuationContents && d.continuationContents.liveChatContinuation;
      if (!lcc) return;
      if (!switched) {
        // switch from "Top chat" to "Live chat" so no messages get filtered out
        switched = true;
        const items = findKey(lcc.header, 'subMenuItems');
        const live = items && items[1] && findKey(items[1], 'continuation');
        if (live && live.continuation) {
          cont = live.continuation;
          continue;
        }
      }
      let got = 0;
      for (const a of lcc.actions || []) got += this.handleAction(a, since);
      const c = (lcc.continuations || [])[0] || {};
      const cd = c.invalidationContinuationData || c.timedContinuationData || c.reloadContinuationData;
      if (!cd || !cd.continuation) return; // stream over
      cont = cd.continuation;
      await sleep(got ? 1000 : 1800);
    }
  }

  handleAction(a, since) {
    const item = a.addChatItemAction && a.addChatItemAction.item;
    if (!item) return 0;
    const key = Object.keys(item)[0];
    const r = item[key];
    if (!r) return 0;
    const id = r.id || '';
    if (id) {
      if (this.seen.has(id)) return 0;
      this.seen.add(id);
      this.seenOrder.push(id);
      if (this.seenOrder.length > 2000) this.seen.delete(this.seenOrder.shift());
    }
    if (r.timestampUsec && Number(r.timestampUsec) < since) return 0;
    let kind;
    let amount = '';
    let author;
    let text = '';
    switch (key) {
      case 'liveChatTextMessageRenderer':
        kind = 'text';
        author = this.author(r);
        text = textOf(r.message);
        break;
      case 'liveChatPaidMessageRenderer':
        kind = 'superchat';
        author = this.author(r);
        amount = textOf(r.purchaseAmountText);
        text = textOf(r.message);
        break;
      case 'liveChatPaidStickerRenderer':
        kind = 'sticker';
        author = this.author(r);
        amount = textOf(r.purchaseAmountText);
        break;
      case 'liveChatMembershipItemRenderer':
        kind = 'member';
        author = this.author(r);
        text = textOf(r.headerSubtext) || textOf(r.message);
        break;
      case 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer': {
        kind = 'gift';
        const h = findKey(r, 'liveChatSponsorshipsHeaderRenderer') || r;
        author = this.author(Object.assign({ authorExternalChannelId: r.authorExternalChannelId }, h));
        text = textOf(h.primaryText);
        break;
      }
      case 'giftMessageViewModel': {
        kind = 'gift';
        const name = textOf(r.authorName).trim();
        const src = findKey(r.authorAvatar, 'sources');
        author = {
          id: 'name:' + name, name, avatar: bigAvatar(src && src.length ? src[src.length - 1].url : null),
          isOwner: false, isMod: false, isMember: false,
        };
        text = textOf(r.text);
        break;
      }
      default:
        return 0;
    }
    this.emit('chat', { id, kind, text, amount, author });
    return 1;
  }

  author(r) {
    const name = textOf(r.authorName).trim() || 'Viewer';
    const thumbs = (r.authorPhoto && r.authorPhoto.thumbnails) || [];
    const badges = (r.authorBadges || []).map((b) => b.liveChatAuthorBadgeRenderer || {});
    const icon = (b) => (b.icon && b.icon.iconType) || '';
    return {
      id: r.authorExternalChannelId || 'name:' + name,
      name,
      avatar: bigAvatar(thumbs.length ? thumbs[thumbs.length - 1].url : null),
      isOwner: badges.some((b) => icon(b) === 'OWNER'),
      isMod: badges.some((b) => icon(b) === 'MODERATOR'),
      isMember: badges.some((b) => !!b.customThumbnail),
    };
  }
}

module.exports = { YouTubeLive, parseCount, videoIdFromUrl, textOf };
