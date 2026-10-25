'use strict';

const planck = require('planck');
const { evalMotion } = require('./motion');

const { World, Vec2, Circle, Polygon } = planck;

const PPM = 40; // pixels per meter (the physics runs in meters, everything else in pixels)

const MATERIALS = {
  wall: { friction: 0.05, restitution: 0.2 },
  peg: { friction: 0.05, restitution: 0.5 },
  diamond: { friction: 0.05, restitution: 0.45 },
  bump: { friction: 0.05, restitution: 0.4 },
  ramp: { friction: 0.3, restitution: 0.1 },
  ice: { friction: 0.0, restitution: 0.05 },
  deflector: { friction: 0.1, restitution: 0.3 },
  bumper: { friction: 0.1, restitution: 0.5 },
  sling: { friction: 0.1, restitution: 0.5 },
  funnel: { friction: 0.15, restitution: 0.15 },
  moving: { friction: 0.25, restitution: 0.25 },
};

const HIT_KINDS = new Set(['peg', 'bumper', 'bump', 'sling', 'diamond']);

function material(kind) {
  return MATERIALS[kind] || MATERIALS.moving;
}

function toShape(s, ox = 0, oy = 0) {
  if (s.type === 'circle') return new Circle(new Vec2((s.x - ox) / PPM, (s.y - oy) / PPM), s.r / PPM);
  return new Polygon(s.pts.map((p) => new Vec2((p[0] - ox) / PPM, (p[1] - oy) / PPM)));
}

class Physics {
  constructor(course, opts = {}) {
    this.course = course;
    this.gravity = opts.gravity || 22;
    this.radius = opts.radius || 24;
    this.maxSpeed = (opts.maxSpeed || 1500) / PPM;
    this.state = { gateOpenAt: null };
    this.world = new World({ gravity: new Vec2(0, this.gravity) });
    this.marbles = new Map(); // slot -> body
    this.pegHits = [];
    this.kicks = [];
    this.marbleHits = 0;

    const ground = this.world.createBody();
    for (const s of course.statics) {
      const m = material(s.kind);
      ground.createFixture({
        shape: toShape(s),
        friction: m.friction,
        restitution: m.restitution,
        userData: { kind: s.kind, id: s.id, kick: s.kick || 0 },
      });
    }

    this.kins = course.kinematics.map((k) => {
      const tr = evalMotion(k, 0, this.state);
      const body = this.world.createKinematicBody({ position: new Vec2(tr.x / PPM, tr.y / PPM), angle: tr.a });
      const m = material(k.kind);
      for (const s of k.shapes) {
        if (s.deco) continue;
        body.createFixture({
          shape: toShape(s),
          friction: m.friction,
          restitution: m.restitution,
          userData: { kind: k.kind, kin: k.id },
        });
      }
      return { def: k, body };
    });

    this.world.on('begin-contact', (contact) => this._onContact(contact));
  }

  _onContact(contact) {
    const a = contact.getFixtureA();
    const b = contact.getFixtureB();
    const ua = a.getUserData();
    const ub = b.getUserData();
    if (!ua || !ub) return;
    let marble;
    let other;
    if (ua.marble != null) {
      marble = ua;
      other = ub;
    } else if (ub.marble != null) {
      marble = ub;
      other = ua;
    } else return;
    if (other.marble != null) {
      this.marbleHits++;
      return;
    }
    if (other.kick) this.kicks.push({ slot: marble.marble, id: other.id, kick: other.kick });
    if (other.id != null && HIT_KINDS.has(other.kind)) {
      this.pegHits.push(other.id);
    }
  }

  // Put every moving obstacle exactly where it belongs at time t (used after resets).
  syncKinematics(t) {
    for (const k of this.kins) {
      const tr = evalMotion(k.def, t, this.state);
      k.body.setTransform(new Vec2(tr.x / PPM, tr.y / PPM), tr.a);
      k.body.setLinearVelocity(new Vec2(0, 0));
      k.body.setAngularVelocity(0);
    }
  }

