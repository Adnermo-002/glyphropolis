import { CITY, ROAD } from "../config";
import { hash2, fbm, clamp } from "../core/rng";

export interface BoxDef { x: number; y0: number; z: number; sx: number; sy: number; sz: number;
  r: number; g: number; b: number; seed: number; st: number; }
export interface ChunkData {
  cx: number; cz: number; park: boolean;
  boxes: BoxDef[];
  trees: { x: number; z: number; s: number }[];
}

export type District = "park" | "residential" | "midtown" | "downtown";

// Low-frequency district field: downtown clusters emerge naturally in the
// endless plane; the same seed always yields the same districts.
export function districtAt(seed: number, wx: number, wz: number): District {
  const d = fbm(seed ^ 0x51ab, wx, wz, 1 / 640, 3);
  if (d < 0.36) return "park";
  if (d < 0.52) return "residential";
  if (d < 0.68) return "midtown";
  return "downtown";
}

const TINTS_DOWNTOWN = [[0.42,0.5,0.62],[0.5,0.55,0.62],[0.38,0.42,0.5],[0.55,0.58,0.66]];
const TINTS_MID = [[0.52,0.48,0.44],[0.6,0.55,0.48],[0.45,0.45,0.5],[0.58,0.52,0.5]];
const TINTS_RES = [[0.62,0.55,0.45],[0.65,0.6,0.52],[0.5,0.5,0.42],[0.58,0.48,0.4]];
const TINTS_IND = [[0.45,0.45,0.47],[0.5,0.48,0.44]];

