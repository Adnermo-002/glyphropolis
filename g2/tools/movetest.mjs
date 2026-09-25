// dev: verifies WASD moves relative to the camera yaw, and walk/jump/glide/grapple don't error
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.waitForTimeout(1500);
const info = () => page.evaluate(() => window.__city.info());
for (const [key, yaw] of [['KeyW', 0], ['KeyW', Math.PI / 2], ['KeyW', 2.6], ['KeyD', 0], ['KeyS', 0]]) {
  await page.evaluate(([yaw]) => { const c = window.__city; c.free(); c.teleport(108, 0, 130); c.look(yaw, 0); }, [yaw]);
  await page.waitForTimeout(600);
  const a = (await info()).pos;
  await page.keyboard.down(key); await page.waitForTimeout(1500); await page.keyboard.up(key);
  const b = (await info()).pos;
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
  const fwd = [-Math.sin(yaw), -Math.cos(yaw)];
  console.log(key, 'yaw', yaw.toFixed(2), 'moved', l.toFixed(1), 'dir', (dx / l).toFixed(2), (dz / l).toFixed(2), 'camFwd', fwd.map((v) => v.toFixed(2)).join(' '));
}
// jump + glide
await page.evaluate(() => { const c = window.__city; c.teleport(108, 40, 130); c.look(2.6, 0); });
await page.keyboard.down('Space'); await page.keyboard.down('KeyW'); await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/glide.png' });
console.log('glide', JSON.stringify((await info()).pos));
await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
await page.waitForTimeout(3000);
console.log('landed', JSON.stringify((await info()).pos));
// grapple: look up at a building, hold E
await page.evaluate(() => { const c = window.__city; c.teleport(108, 0, 130); c.look(2.6, 0.35); });
await page.waitForTimeout(500);
await page.keyboard.down('KeyE'); await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/grapple.png' });
await page.waitForTimeout(800);
console.log('grapple', JSON.stringify((await info()).pos));
await page.keyboard.up('KeyE');
console.log('errors', errs);
await browser.close();
