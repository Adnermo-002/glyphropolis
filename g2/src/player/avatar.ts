// The player's avatar for the chase camera: a small articulated figure (legs, arms, torso, head,
// cape, glowing chest emblem) animated from the player state, including a superman flight pose. Rendered through the normal
// world material, so the ASCII pass outlines it like any other object.

import * as THREE from 'three';
import { MAT } from '../config';
import type { PlayerState } from './player';

type RGB = [number, number, number];

const JACKET: RGB = [0.86, 0.4, 0.16];
const PANTS: RGB = [0.13, 0.15, 0.24];
const SKIN: RGB = [0.86, 0.68, 0.52];
const HAIR: RGB = [0.1, 0.08, 0.08];
const SCARF: RGB = [0.1, 0.72, 0.68];
const CAPE: RGB = [0.86, 0.16, 0.14];
const EMBLEM: RGB = [1.0, 0.82, 0.25];

/** box geometry carrying the world shader's attributes; `hang` puts the pivot at the top face */
function part(w: number, h: number, d: number, color: RGB, mat: number = MAT.PERSON, hang = false): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (hang) g.translate(0, -h / 2, 0);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 4] = color[0]; col[i * 4 + 1] = color[1]; col[i * 4 + 2] = color[2]; col[i * 4 + 3] = 1;
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(mat), 1));
  // aParams.w doubles as the object id in the cell pass (distinct outline region per part group)
  const par = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) par[i * 4 + 3] = 3;
  g.setAttribute('aParams', new THREE.BufferAttribute(par, 4));
  g.setAttribute('aFacade', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  return g;
}

function approach(cur: number, target: number, k: number): number {
  return cur + (target - cur) * k;
}

export class Avatar {
  readonly root = new THREE.Group();
  /** everything above the feet; pivots at the waist so the flight pose can lay the body flat */
  private body = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private cape: THREE.Mesh;
  private heading = 0;
  private headingInit = false;
  private phase = 0;
  private clock = 0;
  private flyBlend = 0;

