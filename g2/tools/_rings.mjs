// beacon rings visible? (they are drawn by the world shader now)
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text().slice(0, 200)); });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.shaders && inf.pending === 0) break; await page.waitForTimeout(250); }
await page.screenshot({ path: 'shots/boot_screen.png' });
await page.evaluate(() => window.__city.start());
const b = await page.evaluate(() => { const k = window.__city; k.time(0.5); k.weather(0); const b = k.beacon(0); if (!b) return null; const r = b.rings[1]; k.cam(r.x + 26, r.y + 10, r.z + 26, r.x, r.y, r.z); return b; });
console.log('beacon', b && [b.x, b.y, b.z], 'rings', b && b.rings.length);
for (let i = 0; i < 40; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/rings.png' });
console.log('errors', errs.filter((e) => !/GPU stall|KHR_parallel/.test(e)).slice(0, 5));
await browser.close();
