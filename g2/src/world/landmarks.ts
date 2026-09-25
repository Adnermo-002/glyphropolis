// Signature landmarks: spire, pagoda, observatory, ferris wheel, lighthouse, gantry crane.

import * as THREE from 'three';
import { MAT } from '../config';
import { pick, type Rng } from '../core/rng';
import { Builder } from './geo';
import {
  CONCRETE, CONCRETE2, GLASSC, METALC, NEON_COLORS, ROOFC,
  cherryTree,
} from './archetypes';
import type { AnimPart, RoofTop } from './archetypes';

function seed(r: Rng): number { return Math.floor(r() * 997); }

/** 字形塔 — central art-deco spire with observation deck. */
export function buildSpire(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[]): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const neon = pick(r, NEON_COLORS);
  let w = 30;
  let y = 0;
  const stages = 7;
  for (let s = 0; s < stages; s++) {
    const hh = s === 0 ? 8 : 3.4;
    const xx0 = cx - w / 2, xx1 = cx + w / 2, zz0 = cz - w / 2, zz1 = cz + w / 2;
    const last = s === stages - 1;
    b.box(xx0, y, zz0, xx1, y + hh, zz1,
      last ? MAT.GLASS : MAT.CONCRETE,
      last ? GLASSC : s % 2 ? CONCRETE2 : CONCRETE,
      { win: last ? 2 : s < 3 ? 1 : 4, roofMat: MAT.ROOF, roofColor: ROOFC, seed: seed(r) });
    b.collider(xx0, y, zz0, xx1, y + hh, zz1);
    y += hh;
    w *= 0.82;
  }
  const top = y;
  b.collider(cx - 0.7, top, cz - 0.7, cx + 0.7, top + 12.6, cz + 0.7);
  b.box(cx - w / 2 - 0.2, top, cz - w / 2 - 0.2, cx + w / 2 + 0.2, top + 0.5, cz + w / 2 + 0.2, MAT.NEON, neon);
  b.cone(cx, cz, 0.9, top, top + 12, 8, MAT.METAL, METALC, seed(r));
  b.box(cx - 0.6, top + 12, cz - 0.6, cx + 0.6, top + 12.6, cz + 0.6, MAT.NEON, neon);
  // sign on stage 4 (+z face): stage 3 spans y 14.8..18.2, half-width 8.2
  const hw3 = 30 * 0.82 ** 3 * 0.5;
  b.box(cx - 5, 9.6, cz + hw3, cx + 5, 18.6, cz + hw3 + 0.5, MAT.SIGN, neon);
  // observation deck at 24.4m (hangs off stage 4/5)
  const dy = 24.4;
  b.box(cx - 17, dy, cz - 17, cx + 17, dy + 1.1, cz + 17, MAT.CONCRETE, CONCRETE2);
  b.box(cx - 17, dy + 1.1, cz - 17, cx + 17, dy + 2.0, cz - 16.4, MAT.METAL, [0.55, 0.6, 0.66]);
  b.box(cx - 17, dy + 1.1, cz + 16.4, cx + 17, dy + 2.0, cz + 17, MAT.METAL, [0.55, 0.6, 0.66]);
  b.box(cx - 17, dy + 1.1, cz - 17, cx - 16.4, dy + 2.0, cz + 17, MAT.METAL, [0.55, 0.6, 0.66]);
  b.box(cx + 16.4, dy + 1.1, cz - 17, cx + 17, dy + 2.0, cz + 17, MAT.METAL, [0.55, 0.6, 0.66]);
  b.collider(cx - 17, dy, cz - 17, cx + 17, dy + 1.1, cz + 17);
  b.collider(cx - 17, dy + 1.1, cz - 17, cx + 17, dy + 2.0, cz - 16.4);
  b.collider(cx - 17, dy + 1.1, cz + 16.4, cx + 17, dy + 2.0, cz + 17);
  b.collider(cx - 17, dy + 1.1, cz - 17, cx - 16.4, dy + 2.0, cz + 17);
  b.collider(cx + 16.4, dy + 1.1, cz - 17, cx + 17, dy + 2.0, cz + 17);
  rooftops.push({ x: cx, z: cz, y: dy + 1.1, w: 30, d: 30 });
  rooftops.push({ x: cx, z: cz, y: top, w: w + 2, d: w + 2 });
}

