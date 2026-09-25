// Chase camera with collision against city colliders (ray from eye to desired position).

import * as THREE from 'three';
import { CFG } from '../config';
import type { World } from '../world/world';
import type { Player } from './player';

export class ChaseCamera {
  pos = new THREE.Vector3();
  quat = new THREE.Quaternion();
  /** current camera-to-eye distance (the avatar hides when the camera is pushed into it) */
  dist = 0;
  private e = new THREE.Euler();
  private world: World;
  private smoothed = new THREE.Vector3();
  private hasInit = false;
  private pull = 0;

  constructor(world: World) {
    this.world = world;
  }

  smoothedInit(x: number, y: number, z: number): void {
    this.smoothed.set(x, y, z);
    this.hasInit = true;
  }

  update(dt: number, player: Player): void {
    const s = player.state;
    const eye = player.eyePosition();
    const f = player.forward();
    // over-the-shoulder framing: the camera rides a little above the eye line, so the avatar sits
    // below the crosshair instead of covering it
    // and a little to the right, so looking up/down never puts the avatar over the crosshair
    const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    // in flight the camera eases back with speed: more of the city in view, and a sense of speed
    const flyK = s.flying ? Math.min(s.vel.length() / CFG.FLY.BOOST, 1) : 0;
    this.pull += ((s.flying ? 0.6 + flyK * 1.6 : 0) - this.pull) * (1 - Math.exp(-dt * 2.5));
    const D = CFG.CAM.DIST + this.pull;
    const desired = new THREE.Vector3(
      eye.x - f.x * D + rx * CFG.CAM.SIDE,
      eye.y - f.y * D + CFG.CAM.RISE,
      eye.z - f.z * D + rz * CFG.CAM.SIDE,
    );
    // ray from eye toward desired, stop at colliders
    const dir = desired.clone().sub(eye);
    const dist = dir.length();
    dir.normalize();
    let tmax = dist;
    for (const c of this.world.colliders) {
      let tmin = 0.0, tmaxi = tmax;
      for (let a = 0; a < 3; a++) {
        const o = eye.getComponent(a);
        const d = dir.getComponent(a);
        const c0 = a === 0 ? c.x0 : a === 1 ? c.y0 : c.z0;
        const c1 = a === 0 ? c.x1 : a === 1 ? c.y1 : c.z1;
        if (Math.abs(d) < 1e-8) {
          if (o < c0 || o > c1) { tmin = Infinity; break; }
        } else {
          let t1 = (c0 - o) / d, t2 = (c1 - o) / d;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          tmin = Math.max(tmin, t1);
          tmaxi = Math.min(tmaxi, t2);
          if (tmin > tmaxi) { tmin = Infinity; break; }
        }
      }
      if (tmin < Infinity && tmin < tmax) tmax = tmin;
    }
    const t = Math.max(0.35, tmax - 0.18);
    const target = new THREE.Vector3(
      eye.x + dir.x * t,
      Math.max(0.25, eye.y + dir.y * t),
      eye.z + dir.z * t,
    );
    if (!this.hasInit) {
      this.smoothed.copy(target);
      this.hasInit = true;
    }
    const k = 1 - Math.exp(-dt * 24);
    this.smoothed.lerp(target, k);
    this.pos.copy(this.smoothed);
    this.dist = this.pos.distanceTo(eye);
    this.e.set(s.pitch, s.yaw, 0, 'YXZ');
    this.quat.setFromEuler(this.e);
  }
}
