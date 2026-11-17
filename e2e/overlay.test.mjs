// The overlay on the stand-in player, through the dev-only stage page (entrypoints/overlay-stage/): in a window,
// in full screen, small, with reduced motion, and against a page whose CSS tries to reach it.
/* global getComputedStyle, innerWidth */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('.output/chrome-mv3');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://localhost:${server.address().port}`, close: () => new Promise((d) => server.close(d)) })));
}

async function withStage(query, fn, { viewport = { width: 1440, height: 900 }, reducedMotion = 'no-preference' } = {}) {
  assert.ok(fs.existsSync(path.join(root, 'overlay-stage.html')), 'run npm run build first');
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, reducedMotion });
    const errors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(`${server.origin}/overlay-stage.html?${query}`);
    await fn(page, { errors, requests, origin: server.origin });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
}

const open = (page) => page.locator('.hs.is-open').waitFor({ timeout: 10000 });
const boxes = (page) =>
  page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
    const host = document.getElementById('halftime-show-overlay');
    return { host: r(host), video: r(document.querySelector('[data-fixture="video"]')), parent: host.parentElement.id, full: document.fullscreenElement?.id ?? null };
  });

test('in a window: opens over the video, covers it exactly, and the page CSS cannot reach it', async () => {
  await withStage('breaks=0:40', async (page, { requests, origin }) => {
    // A hostile page: every element told to be red, serif and hidden, the host told to move away.
    await page.addStyleTag({ content: '* { color: red !important; font-family: serif !important; } halftime-show-root { display: none !important; left: 900px !important; opacity: 0 !important; }' });
    await open(page);
    const b = await boxes(page);
    assert.equal(b.parent, 'player');
    assert.deepEqual(b.host, b.video);
    const look = await page.locator('.m-head').evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, font: s.fontFamily, hostDisplay: getComputedStyle(el.getRootNode().host).display };
    });
    assert.equal(look.color, 'rgb(242, 242, 238)', 'the overlay is ink and paper, not the page colour');
    assert.match(look.font, /^"?Geist Variable/);
    assert.equal(look.hostDisplay, 'block');
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
    assert.ok(fonts.includes('Geist Variable') && fonts.includes('Geist Mono Variable'), `fonts: ${fonts}`);
    // Its own markup and styles live only inside the shadow root.
    assert.equal(await page.evaluate(() => document.querySelectorAll('[class^="hs"]').length), 0);
    assert.ok(requests.every((u) => u.startsWith(origin)), `only the stand-in's own files: ${requests}`);
    // The scoreboard and the edge clock.
    assert.match(await page.locator('.hs-t').innerText(), /^0:\d\d$/);
    assert.equal(await page.locator('.hs-edge').getAttribute('role'), 'progressbar');
    const before = Number(await page.locator('.e-run').evaluate((el) => el.style.strokeDashoffset));
    await page.waitForTimeout(2200);
    const after = Number(await page.locator('.e-run').evaluate((el) => el.style.strokeDashoffset));
    assert.ok(after < before, `the edge drains: ${before} then ${after}`);
  });
});

test('in full screen: the host moves into the full-screen element and covers the whole screen', async () => {
  await withStage('breaks=1:30', async (page) => {
    await page.locator('#btn-full').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'player');
    await open(page);
    let b = await boxes(page);
    assert.equal(b.full, 'player');
    assert.equal(b.parent, b.full, 'the host is inside the full-screen element');
    assert.deepEqual(b.host, b.video);
    assert.deepEqual(b.host.slice(2), [1440, 900]);
    // Leaving full screen (Esc is never taken by the overlay) shrinks it back to the video.
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.waitForTimeout(100);
    b = await boxes(page);
    assert.deepEqual(b.host, b.video);
    assert.ok(b.host[2] < 1440);
  });
});

test('going full screen mid-break keeps focus on the cover', async () => {
  await withStage('breaks=1:30', async (page) => {
    await open(page);
    await page.locator('#btn-full').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'player');
    await page.waitForFunction(() => document.getElementById('halftime-show-overlay')?.shadowRoot?.activeElement?.classList.contains('hs'), null, { timeout: 2000 });
  });
});

test('keys: stopped from reaching the player while open, Esc always passes, focus comes back on close', async () => {
  await withStage('breaks=2:4', async (page) => {
    await page.locator('#btn-start').waitFor();
    await page.evaluate(() => {
      window.seen = [];
      document.addEventListener('keydown', (e) => window.seen.push(e.key));
      document.getElementById('btn-start').focus();
    });
    await open(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'halftime-show-overlay');
    for (const k of ['k', ' ', 'ArrowRight', 'f', 'm']) await page.keyboard.press(k);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => window.seen), ['Escape']);
    // 1 to 4 pick a show.
    await page.keyboard.press('3');
    await page.locator('[data-pane="catch"]').waitFor();
    assert.deepEqual(await page.evaluate(() => window.halftimeStage.picks), ['catch']);
    // The break ends: the clip closes, the back note shows, and the page has its keys and focus back.
    await page.locator('.hs-back.on').waitFor({ timeout: 8000 });
    assert.equal(await page.locator('.hs').count(), 0);
    assert.match(await page.locator('.hs-back').innerText(), /Back\. Sound on\.\s+0:0\d of ads dodged\./);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-start');
    await page.keyboard.press('k');
    assert.deepEqual(await page.evaluate(() => window.seen), ['Escape', 'k']);
    // The note goes after 4 s.
    await page.locator('.hs-back').waitFor({ state: 'detached', timeout: 6000 });
  });
});

