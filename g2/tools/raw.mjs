// dev: raw scene (debug 1) + ascii at a given camera. usage: node tools/raw.mjs name t px py pz tx ty tz [play]
import { chromium } from 'playwright';
const [name, t, ...v] = process.argv.slice(2);
const n = v.map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 1500)); });
await page.goto('http://localhost:5199/#' + (process.env.SEED || 'test'), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.evaluate(([t, n, pal]) => {
  const c = window.__city; c.time(t); c.weather(0); c.palette(pal);
  if (n.length === 6) c.cam(...n); else { c.free(); c.teleport(n[0], n[1], n[2]); c.look(n[3], n[4]); }
}, [Number(t), n, process.env.PAL || 'NEON']);
for (let i = 0; i < 120; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); }
await page.waitForTimeout(2000);
await page.screenshot({ path: `/home/user/g2/shots/${name}.png` });
await page.evaluate(() => window.__city.debug(1));
await page.waitForTimeout(1500);
await page.screenshot({ path: `/home/user/g2/shots/${name}_raw.png` });
console.log(name, JSON.stringify(await page.evaluate(() => window.__city.info())), 'errors', errs.slice(0, 5));
await browser.close();
