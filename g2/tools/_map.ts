import { districtAt, groundInfoAt } from '../src/world/districts';
import { seedNum } from '../src/world/citygen';
const seed = seedNum(process.argv[2] || 'glyph');
const ch = ['D', 'm', 'o', 'r', 'I', 'P', 'H'];
for (let bz = 10; bz >= -12; bz--) {
  let s = '';
  for (let bx = -14; bx <= 12; bx++) {
    const [g] = groundInfoAt(bx, bz, seed);
    s += (bx === 0 && bz === 0) ? '@' : g === 3 ? '~' : ch[districtAt(bx, bz, seed)];
  }
  console.log(s);
}
