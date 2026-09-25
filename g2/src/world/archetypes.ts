// Building archetypes per district. All functions build in absolute world coordinates.

import * as THREE from 'three';
import { MAT } from '../config';
import { pick, rangeF, rangeI, type Rng } from '../core/rng';
import { Builder } from './geo';

export interface RoofTop { x: number; z: number; y: number; w: number; d: number }
export interface AnimPart { mesh: THREE.Object3D; fn: (dt: number) => void }

export const CONCRETE: [number, number, number] = [0.58, 0.59, 0.63];
export const CONCRETE2: [number, number, number] = [0.48, 0.5, 0.55];
export const BRICKC: [number, number, number] = [0.52, 0.3, 0.25];
export const GLASSC: [number, number, number] = [0.4, 0.55, 0.68];
export const ROOFC: [number, number, number] = [0.25, 0.26, 0.3];
export const METALC: [number, number, number] = [0.5, 0.53, 0.58];
export const WOODC: [number, number, number] = [0.44, 0.31, 0.19];
export const TRUNKC: [number, number, number] = [0.3, 0.22, 0.14];
export const LEAFC: [number, number, number] = [0.15, 0.38, 0.15];
export const PINEC: [number, number, number] = [0.09, 0.27, 0.13];
export const CHERRYC: [number, number, number] = [0.7, 0.36, 0.46];
export const GRASSC: [number, number, number] = [0.18, 0.4, 0.14];

export const NEON_COLORS: [number, number, number][] = [
  [0.15, 0.85, 0.65], [0.9, 0.25, 0.6], [0.2, 0.45, 1.0],
  [1.0, 0.62, 0.2], [0.9, 0.2, 0.28], [0.62, 0.25, 0.95],
];

export const SIGN_CHARS = ['字', '形', '城', '市', '光', '星', '山', '海', '月', '川', '云', '风', '雨', '雪', '雷', '泉', '林', '火'];

export function signChar(r: Rng): number {
  return pick(r, SIGN_CHARS).charCodeAt(0);
}

function seed(r: Rng): number {
  return Math.floor(r() * 1000);
}

/** art-deco setback tower with neon crown and sign. */
export function decoTower(b: Builder, x0: number, z0: number, x1: number, z1: number, floors: number, r: Rng, rooftops: RoofTop[]): number {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const h1 = floors * 3.3 * 0.52;
  const h2 = floors * 3.3 * 0.3;
  const h3 = floors * 3.3 * 0.18;
  const s1 = seed(r), s2 = seed(r);
  const neon = pick(r, NEON_COLORS);
  const neon2 = pick(r, NEON_COLORS);
  b.box(x0, 0, z0, x1, h1, z1, MAT.CONCRETE, CONCRETE, { win: 1, roofMat: MAT.ROOF, roofColor: ROOFC, seed: s1 });
  // podium sign
  b.box(x0 + w * 0.2, h1 * 0.62, z1 + 0.06, x0 + w * 0.8, h1 * 0.62 + 3.6, z1 + 0.4, MAT.SIGN, neon2, { signChar: signChar(r) });
  b.box(x0 - 0.18, h1, z0 - 0.18, x1 + 0.18, h1 + 0.5, z1 + 0.18, MAT.NEON, neon);
  const i1 = w * 0.16;
  b.box(x0 + i1, h1, z0 + i1, x1 - i1, h1 + h2, z1 - i1, MAT.CONCRETE, CONCRETE2, { win: 1, roofMat: MAT.ROOF, roofColor: ROOFC, seed: s2 });
  const i2 = i1 + w * 0.14;
  b.box(x0 + i2, h1 + h2, z0 + i2, x1 - i2, h1 + h2 + h3, z1 - i2, MAT.CONCRETE, CONCRETE, { win: 4, roofMat: MAT.GLASS, roofColor: GLASSC, seed: seed(r) });
  b.box(x0 + i2 - 0.15, h1 + h2 + h3, z0 + i2 - 0.15, x1 - i2 + 0.15, h1 + h2 + h3 + 0.45, z1 - i2 + 0.15, MAT.NEON, neon);
  // spire
  b.cone(cx, cz, 0.7, h1 + h2 + h3, h1 + h2 + h3 + 5.5, 8, MAT.METAL, METALC, seed(r));
  b.collider(cx - 0.5, h1 + h2 + h3, cz - 0.5, cx + 0.5, h1 + h2 + h3 + 5.5, cz + 0.5);
  // rooftop AC units at podium corners
  b.box(x0 + 1, h1, z0 + 1, x0 + 4, h1 + 1.6, z0 + 4, MAT.METAL, METALC);
  b.box(x1 - 4, h1, z1 - 4, x1 - 1, h1 + 1.3, z1 - 1, MAT.METAL, METALC);
  // colliders
  b.collider(x0 + 1, h1, z0 + 1, x0 + 4, h1 + 1.6, z0 + 4);
  b.collider(x1 - 4, h1, z1 - 4, x1 - 1, h1 + 1.3, z1 - 1);
  b.collider(x0, 0, z0, x1, h1, z1);
  b.collider(x0 + i1, 0, z0 + i1, x1 - i1, h1 + h2, z1 - i1);
  b.collider(x0 + i2, 0, z0 + i2, x1 - i2, h1 + h2 + h3, z1 - i2);
  rooftops.push({ x: cx, z: cz, y: h1 + h2 + h3, w: (x1 - x0) - i2 * 2, d: (z1 - z0) - i2 * 2 });
  return h1 + h2 + h3;
}

