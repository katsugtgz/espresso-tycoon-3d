import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { BOTS } from './bots';
import type { RunMetrics, ScenarioConfig } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Command line argument parsing
const args = process.argv.slice(2);
function getArg(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${flag}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}
const isQuick = args.includes('--quick');
const noBuild = args.includes('--no-build');
const scenarioFilter = getArg('--scenario');
const seedsOverride = getArg('--seeds')?.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
const daysOverride = getArg('--days') ? Number(getArg('--days')) : null;
const port = Number(getArg('--port') ?? '4799');

const projectRoot = path.resolve(__dirname, '..');
const scenariosDir = path.join(__dirname, 'scenarios');
const reportsDir = path.join(__dirname, 'reports');

async function waitForHttp(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  console.log(`[Eval Runner] Starting Espresso Tycoon 3D Evaluation Suite...`);
  console.log(`[Eval Runner] Options: isQuick=${isQuick}, noBuild=${noBuild}, scenario=${scenarioFilter ?? 'ALL'}, port=${port}`);

  // 1. Build project
  if (!noBuild) {
    console.log(`[Eval Runner] Running 'npm run build'...`);
    const buildResult = spawnSync('npm', ['run', 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    if (buildResult.status !== 0) {
      console.error(`[Eval Runner] Build failed with exit code ${buildResult.status}.`);
      console.error(`If testing work-in-progress files without sibling modules, use --no-build.`);
      process.exit(1);
    }
  }

  // 2. Start Vite Preview server
  console.log(`[Eval Runner] Starting Vite preview server on port ${port}...`);
  const serverProcess: ChildProcess = spawn(
    'npx',
    ['vite', 'preview', '--port', String(port), '--strictPort'],
    {
      cwd: projectRoot,
      stdio: 'pipe',
      detached: false,
    }
  );

  const cleanupServer = () => {
    try {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  };
  process.on('exit', cleanupServer);
  process.on('SIGINT', cleanupServer);
  process.on('SIGTERM', cleanupServer);

  const baseUrl = `http://localhost:${port}`;
  const isServerReady = await waitForHttp(baseUrl);
  if (!isServerReady) {
    console.error(`[Eval Runner] Preview server failed to respond at ${baseUrl} within timeout.`);
    cleanupServer();
    process.exit(1);
  }
  console.log(`[Eval Runner] Preview server ready at ${baseUrl}`);

  // 3. Launch Playwright Chromium
  console.log(`[Eval Runner] Launching headless Chromium with SwiftShader...`);
  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  } catch (err) {
    console.error('[Eval Runner] Failed to launch Chromium:', err);
    cleanupServer();
    process.exit(1);
  }

  // 4. Load Scenarios
  const scenarioFiles = fs
    .readdirSync(scenariosDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  let scenarios: ScenarioConfig[] = scenarioFiles.map((file) => {
    const raw = fs.readFileSync(path.join(scenariosDir, file), 'utf-8');
    return JSON.parse(raw);
  });

  if (scenarioFilter) {
    scenarios = scenarios.filter((s) => s.name.toLowerCase().includes(scenarioFilter.toLowerCase()));
    if (scenarios.length === 0) {
      console.error(`[Eval Runner] No scenario matched filter '${scenarioFilter}'`);
      await browser.close();
      cleanupServer();
      process.exit(1);
    }
  }

  const timestampIso = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionScreenshotsDir = path.join(reportsDir, timestampIso);
  fs.mkdirSync(sessionScreenshotsDir, { recursive: true });

  const allMetrics: RunMetrics[] = [];
  let overallPass = true;

  // 5. Run Scenarios
  for (const scenario of scenarios) {
    const botFn = BOTS[scenario.bot];
    if (!botFn) {
      console.error(`[Eval Runner] Unknown bot '${scenario.bot}' in scenario '${scenario.name}'`);
      overallPass = false;
      continue;
    }

    const seeds = seedsOverride ?? (isQuick ? [scenario.seeds[0] ?? 1] : scenario.seeds);
    const targetDays = daysOverride ?? (isQuick ? Math.min(2, scenario.days) : scenario.days);

    for (const seed of seeds) {
      const runId = `${scenario.name}-seed${seed}`;
      console.log(`\n============================================================`);
      console.log(`Running: ${runId} (Days: ${targetDays}, Speed: ${scenario.speed}x)`);
      console.log(`============================================================`);

      const startTime = Date.now();
      const failureReasons: string[] = [];
      const runMetrics: Partial<RunMetrics> = {
        scenario: scenario.name,
        seed,
        failureReasons,
        moneyCurve: [],
        servedPerDay: [],
        lostPerDay: [],
      };

      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();

      const pageErrors: string[] = [];
      page.on('pageerror', (err) => {
        pageErrors.push(String(err.stack || err.message));
      });

      const finalScreenshotPath = path.join(sessionScreenshotsDir, `${runId}_final.png`);
      const failureScreenshotPath = path.join(sessionScreenshotsDir, `${runId}_failure.png`);

      try {
        const targetUrl = `${baseUrl}/?test=1&seed=${seed}`;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait for __gameReady
        await page.waitForFunction(() => (window as any).__gameReady === true, { timeout: 10000 });

        // Execute Bot
        await botFn({
          page,
          scenario,
          seed,
          targetDays,
          isQuick,
          log: (msg) => console.log(`  [${runId}] ${msg}`),
          recordFailure: (reason) => {
            console.error(`  [${runId} FAIL] ${reason}`);
            failureReasons.push(reason);
          },
          metrics: runMetrics,
        });

        // Collect Invariants & Errors
        const violations = await page.evaluate(() => (window as any).__game.invariants.violations());
        const errors = await page.evaluate(() => (window as any).__game.errors());
        const state = await page.evaluate(() => (window as any).__game.getState());

        runMetrics.violations = violations;
        runMetrics.violationsCount = violations.length;
        runMetrics.consoleErrors = (errors?.length ?? 0) + pageErrors.length;
        runMetrics.finalMoney = state.money;
        runMetrics.finalDay = state.day;
        runMetrics.fpsAvg = state.fps;
        runMetrics.fpsMin = state.minFps;
        runMetrics.timeToFirstSale = state.dayStats?.timeToFirstSale ?? null;

        if (state.history && Array.isArray(state.history)) {
          runMetrics.moneyCurve = [...state.history.map((h: any) => h.profit ?? 0), state.money];
          runMetrics.servedPerDay = [...state.history.map((h: any) => h.served ?? 0), state.dayStats?.served ?? 0];
          runMetrics.lostPerDay = [...state.history.map((h: any) => h.lost ?? 0), state.dayStats?.lost ?? 0];
        } else {
          runMetrics.moneyCurve = [state.money];
          runMetrics.servedPerDay = [state.dayStats?.served ?? 0];
          runMetrics.lostPerDay = [state.dayStats?.lost ?? 0];
        }

        // Check Checks & Thresholds
        const maxViolations = scenario.thresholds?.maxViolations ?? 0;
        if (violations.length > maxViolations) {
          failureReasons.push(
            `Invariants violated (${violations.length} violations > threshold ${maxViolations}): ${violations[0]?.rule} - ${violations[0]?.message}`
          );
        }

        const maxErrors = scenario.thresholds?.maxErrors ?? 0;
        if (runMetrics.consoleErrors > maxErrors) {
          const firstErr = errors[0]?.message || pageErrors[0];
          failureReasons.push(`Console/runtime errors detected (${runMetrics.consoleErrors}): ${firstErr}`);
        }

        // Impossible win check (money > 20000 by day 7)
        if (state.money > 20000 && state.day <= 7) {
          runMetrics.impossibleWin = true;
          if (scenario.checks.includes('impossible_win')) {
            failureReasons.push(`Impossible-win flag triggered: money $${state.money.toFixed(2)} reached by day ${state.day} (> $20000)`);
          }
        } else {
          runMetrics.impossibleWin = false;
        }

        // Impossible lose check (greedy bot bankrupt)
        if (scenario.bot === 'greedy' && (state.phase === 'game_over' || (state.bankruptStrikes ?? 0) >= 2)) {
          runMetrics.impossibleLose = true;
          if (scenario.checks.includes('not_bankrupt')) {
            failureReasons.push('Impossible-lose flag: greedy optimal bot went bankrupt');
          }
        } else {
          runMetrics.impossibleLose = false;
        }

        // Capture final screenshot
        await page.screenshot({ path: finalScreenshotPath, fullPage: true });
        runMetrics.screenshotPath = finalScreenshotPath;
      } catch (err: any) {
        console.error(`  [${runId} ERROR] Uncaught error:`, err);
        failureReasons.push(`Test execution threw error: ${err?.message || err}`);
        try {
          await page.screenshot({ path: failureScreenshotPath, fullPage: true });
          runMetrics.screenshotPath = failureScreenshotPath;
        } catch {
          // ignore
        }
      } finally {
        await context.close();
      }

      const durationSec = (Date.now() - startTime) / 1000;
      const pass = failureReasons.length === 0;
      if (!pass) overallPass = false;

      const completedMetrics: RunMetrics = {
        scenario: scenario.name,
        seed,
        pass,
        failureReasons,
        timeToFirstSale: runMetrics.timeToFirstSale ?? null,
        idlePercent: runMetrics.idlePercent ?? 0,
        moneyCurve: runMetrics.moneyCurve ?? [],
        servedPerDay: runMetrics.servedPerDay ?? [],
        lostPerDay: runMetrics.lostPerDay ?? [],
        finalMoney: runMetrics.finalMoney ?? 0,
        finalDay: runMetrics.finalDay ?? 1,
        impossibleWin: runMetrics.impossibleWin ?? false,
        impossibleLose: runMetrics.impossibleLose ?? false,
        consoleErrors: runMetrics.consoleErrors ?? 0,
        violationsCount: runMetrics.violationsCount ?? 0,
        violations: runMetrics.violations ?? [],
        fpsAvg: runMetrics.fpsAvg ?? 60,
        fpsMin: runMetrics.fpsMin ?? 60,
        durationSec,
        screenshotPath: runMetrics.screenshotPath,
      };

      allMetrics.push(completedMetrics);
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'} in ${durationSec.toFixed(1)}s (Violations: ${completedMetrics.violationsCount}, Errors: ${completedMetrics.consoleErrors})`);
    }
  }

  // 6. Generate Reports
  console.log(`\n[Eval Runner] Writing evaluation reports...`);
  const reportJsonPath = path.join(reportsDir, `${timestampIso}.json`);
  const reportMdPath = path.join(reportsDir, `${timestampIso}.md`);

  fs.writeFileSync(reportJsonPath, JSON.stringify(allMetrics, null, 2), 'utf-8');

  let md = `# Espresso Tycoon 3D — Evaluation Report\n\n`;
  md += `- **Date**: ${new Date().toISOString()}\n`;
  md += `- **Mode**: ${isQuick ? 'Quick' : 'Full'}\n`;
  md += `- **Total Runs**: ${allMetrics.length}\n`;
  md += `- **Overall Status**: ${overallPass ? '✅ PASS' : '❌ FAIL'}\n\n`;

  md += `## Summary Table\n\n`;
  md += `| Scenario | Seed | Status | Duration | Day | Final $ | Idle % | Violations | Errors | Notes |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;

  for (const m of allMetrics) {
    const statusEmoji = m.pass ? '✅ PASS' : '❌ FAIL';
    const notes = m.failureReasons.length > 0 ? m.failureReasons[0].replace(/\|/g, '/') : 'OK';
    md += `| ${m.scenario} | ${m.seed} | ${statusEmoji} | ${m.durationSec.toFixed(1)}s | ${m.finalDay} | $${m.finalMoney.toFixed(2)} | ${m.idlePercent.toFixed(1)}% | ${m.violationsCount} | ${m.consoleErrors} | ${notes} |\n`;
  }

  md += `\n## Playability & Economy Metrics\n\n`;
  md += `| Scenario | Seed | Time to 1st Sale | Served/Day | Lost/Day | FPS Avg | FPS Min | Impossible Win | Impossible Lose |\n`;
  md += `|---|---|---|---|---|---|---|---|---|\n`;

  for (const m of allMetrics) {
    const tFirst = m.timeToFirstSale !== null ? `${m.timeToFirstSale.toFixed(1)}s` : 'N/A';
    const served = m.servedPerDay && m.servedPerDay.length > 0 ? m.servedPerDay.join(', ') : '-';
    const lost = m.lostPerDay && m.lostPerDay.length > 0 ? m.lostPerDay.join(', ') : '-';
    const fpsAvg = typeof m.fpsAvg === 'number' ? m.fpsAvg.toFixed(1) : 'N/A';
    const fpsMin = typeof m.fpsMin === 'number' ? m.fpsMin.toFixed(1) : 'N/A';
    const impWin = m.impossibleWin ? '⚠️ YES' : 'No';
    const impLose = m.impossibleLose ? '⚠️ YES' : 'No';
    md += `| ${m.scenario} | ${m.seed} | ${tFirst} | ${served} | ${lost} | ${fpsAvg} | ${fpsMin} | ${impWin} | ${impLose} |\n`;
  }

  const failedRuns = allMetrics.filter((m) => !m.pass);
  if (failedRuns.length > 0) {
    md += `\n## Failures & Violations Details\n\n`;
    for (const m of failedRuns) {
      md += `### ❌ ${m.scenario} (Seed: ${m.seed})\n\n`;
      md += `- **Repro Command**: \`npm run eval -- --scenario ${m.scenario} --seeds ${m.seed} --no-build\`\n`;
      md += `- **Failure Reasons**:\n`;
      for (const r of m.failureReasons) {
        md += `  - ${r}\n`;
      }
      if (m.violations.length > 0) {
        md += `- **Violations Sample**:\n`;
        md += `\`\`\`json\n${JSON.stringify(m.violations.slice(0, 5), null, 2)}\n\`\`\`\n`;
      }
      if (m.screenshotPath) {
        md += `- **Screenshot**: \`${m.screenshotPath}\`\n`;
      }
      md += `\n`;
    }
  }

  fs.writeFileSync(reportMdPath, md, 'utf-8');

  console.log(`\n============================================================`);
  console.log(`EVALUATION COMPLETED: ${overallPass ? 'ALL PASSED' : 'SOME FAILED'}`);
  console.log(`JSON Report: ${reportJsonPath}`);
  console.log(`Markdown Report: ${reportMdPath}`);
  console.log(`============================================================\n`);

  await browser.close();
  cleanupServer();

  if (!overallPass) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[Eval Runner] Fatal error:', e);
  process.exit(1);
});
