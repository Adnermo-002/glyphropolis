// Chunk generator: turns a block coordinate into merged geometry, colliders, shards and beacons.

import * as THREE from 'three';
import { CFG, DISTRICT, GROUND, MAT } from '../config';
import { chance, hash2i, pick, rand01, rangeF, rangeI, rngFrom, xmur3, type Rng } from '../core/rng';
import { Builder, type BoxCollider } from './geo';
import { districtAt, groundInfoAt, heightAt, landSides, landmarkAt } from './districts';
import {
  CONCRETE2, GRASSC, METALC,
  apartment, bench, cherryTree, containerStack, decoTower, fountain, oldHouse, pavilion, pier,
  pineTree, podium, quayCrane, resHouse, roofExtras, roundGlass, roundTree, ship, skybridge, smokestack, slab, streetBlock, streetLamp,
  streetTree, tank, taperTower, warehouse, waterTower,
} from './archetypes';
import type { AnimPart, RoofTop } from './archetypes';
import {
  buildCrane, buildFerris, buildLighthouse, buildObservatory, buildPagoda, buildSpire,
} from './landmarks';

export interface Shard { x: number; y: number; z: number; glyph: number }
export interface Beacon { x: number; y: number; z: number; rings: { x: number; y: number; z: number }[] }

export interface Chunk {
  bx: number;
  bz: number;
  mesh: THREE.Mesh | null;
  beamMesh: THREE.Mesh | null;
  anims: AnimPart[];
  colliders: BoxCollider[];
  shards: Shard[];
  beacon: Beacon | null;
  landmarkId: string | null;
}

export const SHARD_GLYPHS = [0x5b57, 0x5f62, 0x57ce, 0x5e02, 0x5149, 0x661f, 0x5c71, 0x6d77, 0x6708, 0x5ddd, 0x4e91, 0x98ce, 0x96f2, 0x96ea, 0x96f7, 0x6cc9];

export function seedNum(seedStr: string): number {
  return xmur3(seedStr)() >>> 0;
}

