import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function build(env, outDir) {
  execFileSync('npx', ['wxt', 'build'], { env: { ...process.env, ...env, HALFTIME_OUT_DIR: outDir }, stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(path.join(outDir, 'chrome-mv3', 'manifest.json'), 'utf8'));
}

test('a release build matches *.hulu.com only and ships no fixture', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-release-'));
  const manifest = build({ HALFTIME_RELEASE: '1' }, out);
  assert.deepEqual(manifest.content_scripts.flatMap((s) => s.matches), ['*://*.hulu.com/*']);
  assert.deepEqual(manifest.host_permissions, ['*://*.hulu.com/*']);
  assert.deepEqual([...manifest.permissions].sort(), ['storage', 'tabs']);
  assert.equal(fs.existsSync(path.join(out, 'chrome-mv3', 'fixture')), false);
});

test('a default build also matches the local fixture, and nothing else is added', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-dev-'));
  const manifest = build({ HALFTIME_RELEASE: '' }, out);
  assert.deepEqual(manifest.content_scripts.flatMap((s) => s.matches), ['*://*.hulu.com/*', '*://localhost/fixture/*']);
  assert.deepEqual(manifest.host_permissions, ['*://*.hulu.com/*']);
  assert.ok(fs.existsSync(path.join(out, 'chrome-mv3', 'fixture', 'player.html')));
});
