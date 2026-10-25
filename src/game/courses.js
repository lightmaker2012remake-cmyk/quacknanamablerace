'use strict';

const { CourseBuilder, SECTIONS, pen, finish, walls, W } = require('./sections');
const { mulberry32 } = require('./rng');

// Colours and decorations used by the renderer for each course.
const THEMES = {
  pond: {
    bg: ['#0f5e7d', '#082c45'], bgEnd: ['#0b4566', '#041726'], decor: 'bubbles',
    wall: '#0a3550', wallEdge: '#4fc3f7', label: 'rgba(160,230,255,0.10)',
    peg: '#f2fbff', pegGlow: '#7fdcff', bump: '#4fc3f7',
    ramp: '#7bc96f', rampEdge: '#c5f5b8', rampStyle: 'leaf',
    spinner: '#ffd23f', spinnerEdge: '#fff3b0',
    bumper: '#ff8c42', bumperRing: '#ffe0c2',
    hammer: '#ffd23f', slider: '#7bc96f', wheel: '#a1887f', flap: '#8d6e63', funnel: '#26a69a', gate: '#ffd23f',
    accent: '#ffd23f',
  },
  candy: {
    bg: ['#ff9ac6', '#b05bd6'], bgEnd: ['#d77bd9', '#5b2a86'], decor: 'sprinkles',
    wall: '#7a2f8f', wallEdge: '#ffd1f0', label: 'rgba(255,255,255,0.13)',
    peg: '#ffffff', pegGlow: '#ff7eb9', bump: '#ffb3d9',
    ramp: '#ff5c8a', rampEdge: '#ffffff', rampStyle: 'candy',
    spinner: '#7ee8fa', spinnerEdge: '#ffffff',
    bumper: '#ffe066', bumperRing: '#ff5c8a',
    hammer: '#c084fc', slider: '#7ee8fa', wheel: '#ff9f43', flap: '#ff5c8a', funnel: '#a855f7', gate: '#ffe066',
    accent: '#fff36b',
  },
  lava: {
    bg: ['#3b0d0d', '#1a0505'], bgEnd: ['#5c1408', '#2b0600'], decor: 'embers',
    wall: '#1f0b08', wallEdge: '#ff6a00', label: 'rgba(255,120,40,0.10)',
    peg: '#ffd7a8', pegGlow: '#ff6a00', bump: '#ff8f3a',
    ramp: '#3a2a2a', rampEdge: '#ff7b1c', rampStyle: 'lava',
    spinner: '#ff9100', spinnerEdge: '#ffe0b2',
    bumper: '#ff3d00', bumperRing: '#ffd180',
    hammer: '#b0bec5', slider: '#5d4037', wheel: '#6d4c41', flap: '#4e342e', funnel: '#3e2723', gate: '#ff9100',
    accent: '#ffab40',
  },
  galaxy: {
    bg: ['#140a33', '#05030f'], bgEnd: ['#1d0b45', '#000000'], decor: 'stars',
    wall: '#0b0620', wallEdge: '#00e5ff', label: 'rgba(120,160,255,0.10)',
    peg: '#e0f7ff', pegGlow: '#00e5ff', bump: '#7c4dff',
    ramp: '#2a0f4a', rampEdge: '#ff2bd6', rampStyle: 'neon',
    spinner: '#ffe600', spinnerEdge: '#fff9a0',
    bumper: '#39ff88', bumperRing: '#d4ffe6',
    hammer: '#ff2bd6', slider: '#00e5ff', wheel: '#7c4dff', flap: '#ff2bd6', funnel: '#3d1a78', gate: '#00e5ff',
    accent: '#00e5ff',
  },
  ice: {
    bg: ['#bfe9ff', '#5aa9e6'], bgEnd: ['#7cc4f0', '#1d4e89'], decor: 'snow',
    wall: '#2b5d8c', wallEdge: '#ffffff', label: 'rgba(255,255,255,0.18)',
    peg: '#ffffff', pegGlow: '#1e6fc2', pegRim: '#2f6fae', bump: '#e1f5fe',
    ramp: '#a5e4ff', rampEdge: '#ffffff', rampStyle: 'ice',
    spinner: '#4fc3f7', spinnerEdge: '#e1f5fe',
    bumper: '#ff6b6b', bumperRing: '#ffffff',
    hammer: '#90a4ae', slider: '#81d4fa', wheel: '#4dd0e1', flap: '#64b5f6', funnel: '#3f7fbf', gate: '#ffffff',
    accent: '#ffffff',
  },
};