/** tapered tower with glass crown. */
export function taperTower(b: Builder, x0: number, z0: number, x1: number, z1: number, floors: number, r: Rng, rooftops: RoofTop[]): number {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const total = floors * 3.4;
  let w = x1 - x0, d = z1 - z0;
  let y = 0;
  const neon = pick(r, NEON_COLORS);
  const stages = 4;
  let top = 0;
  for (let s = 0; s < stages; s++) {
    const hh = total * (s === 0 ? 0.36 : s === 1 ? 0.26 : s === 2 ? 0.2 : 0.18);
    const xx0 = cx - w / 2, xx1 = cx + w / 2, zz0 = cz - d / 2, zz1 = cz + d / 2;
    const last = s === stages - 1;
    b.collider(xx0, y, zz0, xx1, y + hh, zz1);
    b.box(xx0, y, zz0, xx1, y + hh, zz1,
      last ? MAT.GLASS : MAT.CONCRETE,
      last ? GLASSC : s % 2 === 0 ? CONCRETE : CONCRETE2,
      { win: last ? 2 : 4, roofMat: last ? MAT.ROOF : MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
    if (!last) b.box(xx0 - 0.14, y + hh, zz0 - 0.14, xx1 + 0.14, y + hh + 0.35, zz1 + 0.14, MAT.NEON, neon);
    y += hh;
    top = y;
    w *= 0.84; d *= 0.84;
  }
  b.box(cx - 0.8, top, cz - 0.8, cx + 0.8, top + 8, cz + 0.8, MAT.METAL, METALC);
  b.box(cx - 0.9, top + 8, cz - 0.9, cx + 0.9, top + 8.4, cz + 0.9, MAT.NEON, neon);
  b.collider(cx - 0.8, top, cz - 0.8, cx + 0.8, top + 8, cz + 0.8);
  rooftops.push({ x: cx, z: cz, y: top, w, d });
  return top;
}

/** round glass tower. */
export function roundGlass(b: Builder, x: number, z: number, rad: number, floors: number, r: Rng, rooftops: RoofTop[]): number {
  const h = floors * 3.5;
  const s = seed(r);
  b.cylinder(x, z, rad, rad * 0.94, 0, h, 16, MAT.GLASS, GLASSC, { uArc: rad * 2, seed: s });
  b.cylinder(x, z, rad * 0.72, rad * 0.72, 0, h, 10, MAT.METAL, METALC, { capTop: true, seed: seed(r) });
  b.cylinder(x, z, rad + 0.5, rad + 0.5, h * 0.55, h * 0.55 + 0.4, 16, MAT.NEON, pick(r, NEON_COLORS));
  b.stick([x, h, z], [x, h + 7, z], 0.25, MAT.METAL, METALC, 6);
  b.roundCollider(x, z, rad, 0, h);
  rooftops.push({ x, z, y: h, w: rad * 1.2, d: rad * 1.2 });
  return h;
}

/** midtown balcony slab. */
export function slab(b: Builder, x0: number, z0: number, x1: number, z1: number, floors: number, r: Rng, rooftops: RoofTop[]): number {
  const h = floors * 3.1;
  const neon = pick(r, NEON_COLORS);
  b.box(x0, 0, z0, x1, h, z1, MAT.CONCRETE, r() < 0.5 ? CONCRETE2 : CONCRETE, { win: 3, roofMat: MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
  // vertical neon strips
  b.box(x0 - 0.2, 3, z0 + 1, x0 + 0.5, h - 1, z0 + 2.2, MAT.NEON, neon);
  b.box(x1 - 0.5, 3, z1 - 2.2, x1 + 0.2, h - 1, z1 - 1, MAT.NEON, neon);
  // roof garden
  b.box(x0 + 1.5, h, z0 + 1.5, x1 - 1.5, h + 0.5, z1 - 1.5, MAT.GRASS, GRASSC);
  b.collider(x0 + 1.5, h, z0 + 1.5, x1 - 1.5, h + 0.5, z1 - 1.5);
  if (r() < 0.7) roundTree(b, (x0 + x1) / 2 + rangeF(r, -4, 4), (z0 + z1) / 2 + rangeF(r, -3, 3), 1, r, h + 0.5);
  b.collider(x0, 0, z0, x1, h, z1);
  rooftops.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: h + 0.5, w: x1 - x0 - 3, d: z1 - z0 - 3 });
  return h;
}

/** old-town house, optional pagoda roof. */
export interface HouseOpts {
  /** gable ridge direction (row houses run their ridge along the street) */
  ridge?: 'x' | 'z';
  /** street side: where the door lantern goes */
  front?: 'n' | 's' | 'e' | 'w';
  lantern?: boolean;
  allowPagoda?: boolean;
}

export function oldHouse(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[], o: HouseOpts = {}): number {
  const floors = rangeI(r, 3, 5);
  const h = floors * 3.1;
  const brick = r() < 0.55;
  const mat = brick ? MAT.BRICK : MAT.WOOD;
  const color = brick ? BRICKC : WOODC;
  const rnd = r() < 0.5 ? 'x' : 'z';
  const ridge: 'x' | 'z' = o.ridge ?? rnd;
  b.box(x0, 0, z0, x1, h, z1, mat, color, { win: 1, seed: seed(r) });
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rr = Math.max(x1 - x0, z1 - z0) / 2;
  const square = Math.abs((x1 - x0) - (z1 - z0)) < 2.2;
  const pagoda = (o.allowPagoda ?? true) && square && r() < 0.45;
  if (pagoda) {
    b.pagodaRoof(cx, cz, rr * 0.25, rr * 0.95, h - 0.3, h + 2.6, MAT.BRICK, [0.5, 0.33, 0.29], 1.0, 16);
    // stepped pyramid inside the roof shell
    for (let k = 0; k < 3; k++) {
      const hw = rr * 0.66 * (1 - k * 0.3);
      b.collider(cx - hw, h, cz - hw, cx + hw, h + 0.9 * (k + 1), cz + hw);
    }
  } else {
    b.gableRoof(x0, z0, x1, z1, h - 0.2, h + 2.4, MAT.BRICK, [0.48, 0.32, 0.28], ridge, { overhang: 0.6 });
    b.gableCollider(x0, z0, x1, z1, h, h + 2.4, ridge);
  }
  // chimney
  b.box(x0 + (x1 - x0) * 0.7, h + 0.5, z0 + (z1 - z0) * 0.3, x0 + (x1 - x0) * 0.7 + 1.1, h + 3.2, z0 + (z1 - z0) * 0.3 + 1.1, MAT.BRICK, BRICKC);
  b.collider(x0 + (x1 - x0) * 0.7, h, z0 + (z1 - z0) * 0.3, x0 + (x1 - x0) * 0.7 + 1.1, h + 3.2, z0 + (z1 - z0) * 0.3 + 1.1);
  // door lantern on the street side
  if (o.lantern ?? true) {
    const f = o.front ?? 's';
    const lx = f === 'w' ? x0 - 0.9 : f === 'e' ? x1 + 0.9 : cx;
    const lz = f === 'n' ? z0 - 0.9 : f === 's' ? z1 + 0.9 : cz;
    b.box(lx - 0.2, 0, lz - 0.2, lx + 0.2, 2.6, lz + 0.2, MAT.METAL, METALC); // post wide enough to survive the glyph pass
    b.collider(lx - 0.3, 0, lz - 0.3, lx + 0.3, 3.5, lz + 0.3);
    b.box(lx - 0.45, 2.6, lz - 0.45, lx + 0.45, 3.5, lz + 0.45, MAT.LAMP, [1, 0.75, 0.45]);
    b.beamCone(lx, lz, 3.4, 0.4, 0.5, 2.2, 8, [1, 0.7, 0.4], 0.35);
  }
  b.collider(x0, 0, z0, x1, h, z1);
  rooftops.push({ x: cx, z: cz, y: h + 2.2, w: rr * 1.2, d: rr * 1.2 });
  return h + 2.5;
}

/** residential gabled house. */
export function resHouse(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[]): number {
  const floors = rangeI(r, 3, 6);
  const h = floors * 3.0;
  const useBrick = r() < 0.3;
  b.box(x0, 0, z0, x1, h, z1, useBrick ? MAT.BRICK : MAT.CONCRETE, useBrick ? BRICKC : CONCRETE2, { win: r() < 0.5 ? 1 : 4, seed: seed(r) });
  const ridge: 'x' | 'z' = r() < 0.5 ? 'x' : 'z';
  b.gableRoof(x0, z0, x1, z1, h - 0.15, h + 2.0, MAT.ROOF, ROOFC, ridge, { overhang: 0.5 });
  b.gableCollider(x0, z0, x1, z1, h, h + 2.0, ridge);
  // porch
  const pz = z1;
  b.box(x0 + 1, 0, pz, x0 + 4.5, 0.5, pz + 1.6, MAT.CONCRETE, CONCRETE2);
  b.collider(x0 + 1, 0, pz, x0 + 4.5, 0.5, pz + 1.6);
  if (r() < 0.6) {
    b.box(x0 + (x1 - x0) * 0.68, h + 0.3, z0 + 1, x0 + (x1 - x0) * 0.68 + 1, h + 2.6, z0 + 2, MAT.BRICK, BRICKC);
    b.collider(x0 + (x1 - x0) * 0.68, h, z0 + 1, x0 + (x1 - x0) * 0.68 + 1, h + 2.6, z0 + 2);
  }
  b.collider(x0, 0, z0, x1, h, z1);
  rooftops.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: h + 1.6, w: x1 - x0 - 2, d: z1 - z0 - 2 });
  return h + 1.8;
}

