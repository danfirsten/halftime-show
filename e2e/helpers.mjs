// Shared by the e2e tests: launch Chromium with the built extension, open the stand-in player with a timeline,
// and read what the extension did to the tab.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import http from 'node:http';
/* global chrome */
import { chromium } from 'playwright';

export const extensionDir = path.resolve('.output/chrome-mv3');
// The overlay's host element. The overlay itself is built in its own issue; it should use this id.
export const OVERLAY_SELECTOR = '#halftime-show-overlay';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.webm': 'video/webm' };

// Serves the built fixture/ folder on localhost, the origin the dev content script matches.
export function serveFixture() {
  const root = path.join(extensionDir, 'fixture');
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://localhost').pathname) || 'player.html';
    const file = path.join(root, name);
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://localhost:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

export async function launchWithExtension() {
  if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) throw new Error('run npm run build first');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-'));
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  return { context, worker, close: () => context.close() };
}

// params: { breaks: '1:2,10:5', unknownLength: true, flicker: true, fullscreen: true }
export function fixtureUrl(origin, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === true) query.set(key, '1');
    else if (value !== false && value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return `${origin}/fixture/player.html${text ? `?${text}` : ''}`;
}

export async function openFixture(context, origin, params) {
  const page = await context.newPage();
  await page.goto(fixtureUrl(origin, params));
  return page;
}

// What the extension has done to the tab, plus what the page says is happening.
export async function readState(worker, page) {
  const url = page.url();
  const muted = await worker.evaluate(async (pageUrl) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === pageUrl);
    return tab ? tab.mutedInfo?.muted === true : null;
  }, url);
  const overlay = (await page.locator(OVERLAY_SELECTOR).count()) > 0;
  const fixture = await page.evaluate(() => window.fixtureState);
  const watched = await page.evaluate(() => document.documentElement.dataset.halftimeShow === 'ready');
  return { muted, overlay, fixture, watched };
}
