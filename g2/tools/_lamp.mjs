import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.evaluate(() => { const c = window.__city; c.time(0.85); c.weather(0); c.cam(72.5, 2.4, 100, 79, 4, 79); });
for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/lamp_night.png' });
await page.evaluate(() => window.__city.debug(1)); await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/lamp_night_raw.png' });
await browser.close();
