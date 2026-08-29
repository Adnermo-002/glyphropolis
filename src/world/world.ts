import * as THREE from "three";
import { CITY } from "../config";
import { hash2 } from "../core/rng";
import { genChunk, ChunkData } from "./citygen";
import { makeBuildingMaterial, makePropsMaterial } from "../render/materials";

interface LiveChunk { data: ChunkData; group: THREE.Group; }

const key = (cx: number, cz: number) => cx + "," + cz;

export class World {
  live = new Map<string, LiveChunk>();
  private queue: [number, number][] = [];
  private baseBox: THREE.BoxGeometry;
  private trunkGeo: THREE.CylinderGeometry;
  private foliageGeo: THREE.SphereGeometry;
  private parkGeo: THREE.PlaneGeometry;
  buildingMat: THREE.ShaderMaterial;
  propsMat: THREE.ShaderMaterial;

  constructor(private scene: THREE.Scene, public seedNum: number) {
    this.buildingMat = makeBuildingMaterial();
    this.propsMat = makePropsMaterial();
    this.baseBox = new THREE.BoxGeometry(1, 1, 1);
    this.trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.4, 5);
    this.foliageGeo = new THREE.SphereGeometry(1, 7, 5);
    this.parkGeo = new THREE.PlaneGeometry(CITY.blockPitch - 12, CITY.blockPitch - 12);
    this.parkGeo.rotateX(-Math.PI / 2);
  }

  dispose() {
    for (const c of this.live.values()) this.destroyChunk(c);
    this.live.clear();
  }

  // Streams chunks around (px,pz), spending at most ~budgetMs of CPU per call.
  update(px: number, pz: number, budgetMs = 6) {
    const P = CITY.blockPitch;
    const pcx = Math.floor(px / P), pcz = Math.floor(pz / P);
    const R = CITY.chunkLoadRadius, RU = CITY.chunkUnloadRadius;

    for (const [k, c] of this.live) {
      if (Math.max(Math.abs(c.data.cx - pcx), Math.abs(c.data.cz - pcz)) > RU) {
        this.destroyChunk(c); this.live.delete(k);
      }
    }
    if (this.queue.length === 0 || this.needRescan(pcx, pcz)) {
      this.queue = [];
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (!this.live.has(key(cx, cz))) this.queue.push([cx, cz]);
      }
      this.queue.sort((a, b) =>
        (Math.abs(a[0] - pcx) + Math.abs(a[1] - pcz)) - (Math.abs(b[0] - pcx) + Math.abs(b[1] - pcz)));
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const [cx, cz] = this.queue.shift()!;
      if (!this.live.has(key(cx, cz))) this.spawnChunk(cx, cz);
    }
  }

  private lastScan = "";
  private needRescan(pcx: number, pcz: number): boolean {
    const k = key(pcx, pcz);
    if (k !== this.lastScan) { this.lastScan = k; return true; }
    return false;
  }

  readyAround(px: number, pz: number, rChunks: number): boolean {
    const P = CITY.blockPitch;
    const pcx = Math.floor(px / P), pcz = Math.floor(pz / P);
    for (let dx = -rChunks; dx <= rChunks; dx++)
      for (let dz = -rChunks; dz <= rChunks; dz++)
        if (!this.live.has(key(pcx + dx, pcz + dz))) return false;
    return true;
  }

  private spawnChunk(cx: number, cz: number) {
    const data = genChunk(this.seedNum, cx, cz);
    const group = new THREE.Group();
    const P = CITY.blockPitch;
    const ox = cx * P + P / 2, oz = cz * P + P / 2;

    if (data.boxes.length) {
      const n = data.boxes.length;
      const geo = this.baseBox.clone();
      const aSeed = new Float32Array(n), aOrigin = new Float32Array(n * 3), aScale = new Float32Array(n * 3);
      const mesh = new THREE.InstancedMesh(geo, this.buildingMat, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const b = data.boxes[i];
        m.makeScale(b.sx, b.sy, b.sz);
        m.setPosition(b.x, b.y0 + b.sy / 2, b.z);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(b.r, b.g, b.b));
        aSeed[i] = b.seed;
        aOrigin.set([b.x, b.y0, b.z], i * 3);
        aScale.set([b.sx, b.sy, b.sz], i * 3);
      }
      geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(aSeed, 1));
      geo.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(aOrigin, 3));
      geo.setAttribute("aScale", new THREE.InstancedBufferAttribute(aScale, 3));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.setChunkBounds(mesh, cx, cz, 220);
      group.add(mesh);
    }

    if (data.trees.length) {
      const n = data.trees.length;
      const S = 4; // foliage spheres per tree
      // Geometries are cloned per chunk: a shared geometry would have its
      // bounding sphere overwritten by the latest chunk spawned, wrongly
      // frustum-culling every earlier chunk's trees.
      const trunkGeo = this.trunkGeo.clone();
      const foliageGeo = this.foliageGeo.clone();
      const trunks = new THREE.InstancedMesh(trunkGeo, this.propsMat, n);
      const foliage = new THREE.InstancedMesh(foliageGeo, this.propsMat, n * S);
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      // natural foliage: one big crown sphere + 3 smaller offset ones
      const blobs: [number, number, number, number][] = [
        [0, 3.35, 0, 1.4],
        [0.85, 2.5, 0.55, 0.95],
        [-0.8, 2.65, -0.6, 1.0],
        [0.15, 4.3, -0.3, 0.85],
      ];
      let fi = 0;
      for (let i = 0; i < n; i++) {
        const t = data.trees[i];
        m.makeScale(t.s, t.s, t.s); m.setPosition(t.x, 1.2 * t.s, t.z);
        trunks.setMatrixAt(i, m); trunks.setColorAt(i, new THREE.Color(0.23, 0.16, 0.1));
        const autumn = hash2(this.seedNum, cx + i, cz * 11) < 0.07;
        for (let b = 0; b < S; b++) {
          const [ox, oy, oz, r] = blobs[b];
          const j = 0.85 + hash2(this.seedNum, cx * 5 + i * S + b, cz * 9) * 0.35;
          m.makeScale(r * t.s * j, r * t.s * j, r * t.s * j);
          m.setPosition(t.x + ox * t.s, oy * t.s, t.z + oz * t.s);
          foliage.setMatrixAt(fi, m);
          const gp = 0.24 + hash2(this.seedNum, i * S + b + 1, cx + cz * 7) * 0.15;
          if (autumn) col.setRGB(gp * 2.1, gp * 1.1, gp * 0.25);
          else col.setRGB(gp * 0.55, gp * 1.5, gp * 0.5);
          foliage.setColorAt(fi, col);
          fi++;
        }
      }
      this.setChunkBounds(trunks, cx, cz, 40);
      this.setChunkBounds(foliage, cx, cz, 40);
      group.add(trunks, foliage);
    }

    if (data.park) {
      // park lawn as a 1-instance InstancedMesh so instanceColor carries the tint
      const one = new THREE.InstancedMesh(this.parkGeo.clone(), this.propsMat, 1);
      const m = new THREE.Matrix4(); m.setPosition(ox, 0.02, oz);
      one.setMatrixAt(0, m); one.setColorAt(0, new THREE.Color(0.09, 0.2, 0.08));
      this.setChunkBounds(one, cx, cz, 40);
      group.add(one);
    }

    this.scene.add(group);
    this.live.set(key(cx, cz), { data, group });
  }

  private setChunkBounds(mesh: THREE.InstancedMesh, cx: number, cz: number, h: number) {
    const P = CITY.blockPitch;
    const sphere = new THREE.Sphere(
      new THREE.Vector3(cx * P + P / 2, h / 2, cz * P + P / 2), Math.sqrt(2) * P * 0.75 + h * 0.6);
    mesh.geometry.boundingSphere = sphere.clone();
    // three r170 frustum-culls InstancedMesh by the INSTANCE-level sphere;
    // pin a generous one so a stale cached computation can never hide trees.
    mesh.boundingSphere = sphere.clone();
  }

  private destroyChunk(c: LiveChunk) {
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        im.geometry.dispose(); // every chunk mesh owns a cloned geometry
        if (im.instanceColor) im.instanceColor = null as unknown as THREE.InstancedBufferAttribute;
      }
    });
  }

  // --- collision: circle (px,pz,r) vs building boxes whose base is near ground
  collide(px: number, pz: number, r: number): [number, number] {
    const P = CITY.blockPitch;
    const pcx = Math.floor(px / P), pcz = Math.floor(pz / P);
    let x = px, z = pz;
    for (let pass = 0; pass < 2; pass++) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const c = this.live.get(key(pcx + dx, pcz + dz));
        if (!c) continue;
        for (const b of c.data.boxes) {
          if (b.y0 > 2.0) continue; // upper tiers: walk under? no - skip only elevated tiers
          const nx = Math.max(b.x - b.sx / 2, Math.min(x, b.x + b.sx / 2));
          const nz = Math.max(b.z - b.sz / 2, Math.min(z, b.z + b.sz / 2));
          const ddx = x - nx, ddz = z - nz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = (r - d) / d;
            if (d2 > 1e-8) { x += ddx * push; z += ddz * push; }
            else { x = b.x + (b.sx / 2 + r) * (x >= b.x ? 1 : -1); }
          }
        }
      }
    }
    return [x, z];
  }

  // boxes for minimap: [x, z, sx, sz] of near chunks
  minimapBoxes(px: number, pz: number, radiusChunks = 5): number[] {
    const P = CITY.blockPitch;
    const pcx = Math.floor(px / P), pcz = Math.floor(pz / P);
    const out: number[] = [];
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++)
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        const c = this.live.get(key(pcx + dx, pcz + dz));
        if (!c) continue;
        for (const b of c.data.boxes) {
          if (b.y0 < 2) out.push(b.x, b.z, b.sx, b.sz);
        }
      }
    return out;
  }
}
