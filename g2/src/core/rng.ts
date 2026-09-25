// Deterministic RNG utilities (xmur3 hash + sfc32 stream).

export type Rng = () => number;

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Seed a stream from a string + salt. */
export function rngFrom(seed: string, salt = 0): Rng {
  const seedFn = xmur3(seed);
  return sfc32(seedFn(), seedFn(), seedFn() ^ salt, seedFn());
}

/** Integer hash of a 2D cell -> 32-bit uint. */
export function hash2i(x: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rand01(hash: number): number {
  return (hash >>> 8) / 16777216;
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export function rangeI(r: Rng, a: number, b: number): number {
  return a + Math.floor(r() * (b - a + 1));
}

export function rangeF(r: Rng, a: number, b: number): number {
  return a + r() * (b - a);
}

export function chance(r: Rng, p: number): boolean {
  return r() < p;
}

export function randomSeed(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
