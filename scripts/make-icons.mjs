// Makes the extension's icons (public/icon/<size>.png, which WXT puts in the manifest) from Hoop (assets/hoop.svg):
// Hoop in ink, filled with paper, so it reads on light and dark toolbars alike. Run it again if Hoop changes:
//   node scripts/make-icons.mjs
/* global process */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SIZES = [16, 32, 48, 96, 128];
// --ink and --paper in src/styles/tokens.css.
const INK = '#0b0b0b';
const PAPER = '#f7f7f4';

// Hoop's ring filled with paper: an ink ring on a light toolbar, a paper face on a dark one. The small sizes get a
// heavier ring so it stays a full pixel; the store sizes keep 1/8 clear round the art (96 of 128, as the stores ask).
const hoop = fs.readFileSync('assets/hoop.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const RING = 'fill="none" stroke="currentColor" stroke-width="1.8"';
const iconFor = (size) => {
  const stroke = size <= 16 ? 3.4 : size <= 32 ? 2.8 : 2.2;
  const pad = size >= 96 ? 4 : 0;
  const inner = hoop
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(RING, `fill="${PAPER}" stroke="currentColor" stroke-width="${stroke}"`);
  const half = 15 + stroke / 2 + pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half + 0.2} ${half * 2} ${half * 2}" style="color:${INK}">${inner}</svg>`;
};

const browser = await chromium.launch();
const page = await browser.newPage();
fs.mkdirSync('public/icon', { recursive: true });
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${iconFor(size)}`);
  await page.locator('svg').screenshot({ path: path.join('public/icon', `${size}.png`), omitBackground: true });
}
await browser.close();
process.stdout.write(`Made ${SIZES.map((s) => `${s}.png`).join(', ')} in public/icon/\n`);