/** 五重阁 — five-tier pagoda temple. */
export function buildPagoda(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[]): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.box(cx - 15, 0, cz - 15, cx + 15, 0.7, cz + 15, MAT.CONCRETE, CONCRETE2);
  let y = 0.7;
  let rr = 7.6;
  for (let t = 0; t < 5; t++) {
    const hh = 4.0;
    b.cylinder(cx, cz, rr, rr * 0.94, y, y + hh, 14, MAT.BRICK, [0.6, 0.55, 0.5], { seed: seed(r) });
    b.cylinder(cx, cz, rr + 0.06, rr * 0.94 + 0.06, y + 1.1, y + 2.6, 14, MAT.GLASS, GLASSC, { uArc: rr, seed: seed(r) });
    y += hh;
    b.pagodaRoof(cx, cz, rr * 0.3, rr + 3.4, y - 0.4, y + 2.2, MAT.BRICK, [0.5, 0.33, 0.29], 1.25, 20);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const lx = cx + Math.cos(a) * (rr + 2.6), lz = cz + Math.sin(a) * (rr + 2.6);
      b.box(lx - 0.4, y + 0.5, lz - 0.4, lx + 0.4, y + 1.4, lz + 0.4, MAT.LAMP, [1, 0.7, 0.4]);
    }
    y += 2.2;
    rr *= 0.78;
  }
  b.cone(cx, cz, 1.1, y, y + 5, 8, MAT.METAL, [0.8, 0.7, 0.3], seed(r));
  b.collider(cx - 0.8, y, cz - 0.8, cx + 0.8, y + 5, cz + 0.8);
  b.collider(cx - 11, 0, cz - 11, cx + 11, y, cz + 11);
  cherryTree(b, cx - 11, cz - 10, 1.15, r);
  cherryTree(b, cx + 11, cz + 10, 1.15, r);
  cherryTree(b, cx + 11, cz - 10, 1.0, r);
  cherryTree(b, cx - 11, cz + 10, 1.0, r);
  rooftops.push({ x: cx, z: cz, y, w: 6, d: 6 });
}

/** 观星台 — observatory with rotating dome. */
export function buildObservatory(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[], anims: AnimPart[]): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.box(cx - 13, 0, cz - 13, cx + 13, 0.6, cz + 13, MAT.CONCRETE, CONCRETE2);
  b.cylinder(cx, cz, 9, 9, 0.6, 6.6, 18, MAT.CONCRETE, CONCRETE, { capTop: true, seed: seed(r) });
  b.cylinder(cx, cz, 9.1, 9.1, 3.4, 4.6, 18, MAT.GLASS, GLASSC, { uArc: 9.1, seed: seed(r) });
  // rotating dome (separate mesh, rotates about its own center)
  const db = new Builder();
  db.sphere(cx, 6.6, cz, 9, MAT.METAL, [0.62, 0.66, 0.72], 6, 14, 0.55);
  db.box(cx + 8.4, 8.2, cz - 0.9, cx + 11.6, 12.4, cz + 0.9, MAT.METAL, [0.2, 0.22, 0.26]);
  const domeGeo = db.buildGeometry();
  if (domeGeo) {
    domeGeo.translate(-cx, 0, -cz);
    const m = new THREE.Mesh(domeGeo, null!);
    m.position.set(cx, 0, cz);
    anims.push({ mesh: m, fn: (dt) => { m.rotation.y += dt * 0.12; } });
  }
  b.cone(cx, cz, 2.4, 11.4, 13.6, 10, MAT.METAL, METALC, seed(r));
  b.collider(cx - 1.6, 11.4, cz - 1.6, cx + 1.6, 13.6, cz + 1.6);
  b.stick([cx, 13.6, cz], [cx, 16.5, cz], 0.15, MAT.METAL, METALC, 5);
  b.box(cx - 4, 0.6, cz + 10, cx + 4, 3.4, cz + 13, MAT.CONCRETE, CONCRETE2, { win: 1, seed: seed(r) });
  b.collider(cx - 4, 0.6, cz + 10, cx + 4, 3.4, cz + 13);
  b.collider(cx - 9, 0, cz - 9, cx + 9, 6.6, cz + 9);
  rooftops.push({ x: cx, z: cz, y: 11.5, w: 8, d: 8 });
}

