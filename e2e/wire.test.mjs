// The core loop on the stand-in player, with the built extension loaded: a break mutes the tab and opens the
// overlay, its end unmutes and closes it, a viewer-muted tab stays muted, the override and the popup button work,
// flicker never toggles anything, and leaving the page mid-break gives the sound back.
/* global chrome, setInterval, setTimeout */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchWithExtension, serveFixture, openFixture, OVERLAY_SELECTOR } from './helpers.mjs';

const LIMIT_MS = 500;

// In the page: when the player's state changes (content or ad) and when the overlay opens and closes, polled every 5 ms.
function watchPage() {
  window.__wire = { player: [], overlay: [] };
  let player = null;
  let overlay = 'none';
  setInterval(() => {
    const state = document.getElementById('player')?.dataset.state ?? null;
    if (state !== player) window.__wire.player.push({ state: (player = state), at: Date.now() });
    const root = document.getElementById('halftime-show-overlay')?.shadowRoot;
    const now = root?.querySelector('.hs.is-open') ? 'open' : root?.querySelector('.hs.is-closing') ? 'closing' : 'none';
    if (now !== overlay) window.__wire.overlay.push({ state: (overlay = now), at: Date.now() });
  }, 5);
}

async function withExtension(fn) {
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    await ext.context.addInitScript(watchPage);
    await ext.worker.evaluate(() => {
      globalThis.__mutes = [];
      chrome.tabs.onUpdated.addListener((tabId, change) => {
        if (change.mutedInfo) globalThis.__mutes.push({ tabId, muted: change.mutedInfo.muted, at: Date.now() });
      });
    });
    await fn({ ...ext, origin: server.origin });
  } finally {
    await ext.close();
    await server.close();
  }
}

const tabIdOf = (worker, page) => worker.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id, page.url());
const mutedOf = (worker, tabId) => worker.evaluate(async (id) => (await chrome.tabs.get(id)).mutedInfo?.muted === true, tabId);
const mutes = (worker, tabId) => worker.evaluate((id) => globalThis.__mutes.filter((m) => m.tabId === id), tabId);
const pageLog = (page) => page.evaluate(() => window.__wire);
const scoreboard = (worker) => worker.evaluate(async () => (await chrome.storage.local.get('scoreboard')).scoreboard ?? {});
const backNote = (page) => page.locator(`${OVERLAY_SELECTOR} .hs-back`).textContent({ timeout: 10000 });

async function waitMuted(worker, tabId, muted) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if ((await mutedOf(worker, tabId)) === muted) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail(`tab never became ${muted ? 'muted' : 'unmuted'}`);
}

test('a break mutes within 500 ms and then opens the overlay; its end unmutes within 500 ms and then closes it', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    const page = await openFixture(context, origin, { breaks: '2:4' });
    const tabId = await tabIdOf(worker, page);
    assert.equal(await mutedOf(worker, tabId), false);
    await page.waitForFunction(() => window.fixtureState?.elapsed > 7.5, null, { timeout: 15000 });
    await page.waitForFunction(() => window.__wire.overlay.at(-1)?.state === 'none', null, { timeout: 5000 });

    const { player, overlay } = await pageLog(page);
    const adAt = player.find((p) => p.state === 'ad').at;
    const backAt = player.findLast((p) => p.state === 'content').at;
    const log = await mutes(worker, tabId);
    assert.deepEqual(log.map((m) => m.muted), [true, false], JSON.stringify(log));
    const [mute, unmute] = log;
    assert.ok(mute.at - adAt >= 0 && mute.at - adAt <= LIMIT_MS, `muted ${mute.at - adAt} ms after the ad began`);
    assert.ok(unmute.at - backAt >= 0 && unmute.at - backAt <= LIMIT_MS, `unmuted ${unmute.at - backAt} ms after the show came back`);

    assert.deepEqual(overlay.map((o) => o.state), ['open', 'closing', 'none'], JSON.stringify(overlay));
    const openAt = overlay[0].at;
    const closeAt = overlay[1].at;
    // Sound first, then the picture, both ways (the page polls every 5 ms).
    assert.ok(openAt >= mute.at - 5 && openAt - adAt <= LIMIT_MS, `opened ${openAt - mute.at} ms after the mute`);
    assert.ok(closeAt >= unmute.at - 5 && closeAt - backAt <= LIMIT_MS, `closed ${closeAt - unmute.at} ms after the unmute`);

    assert.match(await backNote(page), /Back\. Sound on\./);
    const board = await scoreboard(worker);
    const today = Object.values(board)[0];
    assert.ok(today >= 3 && today <= 5, `about 4 s dodged, got ${JSON.stringify(board)}`);
  });
});

test("the overlay's corner shows ad time dodged today and this week", async () => {
  await withExtension(async ({ context, worker, origin }) => {
    const [today, yesterday] = await worker.evaluate(() => {
      const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const now = new Date();
      return [key(now), key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))];
    });
    await worker.evaluate((board) => chrome.storage.local.set({ scoreboard: board }), { [today]: 870, [yesterday]: 600 });
    const page = await openFixture(context, origin, { breaks: '1:30' });
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    const corner = page.locator(`${OVERLAY_SELECTOR} .hs-score`);
    await corner.getByText('Dodged today 14:30').waitFor({ timeout: 5000 });
    await corner.getByText('This week 24:30').waitFor({ timeout: 5000 });
  });
});

