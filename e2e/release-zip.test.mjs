// The store packages: `npm run zip` builds as a release by itself (no stand-in player, no localhost match), in
// Manifest V3 for Chrome and Firefox, with the licences of everything bundled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Stand-ins for what scripts/safari-app.sh and QA leave in the working tree: git-ignored, never in the source zip.
for (const [dir, file] of [['safari', 'build/Halftime Show.app.txt'], ['qa-report', 'report.md']]) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), 'local only');
}
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-zip-'));
// HALFTIME_RELEASE is left unset: the zip script must set it itself.
execFileSync('npm', ['run', 'zip'], { env: { ...process.env, HALFTIME_RELEASE: '', HALFTIME_OUT_DIR: out }, stdio: 'pipe' });
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const files = (zip) => execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
const manifestOf = (zip) => JSON.parse(execFileSync('unzip', ['-p', zip, 'manifest.json'], { encoding: 'utf8' }));
const LICENCES = ['LICENSE.txt', 'SCOWL-COPYRIGHT.txt', 'QUESTIONS-LICENSE.md', 'fonts-licence.md', 'Geist-OFL.txt', 'GeistMono-OFL.txt'];

for (const browser of ['chrome', 'firefox']) {
  test(`the ${browser} package is a Manifest V3 release: *.hulu.com only, tabs and storage, no fixture, licences in`, () => {
    const zip = path.join(out, `halftime-show-${version}-${browser}.zip`);
    assert.ok(fs.existsSync(zip), `${zip} was made`);
    const manifest = manifestOf(zip);
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.content_scripts.flatMap((s) => s.matches), ['*://*.hulu.com/*']);
    assert.deepEqual(manifest.host_permissions, ['*://*.hulu.com/*']);
    assert.deepEqual([...manifest.permissions].sort(), ['storage', 'tabs']);
    assert.equal(manifest.content_security_policy, undefined, 'the default extension CSP stands: no remote code');
    const list = files(zip);
    assert.deepEqual(list.filter((f) => /fixture|overlay-stage|\.webm$|\.map$/.test(f)), []);
    for (const name of LICENCES) assert.ok(list.includes(`licences/${name}`), `licences/${name} ships`);
    // The stores need a 128 px icon; the toolbar uses the small ones.
    assert.equal(manifest.icons['128'], 'icon/128.png');
    for (const size of [16, 32, 48, 128]) assert.ok(list.includes(`icon/${size}.png`), `icon/${size}.png ships`);
  });
}

test('the Firefox package has its add-on ID and says it collects no data', () => {
  const manifest = manifestOf(path.join(out, `halftime-show-${version}-firefox.zip`));
  assert.equal(manifest.browser_specific_settings.gecko.id, 'halftime-show@danfirsten.github.io');
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
});

test('the Chrome package carries no Firefox-only keys', () => {
  assert.equal(manifestOf(path.join(out, `halftime-show-${version}-chrome.zip`)).browser_specific_settings, undefined);
});

test('the source zip for Firefox Add-ons holds the source, and nothing local', () => {
  const list = files(path.join(out, `halftime-show-${version}-sources.zip`));
  for (const name of ['package.json', 'package-lock.json', 'wxt.config.ts', 'entrypoints/background.ts', 'src/sites/hulu.ts']) assert.ok(list.includes(name), `${name} is in it`);
  assert.deepEqual(list.filter((f) => /^(safari|qa-report|\.output|node_modules)\/|\.zip$|(^|\/)\./.test(f)), []);
});