/** 城市之轮 — rotating ferris wheel. */
export function buildFerris(b: Builder, x0: number, z0: number, x1: number, z1: number, r: Rng, rooftops: RoofTop[], anims: AnimPart[]): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hubY = 21;
  const R = 19;
  b.box(cx - 14, 0, cz - 4, cx - 12.5, 0.8, cz + 4, MAT.CONCRETE, CONCRETE2);
  b.box(cx + 12.5, 0, cz - 4, cx + 14, 0.8, cz + 4, MAT.CONCRETE, CONCRETE2);
  for (const sz of [-3, 3]) {
    b.stick([cx - 13.5, 0.4, cz + sz], [cx, hubY, cz + sz], 0.7, MAT.METAL, [0.6, 0.35, 0.35], 8);
    b.stick([cx + 13.5, 0.4, cz + sz], [cx, hubY, cz + sz], 0.7, MAT.METAL, [0.6, 0.35, 0.35], 8);
  }
  b.stick([cx, hubY, cz - 3.5], [cx, hubY, cz + 3.5], 1.1, MAT.METAL, METALC, 10);
  const gb = new Builder();
  const rimCols: [number, number, number][] = [[0.85, 0.3, 0.3], [0.3, 0.6, 0.85], [0.85, 0.6, 0.25], [0.4, 0.75, 0.55]];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = cx + Math.cos(a) * R, py = hubY + Math.sin(a) * R;
    gb.stick([cx, hubY, cz], [px, py, cz], 0.28, MAT.METAL, METALC, 6);
    const a2 = ((i + 1) / 12) * Math.PI * 2;
    const px2 = cx + Math.cos(a2) * R, py2 = hubY + Math.sin(a2) * R;
    gb.stick([px, py, cz], [px2, py2, cz], 0.6, MAT.METAL, pick(r, rimCols), 6);
    const ccx = px, ccy = py - 1.5;
    gb.box(ccx - 1.3, ccy - 1, cz - 1.1, ccx + 1.3, ccy + 1, cz + 1.1, MAT.CAR, pick(r, rimCols), { win: 2, seed: seed(r) });
  }
  gb.sphere(cx, hubY, cz, 1.7, MAT.METAL, [0.7, 0.4, 0.4], 4, 8);
  const gGeo = gb.buildGeometry();
  if (gGeo) {
    gGeo.translate(-cx, -hubY, 0);
    const group = new THREE.Mesh(gGeo, null!);
    group.position.set(cx, hubY, 0);
    anims.push({ mesh: group, fn: (dt) => { group.rotation.z -= dt * 0.09; } });
  }
  b.collider(cx - 14, 0, cz - 4, cx - 12.5, 8, cz + 4);
  b.collider(cx + 12.5, 0, cz - 4, cx + 14, 8, cz + 4);
  rooftops.push({ x: cx, z: cz, y: hubY + R + 1, w: 8, d: 8 });
}

/** 灯塔 — lighthouse with rotating beam pair. */
export function buildLighthouse(b: Builder, x0: number, z0: number, x1: number, r: Rng, rooftops: RoofTop[], anims: AnimPart[]): void {
  const cx = (x0 + x1) / 2;
  const cz = z0 + 10;
  b.box(cx - 5, 0, cz - 5, cx + 5, 2.6, cz + 5, MAT.CONCRETE, CONCRETE2, { win: 1, seed: seed(r) });
  b.cylinder(cx, cz, 3.4, 2.5, 0, 22, 14, MAT.CONCRETE, [0.85, 0.85, 0.8], { seed: seed(r) });
  b.cylinder(cx, cz, 3.15, 3.05, 7, 10, 14, MAT.BRICK, [0.7, 0.22, 0.2]);
  b.cylinder(cx, cz, 2.95, 2.85, 14, 17, 14, MAT.BRICK, [0.7, 0.22, 0.2]);
  b.cylinder(cx, cz, 4.0, 4.0, 22, 22.6, 14, MAT.METAL, METALC, { capTop: true, seed: seed(r) });
  b.box(cx - 1.8, 22.6, cz - 1.8, cx + 1.8, 26.2, cz + 1.8, MAT.GLASS, GLASSC, { win: 2, seed: seed(r) });
  b.box(cx - 0.9, 23.6, cz - 0.9, cx + 0.9, 25.4, cz + 0.9, MAT.LAMP, [1, 0.85, 0.55]);
  b.cone(cx, cz, 2.6, 26.2, 28, 12, MAT.METAL, [0.3, 0.32, 0.36], seed(r));
  b.collider(cx - 1.8, 26.2, cz - 1.8, cx + 1.8, 28, cz + 1.8);
  // rotating beam pair
  const bb = new Builder();
  const beamLen = 110;
  const segs = 10;
  for (const dir of [1, -1]) {
    for (let i = 0; i < segs; i++) {
      const d0 = (i / segs) * beamLen, d1 = ((i + 1) / segs) * beamLen;
      const fade0 = d0 / beamLen, fade1 = d1 / beamLen;
      const ring0: [number, number, number, number][] = [];
      const ring1: [number, number, number, number][] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r0 = 0.5 + d0 * 0.1, r1 = 0.5 + d1 * 0.1;
        ring0.push([cx + dir * d0, 24.5 + Math.sin(a) * r0, cz + Math.cos(a) * r0, fade0]);
        ring1.push([cx + dir * d1, 24.5 + Math.sin(a) * r1, cz + Math.cos(a) * r1, fade1]);
      }
      for (let k = 0; k < 8; k++) {
        const k2 = (k + 1) % 8;
        pushBeamQuad(bb, ring0[k], ring0[k2], ring1[k2], ring1[k], dir);
      }
    }
  }
  const beamGeo = bb.buildBeamGeometry();
  if (beamGeo) {
    beamGeo.translate(-cx, 0, -cz);
    const m = new THREE.Mesh(beamGeo, null!);
    m.position.set(cx, 0, cz);
    anims.push({ mesh: m, fn: (dt) => { m.rotation.y += dt * 0.55; } });
  }
  b.collider(cx - 3.5, 0, cz - 3.5, cx + 3.5, 26, cz + 3.5);
  rooftops.push({ x: cx, z: cz, y: 28, w: 5, d: 5 });
}