export function genChunk(bx: number, bz: number, seedStr: string, worldMat: THREE.Material, beamMat: THREE.Material): Chunk {
  const seed = seedNum(seedStr);
  const h0 = hash2i(bx, bz, seed);
  const r: Rng = rngFrom(seedStr, h0);
  const b = new Builder();
  const rooftops: RoofTop[] = [];
  const anims: AnimPart[] = [];
  const x0 = bx * CFG.P, z0 = bz * CFG.P;
  const x1 = x0 + CFG.P, z1 = z0 + CFG.P;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const lm = landmarkAt(bx, bz);
  const [gtype, gpar] = groundInfoAt(bx, bz, seed);
  const d = districtAt(bx, bz, seed);

  // buildable lot inside the sidewalks: [X0, X1] x [Z0, Z1], 52 m square
  const I = CFG.INNER;
  const X0 = x0 + I, Z0 = z0 + I;
  const hk = heightAt(bx, bz, seed);

  if (lm) {
    switch (lm.kind) {
      case 'spire': buildSpire(b, x0, z0, x1, z1, r, rooftops); break;
      case 'pagoda': buildPagoda(b, x0, z0, x1, z1, r, rooftops); break;
      case 'observatory': buildObservatory(b, x0, z0, x1, z1, r, rooftops, anims); break;
      case 'ferris': buildFerris(b, x0, z0, x1, z1, r, rooftops, anims); break;
      case 'lighthouse': buildLighthouse(b, x0, z0, x1, r, rooftops, anims); break;
      case 'crane': buildCrane(b, x0, z0, x1, z1, rooftops); break;
    }
  } else if (gtype === GROUND.PLAZA) {
    decoratePlaza(b, cx, cz, r, gpar);
  } else if (gtype === GROUND.WATER) {
    if (gpar > 0.5) buildBasin(b, x0, z0, x1, z1, landSides(bx, bz, seed), r, rooftops);
  } else {
    switch (d) {
      case DISTRICT.DOWNTOWN: buildDowntown(b, X0, Z0, r, rooftops, hk); break;
      case DISTRICT.MDTOWN: buildMidtown(b, X0, Z0, r, rooftops, hk); break;
      case DISTRICT.OLD: buildOldTown(b, X0, Z0, r, rooftops); break;
      case DISTRICT.RESI: buildResi(b, X0, Z0, r, rooftops); break;
      case DISTRICT.IND: buildIndustrial(b, X0, Z0, r, rooftops); break;
      case DISTRICT.PARK: buildPark(b, cx, cz, x0, z0, r, gpar); break;
      case DISTRICT.HARBOR: buildHarborYard(b, X0, Z0, landSides(bx, bz, seed), r, rooftops); break;
      default: break;
    }
  }

  // street trees on the curb between the lamps (busy streets only)
  if (gtype !== GROUND.WATER && gtype !== GROUND.PARK && (d === DISTRICT.DOWNTOWN || d === DISTRICT.MDTOWN || d === DISTRICT.RESI || d === DISTRICT.OLD)) {
    const li = CFG.LAMP_INSET;
    for (const t of [21.5, 50.5]) {
      for (const [tx, tz] of [[x0 + t, z0 + li], [x0 + t, z1 - li], [x0 + li, z0 + t], [x1 - li, z0 + t]] as const) {
        if (r() < 0.85) streetTree(b, tx, tz, r);
      }
    }
  }

  // street lamps on the sidewalks: every corner and mid-block. The ground shader draws the light
  // pools analytically from the same positions (pipeline.ts lampPool), so every lamp must exist.
  if (gtype !== GROUND.WATER) {
    const li = CFG.LAMP_INSET;
    for (const [lx, lz] of [
      [x0 + li, z0 + li], [x1 - li, z0 + li], [x0 + li, z1 - li], [x1 - li, z1 - li],
      [cx, z0 + li], [cx, z1 - li], [x0 + li, cz], [x1 - li, cz],
    ] as const) streetLamp(b, lx, lz, r);
  }

  // elevated train deck along x = -72
  if (bx === -2 || bx === -1) trainDeck(b, bx, z0, z1);

  // water is not walkable (a floor just above the surface)
  if (gtype === GROUND.WATER) b.collider(x0, 0, z0, x1, 0.6, z1);

  // shards
  const shards: Shard[] = [];
  const want = rooftops.length > 0 ? (chance(r, 0.62) ? (chance(r, 0.28) ? 2 : 1) : 0) : (chance(r, 0.3) ? 1 : 0);
  for (let i = 0; i < want; i++) {
    let sx: number, sz: number, sy: number;
    if (rooftops.length > 0 && chance(r, 0.8)) {
      const t = pick(r, rooftops);
      sx = t.x + rangeF(r, -t.w * 0.3, t.w * 0.3);
      sz = t.z + rangeF(r, -t.d * 0.3, t.d * 0.3);
      sy = t.y + 1.15;
    } else {
      sx = x0 + rangeF(r, 16, 56);
      sz = z0 + rangeF(r, 16, 56);
      sy = 1.15;
    }
    shards.push({ x: sx, y: sy, z: sz, glyph: pick(r, SHARD_GLYPHS) });
  }

  // signal beacon
  let beacon: Beacon | null = null;
  if (!lm && (d === DISTRICT.DOWNTOWN || d === DISTRICT.MDTOWN) && rooftops.length > 0 && rand01(hash2i(bx, bz, seed ^ 0xbee7)) < 0.055) {
    let t = rooftops[0];
    for (const c of rooftops) if (c.y > t.y) t = c;
    const rings: Beacon['rings'] = [];
    let px = t.x, py = t.y + 5, pz = t.z;
    let ang = r() * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      if (i > 0) {
        ang += (r() - 0.5) * 1.7;
        const dist = 15 + r() * 15;
        px += Math.cos(ang) * dist;
        pz += Math.sin(ang) * dist;
        py += 6 + r() * 10;
        px = Math.max(-300, Math.min(300, px));
        pz = Math.max(-300, Math.min(300, pz));
        py = Math.min(92, py);
      }
      rings.push({ x: px, y: py, z: pz });
    }
    beacon = { x: t.x, y: t.y, z: t.z, rings };
    b.box(t.x - 0.45, t.y, t.z - 0.45, t.x + 0.45, t.y + 24, t.z + 0.45, MAT.NEON, [0.2, 1.0, 0.85]);
    b.box(t.x - 1.7, t.y, t.z - 1.7, t.x + 1.7, t.y + 1, t.z + 1.7, MAT.CONCRETE, CONCRETE2);
    b.collider(t.x - 1.7, t.y, t.z - 1.7, t.x + 1.7, t.y + 1, t.z + 1.7);
  }

  const geo = b.buildGeometry();
  const beamGeo = b.buildBeamGeometry();
  const mesh = geo ? new THREE.Mesh(geo, worldMat) : null;
  const beamMesh = beamGeo ? new THREE.Mesh(beamGeo, beamMat) : null;

  return {
    bx, bz, mesh, beamMesh, anims,
    colliders: b.colliders,
    ...(Builder.debugSolids ? { solids: b.solids } : {}),
    shards, beacon,
    landmarkId: lm ? lm.id : null,
  };
}

