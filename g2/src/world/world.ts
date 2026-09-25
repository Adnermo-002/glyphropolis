// World streaming: loads/unloads chunks around the player, aggregates colliders,
// maintains the ground blockmap texture, shard/beacon lists and landmark registry.

import { CFG } from '../config';
import { districtAt, groundInfoAt, LANDMARKS } from './districts';
import { genChunk, seedNum, type Chunk } from './citygen';
import type { BoxCollider } from './geo';
import type { AnimPart } from './archetypes';
import type { Pipeline } from '../render/pipeline';
import { rngFrom } from '../core/rng';

export interface LiveShard { x: number; y: number; z: number; glyph: number; chunkKey: string; idx: number }
export interface LiveBeacon { x: number; y: number; z: number; rings: { x: number; y: number; z: number }[]; chunkKey: string }
export interface LandmarkSpot { id: string; name: string; x: number; z: number }

const key = (bx: number, bz: number) => `${bx},${bz}`;

export class World {
  chunks = new Map<string, Chunk>();
  colliders: BoxCollider[] = [];
  shards: LiveShard[] = [];
  beacons: LiveBeacon[] = [];
  landmarks: LandmarkSpot[] = LANDMARKS.map((l) => ({ id: l.id, name: l.name, x: l.bx * CFG.P + 36, z: l.bz * CFG.P + 36 }));
  anims: AnimPart[] = [];
  private seedStr: string;
  seed: number;
  private pipeline: Pipeline;
  private blockMapData = new Uint8Array(32 * 32 * 4);

  constructor(seedStr: string, pipeline: Pipeline) {
    this.seedStr = seedStr;
    this.seed = seedNum(seedStr);
    this.pipeline = pipeline;
  }

  playerBlock(x: number, z: number): [number, number] {
    return [Math.floor(x / CFG.P), Math.floor(z / CFG.P)];
  }

  districtAt(x: number, z: number): number {
    const [bx, bz] = this.playerBlock(x, z);
    return districtAt(bx, bz, this.seed);
  }

  private loadChunk(bx: number, bz: number): void {
    const k = key(bx, bz);
    if (this.chunks.has(k)) return;
    const c = genChunk(bx, bz, this.seedStr, this.pipeline.worldMat, this.pipeline.beamMat);
    if (c.mesh) this.pipeline.addMesh(c.mesh);
    if (c.beamMesh) this.pipeline.addMesh(c.beamMesh);
    this.chunks.set(k, c);
    this.refreshLists();
  }

  private unloadChunk(k: string): void {
    const c = this.chunks.get(k);
    if (!c) return;
    if (c.mesh) this.pipeline.removeMesh(c.mesh);
    if (c.beamMesh) this.pipeline.removeMesh(c.beamMesh);
    this.chunks.delete(k);
    this.refreshLists();
  }

  private refreshLists(): void {
    this.colliders = [];
    this.anims = [];
    this.shards = [];
    this.beacons = [];
    for (const [k, c] of this.chunks) {
      this.colliders.push(...c.colliders);
      this.anims.push(...c.anims);
      for (const s of c.shards) this.shards.push({ ...s, chunkKey: k, idx: c.shards.indexOf(s) });
      if (c.beacon) this.beacons.push({ ...c.beacon, chunkKey: k });
    }
  }

  /** number of chunks still missing around (px, pz) */
  pending(px: number, pz: number): number {
    const [pbx, pbz] = this.playerBlock(px, pz);
    let n = 0;
    for (let dx = -CFG.RADIUS; dx <= CFG.RADIUS; dx++) {
      for (let dz = -CFG.RADIUS; dz <= CFG.RADIUS; dz++) if (!this.chunks.has(key(pbx + dx, pbz + dz))) n++;
    }
    return n;
  }

  /** load missing chunks within budget (ms), then unload distant ones. */
  update(px: number, pz: number, budgetMs: number): void {
    const [pbx, pbz] = this.playerBlock(px, pz);
    const t0 = performance.now();
    const missing: { bx: number; bz: number; ring: number }[] = [];
    for (let dx = -CFG.RADIUS; dx <= CFG.RADIUS; dx++) {
      for (let dz = -CFG.RADIUS; dz <= CFG.RADIUS; dz++) {
        const k = key(pbx + dx, pbz + dz);
        if (!this.chunks.has(k)) missing.push({ bx: pbx + dx, bz: pbz + dz, ring: Math.max(Math.abs(dx), Math.abs(dz)) });
      }
    }
    missing.sort((a, b) => a.ring - b.ring || (a.bx + a.bz) - (b.bx + b.bz));
    while (missing.length > 0) {
      const m = missing.shift()!;
      this.loadChunk(m.bx, m.bz);
      if (performance.now() - t0 > budgetMs) break;
    }
    // unload
    for (const k of Array.from(this.chunks.keys())) {
      const [bx, bz] = k.split(',').map(Number);
      if (Math.abs(bx - pbx) > CFG.RADIUS + 1 || Math.abs(bz - pbz) > CFG.RADIUS + 1) this.unloadChunk(k);
    }
    // the ground blockmap only changes when the player crosses into another block
    if (pbx !== this.mapBx || pbz !== this.mapBz) {
      this.mapBx = pbx; this.mapBz = pbz;
      this.updateBlockMap(pbx, pbz);
    }
  }
  private mapBx = NaN;
  private mapBz = NaN;

  updateBlockMap(pbx: number, pbz: number): void {
    const ox = pbx - 16, oz = pbz - 16;
    const data = this.blockMapData;
    for (let j = 0; j < 32; j++) {
      for (let i = 0; i < 32; i++) {
        const [t, p, h] = groundInfoAt(ox + i, oz + j, this.seed);
        const o = (j * 32 + i) * 4;
        data[o] = t;
        data[o + 1] = p;
        data[o + 2] = h;
        data[o + 3] = 255;
      }
    }
    this.pipeline.setBlockOrigin(ox, oz);
    this.pipeline.setBlockData(data);
  }

  animate(dt: number): void {
    for (const a of this.anims) a.fn(dt);
  }

  /** find a walkable spawn point near the (1,1) block center. */
  findSpawn(): [number, number, number] {
    const cx = 108, cz = 108;
    const cand: [number, number][] = [
      [cx, cz], [cx + 20, cz], [cx - 20, cz], [cx, cz + 20], [cx, cz - 20],
      [cx + 14, cz + 14], [cx - 14, cz - 14], [cx + 14, cz - 14], [cx - 14, cz + 14],
    ];
    for (const [x, z] of cand) {
      let free = true;
      for (const c of this.colliders) {
        if (c.y1 < 0.5) continue;
        if (x > c.x0 - 0.7 && x < c.x1 + 0.7 && z > c.z0 - 0.7 && z < c.z1 + 0.7) { free = false; break; }
      }
      if (free) return [x, 0, z];
    }
    return [cx, 0, cz];
  }

  /** deterministic shard total for the HUD (approx: regenerating is heavy; use a hash-based count). */
  shardTotalApprox(): number {
    const r = rngFrom(this.seedStr, 0x77aa);
    let total = 0;
    for (let i = 0; i < 64; i++) total += r() < 0.62 ? (r() < 0.28 ? 2 : 1) : 0;
    return total;
  }
}
