import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto('chrome://gpu');
await page.waitForTimeout(2500);
const txt = await page.evaluate(() => {
  const walk = (root) => { let out = ''; for (const n of root.querySelectorAll('*')) { if (n.shadowRoot) out += walk(n.shadowRoot); } out += root.textContent || ''; return out; };
  return walk(document);
});
const lines = txt.split('\n').map((l) => l.trim()).filter((l) => /GPU[0-9]|LUID|ACTIVE|VENDOR|DEVICE|Driver version/i.test(l));
console.log(lines.slice(0, 30).join('\n') || txt.slice(0, 2000));
await browser.close();
