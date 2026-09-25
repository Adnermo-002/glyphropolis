// Geometry builder: accumulates world-space quads/triangles with the per-vertex attribute
// layout expected by the world/beam shaders, plus axis-aligned colliders.

import * as THREE from 'three';

export interface BoxCollider {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}

export interface BoxOpts {
  /** window variant: 0 none, 1 window grid, 2 curtain wall, 3 balcony slabs, 4 spandrel */
  win?: number;
  /** roof material override (top face) */
  roofMat?: number;
  roofColor?: [number, number, number];
  /** sign glyph char code (written as 100+code into aFacade.w) */
  signChar?: number;
  /** per-building random seed for window lit pattern */
  seed?: number;
}

export class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  par: number[] = [];
  fac: number[] = [];
  idx: number[] = [];
  // beam buffers
  bPos: number[] = [];
  bNrm: number[] = [];
  bCol: number[] = [];
  bMat: number[] = [];
  bPar: number[] = [];
  bFac: number[] = [];
  bIdx: number[] = [];
  colliders: BoxCollider[] = [];
  /** dev (tools/_scan.ts): record solid boxes so the scanner can find visible geometry without collision */
  static debugSolids = false;
  solids: (BoxCollider & { m: number })[] = [];
  bcount = 0;
  private vcount = 0;

  pushQuad(
    c: [number, number, number][],
    n: [number, number, number],
    color: [number, number, number],
    m: number,
    u: number[],
    v: number[],
    variant: number,
    seed: number,
    signChar: number,
  ): void {
    const base = this.vcount;
    // orient the quad so its winding agrees with the supplied normal (front faces are CCW):
    // Newell's normal is robust to the degenerate "triangle" quads used for caps and gables
    let gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < 4; i++) {
      const p = c[i], q = c[(i + 1) & 3];
      gx += (p[1] - q[1]) * (p[2] + q[2]);
      gy += (p[2] - q[2]) * (p[0] + q[0]);
      gz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    if (gx * n[0] + gy * n[1] + gz * n[2] < 0) {
      c = [c[3], c[2], c[1], c[0]];
      u = [u[3], u[2], u[1], u[0]];
      v = [v[3], v[2], v[1], v[0]];
    }
    for (let i = 0; i < 4; i++) {
      this.pos.push(c[i][0], c[i][1], c[i][2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(color[0], color[1], color[2], 1);
      this.mat.push(m);
      this.par.push(u[i], v[i], variant, seed);
      this.fac.push(0, 0, 0, signChar);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vcount += 4;
  }

  /**
   * Axis-aligned box. u/v facade coords are absolute world coords (for window grids).
   * Face orientation handled per axis.
   */
  box(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    m: number,
    color: [number, number, number],
    o: BoxOpts = {},
  ): void {
    if (Builder.debugSolids) this.solids.push({ x0, y0, z0, x1, y1, z1, m });
    const win = o.win ?? 0;
    const seed = o.seed ?? 0;
    const roofM = o.roofMat ?? m;
    const roofC = o.roofColor ?? color;
    const sgn = o.signChar ?? 0;
    const face = (
      corners: [number, number, number][],
      n: [number, number, number],
      mat: number,
      colr: [number, number, number],
      u: number[],
      v: number[],
      variant: number,
      sign: number,
    ) => this.pushQuad(corners, n, colr, mat, u, v, variant, seed, sign);

    // -X face
    if (x1 - x0 > 0.01) face(
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [-1, 0, 0], m, color, [z0, z1, z1, z0], [y0, y0, y1, y1], win, sgn,
    );
    // +X face
    face(
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [1, 0, 0], m, color, [z1, z0, z0, z1], [y0, y0, y1, y1], win, sgn,
    );
    // -Z face
    if (z1 - z0 > 0.01) face(
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
      [0, 0, -1], m, color, [x0, x1, x1, x0], [y0, y0, y1, y1], win, sgn,
    );
    // +Z face
    face(
      [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]],
      [0, 0, 1], m, color, [x1, x0, x0, x1], [y0, y0, y1, y1], win, sgn,
    );
    // top (+Y)
    if (y1 - y0 > 0.01) face(
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [0, 1, 0], roofM, roofC, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0,
    );
    // bottom (-Y)
    face(
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [0, -1, 0], roofM, roofC, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0,
    );
  }

  /** open cone (lamp beam). y0 = top (bright, fade 0), y1 = bottom (fade 1). */
  beamCone(x: number, z: number, y0: number, y1: number, rTop: number, rBot: number, seg: number, color: [number, number, number], intensity: number): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const pts: [number, number, number][] = [
        [x + Math.cos(a0) * rTop, y0, z + Math.sin(a0) * rTop],
        [x + Math.cos(a1) * rTop, y0, z + Math.sin(a1) * rTop],
        [x + Math.cos(a1) * rBot, y1, z + Math.sin(a1) * rBot],
        [x + Math.cos(a0) * rBot, y1, z + Math.sin(a0) * rBot],
      ];
      const nx = (Math.cos((a0 + a1) / 2)), nz = Math.sin((a0 + a1) / 2);
      for (let k = 0; k < 4; k++) {
        this.bPos.push(pts[k][0], pts[k][1], pts[k][2]);
        this.bNrm.push(nx, -0.2, nz);
        this.bCol.push(color[0], color[1], color[2], intensity);
        this.bMat.push(0);
        this.bPar.push(0, k >= 2 ? 1 : 0, 0, 0);
        this.bFac.push(0, 0, 0, 0);
      }
      // index the quad just pushed (a fixed base here drew only the first segment: a single streak)
      const v = this.bcount;
      this.bIdx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      this.bcount += 4;
    }
  }

  /** lathe: ring surface between two radii (e.g. trees, tanks, spires, domes). */
  cylinder(
    xc: number, zc: number, r0: number, r1: number, y0: number, y1: number,
    seg: number, m: number, color: [number, number, number],
    o: { capTop?: boolean; wobble?: number; seed?: number; uArc?: number } = {},
  ): void {
    if (Builder.debugSolids) { const rr = Math.max(r0, r1) * 0.7; this.solids.push({ x0: xc - rr, y0, z0: zc - rr, x1: xc + rr, y1, z1: zc + rr, m }); }
    const seed = o.seed ?? 0;
    const wr = o.wobble ?? 0;
    const uArc = o.uArc ?? 0;
    const ring = (rr: number, y: number): [number, number, number][] => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const w = 1 + wr * Math.sin(a * 3 + seed * 7 + y) * Math.sin(a * 5 - y * 2);
        pts.push([xc + Math.cos(a) * rr * w, y, zc + Math.sin(a) * rr * w]);
      }
      return pts;
    };
    const top = ring(r1, y1);
    const bot = ring(r0, y0);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const a = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      const u = uArc > 0 ? [a * uArc, a1 * uArc, a1 * uArc, a * uArc] : [0, 0, 0, 0];
      this.pushQuad(
        [bot[i], bot[j], top[j], top[i]],
        [nx, (r0 - r1) / Math.max(0.01, y1 - y0 + r0) * 0.35, nz],
        color, m,
        u, [y0, y0, y1, y1], 0, seed, 0,
      );
    }
    if (o.capTop) {
      const c: [number, number, number] = [xc, y1, zc];
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        this.pushQuad([c, top[j], top[i], c], [0, 1, 0], color, m, [0, 0, 0, 0], [y1, y1, y1, y1], 0, seed, 0);
      }
    }
  }

  cone(xc: number, zc: number, r: number, y0: number, y1: number, seg: number, m: number, color: [number, number, number], seed = 0): void {
    this.cylinder(xc, zc, r, 0.03, y0, y1, seg, m, color, { capTop: true, seed });
  }

  /** thin cylinder between two arbitrary points (spokes, cables, antennae). */
  stick(p0: [number, number, number], p1: [number, number, number], r: number, m: number, color: [number, number, number], seg = 8): void {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return;
    const ax = dx / len, ay = dy / len, az = dz / len;
    let vx: number, vy: number, vz: number;
    if (Math.abs(ay) < 0.9) { vx = 1; vy = 0; vz = 0; } else { vx = 0; vy = 1; vz = 0; }
    let tx = ay * vz - az * vy, ty = az * vx - ax * vz, tz = ax * vy - ay * vx;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // second tangent = d x t
    let sx = ay * tz - az * ty, sy = az * tx - ax * tz, sz = ax * ty - ay * tx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0x = tx * Math.cos(a0) + sx * Math.sin(a0);
      const c0y = ty * Math.cos(a0) + sy * Math.sin(a0);
      const c0z = tz * Math.cos(a0) + sz * Math.sin(a0);
      const c1x = tx * Math.cos(a1) + sx * Math.sin(a1);
      const c1y = ty * Math.cos(a1) + sy * Math.sin(a1);
      const c1z = tz * Math.cos(a1) + sz * Math.sin(a1);
      const p00: [number, number, number] = [p0[0] + c0x * r, p0[1] + c0y * r, p0[2] + c0z * r];
      const p01: [number, number, number] = [p0[0] + c1x * r, p0[1] + c1y * r, p0[2] + c1z * r];
      const p11: [number, number, number] = [p1[0] + c1x * r, p1[1] + c1y * r, p1[2] + c1z * r];
      const p10: [number, number, number] = [p1[0] + c0x * r, p1[1] + c0y * r, p1[2] + c0z * r];
      this.pushQuad([p00, p01, p11, p10], [c0x, c0y, c0z], color, m, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0, 0);
    }
  }

  /** gable roof: ridge along x or z, with triangular gable ends. */
  gableRoof(x0: number, z0: number, x1: number, z1: number, yEave: number, yRidge: number, m: number, color: [number, number, number], ridgeAxis: 'x' | 'z', o: { overhang?: number } = {}): void {
    const ov = o.overhang ?? 0.8;
    const X0 = x0 - ov, X1 = x1 + ov, Z0 = z0 - ov, Z1 = z1 + ov;
    const h = yRidge - yEave;
    const Z4 = [0, 0, 0, 0];
    const vv = [yEave, yEave, yRidge, yRidge];
    // roof rim: fascia boards around the eave line and a soffit underneath, so the overhang reads as
    // a solid slab instead of a paper sheet when seen edge-on or from the street below
    const yb = yEave - 0.32;
    this.pushQuad([[X0, yb, Z0], [X1, yb, Z0], [X1, yEave, Z0], [X0, yEave, Z0]], [0, 0, -1], color, m, Z4, Z4, 0, 0, 0);
    this.pushQuad([[X1, yb, Z1], [X0, yb, Z1], [X0, yEave, Z1], [X1, yEave, Z1]], [0, 0, 1], color, m, Z4, Z4, 0, 0, 0);
    this.pushQuad([[X0, yb, Z1], [X0, yb, Z0], [X0, yEave, Z0], [X0, yEave, Z1]], [-1, 0, 0], color, m, Z4, Z4, 0, 0, 0);
    this.pushQuad([[X1, yb, Z0], [X1, yb, Z1], [X1, yEave, Z1], [X1, yEave, Z0]], [1, 0, 0], color, m, Z4, Z4, 0, 0, 0);
    const dark: [number, number, number] = [color[0] * 0.55, color[1] * 0.55, color[2] * 0.55];
    this.pushQuad([[X0, yb, Z0], [X0, yb, Z1], [X1, yb, Z1], [X1, yb, Z0]], [0, -1, 0], dark, m, Z4, Z4, 0, 0, 0);
    if (ridgeAxis === 'z') {
      const cx = (x0 + x1) / 2, half = (X1 - X0) / 2, nl = Math.hypot(h, half);
      this.pushQuad([[X0, yEave, Z0], [X0, yEave, Z1], [cx, yRidge, Z1], [cx, yRidge, Z0]], [-h / nl, half / nl, 0], color, m, Z4, vv, 0, 0, 0);
      this.pushQuad([[X1, yEave, Z1], [X1, yEave, Z0], [cx, yRidge, Z0], [cx, yRidge, Z1]], [h / nl, half / nl, 0], color, m, Z4, vv, 0, 0, 0);
      this.pushQuad([[X0, yEave, Z0], [cx, yRidge, Z0], [X1, yEave, Z0], [X0, yEave, Z0]], [0, 0, -1], color, m, Z4, Z4, 0, 0, 0);
      this.pushQuad([[X1, yEave, Z1], [cx, yRidge, Z1], [X0, yEave, Z1], [X1, yEave, Z1]], [0, 0, 1], color, m, Z4, Z4, 0, 0, 0);
    } else {
      const cz = (z0 + z1) / 2, half = (Z1 - Z0) / 2, nl = Math.hypot(h, half);
      this.pushQuad([[X1, yEave, Z0], [X0, yEave, Z0], [X0, yRidge, cz], [X1, yRidge, cz]], [0, half / nl, -h / nl], color, m, Z4, vv, 0, 0, 0);
      this.pushQuad([[X0, yEave, Z1], [X1, yEave, Z1], [X1, yRidge, cz], [X0, yRidge, cz]], [0, half / nl, h / nl], color, m, Z4, vv, 0, 0, 0);
      this.pushQuad([[X0, yEave, Z1], [X0, yRidge, cz], [X0, yEave, Z0], [X0, yEave, Z1]], [-1, 0, 0], color, m, Z4, Z4, 0, 0, 0);
      this.pushQuad([[X1, yEave, Z0], [X1, yRidge, cz], [X1, yEave, Z1], [X1, yEave, Z0]], [1, 0, 0], color, m, Z4, Z4, 0, 0, 0);
    }
  }

  /** pagoda-style roof with upturned corners. t=0 is the wide eave (y0), t=1 the narrow top (y1). */
  pagodaRoof(cx: number, cz: number, rTop: number, rEave: number, y0: number, y1: number, m: number, color: [number, number, number], curl: number, seg = 20): void {
    const rows = 4;
    const ringAt = (t: number): [number, number, number][] => {
      const pts: [number, number, number][] = [];
      const r = rEave + (rTop - rEave) * Math.pow(t, 0.85);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cornerF = 1 - Math.abs(Math.cos(2 * a));
        const lift = curl * (1 - t) * (1 - t) * cornerF;
        pts.push([cx + Math.cos(a) * r, y0 + (y1 - y0) * t + lift, cz + Math.sin(a) * r]);
      }
      return pts;
    };
    const slant = Math.atan2((rEave - rTop) / rows, (y1 - y0) / rows + curl * 0.35);
    for (let k = 0; k < rows; k++) {
      const t0 = k / rows, t1 = (k + 1) / rows;
      const r0 = ringAt(t0), r1 = ringAt(t1);
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const a = (i / seg) * Math.PI * 2;
        const nx = Math.cos(a), nz = Math.sin(a);
        // top face (outward + up)
        this.pushQuad(
          [r1[j], r1[i], r0[i], r0[j]],
          [nx * 0.8, Math.tan(slant), nz * 0.8],
          color, m, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0, 0,
        );
        // underside
        this.pushQuad(
          [r0[i], r0[j], r1[j], r1[i]],
          [nx * 0.4, -0.3, nz * 0.4],
          color, m, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0, 0,
        );
      }
    }
    // fascia: a band hanging from the eave ring gives the roof edge real thickness
    const rE = ringAt(0);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      const lo = (p: [number, number, number]): [number, number, number] => [p[0], p[1] - 0.35, p[2]];
      this.pushQuad([lo(rE[i]), lo(rE[j]), rE[j], rE[i]], [Math.cos(a), 0, Math.sin(a)], color, m, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0, 0);
    }
    // cap at the top ring
    const ct: [number, number, number] = [cx, y1 + curl * 0.12, cz];
    const rT = ringAt(1);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.pushQuad([ct, rT[j], rT[i], ct], [0, 1, 0], color, m, [0, 0, 0, 0], [y1, y1, y1, y1], 0, 0, 0);
    }
  }

  sphere(xc: number, yc: number, zc: number, r: number, m: number, color: [number, number, number], lat = 5, lon = 10, squash = 1): void {
    const rows: [number, number, number][][] = [];
    for (let i = 0; i <= lat; i++) {
      const phi = (i / lat) * Math.PI;
      const ring: [number, number, number][] = [];
      for (let j = 0; j < lon; j++) {
        const a = (j / lon) * Math.PI * 2;
        ring.push([
          xc + Math.cos(a) * Math.sin(phi) * r,
          yc + Math.cos(phi) * r * squash,
          zc + Math.sin(a) * Math.sin(phi) * r,
        ]);
      }
      rows.push(ring);
    }
    for (let i = 0; i < lat; i++) {
      const phi = ((i + 0.5) / lat) * Math.PI;
      for (let j = 0; j < lon; j++) {
        const k = (j + 1) % lon;
        const a = (j / lon) * Math.PI * 2;
        this.pushQuad(
          [rows[i][j], rows[i][k], rows[i + 1][k], rows[i + 1][j]],
          [Math.cos(a) * Math.sin(phi), Math.cos(phi) * squash, Math.sin(a) * Math.sin(phi)],
          color, m, [0, 0, 0, 0], [0, 0, 0, 0], 0, 0, 0,
        );
      }
    }
  }

  /** stepped colliders under a gable roof (the walkable shape follows the slopes) */
  gableCollider(x0: number, z0: number, x1: number, z1: number, yEave: number, yRidge: number, ridgeAxis: 'x' | 'z', n = 4): void {
    for (let k = 0; k < n; k++) {
      const top = yRidge - (yRidge - yEave) * ((k + 0.5) / n);
      if (ridgeAxis === 'z') {
        const cx = (x0 + x1) / 2, half = (x1 - x0) / 2;
        const a = half * k / n, b2 = half * (k + 1) / n;
        this.collider(cx - b2, yEave, z0, cx - a, top, z1);
        this.collider(cx + a, yEave, z0, cx + b2, top, z1);
      } else {
        const cz = (z0 + z1) / 2, half = (z1 - z0) / 2;
        const a = half * k / n, b2 = half * (k + 1) / n;
        this.collider(x0, yEave, cz - b2, x1, top, cz - a);
        this.collider(x0, yEave, cz + a, x1, top, cz + b2);
      }
    }
  }

  /** a round footprint approximated by three overlapping boxes (no invisible square corners) */
  roundCollider(x: number, z: number, r: number, y0: number, y1: number): void {
    this.collider(x - r * 0.92, y0, z - r * 0.38, x + r * 0.92, y1, z + r * 0.38);
    this.collider(x - r * 0.38, y0, z - r * 0.92, x + r * 0.38, y1, z + r * 0.92);
    this.collider(x - r * 0.7, y0, z - r * 0.7, x + r * 0.7, y1, z + r * 0.7);
  }

  collider(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.colliders.push({ x0, y0, z0, x1, y1, z1 });
  }

  buildGeometry(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.col), 4));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(this.mat), 1));
    g.setAttribute('aParams', new THREE.BufferAttribute(new Float32Array(this.par), 4));
    g.setAttribute('aFacade', new THREE.BufferAttribute(new Float32Array(this.fac), 4));
    g.setIndex(this.idx);
    return g;
  }

  buildBeamGeometry(): THREE.BufferGeometry | null {
    if (this.bIdx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.bPos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.bNrm), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.bCol), 4));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(this.bMat), 1));
    g.setAttribute('aParams', new THREE.BufferAttribute(new Float32Array(this.bPar), 4));
    g.setAttribute('aFacade', new THREE.BufferAttribute(new Float32Array(this.bFac), 4));
    g.setIndex(this.bIdx);
    return g;
  }
}