export function genChunk(seed: number, cx: number, cz: number): ChunkData {
  const P = CITY.blockPitch;
  const ox = cx * P, oz = cz * P;
  const district = districtAt(seed, ox + P / 2, oz + P / 2);
  const data: ChunkData = { cx, cz, park: district === "park", boxes: [], trees: [] };

  if (district === "park") {
    const n = 18 + Math.floor(hash2(seed, cx * 3, cz * 7) * 12);
    for (let i = 0; i < n; i++) {
      // parks keep every tree inside the block proper — never on sidewalks or roads
      const m0 = ROAD.line + 0.8, m1 = P - ROAD.line - 0.8;
      data.trees.push({
        x: ox + m0 + hash2(seed, cx * 31 + i, cz * 17) * (m1 - m0),
        z: oz + m0 + hash2(seed, cx * 13, cz * 47 + i) * (m1 - m0),
        s: 0.8 + hash2(seed, cx * 7 + i, cz * 29) * 0.9,
      });
    }
    return data;
  }

  // landmark? one special tower per rare chunk
  const isLandmark = hash2(seed ^ 0xbeef, cx, cz) < 0.02;

  // 2x2 lots inside the block, keeping clear of the (wide) sidewalks
  const inner0 = ROAD.line + 0.6, inner1 = P - ROAD.line - 0.6;
  const lotW = (inner1 - inner0) / 2;
  for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
    const r0 = hash2(seed, cx * 2 + lx, cz * 2 + lz);
    const r1 = hash2(seed, cx * 2 + lx, cz * 2 + lz + 97);
    const r2 = hash2(seed, cx * 2 + lx + 55, cz * 2 + lz);
    const r3 = hash2(seed, cx * 2 + lx + 55, cz * 2 + lz + 97);
    const lotCX = ox + inner0 + lotW * (lx + 0.5) + (r0 - 0.5) * 2.0;
    const lotCZ = oz + inner0 + lotW * (lz + 0.5) + (r1 - 0.5) * 2.0;

    if (isLandmark && lx === 0 && lz === 0) {
      const h = 120 + r2 * 70;
      const s = 12 + r3 * 3;
      const t: number[] = [0.3, 0.34, 0.44];
      data.boxes.push(mk(lotCX, lotCZ, s, h, s, t, r0));
      data.boxes.push(mk(lotCX, lotCZ, s * 0.55, h * 0.32, s * 0.55, t, r0, h));
      data.boxes.push(mk(lotCX, lotCZ, 1.2, h * 0.38 + 8, 1.2, [0.75, 0.2, 0.35], r0, h + h * 0.32));
      continue;
    }
    if (r2 < 0.14) { // plaza lot: maybe trees
      if (r3 < 0.5) data.trees.push({ x: lotCX, z: lotCZ, s: 1.0 + r0 });
      continue;
    }

    // 40% of lots grow one of the reference-remix prototypes (ADR 0003):
    // rowhouses (residential), ledge towers (midtown), antenna towers
    // (downtown); the landmark above already carries the cornice look.
    if (hash2(seed ^ 0x77aa, cx * 4 + lx, cz * 4 + lz) < 0.4) {
      const t2 = district === "downtown" ? TINTS_DOWNTOWN : district === "midtown" ? TINTS_MID
        : district === "residential" ? TINTS_RES : TINTS_IND;
      const tint2 = t2[Math.floor(r0 * t2.length) % t2.length];
      const bright2 = 0.55 + r1 * 0.45;
      const col2 = [tint2[0] * bright2, tint2[1] * bright2, tint2[2] * bright2];
      if (district === "residential") {
        // rowhouses: two low blocks shoulder to shoulder, banded floors
        const hw = Math.min((lotW - 1.6) / 2, 7.5);
        const dep = 8 + r3 * 4;
        data.boxes.push(mk(lotCX - hw / 2 - 0.2, lotCZ, hw, 5.5 + r1 * 6, dep, col2, r2, 0, 1));
        data.boxes.push(mk(lotCX + hw / 2 + 0.2, lotCZ, hw, 5.5 + r2 * 6, dep, col2, r3, 0, 1));
      } else if (district === "midtown") {
        // ledge tower: slabs ring the shaft at 1/3 and 2/3 height
        const h = 16 + Math.pow(r2, 1.3) * 34;
        const w = Math.min(10 + r0 * 5, lotW - 1.6);
        data.boxes.push(mk(lotCX, lotCZ, w, h, w, col2, r3, 0, 2));
        data.boxes.push(mk(lotCX, lotCZ, w * 1.07, 0.5, w * 1.07, col2, r3, h / 3, 2));
        data.boxes.push(mk(lotCX, lotCZ, w * 1.07, 0.5, w * 1.07, col2, r3, h * 2 / 3, 2));
      } else {
        // antenna tower: glassy shaft + rooftop masts
        const h = 34 + Math.pow(r2, 1.5) * 72;
        const w = Math.min(10 + r0 * 5, lotW - 1.6);
        data.boxes.push(mk(lotCX, lotCZ, w, h, w, col2, r3, 0, 3));
        data.boxes.push(mk(lotCX, lotCZ, 0.4, 7 + r1 * 9, 0.4, [0.16, 0.16, 0.18], r3, h, 3));
        if (r2 > 0.55) data.boxes.push(mk(lotCX + w * 0.2, lotCZ - w * 0.2, 0.3, 4 + r0 * 5, 0.3, [0.16, 0.16, 0.18], r3, h, 3));
      }
      continue;
    }

    let sy = 0, sx = 0, sz = 0;
    const tints = district === "downtown" ? TINTS_DOWNTOWN : district === "midtown" ? TINTS_MID
      : district === "residential" ? TINTS_RES : TINTS_IND;
    const tint = tints[Math.floor(r0 * tints.length) % tints.length];
    const bright = 0.55 + r1 * 0.45;
    const col = [tint[0] * bright, tint[1] * bright, tint[2] * bright];

    if (district === "downtown") {
      sx = 11 + r0 * 6.5; sz = 11 + r1 * 6.5;
      sy = 26 + Math.pow(r2, 1.6) * 88 + fbm(seed ^ 0x77, lotCX, lotCZ, 1 / 90, 2) * 26;
    } else if (district === "midtown") {
      sx = 12 + r0 * 6; sz = 12 + r1 * 6;
      sy = 13 + r2 * 38 + fbm(seed ^ 0x77, lotCX, lotCZ, 1 / 90, 2) * 12;
    } else if (district === "residential") {
      sx = 9 + r0 * 8; sz = 9 + r1 * 8;
      sy = 5.5 + r2 * 16;
    } else { // industrial: low + wide
      sx = 13 + r0 * 4.5; sz = 13 + r1 * 4.5;
      sy = 5 + r2 * 8;
    }
    sx = Math.min(sx, lotW - 1.2); sz = Math.min(sz, lotW - 1.2);
    data.boxes.push(mk(lotCX, lotCZ, sx, sy, sz, col, r3));
    // setback tiers for towers
    if (sy > 46) {
      data.boxes.push(mk(lotCX, lotCZ, sx * 0.68, sy * 0.34, sz * 0.68, col, r3, sy));
      if (sy > 78) data.boxes.push(mk(lotCX, lotCZ, sx * 0.42, sy * 0.28, sz * 0.42, col, r3, sy * 1.34));
    }
  }

  // street trees planted on the sidewalks (sparse downtown, lush elsewhere)
  {
    const density = district === "downtown" ? 0.3 : 0.6;
    for (let k = 0; k < 4; k++) {
      if (hash2(seed, cx * 17 + k, cz * 5) < density) {
        data.trees.push({ x: ox + ROAD.treeLine, z: oz + 18 + k * 11 + hash2(seed, cx + k, cz * 3) * 4, s: 0.75 + hash2(seed, cx * 2 + k, cz) * 0.4 });
      }
      if (hash2(seed, cx * 5, cz * 17 + k) < density) {
        data.trees.push({ x: ox + 18 + k * 11 + hash2(seed, cx * 3, cz + k) * 4, z: oz + ROAD.treeLine, s: 0.75 + hash2(seed, cx, cz * 2 + k) * 0.4 });
      }
    }
  }
  return data;
}

function mk(x: number, z: number, sx: number, sy: number, sz: number,
  c: number[], r: number, y0 = 0, st = 0): BoxDef {
  const b = clamp(0.72 + r * 0.5, 0.6, 1.15);
  return { x, y0, z, sx, sy, sz, r: c[0] * b, g: c[1] * b, b: c[2] * b, seed: r * 997, st };
}