/** industrial sawtooth warehouse. Each tooth: a glazed slope falling from a tall vertical wall at
 *  its start (t0) down to the roof at its end (t1), closed by triangular end walls. */
export function warehouse(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[]): number {
  const h = rangeF(r, 10, 16);
  const T = 3.4; // tooth height
  const alongX = x1 - x0 > z1 - z0;
  b.box(x0, 0, z0, x1, h, z1, MAT.METAL, METALC, { win: 4, roofMat: MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
  b.collider(x0, 0, z0, x1, h, z1);
  const len = alongX ? x1 - x0 : z1 - z0;
  const teeth = Math.max(2, Math.floor(len / 9));
  const Z4 = [0, 0, 0, 0];
  // map (u along the teeth, v across, y) to world coordinates
  const P = (u: number, v: number, y: number): [number, number, number] => alongX ? [u, y, v] : [v, y, u];
  const u0 = alongX ? x0 : z0, v0 = alongX ? z0 : x0, v1 = alongX ? z1 : x1;
  const nA = (nu: number, nv: number, ny: number): [number, number, number] => alongX ? [nu, ny, nv] : [nv, ny, nu];
  for (let i = 0; i < teeth; i++) {
    const t0 = u0 + i * len / teeth, t1 = t0 + len / teeth;
    // glazed slope, facing +u and up
    b.pushQuad([P(t0, v0, h + T), P(t0, v1, h + T), P(t1, v1, h), P(t1, v0, h)],
      nA(0.5, 0, 0.85), GLASSC, MAT.GLASS, Z4, [h + T, h + T, h, h], 0, 0, 0);
    // tall wall at the start of the tooth, facing -u
    b.pushQuad([P(t0, v0, h), P(t0, v1, h), P(t0, v1, h + T), P(t0, v0, h + T)],
      nA(-1, 0, 0), ROOFC, MAT.ROOF, Z4, [h, h, h + T, h + T], 0, 0, 0);
    // triangular end walls on both long sides
    b.pushQuad([P(t0, v0, h), P(t1, v0, h), P(t0, v0, h + T), P(t0, v0, h)], nA(0, -1, 0), METALC, MAT.METAL, Z4, Z4, 0, 0, 0);
    b.pushQuad([P(t1, v1, h), P(t0, v1, h), P(t0, v1, h + T), P(t1, v1, h)], nA(0, 1, 0), METALC, MAT.METAL, Z4, Z4, 0, 0, 0);
    // walkable steps that follow the slope
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      const a0 = t0 + (t1 - t0) * k / steps, a1 = t0 + (t1 - t0) * (k + 1) / steps;
      const top = h + T * (1 - (k + 0.5) / steps);
      const [cx0, , cz0] = P(a0, v0, 0), [cx1, , cz1] = P(a1, v1, 0);
      b.collider(Math.min(cx0, cx1), h, Math.min(cz0, cz1), Math.max(cx0, cx1), top, Math.max(cz0, cz1));
    }
  }
  rooftops.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: h + T * 0.5, w: x1 - x0 - 2, d: z1 - z0 - 2 });
  return h;
}

export function smokestack(b: Builder, x: number, z: number, r: Rng, rooftops: RoofTop[]): number {
  const h = rangeF(r, 20, 30);
  b.cylinder(x, z, 1.6, 1.1, 0, h, 10, MAT.BRICK, BRICKC, { capTop: true, seed: seed(r) });
  b.cylinder(x, z, 1.25, 1.25, h - 3, h - 1, 10, MAT.METAL, [0.7, 0.25, 0.2]);
  b.collider(x - 1.5, 0, z - 1.5, x + 1.5, h, z + 1.5);
  rooftops.push({ x, z, y: h, w: 2, d: 2 });
  return h;
}