test('a tab the viewer muted stays muted through and after the break', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    const page = await openFixture(context, origin, { breaks: '2:2' });
    const tabId = await tabIdOf(worker, page);
    await worker.evaluate((id) => chrome.tabs.update(id, { muted: true }), tabId);
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    assert.match(await backNote(page), /The tab stays muted, as you had it\./);
    assert.equal(await mutedOf(worker, tabId), true);
    assert.deepEqual((await mutes(worker, tabId)).map((m) => m.muted), [true]);
  });
});

test('flicker never toggles: no mute for the false flash, one mute and one unmute for a blinking break', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    // The false flash is at 5 s; the break blinks its markers off for 400 ms every 3 s.
    const page = await openFixture(context, origin, { breaks: '8:7', flicker: true });
    const tabId = await tabIdOf(worker, page);
    await page.waitForFunction(() => window.fixtureState?.elapsed > 16, null, { timeout: 25000 });
    const log = await mutes(worker, tabId);
    assert.deepEqual(log.map((m) => m.muted), [true, false], JSON.stringify(log));
    const { overlay } = await pageLog(page);
    assert.deepEqual(overlay.map((o) => o.state).slice(0, 2), ['open', 'closing'], JSON.stringify(overlay));
  });
});

test('the override: "this is an ad" mutes and covers, "this isn\'t" gives it back and holds until the next change', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    const page = await openFixture(context, origin, { breaks: '4:3' });
    const tabId = await tabIdOf(worker, page);
    const override = () => worker.evaluate((id) => chrome.tabs.sendMessage(id, { type: 'command:override' }), tabId);

    // No break on: the viewer says it is an ad.
    assert.deepEqual(await override(), { inBreak: true });
    await waitMuted(worker, tabId, true);
    await page.locator('.hs.is-open').waitFor({ timeout: 5000 });
    // And then that it isn't.
    assert.deepEqual(await override(), { inBreak: false });
    await waitMuted(worker, tabId, false);
    assert.match(await backNote(page), /Marked as not an ad\. Sound on\./);

    // A real break at 4 s: "this isn't an ad" during it, and detection doesn't fight it before the break ends.
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    await waitMuted(worker, tabId, true);
    assert.deepEqual(await override(), { inBreak: false });
    await waitMuted(worker, tabId, false);
    await page.waitForFunction(() => window.fixtureState?.elapsed > 7.6, null, { timeout: 10000 });
    assert.equal(await mutedOf(worker, tabId), false);
    const states = (await pageLog(page)).overlay.map((o) => o.state);
    assert.equal(states.filter((s) => s === 'open').length, 2, JSON.stringify(states));
    // Nothing counted for a break the viewer said wasn't an ad.
    assert.deepEqual(await scoreboard(worker), {});
  });
});

test('the popup shows the scoreboard and its button marks the break', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    const page = await openFixture(context, origin, {});
    const tabId = await tabIdOf(worker, page);
    const today = await worker.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await worker.evaluate((key) => chrome.storage.local.set({ scoreboard: { [key]: 870 } }), today);
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    await popup.locator('.pp-score').getByText('14:30').first().waitFor();
    const button = popup.locator('.pp-mark');
    await button.getByText('This is an ad').waitFor();
    await button.click();
    await waitMuted(worker, tabId, true);
    await page.locator('.hs.is-open').waitFor({ timeout: 5000 });
    await button.getByText("This isn't an ad").waitFor();
    await button.click();
    await waitMuted(worker, tabId, false);
    await button.getByText('This is an ad').waitFor();
  });
});

test('leaving the page mid-break gives the tab its sound back', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    const page = await openFixture(context, origin, { breaks: '1:60' });
    const tabId = await tabIdOf(worker, page);
    await waitMuted(worker, tabId, true);
    await page.goto(`${origin}/fixture/nowhere.html`).catch(() => undefined);
    await waitMuted(worker, tabId, false);

    // And a reload mid-break: the old page's port closes, the new page starts clean.
    await page.goto(`${origin}/fixture/player.html?breaks=1:60`);
    await waitMuted(worker, tabId, true);
    await page.reload();
    await waitMuted(worker, tabId, false);
  });
});

test('the options page saves a detection snapshot from the player tab', async () => {
  await withExtension(async ({ context, worker, origin }) => {
    await openFixture(context, origin, { breaks: '0:30' });
    const id = new URL(worker.url()).host;
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html#capture`);
    const download = options.waitForEvent('download');
    await options.getByRole('button', { name: 'Save a detection snapshot' }).click();
    const file = await download;
    assert.match(file.suggestedFilename(), /^halftime-snapshot-.*\.html$/);
    const stream = await file.createReadStream();
    let html = '';
    for await (const chunk of stream) html += chunk;
    assert.match(html, /data-fixture="video"/);
    assert.match(html, /Halftime Show detection snapshot: site hulu/);
    assert.doesNotMatch(html, /<script/i);
  });
});
