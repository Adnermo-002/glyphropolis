// Sidewalk pedestrians with umbrellas in rain.

import * as THREE from 'three';
import { MAT } from '../config';
import { rangeF, rngFrom, type Rng } from '../core/rng';

const PED_COLORS: [number, number, number][] = [
  [0.5, 0.5, 0.55], [0.6, 0.35, 0.3], [0.35, 0.45, 0.6], [0.6, 0.55, 0.4],
  [0.45, 0.55, 0.45], [0.55, 0.4, 0.55], [0.7, 0.7, 0.75],
];

interface Ped {
  axis: 0 | 1;
  line: number;
  off: number;
  dir: 1 | -1;
  t: number;
  speed: number;
  phase: number;
}

export class Pedestrians {
  mesh: THREE.InstancedMesh;
  umbrellas: THREE.InstancedMesh;
  private state: Ped[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private N = 110;

  constructor(scene: THREE.Scene, worldMat: THREE.Material, seedStr: string) {
    const r: Rng = rngFrom(seedStr, 0x7ed3);
    const geo = new THREE.BoxGeometry(0.45, 1.7, 0.3);
    const n = geo.attributes.position.count;
    const matA = new Float32Array(n).fill(MAT.PERSON);
    const par = new Float32Array(n * 4);
    const fac = new Float32Array(n * 4);
    geo.setAttribute('aMat', new THREE.BufferAttribute(matA, 1));
    geo.setAttribute('aParams', new THREE.BufferAttribute(par, 4));
    geo.setAttribute('aFacade', new THREE.BufferAttribute(fac, 4));
    const col = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) {
      const c = PED_COLORS[i % PED_COLORS.length];
      col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = 1;
    }
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 4));
    this.mesh = new THREE.InstancedMesh(geo, worldMat, this.N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const ug = new THREE.ConeGeometry(1.0, 0.55, 8);
    const un = ug.attributes.position.count;
    ug.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(un).fill(MAT.PERSON), 1));
    ug.setAttribute('aParams', new THREE.BufferAttribute(new Float32Array(un * 4), 4));
    ug.setAttribute('aFacade', new THREE.BufferAttribute(new Float32Array(un * 4), 4));
    const ucol = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) { ucol[i * 4] = 0.75; ucol[i * 4 + 1] = 0.3; ucol[i * 4 + 2] = 0.35; ucol[i * 4 + 3] = 1; }
    ug.setAttribute('aColor', new THREE.InstancedBufferAttribute(ucol, 4));
    this.umbrellas = new THREE.InstancedMesh(ug, worldMat, this.N);
    this.umbrellas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    scene.add(this.mesh, this.umbrellas);

    for (let i = 0; i < this.N; i++) {
      const axis = (r() < 0.5 ? 0 : 1) as 0 | 1;
      const k = Math.floor(rangeF(r, -11, 11));
      const side = r() < 0.5 ? -1 : 1;
      this.state.push({
        axis,
        line: 72 * k,
        off: side * rangeF(r, 7.4, 9.2),
        dir: r() < 0.5 ? 1 : -1,
        t: rangeF(r, -780, 780),
        speed: rangeF(r, 0.9, 1.7),
        phase: r() * Math.PI * 2,
      });
    }
  }

  /** set by the game: true where the ground is sea */
  isWater: (x: number, z: number) => boolean = () => false;

  update(dt: number, time: number, rain: number, px = 0, pz = 0): void {
    for (let i = 0; i < this.N; i++) {
      const s = this.state[i];
      s.t += s.dir * s.speed * dt;
      const along = s.axis === 0 ? pz : px, perp = s.axis === 0 ? px : pz;
      if (s.t - along > 800) s.t -= 1600;
      else if (s.t - along < -800) s.t += 1600;
      if (s.line - perp > 792) s.line -= 1584;
      else if (s.line - perp < -792) s.line += 1584;
      const bob = Math.sin(time * 6 + s.phase) * 0.04;
      const x = s.axis === 0 ? s.line + s.off : s.t;
      const z = s.axis === 0 ? s.t : s.line + s.off;
      this.v.set(x, 0.85 + bob, z);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.axis === 0 ? (s.dir > 0 ? 0 : Math.PI) : (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      const uOn = rain > 0.35;
      this.v.set(x, 2.05 + bob, z);
      const sc = uOn ? 1 : 0.001;
      this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s);
      this.umbrellas.setMatrixAt(i, this.m);
      this.s.set(1, 1, 1);
      if (this.isWater(x, z)) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        this.umbrellas.setMatrixAt(i, this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.umbrellas.instanceMatrix.needsUpdate = true;
  }
}
