import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { chromium } from 'playwright';

const ext = path.resolve('.output/chrome-mv3');

test('the built extension loads and its popup renders', async () => {
  assert.ok(fs.existsSync(path.join(ext, 'manifest.json')), 'run npm run build first');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-'));
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.getByText('halftime show', { exact: true }).waitFor();
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.reload();
    await page.getByText('halftime show', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
    assert.ok(loaded.some((f) => f.includes('Geist')), `Geist loads from the extension, got ${loaded}`);
    assert.ok(requests.every((u) => u.startsWith('chrome-extension://')), `only extension requests: ${requests}`);
    await page.goto(`chrome-extension://${id}/options.html`);
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
