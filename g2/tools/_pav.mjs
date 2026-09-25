import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const settle = async () => { for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); } await page.waitForTimeout(2000); };
let found = null;
for (let d = 0; d < 12 && !found; d++) {
  const parks = await page.evaluate(() => { const out = []; const w = window.__city; return out; });
}
// scan around via teleport: park district id?
const DIST = await page.evaluate(() => window.__city.info().district);
console.log('district now', DIST);
for (const pos of [[0,0],[300,0],[0,300],[-300,0],[0,-300],[300,300],[-300,-300],[300,-300],[-300,300],[600,0],[0,600]]) {
  await page.evaluate(([x, z]) => { const c = window.__city; c.free(); c.teleport(x, 2, z); }, pos);
  await page.waitForTimeout(2500);
  const pil = await page.evaluate(() => window.__city.colliders(400).filter((c) => Math.abs(c[3] - c[0] - 0.8) < 0.01 && Math.abs(c[5] - c[2] - 0.8) < 0.01 && Math.abs(c[4] - 4.6) < 0.01));
  if (pil.length) { found = pil[0]; break; }
}
console.log('pillar', found);
if (found) {
  const x = found[0] + 0.4 + 4, z = found[2] + 0.4 + 4; // corner (-4,-4) assumed
  await page.evaluate(([x, z]) => { const c = window.__city; c.time(0.6); c.weather(0); c.cam(x + 22, 3.5, z + 26, x, 3, z); }, [x, z]);
  await settle();
  await page.screenshot({ path: 'shots/pav.png' });
}
await browser.close();