// Rough leader time (seconds) for each section type, measured with scripts/sim-test.js
// (single sections, then scaled by CALIBRATION so whole courses come out right).
const CALIBRATION = 1.14;
const ESTIMATE = {
  pegs: (o) => 5.7 * ((o.rows || 12) / 12) * (o.sx === 110 ? 0.75 : 1),
  zigzag: (o) => 17 * ((o.n || 5) / 5) * (o.kind === 'ice' ? 0.65 : 1),
  spinners: (o) => 3.2 * ((o.rows || 4) / 4),
  bumpers: (o) => 3.0 * ((o.rows || 5) / 5),
  funnel: () => 1.5,
  sliders: (o) => 1.8 * ((o.layers || 4) / 4),
  hammers: (o) => 1.2 * ((o.rows || 2) / 2),
  windmills: () => 1.0,
  trapdoors: (o) => 3.0 * ((o.layers || 2) / 2),
  buckets: (o) => 2.6 * ((o.rows || 2) / 2),
  pinwheels: (o) => 4.1 * ((o.rows || 5) / 5),
  diamonds: (o) => 4.0 * ((o.rows || 9) / 9),
};

// The 5 courses. Every course starts with pegs, then a seeded mix of obstacles
// that is as long as the chosen race length.
const COURSES = [
  {
    id: 'pond', name: 'Duck Pond Dash', theme: 'pond', seed: 1101, spinStyles: ['cross', 'bar'],
    mix: { zigzag: 3, pegs: 2, spinners: 2, bumpers: 2, funnel: 0.8, sliders: 1.5, hammers: 1, windmills: 1.5, trapdoors: 1.2, buckets: 1.5, pinwheels: 1, diamonds: 1 },
    names: {
      pegs: ['PEG PLUNGE', 'RAIN DROPS', 'PEBBLE FIELD', 'HAILSTONES', 'DUCKWEED DROP'],
      zigzag: ['LILY PAD SLIDE', 'RIVER BENDS', 'STREAM RUN', 'LOG FLUME', 'MUDSLIDE', 'CREEK CRAWL'],
      spinners: ['DUCKY SPINNERS', 'PROPELLERS', 'WHIRLPOOL'],
      bumpers: ['BOUNCE POND', 'SPLASH ZONE', 'BUBBLE BUMP'],
      funnel: ['THE SQUEEZE', 'THE DRAIN', 'BOTTLENECK'],
      sliders: ['FLOATING LOGS', 'DRIFTWOOD'],
      hammers: ['CATTAIL SWING', 'REED WHACKERS'],
      windmills: ['WATER WHEELS', 'MILL RACE'],
      trapdoors: ['TRAPDOORS', 'BEAVER DAM'],
      buckets: ['DUMP BUCKETS', 'RAIN BARRELS'],
      pinwheels: ['DRAGONFLIES', 'PINWHEELS'],
      diamonds: ['CRYSTAL CREEK', 'DIAMOND DROP'],
    },
  },
  {
    id: 'candy', name: 'Candy Cascade', theme: 'candy', seed: 2202, spinStyles: ['tri', 'cross'],
    mix: { zigzag: 3, pegs: 2, spinners: 2, bumpers: 2.5, funnel: 0.8, sliders: 1.2, hammers: 1, windmills: 1.5, trapdoors: 1.5, buckets: 1.5, pinwheels: 1.5, diamonds: 1 },
    names: {
      pegs: ['SPRINKLE DROP', 'NERDS RAIN', 'GUMDROP FIELD', 'LAST LICK', 'JELLYBEAN JAM'],
      zigzag: ['CANDY CANES', 'GUMMY STAIRS', 'SWIRL SLOPES', 'TAFFY TRAIL', 'FUDGE FLOW', 'SYRUP SLIDE'],
      spinners: ['LOLLIPOP SPIN', 'CANDY CROSS', 'TWIRLY POPS'],
      bumpers: ['GUMBALL BOUNCE', 'JAWBREAKERS', 'BONBON BASH'],
      funnel: ['SUGAR RUSH', 'COTTON FUNNEL', 'TOFFEE TRAP'],
      sliders: ['WAFER SLIDE', 'CHOCO BARS'],
      hammers: ['TAFFY PULL', 'CANDY HAMMERS'],
      windmills: ['PINWHEEL POPS', 'MINT WHEELS'],
      trapdoors: ['CHOCO DOORS', 'COOKIE CRUMBLE'],
      buckets: ['CUPCAKE CUPS', 'SUNDAE SPILL'],
      pinwheels: ['PEPPERMINTS', 'SUGAR TWISTS'],
      diamonds: ['ROCK CANDY', 'SUGAR CUBES'],
    },
  },
  {
    id: 'lava', name: 'Lava Peak', theme: 'lava', seed: 3303, spinStyles: ['cross', 'bar'],
    mix: { zigzag: 3, pegs: 2, spinners: 2, bumpers: 1.5, funnel: 0.8, sliders: 2, hammers: 2, windmills: 1.5, trapdoors: 1.5, buckets: 1, pinwheels: 1, diamonds: 1.2 },
    names: {
      pegs: ['EMBER RAIN', 'CINDER FIELD', 'ASH STORM', 'LAST STAND', 'SPARK SHOWER'],
      zigzag: ['BASALT RAMPS', 'ASH SLOPES', 'LAVA RIVER', 'MAGMA FLOW', 'OBSIDIAN RUN', 'SCORCHED PATH'],
      spinners: ['FIRE WHEELS', 'MOLTEN MILL', 'FLAME SPIN'],
      bumpers: ['ERUPTION', 'HOT ROCKS', 'GEYSERS'],
      funnel: ['CRATER', 'VENT', 'CHIMNEY'],
      sliders: ['FLOATING ROCKS', 'CRUST SHIFT'],
      hammers: ['MAGMA HAMMERS', 'SMASH ZONE'],
      windmills: ['FORGE WHEELS', 'FURNACE FANS'],
      trapdoors: ['COLLAPSE', 'CRUMBLING LEDGE'],
      buckets: ['LAVA LADLES', 'CAULDRONS'],
      pinwheels: ['FIREFLIES', 'SPARK WHEELS'],
      diamonds: ['OBSIDIAN SHARDS', 'RUBY DROP'],
    },
  },
  {
    id: 'galaxy', name: 'Neon Galaxy', theme: 'galaxy', seed: 4404, spinStyles: ['tri', 'cross', 'bar'],
    mix: { zigzag: 3, pegs: 2, spinners: 2.5, bumpers: 2, funnel: 0.8, sliders: 1.5, hammers: 1, windmills: 1.5, trapdoors: 1.2, buckets: 1.2, pinwheels: 2, diamonds: 1.2 },
    names: {
      pegs: ['STARFALL', 'METEOR SHOWER', 'COSMIC DUST', 'STARDUST', 'GALAXY GRID'],
      zigzag: ['LIGHT RAILS', 'HYPERLANES', 'COMET TAIL', 'NEON HIGHWAY', 'LASER LANES', 'ORBIT PATH'],
      spinners: ['ORBITERS', 'NEBULA MILL', 'GRAVITY WELLS'],
      bumpers: ['PULSARS', 'SUPERNOVA', 'QUASARS'],
      funnel: ['WORMHOLE', 'BLACK HOLE', 'EVENT HORIZON'],
      sliders: ['ASTEROID BELT', 'SPACE DOCK'],
      hammers: ['LASER SWEEP', 'ION BEAMS'],
      windmills: ['SATELLITES', 'SPACE STATION'],
      trapdoors: ['AIRLOCKS', 'HATCHES'],
      buckets: ['UFO SCOOPS', 'TRACTOR BEAMS'],
      pinwheels: ['STAR SPINNERS', 'GALAXY TWIRL'],
      diamonds: ['CRYSTAL PLANETS', 'STAR SHARDS'],
    },
  },
  {
    id: 'ice', name: 'Frozen Falls', theme: 'ice', seed: 5505, spinStyles: ['cross', 'tri'], ramp: 'ice',
    mix: { zigzag: 3, pegs: 2, spinners: 2, bumpers: 2, funnel: 0.8, sliders: 1.5, hammers: 1, windmills: 1.5, trapdoors: 1.2, buckets: 1.2, pinwheels: 1.2, diamonds: 1.5 },
    names: {
      pegs: ['SNOWFALL', 'HAILSTORM', 'FINAL FREEZE', 'FLURRIES', 'SLEET STREET'],
      zigzag: ['ICE SLIDES', 'MOGUL RUN', 'BOBSLED', 'GLACIER GLIDE', 'SLEDDING HILL', 'FROST TRAIL'],
      spinners: ['SNOWFLAKES', 'BLIZZARD', 'ICE SKATES'],
      bumpers: ['SNOWBALL FIGHT', 'FROSTY BUMPS', 'IGLOO BOUNCE'],
      funnel: ['GLACIER GAP', 'AVALANCHE', 'ICE CHUTE'],
      sliders: ['ICE FLOES', 'DRIFTING ICE'],
      hammers: ['ICICLE SWING', 'YETI SMASH'],
      windmills: ['SNOW PLOWS', 'WIND TURBINES'],
      trapdoors: ['THIN ICE', 'SNOW TRAPS'],
      buckets: ['SNOW SCOOPS', 'ICE BUCKETS'],
      pinwheels: ['FROST SPINNERS', 'SNOW WHIRLS'],
      diamonds: ['ICE CRYSTALS', 'FROZEN GEMS'],
    },
  },
];

