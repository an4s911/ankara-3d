// Captures screenshots of the overview and every landmark's hero view.
// Usage: npm run build && npx vite preview --port 4173 &  node scripts/screenshot.mjs [baseUrl] [views...]
import { createRequire } from 'node:module';
import fs from 'node:fs';

// Resolve Playwright from the project or from a globally installed copy (NODE_PATH).
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const base = process.argv[2] || 'http://localhost:4173/';
const views = process.argv.slice(3).length ? process.argv.slice(3) : ['overview', 'ulus', 'kale', 'genclik', 'anitkabir', 'kocatepe', 'atakule'];
const out = process.env.SHOT_DIR || 'screenshots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

for (const v of views) {
  const t0 = Date.now();
  const q = v.includes(',') ? `cam=${v}` : `view=${v}`;
  await page.goto(`${base}?${q}&noadapt&frames=${process.env.SHOT_FRAMES || 3}`);
  await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 300000 });
  await page.waitForFunction(() => window.__ankara?.stopped, null, { timeout: 600000 });
  await page.evaluate(() => { document.getElementById('loader').style.display = 'none'; });
  await page.screenshot({ path: `${out}/${v.includes(',') ? 'cam-' + v.split(',').slice(0, 3).join('_') : v}.png`, timeout: 120000 });
  const info = await page.evaluate(() => ({ calls: window.__ankara.renderer.info.render.calls, tris: window.__ankara.renderer.info.render.triangles, fps: window.__ankara.fps }));
  console.log(`${v}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(info));
}
console.log(errors.length ? errors.slice(0, 20).join('\n') : 'no console errors');
await browser.close();
