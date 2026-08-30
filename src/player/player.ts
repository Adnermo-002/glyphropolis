import * as THREE from "three";
import { PLAYER, SHUTTLE } from "../config";
import type { Input } from "../core/input";
import type { World } from "../world/world";

export type PlayerMode = "walk" | "shuttle";

// First-person body with two movement modes (ADR 0002, amended):
// - Walk: WASD + Shift sprint, sticks to whatever solid surface is underfoot.
//   Space charges an Eject.
// - Shuttle: after the Eject the body glides with soft gravity and
//   speed-lift. Space thrusts along the full look direction, Shift brakes
//   against the velocity, and lateral grip keeps the velocity on the nose so
//   corners stop feeling barge-like. The camera banks into turns and lags
//   the look yaw slightly; pitch opens to +/-90 deg.
// Touchdown on ANY solid surface (street or rooftop) returns to the Walk —
// always, with no rebound; hard contacts only shake harder.
export class Player {
  x = 0; z = 6;
  y = PLAYER.eye;               // eye pivot altitude; feet = y - eye
  velX = 0; velY = 0; velZ = 0;
  mode: PlayerMode = "walk";
  charge = 0;                   // 0..1 while charging an Eject
  charging = false;
  shake = 0;                    // decaying screen-shake amplitude
  bobPhase = 0;
  bob = 0;
  camYaw = 0;                   // spring-lagged camera yaw (shuttle only)
  bank = 0;                     // camera roll into turns (shuttle only)
  private lastYaw = 0;
  private tmp = new THREE.Vector3();

  constructor(public yaw = 0, public pitch = -0.03) {
    this.camYaw = yaw;
    this.lastYaw = yaw;
  }

  get altitude(): number { return this.y - PLAYER.eye; } // street = 0
  get hSpeed(): number { return Math.hypot(this.velX, this.velZ); }

  update(dt: number, input: Input, camera: THREE.PerspectiveCamera, world: World, obstacles?: number[]) {
    input.applyLook();
    input.pitchLimit = this.mode === "shuttle" ? Math.PI / 2 - 0.02 : 1.45;
    if (this.mode === "walk") this.updateWalk(dt, input, world, obstacles);
    else this.updateShuttle(dt, input, world);

    const sh = this.shake;
    camera.position.set(
      this.x + (Math.random() - 0.5) * sh,
      this.y + this.bob + (Math.random() - 0.5) * sh,
      this.z + (Math.random() - 0.5) * sh);
    camera.rotation.order = "YXZ";
    camera.rotation.y = this.camYaw;
    camera.rotation.x = input.pitch;
    camera.rotation.z = this.bank;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.tmp.set(0, 0, 0);
  }

  private updateWalk(dt: number, input: Input, world: World, obstacles?: number[]) {
    // walk keeps the rigid camera: yaw hard-locked to the look input
    this.camYaw = input.yaw;
    this.lastYaw = input.yaw;
    this.bank += (0 - this.bank) * Math.min(1, dt * 10);

    const [f, s] = input.moveAxis();
    const speed = input.running ? PLAYER.run : PLAYER.walk;
    const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    // forward = -z at yaw 0
    const wishX = (-sin * f + cos * s);
    const wishZ = (-cos * f - sin * s);
    const len = Math.hypot(wishX, wishZ) || 1;
    const k = Math.min(1, dt * 8);
    this.velX += ((wishX / len) * speed * (f || s ? 1 : 0) - this.velX) * k;
    this.velZ += ((wishZ / len) * speed * (f || s ? 1 : 0) - this.velZ) * k;

    let nx = this.x + this.velX * dt;
    let nz = this.z + this.velZ * dt;
    [nx, nz] = world.collide(nx, nz, PLAYER.radius);
    // dynamic obstacles (cars): circle pushed out of axis-aligned footprints
    if (obstacles) {
      for (let i = 0; i < obstacles.length; i += 4) {
        const dx = nx - obstacles[i], dz = nz - obstacles[i + 1];
        const ex = obstacles[i + 2] + PLAYER.radius, ez = obstacles[i + 3] + PLAYER.radius;
        if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
          const pushX = ex - Math.abs(dx), pushZ = ez - Math.abs(dz);
          if (pushX < pushZ) nx = obstacles[i] + Math.sign(dx || 1) * ex;
          else nz = obstacles[i + 1] + Math.sign(dz || 1) * ez;
        }
      }
    }
    this.x = nx; this.z = nz;

    // stick to the surface underfoot (street or a rooftop we landed on);
    // stepping off an edge hands control to the Shuttle as a fall
    const ground = world.surfaceHeight(this.x, this.z, this.y);
    const target = ground + PLAYER.eye;
    if (this.y - target > 2.2) {
      this.mode = "shuttle";
      this.velY = 0;
    } else {
      this.y += (target - this.y) * Math.min(1, dt * 14);
      this.velY = 0;
    }

