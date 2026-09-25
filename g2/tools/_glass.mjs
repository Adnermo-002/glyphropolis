// glass / lighting look check: node tools/_glass.mjs <tag> [times e.g. 0.45,0.7,0.93]
import { chromium } from 'playwright';
const tag = process.argv[2] || 'a';
const times = (process.argv[3] || '0.45,0.71,0.93').split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const settle = async () => { for (let i = 0; i < 80; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); } await page.waitForTimeout(2500); };
const views = { up: [80, 2.5, 115, 50, 45, 30], cbd: [-60, 110, 190, 36, 20, 36], near: [8, 5, 95, 36, 35, 30] };
const only = process.argv[4]; if (only) for (const k of Object.keys(views)) if (!only.split(',').includes(k)) delete views[k];
for (const t of times) for (const [n, c] of Object.entries(views)) {
  await page.evaluate(([c, t]) => { const k = window.__city; k.time(t); k.weather(0); k.cam(...c); }, [c, t]);
  await settle();
  await page.evaluate(([c]) => window.__city.cam(...c), [c]);
  await page.waitForTimeout(800);
  const f = `shots/glass_${n}_${String(t).replace('0.', '')}_${tag}.png`;
  await page.screenshot({ path: f }); console.log(f);
}
console.log('errors', errs.slice(0, 5));
await browser.close();
