// Something to look at, inside the overlay on the stand-in player (dev stage page): it draws, finishes with the
// break, and with reduced motion arrives in batches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('.output/chrome-mv3');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webm': 'video/webm', '.woff2': 'font/woff2' };
const serve = () =>
  new Promise((resolve) => {
    const s = http.createServer((q, r) => {
      const f = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return void r.writeHead(404).end();
      r.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => resolve({ origin: `http://localhost:${s.address().port}`, close: () => new Promise((d) => s.close(d)) }));
  });

const inked = (page) =>
  page.evaluate(() => {
    const cv = document.getElementById('halftime-show-overlay').shadowRoot.querySelector('.look-cv');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  });

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`builds over a 12 s break and is complete at the end (${reducedMotion})`, async () => {
    const server = await serve();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, reducedMotion });
      const errors = [];
      const requests = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(`${server.origin}/overlay-stage.html?breaks=0:12&last=look`);
      await page.locator('.hs.is-open').waitFor({ timeout: 10000 });
      await page.keyboard.press('4');
      await page.waitForTimeout(3000);
      const early = await inked(page);
      await page.waitForTimeout(8500);
      const late = await inked(page);
      assert.ok(late > early, `more ink later (${early} then ${late})`);
      assert.ok(late > 2000);
      assert.deepEqual(errors, []);
      assert.ok(requests.every((u) => u.startsWith(server.origin)), 'no network calls');
    } finally {
      await browser.close();
      await server.close();
    }
  });
}