function pushBeamQuad(
  b: Builder,
  p0: [number, number, number, number], p1: [number, number, number, number],
  p2: [number, number, number, number], p3: [number, number, number, number],
  dir: number,
): void {
  const base = b.bcount;
  for (const p of [p0, p1, p2, p3]) {
    b.bPos.push(p[0], p[1], p[2]);
    b.bNrm.push(dir, 0, 0);
    b.bCol.push(1.0, 0.87, 0.6, 0.8);
    b.bMat.push(0);
    b.bPar.push(0, p[3], 0, 0);
    b.bFac.push(0, 0, 0, 0);
  }
  b.bIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  b.bcount += 4;
}

/** 门式吊 — harbor gantry crane. */
export function buildCrane(b: Builder, x0: number, z0: number, x1: number, z1: number, rooftops: RoofTop[]): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const orange: [number, number, number] = [0.85, 0.5, 0.15];
  // four legs, ties along z on top of each leg pair, two girders along x resting on the ties
  const B = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, m: number, c: [number, number, number]) => {
    b.box(ax, ay, az, bx, by, bz, m, c);
    b.collider(ax, ay, az, bx, by, bz);
  };
  for (const sx of [-19, 19]) {
    for (const sz of [-8, 8]) B(cx + sx - 1, 0, cz + sz - 0.8, cx + sx + 1, 20.6, cz + sz + 0.8, MAT.METAL, orange);
    B(cx + sx - 1.1, 19.4, cz - 8.8, cx + sx + 1.1, 20.6, cz + 8.8, MAT.METAL, orange); // tie
    B(cx + sx - 1.1, 9, cz - 8, cx + sx + 1.1, 9.8, cz + 8, MAT.METAL, orange); // mid brace
  }
  for (const sz of [-8, 8]) B(cx - 18, 0, cz + sz - 0.8, cx + 18, 1.2, cz + sz + 0.8, MAT.CONCRETE, CONCRETE2); // rails
  for (const gz of [-2.2, 2.2]) B(cx - 26, 20.6, cz + gz - 0.7, cx + 26, 22.2, cz + gz + 0.7, MAT.METAL, orange);
  // trolley on the girders, cable and hook block
  B(cx - 8, 22.2, cz - 3.2, cx - 3, 23.6, cz + 3.2, MAT.METAL, [0.5, 0.5, 0.55]);
  b.box(cx - 5.7, 9.4, cz - 0.2, cx - 5.3, 20.6, cz + 0.2, MAT.METAL, METALC);
  b.box(cx - 7, 8.4, cz - 1.2, cx - 4, 9.4, cz + 1.2, MAT.METAL, [0.3, 0.3, 0.34]);
  b.collider(cx - 7, 8.4, cz - 1.2, cx - 4, 9.4, cz + 1.2);
  b.box(cx - 26, 22.2, cz - 0.4, cx + 26, 22.5, cz + 0.4, MAT.NEON, [1, 0.6, 0.2]);
  rooftops.push({ x: cx + 8, z: cz, y: 22.2, w: 10, d: 4 });
}
