// City sanity scanner: floating solids, visible solids without collision, obstacles on streets.
// usage: npx tsx tools/_scan.ts [seed] [radius]
import * as THREE from 'three';
import { Builder } from '../src/world/geo';
import { genChunk, seedNum } from '../src/world/citygen';
import { districtAt, groundInfoAt, landmarkAt } from '../src/world/districts';
import { MAT, DISTRICT_NAME } from '../src/config';

Builder.debugSolids = true;
const seedStr = process.argv[2] || 'test';
const R = +(process.argv[3] || 8);
const seed = seedNum(seedStr);
const mat = new THREE.MeshBasicMaterial();
type Bx = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; m?: number };
const SKIP_COLL = new Set<number>([MAT.LEAF, MAT.NEON, MAT.SIGN, MAT.WATER, MAT.FOUNTAIN, MAT.LAMP]);
const MATN = Object.fromEntries(Object.entries(MAT).map(([k, v]) => [v, k]));
const issues: Record<string, string[]> = { float: [], nocoll: [], street: [] };
const f = (v: number) => v.toFixed(1);
const ov = (a: Bx, b: Bx, t = 0) => a.x0 < b.x1 + t && a.x1 > b.x0 - t && a.z0 < b.z1 + t && a.z1 > b.z0 - t;

// generate a 3x3 neighbourhood so cross-block support is visible, but report only the centre block
const cache = new Map<string, { solids: Bx[]; cols: Bx[] }>();
const get = (bx: number, bz: number) => {
  const k = bx + ',' + bz;
  if (!cache.has(k)) {
    const b0 = genChunk(bx, bz, seedStr, mat, mat);
    // genChunk builds its own Builder; recover solids via a patched prototype hook
    cache.set(k, { solids: (b0 as unknown as { solids: Bx[] }).solids ?? [], cols: b0.colliders });
  }
  return cache.get(k)!;
};

for (let bx = -R; bx <= R; bx++) for (let bz = -R; bz <= R; bz++) {
  const lm = landmarkAt(bx, bz);
  const { solids, cols } = get(bx, bz);
  const [gt] = groundInfoAt(bx, bz, seed);
  const tag = `[${bx},${bz} ${DISTRICT_NAME[districtAt(bx, bz, seed)]}${lm ? ' ' + lm.id : ''}]`;
  for (const s of solids) {
    const w = s.x1 - s.x0, d = s.z1 - s.z0, h = s.y1 - s.y0;
    const name = `${MATN[s.m!]} (${f(s.x0)},${f(s.y0)},${f(s.z0)})-(${f(s.x1)},${f(s.y1)},${f(s.z1)})`;
    // 1. floating: nothing below or beside it that reaches its base
    if (s.y0 > 0.35 && s.m !== MAT.NEON && s.m !== MAT.SIGN && s.m !== MAT.LAMP) {
      const sup = solids.some((o) => o !== s && ov(s, o, 0.06) && o.y0 < s.y0 - 0.01 && o.y1 >= s.y0 - 0.35)
        || cols.some((o) => ov(s, o, 0.06) && o.y0 < s.y0 - 0.01 && o.y1 >= s.y0 - 0.35)
        || solids.some((o) => o !== s && ov(s, o, 0.06) && o.y0 >= s.y1 - 0.35 && o.y0 <= s.y1 + 0.05); // hangs from above
      if (!sup) issues.float.push(`${tag} ${name}`);
    }
    // 2. visible solid without collision
    if (!SKIP_COLL.has(s.m!) && Math.min(w, d) >= 0.3 && h >= 0.3) {
      const c = { x0: (s.x0 + s.x1) / 2, x1: (s.x0 + s.x1) / 2, z0: (s.z0 + s.z1) / 2, z1: (s.z0 + s.z1) / 2, y0: 0, y1: 0 };
      const hit = cols.some((o) => ov(c, o, 0.35) && o.y0 < s.y1 && o.y1 > s.y0);
      if (!hit) issues.nocoll.push(`${tag} ${name}`);
    }
  }
  // 3. ground-level obstacles in the road (curb lamps/trees at 7 m are fine)
  if (!lm && gt !== 3) {
    const x0 = bx * 72, z0 = bz * 72;
    for (const c of cols) {
      if (c.y0 > 4 || c.y1 < 1.2) continue;
      if ((c.x1 - c.x0) * (c.z1 - c.z0) < 3) continue;
      if (c.x0 > -79.5 && c.x1 < -64.5) continue; // train deck
      const rx0 = Math.min(c.x0 - x0, x0 + 72 - c.x1), rz0 = Math.min(c.z0 - z0, z0 + 72 - c.z1);
      if (rx0 < 9.5 || rz0 < 9.5) issues.street.push(`${tag} (${f(c.x0)},${f(c.y0)},${f(c.z0)})-(${f(c.x1)},${f(c.y1)},${f(c.z1)})`);
    }
  }
}
if (process.argv[5]) {
  const g: Record<string, number> = {};
  const ex: Record<string, string> = {};
  for (const l of issues.nocoll) {
    const m = l.match(/^\[\S+ (\S+?)( \w+)?\] (\w+) \(([-\d.]+),([-\d.]+),([-\d.]+)\)-\(([-\d.]+),([-\d.]+),([-\d.]+)\)/)!;
    const k = `${m[1]}${m[2] ?? ''} ${m[3]} ${(+m[7] - +m[4]).toFixed(0)}x${(+m[8] - +m[5]).toFixed(1)}x${(+m[9] - +m[6]).toFixed(0)}`;
    g[k] = (g[k] || 0) + 1; ex[k] = ex[k] ?? l;
  }
  for (const k of Object.keys(g).sort((a, b) => g[b] - g[a])) console.log(g[k], ex[k]);
}
for (const [k, v] of Object.entries(issues)) {
  console.log(`== ${k}: ${v.length}`);
  for (const l of v.slice(0, +(process.argv[4] || 25))) console.log('  ' + l);
}
