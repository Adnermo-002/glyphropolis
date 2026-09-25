import { chromium } from 'playwright';
const tag = process.argv[2] || 'a';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const settle = async () => { for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); } await page.waitForTimeout(2000); };
const views = [
  ['front', 0.46, [150, 40, 150, 72, 10, 72]],
  ['gold', 0.73, [30, 30, 30, 110, 8, 110]],
];
for (const [n, t, c] of views) {
  await page.evaluate(([t, c]) => { const k = window.__city; k.time(t); k.weather(0); k.cam(...c); }, [t, c]);
  await settle();
  await page.screenshot({ path: `shots/day_${n}_${tag}.png` });
  if (n === 'street' || n === 'front') { await page.evaluate(() => window.__city.debug(1)); await page.waitForTimeout(600); await page.screenshot({ path: `shots/day_${n}_raw_${tag}.png` }); await page.evaluate(() => window.__city.debug(0)); }
}
console.log('errors', errs);
await browser.close();
