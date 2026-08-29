// Deterministic hashing + noise. Everything in the world derives from seed + coords.
export function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// 2D integer hash -> [0,1)
export function hash2(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * (3 - 2 * t);

// Smooth value noise in [0,1), world-space frequency f (cycles per meter)
export function valueNoise(seed: number, x: number, z: number, f: number): number {
  const fx = x * f, fz = z * f;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fade(fx - x0), tz = fade(fz - z0);
  const a = hash2(seed, x0, z0), b = hash2(seed, x0 + 1, z0);
  const c = hash2(seed, x0, z0 + 1), d = hash2(seed, x0 + 1, z0 + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function fbm(seed: number, x: number, z: number, f: number, octaves = 3): number {
  let sum = 0, amp = 0.5, norm = 0, freq = f;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 1013, x, z, freq);
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
export const smooth = (t: number) => clamp(t, 0, 1) * clamp(t, 0, 1) * (3 - 2 * clamp(t, 0, 1));
