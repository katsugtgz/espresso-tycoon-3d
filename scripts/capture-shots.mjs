// Capture showcase shots + gif for README. Serves dist/ via vite preview.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const PORT = 4173;
const URL = `http://localhost:${PORT}/espresso-tycoon-3d/?test=1&seed=42`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: { ...process.env, BASE_PATH: '/espresso-tycoon-3d/' },
});
// wait until server actually serves the real asset
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const html = await (await fetch(`http://localhost:${PORT}/espresso-tycoon-3d/`)).text();
    if (html.includes('webgl-canvas') && (await fetch(`${URL}&probe=1`)).ok) break;
  } catch {}
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__gameReady === true', null, { timeout: 30000 });

  // 1) main menu
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/01-menu.png` });

  // start day
  await page.evaluate(() => window.__game.actions.startGame({ seed: 42, tutorial: false }));
  await page.waitForTimeout(1500);

  // 2) brewing: let a customer order, then brew
  await page.evaluate(() => window.__game.actions.advanceTime(25));
  await page.evaluate(() => window.__game.actions.brew('espresso'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/02-brew.png` });

  // let morning rush build; keep serving + brewing during real-time frames
  const gifFrames = [];
  const N = 48;
  for (let i = 0; i < N; i++) {
    await page.evaluate(() => {
      const g = window.__game;
      const r = g.actions.serve();
      if (!r || r.ok === false) g.actions.brew('espresso');
    });
    // gentle camera drift for orbit feel
    if (i % 4 === 0) await page.keyboard.press('e');
    const buf = await page.screenshot({ type: 'png' });
    gifFrames.push(buf);
    await page.waitForTimeout(180);
  }

  // 3) mid-day rush with queue + combo (stay inside 08:00-20:00!)
  await page.evaluate(() => window.__game.actions.advanceTime(45));
  await page.waitForTimeout(800);
  // dismiss any popup/overlay via its DOM button (NOT Escape: it opens pause menu)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /continue|next day|start day|close|ok/i.test(x.textContent || ''));
    if (b) b.click();
    const g = window.__game;
    g.actions.pause(false);
    g.actions.serve();
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-rush.png` });

  // 4) shop panel
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('b');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/04-shop.png` });
  await page.keyboard.press('Escape');

  // write gif frames
  const { writeFileSync } = await import('node:fs');
  gifFrames.forEach((b, i) => writeFileSync(`${OUT}/.gif-${String(i).padStart(3, '0')}.png`, b));
  console.log('frames:', gifFrames.length);
} finally {
  await browser.close();
  server.kill();
}
