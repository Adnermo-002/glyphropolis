import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5199/#test', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__city.start());
await page.evaluate(() => { const c = window.__city; c.free(); c.teleport(108, 0, 130); c.look(2.6, 0); });
await page.waitForTimeout(4000);
console.log(JSON.stringify(await page.evaluate(() => window.__city.stats())));
console.log((await page.evaluate(() => window.__city.meshes())).length, 'meshes');
const cpu = await page.evaluate(async () => {
  const c = window.__city; const g = c._game;
  return null;
});
// CPU profile via tracing of main thread
const client = await page.context().newCDPSession(page);
await client.send('Profiler.enable'); await client.send('Profiler.start');
await page.keyboard.down('KeyW'); await page.waitForTimeout(4000); await page.keyboard.up('KeyW');
const { profile } = await client.send('Profiler.stop');
const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map(n => [n.id, n]));
for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); }
const tot = [...self.values()].reduce((a, b) => a + b, 0);
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => (100 * v / tot).toFixed(1) + '% ' + k).join('\n'));
await browser.close();
