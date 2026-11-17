import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

declare const process: { env: Record<string, string | undefined> }; // no @types/node here

// Release builds (HALFTIME_RELEASE=1) match *.hulu.com only. Every other build also ships the stand-in
// player (fixture/) and lets the content script run on it, so it can be tested without a Hulu account, plus the
// overlay stage page that puts the overlay on that player.
const release = process.env.HALFTIME_RELEASE === '1';
const fixtureMatch = '*://localhost/fixture/*';

export default defineConfig({
  srcDir: '.',
  outDir: process.env.HALFTIME_OUT_DIR ?? '.output',
  manifest: {
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
  },
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
      if (release) return;
      for (const name of ['player.html', 'player.js', 'content.webm', 'ad.webm']) {
        files.push({ absoluteSrc: decodeURIComponent(new URL(`./fixture/${name}`, import.meta.url).pathname), relativeDest: `fixture/${name}` });
      }
    },
  },
  vite: () => ({ plugins: [preact()] }),
});
