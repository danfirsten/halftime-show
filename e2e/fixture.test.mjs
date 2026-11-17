import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchWithExtension, serveFixture, openFixture, readState } from './helpers.mjs';

async function untilFixture(page, predicate, arg) {
  await page.waitForFunction(predicate, arg, { timeout: 10000 });
}

test('the stand-in player runs a timeline and the content script is on it', async () => {
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    const page = await openFixture(ext.context, server.origin, { breaks: '1:2' });
    await page.locator('[data-fixture="video"]').waitFor();
    let state = await readState(ext.worker, page);
    assert.equal(state.watched, true, 'the content script runs on the fixture');
    assert.equal(state.fixture.inBreak, false);
    assert.equal(state.muted, false);

    await untilFixture(page, () => window.fixtureState.inBreak);
    assert.equal(await page.locator('[data-fixture="ad-label"]').innerText(), 'Ad');
    assert.match(await page.locator('[data-fixture="ad-countdown"]').innerText(), /^\d:\d\d$/);
    assert.match(await page.locator('[data-fixture="video"]').getAttribute('src'), /ad\.webm$/);
    assert.equal(await page.locator('#player').getAttribute('data-state'), 'ad');

    await untilFixture(page, () => !window.fixtureState.inBreak);
    assert.match(await page.locator('[data-fixture="video"]').getAttribute('src'), /content\.webm$/);
    assert.equal(await page.locator('[data-fixture="ad-ui"]').isHidden(), true);
  } finally {
    await ext.close();
    await server.close();
  }
});

test('unknownLength hides the countdown and flicker blinks the markers', async () => {
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    const page = await openFixture(ext.context, server.origin, { breaks: '0:8', unknownLength: true, flicker: true });
    await untilFixture(page, () => window.fixtureState.inBreak);
    assert.equal(await page.locator('[data-fixture="ad-countdown"]').isHidden(), true);
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      seen.add((await readState(ext.worker, page)).fixture.markersVisible);
      await page.waitForTimeout(100);
    }
    assert.deepEqual([...seen].sort(), [false, true], 'markers were seen both on and off');
  } finally {
    await ext.close();
    await server.close();
  }
});

test('fullscreen=1 puts the player in full screen on the first gesture', async () => {
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    const page = await openFixture(ext.context, server.origin, { fullscreen: true });
    await page.locator('#player').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'player', null, { timeout: 5000 });
  } finally {
    await ext.close();
    await server.close();
  }
});