/* ---------------- district builders ---------------- */
// All builders get the buildable lot corner (X0, Z0); the lot is S = 52 m square and ends right
// at the sidewalk, so buildings form a continuous street wall like a real city block.
const S = 52;

interface Tw { x0: number; z0: number; x1: number; z1: number; h: number; round: boolean }

function buildDowntown(b: Builder, X0: number, Z0: number, r: Rng, rooftops: RoofTop[], hk: number): void {
  const L = S / 2;
  const tw: (Tw | null)[][] = [[null, null], [null, null]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const lx = X0 + i * L, lz = Z0 + j * L;
      if (r() < 0.84) {
        const w = rangeF(r, 14, 18.5);
        const d2 = rangeF(r, 14, 18.5);
        const bx = Math.min(Math.max(lx + L / 2 + rangeF(r, -2.5, 2.5) - w / 2, lx + 0.8), lx + L - 0.8 - w);
        const bz = Math.min(Math.max(lz + L / 2 + rangeF(r, -2.5, 2.5) - d2 / 2, lz + 0.8), lz + L - 0.8 - d2);
        // taller towards the centre of the city
        const floors = Math.round(rangeI(r, 12, 30) * (0.55 + 0.75 * hk));
        const s = r();
        let h: number;
        let round = false;
        if (s < 0.38) h = decoTower(b, bx, bz, bx + w, bz + d2, floors, r, rooftops);
        else if (s < 0.64) h = taperTower(b, bx, bz, bx + w, bz + d2, floors, r, rooftops);
        else if (s < 0.82) { round = true; h = roundGlass(b, bx + w / 2, bz + d2 / 2, Math.min(w, d2) / 2 - 0.4, floors, r, rooftops); }
        else {
          h = slab(b, bx, bz, bx + w, bz + d2, Math.max(8, Math.floor(floors * 0.6)), r, rooftops);
        }
        tw[i][j] = { x0: bx, z0: bz, x1: bx + w, z1: bz + d2, h, round };
        // podium filling the rest of the lot = continuous shop front along the street
        if (r() < 0.7) podium(b, lx + 0.3, lz + 0.3, lx + L - 0.3, lz + L - 0.3, rangeI(r, 2, 4) * 3.6, r, rooftops);
      } else {
        // mid-rise office block with a roof garden
        const h = rangeI(r, 7, 12) * 3.2;
        const bx = lx + 1, bz = lz + 1, w = L - 2;
        b.box(bx, 0, bz, bx + w, h, bz + w, MAT.CONCRETE, CONCRETE2, { win: 1, roofMat: MAT.GRASS, roofColor: GRASSC, seed: Math.floor(r() * 999) });
        b.collider(bx, 0, bz, bx + w, h, bz + w);
        rooftops.push({ x: bx + w / 2, z: bz + w / 2, y: h, w: w - 4, d: w - 4 });
        if (r() < 0.8) roundTree(b, bx + w * 0.35, bz + w * 0.4, 1.1, r, h);
        if (r() < 0.6) roundTree(b, bx + w * 0.65, bz + w * 0.6, 0.9, r, h);
        roofExtras(b, bx + w * 0.6, bz + 1, bx + w - 1, bz + w * 0.35, h, r, false);
      }
    }
  }
  // skybridges between neighbouring towers
  const bridge = (a: Tw | null, c: Tw | null, alongX: boolean) => {
    if (!a || !c || a.round || c.round || r() > 0.4) return;
    // low enough to hit every tower's first stage (setbacks start at 36 % of the height)
    const y = Math.min(a.h, c.h) * rangeF(r, 0.16, 0.3);
    if (y < 14) return;
    if (alongX) {
      const zc = (Math.max(a.z0, c.z0) + Math.min(a.z1, c.z1)) / 2;
      if (Math.min(a.z1, c.z1) - Math.max(a.z0, c.z0) < 5) return;
      skybridge(b, a.x1, zc - 1.6, c.x0, zc + 1.6, y);
    } else {
      const xc = (Math.max(a.x0, c.x0) + Math.min(a.x1, c.x1)) / 2;
      if (Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) < 5) return;
      skybridge(b, xc - 1.6, a.z1, xc + 1.6, c.z0, y);
    }
  };
  bridge(tw[0][0], tw[1][0], true);
  bridge(tw[0][1], tw[1][1], true);
  bridge(tw[0][0], tw[0][1], false);
}

