import { CITY } from "../config";
import { hash2, fbm, clamp } from "../core/rng";

export interface BoxDef { x: number; y0: number; z: number; sx: number; sy: number; sz: number;
  r: number; g: number; b: number; seed: number; }
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
      data.trees.push({
        x: ox + 9 + hash2(seed, cx * 31 + i, cz * 17) * (P - 18),
        z: oz + 9 + hash2(seed, cx * 13, cz * 47 + i) * (P - 18),
        s: 0.8 + hash2(seed, cx * 7 + i, cz * 29) * 0.9,
      });
    }
    return data;
  }

  // landmark? one special tower per rare chunk
  const isLandmark = hash2(seed ^ 0xbeef, cx, cz) < 0.02;

  // 2x2 lots inside the block, keeping clear of sidewalks
  const inner0 = 6 + 3.4, inner1 = P - 6 - 3.4;
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
      const s = 13 + r3 * 5;
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
  return data;
}

function mk(x: number, z: number, sx: number, sy: number, sz: number,
  c: number[], r: number, y0 = 0): BoxDef {
  const b = clamp(0.72 + r * 0.5, 0.6, 1.15);
  return { x, y0, z, sx, sy, sz, r: c[0] * b, g: c[1] * b, b: c[2] * b, seed: r * 997 };
}
