import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.evaluate(() => { const c = window.__city; c.time(0.8); c.weather(0); c.free(); c.teleport(3100, 0, -2600); c.look(0.8, 0.05); });
for (let i = 0; i < 120; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/far_night.png' });
await page.keyboard.press('Tab'); await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/far_map.png' });
console.log(JSON.stringify(await page.evaluate(() => window.__city.info())), errs);
await browser.close();