function pickWeighted(rng, weights, exclude) {
  let total = 0;
  for (const k in weights) if (!exclude.has(k)) total += weights[k];
  let r = rng() * total;
  for (const k in weights) {
    if (exclude.has(k)) continue;
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights).find((k) => !exclude.has(k));
}

function variant(type, rng, def) {
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  switch (type) {
    case 'pegs': {
      const v = rng();
      if (v < 0.33) return { rows: ri(9, 12), sx: 110, sy: 95, pr: 8 };
      return { rows: ri(8, 12), sx: v < 0.66 ? 120 : 130 };
    }
    case 'zigzag': return { n: ri(4, 6), slope: 11 + rng() * 2, startRight: rng() < 0.5, kind: def.ramp || 'ramp' };
    case 'spinners': return { rows: ri(3, 5), style: def.spinStyles[ri(0, def.spinStyles.length - 1)], speed: 1.7 + rng() * 0.8 };
    case 'bumpers': return { rows: ri(4, 6) };
    case 'funnel': return { opening: 220 + ri(0, 40) };
    case 'sliders': return { layers: ri(3, 5), period: 2.8 + rng() * 1.2 };
    case 'hammers': return { rows: ri(2, 3), period: 2.2 + rng() * 0.8 };
    case 'windmills': return { outward: rng() < 0.5, speed: 1.1 + rng() * 0.5 };
    case 'trapdoors': return { layers: ri(2, 3), period: 2.8 + rng() * 1.0 };
    case 'buckets': return { rows: ri(2, 3), period: 3.2 + rng() * 0.8 };
    case 'pinwheels': return { rows: ri(4, 6) };
    case 'diamonds': return { rows: ri(7, 10) };
    default: return {};
  }
}

