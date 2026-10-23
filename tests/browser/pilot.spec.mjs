import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startPilot } from '../../pilot/server.mjs';

test('real UI saves, reloads, fails once and retries without duplication', async ({ page }, info) => {
  const run = await mkdtemp(join(process.env.MKW_E2E_RUN, 'sandbox-'));
  const app = await startPilot({ dbPath: join(run, 'notes.sqlite') });
  const owner = { pid: process.pid, url: app.url, run, project: info.project.name };
  await writeFile(join(run, 'owner.json'), JSON.stringify({ ...owner, state: 'running' }));
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  try {
    await page.goto(app.url);
    const input = page.getByRole('textbox', { name: 'Ghi chú thử', exact: true });
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS('outline-style', 'solid');
    await input.fill('Ghi chú kiểm thử <img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Đã lưu ghi chú.');
    await expect(page.locator('#notes li')).toHaveCount(1);
    await expect(page.locator('#notes img')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#notes li')).toHaveCount(1);
    await input.fill('Ghi chú thử lại');
    await page.getByRole('checkbox').check();
    const failedRequest = page.waitForResponse(response => response.url().endsWith('/api/notes') && response.status() === 503);
    await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
    await failedRequest;
    await expect(page.getByRole('alert')).toContainText('Lỗi thử nghiệm');
    await expect(input).toHaveValue('Ghi chú thử lại');
    const before = await (await page.request.get(`${app.url}/api/notes`)).json();
    expect(before.notes).toHaveLength(1);
    await page.getByRole('button', { name: 'Lưu ghi chú', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Đã lưu ghi chú.');
    await page.reload();
    await expect(page.locator('#notes li')).toHaveCount(2);
    expect((await (await page.request.get(`${app.url}/api/notes`)).json()).notes).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(failures).toEqual([]);
    await page.screenshot({ path: join(run, 'final.png'), fullPage: true });
  } finally {
    await app.close();
    await writeFile(join(run, 'owner.json'), JSON.stringify({ ...owner, state: 'released' }));
  }
});
