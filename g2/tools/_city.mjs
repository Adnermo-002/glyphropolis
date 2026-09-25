import { chromium } from 'playwright';
const tag = process.argv[2] || 'a';
const only = process.argv[3];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
const settle = async () => { for (let i = 0; i < 80; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); } await page.waitForTimeout(2500); };
const shots = {
  street: async () => [72.5, 2.4, 170, 73, 10, 60],
  cbd: async () => [-60, 110, 190, 36, 20, 36],
  mid: async () => { const [x, z] = await page.evaluate(() => window.__city.findDistrict(1)); return [x - 40, 70, z + 130, x + 36, 5, z + 36]; },
  old: async () => { const [x, z] = await page.evaluate(() => window.__city.findDistrict(2)); return [x - 30, 45, z + 100, x + 36, 3, z + 36]; },
  resi: async () => { const [x, z] = await page.evaluate(() => window.__city.findDistrict(3)); return [x - 40, 60, z + 120, x + 36, 3, z + 36]; },
  harbor: async () => { const [x, z] = await page.evaluate(() => window.__city.findDistrict(6)); return [x + 110, 55, z + 110, x + 20, 3, z + 20]; },
  harbor2: async () => { const [x, z] = await page.evaluate(() => window.__city.findDistrict(6)); return [x + 60, 4, z + 90, x + 20, 8, z - 10]; },
  ind: async () => { const [x, z] = await page.evaluate(() => window.__city.findDistrict(4)); return [x - 40, 60, z + 120, x + 36, 3, z + 36]; },
};
for (const [n, f] of Object.entries(shots)) {
  if (only && !only.split(',').includes(n)) continue;
  const c = await f();
  await page.evaluate((c) => { const k = window.__city; k.time(0.45); k.weather(0); k.cam(...c); }, c);
  await page.evaluate((c) => { const k = window.__city; k.cam(...c); }, c);
  await settle();
  await page.screenshot({ path: `shots/city_${n}_${tag}.png` });
  console.log(n, c.map((v) => Math.round(v)).join(','));
}
console.log('errors', errs);
await browser.close();
