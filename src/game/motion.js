'use strict';

// Where a moving obstacle should be at time t (seconds).
// Every moving obstacle is a kinematic body that follows one of these paths exactly.

function smooth(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

function evalMotion(k, t, state) {
  const m = k.motion;
  switch (m.type) {
    case 'rotate':
      return { x: k.x, y: k.y, a: k.angle + m.w * t };
    case 'swing':
      return { x: k.x, y: k.y, a: k.angle + m.amp * Math.sin(m.w * t + m.ph) };
    case 'slide': {
      const s = Math.sin(m.w * t + m.ph);
      return { x: k.x + (m.ax || 0) * s, y: k.y + (m.ay || 0) * s, a: k.angle };
    }
    case 'flip': {
      // closed most of the time, then swings open, waits, and closes again
      const T = m.period;
      const p = ((((t + m.ph) % T) + T) % T) / T;
      let f;
      if (p < 0.55) f = 0;
      else if (p < 0.63) f = smooth((p - 0.55) / 0.08);
      else if (p < 0.85) f = 1;
      else if (p < 0.95) f = 1 - smooth((p - 0.85) / 0.1);
      else f = 0;
      return { x: k.x, y: k.y, a: k.angle + m.amp * f };
    }
    case 'gate': {
      const openAt = state && state.gateOpenAt;
      const f = openAt == null ? 0 : smooth((t - openAt) / 0.55);
      return { x: k.x + m.dx * f, y: k.y, a: k.angle };
    }
    default:
      return { x: k.x, y: k.y, a: k.angle };
  }
}

module.exports = { evalMotion, smooth };
