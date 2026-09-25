// Glyph shards (collectibles) and beacon rings (challenge course).

import * as THREE from 'three';
import { MAT } from '../config';
import type { LiveBeacon, LiveShard } from '../world/world';

export class Collectibles {
  shards: THREE.InstancedMesh;
  rings: THREE.Mesh[] = [];
  private ringGeo: THREE.TorusGeometry;
  private ringMat: THREE.MeshBasicMaterial;
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

    this.ringGeo = new THREE.TorusGeometry(2.8, 0.2, 8, 28);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x35e0b8, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push(mesh);
    }
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

    // rings
    for (let i = 0; i < this.rings.length; i++) {
      const rm = this.rings[i];
      if (activeBeacon && i < activeBeacon.rings.length) {
        const rp = activeBeacon.rings[i];
        rm.visible = true;
        rm.position.set(rp.x, rp.y, rp.z);
        rm.rotation.y += dt * (i === ringIndex ? 1.6 : 0.4);
        const mat = rm.material as THREE.MeshBasicMaterial;
        if (i < ringIndex) { mat.color.setHex(0x22332f); mat.opacity = 0.35; }
        else if (i === ringIndex) { mat.color.setHex(0xffd166); mat.opacity = 0.95; }
        else { mat.color.setHex(0x35e0b8); mat.opacity = 0.55; }
      } else {
        rm.visible = false;
      }
    }
  }
}
