// Player controller: walk / sprint / jump / mantle / glide / grapple, box-collider physics.

import * as THREE from 'three';
import { CFG } from '../config';
import type { Input } from '../core/input';
import type { World } from '../world/world';
import type { Traffic } from '../entities/traffic';

export interface PlayerState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  /** superman flight (Space in mid-air); ends on touchdown or with F */
  flying: boolean;
  grappling: boolean;
  grappleTarget: THREE.Vector3 | null;
  speed: number;
}

export class Player {
  state: PlayerState;
  private world: World;
  private traffic: Traffic;
  private P = CFG.PLAYER;
  private G = CFG.GRAPPLE;
  private F = CFG.FLY;
  /** one grapple per press: set when a grapple starts, cleared when E / RMB is released */
  private grappleLatched = false;
  private grappleT = 0;

  constructor(x: number, y: number, z: number, world: World, traffic: Traffic) {
    this.world = world;
    this.traffic = traffic;
    this.state = {
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.PI * 0.75,
      pitch: -0.12,
      onGround: false,
      flying: false,
      grappling: false,
      grappleTarget: null,
      speed: 0,
    };
  }

  /** camera-space ray vs all nearby colliders; returns hit point or null. */
  private raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): THREE.Vector3 | null {
    let best = maxDist;
    let hit: THREE.Vector3 | null = null;
    for (const c of this.world.colliders) {
      // slab test
      let tmin = 0.05, tmax = best;
      for (let a = 0; a < 3; a++) {
        const o = origin.getComponent(a);
        const d = dir.getComponent(a);
        const c0 = a === 0 ? c.x0 : a === 1 ? c.y0 : c.z0;
        const c1 = a === 0 ? c.x1 : a === 1 ? c.y1 : c.z1;
        if (Math.abs(d) < 1e-8) {
          if (o < c0 || o > c1) { tmin = Infinity; break; }
        } else {
          let t1 = (c0 - o) / d;
          let t2 = (c1 - o) / d;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { tmin = Infinity; break; }
        }
      }
      if (tmin < Infinity && tmin < best) {
        best = tmin;
        hit = new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best);
      }
    }
    return hit;
  }

  private collideAxis(axis: 0 | 1 | 2, amount: number): boolean {
    const s = this.state;
    const pos = s.pos;
    const r = this.P.R;
    const H = 1.7;
    pos.setComponent(axis, pos.getComponent(axis) + amount);
    let blocked = false;
    const px0 = pos.x - r, px1 = pos.x + r;
    const pz0 = pos.z - r, pz1 = pos.z + r;
    const py0 = pos.y, py1 = pos.y + H;
    for (const c of this.world.colliders) {
      if (py1 <= c.y0 + 0.02 || py0 >= c.y1 - 0.02) continue;
      if (px1 <= c.x0 || px0 >= c.x1 || pz1 <= c.z0 || pz0 >= c.z1) continue;
      blocked = true;
      if (axis === 0) {
        pos.x = amount > 0 ? c.x0 - r : c.x1 + r;
      } else if (axis === 2) {
        pos.z = amount > 0 ? c.z0 - r : c.z1 + r;
      } else {
        if (amount < 0) {
          pos.y = c.y1;
          s.vel.y = 0;
          s.onGround = true;
        } else {
          pos.y = c.y0 - H;
          s.vel.y = Math.min(s.vel.y, 0);
        }
      }
      // recompute extents after push
      const nx0 = pos.x - r, nx1 = pos.x + r;
      const nz0 = pos.z - r, nz1 = pos.z + r;
      void nx0; void nx1; void nz0; void nz1;
    }
    return blocked;
  }

  update(dt: number, input: Input, camDir: THREE.Vector3): void {
    const s = this.state;
    const pos = s.pos, vel = s.vel;
    const [mdx, mdy] = input.consumeMouse();
    s.yaw -= mdx * 0.0023;
    s.pitch -= mdy * 0.0023;
    s.pitch = Math.max(CFG.CAM.PITCH_MIN, Math.min(CFG.CAM.PITCH_MAX, s.pitch));

    // input direction
    let ix = 0, iz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) iz += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) iz -= 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) ix -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) ix += 1;
    const il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    // yaw follows the three.js camera: forward = (-sin, -cos), right = (cos, -sin)
    const wx = ix * cy - iz * sy;
    const wz = -ix * sy - iz * cy;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpeed = sprint ? this.P.SPRINT : this.P.SPEED;

    // grapple control
    const wantGrapple = input.down('KeyE') || input.rmb;
    if (!wantGrapple) this.grappleLatched = false;
    if (wantGrapple && !s.grappling && !this.grappleLatched) {
      const origin = new THREE.Vector3(pos.x, pos.y + this.P.EYE - 0.3, pos.z);
      const hit = this.raycast(origin, camDir, this.G.RANGE);
      if (hit && hit.y > 0.5) {
        s.grappling = true;
        s.grappleTarget = hit;
        s.flying = false;
        this.grappleLatched = true;
        this.grappleT = 0;
        // hop off the ground so the ground contact doesn't cancel the pull on the first frame
        if (s.onGround && hit.y > pos.y + 1) { vel.y = Math.max(vel.y, 4.5); s.onGround = false; }
      }
    }
    if (!wantGrapple && s.grappling) {
      s.grappling = false;
      s.grappleTarget = null;
    }
    if (s.grappling) this.grappleT += dt;
    if (s.grappling && s.grappleTarget) {
      const t = s.grappleTarget;
      const dx = t.x - pos.x, dy = t.y - (pos.y + this.P.EYE * 0.5), dz = t.z - pos.z;
      const dist = Math.hypot(dx, dy, dz);
      vel.x += (dx / dist) * this.G.STIFF * dt;
      vel.y += (dy / dist) * this.G.STIFF * dt * 0.9;
      vel.z += (dz / dist) * this.G.STIFF * dt;
      vel.multiplyScalar(Math.max(0, 1 - this.G.DAMP * dt * 0.5));
      // release conditions
      if ((s.onGround && this.grappleT > 0.3) || dist < 1.4 || Math.hypot(dx, dz) < 0.8 && dy < 0) {
        s.grappling = false;
        s.grappleTarget = null;
      }
    }

    // ---- flight: Space in mid-air takes off, F drops out of it, touching down lands
    if (!s.flying && !s.grappling && !s.onGround && input.was('Space')) {
      s.flying = true;
      vel.y = Math.max(vel.y, 1.5);
    } else if (s.flying && input.was('KeyF')) {
      s.flying = false;
    }
    if (s.flying) {
      this.fly(dt, input, ix, iz, sprint);
      s.speed = Math.hypot(vel.x, vel.z);
      return;
    }

    // horizontal movement. On foot the velocity snaps toward the wished velocity (~0.1 s to full
    // speed, instant-feeling turns and stops) instead of accelerating like a vehicle. In the air
    // the player steers, but never loses momentum gained from a grapple or a jump.
    if (!s.grappling) {
      if (s.onGround) {
        const k = 1 - Math.exp(-dt * (il > 0 ? 20 : 24));
        vel.x += (wx * maxSpeed - vel.x) * k;
        vel.z += (wz * maxSpeed - vel.z) * k;
      } else if (il > 0) {
        const hsp0 = Math.hypot(vel.x, vel.z);
        vel.x += wx * 14 * dt;
        vel.z += wz * 14 * dt;
        const cap = Math.max(maxSpeed, hsp0);
        const hsp = Math.hypot(vel.x, vel.z);
        if (hsp > cap) { vel.x *= cap / hsp; vel.z *= cap / hsp; }
      }
    }

    // jump
    if (input.was('Space') && s.onGround) {
      vel.y = this.P.JUMP;
      s.onGround = false;
    }

    // gravity
    const airControl = s.grappling ? 0.3 : 1;
    vel.y += this.P.GRAV * dt * airControl;

    // integrate with per-axis collision
    const wasOnGround = s.onGround;
    s.onGround = false;
    const blockedX = this.collideAxis(0, vel.x * dt);
    const blockedZ = this.collideAxis(2, vel.z * dt);
    if (blockedX) vel.x = 0;
    if (blockedZ) vel.z = 0;

    // ledge mantle
    if ((blockedX || blockedZ) && wasOnGround && !s.onGround) {
      const dx = blockedX ? Math.sign(vel.x || wx) : 0;
      const dz = blockedZ ? Math.sign(vel.z || wz) : 0;
      const fx = pos.x + dx * 0.7, fz = pos.z + dz * 0.7;
      const footY = pos.y;
      const headY = pos.y + this.P.MANTLE_H;
      let canMantle = true;
      for (const c of this.world.colliders) {
        if (c.y1 <= footY + 0.05) continue; // fully below
        if (c.y1 > headY + 0.05) { canMantle = false; break; }
        if (fx > c.x0 - 0.3 && fx < c.x1 + 0.3 && fz > c.z0 - 0.3 && fz < c.z1 + 0.3 && c.y0 < headY) { canMantle = false; break; }
      }
      if (canMantle) {
        vel.y = 8.4;
        vel.x = dx * 2.6;
        vel.z = dz * 2.6;
        s.onGround = false;
      }
    }

    this.collideAxis(1, vel.y * dt);

    // ground plane
    if (pos.y <= 0) {
      pos.y = 0;
      if (vel.y < 0) vel.y = 0;
      s.onGround = true;
    }

    // jump pads (plaza pads: orange emissive strips near plaza edges — approximated by beacon? use grapple instead)
    // train riding
    const carry = this.traffic.carry(pos.x, pos.y, pos.z);
    if (carry > 0) {
      pos.z += carry * dt;
      pos.y = this.traffic.trainTopY;
      s.onGround = true;
    }

    // the city streams forever in x/z; only altitude is capped
    if (pos.y > CFG.FLY.CEIL) { pos.y = CFG.FLY.CEIL; vel.y = Math.min(vel.y, 0); }

    s.speed = Math.hypot(vel.x, vel.z);
  }

  /**
   * Flight model tuned for comfort: no gravity, velocity eases toward the input (so it never feels
   * twitchy or icy), and with no input the body settles into a hover. W flies where the camera
   * looks (look up to climb), A/D strafe, Space / C rise and sink, Shift boosts.
   */
  private fly(dt: number, input: Input, ix: number, iz: number, boost: boolean): void {
    const s = this.state, vel = s.vel, pos = s.pos, F = this.F;
    const up = (input.down('Space') ? 1 : 0) - (input.down('KeyC') ? 1 : 0);
    const f = this.forward();
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    let tx = f.x * iz + cy * ix;
    let ty = f.y * iz + up * F.VERT;
    let tz = f.z * iz - sy * ix;
    const tl = Math.hypot(tx, ty, tz);
    if (tl > 1) { tx /= tl; ty /= tl; tz /= tl; }
    const speed = boost ? F.BOOST : F.SPEED;
    const rate = tl > 0.01 ? (boost ? F.BOOST_ACCEL : F.ACCEL) : F.DRAG;
    const k = 1 - Math.exp(-dt * rate);
    vel.x += (tx * speed - vel.x) * k;
    vel.y += (ty * speed - vel.y) * k;
    vel.z += (tz * speed - vel.z) * k;

    // sub-stepped collision so fast flight can't tunnel through thin walls
    const maxStep = Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt;
    const steps = Math.min(10, Math.max(1, Math.ceil(maxStep / 0.5)));
    s.onGround = false;
    for (let i = 0; i < steps; i++) {
      if (this.collideAxis(0, vel.x * dt / steps)) vel.x *= 0.2;
      if (this.collideAxis(2, vel.z * dt / steps)) vel.z *= 0.2;
      this.collideAxis(1, vel.y * dt / steps);
    }
    if (pos.y <= 0) { pos.y = 0; s.onGround = true; }
    if (pos.y > F.CEIL) { pos.y = F.CEIL; vel.y = Math.min(vel.y, 0); }
    // touchdown: meeting the street or a rooftop while not climbing ends the flight
    if (s.onGround && up <= 0) {
      s.flying = false;
      vel.y = 0;
    } else if (s.onGround) {
      s.onGround = false; // brushing a surface while holding Space: keep flying
    }
  }

  eyePosition(): THREE.Vector3 {
    const s = this.state;
    return new THREE.Vector3(s.pos.x, s.pos.y + this.P.EYE, s.pos.z);
  }

  forward(): THREE.Vector3 {
    const s = this.state;
    const cp = Math.cos(s.pitch);
    return new THREE.Vector3(-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp);
  }
}
