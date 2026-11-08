import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4173;
const URL = `http://localhost:${PORT}/espresso-tycoon-3d/?test=1&seed=42`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort']);
server.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[srv-err] ' + d));

// poll until server responds
let up = false;
for (let i = 0; i < 30 && !up; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch(`http://localhost:${PORT}/espresso-tycoon-3d/`);
    up = res.ok;
  } catch {}
}
console.log('server up:', up);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__gameReady === true', null, { timeout: 20000 });
  const st = await page.evaluate(() => ({
    ready: window.__gameReady,
    game: !!window.__game,
  }));
  console.log('state:', JSON.stringify(st));
} finally {
  await browser.close();
  server.kill();
}
