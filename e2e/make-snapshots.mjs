// Records the stand-in player's snapshots in src/sites/__snapshots__/ with the capture tool itself.
// Run after `npm run build`: node e2e/make-snapshots.mjs
import fs from 'node:fs';
import { launchWithExtension, serveFixture, openFixture } from './helpers.mjs';
import { bundleForPage, CAPTURE_IN_PAGE } from './page-bundle.mjs';

const dir = 'src/sites/__snapshots__';
const states = [
  // name, fixture params, wait until
  ['fixture-show', { breaks: '30:10' }, () => window.fixtureState.elapsed > 1 && !window.fixtureState.inBreak],
  ['fixture-ad', { breaks: '1:20' }, () => window.fixtureState.inBreak && window.fixtureState.elapsed > 2],
  ['fixture-ad-unknown-length', { breaks: '1:20', unknownLength: true }, () => window.fixtureState.inBreak && window.fixtureState.elapsed > 2],
  // Between: inside a break while the markers blink off.
  ['fixture-between', { breaks: '1:20', flicker: true }, () => window.fixtureState.inBreak && !window.fixtureState.markersVisible],
  // The fake flash outside a break: ad markers up, the video still the show.
  ['fixture-flash', { flicker: true }, () => !window.fixtureState.inBreak && window.fixtureState.markersVisible],
];

const capture = await bundleForPage(CAPTURE_IN_PAGE);
const server = await serveFixture();
const ext = await launchWithExtension();
try {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, params, until] of states) {
    const page = await openFixture(ext.context, server.origin, params);
    await page.addScriptTag({ content: capture });
    await page.waitForFunction(until, null, { timeout: 15000, polling: 20 });
    const html = await page.evaluate(() => window.__capture());
    fs.writeFileSync(`${dir}/${name}.html`, html);
    console.log(`wrote ${dir}/${name}.html`);
    await page.close();
  }
} finally {
  await ext.close();
  await server.close();
}