  step(dt, t) {
    // drive moving obstacles so they land exactly on their path at t + dt
    for (const k of this.kins) {
      const tr = evalMotion(k.def, t + dt, this.state);
      const p = k.body.getPosition();
      const a = k.body.getAngle();
      k.body.setLinearVelocity(new Vec2((tr.x / PPM - p.x) / dt, (tr.y / PPM - p.y) / dt));
      k.body.setAngularVelocity((tr.a - a) / dt);
    }
    this.kicks.length = 0;
    this.world.step(dt, 8, 3);

    // pinball-style bumpers push marbles away at a fixed speed
    for (const k of this.kicks) {
      const body = this.marbles.get(k.slot);
      if (!body) continue;
      const s = this.course.statics[k.id];
      const p = body.getPosition();
      let nx;
      let ny;
      if (s.type === 'circle') {
        nx = p.x - s.x / PPM;
        ny = p.y - s.y / PPM;
      } else {
        // slingshots push sideways towards the middle
        nx = s.pts[1][0] < 540 ? 1 : -1;
        ny = 0.15;
      }
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const v = body.getLinearVelocity();
      const vn = v.x * nx + v.y * ny;
      const target = k.kick / PPM;
      if (vn < target) body.setLinearVelocity(new Vec2(v.x + nx * (target - vn), v.y + ny * (target - vn)));
    }

    // speed limit keeps the race readable and stops tunnelling
    for (const body of this.marbles.values()) {
      const v = body.getLinearVelocity();
      const sp = Math.hypot(v.x, v.y);
      if (sp > this.maxSpeed) body.setLinearVelocity(new Vec2((v.x * this.maxSpeed) / sp, (v.y * this.maxSpeed) / sp));
    }
  }

  addMarble(slot, x, y, vx = 0, vy = 0) {
    this.removeMarble(slot);
    const body = this.world.createDynamicBody({
      position: new Vec2(x / PPM, y / PPM),
      linearDamping: 0.02,
      angularDamping: 0.6,
      allowSleep: false,
    });
    body.createFixture({
      shape: new Circle(this.radius / PPM),
      density: 1,
      friction: 0.15,
      restitution: 0.35,
      userData: { marble: slot },
    });
    body.setLinearVelocity(new Vec2(vx / PPM, vy / PPM));
    this.marbles.set(slot, body);
    return body;
  }

  removeMarble(slot) {
    const body = this.marbles.get(slot);
    if (body) {
      this.world.destroyBody(body);
      this.marbles.delete(slot);
    }
  }

  getMarble(slot) {
    const body = this.marbles.get(slot);
    if (!body) return null;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return { x: p.x * PPM, y: p.y * PPM, a: body.getAngle(), vx: v.x * PPM, vy: v.y * PPM };
  }

  teleport(slot, x, y, vx = 0, vy = 0) {
    const body = this.marbles.get(slot);
    if (!body) return;
    body.setTransform(new Vec2(x / PPM, y / PPM), body.getAngle());
    body.setLinearVelocity(new Vec2(vx / PPM, vy / PPM));
    body.setAngularVelocity(0);
  }

  // add velocity in pixels/second
  push(slot, vx, vy) {
    const body = this.marbles.get(slot);
    if (!body) return;
    const v = body.getLinearVelocity();
    body.setLinearVelocity(new Vec2(v.x + vx / PPM, v.y + vy / PPM));
  }

  kinematicTransforms(yMin, yMax) {
    const out = [];
    for (const k of this.kins) {
      const p = k.body.getPosition();
      const y = p.y * PPM;
      const reach = (k.def.r || 100) + 80;
      if (y + reach < yMin || y - reach > yMax) continue;
      out.push(k.def.id, Math.round(p.x * PPM * 10) / 10, Math.round(y * 10) / 10, Math.round(k.body.getAngle() * 1000) / 1000);
    }
    return out;
  }
}

module.exports = { Physics, PPM };