  constructor(worldMat: THREE.Material) {
    const PIV = 1.0; // waist height
    const mesh = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(g, worldMat);
      m.position.set(x, y - PIV, z);
      m.frustumCulled = false;
      this.body.add(m);
      return m;
    };
    this.body.position.y = PIV;
    this.root.add(this.body);
    // legs pivot at the hips, arms at the shoulders (local -z is forward)
    this.legL = mesh(part(0.17, 0.88, 0.2, PANTS, MAT.PERSON, true), -0.12, 0.9, 0);
    this.legR = mesh(part(0.17, 0.88, 0.2, PANTS, MAT.PERSON, true), 0.12, 0.9, 0);
    mesh(part(0.46, 0.62, 0.28, JACKET), 0, 1.2, 0);                 // torso
    mesh(part(0.16, 0.16, 0.03, EMBLEM, MAT.LIGHT), 0, 1.3, -0.15);  // chest emblem (glows at night)
    mesh(part(0.3, 0.3, 0.3, SKIN), 0, 1.68, 0);                     // head
    mesh(part(0.32, 0.1, 0.32, HAIR), 0, 1.86, 0.01);                // hair
    this.armL = mesh(part(0.13, 0.62, 0.15, JACKET, MAT.PERSON, true), -0.31, 1.47, 0);
    this.armR = mesh(part(0.13, 0.62, 0.15, JACKET, MAT.PERSON, true), 0.31, 1.47, 0);
    mesh(part(0.34, 0.1, 0.32, SCARF), 0, 1.5, 0);                   // collar
    this.cape = mesh(part(0.5, 1.05, 0.04, CAPE, MAT.PERSON, true), 0, 1.52, 0.17);
  }

  update(dt: number, s: PlayerState, camDist: number, show: boolean): void {
    // hide when the camera is pushed into the avatar (tight spaces) or in cinematic views
    this.root.visible = show && camDist > 1.15;
    if (!this.root.visible) return;
    const k = 1 - Math.exp(-dt * 12);
    this.clock += dt;
    this.root.position.copy(s.pos);
    const v3 = s.vel.length();

    // heading (same convention as the camera yaw: forward = (-sin h, 0, -cos h), rotation.y = h)
    if (!this.headingInit) { this.heading = s.yaw; this.headingInit = true; }
    let target = this.heading, turn = 0;
    if (s.flying) {
      target = s.speed > 2 ? Math.atan2(-s.vel.x, -s.vel.z) : s.yaw;
      turn = 7;
    } else if (s.speed > 0.6) {
      target = Math.atan2(-s.vel.x, -s.vel.z);
      turn = 18;
    } else if (s.grappling) {
      target = s.yaw;
      turn = 8;
    }
    if (turn > 0) {
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-dt * turn));
    }
    this.root.rotation.y = this.heading;

    this.flyBlend = approach(this.flyBlend, s.flying ? 1 : 0, 1 - Math.exp(-dt * 6));
    let legL = 0, legR = 0, armLx = 0, armRx = 0, armLz = 0, armRz = 0, lean = 0, bob = 0, capeX = 0;

    if (s.flying) {
      // 0 = hovering upright, 1 = full superman stretch
      const fly = Math.min(Math.max((v3 - 3) / 12, 0), 1);
      // the body's long axis follows the velocity: level flight lies flat, straight up stands tall,
      // a dive goes head-first
      const tilt = Math.min(Math.atan2(s.speed, s.vel.y), 2.4);
      lean = -0.12 * (1 - fly) - tilt * fly;
      // right fist punches ahead, left arm streams along the body; hovering: arms loose and wide
      armRx = 0.25 * (1 - fly) + 3.05 * fly;
      armLx = 0.1 + 0.05 * fly;
      armLz = 0.35 * (1 - fly) + 0.12 * fly;
      armRz = 0.35 * (1 - fly);
      // legs together, one knee slightly bent; hovering they dangle and sway
      const sway = Math.sin(this.clock * 1.8) * 0.12 * (1 - fly);
      legL = 0.05 * fly + sway;
      legR = 0.32 * fly - sway + 0.12 * (1 - fly);
      bob = Math.sin(this.clock * 2.2) * 0.07 * (1 - fly);
      // cape streams behind and flutters harder with speed
      this.phase += dt * (3 + v3 * 0.35);
      capeX = -(0.1 + 0.12 * (1 - fly) + Math.sin(this.phase * 3.1) * (0.06 + 0.1 * fly));
    } else if (s.onGround) {
      const amp = Math.min(s.speed / 5, 1);
      this.phase += dt * (2.2 + s.speed * 1.7);
      const a = Math.sin(this.phase) * 0.75 * amp;
      legL = a; legR = -a;
      armLx = -a * 0.8; armRx = a * 0.8;
      lean = -0.12 * Math.min(s.speed / 8, 1);
      const trail = Math.min(s.speed / 9, 1) * 1.1;
      capeX = -(0.12 + trail + Math.sin(this.phase * 1.7) * 0.1 * amp);
    } else {
      // jumping / falling: tuck on the way up, reach out on the way down
      legL = s.vel.y > 0 ? 0.55 : 0.25;
      legR = legL * 0.4;
      armLz = 0.5; armRz = 0.5;
      capeX = s.vel.y > 0 ? -0.4 : -1.2; // air pushes the cape up while falling
    }
    if (s.grappling) { armRx = 2.6; armRz = 0; } // right arm points at the anchor

    this.legL.rotation.x = approach(this.legL.rotation.x, legL, k);
    this.legR.rotation.x = approach(this.legR.rotation.x, legR, k);
    this.armL.rotation.x = approach(this.armL.rotation.x, armLx, k);
    this.armR.rotation.x = approach(this.armR.rotation.x, armRx, k);
    this.armL.rotation.z = approach(this.armL.rotation.z, -armLz, k);
    this.armR.rotation.z = approach(this.armR.rotation.z, armRz, k);
    this.body.rotation.x = approach(this.body.rotation.x, lean, 1 - Math.exp(-dt * 7));
    this.body.position.y = 1.0 + bob;
    this.cape.rotation.x = approach(this.cape.rotation.x, capeX, k);
  }
}
