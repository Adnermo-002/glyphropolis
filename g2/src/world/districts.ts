// District layout + ground block classification. Deterministic from (blockX, blockZ, seed).
//
// Layout (in blocks of 72 m, the spire at block 0,0 is the centre):
//  - a sea to the south-west with a wobbly coastline; the land blocks along it form the harbour
//  - districts are contiguous zones taken from smooth noise fields (not per-block dice), so a
//    district spans several neighbouring blocks like in a real city
//  - core: downtown towers, ringed by midtown perimeter blocks, then old town / residential /
//    industrial / parks further out; building heights fall off with distance (heightAt)

import { DISTRICT, GROUND } from '../config';
import { hash2i, rand01 } from '../core/rng';

export interface LandmarkDef {
  id: string;
  name: string;
  bx: number;
  bz: number;
  kind: 'spire' | 'pagoda' | 'observatory' | 'ferris' | 'lighthouse' | 'crane';
  district: number;
}

export const LANDMARKS: LandmarkDef[] = [
  { id: 'spire', name: '字形塔', bx: 0, bz: 0, kind: 'spire', district: DISTRICT.DOWNTOWN },
  { id: 'pagoda', name: '五重阁', bx: 2, bz: 3, kind: 'pagoda', district: DISTRICT.OLD },
  { id: 'observatory', name: '观星台', bx: -3, bz: 2, kind: 'observatory', district: DISTRICT.RESI },
  { id: 'ferris', name: '城市之轮', bx: 4, bz: 1, kind: 'ferris', district: DISTRICT.MDTOWN },
  { id: 'lighthouse', name: '灯塔', bx: -5, bz: -3, kind: 'lighthouse', district: DISTRICT.HARBOR },
  { id: 'crane', name: '门式吊', bx: 4, bz: -5, kind: 'crane', district: DISTRICT.IND },
];

export function landmarkAt(bx: number, bz: number): LandmarkDef | null {
  for (const l of LANDMARKS) if (l.bx === bx && l.bz === bz) return l;
  return null;
}

/** smooth value noise on block coordinates, 0..1 */
export function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number) => rand01(hash2i(a, b, seed));
  const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** signed distance-ish to the coast in blocks: > 0 is sea */
function coast(bx: number, bz: number, seed: number): number {
  const s = (-bx - bz) * 0.7071;
  const wob = (vnoise(bx * 0.22 + 7.1, bz * 0.22 - 3.3, seed ^ 0xc0a57) - 0.5) * 3.0;
  return s - (6.2 + wob);
}

export function isSea(bx: number, bz: number, seed: number): boolean {
  const lm = landmarkAt(bx, bz);
  if (lm) return lm.kind === 'lighthouse';
  return coast(bx, bz, seed) > 0;
}

/** land block with the sea on at least one side */
function onCoast(bx: number, bz: number, seed: number): boolean {
  return isSea(bx + 1, bz, seed) || isSea(bx - 1, bz, seed) || isSea(bx, bz + 1, seed) || isSea(bx, bz - 1, seed);
}

/** 0..1 how "central" a block is: drives tower heights */
export function heightAt(bx: number, bz: number, seed: number): number {
  const r = Math.hypot(bx, bz);
  const base = Math.exp(-(r * r) / 9);
  const n = vnoise(bx * 0.45 + 11, bz * 0.45 - 5, seed ^ 0x4e16);
  return Math.min(1, Math.max(0, base * (0.8 + 0.4 * n)));
}

export function districtAt(bx: number, bz: number, seed: number): number {
  const lm = landmarkAt(bx, bz);
  if (lm) return lm.district;
  if (isSea(bx, bz, seed) || onCoast(bx, bz, seed)) return DISTRICT.HARBOR;
  const r = Math.hypot(bx, bz);
  // zone fields (smooth, so neighbours agree)
  const zPark = vnoise(bx * 0.34 + 40.5, bz * 0.34 + 12.5, seed ^ 0x9a41);
  const zInd = vnoise(bx * 0.2 - 20.5, bz * 0.2 + 3.5, seed ^ 0x1d57);
  const zOld = vnoise(bx * 0.3 + 3.5, bz * 0.3 - 30.5, seed ^ 0x0d1d);
  const rw = r + (vnoise(bx * 0.4, bz * 0.4, seed ^ 0x7e11) - 0.5) * 1.4; // wobbly rings
  if (rw < 2.4) return DISTRICT.DOWNTOWN;
  // old town clusters around the pagoda and wherever the old-town field is high
  if (Math.hypot(bx - 2, bz - 3) < 1.5 || (zOld > 0.78 && rw < 8)) return DISTRICT.OLD;
  if (rw > 2.9 && zPark > 0.72) return DISTRICT.PARK;
  if (rw < 4.6) return DISTRICT.MDTOWN;
  // industry leans to the south-east (towards the crane yard)
  const indBias = Math.max(-0.1, Math.min(0.12, (bx - bz) * 0.012));
  if (zInd + indBias > 0.7) return DISTRICT.IND;
  if (rw < 5.4 && zPark < 0.5) return DISTRICT.MDTOWN;
  return DISTRICT.RESI;
}

/** ground block: [type, param, hash] */
export function groundInfoAt(bx: number, bz: number, seed: number): [number, number, number] {
  const d = districtAt(bx, bz, seed);
  const lm = landmarkAt(bx, bz);
  const h = hash2i(bx, bz, seed ^ 0x51ed2);
  const n1 = rand01(h);
  const n2 = rand01(h ^ 0x85ebca6b);
  const hashB = (h >>> 8) & 255;
  if (lm?.kind === 'lighthouse') return [GROUND.WATER, 1, hashB];
  if (isSea(bx, bz, seed)) {
    // param 1 = harbour basin next to land (piers + moored ships), 0 = open sea
    return [GROUND.WATER, onCoastWater(bx, bz, seed) ? 1 : 0, hashB];
  }
  switch (d) {
    case DISTRICT.HARBOR:
      return [GROUND.YARD, 0, hashB];
    case DISTRICT.DOWNTOWN:
      return (!lm && n1 < 0.12) ? [GROUND.PLAZA, n2 < 0.35 ? 3 : 1, hashB] : [GROUND.BUILDING, 0, hashB];
    case DISTRICT.PARK:
      return [GROUND.PARK, n2 < 0.4 ? 2 : 0, hashB];
    case DISTRICT.IND:
      return n1 < 0.3 ? [GROUND.YARD, 0, hashB] : [GROUND.BUILDING, 0, hashB];
    case DISTRICT.MDTOWN:
      return (!lm && n1 < 0.08) ? [GROUND.PLAZA, 1, hashB] : [GROUND.BUILDING, 0, hashB];
    default:
      return [GROUND.BUILDING, 0, hashB];
  }
}

/** sea block with land next to it */
function onCoastWater(bx: number, bz: number, seed: number): boolean {
  return !isSea(bx + 1, bz, seed) || !isSea(bx - 1, bz, seed) || !isSea(bx, bz + 1, seed) || !isSea(bx, bz - 1, seed);
}

/** which sides of a block touch land (for piers / ships): [+x, -x, +z, -z] */
export function landSides(bx: number, bz: number, seed: number): [boolean, boolean, boolean, boolean] {
  return [!isSea(bx + 1, bz, seed), !isSea(bx - 1, bz, seed), !isSea(bx, bz + 1, seed), !isSea(bx, bz - 1, seed)];
}
