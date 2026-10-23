import { defineConfig } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const common = resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
const root = resolve(common, '..', '.agent-runs/MKW-AGENT-002');
mkdirSync(root, { recursive: true });
const run = process.env.MKW_E2E_RUN || mkdtempSync(join(root, 'playwright-'));
process.env.MKW_E2E_RUN = run;
export default defineConfig({
  testDir: './tests/browser', workers: 1, retries: 0,
  outputDir: join(run, 'artifacts'),
  reporter: [['list'], ['html', { outputFolder: join(run, 'report'), open: 'never' }]],
  use: { browserName: 'chromium', trace: 'on', screenshot: 'on', headless: true },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
});
