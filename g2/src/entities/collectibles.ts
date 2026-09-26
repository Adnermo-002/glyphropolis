// Glyph shards (collectibles) and beacon rings (challenge course).

import * as THREE from 'three';
import { MAT } from '../config';
import type { LiveBeacon, LiveShard } from '../world/world';

export class Collectibles {
  shards: THREE.InstancedMesh;
  /** beacon course rings: 5 instances of a torus drawn by the world shader (self-lit MAT.LIGHT).
   *  (a plain MeshBasicMaterial cannot draw into the two-target scene buffer: WebGL2 rejects the
   *  draw when a shader lacks an output for an active draw buffer, so the rings were invisible) */
  rings: THREE.InstancedMesh;
  private ringSpin: number[] = [0, 0, 0, 0, 0];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private N = 64;

  constructor(scene: THREE.Scene, worldMat: THREE.Material) {
    const geo = new THREE.OctahedronGeometry(0.55);
    const n = geo.attributes.position.count;
    geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n).fill(MAT.SHARD), 1));
    geo.setAttribute('aParams', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const fac = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) fac[i * 4 + 3] = 100 + 0x5b57; // default, overridden per shard
    geo.setAttribute('aFacade', new THREE.InstancedBufferAttribute(fac, 4));
    const col = new Float32Array(this.N * 4);
    for (let i = 0; i < this.N; i++) { col[i * 4] = 0.35; col[i * 4 + 1] = 1.0; col[i * 4 + 2] = 0.85; col[i * 4 + 3] = 1; }
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 4));
    this.shards = new THREE.InstancedMesh(geo, worldMat, this.N);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.shards);

    const rg = new THREE.TorusGeometry(2.8, 0.22, 8, 28);
    const rn = rg.attributes.position.count;
    rg.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(rn).fill(MAT.LIGHT), 1));
    rg.setAttribute('aParams', new THREE.BufferAttribute(new Float32Array(rn * 4), 4));
    rg.setAttribute('aFacade', new THREE.InstancedBufferAttribute(new Float32Array(5 * 4), 4));
    rg.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(5 * 4).fill(1), 4));
    this.rings = new THREE.InstancedMesh(rg, worldMat, 5);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.rings.visible = false;
    scene.add(this.rings);
  }

  update(dt: number, time: number, live: LiveShard[], collected: Set<string>, activeBeacon: LiveBeacon | null, ringIndex: number): void {
    const n = Math.min(live.length, this.N);
    for (let i = 0; i < n; i++) {
      const s = live[i];
      const id = `${s.chunkKey}:${s.idx}`;
      if (collected.has(id)) {
        this.m.compose(this.v.set(0, -50, 0), this.q.identity(), this.s.set(0.001, 0.001, 0.001));
      } else {
        this.v.set(s.x, s.y + Math.sin(time * 2 + s.idx * 1.7) * 0.28, s.z);
        this.q.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2), time * 1.4 + s.idx);
        this.m.compose(this.v, this.q, this.s.set(1, 1, 1));
      }
      this.shards.setMatrixAt(i, this.m);
    }
    for (let i = n; i < this.N; i++) {
      this.m.compose(this.v.set(0, -50, 0), this.q.identity(), this.s.set(0.001, 0.001, 0.001));
      this.shards.setMatrixAt(i, this.m);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    // per-instance glyph (aFacade.w)
    const fac = this.shards.geometry.getAttribute('aFacade') as THREE.InstancedBufferAttribute;
    for (let i = 0; i < n; i++) fac.setW(i, 100 + live[i].glyph);
    fac.needsUpdate = true;

    // rings: passed = dim grey-green, current = gold, upcoming = teal
    this.rings.visible = !!activeBeacon;
    if (activeBeacon) {
      const rc = this.rings.geometry.getAttribute('aColor') as THREE.InstancedBufferAttribute;
      for (let i = 0; i < 5; i++) {
        if (i < activeBeacon.rings.length) {
          const rp = activeBeacon.rings[i];
          this.ringSpin[i] += dt * (i === ringIndex ? 1.6 : 0.4);
          this.q.setFromAxisAngle(this.v.set(0, 1, 0), this.ringSpin[i]);
          this.m.compose(this.v.set(rp.x, rp.y, rp.z), this.q, this.s.set(1, 1, 1));
          if (i < ringIndex) rc.setXYZW(i, 0.13, 0.2, 0.18, 1);
          else if (i === ringIndex) rc.setXYZW(i, 1.0, 0.82, 0.4, 1);
          else rc.setXYZW(i, 0.21, 0.88, 0.72, 1);
        } else {
          this.m.compose(this.v.set(0, -50, 0), this.q.identity(), this.s.set(0.001, 0.001, 0.001));
        }
        this.rings.setMatrixAt(i, this.m);
      }
      this.rings.instanceMatrix.needsUpdate = true;
      rc.needsUpdate = true;
    }
  }
}
