'use strict';

// Headless race simulator used to tune course lengths and spot stuck marbles.
// usage: node scripts/sim-test.js [courseIndex|all] [marbles] [maxSeconds]

const { buildCourse, COURSES } = require('../src/game/courses');
const { Physics } = require('../src/game/physics');

function simulate(index, n, maxT, opts = {}) {
  const course = buildCourse(index);
  const phys = new Physics(course, { radius: opts.radius || 24, gravity: opts.gravity || 22 });
  const dt = 1 / 60;
  for (let i = 0; i < n; i++) {
    const x = 90 + ((i * 97) % 900);
    const y = 100 + Math.floor(i / 9) * 55;
    phys.addMarble(i, x, y);
  }
  let t = 0;
  // settle in the pen for 2 seconds
  for (let i = 0; i < 120; i++) {
    phys.step(dt, t);
    t += dt;
  }
  phys.state.gateOpenAt = t;
  const start = t;
  const finished = [];
  const sectionLeader = course.sections.map(() => null);
  const best = new Map();
  let nudges = 0;
  let teleports = 0;
  let escapes = 0;
  const stuckSpots = [];
  for (let i = 0; i < n; i++) best.set(i, { y: 0, t: start, nudges: 0 });
  while (t - start < maxT) {
    phys.step(dt, t);
    t += dt;
    let leaderY = -1e9;
    for (let i = 0; i < n; i++) {
      if (finished.includes(i)) continue;
      const m = phys.getMarble(i);
      if (!m) continue;
      if (m.x < 0 || m.x > 1080 || m.y < -100 || m.y > course.binFloor + 100) {
        escapes++;
        const rp = course.respawns.find((r) => r.y > m.y) || course.respawns[course.respawns.length - 1];
        phys.teleport(i, rp.x, rp.y);
        continue;
      }
      if (m.y > leaderY) leaderY = m.y;
      if (m.y > course.finishY) {
        finished.push(i);
        continue;
      }
      const b = best.get(i);
      if (m.y > b.y + 25) {
        b.y = m.y;
        b.t = t;
        b.nudges = 0;
      } else if (t - b.t > 4 + b.nudges * 2.5) {
        if (b.nudges < 3) {
          phys.push(i, (Math.random() - 0.5) * 600, -300 - Math.random() * 200);
          b.nudges++;
          nudges++;
        } else {
          stuckSpots.push([Math.round(m.x), Math.round(m.y)]);
          const rp = course.respawns.find((r) => r.y > m.y + 30) || course.respawns[course.respawns.length - 1];
          phys.teleport(i, rp.x + (Math.random() - 0.5) * 60, rp.y);
          b.t = t;
          b.nudges = 0;
          teleports++;
        }
      }
    }
    course.sections.forEach((s, si) => {
      if (sectionLeader[si] == null && leaderY > s.y1) sectionLeader[si] = t - start;
    });
    if (finished.length >= Math.min(3, n) && opts.stopAfterPodium) break;
    if (finished.length === n) break;
  }
  return { course, finished, sectionLeader, nudges, teleports, escapes, stuckSpots, elapsed: t - start, phys };
}

if (require.main === module) {
  const which = process.argv[2] || 'all';
  const n = parseInt(process.argv[3] || '30', 10);
  const maxT = parseFloat(process.argv[4] || '300');
  const list = which === 'all' ? COURSES.map((_, i) => i) : [parseInt(which, 10)];
  for (const idx of list) {
    const t0 = Date.now();
    const r = simulate(idx, n, maxT, { stopAfterPodium: process.argv.includes('--podium') });
    const wall = (Date.now() - t0) / 1000;
    let prev = 0;
    const secs = r.course.sections.map((s, i) => {
      const tt = r.sectionLeader[i];
      const d = tt == null ? '-' : (tt - prev).toFixed(1);
      if (tt != null) prev = tt;
      return `${s.name}:${d}`;
    });
    console.log(`\n=== ${r.course.name}  height=${r.course.height}  finishY=${r.course.finishY}`);
    console.log(`finished ${r.finished.length}/${n}  leader=${r.sectionLeader[r.sectionLeader.length - 1]?.toFixed(1)}s  nudges=${r.nudges} teleports=${r.teleports} escapes=${r.escapes}  (sim ${r.elapsed.toFixed(0)}s in ${wall.toFixed(1)}s)`);
    console.log(secs.join(' | '));
    if (r.stuckSpots.length) console.log('stuck at', JSON.stringify(r.stuckSpots.slice(0, 30)));
  }
}

module.exports = { simulate };
