// where does the first-frame freeze come from? profile() before the first real frame = compile time per pass
import { chromium } from 'playwright';
const [gpuMode = 'high', quality = 'high', port = '5173'] = process.argv.slice(2);
// gpuMode 'low' = the AMD 610M on the user's laptop (LUID from chrome://gpu, tools/_gpuinfo.mjs)
const args = ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
if (gpuMode === 'low') args.push('--use-adapter-luid=0,79895');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const t0 = Date.now();
await page.goto('http://localhost:' + port + '/' + (gpuMode === 'low' ? '?lowgpu' : '') + '#test', { waitUntil: 'networkidle' });
const tLoad = Date.now() - t0;
let tShaders = 0;
for (let i = 0; i < 120; i++) { const inf = await page.evaluate(() => window.__city.info()); if (inf.shaders) { tShaders = Date.now() - t0; break; } await page.waitForTimeout(100); }
const r = await page.evaluate((q) => { const c = window.__city; c.quality(q); const a = performance.now(); c.start(); const p1 = c.profile(); const t1 = performance.now() - a; const p2 = c.profile(); const inf = c.info(); return { firstUse: p1, second: p2, firstTotal: +t1.toFixed(0), compileMs: inf.compileMs, warmupMs: inf.warmupMs, err: inf.err, gpu: c.gpu() }; }, quality);
console.log(JSON.stringify({ gpuMode, quality, tLoad, tShaders, ...r }));
await browser.close();
