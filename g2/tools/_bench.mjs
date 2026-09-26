// perf baseline: per-pass GPU ms (swiftshader, relative only) + screenshots for visual diff
// usage: node tools/_bench.mjs <tag> [quality]   (quality: auto|low|mid|high, if supported)
import { chromium } from 'playwright';
const tag = process.argv[2] || 'a';
const quality = process.argv[3] || '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const tBoot = Date.now() - t0;
const tStart = await page.evaluate(async () => { const a = performance.now(); window.__city.start(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - a; });
if (quality) await page.evaluate((q) => window.__city.quality && window.__city.quality(q), quality);
const settle = async () => { for (let i = 0; i < 80; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(500); } await page.waitForTimeout(2000); };
const views = {
  street: { t: 0.45, w: 0, cam: [72.5, 2.4, 170, 73, 10, 60] },
  cbd: { t: 0.45, w: 0, cam: [-60, 110, 190, 36, 20, 36] },
  night: { t: 0.92, w: 0, cam: [72.5, 2.4, 170, 73, 10, 60] },
  dusk: { t: 0.78, w: 1, cam: [-60, 40, 190, 36, 20, 36] },
};
const out = { tag, quality, bootMs: tBoot, firstFrameMs: +tStart.toFixed(0), views: {} };
for (const [n, v] of Object.entries(views)) {
  await page.evaluate((v) => { const k = window.__city; k.time(v.t); k.weather(v.w); k.cam(...v.cam); }, v);
  await settle();
  await page.screenshot({ path: `shots/bench_${n}_${tag}.png` });
  const rs = [];
  for (let i = 0; i < 3; i++) rs.push(await page.evaluate(() => window.__city.profile()));
  const med = {};
  for (const k of Object.keys(rs[0])) med[k] = rs.map((r) => r[k]).sort((a, b) => a - b)[1];
  const st = await page.evaluate(() => window.__city.stats());
  out.views[n] = { ...med, total: +Object.values(med).reduce((a, b) => a + b, 0).toFixed(1), calls: st.calls, tris: st.triangles };
  console.log(n, JSON.stringify(out.views[n]));
}
console.log(JSON.stringify({ bootMs: out.bootMs, firstFrameMs: out.firstFrameMs, info: await page.evaluate(() => window.__city.info()) }));
console.log('errors', errs.slice(0, 5));
await browser.close();
