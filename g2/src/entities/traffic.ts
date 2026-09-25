// Street traffic (instanced cars + headlights + beams) and the elevated train.

import * as THREE from 'three';
import { MAT } from '../config';
import { rangeF, rngFrom, type Rng } from '../core/rng';

const CAR_COLORS: [number, number, number][] = [
  [0.65, 0.68, 0.72], [0.75, 0.3, 0.25], [0.3, 0.4, 0.6], [0.8, 0.78, 0.72],
  [0.35, 0.55, 0.4], [0.6, 0.35, 0.6], [0.2, 0.2, 0.22],
];

interface CarState {
  axis: 0 | 1; // 0: runs along z (x const), 1: runs along x (z const)
  line: number; // 72 * k
  off: number; // lateral offset
  dir: 1 | -1;
  t: number;
  speed: number;
}

export class Traffic {
  cars: THREE.InstancedMesh;
  lights: THREE.InstancedMesh;
  beams: THREE.InstancedMesh;
  train: THREE.InstancedMesh;
  trainZ = -100;
  trainTopY = 12.9;
  private state: CarState[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private N = 26;

  constructor(scene: THREE.Scene, worldMat: THREE.Material, beamMat: THREE.Material, seedStr: string) {
    const r: Rng = rngFrom(seedStr, 0xc4a3);
    // car body: length along z
    const carGeo = new THREE.BoxGeometry(1.9, 1.5, 4.6);
    this.fillInstanced(carGeo, MAT.CAR);
    const colorA = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) {
      const c = CAR_COLORS[i % CAR_COLORS.length];
      colorA[i * 4] = c[0]; colorA[i * 4 + 1] = c[1]; colorA[i * 4 + 2] = c[2]; colorA[i * 4 + 3] = 1;
    }
    carGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colorA, 4));
    this.cars = new THREE.InstancedMesh(carGeo, worldMat, this.N);
    this.cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const lightGeo = new THREE.BoxGeometry(1.3, 0.35, 0.3);
    this.fillInstanced(lightGeo, MAT.LIGHT);
    const lc = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) { lc[i * 4] = 1; lc[i * 4 + 1] = 0.9; lc[i * 4 + 2] = 0.6; lc[i * 4 + 3] = 1; }
    lightGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(lc, 4));
    this.lights = new THREE.InstancedMesh(lightGeo, worldMat, this.N);
    this.lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // headlight beam cones (point +z, origin at base)
    const beamGeo = new THREE.CylinderGeometry(1.5, 0.25, 9, 7, 1, true);
    beamGeo.rotateX(Math.PI / 2); // axis along z
    beamGeo.translate(0, 0, 4.5);
    this.fillInstanced(beamGeo, 0);
    const bc = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) { bc[i * 4] = 1; bc[i * 4 + 1] = 0.85; bc[i * 4 + 2] = 0.55; bc[i * 4 + 3] = 0.5; }
    beamGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(bc, 4));
    // per-instance fade: aParams.y is 0 at base; instanced override not available — uniform fade via color intensity
    this.beams = new THREE.InstancedMesh(beamGeo, beamMat, this.N);
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // train: 3 cars
    const trainGeo = new THREE.BoxGeometry(4.2, 3.0, 13.6);
    this.fillInstanced(trainGeo, MAT.TRAIN);
    const tc = new Float32Array(3 * 4);
    for (let i = 0; i < 3; i++) { tc[i * 4] = 0.82; tc[i * 4 + 1] = 0.25; tc[i * 4 + 2] = 0.22; tc[i * 4 + 3] = 1; }
    trainGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(tc, 4));
    this.train = new THREE.InstancedMesh(trainGeo, worldMat, 3);
    this.train.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    scene.add(this.cars, this.lights, this.beams, this.train);

    for (let i = 0; i < this.N; i++) {
      const axis = (r() < 0.5 ? 0 : 1) as 0 | 1;
      const k = Math.floor(rangeF(r, -11, 11));
      const side = r() < 0.5 ? -1 : 1;
      const lane = r() < 0.5 ? 1.9 : 3.7;
      this.state.push({
        axis,
        line: 72 * k,
        off: side * lane,
        dir: side as 1 | -1,
        t: rangeF(r, -780, 780),
        speed: rangeF(r, 8, 13.5),
      });
    }
  }

  private fillInstanced(geo: THREE.BufferGeometry, mat: number): void {
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 4);
    const matA = new Float32Array(n);
    const par = new Float32Array(n * 4);
    const fac = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 4 + 3] = 1;
      matA[i] = mat;
    }
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('aMat', new THREE.BufferAttribute(matA, 1));
    geo.setAttribute('aParams', new THREE.BufferAttribute(par, 4));
    geo.setAttribute('aFacade', new THREE.BufferAttribute(fac, 4));
  }

  /** set by the game: true where the ground is sea */
  isWater: (x: number, z: number) => boolean = () => false;

  update(dt: number, night: number, px = 0, pz = 0): void {
    for (let i = 0; i < this.N; i++) {
      const s = this.state[i];
      s.t += s.dir * s.speed * dt;
      // keep the traffic around the player: cars that end up ~800 m away wrap to the other side
      const along = s.axis === 0 ? pz : px, perp = s.axis === 0 ? px : pz;
      if (s.t - along > 800) s.t -= 1600;
      else if (s.t - along < -800) s.t += 1600;
      if (s.line - perp > 792) s.line -= 1584;
      else if (s.line - perp < -792) s.line += 1584;
      let x: number, z: number, rotY: number;
      if (s.axis === 0) { x = s.line + s.off; z = s.t; rotY = 0; }
      else { x = s.t; z = s.line + s.off; rotY = Math.PI / 2; }
      this.v.set(x, 0.78, z);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      this.m.compose(this.v, this.q, this.s);
      this.cars.setMatrixAt(i, this.m);
      // headlight (front = +z local => +dir)
      const hx = s.axis === 0 ? x : x + s.dir * 2.35;
      const hz = s.axis === 0 ? z + s.dir * 2.35 : z;
      this.v.set(hx, 0.75, hz);
      this.lights.setMatrixAt(i, this.m.clone().setPosition(this.v));
      // beam
      const bx = s.axis === 0 ? x : x + s.dir * 2.3;
      const bz = s.axis === 0 ? z + s.dir * 2.3 : z;
      this.v.set(bx, 0.75, bz);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.axis === 0 ? (s.dir > 0 ? 0 : Math.PI) : (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      this.m.compose(this.v, this.q, this.s);
      this.beams.setMatrixAt(i, this.m);
      // no driving on the sea: hide cars whose road runs through water
      if (this.isWater(x, z)) {
        this.m.makeScale(0, 0, 0);
        this.cars.setMatrixAt(i, this.m);
        this.lights.setMatrixAt(i, this.m);
        this.beams.setMatrixAt(i, this.m);
      }
    }
    this.cars.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    this.beams.visible = night > 0.25;

    // train
    this.trainZ += 12.5 * dt;
    if (this.trainZ - pz > 840) this.trainZ -= 1680;
    else if (this.trainZ - pz < -840) this.trainZ += 1680;
    for (let i = 0; i < 3; i++) {
      this.v.set(-72, this.trainTopY - 1.5, this.trainZ + i * 14.4);
      this.m.compose(this.v, this.q.identity(), this.s);
      this.train.setMatrixAt(i, this.m);
    }
    this.train.instanceMatrix.needsUpdate = true;
  }

  /** if the player is standing on the train, carry them. returns z-velocity or 0. */
  carry(px: number, py: number, pz: number): number {
    if (Math.abs(px + 72) > 2.4 || py < this.trainTopY - 0.35 || py > this.trainTopY + 0.5) return 0;
    const rel = pz - this.trainZ;
    if (rel < -1.2 || rel > 3 * 14.4 + 1.2) return 0;
    return 12.5;
  }
}
