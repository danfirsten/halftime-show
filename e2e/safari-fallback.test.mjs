// The mute fallback for browsers with no tab mute (Safari), proved in Chromium: the worker's tabs API is made to
// look like Safari's (no mutedInfo, and a tab mute that does nothing), so the page's video is muted instead.
/* global chrome, setInterval */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchWithExtension, serveFixture, openFixture, OVERLAY_SELECTOR } from './helpers.mjs';

// Runs in the service worker before any break.
function likeSafari() {
  const { get, update } = chrome.tabs;
  globalThis.__tabMutes = 0;
  chrome.tabs.get = async (id) => {
    const tab = await get.call(chrome.tabs, id);
    delete tab.mutedInfo;
    return tab;
  };
  chrome.tabs.update = async (id, props) => {
    if ('muted' in props) globalThis.__tabMutes += 1;
    const rest = { ...props };
    delete rest.muted;
    return update.call(chrome.tabs, id, rest);
  };
}

// In the page: the video's mute and volume, polled every 5 ms, with when the player changed state.
function watchVideo() {
  window.__video = [];
  let last = '';
  setInterval(() => {
    const video = document.getElementById('video');
    const state = document.getElementById('player')?.dataset.state ?? null;
    if (!video) return;
    const now = `${state}:${video.muted}:${video.volume}`;
    if (now !== last) window.__video.push({ state, muted: video.muted, volume: video.volume, at: Date.now() });
    last = now;
  }, 5);
}

async function withSafariLikeExtension(fn) {
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    await ext.worker.evaluate(likeSafari);
    await ext.context.addInitScript(watchVideo);
    await fn({ ...ext, origin: server.origin });
  } finally {
    await ext.close();
    await server.close();
  }
}

const tabMuted = (worker, page) =>
  worker.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.mutedInfo?.muted === true, page.url());
const videoMuted = (page) => page.evaluate(() => document.getElementById('video').muted);
const backNote = (page) => page.locator(`${OVERLAY_SELECTOR} .hs-back`).textContent({ timeout: 10000 });

// The fixture starts its video muted so it can autoplay: the viewer turns the sound up.
async function soundOn(page, volume = 0.4) {
  await page.evaluate((v) => {
    const video = document.getElementById('video');
    video.muted = false;
    video.volume = v;
  }, volume);
}

test('with no tab mute, a break mutes the video and its end gives the sound and volume back', async () => {
  await withSafariLikeExtension(async ({ context, worker, origin }) => {
    const page = await openFixture(context, origin, { breaks: '2:3' });
    await soundOn(page, 0.4);
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    assert.equal(await videoMuted(page), true);
    assert.equal(await tabMuted(worker, page), false);

    // The player turns its own sound back on mid break: it is muted again at once.
    await page.evaluate(() => {
      document.getElementById('video').muted = false;
    });
    await page.waitForFunction(() => document.getElementById('video').muted === true, null, { timeout: 1000 });

    assert.match(await backNote(page), /Back\. Sound on\./);
    assert.equal(await videoMuted(page), false);
    assert.equal(await page.evaluate(() => document.getElementById('video').volume), 0.4);
    assert.equal(await worker.evaluate(() => globalThis.__tabMutes), 0, 'never asked the browser for a tab mute');

    // Muted within 500 ms of the ad starting, and the sound back within 500 ms of the show.
    const log = await page.evaluate(() => window.__video);
    const adAt = log.find((v) => v.state === 'ad').at;
    const mutedAt = log.find((v) => v.state === 'ad' && v.muted).at;
    const backAt = log.findLast((v) => v.state === 'content' && v.muted).at;
    const soundAt = log.findLast((v) => v.state === 'content' && !v.muted).at;
    assert.ok(mutedAt - adAt <= 500, `muted ${mutedAt - adAt} ms after the ad began`);
    assert.ok(soundAt - backAt <= 500, `sound back ${soundAt - backAt} ms after the show came back`);
  });
});

test('with no tab mute, a player the viewer muted stays muted through and after the break', async () => {
  await withSafariLikeExtension(async ({ context, origin }) => {
    const page = await openFixture(context, origin, { breaks: '2:2' });
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    assert.equal(await videoMuted(page), true);
    assert.match(await backNote(page), /stays muted, as you had it\./);
    assert.equal(await videoMuted(page), true);
  });
});
