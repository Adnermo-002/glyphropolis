import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const [x, z] = [543, -59];
for (const [name, d, h] of [['tower_near', 20, 2.5], ['tower_far', 60, 3]]) {
  await page.evaluate(([x, z, d, h]) => { const c = window.__city; c.time(0.72); c.weather(0); c.cam(x + d * 0.6, h, z + d * 0.8, x, 10, z); }, [x, z, d, h]);
  for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/${name}.png` });
}
await browser.close();