/** split a run of length L into 1..3 pieces (each >= 10 m) */
function splits(r: Rng, L: number): number[] {
  const n = L > 34 ? rangeI(r, 1, 3) : L > 20 ? rangeI(r, 1, 2) : 1;
  if (n === 1) return [0, L];
  const cuts = [0];
  let left = L;
  for (let k = n; k > 1; k--) {
    const mn = 10, mx = left - mn * (k - 1);
    const len = rangeF(r, mn, Math.max(mn, Math.min(mx, left / k * 1.4)));
    cuts.push(cuts[cuts.length - 1] + len);
    left -= len;
  }
  cuts.push(L);
  return cuts;
}

/** perimeter block: buildings on all four street sides around an inner courtyard */
function buildMidtown(b: Builder, X0: number, Z0: number, r: Rng, rooftops: RoofTop[], hk: number): void {
  const D = rangeF(r, 12, 15);
  const X1 = X0 + S, Z1 = Z0 + S;
  const base = 0.6 + 0.9 * hk;
  const fl = () => Math.max(4, Math.round(rangeI(r, 5, 11) * base));
  const tallSide = rangeI(r, 0, 3);
  const side = (ax0: number, az0: number, ax1: number, az1: number, alongX: boolean, idx: number) => {
    const L = alongX ? ax1 - ax0 : az1 - az0;
    const cuts = splits(r, L);
    for (let k = 0; k < cuts.length - 1; k++) {
      const u0 = cuts[k], u1 = cuts[k + 1];
      const bx0 = alongX ? ax0 + u0 : ax0, bx1 = alongX ? ax0 + u1 : ax1;
      const bz0 = alongX ? az0 : az0 + u0, bz1 = alongX ? az1 : az0 + u1;
      let f = fl();
      if (idx === tallSide && k === 0 && r() < 0.6) f = Math.round(f * 1.8);
      if (r() < 0.2 && f >= 8) slab(b, bx0, bz0, bx1, bz1, f, r, rooftops);
      else streetBlock(b, bx0, bz0, bx1, bz1, f, r, rooftops);
    }
  };
  side(X0, Z0, X1, Z0 + D, true, 0);
  side(X0, Z1 - D, X1, Z1, true, 1);
  side(X0, Z0 + D, X0 + D, Z1 - D, false, 2);
  side(X1 - D, Z0 + D, X1, Z1 - D, false, 3);
  // courtyard
  const n = rangeI(r, 2, 4);
  for (let i = 0; i < n; i++) roundTree(b, rangeF(r, X0 + D + 3, X1 - D - 3), rangeF(r, Z0 + D + 3, Z1 - D - 3), rangeF(r, 0.8, 1.1), r);
}