test('Not an ad closes it, and a click on the overlay never reaches the player', async () => {
  await withStage('breaks=0:30&last=look', async (page) => {
    await open(page);
    await page.evaluate(() => {
      window.playerClicks = 0;
      document.getElementById('player').addEventListener('click', () => window.playerClicks++);
    });
    await page.locator('.m-row[data-show="trivia"]').click();
    await page.locator('[data-pane="trivia"]').waitFor();
    await page.locator('.hs-notad').click();
    await page.locator('.hs.is-closing').waitFor();
    assert.equal(await page.evaluate(() => window.halftimeStage.notAd), 1);
    assert.equal(await page.evaluate(() => window.playerClicks), 0);
    await page.locator('.hs-back').waitFor();
  });
});

test('the back note is an ink pill over the show, readable whatever the page theme', async () => {
  for (const colorScheme of ['light', 'dark']) {
    await withStage('back=1', async (page) => {
      await page.emulateMedia({ colorScheme });
      await page.locator('.hs-back.on').waitFor({ timeout: 5000 });
      const look = await page.locator('.hs-back').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
      // The ground is ink at 78% (#0b0b0b), the words paper text (#f2f2ee).
      assert.match(look.bg, /^(rgba\(11, 11, 11, 0\.78\)|color\(srgb 0\.0431\d* 0\.0431\d* 0\.0431\d* \/ 0\.78\))$/, look.bg);
      assert.equal(look.fg, 'rgb(242, 242, 238)');
    });
  }
});

test('a small window: the scoreboard shows the time left only, the tabs are a key row', async () => {
  await withStage('breaks=0:30', async (page) => {
    await open(page);
    assert.ok((await boxes(page)).host[2] < 560);
    assert.equal(await page.locator('.hs-d').first().isVisible(), false);
    // The tab names shrink to a key row; the names stay for screen readers.
    assert.equal(await page.locator('.hs-tabs .n').first().evaluate((el) => getComputedStyle(el).width), '1px');
    assert.equal(await page.locator('.hs-tabs [data-show="words"]').getAttribute('aria-selected'), 'false');
    assert.match(await page.locator('.hs-tabs [data-show="words"]').textContent(), /1\s*Five letters/);
    assert.equal(await page.locator('.hs-t').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }, { viewport: { width: 480, height: 800 } });
});

test('a small window still shows the countdown to the last show used', async () => {
  await withStage('breaks=0:30&last=trivia', async (page) => {
    await open(page);
    assert.equal(await page.locator('.m-row.is-default .m-c').isVisible(), true);
    assert.match(await page.locator('.m-row.is-default .m-c').innerText(), /^[1-3]$/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }, { viewport: { width: 480, height: 800 } });
});

test('reduced motion: a 150 ms fade, with no clip and no settle', async () => {
  await withStage('breaks=0:30', async (page) => {
    await open(page);
    const anim = await page.locator('.hs').evaluate((el) => ({
      name: getComputedStyle(el).animationName,
      dur: getComputedStyle(el).animationDuration,
      inner: getComputedStyle(el.querySelector('.hs-in')).animationName,
    }));
    assert.deepEqual(anim, { name: 'hs-fade-in', dur: '0.15s', inner: 'none' });
  }, { reducedMotion: 'reduce' });
});

test('motion on: the clip opens over 700 ms and the content settles over 900 ms', async () => {
  await withStage('breaks=0:30', async (page) => {
    await open(page);
    const anim = await page.locator('.hs').evaluate((el) => ({
      name: getComputedStyle(el).animationName,
      dur: getComputedStyle(el).animationDuration,
      inner: getComputedStyle(el.querySelector('.hs-in')).animationName,
      innerDur: getComputedStyle(el.querySelector('.hs-in')).animationDuration,
    }));
    assert.deepEqual(anim, { name: 'hs-clip-open, hs-fade-in', dur: '0.7s, 0.22s', inner: 'hs-settle', innerDur: '0.9s' });
  });
});

test('Quick trivia: three questions on the stage, answered by key, in words, with the credit and no network calls', async () => {
  await withStage('breaks=1:40&last=trivia', async (page, { requests, origin }) => {
    await open(page);
    await page.locator('.hs-trivia .hs-answer').first().waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.hs-answer').count(), 4);
    assert.match(await page.locator('.t-n').innerText(), /^Question 1 of 3$/);
    assert.match(await page.locator('.t-c').innerText(), /Open Trivia Database, CC BY-SA 4\.0/);
    await page.keyboard.press('a');
    assert.equal(await page.locator('.hs-answer[data-s="right"]').count(), 1);
    assert.match(await page.locator('.t-say.on').innerText(), /^(Right|Not this one)$/);
    await page.locator('.t-n', { hasText: 'Question 2 of 3' }).waitFor({ timeout: 5000 });
    // Nothing leaves the page: every request went to the extension's own origin.
    assert.deepEqual(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')), []);
  });
});