    // Charge on a surface (hold Space), Eject on release
    if (input.ejectHeld) {
      this.charge = Math.min(1, this.charge + dt / SHUTTLE.chargeTime);
      this.charging = true;
    } else if (this.charging) {
      const h = SHUTTLE.hMin + (SHUTTLE.hMax - SHUTTLE.hMin) * this.charge;
      this.mode = "shuttle";
      this.velY = Math.sqrt(2 * SHUTTLE.gravity * h);
      this.charge = 0; this.charging = false;
    }

    const spd = Math.hypot(this.velX, this.velZ);
    this.bobPhase += spd * dt * PLAYER.bobFreq * 0.22;
    this.bob = Math.sin(this.bobPhase) * PLAYER.bobAmp * Math.min(spd / PLAYER.walk, 1.4);
  }

  private updateShuttle(dt: number, input: Input, world: World) {
    const [f, s] = input.moveAxis();
    const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
    const wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      this.velX += (wx / wl) * SHUTTLE.accelF * dt;
      this.velZ += (wz / wl) * SHUTTLE.accelF * dt;
    }

    // Space: thrust along the full look direction, pitch included; looking
    // up climbs harder (up-boost scales the vertical component)
    if (input.ejectHeld) {
      const cp = Math.cos(input.pitch), sp = Math.sin(input.pitch);
      const fade = Math.min(1, Math.max(0.1,
        (SHUTTLE.ceiling + SHUTTLE.ceilingFade - this.y) / SHUTTLE.ceilingFade));
      this.velX += -sin * cp * SHUTTLE.thrust * fade * dt;
      this.velZ += -cos * cp * SHUTTLE.thrust * fade * dt;
      this.velY += sp * SHUTTLE.thrust * (1 + Math.max(0, sp) * SHUTTLE.upBoost) * fade * dt;
    }

    // Shift: active brake against the velocity, never through zero
    if (input.brakeHeld) {
      const sp = Math.hypot(this.velX, this.velY, this.velZ);
      if (sp > 1e-4) {
        const kB = Math.max(0, sp - SHUTTLE.brake * dt) / sp;
        this.velX *= kB; this.velY *= kB; this.velZ *= kB;
      }
    }

    // lateral grip: velocity follows the nose, forward momentum survives
    const fwdX = -sin, fwdZ = -cos, rX = cos, rZ = -sin;
    const vF = this.velX * fwdX + this.velZ * fwdZ;
    const vS = this.velX * rX + this.velZ * rZ;
    const nS = vS * Math.exp(-SHUTTLE.grip * dt);
    this.velX = fwdX * vF + rX * nS;
    this.velZ = fwdZ * vF + rZ * nS;

    // soft gravity countered by speed-lift: fast flight holds altitude
    const lift = Math.min(this.hSpeed * SHUTTLE.liftK, SHUTTLE.gravity * 0.85);
    this.velY -= (SHUTTLE.gravity - lift) * dt;

    const dh = Math.exp(-SHUTTLE.dragH * dt);
    this.velX *= dh; this.velZ *= dh;
    this.velY *= Math.exp(-SHUTTLE.dragV * dt);

    const capH = input.ejectHeld ? SHUTTLE.capHBoost : SHUTTLE.capH;
    const hs = this.hSpeed;
    if (hs > capH) { const k2 = capH / hs; this.velX *= k2; this.velZ *= k2; }
    this.velY = Math.max(-SHUTTLE.capV, Math.min(SHUTTLE.capV, this.velY));

    const prevFeet = this.y - PLAYER.eye;
    let nx = this.x + this.velX * dt;
    let ny = this.y + this.velY * dt;
    let nz = this.z + this.velZ * dt;
    const r = world.collide3D(nx, ny, nz, prevFeet, this.velY, PLAYER.radius, PLAYER.eye);
    nx = r[0]; ny = r[1]; nz = r[2];
    if (r[4] === 1 && this.velY > 0) this.velY = 0; // rose into an underside
    if (r[3] !== 0) {
      // touchdown ALWAYS cancels the Shuttle; hard contacts just shake harder
      if (r[3] === 2) this.shake = 0.85;
      this.touchdown(ny);
    } else { this.x = nx; this.y = ny; this.z = nz; }

    // camera: yaw spring-lags the look input, banks into the turn
    let dYaw = input.yaw - this.camYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.camYaw += dYaw * Math.min(1, dt * SHUTTLE.camLag);
    const yawRate = (input.yaw - this.lastYaw) / Math.max(dt, 1e-4);
    this.lastYaw = input.yaw;
    // roll fades out near straight up/down so the +/-90 pitch stays stable
    const tgt = Math.max(-SHUTTLE.bankMax, Math.min(SHUTTLE.bankMax, yawRate * 0.35))
      * Math.cos(input.pitch);
    this.bank += (tgt - this.bank) * Math.min(1, dt * 5);
    this.bob = 0;
  }

  private touchdown(y: number) {
    this.mode = "walk";
    this.y = y;
    this.velY = 0;
    this.charge = 0; this.charging = false;
    this.shake = Math.max(this.shake, 0.16);
    this.bank = 0; // walk re-locks camYaw to the look input next frame
  }
}
