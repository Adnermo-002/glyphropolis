// perf on the user's Windows PC (real GPU): node tools/_benchwin.mjs <tag> <quality> [lowgpu] [headed]
// needs vite on :5173. Prints per-pass GPU ms + frame time.
import { chromium } from 'playwright';
const [tag = 'w', quality = 'high', gpuMode = 'high', headed = ''] = process.argv.slice(2);
// gpuMode 'low' = the AMD 610M on the user's laptop (LUID from chrome://gpu, tools/_gpuinfo.mjs)
const args = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
if (gpuMode === 'low') args.push('--use-adapter-luid=0,79895');
const browser = await chromium.launch({ channel: 'chrome', headless: headed !== 'headed', args });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const url = 'http://localhost:5173/#test';
const t0 = Date.now();
await page.goto(url, { waitUntil: 'networkidle' });
for (let i = 0; i < 60; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.shaders && inf.pending === 0) break; await page.waitForTimeout(250); }
const tBoot = Date.now() - t0;
const tStart = await page.evaluate(async () => { const a = performance.now(); window.__city.start(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - a; });
await page.evaluate((q) => window.__city.quality(q), quality);
if (process.env.NOPREPASS) await page.evaluate(() => { window.__city.prepass(false); });
const settle = async () => { for (let i = 0; i < 80; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.pending === 0) break; await page.waitForTimeout(200); } await page.waitForTimeout(800); };
const views = {
  street: { t: 0.45, w: 0, cam: [72.5, 2.4, 170, 73, 10, 60] },
  cbd: { t: 0.45, w: 0, cam: [-60, 110, 190, 36, 20, 36] },
  night: { t: 0.92, w: 0, cam: [72.5, 2.4, 170, 73, 10, 60] },
  dusk: { t: 0.78, w: 1, cam: [-60, 40, 190, 36, 20, 36] },
};
console.log(JSON.stringify({ tag, quality, gpuMode, bootMs: tBoot, firstFrameMs: +tStart.toFixed(0), gpu: await page.evaluate(() => window.__city.gpu()) }));
for (const [n, v] of Object.entries(views)) {
  await page.evaluate((v) => { const k = window.__city; k.time(v.t); k.weather(v.w); k.cam(...v.cam); }, v);
  await settle();
  const rs = [];
  for (let i = 0; i < 5; i++) rs.push(await page.evaluate(() => window.__city.profile()));
  const med = {};
  for (const k of Object.keys(rs[0])) med[k] = rs.map((r) => r[k]).sort((a, b) => a - b)[2];
  // real frame interval over 1.5 s
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const a = performance.now(); const f = () => { n++; if (performance.now() - a > 1500) res(+(n / ((performance.now() - a) / 1000)).toFixed(1)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const info = await page.evaluate(() => window.__city.info());
  console.log(n, JSON.stringify({ ...med, total: +Object.values(med).reduce((a, b) => a + b, 0).toFixed(1), fps, grid: info.grid, dpr: info.dpr }));
  if (tag !== 'noshot') await page.screenshot({ path: `shots/win_${n}_${tag}.png` });
}
console.log('errors', errs.slice(0, 5));
await browser.close();
