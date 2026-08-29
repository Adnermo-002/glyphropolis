import * as THREE from "three";
import { PLAYER } from "../config";
import type { Input } from "../core/input";
import type { World } from "../world/world";

// First-person walker: WASD + mouse look with soft accel, circle-vs-AABB
// collision against building footprints, subtle head bob.
export class Player {
  x = 0; z = 6;
  velX = 0; velZ = 0;
  bobPhase = 0;
  private tmp = new THREE.Vector3();

  constructor(public yaw = 0, public pitch = -0.03) {}

  update(dt: number, input: Input, camera: THREE.PerspectiveCamera, world: World, obstacles?: number[]) {
    input.applyLook();
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

    const spd = Math.hypot(this.velX, this.velZ);
    this.bobPhase += spd * dt * PLAYER.bobFreq * 0.22;
    const bob = Math.sin(this.bobPhase) * PLAYER.bobAmp * Math.min(spd / PLAYER.walk, 1.4);

    camera.position.set(this.x, PLAYER.eye + bob, this.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = input.yaw;
    camera.rotation.x = input.pitch;
    this.tmp.set(0, 0, 0);
  }
}
