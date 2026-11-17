// Bundles a bit of the extension's own source to run straight in a page, so e2e tests can drive the detector
// on the stand-in player before the content script wires it up (#5). esbuild comes with Vite.
import path from 'node:path';
import { build } from 'esbuild';

export async function bundleForPage(code) {
  const out = await build({
    stdin: { contents: code, resolveDir: path.resolve('.'), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

// Starts the Hulu detector in the page and keeps its events, with the page's clock, in window.__detected.
export const DETECTOR_IN_PAGE = `
  import { detectHulu } from './src/detect/index';
  window.__detected = [];
  window.__detector = detectHulu(document, (event) => window.__detected.push(event));
`;

// Puts the capture tool on window.__capture().
export const CAPTURE_IN_PAGE = `
  import { captureSnapshot } from './src/detect/capture';
  import { hulu } from './src/sites/hulu';
  window.__capture = () => captureSnapshot(document, hulu, new Date('2026-11-17T00:00:00Z'));
`;
