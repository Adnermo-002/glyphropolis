// Screenshot harness (dev only). Needs the dev server on :5199 and Playwright's chromium.
//   node tools/shots.mjs [nameFilter]        env: SEED=test OUT=shots DPR=1 W=1280 H=720
// Uses SwiftShader so it also runs on machines without a GPU (slow: ~10-20 s per shot).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SEED = process.env.SEED || 'test';
const OUT = process.env.OUT || new URL('../shots/', import.meta.url).pathname;
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const filters = (process.argv[2] || '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

// cam: [px,py,pz, tx,ty,tz] fixed camera; play: [x,y,z,yaw,pitch] = chase camera behind the player
const SHOTS = [
  { name: 'n1_skyline_noon', t: 0.42, w: 0, pal: 'NEON', cam: [36, 14, 265, 36, 50, 36] },
  { name: 'n2_street_night', t: 0.8, w: 0, pal: 'NEON', cam: [72, 2.2, 250, 72, 12, 50] },
  { name: 'n3_pagoda_day', t: 0.46, w: 0, pal: 'NEON', cam: [148, 7, 300, 180, 22, 252] },
  { name: 'n4_ferris_night', t: 0.8, w: 0, pal: 'NEON', cam: [395, 12, 40, 324, 32, 108] },
  { name: 'n5_storm', t: 0.44, w: 3, pal: 'NEON', cam: [36, 9, 260, 36, 45, 36] },
  { name: 'n6_paper_pagoda', t: 0.46, w: 0, pal: 'PAPER', cam: [148, 7, 300, 180, 22, 252] },
  { name: 'n7_lighthouse_night', t: 0.79, w: 0, pal: 'NEON', cam: [-430, 14, -90, -360, 12, -180] },
  { name: 'n8_facade_amber', t: 0.77, w: 0, pal: 'AMBER', cam: [140, 16, 172, 108, 45, 168] },
  { name: 'n9_dusk_play', t: 0.745, w: 0, pal: 'NEON', play: [108, 0, 130, 2.6, -0.05] },
  { name: 'n10_crt_night', t: 0.85, w: 0, pal: 'CRT', cam: [36, 30, 200, 36, 40, 36] },
  { name: 'n11_vapor_dusk', t: 0.735, w: 0, pal: 'VAPOR', cam: [230, 40, 230, 36, 30, 36] },
  { name: 'n12_blueprint', t: 0.5, w: 1, pal: 'BLUEPRINT', cam: [-60, 60, 180, 60, 10, 20] },
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR || 1) });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 1500));
});

await page.goto(`http://localhost:5199/#${SEED}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.waitForTimeout(2500);

for (const s of SHOTS) {
  if (filters.length && !filters.some((f) => s.name.startsWith(f))) continue;
  await page.evaluate((s) => {
    const c = window.__city;
    c.time(s.t);
    c.weather(s.w);
    c.palette(s.pal);
    if (s.cam) c.cam(...s.cam);
    else { c.free(); c.teleport(s.play[0], s.play[1], s.play[2]); c.look(s.play[3], s.play[4]); }
  }, s);
  for (let i = 0; i < 120; i++) {
    const inf = await page.evaluate(() => window.__city.info());
    if (inf.pending === 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(s.wait || 2500);
  await page.screenshot({ path: `${OUT}/${s.name}.png`, timeout: 120000 });
  console.log('shot', s.name, JSON.stringify(await page.evaluate(() => window.__city.info())));
}
console.log('errors:', JSON.stringify([...new Set(errs)].slice(0, 8), null, 1));
await browser.close();
