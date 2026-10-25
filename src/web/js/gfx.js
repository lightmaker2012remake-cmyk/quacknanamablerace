// Small drawing helpers shared by the world, the HUD and the effects.

export const TITLE = '"Luckiest Guy", "Arial Black", Impact, sans-serif';
export const BODY = 'Fredoka, "Segoe UI", Arial, sans-serif';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

// outlined cartoon text
export function text(ctx, str, x, y, o = {}) {
  const size = o.size || 40;
  ctx.font = `${o.weight || ''} ${size}px ${o.font || TITLE}`.trim();
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.baseline || 'middle';
  let s = String(str);
  if (o.maxWidth) s = fitText(ctx, s, o.maxWidth);
  if (o.shadow !== false && o.shadowColor !== null) {
    ctx.fillStyle = o.shadowColor || 'rgba(0,0,0,0.35)';
    ctx.fillText(s, x + (o.shadowX ?? size * 0.05), y + (o.shadowY ?? size * 0.08));
  }
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeWidth || size * 0.18;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

export function circleImage(ctx, img, x, y, r, ring, ringWidth = 4) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  if (img && (img.complete === undefined || img.complete) && (img.naturalWidth || img.width)) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#556';
    ctx.fill();
  }
  if (ring) {
    ctx.lineWidth = ringWidth;
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
  ctx.restore();
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- icons (all drawn, no emoji fonts needed)

export function heart(ctx, x, y, s, color = '#ff3b6b') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-18, 0, -18, -16, -8, -16);
  ctx.bezierCurveTo(-3, -16, 0, -12, 0, -9);
  ctx.bezierCurveTo(0, -12, 3, -16, 8, -16);
  ctx.bezierCurveTo(18, -16, 18, 0, 0, 12);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-8, -9, 4, 2.6, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function bell(ctx, x, y, s, color = '#ffd23f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-11, 8);
  ctx.quadraticCurveTo(-11, -14, 0, -14);
  ctx.quadraticCurveTo(11, -14, 11, 8);
  ctx.lineTo(14, 11);
  ctx.lineTo(-14, 11);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -15, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function crown(ctx, x, y, s, color = '#ffd23f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.beginPath();
  ctx.moveTo(-15, 9);
  ctx.lineTo(-17, -8);
  ctx.lineTo(-8, 0);
  ctx.lineTo(0, -13);
  ctx.lineTo(8, 0);
  ctx.lineTo(17, -8);
  ctx.lineTo(15, 9);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath();
  ctx.arc(0, 3, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4dd9ff';
  ctx.beginPath();
  ctx.arc(-9, 5, 2, 0, Math.PI * 2);
  ctx.arc(9, 5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function person(ctx, x, y, s, color = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -7, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-13, 14);
  ctx.quadraticCurveTo(-13, 2, 0, 2);
  ctx.quadraticCurveTo(13, 2, 13, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function trophy(ctx, x, y, s, color = '#ffd23f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -14);
  ctx.lineTo(10, -14);
  ctx.quadraticCurveTo(10, 4, 0, 5);
  ctx.quadraticCurveTo(-10, 4, -10, -14);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-10, -7, 5, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(10, -7, 5, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
  ctx.fillRect(-2.5, 4, 5, 6);
  ctx.fillRect(-8, 10, 16, 4);
  ctx.restore();
}

// QuackNana duck mascot
export function duck(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 64, s / 64);
  // body
  ctx.fillStyle = '#ffcf33';
  ctx.beginPath();
  ctx.ellipse(-2, 14, 26, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(-26, 8);
  ctx.lineTo(-34, -2);
  ctx.lineTo(-22, 2);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(10, -10, 16, 0, Math.PI * 2);
  ctx.fill();
  // wing
  ctx.fillStyle = '#f2b400';
  ctx.beginPath();
  ctx.ellipse(-6, 14, 13, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath();
  ctx.ellipse(27, -6, 10, 5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // eye
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(14, -14, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(15.2, -15.2, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function lightenHsl(color, amount) {
  return color.replace(/(\d+)%\)$/, (m, l) => `${Math.min(95, Number(l) + amount)}%)`);
}

export function star(ctx, x, y, s, color = '#ffd23f', rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.22 : s * 0.5;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
