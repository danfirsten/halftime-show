// The settings on the stand-in player, with the built extension loaded: the popup's switch reaches the open tab at
// once (a break on ends, the next one is left alone, switching back on works), the options page and popup agree,
// and the default show reaches the tab's next menu.
/* global chrome, setTimeout */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchWithExtension, serveFixture, openFixture } from './helpers.mjs';

async function withExtension(fn) {
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    await fn({ ...ext, origin: server.origin, id: new URL(ext.worker.url()).host });
  } finally {
    await ext.close();
    await server.close();
  }
}

const tabIdOf = (worker, page) => worker.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id, page.url());
const mutedOf = (worker, tabId) => worker.evaluate(async (id) => (await chrome.tabs.get(id)).mutedInfo?.muted === true, tabId);

async function waitMuted(worker, tabId, muted) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if ((await mutedOf(worker, tabId)) === muted) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail(`tab never became ${muted ? 'muted' : 'unmuted'}`);
}

test('switching hulu.com off in the popup ends a break at once and leaves the next one alone', async () => {
  await withExtension(async ({ context, worker, origin, id }) => {
    const page = await openFixture(context, origin, { breaks: '1:20,40:20' });
    const tabId = await tabIdOf(worker, page);
    await waitMuted(worker, tabId, true);
    await page.locator('.hs.is-open').waitFor({ timeout: 5000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    const status = popup.locator('.status');
    await status.getByText('In a break').waitFor();
    await popup.locator('.sw').click();
    await status.getByText('Off on hulu.com').waitFor();
    await waitMuted(worker, tabId, false);
    await page.locator('.hs.is-closing, .hs:not(.is-open)').first().waitFor({ state: 'attached', timeout: 5000 });
    assert.equal(await page.locator('.hs.is-open').count(), 0);
    assert.equal(await popup.locator('.pp-mark').count(), 0);

    // The shortcut does nothing while the site is off.
    await worker.evaluate((t) => chrome.tabs.sendMessage(t, { type: 'command:override' }), tabId);
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(await mutedOf(worker, tabId), false);

    // Back on: the popup says so, and "This is an ad" works again.
    await popup.locator('.sw').click();
    await status.getByText('Watching for ad breaks').waitFor();
    await popup.locator('.pp-mark').click();
    await waitMuted(worker, tabId, true);
  });
});

test('a break that starts while the site is off is left alone', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    await worker.evaluate(() => chrome.storage.local.set({ settings: { enabled: { hulu: false } } }));
    const page = await openFixture(context, origin, { breaks: '1:6' });
    const tabId = await tabIdOf(worker, page);
    await page.waitForFunction(() => window.fixtureState?.elapsed > 4, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.fixtureState.inBreak), true);
    assert.equal(await mutedOf(worker, tabId), false);
    assert.equal(await page.locator('#halftime-show-overlay').count(), 0);
  });
});

test('the options page and the popup share one default show, and the next menu counts down to it', async () => {
  await withExtension(async ({ context, worker, origin, id }) => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await options.getByRole('radio', { name: 'Hoop\'s catch' }).click();
    const page = await openFixture(context, origin, { breaks: '1:20' });
    const tabId = await tabIdOf(worker, page);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    assert.equal(await popup.locator('.pp-show [data-show="catch"]').getAttribute('aria-checked'), 'true');
    await waitMuted(worker, tabId, true);
    await page.locator('.hs.is-open').waitFor({ timeout: 5000 });
    // The menu's countdown sits on the default show's row.
    await page.locator('.hs-menu [data-show="catch"] .m-c').waitFor({ timeout: 5000 });
  });
});
