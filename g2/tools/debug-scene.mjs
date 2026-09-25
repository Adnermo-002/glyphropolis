// dev: inspect scene meshes around a camera position
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.evaluate(() => { const c = window.__city; c.time(0.8); c.cam(72, 2.2, 250, 72, 12, 50); });
for (let i = 0; i < 120; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(1500);
const r = await page.evaluate(() => window.__city.meshes());
console.log(JSON.stringify(r, null, 0).slice(0, 6000));
await page.evaluate(() => window.__city.debug(1));
await page.waitForTimeout(1500);
await page.screenshot({ path: '/home/user/g2/shots/dbg_raw.png' });
console.log('errors', errs.slice(0, 5));
await browser.close();