/** old town: terraced houses along the four street sides, a courtyard in the middle */
function buildOldTown(b: Builder, X0: number, Z0: number, r: Rng, rooftops: RoofTop[]): void {
  const D = rangeF(r, 9.5, 11.5);
  const X1 = X0 + S, Z1 = Z0 + S;
  const row = (a0: number, a1: number, fixed0: number, fixed1: number, alongX: boolean, front: 'n' | 's' | 'e' | 'w') => {
    let u = a0;
    while (a1 - u > 5.5) {
      let w = rangeF(r, 7, 10.5);
      if (a1 - u - w < 6) w = a1 - u;
      if (r() < 0.12 && a1 - u - w > 12) { u += 2.5; continue; } // narrow alley between houses
      const hx0 = alongX ? u : fixed0, hx1 = alongX ? u + w : fixed1;
      const hz0 = alongX ? fixed0 : u, hz1 = alongX ? fixed1 : u + w;
      oldHouse(b, hx0, hz0, hx1, hz1, r, rooftops, { ridge: alongX ? 'x' : 'z', front, lantern: r() < 0.35, allowPagoda: true });
      u += w;
    }
  };
  row(X0, X1, Z0, Z0 + D, true, 'n');
  row(X0, X1, Z1 - D, Z1, true, 's');
  row(Z0 + D, Z1 - D, X0, X0 + D, false, 'w');
  row(Z0 + D, Z1 - D, X1 - D, X1, false, 'e');
  const cxm = X0 + S / 2, czm = Z0 + S / 2;
  if (r() < 0.35) pavilion(b, cxm, czm);
  else {
    const n = rangeI(r, 2, 4);
    for (let i = 0; i < n; i++) {
      const tx = rangeF(r, X0 + D + 3, X1 - D - 3), tz = rangeF(r, Z0 + D + 3, Z1 - D - 3);
      if (r() < 0.5) cherryTree(b, tx, tz, 1.0, r); else roundTree(b, tx, tz, 0.95, r);
    }
  }
}

/** residential: either detached houses with gardens or an apartment compound */
function buildResi(b: Builder, X0: number, Z0: number, r: Rng, rooftops: RoofTop[]): void {
  if (r() < 0.4) {
    // compound: parallel slabs with lawns between, facing south like real housing estates
    const n = 3;
    const gap = (S - n * 12) / (n - 1);
    for (let k = 0; k < n; k++) {
      const z = Z0 + k * (12 + gap);
      const inset = rangeF(r, 1, 5);
      apartment(b, X0 + inset, z, X0 + S - rangeF(r, 1, 5), z + 12, rangeI(r, 6, 11), r, rooftops);
      if (k < n - 1) {
        for (let t = 0; t < 3; t++) roundTree(b, X0 + 8 + t * 18 + rangeF(r, -2, 2), z + 12 + gap / 2, 0.8, r);
      }
    }
    return;
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      const lx = X0 + i * 26, lz = Z0 + j * 17.3;
      const w = rangeF(r, 9, 12), d2 = rangeF(r, 9, 11);
      // houses sit towards the street, gardens behind
      const ox = i === 0 ? rangeF(r, 1, 3) : 26 - w - rangeF(r, 1, 3);
      const oz = rangeF(r, 1, 17.3 - d2 - 3.2);
      resHouse(b, lx + ox, lz + oz, lx + ox + w, lz + oz + d2, r, rooftops);
      if (r() < 0.8) pineTree(b, i === 0 ? lx + 20 + rangeF(r, -2, 2) : lx + 6 + rangeF(r, -2, 2), lz + rangeF(r, 4, 13), 1.0, r);
    }
  }
}

function buildIndustrial(b: Builder, X0: number, Z0: number, r: Rng, rooftops: RoofTop[]): void {
  if (r() < 0.25) {
    // one big factory hall over half the block + tank farm
    const w = rangeF(r, 44, 50);
    warehouse(b, X0 + 1, Z0 + 1, X0 + 1 + w, Z0 + 24, r, rooftops);
    const n = rangeI(r, 2, 3);
    for (let k = 0; k < n; k++) tank(b, X0 + 9 + k * 16, Z0 + 40, rangeF(r, 4.5, 6), rangeF(r, 8, 13), r, rooftops);
    return;
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const lx = X0 + i * 26, lz = Z0 + j * 26;
      const s = r();
      if (s < 0.45) {
        const w = rangeF(r, 20, 24), d2 = rangeF(r, 17, 22);
        warehouse(b, lx + 13 - w / 2, lz + 13 - d2 / 2, lx + 13 + w / 2, lz + 13 + d2 / 2, r, rooftops);
      } else if (s < 0.6) {
        smokestack(b, lx + 20, lz + 20, r, rooftops);
        streetBlock(b, lx + 1, lz + 1, lx + 16, lz + 18, rangeI(r, 2, 3), r, rooftops);
      } else if (s < 0.72) {
        tank(b, lx + 8, lz + 8, 5, rangeF(r, 7, 11), r, rooftops);
        tank(b, lx + 19, lz + 18, 4.2, rangeF(r, 6, 10), r, rooftops);
      } else if (s < 0.82) {
        waterTower(b, lx + 13, lz + 13, r, rooftops);
      } else {
        for (let a = 0; a < 3; a++) for (let c = 0; c < 2; c++) containerStack(b, lx + 5 + c * 14, lz + 4 + a * 8.5, rangeI(r, 0, 3), true, r);
      }
    }
  }
}

