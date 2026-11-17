import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

declare const process: { env: Record<string, string | undefined> }; // no @types/node here

// Release builds (HALFTIME_RELEASE=1) match *.hulu.com only. Every other build also ships the stand-in
// player (fixture/) and lets the content script run on it, so it can be tested without a Hulu account, plus the
// overlay stage page that puts the overlay on that player.
const release = process.env.HALFTIME_RELEASE === '1';
const fixtureMatch = '*://localhost/fixture/*';

const fromRoot = (file: string) => decodeURIComponent(new URL(`./${file}`, import.meta.url).pathname);
const LICENCES: [string, string][] = [
  ['LICENSE', 'LICENSE.txt'],
  ['src/shows/five-letters/SCOWL-COPYRIGHT.txt', 'SCOWL-COPYRIGHT.txt'],
  ['src/shows/trivia/QUESTIONS-LICENSE.md', 'QUESTIONS-LICENSE.md'],
  ['assets/fonts-licence.md', 'fonts-licence.md'],
  ['node_modules/@fontsource-variable/geist/LICENSE', 'Geist-OFL.txt'],
  ['node_modules/@fontsource-variable/geist-mono/LICENSE', 'GeistMono-OFL.txt'],
];

// Firefox needs an add-on ID for Manifest V3, and new add-ons must say what data they collect: none.
// The ID is what addons.mozilla.org knows the add-on by, so it never changes once published.
const gecko = {
  id: 'halftime-show@danfirsten.github.io',
  // data_collection_permissions needs 140 (an ESR), past storage.session (115) and MV3 host access at install (127).
  strict_min_version: '140.0',
  data_collection_permissions: { required: ['none'] },
};

export default defineConfig({
  srcDir: '.',
  outDir: process.env.HALFTIME_OUT_DIR ?? '.output',
  // Manifest V3 everywhere (docs/product-brief.md), Firefox and Safari included: WXT would build both as V2.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko } } : {}),
    name: 'Halftime Show',
    description: 'Mutes the ad break and puts something better on top.',
    permissions: ['tabs', 'storage'],
    host_permissions: ['*://*.hulu.com/*'],
    commands: {
      // OVERRIDE_COMMAND in src/lib/messages.ts.
      'toggle-ad': {
        suggested_key: { default: 'Alt+Shift+A' },
        description: "This is an ad, or this isn't",
      },
    },
  }),
  hooks: {
    // The overlay stage (entrypoints/overlay-stage/) runs the overlay on the stand-in player: dev and test builds only.
    'entrypoints:resolved': (_wxt, entrypoints) => {
      if (!release) return;
      for (const entry of entrypoints) if (entry.name === 'overlay-stage') entry.skipped = true;
    },
    'build:manifestGenerated': (_wxt, manifest) => {
      if (release) return;
      for (const script of manifest.content_scripts ?? []) {
        if (script.matches?.includes('*://*.hulu.com/*')) script.matches.push(fixtureMatch);
      }
    },
    'build:publicAssets': (_wxt, files) => {
      // Every build carries the licences of what it bundles: SCOWL's notice must stay with the word list, the
      // question bank is CC BY-SA, and the fonts are under the SIL Open Font Licence.
      for (const [from, to] of LICENCES) files.push({ absoluteSrc: fromRoot(from), relativeDest: `licences/${to}` });
      if (release) return;
      for (const name of ['player.html', 'player.js', 'content.webm', 'ad.webm']) {
        files.push({ absoluteSrc: fromRoot(`fixture/${name}`), relativeDest: `fixture/${name}` });
      }
    },
  },
  // The source zip Firefox Add-ons asks for: tracked source only, never the Mac app safari-app.sh leaves behind,
  // QA screenshots or old zips (WXT would take every file that isn't a dotfile, git-ignored or not).
  zip: { excludeSources: ['safari/**', 'qa-report/**', '**/*.zip', '.output/**'] },
  vite: () => ({ plugins: [preact()] }),
});
