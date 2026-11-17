// The Safari build: `npm run build:safari` makes a Manifest V3 bundle (as Chrome's) with the same permissions, ready
// for scripts/safari-app.sh to wrap into a Mac app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('npm run build:safari makes a Manifest V3 release with only tabs, storage and *.hulu.com', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-safari-'));
  execFileSync('npm', ['run', 'build:safari'], { env: { ...process.env, HALFTIME_RELEASE: '1', HALFTIME_OUT_DIR: out }, stdio: 'pipe' });
  const dir = path.join(out, 'safari-mv3');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Halftime Show');
  assert.deepEqual([...manifest.permissions].sort(), ['storage', 'tabs']);
  assert.deepEqual(manifest.host_permissions, ['*://*.hulu.com/*']);
  assert.deepEqual(manifest.content_scripts.flatMap((s) => s.matches), ['*://*.hulu.com/*']);
  assert.equal(manifest.background.service_worker, 'background.js');
  for (const file of ['background.js', 'content-scripts/hulu.js', 'popup.html', 'options.html']) {
    assert.ok(fs.existsSync(path.join(dir, file)), `${file} is in the build`);
  }
  assert.equal(fs.existsSync(path.join(dir, 'fixture')), false);
});

test('scripts/safari-app.sh refuses, plainly, anywhere but a Mac', () => {
  // A stand-in uname, so the check runs the same on any machine.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'halftime-uname-'));
  fs.writeFileSync(path.join(bin, 'uname'), '#!/bin/sh\necho Linux\n', { mode: 0o755 });
  const run = () => execFileSync('bash', ['scripts/safari-app.sh'], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdio: 'pipe' });
  assert.throws(run, (error) => error.status === 1 && /runs on a Mac only/.test(String(error.stderr)));
  assert.equal(fs.existsSync('safari'), false);
});