export function waterTower(b: Builder, x: number, z: number, r: Rng, rooftops: RoofTop[]): number {
  const top = 9;
  const legs = [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]] as const;
  // legs must be wider than a glyph cell at street distances, or the tank seems to float
  for (const [ox, oz] of legs) {
    b.box(x + ox - 0.45, 0, z + oz - 0.45, x + ox + 0.45, top, z + oz + 0.45, MAT.METAL, METALC);
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = legs[i], [bx2, bz2] = legs[(i + 1) % 4];
    b.box(Math.min(x + ax, x + bx2) - 0.25, top * 0.45, Math.min(z + az, z + bz2) - 0.25,
      Math.max(x + ax, x + bx2) + 0.25, top * 0.45 + 0.5, Math.max(z + az, z + bz2) + 0.25, MAT.METAL, METALC);
    b.collider(Math.min(x + ax, x + bx2) - 0.25, top * 0.45, Math.min(z + az, z + bz2) - 0.25,
      Math.max(x + ax, x + bx2) + 0.25, top * 0.45 + 0.5, Math.max(z + az, z + bz2) + 0.25);
    b.stick([x + ax, 0.4, z + az], [x + bx2, top * 0.45, z + bz2], 0.22, MAT.METAL, METALC, 6);
  }
  b.cylinder(x, z, 0.7, 0.7, 0, top, 8, MAT.METAL, [0.42, 0.44, 0.46]);
  b.box(x - 3.7, top - 0.4, z - 3.7, x + 3.7, top, z + 3.7, MAT.METAL, METALC); // platform
  b.cylinder(x, z, 3.6, 3.6, top, top + 5, 12, MAT.WOOD, [0.5, 0.36, 0.22], { capTop: false, seed: seed(r) });
  b.cone(x, z, 3.9, top + 5, top + 6.6, 12, MAT.ROOF, ROOFC, seed(r));
  for (const [ox, oz] of legs) b.collider(x + ox - 0.45, 0, z + oz - 0.45, x + ox + 0.45, top, z + oz + 0.45);
  b.collider(x - 0.7, 0, z - 0.7, x + 0.7, top, z + 0.7);
  b.collider(x - 3.7, top - 0.4, z - 3.7, x + 3.7, top, z + 3.7);
  b.roundCollider(x, z, 3.6, top, top + 5);
  b.collider(x - 2.4, top + 5, z - 2.4, x + 2.4, top + 6, z + 2.4);
  rooftops.push({ x, z, y: top + 5, w: 4, d: 4 });
  return top + 5;
}

export function containers(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[]): void {
  const cols: [number, number, number][] = [[0.8, 0.3, 0.2], [0.2, 0.5, 0.55], [0.55, 0.55, 0.2], [0.3, 0.35, 0.7], [0.6, 0.2, 0.4]];
  const n = rangeI(r, 2, 4);
  for (let i = 0; i < n; i++) {
    const cx = rangeF(r, x0 + 4, x1 - 4);
    const cz = rangeF(r, z0 + 3, z1 - 3);
    const stack = r() < 0.4 ? 2 : 1;
    for (let s = 0; s < stack; s++) {
      b.box(cx - 3.2, s * 2.7, cz - 1.3, cx + 3.2, s * 2.7 + 2.6, cz + 1.3, MAT.METAL, pick(r, cols));
    }
    b.collider(cx - 3.2, 0, cz - 1.3, cx + 3.2, stack * 2.7 - 0.1, cz + 1.3);
  }
  if (r() < 0.5) rooftops.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 5.4, w: 6, d: 3 });
}

export function roundTree(b: Builder, x: number, z: number, s: number, r: Rng, yBase = 0): void {
  const th = 2.2 * s;
  b.cylinder(x, z, 0.3 * s, 0.22 * s, yBase, yBase + th, 6, MAT.TRUNK, TRUNKC, { seed: seed(r) });
  b.sphere(x, yBase + th + 1.6 * s, z, (2.1 + r() * 1.1) * s, MAT.LEAF, LEAFC, 4, 9, 0.95);
  b.collider(x - 0.5, yBase, z - 0.5, x + 0.5, yBase + 1, z + 0.5);
}

export function pineTree(b: Builder, x: number, z: number, s: number, r: Rng, yBase = 0): void {
  const th = 2.6 * s;
  b.cylinder(x, z, 0.28 * s, 0.2 * s, yBase, yBase + th, 6, MAT.TRUNK, TRUNKC, { seed: seed(r) });
  b.cone(x, z, 2.4 * s, yBase + th - 0.5, yBase + th + 3.2 * s, 9, MAT.LEAF, PINEC, seed(r));
  b.cone(x, z, 1.7 * s, yBase + th + 1.8 * s, yBase + th + 5.2 * s, 9, MAT.LEAF, PINEC, seed(r));
  b.cone(x, z, 1.0 * s, yBase + th + 3.8 * s, yBase + th + 6.6 * s, 8, MAT.LEAF, PINEC, seed(r));
  b.collider(x - 0.5, yBase, z - 0.5, x + 0.5, yBase + 1, z + 0.5);
}

export function cherryTree(b: Builder, x: number, z: number, s: number, r: Rng, yBase = 0): void {
  const th = 2.4 * s;
  b.cylinder(x, z, 0.32 * s, 0.2 * s, yBase, yBase + th, 6, MAT.TRUNK, [0.35, 0.24, 0.2], { seed: seed(r) });
  b.sphere(x, yBase + th + 1.4 * s, z, 1.9 * s, MAT.LEAF, CHERRYC, 4, 8, 1.05);
  b.sphere(x + 1.1 * s, yBase + th + 0.7 * s, z + 0.6 * s, 1.3 * s, MAT.LEAF, CHERRYC, 4, 7, 1.0);
  b.collider(x - 0.5, yBase, z - 0.5, x + 0.5, yBase + 1, z + 0.5);
}

export function fountain(b: Builder, x: number, z: number, r: Rng): void {
  b.cylinder(x, z, 4.4, 4.4, 0, 0.9, 16, MAT.CONCRETE, CONCRETE2, { capTop: true, seed: seed(r) });
  b.cylinder(x, z, 4.0, 4.0, 0.92, 1.05, 16, MAT.WATER, [0.2, 0.5, 0.6], { capTop: true, seed: seed(r) });
  b.box(x - 0.45, 1, z - 0.45, x + 0.45, 7.5, z + 0.45, MAT.FOUNTAIN, [0.5, 0.8, 1.0]);
  b.box(x - 2.2, 1, z - 0.3, x - 1.7, 4.2, z + 0.3, MAT.FOUNTAIN, [0.45, 0.75, 0.95]);
  b.box(x + 1.7, 1, z - 0.3, x + 2.2, 4.2, z + 0.3, MAT.FOUNTAIN, [0.45, 0.75, 0.95]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(x + Math.cos(a) * 6 - 0.9, 0, z + Math.sin(a) * 6 - 0.4, x + Math.cos(a) * 6 + 0.9, 0.5, z + Math.sin(a) * 6 + 0.4, MAT.CONCRETE, CONCRETE2);
    b.collider(x + Math.cos(a) * 6 - 0.9, 0, z + Math.sin(a) * 6 - 0.4, x + Math.cos(a) * 6 + 0.9, 0.5, z + Math.sin(a) * 6 + 0.4);
  }
  b.collider(x - 4.4, 0, z - 4.4, x + 4.4, 0.9, z + 4.4);
}

