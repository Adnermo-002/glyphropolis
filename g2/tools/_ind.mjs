import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const b = await page.evaluate(() => window.__city.findDistrict(4));
console.log('industrial block', b);
await page.evaluate(([x, z]) => { const c = window.__city; c.time(0.45); c.weather(0); c.cam(x - 20, 6, z - 20, x + 36, 8, z + 36); }, b);
for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/ind1.png' });
await page.evaluate(([x, z]) => { const c = window.__city; c.cam(x + 92, 5, x > 0 ? z + 80 : z + 80, x + 36, 9, z + 36); }, b);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/ind2.png' });
await browser.close();
