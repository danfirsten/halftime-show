// Five letters inside the overlay on the stand-in player: it plays, shows the marks without colour, drops the
// keyboard in a small window, and goes full size in full screen. Screenshots are written when FIVE_SHOTS is a folder.
import { test } from 'node:test';
/* global getComputedStyle */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('.output/chrome-mv3');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.woff2': 'font/woff2' };
const shots = process.env.FIVE_SHOTS;

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://localhost:${server.address().port}`, close: () => new Promise((d) => server.close(d)) })));
}

async function withStage(fn, { viewport = { width: 1440, height: 900 }, reducedMotion = 'no-preference' } = {}) {
  assert.ok(fs.existsSync(path.join(root, 'overlay-stage.html')), 'run npm run build first');
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, reducedMotion });
    const errors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(`${server.origin}/overlay-stage.html?breaks=0:90`);
    await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
    await page.keyboard.press('1');
    await page.locator('.w-row.is-cur').waitFor();
    await fn(page, { errors, requests, origin: server.origin });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
}

const shoot = (page, name) => (shots ? page.screenshot({ path: path.join(shots, `${name}.png`) }) : null);
const guess = async (page, w) => {
  for (const c of w) await page.keyboard.press(c);
  await page.keyboard.press('Enter');
};

test('plays a guess by keyboard, marked with fill and outline and never colour, then says it in words', async () => {
  await withStage(async (page, { requests, origin }) => {
    await guess(page, 'crane');
    await page.locator('.w-row:first-child .w-tile[data-s]').first().waitFor();
    await page.waitForTimeout(500);
    const tiles = await page.locator('.w-row:first-child .w-tile').evaluateAll((els) => els.map((el) => el.dataset.s));
    assert.equal(tiles.length, 5);
    assert.ok(tiles.every((s) => ['hit', 'near', 'no'].includes(s)));
    // Every colour on a tile is a grey of the ink and paper system: its channels sit within a few steps of each other.
    const spreads = await page.locator('.w-tile[data-s]').evaluateAll((els) =>
      els.flatMap((el) => {
        const s = getComputedStyle(el);
        return [s.backgroundColor, s.color, s.borderTopColor].map((c) => {
          const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          return Math.max(...n) - Math.min(...n);
        });
      }),
    );
    assert.ok(spreads.every((d) => d <= 6), `no colour: ${spreads}`);
    assert.match(await page.locator('.w-sr').innerText(), /^Guess 1, crane\. C /);
    assert.match((await page.locator('.w-row:first-child').getAttribute('aria-label')) ?? '', /^Guess 1, crane\./);
    // A word that is not in the list is outlined and nothing is spent.
    await guess(page, 'zzzzz');
    assert.equal(await page.locator('.w-msg').innerText(), 'Not in the word list.');
    assert.equal(await page.locator('.w-row.is-bad').count(), 1);
    assert.ok(requests.every((u) => u.startsWith(origin)), 'no requests beyond the stand-in');
    await shoot(page, 'five-1440');
  });
});

test('at 1440 there is a keyboard that works; in a small window it goes and the board keeps the last guess and the open row', async () => {
  await withStage(async (page) => {
    assert.ok(await page.locator('.w-kb').isVisible());
    await page.locator('.w-kb [data-k="a"]').click();
    assert.equal((await page.locator('.w-row.is-cur').innerText()).replace(/\s/g, ''), 'A');
    await shoot(page, 'five-medium');
  }, { viewport: { width: 1000, height: 640 } });
  await withStage(async (page) => {
    await guess(page, 'crane');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.w-kb').isVisible(), false);
    assert.equal(await page.locator('.w-row:visible').count(), 2, 'the last guess and the row being typed');
    const tile = await page.locator('.w-tile').first().boundingBox();
    assert.ok(tile.width >= 28, `tiles stay legible: ${tile.width}`);
    await shoot(page, 'five-small');
  }, { viewport: { width: 480, height: 320 } });
});

test('in full screen the board is bigger and the show still takes keys', async () => {
  await withStage(async (page) => {
    await page.locator('#btn-full').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'player');
    await page.waitForTimeout(300);
    await guess(page, 'crane');
    await page.waitForTimeout(500);
    const tile = await page.locator('.w-tile').first().boundingBox();
    assert.ok(tile.width > 60, `tile ${tile.width}`);
    await shoot(page, 'five-full');
  });
});

test('with reduced motion the marks arrive together', async () => {
  await withStage(async (page) => {
    const delays = await page.locator('.w-tile').first().evaluate((el) => getComputedStyle(el).transitionDelay);
    await guess(page, 'crane');
    const after = await page.locator('.w-row:first-child .w-tile').evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDelay));
    assert.ok(after.every((d) => d === '0s'), `delays ${after} (before ${delays})`);
  }, { reducedMotion: 'reduce' });
});