export function pavilion(b: Builder, x: number, z: number): void {
  // stone base with a step, four solid posts and a beam ring under the eaves: the posts must be
  // wider than a text cell at viewing distance or the roof reads as floating in the ASCII pass
  b.box(x - 5.6, 0, z - 5.6, x + 5.6, 0.25, z + 5.6, MAT.CONCRETE, CONCRETE2);
  b.box(x - 5, 0.25, z - 5, x + 5, 0.55, z + 5, MAT.CONCRETE, CONCRETE2);
  for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
    b.box(x + ox - 0.45, 0.55, z + oz - 0.45, x + ox + 0.45, 0.9, z + oz + 0.45, MAT.CONCRETE, CONCRETE2);
    b.box(x + ox - 0.34, 0.9, z + oz - 0.34, x + ox + 0.34, 4.6, z + oz + 0.34, MAT.WOOD, WOODC);
  }
  b.box(x - 4.4, 4.0, z - 4.4, x + 4.4, 4.6, z - 3.6, MAT.WOOD, WOODC);
  b.box(x - 4.4, 4.0, z + 3.6, x + 4.4, 4.6, z + 4.4, MAT.WOOD, WOODC);
  b.box(x - 4.4, 4.0, z - 3.6, x - 3.6, 4.6, z + 3.6, MAT.WOOD, WOODC);
  b.box(x + 3.6, 4.0, z - 3.6, x + 4.4, 4.6, z + 3.6, MAT.WOOD, WOODC);
  b.pagodaRoof(x, z, 1.6, 6.2, 4.4, 6.8, MAT.BRICK, [0.5, 0.34, 0.3], 1.2, 18);
  b.collider(x - 5, 0, z - 5, x + 5, 0.55, z + 5);
  for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) b.collider(x + ox - 0.4, 0.55, z + oz - 0.4, x + ox + 0.4, 4.6, z + oz + 0.4);
  b.collider(x - 4.3, 4.4, z - 4.3, x + 4.3, 5.4, z + 4.3);
  b.collider(x - 2.6, 5.4, z - 2.6, x + 2.6, 6.4, z + 2.6);
}

export function streetLamp(b: Builder, x: number, z: number, _r: Rng): void {
  b.box(x - 0.2, 0, z - 0.2, x + 0.2, 6.4, z + 0.2, MAT.METAL, METALC);
  b.box(x - 0.35, 0, z - 0.35, x + 0.35, 0.6, z + 0.35, MAT.METAL, METALC); // base
  b.box(x - 0.6, 6.4, z - 0.6, x + 0.6, 7.0, z + 0.6, MAT.LAMP, [1, 0.78, 0.5]);
  b.collider(x - 0.3, 0, z - 0.3, x + 0.3, 7.0, z + 0.3);
  // wide, soft cone with more segments (the ground shader draws the light pool under it)
  b.beamCone(x, z, 6.35, 0.1, 0.55, 4.6, 16, [1, 0.72, 0.42], 1.0);
}

export function pier(b: Builder, x: number, z0: number, z1: number, r: Rng): void {
  b.box(x - 6, 0, z0, x + 6, 1.3, z1, MAT.WOOD, WOODC);
  b.box(x - 6.3, 1.3, z0, x - 5.8, 2.1, z1, MAT.WOOD, [0.35, 0.25, 0.16]);
  b.box(x + 5.8, 1.3, z0, x + 6.3, 2.1, z1, MAT.WOOD, [0.35, 0.25, 0.16]);
  b.collider(x - 6.3, 1.3, z0, x - 5.8, 2.1, z1);
  b.collider(x + 5.8, 1.3, z0, x + 6.3, 2.1, z1);
  streetLamp(b, x - 4, z1 - 2.5, r);
  b.collider(x - 6, 0, z0, x + 6, 1.3, z1);
}

/** elevated train deck along the road line x = -72, for block bx. */
export function trainDeck(b: Builder, bx: number, z0: number, z1: number): void {
  const lo = Math.max(bx * 72, -79);
  const hi = Math.min(bx * 72 + 72, -65);
  if (hi - lo < 0.5) return;
  b.box(lo, 8.7, z0, hi, 9.45, z1, MAT.CONCRETE, CONCRETE2, { roofMat: MAT.CONCRETE, roofColor: CONCRETE2 });
  b.box(lo, 8.4, z0, hi, 8.7, z1, MAT.METAL, [0.3, 0.32, 0.36]);
  const midZ = (z0 + z1) / 2;
  for (const zz of [z0 + 10, midZ, z1 - 10]) {
    b.box(lo + 1, 0, zz - 1.2, hi - 1, 8.7, zz + 1.2, MAT.CONCRETE, CONCRETE2);
  }
  b.collider(lo, 8.4, z0, hi, 9.45, z1);
}

/* ---------------- city fabric (street walls, roofs, harbour) ---------------- */

export const CONT_COLS: [number, number, number][] = [[0.8, 0.3, 0.2], [0.2, 0.5, 0.55], [0.55, 0.55, 0.2], [0.3, 0.35, 0.7], [0.6, 0.2, 0.4], [0.75, 0.75, 0.72]];
const FACADES: [number, number, number][] = [CONCRETE, CONCRETE2, [0.62, 0.58, 0.52], [0.55, 0.5, 0.46], [0.44, 0.47, 0.52], [0.6, 0.52, 0.42]];

