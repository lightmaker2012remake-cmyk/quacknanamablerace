'use strict';

// Course building blocks. All numbers are in screen pixels (the world is 1080 wide).
// Gaps are kept either wider than ~70px (a 28px-radius marble passes) or smaller than ~20px
// (nothing fits) so marbles never wedge themselves in a gap that is "almost" big enough.

const { mulberry32 } = require('./rng');

const W = 1080;
const WL = 40; // inner edge of the left wall
const WR = 1040; // inner edge of the right wall
const MID = 540;
const DEG = Math.PI / 180;

function rectPts(w, h, cx = 0, cy = 0, ang = 0) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

function barPts(x1, y1, x2, y2, thick) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  return rectPts(len, thick, (x1 + x2) / 2, (y1 + y2) / 2, ang);
}

class CourseBuilder {
  constructor(seed) {
    this.rng = mulberry32(seed);
    this.statics = [];
    this.kinematics = [];
    this.sections = [];
    this.respawns = [];
    this.finishY = 0;
    this.binFloor = 0;
  }

  r(min, max) {
    return min + (max - min) * this.rng();
  }

  circle(x, y, r, kind, extra) {
    const s = Object.assign({ type: 'circle', x, y, r, kind }, extra);
    s.id = this.statics.length;
    this.statics.push(s);
    return s;
  }

  poly(pts, kind, extra) {
    const s = Object.assign({ type: 'poly', pts, kind }, extra);
    s.id = this.statics.length;
    this.statics.push(s);
    return s;
  }

  bar(x1, y1, x2, y2, thick, kind, extra) {
    return this.poly(barPts(x1, y1, x2, y2, thick), kind, extra);
  }

  box(cx, cy, w, h, ang, kind, extra) {
    return this.poly(rectPts(w, h, cx, cy, ang), kind, extra);
  }

  kin(def) {
    def.id = this.kinematics.length;
    this.kinematics.push(def);
    return def;
  }

  section(name, y0, y1) {
    this.sections.push({ name, y0, y1 });
  }

  respawnRow(y) {
    for (const x of [300, 540, 780]) this.respawns.push({ x, y });
  }
}

// ---------------------------------------------------------------- start pen
function pen(b) {
  const y1 = 820;
  b.box(MID, -40, W, 80, 0, 'wall'); // ceiling
  // two sliding doors that slide into the walls when the race starts
  b.kin({
    kind: 'gate', x: 290, y: y1, angle: 0, r: 260,
    motion: { type: 'gate', dx: -520 },
    shapes: [{ type: 'poly', pts: rectPts(500, 22) }],
  });
  b.kin({
    kind: 'gate', x: 790, y: y1, angle: 0, r: 260,
    motion: { type: 'gate', dx: 520 },
    shapes: [{ type: 'poly', pts: rectPts(500, 22) }],
  });
  b.penTop = 0;
  b.penBottom = y1 - 11;
  b.section('START', 0, y1);
  return y1 + 60;
}