function buildPark(b: Builder, cx: number, cz: number, x0: number, z0: number, r: Rng, gpar: number): void {
  const n = rangeI(r, 16, 24);
  for (let i = 0; i < n; i++) {
    const px = x0 + rangeF(r, 13, 59), pz = z0 + rangeF(r, 13, 59);
    if (gpar > 1.5 && Math.hypot(px - cx, pz - cz) < 16) continue;
    if (Math.hypot(px - cx, pz - cz) < 8) continue;
    const s = r();
    const sc = rangeF(r, 0.9, 1.35);
    if (s < 0.4) roundTree(b, px, pz, sc, r);
    else if (s < 0.7) pineTree(b, px, pz, sc, r);
    else cherryTree(b, px, pz, sc, r);
  }
  if (gpar > 1.5) {
    // pond edge: a ring of small stones
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r() * 0.4;
      b.box(cx + Math.cos(a) * 13.4 - 0.5, 0, cz + Math.sin(a) * 13.4 - 0.5, cx + Math.cos(a) * 13.4 + 0.5, 0.5, cz + Math.sin(a) * 13.4 + 0.5, MAT.CONCRETE, CONCRETE2);
      b.collider(cx + Math.cos(a) * 13.4 - 0.5, 0, cz + Math.sin(a) * 13.4 - 0.5, cx + Math.cos(a) * 13.4 + 0.5, 0.5, cz + Math.sin(a) * 13.4 + 0.5);
    }
  } else if (r() < 0.6) {
    fountain(b, cx, cz, r);
  } else if (r() < 0.6) {
    pavilion(b, cx, cz);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const bx2 = cx + Math.cos(a) * 18, bz2 = cz + Math.sin(a) * 18;
    bench(b, bx2, bz2, Math.abs(Math.sin(a)) > 0.7);
  }
}

/** harbour land block: container terminal or sheds, cranes on the quay facing the water */
function buildHarborYard(b: Builder, X0: number, Z0: number, sea: [boolean, boolean, boolean, boolean], r: Rng, rooftops: RoofTop[]): void {
  // sea sides: landSides() reports land, so invert
  const water = sea.map((v) => !v) as [boolean, boolean, boolean, boolean];
  const X1 = X0 + S, Z1 = Z0 + S;
  // quay cranes along the first water side
  const k = water.indexOf(true);
  if (k >= 0) {
    const along: 'x' | 'z' = k < 2 ? 'z' : 'x';
    const dir = k === 0 || k === 2 ? 1 : -1;
    const edge = k === 0 ? X1 - 6 : k === 1 ? X0 + 6 : k === 2 ? Z1 - 6 : Z0 + 6;
    for (const t of [0.28, 0.72]) {
      const u = (along === 'z' ? Z0 : X0) + S * t;
      // quayCrane's first axis is the boom direction (across the quay)
      if (along === 'z') quayCrane(b, edge, u, 'x', dir);
      else quayCrane(b, u, edge, 'z', dir);
    }
  }
  // stacks keep clear of the quay strip
  const cx0 = X0 + (water[1] ? 14 : 1), cx1 = X1 - (water[0] ? 14 : 1);
  const cz0 = Z0 + (water[3] ? 14 : 1), cz1 = Z1 - (water[2] ? 14 : 1);
  // harbour office in a land-side corner; stacks keep clear of it
  const ox = water[1] ? X1 - 8 : X0 + 1, oz = water[3] ? Z1 - 7 : Z0 + 1;
  const clear = (x: number, z: number) => x + 3.4 < ox - 1 || x - 3.4 > ox + 8 || z + 1.6 < oz - 1 || z - 1.6 > oz + 7;
  if (r() < 0.7) {
    for (let z = cz0 + 1.5; z + 1.3 < cz1; z += 5.6) {
      for (let x = cx0 + 3.3; x + 3.1 < cx1; x += 7.0) {
        if (clear(x, z)) containerStack(b, x, z, rangeI(r, 0, 4), true, r);
      }
    }
  } else {
    const w = Math.min(cx1 - cx0 - 2, 40), d = Math.min(cz1 - cz0 - 2, 22);
    warehouse(b, cx0 + 1, cz0 + 1, cx0 + 1 + w, cz0 + 1 + d, r, rooftops);
    for (let x = cx0 + 4; x + 3.1 < cx1; x += 7.2) if (clear(x, cz1 - 4)) containerStack(b, x, cz1 - 4, rangeI(r, 0, 2), true, r);
  }
  // harbour office
  b.box(ox, 0, oz, ox + 7, 3.4, oz + 6, MAT.CONCRETE, CONCRETE2, { win: 1, seed: Math.floor(r() * 999) });
  b.collider(ox, 0, oz, ox + 7, 3.4, oz + 6);
}

