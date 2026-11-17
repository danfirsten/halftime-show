// Hoop's catch on the stand-in player, through the overlay stage page: it draws and plays inside the overlay, takes
// the arrow keys, fills its slot at a small window and in full screen, plays with reduced motion, and stops with the break.
/* global getComputedStyle */
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

async function withCatch(query, fn, { viewport = { width: 1440, height: 900 }, reducedMotion = 'no-preference' } = {}) {
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
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    await page.keyboard.press('3');
    await page.locator('.hs-catch .c-cv').waitFor();
    await fn(page, { requests, origin: server.origin });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
}

// How many pixels of the canvas are drawn (ink on nothing), a cheap way to see that it is alive.
const ink = (page) =>
  page.locator('.c-cv').evaluate((cv) => {
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
    return n;
  });
const snapshot = (page) => page.locator('.c-cv').evaluate((cv) => cv.toDataURL());

test('plays in the overlay: draws, fills its slot, keeps to ink and paper, and makes no requests', async () => {
  await withCatch('breaks=0:60', async (page, { requests, origin }) => {
    await page.waitForTimeout(1200); // the cover settles in over 900 ms
    const box = await page.locator('.c-cv').boundingBox();
    const stage = await page.locator('.hs-stage').boundingBox();
    assert.ok(box.width > stage.width * 0.95 && box.height > stage.height * 0.9, `fills the stage: ${JSON.stringify([box, stage])}`);
    await page.waitForTimeout(300);
    assert.ok((await ink(page)) > 200, 'Hoop and the dots are drawn');
    const look = await page.locator('.c-score').evaluate((el) => ({ font: getComputedStyle(el).fontFamily, nums: getComputedStyle(el).fontVariantNumeric, color: getComputedStyle(el).color }));
    assert.match(look.font, /Geist Mono/);
    assert.match(look.nums, /tabular/);
    assert.equal(look.color, 'rgb(242, 242, 238)');
    assert.equal(await page.locator('.c-miss i').count(), 3);
    assert.ok(requests.every((u) => u.startsWith(origin)), `no outside requests: ${requests}`);
    // The size holds still: no layout change while it plays.
    await page.waitForTimeout(500);
    assert.deepEqual(await page.locator('.c-cv').boundingBox(), box);
  });
});

test('the arrow keys move Hoop, and the page never sees them', async () => {
  await withCatch('breaks=0:60', async (page) => {
    await page.evaluate(() => {
      window.seen = [];
      document.addEventListener('keydown', (e) => window.seen.push(e.key));
    });
    const hoopCol = (page) =>
      page.locator('.c-cv').evaluate((cv) => {
        // The column of ink in the bottom band, where Hoop sits: its mean x across the stage.
        const w = cv.width;
        const h = cv.height;
        const data = cv.getContext('2d').getImageData(0, Math.round(h * 0.7), w, Math.round(h * 0.2)).data;
        let sum = 0;
        let n = 0;
        for (let y = 0; y < Math.round(h * 0.2); y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 120) { sum += x; n++; }
        return n ? sum / n / w : 0.5;
      });
    await page.waitForTimeout(400);
    const start = await hoopCol(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    const right = await hoopCol(page);
    assert.ok(right > start + 0.15, `Hoop moved right: ${start} to ${right}`);
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);
    assert.ok((await hoopCol(page)) < right - 0.3, 'and back left');
    assert.deepEqual(await page.evaluate(() => window.seen), [], 'the player is not sent the keys');
  });
});

test('the pointer moves Hoop too', async () => {
  await withCatch('breaks=0:60', async (page) => {
    const box = await page.locator('.c-cv').boundingBox();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.waitForTimeout(800);
    const left = await snapshot(page);
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.waitForTimeout(800);
    assert.notEqual(await snapshot(page), left);
  });
});

test('small window and full screen: the game fits its slot', async () => {
  await withCatch('breaks=0:60', async (page) => {
    const stage = await page.locator('.hs-stage').boundingBox();
    const box = await page.locator('.c-cv').boundingBox();
    assert.ok(box.width <= stage.width + 1 && box.height <= stage.height + 1);
    assert.ok(box.height > 120, `still room to play: ${box.height}`);
    assert.equal(await page.locator('.c-help').isVisible(), false, 'the help line makes room at a small size');
  }, { viewport: { width: 480, height: 720 } });
  await withCatch('breaks=1:30', async (page) => {
    await page.locator('#btn-full').click({ force: true }).catch(() => {});
    await page.evaluate(() => document.getElementById('player').requestFullscreen());
    await page.waitForFunction(() => document.fullscreenElement?.id === 'player');
    await page.waitForTimeout(400);
    const box = await page.locator('.c-cv').boundingBox();
    assert.ok(box.width > 1200 && box.height > 500, `fills the screen: ${JSON.stringify(box)}`);
    assert.ok((await ink(page)) > 200);
  });
});

test('with reduced motion it still plays, and Hoop does not blink', async () => {
  await withCatch('breaks=0:60', async (page) => {
    const a = await snapshot(page);
    await page.waitForTimeout(1200);
    assert.notEqual(await snapshot(page), a, 'dots still fall');
  }, { reducedMotion: 'reduce' });
});

test('it stops when the break ends: no frames are asked for once the cover is gone', async () => {
  await withCatch('breaks=0:3', async (page) => {
    await page.evaluate(() => {
      window.rafCalls = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => (window.rafCalls++, raf(cb));
    });
    await page.locator('.hs-back.on').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.hs-catch').count(), 0, 'the game is gone with the cover');
    await page.evaluate(() => (window.rafCalls = 0));
    await page.waitForTimeout(1000);
    assert.ok((await page.evaluate(() => window.rafCalls)) < 5, 'at 60 fps a running game would ask for about 60');
  });
});