// ---------------------------------------------------------------- pegs (plinko)
function pegs(b, y0, o = {}) {
  const sx = o.sx || 130;
  const sy = o.sy || 110;
  const pr = o.pr || 10;
  const rows = o.rows || 12;
  const kind = o.kind || 'peg';
  const top = y0 + 70;
  const countA = Math.floor((WR - WL - 190) / sx) + 1;
  for (let i = 0; i < rows; i++) {
    const y = top + i * sy;
    const n = i % 2 === 1 ? countA - 1 : countA;
    for (let k = 0; k < n; k++) {
      const x = MID + (k - (n - 1) / 2) * sx;
      b.circle(x, y, pr, kind);
    }
    // half-round bumps on the walls stop marbles from sliding straight down the sides
    const gap = MID - ((n - 1) / 2) * sx - pr - WL;
    const br = Math.min(46, gap - 80);
    if (br >= 12) {
      b.circle(WL, y, br, 'bump');
      b.circle(WR, y, br, 'bump');
    }
  }
  const y1 = top + (rows - 1) * sy + 90;
  b.section(o.name || 'PEG PLUNGE', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- zig-zag ramps
function zigzag(b, y0, o = {}) {
  const n = o.n || 5;
  const s = Math.tan((o.slope || 12) * DEG);
  const gap = o.gap || 160;
  const thick = 18;
  const kind = o.kind || 'ramp';
  const span = WR - WL - gap;
  const drop = span * s;
  const clearance = 130;
  let side = o.startRight ? 1 : 0;
  let y = y0 + 80; // height of the ramp's top surface where it meets the wall
  for (let i = 0; i < n; i++) {
    const x1 = side === 0 ? WL - 30 : WR + 30;
    const x2 = side === 0 ? WR - gap : WL + gap;
    const ya = y - 30 * s + thick / 2;
    const yb = y + span * s + thick / 2;
    b.bar(x1, ya, x2, yb, thick, kind);
    y = y + drop + thick + clearance - gap * s;
    side ^= 1;
  }
  const y1 = y + 40;
  b.section(o.name || 'ZIG ZAG', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- spinners
function spinnerShapes(style, arm, thick) {
  const shapes = [{ type: 'circle', x: 0, y: 0, r: 16 }];
  if (style === 'bar') {
    shapes.push({ type: 'poly', pts: barPts(-arm, 0, arm, 0, thick) });
  } else if (style === 'tri') {
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3;
      shapes.push({ type: 'poly', pts: barPts(0, 0, arm * Math.cos(a), arm * Math.sin(a), thick) });
    }
  } else {
    shapes.push({ type: 'poly', pts: barPts(-arm, 0, arm, 0, thick) });
    shapes.push({ type: 'poly', pts: barPts(0, -arm, 0, arm, thick) });
  }
  return shapes;
}

function spinners(b, y0, o = {}) {
  const rows = o.rows || 4;
  const arm = o.arm || 100;
  const speed = o.speed || 2.0;
  const style = o.style || 'cross';
  let y = y0 + 170;
  for (let i = 0; i < rows; i++) {
    const odd = i % 2 === 1;
    const xs = odd ? [395, 685] : [250, 540, 830];
    xs.forEach((x, j) => {
      const dir = (i + j) % 2 === 0 ? 1 : -1;
      b.kin({
        kind: o.kind || 'spinner', x, y, angle: b.rng() * Math.PI, r: arm, style,
        motion: { type: 'rotate', w: dir * speed * (0.85 + 0.3 * b.rng()) },
        shapes: spinnerShapes(style, arm, 14),
      });
    });
    if (odd) {
      b.poly([[WL - 5, y - 90], [WL + 95, y - 10], [WL - 5, y + 30]], 'deflector');
      b.poly([[WR + 5, y - 90], [WR - 95, y - 10], [WR + 5, y + 30]], 'deflector');
    }
    y += 235;
  }
  const y1 = y - 235 + 100 + 90;
  b.section(o.name || 'SPIN CITY', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- bumpers
function bumpers(b, y0, o = {}) {
  const rows = o.rows || 5;
  const r = o.r || 36;
  let y = y0 + 130;
  for (let i = 0; i < rows; i++) {
    const odd = i % 2 === 1;
    const xs = odd ? [280, 540, 800] : [150, 410, 670, 930];
    for (const x of xs) b.circle(x, y, r, o.kind || 'bumper', { kick: o.kick || 620 });
    if (odd) {
      b.poly([[WL - 5, y - 80], [WL + 80, y], [WL - 5, y + 80]], 'sling', { kick: 420 });
      b.poly([[WR + 5, y - 80], [WR - 80, y], [WR + 5, y + 80]], 'sling', { kick: 420 });
    }
    y += 200;
  }
  const y1 = y - 200 + r + 90;
  b.section(o.name || 'BUMPER BASH', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- funnel
function funnel(b, y0, o = {}) {
  const opening = o.opening || 240;
  const depth = o.depth || 330;
  const xL = MID - opening / 2;
  const xR = MID + opening / 2;
  b.bar(WL - 30, y0 + 40, xL, y0 + 40 + depth, 20, 'funnel');
  b.bar(WR + 30, y0 + 40, xR, y0 + 40 + depth, 20, 'funnel');
  const ay = y0 + 40 + depth + 115;
  b.kin({
    kind: 'spinner', x: MID, y: ay, angle: 0, r: 62, style: 'cross',
    motion: { type: 'rotate', w: (b.rng() < 0.5 ? -1 : 1) * 2.6 },
    shapes: spinnerShapes('cross', 62, 14),
  });
  const y1 = ay + 62 + 90;
  b.section(o.name || 'THE SQUEEZE', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- moving platforms
function sliders(b, y0, o = {}) {
  const layers = o.layers || 4;
  const width = o.width || 330;
  const amp = o.amp || 290;
  const period = o.period || 3.4;
  let y = y0 + 130;
  for (let i = 0; i < layers; i++) {
    const tilt = (i % 2 ? 1 : -1) * 7 * DEG;
    b.kin({
      kind: 'slider', x: MID, y, angle: tilt, r: width / 2 + amp,
      motion: { type: 'slide', ax: amp, ay: 0, w: (2 * Math.PI) / period, ph: i * 1.7 + b.rng() },
      shapes: [{ type: 'poly', pts: rectPts(width, 18) }],
    });
    if (i < layers - 1) {
      for (const x of [270, 540, 810]) b.circle(x + (b.rng() - 0.5) * 40, y + 110, 12, 'peg');
    }
    y += 220;
  }
  const y1 = y - 220 + 110;
  b.section(o.name || 'SLIDE SHOW', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- swinging hammers
function hammers(b, y0, o = {}) {
  const len = o.len || 220;
  const amp = o.amp || 0.95;
  const w = (2 * Math.PI) / (o.period || 2.6);
  const rows = o.rows || 2;
  let y = y0 + 85;
  let bottom = y;
  for (let i = 0; i < rows; i++) {
    const xs = i % 2 === 0 ? [275, 805] : [540];
    xs.forEach((x, j) => {
      b.kin({
        kind: 'hammer', x, y, angle: Math.PI / 2, r: len + 60,
        motion: { type: 'swing', amp, w, ph: (i + j) * Math.PI * 0.5 + b.rng() * 0.5 },
        shapes: [
          { type: 'poly', pts: barPts(0, 0, len, 0, 16) },
          { type: 'poly', pts: rectPts(56, 96, len, 0) },
          { type: 'circle', x: 0, y: 0, r: 18 },
        ],
      });
    });
    if (i % 2 === 1) {
      for (const [px, py] of [[150, 120], [930, 120], [205, 260], [875, 260]]) b.circle(px, y + py, 12, 'peg');
    }
    bottom = y + len + 50;
    y += len + 200;
  }
  const y1 = bottom + 100;
  b.section(o.name || 'HAMMER TIME', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- paddle wheels
function windmills(b, y0, o = {}) {
  const r = o.r || 160;
  const n = o.paddles || 6;
  const speed = o.speed || 1.3;
  const y = y0 + 70 + r;
  for (const [x, dir] of [[270, 1], [810, -1]]) {
    const shapes = [{ type: 'circle', x: 0, y: 0, r: 28 }];
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      shapes.push({ type: 'poly', pts: barPts(0, 0, r * Math.cos(a), r * Math.sin(a), 16) });
    }
    b.kin({
      kind: 'wheel', x, y, angle: b.rng() * Math.PI, r,
      motion: { type: 'rotate', w: dir * speed * (o.outward ? -1 : 1) },
      shapes,
    });
  }
  b.circle(MID, y - r + 10, 16, 'peg');
  const y1 = y + r + 100;
  b.section(o.name || 'WINDMILLS', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- trapdoors
function trapdoors(b, y0, o = {}) {
  const layers = o.layers || 2;
  const flaps = 4;
  const period = o.period || 3.2;
  const fw = (WR - WL) / flaps;
  const len = fw - 8;
  let y = y0 + 140;
  for (let L = 0; L < layers; L++) {
    for (let j = 0; j < flaps; j++) {
      const hingeLeft = (j + L) % 2 === 0;
      const hx = hingeLeft ? WL + j * fw : WL + (j + 1) * fw;
      b.kin({
        kind: 'flap', x: hx, y, angle: 0, r: len,
        motion: {
          type: 'flip', amp: hingeLeft ? 1.35 : -1.35,
          period: period * (0.9 + 0.25 * b.rng()), ph: b.rng() * period,
        },
        shapes: [
          { type: 'poly', pts: hingeLeft ? rectPts(len, 18, len / 2, 0) : rectPts(len, 18, -len / 2, 0) },
          { type: 'circle', x: 0, y: 0, r: 12 },
        ],
      });
    }
    y += 340;
  }
  const y1 = y - 340 + 240 + 90;
  b.section(o.name || 'TRAPDOORS', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- tipping buckets
function buckets(b, y0, o = {}) {
  const rows = o.rows || 2;
  const period = o.period || 3.6;
  let y = y0 + 190;
  let bottom = y;
  for (let r = 0; r < rows; r++) {
    const rowA = r % 2 === 0;
    const xs = rowA ? [215, 540, 865] : [377, 703];
    if (rowA) {
      // keep marbles out of the narrow gaps between the outer buckets and the walls
      b.poly([[WL - 5, y - 150], [WL + 100, y - 80], [WL - 5, y - 40]], 'deflector');
      b.poly([[WR + 5, y - 150], [WR - 100, y - 80], [WR + 5, y - 40]], 'deflector');
    }
    xs.forEach((x, j) => {
      const dir = (r + j) % 2 === 0 ? 1 : -1;
      b.kin({
        kind: 'bucket', x, y, angle: 0, r: 135,
        motion: { type: 'flip', amp: dir * Math.PI, period: period * (0.9 + 0.3 * b.rng()), ph: b.rng() * period },
        shapes: [
          { type: 'poly', pts: barPts(-115, 40, 115, 40, 16) },
          { type: 'poly', pts: barPts(-115, 46, -128, -38, 14) },
          { type: 'poly', pts: barPts(115, 46, 128, -38, 14) },
          { type: 'circle', x: 0, y: 0, r: 9, deco: true },
        ],
      });
    });
    bottom = y + 135;
    y += 300;
  }
  const y1 = bottom + 100;
  b.section(o.name || 'DUMP BUCKETS', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- lots of small fast spinners
function pinwheels(b, y0, o = {}) {
  const rows = o.rows || 5;
  const arm = 55;
  let y = y0 + 130;
  for (let i = 0; i < rows; i++) {
    const odd = i % 2 === 1;
    const xs = odd ? [266, 449, 631, 814] : [175, 357.5, 540, 722.5, 905];
    xs.forEach((x, j) => {
      b.kin({
        kind: 'pinwheel', x, y, angle: b.rng() * Math.PI, r: arm, style: 'cross',
        motion: { type: 'rotate', w: ((i + j) % 2 ? 1 : -1) * (3 + b.rng()) },
        shapes: spinnerShapes('cross', arm, 12),
      });
    });
    if (odd) {
      b.poly([[WL - 5, y - 80], [WL + 90, y - 10], [WL - 5, y + 30]], 'deflector');
      b.poly([[WR + 5, y - 80], [WR - 90, y - 10], [WR + 5, y + 30]], 'deflector');
    }
    y += 165;
  }
  const y1 = y - 165 + arm + 90;
  b.section(o.name || 'PINWHEELS', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- diamond pegs
function diamonds(b, y0, o = {}) {
  const rows = o.rows || 9;
  const s = 30;
  const sx = 150;
  const sy = 125;
  let y = y0 + 90;
  for (let i = 0; i < rows; i++) {
    const odd = i % 2 === 1;
    const n = odd ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const x = MID + (k - (n - 1) / 2) * sx;
      b.poly([[x, y - s], [x + s, y], [x, y + s], [x - s, y]], 'diamond');
    }
    if (odd) {
      b.circle(WL, y, 46, 'bump');
      b.circle(WR, y, 46, 'bump');
    }
    y += sy;
  }
  const y1 = y - sy + s + 90;
  b.section(o.name || 'DIAMOND DROP', y0, y1);
  b.respawnRow(y0 + 22);
  return y1;
}

// ---------------------------------------------------------------- finish line + bin
function finish(b, y0) {
  const finishY = y0 + 240;
  const floor = finishY + 640;
  b.box(MID, floor + 40, W, 80, 0, 'wall');
  b.finishY = finishY;
  b.binFloor = floor;
  b.section('FINISH', y0, floor);
  return floor + 80;
}

function walls(b, yTop, yBottom) {
  // tall walls are split into chunks; very long thin polygons are bad for the physics solver
  for (let y = yTop; y < yBottom; y += 1000) {
    const h = Math.min(1000, yBottom - y);
    b.box(WL / 2, y + h / 2, WL, h, 0, 'wall');
    b.box(WR + (W - WR) / 2, y + h / 2, W - WR, h, 0, 'wall');
  }
}

const SECTIONS = {
  pegs, zigzag, spinners, bumpers, funnel, sliders, hammers, windmills, trapdoors, buckets, pinwheels, diamonds,
};

module.exports = {
  W, WL, WR, MID, CourseBuilder, SECTIONS, pen, finish, walls, rectPts, barPts,
};