/** things on a flat roof: AC boxes, water tanks, billboards, helipads, masts (all with colliders) */
export function roofExtras(b: Builder, x0: number, z0: number, x1: number, z1: number, y: number, r: Rng, big = false): void {
  const w = x1 - x0, d = z1 - z0;
  if (w < 5 || d < 5) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // parapet: a low rim so the roof reads as a roof, not a cut-off box
  b.box(x0, y, z0, x1, y + 0.7, z0 + 0.35, MAT.CONCRETE, CONCRETE2);
  b.box(x0, y, z1 - 0.35, x1, y + 0.7, z1, MAT.CONCRETE, CONCRETE2);
  b.box(x0, y, z0 + 0.35, x0 + 0.35, y + 0.7, z1 - 0.35, MAT.CONCRETE, CONCRETE2);
  b.box(x1 - 0.35, y, z0 + 0.35, x1, y + 0.7, z1 - 0.35, MAT.CONCRETE, CONCRETE2);
  b.collider(x0, y, z0, x1, y + 0.7, z0 + 0.35);
  b.collider(x0, y, z1 - 0.35, x1, y + 0.7, z1);
  b.collider(x0, y, z0 + 0.35, x0 + 0.35, y + 0.7, z1 - 0.35);
  b.collider(x1 - 0.35, y, z0 + 0.35, x1, y + 0.7, z1 - 0.35);
  const kind = r();
  if (big && w >= 13 && d >= 13 && kind < 0.28) {
    // helipad: raised deck, H mark and edge lights
    const R = Math.min(w, d) * 0.4;
    b.box(cx - R, y, cz - R, cx + R, y + 0.4, cz + R, MAT.CONCRETE, [0.34, 0.35, 0.38]);
    const Y = y + 0.42;
    b.box(cx - 2.2, Y - 0.02, cz - 2.6, cx - 1.4, Y, cz + 2.6, MAT.CONCRETE, [0.9, 0.88, 0.8]);
    b.box(cx + 1.4, Y - 0.02, cz - 2.6, cx + 2.2, Y, cz + 2.6, MAT.CONCRETE, [0.9, 0.88, 0.8]);
    b.box(cx - 1.4, Y - 0.02, cz - 0.4, cx + 1.4, Y, cz + 0.4, MAT.CONCRETE, [0.9, 0.88, 0.8]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = cx + Math.cos(a) * (R - 0.6), lz = cz + Math.sin(a) * (R - 0.6);
      b.box(lx - 0.25, Y, lz - 0.25, lx + 0.25, Y + 0.3, lz + 0.25, MAT.NEON, [1.0, 0.62, 0.2]);
    }
    b.collider(cx - R, y, cz - R, cx + R, y + 0.4, cz + R);
    return;
  }
  if (kind < 0.55) {
    // billboard along the longer edge, facing out
    const alongX = w >= d;
    const L = Math.min(alongX ? w : d, 12) - 1;
    const c = alongX ? cx : cz;
    const e = alongX ? z1 - 1.2 : x1 - 1.2;
    const H0 = y + 2.4, H1 = H0 + Math.min(5, L * 0.42);
    const col = pick(r, NEON_COLORS);
    for (const o of [-L * 0.35, L * 0.35]) {
      if (alongX) { b.box(c + o - 0.3, y, e - 0.3, c + o + 0.3, H0, e + 0.3, MAT.METAL, METALC); b.collider(c + o - 0.3, y, e - 0.3, c + o + 0.3, H0, e + 0.3); }
      else { b.box(e - 0.3, y, c + o - 0.3, e + 0.3, H0, c + o + 0.3, MAT.METAL, METALC); b.collider(e - 0.3, y, c + o - 0.3, e + 0.3, H0, c + o + 0.3); }
    }
    if (alongX) {
      b.box(c - L / 2, H0, e - 0.3, c + L / 2, H1, e + 0.3, MAT.SIGN, col, { signChar: signChar(r) });
      b.collider(c - L / 2, H0, e - 0.3, c + L / 2, H1, e + 0.3);
    } else {
      b.box(e - 0.3, H0, c - L / 2, e + 0.3, H1, c + L / 2, MAT.SIGN, col, { signChar: signChar(r) });
      b.collider(e - 0.3, H0, c - L / 2, e + 0.3, H1, c + L / 2);
    }
  } else if (kind < 0.8) {
    // water tank on short legs
    const tx = x0 + Math.min(4, w * 0.3), tz = z0 + Math.min(4, d * 0.3);
    for (const [ox, oz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]] as const) {
      b.box(tx + ox - 0.25, y, tz + oz - 0.25, tx + ox + 0.25, y + 1.6, tz + oz + 0.25, MAT.METAL, METALC);
    }
    b.box(tx - 1.7, y + 1.6, tz - 1.7, tx + 1.7, y + 1.9, tz + 1.7, MAT.METAL, METALC);
    b.cylinder(tx, tz, 1.6, 1.6, y + 1.9, y + 4.4, 10, MAT.WOOD, [0.5, 0.36, 0.22], { capTop: true, seed: seed(r) });
    b.cone(tx, tz, 1.75, y + 4.4, y + 5.2, 10, MAT.ROOF, ROOFC, seed(r));
    b.collider(tx - 1.4, y, tz - 1.4, tx + 1.4, y + 1.9, tz + 1.4);
    b.roundCollider(tx, tz, 1.6, y + 1.9, y + 4.4);
    b.collider(tx - 1.1, y + 4.4, tz - 1.1, tx + 1.1, y + 5.0, tz + 1.1);
  } else if (big) {
    // radio mast with a red light
    b.box(cx - 0.3, y, cz - 0.3, cx + 0.3, y + 9, cz + 0.3, MAT.METAL, METALC);
    b.box(cx - 0.4, y + 9, cz - 0.4, cx + 0.4, y + 9.6, cz + 0.4, MAT.NEON, [1, 0.2, 0.2]);
    b.collider(cx - 0.4, y, cz - 0.4, cx + 0.4, y + 9.6, cz + 0.4);
  }
  // AC units
  const n = rangeI(r, 1, 3);
  for (let i = 0; i < n; i++) {
    const ax = rangeF(r, x0 + 1, x1 - 3.5), az = rangeF(r, z0 + 1, z1 - 3.5);
    if (Math.abs(ax + 1.2 - cx) < 2 && Math.abs(az + 1.2 - cz) < 2) continue;
    const hh = rangeF(r, 1.1, 1.8);
    b.box(ax, y, az, ax + 2.4, y + hh, az + 2.4, MAT.METAL, METALC);
    b.collider(ax, y, az, ax + 2.4, y + hh, az + 2.4);
  }
}

