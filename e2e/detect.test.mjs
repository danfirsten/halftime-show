/* global performance */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchWithExtension, serveFixture, openFixture } from './helpers.mjs';
import { bundleForPage, DETECTOR_IN_PAGE } from './page-bundle.mjs';

// The detector runs in the stand-in player's page here; #5 runs it from the content script.
// Each break's start and end on the page's own clock, compared with when the detector said so.
const LIMIT_MS = 500;

async function runDetector(params, untilSeconds) {
  const detector = await bundleForPage(DETECTOR_IN_PAGE);
  const server = await serveFixture();
  const ext = await launchWithExtension();
  try {
    const page = await openFixture(ext.context, server.origin, params);
    await page.addScriptTag({ content: detector });
    await page.waitForFunction((s) => window.fixtureState?.elapsed > s, untilSeconds, { timeout: (untilSeconds + 10) * 1000 });
    return await page.evaluate(() => {
      // The fixture's clock starts at its script; convert the detector's times (performance.now) to the same clock.
      const t0 = performance.now() - window.fixtureState.elapsed * 1000;
      return window.__detected.map((e) => ({ ...e, at: e.at - t0 }));
    });
  } finally {
    await ext.close();
    await server.close();
  }
}

function assertOnTime(events, breaks) {
  const expected = breaks.flatMap(([start, length]) => [
    { type: 'break:start', at: start * 1000 },
    { type: 'break:end', at: (start + length) * 1000 },
  ]);
  assert.deepEqual(events.map((e) => e.type), expected.map((e) => e.type), JSON.stringify(events));
  events.forEach((e, i) => {
    const late = e.at - expected[i].at;
    assert.ok(late >= 0 && late <= LIMIT_MS, `${e.type} ${i}: ${Math.round(late)} ms after the page (limit ${LIMIT_MS})`);
  });
}

test('detects back-to-back breaks within 500 ms of their start and end, with the time left', async () => {
  const breaks = [[2, 4], [8, 3]];
  const events = await runDetector({ breaks: breaks.map((b) => b.join(':')).join(',') }, 12);
  assertOnTime(events, breaks);
  assert.ok(Math.abs(events[0].secondsLeft - 4) <= 1, `time left at the first start: ${events[0].secondsLeft}`);
  assert.equal(events[1].secondsLeft, null);
});

test('rides out flicker: no break from the false flash, no end while the markers blink', async () => {
  // The fixture's false flash is at 5 s; the break blinks its markers off for 400 ms every 3 s.
  const breaks = [[8, 7]];
  const events = await runDetector({ breaks: '8:7', flicker: true }, 16);
  assertOnTime(events, breaks);
});

test('a break of unknown length still starts and ends on time, with no time left', async () => {
  const breaks = [[2, 3]];
  const events = await runDetector({ breaks: '2:3', unknownLength: true }, 6);
  assertOnTime(events, breaks);
  assert.equal(events[0].secondsLeft, null);
});
