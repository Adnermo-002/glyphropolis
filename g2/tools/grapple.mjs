import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.waitForTimeout(1500);
let shot = false;
for (let yaw = 0; yaw < 1; yaw += 0.785) {
  await page.evaluate(([y]) => { const c = window.__city; c.free(); c.teleport(108, 0, 130); c.look(y, 0.3); }, [yaw]);
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyE'); await page.waitForTimeout(500);
  const a = await page.evaluate(() => window.__city.info());
  if (a.grappling && !shot) { await page.screenshot({ path: 'shots/grapple.png' }); shot = true; }
  await page.waitForTimeout(3000);
  const b = await page.evaluate(() => window.__city.info());
  await page.keyboard.up('KeyE');
  console.log(yaw.toFixed(2), 'grappling', a.grappling, a.pos, '->', b.pos);
}
await browser.close();