/** a plain mid-rise block of the street wall; returns the roof height */
export function streetBlock(b: Builder, x0: number, z0: number, x1: number, z1: number, floors: number, r: Rng, rooftops: RoofTop[]): number {
  const h = floors * 3.2;
  const col = pick(r, FACADES);
  const brick = r() < 0.2;
  const win = pick(r, [1, 1, 3, 4, 2] as const);
  b.box(x0, 0, z0, x1, h, z1, brick ? MAT.BRICK : win === 2 ? MAT.GLASS : MAT.CONCRETE, brick ? BRICKC : win === 2 ? GLASSC : col,
    { win, roofMat: MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
  // ground-floor shop band: darker plinth + awning on the long faces
  b.box(x0 - 0.15, 0, z0 - 0.15, x1 + 0.15, 3.6, z1 + 0.15, MAT.CONCRETE, [0.3, 0.31, 0.34], { win: 1, seed: seed(r) });
  if (r() < 0.5) {
    const neon = pick(r, NEON_COLORS);
    b.box(x0 - 0.7, 3.6, z0 - 0.9, x1 + 0.7, 3.9, z0 - 0.15, MAT.NEON, neon);
    b.box(x0 - 0.7, 3.6, z1 + 0.15, x1 + 0.7, 3.9, z1 + 0.9, MAT.NEON, neon);
  }
  b.collider(x0 - 0.15, 0, z0 - 0.15, x1 + 0.15, h, z1 + 0.15);
  roofExtras(b, x0, z0, x1, z1, h, r, floors > 9);
  rooftops.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: h, w: x1 - x0 - 3, d: z1 - z0 - 3 });
  return h;
}

