import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const settle = async () => { for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); } await page.waitForTimeout(2500); };
// night lamp
await page.evaluate(() => { const c = window.__city; c.time(0.85); c.weather(0); c.cam(92, 2.2, 98, 79, 3.5, 79); });
await settle();
await page.screenshot({ path: 'shots/lamp_night.png' });
// warehouse
await page.evaluate(() => { const c = window.__city; c.free(); c.teleport(292, 0, -40); });
await page.waitForTimeout(3000);
const st = await page.evaluate(() => window.__city.colliders(400).filter((c) => c[1] > 9 && c[4] - c[1] < 3.5 && c[4] - c[1] > 0.3 && (c[3] - c[0]) < 4 || false));
console.log('steps', st.length, JSON.stringify(st.slice(0, 3)));
if (st.length) {
  const c0 = st[0];
  await page.evaluate(([x, y, z]) => { const c = window.__city; c.time(0.45); c.cam(x - 26, y + 10, z + 30, x + 6, y, z); }, [c0[0], c0[1], c0[2]]);
  await settle();
  await page.screenshot({ path: 'shots/saw.png' });
}
console.log('errors', errs);
await browser.close();