// Turn a course definition into a list of sections that lasts about targetSeconds.
function planSections(def, targetSeconds) {
  const rng = mulberry32(def.seed);
  const used = {};
  const nameFor = (type) => {
    const list = def.names[type] || [type.toUpperCase()];
    const i = used[type] || 0;
    used[type] = i + 1;
    return list[i % list.length];
  };
  const plan = [['pegs', { rows: 12, name: nameFor('pegs') }]];
  let est = ESTIMATE.pegs(plan[0][1]) * CALIBRATION + 2; // + the drop out of the start pen
  const recent = ['pegs'];
  let sinceZig = 0;
  const finale = 4; // the last section and the finish line
  while (est < targetSeconds - finale) {
    const exclude = new Set(recent.slice(-2));
    if (sinceZig < 2) exclude.add('zigzag');
    let type = sinceZig >= 5 ? 'zigzag' : pickWeighted(rng, def.mix, exclude);
    const opts = variant(type, rng, def);
    const remaining = targetSeconds - finale - est;
    // do not overshoot a short race with a long ramp section
    if (type === 'zigzag' && ESTIMATE.zigzag(opts) > remaining + 6) {
      type = 'pinwheels';
      Object.assign(opts, variant(type, rng, def));
    }
    opts.name = nameFor(type);
    plan.push([type, opts]);
    est += ESTIMATE[type](opts) * CALIBRATION;
    recent.push(type);
    sinceZig = type === 'zigzag' ? 0 : sinceZig + 1;
  }
  const last = recent[recent.length - 1] === 'bumpers' ? 'pegs' : 'bumpers';
  plan.push([last, { rows: 4, name: nameFor(last) }]);
  est += ESTIMATE[last]({ rows: 4 }) * CALIBRATION;
  return { plan, estimate: est };
}

function buildCourse(index, targetSeconds = 180) {
  const def = COURSES[index];
  const { plan, estimate } = planSections(def, targetSeconds);
  const b = new CourseBuilder(def.seed);
  let y = pen(b);
  for (const [type, opts] of plan) {
    y = SECTIONS[type](b, y, opts);
  }
  y = finish(b, y);
  walls(b, -80, b.binFloor + 80);
  return {
    index,
    id: def.id,
    name: def.name,
    theme: THEMES[def.theme],
    themeId: def.theme,
    width: W,
    height: b.binFloor + 80,
    finishY: b.finishY,
    binFloor: b.binFloor,
    penTop: b.penTop,
    penBottom: b.penBottom,
    statics: b.statics,
    kinematics: b.kinematics,
    sections: b.sections,
    respawns: b.respawns,
    estimate,
    target: targetSeconds,
  };
}

module.exports = { COURSES, THEMES, buildCourse, planSections };