/** street-level podium under a tower (fills the lot so the street wall is continuous) */
export function podium(b: Builder, x0: number, z0: number, x1: number, z1: number, h: number, r: Rng, rooftops: RoofTop[]): void {
  b.box(x0, 0, z0, x1, h, z1, MAT.GLASS, [0.34, 0.44, 0.52], { win: 2, roofMat: MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
  b.box(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.6, z1 + 0.2, MAT.CONCRETE, CONCRETE);
  b.collider(x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, h + 0.6, z1 + 0.2);
  rooftops.push({ x: x0 + 2.5, z: z0 + 2.5, y: h + 0.6, w: 2, d: 2 });
}

/** glass skybridge between two towers */
export function skybridge(b: Builder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  b.box(x0, y, z0, x1, y + 3.4, z1, MAT.GLASS, GLASSC, { win: 2, roofMat: MAT.METAL, roofColor: METALC });
  b.box(x0, y - 0.4, z0 - 0.2, x1, y, z1 + 0.2, MAT.METAL, METALC);
  b.collider(x0, y - 0.4, z0 - 0.2, x1, y + 3.4, z1 + 0.2);
}

/** residential slab (compound apartment block) */
export function apartment(b: Builder, x0: number, z0: number, x1: number, z1: number, floors: number, r: Rng, rooftops: RoofTop[]): number {
  const h = floors * 3.0;
  const col = pick(r, [[0.7, 0.66, 0.6], [0.62, 0.6, 0.58], [0.66, 0.56, 0.48], [0.56, 0.6, 0.64]] as [number, number, number][]);
  b.box(x0, 0, z0, x1, h, z1, MAT.CONCRETE, col, { win: 3, roofMat: MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
  // stair cores sticking up above the roof
  const alongX = x1 - x0 > z1 - z0;
  const L = alongX ? x1 - x0 : z1 - z0;
  const cores = Math.max(1, Math.round(L / 16));
  for (let i = 0; i < cores; i++) {
    const t = (i + 0.5) / cores;
    const cx = alongX ? x0 + L * t : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : z0 + L * t;
    b.box(cx - 1.8, h, cz - 1.8, cx + 1.8, h + 2.6, cz + 1.8, MAT.CONCRETE, col, { roofMat: MAT.ROOF, roofColor: ROOFC });
    b.collider(cx - 1.8, h, cz - 1.8, cx + 1.8, h + 2.6, cz + 1.8);
  }
  b.box(x0, h, z0, x1, h + 0.6, z0 + 0.3, MAT.CONCRETE, CONCRETE2);
  b.box(x0, h, z1 - 0.3, x1, h + 0.6, z1, MAT.CONCRETE, CONCRETE2);
  b.collider(x0, h, z0, x1, h + 0.6, z0 + 0.3);
  b.collider(x0, h, z1 - 0.3, x1, h + 0.6, z1);
  b.collider(x0, 0, z0, x1, h, z1);
  rooftops.push({ x: (x0 + x1) / 2 + (alongX ? L * 0.25 / cores : 0), z: (z0 + z1) / 2, y: h, w: 3, d: 3 });
  return h;
}

/** storage tank (industrial / harbour) */
export function tank(b: Builder, x: number, z: number, rad: number, h: number, r: Rng, rooftops: RoofTop[]): void {
  const col: [number, number, number] = r() < 0.5 ? [0.78, 0.78, 0.74] : [0.6, 0.62, 0.64];
  b.cylinder(x, z, rad, rad, 0, h, 16, MAT.METAL, col, { capTop: true, seed: seed(r) });
  b.cylinder(x, z, rad + 0.12, rad + 0.12, h * 0.5, h * 0.5 + 0.4, 16, MAT.METAL, [0.7, 0.3, 0.2]);
  b.cone(x, z, rad, h, h + rad * 0.25, 16, MAT.METAL, col, seed(r));
  b.roundCollider(x, z, rad, 0, h);
  b.collider(x - rad * 0.6, h, z - rad * 0.6, x + rad * 0.6, h + rad * 0.18, z + rad * 0.6);
  rooftops.push({ x, z, y: h + rad * 0.18, w: rad, d: rad });
}

/** one stack of shipping containers with a single collider */
export function containerStack(b: Builder, cx: number, cz: number, n: number, alongX: boolean, r: Rng): void {
  if (n <= 0) return;
  const hx = alongX ? 3.1 : 1.25, hz = alongX ? 1.25 : 3.1;
  for (let s = 0; s < n; s++) {
    b.box(cx - hx, s * 2.62, cz - hz, cx + hx, s * 2.62 + 2.55, cz + hz, MAT.METAL, pick(r, CONT_COLS));
  }
  b.collider(cx - hx, 0, cz - hz, cx + hx, n * 2.62 - 0.07, cz + hz);
}

/** ship-to-shore crane standing on the quay, boom pointing at the water (dir = +1/-1 along axis) */
export function quayCrane(b: Builder, x: number, z: number, axis: 'x' | 'z', dir: number): void {
  const col: [number, number, number] = [0.25, 0.5, 0.75];
  const legH = 26, gw = 5, gl = 7; // gauge across the quay, spacing along it
  const P = (u: number, v: number): [number, number] => axis === 'x' ? [x + u, z + v] : [x + v, z + u];
  for (const u of [-gw, gw]) for (const v of [-gl / 2, gl / 2]) {
    const [px, pz] = P(u, v);
    b.box(px - 0.6, 0, pz - 0.6, px + 0.6, legH, pz + 0.6, MAT.METAL, col);
    b.collider(px - 0.6, 0, pz - 0.6, px + 0.6, legH, pz + 0.6);
  }
  // portal beams + boom over the water + back stay
  for (const v of [-gl / 2, gl / 2]) {
    const [ax, az] = P(-gw - 0.6, v - 0.6), [bx, bz] = P(gw + 0.6, v + 0.6);
    b.box(Math.min(ax, bx), 14, Math.min(az, bz), Math.max(ax, bx), 15.2, Math.max(az, bz), MAT.METAL, col);
    b.collider(Math.min(ax, bx), 14, Math.min(az, bz), Math.max(ax, bx), 15.2, Math.max(az, bz));
  }
  const [b0x, b0z] = P(-gw * 2.2 * dir, -1.1), [b1x, b1z] = P(gw * 6 * dir, 1.1);
  b.box(Math.min(b0x, b1x), legH, Math.min(b0z, b1z), Math.max(b0x, b1x), legH + 1.8, Math.max(b0z, b1z), MAT.METAL, col);
  b.collider(Math.min(b0x, b1x), legH, Math.min(b0z, b1z), Math.max(b0x, b1x), legH + 1.8, Math.max(b0z, b1z));
  const [cx0, cz0] = P(-gw - 1, -gl / 2 - 0.6), [cx1, cz1] = P(gw + 1, gl / 2 + 0.6);
  b.box(Math.min(cx0, cx1), legH - 1.2, Math.min(cz0, cz1), Math.max(cx0, cx1), legH, Math.max(cz0, cz1), MAT.METAL, col);
  b.collider(Math.min(cx0, cx1), legH - 1.2, Math.min(cz0, cz1), Math.max(cx0, cx1), legH, Math.max(cz0, cz1));
  // operator cab under the boom
  const [kx, kz] = P(gw * 1.6 * dir, 0);
  b.box(kx - 1.4, legH - 3.2, kz - 1.4, kx + 1.4, legH, kz + 1.4, MAT.GLASS, GLASSC, { win: 2 });
  b.collider(kx - 1.4, legH - 3.2, kz - 1.4, kx + 1.4, legH, kz + 1.4);
  b.box(kx - 0.35, legH + 1.8, kz - 0.35, kx + 0.35, legH + 6, kz + 0.35, MAT.METAL, col);
  b.collider(kx - 0.35, legH + 1.8, kz - 0.35, kx + 0.35, legH + 6, kz + 0.35);
  b.box(kx - 0.45, legH + 6, kz - 0.45, kx + 0.45, legH + 6.5, kz + 0.45, MAT.NEON, [1, 0.2, 0.2]);
}

/** moored cargo ship lying along `axis`, hull centred on (x, z) */
export function ship(b: Builder, x: number, z: number, axis: 'x' | 'z', len: number, r: Rng, rooftops: RoofTop[]): void {
  const w = 12, hh = 6.5;
  const hull: [number, number, number] = pick(r, [[0.55, 0.18, 0.16], [0.18, 0.24, 0.36], [0.2, 0.3, 0.26]] as [number, number, number][]);
  const B = (u0: number, v0: number, y0: number, u1: number, v1: number, y1: number, m: number, c: [number, number, number], o = {}) => {
    const [ax, az] = axis === 'x' ? [x + u0, z + v0] : [x + v0, z + u0];
    const [bx, bz] = axis === 'x' ? [x + u1, z + v1] : [x + v1, z + u1];
    b.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), m, c, o);
    b.collider(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz));
  };
  const L = len / 2;
  B(-L, -w / 2, 0, L - 6, w / 2, hh, MAT.METAL, hull);
  // tapered bow in three steps
  B(L - 6, -w * 0.4, 0, L - 3, w * 0.4, hh, MAT.METAL, hull);
  B(L - 3, -w * 0.25, 0.5, L - 0.8, w * 0.25, hh, MAT.METAL, hull);
  B(-L, -w / 2, hh, L - 6, w / 2, hh + 0.4, MAT.METAL, [0.5, 0.5, 0.48]); // deck
  // superstructure at the stern
  B(-L + 1, -w / 2 + 1, hh + 0.4, -L + 9, w / 2 - 1, hh + 9, MAT.CONCRETE, [0.88, 0.88, 0.84], { win: 1, roofMat: MAT.METAL, roofColor: METALC });
  B(-L + 3.5, -1, hh + 9, -L + 5.5, 1, hh + 13, MAT.METAL, [0.8, 0.3, 0.2]); // funnel
  // deck cargo
  for (let u = -L + 11; u < L - 9; u += 6.6) {
    for (const v of [-3.6, 0, 3.6]) {
      const n = rangeI(r, 0, 3);
      for (let s = 0; s < n; s++) {
        const [ax, az] = axis === 'x' ? [x + u, z + v] : [x + v, z + u];
        const hx = axis === 'x' ? 3.1 : 1.6, hz = axis === 'x' ? 1.6 : 3.1;
        b.box(ax - hx, hh + 0.4 + s * 2.62, az - hz, ax + hx, hh + 0.4 + s * 2.62 + 2.55, az + hz, MAT.METAL, pick(r, CONT_COLS));
      }
      if (n > 0) {
        const [ax, az] = axis === 'x' ? [x + u, z + v] : [x + v, z + u];
        const hx = axis === 'x' ? 3.1 : 1.6, hz = axis === 'x' ? 1.6 : 3.1;
        b.collider(ax - hx, hh + 0.4, az - hz, ax + hx, hh + 0.4 + n * 2.62, az + hz);
      }
    }
  }
  const [rx, rz] = axis === 'x' ? [x - L + 5, z] : [x, z - L + 5];
  rooftops.push({ x: rx, z: rz, y: hh + 9, w: 4, d: 4 });
}

/** street tree on the curb */
export function streetTree(b: Builder, x: number, z: number, r: Rng): void {
  b.box(x - 0.8, 0, z - 0.8, x + 0.8, 0.25, z + 0.8, MAT.CONCRETE, CONCRETE2);
  roundTree(b, x, z, rangeF(r, 0.72, 0.9), r);
}

/** park bench */
export function bench(b: Builder, x: number, z: number, alongX: boolean): void {
  const hx = alongX ? 1.2 : 0.35, hz = alongX ? 0.35 : 1.2;
  b.box(x - hx, 0.45, z - hz, x + hx, 0.6, z + hz, MAT.WOOD, WOODC);
  b.box(x - hx * 0.9, 0, z - hz * 0.9, x + hx * 0.9, 0.45, z + hz * 0.9, MAT.METAL, METALC);
  b.collider(x - hx, 0, z - hz, x + hx, 0.6, z + hz);
}