/** harbour basin (sea block next to land): a pier and a moored ship along the land side */
function buildBasin(b: Builder, x0: number, z0: number, x1: number, z1: number, land: [boolean, boolean, boolean, boolean], r: Rng, rooftops: RoofTop[]): void {
  const k = land.indexOf(true);
  if (k < 0) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // ship lies parallel to the quay, a few metres off it
  const off = 14;
  const len = rangeF(r, 46, 60);
  if (k === 0) ship(b, x1 - off, cz, 'z', len, r, rooftops);
  else if (k === 1) ship(b, x0 + off, cz, 'z', len, r, rooftops);
  else if (k === 2) ship(b, cx, z1 - off, 'x', len, r, rooftops);
  else ship(b, cx, z0 + off, 'x', len, r, rooftops);
  if (r() < 0.6 && (k === 2 || k === 3)) pier(b, x0 + 10, k === 3 ? z0 + 2 : z1 - 26, k === 3 ? z0 + 26 : z1 - 2, r);
}

function decoratePlaza(b: Builder, cx: number, cz: number, r: Rng, gpar: number): void {
  if (gpar < 2.5) fountain(b, cx, cz, r);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    b.box(cx + Math.cos(a) * 20 - 1.4, 0, cz + Math.sin(a) * 20 - 0.5, cx + Math.cos(a) * 20 + 1.4, 0.55, cz + Math.sin(a) * 20 + 0.5, MAT.CONCRETE, CONCRETE2);
    b.collider(cx + Math.cos(a) * 20 - 1.4, 0, cz + Math.sin(a) * 20 - 0.5, cx + Math.cos(a) * 20 + 1.4, 0.55, cz + Math.sin(a) * 20 + 0.5);
  }
  // statue
  b.cylinder(cx + 12, cz - 12, 1.2, 1.2, 0, 1.4, 8, MAT.CONCRETE, CONCRETE2, { capTop: true, seed: Math.floor(r() * 999) });
  b.sphere(cx + 12, 2.6, cz - 12, 1.0, MAT.METAL, METALC, 4, 8);
  b.collider(cx + 10.8, 0, cz - 13.2, cx + 13.2, 1.4, cz - 10.8);
  if (r() < 0.8) roundTree(b, cx - 16, cz + 14, 1.1, r);
  if (r() < 0.6) cherryTree(b, cx + 15, cz + 16, 1.0, r);
}

function trainDeck(b: Builder, bx: number, z0: number, z1: number): void {
  const lo = Math.max(bx * CFG.P, -79);
  const hi = Math.min(bx * CFG.P + CFG.P, -65);
  if (hi - lo < 0.5) return;
  b.box(lo, 8.7, z0, hi, 9.45, z1, MAT.CONCRETE, CONCRETE2, { roofMat: MAT.CONCRETE, roofColor: CONCRETE2 });
  b.box(lo, 8.4, z0, hi, 8.7, z1, MAT.METAL, [0.3, 0.32, 0.36]);
  const midZ = (z0 + z1) / 2;
  for (const zz of [z0 + 10, midZ, z1 - 10]) {
    b.box(lo + 1, 0, zz - 1.2, hi - 1, 8.7, zz + 1.2, MAT.CONCRETE, CONCRETE2);
  }
  b.collider(lo, 8.4, z0, hi, 9.45, z1);
}
