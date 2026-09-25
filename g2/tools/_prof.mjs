import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
for (const [name, t, x, z, yaw, w] of [['street', 0.5, 108, 130, 2.6, 0], ['storm', 0.72, 108, 130, 2.6, 3]]) {
  await page.evaluate(([t, x, z, yaw, w]) => { const c = window.__city; c.time(t); c.weather(w); c.free(); c.teleport(x, 0, z); c.look(yaw, 0); }, [t, x, z, yaw, w]);
  await page.waitForTimeout(3000);
  const rs = []; for (let i = 0; i < 3; i++) rs.push(await page.evaluate(() => window.__city.profile()));
  console.log(name, JSON.stringify(rs[2]), JSON.stringify(await page.evaluate(() => window.__city.stats())));
}
await browser.close();
