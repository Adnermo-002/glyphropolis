import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const b = await page.evaluate(() => window.__city.findDistrict(4));
await page.evaluate(([x, z]) => { const c = window.__city; c.time(0.72); c.weather(0); c.free(); c.teleport(x, 0, z); }, b);
for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(1000);
const t = await page.evaluate(() => window.__city.findTower());
console.log('tower', t);
if (t) {
  await page.evaluate(([x, z]) => { window.__city.cam(x + 22, 3, z + 26, x, 9, z); }, t);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'shots/tower.png' });
}
// warehouse sawtooth from the side
const wh = await page.evaluate(() => { const c = window.__city.colliders(200).find((c) => c[4] > 10 && c[4] < 16.5 && (c[3]-c[0]) > 14); return c; });
console.log('warehouse', wh);
if (wh) {
  await page.evaluate(([x0, y0, z0, x1, y1, z1]) => { window.__city.cam(x0 - 14, 4, (z0 + z1) / 2 + 30, (x0 + x1) / 2, y1, (z0 + z1) / 2); }, wh);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'shots/warehouse.png' });
}
await browser.close();
